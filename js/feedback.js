import { db } from './firebase-init.js';
import { showToast } from './toast.js';
import {
  collection,
  addDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export function wireFeedbackForm() {
  const form = document.getElementById('feedback-form');
  const input = document.getElementById('feedback-input');
  const success = document.getElementById('feedback-success');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    /* 12/10/2026: בלי try/catch כאן, שליחה שנכשלה פשוט עצרה את
       הפונקציה: הטקסט נשאר בתיבה, הודעת ההצלחה לא הוצגה, ושום דבר
       לא קרה על המסך. כלומר כפתור מת. היא לוחצת שוב או מניחה שהמערכת
       שבורה. הטקסט נשאר בתיבה וזה נכון, רק צריך להגיד לה את זה. */
    try {
      await addDoc(collection(db, 'feedback'), {
        text,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('feedback submit failed:', err);
      showToast('ההודעה לא נשלחה. מה שכתבת נשאר כאן, אפשר לנסות שוב בעוד רגע.', { duration: 9000 });
      return;
    }

    input.value = '';
    success.hidden = false;
    setTimeout(() => {
      success.hidden = true;
    }, 4000);
  });
}
