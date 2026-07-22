import { functions, auth } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { getProfile, saveProfile } from './user-profile.js';
import { showView } from './view-router.js';
import { openAddModal, openEditModal } from './idea-form.js';
import { getCurrentIdeas } from './archive-view.js';
import { findSimilarIdea } from './ideas-logic.js';
import { showWelcomeTour } from './welcome-tour.js';
import { addBubble, addThinkingBubble, addChoiceBubble, setBubbleText, playSuccessSound } from './chat-ui.js';
import { wireVoiceInput } from './voice-input.js';
import { burstConfetti } from './confetti.js';
// Dynamically imported instead of a static top-level import - script-chat.js
// (and the admin-only writeScript feature it drives) is otherwise dead
// weight fetched by every single user of this file, even though the button
// that actually calls it only ever renders for the admin (isAdmin() below).

const ADMIN_EMAIL = 'mayakislev@gmail.com';
const checkIdea = httpsCallable(functions, 'checkIdea');

function isAdmin() {
  return auth.currentUser && auth.currentUser.email === ADMIN_EMAIL;
}

export const ONBOARDING_STEPS = ['name', 'pronoun', 'business', 'primaryAudience', 'secondaryAudience'];
export const ONBOARDING_QUESTIONS = {
  name: 'קודם כל - עם מי אני מדברת? מה השם שלך?',
  business: 'מה העסק שלך? באיזה תחום את/ה עוסק/ת?',
  primaryAudience: 'מי קהל היעד העיקרי שלך?',
  secondaryAudience: 'ומי קהל היעד המשני שלך (אם יש)?',
};

let history = [];
let profile = null;
let onboardingStep = null;
let draftProfile = {};
let started = false;
let originalIdeaText = null;
let lastIdeaSummary = null;
// Set when the chat was opened directly from an existing idea's "בדיקה
// חוזרת" button - saveFinalIdea then updates that exact idea instead of
// relying on fuzzy title-matching (or asking via a confirm() dialog) to
// guess which idea the finished chat belongs to.
let editingIdeaId = null;
// The idea text to auto-send as the first message once the chat is ready
// (profile loaded, onboarding done if needed) - set by
// startIdeaChatWithExistingIdea, consumed by greetAndAskForIdea.
let pendingIdeaToCheck = null;

const RECOGNIZED_MARKER = '[[RECOGNIZED_EXCELLENT]]';
const SUMMARY_MARKER = '[[IDEA_SUMMARY]]';
const ROADMAP_URL = 'https://mayakislev-ux.github.io/lehiyot-brand/מפת-דרכים-ליצירת-תוכן.html';

function messagesEl() {
  return document.getElementById('chat-messages');
}

// A stale Firestore connection (e.g. the tab was backgrounded on mobile
// for a while and the realtime connection didn't cleanly resume) can leave
// getProfile() neither resolving nor rejecting - the "thinking" bubble then
// sits there forever with no error, no retry, nothing. Racing it against a
// timeout guarantees the user always gets SOME outcome instead of a
// permanently frozen "מקליד..." indicator.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

function extractIdeaSummary(reply) {
  const markerIndex = reply.indexOf(SUMMARY_MARKER);
  if (markerIndex === -1) return { visibleReply: reply, summary: null };

  const visibleReply = reply.slice(0, markerIndex).trim();
  // Take everything after the marker to the end of the message, not just the
  // first line - the marker is always the last thing in the reply, and
  // truncating at the first "\n" would silently corrupt the result if a
  // field (e.g. the story summary) ever contains an embedded line break.
  const rawTail = reply.slice(markerIndex + SUMMARY_MARKER.length).trim();
  const [idea, angle, story] = rawTail.split('||').map((part) => (part || '').trim());

  if (!idea) return { visibleReply, summary: null };

  let composedTitle = idea;
  if (angle) composedTitle += ` | זווית: ${angle}`;
  if (story) composedTitle += ` | סיפור: ${story}`;

  return { visibleReply, summary: composedTitle, idea, angle, story };
}

