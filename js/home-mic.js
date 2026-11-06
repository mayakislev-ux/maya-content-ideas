/* 06/11/2026 (מאיה, על המיקרופון מווריאציה 10 "מספרים ומוצאים"):
   "לדעתי הוא צריך להיות פשוט במסך הראשי ולא במסך הרעיונות".

   06/11/2026 ערב (מאיה): "בדף הבית כשאני לוחצת על מה היה היום, סבבה זה
   מקליט ומזהה אבל לא אהבתי שזה פותח מסך נפרד מוזר כזה וטוען הרבה זמן.
   הייתי רוצה שתוך כדי שמקליטה יתומלל בו זמנית למתחת ל'מה הרעיון שקפץ לך
   עכשיו' ואז ישמור כפופאפ מסודר".

   לכן אין כאן יותר מקליט נפרד. לחיצה על הכרטיס מקליטה כאן במסך הבית,
   והטקסט נכתב תוך כדי בתיבה #quick-add-input שמתחת:
     'speech' (כרום/אנדרואיד/מחשב): זיהוי הדיבור של הדפדפן, חי לגמרי.
     'record' (אייפון/אייפד, גם כאפליקציה מותקנת): שם זיהוי הדפדפן לא עובד,
       ולכן מקליטים קטעים קצרים (5-9 שניות, חותכים ברגע של שקט כשאפשר כדי
       לא לחתוך מילה), כל קטע הוא קובץ שלם שנשלח לתמלול ברגע שנגמר, כמה
       במקביל, והטקסט מצטרף לתיבה לפי הסדר. כלומר הטקסט מופיע כמה שניות
       אחרי שנאמר.
   ב"סיימתי" נפתח חלון קטן (אותו חלון ואותה שמירה של המקליט, js/idea-
   recorder.js) עם התקדמות, ואחריה הרעיונות שנמצאו בטקסט (ideasFromRecording
   עם text). הטקסט עצמו כבר בתיבה, ולכן כל כישלון משאיר אותו שם.

   מוצג רק כש-ideasRedesignFor (js/ideas-shelves.js) מאשר, ורק בדפדפן
   שיודע להקליט או לזהות דיבור. */
import { functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { showToast } from './toast.js';
import { dictationMode, uploadDictation } from './voice-input.js';
import {
  pickMimeType, formatClock, openIdeasPopup, setIdeasPopupProgress, showIdeasInPopup, showIdeasPopupError,
} from './idea-recorder.js';

export const MAX_SECONDS = 600;
/* זמני החיתוך באייפון. אובייקט ולא קבועים כדי שהבדיקות יוכלו לקצר. */
export const TIMING = {
  minMs: 5000, // לא חותכים לפני זה, גם אם יש שקט
  maxMs: 9000, // אחרי זה חותכים בכל מקרה
  fixedMs: 7000, // בלי מד עוצמה (אין AudioContext): חיתוך קבוע
  quietHoldMs: 250, // כמה זמן שקט רצוף נחשב "רווח בין מילים"
  tickMs: 100,
  finishWaitMs: 45000, // כמה מחכים לקטעים האחרונים אחרי "סיימתי"
};

const transcribeSegment = httpsCallable(functions, 'transcribeDictation', { timeout: 60000 });
const ideasFromText = httpsCallable(functions, 'ideasFromRecording', { timeout: 120000 });

const MIC_DENIED = 'אין גישה למיקרופון. צריך לאשר גישה למיקרופון בהגדרות הדפדפן ולנסות שוב';
const SERVICE_ERRORS = new Set(['service-not-allowed', 'language-not-supported', 'network']);

/* ---------- עזרים טהורים (נבדקים) ---------- */

/** האם לחתוך עכשיו את הקטע הנוכחי ולהתחיל חדש. */
export function shouldCut({ elapsedMs, quietForMs = 0, hasLevels }) {
  if (!hasLevels) return elapsedMs >= TIMING.fixedMs;
  if (elapsedMs >= TIMING.maxMs) return true;
  return elapsedMs >= TIMING.minMs && quietForMs >= TIMING.quietHoldMs;
}

/**
 * parts: טקסט לכל קטע לפי הסדר, undefined = עוד לא חזר.
 * מחזירה רק את הרצף שכבר חזר מההתחלה, כדי שטקסט לא יקפוץ לאמצע התיבה.
 */
export function joinedSoFar(parts) {
  const out = [];
  let i = 0;
  for (; i < parts.length; i += 1) {
    if (parts[i] === undefined) break;
    if (parts[i]) out.push(parts[i]);
  }
  return {
    text: out.join(' ').replace(/\s+/g, ' ').trim(),
    pending: parts.filter((p) => p === undefined).length,
  };
}

/** הטקסט שהיה בתיבה לפני ההקלטה נשאר, והדיבור מצטרף אחריו. */
export function appendToBase(base, spoken) {
  const b = String(base || '');
  const s = String(spoken || '').trim();
  if (!s) return b;
  const trimmed = b.replace(/\s+$/, '');
  return trimmed ? `${trimmed} ${s}` : s;
}

function errorText(err, fallback) {
  const msg = String((err && err.message) || '');
  return /[֐-׿]/.test(msg) ? msg : fallback;
}

function isQuotaError(err) {
  return String((err && err.code) || '').endsWith('resource-exhausted');
}

/* ---------- מצב ---------- */

let session = null;
let seq = 0;
let popupSeq = 0;
/* איזו הקלטה מחזיקה כרגע את החלון (ההתקדמות מתעדכנת רק ממנה) */
let popupOwner = 0;
let original = null;
/* 06/11/2026 ("אין לי רעיון?"): כשהמתג דלוק, לחיצה על הכרטיס פותחת את
   ארבע הדלתות (js/no-idea.js), וההקלטה מתחילה מהדלת הראשונה דרך
   startHomeRecording. בלי זה הכרטיס מקליט ישר, כמו קודם. */
let idleTap = null;

function el(id) { return document.getElementById(id); }
function box() { return el('quick-add-input'); }

function showStatus(text, { error = false } = {}) {
  const node = el('home-mic-status');
  if (!node) return;
  node.textContent = text;
  node.classList.toggle('home-mic-status--error', error);
  node.setAttribute('role', error ? 'alert' : 'status');
  node.hidden = !text;
}

function render() {
  const card = el('home-mic-card');
  if (!card) return;
  const title = el('home-mic-title');
  const text = el('home-mic-text');
  const stop = el('home-mic-stop');
  const state = session ? session.state : 'idle';
  card.classList.toggle('home-mic-card--live', state === 'live');
  card.classList.toggle('home-mic-card--busy', state === 'starting' || state === 'finishing');
  card.setAttribute('aria-pressed', state === 'live' ? 'true' : 'false');
  card.setAttribute('aria-busy', state === 'starting' || state === 'finishing' ? 'true' : 'false');
  if (stop) stop.hidden = state !== 'live';
  if (state === 'idle') {
    card.removeAttribute('aria-label');
    if (title) title.textContent = original.title;
    if (text) text.textContent = original.text;
    return;
  }
  if (state === 'starting') {
    if (title) title.textContent = 'פותחים את המיקרופון...';
    if (text) text.textContent = 'אם הדפדפן שואל, צריך לאשר גישה למיקרופון';
    return;
  }
  if (state === 'finishing') {
    card.removeAttribute('aria-label');
    if (title) title.textContent = 'מסיימים...';
    if (text) text.textContent = 'הטקסט נשאר בתיבה למעלה';
    return;
  }
  card.setAttribute('aria-label', 'לסיים את ההקלטה');
  if (title) title.textContent = `מקשיבים · ${formatClock((Date.now() - session.startedAt) / 1000)}`;
  if (text) {
    const how = session.mode === 'speech'
      ? 'הטקסט נכתב בתיבה למעלה תוך כדי. כשמסיימים, לוחצים על "סיימתי"'
      : 'הטקסט נכתב בתיבה למעלה כל כמה שניות. כשמסיימים, לוחצים על "סיימתי"';
    text.textContent = session.prompt ? `💡 שאלה של היום: ${session.prompt}. ${how}` : how;
  }
}

/* הטקסט נכתב לתיבה עם אירוע input, כדי שהטיוטה של התיבה (archive-view.js)
   תישמר גם היא. אם האפליקציה נסגרת באמצע, מה שנאמר לא הולך לאיבוד. */
function writeBox(s) {
  const t = box();
  if (!t) return;
  const next = appendToBase(s.base, s.spoken);
  if (t.value === next) return;
  t.value = next;
  t.dispatchEvent(new Event('input', { bubbles: true }));
  t.scrollTop = t.scrollHeight;
}

function lockBox(locked) {
  const t = box();
  if (t) t.readOnly = locked;
  const b = document.getElementById('quick-add-btn');
  if (b) b.disabled = locked;
}

/* ---------- התחלה ---------- */

async function start({ prompt = '' } = {}) {
  if (session) return;
  const mode = dictationMode(globalThis);
  if (mode === 'none') {
    showStatus('הקלטה קולית לא זמינה בדפדפן הזה. אפשר לכתוב בתיבה', { error: true });
    return;
  }
  const t = box();
  seq += 1;
  popupSeq += 1;
  const s = {
    id: seq, mode, state: 'starting', base: t ? t.value : '', spoken: '', prompt: String(prompt || ''),
    parts: [], inflight: new Set(), failures: 0, startedAt: 0,
  };
  session = s;
  showStatus('');
  lockBox(true);
  render();
  if (mode === 'speech') {
    startSpeech(s);
    return;
  }
  /* AudioContext נוצר עוד בתוך הלחיצה: באייפון הוא נשאר מושתק אם נוצר אחרי
     חלון ההרשאה. בלעדיו פשוט חותכים כל 7 שניות. */
  s.audioCtx = makeAudioContext();
  await startRecord(s);
}

function beginLive(s) {
  s.state = 'live';
  s.startedAt = Date.now();
  render();
  s.clock = setInterval(() => {
    if (session !== s || s.state !== 'live') return;
    render();
    if ((Date.now() - s.startedAt) / 1000 >= MAX_SECONDS) finish(s, 'limit');
  }, 250);
}

/** כישלון לפני שיש מה לסכם: מנקים הכל, הטקסט בתיבה נשאר, והשגיאה גלויה. */
function fail(s, message) {
  if (session !== s) return;
  releaseAll(s);
  session = null;
  lockBox(false);
  render();
  showStatus(message, { error: true });
  showToast(message, { duration: 7000 });
}

function releaseAll(s) {
  if (s.clock) clearInterval(s.clock);
  s.clock = null;
  if (s.tick) clearInterval(s.tick);
  s.tick = null;
  if (s.recorder && s.recorder.state !== 'inactive') {
    s.recorder.onstop = null;
    try { s.recorder.stop(); } catch { /* כבר נעצר */ }
  }
  s.recorder = null;
  if (s.recognition) {
    s.recognition.onend = null;
    try { s.recognition.abort ? s.recognition.abort() : s.recognition.stop(); } catch { /* כבר נעצר */ }
  }
  s.recognition = null;
  releaseMedia(s);
}

function releaseMedia(s) {
  if (s.stream) s.stream.getTracks().forEach((tr) => tr.stop());
  s.stream = null;
  if (s.audioCtx) {
    try { s.audioCtx.close(); } catch { /* כבר נסגר */ }
  }
  s.audioCtx = null;
  s.levels = null;
}

/* ---------- 'speech': זיהוי הדיבור של הדפדפן ---------- */

function startSpeech(s) {
  s.committed = '';
  s.current = '';
  s.heard = false;
  s.restarts = 0;
  beginLive(s);
  runRecognition(s);
}

function runRecognition(s) {
  const Impl = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new Impl();
  s.recognition = rec;
  rec.lang = 'he-IL';
  rec.continuous = true;
  rec.interimResults = true;
  s.current = '';
  rec.onresult = (event) => {
    if (session !== s) return;
    s.heard = true;
    s.restarts = 0;
    let all = '';
    for (let i = 0; i < event.results.length; i += 1) all += event.results[i][0].transcript;
    s.current = all;
    s.spoken = appendToBase(s.committed, all);
    writeBox(s);
  };
  rec.onerror = (event) => {
    if (session !== s) return;
    console.warn('home mic: speech error', event.error);
    if (SERVICE_ERRORS.has(event.error) && !s.heard && s.state === 'live') {
      /* שירות הזיהוי של הדפדפן לא זמין: ממשיכים באותה לחיצה בהקלטה */
      switchToRecord(s);
      return;
    }
    if (event.error === 'not-allowed' || event.error === 'audio-capture') fail(s, MIC_DENIED);
    else if (event.error === 'language-not-supported' || event.error === 'service-not-allowed') {
      fail(s, 'זיהוי הדיבור לא זמין כרגע בדפדפן הזה. אפשר לכתוב בתיבה');
    }
  };
  rec.onend = () => {
    if (session !== s || s.recognition !== rec) return;
    s.committed = appendToBase(s.committed, s.current);
    s.current = '';
    s.spoken = s.committed;
    if (s.state === 'finishing') {
      s.recognition = null;
      s.speechEnded = true;
      return;
    }
    if (s.state !== 'live') return;
    /* כרום מסיים את ההאזנה לבד אחרי שקט. מתחילים מחדש, עד שהיא לוחצת "סיימתי". */
    s.restarts += 1;
    if (s.restarts > 6) {
      showToast('ההקלטה נעצרה אחרי שקט ארוך. מה שנאמר נשאר בתיבה');
      finish(s, 'stuck');
      return;
    }
    try { runRecognition(s); } catch { finish(s, 'stuck'); }
  };
  try {
    rec.start();
  } catch (err) {
    console.warn('home mic: speech start failed', err);
    switchToRecord(s);
  }
}

function switchToRecord(s) {
  if (s.recognition) {
    s.recognition.onend = null;
    try { s.recognition.abort ? s.recognition.abort() : s.recognition.stop(); } catch { /* כבר נעצר */ }
  }
  s.recognition = null;
  if (!(window.MediaRecorder && navigator.mediaDevices)) {
    fail(s, 'זיהוי הדיבור לא זמין כרגע בדפדפן הזה. אפשר לכתוב בתיבה');
    return;
  }
  if (s.clock) clearInterval(s.clock);
  s.clock = null;
  s.base = appendToBase(s.base, s.spoken);
  s.spoken = '';
  s.mode = 'record';
  s.state = 'starting';
  render();
  startRecord(s);
}

/* ---------- 'record': קטעים קצרים ותמלול במקביל ---------- */

function makeAudioContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { return new AC(); } catch { return null; }
}

