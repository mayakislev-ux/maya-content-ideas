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
   בלי פעילות: שעון אחרי דקה, פיהוק אחרי שתיים. לחיצה עליה: בועה בלבד
   (בלי החלפת תנוחה). וכפתור להסתיר אותה. */
const WRITING_SCREENS = new Set(['idea-sharpen', 'type-idea', 'transcribe', 'content-basics', 'footage-speech-sharpen', 'scratch-distill', 'prompt2']);
const SIDE_ROTATION = ['swing', 'backlean', 'hug'];
export const IDLE_FIRST_MS = 60 * 1000;
export const IDLE_SECOND_MS = 120 * 1000;

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
  /* מסך הפתיחה: חיבוק, כדי שהברכה (נפנוף, חורף, מדליה...) תופיע בו */
  if (screen === 'opening') return 'hug';
  /* שלב 3: פפיון על האריזה, משקולת בחיזוק ההוק */
  if (screen === 'creative-packaging') return 'gift';
  if (screen === 'scratch-hook-reinforce') return 'dumbbell';
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
  document.querySelectorAll('.va-maya, .home-maya').forEach((f) => { f.hidden = on; });
  document.querySelectorAll('.home-capture-card .home-maya').forEach((f) => f.parentElement.classList.toggle('has-home-maya', !on));
  const view = document.getElementById('video-assistant-view');
  if (view && document.querySelector('#va-card .va-maya')) view.classList.toggle('has-maya', !on);
  const btn = document.getElementById('va-maya-toggle');
  /* 11/11/2026: בטלפון רואים רק את האייקון (המילים בתוך span), כדי שכל
     הכפתורים העליונים ייכנסו בשורה אחת */
  if (btn) {
    const label = on ? 'להחזיר את מאיה' : 'להסתיר את מאיה';
    btn.innerHTML = `${on ? '👩' : '🙈'}<span class="va-maya-toggle-txt"> ${label}</span>`;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', String(on));
  }
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
/* 11/11/2026 (סוכן בדיקה + "לא אהבתי שהיא פתאום משתנה"): השעון והפיהוק
   ירדו. הם קפצו בדיוק כשהלקוחה הלכה ל-ChatGPT או קראה, והרגישו נוזפים. */
function armIdle() {
  clearIdle();
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
  return { 'דיבור למצלמה': 'camera', 'וויס אובר': 'mic', 'ראיון / שיחה': 'chairs', 'טקסט דינמי': 'sign', 'מסך ירוק': 'greenscreen' }[name] || 'hug';
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
  /* 11/11/2026: לא טוענים מראש את כל 40 התמונות (חשוב כשזה ייפתח ללקוחות
     בסלולר). רק הריקוד של "ממיר", שמופיע בבת אחת על כל המסך. */
  const im = new Image(); im.src = 'assets/maya/maya-dance.webp';
}

function figEl() {
  return typeof document === 'undefined' ? null : document.querySelector('#va-card .va-maya');
}

/* 11/11/2026 (מאיה, סרטון מהאייפון): בטלפון ההצצה הגדולה והנדנדה כיסו את
   הכותרת ואת סרגל ההתקדמות של הכרטיס. בטלפון הן מוחלפות בדמות הקטנה
   שעומדת מעל הפינה, ולא נוגעת בתוכן. */
export function fitPose(pose, phone = isPhone()) {
  return phone && (pose === 'peek' || pose === 'swing') ? 'hug' : pose;
}
function isPhone() {
  try { return Boolean(window.matchMedia && window.matchMedia('(max-width: 960px)').matches); } catch { return false; }
}

