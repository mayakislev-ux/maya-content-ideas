// 17/10/2026 (מאיה, מתוך רשימת 50 הרעיונות שבחרה - 16 מהם): שכבת ה"חוויה
// ממכרת" של העוזר ליצירת סרטון - קונפטי, מסקוט, זוויות דינמיות, ספינר
// הגרלה, אפקטי חלקיקים, טיימר, ואודיו אמביינטי. מופרד מ-video-assistant.js
// באותו דפוס כמו video-assistant-sound.js/-content.js - קובץ עם אחריות
// אחת. הפונקציות הטהורות (לוגיקה, בלי DOM) למעלה וניתנות לבדיקה; הפונקציות
// שנוגעות ב-DOM/Audio למטה, לפי אותו עיקרון כמו video-assistant-flow.js
// מול video-assistant.js.

// ===== #9: משפטי עידוד אקראיים, לעולם לא אותו אחד פעמיים ברצף =====
export const ENCOURAGEMENTS = [
  'כל הכבוד!', 'יש! ממש טוב', 'וואו, חזק', 'זהו, בדיוק ככה', 'את/ה על זה',
  'זה הולך מצוין', 'איזה יופי', 'בול בעשר', 'ישששש', 'זה נראה מעולה',
];

let lastEncouragementIndex = -1;
export function pickEncouragement() {
  if (ENCOURAGEMENTS.length <= 1) return ENCOURAGEMENTS[0];
  let idx;
  do {
    idx = Math.floor(Math.random() * ENCOURAGEMENTS.length);
  } while (idx === lastEncouragementIndex);
  lastEncouragementIndex = idx;
  return ENCOURAGEMENTS[idx];
}

// ===== #28: צבע/אווירה לפי תחום =====
const DOMAIN_THEMES = {
  'יופי וקוסמטיקה': { glow: '#ff9fd1', name: 'rose' },
  'בריאות נפשית, טיפול ורוח': { glow: '#b79bff', name: 'violet' },
  'עסקים ויזמות': { glow: '#ffd23f', name: 'gold' },
  'עיצוב, נדל"ן ואדריכלות': { glow: '#7fd8c9', name: 'teal' },
  'כושר ותזונה': { glow: '#7fff9f', name: 'mint' },
  'תוכן אישי וחיבור': { glow: '#ff8a65', name: 'coral' },
};
const DEFAULT_THEME = { glow: '#ff2ea8', name: 'default' };

export function domainTheme(domain) {
  return DOMAIN_THEMES[domain] || DEFAULT_THEME;
}

