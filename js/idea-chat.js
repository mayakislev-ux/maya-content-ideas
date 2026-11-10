import { auth } from './firebase-init.js';
import { getProfile, saveProfile } from './user-profile.js';
import { showView } from './view-router.js';
import { openAddModal, openEditModal, autoClassify } from './idea-form.js';
import { getCurrentIdeas } from './archive-view.js';
import { findSimilarIdea } from './ideas-logic.js';
import { showWelcomeTour } from './welcome-tour.js';
import { addBubble, addThinkingBubble, addChoiceBubble, setBubbleText, playSuccessSound } from './chat-ui.js';
import { wireVoiceInput } from './voice-input.js';
import { wireChatComposer, autoGrow } from './chat-composer.js';
/* 26/10/2026: פענוח התשובה חי במקום אחד, והעוזר ליצירת סרטון
   מייבא מאותו קובץ - אחרת הוא הציג את השורה הטכנית למשתמשת. */
import { extractIdeaSummary, ideaTextOnly, labeledIdea, RECOGNIZED_MARKER } from './idea-reply.js';
import { burstConfetti } from './confetti.js';
import { confirmDialog } from './confirm-dialog.js';
import { updateIdea, addIdea } from './ideas-store.js';
import { showToast } from './toast.js';
import { serverErrorText } from './server-error.js';
import { actsAsOwner, viewedClient } from './client-view.js';
import { saysConverting, moneyDance, mayaVisibleFor } from './va-maya.js';

// checkIdea used to be a plain httpsCallable - converted to a raw streaming
// HTTP endpoint so the reply appears progressively instead of behind a single
// long "חושבת..." wait (that wait is what "מחכה הרבה זמן" was reporting).
// Same region/project checkIdea was already deployed to, just the 2nd-gen
// HTTP trigger URL instead of the callable SDK.
const CHECK_IDEA_URL = 'https://us-central1-content-ideas-becd7.cloudfunctions.net/checkIdea';

function isAdmin() {
  return Boolean(auth.currentUser) && actsAsOwner(auth.currentUser.email);
}

// Parses one chunk of raw SSE text against a carried-over buffer (a chunk can
// split a "data: {...}\n\n" block mid-way) - mirrors the same parsing logic
// the checkIdea Cloud Function itself uses server-side on the Anthropic
// stream, just applied here to *our own* SSE protocol instead of Anthropic's.
function parseSSEChunk(buffer, chunkText) {
  const combined = buffer + chunkText;
  const blocks = combined.split('\n\n');
  const remainder = blocks.pop();
  const events = [];
  for (const block of blocks) {
    const dataLine = block.split('\n').find((line) => line.startsWith('data:'));
    if (!dataLine) continue;
    try {
      events.push(JSON.parse(dataLine.slice(5).trim()));
    } catch (err) {
      console.error('Failed to parse checkIdea SSE data line:', dataLine, err);
    }
  }
  return { events, remainder };
}

// Streams a checkIdea reply, calling onDelta(text) as each piece arrives, and
// resolving with the final canonical reply text once the stream completes
// (which may differ slightly from the concatenated deltas if a corrective
// Hebrew rewrite ran server-side - the caller should use the resolved value,
// not its own concatenation, for anything beyond live display).
// 22/10/2026 (מאיה: "איפה הצ'אט AI בלייב?"): מיוצא כדי שהעוזר ליצירת
// סרטון יוכל להריץ את אותו צ'אט בתוך המסך שלו, ולא לקפוץ ללשונית אחרת
// ולא לשכפל מנוע שני. אותו שרת, אותו זרם, אותה התנהגות.
export async function streamCheckIdea(messages, ideaProfile, onDelta, ideaContext = null) {
  // withTimeout (למעלה) כבר קיימת בדיוק בשביל "חיבור שנתקע בלי לפתור ובלי
  // לדחות" - אבל היא מעולם לא עטפה את הקריאה הזו. חיבור stream שנתקע (לא
  // סגור, פשוט שקט) לא היה נופל אף פעם, כי אין timeout על reader.read()
  // עצמה. ה-idle timer מתאפס בכל בית שמגיע (כולל heartbeat), כך שחיבור
  // תקין עם "חשיבה" ארוכה לא נפגע - רק חיבור שבאמת נדם לגמרי נחתך.
  const controller = new AbortController();
  let idleTimer;
  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), 45000);
  };
  resetIdleTimer();

  // 18/09: הלוגים הראו 3 ימים בלי אף בקשה שהגיעה לשרת, בזמן שהלקוחות ראו "חושב..."
  // בלי סוף. getIdToken() היה ה-await היחיד בלי הגבלת זמן בדרך לשרת (הוא יכול
  // להיתקע על IndexedDB אחרי שהאפליקציה הייתה ברקע), ולכן עכשיו הוא מוגבל.
  const user = auth.currentUser;
  if (!user) {
    clearTimeout(idleTimer);
    throw new Error('צריך להתחבר מחדש. רעננו את הדף ונסו שוב.');
  }
  let idToken;
  try {
    idToken = await withTimeout(user.getIdToken(), 15000);
  } catch (err) {
    clearTimeout(idleTimer);
    throw new Error('החיבור נתקע. רעננו את הדף ונסו שוב.');
  }

  let response;
  try {
    response = await fetch(CHECK_IDEA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ messages, profile: ideaProfile, ideaContext }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(idleTimer);
    if (err.name === 'AbortError') throw new Error('החיבור נתקע, נסו שוב.');
    throw err;
  }

  if (!response.ok) {
    clearTimeout(idleTimer);
    let message = 'משהו השתבש, נסו שוב בבקשה.';
    try {
      const errData = await response.json();
      if (errData && errData.error) message = errData.error;
    } catch (err) {
      // response body wasn't JSON - fall back to the generic message above
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      let done, value;
      try {
        ({ done, value } = await reader.read());
      } catch (err) {
        if (err.name === 'AbortError') throw new Error('החיבור נתקע, נסו שוב.');
        throw err;
      }
      resetIdleTimer();
      if (done) break;
      const parsed = parseSSEChunk(buffer, decoder.decode(value, { stream: true }));
      buffer = parsed.remainder;
      for (const event of parsed.events) {
        if (event.error) {
          throw new Error(event.error);
        }
        if (typeof event.delta === 'string') {
          onDelta(event.delta);
        }
        if (event.done) {
          return event.reply || '';
        }
      }
    }
  } finally {
    clearTimeout(idleTimer);
  }
  throw new Error('משהו השתבש, נסו שוב בבקשה.');
}

