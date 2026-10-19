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
import { buildDuplicationPrompt, buildScriptPrompt } from './video-assistant-prompts.js';
import {
  FORMATS, SCRIPT_STRUCTURE,
  buildExtractionPrompt, buildHookFindingPrompt, buildHookReinforcementPrompt, buildScriptDistillationPrompt,
} from './video-assistant-content.js';
import { playReroll, playSuccess, setMuted, getMuted } from './video-assistant-sound.js';
import {
  fetchIdeas, fetchInspirationBank, getSavedDomain, guessDomain, saveDomain, saveSession,
} from './video-assistant-store.js';
import { getProfile } from './user-profile.js';
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
  'scratch-intro': 3, 'scratch-dump': 3, 'scratch-hook': 3, 'scratch-hook-reinforce': 3, 'scratch-distill': 3,
  'footage-speech-goal': 3, 'footage-speech-find': 3, 'footage-speech-shorten': 3, 'footage-speech-sharpen': 3, 'footage-speech-done': 3,
  'footage-visual-scan': 3, 'footage-visual-extract': 3, 'footage-visual-reframe': 3,
  'footage-visual-message': 3, 'footage-visual-objection': 3, 'footage-visual-story': 3,
  summary: 4,
};

let state = INITIAL_STATE;
let ideasCache = null;
let videosCache = null;
let domainInfo = null; // { domain, subCategory }
let currentPickId = null;
let sessionStartTs = null; // רעיון #47 - "בנית תוך X דקות"

function screenEl() {
  return document.getElementById('video-assistant-screen');
}

function dispatch(action) {
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
    ? `<button type="button" class="cosmic-back-btn" id="va-back-btn" aria-label="חזרה אחורה">→</button>`
    : '';
}

