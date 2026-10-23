// js/video-assistant.js
// 13/10/2026: "העוזר שלך ליצירת סרטון" - שכבת הכוונה, לא כלי יצירה.
// מרנדר תמיד מחדש innerHTML של #video-assistant-screen לפי ה-state הנוכחי
// של video-assistant-flow.js - מסך אחד בכל רגע, לא DOM דיפ.
//
// 16/10/2026 (מאיה, אחרי בדיקה אמיתית - 10 הערות מפורטות): מהפך מלא
// מהגרסה הקודמת. אז: "אל תשכפלי תוכן, רק תפני בלינק". עכשיו: "לא באלי
// שיהיה אף כפתור שיפתח קובץ בנפרד, הכל בפופאפים קלים ברורים ומסודרים".
// כל התוכן האמיתי (פורמטים/זוויות/פרומפטים) חי עכשיו ב-
// video-assistant-content.js. נוספו גם: כפתור חזרה אמיתי מכל מסך, 3
// כפתורי פתיחה בניסוח המדויק שלה, שער "צריך תסריט" מתוקן, בחירת פורמט
// אמיתית (לא רק אישור), פס התקדמות, תיבות צבעוניות למקום-להשלים
// בפרומפטים, תיקון הפונט (900 היה כבד מדי לטקסט רץ), ניסוח בגוף פונה
// לנשים וגברים, ומסך סיכום ברור בסוף שמראה בדיוק מה נעשה ומה נשאר.

import { INITIAL_STATE, nextStep } from './video-assistant-flow.js';
import { pickIdea, pickReference } from './video-assistant-picker.js';
import { buildDuplicationPrompt, buildReverseDuplicationPrompt, buildScriptPrompt } from './video-assistant-prompts.js';
import {
  FORMATS, SCRIPT_STRUCTURE, ANGLES,
  buildExtractionPrompt, buildHookFindingPrompt, buildHookReinforcementPrompt, buildScriptDistillationPrompt,
} from './video-assistant-content.js';
// 22/10/2026: הצ'אט "בדיקת רעיון" הקיים, ולא עותק שלו. הוא כבר מכיר את
// הסימון "זווית: X" בכותרת הרעיון, אותו סימון שתכנית התוכן סומכת עליו.
import { streamCheckIdea } from './idea-chat.js';
import { addBubble, addThinkingBubble, setBubbleText } from './chat-ui.js';
import { playReroll, playSuccess, setMuted, getMuted } from './video-assistant-sound.js';
import { embedUrlFor, embedShape } from './video-preview.js';
import { languageName } from './inspiration-readability.js';
import {
  fetchIdeas, fetchInspirationBank, getSavedDomain, guessDomain, saveDomain, saveSession, loadSession,
  extractOpeningHook,
} from './video-assistant-store.js';
import { getProfile, saveProfile } from './user-profile.js';
import { showToast } from './toast.js';
import {
  pickEncouragement, domainTheme, formatElapsed, dnaSteps,
  mascotMood, mascotFace, burstConfetti, flipReveal, startParticleTrail,
  cacheDomainInfoLocally, readCachedDomainInfo, spinReveal,
} from './video-assistant-fx.js';

const SUBCATEGORIES_BY_DOMAIN = {
  'יופי וקוסמטיקה': ['טיפול פנים', 'איפור קבוע', 'גבות', 'ריסים', 'ציפורניים', 'שיער', 'איפור', 'לייזר והסרת שיער', 'אסתטיקה רפואית', 'טיפולי גוף', 'שיזוף'],
  'בריאות נפשית, טיפול ורוח': ['פסיכולוגיה וטיפול רגשי', 'אימון אישי והתפתחות אישית', 'זוגיות ומערכות יחסים', 'הדרכת הורים ומשפחה', 'NLP ושיטות טיפול אלטרנטיביות', 'תקשור', 'נומרולוגיה', 'אסטרולוגיה', 'טארוט וקלפים'],
  'עסקים ויזמות': ['שיווק ויצירת תוכן', 'מכירות', 'ייעוץ וליווי עסקי', 'פיננסים', 'קריירה ותעסוקה', 'משאבי אנוש וגיוס', 'AI ואוטומציות לעסקים'],
  'עיצוב, נדל"ן ואדריכלות': ['תיווך נדל"ן', 'השקעות נדל"ן', 'השבחת נכסים', 'עיצוב פנים', 'אדריכלות', 'הום סטיילינג'],
  'כושר ותזונה': ['פילאטיס', 'יוגה', 'אימוני כוח וכושר', 'ריצה וסיבולת', 'דיאטניות, תזונאיות, ליווי תזונתי', 'פיזיותרפיה ושיקום', 'ציוד ספורט'],
  'תוכן אישי וחיבור': [],
};

const PHASES = ['התחלה', 'בדיקת התאמה', 'פורמט ושיטה', 'בניית התוכן', 'סיום'];
const PHASE_BY_SCREEN = {
  opening: 0, 'reference-source-choice': 0, 'idea-source-choice': 0, 'type-idea': 0, 'pulled-idea': 0, 'pulled-reference': 0,
  'relevance-check': 1,
  'footage-type-choice': 2, 'format-choice': 2, 'needs-script-check': 2, 'has-idea-choice': 2,
  transcribe: 3, prompt1: 3, 'her-words': 3, prompt2: 3, 'read-aloud': 3,
  'angle': 1, 'angle-check': 1, 'scratch-intro': 3, 'scratch-dump': 3, 'scratch-hook': 3, 'scratch-hook-reinforce': 3, 'scratch-distill': 3,
  'footage-speech-find': 3, 'footage-speech-shorten': 3, 'footage-speech-sharpen': 3, 'footage-speech-done': 3,
  'footage-visual-scan': 3, 'footage-visual-extract': 3, 'footage-visual-reframe': 3,
  'footage-visual-message': 3, 'footage-visual-story': 3,
  summary: 4,
};

let state = INITIAL_STATE;
let ideasCache = null;
let videosCache = null;
let domainInfo = null; // { domain, subCategory }
let currentPickId = null;
let sessionStartTs = null; // רעיון #47 - "בנית תוך X דקות"
/* 20/10/2026 (מאיה: "למה העוזר לא נפתח במסך הראשי, וכאילו נפתח באמצע
   כתיבה, ממש מוזר"): סשן טרי משוחזר בשקט, ולכן נראה כאילו המסך נפתח
   באמצע במקרה. מעכשיו אומרים את זה במפורש, עם כפתור להתחיל מההתחלה. */
let resumedNotice = false;

function screenEl() {
  return document.getElementById('video-assistant-screen');
}

function dispatch(action) {
  resumedNotice = false;
  state = nextStep(state, action);
  saveSession(state).catch((err) => console.error('saveSession failed:', err));
  // 17/10/2026 (מאיה: "המעבר בין המסכים עושה סחרחורת"): מעבר הפורטל (#32)
  // הוסר - render ישיר, בלי אנימציית scale/blur בין מסכים.
  render();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 16/10/2026 (מאיה: "ריבוע ברור בצבע שיהיה לה ברור איפה היא צריכה להשלים"),
// 17/10/2026 (מאיה, עם דוגמה אמיתית: "לא הקשבת לי בקטע של הפרומט... באלי
// שיהיה המודגש על הפורמט מסומן איפה ההשלמות"): לא מספיק לסמן [...] ריקים -
// כשהשדה כבר מולא בתוכן אמיתי שלה (קהל יעד, תחום, הוק וכו') צריך גם אז
// לראות בבירור איפה בדיוק שולב התוכן שלה בתוך הפרומפט הקבוע. מסמן חזותית
// גם [...] ריקים וגם כל ערך אמיתי שסופק - בלי לגעת בטקסט שמועתק בפועל
// (ה-data-copy-text נשאר נקי, רק מה שמוצג על המסך מודגש).
function highlightPlaceholders(text, values = []) {
  let html = escapeHtml(text);
  const sorted = values.filter((v) => v && v.trim()).sort((a, b) => b.length - a.length);
  for (const v of sorted) {
    const escaped = escapeHtml(v);
    html = html.split(escaped).join(`<mark>${escaped}</mark>`);
  }
  return html.replace(/\[([^\]<>]+)\]/g, (m) => (m.includes('<mark>') ? m : `<mark>${m}</mark>`));
}

// 17/10/2026 (מאיה, רעיון #6): פס התקדמות נוזלי זוהר במקום נקודות סטטיות,
// ו-#10 "DNA של הסרטון" - שרשרת הצעדים הממשיים של המסלול הנוכחי שלה
// (לא רק 5 ה"פאזות" הכלליות), כדי שתראה חזותית את הסרטון "נבנה" צעד-צעד.
function progressHtml() {
  const current = PHASE_BY_SCREEN[state.screen] ?? 0;
  const pct = Math.round(((current + 1) / PHASES.length) * 100);
  const steps = dnaSteps(state.branch || 'idea', current, PHASES.length);
  const dnaHtml = steps.map((s, i) => `
    <div class="cosmic-dna-step ${s.status}">
      <div class="cosmic-dna-step__dot"></div>
      <div class="cosmic-dna-step__label">${escapeHtml(s.name)}</div>
    </div>
    ${i < steps.length - 1 ? `<div class="cosmic-dna-step__line ${s.status === 'done' ? 'is-done' : ''}"></div>` : ''}
  `).join('');
  return `
    <div class="cosmic-progress__label">שלב ${current + 1} מתוך ${PHASES.length}: ${PHASES[current]}</div>
    <div class="cosmic-liquid-bar"><div class="cosmic-liquid-fill" style="width:${pct}%"></div></div>
    <div class="cosmic-dna-chain">${dnaHtml}</div>`;
}

function backButtonHtml() {
  return state.history.length
    ? `<button type="button" class="cosmic-back-btn" id="va-back-btn" aria-label="חזרה אחורה">←</button>`
    : '';
}

// 17/10/2026 (מאיה, רעיון #7): מסקוט קוסמי קבוע שמגיב רגשית לפי המסך -
// חי בכל cosmicCard, לא רק במסכים ספציפיים. מחזיר את אלמנט הכרטיס עצמו
// כדי שפעולות כמו flipReveal (#12) יוכלו להפעיל עליו אנימציה.
function cosmicCard(innerHtml, { showProgress = true } = {}) {
  const mood = mascotMood(state.screen);
  screenEl().innerHTML = `<div class="cosmic-card" id="va-card">
    ${resumedNotice ? `<div class="cosmic-resume-bar" style="display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;margin:0 0 12px;font-size:14px">
      <span>ממשיכים מאיפה שעצרת 👋</span>
      <button type="button" class="cosmic-btn" id="va-start-over-btn" style="padding:4px 12px;font-size:13px">להתחיל מההתחלה</button>
    </div>` : ''}
    <div class="cosmic-mascot ${mood === 'celebrate' ? 'is-celebrate' : ''}" id="va-mascot">${mascotFace(mood)}</div>
    ${backButtonHtml()}
    ${showProgress ? progressHtml() : ''}
    ${innerHtml}
  </div>`;
  const backBtn = document.getElementById('va-back-btn');
  if (backBtn) backBtn.addEventListener('click', () => dispatch({ type: 'BACK' }));
  const startOverBtn = document.getElementById('va-start-over-btn');
  if (startOverBtn) startOverBtn.addEventListener('click', () => restart());
  resetIdleTimer();
  return document.getElementById('va-card');
}

function restart() {
  dispatch({ type: 'RESTART' });
  currentPickId = null;
  sessionStartTs = Date.now();
}

// ===== #9: צליל הצלחה + משפט עידוד שלא חוזר על עצמו פעמיים ברצף =====
function celebrate() {
  playSuccess();
  showToast(pickEncouragement());
}

// ===== #28: זוהר הכרטיס לפי התחום, מופעל ברגע שהתחום ידוע =====
function applyDomainTheme(domain) {
  const theme = domainTheme(domain);
  const root = document.getElementById('video-assistant-view');
  if (root) root.style.setProperty('--cosmic-glow', theme.glow);
}