export const ONBOARDING_STEPS = ['name', 'pronoun', 'business', 'primaryAudience', 'secondaryAudience'];
export const ONBOARDING_QUESTIONS = {
  name: 'קודם כל - עם מי אני מדברת? מה השם שלך?',
  business: 'מה העסק שלך? באיזה תחום את/ה עוסק/ת?',
  primaryAudience: 'מי קהל היעד העיקרי שלך?',
  secondaryAudience: 'ומי קהל היעד המשני שלך (אם יש)?',
};

/* 04/11/2026 (מאיה): "אגב, כדאי למלא את הפרופיל במסך ההגדרות" ירד מהשרת.
   "אולי במקום זה שבצ'אט עצמו ישאל אותי ואמלא לו אם חסר, ושלא יהיה ככה כל
   פעם". מה שהפרומפט באמת צריך הוא התחום וקהל היעד העיקרי (ב-04/11: 36 מתוך
   74 פרופילים בלי תחום, 28 בלי קהל). כשאחד מהם חסר, הצ'אט שואל עליו קודם,
   שאלה אחת בכל פעם, שומר בפרופיל, ולא שואל שוב. התשובות לא נשלחות לשרת. */
export const REQUIRED_PROFILE_STEPS = ['business', 'primaryAudience'];

/** אילו שאלות לשאול לפני הפתיחה. פרופיל שלא קיים בכלל: ההיכרות המלאה.
    מאיה עצמה (השרת מתעלם אצלה מהתחום ומהקהל) ותצוגה של לקוחה אחרת: כלום,
    כדי לא לכתוב לפרופיל של מישהי אחרת דרך הצ'אט. */
export function missingProfileSteps(p, { owner = false, viewing = false } = {}) {
  if (owner || viewing) return [];
  if (!p) return [...ONBOARDING_STEPS];
  return REQUIRED_PROFILE_STEPS.filter((k) => !String(p[k] || '').trim());
}

/** הנוסח של שאלה חסרה בודדת, בלשון הפנייה אם ידועה. */
export function missingStepQuestion(step, { first, pronoun } = {}) {
  const lead = first ? 'רגע לפני שנתחיל: ' : '';
  if (step === 'business') return `${lead}מה התחום שלך?`;
  const sell = pronoun === 'אתה' ? 'למי אתה רוצה למכור' : (pronoun === 'את' ? 'למי את רוצה למכור' : 'למי את/ה רוצה למכור');
  return `${first ? lead : 'ו'}מי קהל היעד העיקרי שלך? (${sell})`;
}

let history = [];
let profile = null;
let onboardingStep = null;
let onboardingSteps = ONBOARDING_STEPS;
let onboardingPartial = false;
let draftProfile = {};
let started = false;
let originalIdeaText = null;
let lastIdeaSummary = null;
// Set when the chat was opened directly from an existing idea's "בדיקה
// חוזרת" button - saveFinalIdea then updates that exact idea instead of
// relying on fuzzy title-matching (or asking via a confirm() dialog) to
// guess which idea the finished chat belongs to.
let editingIdeaId = null;
/* 27/10/2026: הקטגוריה, שלב השכנוע ופילוח הקהל של הרעיון שנפתח מהמאגר.
   עד היום נשלחה רק הכותרת, והצ'אט ניחש מאפס אם זה תוכן אישי או עסקי. */
let pendingIdeaContext = null;
// The idea text to auto-send as the first message once the chat is ready
// (profile loaded, onboarding done if needed) - set by
// startIdeaChatWithExistingIdea, consumed by greetAndAskForIdea.
let pendingIdeaToCheck = null;


function messagesEl() {
  return document.getElementById('chat-messages');
}