function saveFinalIdea(finalizedText) {
  showView('archive');

  if (editingIdeaId) {
    const idea = getCurrentIdeas().find((i) => i.id === editingIdeaId);
    editingIdeaId = null;
    if (idea) {
      openEditModal(idea, finalizedText);
      return;
    }
  }

  const match = findSimilarIdea(getCurrentIdeas(), originalIdeaText || '');
  if (match) {
    const wantsUpdate = confirm(`זיהיתי שזה כנראה עדכון לרעיון הקיים "${match.title}" - לעדכן אותו?\n\n(ביטול ← יצירת רעיון חדש בנפרד)`);
    if (wantsUpdate) {
      openEditModal(match, finalizedText);
      return;
    }
  }
  openAddModal(finalizedText);
}

function addPostIdeaButtons(bubble, finalizedText, ideaSummary) {
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'chat-cta-btn chat-save-btn';
  saveBtn.textContent = '💾 שמירה כרעיון';
  saveBtn.addEventListener('click', () => saveFinalIdea(finalizedText));
  bubble.appendChild(saveBtn);

  if (isAdmin() && ideaSummary) {
    const scriptBtn = document.createElement('button');
    scriptBtn.type = 'button';
    scriptBtn.className = 'chat-cta-btn';
    scriptBtn.textContent = '✍️ כתיבת תסריט על הרעיון הזה';
    scriptBtn.addEventListener('click', async () => {
      showView('script');
      const { startScriptChatWithIdea } = await import('./script-chat.js');
      startScriptChatWithIdea(ideaSummary);
    });
    bubble.appendChild(scriptBtn);
  }
}

function resetChat() {
  history = [];
  originalIdeaText = null;
  lastIdeaSummary = null;
  editingIdeaId = null;
  pendingIdeaToCheck = null;
  messagesEl().innerHTML = '';
  greetAndAskForIdea();
}

function askOnboardingStep(step) {
  const input = document.getElementById('chat-input');
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
  const registerVerb = profile.pronoun === 'אתה' ? 'רשום' : 'רשמי';
  addBubble(
    messagesEl(),
    `${profile.name}, ${registerVerb} לי מה הרעיון שלך ואדייק אותך.\n\n💡 טיפ: אם קשה לך להמציא רעיון מ-0 (וזה רוב האנשים!) - הכי מומלץ להתחיל משכפול רעיון וזווית הנגשה שראית ברשת ומצאו חן בעיניך. ככה לא צריך לשבור את הראש על רעיון חדש, לא צריך לחשוב לבד איך לצלם כי הפורמט כבר מוכח, וזה גם עוזר לפתח הבנה שיווקית של מה עובד. מדריך מלא לשכפול תוכן: https://docs.google.com/document/d/16E3UA0ukElNLcxHT_5C84XrWUZJ3iN0AVPD4BiNphx8/edit?tab=t.0`,
    'assistant'
  );
}

// Shared between the chat form's own submit handler and
// startIdeaChatWithExistingIdea (which auto-sends an existing idea's text
// as if the user had just typed and submitted it).
async function sendIdeaMessage(text) {
  const input = document.getElementById('chat-input');
  input.disabled = true;
  addBubble(messagesEl(), text, 'user');
  if (navigator.vibrate) navigator.vibrate(15);
  if (history.length === 0) originalIdeaText = text;
  history.push({ role: 'user', content: text });
  const thinkingBubble = addThinkingBubble(messagesEl());

  try {
    const result = await checkIdea({ messages: history, profile });
    let reply = result.data.reply;
    if (reply.startsWith(RECOGNIZED_MARKER)) {
      reply = reply.slice(RECOGNIZED_MARKER.length).trimStart();
      thinkingBubble.classList.add('chat-bubble-excellent');
      playSuccessSound();
      burstConfetti();
    }
    const { visibleReply, summary, idea, angle, story } = extractIdeaSummary(reply);
    const specialLinks = [
      { label: '🗺️ למפת הדרכים ליצירת תוכן', url: ROADMAP_URL, onClick: () => showView('roadmap') },
    ];
    setBubbleText(thinkingBubble, visibleReply, specialLinks);
    if (summary) {
      lastIdeaSummary = { idea, angle, story };
      addPostIdeaButtons(thinkingBubble, summary, lastIdeaSummary);
    } else if (visibleReply.includes(ROADMAP_URL)) {
      addPostIdeaButtons(thinkingBubble, visibleReply.split(ROADMAP_URL)[0].trim(), lastIdeaSummary);
    }
    messagesEl().scrollTop = messagesEl().scrollHeight;
    history.push({ role: 'assistant', content: visibleReply });
  } catch (err) {
    console.error('checkIdea failed:', err);
    setBubbleText(thinkingBubble, 'משהו השתבש, נסו שוב בבקשה.');
  } finally {
    input.disabled = false;
    input.focus();
  }
}