function setupLevels(s) {
  s.levels = null;
  if (!s.audioCtx) return;
  try {
    const source = s.audioCtx.createMediaStreamSource(s.stream);
    const analyser = s.audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    if (s.audioCtx.resume) s.audioCtx.resume().catch(() => {});
    s.levels = { analyser, buf: new Float32Array(analyser.fftSize), floor: 0, alive: false, since: Date.now() };
  } catch (err) {
    console.warn('home mic: no level meter', err);
    s.levels = null;
  }
}

function readLevel(s) {
  const lv = s.levels;
  lv.analyser.getFloatTimeDomainData(lv.buf);
  let sum = 0;
  for (let i = 0; i < lv.buf.length; i += 1) sum += lv.buf[i] * lv.buf[i];
  const rms = Math.sqrt(sum / lv.buf.length);
  if (rms > 0) lv.alive = true;
  /* רצפת הרעש עולה לאט ויורדת מיד, כך שרעש רקע קבוע לא נחשב לדיבור */
  lv.floor = !lv.floor || rms < lv.floor ? rms : lv.floor + (rms - lv.floor) * 0.01;
  return { rms, quiet: rms < Math.max(0.006, lv.floor * 2) };
}

async function startRecord(s) {
  try {
    s.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.warn('home mic: mic denied', err && err.name);
    fail(s, MIC_DENIED);
    return;
  }
  if (session !== s) { releaseMedia(s); return; }
  s.mimeType = pickMimeType((t) => window.MediaRecorder.isTypeSupported(t));
  setupLevels(s);
  try {
    startSegment(s);
  } catch (err) {
    console.warn('home mic: MediaRecorder failed', err);
    fail(s, 'ההקלטה לא נפתחה במכשיר הזה. אפשר לכתוב בתיבה');
    return;
  }
  beginLive(s);
  s.tick = setInterval(() => tickRecord(s), TIMING.tickMs);
}