// 17/10/2026 (מאיה, רעיון #7): מסקוט קוסמי קבוע שמגיב רגשית לפי המסך -
// חי בכל cosmicCard, לא רק במסכים ספציפיים. מחזיר את אלמנט הכרטיס עצמו
// כדי שפעולות כמו flipReveal (#12) יוכלו להפעיל עליו אנימציה.
function cosmicCard(innerHtml, { showProgress = true } = {}) {
  const mood = mascotMood(state.screen);
  screenEl().innerHTML = `<div class="cosmic-card" id="va-card">
    <div class="cosmic-mascot ${mood === 'celebrate' ? 'is-celebrate' : ''}" id="va-mascot">${mascotFace(mood)}</div>
    ${backButtonHtml()}
    ${showProgress ? progressHtml() : ''}
    ${innerHtml}
  </div>`;
  const backBtn = document.getElementById('va-back-btn');
  if (backBtn) backBtn.addEventListener('click', () => dispatch({ type: 'BACK' }));
  updateLivePreview();
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
  btn.textContent = '🆘 תקוע/ה? אני כאן';
  btn.addEventListener('click', () => {
    removeSos();
    openModal(`
      <h2 style="margin-top:0">תקוע/ה רגע?</h2>
      <p>${escapeHtml(pickEncouragement())} זה בסדר להתקדם לאט - אפשר לחזור צעד אחד אחורה, או להתחיל סרטון אחר.</p>
      <div class="cosmic-btn-row">
        ${state.history.length ? '<button type="button" class="cosmic-btn" id="va-sos-back-btn">חזרה צעד אחד אחורה</button>' : ''}
        <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-sos-restart-btn">להתחיל סרטון אחר</button>
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
function removeLivePreview() {
  const panel = document.getElementById('va-live-preview');
  if (panel) panel.remove();
}

function updateLivePreview() {
  if (state.screen === 'opening' || state.screen === 'summary') {
    removeLivePreview();
    return;
  }
  const parts = [];
  if (state.ideaDescription) parts.push(['רעיון', state.ideaDescription]);
  if (state.transcript) parts.push(['תמלול', state.transcript]);
  if (state.hook) parts.push(['הוק', state.hook]);
  if (state.hookReinforcement) parts.push(['חיזוק ההוק', state.hookReinforcement]);
  if (state.herWords) parts.push(['המילים שלך', state.herWords]);
  if (state.rawDump) parts.push(['שפכ/י', state.rawDump]);
  if (state.draftScript) parts.push(['תסריט', state.draftScript]);
  if (state.finalScript) parts.push(['תסריט', state.finalScript]);
  if (!parts.length) {
    removeLivePreview();
    return;
  }
  const [label, text] = parts[parts.length - 1];
  let panel = document.getElementById('va-live-preview');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'cosmic-live-preview';
    panel.id = 'va-live-preview';
    document.body.appendChild(panel);
  }
  panel.innerHTML = `<div class="cosmic-live-preview__title">📝 הסרטון שלך נוצר...</div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(text).slice(0, 220)}`;
}

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
function renderOpening() {
  removeLivePreview();
  cosmicCard(`
    <h2>✨ בוא/י ניצור סרטון</h2>
    <p>מאיפה מתחילים הפעם?</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-reference-btn">שיטת השכפול</button>
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
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-has-ref-btn">יש לי רפרנס</button>
      <button type="button" class="cosmic-btn" id="va-pull-ref-btn">אין לי רפרנס, הגרל/י לי אחד</button>
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
function renderIdeaSourceChoice() {
  cosmicCard(`
    <h2>מאיפה הרעיון?</h2>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-type-idea-btn">יש לי רעיון</button>
      <button type="button" class="cosmic-btn" id="va-pull-idea-btn">תמצא/י לי רעיון</button>
    </div>
  `);
  document.getElementById('va-type-idea-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_TYPE_IDEA' }));
  document.getElementById('va-pull-idea-btn').addEventListener('click', async () => {
    if (!ideasCache) ideasCache = await fetchIdeas();
    const picked = pickIdea(ideasCache, null);
    if (!picked) {
      cosmicCard(`
        <h2>אין עדיין רעיונות שמורים</h2>
        <p>צריך/ה קודם להוסיף רעיונות ל"בנק הרעיונות" במוח השיווקי, ואז לחזור לכאן.</p>
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
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-type-idea-done-btn">המשך/המשיכי</button>
    </div>
  `);
  document.getElementById('va-type-idea-done-btn').addEventListener('click', () => {
    const text = document.getElementById('va-type-idea-input').value.trim();
    if (!text) {
      showToast('צריך/ה לכתוב את הרעיון קודם');
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
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-accept-idea-btn">אהבתי, בוא/י נמשיך</button>
    </div>
    <button type="button" class="cosmic-reroll-btn" id="va-reroll-idea-btn">לא אהבתי - הגרל/י שוב</button>
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

// --- תת-ענף "יש בו דיבור" ---
function renderFootageSpeechGoal() {
  cosmicCard(`
    <h2>מה המטרה שלך עם הקטע?</h2>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn" id="va-speech-find-btn">למצוא ממנו רגע חזק לריל</button>
      <button type="button" class="cosmic-btn" id="va-speech-shorten-btn">לקצר קטע שכבר בחרתי</button>
      <button type="button" class="cosmic-btn" id="va-speech-sharpen-btn">להפוך אותו לקטע יותר חד ושיווקי</button>
    </div>
  `);
  document.getElementById('va-speech-find-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_SPEECH_FIND_MOMENT' }));
  document.getElementById('va-speech-shorten-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_SPEECH_SHORTEN' }));
  document.getElementById('va-speech-sharpen-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_SPEECH_SHARPEN' }));
}

function renderFootageSpeechFind() {
  cosmicCard(`
    <h2>למצוא רגע חזק</h2>
    <p>חפשי משפט שיש בו דעה / הפתעה / טעות / תוצאה / ויכוח. סמני 20–60 שניות סביבו.</p>
    <p>עכשיו תשאלי: האם אפשר להבין את הקטע גם בלי מה שהיה לפני?<br>אם לא → תוסיפי משפט פתיחה קטן. אם כן → מתחילים משם.</p>
    <p style="font-weight:700;text-align:right;margin-bottom:4px">מה להשאיר?</p>
    <ul style="text-align:right;padding-inline-start:20px;margin-bottom:14px">
      <li>משפט שפותח חזק</li>
      <li>ההסבר הכי קצר שמוכיח אותו</li>
      <li>פואנטה / מסקנה</li>
    </ul>
    <p style="font-weight:700;text-align:right;margin-bottom:4px">מה למחוק?</p>
    <ul style="text-align:right;padding-inline-start:20px">
      <li>הקדמות</li>
      <li>חזרות</li>
      <li>"אממ"</li>
      <li>דוגמאות מיותרות</li>
      <li>כל משפט שלא מקדם את הפואנטה</li>
    </ul>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-speech-find-ready-btn">סיימתי ללקט</button>
    </div>
  `);
  document.getElementById('va-speech-find-ready-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_SPEECH_READY' }));
}

