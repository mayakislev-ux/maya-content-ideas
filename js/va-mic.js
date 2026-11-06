/* 05/11/2026 (מאיה): מיקרופון בתיבות הכתיבה הארוכות של העוזר: מגילת
   אסתר (כתיבה מאפס ושכפול) ו"על מה הסרטון?". הרבה יותר קל לספר בקול מאשר
   להקליד מגילה של 120 מילים בטלפון.

   אותו מנגנון כמו בצ'אט של בדיקת רעיון (voice-input.js). 06/11/2026: באייפון
   מקליטים ומתמללים בשרת, כי זיהוי הדיבור של הדפדפן לא עובד שם. בדפדפן בלי
   זיהוי דיבור ובלי הקלטה הכפתור פשוט לא מופיע, וכותבים כרגיל. */
import { wireVoiceInput, voiceInputSupported } from './voice-input.js';

let live = [];

/** עוצר מיקרופון שעוד פתוח ממסך קודם */
export function stopMics() {
  live.forEach((m) => m.stop());
  live = [];
}

/**
 * מוסיף מתחת לתיבה כפתור "🎤 לדבר במקום לכתוב". מחזיר את הכפתור, או null
 * כשאין תיבה. בלי תמיכה בדפדפן הכפתור נשאר מוסתר.
 */
export function attachMic(textareaId) {
  const textarea = document.getElementById(textareaId);
  if (!textarea) return null;
  stopMics();
  const buttonId = `${textareaId}-mic`;
  if (document.getElementById(buttonId)) return document.getElementById(buttonId);
  const row = document.createElement('div');
  row.className = 'va-mic-row';
  row.innerHTML = `<button type="button" class="va-mic-btn" id="${buttonId}" aria-label="הקלטה קולית: לדבר במקום לכתוב" hidden><span aria-hidden="true">🎤</span><span class="va-mic-btn__label">לדבר במקום לכתוב</span></button>`;
  textarea.insertAdjacentElement('afterend', row);
  const button = row.querySelector('button');
  if (!voiceInputSupported()) {
    row.hidden = true;
    return button;
  }
  const label = button.querySelector('.va-mic-btn__label');
  /* 06/11/2026: באייפון ההקלטה עוברת תמלול בשרת, וזה לוקח כמה שניות. הכפתור
     אומר מה קורה בכל רגע, ולא נראה תקוע. */
  const LABELS = {
    idle: 'לדבר במקום לכתוב',
    listening: 'מקליטים... לעצור',
    recording: 'מקליטים... ללחוץ כשמסיימים',
    transcribing: 'מתמללים...',
  };
  const handle = wireVoiceInput({
    buttonId,
    textareaId,
    hintIfUnsupported: false,
    onState: (st) => { label.textContent = LABELS[st] || LABELS.idle; },
    onText: (el) => {
      /* המסך התחלף באמצע הקלטה: לא כותבים לתיבה שכבר לא על המסך */
      if (!el.isConnected) { handle.stop(); return; }
      /* כמו הקלדה: הטיוטה נשמרת, ומד המילים של המגילה מתעדכן */
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
  });
  live.push(handle);
  return button;
}