function revealRow(bubble) {
  const row = bubble && bubble.closest ? bubble.closest('.chat-row') : null;
  if (!row || typeof row.scrollIntoView !== 'function') return;
  try {
    row.scrollIntoView({ block: 'start', behavior: 'smooth' });
  } catch {
    row.scrollIntoView();
  }
}

// A stale Firestore connection (e.g. the tab was backgrounded on mobile
// for a while and the realtime connection didn't cleanly resume) can leave
// getProfile() neither resolving nor rejecting - the "thinking" bubble then
// sits there forever with no error, no retry, nothing. Racing it against a
// timeout guarantees the user always gets SOME outcome instead of a
// permanently frozen "מקליד..." indicator.
function withTimeout(promise, ms) {
  /* הטיימר מתבטל כשהתשובה הגיעה, ולא נשאר לרוץ לחינם עוד 15 שניות */
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); }),
  ]).finally(() => clearTimeout(timer));
}

async function saveFinalIdea(finalizedText) {
  showView('archive');

  if (editingIdeaId) {
    const idea = getCurrentIdeas().find((i) => i.id === editingIdeaId);
    const targetId = editingIdeaId;
    editingIdeaId = null;
    if (idea) {
      // בדיקה חוזרת על רעיון קיים - הקטגוריה/דירוג/קהל וכו' כבר מוגדרים
      // מהפעם הקודמת, רק הכותרת (עם הזווית החדשה) השתנתה. שומרים ישר
      // במקום לפתוח שוב את המודל ולחכות ללחיצת "שמירה" נוספת - בקשה
      // מפורשת של מאיה: "שיהיה נוח וקל לעבודה", לא עוד אישור כפול.
      try {
        await updateIdea(targetId, { title: finalizedText });
        showToast('✓ הרעיון עודכן עם הזווית החדשה');
      } catch (err) {
        console.error('updateIdea (from chat) failed:', err);
        showToast('משהו השתבש בעדכון, נסו שוב');
      }
      return;
    }
  }

  const match = findSimilarIdea(getCurrentIdeas(), originalIdeaText || '');
  if (match) {
    const wantsUpdate = await confirmDialog(`זיהיתי שזה כנראה עדכון לרעיון הקיים "${match.title}" - לעדכן אותו?\n\n(ביטול ← יצירת רעיון חדש בנפרד)`, { okLabel: 'לעדכן', cancelLabel: 'רעיון חדש' });
    if (wantsUpdate) {
      openEditModal(match, finalizedText);
      return;
    }
  }
  openAddModal(finalizedText);
}

function addPostIdeaButtons(bubble, finalizedText, ideaSummary) {
  /* 10/11/2026 (מאיה: "תוך כדי כתיבת התסריט אני רוצה לשמור רעיון, והוא
     מעביר אותי למסך רעיונות ויוצא לגמרי מהרובוט, כי הייתי שם באמצע").
     כשהצ'אט נפתח מתוך העוזר, השמירה נעשית כאן בשקט, וחוזרים לעוזר עם
     הרעיון, המסר והזווית ממולאים. מחוץ לעוזר: כמו קודם, חלון השמירה. */
  if (chatReturn && chatReturn.handoff) {
    const idea = (ideaSummary && ideaSummary.idea) || finalizedText;
    const message = (ideaSummary && ideaSummary.message) || '';
    /* 06/11/2026 (מאיה): "הוא בוחר זווית אבל אחר כך כשאני מעבירה את הרעיון
       לביצוע הוא שוכח מהזווית". עד היום רק הרעיון והמסר חזרו לעוזר. */
    const angle = (ideaSummary && ideaSummary.angle) || '';

    const goBtn = document.createElement('button');
    goBtn.type = 'button';
    goBtn.className = 'chat-cta-btn chat-back-assistant-btn';
    goBtn.textContent = '💾 לשמור את הרעיון ולהמשיך לבנות את הסרטון';
    goBtn.addEventListener('click', async () => {
      goBtn.disabled = true;
      goBtn.textContent = 'שומרים...';
      const saved = await saveIdeaQuietly(finalizedText, message);
      if (!saved) showToast('השמירה בבנק הרעיונות לא עברה, אבל הרעיון עובר לעוזר');
      else showToast('✓ הרעיון נשמר בבנק, ממשיכים לבנות את הסרטון');
      returnFromChat({ idea, message, angle });
    });
    bubble.appendChild(goBtn);

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'chat-cta-btn chat-save-btn';
    backBtn.textContent = '↩ להמשיך בלי לשמור בבנק';
    backBtn.addEventListener('click', () => returnFromChat({ idea, message, angle }));
    bubble.appendChild(backBtn);
    return;
  }

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'chat-cta-btn chat-save-btn';
  saveBtn.textContent = '💾 שמירה כרעיון';
  saveBtn.addEventListener('click', () => saveFinalIdea(finalizedText));
  bubble.appendChild(saveBtn);
}

/* שמירה לבנק בלי לצאת מהמסך: הסיווג האוטומטי של הטופס הקצר, ואם הוא לא
   עונה בזמן, נשמר בלי סוג (בדיוק כמו בטופס). true אם נשמר. */