function renderFootageSpeechShorten() {
  cosmicCard(`
    <h2>לקצר קטע שכבר בחרתי</h2>
    <p>עברי על הצ'קליסט:</p>
    <ul style="text-align:right;padding-inline-start:20px">
      <li>האם ההתחלה מעניינת תוך 2 שניות?</li>
      <li>האם אפשר למחוק את המשפט הראשון?</li>
      <li>האם יש חזרה?</li>
      <li>האם יש הסבר ארוך מדי?</li>
      <li>האם הפואנטה מגיעה מאוחר?</li>
      <li>אפשר לקצר 30% בלי לאבד משמעות?</li>
    </ul>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-speech-shorten-ready-btn">עברתי על הכל</button>
    </div>
  `);
  document.getElementById('va-speech-shorten-ready-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_SPEECH_READY' }));
}

function renderFootageSpeechSharpen() {
  cosmicCard(`
    <h2>להפוך לקטע יותר חד ושיווקי</h2>
    <p>קטע שיווקי טוב עומד בשלושה דברים:</p>
    <ul style="text-align:right;padding-inline-start:20px;margin-bottom:14px">
      <li>יש בו אמירה אחת ברורה</li>
      <li>אפשר להבין על מה מדובר תוך 3 שניות</li>
      <li>יש בו משהו שמניע לפעולה או לתגובה</li>
    </ul>
    <p style="font-weight:700;text-align:right;margin-bottom:4px">מה לעשות:</p>
    <ul style="text-align:right;padding-inline-start:20px">
      <li>הוסיפי משפט פתיחה שאומר במפורש את התועלת או הנקודה</li>
      <li>ודאי שיש בסוף מסקנה ברורה או קריאה לפעולה</li>
      <li>הוסיפי טקסט על המסך שמדגיש את הנקודה המרכזית</li>
    </ul>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-speech-sharpen-ready-btn">חידדתי את הקטע</button>
    </div>
  `);
  document.getElementById('va-speech-sharpen-ready-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_SPEECH_READY' }));
}

