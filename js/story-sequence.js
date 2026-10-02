/**
 * פירוק נושא לרצף סטוריז, אצל מאיה בלבד.
 *
 * 02/10/2026 (מאיה): "לוקח לי נושא ונגיד מפרק לי אותו ל2-6 סטוריז, ואם צריך
 * דיבור למצלמה אז הוא לא מייצר, הוא אומר תפתחי מצלמה ותדברי ככה, אבל זה
 * סטורי 1 סקר / עצירה".
 *
 * זה לא כותב לה תוכן להעתיק. זה תדריך צילום: לכל סטורי תפקיד, פורמט, ומה
 * בדיוק להגיד או לכתוב. הפורמט נלמד משתי דוגמאות מלאות שהיא כתבה בעצמה.
 *
 * ובאותו יום: "בגלל שהסטוריז בצבע מותג... שיהיה אופציה להוסיף את זה וגם את
 * השם של הפונט הקבוע... ושהכל ישמר תמיד ולא כל פעם מחדש". לכן לכל סטורי יש
 * תצוגה בצבעים ובפונט שלה, וגם ההגדרות וגם הרצפים נשמרים ב-Firestore.
 *
 * כמו התיקייה שמעליו, הבלוק הזה אינו ב-HTML בכלל ונבנה כאן רק כשהמייל שלה,
 * והשרת חוסם בנפרד לפי מייל כדי שקריאה ישירה לא תעקוף אותו.
 */

import { db, auth } from './firebase-init.js';
import {
  collection, addDoc, getDocs, deleteDoc, doc, query, where, orderBy, limit, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { showToast } from './toast.js';
import { listAssets } from './story-assets.js';
import { loadBrand, saveBrand, previewHtml, normalizeBrand, DEFAULT_BRAND } from './story-brand.js';

const OWNER_EMAIL = 'mayakislev@gmail.com';
const URL_ENDPOINT = 'https://us-central1-content-ideas-becd7.cloudfunctions.net/breakdownStorySequence';
const BUDGET_MS = 170000;
const KEEP_SEQUENCES = 20;

const el = (id) => document.getElementById(id);

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** שבירות שורה הן חלק מהעיצוב של הסטורי, ולכן נשמרות כפי שהן */
export function linesHtml(text) {
  return escapeHtml(text)
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `<span class="sq-line">${line}</span>` : '<span class="sq-gap"></span>'))
    .join('');
}

/**
 * סטורי אחד.
 * לא מציגים שדה ריק: כרטיס עם "סקר:" בלי סקר נראה כמו תקלה.
 */
export function storyHtml(story, index, brand) {
  const n = Number(story && story.n) || index + 1;
  const role = escapeHtml((story && story.role) || 'סטורי');
  const format = escapeHtml((story && story.format) || '');
  const asset = escapeHtml((story && story.asset) || '');
  const text = (story && story.text) || '';
  const speech = (story && story.speech) || '';
  const small = (story && story.small) || '';
  const note = escapeHtml((story && story.note) || '');
  const poll = (story && story.poll) || {};

  const parts = [`<h3 class="sq-role"><span class="sq-n">${n}</span>${role}</h3>`];
  if (format) parts.push(`<p class="sq-format"><b>פורמט:</b> ${format}</p>`);
  if (asset) parts.push(`<p class="sq-asset">🖼️ ${asset}</p>`);
  if (speech) parts.push(`<div class="sq-speech"><b>מה להגיד:</b><div class="sq-body">${linesHtml(speech)}</div></div>`);
  if (text) parts.push(`<div class="sq-text">${linesHtml(text)}</div>`);
  if (small) parts.push(`<p class="sq-small"><b>ומתחת קטן:</b> ${escapeHtml(small)}</p>`);
  if (poll.question) {
    parts.push(
      `<p class="sq-poll"><b>סקר:</b> ${escapeHtml(poll.question)}<br>` +
      `${escapeHtml(poll.a || '')} / ${escapeHtml(poll.b || '')}</p>`
    );
  }
  if (note) parts.push(`<p class="sq-note">${note}</p>`);

  /* התצוגה בצבעים ובפונט שלה, לצד ההוראות. ככה היא רואה מיד אם המשפט
     ארוך מדי או אם ההדגשה נופלת על השורה הלא נכונה. */
  return `<article class="sq-card">
    <div class="sq-card-main">${parts.join('')}</div>
    <div class="sq-card-preview">${previewHtml(story, brand)}</div>
  </article>`;
}

export function angleHtml(angle) {
  if (!angle || !angle.risk) return '';
  return `
    <div class="sq-angle">
      <p class="sq-angle-head">לפני שמתחילים, חידוד הזווית</p>
      <p class="sq-angle-risk">לא: ${escapeHtml(angle.risk)}</p>
      <p class="sq-angle-bridge">כן: ${escapeHtml(angle.bridge || '')}</p>
    </div>`;
}

