/* 06/11/2026 (מאיה): "בתוך האפליקציה בהוספת רעיון שיהיה אופציה להקליט
   נגיד אפילו מה היה היום ואז אם שלחתי הקלטה ארוכה... אפילו הקלטה של 10 דק
   ואז שימצא מתוך ההקלטה שלי את כל הרעיונות שיש וכמובן לחלק לקטגוריות".

   הרעיונות הכי חזקים קורים ביום-יום ונשכחים. כאן מספרים בקול מה היה, עד
   10 דקות, וההקלטה הופכת לרשימת רעיונות מסווגים. הלקוח/ה מסמנ/ת מה לשמור
   ורק זה נשמר.

   הזרימה: הקלטה בדפדפן (MediaRecorder) -> העלאה ל-transcribeUploads/{uid}/
   (אותה תיקייה ואותו ניקוי כמו "✨ תמלול מדויק") -> ideasFromRecording
   (ג'מיני מקשיב ומחזיר רעיונות, הקובץ נמחק) -> בחירה -> addIdea לכל רעיון.

   בדפדפן בלי הקלטה הכפתור פשוט לא מופיע. */
import { app, auth, functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { getStorage, ref, uploadBytesResumable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { addIdea } from './ideas-store.js';
import { showToast } from './toast.js';
import { confirmDialog } from './confirm-dialog.js';
import { categoryColorVar } from './ideas-logic.js';

export const MAX_SECONDS = 600;
const BUCKET = 'gs://content-ideas-becd7-story-assets';
const ideasFromRecording = httpsCallable(functions, 'ideasFromRecording', { timeout: 300000 });

/* ---------- עזרים טהורים (נבדקים) ---------- */

/** הסוג הראשון שהדפדפן יודע להקליט. iOS: audio/mp4, כרום: audio/webm. */
export function pickMimeType(isSupported) {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  if (typeof isSupported !== 'function') return '';
  return options.find((t) => { try { return isSupported(t); } catch { return false; } }) || '';
}

/** סוג נקי לשמירה ולג'מיני: בלי ;codecs, ותמיד audio/* (הכללים דורשים). */
export function cleanAudioType(type) {
  const base = String(type || '').split(';')[0].trim().toLowerCase();
  if (base.startsWith('audio/')) return base;
  if (base === 'video/webm') return 'audio/webm';
  if (base === 'video/mp4') return 'audio/mp4';
  return 'audio/webm';
}

export function extensionFor(type) {
  const t = cleanAudioType(type);
  if (t === 'audio/mp4' || t === 'audio/aac' || t === 'audio/x-m4a') return 'm4a';
  if (t === 'audio/ogg') return 'ogg';
  if (t === 'audio/mpeg') return 'mp3';
  return 'webm';
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function recorderSupported(win = globalThis) {
  return Boolean(win && win.MediaRecorder && win.navigator && win.navigator.mediaDevices
    && typeof win.navigator.mediaDevices.getUserMedia === 'function');
}

/* ---------- מצב ---------- */

let stream = null;
let recorder = null;
let chunks = [];
let timer = null;
let startedAt = 0;
let lastBlob = null;
let found = [];
let busy = false;
let starting = false;
/* 06/11/2026: החלון משרת גם את מיקרופון הבית (js/home-mic.js), שמתמלל תוך
   כדי דיבור ומגיע לכאן רק עם הטקסט. origin אומר מאיפה נפתח, retryAction
   מה "לנסות שוב" עושה, ו-onSaved נקרא אחרי שמירה מלאה. */
let origin = 'form';
let retryAction = null;
let onSaved = null;
let emptyLead = '';
/* 06/11/2026 ("אין לי רעיון?"): מאיפה הרעיונות באו (שורה מהטבלה, צילום
   מסך), שדות שנשמרים עם כל רעיון, ו"חזרה לשורות". */
let contextLine = '';
let extraFields = null;
let saveSource = 'הקלטה';
let backAction = null;
let foundIn = 'בהקלטה';
const TITLE_FORM = '🎙️ לספר ולמצוא רעיונות';
const HINT_FORM = 'הקלטה ארוכה לוקחת עד דקה. אפשר לחכות כאן.';
/* נקבע ב-wireRecorderEntry: סוגר את טופס "רעיון חדש" אחרי שמירה */
let closeIdeaModal = () => {};

function el(id) { return document.getElementById(id); }

function stopStream() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
}

function clearTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

function showStep(step) {
  ['intro', 'recording', 'working', 'results', 'error'].forEach((s) => {
    const node = el(`rec-step-${s}`);
    if (node) node.hidden = s !== step;
  });
}

function ensureModal() {
  if (el('recorder-modal')) return el('recorder-modal');
  const modal = document.createElement('div');
  modal.id = 'recorder-modal';
  modal.className = 'modal';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'rec-title');
  modal.innerHTML = `
    <div class="modal-content rec-content">
      <h2 id="rec-title" class="rec-title">${TITLE_FORM}</h2>
      <button type="button" id="rec-back-btn" class="btn-text rec-back-btn" hidden>‹ חזרה</button>
      <p id="rec-context-line" class="rec-context-line" hidden></p>

      <div id="rec-step-intro">
        <p class="rec-lead">מספרים בקול מה היה היום: מה לקוח/ה שאל/ה, מה הרגיז, מה הצחיק, מה עבד. עד 10 דקות.</p>
        <p class="rec-lead rec-lead--soft">בסוף מקבלים רשימה של כל הרעיונות לתוכן שיש בהקלטה, כבר מסווגים, ובוחרים מה לשמור.</p>
        <button type="button" id="rec-start-btn" class="btn-primary rec-main-btn">להתחיל להקליט</button>
        <button type="button" id="rec-cancel-intro" class="btn-text rec-secondary">ביטול</button>
      </div>

      <div id="rec-step-recording" hidden>
        <div class="rec-live" aria-live="polite">
          <span class="rec-dot" aria-hidden="true"></span>
          <span id="rec-clock" class="rec-clock">0:00</span>
          <span class="rec-limit">/ 10:00</span>
        </div>
        <p class="rec-hint">מקליטים. כדאי להשאיר את המסך דלוק עד הסוף.</p>
        <button type="button" id="rec-stop-btn" class="btn-primary rec-main-btn">סיימתי, למצוא רעיונות</button>
        <button type="button" id="rec-discard-btn" class="btn-text rec-secondary">לבטל את ההקלטה</button>
      </div>

      <div id="rec-step-working" hidden>
        <div class="rec-spinner" aria-hidden="true"></div>
        <p id="rec-working-text" class="rec-lead rec-center" aria-live="polite">מעלים את ההקלטה...</p>
        <p id="rec-working-hint" class="rec-hint rec-center">${HINT_FORM}</p>
        <button type="button" id="rec-close-working" class="btn-text rec-secondary" hidden>סגירה (הטקסט נשאר בתיבה)</button>
      </div>

      <div id="rec-step-results" hidden>
        <p id="rec-results-lead" class="rec-lead"></p>
        <ul id="rec-list" class="rec-list"></ul>
        <button type="button" id="rec-save-btn" class="btn-primary rec-main-btn">לשמור</button>
        <button type="button" id="rec-close-results" class="btn-text rec-secondary">סגירה בלי לשמור</button>
      </div>

      <div id="rec-step-error" hidden>
        <p id="rec-error-text" class="rec-lead" role="alert"></p>
        <button type="button" id="rec-retry-btn" class="btn-primary rec-main-btn">לנסות שוב עם אותה הקלטה</button>
        <button type="button" id="rec-new-btn" class="btn-text rec-secondary">להקליט מחדש</button>
        <button type="button" id="rec-close-error" class="btn-text rec-secondary">סגירה</button>
      </div>
    </div>`;
  /* לפני חלון האישור: כש"לבטל את ההקלטה?" פתוח הוא האחרון ב-DOM, ו-Escape
     של app.js סוגר אותו ולא את ההקלטה שמתחתיו. */
  const confirmEl = el('confirm-dialog');
  if (confirmEl && confirmEl.parentNode) confirmEl.parentNode.insertBefore(modal, confirmEl);
  else document.body.appendChild(modal);
  /* Escape בזמן הקלטה הסתיר את החלון והשאיר את המיקרופון דולק (ביקורת
     06/11). כאן Escape עושה מה שכפתור הסגירה של אותו שלב עושה. */
  document.addEventListener('keydown', onEscape, true);

  el('rec-start-btn').addEventListener('click', startRecording);
  el('rec-cancel-intro').addEventListener('click', closeRecorder);
  el('rec-stop-btn').addEventListener('click', () => finishRecording());
  el('rec-discard-btn').addEventListener('click', discardRecording);
  el('rec-save-btn').addEventListener('click', saveChosen);
  el('rec-close-results').addEventListener('click', closeResultsAsking);
  el('rec-retry-btn').addEventListener('click', () => { if (retryAction) retryAction(); });
  el('rec-new-btn').addEventListener('click', () => { lastBlob = null; showStep('intro'); });
  el('rec-close-error').addEventListener('click', closeRecorder);
  el('rec-close-working').addEventListener('click', closeRecorder);
  el('rec-back-btn').addEventListener('click', goBack);
  return modal;
}

/* ---------- פתיחה וסגירה ---------- */

function currentStep() {
  return ['intro', 'recording', 'working', 'results', 'error'].find((s) => {
    const node = el(`rec-step-${s}`);
    return node && !node.hidden;
  });
}

function onEscape(e) {
  if (e.key !== 'Escape') return;
  const modal = el('recorder-modal');
  if (!modal || modal.hidden) return;
  const confirmEl = el('confirm-dialog');
  if (confirmEl && !confirmEl.hidden) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const step = currentStep();
  if (step === 'recording') discardRecording();
  else if (step === 'results') closeResultsAsking();
  else if (step === 'working') {
    /* באמצע שליחה מהטופס: לא סוגרים, התשובה בדרך. מהבית הטקסט כבר בתיבה. */
    if (origin !== 'form') closeRecorder();
  }
  else closeRecorder();
}

export function openRecorder() {
  ensureModal();
  closeRecorder();
  found = [];
  lastBlob = null;
  setOrigin('form');
  showStep('intro');
  el('recorder-modal').hidden = false;
}

function setOrigin(next, { title, context = '', back = null } = {}) {
  origin = next;
  retryAction = null;
  onSaved = null;
  emptyLead = '';
  contextLine = context;
  extraFields = null;
  saveSource = 'הקלטה';
  foundIn = 'בהקלטה';
  backAction = back && typeof back.onClick === 'function' ? back : null;
  el('rec-title').textContent = title || TITLE_FORM;
  el('rec-context-line').textContent = context;
  el('rec-context-line').hidden = !context;
  el('rec-back-btn').hidden = !backAction;
  if (backAction) el('rec-back-btn').textContent = `‹ ${backAction.label || 'חזרה'}`;
  el('rec-working-hint').hidden = next !== 'form';
  /* "להקליט מחדש" שייך למקליט של הטופס. במיקרופון הבית מקליטים מהכרטיס. */
  el('rec-new-btn').hidden = next !== 'form';
  /* בבית אין מה לאבד: הטקסט כבר בתיבה, ולכן אפשר לסגור גם באמצע ההמתנה */
  el('rec-close-working').hidden = next === 'form';
}

/* ---------- 06/11/2026: החלון בשביל מיקרופון הבית ----------
   מיקרופון הבית מתמלל תוך כדי דיבור, ומגיע לכאן רק אחרי "סיימתי":
   1. openIdeasPopup: החלון נפתח מיד עם התקדמות קטנה (לא מסך נפרד).
   2. setIdeasPopupProgress: מעדכן את שורת ההתקדמות.
   3. showIdeasInPopup: אותה רשימה ואותה שמירה בדיוק כמו אחרי הקלטה.
   4. showIdeasPopupError: שגיאה גלויה, ו"לנסות שוב" מריץ את onRetry. */
export function openIdeasPopup({ title = '✨ הרעיונות ממה שסיפרת', progress = '', context = '', back = null } = {}) {
  ensureModal();
  closeRecorder();
  found = [];
  lastBlob = null;
  setOrigin('home', { title, context, back });
  el('rec-working-text').textContent = progress;
  showStep('working');
  el('recorder-modal').hidden = false;
}

export function setIdeasPopupProgress(text) {
  const node = el('rec-working-text');
  if (node) node.textContent = text;
}

/** ideas כמו שהשרת מחזיר. onSaved(savedIdeas) נקרא רק כשהכל נשמר.
    context: שורה מעל הרשימה שאומרת מאיפה הרעיונות (ריק = בלי לשנות).
    extra: שדות שנשמרים עם כל רעיון (sourceRow וכו'). source: שדה source בשמירה. */
export function showIdeasInPopup(ideas, { onSaved: done = null, emptyText = '', context = '', extra = null, source = '', where = '' } = {}) {
  if (!ideasPopupOpen()) return;
  onSaved = done;
  emptyLead = emptyText;
  if (context) {
    contextLine = context;
    el('rec-context-line').textContent = context;
    el('rec-context-line').hidden = false;
  }
  extraFields = extra && typeof extra === 'object' ? { ...extra } : null;
  if (source) saveSource = source;
  if (where) foundIn = where;
  found = (Array.isArray(ideas) ? ideas : []).map((idea) => ({ ...idea, keep: true }));
  renderResults();
}

export function showIdeasPopupError(message, { onRetry = null } = {}) {
  if (!ideasPopupOpen()) return;
  retryAction = onRetry;
  showError(message, { canRetry: Boolean(onRetry) });
}

/** סוגר את חלון הרעיונות (למשל לפני הקלטה חדשה מ"לנסות שוב"). */
export function closeIdeasPopup() {
  closeRecorder();
}

export function ideasPopupOpen() {
  const modal = el('recorder-modal');
  return Boolean(modal && !modal.hidden);
}

/* "חזרה לשורות": אם יש רעיונות מסומנים שלא נשמרו, שואלים קודם */
async function goBack() {
  const back = backAction;
  if (!back) return;
  if (currentStep() === 'results' && found.some((f) => f.keep)) {
    const ok = await confirmDialog('לחזור בלי לשמור? הרעיונות האלה לא יישמרו.', {
      okLabel: 'לחזור בלי לשמור',
      cancelLabel: 'להישאר',
    });
    if (!ok) return;
  }
  closeRecorder();
  try { back.onClick(); } catch (err) { console.error('recorder: back failed', err); }
}

function closeRecorder() {
  clearTimer();
  if (recorder && recorder.state !== 'inactive') {
    recorder.onstop = null;
    try { recorder.stop(); } catch { /* כבר נעצר */ }
  }
  recorder = null;
  chunks = [];
  stopStream();
  busy = false;
  starting = false;
  const modal = el('recorder-modal');
  if (modal) modal.hidden = true;
}

async function discardRecording() {
  const ok = await confirmDialog('לבטל את ההקלטה? מה שהוקלט עד עכשיו יימחק.', {
    okLabel: 'לבטל את ההקלטה',
    cancelLabel: 'להמשיך להקליט',
  });
  if (ok) closeRecorder();
}

async function closeResultsAsking() {
  const chosen = found.filter((f) => f.keep);
  if (chosen.length) {
    const ok = await confirmDialog('לסגור בלי לשמור? הרעיונות מההקלטה לא יישמרו.', {
      okLabel: 'לסגור בלי לשמור',
      cancelLabel: 'חזרה לרשימה',
    });
    if (!ok) return;
  }
  closeRecorder();
}

/* ---------- הקלטה ---------- */

async function startRecording() {
  /* לחיצה כפולה בזמן שהדפדפן שואל על המיקרופון פתחה שני מיקרופונים */
  if (starting || (recorder && recorder.state !== 'inactive')) return;
  starting = true;
  try {
    await beginRecording();
  } finally {
    starting = false;
  }
}

async function beginRecording() {
  if (!recorderSupported()) {
    showError('הדפדפן הזה לא תומך בהקלטה. אפשר לכתוב את הרעיון במקום.');
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.warn('recorder: mic denied', err && err.name);
    showError('אין גישה למיקרופון. צריך לאשר גישה למיקרופון בהגדרות הדפדפן ואז לנסות שוב.', { canRetry: false });
    return;
  }
  const mimeType = pickMimeType((t) => MediaRecorder.isTypeSupported(t));
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 64000 } : undefined);
  } catch {
    recorder = new MediaRecorder(stream);
  }
  chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    const type = (recorder && recorder.mimeType) || mimeType || 'audio/webm';
    const blob = new Blob(chunks, { type });
    recorder = null;
    chunks = [];
    stopStream();
    if (!blob.size) {
      showError('ההקלטה יצאה ריקה. לנסות שוב?', { canRetry: false });
      return;
    }
    lastBlob = blob;
    retryAction = () => processBlob(lastBlob);
    processBlob(blob);
  };
  recorder.start(1000);
  startedAt = Date.now();
  el('rec-clock').textContent = '0:00';
  showStep('recording');
  clearTimer();
  timer = setInterval(() => {
    const secs = (Date.now() - startedAt) / 1000;
    el('rec-clock').textContent = formatClock(secs);
    if (secs >= MAX_SECONDS) finishRecording(true);
  }, 250);
}

