/* 06/11/2026 (מאיה, על מוקאפ שנבנה על המסכים האמיתיים): מסך הבית עונה על
   "מה אני מצלמ/ת". בלשונה: "שיהיה למעלה אופציה להוסיף ישירות רעיון ואז
   מתחת את המיקרופון ושלוחצים נפתח הפופאפ. לא צריך פעמיים מיקרופון."

   הכרטיס הגדול במסך הבית (#home-mic-card, js/home-mic.js) נקרא עכשיו
   "אין לי רעיון?", ולחיצה עליו פותחת כאן ארבע דלתות, בסדר הזה:
     1. ממה שקרה היום / השבוע: מקליטים (אותה הקלטה במקום כמו קודם, עם
        "שאלה של היום"), או שולחים צילום מסך של שאלה (ideasFromImage).
     2. מקהל היעד: שורות מהלשונית "ניתוח קהל יעד" בקובץ (readSheetSections),
        ושורה -> 3 רעיונות (ideasFromRow). שמירה מסמנת את השורה.
     3. מהפרסונה השיווקית: אותו דבר על "פרסונה שיווקית".
     4. לשכפל רפרנס: סרטון אקראי מהמאגר בתחום, ומשם לשכפול הקיים.

   הרעיונות מוצגים ונשמרים באותו חלון של המיקרופון (js/idea-recorder.js).
   הכל מאחורי ideasRedesignFor (js/ideas-shelves.js), כלומר רק מאיה כרגע.
   כל כישלון מוצג במילים: כפתור שלא עושה כלום גרוע משגיאה. */
import { auth, functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { subjectUid, withAsUid } from './client-view.js';
import { getProfile } from './user-profile.js';
import {
  openIdeasPopup, setIdeasPopupProgress, showIdeasInPopup, showIdeasPopupError,
} from './idea-recorder.js';
import { startHomeRecording, homeMicCanRecord, setHomeMicIdleTap } from './home-mic.js';

const ideasFromImage = httpsCallable(functions, 'ideasFromImage', { timeout: 120000 });
const ideasFromRow = httpsCallable(functions, 'ideasFromRow', { timeout: 120000 });
const readSheetSections = httpsCallable(functions, 'readSheetSections', { timeout: 60000 });

/* ---------- עזרים טהורים (נבדקים) ---------- */

/* הרשימה של מאיה. שיחות מכירה הן שאלה אחת כאן, לא קטגוריה נפרדת. */
export const DAILY_PROMPTS = [
  'שיחה מעניינת שהייתה לכם עם חבר / משפחה / לקוח',
  'מחשבה שעלתה לכם במהלך היום',
  'משהו שקרה לכם בעסק',
  'סיטואציה שנתקלתם בה',
  'סרטון שראיתם וגרם לכם לרצות להגיב או להגיד משהו',
  'משהו שקרה לכם ופתאום התחבר למסרים שלכם',
  'מה לקוח/ה אמר/ה בשיחת מכירה',
];

/** השאלה של היום: מתחלפת כל יום (לפי התאריך המקומי), אותה שאלה כל היום. */
export function promptOfDay(date = new Date()) {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  return DAILY_PROMPTS[((day % DAILY_PROMPTS.length) + DAILY_PROMPTS.length) % DAILY_PROMPTS.length];
}

export const ROW_SHOWN_CHARS = 300;

/** טקסט קצר לתצוגה. השורה המלאה נשלחת לשרת ונשמרת. */
export function shortRowText(text, max = ROW_SHOWN_CHARS) {
  const t = String(text || '').trim();
  return t.length > max ? `${t.slice(0, max - 1).trim()}…` : t;
}

/** שורות -> [{ text, done }]. done = כבר יש רעיון ששמור עם sourceRow הזה. */
export function rowsWithMarks(rows, ideas, savedNow = new Set()) {
  const used = new Set(savedNow);
  for (const idea of ideas || []) {
    if (idea && typeof idea.sourceRow === 'string' && idea.sourceRow) used.add(idea.sourceRow);
  }
  return (rows || []).map((text) => ({ text, done: used.has(text) }));
}

/** מאגר הרפרנסים לתחום: בתחום אם יש בו, אחרת הכל. עדיף סרטונים עם תקציר. */
export function referencePool(videos, domain, subCategory = '') {
  const all = (videos || []).filter((v) => v && v.url);
  const inDomain = domain ? all.filter((v) => v.domain === domain) : [];
  const inSub = subCategory ? inDomain.filter((v) => v.subCategory === subCategory) : [];
  const base = inSub.length ? inSub : (inDomain.length ? inDomain : all);
  const summarized = base.filter((v) => String(v.contentSummary || '').trim());
  return { list: summarized.length ? summarized : base, fallback: Boolean(domain) && !inDomain.length };
}

/** סרטון אקראי, לא אותו אחד פעמיים ברצף (כשיש יותר מאחד). */
export function pickReference(list, previousId = null, rand = Math.random) {
  if (!list || !list.length) return null;
  const options = list.length > 1 ? list.filter((v) => v.id !== previousId) : list;
  return options[Math.floor(rand() * options.length) % options.length];
}

/* מתחת ל-4MB: בקידוד base64 זה עדיין מתחת לתקרה של Claude */
export const MAX_IMAGE_BYTES = Math.floor(3.7 * 1024 * 1024);
export const MAX_IMAGE_SIDE = 1600;
const SENDABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** מידות אחרי הקטנה, כך שהצלע הארוכה עד 1600. */
export function fitSize(width, height, max = MAX_IMAGE_SIDE) {
  const k = Math.min(1, max / Math.max(width || 1, height || 1));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

function readAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new Error('לא הצלחנו לקרוא את התמונה. לבחור אותה שוב'));
    reader.readAsDataURL(blob);
  });
}

