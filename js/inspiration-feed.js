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
import { accuracyNoteOf, audioKindOf, readableTextOf } from './inspiration-readability.js';
import { lastSubtitleEnd, subtitleAt } from './inspiration-subtitles.js';

const PLATFORM_NAME = { instagram: 'אינסטגרם', tiktok: 'טיקטוק' };
const TT_ID = /tiktok\.com\/.*\/video\/(\d+)/;
const LOAD_TIMEOUT_MS = 8000;
const SETTLE_MS = 150;
const FILL_AROUND = 3;
const KEEP_AROUND = 8;

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
let slides = [];
let active = -1;
let target = null;
let observer = null;
let lastFocus = null;
let timer = null;
let settleTimer = null;
let pushedState = false;
let ownBack = false;
let frameNow = null;
/* אחרי לחיצה אחת על סאונד מנסים להשאיר אותו דולק גם בסרטונים הבאים */
let soundOn = false;
/* תרגום פתוח מראש בסרטון זר. מי שסגרה אותו, הוא נשאר סגור עד היציאה. */
let readOpen = true;
let loadSubs = null;
/* 04/11/2026: "לשכפול הסרטון" גם בגלילה. מגיע מבחוץ, כדי שהקובץ הזה לא
   יטען את העוזר כולו (והבדיקות מריצות אותו ישירות). */
let onDuplicate = null;
let subs = null;
let subsOn = true;
/* באינסטגרם הנגן לא מדווח באיזו שנייה הוא, אז סופרים לבד מרגע הלחיצה עליו */
let clockFrom = null;
let clockAt = 0;
let clockTimer = null;

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
  if (!text) return kind === 'speech' ? el('p', 'feed-note', 'אין תמלול לסרטון הזה') : null;

  const isTranslation = Boolean(video.sourceLanguage) && video.sourceLanguage !== 'he';
  const label = isTranslation ? 'תרגום לעברית' : 'התמלול';
  const wrap = el('div', isTranslation ? 'feed-read feed-read--auto' : 'feed-read');
  const btn = el('button', 'feed-read__btn', label);
  btn.type = 'button';
  const panel = el('div', 'feed-read__panel');
  const setOpen = (open) => {
    panel.hidden = !open;
    btn.textContent = open ? 'הסתרה' : label;
    btn.setAttribute('aria-expanded', String(open));
    slide.classList.toggle('is-reading', open);
  };
  const warning = el('p', 'feed-read__warning', accuracyNoteOf(isTranslation));
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
  panel.append(warning, body, copy);
  btn.addEventListener('click', () => {
    const open = panel.hidden;
    setOpen(open);
    if (isTranslation) {
      readOpen = open;
      /* גם השקופיות הסמוכות שכבר נבנו מתיישרות, שלא יקפוץ פתוח בגלילה הבאה */
      host.querySelectorAll('.feed-read--auto').forEach((w) => w.dispatchEvent(new Event('feed-read-sync')));
    }
  });
  wrap.addEventListener('feed-read-sync', () => setOpen(readOpen && !video.hasSubtitles));
  /* כשיש כתוביות על הסרטון, הפאנל הפתוח רק מקטין אותו */
  setOpen(isTranslation && readOpen && !video.hasSubtitles);
  wrap.append(btn, panel);
  return wrap;
}

/* שקופית ריקה לכל סרטון, ותוכן רק ליד המקום שבו נמצאים. בניית מאות שקופיות
   מלאות בבת אחת תוקעת טלפון, אותה סיבה שהרשת עצמה נטענת בעמודים. */
function shell(index) {
  const slide = el('section', 'feed-slide');
  slide.dataset.index = String(index);
  return slide;
}

