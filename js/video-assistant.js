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

import { mountDrafts, clearScreenDrafts } from './video-assistant-drafts.js';
import { INITIAL_STATE, nextStep } from './video-assistant-flow.js';
import { pickIdea, pickReference } from './video-assistant-picker.js';
import { buildDuplicationPrompt, buildReverseDuplicationPrompt, buildScriptPrompt, buildCreativePackagingPrompt } from './video-assistant-prompts.js';
import {
  FORMATS, SCRIPT_STRUCTURE, STARTING_POINTS, CONTENT_TYPES,
  buildExtractionPrompt, buildHookFindingPrompt, buildHookReinforcementPrompt, buildScriptDistillationPrompt,
} from './video-assistant-content.js';
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
  pickEncouragement, domainTheme, formatElapsed,
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
/* 26/10/2026 (מאיה, צילום מסך): הכותרת אמרה "שלב 2 מתוך 5: בדיקת התאמה"
   בזמן שעל המסך היה כתוב "בוא נדייק את הרעיון". שם הפאזה מתאים לכמה
   מסכים, ולכן מסך שצריך שם משלו מקבל אותו כאן. */
const SCREEN_LABEL = {
  'idea-sharpen': 'הרעיון והמסר',
  'creative-packaging': 'האריזה הקריאייטיבית',
  'content-basics': 'נקודת יציאה וסוג תוכן',
};
const PHASE_BY_SCREEN = {
  opening: 0, 'reference-source-choice': 0, 'idea-source-choice': 0, 'type-idea': 0, 'pulled-idea': 0, 'pulled-reference': 0,
  'relevance-check': 1,
  'content-basics': 2, 'footage-type-choice': 2, 'format-choice': 2, 'needs-script-check': 2, 'has-idea-choice': 2,
  transcribe: 3, prompt1: 3, 'her-words': 3, prompt2: 3, 'read-aloud': 3,
  'idea-sharpen': 1, 'creative-packaging': 1, 'scratch-intro': 3, 'scratch-dump': 3, 'scratch-hook': 3, 'scratch-hook-reinforce': 3, 'scratch-distill': 3,
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
  const leaving = state.screen;
  const drafts = state.drafts || {};
  state = nextStep(state, action);
  /* מה שהוקלד במסך שעזבנו כבר הפך לסטייט אמיתי, ולכן הטיוטה שלו מיותרת.
     אם היא תישאר, היא עלולה למלא מחדש תיבה שנוקתה בכוונה. */
  state.drafts = state.screen === leaving ? drafts : clearScreenDrafts(drafts, leaving);
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

// 17/10/2026 (מאיה, רעיון #6): פס התקדמות נוזלי זוהר במקום נקודות סטטיות.
// 28/10/2026: שרשרת ה-DNA שמתחתיו ירדה. שלושה מדי התקדמות באותו מסך
// היו רעש לפני השאלה עצמה, ואחד מספיק.
function progressHtml() {
  const current = PHASE_BY_SCREEN[state.screen] ?? 0;
  const pct = Math.round(((current + 1) / PHASES.length) * 100);
  return `
    <div class="cosmic-progress__label">שלב ${current + 1} מתוך ${PHASES.length}: ${escapeHtml(SCREEN_LABEL[state.screen] || PHASES[current])}</div>
    <div class="cosmic-liquid-bar"><div class="cosmic-liquid-fill" style="width:${pct}%"></div></div>`;
}

function backButtonHtml() {
  return state.history.length
    ? `<button type="button" class="cosmic-back-btn" id="va-back-btn" aria-label="חזרה אחורה">→</button>`
    : '';
}

// 17/10/2026 (מאיה, רעיון #7): מסקוט קוסמי קבוע שמגיב רגשית לפי המסך -
// חי בכל cosmicCard, לא רק במסכים ספציפיים. מחזיר את אלמנט הכרטיס עצמו
// כדי שפעולות כמו flipReveal (#12) יוכלו להפעיל עליו אנימציה.
/* 23/10/2026 (מאיה: "במובייל המסך של העוזר כל הזמן יורד למטה באוטומט",
   "ה-UI UX באייפון ממש ממש לא נוח, כל רגע המסך קופץ").

   זה לא היה קוד שגולל, אלא קוד שלא גלל: הכפתור שמעביר מסך יושב בתחתית
   הכרטיס, ולכן בזמן הלחיצה הדף כבר גלול למטה. המסך מתחלף, הדפדפן שומר
   את מצב הגלילה, והמסך החדש נפתח באמצעו או בתחתיתו. מבחוץ זה נראה
   בדיוק כמו "המסך ירד למטה מעצמו", וצריך לגלול למעלה כדי למצוא את
   הכותרת.

   instant ולא smooth: גלילה מונפשת בזמן שהתוכן התחלף היא בדיוק
   ה"קפיצה" שהיא מתארת. */
function scrollToCardTop() {
  const view = document.getElementById('video-assistant-view');
  if (view && view.scrollTop) view.scrollTop = 0;
  try {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  } catch (err) {
    window.scrollTo(0, 0);   /* דפדפן שלא מכיר behavior: instant */
  }
}

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
  scrollToCardTop();
  const card = document.getElementById('va-card');
  /* 26/10/2026: כל תיבת טקסט בכרטיס נשמרת תוך כדי כתיבה, חוזרת לעצמה
     כשהמסך מצויר מחדש, ויש שורה שאומרת מתי נשמר. עד כאן הסשן נשמר רק
     במעבר מסך, ולכן רענון באמצע כתיבה מחק את התסריט. */
  mountDrafts(card, {
    screen: state.screen,
    getDrafts: () => state.drafts || {},
    setDrafts: (d) => { state.drafts = d; },
    save: () => saveSession(state),
  });
  return card;
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

/* #22 (מסקוט SOS שקפץ לבד אחרי 25 שניות) הוסר ב-28/10/2026: הוא הציע רק
   חזרה או התחלה מחדש, ששתיהן כבר על המסך, והיה צורה שלישית של עזרה.
   העזרה האמיתית היא כפתורי ה-SOS במסכי המגילה. */
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
      <button type="button" class="cosmic-btn" id="va-idea-btn">יש לי רעיון</button>
      <button type="button" class="cosmic-btn" id="va-reference-btn">סרטון שאהבתי (שכפול)</button>
      <button type="button" class="cosmic-btn" id="va-footage-btn">יש לי קטע שצולם</button>
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
    <textarea class="cosmic-textarea" id="va-type-idea-input" placeholder="לכתוב כאן את הרעיון..."></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-type-idea-done-btn">ממשיכים ←</button>
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
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-accept-idea-btn">ממשיכים ←</button>
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
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-speech-find-next-btn">ממשיכים ←</button>
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
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-speech-shorten-next-btn">ממשיכים ←</button>
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
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-speech-sharpen-next-btn">ממשיכים ←</button>
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
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-speech-done-btn">ממשיכים ←</button>
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
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-visual-extract-done-btn">ממשיכים ←</button>
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
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-visual-outcome-ready-btn">ממשיכים ←</button>
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
      cosmicCard(`<h2>אין עדיין רפרנסים בתחום הזה</h2><p>לבחור "יש לי רעיון מ-0" במקום, או לחזור מאוחר יותר.</p>`);
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
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-accept-ref-btn">ממשיכים ←</button>
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

/* 28/10/2026 (מאיה: "עומס מנטלי"): הפרומפט המלא הוצג בכל מסך כקופסת
   טקסט ארוכה שאף אחת לא צריכה לקרוא, רק להעתיק. עכשיו הוא סגור מאחורי
   שורה אחת, והכפתור שמעתיק אותו הוא מה שבולט. הצהוב עדיין שם למי שפותחת. */
function promptPeek(html) {
  return `<details class="va-more va-prompt-peek"><summary>לראות את הפרומפט</summary><div class="cosmic-prompt-box">${html}</div></details>`;
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
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-transcribe-done-btn">ממשיכים ←</button>
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
    ${promptPeek(highlightPlaceholders(prompt, highlightValues))}
    ${copyBtn(prompt, 'להעתיק פרומפט')}
    <textarea class="cosmic-textarea" id="va-hook-input" placeholder="להדביק כאן את ההוק שבחרת..." style="margin-top:14px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-hook-chosen-btn">ממשיכים ←</button>
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
  /* 28/10/2026 (מאיה: "באלי שתרשמי בכותרת מגילת אסתר ואני רוצה שהכפתור
     של ה-SOS ממש ממש ממש יבלוט כי הרבה כותבות מגילה מעפנה ואז זה יוצא
     גרוע"). הכותרת היא מגילת אסתר בשני המסלולים, ה-SOS הוא כפתור גדול
     ובולט, ו"להמשיך" עוצר קודם בפופאפ שבודק שהמגילה באמת מפורטת. */
  cosmicCard(`
    <h2>מגילת אסתר - מה יש לך להגיד?</h2>
    ${context ? `<div class="cosmic-context-box"><span>${isPreHookMegillah ? 'ההוק שזיהינו מהרפרנס:' : 'ההוק/הרעיון שבחרת:'}</span>${escapeHtml(context)}</div>` : ''}
    ${isPreHookMegillah
      ? `<p>עכשיו, לפני שמבקשים הוקים - לכתוב כאן את כל מה שיש לך להגיד על הנושא. לא צריך לנסח יפה: מה אתם חושבים על זה? למה? מה חשוב שהקהל יבין? איזה ניסיון או דוגמה יש לך?</p>`
      : `<p>עכשיו הזמן להרחיב עליו - סיפור קצר, דוגמא, או דיבור כללי על הנושא, במילים שלך</p>`}
    <button type="button" class="va-sos-big" id="va-herwords-help-btn">
      <span class="va-sos-big__icon" aria-hidden="true">🆘</span>
      <span class="va-sos-big__text"><strong>נתקעים? לא ברור מה לכתוב?</strong><span>לחיצה כאן, ו-ChatGPT ישאל אותך שאלות שיוציאו ממך מגילה מלאה</span></span>
    </button>
    <textarea class="cosmic-textarea" id="va-herwords-input" style="min-height:160px">${isPreHookMegillah && state.herWords ? escapeHtml(state.herWords) : ''}</textarea>
    ${megillahMeterHtml('va-herwords')}
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-herwords-done-btn">ממשיכים ←</button>
    </div>
  `);
  document.getElementById('va-herwords-help-btn').addEventListener('click', openExtractionHelperModal);
  wireMegillahGate({
    prefix: 'va-herwords',
    inputId: 'va-herwords-input',
    doneId: 'va-herwords-done-btn',
    onGo: (text) => dispatch({ type: 'HER_WORDS_SUBMITTED', text }),
  });
}

/* 28/10/2026 (מאיה: "הרבה מפספסים את ה-SOS, שזה שלב קריטי... ויוצא להם
   גרוע"). בנתונים: מגילה של 23 מילים ושפיכות של 40 ו-46 מילים הגיעו עד
   תסריט, אף אחת דרך ה-SOS. לכן מחסום אמיתי ולא רק תזכורת: מתחת ל-120 מילים
   "להמשיך" פותח רק את ה-SOS. מעל, פופאפ אחרון שמוודא שזה מפורט. הרף אושר
   על ידה. */
export const MEGILLAH_MIN_WORDS = 120;

export function countWords(text) {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}

function megillahMeterHtml(prefix) {
  return `<p class="va-megillah-meter" id="${prefix}-meter" aria-live="polite"></p>`;
}

function wireMegillahGate({ prefix, inputId, doneId, onGo }) {
  const input = document.getElementById(inputId);
  const meter = document.getElementById(`${prefix}-meter`);
  const paint = () => {
    const n = countWords(input.value);
    const ok = n >= MEGILLAH_MIN_WORDS;
    meter.classList.toggle('va-megillah-meter--ok', ok);
    meter.textContent = ok
      ? `${n} מילים ✓ אפשר להמשיך`
      : `${n} מתוך ${MEGILLAH_MIN_WORDS} מילים לפחות. עוד ${MEGILLAH_MIN_WORDS - n} כדי להמשיך`;
  };
  input.addEventListener('input', paint);
  paint();
  document.getElementById(doneId).addEventListener('click', () => {
    const text = input.value.trim();
    if (!text) {
      showToast('צריך לכתוב משהו קודם');
      return;
    }
    if (countWords(text) < MEGILLAH_MIN_WORDS) {
      megillahTooShort(countWords(text), inputId);
      return;
    }
    confirmMegillahDetailed(text, { inputId, onGo });
  });
}

function megillahTooShort(words, inputId) {
  const overlay = openModal(`
    <h2 style="margin-top:0">המגילה קצרה מדי 🛑</h2>
    <p>כתבת ${words} מילים, וצריך לפחות ${MEGILLAH_MIN_WORDS}. ממגילה קצרה יוצא תסריט חלש, כי ChatGPT לא יכול להמציא את מה שלא סופר לו.</p>
    <p><strong>זה בדיוק הרגע ל-SOS:</strong> הוא ישאל שאלות שיוציאו את כל החומר.</p>
    <button type="button" class="va-sos-big" id="va-short-sos-btn">
      <span class="va-sos-big__icon" aria-hidden="true">🆘</span>
      <span class="va-sos-big__text"><strong>לקבל עזרה להוציא עוד חומר</strong><span>מקבלים פרומפט, מדביקים ב-ChatGPT, עונים על השאלות</span></span>
    </button>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn" id="va-short-back-btn">לחזור ולכתוב עוד</button>
    </div>
  `);
  overlay.querySelector('#va-short-sos-btn').addEventListener('click', () => {
    closeModal();
    openExtractionHelperModal();
  });
  overlay.querySelector('#va-short-back-btn').addEventListener('click', () => {
    closeModal();
    const input = document.getElementById(inputId);
    if (input) input.focus();
  });
}

/* 28/10/2026 (מאיה: "אולי תעשי פופאפ אחרי החלק הזה, בטוח כתבת מגילה מספיק
   מפורטת, ועוד פעם כפתור SOS לחדד כמה זה חשוב"). כל מה שנכתב כאן הוא חומר
   הגלם של התסריט, ו-ChatGPT לא יכול להמציא את מה שלא סופר לו. */
function confirmMegillahDetailed(text, { inputId, onGo }) {
  const words = countWords(text);
  const overlay = openModal(`
    <h2 style="margin-top:0">רגע לפני שממשיכים ✋</h2>
    <p><strong>המגילה באמת מספיק מפורטת?</strong></p>
    <p>מגילה דלה = תסריט חלש. כל מה שנכתב כאן הוא חומר הגלם של הסרטון, ו-ChatGPT לא יכול להמציא את מה שלא סופר לו: הדוגמאות, הסיפורים, מה באמת חושבים על הנושא.</p>
    <p class="va-megillah-count">כתבת ${words} מילים</p>
    <button type="button" class="va-sos-big" id="va-megillah-sos-btn">
      <span class="va-sos-big__icon" aria-hidden="true">🆘</span>
      <span class="va-sos-big__text"><strong>לחדד את המגילה עם עזרה</strong><span>ChatGPT ישאל אותך שאלות ויוציא ממך עוד חומר</span></span>
    </button>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn" id="va-megillah-back-btn">לחזור ולהוסיף עוד</button>
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-megillah-go-btn">כן, היא מפורטת. להמשיך</button>
    </div>
  `);
  overlay.querySelector('#va-megillah-sos-btn').addEventListener('click', () => {
    closeModal();
    openExtractionHelperModal();
  });
  overlay.querySelector('#va-megillah-back-btn').addEventListener('click', () => {
    closeModal();
    const input = document.getElementById(inputId);
    if (input) input.focus();
  });
  overlay.querySelector('#va-megillah-go-btn').addEventListener('click', () => {
    closeModal();
    onGo(text);
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
    ${promptPeek(highlightPlaceholders(prompt, [hook, state.herWords, state.transcript]))}
    ${copyBtn(prompt, 'להעתיק פרומפט')}
    <textarea class="cosmic-textarea" id="va-prompt2-script-input" placeholder="להדביק כאן את התסריט שקיבלת..." style="margin-top:14px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-script-ready-btn">ממשיכים ←</button>
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
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-read-done-btn">ממשיכים ←</button>
    </div>
  `);
  document.getElementById('va-read-done-btn').addEventListener('click', () => {
    celebrate();
    dispatch({ type: 'CONFIRM_DONE' });
  });
}

// ===== מסלול "כתיבה מאפס" - 4 הפרומפטים האמיתיים (16/10) =====
/* 26/10/2026 (מאיה): "בחלק של כתיבת תסריט מ-0 יש שם תקלה חמורה, שאת
   שואלת אותם מה הזווית הנגשה, אבל זה טעות. אמור להיות רק צ'אט שמדייק
   את הרעיון, שעובד וברור בלי תקלות UI UX".

   ירד: מסך בחירת זווית מתוך 31, ומסך "הזווית שבחרת" עם שדה נימוק.
   נשאר: צ'אט אחד שמדייק את הרעיון, והרעיון שיוצא ממנו הוא זה שממשיך.

   מה שתוקן בצ'אט עצמו, כי שלושת אלה היו תקלות אמיתיות:
     לחיצה על "שליחה" בזמן שהוא עונה לא עשתה כלום ולא אמרה כלום
     Enter בתיבה הוסיף שורה במקום לשלוח, גם כשהמקלדת הציגה "שליחה"
     כישלון רשת הציג הודעה בלי שום דרך לנסות שוב */
function renderIdeaSharpen() {
  /* הטיוטה גוברת על המצב, כי היא החדשה מבין השתיים. בלי זה התיבה
     הציגה את הרעיון הישן בעוד שהצ'אט דיבר על מה שהוקלד - בדיוק
     ה"לא קולט את הרעיון שלי" שמאיה דיווחה עליו. */
  const draft = (state.drafts || {})['idea-sharpen|va-idea-sharp'];
  const idea = (draft !== undefined ? draft : (state.ideaTopic || state.ideaDescription || ''));
  const punchDraft = (state.drafts || {})['idea-sharpen|va-idea-punch'];
  const punch = (punchDraft !== undefined ? punchDraft : (state.ideaPunchline || ''));
  /* 28/10/2026: אותו מסך משרת עכשיו גם קטע שצולם. שם זה לא "רעיון
     לסרטון" אלא המסר שבונים סביב חומר שכבר קיים, ולכן הכותרת והדוגמה
     מדברות על הקטע. */
  const forFootage = state.branch === 'footage';
  /* מסלול "יש לי רעיון" מתחיל כאן ישר מהפתיחה, ולכן רק בו יש קישור
     להגרלה ותיבת סימון של בדיקת הרלוונטיות (שהיו פעם מסכים נפרדים). */
  const fromIdea = state.branch === 'idea';

  /* 28/10/2026 (מאיה): "כל החלק של הרעיון שלך במשפט אחד מסובך, מיליון
     טקסט, מבלבל ועושה כאב ראש, חייב לפשט הכל". ירדו פסקת הפתיחה, שלושת
     הצעדים הממוספרים ושתי שורות ההסבר. נשארו כותרת, תיבות וכפתורים:
     השאלות שעל התיבות הן ההסבר. */
  cosmicCard(`
    <h2>${forFootage ? 'המסר של הקטע' : 'הרעיון שלך'}</h2>

    <label class="cosmic-field-label" for="va-idea-sharp">${forFootage ? 'מה המסר של הקטע שכבר צולם?' : 'על מה הסרטון?'}</label>
    <textarea class="cosmic-textarea" id="va-idea-sharp" style="min-height:${forFootage ? 96 : 56}px"
      placeholder="${forFootage ? 'למשל: למה אני עובדת עם מכשיר אחד ולא עם שלושה' : 'למשל: החלקה לשיער'}">${escapeHtml(idea)}</textarea>
    ${fromIdea ? '<button type="button" class="va-text-link" id="va-pull-idea-link">🎲 אין לי רעיון? להגריל מבנק הרעיונות</button>' : ''}
    ${forFootage ? '' : `
    <label class="cosmic-field-label va-punch-label" for="va-idea-punch">⭐ מה הפואנטה שורה תחתונה מהסרטון? מה אתם רוצים שהקהל שלכם יבין? מה המסר?</label>
    <textarea class="cosmic-textarea va-punch-box" id="va-idea-punch" style="min-height:96px"
      placeholder="למשל: החלקה שורפת את השיער מבפנים גם כשהוא נראה מבריק, ויש דרך להחליק בלי לשלם על זה">${escapeHtml(punch)}</textarea>`}


    ${fromIdea ? `<label class="va-check-row">
      <input type="checkbox" id="va-relevance-check" ${state.relevanceConfirmed ? 'checked' : ''}>
      <span>הרעיון רלוונטי לקהל היעד שלי, או משרת את המותג (מציג את האישיות, הערכים או תפיסת העולם שלי)</span>
    </label>` : ''}

    <div class="cosmic-btn-row" style="margin-top:16px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-idea-next-btn">ממשיכים ←</button>
    </div>
  `);

  const box = document.getElementById('va-idea-sharp');
  /* 28/10/2026 (מאיה): "חייב עוד סעיף שהוא הכי קריטי - מה הפואנטה של
     הסרטון? מה המסר? ואז הפואנטה הופכת להיות הרעיון, ורק אז הצ'אט".
     בלי מסך נוסף: הפואנטה יושבת באותו מסך, מתחת לנושא. היא חובה, הצ'אט
     מחדד אותה, והניסוח שלו נכנס לתיבה שלה. מה שממשיך הלאה הוא הפואנטה,
     עם הנושא לצידה רק אם היא לא מזכירה אותו בעצמה. */
  const punchBox = forFootage ? null : document.getElementById('va-idea-punch');
  function mainIdea() {
    const topic = box.value.trim();
    if (!punchBox) return topic;
    const p = punchBox.value.trim();
    return topic && !p.includes(topic) ? `${p}. נושא הסרטון: ${topic}` : p;
  }
  document.getElementById('va-idea-next-btn').addEventListener('click', () => {
    if (punchBox && !punchBox.value.trim()) {
      showToast('חסרה הפואנטה: מה הם צריכים לצאת איתו מהסרטון?');
      punchBox.focus();
      return;
    }
    const text = mainIdea();
    if (!text) {
      showToast(forFootage ? 'קודם לכתוב את המסר בתיבה' : 'קודם לכתוב את הרעיון בתיבה');
      box.focus();
      return;
    }
    const relevance = document.getElementById('va-relevance-check');
    if (relevance && !relevance.checked) {
      showToast('רגע לפני שממשיכים: לסמן שהרעיון רלוונטי לקהל או משרת את המותג');
      relevance.focus();
      return;
    }
    if (relevance) state.relevanceConfirmed = true;
    dispatch(punchBox
      ? { type: 'IDEA_SHARPENED', idea: text, topic: box.value.trim(), punchline: punchBox.value.trim() }
      : { type: 'IDEA_SHARPENED', idea: text });
  });
  const pullLink = document.getElementById('va-pull-idea-link');
  if (pullLink) pullLink.addEventListener('click', async () => {
    if (!ideasCache) ideasCache = await fetchIdeas();
    const picked = pickIdea(ideasCache, null);
    if (!picked) {
      showToast('אין עדיין רעיונות שמורים בבנק הרעיונות');
      return;
    }
    currentPickId = picked.id;
    dispatch({ type: 'CHOOSE_PULL_IDEA' });
  });
}

/* 28/10/2026 (מאיה): "זהו הצ'אט בתכלס זה הזווית הקריאייטיבית, אבל הוא
   לא מתקרב לרמה של הג'מיני". במקום הצ'אט, הפרומפט שהיא עצמה כותבת
   לג'מיני, ממולא בתחום, בקהל, ברעיון ובמסר. הכיוון שבוחרים מתוך ה-30
   נוסע הלאה לפרומפטים של ההוק והתסריט. */
async function renderCreativePackaging() {
  const idea = state.ideaTopic && state.ideaPunchline
    ? `${state.ideaTopic}. המסר: ${state.ideaPunchline}`
    : (state.ideaBeforePackaging || state.ideaDescription || '');
  const audience = await myAudience();
  const domain = domainInfo ? domainInfo.domain : '';
  const prompt = buildCreativePackagingPrompt({ domain, audience, idea });
  /* 28/10/2026 (מאיה: "תעשי מה שחכם ונוח יותר"). נקודת היציאה וסוג
     התוכן היו מסך נפרד בין האריזה לפורמט. הם החלטות על אותו "איך",
     ולכן ישבו כאן, מתחת לכיוון שנבחר. בקטע שצולם הם נקבעו בצילום. */
  const withBasics = state.branch !== 'footage';
  cosmicCard(`
    <h2>האריזה הקריאייטיבית</h2>
    <p>איך מגישים את המסר בצורה מעניינת ולא בנאלית. להעתיק לג'מיני, לבחור מתוך ה-30 את הכיוון שהכי מדליק, ולהדביק אותו כאן.</p>
    ${promptPeek(highlightPlaceholders(prompt, [domain, audience, idea]))}
    ${copyBtn(prompt, "להעתיק פרומפט לג'מיני")}
    <textarea class="cosmic-textarea" id="va-packaging-input" placeholder="להדביק כאן את הכיוון שבחרת..." style="margin-top:14px">${state.packaging ? escapeHtml(state.packaging) : ''}</textarea>
    ${withBasics ? `
    <p class="cosmic-field-label" style="margin-top:16px">מאיפה הסרטון יוצא?</p>
    <div class="cosmic-chip-row" id="va-start-row">${chips(STARTING_POINTS, state.startingPoint, 'data-start')}</div>
    <p class="cosmic-field-label" style="margin-top:14px">איזה סוג תוכן זה?</p>
    <div class="cosmic-chip-row" id="va-type-row">${chips(CONTENT_TYPES, state.contentType, 'data-type')}</div>` : ''}
    <div class="cosmic-btn-row" style="margin-top:16px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-packaging-done-btn">ממשיכים ←</button>
    </div>
  `);
  wireCopyButtons(screenEl());
  let startingPoint = state.startingPoint;
  let contentType = state.contentType;
  wireChips('[data-start]', 'data-start', (v) => { startingPoint = v; });
  wireChips('[data-type]', 'data-type', (v) => { contentType = v; });
  document.getElementById('va-packaging-done-btn').addEventListener('click', () => {
    const packaging = document.getElementById('va-packaging-input').value.trim();
    if (!packaging) {
      showToast('צריך להדביק את הכיוון שבחרת קודם');
      return;
    }
    if (withBasics && (!startingPoint || !contentType)) {
      showToast('לבחור מאיפה הסרטון יוצא ואיזה סוג תוכן זה');
      return;
    }
    dispatch(withBasics
      ? { type: 'PACKAGING_CHOSEN', packaging, startingPoint, contentType }
      : { type: 'PACKAGING_CHOSEN', packaging });
  });
}

function chips(list, picked, attr) {
  return list.map((x) => `
    <button type="button" class="cosmic-btn cosmic-chip-btn${picked === x ? ' cosmic-chip-btn--on' : ''}" ${attr}="${escapeHtml(x)}">${escapeHtml(x)}</button>
  `).join('');
}

function wireChips(sel, attr, set) {
  document.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll(sel).forEach((o) => o.classList.remove('cosmic-chip-btn--on'));
    b.classList.add('cosmic-chip-btn--on');
    set(b.getAttribute(attr));
  }));
}

/* שלבים 2 ו-3 במסמך "סיכום כתיבת תסריטים": נקודת יציאה וסוג תוכן.
   היו שתי תיבות טקסט ריקות בתוך פופאפ אופציונלי, ולכן פרומפט חילוץ
   התוכן יצא בלעדיהם ברוב המקרים. כאן הם בחירה אמיתית, פעם אחת, והם
   נכנסים לפרומפט לבד. */
function renderContentBasics() {
  const opts = (list, picked, attr) => list.map((x) => `
    <button type="button" class="cosmic-btn cosmic-chip-btn${picked === x ? ' cosmic-chip-btn--on' : ''}" ${attr}="${escapeHtml(x)}">${escapeHtml(x)}</button>
  `).join('');
  cosmicCard(`
    <h2>שני דברים על הסרטון הזה</h2>
    <p class="cosmic-lede">בחירה אחת לכל שורה. שתיהן נכנסות אחר כך לפרומפטים לבד, בלי שתקלידי אותן שוב.</p>
    <p class="cosmic-field-label">מאיפה הסרטון יוצא?</p>
    <div class="cosmic-chip-row" id="va-start-row">${opts(STARTING_POINTS, state.startingPoint, 'data-start')}</div>
    <p class="cosmic-field-label" style="margin-top:14px">איזה סוג תוכן זה?</p>
    <div class="cosmic-chip-row" id="va-type-row">${opts(CONTENT_TYPES, state.contentType, 'data-type')}</div>
    <div class="cosmic-btn-row" style="margin-top:16px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-basics-next-btn">ממשיכים ←</button>
    </div>
  `);
  let startingPoint = state.startingPoint;
  let contentType = state.contentType;
  function wire(sel, attr, set) {
    document.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll(sel).forEach((o) => o.classList.remove('cosmic-chip-btn--on'));
      b.classList.add('cosmic-chip-btn--on');
      set(b.getAttribute(attr));
    }));
  }
  wire('[data-start]', 'data-start', (v) => { startingPoint = v; });
  wire('[data-type]', 'data-type', (v) => { contentType = v; });
  document.getElementById('va-basics-next-btn').addEventListener('click', () => {
    if (!startingPoint || !contentType) {
      showToast('לבחור נקודת יציאה וסוג תוכן');
      return;
    }
    dispatch({ type: 'BASICS_CONFIRMED', startingPoint, contentType });
  });
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
    <p style="font-size:13px">זה בנאי פרומפט בלבד: ממלאים כאן, מקבלים פרומפט מוכן, מעתיקים אותו ושולחים ל-ChatGPT - הוא ישאל שאלות שיוציאו ממך בדיוק מה להגיד. את התשובות שמתקבלות מ-ChatGPT מדביקים חזרה בתיבת הטקסט הגדולה (לא כאן במודאל).</p>
    <input type="text" class="cosmic-textarea" id="va-ext-contenttype" style="min-height:auto" placeholder="סוג תוכן (מכירתי / בעל ערך / בידורי / אישי)" value="${escapeHtml(state.contentType || '')}">
    <input type="text" class="cosmic-textarea" id="va-ext-startpoint" style="min-height:auto;margin-top:8px" placeholder="נקודת יציאה (סיפור אישי / סיפור לקוח / כללי)" value="${escapeHtml(state.startingPoint || '')}">
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
      ${promptPeek(highlightPlaceholders(prompt, [idea, contentType, startingPoint, audience]))}
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
    <button type="button" class="va-sos-big" id="va-scratch-help-btn">
      <span class="va-sos-big__icon" aria-hidden="true">🆘</span>
      <span class="va-sos-big__text"><strong>נתקעים? לא ברור מה לכתוב?</strong><span>לחיצה כאן, ו-ChatGPT ישאל אותך שאלות שיוציאו ממך מגילה מלאה</span></span>
    </button>
    <textarea class="cosmic-textarea" id="va-scratch-dump-input" style="min-height:160px" placeholder="כל מה שיש לך להגיד...">${state.rawDump ? escapeHtml(state.rawDump) : ''}</textarea>
    ${megillahMeterHtml('va-scratch')}
    <details class="va-more">
      <summary>איך בנוי תסריט טוב?</summary>
      <ul class="cosmic-summary-list">${SCRIPT_STRUCTURE.map((s) => `
        <li><span class="cosmic-summary-num">${s.step}</span><div><strong>${escapeHtml(s.name)}</strong><br>${escapeHtml(s.description)}</div></li>
      `).join('')}</ul>
    </details>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-scratch-dump-done-btn">ממשיכים ←</button>
    </div>
  `);
  document.getElementById('va-scratch-help-btn').addEventListener('click', openExtractionHelperModal);
  // 28/10/2026: אותו מחסום כמו במגילה של השכפול. כאן נכתבו 40 ו-46 מילים
  wireMegillahGate({
    prefix: 'va-scratch',
    inputId: 'va-scratch-dump-input',
    doneId: 'va-scratch-dump-done-btn',
    onGo: (text) => dispatch({ type: 'SCRATCH_DUMP_READY', text }),
  });
}

async function renderScratchHook() {
  const profile = await getProfile();
  const audience = profile && profile.primaryAudience ? profile.primaryAudience : '';
  const domain = domainInfo ? domainInfo.domain : '';
  /* 28/10/2026: השכפול ההפוך כבר לא מסלול נפרד עם מסך החלטה משלו.
     המגילה כבר כתובה כאן, ולכן מי שיש לה סרטון שעבד מדביקה את התמלול
     שלו, וההוקים נבנים בפרומפט השכפול ההפוך שלה (ההוק המקורי + המגילה).
     מי שאין לה, לא רואה מזה יותר משורה אחת סגורה. */
  const withRef = !!(state.transcript && state.openingHook);
  const prompt = withRef
    ? buildReverseDuplicationPrompt({ domain, audience, hook: state.openingHook, script: state.rawDump || '' })
    : buildHookFindingPrompt({ idea: state.ideaDescription || '', script: state.rawDump || '', audience, domain: domain });
  const marks = withRef
    ? [audience, domain, state.openingHook, state.rawDump]
    : [state.ideaDescription, state.rawDump, audience];
  cosmicCard(`
    <h2>מציאת הוק</h2>
    <p>${withRef
      ? 'ההוק של הסרטון שעבד + המגילה שלך: ChatGPT יביא 30 הוקים באותו מנגנון. להעתיק, להדביק, ולחזור עם ההוק שבחרת.'
      : 'הפרומפט כולל בנק הוקים אמיתי מוטמע - ChatGPT יתאים לך ממנו הוק מדויק. להעתיק, להדביק, ולחזור עם ההוק שבחרת.'}</p>
    ${withRef ? `<div class="cosmic-context-box"><span>ההוק שזיהינו מהסרטון:</span>${escapeHtml(state.openingHook)}</div>` : ''}
    <details class="va-more"${withRef ? ' open' : ''}>
      <summary>יש סרטון שעבד ושתרצו להיצמד אליו? (רשות)</summary>
      <textarea class="cosmic-textarea" id="va-hook-ref-input" placeholder="להדביק כאן את התמלול של הסרטון...">${state.transcript ? escapeHtml(state.transcript) : ''}</textarea>
      <div class="cosmic-btn-row" style="margin-top:8px">
        <button type="button" class="cosmic-btn" id="va-hook-ref-btn">לבנות את ההוקים לפי הסרטון</button>
        ${withRef ? '<button type="button" class="cosmic-btn" id="va-hook-ref-clear-btn">בלי הסרטון</button>' : ''}
      </div>
    </details>
    ${promptPeek(highlightPlaceholders(prompt, marks))}
    ${copyBtn(prompt, 'להעתיק פרומפט')}
    <textarea class="cosmic-textarea" id="va-scratch-hook-input" placeholder="להדביק כאן את ההוק שבחרת..." style="margin-top:14px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-scratch-hook-done-btn">ממשיכים ←</button>
    </div>
  `);
  wireCopyButtons(screenEl());
  document.getElementById('va-hook-ref-btn').addEventListener('click', async () => {
    const text = document.getElementById('va-hook-ref-input').value.trim();
    if (!text) {
      showToast('קודם להדביק את התמלול של הסרטון');
      return;
    }
    if (text !== state.transcript) state.openingHook = null;
    state.transcript = text;
    cosmicCard(`<p>מזהים את ההוק מתוך התמלול...</p>`, { showProgress: false });
    await ensureOpeningHook();
    /* היא יכלה ללחוץ "חזרה" בזמן הזיהוי. בלי הבדיקה הזו מסך ההוק היה
       מצויר מעל מסך אחר, והלחיצה הבאה הייתה נשלחת מהמסך הלא נכון. */
    if (state.screen !== 'scratch-hook') return;
    /* כשהזיהוי נכשל, ensureOpeningHook שם את כל התמלול בתור "ההוק", וזה
       בדיוק הבאג מ-19/10 (ChatGPT משכפל את כל הפסקה). כאן עדיף לומר
       שזה לא הצליח ולהישאר עם הפרומפט הרגיל. */
    if (state.openingHook === state.transcript) {
      state.openingHook = null;
      showToast('לא הצלחנו לזהות את ההוק בתמלול. אפשר לנסות שוב');
    }
    renderScratchHook();
  });
  const clearRef = document.getElementById('va-hook-ref-clear-btn');
  if (clearRef) clearRef.addEventListener('click', () => {
    state.transcript = null;
    state.openingHook = null;
    /* בלי זה הטיוטה של התיבה ממלאת אותה שוב בתמלול הישן. */
    const drafts = { ...(state.drafts || {}) };
    delete drafts['scratch-hook|va-hook-ref-input'];
    state.drafts = drafts;
    saveSession(state).catch((err) => console.error('saveSession failed:', err));
    renderScratchHook();
  });
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
    ${promptPeek(highlightPlaceholders(prompt, [state.ideaDescription, state.hook, state.rawDump]))}
    ${copyBtn(prompt, 'להעתיק פרומפט')}
    <textarea class="cosmic-textarea" id="va-scratch-reinforce-input" placeholder="להדביק כאן את חיזוק ההוק שבחרת..." style="margin-top:14px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-scratch-reinforce-done-btn">ממשיכים ←</button>
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

/* 26/10/2026 (מאיה: "הפרומפטים לא מדויקים בעליל, בטוח העתקת
   מהקובץ דוקס בול?"). הנוסח אכן הועתק מילה במילה. מה שלא
   הועבר הוא המילוי: הפרומפט האחרון, זה שכותב בפועל את התסריט,
   יצא בלי התחום ובלי קהל היעד. שלושת הפרומפטים שלפניו כן שלחו אותם,
   ולכן השיחה התחילה מדויקת והסתיימה כללית.
   זה בדיוק מה שהיא ביקשה ב-23/10 למסלול השכפול ("בפרומט השני של
   כתיבת תסריט מלא, הייתי כותבת למעלה שוב: התחום שלי הוא:"), ותוקן
   שם בלבד. אותו באג בדיוק, במסלול השני. */
async function renderScratchDistill() {
  const audience = await myAudience();
  const buildPrompt = (ctaType) => buildScriptDistillationPrompt({
    idea: state.ideaDescription || '', hook: state.hook || '', hookReinforcement: state.hookReinforcement || '',
    rawScript: state.rawDump || '', ctaType,
    audience, domain: domainInfo ? domainInfo.domain : '',
  });
  /* 28/10/2026 (מאיה): "מאוד קל לפספס איזו הנעה לפעולה רוצים, שימי לב".
     זו הייתה רשימה נפתחת שכבר בחרה "משפך" לבד, כך שאפשר היה להעתיק את
     הפרומפט בלי לראות שיש כאן בחירה בכלל. עכשיו אלה כפתורים גדולים,
     אף אחד לא בחור מראש, והפרומפט מופיע רק אחרי שבוחרים. */
  const ctaButtons = CTA_TYPES.map((c) => `
    <button type="button" class="cosmic-btn cosmic-chip-btn" data-cta="${escapeHtml(c.value)}">${escapeHtml(c.label)}</button>
  `).join('');
  cosmicCard(`
    <h2>זיקוק התסריט הסופי</h2>
    <div class="va-cta-pick">
      <p class="va-cta-pick-title">⭐ קודם לבחור: מה הצופה צריך לעשות בסוף הסרטון?</p>
      <div class="cosmic-chip-row" id="va-scratch-cta-row">${ctaButtons}</div>
    </div>
    <div id="va-scratch-distill-prompt-wrap" style="margin-top:14px"></div>
    <textarea class="cosmic-textarea" id="va-scratch-script-input" placeholder="להדביק כאן את התסריט הסופי שקיבלת..." style="margin-top:14px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-scratch-script-done-btn">ממשיכים ←</button>
    </div>
  `);
  const wrap = document.getElementById('va-scratch-distill-prompt-wrap');
  let cta = '';
  function refreshPrompt() {
    if (!cta) {
      wrap.innerHTML = '<p class="cosmic-hint">הפרומפט יופיע כאן אחרי שבוחרים הנעה לפעולה.</p>';
      return;
    }
    const prompt = buildPrompt(cta);
    /* הצהוב מסמן מה מולא לבד, ולכן התחום והקהל שייכים לשם גם הם. */
    const values = [state.ideaDescription, state.hook, state.hookReinforcement, state.rawDump, cta,
      audience, domainInfo ? domainInfo.domain : ''];
    wrap.innerHTML = `${promptPeek(highlightPlaceholders(prompt, values))}${copyBtn(prompt, 'להעתיק פרומפט')}`;
    wireCopyButtons(wrap);
  }
  document.querySelectorAll('#va-scratch-cta-row [data-cta]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#va-scratch-cta-row [data-cta]').forEach((o) => o.classList.remove('cosmic-chip-btn--on'));
    b.classList.add('cosmic-chip-btn--on');
    cta = b.getAttribute('data-cta');
    refreshPrompt();
  }));
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
/* 26/10/2026 (מאיה): "תוודאי שמפת הדרכים מעודכנת כמו השיטה שהשתלנו
   ברובוט, שלא יהיו אי דיוקים". המפה מסיימת בשלושה שלבים: עורכים
   ומצלמים, עוברים על צ'קליסט לפני ההעלאה, ומעלים לכל הפלטפורמות.
   הסיכום כאן עצר ב"לצלם ואז לערוך" והשמיט את שני האחרונים, כך שמי
   שסיימה כאן חשבה שהיא סיימה. */
const CLOSING_STEPS = [
  'לפני ההעלאה: לעבור על הצ\'קליסט לריל מנצח.',
  'להעלות לכל הפלטפורמות, ולא רק לאינסטגרם: גם יוטיוב שורטס, טיקטוק ופייסבוק.',
];

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
    steps.push(`הרעיון שלך: "${state.ideaBeforePackaging || state.ideaDescription || ''}".`);
    if (state.packaging) steps.push(`האריזה הקריאייטיבית: "${state.packaging}".`);
    steps.push(`בחרת הוק: "${state.hook || ''}".`);
    steps.push(`חיזקת את ההוק: "${state.hookReinforcement || ''}".`);
    steps.push('קיבלת תסריט סופי מזוקק.');
    steps.push('עכשיו: ללכת לצלם לפי התסריט למטה, ואז לערוך.');
  } else if (state.branch === 'idea') {
    steps.push(`הרעיון שלך: "${state.ideaBeforePackaging || state.ideaDescription || state.hook || ''}", ווידאת שהוא רלוונטי.`);
    if (state.packaging) steps.push(`האריזה הקריאייטיבית: "${state.packaging}".`);
    if (state.selectedFormat) steps.push(`בחרת פורמט הנגשה: "${state.selectedFormat}".`);
    steps.push('קבעת שהתוכן הזה לא צריך תסריט כתוב.');
    steps.push('עכשיו: לפתוח מצלמה ולצלם - ישירות, ספונטני או ויזואלי, לפי הרעיון למעלה.');
  }
  steps.push(...CLOSING_STEPS);
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
  if (state.screen === 'idea-sharpen') return renderIdeaSharpen();
  if (state.screen === 'creative-packaging') return renderCreativePackaging();
  if (state.screen === 'content-basics') return renderContentBasics();
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
