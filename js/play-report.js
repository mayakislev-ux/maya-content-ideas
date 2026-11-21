/* 21/11/2026 (מאיה: "תוודאי שזה לא יקרה שוב"). כל פתיחה של רפרנס מדווחת בשקט
   אם הנגן באמת עלה. הבדיקה הלילית (inspiration-link-check) סופרת, ואם נגן של
   פלטפורמה שלמה נשבר, מאיה מקבלת וואטסאפ באותו יום במקום לגלות לבד. */
import { db, auth } from './firebase-init.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const sent = new Set();

export function reportPlay(video, ok, code) {
  if (!video || !video.id || !auth.currentUser) return;
  const key = `${video.id}:${ok}`;
  if (sent.has(key)) return;
  sent.add(key);
  const platform = /tiktok\.com/.test(String(video.url || '')) || video.tiktokVideoId ? 'tiktok' : 'instagram';
  addDoc(collection(db, 'inspirationPlayLog'), {
    videoId: String(video.id),
    platform,
    ok: Boolean(ok),
    code: code == null ? '' : String(code),
    uid: auth.currentUser.uid,
    at: serverTimestamp(),
  }).catch(() => {});
}