function renderFootageSpeechDone() {
  const card = cosmicCard(`
    <h2>הקטע מוכן</h2>
    <p class="cosmic-prompt-box" style="text-align:center;font-size:17px;font-weight:700">Hook → Point → Proof → End</p>
    <p>כשיש לך את ארבעת אלה בקטע - הוא מוכן.</p>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-speech-done-btn">מוכן/ה</button>
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
    <p>צפי בקטע מההתחלה עד הסוף וחפשי רגע שיכול להיות מעניין גם בלי כל מה שמסביב.</p>
    <p style="font-weight:700;text-align:right;margin-bottom:4px">חפשי אחד מאלה:</p>
    <ul style="text-align:right;padding-inline-start:20px">
      <li>שאלה או תשובה טובה</li>
      <li>תגובה של לקוחה</li>
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
      <li><span class="cosmic-summary-num">1</span><div>חתכי כמה שיותר קרוב לרגע החזק</div></li>
      <li><span class="cosmic-summary-num">2</span><div>תשאירי רק מה שחייבים כדי להבין אותו</div></li>
      <li><span class="cosmic-summary-num">3</span><div>שאלי: האם צריך משפט על המסך כדי להבין למה זה מעניין?</div></li>
      <li><span class="cosmic-summary-num">4</span><div>אם כן → כתבי הוק קצר</div></li>
      <li><span class="cosmic-summary-num">5</span><div>הוסיפי כתוביות</div></li>
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

function renderFootageVisualReframe() {
  cosmicCard(`
    <h2>מעולה. עכשיו נבדוק איזה רעיון החומר הזה יכול להמחיש</h2>
    <ul style="text-align:right;padding-inline-start:20px">
      <li>מה קורה פה ששווה להסביר? (שלב מקצועי, תהליך, החלטה, משהו שעשית)</li>
      <li>איזה פחד / שאלה / אמונה של הלקוח החומר הזה יכול לענות עליה?</li>
      <li>יש סיפור מאחורי מי או מה שמצולם פה? למה הלקוחה הגיעה? מה היה לפני? מה השתנה?</li>
    </ul>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn" id="va-visual-msg-btn">מצאתי מסר</button>
      <button type="button" class="cosmic-btn" id="va-visual-obj-btn">מצאתי שאלה/התנגדות</button>
      <button type="button" class="cosmic-btn" id="va-visual-story-btn">מצאתי סיפור</button>
    </div>
  `);
  document.getElementById('va-visual-msg-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_VISUAL_FOUND_MESSAGE' }));
  document.getElementById('va-visual-obj-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_VISUAL_FOUND_OBJECTION' }));
  document.getElementById('va-visual-story-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_VISUAL_FOUND_STORY' }));
}

function renderFootageVisualOutcome({ title, body }) {
  cosmicCard(`
    <h2>${title}</h2>
    <p>${body}</p>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-visual-outcome-ready-btn">הבנתי, בונה/ת</button>
    </div>
  `);
  document.getElementById('va-visual-outcome-ready-btn').addEventListener('click', () => {
    celebrate();
    dispatch({ type: 'FOOTAGE_VISUAL_READY' });
  });
}

function renderFootageVisualMessage() {
  renderFootageVisualOutcome({ title: 'בונים סביב מסר', body: 'הוק → הסבר קצר → הקטעים ממחישים.' });
}

function renderFootageVisualObjection() {
  renderFootageVisualOutcome({ title: 'בונים סביב שאלה/התנגדות', body: 'פותחים בשאלה → עונים → משתמשים בחומר כהוכחה.' });
}

function renderFootageVisualStory() {
  renderFootageVisualOutcome({ title: 'בונים סביב סיפור', body: 'לפני → מה קרה → תהליך → תוצאה. החומר הופך לווויס-אובר או B-roll.' });
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
        <button type="button" class="cosmic-pick-btn" data-pick-format="${i}">בוחר/ת את הפורמט הזה</button>
      </div>
    </details>
  `).join('');
  cosmicCard(`
    <h2>בוחרים פורמט הנגשה</h2>
    <p>לכל רעיון יכולים להתאים כמה פורמטים - פתח/י כל אחד לקרוא על מה מדובר, ובחר/י את מה שהכי מרגיש נכון.</p>
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

// ===== "צריך תסריט או לא?" - ניסוח מתוקן (16/10) =====
function renderNeedsScriptCheck() {
  cosmicCard(`
    <h2>צריך תסריט בכלל?</h2>
    <p>לא כל תוכן צריך תסריט! יש תכנים שנולדים מרגע חי וספונטני, או מפורמט ויזואלי שלא צריך תסריט.</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn" id="va-needs-script-no-btn">זה ספונטני / צולם כבר / ויזואלי</button>
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-needs-script-yes-btn">כן, צריך תסריט</button>
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
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-reverse-btn">מצאתי רפרנס מתאים לשכפול הפוך</button>
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
  const opts = ['<option value="">בחר/י תת-קטגוריה מדויקת</option>']
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
    <p>${guessedDomain ? `ניחשתי לפי הגיליון: ${escapeHtml(guessedDomain)}${guessedSub ? ' › ' + escapeHtml(guessedSub) : ''} - נכון?` : 'לא הצלחתי לנחש מהגיליון - בחר/י בעצמך:'}</p>
    <select id="va-domain-select" class="cosmic-textarea" style="min-height:auto">${options}</select>
    <div id="va-subcategory-wrap">${subCategorySelectHtml(initialDomain, guessedSub)}</div>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-domain-confirm-btn">מאשר/ת</button>
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
      cosmicCard(`<h2>אין עדיין רפרנסים בתחום הזה</h2><p>בחר/י "יש לי רעיון מ-0" במקום, או חזור/חזרי מאוחר יותר.</p>`);
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
      : `<button type="button" class="cosmic-btn" id="va-ref-preview-btn" style="margin-bottom:14px">פתח/י תצוגה מקדימה</button>`}
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-accept-ref-btn">אהבתי, בוא/י נמשיך</button>
    </div>
    <button type="button" class="cosmic-reroll-btn" id="va-reroll-ref-btn">לא אהבתי - הגרל/י שוב</button>
  `);
  flipReveal(card);
  // 17/10/2026 (מאיה: "לא הקשבת לי... שהפרפנסים לדוגמא שנפתחים לא במסך
  // נפרד רק בפופאפ"): צפייה נשארת בתוך האפליקציה - פופאפ עם התמונה
  // הממוזערת האמיתית (כבר ממוזערת מקומית במאגר, אין בעיית CORS), עם
  // קישור יציאה מפורש רק אם רוצה לצפות בפועל בפלטפורמה המקורית.
  function openRefPreview() {
    openModal(`
      <h2 style="margin-top:0">תצוגה מקדימה</h2>
      ${video.thumbnailUrl ? `<img src="${escapeHtml(video.thumbnailUrl)}" alt="" style="width:100%;border-radius:14px;margin-bottom:14px">` : '<p>אין תמונה ממוזערת לסרטון הזה.</p>'}
      <a href="${escapeHtml(video.url)}" target="_blank" rel="noopener" class="cosmic-btn" style="display:block;text-align:center;text-decoration:none">לצפייה המלאה בפלטפורמה המקורית ↗</a>
    `);
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
        showToast('לא הצלחתי להעתיק - סמן/י ידנית');
      }
    });
  });
}

function renderTranscribe() {
  cosmicCard(`
    <h2>תמלל/י את הרפרנס</h2>
    <p>הורד/י את הסרטון, ותמלל/י אותו (לעברית אם צריך) בעזרת ג'מיני - ואז הדבק/י כאן את התמלול</p>
    <textarea class="cosmic-textarea" id="va-transcript-input" placeholder="הדבק/י כאן את התמלול..."></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-transcribe-done-btn">✓ עשיתי</button>
    </div>
  `);
  document.getElementById('va-transcribe-done-btn').addEventListener('click', () => {
    // 16/10/2026 (מאיה: "זה נותן לי להמשיך בשלבים גם בלי שכתבתי כלום") -
    // כאן בדיוק היה חסר הוולידציה הזו, היחידה מכל שדות הטקסט שלא נבדקה.
    const text = document.getElementById('va-transcript-input').value.trim();
    if (!text) {
      showToast('צריך/ה להדביק את התמלול קודם');
      return;
    }
    state.transcript = text;
    dispatch({ type: 'CONFIRM_DONE' });
  });
}

async function renderPrompt1() {
  const profile = await getProfile();
  const audience = profile && profile.primaryAudience ? profile.primaryAudience : '';
  const domain = domainInfo ? domainInfo.domain : '';
  const prompt = buildDuplicationPrompt({ audience, domain, hook: state.transcript || '' });
  cosmicCard(`
    <h2>פרומפט מוכן ל-ChatGPT</h2>
    <p>העתק/י, הדבק/י ב-ChatGPT, וחזור/חזרי עם ההוק שהכי קרץ לך מתוך ה-30</p>
    <div class="cosmic-prompt-box">${highlightPlaceholders(prompt, [audience, domain, state.transcript])}</div>
    ${copyBtn(prompt, 'העתק/י פרומפט')}
    <textarea class="cosmic-textarea" id="va-hook-input" placeholder="הדבק/י כאן את ההוק שבחרת..." style="margin-top:14px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-hook-chosen-btn">המשך/המשיכי</button>
    </div>
  `);
  wireCopyButtons(screenEl());
  document.getElementById('va-hook-chosen-btn').addEventListener('click', () => {
    const hook = document.getElementById('va-hook-input').value.trim();
    if (!hook) {
      showToast('צריך/ה להדביק את ההוק שבחרת קודם');
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
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-herwords-done-btn">המשך/המשיכי</button>
    </div>
  `);
  document.getElementById('va-herwords-done-btn').addEventListener('click', () => {
    const text = document.getElementById('va-herwords-input').value.trim();
    if (!text) {
      showToast('צריך/ה לכתוב משהו קודם');
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
    <p>העתק/י, הדבק/י ב-ChatGPT, ותקבל/י תסריט מלא</p>
    <div class="cosmic-prompt-box">${highlightPlaceholders(prompt, [hook, state.herWords])}</div>
    ${copyBtn(prompt, 'העתק/י פרומפט')}
    <textarea class="cosmic-textarea" id="va-prompt2-script-input" placeholder="הדבק/י כאן את התסריט שקיבלת..." style="margin-top:14px"></textarea>
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
      showToast('צריך/ה להדביק את התסריט קודם');
      return;
    }
    celebrate();
    dispatch({ type: 'SCRIPT_READY', text });
  });
}