// ===== #22: מסקוט SOS שקופץ רק כשאין אינטראקציה זמן-מה, לא כפתור קבוע =====
const IDLE_MS = 25000;
const SOS_EXCLUDED_SCREENS = new Set(['opening', 'summary']);
let idleTimer = null;

function removeSos() {
  const el = document.getElementById('va-sos-mascot');
  if (el) el.remove();
}

function showSos() {
  if (document.getElementById('va-sos-mascot') || SOS_EXCLUDED_SCREENS.has(state.screen)) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'va-sos-mascot';
  btn.className = 'cosmic-sos-mascot';
  btn.textContent = '🆘 תקועים? אני כאן';
  btn.addEventListener('click', () => {
    removeSos();
    openModal(`
      <h2 style="margin-top:0">תקועים רגע?</h2>
      <p>${escapeHtml(pickEncouragement())} זה בסדר להתקדם לאט - אפשר לחזור צעד אחד אחורה, או להתחיל סרטון אחר.</p>
      <div class="cosmic-btn-row">
        ${state.history.length ? '<button type="button" class="cosmic-btn" id="va-sos-back-btn">חזרה צעד אחד אחורה</button>' : ''}
        <button type="button" class="cosmic-btn" id="va-sos-restart-btn">להתחיל סרטון אחר</button>
      </div>
    `);
    const backBtn = document.getElementById('va-sos-back-btn');
    if (backBtn) backBtn.addEventListener('click', () => { closeModal(); dispatch({ type: 'BACK' }); });
    document.getElementById('va-sos-restart-btn').addEventListener('click', () => { closeModal(); restart(); });
  });
  document.body.appendChild(btn);
}

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  removeSos();
  if (SOS_EXCLUDED_SCREENS.has(state.screen)) return;
  idleTimer = setTimeout(showSos, IDLE_MS);
}