export function sequenceHtml(result, brand) {
  const stories = Array.isArray(result && result.stories) ? result.stories : [];
  if (!stories.length) return '<p class="sq-empty">לא התקבל רצף. אפשר לנסות שוב.</p>';
  return angleHtml(result.angle) + stories.map((s, i) => storyHtml(s, i, brand)).join('');
}

/** טקסט להעתקה, כדי שתוכל לשלוח את זה לעצמה לוואטסאפ לפני צילום */
export function sequenceText(result) {
  const out = [];
  if (result && result.angle && result.angle.risk) {
    out.push('חידוד הזווית', `לא: ${result.angle.risk}`, `כן: ${result.angle.bridge || ''}`, '');
  }
  (result.stories || []).forEach((s, i) => {
    out.push(`סטורי ${s.n || i + 1} - ${s.role || ''}`);
    if (s.format) out.push(`פורמט: ${s.format}`);
    if (s.asset) out.push(`תמונה: ${s.asset}`);
    if (s.speech) out.push('מה להגיד:', s.speech);
    if (s.text) out.push(s.text);
    if (s.small) out.push(`ומתחת קטן: ${s.small}`);
    if (s.poll && s.poll.question) out.push(`סקר: ${s.poll.question} / ${s.poll.a || ''} / ${s.poll.b || ''}`);
    if (s.note) out.push(`(${s.note})`);
    out.push('');
  });
  return out.join('\n').trim();
}

/* ---------------- שמירת הרצפים ---------------- */