function finishRecording(hitLimit = false) {
  clearTimer();
  if (hitLimit) showToast('הגענו ל-10 דקות, ההקלטה נעצרה');
  if (recorder && recorder.state !== 'inactive') recorder.stop();
}

/* ---------- שליחה ---------- */

function uploadBlob(blob, onProgress) {
  const type = cleanAudioType(blob.type);
  const uid = auth.currentUser && auth.currentUser.uid;
  const path = `transcribeUploads/${uid}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${extensionFor(type)}`;
  const task = uploadBytesResumable(ref(getStorage(app, BUCKET), path), blob, { contentType: type });
  return new Promise((resolve, reject) => {
    task.on('state_changed', (snap) => {
      if (onProgress && snap && snap.totalBytes) onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
    }, reject, () => resolve(path));
  });
}

async function processBlob(blob) {
  if (busy) return;
  busy = true;
  showStep('working');
  const text = el('rec-working-text');
  text.textContent = 'מעלים את ההקלטה...';
  try {
    const path = await uploadBlob(blob, (pct) => { text.textContent = `מעלים את ההקלטה... ${pct}%`; });
    text.textContent = 'מקשיבים להקלטה ומוציאים ממנה רעיונות...';
    const res = await ideasFromRecording({ path });
    const ideas = (res && res.data && Array.isArray(res.data.ideas)) ? res.data.ideas : [];
    found = ideas.map((idea) => ({ ...idea, keep: true }));
    renderResults();
  } catch (err) {
    console.error('ideasFromRecording failed:', err);
    const msg = String((err && err.message) || '');
    showError(/[֐-׿]/.test(msg) ? msg : 'משהו השתבש בדרך. ההקלטה שמורה, אפשר לנסות שוב.');
  } finally {
    busy = false;
  }
}