function startOnboarding() {
  addBubble(messagesEl(), 'לפני שנתחיל - יהיה עכשיו רצף קצר של כמה שאלות היכרות (חד-פעמי, לא אצטרך לשאול שוב בפעם הבאה).', 'assistant');
  onboardingStep = ONBOARDING_STEPS[0];
  askOnboardingStep(onboardingStep);
}

export async function startIdeaChat() {
  document.getElementById('edit-profile-btn').hidden = !isAdmin();
  document.getElementById('replay-tour-btn').hidden = !isAdmin();
  if (started) return;
  started = true;
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
    console.error('startIdeaChat failed:', err);
    loadingBubble.closest('.chat-row').remove();
    started = false;
    addBubble(messagesEl(), 'משהו השתבש בטעינת הצ\'אט (יכול לקרות אחרי שהאפליקציה הייתה ברקע זמן ארוך) - נסו לצאת וללחוץ שוב על "בדיקת רעיון", ואם זה חוזר - רעננו את הדף.', 'assistant');
  }
}

// Opened directly from an existing idea's "בדיקה חוזרת" button in the
// archive - starts a fresh chat, immediately sends that idea's own text as
// the first message (no need to retype/copy-paste it), and marks it so
// saveFinalIdea updates this exact idea instead of guessing by fuzzy title
// matching or asking via a confirm() popup.
export async function startIdeaChatWithExistingIdea(idea) {
  document.getElementById('edit-profile-btn').hidden = !isAdmin();
  document.getElementById('replay-tour-btn').hidden = !isAdmin();

  history = [];
  lastIdeaSummary = null;
  editingIdeaId = idea.id;
  pendingIdeaToCheck = idea.title;
  messagesEl().innerHTML = '';

  if (started && profile) {
    greetAndAskForIdea();
    return;
  }

  started = true;
  const loadingBubble = addThinkingBubble(messagesEl());
  try {
    profile = await withTimeout(getProfile(), 10000);
    loadingBubble.closest('.chat-row').remove();
    if (profile) {
      greetAndAskForIdea();
    } else {
      startOnboarding(); // finishOnboarding() -> greetAndAskForIdea() picks up pendingIdeaToCheck
    }
  } catch (err) {
    console.error('startIdeaChatWithExistingIdea failed:', err);
    loadingBubble.closest('.chat-row').remove();
    started = false;
    addBubble(messagesEl(), 'משהו השתבש בטעינת הצ\'אט - נסו לצאת וללחוץ שוב על "בדיקת רעיון".', 'assistant');
  }
}

export function wireIdeaChat() {
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const voiceInput = wireVoiceInput({ buttonId: 'chat-mic-btn', textareaId: 'chat-input' });

  document.getElementById('edit-profile-btn').addEventListener('click', () => {
    messagesEl().innerHTML = '';
    draftProfile = {};
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

    if (onboardingStep) {
      addBubble(messagesEl(), text, 'user');
      draftProfile[onboardingStep] = text;
      advanceOnboarding();
      return;
    }

    await sendIdeaMessage(text);
  });
}