function renderReadAloud() {
  cosmicCard(`
    <h2>קרא/י בקול את התסריט</h2>
    <p>בדוק/בדקי שהכל מתחבר, שאין פספוסים, ושהאורך מרגיש נכון</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-read-done-btn">✓ מוכן/ה לעריכה</button>
    </div>
  `);
  document.getElementById('va-read-done-btn').addEventListener('click', () => {
    celebrate();
    dispatch({ type: 'CONFIRM_DONE' });
  });
}

// ===== מסלול "כתיבה מאפס" - 4 הפרומפטים האמיתיים (16/10) =====
function renderScratchIntro() {
  const stepsHtml = SCRIPT_STRUCTURE.map((s) => `
    <li><span class="cosmic-summary-num">${s.step}</span><div><strong>${escapeHtml(s.name)}</strong><br>${escapeHtml(s.description)}</div></li>
  `).join('');
  cosmicCard(`
    <h2>כתיבה מאפס</h2>
    <p>הדרך שדורשת הכי הרבה הבנה שיווקית - אבל נלווה אותך צעד-צעד. ככה בנוי תסריט טוב:</p>
    <ul class="cosmic-summary-list">${stepsHtml}</ul>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-scratch-start-btn">בוא/י נתחיל</button>
    </div>
  `);
  document.getElementById('va-scratch-start-btn').addEventListener('click', () => dispatch({ type: 'SCRATCH_START_DUMP' }));
}

