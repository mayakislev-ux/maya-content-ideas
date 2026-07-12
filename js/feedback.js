import { db } from './firebase-init.js';
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

    await addDoc(collection(db, 'feedback'), {
      text,
      createdAt: serverTimestamp(),
    });

    input.value = '';
    success.hidden = false;
    setTimeout(() => {
      success.hidden = true;
    }, 4000);
  });
}
