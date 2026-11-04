/* הפופאפים של העוזר: חלון מעל המסך הנוכחי, מוצמד ל-body.

   04/11/2026 (מאיה: "ממש מעצבן שכשנכנסים לחלונית של התסריטים שלי אפילו
   קליק הכי קטן במסך והחלונית כל שניה נסגרת"). לחיצה על הרקע סגרה את
   החלון, וגם סימון טקסט שהתחיל בתוך התיבה ונגמר מחוץ לה נספר כלחיצה על
   הרקע. חלון שעובדים בתוכו (backdropClose: false) נסגר רק ב-✕ או ב-Escape,
   ו-beforeClose יכול לעצור את הסגירה, למשל כשיש שינויים שלא נשמרו. */

export function openModal(innerHtml, { backdropClose = true, beforeClose = null } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'cosmic-modal-overlay';
  overlay.id = 'va-modal-overlay';
  overlay.innerHTML = `<div class="cosmic-modal">
    <button type="button" class="cosmic-modal-close" id="va-modal-close" aria-label="סגירה">✕</button>
    ${innerHtml}
  </div>`;
  let asking = false;
  overlay.vaTryClose = async () => {
    if (asking) return;
    if (beforeClose) {
      asking = true;
      let ok = false;
      try { ok = await beforeClose(); } finally { asking = false; }
      if (!ok) return;
    }
    closeModal();
  };
  if (backdropClose) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  /* 29/10/2026 (מאיה: "נכנסתי לתסריטים ולא נותן לי ללחוץ X"). שתי לחיצות על
     הכפתור פתחו שני חלונות עם אותו id, וה-X של העליון היה מחובר לחלון
     התחתון. עכשיו כל X מחובר לחלון שלו, והסגירה מורידה את כולם. */
  overlay.querySelector('.cosmic-modal-close').addEventListener('click', () => overlay.vaTryClose());
  return overlay;
}

export function closeModal() {
  document.querySelectorAll('.cosmic-modal-overlay').forEach((o) => o.remove());
}

/** Escape: כמו ✕ של החלון העליון, כולל השאלה על שינויים שלא נשמרו. */
export function requestCloseModal() {
  const all = document.querySelectorAll('.cosmic-modal-overlay');
  const top = all[all.length - 1];
  if (top && top.vaTryClose) top.vaTryClose();
  else closeModal();
}