function showError(message, { canRetry = true } = {}) {
  el('rec-error-text').textContent = message;
  el('rec-retry-btn').hidden = !(canRetry && retryAction);
  el('rec-retry-btn').textContent = origin === 'form' ? 'לנסות שוב עם אותה הקלטה' : 'לנסות שוב';
  showStep('error');
}

/* ---------- תוצאות ---------- */

function updateSaveButton() {
  const n = found.filter((f) => f.keep).length;
  const btn = el('rec-save-btn');
  btn.disabled = n === 0;
  btn.textContent = n === 0 ? 'לא נבחר אף רעיון' : (n === 1 ? 'לשמור רעיון אחד' : `לשמור ${n} רעיונות`);
}

function renderResults() {
  const list = el('rec-list');
  list.innerHTML = '';
  const lead = el('rec-results-lead');
  if (!found.length) {
    lead.textContent = emptyLead || 'לא מצאנו בהקלטה רעיון לתוכן. אפשר להקליט שוב ולספר על משהו שקרה עם לקוח/ה, שאלה ששאלו אותך או דעה שיש לך על התחום.';
    el('rec-save-btn').hidden = true;
    el('rec-close-results').textContent = 'סגירה';
    showStep('results');
    return;
  }
  el('rec-save-btn').hidden = false;
  el('rec-close-results').textContent = 'סגירה בלי לשמור';
  lead.textContent = found.length === 1
    ? `מצאנו רעיון אחד ${foundIn}. אפשר לערוך את הניסוח לפני השמירה.`
    : `מצאנו ${found.length} רעיונות ${foundIn}. כל הרעיונות מסומנים לשמירה, אפשר להוריד סימון או לערוך ניסוח.`;

  found.forEach((idea, i) => {
    const li = document.createElement('li');
    li.className = 'rec-item';

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = idea.keep;
    check.id = `rec-keep-${i}`;
    check.className = 'rec-check';
    check.setAttribute('aria-label', 'לשמור את הרעיון הזה');
    check.addEventListener('change', () => {
      idea.keep = check.checked;
      li.classList.toggle('rec-item--off', !check.checked);
      updateSaveButton();
    });

    const body = document.createElement('div');
    body.className = 'rec-item__body';

    const title = document.createElement('textarea');
    title.className = 'rec-item__title';
    title.value = idea.title;
    title.rows = 2;
    title.setAttribute('aria-label', 'ניסוח הרעיון');
    title.addEventListener('input', () => { idea.title = title.value; });

    const meta = document.createElement('div');
    meta.className = 'rec-item__meta';
    const cat = document.createElement('span');
    cat.className = 'rec-tag';
    cat.style.setProperty('--tag', categoryColorVar(idea.category));
    cat.textContent = idea.category;
    meta.appendChild(cat);
    if (withRatings && idea.rating && idea.rating.startsWith('🔥')) {
      const hot = document.createElement('span');
      hot.className = 'rec-tag rec-tag--hot';
      hot.textContent = '🔥 חזק';
      meta.appendChild(hot);
    }

    body.appendChild(title);
    body.appendChild(meta);
    if (idea.context) {
      const ctx = document.createElement('p');
      ctx.className = 'rec-item__context';
      ctx.textContent = idea.context;
      body.appendChild(ctx);
    }

    li.appendChild(check);
    li.appendChild(body);
    list.appendChild(li);
  });
  updateSaveButton();
  showStep('results');
}

