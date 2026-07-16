// Shared chat-bubble rendering, used by both idea-chat.js and script-chat.js
// so URL/bold-text handling, the "thinking" indicator, and choice buttons stay
// in exactly one place instead of drifting between two near-identical copies.

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;
const TRAILING_PUNCT = /[.,)\]'"”’״׳]+$/;
const BOLD_PATTERN = /\*\*(.+?)\*\*/g;

function appendWithBold(container, text) {
  const parts = text.split(BOLD_PATTERN);
  parts.forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) {
      const strong = document.createElement('strong');
      strong.textContent = part;
      container.appendChild(strong);
    } else {
      container.appendChild(document.createTextNode(part));
    }
  });
}

/**
 * @param {HTMLElement} bubble
 * @param {string} text
 * @param {{label: string, url: string, onClick: () => void}[]} [specialLinks] -
 *   URLs that should render as a labeled CTA button instead of a plain link
 *   (e.g. the roadmap link in idea-chat). Matched by exact URL after
 *   stripping trailing punctuation.
 */
export function setBubbleText(bubble, text, specialLinks = []) {
  bubble.innerHTML = '';
  const parts = text.split(URL_PATTERN);
  for (const part of parts) {
    if (part.match(URL_PATTERN)) {
      // The AI doesn't always put a space before trailing punctuation after a
      // URL (e.g. "...html." or markdown-style "...html)") - the URL_PATTERN
      // regex then swallows that punctuation into the "URL" itself, breaking
      // both the special-link equality check below and the href itself.
      // Strip it back off and render it as plain text after the link.
      const trailingMatch = part.match(TRAILING_PUNCT);
      const trailing = trailingMatch ? trailingMatch[0] : '';
      const cleanUrl = trailing ? part.slice(0, -trailing.length) : part;

      const special = specialLinks.find((s) => s.url === cleanUrl);
      if (special) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chat-cta-btn';
        btn.textContent = special.label;
        btn.addEventListener('click', special.onClick);
        bubble.appendChild(btn);
      } else {
        const link = document.createElement('a');
        link.href = cleanUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = cleanUrl;
        bubble.appendChild(link);
      }
      if (trailing) bubble.appendChild(document.createTextNode(trailing));
    } else if (part) {
      appendWithBold(bubble, part);
    }
  }
}

export function addBubble(messagesEl, text, role, specialLinks = []) {
  const row = document.createElement('div');
  row.className = `chat-row chat-row-${role}`;

  if (role === 'assistant') {
    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.textContent = '🤖';
    row.appendChild(avatar);
  }

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble chat-bubble-${role}`;
  setBubbleText(bubble, text, specialLinks);
  row.appendChild(bubble);

  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

export function addThinkingBubble(messagesEl) {
  const row = document.createElement('div');
  row.className = 'chat-row chat-row-assistant';

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar';
  avatar.textContent = '🤖';
  row.appendChild(avatar);

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble chat-bubble-assistant';
  bubble.innerHTML = '<span class="chat-thinking-dots"><span></span><span></span><span></span></span>';
  row.appendChild(bubble);

  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

export function addChoiceBubble(messagesEl, text, choices, onPick) {
  const row = document.createElement('div');
  row.className = 'chat-row chat-row-assistant';

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar';
  avatar.textContent = '🤖';
  row.appendChild(avatar);

  const wrap = document.createElement('div');
  wrap.className = 'chat-bubble chat-bubble-assistant chat-choice-bubble';

  const label = document.createElement('div');
  label.textContent = text;
  wrap.appendChild(label);

  const btnRow = document.createElement('div');
  btnRow.className = 'chat-choice-buttons';
  for (const choice of choices) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-choice-btn';
    btn.textContent = choice;
    btn.addEventListener('click', () => {
      btnRow.querySelectorAll('button').forEach((b) => (b.disabled = true));
      addBubble(messagesEl, choice, 'user');
      onPick(choice);
    });
    btnRow.appendChild(btn);
  }
  wrap.appendChild(btnRow);
  row.appendChild(wrap);

  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

export function playSuccessSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.1;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  } catch (err) {
    console.error('playSuccessSound failed:', err);
  }
}
