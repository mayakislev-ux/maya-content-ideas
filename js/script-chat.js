import { functions, auth } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { getProfile, saveProfile } from './user-profile.js';
import { showView } from './view-router.js';
import { addBubble, addThinkingBubble, addChoiceBubble, setBubbleText, playSuccessSound } from './chat-ui.js';
import { wireVoiceInput } from './voice-input.js';
import { burstConfetti } from './confetti.js';
import { showToast } from './toast.js';
import { startIdeaChat } from './idea-chat.js';

const ADMIN_EMAIL = 'mayakislev@gmail.com';
const writeScript = httpsCallable(functions, 'writeScript');

function isAdmin() {
  return auth.currentUser && auth.currentUser.email === ADMIN_EMAIL;
}

// Duplicated (not imported) from idea-chat.js on purpose - both modules can
// call into each other (idea-chat offers a "write a script from this idea"
// button, this module offers a "go refine this idea first" button back), and
// keeping each module's own onboarding copy avoids relying on evaluation
// order between two mutually-importing files for something this small.
const ONBOARDING_STEPS = ['name', 'pronoun', 'business', 'primaryAudience', 'secondaryAudience'];
const ONBOARDING_QUESTIONS = {
  name: 'קודם כל - עם מי אני מדברת? מה השם שלך?',
  business: 'מה העסק שלך? באיזה תחום את/ה עוסק/ת?',
  primaryAudience: 'מי קהל היעד העיקרי שלך?',
  secondaryAudience: 'ומי קהל היעד המשני שלך (אם יש)?',
};

const FORMAT_CHOICES = [
  'דיבור למצלמה',
  'וויס אובר',
  'ראיון/שיחה',
  'תוכן ויזואלי יפה',
  'טקסט דינמי',
  'שאלות מהתיבה בסטורי',
  'סדרת תוכן',
  'משחק תפקידים',
  'פוסט קרוסלה',
  'לוח/טאבלט',
  'סטיץ׳ (תגובה לסרטון ויראלי)',
  'תגובה לתגובה',
  'מסך ירוק',
  'מסך חצוי',
];

const REDIRECT_MARKER = '[[REDIRECT_TO_IDEA_CHAT]]';
const IDEA_READY_MARKER = '[[IDEA_READY]]';
const SUMMARY_MARKER = '[[SCRIPT_SUMMARY]]';

let history = [];
let profile = null;
let onboardingStep = null;
let draftProfile = {};
let started = false;
let ideaContext = null;
let formatChosen = false;

function messagesEl() {
  return document.getElementById('script-messages');
}

// Same defensive timeout as idea-chat.js - a stale Firestore connection
// (tab backgrounded a while on mobile) can otherwise leave getProfile()
// hanging forever with the "thinking" bubble frozen and no error shown.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

function extractScriptSummary(reply) {
  const markerIndex = reply.indexOf(SUMMARY_MARKER);
  if (markerIndex === -1) return { visibleReply: reply, summary: null };

  const visibleReply = reply.slice(0, markerIndex).trim();
  const rawTail = reply.slice(markerIndex + SUMMARY_MARKER.length).trim();
  const [format, hook, script] = rawTail.split('||').map((part) => (part || '').trim());

  if (!script) return { visibleReply, summary: null };
  return { visibleReply, summary: { format, hook, script } };
}

function addCopyScriptButton(bubble, summary) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chat-cta-btn chat-save-btn';
  btn.textContent = '📋 העתקת התסריט';
  btn.addEventListener('click', async () => {
    const fullText = `הוק: ${summary.hook}\n\n${summary.script}`;
    try {
      await navigator.clipboard.writeText(fullText);
      showToast('התסריט הועתק ✅');
    } catch (err) {
      console.error('Clipboard write failed:', err);
      showToast('לא הצלחתי להעתיק - נסו לסמן ולהעתיק ידנית');
    }
  });
  bubble.appendChild(btn);
}

function addGoToIdeaChatButton(bubble) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chat-cta-btn';
  btn.textContent = '🔄 מעבר לדיוק הרעיון';
  btn.addEventListener('click', () => {
    showView('chat');
    startIdeaChat();
  });
  bubble.appendChild(btn);
}

function resetChat() {
  history = [];
  ideaContext = null;
  formatChosen = false;
  messagesEl().innerHTML = '';
  greetAndAskForIdea();
}

function askOnboardingStep(step) {
  const input = document.getElementById('script-input');
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
  const idx = ONBOARDING_STEPS.indexOf(onboardingStep);
  const nextStep = ONBOARDING_STEPS[idx + 1];
  if (nextStep) {
    onboardingStep = nextStep;
    askOnboardingStep(onboardingStep);
  } else {
    finishOnboarding();
  }
}

async function finishOnboarding() {
  profile = { ...draftProfile };
  await saveProfile(profile);
  onboardingStep = null;
  document.getElementById('script-input').hidden = false;
  greetAndAskForIdea();
}

function startOnboarding() {
  addBubble(messagesEl(), 'לפני שנתחיל - יהיה עכשיו רצף קצר של כמה שאלות היכרות (חד-פעמי, לא אצטרך לשאול שוב בפעם הבאה).', 'assistant');
  onboardingStep = ONBOARDING_STEPS[0];
  askOnboardingStep(onboardingStep);
}

