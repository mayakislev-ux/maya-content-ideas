// Speech-to-text for chat inputs via the browser's built-in Web Speech API
// (SpeechRecognition). No server round-trip, no extra dependency - but only
// available in Chromium-based browsers (Chrome/Edge) and Safari; feature-detected
// below, and the mic button simply stays hidden where it isn't supported.

const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;

export function voiceInputSupported() {
  return Boolean(SpeechRecognitionImpl);
}

/**
 * Wires a mic button to append live speech-to-text into a textarea.
 * @param {{buttonId: string, textareaId: string}} opts
 */
export function wireVoiceInput({ buttonId, textareaId }) {
  const button = document.getElementById(buttonId);
  const textarea = document.getElementById(textareaId);
  if (!button || !textarea) return;
  if (!voiceInputSupported()) {
    button.hidden = true;
    return;
  }
  button.hidden = false;

  let recognition = null;
  let listening = false;
  let baseText = '';

  function stopListening() {
    listening = false;
    button.classList.remove('mic-btn-active');
    if (recognition) recognition.stop();
  }

  button.addEventListener('click', () => {
    if (listening) {
      stopListening();
      return;
    }

    recognition = new SpeechRecognitionImpl();
    recognition.lang = 'he-IL';
    recognition.continuous = true;
    recognition.interimResults = true;

    baseText = textarea.value ? `${textarea.value} ` : '';
    listening = true;
    button.classList.add('mic-btn-active');

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript;
        else interimText += transcript;
      }
      textarea.value = baseText + finalText + interimText;
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      stopListening();
    };

    recognition.onend = () => {
      listening = false;
      button.classList.remove('mic-btn-active');
    };

    try {
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      stopListening();
    }
  });
}