function openExtractionHelperModal() {
  const idea = state.ideaDescription || '';
  const overlay = openModal(`
    <h2 style="margin-top:0">קשה למצוא מה להגיד?</h2>
    <p style="font-size:13px">מלא/י את הפרטים, קבל/י פרומפט שישאל שאלות שיוציאו בדיוק מה להגיד - בלי לעצב, רק לענות.</p>
    <input type="text" class="cosmic-textarea" id="va-ext-contenttype" style="min-height:auto" placeholder="סוג תוכן (מכירתי / בעל ערך / בידורי / אישי)">
    <input type="text" class="cosmic-textarea" id="va-ext-startpoint" style="min-height:auto;margin-top:8px" placeholder="נקודת יציאה (סיפור אישי / סיפור לקוח / כללי)">
    <input type="text" class="cosmic-textarea" id="va-ext-audience" style="min-height:auto;margin-top:8px" placeholder="קהל היעד">
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-ext-generate-btn">בנה/י לי את הפרומפט</button>
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
    const prompt = buildExtractionPrompt({ idea, contentType, startingPoint, audience });
    const resultEl = overlay.querySelector('#va-ext-result');
    resultEl.innerHTML = `
      <div class="cosmic-prompt-box" style="margin-top:14px">${highlightPlaceholders(prompt, [idea, contentType, startingPoint, audience])}</div>
      ${copyBtn(prompt, 'העתק/י פרומפט')}
    `;
    wireCopyButtons(resultEl);
  });
}

function renderScratchDump() {
  cosmicCard(`
    <h2>שפכ/י את כל מה שיש לך להגיד</h2>
    <p>בלי לערוך, בלי לדאוג לניסוח - כל מה שעולה לך בראש על הרעיון. נזקק את זה אחר כך.</p>
    <div class="cosmic-btn-row" style="margin-bottom:14px">
      <button type="button" class="cosmic-btn" id="va-scratch-help-btn">קשה למצוא מה להגיד? קבל/י עזרה 🆘</button>
    </div>
    <textarea class="cosmic-textarea" id="va-scratch-dump-input" style="min-height:160px" placeholder="כל מה שיש לך להגיד...">${state.rawDump ? escapeHtml(state.rawDump) : ''}</textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-scratch-dump-done-btn">המשך/המשיכי</button>
    </div>
  `);
  document.getElementById('va-scratch-help-btn').addEventListener('click', openExtractionHelperModal);
  document.getElementById('va-scratch-dump-done-btn').addEventListener('click', () => {
    const text = document.getElementById('va-scratch-dump-input').value.trim();
    if (!text) {
      showToast('צריך/ה לכתוב משהו קודם');
      return;
    }
    dispatch({ type: 'SCRATCH_DUMP_READY', text });
  });
}

async function renderScratchHook() {
  const profile = await getProfile();
  const audience = profile && profile.primaryAudience ? profile.primaryAudience : '';
  const prompt = buildHookFindingPrompt({ idea: state.ideaDescription || '', script: state.rawDump || '', audience });
  cosmicCard(`
    <h2>מציאת הוק</h2>
    <p>הפרומפט כולל בנק הוקים אמיתי מוטמע - ChatGPT יתאים לך ממנו הוק מדויק. העתק/י, הדבק/י, וחזור/חזרי עם ההוק שבחרת.</p>
    <div class="cosmic-prompt-box">${highlightPlaceholders(prompt, [state.ideaDescription, state.rawDump, audience])}</div>
    ${copyBtn(prompt, 'העתק/י פרומפט')}
    <textarea class="cosmic-textarea" id="va-scratch-hook-input" placeholder="הדבק/י כאן את ההוק שבחרת..." style="margin-top:14px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-scratch-hook-done-btn">המשך/המשיכי</button>
    </div>
  `);
  wireCopyButtons(screenEl());
  document.getElementById('va-scratch-hook-done-btn').addEventListener('click', () => {
    const hook = document.getElementById('va-scratch-hook-input').value.trim();
    if (!hook) {
      showToast('צריך/ה להדביק את ההוק שבחרת קודם');
      return;
    }
    dispatch({ type: 'SCRATCH_HOOK_CHOSEN', hook });
  });
}

function renderScratchHookReinforce() {
  const prompt = buildHookReinforcementPrompt({ idea: state.ideaDescription || '', hook: state.hook || '', script: state.rawDump || '' });
  cosmicCard(`
    <h2>חיזוק ההוק</h2>
    <p>המשפט השני, שנותן סיבה ברורה להישאר. העתק/י, הדבק/י, וחזור/חזרי עם החיזוק שבחרת.</p>
    <div class="cosmic-prompt-box">${highlightPlaceholders(prompt, [state.ideaDescription, state.hook, state.rawDump])}</div>
    ${copyBtn(prompt, 'העתק/י פרומפט')}
    <textarea class="cosmic-textarea" id="va-scratch-reinforce-input" placeholder="הדבק/י כאן את חיזוק ההוק שבחרת..." style="margin-top:14px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-scratch-reinforce-done-btn">המשך/המשיכי</button>
    </div>
  `);
  wireCopyButtons(screenEl());
  document.getElementById('va-scratch-reinforce-done-btn').addEventListener('click', () => {
    const text = document.getElementById('va-scratch-reinforce-input').value.trim();
    if (!text) {
      showToast('צריך/ה להדביק את חיזוק ההוק קודם');
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
    <textarea class="cosmic-textarea" id="va-scratch-script-input" placeholder="הדבק/י כאן את התסריט הסופי שקיבלת..." style="margin-top:14px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-scratch-script-done-btn">סיימתי, יש לי תסריט</button>
    </div>
  `);
  const wrap = document.getElementById('va-scratch-distill-prompt-wrap');
  function refreshPrompt() {
    const cta = document.getElementById('va-scratch-cta-select').value;
    const prompt = buildPrompt(cta);
    const values = [state.ideaDescription, state.hook, state.hookReinforcement, state.rawDump, cta];
    wrap.innerHTML = `<div class="cosmic-prompt-box">${highlightPlaceholders(prompt, values)}</div>${copyBtn(prompt, 'העתק/י פרומפט')}`;
    wireCopyButtons(wrap);
  }
  document.getElementById('va-scratch-cta-select').addEventListener('change', refreshPrompt);
  refreshPrompt();
  document.getElementById('va-scratch-script-done-btn').addEventListener('click', () => {
    const text = document.getElementById('va-scratch-script-input').value.trim();
    if (!text) {
      showToast('צריך/ה להדביק את התסריט קודם');
      return;
    }
    celebrate();
    dispatch({ type: 'SCRATCH_SCRIPT_READY', text });
  });
}