/** מוסיף את הדמות לכרטיס שצויר עכשיו */
export function mountMaya(card, screen) {
  if (!card || card.querySelector('.va-maya')) return;
  preload();
  const pose = fitPose(poseFor(screen));
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
  /* הדהייה נמחקת אחרי 450ms, ואז האנימציה של התנוחה (הנהון, חכה, נדנוד) חוזרת */
  fig._fadeT = setTimeout(() => fig.classList.remove('is-changing'), 450);
  if (fig._fadeT && fig._fadeT.unref) fig._fadeT.unref();
  /* 10/11/2026 (מאיה: "אפקט כניסה, זה נראה לא חלק ומוזר"): הכניסה בהליכה
     ירדה. היא פשוט מופיעה ברכות (is-changing = דהייה עדינה). */
  fig.classList.add('is-changing');
  /* 10/11/2026 (מאיה: "כשלוחצים על הדמות לא אהבתי שהיא פתאום משתנה, זה
     מוזר"): לחיצה לא מחליפה תנוחה. רק בועה: ביטוי שלך, ובלחיצה כפולה בדיחה. */
  /* לחיצה כפולה מזוהה בעצמנו (באייפון dblclick לא אמין): שתי לחיצות ב-320ms */
  let clickT = null;
  let lastTap = 0;
  img.addEventListener('click', () => {
    const now = Date.now();
    clearTimeout(clickT);
    if (now - lastTap < 320) {
      lastTap = 0;
      react(null, pickJoke(), { force: true, ms: 4200 });
      return;
    }
    lastTap = now;
    clickT = setTimeout(() => {
      const list = phrasesFor(person.pronoun);
      react(null, list[Math.floor(Math.random() * list.length)], { force: true });
    }, 320);
  });
  basePose = pose;
  fig.hidden = mayaHidden();
  ensureToggle();
  wireIdle();
  wireReactions();
  armIdle();
  wireStick();
  stickToCard();
  onScreenMoment(screen);
  /* בטלפון נשמר מקום לדמות מעל הכרטיס, רק כשהיא באמת מוצגת */
  const view = card.closest('#video-assistant-view');
  if (view) view.classList.toggle('has-maya', !mayaHidden());
  lastPose = pose;
  /* בסיכום רק הקלאפר (בלי מעבר לתסריט המודפס: מאיה לא רוצה שינוי בתוך מסך) */
}

/* 10/11/2026 (מאיה, צילום מסך: "כל פעם שיורדת קצת למטה במסך המאיה לא נשארת
   צמודה לתיבה, היא זזה"). במחשב היא הייתה צמודה לתחתית החלון, אז בכרטיס קצר
   היא נשארה למטה ליד הפוטר. עכשיו התחתית שלה = התחתית של הכרטיס, ורק אם
   הכרטיס ארוך מהחלון היא נעצרת בתחתית החלון (כדי שתמיד יראו אותה). */
export function stickBottom(cardBottom, viewH, margin = 24) {
  return Math.round(viewH - Math.min(cardBottom, viewH - margin));
}
function stickToCard() {
  const fig = figEl();
  if (!fig || typeof window === 'undefined') return;
  const desktop = window.matchMedia && window.matchMedia('(min-width: 961px)').matches;
  const onCard = fig.classList.contains('va-maya--peek') || fig.classList.contains('va-maya--swing');
  if (!desktop || onCard) { fig.style.bottom = ''; return; }
  const card = fig.closest('#va-card');
  if (!card) return;
  fig.style.bottom = `${stickBottom(card.getBoundingClientRect().bottom, window.innerHeight)}px`;
}
let stickWired = false;
let stickRaf = 0;
function wireStick() {
  if (stickWired || typeof window === 'undefined') return;
  stickWired = true;
  const on = () => {
    if (stickRaf) return;
    const raf = window.requestAnimationFrame || ((f) => setTimeout(f, 16));
    stickRaf = raf(() => { stickRaf = 0; stickToCard(); });
  };
  window.addEventListener('scroll', on, { passive: true });
  window.addEventListener('resize', on, { passive: true });
  /* פתיחת פורמט או טקסט ארוך משנים את גובה הכרטיס בלי גלילה */
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(on).observe(document.body);
}

