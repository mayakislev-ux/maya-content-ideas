import { auth } from './firebase-init.js';
import { getProfile, saveProfile } from './user-profile.js';
import { showView } from './view-router.js';
import { addBubble, addThinkingBubble, addChoiceBubble, setBubbleText, playSuccessSound } from './chat-ui.js';
import { wireVoiceInput } from './voice-input.js';
import { burstConfetti } from './confetti.js';
import { showToast } from './toast.js';
import { startIdeaChat } from './idea-chat.js';
import { FORMAT_CHOICES } from './ideas-logic.js';

const ADMIN_EMAIL = 'mayakislev@gmail.com';

// writeScript היה onCall יחיד בלי סטרימינג - אותה "מחלקת באג" בדיוק שכבר
// תוקנה ב-checkIdea/generateContentPlan/generateWarmingPlan (בקשות ארוכות
// שנראות "תקועות" או נופלות ב-timeout). תבנית זהה לזו שכבר עובדת ב-idea-chat.js
// (streamCheckIdea/parseSSEChunk), מועתקת ולא ממומשת מחדש.
const WRITE_SCRIPT_URL = 'https://us-central1-content-ideas-becd7.cloudfunctions.net/writeScript';

function isAdmin() {
  return auth.currentUser && auth.currentUser.email === ADMIN_EMAIL;
}

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
      console.error('Failed to parse writeScript SSE data line:', dataLine, err);
    }
  }
  return { events, remainder };
}

async function streamWriteScript(messages, ideaProfile, ideaCtx, onDelta) {
  const idToken = await auth.currentUser.getIdToken();
  const controller = new AbortController();
  let idleTimer;
  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), 45000);
  };
  resetIdleTimer();

  let response;
  try {
    response = await fetch(WRITE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ messages, profile: ideaProfile, ideaContext: ideaCtx }),
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


const REDIRECT_MARKER = '[[REDIRECT_TO_IDEA_CHAT]]';
const IDEA_READY_MARKER = '[[IDEA_READY]]';
const SUMMARY_MARKER = '[[SCRIPT_SUMMARY]]';

let history = [];
let profile = null;
let onboardingStep = null;
let draftProfile = {};
let started = false;
let ideaContext = null;

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
const NOT_SURE_FORMAT_CHOICE = 'לא בטוח/ה 🤔 כמה אפשרויות בבקשה';

function askFormat() {
  addChoiceBubble(messagesEl(), 'איזה פורמט הכי מתאים לתסריט הזה?', [...FORMAT_CHOICES, NOT_SURE_FORMAT_CHOICE], (choice) => {
    if (choice === NOT_SURE_FORMAT_CHOICE) {
      // תור השיחה שולח את זה כאילו המשתמש/ת עצמו/ה כתב/ה אותו (role='user',
      // מוצג כבועת-צ'אט על המסך) - "תציעי" קשיח לא התאים כשגבר יראה משפט
      // שנטען כאילו הוא כתב אותו עם פנייה בלשון נקבה ל-AI.
      const suggestVerb = profile.pronoun === 'אתה' ? 'תציע' : 'תציעי';
      sendMessage(`לא בטוח/ה איזה פורמט הכי מתאים לרעיון הזה - ${suggestVerb} כמה אפשרויות שיתאימו, עם הסבר קצר לכל אחת למה היא מתאימה, ואז אבחר.`);
      return;
    }
    sendMessage(`הפורמט שבחרתי: ${choice}`);
  });
}

async function sendMessage(text) {
  const input = document.getElementById('script-input');
  const newScriptBtn = document.getElementById('new-script-btn');
  input.disabled = true;
  newScriptBtn.disabled = true;
  history.push({ role: 'user', content: text });
  const thinkingBubble = addThinkingBubble(messagesEl());

  try {
    // Same iOS Safari "Load failed" mid-stream retry as idea-chat.js's
    // sendIdeaMessage - a single retry catches most transient drops.
    let finalReply;
    for (let attempt = 1; ; attempt++) {
      let liveText = '';
      try {
        if (attempt > 1) setBubbleText(thinkingBubble, '');
        finalReply = await streamWriteScript(history, profile, ideaContext, (delta) => {
          liveText += delta;
          setBubbleText(thinkingBubble, liveText);
          messagesEl().scrollTop = messagesEl().scrollHeight;
        });
        break;
      } catch (err) {
        const hasHebrewText = /[֐-׿]/.test(err.message || '');
        if (hasHebrewText || attempt >= 2) throw err;
        console.error(`writeScript stream failed, retrying (attempt ${attempt}):`, err);
      }
    }

    let reply = finalReply;

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
    const hasHebrewText = /[֐-׿]/.test(err.message || '');
    setBubbleText(thinkingBubble, hasHebrewText ? err.message : 'החיבור נכשל, כנראה בגלל רשת לא יציבה. נסו שוב.');
  } finally {
    input.disabled = false;
    newScriptBtn.disabled = false;
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