function newRecorder(s) {
  try {
    return new window.MediaRecorder(s.stream, s.mimeType ? { mimeType: s.mimeType, audioBitsPerSecond: 48000 } : undefined);
  } catch {
    return new window.MediaRecorder(s.stream);
  }
}

function startSegment(s) {
  const rec = newRecorder(s);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.start(1000);
  const index = s.parts.length;
  s.parts.push(undefined);
  rec.onstop = () => {
    const blob = new Blob(chunks, { type: rec.mimeType || s.mimeType || 'audio/webm' });
    sendSegment(s, index, blob);
    if (s.state !== 'live' && !s.recorder) releaseMedia(s);
  };
  s.recorder = rec;
  s.segStartedAt = Date.now();
  s.quietSince = 0;
}

function tickRecord(s) {
  if (session !== s || s.state !== 'live' || !s.recorder) return;
  const now = Date.now();
  let quietFor = 0;
  if (s.levels) {
    const { quiet } = readLevel(s);
    /* מד שמחזיר רק אפסים (AudioContext מושתק) לא שווה כלום: חיתוך קבוע */
    if (!s.levels.alive && now - s.levels.since > 2000) s.levels = null;
    else if (quiet) {
      if (!s.quietSince) s.quietSince = now;
      quietFor = now - s.quietSince;
    } else s.quietSince = 0;
  }
  if (shouldCut({ elapsedMs: now - s.segStartedAt, quietForMs: quietFor, hasLevels: Boolean(s.levels) })) cut(s);
}