function greetAndAskForIdea() {
  if (ideaContext) {
    addBubble(messagesEl(), `מעולה, בואו נכתוב תסריט על הרעיון: "${ideaContext.idea}"`, 'assistant');
    askFormat();
    return;
  }
  const registerVerb = profile.pronoun === 'אתה' ? 'רשום' : 'רשמי';
  addBubble(messagesEl(), `${registerVerb} לי מה הרעיון שעליו נכתוב תסריט.`, 'assistant');
}

// There's rarely one single "correct" format for an idea - forcing a pick
// with no way out was the complaint. This option asks the AI to suggest a
// few fitting options instead of committing to one blind.
const NOT_SURE_FORMAT_CHOICE = 'לא בטוח/ה 🤔 תני לי כמה אפשרויות';

function askFormat() {
  formatChosen = false;
  addChoiceBubble(messagesEl(), 'איזה פורמט הכי מתאים לתסריט הזה?', [...FORMAT_CHOICES, NOT_SURE_FORMAT_CHOICE], (choice) => {
    if (choice === NOT_SURE_FORMAT_CHOICE) {
      sendMessage('לא בטוח/ה איזה פורמט הכי מתאים לרעיון הזה - תציעי כמה אפשרויות שיתאימו, עם הסבר קצר לכל אחת למה היא מתאימה, ואז אבחר.');
      return;
    }
    formatChosen = true;
    sendMessage(`הפורמט שבחרתי: ${choice}`);
  });
}

async function sendMessage(text) {
  const input = document.getElementById('script-input');
  input.disabled = true;
  history.push({ role: 'user', content: text });
  const thinkingBubble = addThinkingBubble(messagesEl());

  try {
    const result = await writeScript({ messages: history, profile, ideaContext });
    let reply = result.data.reply;

    if (reply.includes(REDIRECT_MARKER)) {
      const visibleReply = reply.replace(REDIRECT_MARKER, '').trim();
      setBubbleText(thinkingBubble, visibleReply);
      addGoToIdeaChatButton(thinkingBubble);
      history.push({ role: 'assistant', content: visibleReply });
      input.disabled = false;
      return;
    }

    if (reply.includes(IDEA_READY_MARKER)) {
      const visibleReply = reply.replace(IDEA_READY_MARKER, '').trim();
      if (visibleReply) setBubbleText(thinkingBubble, visibleReply);
      else thinkingBubble.closest('.chat-row').remove();
      history.push({ role: 'assistant', content: visibleReply });
      messagesEl().scrollTop = messagesEl().scrollHeight;
      askFormat();
      input.disabled = false;
      return;
    }

    const { visibleReply, summary } = extractScriptSummary(reply);
    setBubbleText(thinkingBubble, visibleReply);
    if (summary) {
      thinkingBubble.classList.add('chat-bubble-excellent');
      playSuccessSound();
      burstConfetti();
      addCopyScriptButton(thinkingBubble, summary);
    }
    messagesEl().scrollTop = messagesEl().scrollHeight;
    history.push({ role: 'assistant', content: visibleReply });
  } catch (err) {
    console.error('writeScript failed:', err);
    setBubbleText(thinkingBubble, 'משהו השתבש, נסו שוב בבקשה.');
  } finally {
    input.disabled = false;
    input.focus();
  }
}

async function ensureProfileAndGreet() {
  const loadingBubble = addThinkingBubble(messagesEl());
  try {
    profile = await withTimeout(getProfile(), 10000);
    loadingBubble.closest('.chat-row').remove();
    if (profile) {
      greetAndAskForIdea();
    } else {
      startOnboarding();
    }
  } catch (err) {
    console.error('script-chat profile load failed:', err);
    loadingBubble.closest('.chat-row').remove();
    started = false;
    addBubble(messagesEl(), 'משהו השתבש בטעינת הצ\'אט (יכול לקרות אחרי שהאפליקציה הייתה ברקע זמן ארוך) - נסו לצאת וללחוץ שוב על "כתיבת תסריטים", ואם זה חוזר - רעננו את הדף.', 'assistant');
  }
}

export async function startScriptChat() {
  if (started) return;
  started = true;
  await ensureProfileAndGreet();
}

export async function startScriptChatWithIdea(idea) {
  history = [];
  ideaContext = idea;
  formatChosen = false;
  messagesEl().innerHTML = '';
  started = true;
  await ensureProfileAndGreet();
}

export function wireScriptChat() {
  const form = document.getElementById('script-form');
  const input = document.getElementById('script-input');
  const voiceInput = wireVoiceInput({ buttonId: 'script-mic-btn', textareaId: 'script-input' });

  document.getElementById('new-script-btn').addEventListener('click', resetChat);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    voiceInput.stop();
    input.value = '';

    if (onboardingStep) {
      addBubble(messagesEl(), text, 'user');
      draftProfile[onboardingStep] = text;
      advanceOnboarding();
      return;
    }

    addBubble(messagesEl(), text, 'user');
    if (navigator.vibrate) navigator.vibrate(15);
    sendMessage(text);
  });
}
