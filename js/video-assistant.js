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
  fetchIdeas, fetchInspirationBank, getSavedDomain, guessDomain, saveDomain, loadSession, saveSession, suggestSearchKeywords,
} from './video-assistant-store.js';
import { getProfile } from './user-profile.js';
import { showView } from './view-router.js';
import { openInspirationView } from './inspiration-view.js';
import { showToast } from './toast.js';

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
  opening: 0, 'idea-source-choice': 0, 'type-idea': 0, 'pulled-idea': 0, 'pulled-reference': 0,
  'relevance-check': 1,
  'footage-use-choice': 2, 'format-choice': 2, 'needs-script-check': 2, 'has-idea-choice': 2,
  'footage-script': 3, 'describe-idea': 3, 'search-guidance': 3, transcribe: 3, prompt1: 3, 'her-words': 3, prompt2: 3, 'read-aloud': 3,
  'scratch-intro': 3, 'scratch-dump': 3, 'scratch-hook': 3, 'scratch-hook-reinforce': 3, 'scratch-distill': 3,
  summary: 4,
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 16/10/2026 (מאיה: "ריבוע ברור בצבע שיהיה לה ברור איפה היא צריכה להשלים"):
// מסמן חזותית כל [...] בפרומפט - בלי לגעת בטקסט שמועתק בפועל (ה-data-copy-text
// נשאר נקי, רק מה שמוצג על המסך מודגש).
function highlightPlaceholders(text) {
  return escapeHtml(text).replace(/\[([^\]]+)\]/g, '<mark>[$1]</mark>');
}

function progressHtml() {
  const current = PHASE_BY_SCREEN[state.screen] ?? 0;
  const dots = PHASES.map((_, i) => {
    const cls = i < current ? 'is-done' : i === current ? 'is-current' : '';
    return `<div class="cosmic-progress__dot ${cls}"></div>`;
  }).join('');
  return `<div class="cosmic-progress__label">שלב ${current + 1} מתוך ${PHASES.length}: ${PHASES[current]}</div>
    <div class="cosmic-progress">${dots}</div>`;
}

function backButtonHtml() {
  return state.history.length
    ? `<button type="button" class="cosmic-back-btn" id="va-back-btn" aria-label="חזרה אחורה">→</button>`
    : '';
}

function cosmicCard(innerHtml, { showProgress = true } = {}) {
  screenEl().innerHTML = `<div class="cosmic-card">
    ${backButtonHtml()}
    ${showProgress ? progressHtml() : ''}
    ${innerHtml}
  </div>`;
  const backBtn = document.getElementById('va-back-btn');
  if (backBtn) backBtn.addEventListener('click', () => dispatch({ type: 'BACK' }));
}

