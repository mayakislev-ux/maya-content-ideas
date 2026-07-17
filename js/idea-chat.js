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
import { startScriptChatWithIdea } from './script-chat.js';

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

const RECOGNIZED_MARKER = '[[RECOGNIZED_EXCELLENT]]';
const SUMMARY_MARKER = '[[IDEA_SUMMARY]]';
const ROADMAP_URL = 'https://mayakislev-ux.github.io/lehiyot-brand/מפת-דרכים-ליצירת-תוכן.html';

function messagesEl() {
  return document.getElementById('chat-messages');
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
  const match = findSimilarIdea(getCurrentIdeas(), originalIdeaText || '');
  showView('archive');
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
    scriptBtn.addEventListener('click', () => {
      showView('script');
      startScriptChatWithIdea(ideaSummary);
    });
    bubble.appendChild(scriptBtn);
  }
}

function resetChat() {
  history = [];
  originalIdeaText = null;
  lastIdeaSummary = null;
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
  const registerVerb = profile.pronoun === 'אתה' ? 'רשום' : 'רשמי';
  addBubble(
    messagesEl(),
    `${profile.name}, ${registerVerb} לי מה הרעיון שלך ואדייק אותך.\n\n💡 טיפ: אם קשה לך להמציא רעיון מ-0 (וזה רוב האנשים!) - הכי מומלץ להתחיל משכפול רעיון וזווית הנגשה שראית ברשת ומצאו חן בעיניך. ככה לא צריך לשבור את הראש על רעיון חדש, לא צריך לחשוב לבד איך לצלם כי הפורמט כבר מוכח, וזה גם עוזר לפתח הבנה שיווקית של מה עובד. מדריך מלא לשכפול תוכן: https://docs.google.com/document/d/16E3UA0ukElNLcxHT_5C84XrWUZJ3iN0AVPD4BiNphx8/edit?tab=t.0`,
    'assistant'
  );
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
    profile = await getProfile();
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
  });
}