/* מקטינים ל-1600 פיקסלים ב-JPEG. בדפדפן בלי createImageBitmap שולחים כמו שהיא. */
async function downscale(file) {
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  if (bitmap.close) bitmap.close();
  const blob = await new Promise((resolve) => { canvas.toBlob(resolve, 'image/jpeg', 0.85); });
  if (!blob) return null;
  return { blob, mediaType: 'image/jpeg' };
}

/** קובץ שנבחר -> { image (base64), mediaType }, או שגיאה בעברית. */
export async function prepareImage(file) {
  if (!file) throw new Error('לא נבחרה תמונה');
  if (file.type && !file.type.startsWith('image/')) throw new Error('אפשר לבחור רק תמונה (צילום מסך)');
  let out = null;
  try {
    out = await downscale(file);
  } catch (err) {
    console.warn('no-idea: downscale failed, sending as is', err);
  }
  if (!out) {
    if (!SENDABLE_TYPES.includes(file.type)) throw new Error('את סוג התמונה הזה אי אפשר לשלוח. אפשר לצלם מסך רגיל ולנסות שוב');
    out = { blob: file, mediaType: file.type };
  }
  if (out.blob.size > MAX_IMAGE_BYTES) throw new Error('התמונה גדולה מדי (עד 4MB)');
  return { image: await readAsBase64(out.blob), mediaType: out.mediaType };
}

function errorText(err, fallback) {
  const msg = String((err && err.message) || '');
  return /[֐-׿]/.test(msg) ? msg : fallback;
}

/* ---------- תלויות מבחוץ (app.js) ----------
   getIdeas: כל הרעיונות של מי שבתצוגה (לסימון ✓), loadBankVideos ו-duplicate:
   אותו מאגר ואותו שכפול של מסך "מאגר להשראה" (js/inspiration-view.js). */
const deps = {
  getIdeas: () => [],
  loadBankVideos: async () => { throw new Error('המאגר לא זמין כרגע'); },
  duplicate: async () => {},
  guessDomain: async () => null,
  saveDomain: async () => {},
};

/* ---------- מצב ---------- */

