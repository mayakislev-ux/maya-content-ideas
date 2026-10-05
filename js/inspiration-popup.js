// 05/10/2026 (מאיה: "הפלטפורמה ממש לא נוחה, אני רוצה שתהיה קלה. יש אפשרות
// שהסרטונים של האינסטגרם ייפתחו בפופאפ נוח?").
//
// עד היום לחיצה על כרטיס פתחה לשונית חדשה באינסטגרם. כשמדפדפים בעשרות
// רפרנסים זה הורג את הזרימה: כל צפייה מוציאה אותה מהאפליקציה.
//
// הפופאפ מנגן בתוך המסך, ומשאיר את הקישור החוצה למי שרוצה לשמור או להגיב.
import { embedUrlFor, embedShape } from './video-preview.js';

let host = null;
let lastFocus = null;

function close() {
  if (!host) return;
  // מנקים את ה-iframe ולא רק מסתירים אותו, אחרת הסרטון ממשיך לנגן ברקע
  host.innerHTML = '';
  host.hidden = true;
  document.body.classList.remove('ip-open');
  if (lastFocus && lastFocus.focus) lastFocus.focus();
  lastFocus = null;
}

function onKey(e) {
  if (e.key === 'Escape') close();
}

function ensureHost() {
  if (host) return host;
  host = document.createElement('div');
  host.id = 'inspiration-popup';
  host.className = 'ip';
  host.hidden = true;
  host.addEventListener('click', (e) => {
    // לחיצה על הרקע סוגרת, לחיצה על הסרטון עצמו לא
    if (e.target === host) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(host);
  return host;
}

/**
 * פותח סרטון בחלון בתוך האפליקציה.
 * מחזיר false כשאין הטמעה אפשרית, ואז המתקשר נותן לדפדפן לפתוח בחוץ.
 */
export function openVideoPopup(video) {
  const embed = embedUrlFor(video.url);
  if (!embed) return false;

  lastFocus = document.activeElement;
  const el = ensureHost();
  const shape = embedShape(video.url);

  el.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'ip-box';
  box.style.maxWidth = `${shape.w}px`;

  const bar = document.createElement('div');
  bar.className = 'ip-bar';

  const title = document.createElement('span');
  title.className = 'ip-title';
  title.textContent = video.subCategory || video.domain || 'רפרנס';

  const out = document.createElement('a');
  out.className = 'ip-out';
  out.href = video.url;
  out.target = '_blank';
  out.rel = 'noopener noreferrer';
  out.textContent = 'לפתוח במקור ↗';

  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'ip-close';
  x.setAttribute('aria-label', 'סגירה');
  x.textContent = '✕';
  x.addEventListener('click', close);

  bar.append(title, out, x);

  const frameWrap = document.createElement('div');
  frameWrap.className = 'ip-frame';
  frameWrap.style.aspectRatio = `${shape.w} / ${shape.h}`;

  const frame = document.createElement('iframe');
  frame.src = embed;
  frame.title = 'סרטון רפרנס';
  frame.loading = 'lazy';
  frame.allow = 'autoplay; clipboard-write; encrypted-media; picture-in-picture';
  frame.allowFullscreen = true;
  frameWrap.appendChild(frame);

  box.append(bar, frameWrap);
  el.appendChild(box);
  el.hidden = false;
  document.body.classList.add('ip-open');
  x.focus();
  return true;
}

export { close as closeVideoPopup };