async function saveIdeaQuietly(title, message = '') {
  const text = String(title || '').trim();
  if (!text) return false;
  try {
    /* סוקר 10/11: רעיון שהוגרל מהבנק וחודד כאן מתעדכן במקום, ולא נשמר שוב כעותק */
    const match = findSimilarIdea(getCurrentIdeas(), originalIdeaText || text);
    if (match) {
      await withTimeout(updateIdea(match.id, { title: text }), 10000);
      return true;
    }
    const cls = (await autoClassify(text)) || {};
    /* סוקר 10/11: בלי תקרת זמן, קליטה חלשה השאירה את הכפתור על "שומרים..." לתמיד */
    await withTimeout(addIdea({
      title: text,
      category: cls.category || '',
      persuasionStage: cls.persuasionStage || '',
      audienceScope: cls.audienceScope || '',
      hookText: String(message || '').trim(),
      source: 'assistant-chat',
    }), 10000);
    return true;
  } catch (err) {
    console.error('saveIdeaQuietly failed:', err);
    return false;
  }
}

function resetChat() {
  history = [];
  originalIdeaText = null;
  lastIdeaSummary = null;
  editingIdeaId = null;
  pendingIdeaToCheck = null;
  // ההקשר שייך לרעיון שנפתח מהמאגר בלבד, ולא נגרר לשיחה הבאה
  pendingIdeaContext = null;
  newConversation();
  messagesEl().innerHTML = '';
  continueAfterProfile();
}

function askOnboardingStep(step) {
  const input = document.getElementById('chat-input');
  if (onboardingPartial) {
    input.hidden = false;
    input.focus();
    const first = onboardingSteps.indexOf(step) === 0;
    addBubble(messagesEl(), missingStepQuestion(step, { first, pronoun: (profile || {}).pronoun }), 'assistant');
    return;
  }
  if (step === 'pronoun') {
    input.hidden = true;
    addChoiceBubble(messagesEl(), 'איך נעים לך שאפנה אלייך?', ['את', 'אתה'], (choice) => {
      draftProfile.pronoun = choice;
      advanceOnboarding();
    });
    return;
  }
  input.hidden = false;
  input.focus();
  addBubble(messagesEl(), ONBOARDING_QUESTIONS[step], 'assistant');
}

function advanceOnboarding() {
  const idx = onboardingSteps.indexOf(onboardingStep);
  const nextStep = onboardingSteps[idx + 1];
  if (nextStep) {
    onboardingStep = nextStep;
    askOnboardingStep(onboardingStep);
  } else {
    finishOnboarding();
  }
}

async function finishOnboarding() {
  /* רק מה שנשאל נכתב (saveProfile ממזג), ושאר הפרופיל נשאר כמו שהיה */
  const answers = { ...draftProfile };
  profile = { ...(profile || {}), ...answers };
  onboardingStep = null;
  onboardingPartial = false;
  draftProfile = {};
  // לא מחכים לשמירה: כתיבה ל-Firestore על חיבור תקוע יכולה לא להסתיים אף פעם,
  // והצ'אט היה נשאר בלי תשובה אחרי השאלה האחרונה
  withTimeout(saveProfile(answers), 10000).catch((err) => console.error('saveProfile failed:', err));
  document.getElementById('chat-input').hidden = false;
  greetAndAskForIdea();
}

function greetAndAskForIdea() {
  if (pendingIdeaToCheck) {
    const text = pendingIdeaToCheck;
    pendingIdeaToCheck = null;
    sendIdeaMessage(text);
    return;
  }
  /* 27/10/2026: ברירת המחדל כאן הייתה נקבה, ולכן המשפט הראשון שגבר בלי
     פרופיל ראה היה בלשון נקבה - בדיוק מה שתוקן בצד השרת. כשלא ידוע,
     צורה כפולה. */
  const who = profile || {};
  const registerVerb = who.pronoun === 'אתה' ? 'רשום' : (who.pronoun === 'את' ? 'רשמי' : 'רשמ/י');
  addBubble(
    messagesEl(),
    `${who.name ? `${who.name}, ` : ''}${registerVerb} לי מה הרעיון שלך ואדייק אותך.`,
    'assistant'
  );
}

/* 04/11/2026 (סקירה): כל שיחה שמתחילה מחדש מקבלת מספר. בקשה שעוד רצה
   משיחה קודמת (למשל: חזרו לעוזר באמצע תשובה ופתחו שוב עם רעיון אחר)
   לא כותבת להיסטוריה של השיחה החדשה ולא משחררת את תיבת הכתיבה באמצע
   התשובה החדשה. התיבה משתחררת כאן, כי הבקשה הישנה כבר לא תשחרר אותה. */
let chatGen = 0;
function newConversation() {
  chatGen += 1;
  onboardingStep = null;
  onboardingPartial = false;
  draftProfile = {};
  const input = document.getElementById('chat-input');
  const newIdeaBtn = document.getElementById('new-idea-btn');
  if (input) { input.disabled = false; input.hidden = false; }
  if (newIdeaBtn) newIdeaBtn.disabled = false;
}

