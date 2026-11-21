/* בדיקת קישורים יומית למאגר הרפרנסים.
 *
 * מאיה 01/11/2026: "יש סרטונים ברפרנסים שפתאום מפסיקים להיות זמינים... אשמח
 * שפעם ביום תריצי סוכן גם כשהמחשב שלי ישן ותתקני את זה ואם לא עובד תסירי".
 *
 * רצה בענן. ה"תיקון": קישור מקוצר נפתח לכתובת המלאה ומזהה הטיקטוק נשמר, כך
 * שהנגן עובד גם כשהקישור המקוצר מפסיק. מה שמת באמת מועבר אחרי 3 ימים רצופים
 * ל-inspirationBankRemoved, כולל כל השדות, כך שאפשר להחזיר. סיכום של כל ריצה
 * נשמר ב-inspirationLinkLog.
 */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { FAILS_TO_REMOVE, MAX_REMOVALS_PER_RUN, MAX_EMBED_BLOCKED_SHARE, tiktokVerdict, pageVerdict, instagramEmbedVerdict, runIsTrustworthy, nextFailCount } = require('./inspiration-link-rules');

const ADMIN_EMAIL = 'mayakislev@gmail.com';
const PREVIEW_UA = 'facebookexternalhit/1.1';
const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IG_CODE = /instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/;
const FETCH_TIMEOUT_MS = 20000;
const TIME_BUDGET_MS = 25 * 60 * 1000;
const GAP_MS = { tiktok: 800, instagram: 1500 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, ua) {
  const res = await fetch(url, { headers: { 'User-Agent': ua }, redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  return { status: res.status, finalUrl: res.url, text: await res.text() };
}

async function checkTiktok(video) {
  const r = await get(video.url, PREVIEW_UA);
  let verdict = tiktokVerdict(r.status, r.text);
  /* תשובה כללית יכולה להיות גם הגבלת קצב רגעית, אז נותנים הזדמנות שנייה */
  if (verdict === 'dead') {
    await sleep(3000);
    const again = await get(video.url, PREVIEW_UA);
    verdict = tiktokVerdict(again.status, again.text);
  }
  const m = r.finalUrl.match(/\/video\/(\d+)/);
  return { verdict, videoId: m ? m[1] : null };
}

async function checkInstagram(video) {
  const r = await get(video.url, PREVIEW_UA);
  const verdict = pageVerdict(r.status, r.text);
  /* 21/11/2026: גם אם הפוסט חי, בודקים שהנגן שבתוך האפליקציה באמת מנגן אותו */
  let embed = null;
  const code = String(video.url || '').match(IG_CODE);
  if (verdict === 'alive' && code) {
    try {
      const e = await get(`https://www.instagram.com/p/${code[1]}/embed/`, PHONE_UA);
      embed = instagramEmbedVerdict(e.status, e.text);
    } catch (err) { embed = null; }
  }
  return { verdict, embed };
}

async function checkPlatform(platform, docs, deadline) {
  const results = [];
  for (const doc of docs) {
    if (Date.now() > deadline) break;
    const video = doc.data();
    let res;
    try {
      res = await (platform === 'tiktok' ? checkTiktok(video) : checkInstagram(video));
    } catch (err) {
      res = { verdict: 'unknown' };
    }
    results.push({ doc, ...res });
    await sleep(GAP_MS[platform]);
  }
  return results;
}

/** dry: בודק ומחזיר דוח בלי לכתוב כלום. */
async function runLinkCheck({ dry = false, limit = 0 } = {}) {
  const db = getFirestore();
  const col = db.collection('inspirationBank');
  const snap = await col.get();
  /* מי שלא נבדק הכי הרבה זמן ראשון, כך שריצה שנקטעה ממשיכה מחר מאיפה שעצרה */
  const byAge = (a, b) => (a.data().linkCheckedAt || 0) - (b.data().linkCheckedAt || 0);
  const platformOf = (d) => (/tiktok\.com/.test(d.data().url || '') ? 'tiktok' : 'instagram');
  const deadline = Date.now() + (dry ? 8 * 60 * 1000 : TIME_BUDGET_MS);
  const pick = (p) => {
    const docs = snap.docs.filter((d) => d.data().url && platformOf(d) === p).sort(byAge);
    return limit ? docs.slice(0, limit) : docs;
  };
  const [tiktok, instagram] = await Promise.all([checkPlatform('tiktok', pick('tiktok'), deadline), checkPlatform('instagram', pick('instagram'), deadline)]);

  const summary = { date: new Date().toISOString().slice(0, 10), total: snap.size, dry, platforms: {}, removed: [], fixed: 0 };
  const now = Date.now();
  let removals = 0;
  for (const [platform, results] of [['tiktok', tiktok], ['instagram', instagram]]) {
    const dead = results.filter((r) => r.verdict === 'dead');
    const trust = runIsTrustworthy(dead.length, results.length);
    summary.platforms[platform] = { checked: results.length, alive: results.filter((r) => r.verdict === 'alive').length, dead: dead.length, unknown: results.filter((r) => r.verdict === 'unknown').length, trusted: trust };
    if (dry) {
      summary.platforms[platform].deadUrls = dead.slice(0, 40).map((r) => r.doc.data().url);
      summary.platforms[platform].embedBlocked = results.filter((r) => r.embed).length;
      continue;
    }
    /* הטמעה: כותבים רק כשהריצה סבירה, ואף פעם לא על סמך "לא יודעים" */
    const embedKnown = results.filter((r) => r.embed !== undefined && r.embed !== null);
    const embedBlocked = embedKnown.filter((r) => r.embed);
    const embedTrust = embedKnown.length > 0 && embedBlocked.length / embedKnown.length <= MAX_EMBED_BLOCKED_SHARE;
    if (platform === 'instagram') summary.platforms[platform].embedBlocked = embedBlocked.length;
    let batch = db.batch(); let n = 0;
    for (const r of results) {
      const v = r.doc.data();
      const verdict = trust ? r.verdict : 'unknown';
      const fails = nextFailCount(v.linkFailCount, verdict);
      if (fails >= FAILS_TO_REMOVE && removals < MAX_REMOVALS_PER_RUN) {
        removals += 1;
        batch.set(db.collection('inspirationBankRemoved').doc(r.doc.id), { ...v, removedAt: FieldValue.serverTimestamp(), removedReason: 'link-dead' });
        batch.delete(r.doc.ref);
        summary.removed.push({ id: r.doc.id, url: v.url, domain: v.domain, subCategory: v.subCategory || '' });
        n += 2;
      } else {
        const u = { linkCheckedAt: now, linkFailCount: fails };
        if (r.videoId && !v.tiktokVideoId) { u.tiktokVideoId = r.videoId; summary.fixed += 1; }
        if (embedTrust && r.embed !== undefined && r.embed !== null) {
          if (r.embed) u.embedBlocked = r.embed;
          else if (v.embedBlocked) u.embedBlocked = FieldValue.delete();
        }
        batch.update(r.doc.ref, u);
        n += 1;
      }
      if (n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
    }
    if (n) await batch.commit();
  }
  if (!dry) await db.collection('inspirationLinkLog').doc(summary.date).set(summary);
  console.log('inspiration link check', JSON.stringify(summary));
  return summary;
}

exports.dailyInspirationLinkCheck = onSchedule(
  { schedule: '0 4 * * *', timeZone: 'Asia/Jerusalem', region: 'us-central1', timeoutSeconds: 1800, memory: '512MiB', retryCount: 0 },
  async () => { await runLinkCheck(); },
);

/* בדיקה ידנית לפני שסומכים על התזמון: dry לא כותב כלום */
exports.checkInspirationLinksNow = onCall(
  { region: 'us-central1', timeoutSeconds: 540, memory: '512MiB', invoker: 'public' },
  async (request) => {
    if (!request.auth || request.auth.token.email !== ADMIN_EMAIL) {
      throw new HttpsError('permission-denied', 'רק מאיה יכולה להריץ את זה');
    }
    return runLinkCheck({ dry: request.data && request.data.dry !== false, limit: Number((request.data && request.data.limit) || 0) });
  },
);
