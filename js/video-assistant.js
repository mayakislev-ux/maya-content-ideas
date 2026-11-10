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

import { mountDrafts, clearScreenDrafts, draftKey, withDraft } from './video-assistant-drafts.js';
import { INITIAL_STATE, isCarousel, isDynamicText, nextStep, migrateLegacyState, ideaWithMessage, sameIdeaAndMessage, sharpenedIdea, ideaForPrompt } from './video-assistant-flow.js';
import { pickIdea, pickReference } from './video-assistant-picker.js';
import { buildParts, hasContent, scriptDoc } from './video-assistant-build.js';
import { confirmDialog } from './confirm-dialog.js';
import { openModal, closeModal, requestCloseModal } from './video-assistant-modal.js';
import { createScriptsLibrary, withLiveEdit } from './video-assistant-library.js';
import { buildDuplicationPrompt, buildScriptPrompt, buildCreativePackagingPrompt } from './video-assistant-prompts.js';
import {
  FORMATS, FORMAT_EXAMPLES, SCRIPT_STRUCTURE, STARTING_POINTS, CONTENT_TYPES, recommendFormats,
  buildExtractionPrompt, buildHookFindingPrompt, buildHookReinforcementPrompt, buildScriptDistillationPrompt,
  buildSceneRewritePrompt, hookFromPackaging,
} from './video-assistant-content.js';
import { playReroll, playSuccess, setMuted, getMuted } from './video-assistant-sound.js';
import { embedUrlFor, embedShape } from './video-preview.js';
import { languageName } from './inspiration-readability.js';
import {
  fetchIdeas, fetchInspirationBank, getSavedDomain, guessDomain, saveDomain, saveSession, loadSession,
  saveScript, listScripts, deleteScript, setScriptKind,
  extractOpeningHook, classifyContentType, recommendFormatsForIdea,
  transcribeReference,
} from './video-assistant-store.js';
import { uploadForTranscription, discardUpload } from './transcribe-upload.js';
import {
  linkPlatform, uploadProblem, composeTranscript, accurateNotice, accurateNoticeText, transcribeErrorInfo,
} from './reference-transcribe.js';
import { getProfile, saveProfile } from './user-profile.js';
/* 04/11/2026: צ'אט דיוק הרעיון חזר, כקפיצה לצ'אט עצמו ולא כעותק בתוך המסך */
import { startIdeaChatFromAssistant } from './idea-chat.js';
import { showView } from './view-router.js';
import { auth } from './firebase-init.js';
import { actsAsOwner } from './client-view.js';
import { duplicationText, duplicationNotice, readyForHook } from './reference-duplication.js';
import { showToast } from './toast.js';
import { serverErrorText } from './server-error.js';
import {
  pickEncouragement, domainTheme, formatElapsed,
  burstConfetti, flipReveal, startParticleTrail,
  cacheDomainInfoLocally, readCachedDomainInfo, spinReveal,
} from './video-assistant-fx.js';
/* 05/11/2026: הדבקה חכמה, מיקרופון, מד אורך, דף צילום ותיאור לסרטון */
import { mountSmartPaste, parseOptions } from './va-smart-paste.js';
import { attachMic } from './va-mic.js';
import { parseIdeaTitle, withAngle } from './idea-reply.js';
import { lengthMeterHtml, duplicationRef } from './va-length.js';
import { summaryToolsHtml, wireSummaryTools } from './va-summary-tools.js';

export const SUBCATEGORIES_BY_DOMAIN = {
  'יופי וקוסמטיקה': ['טיפול פנים', 'איפור קבוע', 'עיצוב גבות', 'קורס עיצוב גבות', 'הרמת גבות', 'מיקרובליידינג', 'הלחמת ריסים', 'קורס הלחמת ריסים', 'הרמת ריסים', 'ציפורניים', 'קורס ציפורניים', 'קורס איפור קבוע ומיקרובליידינג', 'קוסמטיקאית: אקנה ופיגמנטציה', 'אידוי לתלתלים', 'שיער אפרו', 'החלקות שיער', 'שיער', 'איפור', 'לייזר והסרת שיער', 'אסתטיקה רפואית', 'טיפולי גוף', 'שיזוף'],
  'בריאות נפשית, טיפול ורוח': ['פסיכולוגיה וטיפול רגשי', 'אימון אישי והתפתחות אישית', 'זוגיות ומערכות יחסים', 'הדרכת הורים ומשפחה', 'NLP ושיטות טיפול אלטרנטיביות', 'תקשור', 'נומרולוגיה', 'אסטרולוגיה', 'טארוט וקלפים', 'נטורופתיה'],
  'עסקים ויזמות': ['שיווק, רשתות ובניית מותג', 'מכירות', 'ייעוץ וליווי עסקי', 'פיננסים', 'קריירה ותעסוקה', 'משאבי אנוש וגיוס', 'AI ואוטומציות לעסקים'],
  'עיצוב, נדל"ן ואדריכלות': ['תיווך נדל"ן', 'השקעות נדל"ן', 'השבחת נכסים', 'עיצוב פנים', 'אדריכלות', 'הום סטיילינג'],
  'כושר ותזונה': ['פילאטיס', 'יוגה', 'אימוני כוח וכושר', 'ריצה וסיבולת', 'דיאטניות, תזונאיות, ליווי תזונתי', 'פיזיותרפיה ושיקום', 'ציוד ספורט'],
  'חנויות, אוכל ותיירות': ['תכשיטים', 'אוכל ובתי קפה', 'טיולים ותיירות', 'אירועים'],
  'תוכן אישי וחיבור': [],
  'צילום ותדמית': [],
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
  'content-basics': 2, 'footage-type-choice': 2, 'format-choice': 2, 'needs-script-check': 2,
  transcribe: 3, prompt1: 3, 'her-words': 3, prompt2: 3, 'read-aloud': 3,
  'idea-sharpen': 1, 'creative-packaging': 1, 'scratch-intro': 3, 'scratch-dump': 3, 'scratch-hook': 3, 'scratch-hook-reinforce': 3, 'scratch-distill': 3, 'scratch-scene': 3,
  'footage-speech-find': 3, 'footage-speech-shorten': 3, 'footage-speech-sharpen': 3, 'footage-speech-done': 3,
  'footage-visual-scan': 3, 'footage-visual-extract': 3, 'footage-visual-reframe': 3,
  'footage-visual-message': 3, 'footage-visual-story': 3,
  summary: 4,
};

let state = INITIAL_STATE;
let ideasCache = null;
let videosCache = null;
let domainInfo = null; // { domain, subCategory }
/* 07/11/2026: תחום שתוקן ב"הפרטים שלי" (js/my-details.js) נכנס מיד גם לכאן */
if (typeof window !== 'undefined') {
  window.addEventListener('moach-domain-changed', (e) => {
    if (e && e.detail && e.detail.domain) domainInfo = { domain: e.detail.domain, subCategory: e.detail.subCategory || null };
  });
}
let currentPickId = null;
let sessionStartTs = null; // רעיון #47 - "בנית תוך X דקות"
/* 20/10/2026 (מאיה: "למה העוזר לא נפתח במסך הראשי, וכאילו נפתח באמצע
   כתיבה, ממש מוזר"): סשן טרי משוחזר בשקט, ולכן נראה כאילו המסך נפתח
   באמצע במקרה. מעכשיו אומרים את זה במפורש, עם כפתור להתחיל מההתחלה. */
let resumedNotice = false;
/* 05/11/2026 (ביקורת): מסך שמחכה לשרת (פרופיל, זיהוי הוק, מאגר) צייר את
   עצמו גם אם בינתיים כבר עברו למסך אחר, ואז הלחיצה הבאה נשלחה מהמסך הלא
   נכון. כל ציור מקבל מספר, ומסך שהמספר שלו כבר לא האחרון לא מצייר. */
let renderSeq = 0;

function screenEl() {
  return document.getElementById('video-assistant-screen');
}

function dispatch(action) {
  resumedNotice = false;
  const leaving = state.screen;
  const drafts = state.drafts || {};
  const { scriptId, scriptCreatedAt } = state;
  state = nextStep(state, action);
  /* חזרה אחורה משחזרת סטייט מלפני שהפריט ב"התסריטים שלי" נוצר. בלי זה
     אותו סרטון היה נשמר שוב כפריט חדש. רק "להתחיל מחדש" פותח פריט חדש. */
  /* שכפול מהמאגר הוא סרטון חדש, כמו "להתחיל מחדש": בלי זה הוא היה נשמר
     על הפריט של הסרטון הקודם ב"התסריטים שלי". */
  const fresh = action.type === 'RESTART' || action.type === 'START_FROM_BANK';
  if (fresh) resetAccurateRuns();
  if (!fresh && scriptId && !state.scriptId && state.branch) state = { ...state, scriptId, scriptCreatedAt };
  /* מה שהוקלד במסך שעזבנו כבר הפך לסטייט אמיתי, ולכן הטיוטה שלו מיותרת.
     אם היא תישאר, היא עלולה למלא מחדש תיבה שנוקתה בכוונה. */
  state.drafts = action.type === 'START_FROM_BANK' ? {}
    : (state.screen === leaving ? drafts : clearScreenDrafts(drafts, leaving));
  saveAll().catch((err) => console.error('saveSession failed:', err));
  // 17/10/2026 (מאיה: "המעבר בין המסכים עושה סחרחורת"): מעבר הפורטל (#32)
  // הוסר - render ישיר, בלי אנימציית scale/blur בין מסכים.
  render();
}

/* שמירה של הסשן, ושל הסרטון כפריט ב"התסריטים שלי". הפריט נוצר ברגע
   שנכתב בו משהו. כישלון שלו לא מפיל את שמירת הסשן, שהיא מה שמונע אובדן
   עבודה באמצע. */