// Shared between the chat form's own submit handler and
// startIdeaChatWithExistingIdea (which auto-sends an existing idea's text
// as if the user had just typed and submitted it).
async function sendIdeaMessage(text) {
  const input = document.getElementById('chat-input');
  const newIdeaBtn = document.getElementById('new-idea-btn');
  const gen = chatGen;
  const convo = history;
  const stale = () => gen !== chatGen;
  input.disabled = true;
  newIdeaBtn.disabled = true;
  const sentBubble = addBubble(messagesEl(), text, 'user');
  if (navigator.vibrate) navigator.vibrate(15);
  if (history.length === 0) originalIdeaText = text;
  history.push({ role: 'user', content: text });
  const thinkingBubble = addThinkingBubble(messagesEl());
  const stopStatus = showThinkingStatus(thinkingBubble);
  /* 06/11/2026: הדף הוא שגולל, לא רשימת ההודעות, ולכן scrollTop עליה לא
     עשה כלום. ההודעה שנשלחה ובועת "חושבת" נגללות לתוך המסך, מעל שורת
     הכתיבה (scroll-margin-bottom ב-CSS). */
  revealRow(sentBubble);

  try {
    const onDelta = (liveTextRef) => (delta) => {
      stopStatus();
      liveTextRef.value += delta;
      // Avoid flashing the raw "[[RECOGNIZED_EXCELLENT]]" marker text on
      // screen: while the buffered text is still short enough that it could
      // still turn out to BE (or not be) the marker, hold off rendering
      // until it's resolved either way - only a few chars' worth of delay.
      const stillAmbiguous =
        liveTextRef.value.length < RECOGNIZED_MARKER.length && RECOGNIZED_MARKER.startsWith(liveTextRef.value);
      if (stillAmbiguous) return;
      const display = liveTextRef.value.startsWith(RECOGNIZED_MARKER)
        ? liveTextRef.value.slice(RECOGNIZED_MARKER.length).trimStart()
        : liveTextRef.value;
      setBubbleText(thinkingBubble, display);
      messagesEl().scrollTop = messagesEl().scrollHeight;
    };

    // "Load failed" (iOS Safari's raw fetch-stream error, seen for real in
    // her clients' reports - not a message our own code ever produces) is a
    // transient network drop mid-stream, most common on a shaky cellular
    // connection, not a real server-side failure. A single retry catches
    // most of these invisibly - but the half-streamed text from the failed
    // attempt has to be wiped from the bubble first, or the retry's text
    // would just get appended after the leftover garbage.
    let finalReply;
    for (let attempt = 1; ; attempt++) {
      const liveTextRef = { value: '' };
      try {
        // Only wipe the bubble on a retry (attempt > 1) - on the first
        // attempt it still shows addThinkingBubble's own dots animation,
        // clearing it immediately would blank that out before anything
        // has even started streaming.
        if (attempt > 1) setBubbleText(thinkingBubble, '');
        finalReply = await streamCheckIdea(convo, profile, onDelta(liveTextRef), pendingIdeaContext);
        break;
      } catch (err) {
        const hasHebrewText = /[֐-׿]/.test(err.message || '');
        if (hasHebrewText || attempt >= 2 || stale()) throw err;
        console.error(`checkIdea stream failed, retrying (attempt ${attempt}):`, err);
      }
    }

    // From here on, use finalReply (the server-confirmed canonical text) -
    // not liveText - since a rare corrective Hebrew rewrite can change the
    // final text after streaming already displayed the original.
    if (stale()) return;
    let reply = finalReply;
    if (reply.startsWith(RECOGNIZED_MARKER)) {
      reply = reply.slice(RECOGNIZED_MARKER.length).trimStart();
      thinkingBubble.classList.add('chat-bubble-excellent');
      playSuccessSound();
      burstConfetti();
    }
    const { visibleReply, summary, idea, angle, story, message } = extractIdeaSummary(reply);
    /* 10/11/2026 (מאיה): "ממיר" = גשם של שטרות והדמות רוקדת */
    if (saysConverting(reply) && mayaVisibleFor(auth.currentUser && auth.currentUser.email)) moneyDance();
    /* 04/11/2026 (מאיה): כפתור "למפת הדרכים" ירד מהתוצאה הסופית. */
    setBubbleText(thinkingBubble, visibleReply);
    if (summary) {
      lastIdeaSummary = { idea, angle, story, message };
      addPostIdeaButtons(thinkingBubble, summary, lastIdeaSummary);
    } else {
      /* השורה הטכנית חסרה, אבל הרעיון כתוב בסעיפים: עדיין אפשר לשמור ולחזור */
      const labeled = labeledIdea(visibleReply);
      if (labeled.idea && labeled.message) {
        lastIdeaSummary = { idea: labeled.idea, angle: labeled.angle, story: '', message: labeled.message };
        addPostIdeaButtons(thinkingBubble, labeled.idea, lastIdeaSummary);
      }
    }
    messagesEl().scrollTop = messagesEl().scrollHeight;
    history.push({ role: 'assistant', content: visibleReply });
  } catch (err) {
    console.error('checkIdea failed:', err);
    if (stale()) return;
    // אף פעם לא להציג טקסט אנגלי גולמי כמו "Load failed" (שגיאת דפדפן
    // מובנית של iOS Safari על stream שנקטע - זו לא הודעה שהקוד שלנו כתב) -
    // רק הודעות עברית שהשרת שלח בכוונה מוצגות כמו שהן.
    const hasHebrewText = /[֐-׿]/.test(err.message || '');
    setBubbleText(thinkingBubble, serverErrorText(err, 'הבדיקה'));
  } finally {
    stopStatus();
    if (!stale()) {
      input.disabled = false;
      newIdeaBtn.disabled = false;
      input.focus();
    }
  }
}