function withTimeout(promise, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => { setTimeout(() => reject(new Error('save timeout')), ms); }),
  ]);
}

let saving = false;
async function saveChosen() {
  if (saving) return;
  const ticked = found.filter((f) => f.keep);
  const chosen = ticked.filter((f) => String(f.title || '').trim());
  if (ticked.length && !chosen.length) {
    el('rec-results-lead').textContent = 'הרעיונות שסומנו ריקים. צריך לכתוב בהם משהו או להוריד את הסימון.';
    return;
  }
  if (!chosen.length) return;
  saving = true;
  const btn = el('rec-save-btn');
  btn.disabled = true;
  btn.textContent = 'שומרים...';
  let saved = 0;
  for (const idea of chosen) {
    try {
      await withTimeout(addIdea({
        title: idea.title.trim(),
        category: idea.category,
        hookText: idea.context || '',
        persuasionStage: idea.persuasionStage || '',
        audienceScope: idea.audienceScope || '',
        rating: withRatings ? (idea.rating || '') : '',
        source: saveSource,
        ...(extraFields || {}),
      }));
      idea.saved = true;
      saved += 1;
    } catch (err) {
      console.error('recorder: save failed', err);
    }
  }
  saving = false;
  const skipped = ticked.length - chosen.length;
  if (saved === chosen.length) {
    const fromOrigin = origin;
    const after = onSaved;
    closeRecorder();
    /* טופס "רעיון חדש" נסגר רק אם לא נכתב בו כלום, כדי לא למחוק טקסט בשקט */
    const typed = el('field-title');
    if (fromOrigin === 'form' && (!typed || !typed.value.trim())) closeIdeaModal();
    if (after) {
      try { after(chosen); } catch (err) { console.error('recorder: onSaved failed', err); }
    }
    const base = saved === 1 ? '✓ הרעיון נשמר' : `✓ ${saved} רעיונות נשמרו`;
    showToast(skipped ? `${base} (${skipped} ריקים לא נשמרו)` : base);
    return;
  }
  /* חלק נשמר: מה שנשמר יוצא מהרשימה, ונשאר רק מה שלא נשמר */
  found = found.filter((f) => !f.saved);
  renderResults();
  el('rec-results-lead').textContent = saved
    ? `${saved} נשמרו, ${chosen.length - saved} לא נשמרו. בדקו חיבור ונסו שוב.`
    : 'השמירה לא הצליחה. בדקו חיבור ונסו שוב.';
}

