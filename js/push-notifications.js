import { db, auth } from './firebase-init.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { showToast } from './toast.js';

const VAPID_PUBLIC_KEY = 'BJEiFPdCP25KUDW3COmcY0Y0noeC6tILFu4DoTjYW_v4mBwBshy4JyqivKa8pFE2f-36PpALDZ6_1zXnUGwKv94';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export async function enableNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    showToast('הדפדפן הזה לא תומך בהתראות');
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    showToast('לא אושרה הרשאה להתראות');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    await setDoc(doc(db, 'pushSubscriptions', auth.currentUser.uid), {
      subscription: subscription.toJSON(),
      email: auth.currentUser.email,
      updatedAt: new Date().toISOString(),
    });

    showToast('🔔 התראות הופעלו בהצלחה');
    return true;
  } catch (err) {
    console.error('enableNotifications failed:', err);
    showToast('משהו השתבש בהפעלת ההתראות, נסו שוב');
    return false;
  }
}

export function notificationsSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function notificationPermission() {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

const NUDGE_COUNT_KEY = 'notification-nudge-count';
const MAX_NUDGES = 3;

export function showNotificationNudgeIfNeeded() {
  if (!notificationsSupported() || notificationPermission() === 'granted') return;

  const shownCount = Number(localStorage.getItem(NUDGE_COUNT_KEY) || '0');
  if (shownCount >= MAX_NUDGES) return;
  localStorage.setItem(NUDGE_COUNT_KEY, String(shownCount + 1));

  const overlay = document.createElement('div');
  overlay.className = 'notification-nudge-overlay';
  overlay.innerHTML = `
    <div class="notification-nudge-card">
      <div class="notification-nudge-emoji">🔔</div>
      <h2>הפעלת התראות מומלצת מאוד!</h2>
      <p>ככה תקבלי תזכורות ועדכונים ישר לטלפון. תמיד אפשר לכבות את זה אחר כך בהגדרות הטלפון.</p>
      <div class="notification-nudge-actions">
        <button type="button" class="btn-primary notification-nudge-enable-btn">🔔 הפעלת התראות</button>
        <button type="button" class="btn-text notification-nudge-later-btn">אחר כך</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.notification-nudge-enable-btn').addEventListener('click', async () => {
    await enableNotifications();
    overlay.remove();
  });
  overlay.querySelector('.notification-nudge-later-btn').addEventListener('click', () => overlay.remove());
}