const KIND = {
  audience: { tab: 'ניתוח קהל יעד', title: '👥 מקהל היעד', from: 'מהטבלה שלך', source: 'ניתוח קהל יעד' },
  persona: { tab: 'פרסונה שיווקית', title: '✨ מהפרסונה השיווקית: הבידול שלך', from: 'מהפרסונה שלך', source: 'פרסונה שיווקית' },
};

const table = { kind: null, data: null, group: 0, section: null, loading: false };
const savedNow = new Set();
let reference = null;
let requestSeq = 0;

function el(id) { return document.getElementById(id); }
function uid() { return subjectUid(auth.currentUser && auth.currentUser.uid); }
function cacheKey(kind) { return `noIdeaTable:${uid()}:${kind}`; }

function readCache(kind) {
  try {
    const v = JSON.parse(sessionStorage.getItem(cacheKey(kind)) || 'null');
    return v && Array.isArray(v.groups) ? v : null;
  } catch {
    return null;
  }
}

function writeCache(kind, data) {
  try { sessionStorage.setItem(cacheKey(kind), JSON.stringify(data)); } catch { /* בלי אחסון פשוט קוראים שוב */ }
}

/* ---------- החלון ---------- */

function doorCard({ door, icon, title, text, tag = 'button' }) {
  const attrs = tag === 'button' ? 'type="button" ' : '';
  return `<${tag} ${attrs}class="home-mic-card no-idea-door" data-door="${door}">
    <span class="home-mic-card__mic no-idea-door__icon" aria-hidden="true">${icon}</span>
    <span class="home-mic-card__title no-idea-door__title">${title}</span>
    <span class="home-mic-card__text no-idea-door__text"${door === 'today' ? ' id="no-idea-prompt"' : ''}>${text}</span>`;
}