/* עוצרים את הקטע ומתחילים חדש באותו רגע, על אותו מיקרופון. stop() מעביר
   את ההקלטה ל-inactive מיד, ולכן אין רגע עם שתי הקלטות פתוחות. */
function cut(s) {
  const old = s.recorder;
  try { old.stop(); } catch { /* כבר נעצר */ }
  try {
    startSegment(s);
  } catch (err) {
    console.warn('home mic: next segment failed', err);
    s.recorder = null;
    finish(s, 'broken');
  }
}

function sendSegment(s, index, blob) {
  if (!blob.size) {
    s.parts[index] = '';
    refresh(s);
    return;
  }
  const job = (async () => {
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const path = await uploadDictation(blob, 's');
        const res = await transcribeSegment({ path, segment: true });
        s.parts[index] = String((res && res.data && res.data.text) || '').trim();
        refresh(s);
        return;
      } catch (err) {
        lastErr = err;
        console.warn('home mic: segment failed', index, err && (err.code || err.message));
        const code = String((err && err.code) || '');
        if (isQuotaError(err) || code.endsWith('invalid-argument') || code.endsWith('permission-denied')) break;
      }
    }
    s.parts[index] = '';
    s.failures += 1;
    s.lastError = lastErr;
    refresh(s);
    if (session !== s) return;
    if (isQuotaError(lastErr) || String((lastErr && lastErr.code) || '').endsWith('permission-denied')) {
      /* אין טעם להמשיך להקליט כשאף קטע לא יתומלל */
      showStatus(errorText(lastErr, 'התמלול לא זמין כרגע.'), { error: true });
      if (s.state === 'live') finish(s, 'quota');
    } else if (s.state === 'live') {
      showStatus(s.failures === 1
        ? 'קטע אחד לא תומלל (בעיית חיבור?). ממשיכים להקליט'
        : `${s.failures} קטעים לא תומללו (בעיית חיבור?). ממשיכים להקליט`, { error: true });
    }
  })();
  s.inflight.add(job);
  job.finally(() => s.inflight.delete(job));
}

