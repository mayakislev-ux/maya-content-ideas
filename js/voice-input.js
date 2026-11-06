// Speech-to-text for text boxes (idea-check chat, video assistant boxes).
//
// שני מנועים:
//   'speech' - זיהוי הדיבור של הדפדפן (SpeechRecognition). חי, בלי שרת.
//              כרום/אדג' במחשב ובאנדרואיד.
//   'record' - הקלטה (MediaRecorder) ותמלול בשרת (transcribeDictation).
//
// 06/11/2026 (מאיה): "בחלק של כתיבת הרעיון עצמו יש מיקרופון הוא כאילו לא
// עובד". הסיבות האמיתיות, מהקוד:
//   1. באייפון (כל דפדפן באייפון הוא ספארי מבפנים) webkitSpeechRecognition
//      קיים, ולכן הכפתור הופיע, אבל באפליקציה שמותקנת במסך הבית הוא לא
//      עובד: נכשל עם service-not-allowed / not-allowed, או פשוט לא מחזיר
//      כלום. השגיאה הוצגה כ"בדקו הרשאות מיקרופון", כשההרשאה בכלל תקינה.
//   2. טיימר השקט (2.5 שניות) הופעל כבר בלחיצה, לפני שהמנוע עלה ולפני
//      חלון ההרשאה. מי שלא התחיל לדבר תוך 2.5 שניות, ההקלטה נעצרה לה
//      בשקט, עוד לפני המילה הראשונה. "כאילו לא עובד".
// התיקון: באייפון ובאייפד מקליטים ומתמללים בשרת, וזה עובד גם באפליקציה
// המותקנת. בשאר הדפדפנים נשאר הזיהוי החי, הטיימר מתחיל רק מהמילה
// הראשונה, ושגיאת שירות עוברת אוטומטית להקלטה במקום להיתקע.
import { showToast } from './toast.js';
import { app, auth, functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { getStorage, ref, uploadBytesResumable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { pickMimeType, cleanAudioType, extensionFor, recorderSupported } from './idea-recorder.js';

const BUCKET = 'gs://content-ideas-becd7-story-assets';
const transcribeDictation = httpsCallable(functions, 'transcribeDictation', { timeout: 120000 });

// How long to wait after the last speech result before treating the pause
// as "done talking" and stopping automatically.
const SILENCE_TIMEOUT_MS = 3500;
/* 06/11/2026: עד המילה הראשונה מחכים הרבה יותר. כולל חלון ההרשאה. */
const FIRST_WORD_TIMEOUT_MS = 12000;
/* הכתבה, לא הקלטה ארוכה: עד 3 דקות, ואז עוצרים ומתמללים */
export const MAX_DICTATION_SECONDS = 180;

// Errors that mean the live session truly cannot continue.
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported']);
/* שגיאות שאומרות "שירות הזיהוי של הדפדפן לא זמין" ולא "אין מיקרופון":
   עוברים להקלטה ותמלול בשרת. */
const SERVICE_ERRORS = new Set(['service-not-allowed', 'language-not-supported', 'network']);
const MAX_CONSECUTIVE_RESTARTS = 6;

function speechImpl(win) {
  return (win && (win.SpeechRecognition || win.webkitSpeechRecognition)) || null;
}

/** אייפון/אייפד (גם אייפד שמציג את עצמו כמק). כל דפדפן שם הוא WebKit. */
export function isAppleTouch(nav) {
  if (!nav) return false;
  const ua = String(nav.userAgent || '');
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && Number(nav.maxTouchPoints) > 1;
}

/** איזה מנוע: 'speech', 'record' או 'none'. */
export function dictationMode(win = globalThis.window) {
  const canRecord = recorderSupported(win);
  if (win && isAppleTouch(win.navigator) && canRecord) return 'record';
  if (speechImpl(win)) return 'speech';
  return canRecord ? 'record' : 'none';
}

export function voiceInputSupported() {
  return dictationMode() !== 'none';
}

/* ---------- הקלטה ותמלול בשרת ---------- */

function uploadDictation(blob) {
  const type = cleanAudioType(blob.type);
  const uid = auth.currentUser && auth.currentUser.uid;
  if (!uid) return Promise.reject(new Error('צריך להתחבר מחדש כדי להקליט'));
  const path = `transcribeUploads/${uid}/d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${extensionFor(type)}`;
  const task = uploadBytesResumable(ref(getStorage(app, BUCKET), path), blob, { contentType: type });
  return new Promise((resolve, reject) => {
    task.on('state_changed', () => {}, reject, () => resolve(path));
  });
}

/** ההודעה שמוצגת על כישלון: עברית מהשרת כמו שהיא, ואחרת הסבר ברור. */
function dictationErrorText(err) {
  const msg = String((err && err.message) || '');
  if (/[֐-׿]/.test(msg)) return msg;
  return 'התמלול לא עבר הפעם. אפשר ללחוץ שוב על המיקרופון ולנסות, או לכתוב';
}

/**
 * Wires a mic button to fill a textarea from speech.
 * @param {{buttonId: string, textareaId: string, onText?: (textarea: HTMLTextAreaElement) => void, hintIfUnsupported?: boolean, onState?: (state: string) => void}} opts
 *   onText: נקרא אחרי כל עדכון של הטקסט מהדיבור (05/11/2026: בעוזר לסרטון
 *   התיבות נשמרות ונמדדות לפי אירועי input, ושינוי value מקוד לא מפעיל אותם).
 *   hintIfUnsupported: false = רק להסתיר את הכפתור, בלי שורת ההסבר.
 *   onState: 'idle' | 'listening' | 'recording' | 'transcribing' (06/11/2026,
 *   כדי שהכפתור יגיד מה קורה ולא ייראה תקוע בזמן התמלול).
 * @returns {{ stop: () => void, mode: () => string }} - stop() force-ends any
 *   in-progress recognition/recording; callers invoke it when the message is
 *   actually sent, otherwise late text could land in the cleared textarea.
 */
export function wireVoiceInput({ buttonId, textareaId, onText = null, hintIfUnsupported = true, onState = null }) {
  const button = document.getElementById(buttonId);
  const textarea = document.getElementById(textareaId);
  if (!button || !textarea) return { stop: () => {}, mode: () => 'none' };
  let mode = dictationMode(window);
  if (mode === 'none') {
    button.hidden = true;
    if (!hintIfUnsupported) return { stop: () => {}, mode: () => 'none' };
    // חיווי קטן וחד-פעמי כדי שמי שמצפה למיקרופון תדע שהיא לא "מפספסת"
    // משהו - זו לא בעיה חוסמת, תמיד אפשר לכתוב.
    if (!document.getElementById(`${textareaId}-voice-unsupported-hint`)) {
      const hint = document.createElement('p');
      hint.id = `${textareaId}-voice-unsupported-hint`;
      hint.className = 'voice-input-unsupported-hint';
      hint.textContent = 'הקלטה קולית לא זמינה בדפדפן הזה - אפשר לכתוב';
      textarea.insertAdjacentElement('afterend', hint);
    }
    return { stop: () => {}, mode: () => 'none' };
  }
  button.hidden = false;

  let state = 'idle';
  function setState(next) {
    state = next;
    button.classList.toggle('mic-btn-active', next === 'listening' || next === 'recording');
    button.classList.toggle('mic-btn-busy', next === 'transcribing');
    button.disabled = next === 'transcribing';
    button.setAttribute('aria-busy', next === 'transcribing' ? 'true' : 'false');
    if (onState) onState(next);
  }

  function writeText(text) {
    textarea.value = text;
    if (onText) onText(textarea);
  }

  /* ---------- מנוע 'speech' ---------- */
  let recognition = null;
  let listening = false;
  let baseText = '';
  let silenceTimer = null;
  let consecutiveRestarts = 0;
  let heardSomething = false;

  function clearSilenceTimer() {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  function stopListening() {
    listening = false;
    clearSilenceTimer();
    if (state === 'listening') setState('idle');
    if (recognition) {
      try { recognition.stop(); } catch { /* כבר נעצר */ }
    }
  }

  function armSilenceTimer(ms) {
    clearSilenceTimer();
    silenceTimer = setTimeout(stopListening, ms);
  }

  function switchToRecording() {
    stopListening();
    if (!recorderSupported(window)) {
      showToast('זיהוי הדיבור לא זמין בדפדפן הזה כרגע. אפשר לכתוב');
      return;
    }
    mode = 'record';
    showToast('נעבור להקלטה: לחצו שוב על המיקרופון, דברו, ולחצו שוב כשמסיימים');
  }

  function startSession() {
    const Impl = speechImpl(window);
    recognition = new Impl();
    recognition.lang = 'he-IL';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      consecutiveRestarts = 0;
      heardSomething = true;
      armSilenceTimer(SILENCE_TIMEOUT_MS);
      let finalText = '';
      let interimText = '';
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript;
        else interimText += transcript;
      }
      writeText(baseText + finalText + interimText);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (SERVICE_ERRORS.has(event.error) && !heardSomething) {
        switchToRecording();
        return;
      }
      if (FATAL_ERRORS.has(event.error)) {
        stopListening();
        showToast(event.error === 'not-allowed' || event.error === 'audio-capture'
          ? 'אין גישה למיקרופון. צריך לאשר גישה למיקרופון בהגדרות הדפדפן ולנסות שוב'
          : 'זיהוי הדיבור לא זמין כרגע. אפשר לכתוב');
      }
      // Anything else (no-speech, aborted) - onend below decides whether to restart.
    };

    recognition.onend = () => {
      if (!listening) {
        if (state === 'listening') setState('idle');
        return;
      }
      consecutiveRestarts++;
      if (consecutiveRestarts > MAX_CONSECUTIVE_RESTARTS) {
        stopListening();
        showToast('ההקלטה נתקעה, נסו ללחוץ שוב על המיקרופון');
        return;
      }
      baseText = textarea.value ? `${textarea.value} ` : '';
      startSession();
    };

    try {
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      switchToRecording();
    }
  }

  function startListening() {
    baseText = textarea.value ? `${textarea.value} ` : '';
    listening = true;
    heardSomething = false;
    consecutiveRestarts = 0;
    setState('listening');
    /* עד המילה הראשונה מחכים הרבה, ורק אחריה טיימר השקט הקצר */
    armSilenceTimer(FIRST_WORD_TIMEOUT_MS);
    startSession();
  }

  /* ---------- מנוע 'record' ---------- */
  let stream = null;
  let recorder = null;
  let chunks = [];
  let limitTimer = null;
  let starting = false;
  /* כל הקלטה מקבלת מספר. stop() מקדם אותו, ותמלול שחוזר אחרי זה נזרק. */
  let take = 0;

  function releaseMic() {
    if (limitTimer) clearTimeout(limitTimer);
    limitTimer = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  async function startRecording() {
    if (starting) return;
    starting = true;
    try {
      /* 06/11/2026: אם בזמן חלון ההרשאה נשלחה הודעה או עברו מסך, stop()
         מקדם את take. בלי הבדיקה הזו ההקלטה הייתה מתחילה בכל זאת. */
      const takeAtStart = take;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (take !== takeAtStart) { releaseMic(); return; }
      } catch (err) {
        console.warn('dictation: mic denied', err && err.name);
        showToast('אין גישה למיקרופון. צריך לאשר גישה למיקרופון בהגדרות הדפדפן ולנסות שוב');
        return;
      }
      const mimeType = pickMimeType((t) => window.MediaRecorder.isTypeSupported(t));
      try {
        recorder = new window.MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 48000 } : undefined);
      } catch {
        try {
          recorder = new window.MediaRecorder(stream);
        } catch (err) {
          console.warn('dictation: MediaRecorder failed', err);
          releaseMic();
          showToast('ההקלטה לא נפתחה במכשיר הזה. אפשר לכתוב בינתיים בטקסט');
          return;
        }
      }
      chunks = [];
      const myTake = ++take;
      const rec = recorder;
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        const type = rec.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type });
        chunks = [];
        recorder = null;
        releaseMic();
        if (myTake !== take) return; // בוטל (נשלחה הודעה / עברו מסך)
        transcribe(blob, myTake);
      };
      rec.start(1000);
      setState('recording');
      limitTimer = setTimeout(() => {
        showToast('ההקלטה נעצרה אחרי 3 דקות, מתמללים');
        finishRecording();
      }, MAX_DICTATION_SECONDS * 1000);
    } finally {
      starting = false;
    }
  }

  function finishRecording() {
    if (recorder && recorder.state !== 'inactive') {
      setState('transcribing');
      recorder.stop();
    }
  }

  async function transcribe(blob, myTake) {
    if (!blob.size) {
      setState('idle');
      showToast('ההקלטה יצאה ריקה. ללחוץ על המיקרופון ולדבר שוב');
      return;
    }
    setState('transcribing');
    const before = textarea.value;
    try {
      const path = await uploadDictation(blob);
      if (myTake !== take) return;
      const res = await transcribeDictation({ path });
      if (myTake !== take) return;
      const text = String((res && res.data && res.data.text) || '').trim();
      if (!text) {
        showToast('לא שמענו דיבור בהקלטה. ללחוץ על המיקרופון ולדבר שוב');
        return;
      }
      /* מה שהוקלד בזמן התמלול נשאר, והטקסט מצטרף אחריו */
      const current = textarea.value || before;
      writeText(current ? `${current.replace(/\s+$/, '')} ${text}` : text);
    } catch (err) {
      console.error('transcribeDictation failed:', err);
      if (myTake === take) showToast(dictationErrorText(err));
    } finally {
      if (myTake === take) setState('idle');
    }
  }

  function cancelRecording() {
    take += 1;
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { /* כבר נעצר */ }
    }
    recorder = null;
    releaseMic();
    if (state === 'recording' || state === 'transcribing') setState('idle');
  }

  button.addEventListener('click', () => {
    if (mode === 'record') {
      if (state === 'transcribing') return;
      if (state === 'recording') finishRecording();
      else startRecording();
      return;
    }
    if (listening) {
      stopListening();
      return;
    }
    startListening();
  });

  return {
    stop: () => { stopListening(); cancelRecording(); },
    mode: () => mode,
  };
}
