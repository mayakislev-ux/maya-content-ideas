/* 10/11/2026 (מאיה): "אני רוצה את הדמות שלי ליד הרובוט לבניית סרטון ... נשענת
   כזה במסך ומלווה אותן, בתזוזה בכל שלב, ועושה פרצופים מותאמים".
   סבב 2 באותו יום: היא בחרה "מחבקת את הכרטיס מהצד" בסגנון המאויר (לא
   הריאליסטי), וחמישה רגעים:
     בדיקת הרעיון: כשהצ'אט אומר "ממיר", יורד גשם של שטרות והיא רוקדת
     בחירת פורמט: מחליפה אביזר לפי הפורמט (מצלמה, מיקרופון, שני כיסאות)
     מגילה: יושבת עם קפה ומהנהנת מהר יותר ככל שכותבים יותר
     מציאת הוק: זורקת חכה ושולפת את ההוק
     סיכום: קופצת עם קלאפר "אקשן!"
   בשאר המסכים היא מחבקת את הכרטיס מהצד, והיד שלה על הקצה שלו. */

export const POSES = ['hug', 'dance', 'camera', 'mic', 'chairs', 'coffee', 'fishing', 'clapper',
  'peek', 'swing', 'walk', 'backlean', 'watch', 'yawn', 'wink', 'laugh'];

/* שלב 1 מתוך 6 של "50 הרעיונות" (מאיה סימנה את כולם, 10/11/2026):
   עוטפת את הכרטיס וחיה: מציצה מעליו עם הידיים על הקצה, יושבת על הפינה
   ומנדנדת רגליים, נשענת בגב, נכנסת בהליכה, ועוברת מצד לצד בין המסכים.
   בלי פעילות: שעון אחרי דקה, פיהוק אחרי שתיים. לחיצה עליה: קריצה, צחוק
   או ריקוד. וכפתור להסתיר אותה. */
const WRITING_SCREENS = new Set(['idea-sharpen', 'type-idea', 'transcribe', 'content-basics', 'creative-packaging', 'footage-speech-sharpen', 'scratch-distill', 'prompt2']);
const SIDE_ROTATION = ['swing', 'backlean', 'hug'];
export const IDLE_FIRST_MS = 60 * 1000;
export const IDLE_SECOND_MS = 120 * 1000;
const REACTIONS = ['wink', 'laugh', 'dance'];
const HIDE_KEY = 'moach.mayaHidden';

/* עד שמאיה מאשרת את הדמות במסך האמיתי, רק היא רואה אותה. לפתוח לכולן:
   FOR_ALL = true. */
export const FOR_ALL = false;
export function mayaVisibleFor(email) {
  return FOR_ALL || String(email || '').toLowerCase() === 'mayakislev@gmail.com';
}

const MEGILLAH_SCREENS = new Set(['scratch-dump', 'her-words']);
const HOOK_SCREENS = new Set(['prompt1', 'scratch-hook']);

