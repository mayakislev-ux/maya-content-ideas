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
/* 02/10/2026 (מאיה): "לקח יותר מדי זמן ונעצר". הדפדפן ויתר אחרי 170 שניות
   בזמן שהשרת עוד עבד. קריאה אחת לוקחת 80 עד 95 שניות, ולשרת יש תקציב של
   230 שניות לכל הניסיונות יחד, אז כאן מחכים קצת יותר ממנו. */
const BUDGET_MS = 250000;
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

  const slideJob = escapeHtml((story && story.job) || '');
  const parts = [`<h3 class="sq-role"><span class="sq-n">${n}</span>${role}${slideJob ? `<span class="sq-job-tag">${slideJob}</span>` : ''}</h3>`];
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

export function directionHtml(result) {
  const r = result || {};
  if (!r.goal && !r.a && !r.b) return '';
  const row = (label, value) => (value ? `<p class="sq-dir-row"><b>${escapeHtml(label)}</b> ${escapeHtml(value)}</p>` : '');
  return `
    <div class="sq-dir">
      ${r.goal ? `<p class="sq-dir-goal">${escapeHtml(r.goal)}</p>` : ''}
      ${row('היום הם חושבים:', r.a)}
      ${row('ואחרי זה:', r.b)}
      ${row('המחיר או הטוויסט:', r.why)}
    </div>`;
}

export function sequenceHtml(result, brand) {
  const stories = Array.isArray(result && result.stories) ? result.stories : [];
  if (!stories.length) return '<p class="sq-empty">לא התקבל רצף. אפשר לנסות שוב.</p>';
  /* 02/10/2026: הכיוון האסטרטגי קודם לרצף, כמו בתבנית הפלט שלה. בלי לדעת
     מה A ומה B אי אפשר לשפוט אם הרצף עושה את העבודה. */
  return directionHtml(result) + stories.map((s, i) => storyHtml(s, i, brand)).join('');
}

