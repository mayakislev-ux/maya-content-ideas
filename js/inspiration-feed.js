// 31/10/2026 (מאיה: "לפעמים לא נוח סתם לפתוח סרטון סרטון, היה נוח אם היה כפתור
// שיכניס למצב פשוט של גלילה בתוך האפליקציה, בתוך הסרטונים באופן רציף כמו
// בטיקטוק, ואז יהיה לינק מעל כל סרטון לפתיחה באפליקציה במידת הצורך").
//
// רק הסרטון שעל המסך טעון במסגרת. מסגרת אחת בכל רגע, כי כמה סרטונים פתוחים
// יחד מכבידים על טלפון, ומסגרת שיורדת מהמסך הוא הדרך היחידה לעצור צליל ממקור אחר.
//
// אצבע על מסגרת ממקור אחר לא תמיד מגיעה לגלילה שלנו, ואין דרך לדעת מבחוץ. לכן
// תמיד נשארים פס צד, הפסים למעלה ולמטה וחיצים, שאיתם אפשר לעבור הלאה.
import { embedUrlFor } from './video-preview.js';
import { audioKindOf, readableTextOf } from './inspiration-readability.js';

const PLATFORM_NAME = { instagram: 'אינסטגרם', tiktok: 'טיקטוק' };
const TT_ID = /tiktok\.com\/.*\/video\/(\d+)/;
const LOAD_TIMEOUT_MS = 8000;

/** מזהה הטיקטוק של הסרטון, או null כשזה קישור מקוצר בלי מזהה שמור. */
function tiktokId(video) {
  const saved = video && video.tiktokVideoId;
  if (saved && /^\d+$/.test(String(saved))) return String(saved);
  const m = String((video && video.url) || '').match(TT_ID);
  return m ? m[1] : null;
}

/**
 * כתובת הניגון במצב גלילה. בטיקטוק זה הנגן הרשמי, שמראה רק את הסרטון ויודע
 * לרוץ לבד. באינסטגרם יש רק כתובת הטמעה. null = אפשר רק לפתוח בחוץ.
 */
export function feedEmbedUrl(video) {
  const id = tiktokId(video);
  if (id) return `https://www.tiktok.com/player/v1/${id}?autoplay=1&loop=1&rel=0&description=0&music_info=0`;
  return embedUrlFor(video && video.url, video);
}

/** הקישור שמעל הסרטון. שם הפלטפורמה, כדי שיהיה ברור לאן זה מוביל. */
export function openLabel(video) {
  const name = PLATFORM_NAME[video && video.platform];
  return name ? `פתיחה ב${name} ↗` : 'פתיחה באפליקציה ↗';
}

let host = null;
let list = [];
let active = -1;
let observer = null;
let lastFocus = null;
let timer = null;
let pushedState = false;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function outLink(video, className) {
  const a = el('a', className, openLabel(video));
  a.href = video.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

function textPanel(video, slide) {
  const text = readableTextOf(video);
  const kind = audioKindOf(video);
  if (kind === 'song') return el('p', 'feed-note', '🎵 שיר בלי דיבור');
  if (kind === 'silent') return el('p', 'feed-note', 'בלי דיבור');
  if (!text) return null;

  const isTranslation = Boolean(video.sourceLanguage) && video.sourceLanguage !== 'he';
  const label = isTranslation ? 'תרגום לעברית' : 'התמלול';
  const wrap = el('div', 'feed-read');
  const btn = el('button', 'feed-read__btn', label);
  btn.type = 'button';
  btn.setAttribute('aria-expanded', 'false');
  const panel = el('div', 'feed-read__panel');
  panel.hidden = true;
  const body = el('p', 'feed-read__text', text);
  const copy = el('button', 'feed-read__copy', 'העתקת הטקסט');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = 'הועתק ✓';
    } catch (err) {
      console.error('Copy failed:', err);
      copy.textContent = 'ההעתקה נכשלה, נסו שוב';
    }
    setTimeout(() => { copy.textContent = 'העתקת הטקסט'; }, 1800);
  });
  panel.append(body, copy);
  btn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    btn.textContent = panel.hidden ? label : 'הסתרה';
    btn.setAttribute('aria-expanded', String(!panel.hidden));
    slide.classList.toggle('is-reading', !panel.hidden);
  });
  wrap.append(btn, panel);
  return wrap;
}

function buildSlide(video, index) {
  const slide = el('section', 'feed-slide');
  slide.dataset.index = String(index);

  const top = el('div', 'feed-slide__top');
  top.appendChild(outLink(video, 'feed-out'));

  const stage = el('div', 'feed-stage');
  const poster = el('img', 'feed-poster');
  poster.alt = '';
  stage.appendChild(poster);

  const bottom = el('div', 'feed-slide__bottom');
  const tag = [video.domain, video.subCategory].filter(Boolean).join(' · ');
  if (tag) bottom.appendChild(el('p', 'feed-tag', tag));
  const read = textPanel(video, slide);
  if (read) bottom.appendChild(read);

  slide.append(top, stage, bottom);
  return slide;
}

function slideAt(i) {
  return host && host.querySelector(`.feed-slide[data-index="${i}"]`);
}

/* תמונות רק ליד המקום שבו נמצאים, אחרת מאות תמונות יורדות בפתיחה. */
function loadPosters(i) {
  for (let j = i - 2; j <= i + 3; j += 1) {
    const slide = slideAt(j);
    const video = list[j];
    if (!slide || !video || !video.thumbnailUrl) continue;
    const img = slide.querySelector('.feed-poster');
    if (img && !img.getAttribute('src')) img.src = video.thumbnailUrl;
  }
}