// ===== #43: פאנל צף שמראה את התסריט/הטקסט המצטבר, בזמן אמת =====
function openModal(innerHtml) {
  const overlay = document.createElement('div');
  overlay.className = 'cosmic-modal-overlay';
  overlay.id = 'va-modal-overlay';
  overlay.innerHTML = `<div class="cosmic-modal">
    <button type="button" class="cosmic-modal-close" id="va-modal-close" aria-label="סגירה">✕</button>
    ${innerHtml}
  </div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  document.getElementById('va-modal-close').addEventListener('click', closeModal);
  return overlay;
}

function closeModal() {
  const overlay = document.getElementById('va-modal-overlay');
  if (overlay) overlay.remove();
}

// ===== מסך פתיחה: שלושת מסלולי הפתיחה, ניסוח מדויק של מאיה (16/10) =====
// 17/10/2026 (מאיה: "תעיפי את האתגר, לא אהבתי") - רעיון #8 ("אתגר היום")
// הוסר מהמסך הזה.
/* 23/10/2026 (מאיה: "שיהיה מקום שימלאו את התחום שלהן והקהל יעד העיקרי
   והמשניים שלהן - פעם אחת", ו"הבנות שקיבלו גישה רק לרפרנסים, הוא צריך
   להבין תחום וקהל יעד מסודר").

   התחום והקהל נשמרים בפרופיל מאז האונבורדינג של "בדיקת רעיון", אבל
   הצ'אט הזה חסום למנוי רפרנסים, ולכן הן מעולם לא מילאו אותו - וכל
   הפרומפטים יצאו להן בלי הקשר. כאן הן ממלאות אותו פעם אחת, מתוך הכלי
   שכן פתוח להן. מי שכבר מילאה לא רואה את המסך הזה בכלל. */
async function renderProfileSetup(onDone) {
  const profile = (await getProfile()) || {};
  cosmicCard(`
    <h2>רגע לפני שמתחילים</h2>
    <p>שתי שורות שנמלא פעם אחת, והן ייכנסו לבד לכל פרומפט שהכלי יכין. בלעדיהן ChatGPT מנחש מאיזה עולם מדובר.</p>
    <div class="cosmic-field">
      <label for="va-pf-domain">התחום שלי</label>
      <input type="text" class="cosmic-textarea" id="va-pf-domain" style="min-height:auto"
        placeholder="למשל: עיצוב גבות, שיווק, קוסמטיקה" value="${profile.business ? escapeHtml(profile.business) : ''}">
    </div>
    <div class="cosmic-field">
      <label for="va-pf-aud1">קהל היעד העיקרי</label>
      <input type="text" class="cosmic-textarea" id="va-pf-aud1" style="min-height:auto"
        placeholder="למשל: נשים 25-40 שמחפשות מעצבת גבות קבועה" value="${profile.primaryAudience ? escapeHtml(profile.primaryAudience) : ''}">
    </div>
    <div class="cosmic-field">
      <label for="va-pf-aud2">קהל יעד משני (רשות)</label>
      <input type="text" class="cosmic-textarea" id="va-pf-aud2" style="min-height:auto"
        placeholder="אם יש עוד קהל שאתן פונות אליו" value="${profile.secondaryAudience ? escapeHtml(profile.secondaryAudience) : ''}">
    </div>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-pf-save-btn">שמירה והמשך</button>
    </div>
  `, { showProgress: false });
  document.getElementById('va-pf-save-btn').addEventListener('click', async () => {
    const business = document.getElementById('va-pf-domain').value.trim();
    const primaryAudience = document.getElementById('va-pf-aud1').value.trim();
    const secondaryAudience = document.getElementById('va-pf-aud2').value.trim();
    if (!business || !primaryAudience) {
      showToast('צריך למלא את התחום ואת קהל היעד העיקרי');
      return;
    }
    await saveProfile({ business, primaryAudience, secondaryAudience: secondaryAudience || null });
    playSuccess();
    onDone();
  });
}

/** האם חסר מה שכל פרומפט צריך. מיוצא בעקיפין דרך המסך בלבד. */
function profileIncomplete(profile) {
  return !profile || !String(profile.business || '').trim() || !String(profile.primaryAudience || '').trim();
}

async function renderOpening() {
  if (profileIncomplete(await getProfile())) {
    renderProfileSetup(() => render());
    return;
  }
  cosmicCard(`
    <h2>✨ בואו ניצור סרטון</h2>
    <p>מאיפה מתחילים הפעם?</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn" id="va-reference-btn">שיטת השכפול</button>
      <button type="button" class="cosmic-btn" id="va-footage-btn">יש לי קטע שצולם</button>
      <button type="button" class="cosmic-btn" id="va-idea-btn">רעיון מ-0</button>
    </div>
  `);
  document.getElementById('va-footage-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_FOOTAGE' }));
  document.getElementById('va-reference-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_REFERENCE' }));
  document.getElementById('va-idea-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_IDEA' }));
}

// 17/10/2026 (מאיה: "צריך להיות 2 כפתורים יש לי רפרנס / אין לי רפרנס ואז
// להגריל"): מסך ביניים חדש - יש לה כבר רפרנס בראש, או שצריך למצוא לה אחד.
function renderReferenceSourceChoice() {
  cosmicCard(`
    <h2>יש לך כבר רפרנס?</h2>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn" id="va-has-ref-btn">יש לי רפרנס</button>
      <button type="button" class="cosmic-btn" id="va-pull-ref-btn">אין לי רפרנס, להגריל לי אחד</button>
    </div>
  `);
  document.getElementById('va-has-ref-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_HAS_REFERENCE' }));
  document.getElementById('va-pull-ref-btn').addEventListener('click', () => {
    currentPickId = null;
    dispatch({ type: 'CHOOSE_PULL_REFERENCE' });
  });
}

// ===== מסלול "יש לי רעיון" - איך מקבלים את הרעיון =====
// 17/10/2026 (מאיה: "פשוט יש לי רעיון שבחרתי או תמצא לי רעיון"): ניסוח
// קצר יותר, ואם אין בכלל רעיונות בבנק - הודעה ברורה שעוצרת, לא הפניה
// שקטה למסך אחר.
function refsPlan() {
  return document.body.dataset.plan === 'refs';
}

function renderIdeaSourceChoice() {
  cosmicCard(`
    <h2>מאיפה הרעיון?</h2>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn" id="va-type-idea-btn">יש לי רעיון</button>
      <button type="button" class="cosmic-btn" id="va-pull-idea-btn">תמצאו לי רעיון</button>
    </div>
  `);
  document.getElementById('va-type-idea-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_TYPE_IDEA' }));
  /* 23/10/2026: בנק הרעיונות נפתח גם למנוי רפרנסים, ולכן הכפתור חוזר
     לכולן. מי שאין לה עדיין רעיונות מקבלת את מסך "אין עדיין רעיונות". */
  document.getElementById('va-pull-idea-btn').addEventListener('click', async () => {
    if (!ideasCache) ideasCache = await fetchIdeas();
    const picked = pickIdea(ideasCache, null);
    if (!picked) {
      cosmicCard(`
        <h2>אין עדיין רעיונות שמורים</h2>
        <p>צריך קודם להוסיף רעיונות ל"בנק הרעיונות" במוח השיווקי, ואז לחזור לכאן.</p>
        <div class="cosmic-btn-row">
          <button type="button" class="cosmic-btn" id="va-ideas-back-btn">חזרה</button>
        </div>
      `);
      document.getElementById('va-ideas-back-btn').addEventListener('click', () => dispatch({ type: 'BACK' }));
      return;
    }
    currentPickId = picked.id;
    dispatch({ type: 'CHOOSE_PULL_IDEA' });
  });
}

function renderTypeIdea() {
  cosmicCard(`
    <h2>מה הרעיון?</h2>
    <textarea class="cosmic-textarea" id="va-type-idea-input" placeholder="כתוב/כתבי את הרעיון כאן..."></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-type-idea-done-btn">להמשיך</button>
    </div>
  `);
  document.getElementById('va-type-idea-done-btn').addEventListener('click', () => {
    const text = document.getElementById('va-type-idea-input').value.trim();
    if (!text) {
      showToast('צריך לכתוב את הרעיון קודם');
      return;
    }
    dispatch({ type: 'IDEA_TYPED', text });
  });
}

function renderPulledIdea() {
  const idea = ideasCache.find((i) => i.id === currentPickId);
  const card = cosmicCard(`
    <h2>🎲 הרעיון הזה</h2>
    <p style="font-size:16px;color:#fff;font-weight:600" id="va-idea-title">${escapeHtml(idea.title)}</p>
    ${idea.hookText ? `<p>${escapeHtml(idea.hookText)}</p>` : ''}
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-accept-idea-btn">אהבתי, בואו נמשיך</button>
    </div>
    <button type="button" class="cosmic-reroll-btn" id="va-reroll-idea-btn">לא אהבתי - להגריל שוב</button>
  `);
  // 17/10/2026 (רעיון #12, "הפיכת קלף"): החשיפה הראשונה של הרעיון המוגרל
  // מקבלת רגע הפיכה - לא רק מופיעה.
  flipReveal(card);
  document.getElementById('va-accept-idea-btn').addEventListener('click', () => {
    state.hook = idea.hookText || idea.title;
    state.ideaDescription = idea.hookText || idea.title;
    celebrate();
    dispatch({ type: 'ACCEPT_PICK' });
  });
  document.getElementById('va-reroll-idea-btn').addEventListener('click', () => {
    playReroll();
    const picked = pickIdea(ideasCache, currentPickId);
    const nextTitle = picked ? picked.title : idea.title;
    if (picked) currentPickId = picked.id;
    // 17/10/2026 (רעיון #1, "ספינר הגרלה"): לפני שמתיישב על הרעיון הסופי,
    // כמה רעיונות אמיתיים "מתערבבים" מהר על המסך - מתח של ממש, לא רק
    // החלפה מכנית.
    const candidates = ideasCache.filter((i) => i.title).map((i) => i.title);
    spinReveal(document.getElementById('va-idea-title'), candidates, nextTitle, () => {
      dispatch({ type: 'REROLL' });
    });
  });
}

// ===== השער המשותף: "רלוונטי לקהל היעד, או משרת את המותג?" =====
function renderRelevanceCheck() {
  cosmicCard(`
    <h2>בודקים לפני שממשיכים</h2>
    <p><strong>האם הרעיון רלוונטי לקהל היעד, או משרת את המותג?</strong></p>
    <p style="font-size:14px">
      <strong>רלוונטי לקהל היעד</strong> = תוכן שמדבר לקהל היעד הנכון.<br><br>
      <strong>משרת את המותג</strong> = תוכן שלא בהכרח מדבר ישירות על העסק או התחום, אבל כן מציג את האישיות/הערכים/תפיסת העולם שלך.
    </p>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-relevance-ok-btn">כן, זה רלוונטי/משרת את המותג</button>
    </div>
  `);
  document.getElementById('va-relevance-ok-btn').addEventListener('click', () => dispatch({ type: 'RELEVANCE_CONFIRMED' }));
}

// ===== מסלול קטע מצולם - "מה צילמת?" (18/10/2026, מאיה: עיצוב מחדש מלא
// - ליווי אמיתי ללקיטת הקטע, לא רק "כמו שהוא / להמיר") =====
// 18/10/2026 (מאיה: "תהיה למעלה ולא כזה קטן על הכפתור, שיהיה מהיר
// ונגיש") - ההסבר של כל אפשרות עבר לתוך הכפתור שלה עצמו, צמוד לכותרת -
// מבט אחד במקום לקרוא פסקה למעלה ואז להתאים אותה לכפתור למטה.
function renderFootageTypeChoice() {
  cosmicCard(`
    <h2>מה צילמת?</h2>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--option" id="va-footage-speech-btn">
        <span class="cosmic-btn__title">🎙️ קטע שיש בו דיבור</span>
        <span class="cosmic-btn__subtitle">סדנה, פודקאסט, לייב, שיחה וכו׳</span>
      </button>
      <button type="button" class="cosmic-btn cosmic-btn--option" id="va-footage-visual-btn">
        <span class="cosmic-btn__title">🎥 קטע ויזואלי</span>
        <span class="cosmic-btn__subtitle">תהליך, עבודה, תוצאה, רגע שצולם וכו׳</span>
      </button>
    </div>
  `);
  document.getElementById('va-footage-speech-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_IS_SPEECH' }));
  document.getElementById('va-footage-visual-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_IS_VISUAL' }));
}

// --- תת-ענף "יש בו דיבור" - 18/10/2026 (מאיה: "כל המטרות כאן נכונות,
// יש בלבול") - לא בחירה בין 3 מסלולים, אלא רצף אחד: קודם מוצאים רגע
// חזק, אז מקצרים אותו, ואז מחדדים אותו שיווקית. כל השלבים רלוונטיים
// לאותו קטע. גם תוקן ניסוח לגוף פונה לנשים וגברים (X/י) בכל השלבים. ---
// 19/10/2026 (מאיה: "צריך להשאיר רק את זה בלי כל החפירה לאחר מכן") -
// כל הרשימות (מה להשאיר/מה למחוק) הוסרו, נשארה רק ההוראה המקורית.
function renderFootageSpeechFind() {
  cosmicCard(`
    <h2>שלב 1: למצוא רגע חזק</h2>
    <p>לחפש משפט שיש בו דעה / הפתעה / טעות / תוצאה / ויכוח. לסמן 20–60 שניות סביבו.</p>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-speech-find-next-btn">להמשיך</button>
    </div>
  `);
  document.getElementById('va-speech-find-next-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_SPEECH_NEXT' }));
}

function renderFootageSpeechShorten() {
  cosmicCard(`
    <h2>שלב 2: לקצר</h2>
    <p>לעבור על הצ'קליסט:</p>
    <ul style="text-align:right;padding-inline-start:20px">
      <li>האם ההתחלה מעניינת תוך 2 שניות?</li>
      <li>האם אפשר למחוק את המשפט הראשון?</li>
      <li>האם יש חזרה?</li>
      <li>האם יש הסבר ארוך מדי?</li>
      <li>האם הפואנטה מגיעה מאוחר?</li>
      <li>אפשר לקצר 30% בלי לאבד משמעות?</li>
    </ul>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-speech-shorten-next-btn">להמשיך</button>
    </div>
  `);
  document.getElementById('va-speech-shorten-next-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_SPEECH_NEXT' }));
}

function renderFootageSpeechSharpen() {
  cosmicCard(`
    <h2>שלב 3: לחדד שיווקית</h2>
    <p>קטע שיווקי טוב עומד בשלושה דברים:</p>
    <ul style="text-align:right;padding-inline-start:20px;margin-bottom:14px">
      <li>יש בו אמירה אחת ברורה</li>
      <li>אפשר להבין על מה מדובר תוך 3 שניות</li>
      <li>יש בו משהו שמניע לפעולה או לתגובה</li>
    </ul>
    <p style="font-weight:700;text-align:right;margin-bottom:4px">מה לעשות:</p>
    <ul style="text-align:right;padding-inline-start:20px">
      <li>להוסיף משפט פתיחה שאומר במפורש את התועלת או הנקודה</li>
      <li>לוודא שיש בסוף מסקנה ברורה או קריאה לפעולה</li>
      <li>להוסיף טקסט על המסך שמדגיש את הנקודה המרכזית</li>
    </ul>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-speech-sharpen-next-btn">להמשיך</button>
    </div>
  `);
  document.getElementById('va-speech-sharpen-next-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_SPEECH_NEXT' }));
}

// 19/10/2026 (מאיה: "Hook → Point → Proof → End זה באנגלית ולא הבנתי") -
// הוחלף בהסבר בעברית, בדיוק לפי מה שהיא תיארה: בוחרים את ההוק הכי
// מסקרן וברור לתחילת הסרטון (גם ויזואלית), מומלץ להוסיף הוק כתוב על
// המסך כדי שיבינו את ההקשר מיד, ואז מלקטים לפי הוק ← הרחבה ← פואנטה.
function renderFootageSpeechDone() {
  const card = cosmicCard(`
    <h2>הקטע מוכן</h2>
    <p>עכשיו מלקטים את הקטע שיווקית: לבחור את ההוק הכי מסקרן וברור לתחילת הסרטון - גם ויזואלית. מומלץ להוסיף הוק כתוב על המסך, כדי שיבינו את ההקשר מיד.</p>
    <p class="cosmic-prompt-box" style="text-align:center;font-size:17px;font-weight:700">הוק ← הרחבת הנושא ← פואנטה / סיומת</p>
    <p>כשהקטע בנוי ככה - הוא מוכן.</p>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-speech-done-btn">מוכן</button>
    </div>
  `);
  flipReveal(card);
  document.getElementById('va-speech-done-btn').addEventListener('click', () => {
    celebrate();
    dispatch({ type: 'FOOTAGE_SPEECH_DONE' });
  });
}

// --- תת-ענף "קטע ויזואלי" ---
function renderFootageVisualScan() {
  cosmicCard(`
    <h2>עוברים על כל הקטע פעם אחת</h2>
    <p>לצפות בקטע מההתחלה עד הסוף ולחפש רגע שיכול להיות מעניין גם בלי כל מה שמסביב.</p>
    <p style="font-weight:700;text-align:right;margin-bottom:4px">לחפש אחד מאלה:</p>
    <ul style="text-align:right;padding-inline-start:20px">
      <li>שאלה או תשובה טובה</li>
      <li>תגובה של לקוח</li>
      <li>רגע מפתיע / מצחיק / מסקרן</li>
      <li>משהו שמוכיח תוצאה</li>
      <li>משהו ששובר התנגדות</li>
      <li>רגע שפשוט כיף לראות</li>
    </ul>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn" id="va-visual-found-btn">מצאתי רגע ששווה להוציא</button>
      <button type="button" class="cosmic-btn" id="va-visual-notfound-btn">לא מצאתי - נהפוך את החומר לתוכן אחר</button>
    </div>
  `);
  document.getElementById('va-visual-found-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_VISUAL_FOUND_MOMENT' }));
  document.getElementById('va-visual-notfound-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_VISUAL_NO_MOMENT' }));
}

function renderFootageVisualExtract() {
  const card = cosmicCard(`
    <h2>מלקטים את הרגע</h2>
    <ul class="cosmic-summary-list">
      <li><span class="cosmic-summary-num">1</span><div>לחתוך כמה שיותר קרוב לרגע החזק</div></li>
      <li><span class="cosmic-summary-num">2</span><div>להשאיר רק מה שחייבים כדי להבין אותו</div></li>
      <li><span class="cosmic-summary-num">3</span><div>לשאול: האם צריך משפט על המסך כדי להבין למה זה מעניין?</div></li>
      <li><span class="cosmic-summary-num">4</span><div>אם כן ← לכתוב הוק קצר</div></li>
      <li><span class="cosmic-summary-num">5</span><div>להוסיף כתוביות</div></li>
      <li><span class="cosmic-summary-num">6</span><div>סיימת</div></li>
    </ul>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-visual-extract-done-btn">סיימתי</button>
    </div>
  `);
  flipReveal(card);
  document.getElementById('va-visual-extract-done-btn').addEventListener('click', () => {
    celebrate();
    dispatch({ type: 'FOOTAGE_VISUAL_EXTRACT_DONE' });
  });
}

// 18/10/2026 (מאיה: "מצאתי שאלה/התנגדות חוסם... רגע מסר וסיפור בלי עוד
// כפתור, והסבר קטן ליד... אבל לא לסגור רק לסיפורי לקוחות, זה יכול להיות
// גם משהו אישי או משקף תדמות") - צומצם לשני כפתורים בלבד, כל אחד עם
// ההסבר שלו צמוד בתוכו (כמו תיקון "מה צילמת?"), והניסוח לא מניח יותר
// שמדובר דווקא בלקוח - גם משהו אישי או כללי נכנס כאן.
function renderFootageVisualReframe() {
  cosmicCard(`
    <h2>מה החומר הזה יכול להמחיש?</h2>
    <p>לעבור רגע על הקטע ותלשאול את עצמך:</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--option" id="va-visual-msg-btn">
        <span class="cosmic-btn__title">מצאתי מסר</span>
        <span class="cosmic-btn__subtitle">מה קורה פה ששווה להסביר? שלב מקצועי, תהליך, החלטה, משהו שעשית</span>
      </button>
      <button type="button" class="cosmic-btn cosmic-btn--option" id="va-visual-story-btn">
        <span class="cosmic-btn__title">מצאתי סיפור</span>
        <span class="cosmic-btn__subtitle">יש סיפור מאחורי מה שמצולם פה? לא חייב להיות לקוח - יכול להיות משהו אישי, שינוי, תהליך, או רגע שמשקף מי אתם</span>
      </button>
    </div>
  `);
  document.getElementById('va-visual-msg-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_VISUAL_FOUND_MESSAGE' }));
  document.getElementById('va-visual-story-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_VISUAL_FOUND_STORY' }));
}

function renderFootageVisualOutcome({ title, body }) {
  cosmicCard(`
    <h2>${title}</h2>
    <p>${body}</p>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-visual-outcome-ready-btn">הבנתי, בונים</button>
    </div>
  `);
  document.getElementById('va-visual-outcome-ready-btn').addEventListener('click', () => {
    celebrate();
    dispatch({ type: 'FOOTAGE_VISUAL_READY' });
  });
}

function renderFootageVisualMessage() {
  renderFootageVisualOutcome({ title: 'בונים סביב מסר', body: 'הוק ← הסבר קצר ← הקטעים ממחישים.' });
}

function renderFootageVisualStory() {
  renderFootageVisualOutcome({ title: 'בונים סביב סיפור', body: 'לפני ← מה קרה ← תהליך ← תוצאה. החומר הופך לווויס-אובר או B-roll.' });
}

// 17/10/2026 (מאיה: "תצוגה מקדימה של הפורמט שישר ויזואלית אראה"): אין לי
// עדיין וידאו מוטמע אמיתי לכל פורמט (הקישורים החיצוניים הוצאו במפורש
// בסבב הקודם, ועדיין אין מנגנון מיזוג תמונות-ממוזערות לדוגמאות האלה) -
// פתרון כן ואמיתי: אייקון גדול וברור שמייצג חזותית את הפורמט בעין,
// לפני שפותחים בכלל לקרוא. לא תחליף לווידאו אמיתי - גילוי נאות, לא הבטחה.
const FORMAT_ICONS = {
  'דיבור למצלמה': '🎤', 'וויס אובר': '🎙️', 'ראיון / שיחה': '💬', 'תוכן ויזואלי יפה': '🎨',
  'טקסט דינמי': '🔤', 'שאלות מהתיבה בסטורי': '❓', 'סדרת תוכן': '📺', 'משחק תפקידים': '🎭',
  'פוסט קרוסלה': '🖼️', 'לוח / טאבלט': '✍️', "סטיץ' (תגובה לסרטון ויראלי)": '🔁',
  'תגובה לתגובה': '💭', 'מסך ירוק': '🟩', 'מסך חצוי': '🪟',
};

// ===== בחירת פורמט הנגשה - אקורדיון אמיתי בתוך האפליקציה (16/10) =====
function renderFormatChoice() {
  const itemsHtml = FORMATS.map((f, i) => `
    <details class="cosmic-accordion-item" data-format="${escapeHtml(f.name)}" ${state.selectedFormat === f.name ? 'open' : ''}>
      <summary><span><span class="cosmic-format-icon">${FORMAT_ICONS[f.name] || '🎬'}</span>${escapeHtml(f.name)}</span></summary>
      <div class="cosmic-accordion-body">
        <p style="margin:0">${escapeHtml(f.description)}</p>
        <button type="button" class="cosmic-pick-btn" data-pick-format="${i}">הפורמט שלי</button>
      </div>
    </details>
  `).join('');
  cosmicCard(`
    <h2>בוחרים פורמט הנגשה</h2>
    <p>לכל רעיון יכולים להתאים כמה פורמטים - לפתוח כל אחד לקרוא על מה מדובר, ולבחור את מה שהכי מרגיש נכון.</p>
    ${state.selectedFormat ? `<div class="cosmic-selected-chip">✓ נבחר: ${escapeHtml(state.selectedFormat)}</div>` : ''}
    <div class="cosmic-accordion">${itemsHtml}</div>
  `);
  screenEl().querySelectorAll('[data-pick-format]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const format = FORMATS[Number(btn.dataset.pickFormat)].name;
      celebrate();
      dispatch({ type: 'FORMAT_SELECTED', format });
    });
  });
}

// ===== "צריך תסריט או לא?" - ניסוח מתוקן (16/10)
// 18/10/2026 (מאיה: "לא מובן החלק של זה ספונטני/צולם כבר/ויזואלי") -
// "צולם כבר" לא באמת שייך למסך הזה (הוא מגיע רק ממסלול "רעיון מ-0",
// כלום עוד לא צולם) ושלושת התיוגים ביחד בכפתור אחד היו לא ברורים.
// במקום תיוגים, שאלה ישירה בגוף ראשון עם שתי תשובות ברורות. גם הוסרה
// הצביעה הוורודה האוטומטית - שתי התשובות שוות משקל. =====
function renderNeedsScriptCheck() {
  cosmicCard(`
    <h2>צריך תסריט בכלל?</h2>
    <p>לא כל תוכן צריך תסריט כתוב מראש - לפעמים עדיף לדעת את הכיוון ולדבר בספונטניות, או שהפורמט עצמו ויזואלי ולא מבוסס דיבור.</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn" id="va-needs-script-no-btn">לא, אדע מה להגיד בלי תסריט כתוב</button>
      <button type="button" class="cosmic-btn" id="va-needs-script-yes-btn">כן, אני רוצה תסריט מסודר</button>
    </div>
  `);
  document.getElementById('va-needs-script-no-btn').addEventListener('click', () => dispatch({ type: 'NEEDS_SCRIPT_NO' }));
  document.getElementById('va-needs-script-yes-btn').addEventListener('click', () => dispatch({ type: 'NEEDS_SCRIPT_YES' }));
}

// ===== בחירת שיטת הכתיבה =====
// 18/10/2026 (מאיה: "מצאתי רפרנס מתאים לשכפול הפוך" / "לא מצאתי רפרנס
// שיכול להתאים") - ניסוח מחודש, ברור יותר ממה שהיה לפני.
function renderHasIdeaChoice() {
  cosmicCard(`
    <h2>יש לך רפרנס לשכפול הפוך?</h2>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn" id="va-reverse-btn">מצאתי רפרנס מתאים לשכפול הפוך</button>
      <button type="button" class="cosmic-btn" id="va-scratch-btn">לא מצאתי רפרנס שיכול להתאים</button>
    </div>
  `);
  document.getElementById('va-reverse-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_REVERSE_DUPLICATION' }));
  document.getElementById('va-scratch-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_FROM_SCRATCH' }));
}

async function resolveDomain() {
  if (domainInfo) return domainInfo;
  const saved = await getSavedDomain();
  if (saved) {
    domainInfo = saved;
    cacheDomainInfoLocally(saved);
    applyDomainTheme(saved.domain);
    return domainInfo;
  }
  let guessed = null;
  try {
    guessed = await guessDomain();
  } catch (err) {
    console.error('guessDomain failed:', err);
  }
  // 17/10/2026 (רעיון #37, "לא ישאלו אותי שוב מה הקהל/תחום שלי"): אם גם
  // השמירה בפיירסטור וגם הניחוש נכשלו/ריקים, נופלים חזרה לקאש המקומי
  // האחרון שהצליח - עדיף על לשאול שוב מאפס.
  if (!guessed) guessed = readCachedDomainInfo();
  domainInfo = guessed || { domain: null, subCategory: null };
  applyDomainTheme(domainInfo.domain);
  return domainInfo;
}

const DOMAIN_OPTIONS = Object.keys(SUBCATEGORIES_BY_DOMAIN);

function subCategorySelectHtml(domain, selectedSub) {
  const subs = SUBCATEGORIES_BY_DOMAIN[domain] || [];
  if (!subs.length) return '<p class="muted" style="font-size:13px">(לתחום הזה אין תתי-קטגוריה)</p>';
  const opts = ['<option value="">לבחור תת-קטגוריה מדויקת</option>']
    .concat(subs.map((s) => `<option value="${s}" ${s === selectedSub ? 'selected' : ''}>${s}</option>`))
    .join('');
  return `<select id="va-subcategory-select" class="cosmic-textarea" style="min-height:auto;margin-top:10px">${opts}</select>`;
}

function renderDomainConfirm(guessedDomain, guessedSub, onConfirmed) {
  const initialDomain = guessedDomain || DOMAIN_OPTIONS[0];
  const options = DOMAIN_OPTIONS.map(
    (d) => `<option value="${d}" ${d === initialDomain ? 'selected' : ''}>${d}</option>`
  ).join('');
  cosmicCard(`
    <h2>התחום המדויק שלך</h2>
    <p>${guessedDomain ? `ניחשתי לפי הגיליון: ${escapeHtml(guessedDomain)}${guessedSub ? ' › ' + escapeHtml(guessedSub) : ''} - נכון?` : 'לא הצלחתי לנחש מהגיליון - לבחור בעצמך:'}</p>
    <select id="va-domain-select" class="cosmic-textarea" style="min-height:auto">${options}</select>
    <div id="va-subcategory-wrap">${subCategorySelectHtml(initialDomain, guessedSub)}</div>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-domain-confirm-btn">מאשרים</button>
    </div>
  `, { showProgress: false });
  document.getElementById('va-domain-select').addEventListener('change', (e) => {
    document.getElementById('va-subcategory-wrap').innerHTML = subCategorySelectHtml(e.target.value, null);
  });
  document.getElementById('va-domain-confirm-btn').addEventListener('click', async () => {
    const chosen = document.getElementById('va-domain-select').value;
    const subSelect = document.getElementById('va-subcategory-select');
    const chosenSub = subSelect ? subSelect.value || null : null;
    await saveDomain(chosen, chosenSub);
    domainInfo = { domain: chosen, subCategory: chosenSub };
    cacheDomainInfoLocally(domainInfo);
    applyDomainTheme(chosen);
    onConfirmed();
  });
}

async function renderPulledReference() {
  if (!videosCache) videosCache = await fetchInspirationBank();
  const { domain, subCategory } = await resolveDomain();
  const needsConfirm = !domain || ((SUBCATEGORIES_BY_DOMAIN[domain] || []).length > 0 && !subCategory);
  if (needsConfirm) {
    renderDomainConfirm(domain, subCategory, () => render());
    return;
  }
  if (!currentPickId) {
    const picked = pickReference(videosCache, domain, subCategory, null);
    if (!picked) {
      cosmicCard(`<h2>אין עדיין רפרנסים בתחום הזה</h2><p>לבחור "יש לי רעיון מ-0" במקום, או חזור/חזרי מאוחר יותר.</p>`);
      return;
    }
    currentPickId = picked.id;
  }
  const video = videosCache.find((v) => v.id === currentPickId);
  const card = cosmicCard(`
    <h2>🎲 הרפרנס הזה</h2>
    ${video.thumbnailUrl
      ? `<button type="button" id="va-ref-preview-btn" style="all:unset;cursor:pointer;display:block">
          <img src="${escapeHtml(video.thumbnailUrl)}" alt="תצוגה מקדימה" style="width:100%;border-radius:14px;margin-bottom:14px">
        </button>`
      : `<button type="button" class="cosmic-btn" id="va-ref-preview-btn" style="margin-bottom:14px">לפתוח תצוגה מקדימה</button>`}
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-accept-ref-btn">אהבתי, בואו נמשיך</button>
    </div>
    <button type="button" class="cosmic-reroll-btn" id="va-reroll-ref-btn">לא אהבתי - להגריל שוב</button>
  `);
  flipReveal(card);
  // 17/10/2026 (מאיה: "לא הקשבת לי... שהפרפנסים לדוגמא שנפתחים לא במסך
  // נפרד רק בפופאפ"): צפייה נשארת בתוך האפליקציה - פופאפ עם התמונה
  // הממוזערת האמיתית (כבר ממוזערת מקומית במאגר, אין בעיית CORS), עם
  // קישור יציאה מפורש רק אם רוצה לצפות בפועל בפלטפורמה המקורית.
  //
  // 19/10/2026 (מאיה, לקוחה דרכה: "לחצתי ניגון וזה לא ממש התנגן, נתקע על
  // תמונת הפריוויו"): עד עכשיו לא הייתה כאן בכלל אפשרות ניגון אמיתית - רק
  // התמונה הממוזערת. עכשיו מוטמע הסרטון עצמו (אותו embedUrlFor ששכבת
  // מאגר ההשראה כבר משתמשת בו) - עובד בכל שפה, כי ההטמעה לא תלויה בשפה.
  // אם ההטמעה עצמה חסומה (ראה הערה דומה ב-inspiration-popup.js), נופלים
  // חזרה לתמונה אחרי 4 שניות בלי טעינה. וכשמקור הסרטון זר, מוסיפים גם
  // תזכורת שהבנה מהצפייה בלבד עלולה להיות חלקית, ושבשלב התמלול הבא ממילא
  // יש להיעזר ב-Gemini (ראה renderTranscribe) - לא הבטחה לתרגום מדויק כאן.
  function openRefPreview() {
    const embed = embedUrlFor(video.url, video);
    const shape = embedShape(video.url, video);
    const lang = languageName(video);
    const langNote = lang
      ? `<p class="muted" style="font-size:13px;margin-top:10px">⚠️ הרפרנס הזה ב${escapeHtml(lang)} - אם לא תביני הכל רק מהצפייה, זה בסדר: בשלב הבא תורידי את הסרטון ותתמללי אותו (לעברית אם צריך) בעזרת Gemini.</p>`
      : '';
    const overlay = openModal(`
      <h2 style="margin-top:0">תצוגה מקדימה</h2>
      <div id="va-ref-embed-wrap" style="width:100%;border-radius:14px;overflow:hidden;margin-bottom:14px;background:#000;${embed ? `aspect-ratio:${shape.w}/${shape.h}` : ''}">
        ${embed
          ? `<iframe src="${escapeHtml(embed)}" title="סרטון רפרנס" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen style="width:100%;height:100%;border:0;display:block"></iframe>`
          : (video.thumbnailUrl ? `<img src="${escapeHtml(video.thumbnailUrl)}" alt="" style="width:100%;border-radius:14px">` : '<p style="padding:40px 16px;text-align:center;color:#fff">אין תמונה ממוזערת לסרטון הזה.</p>')}
      </div>
      ${langNote}
      <a href="${escapeHtml(video.url)}" target="_blank" rel="noopener" class="cosmic-btn" style="display:block;text-align:center;text-decoration:none">לצפייה המלאה בפלטפורמה המקורית ↗</a>
    `);
    if (!embed) return;
    const frame = overlay.querySelector('iframe');
    let loaded = false;
    frame.addEventListener('load', () => { loaded = true; });
    setTimeout(() => {
      if (loaded || !document.body.contains(overlay)) return;
      const wrap = document.getElementById('va-ref-embed-wrap');
      if (!wrap) return;
      wrap.style.aspectRatio = '';
      wrap.style.background = 'transparent';
      wrap.innerHTML = video.thumbnailUrl
        ? `<img src="${escapeHtml(video.thumbnailUrl)}" alt="" style="width:100%;border-radius:14px">`
        : '<p style="padding:40px 16px;text-align:center;color:#fff">הסרטון הזה לא מוכן להצגה כאן - אפשר לצפות בקישור למטה.</p>';
    }, 4000);
  }
  document.getElementById('va-ref-preview-btn').addEventListener('click', openRefPreview);
  document.getElementById('va-accept-ref-btn').addEventListener('click', () => {
    celebrate();
    dispatch({ type: 'ACCEPT_PICK' });
  });
  document.getElementById('va-reroll-ref-btn').addEventListener('click', () => {
    playReroll();
    const picked = pickReference(videosCache, domain, subCategory, currentPickId);
    if (picked) currentPickId = picked.id;
    // 17/10/2026 (רעיון #1): אין טקסט-כותרת אמיתי לרפרנסים (רק תמונה
    // ממוזערת), אז הספינר כאן מראה סימוני "הגרלה" קוסמיים ולא טקסט מזויף.
    const label = document.createElement('div');
    label.style.fontSize = '36px';
    label.style.margin = '0 0 14px';
    card.prepend(label);
    spinReveal(label, ['🎲', '🎯', '🔮', '✨', '🌀'], '🎲', () => {
      dispatch({ type: 'REROLL' });
    });
  });
}

function copyBtn(text, label) {
  return `<button type="button" class="cosmic-btn" data-copy-text="${encodeURIComponent(text)}">${label}</button>`;
}

function wireCopyButtons(root) {
  root.querySelectorAll('[data-copy-text]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = decodeURIComponent(btn.getAttribute('data-copy-text'));
      try {
        await navigator.clipboard.writeText(text);
        showToast('הועתק ✓');
      } catch {
        showToast('לא הצלחתי להעתיק - לסמן ידנית');
      }
    });
  });
}

function renderTranscribe() {
  cosmicCard(`
    <h2>לתמלל את הרפרנס</h2>
    <p>להוריד את הסרטון, ולתמלל אותו (לעברית אם צריך) בעזרת ג'מיני - ואז להדביק כאן את התמלול</p>
    <input type="url" class="cosmic-textarea" id="va-reference-link" style="min-height:auto"
      inputmode="url" dir="ltr" placeholder="לינק לסרטון שמשכפלים (רשות)"
      value="${state.referenceLink ? escapeHtml(state.referenceLink) : ''}">
    <textarea class="cosmic-textarea" id="va-transcript-input" style="margin-top:8px" placeholder="להדביק כאן את התמלול...">${state.transcript ? escapeHtml(state.transcript) : ''}</textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-transcribe-done-btn">✓ עשיתי</button>
    </div>
  `);
  document.getElementById('va-transcribe-done-btn').addEventListener('click', () => {
    // 16/10/2026 (מאיה: "זה נותן לי להמשיך בשלבים גם בלי שכתבתי כלום") -
    // כאן בדיוק היה חסר הוולידציה הזו, היחידה מכל שדות הטקסט שלא נבדקה.
    const text = document.getElementById('va-transcript-input').value.trim();
    if (!text) {
      showToast('צריך להדביק את התמלול קודם');
      return;
    }
    state.transcript = text;
    state.referenceLink = document.getElementById('va-reference-link').value.trim() || null;
    dispatch({ type: 'CONFIRM_DONE' });
  });
}

// 19/10/2026 (מאיה, אחרי בדיקה אמיתית מול ChatGPT בפועל: "הדבקתי לו את
// התסריט המתומלל... הוא צריך לזהות כמה שורות ההוק, אבל הוא כתב את כל
// התסריט") - עד עכשיו כל התמלול שהיא הדביקה נכנס בתור "ההוק הזה"
// בפרומפט, ו-ChatGPT פשוט שכפל חזרה את כל הפסקה (הוק + נימוק + הרחבה)
// במקום לייצר הוקים חדשים ומגוונים. מזהים קודם, דרך extractOpeningHook,
// רק את המשפט/ים הפותחים - בדיוק איפה שמסתיים ההוק ומתחיל הנימוק, כמו
// שמאיה הדגימה בעצמה. משותף לשני המקומות שצריכים את ההוק המזוהה: מסך
// "מגילת אסתר" (שכפול הפוך - צריך לראות את ההוק לפני שכותבים עליו) ומסך
// הפרומפט הראשון (שכפול רגיל - שם זה המסך הראשון שמגיע אחרי התמלול).
async function ensureOpeningHook() {
  if (state.openingHook || !state.transcript) return;
  try {
    state.openingHook = await extractOpeningHook(state.transcript);
  } catch (err) {
    console.error('extractOpeningHook failed:', err);
    // נכשל השרת - נופלים חזרה לכל התמלול במקום לתקוע אותה כאן לגמרי
    state.openingHook = state.transcript;
  }
  saveSession(state).catch((err) => console.error('saveSession failed:', err));
}

/* קהל היעד יושב בפרופיל, וכל בונה פרומפט צריך אותו. פעם אחת כאן,
   במקום להעתיק את אותו תנאי בכל מסך מחדש. */
async function myAudience() {
  const profile = await getProfile();
  return profile && profile.primaryAudience ? profile.primaryAudience : '';
}

async function renderPrompt1() {
  const profile = await getProfile();
  const audience = profile && profile.primaryAudience ? profile.primaryAudience : '';
  const domain = domainInfo ? domainInfo.domain : '';

  // 19/10/2026 (מאיה: "קודם כל מדביקים לך את התסריט של הרפרנס ואז הוא
  // כבר מזהה הוק ואז בעצם צריך מגילת אסתר") - בשכפול הפוך ההוק כבר זוהה
  // ומוצג במסך "מגילת אסתר" הקודם (ensureOpeningHook נקרא משם), אז כאן
  // זה כבר קיים ב-state.openingHook. בשכפול רגיל זה עדיין המסך הראשון
  // שמגיע אחרי התמלול, אז מזהים כאן אם עוד לא זוהה.
  if (!state.openingHook) {
    cosmicCard(`<p>מזהים את ההוק מתוך התמלול...</p>`, { showProgress: false });
    await ensureOpeningHook();
  }
  const hookForPrompt = state.openingHook || state.transcript || '';

  // 19/10/2026 (מאיה, גרסה שלישית - "הסדר בשכפול ההפוך לא טוב", עם ניסוח
  // מדויק סופי): בשכפול הפוך כבר יש לה תסריט/מגילת אסתר משלה (state.herWords,
  // נכתב אחרי שההוק כבר זוהה) - הפרומפט כאן חייב לכלול אותו, לא רק תחום,
  // ועכשיו גם קהל יעד. ראה buildReverseDuplicationPrompt.
  const isReverseDup = state.branch === 'idea-search';
  const reverseDupScript = state.herWords || state.ideaDescription || '';
  const prompt = isReverseDup
    ? buildReverseDuplicationPrompt({ domain, audience, hook: hookForPrompt, script: reverseDupScript })
    : buildDuplicationPrompt({ audience, domain, hook: hookForPrompt });
  const highlightValues = isReverseDup
    ? [audience, domain, hookForPrompt, reverseDupScript]
    : [audience, domain, hookForPrompt];
  cosmicCard(`
    <h2>פרומפט מוכן ל-ChatGPT</h2>
    <div class="cosmic-context-box"><span>ההוק שזיהינו מתוך התמלול שלך:</span>${escapeHtml(hookForPrompt)}</div>
    ${isReverseDup
      ? `<p>ההוק המקורי + התסריט שלך נשלחים ל-ChatGPT - הוא שולף מתוך התסריט שלך הוקים חזקים ומלביש אותם על מנגנון ההוק המקורי, ומביא לך 30 רעיונות.</p>`
      : `<p>רק ההוק הזה נשלח ל-ChatGPT - לא כל התמלול. הוא ישכפל אותו ויביא לך 30 הוקים חדשים באותו מנגנון.</p>`}
    <p>להעתיק, להדביק ב-ChatGPT, ולחזור עם ההוק שהכי קרץ לך מתוך ה-30</p>
    <div class="cosmic-prompt-box">${highlightPlaceholders(prompt, highlightValues)}</div>
    ${copyBtn(prompt, 'להעתיק פרומפט')}
    <textarea class="cosmic-textarea" id="va-hook-input" placeholder="להדביק כאן את ההוק שבחרת..." style="margin-top:14px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-hook-chosen-btn">להמשיך</button>
    </div>
  `);
  wireCopyButtons(screenEl());
  document.getElementById('va-hook-chosen-btn').addEventListener('click', () => {
    const hook = document.getElementById('va-hook-input').value.trim();
    if (!hook) {
      showToast('צריך להדביק את ההוק שבחרת קודם');
      return;
    }
    dispatch({ type: 'HOOK_CHOSEN', hook });
  });
}

// 19/10/2026 (מאיה: "לא מובן ההקשר בשיטה... צריך להיות כתוב בצהוב למעלה
// את הרעיון/הוק הנבחר, ושיהיה ברור שעכשיו הזמן להרחיב עליו... ואם
// נתקעים, SOS של פרומפט חילוץ תוכן") - עד עכשיו המסך הזה הגיע בלי שום
// תזכורת על מה בדיוק בונים, ובלי אפשרות עזרה אם נתקעים (בניגוד למסך
// המקביל במסלול "כתיבה מאפס", שכבר יש לו אותו כפתור SOS).
//
// 19/10/2026 (מאיה, שוב: "בשכפול הפוך לפני שמוצאים הוק צריך קודם שידביקו
// לך את המגילת אסתר") - במסלול שכפול הפוך המסך הזה מגיע *לפני* שנבחר
// הוק (state.hook עדיין ריק) - אז ה"הקשר" שמוצג הוא הרעיון שלה, וההסבר
// מבקש מגילת אסתר אמיתית (לפי השאלות המנחות מהמתודולוגיה שלה), לא רק
// "סיפור קצר" - כי כל התוכן הזה בעצמו נכנס לפרומפט הבא שמוצא את ההוק.
//
// 19/10/2026 (מאיה, גרסה שלישית: "קודם כל מדביקים לך את התסריט של
// הרפרנס ואז הוא כבר מזהה הוק ואז בעצם צריך מגילת אסתר") - ההוק של
// הרפרנס חייב להיות מזוהה ומוצג *כאן*, לפני שהיא כותבת את המגילה - לא
// רק במסך הפרומפט הבא - כדי שתדע למה היא בעצם כותבת.
async function renderHerWords() {
  const isPreHookMegillah = state.branch === 'idea-search' && !state.hook;
  if (isPreHookMegillah && !state.openingHook) {
    cosmicCard(`<p>מזהים את ההוק מתוך התמלול...</p>`, { showProgress: false });
    await ensureOpeningHook();
  }
  const context = isPreHookMegillah ? (state.openingHook || state.ideaDescription || '') : (state.hook || state.ideaDescription || '');
  cosmicCard(`
    <h2>${isPreHookMegillah ? 'מגילת אסתר - מה יש לך להגיד?' : 'מה יש לך להגיד?'}</h2>
    ${context ? `<div class="cosmic-context-box"><span>${isPreHookMegillah ? 'ההוק שזיהינו מהרפרנס:' : 'ההוק/הרעיון שבחרת:'}</span>${escapeHtml(context)}</div>` : ''}
    ${isPreHookMegillah
      ? `<p>עכשיו, לפני שמבקשים הוקים - לכתוב כאן את כל מה שיש לך להגיד על הנושא. לא צריך לנסח יפה: מה אתם חושבים על זה? למה? מה חשוב שהקהל יבין? איזה ניסיון או דוגמה יש לך?</p>`
      : `<p>עכשיו הזמן להרחיב עליו - סיפור קצר, דוגמא, או דיבור כללי על הנושא, במילים שלך</p>`}
    <div class="cosmic-btn-row" style="margin-bottom:14px">
      <button type="button" class="cosmic-btn" id="va-herwords-help-btn">נתקעת? לקבל עזרה 🆘</button>
    </div>
    <textarea class="cosmic-textarea" id="va-herwords-input" style="${isPreHookMegillah ? 'min-height:160px' : ''}">${isPreHookMegillah && state.herWords ? escapeHtml(state.herWords) : ''}</textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-herwords-done-btn">להמשיך</button>
    </div>
  `);
  document.getElementById('va-herwords-help-btn').addEventListener('click', openExtractionHelperModal);
  document.getElementById('va-herwords-done-btn').addEventListener('click', () => {
    const text = document.getElementById('va-herwords-input').value.trim();
    if (!text) {
      showToast('צריך לכתוב משהו קודם');
      return;
    }
    dispatch({ type: 'HER_WORDS_SUBMITTED', text });
  });
}

async function renderPrompt2() {
  const hook = state.hook || state.transcript || '';
  // 19/10/2026 (מאיה, אחרי אישור מפורש) - שדה "התסריט המקורי" מפורש, לא
  // הסתמכות על ש-ChatGPT "זוכר" אותו מפרומפט 1 באותה שיחה; ראה
  // video-assistant-prompts.js, buildScriptPrompt.
  const prompt = buildScriptPrompt({ hook, herWords: state.herWords, originalScript: state.transcript || '', domain: domainInfo ? domainInfo.domain : '', audience: await myAudience() });
  cosmicCard(`
    <h2>הפרומפט השני</h2>
    <p>להעתיק, להדביק ב-ChatGPT, ותלקבל תסריט מלא</p>
    <div class="cosmic-prompt-box">${highlightPlaceholders(prompt, [hook, state.herWords, state.transcript])}</div>
    ${copyBtn(prompt, 'להעתיק פרומפט')}
    <textarea class="cosmic-textarea" id="va-prompt2-script-input" placeholder="להדביק כאן את התסריט שקיבלת..." style="margin-top:14px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-script-ready-btn">יש לי תסריט</button>
    </div>
  `);
  wireCopyButtons(screenEl());
  document.getElementById('va-script-ready-btn').addEventListener('click', () => {
    // 17/10/2026 (מאיה: "הייתי שמחה שבסיכום יהיה כתוב גם את התסריט") -
    // עד עכשיו התסריט הסופי שחזרה איתו מ-ChatGPT לא נשמר בכלל.
    const text = document.getElementById('va-prompt2-script-input').value.trim();
    if (!text) {
      showToast('צריך להדביק את התסריט קודם');
      return;
    }
    celebrate();
    dispatch({ type: 'SCRIPT_READY', text });
  });
}

/* 23/10/2026 (מאיה: "בחלק של קרא בקול את התסריט - התסריט צריך להיות
   מוקרן על המסך הזה", ו"אשמח שתהיה תוספת בכותרת: נא לבדוק את האורך של
   התסריט שהוא לא ארוך משמעותית מאורך הסרטון המשוכפל").

   עד כאן המסך ביקש להקריא תסריט שלא הופיע בו, ולכן היה צריך לחזור אחורה
   או לפתוח את ChatGPT שוב רק כדי לראות מה להקריא. */
function renderReadAloud() {
  const script = state.finalScript || state.draftScript || '';
  cosmicCard(`
    <h2>להקריא בקול את התסריט</h2>
    <p>לבדוק שהכל מתחבר, שאין פספוסים, ושהאורך מרגיש נכון</p>
    <p class="cosmic-context-box">נא לבדוק את האורך של התסריט, שהוא לא ארוך משמעותית מאורך הסרטון המשוכפל</p>
    ${script
      ? `<div class="cosmic-prompt-box va-read-script">${escapeHtml(script)}</div>`
      : '<p style="opacity:.75">התסריט לא נשמר בשלב הקודם, אפשר לחזור אחורה ולהדביק אותו</p>'}
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-read-done-btn">✓ מוכן לעריכה</button>
    </div>
  `);
  document.getElementById('va-read-done-btn').addEventListener('click', () => {
    celebrate();
    dispatch({ type: 'CONFIRM_DONE' });
  });
}

// ===== מסלול "כתיבה מאפס" - 4 הפרומפטים האמיתיים (16/10) =====
/* 22/10/2026 (מאיה: "להכניס את זווית ההגשה לרעיון ולא סתם שיכתבו רעיון,
   קודם כל לוודא שיש זווית הגשה חזקה").

   עד היום מסלול הכתיבה מאפס פתח בהסבר והמשיך לשפיכת תוכן. בנק 31 הזוויות
   היה קיים בכלי אבל רק כחומר עזר, ולכן אפשר היה לכתוב תסריט שלם על רעיון
   בלי שום זווית - וזה בדיוק הרעיון השטוח שהיא לא רוצה לקבל.

   הזווית היא עכשיו המסך הראשון, והיא תנאי: המכונה זורקת אם מנסים להתקדם
   בלעדיה (ראה SCRATCH_START_DUMP ב-video-assistant-flow.js). */
function renderAngle() {
  // אותה תבנית אקורדיון של בחירת הפורמט: רשימה ארוכה שנפתחת פריט-פריט,
  // ולא 31 כרטיסים פתוחים שמציפים את המסך.
  const itemsHtml = ANGLES.map((a, i) => `
    <details class="cosmic-accordion-item" ${state.angle === a.name ? 'open' : ''}>
      <summary><span>${escapeHtml(a.name)}</span></summary>
      <div class="cosmic-accordion-body">
        <p style="margin:0">${escapeHtml(a.description)}</p>
        ${a.example ? `<p style="margin:6px 0 0;opacity:.8">לדוגמה: ${escapeHtml(a.example)}</p>` : ''}
        <button type="button" class="cosmic-pick-btn" data-pick-angle="${i}">הזווית שלי</button>
      </div>
    </details>
  `).join('');
  cosmicCard(`
    <h2>קודם כל, מה הזווית?</h2>
    <p>רעיון בלי זווית הגשה הוא נושא, לא סרטון. בחרי את הזווית שממנה את ניגשת לרעיון, ורק אחר כך נכתוב.</p>
    ${state.angle ? `<div class="cosmic-selected-chip">✓ נבחרה: ${escapeHtml(state.angle)}</div>` : ''}
    <div class="cosmic-accordion">${itemsHtml}</div>
  `);
  document.querySelectorAll('[data-pick-angle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      playSuccess();
      dispatch({ type: 'ANGLE_CHOSEN', angle: ANGLES[Number(btn.dataset.pickAngle)].name });
    });
  });
}

/* מסך הלחיצה על הזווית. שני דברים קורים כאן:
   לנמק במילה שלה למה הזווית מחזיקה, ולהעביר אותה לצ'אט "בדיקת רעיון"
   הקיים כדי שילחץ עליה. הנימוק נשמר בסטייט גם בלי הצ'אט, כי הוא מה
   שנכנס לפרומפטים הבאים ולמסך הסיכום. */
function renderAngleCheck() {
  const angle = ANGLES.find((a) => a.name === state.angle)
    || { name: state.angle || '', description: '', example: '' };
  /* 22/10/2026: העוזר ליצירת סרטון כלול במנוי הרפרנסים (tab-refs-only),
     אבל הצ'אט "בדיקת רעיון" לא, גם בעיצוב וגם ב-enforceAllowlist בשרת.
     מנוית רפרנסים תקבל כאן את שדה הנימוק בלבד, בלי הצ'אט, כדי שלא תיתקל
     בסירוב מהשרת על כלי שהמנוי שלה לא כולל. */
  const refsOnly = document.body.dataset.plan === 'refs';
  cosmicCard(`
    <h2>הזווית שבחרת</h2>
    <div class="cosmic-context-box">
      <strong>${escapeHtml(angle.name)}</strong>
      <p style="margin:6px 0 0">${escapeHtml(angle.description)}</p>
      ${angle.example ? `<p style="margin:6px 0 0;opacity:.8">לדוגמה: ${escapeHtml(angle.example)}</p>` : ''}
    </div>
    <p>במשפט אחד, למה הזווית הזאת חזקה דווקא לקהל שלך?</p>
    <textarea class="cosmic-textarea" id="va-angle-why" style="min-height:90px"
      placeholder="למשל: הן באמת מאמינות שתעודה מספיקה, ואף אחת לא אומרת להן אחרת">${state.angleWhy ? escapeHtml(state.angleWhy) : ''}</textarea>
    ${refsOnly ? '' : `
      <div class="va-angle-chat">
        <div class="chat-messages" id="va-chat-messages" role="log" aria-live="polite"></div>
        <form class="chat-input-row" id="va-chat-form">
          <textarea id="va-chat-input" enterkeyhint="send" placeholder="לענות לו כאן..." aria-label="הודעה לבדיקת הזווית"></textarea>
          <button type="submit" class="cosmic-btn">שליחה</button>
        </form>
      </div>`}
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-angle-next-btn">הזווית מחזיקה, ממשיכים</button>
    </div>
  `);

  const why = () => document.getElementById('va-angle-why').value.trim();
  document.getElementById('va-angle-next-btn').addEventListener('click', () => {
    dispatch({ type: 'ANGLE_CONFIRMED', why: why() });
  });
  if (refsOnly) return;

  /* הצ'אט חי כאן בתוך המסך, ומריץ את אותו streamCheckIdea של "בדיקת
     רעיון". אין כאן מנוע שני ואין קפיצה ללשונית אחרת: אותו שרת, אותו
     זרם, אותה התנהגות - רק בתוך הזרימה, במקום שבו היא באמת צריכה אותו. */
  const messagesEl = document.getElementById('va-chat-messages');
  const history = [];
  let busy = false;

  async function ask(text) {
    if (busy) return;
    busy = true;
    history.push({ role: 'user', content: text });
    const thinking = addThinkingBubble(messagesEl);
    try {
      const profile = await getProfile();
      const live = { value: '' };
      const reply = await streamCheckIdea(history, profile, (delta) => {
        live.value += delta;
        setBubbleText(thinking, live.value);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      });
      setBubbleText(thinking, reply || live.value);
      history.push({ role: 'assistant', content: reply || live.value });
    } catch (err) {
      console.error('angle chat failed:', err);
      setBubbleText(thinking, 'לא הצלחתי להתחבר כרגע. אפשר לנסות שוב, או פשוט להמשיך - הזווית כבר נשמרה.');
    } finally {
      busy = false;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  document.getElementById('va-chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('va-chat-input');
    const text = input.value.trim();
    if (!text) return;
    addBubble(messagesEl, text, 'user');
    input.value = '';
    ask(text);
  });

  // פתיחה אוטומטית: הוא מתחיל ללחוץ על הזווית בלי שהיא תצטרך לנסח בקשה
  const idea = state.ideaDescription || state.hook || '';
  ask(`אני עובדת על סרטון. הזווית שבחרתי: "${state.angle}". `
    + (idea ? `הרעיון: "${idea}". ` : '')
    + (state.angleWhy ? `למה לדעתי היא חזקה: "${state.angleWhy}". ` : '')
    + 'ללחוץ על הזווית הזאת: האם היא באמת חדה לקהל שלי, או שהיא רחבה מדי? '
    + 'אם היא חלשה, להגיד לי במה בדיוק, ולהציע ניסוח חד יותר.');
}

function renderScratchIntro() {
  const stepsHtml = SCRIPT_STRUCTURE.map((s) => `
    <li><span class="cosmic-summary-num">${s.step}</span><div><strong>${escapeHtml(s.name)}</strong><br>${escapeHtml(s.description)}</div></li>
  `).join('');
  cosmicCard(`
    <h2>כתיבה מאפס</h2>
    <p>הדרך שדורשת הכי הרבה הבנה שיווקית - אבל נלווה אותך צעד-צעד. ככה בנוי תסריט טוב:</p>
    <ul class="cosmic-summary-list">${stepsHtml}</ul>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-scratch-start-btn">מתחילים</button>
    </div>
  `);
  document.getElementById('va-scratch-start-btn').addEventListener('click', () => dispatch({ type: 'SCRATCH_START_DUMP' }));
}

// 18/10/2026 (מאיה: "צריך להסביר ששולחים את זה ל-ChatGPT ואז מדביקים
// לכאן") - עד עכשיו לא היה כתוב בשום מקום מה עושים עם הפרומפט שנוצר.
// עכשיו שלושה שלבים מפורשים: 1) ממלאים כאן, 2) מעתיקים ושולחים ל-
// ChatGPT, 3) חוזרים ומדביקים את התשובה בתיבת הטקסט הגדולה במסך
// הקודם (לא כאן - המודאל הזה רק בונה את הפרומפט).
function openExtractionHelperModal() {
  // 19/10/2026: גם קרוא ממסך "מה יש לך להגיד?" (מסלולי רפרנס/שכפול
  // הפוך), שבהם ideaDescription ריק אבל hook כן מוגדר - fallback אליו
  // כדי שגם שם יהיה הקשר אמיתי לבנאי הפרומפט, לא ריק.
  const idea = state.ideaDescription || state.hook || '';
  const overlay = openModal(`
    <h2 style="margin-top:0">קשה למצוא מה להגיד?</h2>
    <p style="font-size:13px">זה בנאי פרומפט בלבד: ממלאים כאן, מקבלים פרומפט מוכן, מעתיקים אותו ושולחים ל-ChatGPT - הוא ישאל שאלות שיוציאו ממך בדיוק מה להגיד. את התשובות שתקבלי מ-ChatGPT מדביקים חזרה בתיבת הטקסט הגדולה (לא כאן במודאל).</p>
    <input type="text" class="cosmic-textarea" id="va-ext-contenttype" style="min-height:auto" placeholder="סוג תוכן (מכירתי / בעל ערך / בידורי / אישי)">
    <input type="text" class="cosmic-textarea" id="va-ext-startpoint" style="min-height:auto;margin-top:8px" placeholder="נקודת יציאה (סיפור אישי / סיפור לקוח / כללי)">
    <input type="text" class="cosmic-textarea" id="va-ext-audience" style="min-height:auto;margin-top:8px" placeholder="קהל היעד">
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-ext-generate-btn">לבנות את הפרומפט</button>
    </div>
    <div id="va-ext-result"></div>
  `);
  getProfile().then((p) => {
    const el = overlay.querySelector('#va-ext-audience');
    if (el && !el.value && p && p.primaryAudience) el.value = p.primaryAudience;
  });
  overlay.querySelector('#va-ext-generate-btn').addEventListener('click', () => {
    const contentType = overlay.querySelector('#va-ext-contenttype').value.trim();
    const startingPoint = overlay.querySelector('#va-ext-startpoint').value.trim();
    const audience = overlay.querySelector('#va-ext-audience').value.trim();
    const prompt = buildExtractionPrompt({ idea, contentType, startingPoint, audience, domain: domainInfo ? domainInfo.domain : '' });
    const resultEl = overlay.querySelector('#va-ext-result');
    resultEl.innerHTML = `
      <div class="cosmic-prompt-box" style="margin-top:14px">${highlightPlaceholders(prompt, [idea, contentType, startingPoint, audience])}</div>
      ${copyBtn(prompt, 'להעתיק פרומפט')}
      <p style="font-size:12px;opacity:.75;margin-top:10px;margin-bottom:0">עכשיו: להדביק את זה בשיחה חדשה ב-ChatGPT, לענות על השאלות שלו, ואז לחזור לכאן ולהדביק את מה שעלה בתיבת הטקסט הגדולה.</p>
    `;
    wireCopyButtons(resultEl);
  });
}

function renderScratchDump() {
  cosmicCard(`
    <h2>שפיכה את כל מה שיש לך להגיד</h2>
    <p>בלי לערוך, בלי לדאוג לניסוח - כל מה שעולה לך בראש על הרעיון. נזקק את זה אחר כך.</p>
    <div class="cosmic-btn-row" style="margin-bottom:14px">
      <button type="button" class="cosmic-btn" id="va-scratch-help-btn">קשה למצוא מה להגיד? לקבל עזרה 🆘</button>
    </div>
    <textarea class="cosmic-textarea" id="va-scratch-dump-input" style="min-height:160px" placeholder="כל מה שיש לך להגיד...">${state.rawDump ? escapeHtml(state.rawDump) : ''}</textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-scratch-dump-done-btn">להמשיך</button>
    </div>
  `);
  document.getElementById('va-scratch-help-btn').addEventListener('click', openExtractionHelperModal);
  document.getElementById('va-scratch-dump-done-btn').addEventListener('click', () => {
    const text = document.getElementById('va-scratch-dump-input').value.trim();
    if (!text) {
      showToast('צריך לכתוב משהו קודם');
      return;
    }
    dispatch({ type: 'SCRATCH_DUMP_READY', text });
  });
}

async function renderScratchHook() {
  const profile = await getProfile();
  const audience = profile && profile.primaryAudience ? profile.primaryAudience : '';
  const prompt = buildHookFindingPrompt({ idea: state.ideaDescription || '', script: state.rawDump || '', audience, domain: domainInfo ? domainInfo.domain : '' });
  cosmicCard(`
    <h2>מציאת הוק</h2>
    <p>הפרומפט כולל בנק הוקים אמיתי מוטמע - ChatGPT יתאים לך ממנו הוק מדויק. להעתיק, להדביק, ולחזור עם ההוק שבחרת.</p>
    <div class="cosmic-prompt-box">${highlightPlaceholders(prompt, [state.ideaDescription, state.rawDump, audience])}</div>
    ${copyBtn(prompt, 'להעתיק פרומפט')}
    <textarea class="cosmic-textarea" id="va-scratch-hook-input" placeholder="להדביק כאן את ההוק שבחרת..." style="margin-top:14px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-scratch-hook-done-btn">להמשיך</button>
    </div>
  `);
  wireCopyButtons(screenEl());
  document.getElementById('va-scratch-hook-done-btn').addEventListener('click', () => {
    const hook = document.getElementById('va-scratch-hook-input').value.trim();
    if (!hook) {
      showToast('צריך להדביק את ההוק שבחרת קודם');
      return;
    }
    dispatch({ type: 'SCRATCH_HOOK_CHOSEN', hook });
  });
}

async function renderScratchHookReinforce() {
  const prompt = buildHookReinforcementPrompt({ idea: state.ideaDescription || '', hook: state.hook || '', script: state.rawDump || '', audience: await myAudience(), domain: domainInfo ? domainInfo.domain : '' });
  cosmicCard(`
    <h2>חיזוק ההוק</h2>
    <p>המשפט השני, שנותן סיבה ברורה להישאר. להעתיק, להדביק, ולחזור עם החיזוק שבחרת.</p>
    <div class="cosmic-prompt-box">${highlightPlaceholders(prompt, [state.ideaDescription, state.hook, state.rawDump])}</div>
    ${copyBtn(prompt, 'להעתיק פרומפט')}
    <textarea class="cosmic-textarea" id="va-scratch-reinforce-input" placeholder="להדביק כאן את חיזוק ההוק שבחרת..." style="margin-top:14px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-scratch-reinforce-done-btn">להמשיך</button>
    </div>
  `);
  wireCopyButtons(screenEl());
  document.getElementById('va-scratch-reinforce-done-btn').addEventListener('click', () => {
    const text = document.getElementById('va-scratch-reinforce-input').value.trim();
    if (!text) {
      showToast('צריך להדביק את חיזוק ההוק קודם');
      return;
    }
    dispatch({ type: 'SCRATCH_REINFORCEMENT_CHOSEN', text });
  });
}

const CTA_TYPES = [
  { value: 'משפך', label: 'משפך (להביא ליד)' },
  { value: 'מעורבות', label: 'מעורבות (לייק/תגובה/שמירה)' },
  { value: 'עוקבים', label: 'צמיחת קהל (לעקוב)' },
  { value: 'מכירה', label: 'מכירה' },
];

function renderScratchDistill() {
  const buildPrompt = (ctaType) => buildScriptDistillationPrompt({
    idea: state.ideaDescription || '', hook: state.hook || '', hookReinforcement: state.hookReinforcement || '',
    rawScript: state.rawDump || '', ctaType,
  });
  const ctaOptions = CTA_TYPES.map((c) => `<option value="${c.value}">${escapeHtml(c.label)}</option>`).join('');
  cosmicCard(`
    <h2>זיקוק התסריט הסופי</h2>
    <p>איזו הנעה לפעולה הכי מתאימה?</p>
    <select id="va-scratch-cta-select" class="cosmic-textarea" style="min-height:auto">${ctaOptions}</select>
    <div id="va-scratch-distill-prompt-wrap" style="margin-top:14px"></div>
    <textarea class="cosmic-textarea" id="va-scratch-script-input" placeholder="להדביק כאן את התסריט הסופי שקיבלת..." style="margin-top:14px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-scratch-script-done-btn">סיימתי, יש לי תסריט</button>
    </div>
  `);
  const wrap = document.getElementById('va-scratch-distill-prompt-wrap');
  function refreshPrompt() {
    const cta = document.getElementById('va-scratch-cta-select').value;
    const prompt = buildPrompt(cta);
    const values = [state.ideaDescription, state.hook, state.hookReinforcement, state.rawDump, cta];
    wrap.innerHTML = `<div class="cosmic-prompt-box">${highlightPlaceholders(prompt, values)}</div>${copyBtn(prompt, 'להעתיק פרומפט')}`;
    wireCopyButtons(wrap);
  }
  document.getElementById('va-scratch-cta-select').addEventListener('change', refreshPrompt);
  refreshPrompt();
  document.getElementById('va-scratch-script-done-btn').addEventListener('click', () => {
    const text = document.getElementById('va-scratch-script-input').value.trim();
    if (!text) {
      showToast('צריך להדביק את התסריט קודם');
      return;
    }
    celebrate();
    dispatch({ type: 'SCRATCH_SCRIPT_READY', text });
  });
}

// ===== מסך הסיכום הסופי - "אפילו ילד בן 10 יכול להבין" (16/10) =====
// 18/10/2026 (מאיה: "הסיכום כללי מדי, לא מובן איך אני בונה את הסרטון
// שלי - מה הרעיון שבחרתי, מה השלבים בדיוק, איפה כל מה שסימנתי ועשיתי")
// - כל שורה כאן חייבת להצביע על תוכן אמיתי מה-state (הרעיון עצמו, ההוק
// עצמו, הפורמט עצמו, ובמסלול קטע מצולם - איזה ליקוט ספציפי בדיוק נעשה),
// לא תיאור כללי של השלב.
function buildSummarySteps() {
  const steps = [];
  if (state.branch === 'footage') {
    steps.push('בחרת קטע מצולם קיים.');
    if (state.footageKind === 'speech') {
      steps.push('עברת את שלושת שלבי הליקוט על הדיבור בקטע: מציאת רגע חזק, קיצור, וחידוד שיווקי.');
      steps.push('סימנת לפי Hook → Point → Proof → End שהקטע מוכן.');
    } else if (state.footageOutcome === 'extract') {
      steps.push('מצאת בקטע רגע חזק שעומד בפני עצמו, וליקטת אותו: חיתוך קרוב לרגע, הוק אם צריך, כתוביות.');
    } else if (state.footageOutcome === 'message') {
      steps.push('לא היה רגע עצמאי, אז בנית סביב הקטע מסר: הוק ← הסבר קצר ← הקטע כהמחשה.');
    } else if (state.footageOutcome === 'story') {
      steps.push('לא היה רגע עצמאי, אז בנית סביב הקטע סיפור: לפני ← מה קרה ← תהליך ← תוצאה.');
    }
    steps.push('עכשיו: ללכת לערוך בדיוק לפי מה שסימנת, ואז להעלות.');
  } else if (state.branch === 'reference' || state.branch === 'idea-search') {
    steps.push(state.branch === 'reference' ? 'מצאת רפרנס מוכן במאגר שלך.' : 'מצאת רפרנס בעצמך לפי מילות החיפוש שקיבלת.');
    steps.push('תימללת את הרפרנס.');
    steps.push(`בחרת הוק: "${state.hook || ''}".`);
    steps.push('הוספת את המילים שלך לתסריט.');
    steps.push('קראת את התסריט בקול וידעת שהוא מוכן.');
    steps.push('עכשיו: ללכת לצלם לפי התסריט למטה, ואז לערוך.');
  } else if (state.branch === 'scratch') {
    steps.push(`הרעיון שלך: "${state.ideaDescription || ''}".`);
    steps.push(`בחרת הוק: "${state.hook || ''}".`);
    steps.push(`חיזקת את ההוק: "${state.hookReinforcement || ''}".`);
    steps.push('קיבלת תסריט סופי מזוקק.');
    steps.push('עכשיו: ללכת לצלם לפי התסריט למטה, ואז לערוך.');
  } else if (state.branch === 'idea') {
    steps.push(`הרעיון שלך: "${state.ideaDescription || state.hook || ''}", ווידאת שהוא רלוונטי.`);
    if (state.selectedFormat) steps.push(`בחרת פורמט הנגשה: "${state.selectedFormat}".`);
    steps.push('קבעת שהתוכן הזה לא צריך תסריט כתוב.');
    steps.push('עכשיו: פתחי/פתח מצלמה וצלמי/צלם - ישירות, ספונטני או ויזואלי, לפי הרעיון למעלה.');
  }
  return steps;
}

// 17/10/2026 (מאיה: "הייתי שמחה שבסוף יהיה כתוב גם את התסריט"): מחזיר את
// הטקסט הסופי שבאמת נכתב במסלול הזה, איזה שדה שלא יהיה.
function finalScriptText() {
  if (state.branch === 'footage') return state.herWords || null;
  if (state.branch === 'reference' || state.branch === 'idea-search') return state.finalScript || null;
  if (state.branch === 'scratch') return state.draftScript || null;
  return null;
}

// 17/10/2026 (רעיון #47, "בנית תוך X דקות"): זמן שחלף מרגע פתיחת העוזר
// ועד הסיכום - סטטיסטיקת גאווה, לא מדידה מדויקת של זמן צילום/עריכה בפועל.
function elapsedSinceStart() {
  if (!sessionStartTs) return null;
  return formatElapsed(Date.now() - sessionStartTs);
}

function renderSummary() {
  const steps = buildSummarySteps();
  const stepsHtml = steps.map((s, i) => `<li><span class="cosmic-summary-num">${i + 1}</span><div>${escapeHtml(s)}</div></li>`).join('');
  const script = finalScriptText();
  const elapsed = elapsedSinceStart();
  const card = cosmicCard(`
    <h2>🎬 מוכן! הנה בדיוק מה קרה</h2>
    ${elapsed ? `<div class="cosmic-today-challenge"><div class="cosmic-today-challenge__icon">⏱️</div><div>בנית את זה תוך <strong>${elapsed}</strong>!</div></div>` : ''}
    <ul class="cosmic-summary-list">${stepsHtml}</ul>
    ${script ? `<p style="font-weight:700;text-align:right;margin-bottom:8px">הטקסט/תסריט הסופי שלך:</p>
      <div class="cosmic-prompt-box">${escapeHtml(script)}</div>
      ${copyBtn(script, 'להעתיק את הטקסט')}` : ''}
    ${state.referenceLink ? `<p style="font-weight:700;text-align:right;margin:14px 0 6px">הסרטון ששוכפל:</p>
      <p class="cosmic-context-box" dir="ltr" style="text-align:left;word-break:break-all">
        <a href="${escapeHtml(state.referenceLink)}" target="_blank" rel="noopener">${escapeHtml(state.referenceLink)}</a>
      </p>` : ''}
    ${state.transcript ? `<details class="cosmic-accordion-item" style="margin-top:10px">
        <summary><span>התמלול של הרפרנס</span></summary>
        <div class="cosmic-accordion-body"><div class="va-read-script">${escapeHtml(state.transcript)}</div></div>
      </details>` : ''}
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-restart-btn">ליצור סרטון נוסף</button>
    </div>
  `, { showProgress: false });
  // 17/10/2026 (רעיון #2): קונפטי אמיתי בסיום.
  burstConfetti(card);
  if (script) wireCopyButtons(screenEl());
  document.getElementById('va-restart-btn').addEventListener('click', restart);
}

function render() {
  if (state.screen === 'opening') return renderOpening();
  if (state.screen === 'reference-source-choice') return renderReferenceSourceChoice();
  if (state.screen === 'idea-source-choice') return renderIdeaSourceChoice();
  if (state.screen === 'type-idea') return renderTypeIdea();
  if (state.screen === 'relevance-check') return renderRelevanceCheck();
  if (state.screen === 'pulled-idea') return renderPulledIdea();
  if (state.screen === 'pulled-reference') return renderPulledReference();
  if (state.screen === 'footage-type-choice') return renderFootageTypeChoice();
  if (state.screen === 'footage-speech-find') return renderFootageSpeechFind();
  if (state.screen === 'footage-speech-shorten') return renderFootageSpeechShorten();
  if (state.screen === 'footage-speech-sharpen') return renderFootageSpeechSharpen();
  if (state.screen === 'footage-speech-done') return renderFootageSpeechDone();
  if (state.screen === 'footage-visual-scan') return renderFootageVisualScan();
  if (state.screen === 'footage-visual-extract') return renderFootageVisualExtract();
  if (state.screen === 'footage-visual-reframe') return renderFootageVisualReframe();
  if (state.screen === 'footage-visual-message') return renderFootageVisualMessage();
  if (state.screen === 'footage-visual-story') return renderFootageVisualStory();
  if (state.screen === 'format-choice') return renderFormatChoice();
  if (state.screen === 'needs-script-check') return renderNeedsScriptCheck();
  if (state.screen === 'has-idea-choice') return renderHasIdeaChoice();
  if (state.screen === 'transcribe') return renderTranscribe();
  if (state.screen === 'prompt1') return renderPrompt1();
  if (state.screen === 'her-words') return renderHerWords();
  if (state.screen === 'prompt2') return renderPrompt2();
  if (state.screen === 'read-aloud') return renderReadAloud();
  if (state.screen === 'angle') return renderAngle();
  if (state.screen === 'angle-check') return renderAngleCheck();
  if (state.screen === 'scratch-intro') return renderScratchIntro();
  if (state.screen === 'scratch-dump') return renderScratchDump();
  if (state.screen === 'scratch-hook') return renderScratchHook();
  if (state.screen === 'scratch-hook-reinforce') return renderScratchHookReinforce();
  if (state.screen === 'scratch-distill') return renderScratchDistill();
  if (state.screen === 'summary') return renderSummary();
  cosmicCard(`<p>מסך לא מוכר: "${state.screen}"</p>`);
}

export function wireVideoAssistantView() {
  document.getElementById('video-assistant-mute-btn').addEventListener('click', (e) => {
    const muted = !getMuted();
    setMuted(muted);
    e.target.textContent = muted ? '🔇' : '🔊';
  });
  document.getElementById('video-assistant-mute-btn').textContent = getMuted() ? '🔇' : '🔊';

  // 17/10/2026 (רעיון #14, "שובל חלקיקים"): מופעל פעם אחת על כל אזור
  // התצוגה, לא בכל רענון מסך - מאזין ל-pointermove גם מעל כרטיס שמתחלף.
  startParticleTrail(document.getElementById('video-assistant-view'));
  // 17/10/2026 (רעיון #22, "SOS כשאין אינטראקציה"): כל קליק/הקלדה בתוך
  // התצוגה מאפסים את טיימר ה-idle, כדי שהמסקוט לא יקפוץ בזמן שבפועל
  // כן עובדים (רק כשבאמת נתקעים זמן-מה).
  document.getElementById('video-assistant-view').addEventListener('click', resetIdleTimer);
  document.getElementById('video-assistant-view').addEventListener('input', resetIdleTimer);

  // 18/10/2026 (לקוחה אמיתית, דרך מאיה: "עניתי בצ'אט על השאלות... זה
  // ריפרש לי והייתי צריכה להתחיל מחדש") - ה"תיקון" מ-17/10 (למעלה,
  // "תמיד מתחילה מחדש") פתר את הבעיה של מאיה (נכנסת ישר אחרי שסיימה,
  // חוזרת לסשן ישן ולא רלוונטי) אבל שבר בדיוק את מה שהתכנון המקורי
  // התכוון אליו: "רענון דף/חזרה תוך כדי עבודה בלי לאבד התקדמות"
  // (docs/superpowers/specs/2026-10-13-video-creation-assistant-design.md).
  // הפתרון הנכון לשתי התלונות גם יחד: לשחזר רק סשן *טרי* (לא סיום,
  // לא פתיחה, ונשמר לאחרונה) - לא כל סשן ישן.
  const RESUME_WINDOW_MS = 2 * 60 * 60 * 1000;
  /* 20/10/2026 (מאיה: "המסך של העוזר נפתח אבל לא מופיע כלום, ריק"): הציור
     של המסך קרה רק בלחיצה על הכרטיס שבמרכז הלמידה. הלשונית של מנוי
     הרפרנסים פתחה את התצוגה בלי לצייר בה כלום. שני הכפתורים מתחילים עכשיו
     באותה דרך בדיוק. */
  const startAssistant = async () => {
    let saved = null;
    try {
      saved = await loadSession();
    } catch (err) {
      console.error('loadSession failed:', err);
    }
    const isFresh = saved && saved.updatedAt && (Date.now() - saved.updatedAt) < RESUME_WINDOW_MS;
    const isResumable = isFresh && saved.screen && saved.screen !== 'summary' && saved.screen !== 'opening';
    state = isResumable ? saved : INITIAL_STATE;
    // 16/10/2026: סשנים ישנים שנשמרו לפני כפתור החזרה לא יכילו history -
    // בלי זה BACK על סשן ישן יקרוס על undefined.length.
    if (!state.history) state.history = [];
    sessionStartTs = Date.now();
    resumedNotice = Boolean(isResumable);
    render();
  };
  document.getElementById('hub-link-video-assistant').addEventListener('click', startAssistant);
  const refsTab = document.getElementById('tab-video-assistant');
  if (refsTab) refsTab.addEventListener('click', startAssistant);
}