/** מחליף תנוחה בלי לצייר את המסך מחדש (פורמט, חכה) */
export function setMayaPose(pose) {
  pose = fitPose(pose);
  const fig = figEl();
  if (!fig || !POSES.includes(pose) || fig.classList.contains(`va-maya--${pose}`)) return;
  const img = fig.querySelector('img');
  /* דהייה רכה שבאמת מתחילה מחדש בכל החלפה, ואז האנימציה של התנוחה ממשיכה */
  fig.className = `va-maya va-maya--${pose}`;
  void fig.offsetWidth;
  fig.classList.add('is-changing');
  clearTimeout(fig._fadeT);
  fig._fadeT = setTimeout(() => fig.classList.remove('is-changing'), 450);
  img.src = `assets/maya/maya-${pose}.webp`;
  img.alt = ALT[pose];
  lastPose = pose;
  basePose = pose;
  syncSign(fig, pose);
  stickToCard();
}

/* שלב 3: בטקסט דינמי היא מחזיקה לוח, ועליו השורה הראשונה של הרעיון */
let signText = '';
export function signLine(text) {
  const line = String(text || '').split('\n').map((s) => s.trim()).find(Boolean) || '';
  if (!line) return 'השורה הראשונה שלך כאן';
  return line.length > 46 ? `${line.slice(0, 44).trim()}…` : line;
}
export function setSignText(text) {
  signText = signLine(text);
  const fig = figEl();
  if (fig) syncSign(fig, basePose);
}
function syncSign(fig, pose) {
  let s = fig.querySelector('.va-maya-sign');
  if (pose !== 'sign') { if (s) s.remove(); return; }
  if (!s) { s = document.createElement('span'); s.className = 'va-maya-sign'; fig.appendChild(s); }
  s.textContent = signText || signLine('');
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
  if (!fig) return;
  fig.style.setProperty('--va-nod', `${nodSeconds(words)}s`);
  /* מגילה ארוכה = כוס קפה שנייה. 11/11/2026: לא מחליפים תנוחה תוך כדי
     כתיבה (מאיה לא אוהבת שינוי פתאומי). רק בועה, פעם אחת. */
  if ((Number(words) || 0) >= LONG_MEGILLAH_WORDS && !fig._coffee2) {
    fig._coffee2 = true;
    react(null, 'מגילה רצינית! הולכת להביא עוד קפה ☕☕', { force: true });
  }
}
export const LONG_MEGILLAH_WORDS = 250;

/** "ממיר": גשם של שטרות והיא רוקדת, מעל כל מסך (גם בצ'אט). נעלם לבד. */
export function moneyDance() {
  if (typeof document === 'undefined' || document.querySelector('.va-money-show') || mayaHidden()) return;
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
  document.body.classList.add('va-stage-on');
  setTimeout(() => { show.remove(); if (!document.querySelector('.va-stage-show, .va-money-show')) document.body.classList.remove('va-stage-on'); }, 4200);
}

/* ===== שלב 3 מתוך 6: רגעי שיא (10/11/2026) =====
   בצ'אט: "חשיפה" = מגפון, "חלש" = יד על המצח (בעדינות). הגרלה מהבנק =
   כובע קוסמים. בחירת הוק = דג ענק וההוק כתוב בבועה. אלה קורים בזמן שהמסך
   מתחלף, ולכן הם על כל המסך ולא על הכרטיס (כמו גשם השטרות). */
POSES.push('think', 'megaphone', 'facepalm', 'magic', 'gift', 'sign', 'greenscreen', 'coffee2', 'bigfish', 'dumbbell', 'script');
Object.assign(ALT, {
  think: 'מאיה חושבת', megaphone: 'מאיה עם מגפון', facepalm: 'מאיה עם יד על המצח', magic: 'מאיה שולפת פתק מכובע קוסמים',
  gift: 'מאיה מגישה מתנה עם פפיון', sign: 'מאיה מחזיקה לוח', greenscreen: 'מאיה ליד מסך ירוק',
  coffee2: 'מאיה עם שתי כוסות קפה', bigfish: 'מאיה מחזיקה דג ענק', dumbbell: 'מאיה מרימה משקולת',
  script: 'מאיה מחזיקה תסריט מודפס',
});

