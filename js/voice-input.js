// Speech-to-text for chat inputs via the browser's built-in Web Speech API
// (SpeechRecognition). No server round-trip, no extra dependency - but only
// available in Chromium-based browsers (Chrome/Edge) and Safari; feature-detected
// below, and the mic button simply stays hidden where it isn't supported.
import { showToast } from './toast.js';

const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;

// How long to wait after the last speech result before treating the pause
// as "done talking" and stopping automatically - continuous mode otherwise
// keeps the mic open (and the pulsing red button on) indefinitely until the
// browser eventually times it out on its own, which reads as "stuck".
const SILENCE_TIMEOUT_MS = 2500;

// Errors that mean the session truly cannot continue (permission/hardware) -
// anything else (most commonly 'no-speech', which Chrome fires surprisingly
// often even mid-sentence during a short natural pause, and 'aborted'/
// 'network' blips) gets a silent, seamless restart instead of cutting the
// recording off. A hard stop on every error was very likely the real cause
// behind "doesn't always recognize well" - it wasn't transcription accuracy,
// it was the session ending mid-sentence and silently dropping the rest.
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture']);
const MAX_CONSECUTIVE_RESTARTS = 6;

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
  let consecutiveRestarts = 0;

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

  function startSession() {
    recognition = new SpeechRecognitionImpl();
    recognition.lang = 'he-IL';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      consecutiveRestarts = 0;
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
      if (FATAL_ERRORS.has(event.error)) {
        stopListening();
        showToast('לא הצלחתי לגשת למיקרופון - בדקו הרשאות מיקרופון בדפדפן');
      }
      // Anything else (no-speech, aborted, network) - let onend below decide
      // whether to restart; still "listening" as far as user intent goes.
    };

    recognition.onend = () => {
      button.classList.remove('mic-btn-active');
      if (!listening) return; // stopListening() already ran - a real, intended stop.

      // The engine ended the session on its own while the user still wants
      // to keep talking - carry forward whatever was already transcribed
      // and start a fresh session seamlessly, instead of losing the rest of
      // the sentence.
      consecutiveRestarts++;
      if (consecutiveRestarts > MAX_CONSECUTIVE_RESTARTS) {
        listening = false;
        clearSilenceTimer();
        showToast('ההקלטה נתקעה, נסו ללחוץ שוב על המיקרופון');
        return;
      }
      baseText = textarea.value ? `${textarea.value} ` : '';
      button.classList.add('mic-btn-active');
      startSession();
    };

    try {
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      stopListening();
    }
  }

  button.addEventListener('click', () => {
    if (listening) {
      stopListening();
      return;
    }

    baseText = textarea.value ? `${textarea.value} ` : '';
    listening = true;
    consecutiveRestarts = 0;
    button.classList.add('mic-btn-active');
    armSilenceTimer();
    startSession();
  });

  return { stop: stopListening };
}
