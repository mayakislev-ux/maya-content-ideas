// js/video-assistant.js
// 13/10/2026: "העוזר שלך ליצירת סרטון" - שכבת הכוונה, לא כלי יצירה (ראה
// docs/superpowers/specs/2026-10-13-video-creation-assistant-design.md).
// מרנדר תמיד מחדש innerHTML של #video-assistant-screen לפי ה-state הנוכחי
// של video-assistant-flow.js, בדיוק כמו ש-warming.js מרנדר renderPlan()
// מחדש בכל שינוי - לא DOM דיפ, זה מסך-אחד-בכל-רגע, לא רשימה גדולה.
//
// 14/10/2026 (מאיה, אחרי ניתוח מעמיק של "מפת הדרכים ליצירת תוכן" האמיתית):
// "מרגיש שעכשיו קצת סיבכנו" - ההחלטה: לא לשכפל כאן את התוכן העשיר של
// המסמכים האמיתיים (16 פורמטים, 31 זוויות, 3 פרומפטים ל-ChatGPT) - בדיוק
// כמו שהמפה האמיתית שלה לא עושה את זה, רק מפנה אליהם בלינק. ראה
// video-assistant-flow.js להסבר המלא על המבנה החדש.
const FORMATS_DOC_URL = 'https://docs.google.com/document/d/14Az_ZFHNCEAzwPh4_VO4k2njqJjTxFOyS0G87KdCI8g/edit';
const SCRIPT_WRITING_DOC_URL = 'https://docs.google.com/document/d/1Ejx_60ZHhhiA5VXWLboqyoZeaax5O61h05nO6QKfdc8/edit';

import { INITIAL_STATE, nextStep } from './video-assistant-flow.js';
import { pickIdea, pickReference } from './video-assistant-picker.js';
import { buildDuplicationPrompt, buildScriptPrompt } from './video-assistant-prompts.js';
import { playReroll, playSuccess, setMuted, getMuted } from './video-assistant-sound.js';
import {
  fetchIdeas, fetchInspirationBank, getSavedDomain, guessDomain, saveDomain, loadSession, saveSession, suggestSearchKeywords,
} from './video-assistant-store.js';
import { getProfile } from './user-profile.js';
import { showView } from './view-router.js';
import { openInspirationView } from './inspiration-view.js';
import { showToast } from './toast.js';

// 14/10/2026: רשימת שמות בלבד (בלי ההגדרות הארוכות) - אותה רשימה בדיוק
// כמו functions/inspiration-constants.js, לתפריט הבחירה הידני/לתיקון.
const SUBCATEGORIES_BY_DOMAIN = {
  'יופי וקוסמטיקה': ['טיפול פנים', 'איפור קבוע', 'גבות', 'ריסים', 'ציפורניים', 'שיער', 'איפור', 'לייזר והסרת שיער', 'אסתטיקה רפואית', 'טיפולי גוף', 'שיזוף'],
  'בריאות נפשית, טיפול ורוח': ['פסיכולוגיה וטיפול רגשי', 'אימון אישי והתפתחות אישית', 'זוגיות ומערכות יחסים', 'הדרכת הורים ומשפחה', 'NLP ושיטות טיפול אלטרנטיביות', 'תקשור', 'נומרולוגיה', 'אסטרולוגיה', 'טארוט וקלפים'],
  'עסקים ויזמות': ['שיווק ויצירת תוכן', 'מכירות', 'ייעוץ וליווי עסקי', 'פיננסים', 'קריירה ותעסוקה', 'משאבי אנוש וגיוס', 'AI ואוטומציות לעסקים'],
  'עיצוב, נדל"ן ואדריכלות': ['תיווך נדל"ן', 'השקעות נדל"ן', 'השבחת נכסים', 'עיצוב פנים', 'אדריכלות', 'הום סטיילינג'],
  'כושר ותזונה': ['פילאטיס', 'יוגה', 'אימוני כוח וכושר', 'ריצה וסיבולת', 'דיאטניות, תזונאיות, ליווי תזונתי', 'פיזיותרפיה ושיקום', 'ציוד ספורט'],
  'תוכן אישי וחיבור': [],
};

