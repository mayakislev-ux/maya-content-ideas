/* 10/11/2026 (מאיה): "אני רוצה את הדמות שלי ליד הרובוט לבניית סרטון, בלוק
   אחר שלי, מגניבה, נשענת כזה במסך ומלווה אותן, בתזוזה בכל שלב, ועושה
   פרצופים מותאמים".
   הדמות (חמש תנוחות, assets/maya) נשענת על הכרטיס של העוזר. כל מסך בוחר
   תנוחה, ובמעבר לתנוחה אחרת היא קופצת קלות. בטלפון היא קטנה מעל הכרטיס. */
import { mascotMood } from './video-assistant-fx.js';

export const POSES = ['lean', 'think', 'point', 'wink', 'celebrate'];

/* עד שמאיה מאשרת את הדמות במסך האמיתי, רק היא רואה אותה. לפתוח לכולן:
   FOR_ALL = true. */
export const FOR_ALL = false;
export function mayaVisibleFor(email) {
  return FOR_ALL || String(email || '').toLowerCase() === 'mayakislev@gmail.com';
}

/* מסכים שבהם היא "מראה" מה לעשות */
const POINT_SCREENS = new Set([
  'opening', 'idea-source-choice', 'reference-source-choice', 'type-idea', 'format-choice',
  'content-basics', 'creative-packaging', 'idea-sharpen', 'needs-script-check', 'footage-type-choice',
]);

/** איזו תנוחה לכל מסך */
export function poseFor(screen) {
  if (POINT_SCREENS.has(screen)) return 'point';
  const mood = mascotMood(screen);
  if (mood === 'celebrate') return 'celebrate';
  if (mood === 'thinking') return 'think';
  if (mood === 'winking') return 'wink';
  return 'lean';
}

const ALT = {
  lean: 'מאיה נשענת על המסך',
  think: 'מאיה חושבת',
  point: 'מאיה מצביעה על המסך',
  wink: 'מאיה קורצת',
  celebrate: 'מאיה חוגגת',
};

let lastPose = null;
let preloaded = false;

function preload() {
  if (preloaded || typeof Image === 'undefined') return;
  preloaded = true;
  for (const p of POSES) { const im = new Image(); im.src = `assets/maya/maya-${p}.webp`; }
}

/** מוסיף את הדמות לכרטיס שצויר עכשיו */
export function mountMaya(card, screen) {
  if (!card || card.querySelector('.va-maya')) return;
  preload();
  const pose = poseFor(screen);
  const fig = document.createElement('div');
  fig.className = `va-maya va-maya--${pose}${lastPose && lastPose !== pose ? ' is-changing' : ''}`;
  fig.setAttribute('aria-hidden', 'true');
  const img = document.createElement('img');
  img.src = `assets/maya/maya-${pose}.webp`;
  img.alt = ALT[pose];
  img.decoding = 'async';
  img.draggable = false;
  fig.appendChild(img);
  card.appendChild(fig);
  /* בטלפון נשמר מקום לדמות מעל הכרטיס, רק כשהיא באמת מוצגת */
  const view = card.closest('#video-assistant-view');
  if (view) view.classList.add('has-maya');
  lastPose = pose;
}