function ensureModal() {
  if (el('no-idea-modal')) return el('no-idea-modal');
  const modal = document.createElement('div');
  modal.id = 'no-idea-modal';
  modal.className = 'modal';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'no-idea-title');
  modal.innerHTML = `
    <div class="modal-content no-idea-content">
      <button type="button" id="no-idea-close-btn" class="modal-close-x" aria-label="סגירה">✕</button>

      <div id="no-idea-step-doors">
        <h2 id="no-idea-title" class="rec-title">אין לי רעיון?</h2>
        <p class="rec-lead rec-lead--soft">בוחרים מאיפה לשלוף רעיון לסרטון:</p>
        <div class="no-idea-doors">
          ${doorCard({ door: 'today', tag: 'div', icon: '🎙️', title: 'ממה שקרה היום / השבוע', text: '' })}
            <span class="no-idea-door__actions">
              <button type="button" id="no-idea-record" class="btn-primary no-idea-door__btn">🎙️ לספר בקול</button>
              <button type="button" id="no-idea-shot" class="no-idea-soft-btn no-idea-door__btn">📷 שאלה שראיתי ברשת</button>
            </span>
            <span class="rec-lead rec-lead--soft no-idea-shot-hint">ראית שאלה בקבוצה, בתגובות או בהודעה שקיבלת? מעלים צילום מסך שלה, והיא הופכת לרעיונות לסרטון.</span>
            <input type="file" id="no-idea-shot-input" accept="image/*" hidden>
          </div>
          ${doorCard({ door: 'audience', icon: '👥', title: 'מקהל היעד', text: 'שורה מהלשונית "ניתוח קהל יעד" שלך הופכת ל-3 רעיונות' })}</button>
          ${doorCard({ door: 'persona', icon: '✨', title: 'מהפרסונה השיווקית: הבידול שלך', text: 'הסיפור, הערכים והבידול שלך, מהלשונית "פרסונה שיווקית"' })}</button>
          ${doorCard({ door: 'reference', icon: '🎬', title: 'לשכפל רפרנס', text: 'סרטון אקראי מהמאגר בתחום שלך, ומשם ישר לשכפול' })}</button>
        </div>
        <p id="no-idea-doors-status" class="home-mic-status home-mic-status--error" role="alert" hidden></p>
      </div>

      <div id="no-idea-step-table" hidden>
        <button type="button" id="no-idea-table-back" class="btn-text rec-back-btn">‹ חזרה לדלתות</button>
        <h2 id="no-idea-table-title" class="rec-title"></h2>
        <p id="no-idea-table-status" class="rec-lead" role="status" aria-live="polite"></p>
        <div id="no-idea-groups" class="quick-filter-chips no-idea-chips" role="group" aria-label="קבוצת קהל" hidden></div>
        <p id="no-idea-group-label" class="rec-hint" hidden></p>
        <div id="no-idea-sections" class="quick-filter-chips no-idea-chips" role="group" aria-label="נושא" hidden></div>
        <ul id="no-idea-rows" class="no-idea-rows"></ul>
        <div class="no-idea-table-tools">
          <button type="button" id="no-idea-retry" class="btn-primary rec-main-btn" hidden>לנסות שוב</button>
          <button type="button" id="no-idea-refresh" class="btn-text" hidden>🔄 רענון מהקובץ</button>
        </div>
      </div>

      <div id="no-idea-step-ref" hidden>
        <button type="button" id="no-idea-ref-back" class="btn-text rec-back-btn">‹ חזרה לדלתות</button>
        <h2 class="rec-title">🎬 לשכפל רפרנס</h2>
        <p id="no-idea-ref-status" class="rec-lead" role="status" aria-live="polite"></p>
        <div id="no-idea-ref-card" class="no-idea-ref" hidden>
          <div id="no-idea-ref-thumb" class="no-idea-ref__thumb"></div>
          <p id="no-idea-ref-summary" class="no-idea-ref__summary"></p>
          <a id="no-idea-ref-link" class="btn-text no-idea-ref__link" target="_blank" rel="noopener noreferrer"></a>
          <div class="no-idea-ref__actions">
            <button type="button" id="no-idea-ref-dup" class="btn-primary">🎬 לשכפל</button>
            <button type="button" id="no-idea-ref-next" class="no-idea-soft-btn">🎲 עוד אחד</button>
          </div>
        </div>
        <button type="button" id="no-idea-ref-retry" class="btn-primary rec-main-btn" hidden>לנסות שוב</button>
      </div>
    </div>`;
  const confirmEl = el('confirm-dialog');
  if (confirmEl && confirmEl.parentNode) confirmEl.parentNode.insertBefore(modal, confirmEl);
  else document.body.appendChild(modal);

  el('no-idea-close-btn').addEventListener('click', closeDoors);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeDoors(); });
  el('no-idea-record').addEventListener('click', recordToday);
  el('no-idea-shot').addEventListener('click', () => el('no-idea-shot-input').click());
  el('no-idea-shot-input').addEventListener('change', onShotChosen);
  modal.querySelectorAll('button.no-idea-door').forEach((btn) => {
    btn.addEventListener('click', () => {
      const door = btn.dataset.door;
      if (door === 'reference') openReference();
      else openTable(door);
    });
  });
  el('no-idea-table-back').addEventListener('click', () => showStep('doors'));
  el('no-idea-ref-back').addEventListener('click', () => showStep('doors'));
  el('no-idea-refresh').addEventListener('click', () => loadTable(table.kind, { fresh: true }));
  el('no-idea-retry').addEventListener('click', () => loadTable(table.kind, { fresh: true }));
  el('no-idea-ref-next').addEventListener('click', () => showReference());
  el('no-idea-ref-retry').addEventListener('click', openReference);
  el('no-idea-ref-dup').addEventListener('click', duplicateReference);
  return modal;
}

function showStep(step) {
  for (const s of ['doors', 'table', 'ref']) el(`no-idea-step-${s}`).hidden = s !== step;
  if (step === 'doors') doorsStatus('');
  const content = el('no-idea-modal').querySelector('.modal-content');
  if (content) content.scrollTop = 0;
}

function doorsStatus(text) {
  const node = el('no-idea-doors-status');
  node.textContent = text;
  node.hidden = !text;
}