let state = INITIAL_STATE;
let ideasCache = null;
let videosCache = null;
let domainInfo = null; // { domain, subCategory }
let currentPickId = null;

function screenEl() {
  return document.getElementById('video-assistant-screen');
}

function dispatch(action) {
  state = nextStep(state, action);
  saveSession(state).catch((err) => console.error('saveSession failed:', err));
  render();
}

function cosmicCard(innerHtml) {
  screenEl().innerHTML = `<div class="cosmic-card">${innerHtml}</div>`;
}

function restart() {
  state = INITIAL_STATE;
  currentPickId = null;
  saveSession(state).catch((err) => console.error('saveSession failed:', err));
  render();
}

// ===== מסך פתיחה: שלושת מסלולי הפתיחה האמיתיים =====
function renderOpening() {
  cosmicCard(`
    <h2>✨ היי מאיה</h2>
    <p>בואי ניצור את הסרטון הבא שלך</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn" id="va-footage-btn">יש לי קטע מצולם</button>
      <button type="button" class="cosmic-btn" id="va-reference-btn">מצאתי סרטון שעבד ברשת</button>
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-idea-btn">יש לי רעיון</button>
    </div>
  `);
  document.getElementById('va-footage-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_FOOTAGE' }));
  document.getElementById('va-reference-btn').addEventListener('click', () => {
    // currentPickId לא יכול להישאר ממצב קודם באותו סשן (למשל היא חזרה
    // אחורה והחליפה מסלול) - renderPulledReference בוחר רפרנס חדש רק
    // כש-currentPickId ריק, אחרת זה יחפש וידאו שלא קיים ויקרוס על video.url.
    currentPickId = null;
    dispatch({ type: 'CHOOSE_REFERENCE' });
  });
  document.getElementById('va-idea-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_IDEA' }));
}

// ===== מסלול "יש לי רעיון" - איך מקבלים את הרעיון =====
function renderIdeaSourceChoice() {
  cosmicCard(`
    <h2>מאיפה הרעיון?</h2>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-type-idea-btn">יש לי רעיון בראש, אכתוב אותו</button>
      <button type="button" class="cosmic-btn" id="va-pull-idea-btn">תזכירי לי רעיון שכבר שמרתי</button>
    </div>
  `);
  document.getElementById('va-type-idea-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_TYPE_IDEA' }));
  document.getElementById('va-pull-idea-btn').addEventListener('click', async () => {
    if (!ideasCache) ideasCache = await fetchIdeas();
    const picked = pickIdea(ideasCache, null);
    if (!picked) {
      showToast('אין עדיין רעיונות שמורים בבנק שלך - תכתבי את הרעיון עכשיו');
      dispatch({ type: 'CHOOSE_TYPE_IDEA' });
      return;
    }
    currentPickId = picked.id;
    dispatch({ type: 'CHOOSE_PULL_IDEA' });
  });
}

