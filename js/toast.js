export function showToast(message, { actionLabel, onAction, duration = 5000 } = {}) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  const text = document.createElement('span');
  text.textContent = message;
  toast.appendChild(text);

  let timer = null;
  const remove = () => {
    clearTimeout(timer);
    toast.remove();
  };

  if (actionLabel && onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action-btn';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => {
      /* 07/11/2026: "בטלו" שנכשל בשקט נראה כאילו הצליח. כל פעולה כזאת
         שנכשלת (חיבור, הרשאה) מקבלת הודעה גלויה. */
      const failed = (err) => {
        console.error('toast action failed:', err);
        showToast('הביטול לא הצליח, בדקו חיבור ונסו שוב');
      };
      remove();
      try {
        const r = onAction();
        if (r && typeof r.then === 'function') r.then(undefined, failed);
      } catch (err) {
        failed(err);
      }
    });
    toast.appendChild(btn);
  }

  document.body.appendChild(toast);
  timer = setTimeout(remove, duration);
  return remove;
}