/* ---------- הכפתור בטופס הוספת רעיון ---------- */

/** מוסיף מעל תיבת "הרעיון" את כפתור ההקלטה. בדפדפן בלי הקלטה לא מוסיף כלום. */
export function wireRecorderEntry({ onCloseIdeaModal } = {}) {
  if (typeof onCloseIdeaModal === 'function') closeIdeaModal = onCloseIdeaModal;
  if (!recorderSupported()) return;
  const textarea = el('field-title');
  if (!textarea || el('rec-entry')) return;
  const entry = document.createElement('button');
  entry.type = 'button';
  entry.id = 'rec-entry';
  entry.className = 'rec-entry';
  entry.innerHTML = '<span class="rec-entry__icon" aria-hidden="true">🎙️</span>'
    + '<span class="rec-entry__text"><strong>לספר בקול ולמצוא רעיונות</strong>'
    + '<span>מה היה היום? עד 10 דקות, ומקבלים את כל הרעיונות מסווגים</span></span>';
  entry.addEventListener('click', openRecorder);
  const label = document.querySelector('label[for="field-title"]');
  (label || textarea).insertAdjacentElement('beforebegin', entry);
}

/* 07/11/2026 (ביקורת): במסך החדש (מאיה בלבד כרגע) אין דירוג. השרת עדיין
   מחזיר דירוג לכל רעיון, אבל כאן לא מציגים "🔥 חזק" ולא שומרים אותו.
   app.js מכבה את זה מאותו מתג של המסך החדש. */
let withRatings = true;
export function setRecorderRatings(on) {
  withRatings = Boolean(on);
}

/** בעריכת רעיון קיים אין טעם בהקלטה. */
export function setRecorderEntryVisible(visible) {
  const entry = el('rec-entry');
  if (entry) entry.hidden = !visible;
}
