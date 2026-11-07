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
import { withAsUid } from './client-view.js';

export const MAX_SECONDS = 600;
const BUCKET = 'gs://content-ideas-becd7-story-assets';
const ideasFromRecording = httpsCallable(functions, 'ideasFromRecording', { timeout: 300000 });
const ideaAngles = httpsCallable(functions, 'ideaAngles', { timeout: 60000 });

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
/* 07/11/2026 (מאיה): "שאני לוחצת על לספר מה היה היום אז כאילו המסך קופץ
   למעלה ולא קופץ פופאפ מסודר של המיקרופון". ההקלטה של "ממה שקרה היום"
   קורית עכשיו בתוך החלון הזה: שלב 'speak' (לפני שמתחילים: שאלה של היום
   ו"💬 בחרו שאלה וענו עליה"), שלב 'live' (מיקרופון גדול, שעון, הטקסט
   נכתב בתוך החלון תוך כדי, "סיימתי" וביטול), ומשם לאותן תוצאות.
   המנוע עצמו (זיהוי דיבור / קטעים לתמלול) נשאר ב-js/home-mic.js. */
let speakStart = null;
let liveHandlers = null;
/* כל מה שנאמר, כדי שיהיה אפשר לראות אותו ולהעביר לתיבה כרעיון אחד */
let fullText = '';
const MIC_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const LIVE_EMPTY = 'מה שאומרים יופיע כאן תוך כדי דיבור';
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

const STEPS = ['intro', 'recording', 'speak', 'live', 'working', 'results', 'error'];

function showStep(step) {
  STEPS.forEach((s) => {
    const node = el(`rec-step-${s}`);
    if (node) node.hidden = s !== step;
  });
  /* באמצע הקלטה אין "חזרה": היא הייתה משאירה את המיקרופון פתוח */
  const back = el('rec-back-btn');
  if (back) back.hidden = !backAction || step === 'live';
  const content = el('recorder-modal') && el('recorder-modal').querySelector('.modal-content');
  if (content) content.scrollTop = 0;
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

      <div id="rec-step-speak" hidden>
        <p id="rec-question" class="rec-question"></p>
        <span class="rec-mic" aria-hidden="true">${MIC_SVG}</span>
        <p class="rec-lead rec-center">מספרים בקול מה היה: מה לקוח/ה שאל/ה, מה הרגיז, מה הצחיק, מה עבד. עד 10 דקות.</p>
        <button type="button" id="rec-speak-go" class="btn-primary rec-main-btn">🎙️ להתחיל להקליט</button>
        <button type="button" id="rec-questions-btn" class="no-idea-soft-btn rec-questions-btn" aria-expanded="false" aria-controls="rec-questions">💬 בחרו שאלה וענו עליה</button>
        <div id="rec-questions" class="rec-questions" hidden></div>
        <button type="button" id="rec-cancel-speak" class="btn-text rec-secondary">ביטול</button>
      </div>

      <div id="rec-step-live" hidden>
        <p id="rec-live-question" class="rec-question" hidden></p>
        <span class="rec-mic rec-mic--live" aria-hidden="true">${MIC_SVG}</span>
        <div class="rec-live">
          <span class="rec-dot" aria-hidden="true"></span>
          <span id="rec-live-clock" class="rec-clock">0:00</span>
          <span class="rec-limit">/ 10:00</span>
        </div>
        <p id="rec-live-hint" class="rec-hint rec-center" role="status" aria-live="polite"></p>
        <div id="rec-live-text" class="rec-live-text rec-live-text--empty" aria-live="polite">${LIVE_EMPTY}</div>
        <button type="button" id="rec-live-done" class="btn-primary rec-main-btn">⏹ סיימתי</button>
        <button type="button" id="rec-live-cancel" class="btn-text rec-secondary">ביטול</button>
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
        <details id="rec-transcript" class="rec-transcript" hidden>
          <summary>🗣️ כל מה שאמרת</summary>
          <p id="rec-transcript-text" class="rec-transcript__text"></p>
        </details>
        <button type="button" id="rec-to-box" class="btn-text rec-secondary" hidden>📝 להעביר את כל מה שאמרתי לתיבה, כרעיון אחד</button>
        <button type="button" id="rec-close-results" class="btn-text rec-secondary">סגירה בלי לשמור</button>
      </div>

      <div id="rec-step-error" hidden>
        <p id="rec-error-text" class="rec-lead" role="alert"></p>
        <button type="button" id="rec-retry-btn" class="btn-primary rec-main-btn">לנסות שוב עם אותה הקלטה</button>
        <button type="button" id="rec-to-box-error" class="btn-text rec-secondary" hidden>📝 להעביר את מה שאמרתי לתיבה, כרעיון אחד</button>
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
  el('rec-speak-go').addEventListener('click', () => beginSpeaking(''));
  el('rec-questions-btn').addEventListener('click', toggleQuestions);
  el('rec-cancel-speak').addEventListener('click', closeRecorder);
  el('rec-live-done').addEventListener('click', () => { if (liveHandlers && liveHandlers.onDone) liveHandlers.onDone(); });
  el('rec-live-cancel').addEventListener('click', cancelLive);
  el('rec-to-box').addEventListener('click', moveTextToBox);
  el('rec-to-box-error').addEventListener('click', moveTextToBox);
  return modal;
}