/** מה הצ'אט כתב בשורה "כמה קרוב לכסף" */
export function closenessOf(reply) {
  const m = String(reply || '').match(/כמה קרוב לכסף:\**\s*(ממיר|חשיפה|חלש)/);
  return m ? m[1] : null;
}

export const STAGE_TEXT = {
  megaphone: 'חשיפה! כולם ישמעו את זה 📣',
  think: 'יש פה בסיס, בואו נחזק אותו 💪',
  magic: 'אברה קדברה... הנה רעיון! 🎩',
};

/** רגע שיא על כל המסך: תנוחה גדולה + בועה, נעלם לבד */
export function stageShow(pose, text, ms = 3200) {
  if (typeof document === 'undefined' || !POSES.includes(pose) || mayaHidden()) return false;
  document.querySelectorAll('.va-stage-show').forEach((el) => el.remove());
  const show = document.createElement('div');
  show.className = `va-stage-show va-stage--${pose}`;
  show.setAttribute('aria-hidden', 'true');
  const wrap = document.createElement('div');
  wrap.className = 'va-stage-fig';
  const img = document.createElement('img');
  img.src = `assets/maya/maya-${pose}.webp`;
  img.alt = '';
  wrap.appendChild(img);
  const say = text || STAGE_TEXT[pose];
  if (say) {
    const b = document.createElement('div');
    b.className = 'va-stage-bubble';
    b.textContent = say;
    wrap.appendChild(b);
  }
  show.appendChild(wrap);
  document.body.appendChild(show);
  /* בזמן רגע השיא הדמות שליד הכרטיס נעלמת, כדי שלא יהיו שתי מאיות */
  document.body.classList.add('va-stage-on');
  const t = setTimeout(() => { show.remove(); if (!document.querySelector('.va-stage-show, .va-money-show')) document.body.classList.remove('va-stage-on'); }, ms);
  if (t && typeof t.unref === 'function') t.unref();
  return true;
}

/** בחירת הוק: הדג הענק, וההוק עצמו כתוב בבועה */
export function bigFishHook(hook) {
  const h = String(hook || '').trim().split('\n')[0];
  const line = h.length > 70 ? `${h.slice(0, 68).trim()}…` : h;
  return stageShow('bigfish', line ? `🎣 ${line}` : 'איזה דג! 🎣', 3600);
}

/** תוצאה סופית בצ'אט: ממיר = שטרות, חשיפה = מגפון, חלש = יד על המצח */
export function closenessShow(reply) {
  const c = closenessOf(reply);
  if (c === 'ממיר') { moneyDance(); return c; }
  if (c === 'חשיפה') { stageShow('megaphone'); return c; }
  if (c === 'חלש') { stageShow('think'); return c; }
  return null;
}

/* ===== שלב 2 מתוך 6: מגיבה למה שכותבים (10/11/2026) =====
   מספר חדש: מצביעה "זה! הפרט הזה מוכר". מילה כללית (הרבה, תמיד, כולם):
   מרימה גבה "כמה בדיוק?". הדבקה ארוכה: מנגבת זיעה. מחיקה של הכל: מכסה
   עיניים. סיום תיבה עם 8 מילים ומעלה: מוחאת כפיים. 20 שניות בלי הקלדה
   בתיבה ריקה: "נו, מה עובר לך בראש?". הפסקה של 6 שניות בין תגובות, כדי
   שלא תקפוץ על כל אות. */