function fillSlide(i) {
  const slide = slides[i];
  const video = list[i];
  if (!slide || !video || slide.firstChild) return;
  const top = el('div', 'feed-slide__top');
  top.appendChild(outLink(video, 'feed-out'));

  const stage = el('div', 'feed-stage');
  const poster = el('img', 'feed-poster');
  poster.alt = '';
  if (video.thumbnailUrl) poster.src = video.thumbnailUrl;
  stage.appendChild(poster);

  const bottom = el('div', 'feed-slide__bottom');
  const tag = [video.domain, video.subCategory].filter(Boolean).join(' · ');
  if (tag) bottom.appendChild(el('p', 'feed-tag', tag));
  if (video.hasSubtitles) {
    const toggle = el('button', 'feed-sub-toggle', subsOn ? 'כיבוי כתוביות' : 'הפעלת כתוביות');
    toggle.type = 'button';
    toggle.addEventListener('click', () => {
      subsOn = !subsOn;
      host.querySelectorAll('.feed-sub-toggle').forEach((b) => { b.textContent = subsOn ? 'כיבוי כתוביות' : 'הפעלת כתוביות'; });
      if (!subsOn) host.querySelectorAll('.feed-sub').forEach((n) => n.remove());
    });
    bottom.appendChild(toggle);
  }
  if (onDuplicate) {
    const dup = el('button', 'feed-dup', '🎬 לשכפול הסרטון');
    dup.type = 'button';
    dup.addEventListener('click', () => {
      const go = onDuplicate;
      closeFeed();
      go(video);
    });
    bottom.appendChild(dup);
  }
  const read = textPanel(video, slide);
  if (read) bottom.appendChild(read);

  slide.append(top, stage, bottom);
}

function fillAround(i) {
  for (let j = i - FILL_AROUND; j <= i + FILL_AROUND; j += 1) fillSlide(j);
  for (let j = 0; j < slides.length; j += 1) {
    if (Math.abs(j - i) > KEEP_AROUND && slides[j].firstChild) {
      slides[j].textContent = '';
      slides[j].classList.remove('is-reading');
    }
  }
}

function clearStage(i) {
  const slide = slides[i];
  if (!slide) return;
  slide.classList.remove('is-playing', 'is-blocked');
  slide.querySelectorAll('.feed-frame, .feed-blocked, .feed-sound, .feed-sub, .feed-sub-start').forEach((n) => n.remove());
  if (i === active) {
    frameNow = null;
    subs = null;
    stopClock();
  }
}

function stageNow() {
  const slide = slides[active];
  return slide ? slide.querySelector('.feed-stage') : null;
}

function showSub(t) {
  const stage = stageNow();
  if (!stage) return;
  const text = subsOn ? subtitleAt(subs, t) : '';
  let line = stage.querySelector('.feed-sub');
  if (!text) { if (line) line.remove(); return; }
  if (!line) {
    line = el('p', 'feed-sub');
    line.dir = 'rtl';
    stage.appendChild(line);
  }
  if (line.textContent !== text) line.textContent = text;
}

function stopClock() {
  clearInterval(clockTimer);
  clockTimer = null;
  clockFrom = null;
  clockAt = 0;
}

function runClock() {
  clockFrom = Date.now();
  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    const t = clockAt + (Date.now() - clockFrom) / 1000;
    showSub(t);
    if (t > lastSubtitleEnd(subs) + 1) stopClock();
  }, 200);
}

function restartClock() {
  stopClock();
  runClock();
  const btn = stageNow() && stageNow().querySelector('.feed-sub-start');
  if (btn) btn.textContent = '↺ כתוביות מההתחלה';
}

/* לחיצה בתוך נגן ממקור אחר לא מגיעה אלינו, אבל הפוקוס עובר אליו, וזה כן נראה מכאן.
   לחיצה ראשונה מתחילה, הבאות עוצרות וממשיכות כמו בנגן עצמו. */
function onWindowBlur() {
  setTimeout(() => {
    if (!frameNow || !subs || document.activeElement !== frameNow || tiktokId(list[active])) return;
    if (clockTimer) {
      clockAt += (Date.now() - clockFrom) / 1000;
      clearInterval(clockTimer);
      clockTimer = null;
    } else if (clockFrom === null && clockAt === 0) {
      restartClock();
    } else {
      runClock();
    }
    /* מחזירים את הפוקוס, אחרת הלחיצה הבאה בנגן לא תיראה */
    frameNow.blur();
    window.focus();
  }, 0);
}

function startSubs(i) {
  const video = list[i];
  if (!loadSubs || !video.hasSubtitles || !video.id) return;
  Promise.resolve(loadSubs(video.id)).then((segments) => {
    if (i !== active || !frameNow || !segments || !segments.length) return;
    subs = segments;
    if (tiktokId(video)) return;
    /* כתובית שלא מגיעה לא נראית כמו תקלה, אז אין לחכות לזיהוי הלחיצה בלבד */
    const btn = el('button', 'feed-sub-start', '▶ התחלת כתוביות');
    btn.type = 'button';
    btn.addEventListener('click', restartClock);
    stageNow().appendChild(btn);
  }).catch((err) => { console.error('Subtitles failed:', err); });
}