// ===== #47: "בנית תסריט תוך X דקות" =====
export function formatElapsed(ms) {
  if (!ms || ms < 0) return null;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} שניות`;
  if (seconds === 0) return `${minutes} דקות`;
  return `${minutes} דקות ו-${seconds} שניות`;
}

// ===== #10: "DNA של הסרטון" - איזה שלבים הושלמו, לציור ההליקס =====
// מחזיר רשימת שלבים ממוספרת, כל אחד עם שם קצר ו-done/current/pending,
// לפי branch+screen נוכחיים. טהור (סטייט בלבד, בלי DOM) כדי שאפשר יהיה
// לבדוק אותו ישירות.
const BRANCH_STEP_NAMES = {
  footage: ['בחירת קטע', 'בדיקת התאמה', 'מה צילמת', 'ליקוט', 'סיום'],
  reference: ['רפרנס', 'בדיקת התאמה', 'תמלול', 'הוק', 'תסריט', 'סיום'],
  'idea-search': ['רעיון', 'בדיקת התאמה', 'חיפוש רפרנס', 'תמלול', 'הוק', 'תסריט', 'סיום'],
  scratch: ['רעיון', 'בדיקת התאמה', 'שפיכת תוכן', 'הוק', 'חיזוק', 'תסריט', 'סיום'],
  idea: ['רעיון', 'בדיקת התאמה', 'פורמט', 'סיום'],
};

export function dnaSteps(branch, phaseIndex, totalPhases) {
  const names = BRANCH_STEP_NAMES[branch] || BRANCH_STEP_NAMES.idea;
  // ממפים את מספר ה"פאזות" הגלובלי (0..totalPhases-1) על פני השלבים
  // הספציפיים של המסלול, ביחסיות - מספיק לציור הליקס, לא צריך דיוק מושלם.
  const ratio = totalPhases > 1 ? phaseIndex / (totalPhases - 1) : 0;
  const currentIdx = Math.min(names.length - 1, Math.round(ratio * (names.length - 1)));
  return names.map((name, i) => ({
    name,
    status: i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'pending',
  }));
}

// ===== #7: מצב-רוח של המסקוט לפי סוג המסך =====
const CELEBRATE_SCREENS = new Set(['summary']);
const THINKING_SCREENS = new Set([
  'describe-idea', 'search-guidance', 'transcribe', 'prompt1', 'her-words', 'prompt2',
  'scratch-dump', 'scratch-hook', 'scratch-hook-reinforce', 'scratch-distill',
]);
const WINKING_SCREENS = new Set(['pulled-idea', 'pulled-reference']);

export function mascotMood(screen) {
  if (CELEBRATE_SCREENS.has(screen)) return 'celebrate';
  if (WINKING_SCREENS.has(screen)) return 'winking';
  if (THINKING_SCREENS.has(screen)) return 'thinking';
  return 'happy';
}

const MASCOT_FACES = { happy: '🙂', thinking: '🤔', winking: '😉', celebrate: '🤩' };
export function mascotFace(mood) {
  return MASCOT_FACES[mood] || MASCOT_FACES.happy;
}

// ======================================================================
// מכאן ואילך: אפקטים שנוגעים ב-DOM/Audio בפועל - לא ניתנים לבדיקה טהורה,
// באותו עיקרון כמו video-assistant-sound.js הקיים. כל פונקציה כאן בודקת
// בעצמה שהיא רצה בדפדפן אמיתי (typeof document/window) כדי ש-import של
// הקובץ הזה בבדיקות Node (video-assistant-fx.test.mjs) לא יקרוס.

const hasDom = typeof document !== 'undefined';

// ----- #2: קונפטי בסיום -----
const CONFETTI_COLORS = ['#ff2ea8', '#ffd23f', '#7fff9f', '#7fd8c9', '#b79bff', '#ffffff'];
export function burstConfetti(container) {
  if (!hasDom || !container) return;
  const n = 36;
  for (let i = 0; i < n; i++) {
    const piece = document.createElement('div');
    piece.className = 'cosmic-confetti-piece';
    const x = 50 + (Math.random() - 0.5) * 70;
    const rot = Math.random() * 360;
    const dur = 1.1 + Math.random() * 0.9;
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.left = `${x}%`;
    piece.style.background = color;
    piece.style.animationDuration = `${dur}s`;
    piece.style.transform = `rotate(${rot}deg)`;
    container.appendChild(piece);
    setTimeout(() => piece.remove(), dur * 1000 + 100);
  }
}

// ----- #12: הפיכת קלף לחשיפת רפרנס/רעיון -----
// cardEl = האלמנט שכבר מכיל את התוכן שחושף (ה-card עצמו); מוסיף קלאס
// הפיכה לרגע ואז מסיר, כך שהתוכן "נחשף" ולא רק מופיע.
export function flipReveal(cardEl) {
  if (!hasDom || !cardEl) return;
  cardEl.classList.add('cosmic-flip-reveal');
  setTimeout(() => cardEl.classList.remove('cosmic-flip-reveal'), 650);
}

// ----- #14: שובל חלקיקים אחרי האצבע/עכבר -----
let particleHandler = null;
export function startParticleTrail(container) {
  if (!hasDom || !container || particleHandler) return;
  let last = 0;
  particleHandler = (e) => {
    const now = Date.now();
    if (now - last < 60) return; // לא לייצר יותר מדי חלקיקים
    last = now;
    const rect = container.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    const dot = document.createElement('div');
    dot.className = 'cosmic-trail-dot';
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    container.appendChild(dot);
    setTimeout(() => dot.remove(), 700);
  };
  container.addEventListener('pointermove', particleHandler);
}
export function stopParticleTrail(container) {
  if (!hasDom || !container || !particleHandler) return;
  container.removeEventListener('pointermove', particleHandler);
  particleHandler = null;
}

// 18/10/2026 (מאיה: "תעיפי את המוזיקה, לא אהבתי"): רעיון #15 (אודיו
// אמביינטי) הוסר לגמרי - גם אחרי תיקון באג התנודה הקודם, היא פשוט לא
// רצתה את זה.

// ----- #1: ספינר הגרלה - מראה כמה אפשרויות "מתערבבות" לפני הנפילה על אחת -----
// 18/10/2026 (מאיה: "זה מגריל יותר מדי זמן... אמור להיות מהיר לא לעכב"):
// מספר הסיבובים היה תלוי בגודל בנק הרעיונות (candidateTexts.length * 2) -
// עם בנק אמיתי של עשרות רעיונות זה יצא שניות ארוכות של ריצוד, שהרגיש
// תקוע. קבוע עכשיו ולא תלוי בגודל הבנק: תמיד מספר קטן של סיבובים,
// מתח אמיתי בלי עיכוב אמיתי.
const SPIN_COUNT = 8;
export function spinReveal(labelEl, candidateTexts, finalText, done) {
  if (!hasDom || !labelEl) {
    if (done) done();
    return;
  }
  const spins = SPIN_COUNT;
  let i = 0;
  labelEl.classList.add('cosmic-slot-spin');
  const interval = setInterval(() => {
    labelEl.textContent = candidateTexts[i % candidateTexts.length] || finalText;
    i++;
    if (i >= spins) {
      clearInterval(interval);
      labelEl.classList.remove('cosmic-slot-spin');
      labelEl.textContent = finalText;
      if (done) done();
    }
  }, 80);
}

// ----- #37: זוכרת תחום/קהל אחרון מקומית, לתצוגה מיידית בלי לחכות לרשת -----
const LOCAL_KEY = 'va-last-domain-info';
export function cacheDomainInfoLocally(info) {
  if (!hasDom) return;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(info));
  } catch { /* פרטי/חסום - לא קריטי, זה רק קאש לתצוגה מהירה */ }
}
export function readCachedDomainInfo() {
  if (!hasDom) return null;
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