function renderTypeIdea() {
  cosmicCard(`
    <h2>מה הרעיון שלך?</h2>
    <textarea class="cosmic-textarea" id="va-type-idea-input" placeholder="כתבי את הרעיון שלך..."></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-type-idea-done-btn">המשך</button>
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
  cosmicCard(`
    <h2>🎲 הרעיון הזה</h2>
    <p style="font-size:16px;color:#fff;font-weight:600">${idea.title}</p>
    ${idea.hookText ? `<p>${idea.hookText}</p>` : ''}
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-accept-idea-btn">אהבתי, בואי נמשיך</button>
    </div>
    <button type="button" class="cosmic-reroll-btn" id="va-reroll-idea-btn">לא אהבתי - הגרילי שוב</button>
  `);
  document.getElementById('va-accept-idea-btn').addEventListener('click', () => {
    // state.hook/ideaDescription נשמרים ישירות (בלי dispatch ביניים) כדי
    // ש-describe-idea בהמשך (אם תבחר שכפול הפוך) ידע מה הרעיון בלי לשאול
    // שוב, ו-prompt2 בסוף הצינור ידע מה ה"הוק" של המסלול הזה.
    state.hook = idea.hookText || idea.title;
    state.ideaDescription = idea.hookText || idea.title;
    dispatch({ type: 'ACCEPT_PICK' });
  });
  document.getElementById('va-reroll-idea-btn').addEventListener('click', () => {
    playReroll();
    const picked = pickIdea(ideasCache, currentPickId);
    if (picked) currentPickId = picked.id;
    dispatch({ type: 'REROLL' });
  });
}

// ===== השער המשותף: "רלוונטי לקהל היעד, או משרת את המותג?" =====
// 14/10/2026: טקסט מילה-במילה מ"מפת הדרכים ליצירת תוכן" האמיתית - לא
// ניסוח חדש. חוזר אחרי כל אחד משלושת מסלולי הפתיחה, בדיוק כמו במפה שלה.
function renderRelevanceCheck() {
  cosmicCard(`
    <h2>בודקים לפני שממשיכים</h2>
    <p><strong>האם הרעיון רלוונטי לקהל היעד, או משרת את המותג?</strong></p>
    <p style="font-size:14px">
      <strong>רלוונטי לקהל היעד</strong> = תוכן שמדבר לקהל היעד הנכון.<br><br>
      <strong>משרת את המותג</strong> = תוכן שלא בהכרח מדבר ישירות על העסק או התחום שלך, אבל כן מציג את האישיות/הערכים/תפיסת העולם שלך.
    </p>
    <p class="cosmic-prompt-box" style="text-align:right;font-size:13px">
      דוגמה: מעצבת פנים שמעלה סרטון חמוד של אבא שלה רץ לחבק את הכלב - לא מדבר לקהל היעד שלה ולא מחזק את המותג שלה. אם זה היה סרטון של המעצבת פנים <strong>בעצמה</strong> רצה אל הכלב שלה - לגמרי היתה יכולה להעלות!
    </p>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-relevance-ok-btn">כן, זה רלוונטי/משרת את המותג</button>
    </div>
  `);
  document.getElementById('va-relevance-ok-btn').addEventListener('click', () => dispatch({ type: 'RELEVANCE_CONFIRMED' }));
}

// ===== מסלול קטע מצולם =====
function renderFootageUseChoice() {
  cosmicCard(`
    <h2>מה עושים עם הקטע?</h2>
    <p>רוב הקטעים המצולמים לא נוגעים בהם יותר מדי, חוץ מלערוך ולקצר. רק לפעמים כדאי להמיר לפורמט אחר (למשל וויס אובר) ואז אולי גם לכתוב תסריט.</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-footage-asis-btn">משתמשת כמו שהוא</button>
      <button type="button" class="cosmic-btn" id="va-footage-convert-btn">רוצה להמיר לפורמט אחר</button>
    </div>
  `);
  document.getElementById('va-footage-asis-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_AS_IS' }));
  document.getElementById('va-footage-convert-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_CONVERT' }));
}

function renderFootageScript() {
  cosmicCard(`
    <h2>כתבי את התסריט/וויס אובר</h2>
    <p>במילים שלך - מה שתרצי להגיד מעל הקטע המצולם</p>
    <textarea class="cosmic-textarea" id="va-footage-script-input"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-footage-script-done-btn">סיימתי</button>
    </div>
  `);
  document.getElementById('va-footage-script-done-btn').addEventListener('click', () => {
    const text = document.getElementById('va-footage-script-input').value.trim();
    if (!text) {
      showToast('צריך לכתוב משהו קודם');
      return;
    }
    playSuccess();
    dispatch({ type: 'FOOTAGE_SCRIPT_SUBMITTED', text });
  });
}

function renderFootageDone() {
  cosmicCard(`
    <h2>🎬 מוכן!</h2>
    <p>לכי לערוך ולקצר - בהצלחה עם הסרטון</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-restart-btn">ליצור סרטון נוסף</button>
    </div>
  `);
  document.getElementById('va-restart-btn').addEventListener('click', restart);
}

// ===== בחירת פורמט הנגשה - קישור בלבד לרשימה האמיתית, לא נבנית מחדש כאן =====
function renderFormatChoice() {
  cosmicCard(`
    <h2>בוחרים פורמט הנגשה</h2>
    <p>לכל רעיון יכולים להתאים כמה פורמטים - תבחרי את מה שהכי מרגיש לך נכון.</p>
    <div class="cosmic-btn-row">
      <a href="${FORMATS_DOC_URL}" target="_blank" rel="noopener" class="cosmic-btn" style="text-decoration:none;display:block;text-align:center">לרשימת כל הפורמטים ↗</a>
    </div>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-format-ok-btn">בחרתי פורמט, המשך</button>
    </div>
  `);
  document.getElementById('va-format-ok-btn').addEventListener('click', () => dispatch({ type: 'FORMAT_ACKNOWLEDGED' }));
}

// ===== "צריך תסריט או לא?" - לא כל תוכן צריך תסריט =====
function renderNeedsScriptCheck() {
  cosmicCard(`
    <h2>צריך תסריט בכלל?</h2>
    <p>לא כל תוכן צריך תסריט! יש תכנים שנולדים מרגע חי וספונטני, או מפורמט ויזואלי שלא צריך תסריט.</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn" id="va-needs-script-no-btn">לא, זה ספונטני/ויזואלי</button>
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-needs-script-yes-btn">כן, צריך תסריט</button>
    </div>
  `);
  document.getElementById('va-needs-script-no-btn').addEventListener('click', () => dispatch({ type: 'NEEDS_SCRIPT_NO' }));
  document.getElementById('va-needs-script-yes-btn').addEventListener('click', () => dispatch({ type: 'NEEDS_SCRIPT_YES' }));
}

function renderNoScriptDone() {
  cosmicCard(`
    <h2>🎬 מוכן!</h2>
    <p>אין צורך בתסריט - פתחי מצלמה ותצלמי. בהצלחה עם הסרטון</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-restart-btn">ליצור סרטון נוסף</button>
    </div>
  `);
  document.getElementById('va-restart-btn').addEventListener('click', restart);
}

// ===== בחירת שיטת הכתיבה =====
function renderHasIdeaChoice() {
  cosmicCard(`
    <h2>שתי דרכים לכתוב את התסריט</h2>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-reverse-btn">שכפול הפוך (מומלץ, קל יותר)</button>
      <button type="button" class="cosmic-btn" id="va-scratch-btn">כתיבה מאפס</button>
    </div>
  `);
  document.getElementById('va-reverse-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_REVERSE_DUPLICATION' }));
  document.getElementById('va-scratch-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_FROM_SCRATCH' }));
}

// 14/10/2026 (מאיה, אחרי בדיקה אמיתית): "בתכלס הוא כבר צריך לדעת לפי
// הSHEETS שלי, וצריך לדעת תחום מדויק" - guessDomain() קורא עכשיו בעצמו
// את הגיליון בצד השרת ומחזיר גם תת-קטגוריה, לא רק תחום כללי.
async function resolveDomain() {
  if (domainInfo) return domainInfo;
  const saved = await getSavedDomain();
  if (saved) {
    domainInfo = saved;
    return domainInfo;
  }
  let guessed = null;
  try {
    guessed = await guessDomain();
  } catch (err) {
    console.error('guessDomain failed:', err);
  }
  domainInfo = guessed || { domain: null, subCategory: null };
  return domainInfo;
}

const DOMAIN_OPTIONS = Object.keys(SUBCATEGORIES_BY_DOMAIN);

function subCategorySelectHtml(domain, selectedSub) {
  const subs = SUBCATEGORIES_BY_DOMAIN[domain] || [];
  if (!subs.length) return '<p class="muted" style="font-size:13px">(לתחום הזה אין תתי-קטגוריה)</p>';
  const opts = ['<option value="">בחרי תת-קטגוריה מדויקת</option>']
    .concat(subs.map((s) => `<option value="${s}" ${s === selectedSub ? 'selected' : ''}>${s}</option>`))
    .join('');
  return `<select id="va-subcategory-select" class="cosmic-textarea" style="min-height:auto;margin-top:10px">${opts}</select>`;
}

function renderDomainConfirm(guessedDomain, guessedSub, onConfirmed) {
  // 14/10/2026 (מאיה: "תחום השיווק נעלם, לא הכל מופיע שם"): כש-guessedDomain
  // הוא null (עדיין אין ניחוש, או שהפונקציה עוד לא פרוסה), אף option לא
  // מסומן selected והדפדפן בוחר לבד את הראשון ברשימה - אבל תיבת תת-
  // הקטגוריה המשיכה להתייחס ל-null עצמו וקראה "אין תתי-קטגוריה", לא
  // תואמת את מה שבאמת מוצג בתפריט. initialDomain מתאם בין השניים.
  const initialDomain = guessedDomain || DOMAIN_OPTIONS[0];
  const options = DOMAIN_OPTIONS.map(
    (d) => `<option value="${d}" ${d === initialDomain ? 'selected' : ''}>${d}</option>`
  ).join('');
  cosmicCard(`
    <h2>התחום המדויק שלך</h2>
    <p>${guessedDomain ? `ניחשתי לפי הגיליון שלך: ${guessedDomain}${guessedSub ? ' › ' + guessedSub : ''} - נכון?` : 'לא הצלחתי לנחש מהגיליון - בחרי בעצמך:'}</p>
    <select id="va-domain-select" class="cosmic-textarea" style="min-height:auto">${options}</select>
    <div id="va-subcategory-wrap">${subCategorySelectHtml(initialDomain, guessedSub)}</div>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-domain-confirm-btn">מאשרת</button>
    </div>
  `);
  document.getElementById('va-domain-select').addEventListener('change', (e) => {
    document.getElementById('va-subcategory-wrap').innerHTML = subCategorySelectHtml(e.target.value, null);
  });
  document.getElementById('va-domain-confirm-btn').addEventListener('click', async () => {
    const chosen = document.getElementById('va-domain-select').value;
    const subSelect = document.getElementById('va-subcategory-select');
    const chosenSub = subSelect ? subSelect.value || null : null;
    await saveDomain(chosen, chosenSub);
    domainInfo = { domain: chosen, subCategory: chosenSub };
    onConfirmed();
  });
}

async function renderPulledReference() {
  if (!videosCache) videosCache = await fetchInspirationBank();
  const { domain, subCategory } = await resolveDomain();
  // גם כשיש ניחוש תחום, אם לתחום הזה יש תתי-קטגוריה אבל לא נבחרה אחת
  // מדויקת - עדיין נעצרים לאישור, כי "תחום כללי" לא מספיק (מאיה, 14/10).
  const needsConfirm = !domain || ((SUBCATEGORIES_BY_DOMAIN[domain] || []).length > 0 && !subCategory);
  if (needsConfirm) {
    renderDomainConfirm(domain, subCategory, () => render());
    return;
  }
  if (!currentPickId) {
    const picked = pickReference(videosCache, domain, subCategory, null);
    if (!picked) {
      cosmicCard(`<h2>אין עדיין רפרנסים בתחום הזה</h2><p>בחרי "יש לי רעיון" במקום, או חזרי מאוחר יותר.</p>`);
      return;
    }
    currentPickId = picked.id;
  }
  const video = videosCache.find((v) => v.id === currentPickId);
  cosmicCard(`
    <h2>🎲 הרפרנס הזה</h2>
    <p><a href="${video.url}" target="_blank" rel="noopener" style="color:#fff">פתחי לצפייה ←</a></p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-accept-ref-btn">אהבתי, בואי נמשיך</button>
    </div>
    <button type="button" class="cosmic-reroll-btn" id="va-reroll-ref-btn">לא אהבתי - הגרילי שוב</button>
  `);
  document.getElementById('va-accept-ref-btn').addEventListener('click', () => dispatch({ type: 'ACCEPT_PICK' }));
  document.getElementById('va-reroll-ref-btn').addEventListener('click', () => {
    playReroll();
    const picked = pickReference(videosCache, domain, subCategory, currentPickId);
    if (picked) currentPickId = picked.id;
    dispatch({ type: 'REROLL' });
    renderPulledReference();
  });
}

// 14/10/2026 (מאיה: "את לא מקשיבה! אני מביאה לה רעיון, ואני רוצה שהיא
// תמצא רפרנס לבד - את תביאי לה כותרות"): הכלי לא מחפש רפרנס בשבילה -
// רק מציע מילות חיפוש, והיא עצמה מוצאת ומאשרת שמצאה. אם כבר יש רעיון
// ידוע (הקלידה אותו קודם, או משכה מהבנק) - לא שואלים שוב, ישר מציעים
// מילות חיפוש על סמך מה שכבר יש.
async function runSearchGuidanceFor(ideaText) {
  const statusEl = document.getElementById('va-idea-search-status');
  if (statusEl) statusEl.textContent = 'חושבת על מילות חיפוש...';
  let keywords = [];
  try {
    keywords = await suggestSearchKeywords(ideaText);
  } catch (err) {
    console.error('suggestSearchKeywords failed:', err);
    // לא עוצרים אותה בגלל כישלון AI - התיאור שלה עצמו הוא מילת חיפוש
    // סבירה, רק פחות מדויקת מהצעה אמיתית.
    keywords = [ideaText];
  }
  dispatch({ type: 'SEARCH_GUIDANCE_READY', idea: ideaText, keywords });
}

function renderDescribeIdea() {
  const knownIdea = state.ideaDescription || state.hook;
  if (knownIdea) {
    cosmicCard(`<p id="va-idea-search-status">חושבת על מילות חיפוש בשביל "${knownIdea}"...</p>`);
    runSearchGuidanceFor(knownIdea);
    return;
  }
  cosmicCard(`
    <h2>מה בדיוק הרעיון שלך?</h2>
    <p>תארי במילים שלך - למשל "הסיפור שלי על בולמיה" או "סיפור לקוחה שהחליקה שיער ופחדה שזה ישרוף לה אותו"</p>
    <textarea class="cosmic-textarea" id="va-idea-description-input" placeholder="הרעיון שלך..."></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-idea-search-btn">תני לי מילות חיפוש</button>
    </div>
    <p id="va-idea-search-status" class="muted" style="font-size:13px;margin-top:10px"></p>
  `);
  document.getElementById('va-idea-search-btn').addEventListener('click', async () => {
    const text = document.getElementById('va-idea-description-input').value.trim();
    if (!text) {
      showToast('צריך לכתוב את הרעיון קודם');
      return;
    }
    document.getElementById('va-idea-search-btn').disabled = true;
    await runSearchGuidanceFor(text);
  });
}

// 14/10/2026 (מאיה: "ואז היא בדיפולט צריכה לחפש רפרנסים מהמאגר שלי יש
// שם אפשרות לחפש לפי זוויות... ואם לא מוצאת רק אז להיכנס לטיקטוק
// ואינסטגרם ולחפש בעברית ברוסית באנגלית"): מסך הנחיה בלבד, בלי וידאו -
// היא פותחת את מאגר ההשראה/טיקטוק/אינסטגרם בעצמה ומחפשת שם.
function renderSearchGuidance() {
  const keywordsHtml = (state.searchKeywords || [])
    .map((k) => `<li>${k}</li>`)
    .join('');
  cosmicCard(`
    <h2>מילות חיפוש מוצעות</h2>
    <p>חפשי אותן קודם במאגר ההשראה שלך (יש שם גם אפשרות לחפש לפי זוויות) - ואם לא מוצאת, בטיקטוק ובאינסטגרם, גם בעברית, גם ברוסית וגם באנגלית:</p>
    <ul style="text-align:right;padding-inline-start:20px">${keywordsHtml}</ul>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn" id="va-open-bank-btn">פתחי את מאגר ההשראה</button>
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-found-reference-btn">מצאתי רפרנס, בואי נמשיך</button>
    </div>
  `);
  document.getElementById('va-open-bank-btn').addEventListener('click', () => {
    showView('inspiration');
    openInspirationView();
  });
  document.getElementById('va-found-reference-btn').addEventListener('click', () => dispatch({ type: 'SKIP_TO_TRANSCRIBE' }));
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
        showToast('לא הצלחתי להעתיק - סמני ידנית');
      }
    });
  });
}

// 14/10/2026 (מאיה: "להנחות אותה להוריד את הסרטון ולתמלל לעברית במידת
// הצורך בג'מיני"): לא הקלדה ידנית - הורדה + תמלול בג'מיני, ואז הדבקה כאן.
function renderTranscribe() {
  cosmicCard(`
    <h2>תמללי את הרפרנס</h2>
    <p>תורידי את הסרטון, ותמללי אותו (לעברית אם צריך) בעזרת ג'מיני - ואז תדביקי כאן את התמלול</p>
    <textarea class="cosmic-textarea" id="va-transcript-input" placeholder="הדביקי כאן את התמלול..."></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-transcribe-done-btn">✓ עשיתי</button>
    </div>
  `);
  document.getElementById('va-transcribe-done-btn').addEventListener('click', () => {
    state.transcript = document.getElementById('va-transcript-input').value;
    dispatch({ type: 'CONFIRM_DONE' });
  });
}

async function renderPrompt1() {
  const profile = await getProfile();
  const audience = profile && profile.primaryAudience ? profile.primaryAudience : '';
  const prompt = buildDuplicationPrompt({ audience, domain: domainInfo ? domainInfo.domain : '', hook: state.transcript || '' });
  cosmicCard(`
    <h2>פרומפט מוכן ל-ChatGPT</h2>
    <p>העתיקי, הדביקי ב-ChatGPT, ותחזרי עם ההוק שהכי קרץ לך מתוך ה-30</p>
    <div class="cosmic-prompt-box">${prompt}</div>
    ${copyBtn(prompt, 'העתיקי פרומפט')}
    <textarea class="cosmic-textarea" id="va-hook-input" placeholder="הדביקי כאן את ההוק שבחרת..." style="margin-top:14px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-hook-chosen-btn">המשך</button>
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

function renderHerWords() {
  cosmicCard(`
    <h2>מה יש לך להגיד?</h2>
    <p>סיפור קצר, דוגמא, או דיבור כללי על הנושא - במילים שלך</p>
    <textarea class="cosmic-textarea" id="va-herwords-input"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-herwords-done-btn">המשך</button>
    </div>
  `);
  document.getElementById('va-herwords-done-btn').addEventListener('click', () => {
    const text = document.getElementById('va-herwords-input').value.trim();
    if (!text) {
      showToast('צריך לכתוב משהו קודם');
      return;
    }
    dispatch({ type: 'HER_WORDS_SUBMITTED', text });
  });
}

function renderPrompt2() {
  const hook = state.hook || state.transcript || '';
  const prompt = buildScriptPrompt({ hook, herWords: state.herWords });
  cosmicCard(`
    <h2>הפרומפט השני</h2>
    <p>העתיקי, הדביקי ב-ChatGPT, ותקבלי תסריט מלא</p>
    <div class="cosmic-prompt-box">${prompt}</div>
    ${copyBtn(prompt, 'העתיקי פרומפט')}
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-script-ready-btn">יש לי תסריט</button>
    </div>
  `);
  wireCopyButtons(screenEl());
  document.getElementById('va-script-ready-btn').addEventListener('click', () => {
    playSuccess();
    dispatch({ type: 'SCRIPT_READY' });
  });
}

function renderReadAloud() {
  cosmicCard(`
    <h2>קראי בקול את התסריט</h2>
    <p>תבדקי שהכל מתחבר, שאין פספוסים, ושהאורך מרגיש נכון</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-read-done-btn">✓ מוכן לעריכה</button>
    </div>
  `);
  document.getElementById('va-read-done-btn').addEventListener('click', () => {
    playSuccess();
    dispatch({ type: 'CONFIRM_DONE' });
  });
}

function renderDone() {
  cosmicCard(`
    <h2>🎬 מוכן!</h2>
    <p>לכי לעריכה - בהצלחה עם הסרטון</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-restart-btn">ליצור סרטון נוסף</button>
    </div>
  `);
  document.getElementById('va-restart-btn').addEventListener('click', restart);
}

// 14/10/2026: לא בונים מחדש את 5 השלבים + 3 הפרומפטים (כולל בנק של כ-140
// הוקים אמיתיים) - הם כבר כתובים במלואם במסמך שלה. מפנים אליו ישירות,
// בדיוק כמו שהמפה האמיתית שלה עושה ("הנחיות לכתיבת תסריט ↗").
function renderFromScratch() {
  cosmicCard(`
    <h2>כתיבה מאפס</h2>
    <p>הדרך שדורשת את ההבנה השיווקית הגבוהה ביותר - שמרי אותה לרעיונות שאין להם שום מקבילה ברשת.</p>
    <p>כל השלבים, וגם 3 פרומפטים מוכנים ל-ChatGPT (חילוץ תוכן, מציאת הוק מתוך בנק הוקים אמיתי, וחיזוק הוק) - נמצאים במסמך שלך:</p>
    <div class="cosmic-btn-row">
      <a href="${SCRIPT_WRITING_DOC_URL}" target="_blank" rel="noopener" class="cosmic-btn cosmic-btn--primary" style="text-decoration:none;display:block;text-align:center">הנחיות לכתיבת תסריט ↗</a>
    </div>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn" id="va-scratch-ok-btn">הבנתי, יוצאת לכתוב</button>
    </div>
  `);
  document.getElementById('va-scratch-ok-btn').addEventListener('click', restart);
}

function render() {
  if (state.screen === 'opening') return renderOpening();
  if (state.screen === 'idea-source-choice') return renderIdeaSourceChoice();
  if (state.screen === 'type-idea') return renderTypeIdea();
  if (state.screen === 'relevance-check') return renderRelevanceCheck();
  if (state.screen === 'pulled-idea') return renderPulledIdea();
  if (state.screen === 'pulled-reference') return renderPulledReference();
  if (state.screen === 'footage-use-choice') return renderFootageUseChoice();
  if (state.screen === 'footage-script') return renderFootageScript();
  if (state.screen === 'footage-done') return renderFootageDone();
  if (state.screen === 'format-choice') return renderFormatChoice();
  if (state.screen === 'needs-script-check') return renderNeedsScriptCheck();
  if (state.screen === 'no-script-done') return renderNoScriptDone();
  if (state.screen === 'has-idea-choice') return renderHasIdeaChoice();
  if (state.screen === 'describe-idea') return renderDescribeIdea();
  if (state.screen === 'search-guidance') return renderSearchGuidance();
  if (state.screen === 'transcribe') return renderTranscribe();
  if (state.screen === 'prompt1') return renderPrompt1();
  if (state.screen === 'her-words') return renderHerWords();
  if (state.screen === 'prompt2') return renderPrompt2();
  if (state.screen === 'read-aloud') return renderReadAloud();
  if (state.screen === 'done') return renderDone();
  if (state.screen === 'from-scratch') return renderFromScratch();
  cosmicCard(`<p>מסך לא מוכר: "${state.screen}"</p>`);
}

export function wireVideoAssistantView() {
  document.getElementById('video-assistant-mute-btn').addEventListener('click', (e) => {
    const muted = !getMuted();
    setMuted(muted);
    e.target.textContent = muted ? '🔇' : '🔊';
  });
  document.getElementById('video-assistant-mute-btn').textContent = getMuted() ? '🔇' : '🔊';

  document.getElementById('hub-link-video-assistant').addEventListener('click', async () => {
    // 14/10/2026: הפריסה כאן בשני חלקים נפרדים (git push לפרונט, firebase
    // deploy נפרד לפונקציות/rules) - אם ה-rules של videoAssistantSessions
    // עדיין לא פרוסות, הקריאה הזו נכשלת ב-permission-denied. בלי ה-catch
    // הזה כל מסך הכלי לא היה נפתח כלל (promise rejection שקטה) במקום
    // פשוט להתחיל מהתחלה בלי המשכיות שמורה.
    let saved = null;
    try {
      saved = await loadSession();
    } catch (err) {
      console.error('loadSession failed:', err);
    }
    state = saved || INITIAL_STATE;
    render();
  });
}
