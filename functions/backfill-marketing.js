/* העברה חד פעמית של תסריטים שכבר נוצרו, אל לשונית השיווק בפורטל.
 *
 * 09/10/2026: מפעל התוכן כבר ייצר תסריטים לפני שהלשונית נבנתה, והם
 * יושבים כאן באוסף nightlyScripts. אין טעם להריץ את המפעל מחדש בשביל
 * זה: זה שורף רפרנסים חדשים, עולה כסף, ושולח וואטסאפ באמצע הלילה.
 * הפונקציה הזאת רק דוחפת את מה שקיים, ולא מייצרת כלום ולא מודיעה כלום.
 *
 * הפורטל מזהה כפילות לפי refId, ולכן הרצה כפולה לא יוצרת כרטיסים כפולים.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore } = require('firebase-admin/firestore');

const portalSecret = defineSecret('EXTERNAL_SALE_SECRET');
const PORTAL_SCRIPT_URL = 'https://us-central1-maya-client-portal.cloudfunctions.net/recordMarketingScript';

exports.backfillMarketingScripts = onRequest(
  { region: 'us-central1', timeoutSeconds: 300, secrets: [portalSecret] },
  async (req, res) => {
    if (req.query.key !== 'maya') return res.status(403).json({ ok: false });
    const db = getFirestore();

    /* 10/10/2026: המפעל פסל תשעה רפרנסים ברצף, כמעט כולם בנימוק שהמנגנון
       דורש סיפור חיים אינטימי. לפני שאני משנה את כלל הבחירה אני רוצה
       לראות מה בכלל יש במאגר, במקום לנחש. */
    if (req.query.stats === '1') {
      const [bankAll, rejects, scriptsAll] = await Promise.all([
        db.collection('inspirationBank').get(),
        db.collection('nightlyRejects').get(),
        db.collection('nightlyScripts').get(),
      ]);
      const byDomain = {};
      const buckets = { 'עד 500': 0, '500 עד 1500': 0, '1500 עד 4000': 0, 'מעל 4000': 0 };
      bankAll.forEach((d) => {
        const v = d.data();
        const n = (v.translationHe || v.transcriptHe || '').trim().length;
        const dom = v.domain || 'בלי תחום';
        byDomain[dom] = byDomain[dom] || { total: 0, withText: 0 };
        byDomain[dom].total += 1;
        if (n >= 500) byDomain[dom].withText += 1;
        if (n < 500) buckets['עד 500'] += 1;
        else if (n < 1500) buckets['500 עד 1500'] += 1;
        else if (n < 4000) buckets['1500 עד 4000'] += 1;
        else buckets['מעל 4000'] += 1;
      });
      const rej = [];
      rejects.forEach((d) => rej.push({
        id: d.id, why: d.data().why, v: d.data().promptVersion, raw: (d.data().raw || '').slice(0, 600),
      }));
      return res.json({ ok: true, bank: bankAll.size, scripts: scriptsAll.size, buckets, byDomain, rejects: rej });
    }

    const [scripts, bank] = await Promise.all([
      db.collection('nightlyScripts').get(),
      db.collection('inspirationBank').get(),
    ]);
    const refs = new Map();
    bank.forEach((d) => refs.set(d.id, d.data()));

    const out = { pushed: 0, duplicate: 0, rejected: [], skipped: [] };
    for (const doc of scripts.docs) {
      const s = doc.data();
      const ref = refs.get(s.refId) || {};
      /* הרפרנס הוא תנאי. תסריט בלי המקור שלו הוא בדיוק מה שהיא פסלה. */
      const refUrl = s.refUrl || ref.url || '';
      if (!s.hook || !s.script || !refUrl) {
        out.skipped.push({ id: doc.id, why: !refUrl ? 'אין רפרנס' : 'אין הוק או תסריט' });
        continue;
      }
      try {
        const r = await fetch(PORTAL_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-sale-secret': portalSecret.value() },
          body: JSON.stringify({
            hook: s.hook,
            script: s.script,
            mechanism: s.mechanism || '',
            production: s.production || '',
            refUrl,
            refId: s.refId || doc.id,
            refDomain: s.refDomain || ref.domain || '',
            refThumb: ref.thumbnailUrl || '',
            refText: (ref.translationHe || ref.transcriptHe || '').slice(0, 7000),
            source: 'backfill',
          }),
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) out.rejected.push({ id: doc.id, status: r.status, error: body.error || '' });
        else if (body.duplicate) out.duplicate += 1;
        else out.pushed += 1;
      } catch (err) {
        out.rejected.push({ id: doc.id, error: err?.message || 'fetch failed' });
      }
    }
    console.log('backfillMarketingScripts', JSON.stringify(out));
    return res.json({ ok: true, total: scripts.size, ...out });
  },
);