/** טקסט להעתקה, כדי שתוכל לשלוח את זה לעצמה לוואטסאפ לפני צילום */
export function sequenceText(result) {
  const out = [];
  if (result && (result.goal || result.a)) {
    if (result.goal) out.push(`מטרה: ${result.goal}`);
    if (result.a) out.push(`היום: ${result.a}`);
    if (result.b) out.push(`אחרי: ${result.b}`);
    if (result.why) out.push(`המחיר: ${result.why}`);
    out.push('');
  }
  (result.stories || []).forEach((s, i) => {
    out.push(`סטורי ${s.n || i + 1} - ${s.role || ''}${s.job ? ` (${s.job})` : ''}`);
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
    goal: result.goal || '',
    a: result.a || '',
    b: result.b || '',
    why: result.why || '',
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

/**
 * 02/10/2026 (מאיה): "אם יהיו מלא רצפים זה ייראה עמוס לעין, צריך כמו כפתור
 * נפתח עם תאריך, ושתמיד האחרון יהיה למעלה".
 */
export function whenText(value) {
  const d = value && typeof value.toDate === 'function' ? value.toDate()
    : value instanceof Date ? value
      : value && value.seconds ? new Date(value.seconds * 1000) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** האחרון למעלה תמיד, גם אם השרת החזיר בסדר אחר */
export function newestFirst(rows) {
  const at = (r) => {
    const c = r && r.createdAt;
    if (!c) return 0;
    if (typeof c.toDate === 'function') return c.toDate().getTime();
    if (c.seconds) return c.seconds * 1000;
    return new Date(c).getTime() || 0;
  };
  return [...(rows || [])].sort((a2, b2) => at(b2) - at(a2));
}

export function savedRowHtml(row) {
  const when = whenText(row && row.createdAt);
  const goal = (row && row.goal) || '';
  return `
    <button type="button" class="sq-saved-row" data-id="${escapeHtml((row && row.id) || '')}">
      <span class="sq-saved-topic">${escapeHtml((row && row.topic) || 'בלי נושא')}</span>
      <span class="sq-saved-meta">${escapeHtml(goal)}${goal && when ? ' · ' : ''}${escapeHtml(when)}</span>
    </button>`;
}

/* ---------------- הקריאה לשרת ---------------- */

async function callBreakdown({ topic, context, cta, assets, goal, signal, onPartial }) {
  const idToken = await auth.currentUser.getIdToken();
  const response = await fetch(URL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ topic, context, cta, assets, goal }),
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
      /* 02/10/2026: הרצף זורם, כדי שלא תחכי מול מסך ריק שתי דקות. הכיוון
         האסטרטגי מגיע אחרי כמה שניות, וכל סטורי ברגע שהוא נגמר. */
      if (onPartial && (event.direction || event.story || event.revising || event.thinking)) {
        onPartial(event);
        continue;
      }
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

      <label class="sq-goal-label" for="sq-goal">מטרת הרצף</label>
      <select id="sq-goal" class="sq-goal">
        <option value="auto">שתבחרי לפי הנושא</option>
        <option value="חוק השתקפות">חוק השתקפות</option>
        <option value="מודעות לבעיה">מודעות לבעיה</option>
        <option value="מודעות לפתרון">מודעות לפתרון</option>
        <option value="שבירת אמונה">שבירת אמונה</option>
        <option value="שריפת גשר">שריפת גשר</option>
        <option value="ביקורת מקצועית">ביקורת מקצועית</option>
        <option value="סמכות">סמכות</option>
        <option value="בידול">בידול</option>
        <option value="חיבור אישי">חיבור אישי</option>
        <option value="הוכחה">הוכחה</option>
        <option value="מכירה">מכירה</option>
      </select>
      <textarea id="sq-topic" rows="2" placeholder="הנושא, במשפט אחד"></textarea>
      <textarea id="sq-context" rows="2" placeholder="משהו שחייב להיכנס? סיפור, דוגמה, צילום מסך (לא חובה)"></textarea>
      <input id="sq-cta" type="text" placeholder="הנעה לפעולה, אם יש (לא חובה)">
      <div class="sq-actions">
        <button type="button" class="sq-go" id="sq-go">לפרק</button>
        <button type="button" class="sq-copy" id="sq-copy" hidden>להעתיק הכל</button>
        <span class="sq-status" id="sq-status"></span>
      </div>
      <div class="sq-saved" id="sq-saved" hidden>
        <button type="button" class="sq-saved-head" id="sq-saved-toggle" aria-expanded="false">
          <span>רצפים שבנית</span>
          <span class="sq-saved-count" id="sq-saved-count"></span>
          <span class="sq-saved-sign" aria-hidden="true">+</span>
        </button>
        <div class="sq-saved-list" id="sq-saved-list" hidden></div>
      </div>
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
    const box = el('sq-saved');
    const list = el('sq-saved-list');
    try {
      const rows = newestFirst(await listSequences());
      if (!rows.length) { box.hidden = true; list.innerHTML = ''; return; }
      box.hidden = false;
      el('sq-saved-count').textContent = String(rows.length);
      list.innerHTML = rows.map(savedRowHtml).join('');
      list._rows = rows;
    } catch (err) {
      /* 03/10/2026 (בדיקה): הרשימה הוסתרה לגמרי, בלי שום הודעה, ואז נראה
         שאין רצפים שמורים בכלל. כלל קבוע: מסך שלא הצליח אומר למה. */
      console.error('listSequences failed:', err);
      box.hidden = false;
      el('sq-saved-count').textContent = '';
      list.hidden = false;
      list.innerHTML = '<p class="sq-empty">לא הצלחנו לטעון את הרצפים השמורים. הם לא נמחקו, רק לא נטענו כרגע.</p>';
      el('sq-saved-toggle').setAttribute('aria-expanded', 'true');
      const sign = box.querySelector('.sq-saved-sign');
      if (sign) sign.textContent = '−';
    }
  }

  el('sq-saved-toggle').addEventListener('click', () => {
    const list = el('sq-saved-list');
    const open = list.hidden;
    list.hidden = !open;
    el('sq-saved-toggle').setAttribute('aria-expanded', String(open));
    el('sq-saved').querySelector('.sq-saved-sign').textContent = open ? '−' : '+';
  });

  el('sq-saved-list').addEventListener('click', (e) => {
    const row = e.target.closest('.sq-saved-row');
    if (!row) return;
    const rows = el('sq-saved-list')._rows || [];
    const found = rows.find((r) => r.id === row.dataset.id);
    if (!found) return;
    last = {
      goal: found.goal, a: found.a, b: found.b, why: found.why, stories: found.stories,
    };
    el('sq-topic').value = found.topic || '';
    el('sq-out').innerHTML = sequenceHtml(last, brand);
    el('sq-copy').hidden = false;
    // נסגרת אחרי בחירה, אחרת הרשימה דוחפת את הרצף למטה
    el('sq-saved-list').hidden = true;
    el('sq-saved-toggle').setAttribute('aria-expanded', 'false');
    el('sq-saved').querySelector('.sq-saved-sign').textContent = '+';
  });

  el('sq-toggle').addEventListener('click', async () => {
    const body = el('sq-body');
    const open = body.hidden;
    body.hidden = !open;
    el('sq-toggle').setAttribute('aria-expanded', String(open));
    box.querySelector('.sq-sign').textContent = open ? '−' : '+';
    if (open && !el('sq-saved-list').innerHTML) await refreshSaved();
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
    /* 03/10/2026 (בדיקה): הטיימר דילג על כל פעימה שבה שורת המצב הכילה
       "חושבת" או "מתקנת", וההודעה הזאת מגיעה מהשרת בשניות הראשונות ואף
       פעם לא נמחקת. בפועל הטיימר קפא בשנייה השנייה ונשאר קפוא 95 שניות,
       וההודעה המרגיעה של "לוקח בערך שתי דקות" לא יכלה להופיע אף פעם.
       עכשיו השלב והשניות הם שני דברים נפרדים, והשניות תמיד זזות. */
    let phase = 'מפרקת';
    const paintStatus = () => {
      const sec = Math.round((Date.now() - started) / 1000);
      status.textContent = sec > 90
        ? `${phase}... ${sec} שניות. רצף שלם לוקח בערך שתי דקות`
        : `${phase}... ${sec} שניות`;
    };
    const tick = setInterval(paintStatus, 1000);

    try {
      let assets = [];
      try {
        assets = (await listAssets()).map((a) => ({ kind: a.kind, title: a.title, name: a.name }));
      } catch (err) {
        // בלי תמונות עדיין אפשר לפרק, רק בלי להפנות לתמונה ספציפית
        console.error('listAssets for sequence failed:', err);
      }
      /* מציירים תוך כדי: קודם הכיוון האסטרטגי, ואז סטורי אחרי סטורי.
         בסוף מחליפים בתוצאה המלאה, כי ייתכן שהייתה קריאה מתקנת. */
      const out = el('sq-out');
      const partial = { stories: [] };
      const result = await callBreakdown({
        topic,
        context: el('sq-context').value.trim(),
        cta: el('sq-cta').value.trim(),
        assets,
        goal: el('sq-goal').value || 'auto',
        signal: budget.signal,
        onPartial: (event) => {
          if (event.thinking) { phase = 'חושבת על הכיוון השיווקי'; paintStatus(); return; }
          if (event.revising) { phase = 'מתקנת את הרצף'; paintStatus(); return; }
          if (event.direction) {
            Object.assign(partial, event.direction);
            out.innerHTML = directionHtml(partial);
            return;
          }
          if (event.story) {
            partial.stories.push(event.story);
            out.insertAdjacentHTML('beforeend', storyHtml(event.story, partial.stories.length - 1, brand));
          }
        },
      });
      last = result;
      el('sq-out').innerHTML = sequenceHtml(result, brand);
      status.textContent = '';
      /* 03/10/2026 (בדיקה): תשובה בלי סטוריז נשמרה בכל זאת, ויצרה שורה
         ברשימה עם נושא ותאריך שנפתחת לכלום, וכפתור העתקה שמחזיר כלום. */
      if (!(result && Array.isArray(result.stories) && result.stories.length)) {
        showToast('לא התקבל רצף. אפשר לנסות שוב');
        return;
      }
      el('sq-copy').hidden = false;
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
      /* 03/10/2026 (בדיקה): כל ההודעות שאנחנו כותבים הן בעברית, ולכן הודעה
         בלי עברית היא הודעה של הדפדפן ("Failed to fetch") שאין לה מה
         לעשות על המסך שלה. */
      const raw = String((err && err.message) || '');
      const ours = /[\u0590-\u05FF]/.test(raw);
      const msg = aborted
        ? 'לקח יותר מדי זמן ונעצר. אפשר לנסות שוב.'
        : (ours ? raw : 'משהו השתבש, נסו שוב בבקשה.');
      const out = el('sq-out');
      /* 03/10/2026 (בדיקה): אם כבר הופיעו סטוריז על המסך, אסור למחוק אותם.
         הם נבנו, שולם עליהם, ולראות אותם נעלמים אחרי שתי דקות המתנה גרוע
         יותר מהשגיאה עצמה. ההודעה נכנסת מעליהם, והם נשארים. */
      if (out.querySelector('.sq-card')) {
        out.insertAdjacentHTML(
          'afterbegin',
          `<p class="sq-empty">${escapeHtml(msg)} מה שנבנה עד כאן נשאר למטה, אבל לא נשמר.</p>`
        );
      } else {
        out.innerHTML = `<p class="sq-empty">${escapeHtml(msg)}</p>`;
      }
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
