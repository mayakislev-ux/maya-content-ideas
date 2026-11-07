import { db } from './firebase-init.js';
import { showToast } from './toast.js';
import {
  collection,
  addDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

/* 07/11/2026 (ביקורת): בלי חיבור, Firestore לא מחזיר תשובה לשליחה בכלל,
   והכפתור נראה כאילו לא קרה כלום. אחרי זמן כזה אומרים שזה לא הצליח. */
export const FEEDBACK_TIMEOUT_MS = 15000;

export function wireFeedbackForm({ timeoutMs = FEEDBACK_TIMEOUT_MS } = {}) {
  const form = document.getElementById('feedback-form');
  const input = document.getElementById('feedback-input');
  const success = document.getElementById('feedback-success');
  const submitBtn = form.querySelector('button[type="submit"]');
  let sending = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    /* 07/11/2026 (ביקורת): לחיצה כפולה שלחה את אותה הודעה פעמיים */
    if (sending) return;
    const text = input.value.trim();
    /* רק רווחים: required של הדפדפן לא תופס את זה, ולכן אומרים במפורש */
    if (!text) {
      input.focus();
      showToast('ההודעה ריקה. כתבו כמה מילים ואז שולחים.');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      showToast('אין כרגע חיבור לאינטרנט. מה שכתבת נשאר כאן, אפשר לשלוח כשהחיבור יחזור.', { duration: 9000 });
      return;
    }

    sending = true;
    if (submitBtn) submitBtn.disabled = true;
    /* 12/10/2026: בלי try/catch כאן, שליחה שנכשלה פשוט עצרה את
       הפונקציה: הטקסט נשאר בתיבה, הודעת ההצלחה לא הוצגה, ושום דבר
       לא קרה על המסך. כלומר כפתור מת. היא לוחצת שוב או מניחה שהמערכת
       שבורה. הטקסט נשאר בתיבה וזה נכון, רק צריך להגיד לה את זה. */
    let timer = null;
    try {
      await Promise.race([
        addDoc(collection(db, 'feedback'), {
          text,
          createdAt: serverTimestamp(),
        }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), timeoutMs);
        }),
      ]);
    } catch (err) {
      console.error('feedback submit failed:', err);
      showToast(err && err.code === 'timeout'
        ? 'השליחה לוקחת יותר מדי זמן, כנראה בגלל החיבור. מה שכתבת נשאר כאן, אפשר לנסות שוב בעוד רגע.'
        : 'ההודעה לא נשלחה. מה שכתבת נשאר כאן, אפשר לנסות שוב בעוד רגע.', { duration: 9000 });
      return;
    } finally {
      clearTimeout(timer);
      sending = false;
      if (submitBtn) submitBtn.disabled = false;
    }

    input.value = '';
    success.hidden = false;
    setTimeout(() => {
      success.hidden = true;
    }, 4000);
  });
}
