import { functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { showToast } from './toast.js';

const sendNotification = httpsCallable(functions, 'sendNotification');

export function wireNotificationAdmin() {
  const openBtn = document.getElementById('send-notification-btn');
  const modal = document.getElementById('notification-modal');
  const form = document.getElementById('notification-form');
  const cancelBtn = document.getElementById('notification-cancel-btn');
  const targetSelect = document.getElementById('notification-target');
  const emailRow = document.getElementById('notification-email-row');
  const errorEl = document.getElementById('notification-error');
  const successEl = document.getElementById('notification-success');
  const sendBtn = document.getElementById('notification-send-btn');

  function closeModal() {
    modal.hidden = true;
    form.reset();
    emailRow.hidden = true;
    errorEl.hidden = true;
    successEl.hidden = true;
  }

  openBtn.addEventListener('click', () => {
    modal.hidden = false;
  });
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  targetSelect.addEventListener('change', () => {
    emailRow.hidden = targetSelect.value !== 'one';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    successEl.hidden = true;

    const title = document.getElementById('notification-title').value.trim();
    const body = document.getElementById('notification-body').value.trim();
    const target = targetSelect.value;
    const targetEmail = document.getElementById('notification-email').value.trim();

    sendBtn.disabled = true;
    sendBtn.textContent = 'בשליחה...';
    try {
      const result = await sendNotification({ title, body, target, targetEmail });
      successEl.textContent = `נשלח בהצלחה ל-${result.data.sent} מכשירים${result.data.failed ? ` (${result.data.failed} נכשלו)` : ''}`;
      successEl.hidden = false;
      showToast('📣 ההתראה נשלחה');
      setTimeout(closeModal, 2000);
    } catch (err) {
      console.error('sendNotification failed:', err);
      const friendlyMessage = err.message && err.message !== 'INTERNAL' ? err.message : 'משהו השתבש בשליחה, נסו שוב';
      errorEl.textContent = friendlyMessage;
      errorEl.hidden = false;
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'שליחה';
    }
  });
}
