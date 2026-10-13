// js/video-assistant-sound.js
// 13/10/2026 (מאיה: "מוזיקה וצלילים מגניבים"): בלי קבצי אודיו חיצוניים
// (רישוי, גודל קובץ, תלות ברשת) - צלילים מסונתזים ב-Web Audio API.
// בלי מוזיקת רקע רציפה (autoplay policies + מסיח בשימוש חוזר) - רק
// שני אפקטים קצרים: הגרלה (whoosh עולה) והצלחה (chime).
const MUTE_KEY = 'video-assistant-muted';
let ctx = null;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

function isMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(muted) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // localStorage חסום (מצב פרטי וכו') - פשוט לא נשמר, לא קריטי
  }
}

export function getMuted() {
  return isMuted();
}

function tone({ freq, duration, type = 'sine', sweepTo }) {
  if (isMuted()) return;
  const audio = getCtx();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audio.currentTime);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, audio.currentTime + duration);
  gain.gain.setValueAtTime(0.15, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + duration);
}

export function playReroll() {
  tone({ freq: 220, sweepTo: 440, duration: 0.25, type: 'sine' });
}

export function playSuccess() {
  tone({ freq: 523.25, duration: 0.18, type: 'sine' });
  setTimeout(() => tone({ freq: 783.99, duration: 0.22, type: 'sine' }), 120);
}