POSES.push('cover', 'sweat', 'brow', 'clap', 'point');
Object.assign(ALT, { cover: 'מאיה מכסה עיניים', sweat: 'מאיה מנגבת זיעה', brow: 'מאיה מרימה גבה', clap: 'מאיה מוחאת כפיים', point: 'מאיה מצביעה' });

const VAGUE = /(?:^|[\s,.!?])ו?(הרבה|תמיד|כולם|אף פעם|מלא|כל הזמן)(?=$|[\s,.!?])/g;
export function vagueCount(text) { return (String(text || '').match(VAGUE) || []).length; }
export function numberCount(text) { return (String(text || '').match(/\d+/g) || []).length; }
export function wordCount(text) { return String(text || '').trim().split(/\s+/).filter(Boolean).length; }
const COOLDOWN_MS = 6000;
let lastReactAt = 0;
let quietTimer = null;
const prevOf = new WeakMap();
const clappedFor = new WeakSet();

function showBubble(text, ms = 2600) {
  const fig = figEl();
  if (!fig) return;
  let b = fig.querySelector('.va-maya-bubble');
  if (!b) { b = document.createElement('div'); b.className = 'va-maya-bubble'; fig.appendChild(b); }
  b.textContent = text;
  b.classList.remove('is-on'); void b.offsetWidth; b.classList.add('is-on');
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.remove('is-on'), ms);
}

/** תגובה רגעית: תנוחה + בועה, ואז חוזרת לתנוחה של המסך */
export function react(pose, text, { force = false, ms = 2600 } = {}) {
  const now = Date.now();
  if (!force && now - lastReactAt < COOLDOWN_MS) return false;
  const fig = figEl();
  if (!fig || fig.hidden) return false;
  lastReactAt = now;
  /* 11/11/2026 (מאיה: "לא אהבתי שהיא פתאום משתנה, זה מוזר"): בתוך מסך היא
     לא מחליפה תנוחה. התגובה היא רק בועה. התנוחה מתחלפת רק בין מסכים. */
  void pose;
  if (text) showBubble(text, ms);
  return true;
}

function armQuiet(el) {
  clearTimeout(quietTimer);
  quietTimer = setTimeout(() => {
    if (el.isConnected && wordCount(el.value) < 3) react(null, 'מה עובר לך בראש? אפשר להתחיל ממילה אחת 💭');
  }, 20000);
  if (quietTimer && typeof quietTimer.unref === 'function') quietTimer.unref();
}

let reactionsWired = false;
export function wireReactions() {
  if (reactionsWired || typeof document === 'undefined') return;
  reactionsWired = true;
  const inView = (el) => el && el.closest && el.closest('#video-assistant-view') && /^(TEXTAREA|INPUT)$/.test(el.tagName) && el.type !== 'radio';
  document.addEventListener('focusin', (e) => { if (inView(e.target)) { prevOf.set(e.target, e.target.value); armQuiet(e.target); } });
  document.addEventListener('paste', (e) => {
    if (!inView(e.target)) return;
    const t = (e.clipboardData && e.clipboardData.getData('text')) || '';
    if (t.length > 400) react('sweat', 'איזה חומר! ☕', { force: true });
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!inView(el)) return;
    armQuiet(el);
    const before = prevOf.has(el) ? prevOf.get(el) : '';
    const now = el.value;
    prevOf.set(el, now);
    if (before.trim().length > 20 && !now.trim()) { react('cover', 'אני לא מסתכלת 🙈', { force: true }); return; }
    if (numberCount(now) > numberCount(before) && /\d{2,}|\d\s*(?:שקל|₪|%|שנ|חודש|ימים|לקוח|שעות|אלף|K)/.test(now)) { react('point', 'פרט מדויק, ככה מוכרים 👆'); return; }
    if (vagueCount(now) > vagueCount(before)) react('brow', 'כמה בדיוק? 🧐');
  });
  document.addEventListener('focusout', (e) => {
    const el = e.target;
    if (!inView(el) || clappedFor.has(el)) return;
    /* לחיצה על "ממשיכים": המסך מתחלף מיד, אין טעם בבועה שתיעלם */
    if (e.relatedTarget && e.relatedTarget.tagName === 'BUTTON') return;
    if (wordCount(el.value) >= 8) { clappedFor.add(el); react('clap', 'יפה! 👏'); }
  });
}