/* הנגן של טיקטוק מקבל פקודות בהודעות. דפדפן לא נותן לסרטון להתחיל עם צליל
   בלי לחיצה, ובאינסטגרם אין שום דרך לשלוט מבחוץ, שם נשארת הלחיצה של הנגן שלהם. */
function tellPlayer(type) {
  if (!frameNow || !frameNow.contentWindow) return;
  frameNow.contentWindow.postMessage({ type, value: undefined, 'x-tiktok-player': true }, 'https://www.tiktok.com');
}

function showSoundButton(show) {
  const slide = slides[active];
  const stage = slide && slide.querySelector('.feed-stage');
  if (!stage) return;
  const existing = stage.querySelector('.feed-sound');
  if (!show) { if (existing) existing.remove(); return; }
  if (existing) return;
  const btn = el('button', 'feed-sound', '🔇 הפעלת סאונד');
  btn.type = 'button';
  btn.addEventListener('click', () => {
    soundOn = true;
    tellPlayer('unMute');
    tellPlayer('play');
    btn.remove();
  });
  stage.appendChild(btn);
}

function onPlayerMessage(e) {
  if (!frameNow || e.source !== frameNow.contentWindow) return;
  let msg = e.data;
  if (typeof msg === 'string') {
    try { msg = JSON.parse(msg); } catch (err) { return; }
  }
  if (!msg || !msg['x-tiktok-player']) return;
  if (msg.type === 'onPlayerReady') {
    tellPlayer(soundOn ? 'unMute' : 'mute');
    tellPlayer('play');
    showSoundButton(!soundOn);
  } else if (msg.type === 'onCurrentTime') {
    const t = msg.value && typeof msg.value === 'object' ? msg.value.currentTime : msg.value;
    showSub(Number(t));
  } else if (msg.type === 'onMute') {
    showSoundButton(Boolean(msg.value));
  } else if (msg.type === 'onPlayerError') {
    const code = msg.value && msg.value.errorCode;
    if (code === 3002) {
      /* הדפדפן חסם ניגון עם צליל: מנגנים בלי צליל ומשאירים כפתור */
      tellPlayer('mute');
      tellPlayer('play');
      showSoundButton(true);
    } else if (code === 1001 && slides[active]) {
      clearTimeout(timer);
      blockedBox(list[active], slides[active], 'הסרטון הזה כבר לא זמין. אפשר להמשיך לגלול.');
    }
  }
}

function blockedBox(video, slide, message) {
  slide.querySelectorAll('.feed-blocked').forEach((n) => n.remove());
  slide.classList.add('is-blocked');
  const box = el('div', 'feed-blocked');
  box.append(el('p', 'feed-blocked__text', message), outLink(video, 'feed-blocked__btn'));
  slide.querySelector('.feed-stage').appendChild(box);
}

function play(i) {
  const video = list[i];
  const slide = slides[i];
  if (!video || !slide || i !== active) return;
  clearStage(i);
  const src = feedEmbedUrl(video);
  if (!src) {
    blockedBox(video, slide, 'את הסרטון הזה אפשר לראות רק באפליקציה שלו.');
    return;
  }
  const frame = el('iframe', 'feed-frame');
  frame.src = src;
  frame.title = 'סרטון רפרנס';
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen = true;
  frame.addEventListener('load', () => {
    clearTimeout(timer);
    /* טעינה איטית שהצליחה בסוף: ההודעה יורדת והסרטון נשאר */
    slide.classList.remove('is-blocked');
    slide.querySelectorAll('.feed-blocked').forEach((n) => n.remove());
  });
  slide.querySelector('.feed-stage').appendChild(frame);
  frameNow = frame;
  startSubs(i);
  slide.classList.add('is-playing');
  clearTimeout(timer);
  /* אותו עיקרון כמו בפופאפ: חלון ממקור אחר שנחסם נראה כמו ריבוע שחור בלי הסבר.
     המסגרת נשארת מתחת להודעה, כי ברשת איטית היא עוד יכולה להיטען. */
  timer = setTimeout(() => {
    if (active === i) blockedBox(video, slide, 'הסרטון לא נטען כאן. אפשר לפתוח אותו באפליקציה שלו, או להמשיך לגלול.');
  }, LOAD_TIMEOUT_MS);
}