// ===== מסך הסיכום הסופי - "אפילו ילד בן 10 יכול להבין" (16/10) =====
function buildSummarySteps() {
  const steps = [];
  if (state.branch === 'footage') {
    // 18/10/2026: עברת למסלול ליקוט מודרך (דיבור/ויזואלי) במקום "כמו שהוא
    // / להמיר פורמט" - selectedFormat כבר לא רלוונטי למסלול הזה.
    steps.push('בחרת קטע מצולם קיים.');
    steps.push('עברת על הדרכת הליקוט שמתאימה לקטע שלך.');
    steps.push('עכשיו: לכי/לך לערוך לפי מה שסימנת, ואז להעלות.');
  } else if (state.branch === 'reference' || state.branch === 'idea-search') {
    steps.push(state.branch === 'reference' ? 'מצאת רפרנס מוכן במאגר שלך.' : 'מצאת רפרנס בעצמך לפי מילות החיפוש שקיבלת.');
    steps.push('תימללת את הרפרנס.');
    steps.push(`בחרת הוק: "${state.hook || ''}".`);
    steps.push('הוספת את המילים שלך לתסריט.');
    steps.push('קראת את התסריט בקול וידעת שהוא מוכן.');
    steps.push('עכשיו: לכי/לך לצלם לפי התסריט, ואז לערוך.');
  } else if (state.branch === 'scratch') {
    steps.push('שפכת את כל מה שיש לך להגיד על הרעיון.');
    steps.push(`בחרת הוק: "${state.hook || ''}".`);
    steps.push('חיזקת את ההוק.');
    steps.push('קיבלת תסריט סופי מזוקק.');
    steps.push('עכשיו: לכי/לך לצלם לפי התסריט, ואז לערוך.');
  } else if (state.branch === 'idea') {
    steps.push('בחרת רעיון, ווידאת שהוא רלוונטי.');
    if (state.selectedFormat) steps.push(`בחרת פורמט הנגשה: "${state.selectedFormat}".`);
    steps.push('קבעת שהתוכן הזה לא צריך תסריט כתוב.');
    steps.push('עכשיו: פתחי/פתח מצלמה וצלמי/צלם - ישירות, ספונטני או ויזואלי.');
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
    ${elapsed ? `<div class="cosmic-today-challenge"><div class="cosmic-today-challenge__icon">⏱️</div><div>בנית/בנית את זה תוך <strong>${elapsed}</strong>!</div></div>` : ''}
    <ul class="cosmic-summary-list">${stepsHtml}</ul>
    ${script ? `<p style="font-weight:700;text-align:right;margin-bottom:8px">הטקסט/תסריט הסופי שלך:</p>
      <div class="cosmic-prompt-box">${escapeHtml(script)}</div>
      ${copyBtn(script, 'העתק/י את הטקסט')}` : ''}
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
  if (state.screen === 'footage-speech-goal') return renderFootageSpeechGoal();
  if (state.screen === 'footage-speech-find') return renderFootageSpeechFind();
  if (state.screen === 'footage-speech-shorten') return renderFootageSpeechShorten();
  if (state.screen === 'footage-speech-sharpen') return renderFootageSpeechSharpen();
  if (state.screen === 'footage-speech-done') return renderFootageSpeechDone();
  if (state.screen === 'footage-visual-scan') return renderFootageVisualScan();
  if (state.screen === 'footage-visual-extract') return renderFootageVisualExtract();
  if (state.screen === 'footage-visual-reframe') return renderFootageVisualReframe();
  if (state.screen === 'footage-visual-message') return renderFootageVisualMessage();
  if (state.screen === 'footage-visual-objection') return renderFootageVisualObjection();
  if (state.screen === 'footage-visual-story') return renderFootageVisualStory();
  if (state.screen === 'format-choice') return renderFormatChoice();
  if (state.screen === 'needs-script-check') return renderNeedsScriptCheck();
  if (state.screen === 'has-idea-choice') return renderHasIdeaChoice();
  if (state.screen === 'transcribe') return renderTranscribe();
  if (state.screen === 'prompt1') return renderPrompt1();
  if (state.screen === 'her-words') return renderHerWords();
  if (state.screen === 'prompt2') return renderPrompt2();
  if (state.screen === 'read-aloud') return renderReadAloud();
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

  document.getElementById('hub-link-video-assistant').addEventListener('click', () => {
    // 17/10/2026 (מאיה, פעמיים: "נכנסת למסך זה הוביל אותי לסוף ולא
    // להתחלה", ואז שוב גם אחרי סגירה ופתיחה מלאה: "שוב מכניס אותי
    // מהאמצע") - התיקון הקודם (לא לחזור ל-summary) היה חלקי מדי: היא
    // חזרה בפועל למסך "תמלל/י את הרפרנס" באמצע מסלול, לא לסיכום.
    // ההחלטה הנכונה היא לא לנחש איזה מסך "בסדר" לחזור אליו ואיזה לא -
    // כניסה מהרכזת (hub) תמיד מתחילה מחדש במסך הפתיחה. ה-state עדיין
    // נשמר ברקע (saveSession) לאורך כל מסלול, רק שלא טוענים אותו כאן.
    state = INITIAL_STATE;
    sessionStartTs = Date.now();
    render();
  });
}