/* ---------- פתיחה וסגירה ---------- */

function currentStep() {
  return STEPS.find((s) => {
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
  else if (step === 'live') cancelLive();
  else if (step === 'results') closeResultsAsking();
  else if (step === 'working') {
    /* באמצע שליחה מהטופס: לא סוגרים, התשובה בדרך. מהבית הטקסט כבר בתיבה. */
    if (origin !== 'form' && !el('rec-close-working').hidden) closeRecorder();
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
  speakStart = null;
  liveHandlers = null;
  fullText = '';
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
export function openIdeasPopup({ title = '✨ הרעיונות ממה שסיפרת', progress = '', context = '', back = null, closable = true } = {}) {
  ensureModal();
  closeRecorder();
  found = [];
  lastBlob = null;
  setOrigin('home', { title, context, back });
  /* closable: false בהקלטה בחלון, כשמה שנאמר עוד לא נמצא באף מקום אחר */
  el('rec-close-working').hidden = !closable;
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
    extra: שדות שנשמרים עם כל רעיון (sourceRow וכו'). source: שדה source בשמירה.
    text: כל מה שנאמר (מההקלטה בחלון). מוצג ב"כל מה שאמרת", ואפשר להעביר
    אותו לתיבה כרעיון אחד. רעיון יחיד בלי "quote" מקבל את כל הטקסט. */
export function showIdeasInPopup(ideas, { onSaved: done = null, emptyText = '', context = '', extra = null, source = '', where = '', text = '' } = {}) {
  if (!ideasPopupOpen()) return;
  onSaved = done;
  fullText = String(text || '').trim();
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
  if (found.length === 1 && !found[0].quote && fullText) found[0].quote = fullText;
  renderResults();
}

export function showIdeasPopupError(message, { onRetry = null, text = '' } = {}) {
  if (!ideasPopupOpen()) return;
  retryAction = onRetry;
  fullText = String(text || '').trim();
  showError(message, { canRetry: Boolean(onRetry) });
}

/* ---------- 07/11/2026: ההקלטה עצמה בתוך החלון ---------- */

/** השאלות לבחירה: [{ title, questions: [...] }]. נבנה מחדש בכל פתיחה. */
function renderQuestions(groups) {
  const box = el('rec-questions');
  box.innerHTML = '';
  for (const group of groups || []) {
    if (!group || !Array.isArray(group.questions) || !group.questions.length) continue;
    const head = document.createElement('p');
    head.className = 'rec-questions__head';
    head.textContent = group.title;
    const list = document.createElement('ul');
    list.className = 'rec-questions__list';
    for (const q of group.questions) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rec-questions__item';
      b.textContent = q;
      b.addEventListener('click', () => beginSpeaking(q));
      li.appendChild(b);
      list.appendChild(li);
    }
    box.append(head, list);
  }
  el('rec-questions-btn').hidden = !box.children.length;
}

function toggleQuestions() {
  const box = el('rec-questions');
  box.hidden = !box.hidden;
  el('rec-questions-btn').setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
}

function beginSpeaking(question) {
  const startFn = speakStart;
  if (typeof startFn !== 'function') return;
  startFn({ question: question || '' });
}

/** הפופאפ של "🎙️ לספר בקול", לפני שמתחילים. onStart({ question }) מתחיל
    את ההקלטה בתוך הלחיצה עצמה, כדי שהמיקרופון ייפתח גם באייפון. */
export function openSpeakPopup({ prompt = '', questions = [], onStart = null, back = null, title = '🎙️ ממה שקרה היום' } = {}) {
  ensureModal();
  closeRecorder();
  found = [];
  lastBlob = null;
  setOrigin('home', { title, back });
  speakStart = onStart;
  el('rec-question').textContent = prompt ? `💡 שאלה של היום: ${prompt}` : '';
  el('rec-question').hidden = !prompt;
  renderQuestions(questions);
  el('rec-questions').hidden = true;
  el('rec-questions-btn').setAttribute('aria-expanded', 'false');
  showStep('speak');
  el('recorder-modal').hidden = false;
}

/** עוברים לשלב ההקלטה באותו חלון. onDone = "סיימתי", onCancel = ביטול (אחרי אישור). */
export function showLivePopup({ question = '', onDone = null, onCancel = null, title = '🎙️ ממה שקרה היום' } = {}) {
  ensureModal();
  if (!ideasPopupOpen()) {
    closeRecorder();
    setOrigin('home', { title });
  }
  speakStart = null;
  liveHandlers = { onDone, onCancel };
  const q = el('rec-live-question');
  q.textContent = question ? `💬 ${question}` : '';
  q.hidden = !question;
  el('rec-live-clock').textContent = '0:00';
  setLiveText('');
  setLiveHint('');
  el('rec-live-done').disabled = true;
  showStep('live');
  el('recorder-modal').hidden = false;
}

function setLiveText(text) {
  const node = el('rec-live-text');
  const t = String(text || '').trim();
  node.textContent = t || LIVE_EMPTY;
  node.classList.toggle('rec-live-text--empty', !t);
  node.scrollTop = node.scrollHeight;
}

function setLiveHint(text, error = false) {
  const node = el('rec-live-hint');
  node.textContent = text || '';
  node.classList.toggle('home-mic-status--error', Boolean(error));
  node.setAttribute('role', error ? 'alert' : 'status');
}

/** עדכון שלב ההקלטה. שדה שלא הועבר נשאר כמו שהוא. ready: אפשר ללחוץ "סיימתי". */
export function setLivePopup({ clock, text, hint, error = false, ready } = {}) {
  if (!livePopupOpen()) return;
  if (clock !== undefined) el('rec-live-clock').textContent = clock;
  if (text !== undefined) setLiveText(text);
  if (hint !== undefined) setLiveHint(hint, error);
  if (ready !== undefined) el('rec-live-done').disabled = !ready;
}

export function livePopupOpen() {
  return ideasPopupOpen() && currentStep() === 'live';
}

async function cancelLive() {
  const handlers = liveHandlers;
  const ok = await confirmDialog('לבטל את ההקלטה? מה שנאמר עד עכשיו לא יישמר.', {
    okLabel: 'לבטל את ההקלטה',
    cancelLabel: 'להמשיך להקליט',
  });
  if (!ok || handlers !== liveHandlers) return;
  liveHandlers = null;
  closeRecorder();
  if (handlers && handlers.onCancel) {
    try { handlers.onCancel(); } catch (err) { console.error('recorder: cancel failed', err); }
  }
}

/* "להעביר לתיבה": כל מה שנאמר עובר לתיבת "מה הרעיון שקפץ לך עכשיו?",
   ושם שומרים אותו כרעיון אחד עם הסיווג הרגיל. מה שכבר היה בתיבה נשאר. */
function moveTextToBox() {
  const text = fullText;
  const box = el('quick-add-input');
  if (!text || !box) return;
  const before = box.value.trim();
  box.value = before ? `${before} ${text}` : text;
  box.dispatchEvent(new Event('input', { bubbles: true }));
  closeRecorder();
  try { box.focus(); } catch { /* בלי פוקוס זה עדיין בתיבה */ }
  showToast('מה שאמרת נמצא בתיבה. אפשר לערוך ולשמור כרעיון אחד');
}

function showTextTools() {
  const has = Boolean(fullText) && Boolean(el('quick-add-input'));
  el('rec-to-box').hidden = !has;
  el('rec-to-box-error').hidden = !has;
  el('rec-transcript').hidden = !fullText;
  el('rec-transcript-text').textContent = fullText;
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
  showTextTools();
  showStep('error');
}

/* ---------- תוצאות ---------- */

function updateSaveButton() {
  const n = found.filter((f) => f.keep).length;
  const btn = el('rec-save-btn');
  btn.disabled = n === 0;
  btn.textContent = n === 0 ? 'לא נבחר אף רעיון' : (n === 1 ? 'לשמור רעיון אחד' : `לשמור ${n} רעיונות`);
}

function renderResults({ keepScroll = false } = {}) {
  const list = el('rec-list');
  list.innerHTML = '';
  const lead = el('rec-results-lead');
  if (!found.length) {
    lead.textContent = emptyLead || 'לא מצאנו בהקלטה רעיון לתוכן. אפשר להקליט שוב ולספר על משהו שקרה עם לקוח/ה, שאלה ששאלו אותך או דעה שיש לך על התחום.';
    el('rec-save-btn').hidden = true;
    el('rec-close-results').textContent = 'סגירה';
    showTextTools();
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

    if (idea.angle) {
      const ang = document.createElement('span');
      ang.className = 'rec-tag rec-tag--angle';
      ang.textContent = `✨ ${idea.angle}`;
      meta.appendChild(ang);
    }

    body.appendChild(title);
    body.appendChild(meta);
    if (idea.quote) {
      /* 07/11/2026 (מאיה: "ואז אני אשכח מה אמרתי"): המילים שלה עצמה,
         והן מה שנשמר עם הרעיון. קצר פתוח מיד, ארוך בלחיצה. */
      const said = document.createElement('details');
      said.className = 'rec-item__said';
      said.open = idea.quote.length <= SAID_OPEN_CHARS;
      const sum = document.createElement('summary');
      sum.textContent = '🗣️ מה אמרת (נשמר עם הרעיון)';
      const txt = document.createElement('p');
      txt.className = 'rec-item__said-text';
      txt.textContent = idea.quote;
      said.append(sum, txt);
      body.appendChild(said);
    } else if (idea.context) {
      const ctx = document.createElement('p');
      ctx.className = 'rec-item__context';
      ctx.textContent = idea.context;
      body.appendChild(ctx);
    }
    body.appendChild(anglesBlock(idea));

    li.appendChild(check);
    li.appendChild(body);
    list.appendChild(li);
  });
  updateSaveButton();
  showTextTools();
  const content = el('recorder-modal').querySelector('.modal-content');
  const scroll = content ? content.scrollTop : 0;
  showStep('results');
  if (keepScroll && content) content.scrollTop = scroll;
}

/* ---------- 07/11/2026: "✨ עוד כיוונים לאותו רעיון" ----------
   מאיה: "החכמה היא לא כל פעם להמציא רעיון אחר אלא לקחת אותו רעיון ולהביא
   אותו דרך עוד כיוונים". אותו רעיון, 3-5 כיוונים (ideaAngles בשרת). כל
   כיוון נכנס לרשימה כרעיון משלו, עם אותן מילים שלה, או מחליף את הכותרת. */
const SAID_OPEN_CHARS = 280;

function anglesBlock(idea) {
  const wrap = document.createElement('div');
  wrap.className = 'rec-angles';
  const st = idea.anglesState || { status: 'idle' };
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-text rec-angles__btn';
  btn.textContent = st.status === 'loading' ? 'מביאים כיוונים...' : (st.status === 'error' ? '✨ לנסות שוב להביא כיוונים' : '✨ עוד כיוונים לאותו רעיון');
  btn.disabled = st.status === 'loading';
  btn.hidden = st.status === 'done';
  btn.addEventListener('click', () => loadAngles(idea));
  wrap.appendChild(btn);
  if (st.status === 'error') {
    const err = document.createElement('p');
    err.className = 'rec-angles__error';
    err.setAttribute('role', 'alert');
    err.textContent = st.error;
    wrap.appendChild(err);
  }
  if (st.status === 'done') {
    const head = document.createElement('p');
    head.className = 'rec-angles__head';
    head.textContent = '✨ אותו רעיון, עוד כיוונים:';
    const ul = document.createElement('ul');
    ul.className = 'rec-angles__list';
    for (const a of st.list) {
      const li = document.createElement('li');
      li.className = 'rec-angles__item';
      const tag = document.createElement('span');
      tag.className = 'rec-tag rec-tag--angle';
      tag.textContent = a.angle;
      const t = document.createElement('p');
      t.className = 'rec-angles__title';
      t.textContent = a.title;
      const actions = document.createElement('div');
      actions.className = 'rec-angles__actions';
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'no-idea-soft-btn rec-angles__add';
      add.textContent = a.added ? '✓ נוסף לרשימה' : '➕ להוסיף כרעיון';
      add.disabled = Boolean(a.added);
      add.addEventListener('click', () => addAngleIdea(idea, a));
      const swap = document.createElement('button');
      swap.type = 'button';
      swap.className = 'btn-text rec-angles__swap';
      swap.textContent = '↺ להחליף את הכותרת';
      swap.addEventListener('click', () => {
        idea.title = a.title;
        renderResults({ keepScroll: true });
      });
      actions.append(add, swap);
      li.append(tag, t, actions);
      ul.appendChild(li);
    }
    wrap.append(head, ul);
  }
  return wrap;
}

async function loadAngles(idea) {
  if (idea.anglesState && idea.anglesState.status === 'loading') return;
  idea.anglesState = { status: 'loading' };
  renderResults({ keepScroll: true });
  const question = (extraFields && extraFields.sourceQuestion) || '';
  try {
    const res = await ideaAngles(withAsUid({
      title: String(idea.title || '').trim(),
      quote: String(idea.quote || idea.context || '').slice(0, 6000),
      ...(question ? { question } : {}),
    }));
    const list = res && res.data && Array.isArray(res.data.angles) ? res.data.angles : [];
    if (!list.length) throw new Error('לא יצאו כיוונים הפעם. לנסות שוב בעוד רגע');
    idea.anglesState = { status: 'done', list: list.map((a) => ({ angle: String(a.angle || ''), title: String(a.title || '') })).filter((a) => a.title) };
  } catch (err) {
    console.error('recorder: ideaAngles failed', err);
    const msg = String((err && err.message) || '');
    idea.anglesState = { status: 'error', error: /[֐-׿]/.test(msg) ? msg : 'לא הצלחנו להביא כיוונים הפעם. לנסות שוב בעוד רגע' };
  }
  if (ideasPopupOpen() && currentStep() === 'results' && found.includes(idea)) renderResults({ keepScroll: true });
}

function addAngleIdea(idea, a) {
  if (a.added) return;
  a.added = true;
  const at = found.indexOf(idea);
  const copy = {
    title: a.title,
    angle: a.angle,
    quote: idea.quote || '',
    context: idea.context || '',
    category: idea.category,
    persuasionStage: idea.persuasionStage || '',
    audienceScope: idea.audienceScope || '',
    rating: idea.rating || '',
    keep: true,
  };
  found.splice(at < 0 ? found.length : at + 1, 0, copy);
  renderResults({ keepScroll: true });
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
        /* 07/11/2026: המילים שלה עצמה כשיש (הקלטה), אחרת ההסבר כמו קודם */
        hookText: idea.quote || idea.context || '',
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