/** הפופאפ של ארבע הדלתות. זה מה שלחיצה על "אין לי רעיון?" במסך הבית פותחת. */
export function openNoIdeaDoors() {
  ensureModal();
  el('no-idea-prompt').textContent = `💡 שאלה של היום: ${promptOfDay()}`;
  showStep('doors');
  el('no-idea-modal').hidden = false;
}

function closeDoors() {
  const modal = el('no-idea-modal');
  if (modal) modal.hidden = true;
}

function reopen(step) {
  ensureModal();
  el('no-idea-modal').hidden = false;
  showStep(step);
}

/* ---------- דלת 1: ממה שקרה היום ---------- */

function recordToday() {
  if (!homeMicCanRecord()) {
    doorsStatus('הקלטה קולית לא זמינה בדפדפן הזה. אפשר לכתוב בתיבה במסך הבית, או לשלוח צילום מסך');
    return;
  }
  closeDoors();
  const box = el('quick-add-input');
  if (box && box.scrollIntoView) box.scrollIntoView({ block: 'center', behavior: 'smooth' });
  startHomeRecording({ prompt: promptOfDay() });
}

const SHOT_POPUP = { title: '✨ רעיונות מצילום המסך' };

async function onShotChosen(e) {
  const input = e.target;
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  closeDoors();
  const token = ++requestSeq;
  openIdeasPopup({ ...SHOT_POPUP, progress: 'מכינים את התמונה...', back: { label: 'חזרה לדלתות', onClick: () => reopen('doors') } });
  let prepared;
  try {
    prepared = await prepareImage(file);
  } catch (err) {
    console.error('no-idea: prepare image failed', err);
    if (token === requestSeq) showIdeasPopupError(errorText(err, 'לא הצלחנו לקרוא את התמונה. לבחור אותה שוב'));
    return;
  }
  sendShot(prepared, token);
}

async function sendShot(prepared, token) {
  setIdeasPopupProgress('קוראים את צילום המסך ומוצאים בו רעיונות...');
  try {
    const res = await ideasFromImage(withAsUid(prepared));
    if (token !== requestSeq) return;
    const data = (res && res.data) || {};
    const seen = String(data.seen || '').trim();
    showIdeasInPopup(Array.isArray(data.ideas) ? data.ideas : [], {
      context: seen ? `מצילום המסך: "${shortRowText(seen, 200)}"` : '',
      where: 'בצילום המסך',
      source: 'צילום מסך',
      emptyText: seen
        ? `לא מצאנו בצילום הזה רעיון לתוכן. מה שראינו בו: "${shortRowText(seen, 200)}"`
        : 'לא מצאנו בצילום הזה רעיון לתוכן. אפשר לנסות צילום של שאלה או תגובה מהקהל.',
    });
  } catch (err) {
    console.error('no-idea: ideasFromImage failed', err);
    if (token !== requestSeq) return;
    showIdeasPopupError(errorText(err, 'לא הצלחנו לקרוא את צילום המסך הפעם.'), {
      onRetry: () => {
        const again = ++requestSeq;
        openIdeasPopup({ ...SHOT_POPUP, progress: 'קוראים את צילום המסך...', back: { label: 'חזרה לדלתות', onClick: () => reopen('doors') } });
        sendShot(prepared, again);
      },
    });
  }
}

/* ---------- דלתות 2 ו-3: הטבלה מהקובץ ---------- */

function tableStatus(text, { error = false } = {}) {
  const node = el('no-idea-table-status');
  node.textContent = text;
  node.hidden = !text;
  node.classList.toggle('home-mic-status--error', error);
  node.setAttribute('role', error ? 'alert' : 'status');
}

function openTable(kind) {
  table.kind = kind;
  table.group = 0;
  table.section = null;
  el('no-idea-table-title').textContent = KIND[kind].title;
  showStep('table');
  loadTable(kind);
}

