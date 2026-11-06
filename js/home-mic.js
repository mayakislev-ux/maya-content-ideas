/* 06/11/2026 (מאיה, על המיקרופון מווריאציה 10 "מספרים ומוצאים"):
   "לדעתי הוא צריך להיות פשוט במסך הראשי ולא במסך הרעיונות".

   כפתור מיקרופון גדול במסך הבית שפותח את אותו מקליט בדיוק שנפתח
   מ"🎙️ לספר בקול ולמצוא רעיונות" בטופס רעיון חדש (js/idea-recorder.js).
   אין כאן הקלטה משלו: הרעיונות שנבחרים נשמרים במאגר כמו תמיד.

   מוצג רק כש-ideasRedesignFor (js/ideas-shelves.js) מאשר, ורק בדפדפן
   שיודע להקליט. */
import { openRecorder, recorderSupported } from './idea-recorder.js';

export function wireHomeMic() {
  const btn = document.getElementById('home-mic-card');
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', () => openRecorder());
}

export function setHomeMicVisible(on) {
  const btn = document.getElementById('home-mic-card');
  if (btn) btn.hidden = !(on && recorderSupported());
}