let scriptErrorAt = 0;
function saveAll() {
  if (!state.scriptId && hasContent(state)) {
    state.scriptId = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    state.scriptCreatedAt = Date.now();
  }
  /* בלי תוכן לא דורסים את הפריט, למשל בחזרה אחורה עד מסך הפתיחה. */
  if (state.scriptId && hasContent(state)) {
    try {
      saveScript(state.scriptId, scriptDoc(state)).catch((err) => {
        console.warn('saveScript failed:', err);
        /* נאמר, ולא נבלע. פעם בדקה, כי זה נקרא בכל הקלדה. */
        if (Date.now() - scriptErrorAt > 60000) {
          scriptErrorAt = Date.now();
          showToast('השמירה ב"התסריטים שלי" לא עברה. כדאי לבדוק שיש אינטרנט');
        }
      });
    } catch (err) {
      console.warn('saveScript failed:', err);
    }
  }
  return saveSession(state);
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
/* 29/10/2026 (מאיה בחרה "תכלת וקטעים"): חמישה קטעים קצרים, ולידם רק
   מספר השלב ושמו. במקום הפס הנוזלי והשורה "שלב X מתוך Y: ...". */
function progressHtml() {
  const current = PHASE_BY_SCREEN[state.screen] ?? 0;
  const segs = PHASES.map((_, i) => `<i class="${i < current ? 'is-done' : i === current ? 'is-now' : ''}"></i>`).join('');
  return `<div class="va-steps" role="img" aria-label="שלב ${current + 1} מתוך ${PHASES.length}">${segs}</div>
    <span class="cosmic-progress__label">${current + 1} · ${escapeHtml(SCREEN_LABEL[state.screen] || PHASES[current])}</span>`;
}

/* "התסריט שלך נבנה כאן": המשך הכרטיס כלפי מטה. ראה video-assistant-build.js. */
function buildHtml() {
  const parts = buildParts(state);
  if (!parts.length) return '';
  const rows = parts.map((p) => {
    const text = p.status === 'wait' ? 'בהמשך' : (p.value || '...');
    return `<li class="va-build__row is-${p.status}${p.big && p.value ? ' is-big' : ''}">
      <span class="va-build__mark">${p.status === 'done' ? '✓' : ''}</span>
      <div><small>${escapeHtml(p.label)}${p.status === 'now' ? ' · עכשיו' : ''}</small><p>${escapeHtml(text)}</p>${p.full && p.status !== 'wait' ? `<p class="va-build__full" hidden>${escapeHtml(p.full)}</p><button type="button" class="va-build__more" aria-expanded="false">עוד</button>` : ''}</div>
    </li>`;
  }).join('');
  return `<section class="va-build" aria-label="התסריט שלך">
    <div class="va-build__title">התסריט שלך נבנה כאן</div>
    <ul class="va-build__list">${rows}</ul>
  </section>`;
}

/* "עוד" מחליף את הקיצור בטקסט המלא באותו מקום, ולחיצה נוספת מחזירה. */
function wireBuildMore(root) {
  root.querySelectorAll('.va-build__more').forEach((btn) => btn.addEventListener('click', () => {
    const full = btn.previousElementSibling;
    const short = full.previousElementSibling;
    const open = full.hidden;
    full.hidden = !open;
    short.hidden = open;
    btn.textContent = open ? 'פחות' : 'עוד';
    btn.setAttribute('aria-expanded', String(open));
  }));
}

/* 31/10/2026 (מאיה: "את הפרומפט למציאת הוק תדגישי שזה לג'מיני, ותכתבי בקטן
   שהוא טוב בהוקים וקריאייטיב, אבל את הכתיבה עצמה ה-ChatGPT לוקח").
   02/11/2026 (מאיה: "תעשי סלאש ChatGPT, כי פעמים זה עושה יותר טוב ולפעמים
   זה"): כל כפתור שהעתיק לג'מיני מציע עכשיו את שניהם. */
function geminiHookNote() {
  return `<div class="va-ai-note"><strong>✨ הפרומפט הזה הולך לג'מיני או ל-ChatGPT</strong><small>ג'מיני חזק במיוחד בהוקים ובקריאייטיב, ולפעמים ChatGPT מביא יותר. שווה לנסות את שניהם.</small></div>`;
}

/* 05/11/2026 (מאיה): במסלול מ-0 הקריאייטיב נעשה בג'מיני, ומשם הכל
   ב-ChatGPT: ההוק, החיזוק, ה-SOS של המגילה והתסריט. השכפול (renderPrompt1)
   נשאר עם שניהם. */
function chatgptHookNote() {
  return `<div class="va-ai-note"><strong>✨ הפרומפט הזה הולך ל-ChatGPT</strong><small>את הקריאייטיב עשינו בג'מיני. מכאן ממשיכים ב-ChatGPT: ההוק, החיזוק והתסריט.</small></div>`;
}

/* 05/11/2026 (מאיה: "הלקוחות לא תמיד זוכרות"): הכיוון שנבחר באריזה
   הקריאייטיבית נוסע לכל פרומפט במסלול מ-0, ושורה קטנה במסך מראה שהוא
   באמת נלקח. רק במסלול מ-0, כי רק שם נבחר קריאייטיב. */
function creativeNow() {
  return state.branch === 'scratch' && state.packaging ? String(state.packaging).trim() : '';
}

function creativeReminderHtml() {
  const c = creativeNow();
  return c ? `<p class="cosmic-hint va-creative-reminder">🎬 הקריאייטיב שבחרת: <strong>${escapeHtml(c)}</strong></p>` : '';
}

/* טקסט שכבר נכתב חוזר לתיבה דרך הטיוטה ולא כערך של התיבה, כי ערך של התיבה גובר
   על הטיוטה (valueFor), ואז עריכה או ניקוי שלה לא היו שורדים רענון. */
function seedDraft(id, value) {
  const drafts = state.drafts || {};
  if (value && !Object.prototype.hasOwnProperty.call(drafts, draftKey(state.screen, id))) {
    state.drafts = withDraft(drafts, state.screen, id, value);
  }
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

/* 29/10/2026 (מאיה, צילום מסך): "מתחת לחלק שכותבים בו יש מלא מלא אזור
   ריק מיותר, אין שם כלום". הרקע היה בגובה מסך שלם, ומעליו עוד הכותרת של
   האפליקציה, ולכן תמיד היה מתחת לכרטיס עוד מסך כמעט ריק לגלול אליו.
   עכשיו הרקע נגמר בדיוק בתחתית המסך, והכרטיס יושב באמצעו. */
function fitView() {
  const view = document.getElementById('video-assistant-view');
  if (!view || view.hidden) return;
  const top = view.getBoundingClientRect().top + window.scrollY;
  view.style.setProperty('--va-fit', `${Math.max(360, Math.round(window.innerHeight - top))}px`);
}

function cosmicCard(innerHtml, { showProgress = true } = {}) {
  const back = backButtonHtml();
  screenEl().innerHTML = `<div class="cosmic-card" id="va-card">
    ${resumedNotice ? `<div class="cosmic-resume-bar" style="display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;margin:0 0 12px;font-size:14px">
      <span>ממשיכים מאיפה שעצרת 👋</span>
      <button type="button" class="cosmic-btn" id="va-start-over-btn" style="padding:4px 12px;font-size:13px">להתחיל מההתחלה</button>
    </div>` : ''}
    ${back || showProgress ? `<div class="va-head">${back}${showProgress ? progressHtml() : ''}</div>` : ''}
    ${innerHtml}
  </div>`;
  const backBtn = document.getElementById('va-back-btn');
  if (backBtn) backBtn.addEventListener('click', () => dispatch({ type: 'BACK' }));
  const startOverBtn = document.getElementById('va-start-over-btn');
  if (startOverBtn) startOverBtn.addEventListener('click', () => restart());
  scrollToCardTop();
  fitView();
  const card = document.getElementById('va-card');
  /* 26/10/2026: כל תיבת טקסט בכרטיס נשמרת תוך כדי כתיבה, חוזרת לעצמה
     כשהמסך מצויר מחדש, ויש שורה שאומרת מתי נשמר. עד כאן הסשן נשמר רק
     במעבר מסך, ולכן רענון באמצע כתיבה מחק את התסריט. */
  mountDrafts(card, {
    screen: state.screen,
    getDrafts: () => state.drafts || {},
    setDrafts: (d) => { state.drafts = d; },
    save: () => saveAll(),
    onError: () => showToast('השמירה לא עברה. כדאי לבדוק שיש אינטרנט'),
  });
  /* אחרי mountDrafts, שמוסיף את שורת השמירה לסוף הכרטיס: התסריט הוא
     המשך הכרטיס כלפי מטה, ולכן הוא תמיד האחרון. */
  card.insertAdjacentHTML('beforeend', buildHtml());
  wireBuildMore(card);
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
   העזרה האמיתית היא כפתורי ה-SOS במסכי המגילה.
   openModal ו-closeModal נמצאים ב-video-assistant-modal.js. */

// ===== "התסריטים שלי" (video-assistant-library.js) =====
const scriptsLibrary = createScriptsLibrary({
  getState: () => state,
  saveAll: () => saveAll(),
  store: { listScripts, saveScript, deleteScript, setScriptKind },
  openModal, closeModal, copyBtn, wireCopyButtons, confirmDialog, showToast,
  resume: (s, item) => {
    /* 05/11/2026 (ביקורת): "✨ תמלול מדויק" שעוד רץ שייך לסרטון הקודם.
       בלי האיפוס הוא היה נוחת בתיבה של הסרטון שנפתח עכשיו. */
    if (item.id !== state.scriptId) resetAccurateRuns();
    /* 06/11/2026: סרטון שנשמר במסלול השכפול ההפוך שירד ממשיך בשכפול הרגיל */
    state = migrateLegacyState({ ...s, scriptId: item.id, scriptCreatedAt: item.createdAt });
    if (!state.history) state.history = [];
    resumedNotice = false;
    currentPickId = null;
    sessionStartTs = Date.now();
    closeModal();
    saveSession(state).catch((err) => console.error('saveSession failed:', err));
    render();
  },
  /* עריכה ב"התסריטים שלי" של הסרטון שפתוח עכשיו: עוברת גם לעוזר, אחרת
     המסך שמאחורי החלון היה ממשיך להחזיק את הטקסט הישן ודורס את העריכה. */
  applyLive: (changes) => {
    /* גם הטיוטות של השדות שנערכו, אחרת המסך מציג את הנוסח הישן */
    state = withLiveEdit(state, changes);
    saveSession(state).catch((err) => console.error('saveSession failed:', err));
    render();
  },
  /* 05/11/2026: סימון בדף הצילום של הסרטון הפתוח. בלי render, כדי שהמסך
     שמאחורי החלון לא יצויר מחדש בכל סימון. */
  patchLive: (changes) => {
    state = { ...state, ...changes };
    saveAll().catch((err) => console.error('saveSession failed:', err));
  },
  liveDeleted: () => {
    resetAccurateRuns();
    state = { ...INITIAL_STATE, history: [] };
    currentPickId = null;
    sessionStartTs = Date.now();
    saveSession(state).catch((err) => console.error('saveSession failed:', err));
    render();
  },
});

function openScriptsLibrary() {
  return scriptsLibrary.open();
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
  const t = ++renderSeq;
  const profile = (await getProfile()) || {};
  if (t !== renderSeq) return;
  cosmicCard(`
    <h2>רגע לפני שמתחילים</h2>
    <p>כמה פרטים שממלאים פעם אחת, והם ייכנסו לבד לכל פרומפט שהכלי יכין. בלעדיהם ChatGPT מנחש מאיזה עולם מדובר. אפשר לשנות אותם אחר כך ב"הפרטים שלי" בתפריט.</p>
    <div class="cosmic-field">
      <label for="va-pf-domain">התחום שלי</label>
      <input type="text" class="cosmic-textarea" id="va-pf-domain" style="min-height:auto"
        placeholder="למשל: עיצוב גבות, שיווק, קוסמטיקה" value="${profile.business ? escapeHtml(profile.business) : ''}">
    </div>
    <div class="cosmic-field">
      <label for="va-pf-aud1">קהל היעד העיקרי</label>
      <input type="text" class="cosmic-textarea" id="va-pf-aud1" style="min-height:auto"
        placeholder="למשל: נשים 25-40 שמחפשות מעצבת גבות קבועה" value="${profile.primaryAudience ? escapeHtml(profile.primaryAudience) : ''}">
      ${['table', 'maya'].includes(profile.audienceSource) ? '<p class="my-details-from-table">✓ נלקח מטבלת קהל היעד שמאיה אישרה</p>' : ''}
    </div>
    <div class="cosmic-field">
      <label for="va-pf-aud2">קהל יעד משני (רשות)</label>
      <input type="text" class="cosmic-textarea" id="va-pf-aud2" style="min-height:auto"
        placeholder="אם יש עוד קהל שפונים אליו" value="${profile.secondaryAudience ? escapeHtml(profile.secondaryAudience) : ''}">
    </div>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-pf-save-btn">שמירה והמשך</button>
    </div>
  `, { showProgress: false });
  const saveBtn = document.getElementById('va-pf-save-btn');
  saveBtn.addEventListener('click', async () => {
    if (saveBtn.disabled) return;
    const business = document.getElementById('va-pf-domain').value.trim();
    const primaryAudience = document.getElementById('va-pf-aud1').value.trim();
    const secondaryAudience = document.getElementById('va-pf-aud2').value.trim();
    if (!business || !primaryAudience) {
      showToast('צריך למלא את התחום ואת קהל היעד העיקרי');
      return;
    }
    /* 04/11/2026 (ביקורת): בלי נעילה ובלי catch, שמירה שנכשלה השאירה
       כפתור שלא עושה כלום, ולחיצות חוזרות שלחו כמה שמירות. */
    saveBtn.disabled = true;
    const label = saveBtn.textContent;
    saveBtn.textContent = 'שומרים...';
    try {
      await saveProfile({ business, primaryAudience, secondaryAudience: secondaryAudience || null });
    } catch (err) {
      console.error('saveProfile failed:', err);
      saveBtn.disabled = false;
      saveBtn.textContent = label;
      showToast(serverErrorText(err, 'שמירת הפרטים'));
      return;
    }
    playSuccess();
    onDone();
  });
}

/** האם חסר מה שכל פרומפט צריך. מיוצא בעקיפין דרך המסך בלבד. */
function profileIncomplete(profile) {
  return !profile || !String(profile.business || '').trim() || !String(profile.primaryAudience || '').trim();
}

async function renderOpening() {
  const t = ++renderSeq;
  const incomplete = profileIncomplete(await getProfile());
  if (t !== renderSeq) return;
  if (incomplete) {
    await renderProfileSetup(() => render());
    return;
  }
  cosmicCard(`
    <h2>✨ בואו ניצור סרטון</h2>
    <p>מאיפה מתחילים הפעם?</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn" id="va-idea-btn">יש לי רעיון = מ-0</button>
      <button type="button" class="cosmic-btn" id="va-reference-btn">סרטון שאהבתי (שכפול)</button>
      <button type="button" class="cosmic-btn" id="va-footage-btn">יש לי קטע שצולם</button>
    </div>
    <p class="muted" style="font-size:13px;margin-top:10px">קטע שצולם = ליקוט מתוך דיבור שכבר צילמתם. קטע בלי דיבור (תהליך, לפני ואחרי)? בוחרים "יש לי רעיון = מ-0" ובונים סביבו.</p>
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
    rememberPick('pickedReferenceId', null);
    dispatch({ type: 'CHOOSE_PULL_REFERENCE' });
  });
}

/* 05/11/2026 (ביקורת): מה שהוגרל נשמר גם בסטייט ולא רק במשתנה בזיכרון.
   בלי זה, אחרי רענון או המשך מ"התסריטים שלי" מסך הרעיון קרס (המשתנה ריק
   והמאגר עוד לא נטען), ומסך הרפרנס הגריל רפרנס אחר מזה שנבחר. */
function rememberPick(field, id) {
  currentPickId = id;
  state = { ...state, [field]: id };
}

// ===== מסלול "יש לי רעיון" - איך מקבלים את הרעיון =====
// 17/10/2026 (מאיה: "פשוט יש לי רעיון שבחרתי או תמצא לי רעיון"): ניסוח
// קצר יותר, ואם אין בכלל רעיונות בבנק - הודעה ברורה שעוצרת, לא הפניה
// שקטה למסך אחר.
function refsPlan() {
  return document.body.dataset.plan === 'refs';
}

/* 04/11/2026 (ביקורת): הרשימה נטענה פעם אחת ונשמרה עד רענון הדף. רעיון
   שנוסף אחר כך לא הופיע, ורעיון שנמחק או סומן כבוצע עדיין הוגרל. עכשיו
   היא נטענת מחדש בכל פתיחה של הבחירה. אם הטעינה נכשלת ויש רשימה קודמת,
   משתמשים בה; אם אין, אומרים את זה במקום כפתור שלא עושה כלום. */
async function refreshIdeas() {
  try {
    ideasCache = await fetchIdeas();
    return true;
  } catch (err) {
    console.error('fetchIdeas failed:', err);
    if (ideasCache) return true;
    showToast('לא הצלחנו לטעון את בנק הרעיונות כרגע. כדאי לנסות שוב בעוד רגע.');
    return false;
  }
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
    if (!(await refreshIdeas())) return;
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
    rememberPick('pickedIdeaId', picked.id);
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

/* 05/11/2026 (ביקורת): המסך הניח שהמאגר כבר בזיכרון ושהרעיון עוד בו.
   אחרי רענון, המשך מ"התסריטים שלי" או חזרה אחורה הוא קרס על null. עכשיו
   הוא טוען את המאגר, מציג את אותו רעיון שנבחר, ואם הרעיון כבר לא שם
   מגריל אחר. אם אין מה להציג, חוזרים מסך אחורה עם הסבר. */
function leavePulledScreen(message) {
  if (message) showToast(message);
  if (state.history && state.history.length) dispatch({ type: 'BACK' });
  else restart();
}

async function renderPulledIdea() {
  const t = ++renderSeq;
  if (!ideasCache) {
    cosmicCard('<p>טוענים את הרעיון...</p>', { showProgress: false });
    const ok = await refreshIdeas();
    if (t !== renderSeq) return;
    if (!ok) {
      leavePulledScreen();
      return;
    }
  }
  let idea = ideasCache.find((i) => i.id === (state.pickedIdeaId || currentPickId));
  if (!idea) {
    idea = pickIdea(ideasCache, null);
    if (!idea) {
      leavePulledScreen('אין עדיין רעיונות שמורים בבנק הרעיונות');
      return;
    }
    rememberPick('pickedIdeaId', idea.id);
    saveAll().catch((err) => console.error('saveSession failed:', err));
  } else {
    currentPickId = idea.id;
  }
  const card = cosmicCard(`
    <h2>🎲 הרעיון הזה</h2>
    <p style="font-size:17px;font-weight:700" id="va-idea-title">${escapeHtml(idea.title)}</p>
    ${idea.hookText ? `<p>${escapeHtml(idea.hookText.length > 300 ? `${idea.hookText.slice(0, 299).trim()}…` : idea.hookText)}</p>` : ''}
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-accept-idea-btn">ממשיכים ←</button>
    </div>
    <button type="button" class="cosmic-reroll-btn" id="va-reroll-idea-btn">לא אהבתי - להגריל שוב</button>
  `);
  // 17/10/2026 (רעיון #12, "הפיכת קלף"): החשיפה הראשונה של הרעיון המוגרל
  // מקבלת רגע הפיכה - לא רק מופיעה.
  flipReveal(card);
  document.getElementById('va-accept-idea-btn').addEventListener('click', () => {
    /* 06/11/2026 (מאיה: "כשאני מעבירה את הרעיון לביצוע הוא שוכח מהזווית").
       כותרת שנשמרה מהצ'אט היא "רעיון | זווית: X | סיפור: Y". הרעיון נכנס
       לתיבה נקי, הסיפור נשאר איתו, והזווית עוברת לשדה שלה ונוסעת הלאה. */
    const parsed = parseIdeaTitle(idea.title);
    const ideaText = parsed.story ? `${parsed.text}. סיפור: ${parsed.story}` : parsed.text;
    /* 07/11/2026: ברעיון מהקלטה hookText הוא כל מה שהיא אמרה על הרעיון
       (לפעמים דקה וחצי), ולא הוק. הוא נכנס כתיאור הרעיון, וההוק מתחיל
       מהכותרת הקצרה. */
    const fromVoice = Boolean(idea.transcript);
    state.hook = fromVoice ? ideaText : (idea.hookText || ideaText);
    /* 10/11/2026: הפירוט לא מחליף את הכותרת והסיפור, הוא נוסף אחריהם */
    state.ideaDescription = idea.hookText && idea.hookText.trim() !== ideaText ? `${ideaText}. פירוט: ${idea.hookText.trim()}` : ideaText;
    state.ideaAngle = parsed.angle || null;
    celebrate();
    dispatch({ type: 'ACCEPT_PICK' });
  });
  document.getElementById('va-reroll-idea-btn').addEventListener('click', () => {
    playReroll();
    const picked = pickIdea(ideasCache, currentPickId);
    const nextTitle = picked ? picked.title : idea.title;
    if (picked) rememberPick('pickedIdeaId', picked.id);
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
/* 09/11/2026 (מאיה: "הוא בחר וויס אובר בלבד ... עדיף שתמיד ייתן כמה
   אופציות אבל רק מה שמתאים ... יותר חד ומדויק ולהפעיל הגיון").
   חיפוש המילים סימן וויס אובר רק כי באריזה הופיעה המילה "קריינות". עכשיו
   ההמלצה באה מהשרת (recommendFormatsForIdea), שקורא את הרעיון, המסר והאריזה
   ומחזיר 2-3 פורמטים מדורגים עם נימוק. עד שהיא מגיעה אין סימון בכלל (לא
   מראים המלצה שגויה לרגע), ואם היא נכשלת חוזרים לחיפוש המילים. */
let formatRecCache = { key: '', picks: null, pending: false };

function formatRecInput(packaging = state.packaging, startingPoint = state.startingPoint) {
  return {
    packaging: String(packaging || ''),
    /* 10/11/2026: בלי נושא, המסר והזווית כבר נשלחים בשדות שלהם. הנפילה ל-
       ideaBeforePackaging ("מסר. זווית") הייתה שולחת אותם פעמיים. */
    idea: String(state.ideaTopic || (state.ideaPunchline ? '' : (state.ideaBeforePackaging || state.ideaDescription)) || ''),
    message: String(state.ideaPunchline || ''),
    angle: String(state.ideaAngle || ''),
    startingPoint: String(startingPoint || ''),
  };
}

/* 09/11/2026 (מאיה: הסימון הכתום מגיע בדיליי). ההמלצה מתחילה כבר במסך
   האריזה, בזמן שמדביקים ובוחרים נקודת יציאה, כך שכשמגיעים למסך הפורמטים
   היא כבר מחכה שם. נקודת היציאה לא חלק מהמפתח: לחיצה על צ'יפ לא שולחת שוב. */
function formatRecKey(input) {
  return JSON.stringify([input.packaging.trim(), input.idea, input.message, input.angle]);
}

function requestFormatPicks(input) {
  const key = formatRecKey(input);
  if (formatRecCache.key === key && (formatRecCache.picks || formatRecCache.pending)) return key;
  formatRecCache = { key, picks: null, pending: true };
  recommendFormatsForIdea(input)
    .then((picks) => (picks && picks.length ? picks : null))
    .catch(() => null)
    .then((picks) => {
      if (formatRecCache.key !== key) return;
      formatRecCache = { key, picks: picks || recommendFormats(input.packaging).map((name) => ({ name, why: '' })), pending: false };
      /* לא בונים את המסך מחדש (זה סוגר פורמט פתוח ומקפיץ למעלה): רק
         מוסיפים את הכתום, התוויות והנימוקים לרשימה שכבר על המסך. */
      if (state.screen === 'format-choice') applyFormatPicks(formatRecCache.picks);
    });
  return key;
}

function formatPicksNow() {
  if (!state.packaging) return { picks: [], loading: false };
  const input = formatRecInput();
  const key = formatRecKey(input);
  if (formatRecCache.key === key && formatRecCache.picks) return { picks: formatRecCache.picks, loading: false };
  requestFormatPicks(input);
  return { picks: [], loading: true };
}

function formatPickParts(picks, loading) {
  const pickBy = new Map(picks.map((p, i) => [p.name, { ...p, rank: i }]));
  const recommended = new Set(pickBy.keys());
  const tagFor = (name) => (pickBy.get(name).rank === 0 ? 'הכי מתאים לרעיון הזה' : 'מומלץ לאריזה הזו');
  const tagHtml = (name) => (recommended.has(name) ? `<span class="cosmic-recommend-tag">${tagFor(name)}</span>` : '');
  const whyHtml = (name) => (recommended.has(name) && pickBy.get(name).why ? `<p class="cosmic-recommend-why">למה זה מתאים לך: ${escapeHtml(pickBy.get(name).why)}</p>` : '');
  const hint = loading
    ? '<p class="cosmic-hint cosmic-recommend-hint cosmic-recommend-loading">רגע, בודקים אילו פורמטים הכי מתאימים לרעיון ולאריזה שלך...</p>'
    : (recommended.size ? `<p class="cosmic-hint cosmic-recommend-hint">סימנו בכתום את הפורמטים שהכי מתאימים לרעיון ולאריזה שבחרת${recommended.size > 1 ? ', הראשון הכי חזק' : ''}. פותחים כל אחד כדי לראות למה. זו רק הצעה, אפשר לבחור כל פורמט אחר.</p>` : '');
  return { recommended, tagHtml, whyHtml, hint };
}

function applyFormatPicks(picks) {
  const root = screenEl();
  const loadingEl = root && root.querySelector('.cosmic-recommend-loading');
  if (!loadingEl) return;
  const { recommended, tagHtml, whyHtml, hint } = formatPickParts(picks, false);
  root.querySelectorAll('.cosmic-accordion-item').forEach((item) => {
    const name = item.dataset.format;
    if (!recommended.has(name)) return;
    item.classList.add('is-recommended');
    item.querySelector('summary > span').insertAdjacentHTML('beforeend', tagHtml(name));
    item.querySelector('.cosmic-accordion-body').insertAdjacentHTML('afterbegin', whyHtml(name));
  });
  if (hint) loadingEl.insertAdjacentHTML('afterend', hint);
  loadingEl.remove();
}

function renderFormatChoice() {
  const { picks, loading } = formatPicksNow();
  const { recommended, tagHtml, whyHtml, hint } = formatPickParts(picks, loading);
  const itemsHtml = FORMATS.map((f, i) => `
    <details class="cosmic-accordion-item${recommended.has(f.name) ? ' is-recommended' : ''}" data-format="${escapeHtml(f.name)}" ${state.selectedFormat === f.name ? 'open' : ''}>
      <summary><span><span class="cosmic-format-icon">${FORMAT_ICONS[f.name] || '🎬'}</span>${escapeHtml(f.name)}${tagHtml(f.name)}</span></summary>
      <div class="cosmic-accordion-body">
        ${whyHtml(f.name)}
        <p style="margin:0">${escapeHtml(f.description)}</p>
        ${FORMAT_EXAMPLES[f.name] ? `<button type="button" class="cosmic-examples-btn" data-format-examples="${i}">👀 לראות דוגמה</button>` : ''}
        <button type="button" class="cosmic-pick-btn" data-pick-format="${i}">הפורמט שלי</button>
      </div>
    </details>
  `).join('');
  cosmicCard(`
    <h2>בוחרים פורמט הנגשה</h2>
    <p>לכל רעיון יכולים להתאים כמה פורמטים - לפתוח כל אחד לקרוא על מה מדובר, ולבחור את מה שהכי מרגיש נכון.</p>
    ${hint}
    ${state.selectedFormat ? `<div class="cosmic-selected-chip">✓ נבחר: ${escapeHtml(state.selectedFormat)}</div>` : ''}
    <div class="cosmic-accordion">${itemsHtml}</div>
  `);
  screenEl().querySelectorAll('[data-format-examples]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openFormatExamples(FORMATS[Number(btn.dataset.formatExamples)].name);
    });
  });
  screenEl().querySelectorAll('[data-pick-format]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const format = FORMATS[Number(btn.dataset.pickFormat)].name;
      celebrate();
      dispatch({ type: 'FORMAT_SELECTED', format });
    });
  });
}

/* 29/10/2026: דוגמאות לפורמט, בתוך פופאפ. דוגמה אחת בכל פעם (כמה הטמעות
   יחד כבדות בטלפון), עם כפתורים לדוגמה הבאה. אם ההטמעה לא נטענת תוך 4
   שניות, כמו בתצוגה המקדימה של הרפרנס, נשאר רק קישור לצפייה בפלטפורמה. */
function openFormatExamples(name) {
  const list = FORMAT_EXAMPLES[name] || [];
  if (!list.length) return;
  const overlay = openModal(`
    <h2 style="margin-top:0">${escapeHtml(name)}</h2>
    ${list.length > 1 ? `<div class="cosmic-examples-tabs">${list.map((_, i) => `<button type="button" class="cosmic-examples-tab" data-example="${i}">דוגמה ${i + 1}</button>`).join('')}</div>` : ''}
    <div class="cosmic-examples-stage"></div>
  `);
  const stage = overlay.querySelector('.cosmic-examples-stage');
  let timer = null;
  function show(i) {
    const ex = list[i];
    const embed = embedUrlFor(ex.url, ex);
    const shape = embedShape(ex.url, ex);
    overlay.querySelectorAll('[data-example]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.example) === i)));
    clearTimeout(timer);
    /* 06/11/2026: יש סרטונים שהבעלים או אינסטגרם חוסמים להטמעה. החלון
       נטען "בהצלחה" אבל ריק, כך שהבדיקה של 4 השניות לא תופסת את זה.
       דוגמה כזאת מסומנת embed: false ומוצגת ישר ככרטיס עם קישור. */
    if (ex.embed === false) {
      stage.innerHTML = `
        <div class="cosmic-examples-linkcard">
          <p>את הדוגמה הזאת אפשר לראות רק בפלטפורמה עצמה.</p>
          <a href="${escapeHtml(ex.url)}" target="_blank" rel="noopener" class="cosmic-examples-out">לצפייה בדוגמה ↗</a>
        </div>
      `;
      return;
    }
    stage.innerHTML = `
      <div class="cosmic-examples-embed" style="aspect-ratio:${shape.w}/${shape.h};width:min(100%, calc(66vh * ${shape.w} / ${shape.h}))">
        <iframe src="${escapeHtml(embed)}" title="דוגמה לפורמט ${escapeHtml(name)}" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen></iframe>
      </div>
      <a href="${escapeHtml(ex.url)}" target="_blank" rel="noopener" class="cosmic-examples-out">לצפייה בפלטפורמה המקורית ↗</a>
    `;
    const frame = stage.querySelector('iframe');
    let loaded = false;
    frame.addEventListener('load', () => { loaded = true; });
    timer = setTimeout(() => {
      if (loaded || !document.body.contains(overlay)) return;
      const wrap = stage.querySelector('.cosmic-examples-embed');
      if (wrap) wrap.outerHTML = '<p class="muted" style="text-align:center;padding:24px 8px">הדוגמה הזאת לא נטענת כאן כרגע. אפשר לצפות בה בקישור למטה.</p>';
    }, 4000);
  }
  overlay.querySelectorAll('[data-example]').forEach((b) => b.addEventListener('click', () => show(Number(b.dataset.example))));
  show(0);
}

// ===== "צריך תסריט או לא?" - ניסוח מתוקן (16/10)
// 18/10/2026 (מאיה: "לא מובן החלק של זה ספונטני/צולם כבר/ויזואלי") -
// "צולם כבר" לא באמת שייך למסך הזה (הוא מגיע רק ממסלול "רעיון מ-0",
// כלום עוד לא צולם) ושלושת התיוגים ביחד בכפתור אחד היו לא ברורים.
// במקום תיוגים, שאלה ישירה בגוף ראשון עם שתי תשובות ברורות. גם הוסרה
// הצביעה הוורודה האוטומטית - שתי התשובות שוות משקל. =====
function renderNeedsScriptCheck() {
  cosmicCard(`
    <h2>האם צריך תסריט?</h2>
    <p>לא כל תוכן צריך תסריט כתוב מראש - לפעמים עדיף לדעת את הכיוון ולדבר בספונטניות, או שהפורמט עצמו ויזואלי ולא מבוסס דיבור.</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn" id="va-needs-script-yes-btn">כן</button>
      <button type="button" class="cosmic-btn" id="va-needs-script-no-btn">לא, אני אדע בדיוק מה לכתוב/להגיד</button>
    </div>
  `);
  document.getElementById('va-needs-script-no-btn').addEventListener('click', () => dispatch({ type: 'NEEDS_SCRIPT_NO' }));
  document.getElementById('va-needs-script-yes-btn').addEventListener('click', () => dispatch({ type: 'NEEDS_SCRIPT_YES' }));
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
    .concat(subs.map((s) => `<option value="${escapeHtml(s)}" ${s === selectedSub ? 'selected' : ''}>${escapeHtml(s)}</option>`))
    .join('');
  return `<select id="va-subcategory-select" class="cosmic-textarea" style="min-height:auto;margin-top:10px">${opts}</select>`;
}

function renderDomainConfirm(guessedDomain, guessedSub, onConfirmed) {
  const initialDomain = guessedDomain || DOMAIN_OPTIONS[0];
  const options = DOMAIN_OPTIONS.map(
    (d) => `<option value="${escapeHtml(d)}" ${d === initialDomain ? 'selected' : ''}>${escapeHtml(d)}</option>`
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
  const confirmBtn = document.getElementById('va-domain-confirm-btn');
  confirmBtn.addEventListener('click', async () => {
    if (confirmBtn.disabled) return;
    const chosen = document.getElementById('va-domain-select').value;
    const subSelect = document.getElementById('va-subcategory-select');
    const chosenSub = subSelect ? subSelect.value || null : null;
    /* 05/11/2026 (ביקורת): שמירה שנכשלה השאירה "מאשרים" שלא עושה כלום
       ולא אומר כלום. נועלים בזמן השמירה, ובכישלון אומרים מה קרה. */
    confirmBtn.disabled = true;
    try {
      await saveDomain(chosen, chosenSub);
    } catch (err) {
      console.error('saveDomain failed:', err);
      confirmBtn.disabled = false;
      showToast(serverErrorText(err, 'שמירת התחום'));
      return;
    }
    domainInfo = { domain: chosen, subCategory: chosenSub };
    cacheDomainInfoLocally(domainInfo);
    applyDomainTheme(chosen);
    onConfirmed();
  });
}

async function renderPulledReference() {
  const t = ++renderSeq;
  let domain;
  let subCategory;
  /* 05/11/2026 (ביקורת): מאגר או תחום שלא נטענו השאירו את המסך הקודם
     קפוא, בלי הודעה. עכשיו אומרים מה קרה, ויש כפתור לנסות שוב. */
  try {
    if (!videosCache) videosCache = await fetchInspirationBank();
    ({ domain, subCategory } = await resolveDomain());
  } catch (err) {
    if (t !== renderSeq) return;
    console.error('renderPulledReference load failed:', err);
    const message = serverErrorText(err, 'טעינת הרפרנסים');
    showToast(message);
    cosmicCard(`<h2>לא הצלחנו לטעון רפרנס</h2><p>${escapeHtml(message)}</p>
      <div class="cosmic-btn-row"><button type="button" class="cosmic-btn cosmic-btn--primary" id="va-ref-retry-btn">לנסות שוב</button></div>`);
    document.getElementById('va-ref-retry-btn').addEventListener('click', () => render());
    return;
  }
  if (t !== renderSeq) return;
  const needsConfirm = !domain || ((SUBCATEGORIES_BY_DOMAIN[domain] || []).length > 0 && !subCategory);
  if (needsConfirm) {
    renderDomainConfirm(domain, subCategory, () => render());
    return;
  }
  /* הרפרנס שהוגרל נשמר בסטייט, כדי שרענון לא יחליף אותו באחר */
  let video = videosCache.find((v) => v.id === (state.pickedReferenceId || currentPickId));
  if (!video) {
    video = pickReference(videosCache, domain, subCategory, null);
    if (!video) {
      cosmicCard(`<h2>אין עדיין רפרנסים בתחום הזה</h2><p>לבחור "יש לי רעיון מ-0" במקום, או לחזור מאוחר יותר.</p>`);
      return;
    }
    rememberPick('pickedReferenceId', video.id);
    saveAll().catch((err) => console.error('saveSession failed:', err));
  } else {
    currentPickId = video.id;
  }
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
        : '<p style="padding:40px 16px;text-align:center">הסרטון הזה לא מוכן להצגה כאן - אפשר לצפות בקישור למטה.</p>';
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
    if (picked) rememberPick('pickedReferenceId', picked.id);
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

/* 05/11/2026: אחרי "הדבקה חכמה" קל ללחוץ "ממשיכים" עם כל התשובה בתיבה, ואז
   20 כיוונים או 30 הוקים נשמרים כ"מה שבחרת" ונכנסים לכל פרומפט אחריו. */
function pastedManyOptions(text) {
  if (parseOptions(text).length < 2) return false;
  showToast('הודבקה תשובה שלמה. לבחור אחת מהאפשרויות בכרטיסים שמתחת לתיבה');
  return true;
}

function copyBtn(text, label) {
  return `<button type="button" class="cosmic-btn va-copy-btn" data-copy-text="${encodeURIComponent(text)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"></path></svg><span>${label}</span></button>`;
}

function wireCopyButtons(root) {
  root.querySelectorAll('[data-copy-text]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = decodeURIComponent(btn.getAttribute('data-copy-text'));
      try {
        await navigator.clipboard.writeText(text);
        showToast('הועתק ✓');
        /* 28/10/2026: הטוסט נעלם מהר ולא תמיד נראה בטלפון. הכפתור עצמו
           אומר שהועתק, ואז חוזר לעצמו, כדי שיהיה ברור שאפשר להדביק. */
        const span = btn.querySelector('span');
        if (span && !btn.classList.contains('is-copied')) {
          const label = span.textContent;
          btn.classList.add('is-copied');
          span.textContent = 'הועתק ✓ עכשיו להדביק';
          setTimeout(() => { btn.classList.remove('is-copied'); span.textContent = label; }, 2200);
        }
      } catch {
        showToast('לא הצלחתי להעתיק - לסמן ידנית');
      }
    });
  });
}

/* 04/11/2026: שכפול שנפתח מהמאגר אומר מאיפה בא התמלול והאם לסמוך עליו.
   ויזואלי, שיר או חסר: אומרים את זה במקום להעביר הלאה תמלול מטעה. */
function bankNoticeHtml({ withEditLink = false } = {}) {
  const info = state.bankNotice;
  const notice = info && info.reason === 'accurate' ? accurateNoticeText(info) : duplicationNotice(info);
  if (!notice) return '';
  return `<div class="va-bank-notice" role="note">
    <strong>${escapeHtml(notice.title)}</strong>
    <p>${escapeHtml(notice.body)}</p>
    ${withEditLink ? '<button type="button" class="va-text-link" id="va-bank-edit-link">לבדוק ולתקן את התמלול</button>' : ''}
    ${!withEditLink && cachedForOwner() ? '<button type="button" class="va-text-link" id="va-accurate-refresh">🔄 התמלול הזה נשמר מתמלול קודם. לתמלל מחדש (רק לך)</button>' : ''}
  </div>`;
}

/* 04/11/2026: תמלול שהגיע ממטמון השרת ונראה שגוי: רק מאיה יכולה לבקש
   תמלול חדש שידרוס אותו (refresh, והשרת בודק את המייל בעצמו). */
function cachedForOwner() {
  const info = state.bankNotice;
  const me = auth.currentUser;
  return Boolean(info && info.reason === 'accurate' && info.cached && me && actsAsOwner(me.email));
}

function bankDescribeMode() {
  const reason = state.bankNotice && state.bankNotice.reason;
  return reason === 'visual' || reason === 'song' || reason === 'short';
}

function renderTranscribe() {
  const fromBank = Boolean(state.bankNotice);
  const describe = bankDescribeMode();
  /* 05/11/2026 (ביקורת): הלינק והתמלול נכתבו כערך של התיבה, וערך של
     התיבה גובר על הטיוטה (valueFor). עריכה שלהם, למשל תיקון של תמלול
     שהגיע מ"לשכפול הסרטון", נעלמה ברענון. עכשיו הם נכנסים דרך הטיוטה. */
  if (state.screen === 'transcribe') {
    seedDraft('va-reference-link', state.referenceLink);
    seedDraft('va-transcript-input', state.transcript);
  }
  cosmicCard(`
    <h2>${describe ? 'מה קורה ברפרנס?' : 'לתמלל את הרפרנס'}</h2>
    ${fromBank ? bankNoticeHtml() : `<p>להדביק לינק לסרטון וללחוץ על "✨ תמלול מדויק", או להדביק כאן את התמלול בעצמכם</p>`}
    <input type="url" class="cosmic-textarea" id="va-reference-link" style="min-height:auto"
      inputmode="url" dir="ltr" placeholder="לינק לסרטון מטיקטוק או מאינסטגרם">
    ${accurateBlockHtml()}
    <textarea class="cosmic-textarea" id="va-transcript-input" style="margin-top:8px" placeholder="${describe ? 'לתאר כאן מה קורה בסרטון...' : 'להדביק כאן את התמלול...'}"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-transcribe-done-btn">ממשיכים ←</button>
    </div>
  `);
  document.getElementById('va-transcribe-done-btn').addEventListener('click', () => {
    // 16/10/2026 (מאיה: "זה נותן לי להמשיך בשלבים גם בלי שכתבתי כלום") -
    // כאן בדיוק היה חסר הוולידציה הזו, היחידה מכל שדות הטקסט שלא נבדקה.
    const text = document.getElementById('va-transcript-input').value.trim();
    if (!text) {
      showToast(describe ? 'צריך לתאר קודם מה קורה בסרטון' : 'צריך להדביק את התמלול קודם');
      return;
    }
    /* תמלול שהשתנה צריך הוק מזוהה מחדש, ולא את זה של הנוסח הקודם */
    if (text !== state.transcript) state.openingHook = null;
    state.transcript = text;
    state.referenceLink = document.getElementById('va-reference-link').value.trim() || null;
    dispatch({ type: 'CONFIRM_DONE' });
  });
  wireAccurateTranscribe();
}

/* 04/11/2026 (מאיה): "✨ תמלול מדויק". ג'מיני צופה בסרטון עצמו, מהלינק או
   מקובץ מהגלריה, ומחזיר מה שנאמר, מה שכתוב על המסך ומה רואים. התוצאה
   נכנסת לתיבה ונשארת לעריכה. כשהלינק לא עובד (אינסטגרם חוסם לפעמים)
   אומרים את זה, וההעלאה מהגלריה במרחק לחיצה אחת. */
let accurateRun = 0;
let accurateTimer = null;
/* ריצה שעוד לא חזרה. נשמרת גם כשעוזבים את המסך וחוזרים, כדי שהכפתורים
   לא ייפתחו באמצע ולא תצא קריאה שנייה בתשלום. */
let accurateBusy = false;
let accurateWaitLabel = '';
let accurateStartedAt = 0;
/* תוצאה שהגיעה כשהמסך כבר לא היה מסך התמלול. שולמה, ולכן לא נזרקת:
   כשחוזרים למסך מציעים להכניס אותה לתיבה. */
let accurateStash = null;

/* סרטון חדש (שכפול מהמאגר או "להתחיל מחדש"): כל מה שבדרך שייך לסרטון
   הקודם, ולא ייכנס לתיבה של החדש. */
function resetAccurateRuns() {
  accurateRun += 1;
  accurateBusy = false;
  accurateStash = null;
  stopAccurateTimer();
}

function accurateBlockHtml() {
  return `<div class="va-accurate" id="va-accurate">
    <button type="button" class="cosmic-btn va-accurate-btn" id="va-accurate-btn">✨ תמלול מדויק</button>
    <p class="va-accurate-hint">ג'מיני צופה בסרטון ומחזיר מה שנאמר, מה שכתוב על המסך ומה רואים בו. לוקח בדרך כלל 20-60 שניות.</p>
    <button type="button" class="va-text-link" id="va-accurate-upload-btn">📤 להעלות את הסרטון מהגלריה</button>
    <input type="file" accept="video/*" id="va-accurate-file" hidden>
    <div class="va-accurate-status" id="va-accurate-status" role="status" aria-live="polite" hidden></div>
  </div>`;
}

function setAccurateBusy(busy) {
  accurateBusy = busy;
  ['va-accurate-btn', 'va-accurate-upload-btn', 'va-transcribe-done-btn'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = busy;
  });
  /* מה שמוקלד בזמן ההמתנה היה נדרס כשהתמלול נכנס */
  const box = document.getElementById('va-transcript-input');
  if (box) box.readOnly = busy;
  const wrap = document.getElementById('va-accurate');
  if (wrap) wrap.classList.toggle('is-busy', busy);
}

function showAccurateStatus(html, { kind = 'info' } = {}) {
  const box = document.getElementById('va-accurate-status');
  if (!box) return;
  box.hidden = !html;
  box.className = `va-accurate-status va-accurate-status--${kind}`;
  box.innerHTML = html;
  const fallback = document.getElementById('va-accurate-upload-fallback');
  if (fallback) fallback.addEventListener('click', () => document.getElementById('va-accurate-file').click());
}

function uploadOfferHtml(message) {
  return `<p>${escapeHtml(message)}</p>
    <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-accurate-upload-fallback">📤 להעלות את הסרטון מהגלריה</button>`;
}

const SPINNER = '<span class="va-accurate-spinner" aria-hidden="true"></span>';

function stopAccurateTimer() {
  if (accurateTimer) clearInterval(accurateTimer);
  accurateTimer = null;
}

function paintWaiting() {
  const secs = Math.round((Date.now() - accurateStartedAt) / 1000);
  showAccurateStatus(`<p>${SPINNER}${escapeHtml(accurateWaitLabel)}</p>
    <p class="va-accurate-wait">זה לוקח בדרך כלל 20-60 שניות. אפשר להישאר כאן, התמלול ייכנס לתיבה לבד. (${secs} שניות)</p>`);
}

/* השעון ממשיך גם כשעוזבים את המסך (אז אין מה לצבוע), ונעצר רק כשהריצה נגמרת */
function startWatchingStatus(label) {
  stopAccurateTimer();
  accurateWaitLabel = label;
  accurateStartedAt = Date.now();
  paintWaiting();
  accurateTimer = setInterval(paintWaiting, 1000);
}

/* מה שכבר כתוב בתיבה, ולא הגיע מהמאגר או מתמלול קודם, הוא עבודה של
   המשתמשת. לא דורסים אותו בלי לשאול. */
async function okToReplaceTranscript() {
  const box = document.getElementById('va-transcript-input');
  const current = box ? box.value.trim() : '';
  if (!current) return true;
  const fromMachine = state.bankNotice && state.bankNotice.text && current === String(state.bankNotice.text).trim();
  if (fromMachine) return true;
  return confirmDialog('התמלול המדויק יחליף את מה שכתוב עכשיו בתיבה. להמשיך?', { okLabel: 'כן, להחליף', cancelLabel: 'לא' });
}

/* 05/11/2026 (ביקורת): scriptId הוא הסרטון שבו התחיל התמלול. אם בינתיים
   נפתח סרטון אחר, התוצאה לא נכנסת לתיבה שלו. */
function applyAccurateResult(result, link, scriptId = null) {
  if (scriptId && state.scriptId !== scriptId) {
    showToast('התמלול המדויק שייך לסרטון אחר, ולכן לא נכנס לכאן');
    return;
  }
  const text = composeTranscript(result);
  if (!text) {
    showAccurateStatus(uploadOfferHtml("ג'מיני לא מצא בסרטון דיבור, טקסט או תמונה לתאר. אפשר לנסות קובץ אחר."), { kind: 'error' });
    return;
  }
  if (text !== state.transcript) state.openingHook = null;
  state.transcript = text;
  state.referenceLink = link || state.referenceLink || null;
  state.bankNotice = accurateNotice(result, text);
  state.drafts = withDraft(state.drafts, 'transcribe', 'va-transcript-input', text);
  saveAll().catch((err) => console.error('saveSession failed:', err));
  render();
  showToast('התמלול מוכן ✓ אפשר לעבור עליו ולתקן');
  /* צליל שלא התנגן (דפדפן בלי AudioContext) הוא לא כישלון של התמלול */
  try { playSuccess(); } catch (err) { console.warn('playSuccess failed:', err); }
}

async function runAccurate(payload) {
  const run = ++accurateRun;
  const scriptId = state.scriptId || null;
  accurateStash = null;
  const linkInput = document.getElementById('va-reference-link');
  const link = payload.link || (linkInput ? linkInput.value.trim() : '');
  setAccurateBusy(true);
  try {
    /* מהמאגר: גם המזהה שלו, והשרת בודק שהלינק באמת שלו (מטמון התמלולים) */
    let request = { link: payload.link };
    if (state.referenceBankId) request.bankId = state.referenceBankId;
    if (payload.refresh) request.refresh = true;
    if (payload.file) {
      const uploading = (pct) => `<p>${SPINNER}מעלים את הסרטון... ${pct}%</p>`;
      showAccurateStatus(uploading(0));
      const path = await uploadForTranscription(payload.file, (pct) => {
        if (run === accurateRun) showAccurateStatus(uploading(pct));
      });
      /* התחיל סרטון אחר בזמן ההעלאה: הקובץ כבר לא צריך */
      if (run !== accurateRun) {
        discardUpload(path).catch((err) => console.warn('discardUpload failed:', err));
        return;
      }
      request = { uploadPath: path };
    }
    startWatchingStatus(payload.file ? "ג'מיני צופה בסרטון ומתמלל..." : "מורידים את הסרטון וג'מיני צופה בו...");
    const result = await transcribeReference(request);
    if (run !== accurateRun) return;
    stopAccurateTimer();
    if (state.screen !== 'transcribe') {
      accurateStash = { run, result, link, scriptId };
      showToast('התמלול המדויק מוכן. הוא מחכה במסך התמלול');
      return;
    }
    accurateBusy = false;
    applyAccurateResult(result, link, scriptId);
  } catch (err) {
    if (run !== accurateRun) return;
    stopAccurateTimer();
    console.error('transcribeReference failed:', err);
    const info = transcribeErrorInfo(err);
    const message = info.message || serverErrorText(err, 'התמלול');
    /* לינק שלא ירד, או כל תקלה אחרת בלינק: ההעלאה היא הדרך החלופית.
       מכסה שנגמרה חלה גם על העלאה, ולכן שם לא מציעים אותה. */
    const offerUpload = info.linkFailed || (!payload.file && !info.quota);
    showAccurateStatus(offerUpload ? uploadOfferHtml(message) : `<p>${escapeHtml(message)}</p>`, { kind: 'error' });
    if (state.screen !== 'transcribe') showToast(message);
  } finally {
    if (run === accurateRun) setAccurateBusy(false);
  }
}

function wireAccurateTranscribe() {
  const btn = document.getElementById('va-accurate-btn');
  if (!btn) return;
  const fileInput = document.getElementById('va-accurate-file');
  /* חזרה למסך באמצע ריצה: אותו מצב המתנה, בלי אפשרות לשלוח שוב */
  if (accurateBusy) {
    setAccurateBusy(true);
    if (accurateTimer) paintWaiting();
  } else if (accurateStash && accurateStash.run === accurateRun) {
    showAccurateStatus(`<p>✨ התמלול המדויק הגיע בזמן שהייתם במסך אחר.</p>
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-accurate-apply">להכניס אותו לתיבה</button>`);
    document.getElementById('va-accurate-apply').addEventListener('click', async () => {
      if (!accurateStash || !(await okToReplaceTranscript())) return;
      const { result, link, scriptId } = accurateStash;
      accurateStash = null;
      applyAccurateResult(result, link, scriptId);
    });
  }
  btn.addEventListener('click', async () => {
    if (accurateBusy) return;
    const link = document.getElementById('va-reference-link').value.trim();
    if (!link) {
      showAccurateStatus(uploadOfferHtml('אין עדיין לינק. להדביק למעלה לינק לסרטון מטיקטוק או מאינסטגרם, או להעלות את הסרטון מהגלריה.'), { kind: 'error' });
      return;
    }
    if (!linkPlatform(link)) {
      showAccurateStatus(uploadOfferHtml('תמלול מלינק עובד רק עם לינק לסרטון מטיקטוק או מאינסטגרם. לסרטון אחר, להעלות אותו מהגלריה.'), { kind: 'error' });
      return;
    }
    if (!(await okToReplaceTranscript())) return;
    runAccurate({ link });
  });
  const refreshBtn = document.getElementById('va-accurate-refresh');
  if (refreshBtn) refreshBtn.addEventListener('click', async () => {
    const link = document.getElementById('va-reference-link').value.trim();
    if (accurateBusy) return;
    if (!linkPlatform(link)) {
      showAccurateStatus('<p>אין למעלה לינק של טיקטוק או אינסטגרם לתמלל מחדש</p>', { kind: 'error' });
      return;
    }
    if (!(await okToReplaceTranscript())) return;
    runAccurate({ link, refresh: true });
  });
  document.getElementById('va-accurate-upload-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file || accurateBusy) return;
    const problem = uploadProblem(file);
    if (problem) {
      showAccurateStatus(`<p>${escapeHtml(problem)}</p>`, { kind: 'error' });
      return;
    }
    if (!(await okToReplaceTranscript())) return;
    runAccurate({ file });
  });
}

// 19/10/2026 (מאיה, אחרי בדיקה אמיתית מול ChatGPT בפועל: "הדבקתי לו את
// התסריט המתומלל... הוא צריך לזהות כמה שורות ההוק, אבל הוא כתב את כל
// התסריט") - עד עכשיו כל התמלול שהיא הדביקה נכנס בתור "ההוק הזה"
// בפרומפט, ו-ChatGPT פשוט שכפל חזרה את כל הפסקה (הוק + נימוק + הרחבה)
// במקום לייצר הוקים חדשים ומגוונים. מזהים קודם, דרך extractOpeningHook,
// רק את המשפט/ים הפותחים - בדיוק איפה שמסתיים ההוק ומתחיל הנימוק, כמו
// שמאיה הדגימה בעצמה. נקרא ממסך הפרומפט הראשון של השכפול, שהוא המסך
// הראשון שמגיע אחרי התמלול.
async function ensureOpeningHook() {
  if (state.openingHook || !state.transcript) return;
  try {
    state.openingHook = await extractOpeningHook(state.transcript);
  } catch (err) {
    console.error('extractOpeningHook failed:', err);
    // נכשל השרת - נופלים חזרה לכל התמלול במקום לתקוע אותה כאן לגמרי
    state.openingHook = state.transcript;
  }
  saveAll().catch((err) => console.error('saveSession failed:', err));
}

/* 29/10/2026 (מאיה: "אני רוצה שזה ימלא לבד את התחום של כל אחד, נגיד
   אצלי שיווק, זה לא מילא"). domainInfo נטען רק במסלולי הרפרנס, ולכן
   במסלול "יש לי רעיון" הוא היה ריק והפרומפט יצא עם [התחום שלי]. התחום
   שכל אחת כתבה בפרופיל (חובה לפני שנכנסים לעוזר) הוא הגיבוי. */
async function myDomain() {
  if (domainInfo && domainInfo.domain) return domainInfo.domain;
  const profile = await getProfile();
  return profile && profile.business ? profile.business : '';
}

/* קהל היעד יושב בפרופיל, וכל בונה פרומפט צריך אותו. פעם אחת כאן,
   במקום להעתיק את אותו תנאי בכל מסך מחדש. */
async function myAudience() {
  const profile = await getProfile();
  return profile && profile.primaryAudience ? profile.primaryAudience : '';
}

async function renderPrompt1() {
  const t = ++renderSeq;
  const profile = await getProfile();
  const audience = profile && profile.primaryAudience ? profile.primaryAudience : '';
  const domain = await myDomain();
  if (t !== renderSeq) return;

  // ההוק של הרפרנס מזוהה כאן, במסך הראשון שמגיע אחרי התמלול.
  if (!state.openingHook) {
    cosmicCard(`<p>מזהים את ההוק מתוך התמלול...</p>`, { showProgress: false });
    await ensureOpeningHook();
    if (t !== renderSeq) return;
  }
  const hookForPrompt = state.openingHook || state.transcript || '';

  const prompt = buildDuplicationPrompt({ audience, domain, hook: hookForPrompt });
  const highlightValues = [audience, domain, hookForPrompt];
  /* ההודעה רק כל עוד התמלול הוא זה שהגיע מהמאגר. אחרי שתוקן, הוא שלה. */
  const bankUntouched = state.bankNotice && state.bankNotice.reason === 'ok'
    && state.transcript === state.bankNotice.text;
  /* ההוק שכבר הודבק חוזר לתיבה בחזרה אחורה (04/11) */
  if (state.screen === 'prompt1') seedDraft('va-hook-input', state.hook);
  cosmicCard(`
    <h2>מציאת הוק</h2>
    ${bankUntouched ? bankNoticeHtml({ withEditLink: true }) : ''}
    ${geminiHookNote()}
    <div class="cosmic-context-box"><span>ההוק שזיהינו מתוך התמלול שלך:</span>${escapeHtml(hookForPrompt)}</div>
    <p>רק ההוק הזה נשלח לג'מיני או ל-ChatGPT - לא כל התמלול. הוא ישכפל אותו ויביא לך 30 הוקים חדשים באותו מנגנון.</p>
    <p>להעתיק, להדביק בג'מיני או ב-ChatGPT, ולחזור עם ההוק שהכי קרץ לך מתוך ה-30</p>
    ${promptPeek(highlightPlaceholders(prompt, highlightValues))}
    ${copyBtn(prompt, "להעתיק פרומפט לג'מיני / ChatGPT")}
    <textarea class="cosmic-textarea" id="va-hook-input" placeholder="להדביק כאן את ההוק שבחרת..." style="margin-top:14px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-hook-chosen-btn">ממשיכים ←</button>
    </div>
  `);
  wireCopyButtons(screenEl());
  mountSmartPaste(document.getElementById('va-hook-input'));
  const bankEdit = document.getElementById('va-bank-edit-link');
  if (bankEdit) bankEdit.addEventListener('click', () => dispatch({ type: 'BACK' }));
  document.getElementById('va-hook-chosen-btn').addEventListener('click', () => {
    const hook = document.getElementById('va-hook-input').value.trim();
    if (pastedManyOptions(hook)) return;
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
/* 06/11/2026: בלי השכפול ההפוך אין כאן יותר המתנה לשרת, ולכן המסך מצויר מיד */
function renderHerWords() {
  const context = state.hook || state.ideaDescription || '';
  /* 02/11/2026 (מאיה: "בגלל שזה שכפול תוכן לא צריך את ה-SOS... וגם לא צריך
     שיהיה כתוב מגילת אסתר... זה מכריח אותי לרשום מגילה עם תווים"). בשכפול
     רגיל התסריט המקורי כבר נותן את המבנה, ומה שחסר הוא רק מה שהיא מוסיפה
     לתוכו. בלי SOS, בלי מינימום מילים, ושאלה שנצמדת למנגנון. */
  if (state.branch === 'reference') {
    renderDuplicationAddOn(context);
    return;
  }
  /* 28/10/2026 (מאיה: "באלי שתרשמי בכותרת מגילת אסתר ואני רוצה שהכפתור
     של ה-SOS ממש ממש ממש יבלוט כי הרבה כותבות מגילה מעפנה ואז זה יוצא
     גרוע"). הכותרת היא מגילת אסתר בשני המסלולים, ה-SOS הוא כפתור גדול
     ובולט, ו"להמשיך" עוצר קודם בפופאפ שבודק שהמגילה באמת מפורטת. */
  if (state.screen === 'her-words') seedDraft('va-herwords-input', state.herWords);
  cosmicCard(`
    <h2>מגילת אסתר - מה יש לך להגיד?</h2>
    ${context ? `<div class="cosmic-context-box"><span>ההוק/הרעיון שבחרת:</span>${escapeHtml(context)}</div>` : ''}
    <p>עכשיו הזמן להרחיב עליו - סיפור קצר, דוגמא, או דיבור כללי על הנושא, במילים שלך</p>
    <button type="button" class="va-sos-big" id="va-herwords-help-btn">
      <span class="va-sos-big__icon" aria-hidden="true">🆘</span>
      <span class="va-sos-big__text"><strong>נתקעים? לא ברור מה לכתוב?</strong><span>לחיצה כאן, ו-ChatGPT ישאל אותך שאלות שיוציאו ממך מגילה מלאה</span></span>
    </button>
    <textarea class="cosmic-textarea" id="va-herwords-input" style="min-height:160px"></textarea>
    ${megillahMeterHtml('va-herwords')}
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-herwords-done-btn">ממשיכים ←</button>
    </div>
  `);
  prepareExtractionHelper();
  attachMic('va-herwords-input');
  document.getElementById('va-herwords-help-btn').addEventListener('click', openExtractionHelperModal);
  wireMegillahGate({
    prefix: 'va-herwords',
    inputId: 'va-herwords-input',
    doneId: 'va-herwords-done-btn',
    onGo: (text) => dispatch({ type: 'HER_WORDS_SUBMITTED', text }),
  });
}

function renderDuplicationAddOn(context) {
  if (state.screen === 'her-words') seedDraft('va-dupadd-input', state.herWords);
  cosmicCard(`
    <h2>מה יש לך להוסיף לשכפול?</h2>
    ${context ? `<div class="cosmic-context-box"><span>ההוק שבחרת:</span>${escapeHtml(context)}</div>` : ''}
    <p>בהתאם למנגנון ולתסריט המקורי: איזו דעה, דוגמא או סיפור שמתאימים למנגנון של התסריט המקורי יש לך להוסיף? אפשר גם הערה אישית או מקצועית.</p>
    <p class="muted">רק מה שקשור למנגנון של התסריט. לא חובה: אם אין מה להוסיף, ממשיכים.</p>
    <textarea class="cosmic-textarea" id="va-dupadd-input" style="min-height:120px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-dupadd-done-btn">ממשיכים ←</button>
    </div>
  `);
  /* 02/11/2026 (מאיה: "לא רוצה שתעשי כחלק חובה, ואם לא מילאו כלום אז בפורמט
     תמחקי רק את החלק הזה"). ריק עובר הלאה, ו-buildScriptPrompt משמיט את השורה. */
  document.getElementById('va-dupadd-done-btn').addEventListener('click', () => {
    const text = document.getElementById('va-dupadd-input').value.trim();
    dispatch({ type: 'HER_WORDS_SUBMITTED', text });
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
  const t = ++renderSeq;
  const hook = state.hook || state.transcript || '';
  // 19/10/2026 (מאיה, אחרי אישור מפורש) - שדה "התסריט המקורי" מפורש, לא
  // הסתמכות על ש-ChatGPT "זוכר" אותו מפרומפט 1 באותה שיחה; ראה
  // video-assistant-prompts.js, buildScriptPrompt.
  const domain = await myDomain();
  const audience = await myAudience();
  if (t !== renderSeq) return;
  const prompt = buildScriptPrompt({ hook, herWords: state.herWords, originalScript: state.transcript || '', domain, audience });
  /* 04/11: התסריט שהודבק חוזר לתיבה כשחוזרים מ"להקריא בקול" */
  if (state.screen === 'prompt2') seedDraft('va-prompt2-script-input', state.finalScript);
  cosmicCard(`
    <h2>כתיבת התסריט</h2>
    <p>להעתיק, להדביק ב-ChatGPT, ולקבל תסריט מלא</p>
    ${promptPeek(highlightPlaceholders(prompt, [hook, state.herWords, state.transcript]))}
    ${copyBtn(prompt, 'להעתיק פרומפט ל-ChatGPT')}
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
      ? `<div class="cosmic-prompt-box va-read-script">${escapeHtml(script)}</div>${lengthMeterHtml(script, duplicationRef(state))}`
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
  /* 04/11/2026 (מאיה): צ'אט דיוק הרעיון, רק ביצירה מ-0 ("רק שם מעניין דיוק
     הרעיון") ורק באפליקציה המלאה. מנוי רפרנסים לא רואה אותו, וגם השרת
     חוסם לו את הצ'אט. */
  const showAngleChat = fromIdea && !refsPlan();

  /* 28/10/2026 (מאיה): "כל החלק של הרעיון שלך במשפט אחד מסובך, מיליון
     טקסט, מבלבל ועושה כאב ראש, חייב לפשט הכל". ירדו פסקת הפתיחה, שלושת
     הצעדים הממוספרים ושתי שורות ההסבר. נשארו כותרת, תיבות וכפתורים:
     השאלות שעל התיבות הן ההסבר. */
  cosmicCard(`
    <h2>${forFootage ? 'המסר של הקטע' : 'הרעיון שלך'}</h2>

    <label class="cosmic-field-label" for="va-idea-sharp">${forFootage ? 'מה המסר של הקטע שכבר צולם?' : 'על מה הסרטון?'}</label>
    <textarea class="cosmic-textarea" id="va-idea-sharp" style="min-height:${forFootage ? 96 : 56}px"
      ${forFootage ? 'placeholder="למשל: למה אני עובדת עם מכשיר אחד ולא עם שלושה"' : ''}>${escapeHtml(idea)}</textarea>
    ${fromIdea ? '<button type="button" class="va-text-link" id="va-pull-idea-link">🎲 להגריל רעיון מהבנק שלי</button>' : ''}
    ${forFootage ? '' : `
    <label class="cosmic-field-label va-punch-label" for="va-idea-punch">⭐ מה הפואנטה שורה תחתונה מהסרטון? מה אתם רוצים שהקהל שלכם יבין? מה המסר?</label>
    <textarea class="cosmic-textarea va-punch-box" id="va-idea-punch" style="min-height:96px">${escapeHtml(punch)}</textarea>`}

    ${state.ideaAngle && !forFootage ? `<div class="va-angle-picked" id="va-angle-picked">
      <span class="va-angle-picked__label">🎯 זווית ההנגשה שנבחרה:</span>
      <strong class="va-angle-picked__name" id="va-angle-picked-name">${escapeHtml(state.ideaAngle)}</strong>
      <small class="va-angle-picked__note">נכנסת לבד לאריזה, להוק ולתסריט</small>
      <button type="button" class="va-text-link" id="va-angle-remove">להוריד את הזווית</button>
    </div>` : ''}

    ${showAngleChat ? `<div class="va-angle-cta">
      <p class="va-angle-cta__lead">🎯 דיוק רעיון ממוקד, חזק וספציפי הוא הסוד לסרטון מוצלח.</p>
      <p class="va-angle-cta__warn">רעיון לא מדויק יהרוס את כל הכתיבה.</p>
      <button type="button" class="cosmic-btn cosmic-btn--primary va-angle-cta__btn" id="va-angle-chat-btn">לא בטוחים שהרעיון חזק? לחצו כאן</button>
      <small class="va-angle-cta__safe">ואל דאגה, כל מה שתכתבו כאן נשמר אוטומטית ויחכה לכם כשתחזרו.</small>
    </div>` : ''}
    ${fromIdea ? `<label class="va-check-row">
      <input type="checkbox" id="va-relevance-check" ${state.relevanceConfirmed ? 'checked' : ''}>
      <span>הרעיון רלוונטי לקהל היעד שלי, או משרת את המותג (מציג את האישיות, הערכים או תפיסת העולם שלי)</span>
    </label>` : ''}

    <div class="cosmic-btn-row" style="margin-top:16px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-idea-next-btn">ממשיכים ←</button>
    </div>
  `);

  const box = document.getElementById('va-idea-sharp');
  attachMic('va-idea-sharp');
  /* 28/10/2026 (מאיה): "חייב עוד סעיף שהוא הכי קריטי - מה הפואנטה של
     הסרטון? מה המסר? ואז הפואנטה הופכת להיות הרעיון, ורק אז הצ'אט".
     בלי מסך נוסף: הפואנטה יושבת באותו מסך, מתחת לנושא. היא חובה, הצ'אט
     מחדד אותה, והניסוח שלו נכנס לתיבה שלה. מה שממשיך הלאה הוא הפואנטה,
     עם הנושא לצידה רק אם היא לא מזכירה אותו בעצמה. */
  const punchBox = forFootage ? null : document.getElementById('va-idea-punch');
  function mainIdea() {
    const topic = box.value.trim();
    if (!punchBox) return topic;
    return sharpenedIdea(topic, punchBox.value);
  }
  document.getElementById('va-idea-next-btn').addEventListener('click', () => {
    if (punchBox && !punchBox.value.trim()) {
      showToast('חסרה הפואנטה: מה הם צריכים לצאת איתו מהסרטון?');
      punchBox.focus();
      return;
    }
    /* 10/11/2026: אותו משפט בשתי התיבות = אין רעיון, ואז כל הפרומפטים
       מקבלים רק את המסר. */
    if (punchBox && sameIdeaAndMessage(box.value, punchBox.value)) {
      showToast('בשתי התיבות כתוב אותו משפט. בראשונה כותבים על מה הסרטון (הנושא או הסיפור), ובשנייה את המסר שהקהל צריך להבין');
      box.focus();
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
  const angleBtn = document.getElementById('va-angle-chat-btn');
  if (angleBtn) angleBtn.addEventListener('click', () => openAngleChat({ box, punchBox, angleBtn }));
  const removeAngle = document.getElementById('va-angle-remove');
  if (removeAngle) removeAngle.addEventListener('click', () => {
    state.ideaAngle = null;
    saveAll().catch((err) => console.error('saveSession failed:', err));
    const picked = document.getElementById('va-angle-picked');
    if (picked) picked.remove();
    showToast('הזווית ירדה מהרעיון');
  });
  const pullLink = document.getElementById('va-pull-idea-link');
  if (pullLink) pullLink.addEventListener('click', async () => {
    if (!(await refreshIdeas())) return;
    const picked = pickIdea(ideasCache, null);
    if (!picked) {
      showToast('אין עדיין רעיונות שמורים בבנק הרעיונות');
      return;
    }
    rememberPick('pickedIdeaId', picked.id);
    dispatch({ type: 'CHOOSE_PULL_IDEA' });

  });
}

/* 04/11/2026: לפני שעוזבים את המסך, מה שכתוב בשתי התיבות (ותיבת הסימון)
   נכתב לסשן ונשמר בפועל. השמירה הרגילה רצה 800ms אחרי הקלדה, ולחיצה מהירה
   אחרי ההקלדה הייתה עוזבת לפני שהיא רצה. */
const SAVE_BEFORE_LEAVE_MS = 5000;
async function openAngleChat({ box, punchBox, angleBtn }) {
  const screen = 'idea-sharpen';
  let drafts = withDraft(state.drafts || {}, screen, 'va-idea-sharp', box.value);
  if (punchBox) drafts = withDraft(drafts, screen, 'va-idea-punch', punchBox.value);
  state.drafts = drafts;
  const relevance = document.getElementById('va-relevance-check');
  if (relevance) state.relevanceConfirmed = relevance.checked;
  angleBtn.disabled = true;
  let timer = null;
  try {
    await Promise.race([
      saveAll(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('save timeout')), SAVE_BEFORE_LEAVE_MS); }),
    ]);
  } catch (err) {
    /* נאמר ולא נבלע. מה שנכתב עדיין כאן בזיכרון, והחזרה בכפתור תציג אותו. */
    console.error('saveSession before idea chat failed:', err);
    showToast('השמירה בענן לא עברה. מה שכתבתם יחכה כאן כל עוד לא מרעננים את הדף');
  } finally {
    clearTimeout(timer);
    angleBtn.disabled = false;
  }
  startIdeaChatFromAssistant(
    { topic: box.value, punchline: punchBox ? punchBox.value : '' },
    { onBack: returnFromAngleChat },
  );
}

/* החזרה מהצ'אט. הרעיון המדויק נכנס לתיבה "על מה הסרטון?", והמסר האחד
   (04/11/2026: הצ'אט מזקק עכשיו גם אותו) לתיבת המסר. מה שלא חזר נשאר
   כמו שנכתב. בלי תוצאה חוזרים בדיוק למה שהיה. */
function returnFromAngleChat(result) {
  showView('video-assistant');
  const r = typeof result === 'string' ? { idea: result } : (result || {});
  const idea = String(r.idea || '').trim();
  const message = String(r.message || '').trim();
  /* 06/11/2026: הזווית שהצ'אט בחר חוזרת גם היא, ונשמרת בשדה משלה */
  const angle = String(r.angle || '').trim();
  const here = state.screen === 'idea-sharpen';
  if (here && (idea || message || angle)) {
    let drafts = state.drafts || {};
    if (idea) drafts = withDraft(drafts, 'idea-sharpen', 'va-idea-sharp', idea);
    if (message && state.branch !== 'footage') drafts = withDraft(drafts, 'idea-sharpen', 'va-idea-punch', message);
    state.drafts = drafts;
    if (angle) state.ideaAngle = angle;
    saveAll().catch((err) => console.error('saveSession failed:', err));
  }
  render();
  const withAngleNote = here && angle ? ', וזווית ההנגשה נשמרה איתם' : '';
  if (here && idea && message) showToast(`הרעיון והמסר המדויקים נכנסו לתיבות${withAngleNote}`);
  else if (here && idea) showToast(`הרעיון המדויק נכנס לתיבה "על מה הסרטון?"${withAngleNote}`);
}

/* 28/10/2026 (מאיה): "זהו הצ'אט בתכלס זה הזווית הקריאייטיבית, אבל הוא
   לא מתקרב לרמה של הג'מיני". במקום הצ'אט, הפרומפט שהיא עצמה כותבת
   לג'מיני, ממולא בתחום, בקהל, ברעיון ובמסר. הכיוון שבוחרים מתוך ה-20
   נוסע הלאה לפרומפטים של ההוק והתסריט. */
async function renderCreativePackaging() {
  const t = ++renderSeq;
  /* 06/11/2026: הזווית מהצ'אט נכנסת גם לפרומפט האריזה */
  const idea = state.ideaTopic && state.ideaPunchline
    ? withAngle(ideaWithMessage(state.ideaTopic, state.ideaPunchline), state.ideaAngle)
    : (state.ideaBeforePackaging || state.ideaDescription || '');
  const audience = await myAudience();
  const domain = await myDomain();
  if (t !== renderSeq) return;
  const prompt = buildCreativePackagingPrompt({ domain, audience, idea });
  if (state.screen === 'creative-packaging') seedDraft('va-packaging-input', state.packaging);
  /* 28/10/2026 (מאיה: "תעשי מה שחכם ונוח יותר"). נקודת היציאה הייתה
     מסך נפרד בין האריזה לפורמט, ועכשיו היא יושבת כאן. 29/10/2026 (מאיה):
     "באיזה סוג תוכן זה נראה לי נוותר, סתם מיוחד ומסבך", ולכן סוג התוכן
     ירד מהמסך. בקטע שצולם נקודת היציאה לא נשאלת, כי נקבעה בצילום. */
  const withBasics = state.branch !== 'footage';
  cosmicCard(`
    <h2>האריזה הקריאייטיבית</h2>
    <p>איך מגישים את המסר בצורה מעניינת ולא בנאלית. להעתיק לג'מיני, לבחור מתוך ה-20 את הכיוון שהכי מדליק, ולהדביק אותו כאן.</p>
    <p class="cosmic-hint">הכיוון שבוחרים כאן ייכנס לבד להוק ולתסריט שנכתבים אחר כך.</p>
    <button type="button" class="va-text-link" id="va-what-creative-link">מה זה בעצם קריאייטיב?</button>
    ${promptPeek(highlightPlaceholders(prompt, [domain, audience, idea]))}
    ${copyBtn(prompt, "להעתיק פרומפט לג'מיני")}
    <textarea class="cosmic-textarea" id="va-packaging-input" placeholder="להדביק כאן את הכיוון שבחרת..." style="margin-top:14px"></textarea>
    ${withBasics ? `
    <p class="cosmic-field-label" style="margin-top:16px">מה נקודת היציאה של הרעיון?</p>
    <button type="button" class="va-text-link" id="va-what-start-link">מה זה אומר?</button>
    <div class="cosmic-chip-row" id="va-start-row">${chips(STARTING_POINTS, state.startingPoint, 'data-start')}</div>` : ''}
    <div class="cosmic-btn-row" style="margin-top:16px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-packaging-done-btn">ממשיכים ←</button>
    </div>
  `);
  wireCopyButtons(screenEl());
  mountSmartPaste(document.getElementById('va-packaging-input'));
  /* 29/10/2026 (מאיה): "שתהיה אופציה למי שלא הבין מה זה קריאייטיב", ו"מה
     נקודת היציאה של הרעיון, ואז אופציה לפופאפ להסביר מה זה אומר". */
  document.getElementById('va-what-creative-link').addEventListener('click', () => openModal(`
    <h2 style="margin-top:0">מה זה קריאייטיב?</h2>
    <p>קריאייטיב זה איך לוקחים רעיון ומגישים אותו ברשת בצורה מעניינת, לא בנאלית ולא משעממת.</p>
    <p>כל רעיון אפשר להנגיש באלפי דרכים. המטרה היא לבחור את הדרך הכי חזקה, זו שאתם הכי מתחברים אליה.</p>
  `));
  const startLink = document.getElementById('va-what-start-link');
  if (startLink) startLink.addEventListener('click', () => openModal(`
    <h2 style="margin-top:0">מה זה נקודת יציאה?</h2>
    <p>כל רעיון אפשר לספר דרך סיפור אישי, דרך סיפור של לקוח, או בצורה כללית.</p>
    <p>הכי חזק זה סיפור לקוח או סיפור אישי, כי זה מוחשי יותר. אם אין סיפור כזה, הולכים על כללי.</p>
  `));
  let startingPoint = state.startingPoint;
  wireChips('[data-start]', 'data-start', (v) => { startingPoint = v; });
  /* מתחילים לבדוק פורמטים כבר עכשיו (ראה requestFormatPicks) */
  const packagingInput = document.getElementById('va-packaging-input');
  let prefetchTimer = null;
  const prefetch = () => {
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(() => {
      const text = packagingInput.value.trim();
      if (text.length >= 20 && parseOptions(text).length < 2) requestFormatPicks(formatRecInput(text, startingPoint));
    }, 900);
  };
  packagingInput.addEventListener('input', prefetch);
  packagingInput.addEventListener('paste', prefetch);
  if (packagingInput.value.trim()) prefetch();
  document.getElementById('va-packaging-done-btn').addEventListener('click', () => {
    clearTimeout(prefetchTimer);
    const packaging = document.getElementById('va-packaging-input').value.trim();
    if (pastedManyOptions(packaging)) return;
    if (!packaging) {
      showToast('צריך להדביק את הכיוון שבחרת קודם');
      return;
    }
    if (withBasics && !startingPoint) {
      showToast('לבחור מה נקודת היציאה של הרעיון');
      return;
    }
    dispatch(withBasics
      ? { type: 'PACKAGING_CHOSEN', packaging, startingPoint }
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

/* 31/10/2026 (מאיה: "בחלק של ה-SOS שהוא שואל מה הסוג תוכן, בתכלס אני רוצה
   שהוא כבר יבנה את הפרומפט ופשוט יהיה כפתור העתק ל-ChatGPT... שיידע לזהות
   לבד ויקליד"). אין יותר טופס: הרעיון, הקהל ונקודת היציאה כבר ידועים, וסוג
   התוכן מזוהה לבד. מה שבכל זאת לא ידוע, הפרומפט מבקש מ-ChatGPT לזהות. */
let extractionTypeCache = { idea: '', type: '', pending: null };
let extractionProfile = null;

function knownExtractionType(idea) {
  if (CONTENT_TYPES.includes(state.contentType)) return state.contentType;
  return extractionTypeCache.idea === idea ? extractionTypeCache.type : '';
}

function extractionContentType(idea) {
  const known = knownExtractionType(idea);
  if (known) return Promise.resolve(known);
  if (extractionTypeCache.idea === idea && extractionTypeCache.pending) return extractionTypeCache.pending;
  const pending = classifyContentType(idea).then((found) => {
    /* רק שלושת הסוגים נכנסים לפרומפט, גם אם הסיווג החזיר משהו ישן */
    const type = CONTENT_TYPES.includes(found) ? found : '';
    if (extractionTypeCache.pending === pending) extractionTypeCache = { idea, type, pending: null };
    return type;
  });
  extractionTypeCache = { idea, type: '', pending };
  return pending;
}

/* 31/10/2026 (מאיה: "הפרומט של המגילת אסתר טוען לאט"). הפופאפ חיכה לסיווג:
   שרת שמתעורר (כ-2 שניות בלוגים) ועוד קריאה למודל. עכשיו הזיהוי מתחיל כשנכנסים
   למסך, והפופאפ לא מחכה לו בכלל. */
function prepareExtractionHelper() {
  extractionProfile = getProfile().catch(() => null);
  extractionContentType(state.ideaDescription || state.hook || '');
}

async function openExtractionHelperModal() {
  // 19/10/2026: גם קרוא ממסך "מה יש לך להגיד?" (מסלול הרפרנס), שבו ideaDescription ריק אבל hook כן מוגדר - fallback אליו
  // כדי שגם שם יהיה הקשר אמיתי, לא ריק.
  const idea = ideaForPrompt(state) || state.hook || '';
  const overlay = openModal(`
    <h2 style="margin-top:0">קשה למצוא מה להגיד?</h2>
    <div id="va-ext-result"><p class="cosmic-hint">מכינים את הפרומפט...</p></div>
  `);
  /* תקלה בפרופיל לא עוצרת עזרה: ה-SOS הוא היציאה מהמחסום של המגילה, והפרומפט
     מסתדר גם בלי קהל ותחום. */
  const profile = await (extractionProfile || getProfile().catch(() => null));
  const contentType = knownExtractionType(idea);
  const resultEl = overlay.querySelector('#va-ext-result');
  /* היא יכלה לסגור את הפופאפ בזמן הזיהוי */
  if (!resultEl || !resultEl.isConnected) return;
  const audience = (profile && profile.primaryAudience) || '';
  const domain = (domainInfo && domainInfo.domain) || (profile && profile.business) || '';
  const startingPoint = state.startingPoint || '';
  /* 05/11/2026 (מאיה): הקריאייטיב שנבחר נכנס גם לפרומפט ה-SOS */
  const creative = creativeNow();
  const promptFor = (type) => buildExtractionPrompt({ idea, contentType: type, startingPoint, audience, domain: domain, creative });
  const typeHint = (type) => `<p class="cosmic-hint">סוג התוכן שזוהה: <strong>${escapeHtml(type)}</strong></p>`;
  const peekFor = (text, type) => highlightPlaceholders(text, [idea, type, startingPoint, audience, domain, creative]);
  const prompt = promptFor(contentType);
  resultEl.innerHTML = `
    <p>הפרומפט מוכן. ChatGPT ישאל שאלות שיוציאו ממך בדיוק מה להגיד, ובסוף יאסוף את התשובות למגילה אחת.</p>
    ${contentType ? typeHint(contentType) : ''}
    ${copyBtn(prompt, 'להעתיק ל-ChatGPT')}
    ${promptPeek(peekFor(prompt, contentType))}
    <p class="cosmic-hint" style="margin-top:10px;margin-bottom:0">אחרי שמדביקים ועונים על השאלות, חוזרים לכאן ומדביקים את המגילה בתיבת הטקסט הגדולה.</p>
  `;
  wireCopyButtons(resultEl);
  if (contentType) return;
  /* הזיהוי הגיע אחרי שהפרומפט כבר על המסך: מעדכנים במקום, בלי לסגור כלום.
     מי שכבר העתיקה קיבלה פרומפט תקין, שמבקש מ-ChatGPT לזהות לבד. */
  extractionContentType(idea).then((type) => {
    if (!type || !resultEl.isConnected) return;
    const text = promptFor(type);
    const btn = resultEl.querySelector('.va-copy-btn');
    btn.setAttribute('data-copy-text', encodeURIComponent(text));
    btn.insertAdjacentHTML('beforebegin', typeHint(type));
    resultEl.querySelector('.va-prompt-peek .cosmic-prompt-box').innerHTML = peekFor(text, type);
  });
}

function renderScratchDump() {
  /* 05/11/2026: דרך הטיוטה ולא כערך של התיבה, כמו בשאר תיבות ההדבקה */
  if (state.screen === 'scratch-dump') seedDraft('va-scratch-dump-input', state.rawDump);
  cosmicCard(`
    <h2>מגילת אסתר</h2>
    ${creativeReminderHtml()}
    <p>תשפכו כל מה שיש לכם להגיד, הסדר לא משנה. כל מה שעולה לכם לראש, לפרטי פרטים וכמה שיותר ספציפי, עם דוגמאות ומספרים. מומלץ להיעזר בפרומפט חילוץ התוכן בכפתור ה-SOS.</p>
    <button type="button" class="va-sos-big" id="va-scratch-help-btn">
      <span class="va-sos-big__icon" aria-hidden="true">🆘</span>
      <span class="va-sos-big__text"><strong>נתקעים? לא ברור מה לכתוב?</strong><span>לחיצה כאן, ו-ChatGPT ישאל אותך שאלות שיוציאו ממך מגילה מלאה</span></span>
    </button>
    <textarea class="cosmic-textarea" id="va-scratch-dump-input" style="min-height:160px" placeholder="כל מה שיש לך להגיד..."></textarea>
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
  prepareExtractionHelper();
  attachMic('va-scratch-dump-input');
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
  const t = ++renderSeq;
  const profile = await getProfile();
  const audience = profile && profile.primaryAudience ? profile.primaryAudience : '';
  const domain = await myDomain();
  if (t !== renderSeq) return;
  const creative = creativeNow();
  /* 06/11/2026 (מאיה): "שתעיפי לגמרי את שיטת השכפול ההפוך, סתם מבלבל".
     השורה האופציונלית של תמלול רפרנס ירדה, וההוקים נבנים תמיד
     מבנק ההוקים לפי המגילה. */
  const prompt = buildHookFindingPrompt({ idea: ideaForPrompt(state), script: state.rawDump || '', audience, domain: domain, creative });
  const marks = [state.ideaDescription, state.rawDump, audience, creative];
  /* 09/11/2026: הוק שכתוב באריזה במפורש נכנס לתיבה לבד, מסומן בצהוב, והפרומפט
     עובר לאפשרות "לא אהבת?". ראה hookFromPackaging. */
  const detected = hookFromPackaging(creative);
  if (state.screen === 'scratch-hook') seedDraft('va-scratch-hook-input', state.hook || detected);
  /* ההודעה והפרומפט המקופל רק כשבתיבה באמת יושב ההוק שזוהה. הוק שהיא
     כתבה או תיבה שהיא ריקנה = המסך הרגיל. */
  const drafts = state.drafts || {};
  const k = draftKey(state.screen, 'va-scratch-hook-input');
  const boxValue = Object.prototype.hasOwnProperty.call(drafts, k) ? drafts[k] : (state.hook || '');
  const autoHook = detected && String(boxValue || '').trim() === detected ? detected : '';
  const promptBlock = `
    <p>הפרומפט כולל בנק הוקים אמיתי מוטמע - ChatGPT יתאים לך ממנו הוק מדויק. להעתיק, להדביק, ולחזור עם ההוק שבחרת.</p>
    ${creative ? '<p class="cosmic-hint">ההוקים נבנים סביב הקריאייטיב: מה שאומרים תוך כדי הפתיחה שבחרת או מיד אחריה.</p>' : ''}
    ${promptPeek(highlightPlaceholders(prompt, marks))}
    ${copyBtn(prompt, 'להעתיק פרומפט ל-ChatGPT')}`;
  const inputBlock = `
    <textarea class="cosmic-textarea" id="va-scratch-hook-input" placeholder="להדביק כאן את ההוק שבחרת..." style="margin-top:14px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-scratch-hook-done-btn">ממשיכים ←</button>
    </div>`;
  cosmicCard(autoHook ? `
    <h2>מציאת הוק</h2>
    ${creativeReminderHtml()}
    <div class="va-auto-hook-note" id="va-auto-hook-note">✨ <strong>ההוק זוהה אוטומטית מהאריזה הקריאייטיבית</strong> וכבר נמצא בתיבה. אם לא אהבת אותו, אפשר לקבל הוקים אחרים מהפרומפט למטה.</div>
    ${inputBlock}
    <details class="va-more va-auto-hook-more">
      <summary>לא אהבת את ההוק? לפרומפט שימצא הוק אחר</summary>
      ${chatgptHookNote()}
      ${promptBlock}
    </details>
  ` : `
    <h2>מציאת הוק</h2>
    ${chatgptHookNote()}
    ${creativeReminderHtml()}
    ${promptBlock}
    ${inputBlock}
  `);
  wireCopyButtons(screenEl());
  mountSmartPaste(document.getElementById('va-scratch-hook-input'));
  if (autoHook) {
    const input = document.getElementById('va-scratch-hook-input');
    /* הצהוב רק כל עוד מה שבתיבה הוא ההוק שזוהה. היא שינתה, הוא שלה. */
    const mark = () => input.classList.toggle('va-auto-hook', input.value.trim() === autoHook);
    setTimeout(mark, 0);
    input.addEventListener('input', mark);
  }
  document.getElementById('va-scratch-hook-done-btn').addEventListener('click', () => {
    const hook = document.getElementById('va-scratch-hook-input').value.trim();
    if (pastedManyOptions(hook)) return;
    if (!hook) {
      showToast('צריך להדביק את ההוק שבחרת קודם');
      return;
    }
    dispatch({ type: 'SCRATCH_HOOK_CHOSEN', hook });
  });
}

async function renderScratchHookReinforce() {
  const t = ++renderSeq;
  const audience = await myAudience();
  const domain = await myDomain();
  if (t !== renderSeq) return;
  const creative = creativeNow();
  const prompt = buildHookReinforcementPrompt({ idea: ideaForPrompt(state), hook: state.hook || '', script: state.rawDump || '', audience, domain: domain, creative });
  if (state.screen === 'scratch-hook-reinforce') seedDraft('va-scratch-reinforce-input', state.hookReinforcement);
  cosmicCard(`
    <h2>חיזוק ההוק</h2>
    ${chatgptHookNote()}
    ${creativeReminderHtml()}
    <p>המשפט השני, שנותן סיבה ברורה להישאר. להעתיק, להדביק ב-ChatGPT, ולחזור עם החיזוק שבחרת.</p>
    ${promptPeek(highlightPlaceholders(prompt, [state.ideaDescription, state.hook, state.rawDump, creative]))}
    ${copyBtn(prompt, 'להעתיק פרומפט ל-ChatGPT')}
    <textarea class="cosmic-textarea" id="va-scratch-reinforce-input" placeholder="להדביק כאן את חיזוק ההוק שבחרת..." style="margin-top:14px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-scratch-reinforce-done-btn">ממשיכים ←</button>
    </div>
  `);
  wireCopyButtons(screenEl());
  mountSmartPaste(document.getElementById('va-scratch-reinforce-input'));
  document.getElementById('va-scratch-reinforce-done-btn').addEventListener('click', () => {
    const text = document.getElementById('va-scratch-reinforce-input').value.trim();
    if (pastedManyOptions(text)) return;
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
  /* 10/11/2026 (מאיה): לא כל סרטון צריך הנעה לפעולה. כאן מסיימים במסר חזק. */
  { value: 'בלי', label: 'בלי הנעה לפעולה, רק מסר חזק' },
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
  const t = ++renderSeq;
  const audience = await myAudience();
  const domain = await myDomain();
  if (t !== renderSeq) return;
  const creative = creativeNow();
  const buildPrompt = (ctaType, funnel) => buildScriptDistillationPrompt({
    idea: ideaForPrompt(state), hook: state.hook || '', hookReinforcement: state.hookReinforcement || '',
    rawScript: state.rawDump || '', ctaType, funnel,
    audience, domain: domain, carousel: isCarousel(state), dynamicText: isDynamicText(state), creative,
  });
  /* 28/10/2026 (מאיה): "מאוד קל לפספס איזו הנעה לפעולה רוצים, שימי לב".
     זו הייתה רשימה נפתחת שכבר בחרה "משפך" לבד, כך שאפשר היה להעתיק את
     הפרומפט בלי לראות שיש כאן בחירה בכלל. עכשיו אלה כפתורים גדולים,
     אף אחד לא בחור מראש, והפרומפט מופיע רק אחרי שבוחרים. */
  seedDraft('va-scratch-script-input', state.draftScript);
  const ctaButtons = CTA_TYPES.map((c) => `
    <button type="button" class="cosmic-btn cosmic-chip-btn" data-cta="${escapeHtml(c.value)}">${escapeHtml(c.label)}</button>
  `).join('');
  cosmicCard(`
    <h2>זיקוק התסריט הסופי</h2>
    ${creativeReminderHtml()}
    ${isCarousel(state) ? '<p class="cosmic-hint">בחרת פוסט קרוסלה, אז הפרומפט כותב טקסט קצר לכל שקופית, עד 10 שקופיות.</p>' : ''}
    ${isDynamicText(state) ? '<p class="cosmic-hint">בחרת טקסט דינמי, אז הפרומפט כותב את התסריט לפי פריימים: פריים 1 ההוק, פריים 2 החיזוק, ומשם משפט אחד קצר וחד בכל פריים.</p>' : ''}
    <div class="va-cta-pick">
      <p class="va-cta-pick-title">⭐ קודם לבחור: מה הצופה צריך לעשות בסוף הסרטון?</p>
      <div class="cosmic-chip-row" id="va-scratch-cta-row">${ctaButtons}</div>
      <div class="va-funnel-ask" id="va-scratch-funnel-wrap" hidden>
        <label class="cosmic-field-label" for="va-scratch-funnel-input">מה המשפך? לאן הצופה עובר בסוף הסרטון?</label>
        <input type="text" class="cosmic-textarea" id="va-scratch-funnel-input" style="min-height:auto" placeholder="למשל: מדריך חינמי, וובינר, קבוצת וואטסאפ">
      </div>
    </div>
    <div id="va-scratch-distill-prompt-wrap" style="margin-top:14px"></div>
    <textarea class="cosmic-textarea" id="va-scratch-script-input" placeholder="להדביק כאן את התסריט הסופי שקיבלת..." style="margin-top:14px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-scratch-script-done-btn">ממשיכים ←</button>
    </div>
  `);
  const wrap = document.getElementById('va-scratch-distill-prompt-wrap');
  /* 31/10/2026 (מאיה: "אם אני בוחרת משפך, שישאל אותי רגע מה המשפך שאצטרך
     להזין, ואז הוא יוסיף את זה לפרומפט"). בלי זה ChatGPT המציא לאן לשלוח. */
  const funnelWrap = document.getElementById('va-scratch-funnel-wrap');
  const funnelInput = document.getElementById('va-scratch-funnel-input');
  let cta = '';
  function refreshPrompt() {
    if (!cta) {
      wrap.innerHTML = '<p class="cosmic-hint">הפרומפט יופיע כאן אחרי שבוחרים הנעה לפעולה.</p>';
      return;
    }
    const funnel = cta === 'משפך' ? funnelInput.value.trim() : '';
    if (cta === 'משפך' && funnel.length < 2) {
      wrap.innerHTML = '<p class="cosmic-hint">הפרומפט יופיע כאן אחרי שכותבים מה המשפך.</p>';
      return;
    }
    const prompt = buildPrompt(cta, funnel);
    /* הצהוב מסמן מה מולא לבד, ולכן התחום והקהל שייכים לשם גם הם. */
    const values = [state.ideaDescription, state.hook, state.hookReinforcement, state.rawDump, cta, funnel,
      audience, domain, creative];
    /* 09/11/2026 (מאיה: "לפעמים הוא חד יותר מהצ'אט") */
    wrap.innerHTML = `${promptPeek(highlightPlaceholders(prompt, values))}${copyBtn(prompt, "להעתיק פרומפט ל-ChatGPT / ג'מיני")}`;
    wireCopyButtons(wrap);
  }
  document.querySelectorAll('#va-scratch-cta-row [data-cta]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#va-scratch-cta-row [data-cta]').forEach((o) => o.classList.remove('cosmic-chip-btn--on'));
    b.classList.add('cosmic-chip-btn--on');
    cta = b.getAttribute('data-cta');
    funnelWrap.hidden = cta !== 'משפך';
    refreshPrompt();
    if (cta === 'משפך' && !funnelInput.value.trim()) funnelInput.focus();
  }));
  /* לא בכל הקשה: בנייה מחדש סוגרת את "לראות את הפרומפט" ומציגה כפתור העתקה
     על מילה חצי כתובה. */
  let funnelTimer = null;
  funnelInput.addEventListener('input', () => {
    clearTimeout(funnelTimer);
    funnelTimer = setTimeout(refreshPrompt, 400);
  });
  refreshPrompt();
  document.getElementById('va-scratch-script-done-btn').addEventListener('click', () => {
    /* המסך הבא מחכה לפרופיל, ובינתיים הכפתור הזה עדיין על המסך. */
    if (state.screen !== 'scratch-distill') return;
    if (isCarousel(state)) celebrate();
    const text = document.getElementById('va-scratch-script-input').value.trim();
    if (!text) {
      showToast('צריך להדביק את התסריט קודם');
      return;
    }
    /* 05/11/2026: ההנעה לפעולה נשמרת, כדי שהתיאור לסרטון ימלא אותה לבד */
    state.ctaType = cta || null;
    state.ctaFunnel = cta === 'משפך' ? funnelInput.value.trim() : '';
    dispatch({ type: 'SCRATCH_SCRIPT_READY', text });
  });
}

/* 31/10/2026 (מאיה: "מה שהוא עושה לוקח את התסריט ומוודא שהוא לא מנוסח בצורה
   של הרצאה אלא בצורה שמתאימה לרשתות החברתיות", "במידת הצורך"). כפתור אחד:
   הודבקה גרסה חדשה, היא התסריט. לא הודבק כלום, ממשיכים עם מה שיש. */
async function renderScratchScene() {
  const t = ++renderSeq;
  const script = state.draftScript || '';
  /* תקלה בפרופיל לא עוצרת כאן: הפרומפט מסתדר גם בלי קהל ותחום, ובלי זה הכפתור
     במסך הקודם לא היה עושה כלום. */
  const [audience, domain] = await Promise.all([myAudience().catch(() => ''), myDomain().catch(() => '')]);
  if (t !== renderSeq || state.screen !== 'scratch-scene') return;
  const creative = creativeNow();
  const prompt = buildSceneRewritePrompt({ script, audience, domain, creative });
  seedDraft('va-scratch-scene-input', state.sceneRewrite);
  cosmicCard(`
    <h2>התסריט נשמע כמו הרצאה?</h2>
    ${creativeReminderHtml()}
    <p>אם הוא יצא קצת מסביר ופחות סיפורי, הפרומפט הזה משכתב אותו לשפה של רשתות חברתיות. להעתיק, להדביק ב-ChatGPT, ולחזור עם הגרסה החדשה.</p>
    ${promptPeek(highlightPlaceholders(prompt, [script, audience, domain, creative]))}

    ${copyBtn(prompt, 'להעתיק פרומפט ל-ChatGPT')}
    <textarea class="cosmic-textarea" id="va-scratch-scene-input" placeholder="להדביק כאן את הגרסה החדשה..." style="margin-top:14px"></textarea>
    <p class="cosmic-hint">התסריט כבר טוב? לא צריך להדביק כלום, פשוט ממשיכים.</p>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-scratch-scene-done-btn">ממשיכים ←</button>
    </div>
  `);
  wireCopyButtons(screenEl());
  document.getElementById('va-scratch-scene-done-btn').addEventListener('click', () => {
    const text = document.getElementById('va-scratch-scene-input').value.trim();
    celebrate();
    dispatch({ type: 'SCRATCH_SCENE_DONE', text });
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
  /* 05/11/2026: הצ'קליסט לא היה קיים בשום מקום. עכשיו יש דף אמיתי. */
  'לפני הצילום ולפני ההעלאה: לעבור על "דף צילום" (הכפתור 🎬 למטה), ולסמן שם כל מה שבוצע.',
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
  } else if (state.branch === 'reference') {
    steps.push('מצאת רפרנס מוכן במאגר שלך.');
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
    steps.push(isCarousel(state) ? 'קיבלת את הטקסט לכל שקופית בקרוסלה.' : (isDynamicText(state) ? 'קיבלת את התסריט מחולק לפריימים, משפט קצר בכל פריים.' : 'קיבלת תסריט סופי מזוקק.'));
    if (state.sceneRewritten) steps.push('שכתבת אותו לשפה של רשתות חברתיות, כדי שלא יישמע כמו הרצאה.');
    steps.push(isCarousel(state) ? 'עכשיו: לעצב את השקופיות לפי הטקסט למטה.' : (isDynamicText(state) ? 'עכשיו: לבחור קטע וידאו לכל פריים, לשים עליו את המשפט שלו, ולהוסיף מוזיקה.' : 'עכשיו: ללכת לצלם לפי התסריט למטה, ואז לערוך.'));
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
  if (state.branch === 'reference') return state.finalScript || null;
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
      ${copyBtn(script, 'להעתיק את הטקסט')}
      ${lengthMeterHtml(script, duplicationRef(state))}` : ''}
    ${summaryToolsHtml()}
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
  wireSummaryTools(screenEl(), {
    getState: () => state,
    patch: (changes) => { state = { ...state, ...changes }; saveAll().catch((err) => console.error('saveSession failed:', err)); },
    script: script || '',
    /* 06/11/2026 (מאיה: "אני רוצה כבר שיידע לבד את התשובות וישר יכתוב"): גם לשון הפנייה מהפרופיל */
    getContext: async () => {
      const profile = (await getProfile()) || {};
      return { domain: await myDomain(), audience: await myAudience(), pronoun: profile.pronoun || '' };
    },
    openModal, copyBtn, wireCopyButtons, showToast, serverErrorText,
  });
  document.getElementById('va-restart-btn').addEventListener('click', restart);
}

/* 05/11/2026 (ביקורת): מסך שנכשל באמצע (פרופיל, מאגר או שרת שלא ענו)
   השאיר את המסך הקודם על המסך, בלי שום הודעה. כל ציור עובר כאן, והמספר
   החדש מבטל ציור ישן שעוד מחכה לשרת. */
function render() {
  renderSeq += 1;
  let out;
  try {
    out = renderScreen();
  } catch (err) {
    renderFailed(err);
    return undefined;
  }
  if (out && typeof out.catch === 'function') return out.catch(renderFailed);
  return out;
}

function renderFailed(err) {
  console.error('video assistant render failed:', err);
  showToast(serverErrorText(err, 'טעינת המסך'));
}

function renderScreen() {
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
  if (state.screen === 'scratch-scene') return renderScratchScene();
  if (state.screen === 'summary') return renderSummary();
  cosmicCard(`<p>מסך לא מוכר: "${state.screen}"</p>`);
}

/* 04/11/2026 (מאיה): "לשכפול הסרטון" ליד כל רפרנס במאגר. פותח את העוזר
   ישר בשכפול, עם הלינק והתמלול בפנים, ונוחת על המסך הבא (מציאת הוק).
   כשאין תמלול שאפשר לסמוך עליו, נוחת על מסך התמלול עם הסבר מה לכתוב.
   פתוח גם למנוי רפרנסים: השכפול הוא בדיוק הכלי שלהן.
   loadSubtitles(id) מגיע מהמאגר, שכבר מחזיק את הכתוביות בזיכרון. */
const SUBS_TIMEOUT_MS = 8000;
/* 04/11/2026 (סקירה): לחיצה כפולה הריצה שני שכפולים, והשני נשאר
   ב"התסריטים שלי" כפריט יתום. שכפול אחד בכל רגע, ומיד רואים שזה נפתח. */
let duplicating = false;
export async function duplicateFromBank(video, opts = {}) {
  if (!video || !video.url || duplicating) return;
  duplicating = true;
  try {
    await runDuplicateFromBank(video, opts);
  } finally {
    duplicating = false;
  }
}

async function runDuplicateFromBank(video, { loadSubtitles } = {}) {
  /* הכתוביות יכולות לקחת כמה שניות. העוזר נפתח מיד, עם הודעה. */
  showView('video-assistant');
  screenEl().innerHTML = '<div class="cosmic-card" id="va-card"><p>פותחים את השכפול…</p></div>';
  let segments = null;
  if (video.hasSubtitles && video.id && typeof loadSubtitles === 'function') {
    let timer = null;
    try {
      segments = await Promise.race([
        loadSubtitles(video.id),
        new Promise((resolve) => { timer = setTimeout(() => resolve(null), SUBS_TIMEOUT_MS); }),
      ]);
    } catch (err) {
      /* בלי כתוביות נופלים לטקסט הקריאה, ולא עוצרים */
      console.error('loadSubtitles for duplication failed:', err);
    } finally {
      clearTimeout(timer);
    }
  }
  const info = duplicationText(video, segments);
  currentPickId = null;
  sessionStartTs = Date.now();
  const start = () => dispatch({
    type: 'START_FROM_BANK',
    link: video.url,
    bankId: video.id || null,
    transcript: info.text,
    ready: readyForHook(info),
    /* השם ב"התסריטים שלי" עד שנבחר הוק: על מה הסרטון, לפי המאגר */
    title: String(video.contentSummary || '').trim() || null,
    notice: { reason: info.reason, source: info.source, foreign: info.foreign, text: info.text },
  });
  /* כמו בפתיחה הרגילה: בלי תחום וקהל הפרומפט יוצא בלי הקשר, ולכן קודם
     ממלאים אותם (פעם אחת), ורק אז נכנסים לשכפול. */
  let incomplete = false;
  try {
    incomplete = profileIncomplete(await getProfile());
  } catch (err) {
    console.error('getProfile before duplication failed:', err);
  }
  if (incomplete) renderProfileSetup(start).catch(renderFailed);

  else start();
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
  window.addEventListener('resize', fitView);
  document.getElementById('video-assistant-scripts-btn').addEventListener('click', openScriptsLibrary);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') requestCloseModal(); });
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
    /* 05/11/2026 (ביקורת): נפתח סרטון אחר מזה שבזיכרון (או התחלה חדשה):
       תמלול מדויק שעוד רץ לא שייך אליו. */
    if (!isResumable || (saved.scriptId || null) !== (state.scriptId || null)) resetAccurateRuns();
    state = isResumable ? migrateLegacyState(saved) : INITIAL_STATE;

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