// ה-AI חושב 20-60 שניות לפני המילה הראשונה. במקום נקודות בלבד (שנראות כמו
// "נתקע"), מראים מה קורה עכשיו. נעצר ברגע שהטקסט האמיתי מתחיל להגיע.
const THINKING_STATUSES = [
  'קוראת את הרעיון שלך...',
  'חושבת על הקהל שלך...',
  'בונה זוויות הנגשה...',
  'מחדדת את הזוויות הכי חזקות...',
  'עוד כמה שניות, מסדרת את התשובה...',
];

function showThinkingStatus(bubble) {
  const status = document.createElement('div');
  status.className = 'chat-thinking-status';
  let i = 0;
  const firstTimer = setTimeout(() => {
    status.textContent = THINKING_STATUSES[0];
    bubble.appendChild(status);
  }, 3000);
  const interval = setInterval(() => {
    i = Math.min(i + 1, THINKING_STATUSES.length - 1);
    status.textContent = THINKING_STATUSES[i];
  }, 9000);
  return () => {
    clearTimeout(firstTimer);
    clearInterval(interval);
    status.remove();
  };
}

function startOnboarding(steps = ONBOARDING_STEPS) {
  onboardingSteps = steps;
  onboardingPartial = steps !== ONBOARDING_STEPS && Boolean(profile);
  draftProfile = {};
  if (!onboardingPartial) {
    addBubble(messagesEl(), 'לפני שנתחיל - יהיה עכשיו רצף קצר של כמה שאלות היכרות (חד-פעמי, לא אצטרך לשאול שוב בפעם הבאה).', 'assistant');
  }
  onboardingStep = steps[0];
  askOnboardingStep(onboardingStep);
}

/* אחרי שהפרופיל נטען: קודם מה שחסר בו, ורק אז הפתיחה (או הרעיון שהגיע מהעוזר) */
function continueAfterProfile() {
  const steps = missingProfileSteps(profile, { owner: isAdmin(), viewing: Boolean(viewedClient()) });
  if (steps.length) startOnboarding(profile ? steps : ONBOARDING_STEPS);
  else greetAndAskForIdea();
}

export async function startIdeaChat() {
  clearChatReturn();
  // "עריכת פרטים" כאן מריץ מחדש את כל שיחת ההיכרות כולל "תחום העיסוק" -
  // זה נשאר כלי מנהלת בלבד בכוונה, כדי שמשתמשת רגילה לא תוכל לשנות את
  // התחום שהחשבון שלה מוגבל אליו. עדכון קהל יעד לכולן נעשה דרך מודל
  // ייעודי וממוקד יותר (audience-edit-modal ב-content-plan.js), לא כאן.
  document.getElementById('edit-profile-btn').hidden = !isAdmin();
  document.getElementById('replay-tour-btn').hidden = !isAdmin();
  if (started) return;
  started = true;
  const loadingBubble = addThinkingBubble(messagesEl());
  try {
    profile = await withTimeout(getProfile(), 10000);
    loadingBubble.closest('.chat-row').remove();
    continueAfterProfile();
  } catch (err) {
    console.error('startIdeaChat failed:', err);
    loadingBubble.closest('.chat-row').remove();
    started = false;
    addBubble(messagesEl(), 'משהו השתבש בטעינת הצ\'אט (יכול לקרות אחרי שהאפליקציה הייתה ברקע זמן ארוך) - נסו לצאת וללחוץ שוב על "צ\'אט לבדיקת רעיון", ואם זה חוזר - רעננו את הדף.', 'assistant');
  }
}