async function loadTable(kind, { fresh = false } = {}) {
  const cached = fresh ? null : readCache(kind);
  el('no-idea-retry').hidden = true;
  if (cached) {
    table.data = cached;
    renderTable();
    return;
  }
  /* לחיצה כפולה על הדלת לא קוראת את הקובץ פעמיים */
  if (table.loading && table.loadingKind === kind && !fresh) return;
  table.loadingKind = kind;
  table.data = null;
  table.loading = true;
  el('no-idea-rows').innerHTML = '';
  el('no-idea-groups').hidden = true;
  el('no-idea-sections').hidden = true;
  el('no-idea-group-label').hidden = true;
  el('no-idea-refresh').hidden = true;
  tableStatus(`קוראים את הלשונית "${KIND[kind].tab}" מהקובץ שלך...`);
  const token = ++requestSeq;
  try {
    const res = await readSheetSections(withAsUid({ kind }));
    if (token !== requestSeq || table.kind !== kind) return;
    const data = (res && res.data) || {};
    if (!Array.isArray(data.groups) || !data.groups.length) throw new Error(`הלשונית "${KIND[kind].tab}" עוד ריקה`);
    table.data = { tab: data.tab || KIND[kind].tab, groups: data.groups, at: Date.now() };
    writeCache(kind, table.data);
    table.group = 0;
    table.section = null;
    renderTable();
  } catch (err) {
    console.error('no-idea: readSheetSections failed', err);
    if (token !== requestSeq || table.kind !== kind) return;
    const code = String((err && err.code) || '');
    tableStatus(errorText(err, 'לא הצלחנו לקרוא את הקובץ כרגע. לנסות שוב בעוד רגע'), { error: true });
    /* אין קובץ או אין לשונית: ניסיון חוזר לא יעזור עד שמשהו ישתנה בקובץ, אבל אחרי תיקון הוא כן */
    el('no-idea-retry').hidden = false;
    el('no-idea-retry').textContent = code.endsWith('not-found') || code.endsWith('failed-precondition') ? 'בדיקה מחדש בקובץ' : 'לנסות שוב';
  } finally {
    if (token === requestSeq) table.loading = false;
  }
}

function chip(label, active, onClick, title = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `quick-chip${active ? ' active' : ''}`;
  b.textContent = label;
  if (title) b.title = title;
  b.setAttribute('aria-pressed', active ? 'true' : 'false');
  b.addEventListener('click', onClick);
  return b;
}

function currentGroup() {
  const groups = (table.data && table.data.groups) || [];
  return groups[table.group] || groups[0] || null;
}

function renderTable() {
  const groups = table.data.groups;
  const group = currentGroup();
  tableStatus('');
  el('no-idea-refresh').hidden = false;

  const groupsEl = el('no-idea-groups');
  groupsEl.innerHTML = '';
  groupsEl.hidden = groups.length < 2;
  if (groups.length > 1) {
    groups.forEach((g, i) => {
      groupsEl.appendChild(chip(g.label || `קבוצה ${i + 1}`, i === table.group, () => {
        table.group = i;
        table.section = null;
        renderTable();
      }, g.header || ''));
    });
  }
  const groupLabel = el('no-idea-group-label');
  groupLabel.textContent = group && group.label ? `קבוצה: ${group.label}` : '';
  groupLabel.hidden = !(group && group.label) || groups.length > 1;

  const sections = group ? group.sections : [];
  if (!sections.some((s) => s.id === table.section)) table.section = sections.length ? sections[0].id : null;
  const sectionsEl = el('no-idea-sections');
  sectionsEl.innerHTML = '';
  sectionsEl.hidden = !sections.length;
  for (const s of sections) {
    sectionsEl.appendChild(chip(s.label, s.id === table.section, () => {
      table.section = s.id;
      renderTable();
    }, s.question || ''));
  }
  renderRows();
}

function currentSection() {
  const group = currentGroup();
  return group ? group.sections.find((s) => s.id === table.section) || null : null;
}

