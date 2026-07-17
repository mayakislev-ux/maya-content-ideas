// Speech-to-text for chat inputs via the browser's built-in Web Speech API
// (SpeechRecognition). No server round-trip, no extra dependency - but only
// available in Chromium-based browsers (Chrome/Edge) and Safari; feature-detected
// below, and the mic button simply stays hidden where it isn't supported.

const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;

// How long to wait after the last speech result before treating the pause
// as "done talking" and stopping automatically - continuous mode otherwise
// keeps the mic open (and the pulsing red button on) indefinitely until the
// browser eventually times it out on its own, which reads as "stuck".
const SILENCE_TIMEOUT_MS = 2500;

export function voiceInputSupported() {
  return Boolean(SpeechRecognitionImpl);
}

/**
 * Wires a mic button to append live speech-to-text into a textarea.
 * @param {{buttonId: string, textareaId: string}} opts
 * @returns {{ stop: () => void }} - stop() force-ends any in-progress
 *   recognition; callers should invoke it when the message is actually sent,
 *   otherwise a still-running recognition session can keep writing
 *   transcribed text into the textarea (or re-triggering the mic's "active"
 *   state) after the message it belonged to has already gone out.
 */
export function wireVoiceInput({ buttonId, textareaId }) {
  const button = document.getElementById(buttonId);
  const textarea = document.getElementById(textareaId);
  if (!button || !textarea) return { stop: () => {} };
  if (!voiceInputSupported()) {
    button.hidden = true;
    return { stop: () => {} };
  }
  button.hidden = false;

  let recognition = null;
  let listening = false;
  let baseText = '';
  let silenceTimer = null;

  function clearSilenceTimer() {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  function stopListening() {
    listening = false;
    clearSilenceTimer();
    button.classList.remove('mic-btn-active');
    if (recognition) recognition.stop();
  }

  function armSilenceTimer() {
    clearSilenceTimer();
    silenceTimer = setTimeout(stopListening, SILENCE_TIMEOUT_MS);
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
    armSilenceTimer();

    recognition.onresult = (event) => {
      armSilenceTimer();
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
      clearSilenceTimer();
      button.classList.remove('mic-btn-active');
    };

    try {
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      stopListening();
    }
  });

  return { stop: stopListening };
}