/* ===== שלב 4 מתוך 6: מדברת אלייך (10/11/2026) =====
   ברכה לפי השעה בישראל ובשם, וביטויים שלך ("יאללה", "וואווו", "תני בראש",
   "עף לי על הראש") במעבר בין מסכים, בלשון של הלקוחה (את / אתה / ניטרלי).
   הקול שלך יתווסף כשיהיו הקלטות.
   ===== שלב 5 מתוך 6: מצב רוח ומשחק =====
   תלבושת לפי עונה וחג בברכה, מדליה על רצף ימים, גביע על סרטונים שהושלמו,
   "התגעגעתי" אחרי שבוע, בדיחה בלחיצה כפולה, מחק כשמוחקים הרבה, סולם חבלים
   (בלי סולם: היא לא אוהבת שינוי פתאומי). */
POSES.push('wave', 'winter', 'summer', 'hanukkah', 'medal', 'trophy', 'missyou', 'dizzy', 'pencil');
Object.assign(ALT, {
  wave: 'מאיה מנפנפת לשלום', winter: 'מאיה בבגדי חורף עם שוקו', summer: 'מאיה בבגדי קיץ עם אייס קפה',
  hanukkah: 'מאיה עם סופגנייה וסביבון', medal: 'מאיה עם מדליה', trophy: 'מאיה מרימה גביע',
  missyou: 'מאיה פותחת ידיים לחיבוק', dizzy: 'מאיה מסוחררת', pencil: 'מאיה עם עיפרון ומחק',
  ladder: 'מאיה יורדת בסולם חבלים',
});

let person = { first: '', pronoun: '' };
/** הפרופיל של מי שמשתמשת (נקרא מהעוזר) */
export function setMayaPerson(profile) {
  const p = profile || {};
  person = { first: String(p.name || '').trim().split(/\s+/)[0] || '', pronoun: p.pronoun || '' };
}

/** השעה בישראל (0-23), לא לפי השעון של המחשב */
export function israelHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hourCycle: 'h23' }).format(date));
}
/** התאריך בישראל YYYY-MM-DD */
export function israelDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t) => (parts.find((p) => p.type === t) || {}).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const HANUKKAH = [['2026-12-04', '2026-12-12'], ['2027-12-24', '2028-01-01'], ['2028-12-12', '2028-12-20']];
/** עונה או חג לברכה: hanukkah / winter / summer / null */
export function seasonPose(day) {
  if (HANUKKAH.some(([a, b]) => day >= a && day <= b)) return 'hanukkah';
  const md = day.slice(5);
  if (md >= '11-15' || md <= '02-28') return 'winter';
  if (md >= '06-01' && md <= '09-15') return 'summer';
  return null;
}

/** ברכה לפי שעה */
export function greetingText(hour, first) {
  const name = first ? `, ${first}` : '';
  if (hour >= 5 && hour < 12) return `בוקר טוב${name}! ☀️ יאללה, בונים סרטון`;
  if (hour >= 12 && hour < 17) return `צהריים טובים${name}! 😎 יאללה, בונים סרטון`;
  if (hour >= 17 && hour < 22) return `ערב טוב${name}! 🌆 עוד סרטון אחד לפני שנגמר היום?`;
  return `מה, עוד לא ישנים${name}? 🌙 סרטון לפני השינה? אני בפנים`;
}
const SEASON_LINE = { hanukkah: 'חנוכה שמח! 🍩', winter: 'קר בחוץ, חם פה 🧣', summer: 'חם בחוץ, אז מצלמים בפנים 😎' };