async function saveSequence(topic, result) {
  const user = auth.currentUser;
  if (!user) return null;
  const ref = await addDoc(collection(db, 'storySequences'), {
    ownerUid: user.uid,
    topic: String(topic || '').slice(0, 300),
    angle: result.angle || { risk: '', bridge: '' },
    stories: result.stories || [],
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

async function listSequences() {
  const user = auth.currentUser;
  if (!user) return [];
  const snap = await getDocs(
    query(
      collection(db, 'storySequences'),
      where('ownerUid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(KEEP_SEQUENCES)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ---------------- הקריאה לשרת ---------------- */

async function callBreakdown({ topic, context, cta, assets, signal }) {
  const idToken = await auth.currentUser.getIdToken();
  const response = await fetch(URL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ topic, context, cta, assets }),
    signal,
  });
  if (!response.ok) {
    let message = 'משהו השתבש, נסו שוב בבקשה.';
    try {
      const data = await response.json();
      if (data && data.error) message = data.error;
    } catch { /* גוף שאינו JSON, נשארת ההודעה הכללית */ }
    throw new Error(message);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';
    for (const chunk of chunks) {
      const line = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      let event;
      try { event = JSON.parse(line.slice(6)); } catch { continue; }
      if (event.error) throw new Error(event.error);
      if (event.done) return event;
    }
  }
  throw new Error('משהו השתבש, נסו שוב בבקשה.');
}

/* ---------------- המסך ---------------- */

export async function wireStorySequence() {
  if ((auth.currentUser && auth.currentUser.email) !== OWNER_EMAIL) return;
  const host = el('story-table-panel');
  const anchor = el('story-table');
  if (!host || !anchor) return;
  if (el('sq-box')) return;

  const box = document.createElement('section');
  box.id = 'sq-box';
  box.className = 'sq-box';
  box.innerHTML = `
    <button type="button" class="sq-head" id="sq-toggle" aria-expanded="false">
      <span>✂️ לפרק נושא לרצף סטוריז</span>
      <span class="sq-sign" aria-hidden="true">+</span>
    </button>
    <div class="sq-body-wrap" id="sq-body" hidden>
      <details class="sq-brand" id="sq-brand">
        <summary>🎨 צבעי המותג והפונט</summary>
        <div class="sq-brand-grid">
          <label>רקע<input type="color" id="sq-c-bg"></label>
          <label>טקסט<input type="color" id="sq-c-text"></label>
          <label>הדגשה<input type="color" id="sq-c-accent"></label>
          <label>שורה קטנה<input type="color" id="sq-c-small"></label>
        </div>
        <input type="text" id="sq-font" placeholder="שם הפונט הקבוע של הסטוריז, למשל Heebo">
        <p class="sq-brand-note">נשמר אוטומטית, וחל על כל הרצפים מכאן והלאה.</p>
      </details>

      <textarea id="sq-topic" rows="2" placeholder="הנושא, במשפט אחד"></textarea>
      <textarea id="sq-context" rows="2" placeholder="משהו שחייב להיכנס? סיפור, דוגמה, צילום מסך (לא חובה)"></textarea>
      <input id="sq-cta" type="text" placeholder="הנעה לפעולה, אם יש (לא חובה)">
      <div class="sq-actions">
        <button type="button" class="sq-go" id="sq-go">לפרק</button>
        <button type="button" class="sq-copy" id="sq-copy" hidden>להעתיק הכל</button>
        <span class="sq-status" id="sq-status"></span>
      </div>
      <div class="sq-saved" id="sq-saved"></div>
      <div class="sq-out" id="sq-out"></div>
    </div>`;
  host.insertBefore(box, anchor);

  let last = null;
  let brand = { ...DEFAULT_BRAND };

  /* ---- צבעי המותג ---- */
  const fields = { bg: el('sq-c-bg'), text: el('sq-c-text'), accent: el('sq-c-accent'), small: el('sq-c-small') };

  function paintFields() {
    Object.entries(fields).forEach(([key, input]) => { if (input) input.value = brand[key]; });
    el('sq-font').value = brand.font || '';
  }

  async function persistBrand() {
    brand = normalizeBrand({
      bg: fields.bg.value, text: fields.text.value, accent: fields.accent.value,
      small: fields.small.value, font: el('sq-font').value,
    });
    try {
      await saveBrand(brand);
      // התצוגה שכבר על המסך מתעדכנת מיד, אחרת נראה שהשינוי לא נתפס
      if (last) el('sq-out').innerHTML = sequenceHtml(last, brand);
    } catch (err) {
      console.error('saveBrand failed:', err);
      showToast('ההגדרות לא נשמרו');
    }
  }

  Object.values(fields).forEach((input) => input && input.addEventListener('change', persistBrand));
  el('sq-font').addEventListener('change', persistBrand);

  brand = await loadBrand();
  paintFields();

  /* ---- רצפים שנשמרו ---- */
  async function refreshSaved() {
    const holder = el('sq-saved');
    try {
      const rows = await listSequences();
      if (!rows.length) { holder.innerHTML = ''; return; }
      holder.innerHTML =
        '<p class="sq-saved-head">רצפים שבנית</p>' +
        rows.map((r) => `<button type="button" class="sq-chip" data-id="${r.id}">${escapeHtml(r.topic || 'בלי נושא')}</button>`).join('');
      holder._rows = rows;
    } catch (err) {
      console.error('listSequences failed:', err);
      holder.innerHTML = '';
    }
  }

  el('sq-saved').addEventListener('click', (e) => {
    const chip = e.target.closest('.sq-chip');
    if (!chip) return;
    const rows = el('sq-saved')._rows || [];
    const row = rows.find((r) => r.id === chip.dataset.id);
    if (!row) return;
    last = { angle: row.angle, stories: row.stories };
    el('sq-topic').value = row.topic || '';
    el('sq-out').innerHTML = sequenceHtml(last, brand);
    el('sq-copy').hidden = false;
  });

  el('sq-toggle').addEventListener('click', async () => {
    const body = el('sq-body');
    const open = body.hidden;
    body.hidden = !open;
    el('sq-toggle').setAttribute('aria-expanded', String(open));
    box.querySelector('.sq-sign').textContent = open ? '−' : '+';
    if (open && !el('sq-saved').innerHTML) await refreshSaved();
  });

  el('sq-go').addEventListener('click', async () => {
    const topic = el('sq-topic').value.trim();
    if (!topic) { showToast('צריך נושא'); return; }
    const go = el('sq-go');
    const status = el('sq-status');
    go.disabled = true;
    el('sq-copy').hidden = true;
    el('sq-out').innerHTML = '';
    status.textContent = 'מפרקת...';

    /* גבול זמן, כדי שהמסך לא יישאר תקוע בלי הסבר אם הקריאה נתקעת */
    const budget = new AbortController();
    const timer = setTimeout(() => budget.abort(), BUDGET_MS);
    const started = Date.now();
    const tick = setInterval(() => {
      status.textContent = `מפרקת... ${Math.round((Date.now() - started) / 1000)} שניות`;
    }, 1000);

    try {
      let assets = [];
      try {
        assets = (await listAssets()).map((a) => ({ kind: a.kind, title: a.title, name: a.name }));
      } catch (err) {
        // בלי תמונות עדיין אפשר לפרק, רק בלי להפנות לתמונה ספציפית
        console.error('listAssets for sequence failed:', err);
      }
      const result = await callBreakdown({
        topic,
        context: el('sq-context').value.trim(),
        cta: el('sq-cta').value.trim(),
        assets,
        signal: budget.signal,
      });
      last = result;
      el('sq-out').innerHTML = sequenceHtml(result, brand);
      el('sq-copy').hidden = false;
      status.textContent = '';
      try {
        await saveSequence(topic, result);
        await refreshSaved();
      } catch (err) {
        // הרצף על המסך ולכן לא אבד, רק לא נשמר להמשך
        console.error('saveSequence failed:', err);
        showToast('הרצף על המסך, אבל לא נשמר');
      }
    } catch (err) {
      console.error('breakdownStorySequence failed:', err);
      status.textContent = '';
      const aborted = err && err.name === 'AbortError';
      el('sq-out').innerHTML = `<p class="sq-empty">${escapeHtml(aborted ? 'לקח יותר מדי זמן ונעצר. אפשר לנסות שוב.' : err.message)}</p>`;
    } finally {
      clearTimeout(timer);
      clearInterval(tick);
      go.disabled = false;
    }
  });

  el('sq-copy').addEventListener('click', async () => {
    if (!last) return;
    try {
      await navigator.clipboard.writeText(sequenceText(last));
      showToast('הועתק');
    } catch {
      showToast('הדפדפן לא נתן להעתיק');
    }
  });
}
