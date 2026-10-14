// js/video-assistant.js
// 13/10/2026: "העוזר שלך ליצירת סרטון" - שכבת הכוונה, לא כלי יצירה (ראה
// docs/superpowers/specs/2026-10-13-video-creation-assistant-design.md).
// מרנדר תמיד מחדש innerHTML של #video-assistant-screen לפי ה-state הנוכחי
// של video-assistant-flow.js, בדיוק כמו ש-warming.js מרנדר renderPlan()
// מחדש בכל שינוי - לא DOM דיפ, זה מסך-אחד-בכל-רגע, לא רשימה גדולה.
import { INITIAL_STATE, nextStep } from './video-assistant-flow.js';
import { pickIdea, pickReference } from './video-assistant-picker.js';
import { buildDuplicationPrompt, buildScriptPrompt } from './video-assistant-prompts.js';
import { playReroll, playSuccess, setMuted, getMuted } from './video-assistant-sound.js';
import {
  fetchIdeas, fetchInspirationBank, getSavedDomain, guessDomain, saveDomain, loadSession, saveSession,
} from './video-assistant-store.js';
import { getProfile } from './user-profile.js';
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
import { showToast } from './toast.js';

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

function renderOpening() {
  cosmicCard(`
    <h2>✨ היי מאיה</h2>
    <p>בואי ניצור את הסרטון הבא שלך</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn" id="va-no-idea-btn">אין לי רעיון</button>
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-has-idea-btn">יש לי רעיון</button>
    </div>
  `);
  document.getElementById('va-no-idea-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_NO_IDEA' }));
  document.getElementById('va-has-idea-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_HAS_IDEA' }));
}

function renderNoIdeaChoice() {
  cosmicCard(`
    <h2>בואי נמצא מאיפה להתחיל</h2>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn" id="va-pull-idea-btn">לשלוף רעיון מהבנק שלי</button>
      <button type="button" class="cosmic-btn" id="va-reference-btn">לשכפל רפרנס מהמאגר</button>
    </div>
  `);
  document.getElementById('va-pull-idea-btn').addEventListener('click', async () => {
    if (!ideasCache) ideasCache = await fetchIdeas();
    const picked = pickIdea(ideasCache, null);
    if (!picked) {
      showToast('אין עדיין רעיונות בבנק שלך - בואי נשכפל רפרנס במקום');
      currentPickId = null;
      dispatch({ type: 'CHOOSE_REFERENCE' });
      return;
    }
    currentPickId = picked.id;
    dispatch({ type: 'CHOOSE_PULL_IDEA' });
  });
  document.getElementById('va-reference-btn').addEventListener('click', () => {
    // currentPickId must not leak in from a previous idea-pull in the same
    // session (e.g. she went back and switched branches) - renderPulledReference
    // only picks a fresh video when currentPickId is null, so a stale idea id
    // here would make it look up a non-existent video and crash on video.url.
    currentPickId = null;
    dispatch({ type: 'CHOOSE_REFERENCE' });
  });
}

function renderHasIdeaChoice() {
  cosmicCard(`
    <h2>שתי דרכים לכתוב את התסריט</h2>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-reverse-btn">שכפול הפוך (מומלץ, קל יותר)</button>
      <button type="button" class="cosmic-btn" id="va-scratch-btn">כתיבה מ-0</button>
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
    // 14/10/2026: בלי זה state.hook נשאר ריק עבור מסלול "רעיון מהבנק" (הוא
    // מוגדר רק דרך HOOK_CHOSEN, ששייך למסלול הרפרנס) - והפרומפט הסופי
    // (prompt2) היה יוצא בלי שום הוק בכלל. הטקסט של הרעיון עצמו הוא ההוק כאן.
    state.hook = idea.hookText || idea.title;
    dispatch({ type: 'ACCEPT_PICK' });
  });
  document.getElementById('va-reroll-idea-btn').addEventListener('click', () => {
    playReroll();
    const picked = pickIdea(ideasCache, currentPickId);
    if (picked) currentPickId = picked.id;
    dispatch({ type: 'REROLL' });
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

function renderTranscribe() {
  cosmicCard(`
    <h2>תמללי את הרפרנס</h2>
    <p>פתחי את הסרטון וכתבי כאן מה נאמר בו, במילים שלו (או קרובות לזה)</p>
    <textarea class="cosmic-textarea" id="va-transcript-input" placeholder="מה נאמר בסרטון..."></textarea>
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
  document.getElementById('va-restart-btn').addEventListener('click', () => {
    state = INITIAL_STATE;
    currentPickId = null;
    saveSession(state).catch((err) => console.error('saveSession failed:', err));
    render();
  });
}

function render() {
  if (state.screen === 'opening') return renderOpening();
  if (state.screen === 'no-idea-choice') return renderNoIdeaChoice();
  if (state.screen === 'has-idea-choice') return renderHasIdeaChoice();
  if (state.screen === 'pulled-idea') return renderPulledIdea();
  if (state.screen === 'pulled-reference') return renderPulledReference();
  if (state.screen === 'transcribe') return renderTranscribe();
  if (state.screen === 'prompt1') return renderPrompt1();
  if (state.screen === 'her-words') return renderHerWords();
  if (state.screen === 'prompt2') return renderPrompt2();
  if (state.screen === 'read-aloud') return renderReadAloud();
  if (state.screen === 'done') return renderDone();
  if (state.screen === 'from-scratch') {
    // 13/10/2026: אין היום שום מסך/כלי בשם "כתיבת תסריטים" בתוך האפליקציה
    // (זו רק לשונית בגיליון שלה) - בדוק בפועל לפני המימוש, לא הונח. לכן
    // כאן תקציר קצר של 5 השלבים כטקסט הכוונה, לא הפניה לכלי שלא קיים.
    // Wizard מלא לנתיב הזה הוא scope נפרד לגרסה הבאה (ראה design doc).
    cosmicCard(`
      <h2>כתיבה מ-0 - 5 השלבים</h2>
      <p style="text-align:right">
        1. בחרי נקודת פתיחה: סיפור אישי / סיפור לקוח / כללי<br>
        2. בחרי סוג תוכן: ערכי / מכירתי / אישי / בידורי<br>
        3. בחרי פורמט נגישות<br>
        4. "מגילת אסתר" - שפכי הכל בלי סינון, כל מה שבא לך להגיד על זה<br>
        5. צמצמי ל-5 חלקים: הוק → חיזוק הוק → נימוק → מסר → קריאה לפעולה<br><br>
        ולבסוף: קראי בקול, תבדקי שהכל זורם
      </p>
      <div class="cosmic-btn-row">
        <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-scratch-ok-btn">הבנתי, יוצאת לכתוב</button>
      </div>
    `);
    document.getElementById('va-scratch-ok-btn').addEventListener('click', () => {
      state = INITIAL_STATE;
      render();
    });
    return;
  }
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
