import { functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

const checkIdea = httpsCallable(functions, 'checkIdea');

let history = [];

function addBubble(text, role) {
  const messagesEl = document.getElementById('chat-messages');
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble chat-bubble-${role}`;
  bubble.textContent = text;
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

export function wireIdeaChat() {
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.disabled = true;
    addBubble(text, 'user');
    history.push({ role: 'user', content: text });

    const thinkingBubble = addBubble('חושבת...', 'assistant');

    try {
      const result = await checkIdea({ messages: history });
      const reply = result.data.reply;
      thinkingBubble.textContent = reply;
      history.push({ role: 'assistant', content: reply });
    } catch (err) {
      console.error('checkIdea failed:', err);
      thinkingBubble.textContent = 'משהו השתבש, נסי שוב בבקשה.';
    } finally {
      input.disabled = false;
      input.focus();
    }
  });
}