function renderRows() {
  const list = el('no-idea-rows');
  list.innerHTML = '';
  const section = currentSection();
  if (!section) {
    tableStatus('אין עדיין שורות בלשונית הזאת');
    return;
  }
  const rows = rowsWithMarks(section.rows, safeIdeas(), savedNow);
  for (const row of rows) {
    const li = document.createElement('li');
    li.className = `calm-card no-idea-row${row.done ? ' no-idea-row--done' : ''}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'calm-card__open no-idea-row__open';
    const title = document.createElement('p');
    title.className = 'calm-card__title no-idea-row__text';
    title.textContent = shortRowText(row.text);
    const meta = document.createElement('span');
    meta.className = 'calm-card__meta';
    const mark = document.createElement('span');
    mark.className = 'no-idea-row__mark';
    mark.textContent = row.done ? '✓ כבר יש עליה רעיון' : 'עוד אין עליה רעיון';
    meta.appendChild(mark);
    btn.append(title, meta);
    btn.addEventListener('click', () => askRow(row.text, section));
    li.appendChild(btn);
    list.appendChild(li);
  }
}

function safeIdeas() {
  try {
    return deps.getIdeas() || [];
  } catch (err) {
    console.warn('no-idea: getIdeas failed', err);
    return [];
  }
}

function backToRows() {
  reopen('table');
  if (table.data) renderTable();
}

function askRow(rowText, section) {
  const kind = table.kind;
  const group = currentGroup();
  const tab = (table.data && table.data.tab) || KIND[kind].tab;
  const popup = {
    title: '✨ רעיונות מהשורה',
    context: `${KIND[kind].from} · ${section.label}: "${shortRowText(rowText, 160)}"`,
    back: { label: 'חזרה לשורות', onClick: backToRows },
  };
  closeDoors();
  const run = () => {
    const token = ++requestSeq;
    openIdeasPopup({ ...popup, progress: 'כותבים 3 רעיונות מהשורה...' });
    ideasFromRow(withAsUid({ kind, section: section.label, row: rowText, group: (group && group.label) || '' }))
      .then((res) => {
        if (token !== requestSeq) return;
        const ideas = res && res.data && Array.isArray(res.data.ideas) ? res.data.ideas : [];
        showIdeasInPopup(ideas, {
          where: 'מהשורה',
          source: KIND[kind].source,
          extra: { sourceRow: rowText, sourceSection: section.label, sourceTab: tab },
          emptyText: 'לא יצאו רעיונות מהשורה הזאת. אפשר לחזור לשורות ולבחור שורה אחרת.',
          onSaved: () => {
            savedNow.add(rowText);
            backToRows();
          },
        });
      })
      .catch((err) => {
        console.error('no-idea: ideasFromRow failed', err);
        if (token !== requestSeq) return;
        showIdeasPopupError(errorText(err, 'לא הצלחנו לכתוב רעיונות הפעם.'), { onRetry: run });
      });
  };
  run();
}

/* ---------- דלת 4: לשכפל רפרנס ---------- */

function refStatus(text, { error = false } = {}) {
  const node = el('no-idea-ref-status');
  node.textContent = text;
  node.hidden = !text;
  node.classList.toggle('home-mic-status--error', error);
  node.setAttribute('role', error ? 'alert' : 'status');
}

async function openReference() {
  showStep('ref');
  el('no-idea-ref-card').hidden = true;
  el('no-idea-ref-retry').hidden = true;
  refStatus('שולפים רפרנס מהמאגר...');
  const token = ++requestSeq;
  try {
    const videos = await deps.loadBankVideos();
    /* 07/11/2026 (מאיה: אצל מאשה, קוסמטיקאית לאקנה, קפץ רפרנס של טניס).
       ל-63 מתוך 74 משתמשים לא היה תחום שמור, וזה נפל לכל המאגר. עכשיו:
       אין תחום שמור -> מנחשים אותו מהקובץ (כמו בעוזר לסרטון) ושומרים,
       ובתוך התחום מעדיפים את תת-הקטגוריה (למשל טיפוח עור). */
    let domain = '';
    let subCategory = '';
    try {
      const profile = await getProfile();
      domain = (profile && profile.videoAssistantDomain) || '';
      subCategory = (profile && profile.videoAssistantSubCategory) || '';
      if (!domain) {
        refStatus('מזהים את התחום שלך...');
        const guess = await deps.guessDomain();
        if (guess && guess.domain) {
          domain = guess.domain;
          subCategory = guess.subCategory || '';
          try { await deps.saveDomain(domain, subCategory); } catch (err) { console.warn('no-idea: saveDomain failed', err); }
        }
      }
    } catch (err) {
      console.warn('no-idea: domain lookup failed', err);
    }
    if (token !== requestSeq) return;
    if (!domain) {
      refStatus('לא הצלחנו לזהות את התחום שלך, אז לא נגריל רפרנס מתחום אחר. אפשר לבחור תחום בעוזר לסרטון ולנסות שוב.', { error: true });
      el('no-idea-ref-retry').hidden = false;
      return;
    }
    const pool = referencePool(videos, domain, subCategory);
    if (!pool.list.length) {
      refStatus('אין עדיין רפרנסים במאגר.', { error: true });
      return;
    }
    reference = { pool: pool.list, current: null, note: pool.fallback ? 'אין עדיין רפרנסים בתחום שלך, אז הנה אחד מכל התחומים.' : '' };
    showReference();
  } catch (err) {
    console.error('no-idea: loadBankVideos failed', err);
    if (token !== requestSeq) return;
    refStatus(errorText(err, 'לא הצלחנו לטעון את המאגר כרגע.'), { error: true });
    el('no-idea-ref-retry').hidden = false;
  }
}

const PLATFORM = { instagram: 'Instagram', tiktok: 'TikTok' };

function showReference() {
  if (!reference) return;
  const video = pickReference(reference.pool, reference.current && reference.current.id);
  reference.current = video;
  refStatus(reference.note);
  const thumb = el('no-idea-ref-thumb');
  thumb.innerHTML = '';
  if (video.thumbnailUrl) {
    const img = document.createElement('img');
    img.src = video.thumbnailUrl;
    img.alt = '';
    img.loading = 'lazy';
    thumb.appendChild(img);
  } else {
    thumb.textContent = '🎬';
  }
  el('no-idea-ref-summary').textContent = String(video.contentSummary || '').trim() || 'רפרנס מהמאגר';
  const link = el('no-idea-ref-link');
  link.href = video.url;
  link.textContent = `לצפייה ב-${PLATFORM[video.platform] || 'סרטון'} ↗`;
  el('no-idea-ref-next').hidden = reference.pool.length < 2;
  el('no-idea-ref-card').hidden = false;
}

async function duplicateReference() {
  const video = reference && reference.current;
  if (!video) return;
  closeDoors();
  try {
    await deps.duplicate(video);
  } catch (err) {
    console.error('no-idea: duplicate failed', err);
    reopen('ref');
    refStatus(errorText(err, 'לא הצלחנו לפתוח את השכפול. לנסות שוב'), { error: true });
  }
}

/* ---------- חיווט ---------- */

export function wireNoIdea(options = {}) {
  for (const k of Object.keys(deps)) {
    if (typeof options[k] === 'function') deps[k] = options[k];
  }
}

/** המתג: מסך הבית של "אין לי רעיון?" (מאיה בלבד כרגע). השאר בלי שינוי. */
export function setNoIdeaHome(on) {
  setHomeMicIdleTap(on ? openNoIdeaDoors : null);
  const card = el('home-mic-card');
  if (card) {
    if (on) card.setAttribute('aria-haspopup', 'dialog');
    else card.removeAttribute('aria-haspopup');
  }
  const widget = el('home-progress-widget');
  if (widget) widget.hidden = Boolean(on);
  const recent = document.querySelector('.home-recent-section');
  if (recent) recent.hidden = Boolean(on);
  /* 07/11/2026 (מאיה: "ההתקדמות שלי - מיותר"): הכניסה בתפריט ירדה.
     עם המסך החדש אין כניסה ל"ההתקדמות שלי", בכוונה. */
  const tab = el('tab-progress');
  if (tab) tab.hidden = true;
  if (!on) closeDoors();
}

/* לבדיקות: מה נשמר עכשיו ושינויים במצב */
export const __test = { savedNow, table, deps };