function refresh(s) {
  const { text, pending } = joinedSoFar(s.parts);
  s.pending = pending;
  if (session === s && s.mode === 'record') {
    s.spoken = text;
    writeBox(s);
  }
  if (s.state === 'finishing' && s.id === popupOwner && pending) {
    setIdeasPopupProgress(pending === 1 ? 'מסיימים לתמלל את הסוף...' : `מסיימים לתמלל (עוד ${pending} קטעים)...`);
  }
}

/* ---------- סיום ---------- */

function waitUntil(fn, ms) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      if (fn() || Date.now() - startedAt >= ms) { resolve(fn()); return; }
      setTimeout(check, 50);
    };
    check();
  });
}

async function finish(s, reason = 'user') {
  if (session !== s || s.state !== 'live') return;
  s.state = 'finishing';
  if (s.clock) clearInterval(s.clock);
  s.clock = null;
  if (s.tick) clearInterval(s.tick);
  s.tick = null;
  render();
  if (reason === 'limit') showToast('הגענו ל-10 דקות, ההקלטה נעצרה');
  if (reason === 'hidden') showToast('ההקלטה נעצרה כי יצאת מהאפליקציה. מה שנאמר עד עכשיו נשאר');
  popupOwner = s.id;
  const token = popupSeq;
  openIdeasPopup({ progress: 'מסיימים לתמלל...' });

  if (s.mode === 'record') {
    const last = s.recorder;
    s.recorder = null;
    if (last && last.state !== 'inactive') {
      try { last.stop(); } catch { releaseMedia(s); }
    } else releaseMedia(s);
    refresh(s);
    const done = await waitUntil(() => joinedSoFar(s.parts).pending === 0, TIMING.finishWaitMs);
    if (!done) {
      /* קטע שלא חזר בזמן נחשב כקטע שלא תומלל */
      s.parts = s.parts.map((p) => (p === undefined ? '' : p));
      s.failures += 1;
    }
    setTimeout(() => releaseMedia(s), 3000);
  } else {
    const rec = s.recognition;
    if (rec) {
      try { rec.stop(); } catch { s.speechEnded = true; }
      await waitUntil(() => s.speechEnded, 2000);
    }
    s.spoken = appendToBase(s.committed, s.current);
    releaseAll(s);
  }

  const { text } = s.mode === 'record' ? joinedSoFar(s.parts) : { text: s.spoken };
  s.spoken = text;
  writeBox(s);
  session = null;
  lockBox(false);
  render();
  if (s.failures && text) showStatus('חלק מההקלטה לא תומלל. מה שכן תומלל נמצא בתיבה', { error: true });
  else if (!s.failures) showStatus('');

  if (token !== popupSeq) return; // בינתיים התחילה הקלטה חדשה
  if (!text) {
    const msg = s.failures
      ? `${errorText(s.lastError, 'התמלול לא עבר הפעם.')} אפשר ללחוץ שוב על המיקרופון ולנסות, או לכתוב בתיבה`
      : 'לא שמענו דיבור בהקלטה. אפשר ללחוץ שוב על המיקרופון ולדבר קרוב יותר לטלפון';
    showStatus(msg, { error: true });
    showIdeasPopupError(msg);
    return;
  }
  extractIdeas(text, token);
}