/** איזו תנוחה לכל מסך */
export function poseFor(screen) {
  if (screen === 'summary') return 'clapper';
  if (MEGILLAH_SCREENS.has(screen)) return 'coffee';
  if (HOOK_SCREENS.has(screen)) return 'fishing';
  if (screen === 'format-choice') return 'hug';
  if (WRITING_SCREENS.has(screen)) return 'peek';
  /* "עוברת מצד לצד": בכל מסך אחר תנוחה אחרת, קבועה לאותו מסך */
  let h = 0;
  for (const ch of String(screen || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SIDE_ROTATION[h % SIDE_ROTATION.length];
}

/** האם הדמות מוסתרת (כפתור "להסתיר את מאיה") */
export function mayaHidden() {
  try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; }
}
function setHidden(on) {
  try { localStorage.setItem(HIDE_KEY, on ? '1' : '0'); } catch { /* בלי אחסון: רק לסשן הזה */ }
  document.querySelectorAll('.va-maya').forEach((f) => { f.hidden = on; });
  const btn = document.getElementById('va-maya-toggle');
  if (btn) { btn.textContent = on ? '👩 להחזיר את מאיה' : '🙈 להסתיר את מאיה'; btn.setAttribute('aria-pressed', String(on)); }
}
function ensureToggle() {
  const bar = document.querySelector('#video-assistant-view .va-topbar-end');
  if (!bar || document.getElementById('va-maya-toggle')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'va-maya-toggle';
  btn.className = 'va-maya-toggle';
  btn.addEventListener('click', () => setHidden(!mayaHidden()));
  bar.appendChild(btn);
  setHidden(mayaHidden());
}

/* בלי פעילות: שעון, ואז פיהוק. כל פעולה מחזירה אותה לתנוחה של המסך. */
let idleTimers = [];
let basePose = 'hug';
let idleWired = false;
function clearIdle() { idleTimers.forEach(clearTimeout); idleTimers = []; }
function armIdle() {
  clearIdle();
  /* unref: בבדיקות (node) הטיימר לא מחזיק את התהליך פתוח. בדפדפן אין unref. */
  const t1 = setTimeout(() => tempPose('watch'), IDLE_FIRST_MS);
  const t2 = setTimeout(() => tempPose('yawn'), IDLE_SECOND_MS);
  [t1, t2].forEach((t) => { if (t && typeof t.unref === 'function') t.unref(); });
  idleTimers.push(t1, t2);
}
function onActivity() {
  const fig = figEl();
  if (fig && (fig.classList.contains('va-maya--watch') || fig.classList.contains('va-maya--yawn'))) setMayaPose(basePose);
  armIdle();
}
function wireIdle() {
  if (idleWired || typeof document === 'undefined') return;
  idleWired = true;
  ['keydown', 'pointerdown', 'input', 'scroll'].forEach((ev) => document.addEventListener(ev, onActivity, { passive: true, capture: true }));
}
function tempPose(pose) {
  const fig = figEl();
  if (!fig) return;
  const keep = basePose;
  setMayaPose(pose);
  basePose = keep;
}

/** האביזר לפי הפורמט שפותחים או מרחפים עליו */
export function poseForFormat(name) {
  return { 'דיבור למצלמה': 'camera', 'וויס אובר': 'mic', 'ראיון / שיחה': 'chairs' }[name] || 'hug';
}

/** מהירות ההנהון במגילה: ככל שיש יותר מילים, מהנהנת מהר יותר (שניות למחזור) */
export function nodSeconds(words) {
  const n = Math.max(0, Number(words) || 0);
  return Math.max(0.35, Math.round((2.2 - n / 70) * 100) / 100);
}

/** הצ'אט סימן את הרעיון "ממיר" (דגש 8 בתוצאה הסופית) */
export function saysConverting(reply) {
  return /כמה קרוב לכסף:\**\s*ממיר/.test(String(reply || ''));
}

const ALT = {
  hug: 'מאיה מחבקת את הכרטיס',
  dance: 'מאיה רוקדת',
  camera: 'מאיה עם מצלמה',
  mic: 'מאיה עם מיקרופון',
  chairs: 'מאיה בפינת ראיון',
  coffee: 'מאיה עם קפה, קוראת',
  fishing: 'מאיה עם חכה',
  clapper: 'מאיה קופצת עם קלאפר',
  peek: 'מאיה מציצה מעל הכרטיס',
  swing: 'מאיה יושבת על הכרטיס',
  walk: 'מאיה נכנסת',
  backlean: 'מאיה נשענת על הכרטיס',
  watch: 'מאיה מסתכלת בשעון',
  yawn: 'מאיה מפהקת',
  wink: 'מאיה קורצת',
  laugh: 'מאיה צוחקת',
};

let lastPose = null;
let preloaded = false;

function preload() {
  if (preloaded || typeof Image === 'undefined') return;
  preloaded = true;
  for (const p of POSES) { const im = new Image(); im.src = `assets/maya/maya-${p}.webp`; }
}

function figEl() {
  return typeof document === 'undefined' ? null : document.querySelector('#va-card .va-maya');
}

/** מוסיף את הדמות לכרטיס שצויר עכשיו */
export function mountMaya(card, screen) {
  if (!card || card.querySelector('.va-maya')) return;
  preload();
  const pose = poseFor(screen);
  const fig = document.createElement('div');
  fig.className = `va-maya va-maya--${pose}${lastPose && lastPose !== pose ? ' is-changing' : ''}`;
  fig.setAttribute('aria-hidden', 'true');
  const img = document.createElement('img');
  img.src = `assets/maya/maya-${pose}.webp`;
  img.alt = ALT[pose];
  img.decoding = 'async';
  img.draggable = false;
  fig.appendChild(img);
  card.appendChild(fig);
  /* נכנסת בהליכה בפעם הראשונה שהעוזר נפתח, ואז נעמדת בתנוחה של המסך */
  if (!lastPose) {
    fig.classList.add('is-entering');
    img.src = 'assets/maya/maya-walk.webp';
    setTimeout(() => {
      if (!fig.isConnected) return;
      fig.classList.remove('is-entering');
      img.src = `assets/maya/maya-${pose}.webp`;
    }, 1300);
  }
  /* לחיצה עליה: קריצה, צחוק או ריקוד, ואז חוזרת */
  img.addEventListener('click', () => {
    const r = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
    tempPose(r);
    setTimeout(() => { if (fig.isConnected) setMayaPose(basePose); }, 1800);
  });
  basePose = pose;
  fig.hidden = mayaHidden();
  ensureToggle();
  wireIdle();
  armIdle();
  /* בטלפון נשמר מקום לדמות מעל הכרטיס, רק כשהיא באמת מוצגת */
  const view = card.closest('#video-assistant-view');
  if (view) view.classList.add('has-maya');
  lastPose = pose;
}

/** מחליף תנוחה בלי לצייר את המסך מחדש (פורמט, חכה) */
export function setMayaPose(pose) {
  const fig = figEl();
  if (!fig || !POSES.includes(pose) || fig.classList.contains(`va-maya--${pose}`)) return;
  const img = fig.querySelector('img');
  fig.className = `va-maya va-maya--${pose} is-changing`;
  img.src = `assets/maya/maya-${pose}.webp`;
  img.alt = ALT[pose];
  lastPose = pose;
  basePose = pose;
}

/** מצב רגעי על הדמות: 'is-cast' (זורקת חכה), 'is-reel' (שולפת הוק) */
export function flashMaya(cls, ms = 1200) {
  const fig = figEl();
  if (!fig) return;
  fig.classList.remove(cls);
  void fig.offsetWidth;
  fig.classList.add(cls);
  setTimeout(() => fig.classList.remove(cls), ms);
}

/** הנהון במגילה לפי כמות המילים */
export function setMayaNod(words) {
  const fig = figEl();
  if (fig) fig.style.setProperty('--va-nod', `${nodSeconds(words)}s`);
}

/** "ממיר": גשם של שטרות והיא רוקדת, מעל כל מסך (גם בצ'אט). נעלם לבד. */
export function moneyDance() {
  if (typeof document === 'undefined' || document.querySelector('.va-money-show')) return;
  preload();
  const show = document.createElement('div');
  show.className = 'va-money-show';
  show.setAttribute('aria-hidden', 'true');
  const bills = Array.from({ length: 22 }, (_, i) => {
    const left = Math.round((i * 47) % 100);
    const delay = ((i * 0.13) % 1.4).toFixed(2);
    const dur = (2.2 + ((i * 0.37) % 1.4)).toFixed(2);
    return `<span class="va-bill" style="left:${left}%;animation-delay:${delay}s;animation-duration:${dur}s">💸</span>`;
  }).join('');
  show.innerHTML = `${bills}<img class="va-money-maya" src="assets/maya/maya-dance.webp" alt="">`;
  document.body.appendChild(show);
  setTimeout(() => show.remove(), 4200);
}