function clearStage(i) {
  const slide = slideAt(i);
  if (!slide) return;
  slide.classList.remove('is-playing', 'is-blocked');
  slide.querySelectorAll('.feed-frame, .feed-blocked').forEach((n) => n.remove());
}

function showFallback(video, slide, message) {
  const stage = slide.querySelector('.feed-stage');
  slide.querySelectorAll('.feed-frame, .feed-blocked').forEach((n) => n.remove());
  slide.classList.remove('is-playing');
  slide.classList.add('is-blocked');
  const box = el('div', 'feed-blocked');
  box.append(el('p', 'feed-blocked__text', message), outLink(video, 'feed-blocked__btn'));
  stage.appendChild(box);
}

function activate(i) {
  if (i === active || !list[i]) return;
  clearTimeout(timer);
  clearStage(active);
  active = i;
  const count = host.querySelector('.feed-count');
  if (count) count.textContent = `${i + 1} מתוך ${list.length}`;
  const prev = host.querySelector('.feed-nav--prev');
  const next = host.querySelector('.feed-nav--next');
  if (prev) prev.disabled = i === 0;
  if (next) next.disabled = i === list.length - 1;
  loadPosters(i);

  const video = list[i];
  const slide = slideAt(i);
  const src = feedEmbedUrl(video);
  if (!src) {
    showFallback(video, slide, 'את הסרטון הזה אפשר לראות רק באפליקציה שלו.');
    return;
  }
  const frame = el('iframe', 'feed-frame');
  frame.src = src;
  frame.title = 'סרטון רפרנס';
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen = true;
  let loaded = false;
  frame.addEventListener('load', () => { loaded = true; clearTimeout(timer); });
  slide.querySelector('.feed-stage').appendChild(frame);
  slide.classList.add('is-playing');
  /* אותו עיקרון כמו בפופאפ: חלון ממקור אחר שנחסם נראה כמו ריבוע שחור בלי הסבר. */
  timer = setTimeout(() => {
    if (!loaded && active === i) showFallback(video, slide, 'הסרטון לא נטען כאן. אפשר לפתוח אותו באפליקציה שלו, או להמשיך לגלול.');
  }, LOAD_TIMEOUT_MS);
}

function goTo(i) {
  const slide = slideAt(i);
  if (!slide) return;
  slide.scrollIntoView({ behavior: 'smooth', block: 'start' });
  /* בדפדפן בלי IntersectionObserver הגלילה לא תפעיל את הסרטון מעצמה */
  if (!observer) activate(i);
}

function onKey(e) {
  if (!host) return;
  if (e.key === 'Escape') closeFeed();
  if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); goTo(active + 1); }
  if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); goTo(active - 1); }
}

function onPop() {
  pushedState = false;
  closeFeed();
}

export function closeFeed() {
  if (!host) return;
  clearTimeout(timer);
  if (observer) observer.disconnect();
  observer = null;
  host.remove();
  host = null;
  list = [];
  active = -1;
  document.body.classList.remove('feed-open');
  document.removeEventListener('keydown', onKey);
  window.removeEventListener('popstate', onPop);
  /* כפתור הסגירה מוריד גם את הצעד שהוספנו להיסטוריה, כדי שחזרה לא תיתקע */
  if (pushedState) {
    pushedState = false;
    try { history.back(); } catch (err) { /* דפדפן בלי היסטוריה: אין מה לעשות */ }
  }
  if (lastFocus && lastFocus.focus) lastFocus.focus();
  lastFocus = null;
}

/** פותח מצב גלילה על הרשימה שעל המסך. מחזיר false כשאין מה להציג. */
export function openFeed(videos, start = 0) {
  if (!videos || !videos.length) return false;
  if (host) closeFeed();
  list = videos.slice();
  active = -1;
  lastFocus = document.activeElement;

  host = el('div', 'feed');
  host.id = 'inspiration-feed';
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  host.setAttribute('aria-label', 'צפייה רציפה בסרטונים');

  const head = el('div', 'feed-head');
  const close = el('button', 'feed-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'יציאה ממצב גלילה');
  close.addEventListener('click', closeFeed);
  head.append(close, el('span', 'feed-count'));

  const scroller = el('div', 'feed-scroller');
  const frag = document.createDocumentFragment();
  list.forEach((video, i) => frag.appendChild(buildSlide(video, i)));
  scroller.appendChild(frag);

  const navPrev = el('button', 'feed-nav feed-nav--prev', '▲');
  navPrev.type = 'button';
  navPrev.setAttribute('aria-label', 'לסרטון הקודם');
  navPrev.addEventListener('click', () => goTo(active - 1));
  const navNext = el('button', 'feed-nav feed-nav--next', '▼');
  navNext.type = 'button';
  navNext.setAttribute('aria-label', 'לסרטון הבא');
  navNext.addEventListener('click', () => goTo(active + 1));

  host.append(head, scroller, navPrev, navNext);
  document.body.appendChild(host);
  document.body.classList.add('feed-open');
  document.addEventListener('keydown', onKey);

  /* כפתור החזרה בטלפון יוצא ממצב הגלילה, ולא מהאפליקציה */
  try {
    history.pushState({ inspirationFeed: true }, '');
    pushedState = true;
    window.addEventListener('popstate', onPop);
  } catch (err) {
    pushedState = false;
  }

  const first = Math.min(Math.max(0, start), list.length - 1);
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) activate(Number(entry.target.dataset.index));
      });
    }, { root: scroller, threshold: 0.6 });
    scroller.querySelectorAll('.feed-slide').forEach((s) => observer.observe(s));
  }
  activate(first);
  if (first > 0) slideAt(first).scrollIntoView({ block: 'start' });
  close.focus();
  return true;
}