/** ביטויים שלך, לפי הלשון של הלקוחה */
export function phrasesFor(pronoun) {
  const all = ['יאללה, ממשיכים! 🚀', 'וואווו, זה הולך לעוף ✨', 'זה עף לי על הראש 🤯', 'זה הולך להתפוצץ 💥'];
  if (pronoun === 'את') return [...all, 'אלופה! 🏆', 'תני בראש 🔥'];
  if (pronoun === 'אתה') return [...all, 'אלוף! 🏆', 'תן בראש 🔥'];
  return all;
}

export const JOKES = [
  'הוק נכנס לבר... וכולם נשארו עד הסוף 🍸',
  'אמרתי לאלגוריתם שאני אוהבת אותו. הוא השאיר אותי על "נצפה" 🙃',
  'מה ההבדל בין תסריט טוב לתסריט מעולה? שלוש שניות ראשונות 😉',
  'סרטון בלי הוק זה כמו קפה בלי קפאין ☕',
];
let jokeI = -1;
function pickJoke() { jokeI = (jokeI + 1) % JOKES.length; return JOKES[jokeI]; }

/* ביקורים: רצף ימים, יום אחרון, כמה סרטונים הסתיימו */
const VISITS_KEY = 'moach.mayaVisits';
function readVisits() {
  try { return JSON.parse(localStorage.getItem(VISITS_KEY) || '{}') || {}; } catch { return {}; }
}
function writeVisits(v) { try { localStorage.setItem(VISITS_KEY, JSON.stringify(v)); } catch { /* בלי אחסון */ } }
function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }

/** מעדכן ביקור של היום: { v, gap, streak, isNewDay } */
export function registerVisit(prev, today) {
  const v = { ...(prev || {}) };
  if (v.last === today) return { v, gap: 0, streak: v.streak || 1, isNewDay: false };
  const gap = v.last ? daysBetween(v.last, today) : null;
  v.streak = gap === 1 ? (v.streak || 1) + 1 : 1;
  v.last = today;
  return { v, gap, streak: v.streak, isNewDay: true };
}

/** מה היא אומרת כשהעוזר נפתח: התגעגעתי > מדליה > חג/עונה > נפנוף */
export function openingMoment({ gap, streak, isNewDay, hour, day, first }) {
  if (isNewDay && gap != null && gap >= 7) return { pose: 'missyou', text: `התגעגעתי${first ? `, ${first}` : ''}! 🥹 איפה היית?` };
  if (isNewDay && streak >= 3) return { pose: 'medal', text: `${streak} ימים ברצף! מגיעה לך מדליה 🏅` };
  const season = seasonPose(day);
  if (season) return { pose: season, text: `${greetingText(hour, first)} · ${SEASON_LINE[season]}` };
  return { pose: 'wave', text: greetingText(hour, first) };
}

export const TROPHY_AT = [1, 3, 5, 10, 20, 30, 50, 75, 100];