// Opened directly from an existing idea's "זווית הנגשה" button in the
// archive - starts a fresh chat, immediately sends that idea's own text as
// the first message (no need to retype/copy-paste it), and marks it so
// saveFinalIdea updates this exact idea instead of guessing by fuzzy title
// matching or asking via a confirm() popup.
export async function startIdeaChatWithExistingIdea(idea) {
  // "זווית: ..." בכותרת מסמן שכבר נמצאה זווית חזקה לרעיון הזה בעבר (אותו
  // סימון בדיוק ש-checkAngleCoverage בתכנית תוכן כבר סומך עליו). מציגים
  // קודם עובדה (מה הזווית הקיימת, ושהיא כן נחשבת חזקה) ורק אז שואלים -
  // לא קופצים ישר ל"בטוח/ה?" בלי הקשר, כי לחיצה על הכפתור לא הייתה בטעות
  // אלא החלטה מודעת שצריך מידע כדי להעריך.
  //
  // 27/10/2026: הביטוי חיפש "זווית:" בלבד, והמשתמשות כותבות ביד "זווית
  // הנגשה:". בנתונים האמיתיים זה 59 רעיונות מול 250: ל-250 הדיאלוג הזה
  // לא קפץ מעולם, והכותרת נשלחה לצ'אט כמו שהיא כולל שורות הפורמט והזווית.
  const angleMatch = (idea.title || '').match(/זווית(?:\s*הנגשה)?\s*:\s*([^|\n]+)/);
  const angleText = angleMatch ? angleMatch[1].trim() : '';
  if (angleText) {
    const proceed = await confirmDialog(
      `הזווית הנוכחית לרעיון הזה: "${angleText}" - זו נחשבת זווית הנגשה חזקה.\n\nלמצוא בכל זאת זווית אחרת?`,
      { okLabel: 'כן, למצוא זווית אחרת', cancelLabel: 'ביטול' }
    );
    if (!proceed) return;
  }
  clearChatReturn();
  showView('chat');

  document.getElementById('edit-profile-btn').hidden = !isAdmin();
  document.getElementById('replay-tour-btn').hidden = !isAdmin();

  history = [];
  lastIdeaSummary = null;
  editingIdeaId = idea.id;
  pendingIdeaToCheck = ideaTextOnly(idea.title);
  /* הקטגוריה כבר מתויגת על הרעיון. בלי לשלוח אותה, רעיון אישי נבדק
     כאילו הוא תוכן בעל ערך ונשאל "מה הבעיה שזה פותר". */
  pendingIdeaContext = {
    category: idea.category || '',
    persuasionStage: idea.persuasionStage || '',
    audienceScope: idea.audienceScope || '',
  };
  newConversation();
  messagesEl().innerHTML = '';

  if (started && profile) {
    continueAfterProfile();
    return;
  }

  started = true;
  const loadingBubble = addThinkingBubble(messagesEl());
  try {
    profile = await withTimeout(getProfile(), 10000);
    loadingBubble.closest('.chat-row').remove();
    continueAfterProfile(); // finishOnboarding() -> greetAndAskForIdea() picks up pendingIdeaToCheck
  } catch (err) {
    console.error('startIdeaChatWithExistingIdea failed:', err);
    loadingBubble.closest('.chat-row').remove();
    started = false;
    addBubble(messagesEl(), 'משהו השתבש בטעינת הצ\'אט - נסו לצאת וללחוץ שוב על "צ\'אט לבדיקת רעיון".', 'assistant');
  }
}

/* 04/11/2026 (מאיה): "צריך להחזיר את הצ'אט דיוק זווית הנגשה למוח השיווקי,
   אבל רק לבנות שיש להן את האפליקציה המלאה... בתהליך היצירה מ-0, בחלק
   שכותבים רעיון ומסר". זה אותו צ'אט בדיוק, באותו מסך, ולא עותק: העוזר
   פותח אותו עם מה שכבר נכתב אצלו, וכפתור קבוע למעלה מחזיר אליו.
   onBack(idea) נקרא עם הרעיון המדויק כשבוחרים להעביר אותו, ובלעדיו
   (null) כשרק חוזרים. */
/* 04/11/2026: הצ'אט נפתח גם מכרטיס במרכז הלמידה, ואז החזרה היא לשם.
   { onBack, handoff }: handoff = נפתח מהעוזר, ויש כפתור שמחזיר אליו את
   הרעיון והמסר. */
let chatReturn = null;

function backToAssistantBtn() {
  return document.getElementById('chat-back-to-assistant');
}

/* 05/11/2026 (מאיה): חזרה לעוזר נשארה "תלויה" משיחה קודמת שנפתחה מהעוזר
   ויצאו ממנה בתפריט התחתון. שיחה שנפתחת אחר כך מרעיון במאגר הציעה
   "לחזור לעוזר עם הרעיון המדויק" ודחפה לעוזר רעיון לא נכון. כל כניסה
   לצ'אט שלא מהעוזר מנקה את זה. function declaration, ולכן זמין גם
   למעלה בקובץ למרות ש-chatReturn מוגדר כאן. */
function clearChatReturn() {
  chatReturn = null;
  const btn = backToAssistantBtn();
  if (btn) btn.hidden = true;
}

function returnFromChat(result = null) {
  const ret = chatReturn;
  chatReturn = null;
  const btn = backToAssistantBtn();
  if (btn) btn.hidden = true;
  if (ret && ret.onBack) ret.onBack(result);
}