function activate(i, immediate) {
  if (i === active || !list[i]) return;
  clearTimeout(timer);
  clearTimeout(settleTimer);
  clearStage(active);
  active = i;
  target = null;
  const count = host.querySelector('.feed-count');
  if (count) count.textContent = `${i + 1} מתוך ${list.length}`;
  const prev = host.querySelector('.feed-nav--prev');
  const next = host.querySelector('.feed-nav--next');
  if (prev) prev.disabled = i === 0;
  if (next) next.disabled = i === list.length - 1;
  fillAround(i);
  /* בגלילה מהירה לא טוענים נגן מלא לכל סרטון שעוברים בו */
  if (immediate) play(i);
  else settleTimer = setTimeout(() => play(i), SETTLE_MS);
}

function goTo(i) {
  const slide = slides[i];
  if (!slide) return;
  target = i;
  fillSlide(i);
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  slide.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  /* בדפדפן בלי IntersectionObserver הגלילה לא תפעיל את הסרטון מעצמה */
  if (!observer) activate(i, true);
}

/* לחיצה כפולה על חץ מתקדמת שני סרטונים גם לפני שהגלילה הראשונה הסתיימה */
function step(by) {
  goTo((target === null ? active : target) + by);
}

function onKey(e) {
  if (!host) return;
  if (e.key === 'Escape') closeFeed();
  if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); step(1); }
  if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); step(-1); }
}

function onPop() {
  /* החזרה שאנחנו ביקשנו בסגירה הקודמת, לא הלקוחה שלחצה עכשיו */
  if (ownBack) return;
  pushedState = false;
  closeFeed();
}

/* יציאה לאפליקציה אחרת: הצליל של הסרטון לא ממשיך ברקע */
function onVisibility() {
  if (!host || active < 0) return;
  clearTimeout(timer);
  clearTimeout(settleTimer);
  if (document.hidden) clearStage(active);
  else play(active);
}

export function closeFeed() {
  if (!host) return;
  clearTimeout(timer);
  clearTimeout(settleTimer);
  if (observer) observer.disconnect();
  observer = null;
  host.remove();
  host = null;
  list = [];
  slides = [];
  active = -1;
  target = null;
  document.body.classList.remove('feed-open');
  document.removeEventListener('keydown', onKey);
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('popstate', onPop);
  window.removeEventListener('message', onPlayerMessage);
  window.removeEventListener('blur', onWindowBlur);
  frameNow = null;
  subs = null;
  stopClock();
  /* כפתור הסגירה מוריד גם את הצעד שהוספנו להיסטוריה, כדי שחזרה לא תיתקע */
  if (pushedState) {
    pushedState = false;
    try {
      ownBack = true;
      window.addEventListener('popstate', () => { setTimeout(() => { ownBack = false; }, 0); }, { once: true });
      history.back();
    } catch (err) { ownBack = false; /* דפדפן בלי היסטוריה: אין מה לעשות */ }
  }
  if (lastFocus && lastFocus.focus) lastFocus.focus();
  lastFocus = null;
}

/** פותח מצב גלילה על הרשימה שעל המסך. מחזיר false כשאין מה להציג. */
export function openFeed(videos, start = 0, options = {}) {
  if (!videos || !videos.length) return false;
  if (host) closeFeed();
  list = videos.slice();
  loadSubs = options.loadSubtitles || null;
  onDuplicate = typeof options.onDuplicate === 'function' ? options.onDuplicate : null;
  active = -1;
  target = null;
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
  slides = list.map((video, i) => shell(i));
  slides.forEach((slide) => frag.appendChild(slide));
  scroller.appendChild(frag);

  const navPrev = el('button', 'feed-nav feed-nav--prev', '▲');
  navPrev.type = 'button';
  navPrev.setAttribute('aria-label', 'לסרטון הקודם');
  navPrev.addEventListener('click', () => step(-1));
  const navNext = el('button', 'feed-nav feed-nav--next', '▼');
  navNext.type = 'button';
  navNext.setAttribute('aria-label', 'לסרטון הבא');
  navNext.addEventListener('click', () => step(1));

  host.append(head, scroller, navPrev, navNext);
  document.body.appendChild(host);
  document.body.classList.add('feed-open');
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('message', onPlayerMessage);
  window.addEventListener('blur', onWindowBlur);

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
    slides.forEach((s) => observer.observe(s));
  }
  activate(first, true);
  if (first > 0) slides[first].scrollIntoView({ block: 'start' });
  close.focus();
  return true;
}
