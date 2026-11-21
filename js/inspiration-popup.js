// 05/10/2026 (מאיה: "הפלטפורמה ממש לא נוחה, אני רוצה שתהיה קלה. יש אפשרות
// שהסרטונים של האינסטגרם ייפתחו בפופאפ נוח?").
//
// עד היום לחיצה על כרטיס פתחה לשונית חדשה באינסטגרם. כשמדפדפים בעשרות
// רפרנסים זה הורג את הזרימה: כל צפייה מוציאה אותה מהאפליקציה.
//
// הפופאפ מנגן בתוך המסך, ומשאיר את הקישור החוצה למי שרוצה לשמור או להגיב.
import { saveButton, copyLinkButton } from './ref-saves.js';
import { embedUrlFor, embedShape, tiktokMessage, FRAME_ALLOW, FRAME_REFERRER } from './video-preview.js';

let host = null;
let lastFocus = null;
let keyBound = false;
let playerListener = null;

function setPlayerListener(fn) {
  if (playerListener) window.removeEventListener('message', playerListener);
  playerListener = fn;
  if (fn) window.addEventListener('message', fn);
}

/* דיווח שקט: האם הנגן באמת עלה. הבדיקה הלילית מסכמת ומתריעה כשפלטפורמה שלמה נשברת. */
function reportPlay(video, ok, code) {
  import('./play-report.js').then((m) => m.reportPlay(video, ok, code)).catch(() => {});
}

function close() {
  if (!host) return;
  // 05/10/2026, ממצא חוסם: הסתרה עם hidden לבדה נשענת על כלל CSS שאפשר
  // לדרוס בטעות, וזה בדיוק מה שקרה. מסירים את האלמנט מה-DOM, וככה גם אם
  // כלל סגנון ישתנה שוב, שום שכבה לא יכולה להישאר ולחסום את המסך.
  setPlayerListener(null);
  host.innerHTML = '';
  host.hidden = true;
  host.remove();
  host = null;
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
  // המאזין נרשם פעם אחת בלבד. ensureHost נקראת בכל פתיחה מחדש אחרי
  // שהאלמנט הוסר, ובלי הדגל היו נערמים מאזינים עם כל סרטון שנצפה.
  if (!keyBound) {
    document.addEventListener('keydown', onKey);
    keyBound = true;
  }
  document.body.appendChild(host);
  return host;
}

/**
 * פותח סרטון בחלון בתוך האפליקציה.
 * מחזיר false כשאין הטמעה אפשרית, ואז המתקשר נותן לדפדפן לפתוח בחוץ.
 */
export function openVideoPopup(video) {
  const embed = embedUrlFor(video.url, video);
  if (!embed) return false;

  lastFocus = document.activeElement;
  const el = ensureHost();
  const shape = embedShape(video.url, video);

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

  /* 21/11/2026 (מאיה): העתקת קישור ושמירה ישר מהחלון */
  bar.append(title, copyLinkButton(video, 'ip-act', '🔗 קישור'), saveButton(video, 'ip-act ip-save'), out, x);

  const frameWrap = document.createElement('div');
  frameWrap.className = 'ip-frame';
  frameWrap.style.aspectRatio = `${shape.w} / ${shape.h}`;

  const frame = document.createElement('iframe');
  frame.src = embed;
  frame.title = 'סרטון רפרנס';
  frame.allow = FRAME_ALLOW;
  frame.referrerPolicy = FRAME_REFERRER;
  frame.allowFullscreen = true;
  frameWrap.appendChild(frame);

  // 06/10/2026 (מאיה: "הפופאפ פשוט לא עובד ולא פותח אף סרטון"). הקוד תקין,
  // אבל ההטמעה עצמה יכולה להיחסם: מאיה נכנסת למוח השיווקי מתוך הפורטל,
  // כלומר בתוך חלון של אפליקציה מותקנת, ושם דפדפנים חוסמים הטמעות של
  // אינסטגרם וטיקטוק. התוצאה היא חלון שנפתח וריק, וזה נראה בדיוק כמו
  // "לא עובד".
  //
  // אי אפשר לדעת מבחוץ אם המסגרת נטענה, כי היא ממקור אחר. לכן מודדים זמן:
  // אם אחרי ארבע שניות אירוע הטעינה לא הגיע, מחליפים את המסגרת במסך ברור
  // עם כפתור גדול שפותח במקור. עדיף זה מאשר ריבוע שחור בלי הסבר.
  // 21/11/2026 (מאיה: "עדיין בחלק מראה ככה"). אחרי 4 שניות ההודעה מחקה את
  // הנגן, גם כשהוא סתם נטען לאט, וסרטון תקין נראה "לא מוכן להצגה". עכשיו:
  // הנגן נשאר וממשיך להיטען, ההודעה רק מכסה אותו עד שהוא מגיע, ונעלמת כשהוא
  // נטען. וגם מחכים יותר, 10 שניות.
  // 21/11/2026 (מאיה: "כמעט אף סרטון לא עובד", צילום של "Unable to load
  // player"). בטיקטוק אירוע הטעינה של המסגרת לא אומר כלום: גם מסך השגיאה
  // שלה "נטען". הנגן הרשמי מודיע בעצמו onPlayerReady או onPlayerError, ועל זה
  // סומכים. שגיאה אמיתית = מכסים את מסך השגיאה שלה בכפתור נקי לצפייה במקור.
  const isTiktok = /tiktok\.com\/player\//.test(embed);
  let ready = false;
  let cover = null;
  const showCover = (text) => {
    if (cover || !frameWrap.isConnected) return;
    cover = document.createElement('div');
    cover.className = 'ip-frame--blocked ip-cover';
    const msg = document.createElement('p');
    msg.className = 'ip-blocked__text';
    msg.textContent = text;
    const go = document.createElement('a');
    go.className = 'ip-blocked__btn';
    go.href = video.url;
    go.target = '_blank';
    go.rel = 'noopener noreferrer';
    go.textContent = isTiktok ? 'לצפות בטיקטוק ↗' : 'לצפות בסרטון ↗';
    cover.append(msg, go);
    frameWrap.appendChild(cover);
  };
  const markReady = () => {
    ready = true;
    if (cover) { cover.remove(); cover = null; }
  };
  if (!isTiktok) frame.addEventListener('load', markReady);
  else {
    setPlayerListener((e) => {
      if (e.source !== frame.contentWindow) return;
      const m = tiktokMessage(e.data);
      if (!m) return;
      if (m.type === 'onPlayerReady' || m.type === 'onStateChange' && m.value === 1) markReady();
      else if (m.type === 'onPlayerError' && !(m.value && m.value.errorCode === 3002)) {
        ready = false;
        showCover('טיקטוק לא מצליחה לנגן את הסרטון הזה כאן. בלחיצה הוא נפתח ישר בטיקטוק.');
        reportPlay(video, false, m.value && m.value.errorCode);
      }
    });
  }
  const fallbackTimer = setTimeout(() => {
    if (ready) { reportPlay(video, true); return; }
    showCover('הסרטון עדיין נטען. אם הוא לא עולה, אפשר לפתוח אותו ישר במקור.');
    reportPlay(video, false, 'timeout');
  }, 10000);
  // סגירה מבטלת את ההמתנה, אחרת היא תרוץ על חלון שכבר לא קיים
  x.addEventListener('click', () => clearTimeout(fallbackTimer));

  box.append(bar, frameWrap);
  el.appendChild(box);
  el.hidden = false;
  document.body.classList.add('ip-open');
  x.focus();
  return true;
}

export { close as closeVideoPopup };