/** מה נשלח לצ'אט מתוך שתי התיבות של העוזר. ריק = הצ'אט פשוט מברך. */
export function assistantSeedText({ topic = '', punchline = '' } = {}) {
  const t = String(topic || '').trim();
  const p = String(punchline || '').trim();
  /* 10/11/2026: אותו משפט בשתי התיבות (או אחד שמכיל את השני) נשלח פעם אחת */
  const norm = (s) => s.replace(/[\s.,!?"'״׳:;()\-–—]+/g, ' ').trim();
  if (t && p && (norm(t).includes(norm(p)) || norm(p).includes(norm(t)))) return norm(t).length > norm(p).length ? t : p;
  if (t && p) return `על מה הסרטון: ${t}\nהמסר: ${p}`;
  return t || p;
}

export function startIdeaChatFromAssistant(seed = {}, { onBack } = {}) {
  return openIdeaChat(seed, {
    onBack, handoff: true, backLabel: '→ חזרה לעוזר ליצירת סרטון', backNote: '(כל מה שכתבתם שמור)',
  });
}

/* 04/11/2026 (מאיה): כרטיס עצמאי במרכז הלמידה, למנוי המלא בלבד */
export function startIdeaChatFromHub() {
  if (document.body.dataset.plan === 'refs') return Promise.resolve();
  return openIdeaChat({}, { onBack: () => showView('guide'), handoff: false, backLabel: '→ חזרה למרכז למידה' });
}

async function openIdeaChat(seed = {}, { onBack, handoff = false, backLabel = '', backNote = '' } = {}) {
  chatReturn = typeof onBack === 'function' ? { onBack, handoff } : null;
  showView('chat');
  const btn = backToAssistantBtn();
  if (btn) {
    btn.hidden = !chatReturn;
    btn.textContent = backLabel;
    if (backNote) {
      const small = document.createElement('small');
      small.textContent = ` ${backNote}`;
      btn.appendChild(small);
    }
  }
  document.getElementById('edit-profile-btn').hidden = !isAdmin();
  document.getElementById('replay-tour-btn').hidden = !isAdmin();

  /* שיחה נקייה: מה שנשאר מרעיון קודם לא שייך לרעיון הזה */
  history = [];
  originalIdeaText = null;
  lastIdeaSummary = null;
  editingIdeaId = null;
  pendingIdeaContext = null;
  pendingIdeaToCheck = assistantSeedText(seed) || null;
  newConversation();
  messagesEl().innerHTML = '';

  if (started && profile) {
    continueAfterProfile();
    return;
  }
  started = true;
  const loadingBubble = addThinkingBubble(messagesEl());
  try {
    profile = await withTimeout(getProfile(), 10000);
    loadingBubble.closest('.chat-row').remove();
    continueAfterProfile();
  } catch (err) {
    console.error('openIdeaChat failed:', err);
    loadingBubble.closest('.chat-row').remove();
    started = false;
    addBubble(messagesEl(), 'משהו השתבש בטעינת הצ\'אט. אפשר לחזור בכפתור למעלה ולנסות שוב.', 'assistant');
  }
}

export function wireIdeaChat() {
  const backBtn = backToAssistantBtn();
  if (backBtn) backBtn.addEventListener('click', () => returnFromChat(null));
  const hubCard = document.getElementById('hub-link-idea-chat');
  if (hubCard) hubCard.addEventListener('click', () => { startIdeaChatFromHub(); });

  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  /* 06/11/2026: שורת הכתיבה תמיד נראית בתחתית המסך במובייל, והתיבה גדלה
     עם הטקסט. ראה chat-composer.js. */
  const composer = wireChatComposer({ form, textarea: input, view: document.getElementById('chat-view') });
  const micBtn = document.getElementById('chat-mic-btn');
  const MIC_LOOK = {
    idle: ['🎤', 'הקלטה קולית'],
    listening: ['⏹', 'מקליטים, ללחוץ כדי לעצור'],
    recording: ['⏹', 'מקליטים, ללחוץ כשמסיימים'],
    transcribing: ['⏳', 'מתמללים את ההקלטה'],
  };
  const voiceInput = wireVoiceInput({
    buttonId: 'chat-mic-btn',
    textareaId: 'chat-input',
    onText: (el) => { autoGrow(el); composer.update(); },
    onState: (st) => {
      const [icon, label] = MIC_LOOK[st] || MIC_LOOK.idle;
      if (micBtn) { micBtn.textContent = icon; micBtn.setAttribute('aria-label', label); micBtn.title = label; }
    },
  });

  document.getElementById('edit-profile-btn').addEventListener('click', () => {
    newConversation();
    messagesEl().innerHTML = '';
    draftProfile = {};
    /* המסך מתנקה, ולכן גם מה שמאחוריו: בלי זה ההקשר של הרעיון הקודם
       (והעריכה שלו) נגרר לשיחה שנראית חדשה לגמרי. */
    history = [];
    editingIdeaId = null;
    pendingIdeaContext = null;
    lastIdeaSummary = null;
    startOnboarding();
  });

  document.getElementById('new-idea-btn').addEventListener('click', resetChat);
  document.getElementById('replay-tour-btn').addEventListener('click', () => showWelcomeTour());

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    // A still-running speech recognition session (continuous mode has no
    // natural end) would otherwise keep writing transcribed text into the
    // textarea after it's already been cleared and sent, which looked like
    // the send action "duplicating" or getting stuck.
    voiceInput.stop();
    input.value = '';
    autoGrow(input);

    if (onboardingStep) {
      addBubble(messagesEl(), text, 'user');
      draftProfile[onboardingStep] = text;
      advanceOnboarding();
      return;
    }

    await sendIdeaMessage(text);
  });
}