let greeted = false;
let summaryCounted = false;
let screensSeen = 0;
let prevScreen = null;
function onScreenMoment(screen) {
  if (typeof document === 'undefined') { prevScreen = screen; return; }
  const was = prevScreen;
  prevScreen = screen;
  if (was === screen) return;
  screensSeen += 1;
  if (!greeted) {
    greeted = true;
    const now = new Date();
    const r = registerVisit(readVisits(), israelDay(now));
    writeVisits(r.v);
    /* התנוחה של הרגע (נפנוף, חורף, מדליה...) היא התנוחה שבה היא מופיעה
       לראשונה, בלי החלפה. אם המסך דורש הצצה מעל הכרטיס, רק הבועה. */
    const first = openingMoment({ ...r, hour: israelHour(now), day: israelDay(now), first: '' });
    const fig0 = figEl();
    if (fig0 && ['hug', 'backlean'].includes(poseFor(screen))) setMayaPose(first.pose);
    /* ההודעה נבנית רק כשהיא מוצגת, אחרי שהשם כבר נטען מהפרופיל */
    const t = setTimeout(() => {
      const m = openingMoment({ ...r, hour: israelHour(now), day: israelDay(now), first: person.first });
      react(null, m.text, { force: true, ms: 4200 });
    }, 900);
    if (t && t.unref) t.unref();
    return;
  }
  if (screen === 'opening') summaryCounted = false;
  if (screen === 'summary') {
    if (summaryCounted) return;
    summaryCounted = true;
    const v = readVisits();
    v.videos = (v.videos || 0) + 1;
    writeVisits(v);
    if (TROPHY_AT.includes(v.videos)) {
      const t = setTimeout(() => stageShow('trophy', v.videos === 1 ? 'התסריט הראשון שלך מוכן! 🏆' : `תסריט מספר ${v.videos}! 🏆`, 3800), 900);
      if (t && t.unref) t.unref();
    }
    return;
  }
  /* כל מסך שלישי: ביטוי שלך בבועה, בלי לשנות תנוחה */
  if (screensSeen % 3 === 0) {
    const list = phrasesFor(person.pronoun);
    const t = setTimeout(() => react(null, list[screensSeen % list.length]), 600);
    if (t && t.unref) t.unref();
  }
}

/* מחק: הרבה מחיקות ברצף */
let backs = [];
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  /* לפי אירוע ה-input ולא לפי המקש: באנדרואיד המקלדת שולחת 'Unidentified' */
  document.addEventListener('input', (e) => {
    if (e.inputType !== 'deleteContentBackward' || !e.target || !e.target.closest || !e.target.closest('#video-assistant-view')) return;
    const now = Date.now();
    backs = backs.filter((t) => now - t < 3000);
    backs.push(now);
    if (backs.length >= 15) { backs = []; react('pencil', 'מתקנים? אני עם המחק ✏️'); }
  }, true);
  /* סולם חבלים ירד (10/11/2026): מאיה לא אוהבת שהדמות משתנה פתאום. */
}

/* ===== שלב 6 מתוך 6: מחוץ לעוזר (10/11/2026) =====
   בדף הבית היא מציצה מעל הכרטיס "מה הרעיון שקפץ לך עכשיו?" ואומרת שלום
   לפי השעה. סטטית, בלי החלפות תנוחה (מאיה לא אוהבת שינוי פתאומי). */
export function mountHomeMaya(card, profile) {
  if (typeof document === 'undefined' || !card || card.querySelector('.home-maya') || mayaHidden()) return false;
  if (profile) setMayaPerson(profile);
  const fig = document.createElement('div');
  fig.className = 'home-maya';
  fig.setAttribute('aria-hidden', 'true');
  const img = document.createElement('img');
  img.src = 'assets/maya/maya-peek.webp';
  img.alt = '';
  img.decoding = 'async';
  img.draggable = false;
  fig.appendChild(img);
  const b = document.createElement('div');
  b.className = 'home-maya-bubble';
  b.textContent = homeGreeting(israelHour(), person.first);
  fig.appendChild(b);
  card.classList.add('has-home-maya');
  card.appendChild(fig);
  const t = setTimeout(() => b.classList.add('is-off'), 6000);
  if (t && t.unref) t.unref();
  return true;
}

/** ברכה לדף הבית (שם כותבים רעיונות, לא בונים סרטון) */
export function homeGreeting(hour, first) {
  const name = first ? `, ${first}` : '';
  if (hour >= 5 && hour < 12) return `בוקר טוב${name}! ☀️ איזה רעיון קפץ היום?`;
  if (hour >= 12 && hour < 17) return `צהריים טובים${name}! 😎 איזה רעיון קפץ היום?`;
  if (hour >= 17 && hour < 22) return `ערב טוב${name}! 🌆 נשאר רעיון מהיום?`;
  return `מה, עוד לא ישנים${name}? 🌙 רעיון של לילה הוא הכי טוב`;
}