function extractIdeas(spoken, token) {
  const run = async () => {
    if (token !== popupSeq) return;
    setIdeasPopupProgress('מוציאים רעיונות ממה שסיפרת...');
    try {
      const res = await ideasFromText({ text: spoken });
      if (token !== popupSeq) return;
      const ideas = res && res.data && Array.isArray(res.data.ideas) ? res.data.ideas : [];
      showIdeasInPopup(ideas, {
        onSaved: () => removeSpokenFromBox(spoken),
        emptyText: 'לא מצאנו בטקסט רעיון לתוכן. הטקסט נשאר בתיבה, ואפשר לערוך אותו ולשמור עם "שמירת רעיון".',
      });
    } catch (err) {
      console.error('home mic: ideas from text failed', err);
      if (token !== popupSeq) return;
      showIdeasPopupError(`${errorText(err, 'לא הצלחנו למצוא רעיונות הפעם.')} הטקסט נשאר בתיבה.`, {
        onRetry: () => {
          openIdeasPopup({ progress: 'מוציאים רעיונות ממה שסיפרת...' });
          run();
        },
      });
    }
  };
  run();
}

/** אחרי שמירה, מה שנאמר כבר נשמר כרעיונות ויוצא מהתיבה. מה שהיה בה קודם נשאר. */
function removeSpokenFromBox(spoken) {
  const t = box();
  if (!t || !spoken) return;
  const at = t.value.lastIndexOf(spoken);
  if (at < 0) return; // נערך בינתיים: לא נוגעים
  t.value = (t.value.slice(0, at) + t.value.slice(at + spoken.length)).replace(/\s+$/, '');
  t.dispatchEvent(new Event('input', { bubbles: true }));
  showStatus('');
}

/* ---------- חיווט ---------- */

export function wireHomeMic() {
  const btn = el('home-mic-card');
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  original = {
    title: (el('home-mic-title') || {}).textContent || '',
    text: (el('home-mic-text') || {}).textContent || '',
  };
  btn.addEventListener('click', () => {
    if (!session && idleTap) idleTap();
    else if (!session) start();
    else if (session.state === 'live') finish(session, 'user');
    /* starting / finishing: לחיצה נוספת לא עושה כלום, הכרטיס מראה מה קורה */
  });
  /* באייפון המיקרופון נסגר כשיוצאים מהאפליקציה. עדיף לסיים ולסכם מה שיש. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && session && session.state === 'live' && session.mode === 'record') finish(session, 'hidden');
  });
}

/** הדלת הראשונה של "אין לי רעיון?": מתחילה את אותה הקלטה בדיוק, עם שאלה של היום. */
export function startHomeRecording({ prompt = '' } = {}) {
  return start({ prompt });
}

export function homeMicCanRecord() {
  return dictationMode(globalThis) !== 'none';
}

/** fn: מה לחיצה על הכרטיס עושה כשלא מקליטים. null = מקליט ישר. */
export function setHomeMicIdleTap(fn) {
  idleTap = typeof fn === 'function' ? fn : null;
}

export function setHomeMicVisible(on) {
  const btn = el('home-mic-card');
  if (!btn) return;
  /* עם הדלתות הכרטיס שימושי גם בדפדפן בלי מיקרופון (קהל, פרסונה, רפרנס) */
  btn.hidden = !(on && (idleTap || dictationMode(globalThis) !== 'none'));
  if (btn.hidden && session) {
    const s = session;
    releaseAll(s);
    session = null;
    lockBox(false);
    render();
  }
}