function restart() {
  dispatch({ type: 'RESTART' });
  currentPickId = null;
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
function renderOpening() {
  cosmicCard(`
    <h2>✨ בוא/י ניצור סרטון</h2>
    <p>מאיפה מתחילים הפעם?</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-reference-btn">מצאתי רפרנס לשכפול</button>
      <button type="button" class="cosmic-btn" id="va-footage-btn">יש לי קטע שצולם</button>
      <button type="button" class="cosmic-btn" id="va-idea-btn">יש לי רעיון מ-0</button>
    </div>
  `);
  document.getElementById('va-footage-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_FOOTAGE' }));
  document.getElementById('va-reference-btn').addEventListener('click', () => {
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
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-type-idea-btn">יש לי רעיון בראש, אכתוב/אכתבי אותו</button>
      <button type="button" class="cosmic-btn" id="va-pull-idea-btn">תזכיר/י לי רעיון ששמרתי</button>
    </div>
  `);
  document.getElementById('va-type-idea-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_TYPE_IDEA' }));
  document.getElementById('va-pull-idea-btn').addEventListener('click', async () => {
    if (!ideasCache) ideasCache = await fetchIdeas();
    const picked = pickIdea(ideasCache, null);
    if (!picked) {
      showToast('אין עדיין רעיונות שמורים בבנק - בוא/י נכתוב את הרעיון עכשיו');
      dispatch({ type: 'CHOOSE_TYPE_IDEA' });
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
  cosmicCard(`
    <h2>🎲 הרעיון הזה</h2>
    <p style="font-size:16px;color:#fff;font-weight:600">${escapeHtml(idea.title)}</p>
    ${idea.hookText ? `<p>${escapeHtml(idea.hookText)}</p>` : ''}
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-accept-idea-btn">אהבתי, בוא/י נמשיך</button>
    </div>
    <button type="button" class="cosmic-reroll-btn" id="va-reroll-idea-btn">לא אהבתי - הגרל/י שוב</button>
  `);
  document.getElementById('va-accept-idea-btn').addEventListener('click', () => {
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
function renderRelevanceCheck() {
  cosmicCard(`
    <h2>בודקים לפני שממשיכים</h2>
    <p><strong>האם הרעיון רלוונטי לקהל היעד, או משרת את המותג?</strong></p>
    <p style="font-size:14px">
      <strong>רלוונטי לקהל היעד</strong> = תוכן שמדבר לקהל היעד הנכון.<br><br>
      <strong>משרת את המותג</strong> = תוכן שלא בהכרח מדבר ישירות על העסק או התחום, אבל כן מציג את האישיות/הערכים/תפיסת העולם שלך.
    </p>
    <p class="cosmic-prompt-box" style="text-align:right;font-size:13px">
      דוגמה: מעצבת פנים שמעלה סרטון חמוד של אבא שלה רץ לחבק את הכלב - לא מדבר לקהל היעד שלה ולא מחזק את המותג שלה. אם זה היה סרטון שלה <strong>בעצמה</strong> רצה אל הכלב שלה - לגמרי היתה יכולה להעלות!
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
    <p>ברוב המקרים לא נוגעים בקטע מצולם יותר מדי, חוץ מלערוך ולקצר. רק לפעמים כדאי להמיר לפורמט אחר (למשל וויס אובר) ואז אולי גם לכתוב תסריט.</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-footage-asis-btn">משתמש/ת בו כמו שהוא</button>
      <button type="button" class="cosmic-btn" id="va-footage-convert-btn">רוצה להמיר לפורמט אחר</button>
    </div>
  `);
  document.getElementById('va-footage-asis-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_AS_IS' }));
  document.getElementById('va-footage-convert-btn').addEventListener('click', () => dispatch({ type: 'FOOTAGE_CONVERT' }));
}

function renderFootageScript() {
  cosmicCard(`
    <h2>כתוב/כתבי את התסריט/וויס אובר</h2>
    <p>במילים שלך - מה שתרצה/י להגיד מעל הקטע המצולם</p>
    <textarea class="cosmic-textarea" id="va-footage-script-input"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-footage-script-done-btn">סיימתי</button>
    </div>
  `);
  document.getElementById('va-footage-script-done-btn').addEventListener('click', () => {
    const text = document.getElementById('va-footage-script-input').value.trim();
    if (!text) {
      showToast('צריך/ה לכתוב משהו קודם');
      return;
    }
    playSuccess();
    dispatch({ type: 'FOOTAGE_SCRIPT_SUBMITTED', text });
  });
}

// ===== בחירת פורמט הנגשה - אקורדיון אמיתי בתוך האפליקציה (16/10) =====
function renderFormatChoice() {
  const itemsHtml = FORMATS.map((f, i) => `
    <details class="cosmic-accordion-item" data-format="${escapeHtml(f.name)}" ${state.selectedFormat === f.name ? 'open' : ''}>
      <summary>${escapeHtml(f.name)}</summary>
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
      playSuccess();
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
  cosmicCard(`
    <h2>🎲 הרפרנס הזה</h2>
    <p><a href="${escapeHtml(video.url)}" target="_blank" rel="noopener" style="color:#fff">פתח/י לצפייה ←</a></p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-accept-ref-btn">אהבתי, בוא/י נמשיך</button>
    </div>
    <button type="button" class="cosmic-reroll-btn" id="va-reroll-ref-btn">לא אהבתי - הגרל/י שוב</button>
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

async function runSearchGuidanceFor(ideaText) {
  const statusEl = document.getElementById('va-idea-search-status');
  if (statusEl) statusEl.textContent = 'חושב/ת על מילות חיפוש...';
  let keywords = [];
  try {
    keywords = await suggestSearchKeywords(ideaText);
  } catch (err) {
    console.error('suggestSearchKeywords failed:', err);
    keywords = [ideaText];
  }
  dispatch({ type: 'SEARCH_GUIDANCE_READY', idea: ideaText, keywords });
}

function renderDescribeIdea() {
  const knownIdea = state.ideaDescription || state.hook;
  if (knownIdea) {
    cosmicCard(`<p id="va-idea-search-status">חושב/ת על מילות חיפוש בשביל "${escapeHtml(knownIdea)}"...</p>`);
    runSearchGuidanceFor(knownIdea);
    return;
  }
  cosmicCard(`
    <h2>מה בדיוק הרעיון?</h2>
    <p>תאר/י במילים שלך - למשל "הסיפור שלי על בולמיה" או "סיפור לקוחה שהחליקה שיער ופחדה שזה ישרוף לה אותו"</p>
    <textarea class="cosmic-textarea" id="va-idea-description-input" placeholder="הרעיון שלך..."></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-idea-search-btn">תן/י לי מילות חיפוש</button>
    </div>
    <p id="va-idea-search-status" class="muted" style="font-size:13px;margin-top:10px"></p>
  `);
  document.getElementById('va-idea-search-btn').addEventListener('click', async () => {
    const text = document.getElementById('va-idea-description-input').value.trim();
    if (!text) {
      showToast('צריך/ה לכתוב את הרעיון קודם');
      return;
    }
    document.getElementById('va-idea-search-btn').disabled = true;
    await runSearchGuidanceFor(text);
  });
}

function renderSearchGuidance() {
  const keywordsHtml = (state.searchKeywords || [])
    .map((k) => `<li>${escapeHtml(k)}</li>`)
    .join('');
  cosmicCard(`
    <h2>מילות חיפוש מוצעות</h2>
    <p>חפש/י אותן קודם במאגר ההשראה (יש שם גם אפשרות לחפש לפי זוויות) - ואם לא מוצא/ת, בטיקטוק ובאינסטגרם, גם בעברית, גם ברוסית וגם באנגלית:</p>
    <ul style="text-align:right;padding-inline-start:20px">${keywordsHtml}</ul>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn" id="va-open-bank-btn">פתח/י את מאגר ההשראה</button>
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-found-reference-btn">מצאתי רפרנס, בוא/י נמשיך</button>
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
  const prompt = buildDuplicationPrompt({ audience, domain: domainInfo ? domainInfo.domain : '', hook: state.transcript || '' });
  cosmicCard(`
    <h2>פרומפט מוכן ל-ChatGPT</h2>
    <p>העתק/י, הדבק/י ב-ChatGPT, וחזור/חזרי עם ההוק שהכי קרץ לך מתוך ה-30</p>
    <div class="cosmic-prompt-box">${highlightPlaceholders(prompt)}</div>
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
    <div class="cosmic-prompt-box">${highlightPlaceholders(prompt)}</div>
    ${copyBtn(prompt, 'העתק/י פרומפט')}
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
    <h2>קרא/י בקול את התסריט</h2>
    <p>בדוק/בדקי שהכל מתחבר, שאין פספוסים, ושהאורך מרגיש נכון</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-read-done-btn">✓ מוכן/ה לעריכה</button>
    </div>
  `);
  document.getElementById('va-read-done-btn').addEventListener('click', () => {
    playSuccess();
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
    <h2 style="margin-top:0">תקוע/ה? קבל/י עזרה</h2>
    <p style="font-size:13px">מלא/י את הפרטים, קבל/י פרומפט שישאל אותך שאלות שיוציאו ממך בדיוק מה להגיד - בלי לעצב, רק לענות.</p>
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
      <div class="cosmic-prompt-box" style="margin-top:14px">${highlightPlaceholders(prompt)}</div>
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
      <button type="button" class="cosmic-btn" id="va-scratch-help-btn">תקוע/ה? קבל/י עזרה 🆘</button>
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
    <div class="cosmic-prompt-box">${highlightPlaceholders(prompt)}</div>
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
    <div class="cosmic-prompt-box">${highlightPlaceholders(prompt)}</div>
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
    wrap.innerHTML = `<div class="cosmic-prompt-box">${highlightPlaceholders(prompt)}</div>${copyBtn(prompt, 'העתק/י פרומפט')}`;
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
    playSuccess();
    dispatch({ type: 'SCRATCH_SCRIPT_READY', text });
  });
}

// ===== מסך הסיכום הסופי - "אפילו ילד בן 10 יכול להבין" (16/10) =====
function buildSummarySteps() {
  const steps = [];
  if (state.branch === 'footage') {
    steps.push('בחרת קטע מצולם קיים.');
    if (state.selectedFormat) {
      steps.push(`החלטת להמיר אותו לפורמט "${state.selectedFormat}".`);
      steps.push('כתבת את הטקסט/וויס אובר שלך.');
    } else {
      steps.push('החלטת להשתמש בקטע כמו שהוא.');
    }
    steps.push('עכשיו: לכי/לך לערוך ולקצר, ואז להעלות.');
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

function renderSummary() {
  const steps = buildSummarySteps();
  const stepsHtml = steps.map((s, i) => `<li><span class="cosmic-summary-num">${i + 1}</span><div>${escapeHtml(s)}</div></li>`).join('');
  cosmicCard(`
    <h2>🎬 מוכן! הנה בדיוק מה קרה</h2>
    <ul class="cosmic-summary-list">${stepsHtml}</ul>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-restart-btn">ליצור סרטון נוסף</button>
    </div>
  `, { showProgress: false });
  document.getElementById('va-restart-btn').addEventListener('click', restart);
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
  if (state.screen === 'format-choice') return renderFormatChoice();
  if (state.screen === 'needs-script-check') return renderNeedsScriptCheck();
  if (state.screen === 'has-idea-choice') return renderHasIdeaChoice();
  if (state.screen === 'describe-idea') return renderDescribeIdea();
  if (state.screen === 'search-guidance') return renderSearchGuidance();
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

  document.getElementById('hub-link-video-assistant').addEventListener('click', async () => {
    let saved = null;
    try {
      saved = await loadSession();
    } catch (err) {
      console.error('loadSession failed:', err);
    }
    state = saved || INITIAL_STATE;
    // 16/10/2026: סשנים ישנים שנשמרו לפני כפתור החזרה לא יכילו history -
    // בלי זה BACK על סשן ישן יקרוס על undefined.length.
    if (!state.history) state.history = [];
    render();
  });
}
