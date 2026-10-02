/**
 * צבעי המותג והפונט הקבוע של הסטוריז, ותצוגה שנראית כמו הסטורי עצמו.
 *
 * 02/10/2026 (מאיה): "בגלל שהסטוריז בצבע מותג אז הייתי רוצה שאת הטקסט
 * והצבעים תתאימי בול לגוונים של הצבעי מותג, אז שיהיה אופציה להוסיף את זה
 * וגם את השם של הפונט הקבוע של הסטורי, ותעשי כמה שיותר דומה לקבוע שלהם...
 * ושהכל ישמר תמיד ולא כל פעם מחדש".
 *
 * לכן ההגדרות נשמרות ב-Firestore ולא בדפדפן: גם מהטלפון וגם מהמחשב זה אותו
 * מותג, ומחיקת היסטוריה לא מוחקת אותן.
 *
 * הפונט מוזן בשם. אם הוא מותקן על המכשיר, התצוגה תיראה בדיוק כמו הסטורי
 * האמיתי. אם לא, יש נפילה ל-Heebo שהוא פונט עברי אמיתי ולא ברירת מחדל של
 * הדפדפן, כדי שזה לא ייראה שבור.
 */

import { db, auth } from './firebase-init.js';
import {
  doc, getDoc, setDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export const DEFAULT_BRAND = {
  bg: '#1b1a2e',        // רקע הסטורי
  text: '#ffffff',      // הטקסט הראשי
  accent: '#f0c14b',    // ההדגשה, המשפט שחייב לקפוץ
  small: '#c9cbe0',     // השורה הקטנה מתחת
  font: '',             // שם הפונט הקבוע שלה
};

const FALLBACK_FONT = 'Heebo, Assistant, sans-serif';

/** #abc -> #aabbcc, וכל מה שאינו צבע חוקי נדחה */
export function normalizeHex(value, fallback) {
  const raw = String(value == null ? '' : value).trim();
  const short = /^#?([0-9a-fA-F]{3})$/.exec(raw);
  if (short) {
    const [r, g, b] = short[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const full = /^#?([0-9a-fA-F]{6})$/.exec(raw);
  if (full) return `#${full[1].toLowerCase()}`;
  return fallback;
}

/** שם פונט בטוח ל-CSS. בלי זה שם עם גרש או נקודה-פסיק שובר את העיצוב. */
export function fontStack(name) {
  const clean = String(name || '').replace(/["';{}<>]/g, '').trim();
  return clean ? `"${clean}", ${FALLBACK_FONT}` : FALLBACK_FONT;
}

export function normalizeBrand(raw) {
  const b = raw && typeof raw === 'object' ? raw : {};
  return {
    bg: normalizeHex(b.bg, DEFAULT_BRAND.bg),
    text: normalizeHex(b.text, DEFAULT_BRAND.text),
    accent: normalizeHex(b.accent, DEFAULT_BRAND.accent),
    small: normalizeHex(b.small, DEFAULT_BRAND.small),
    font: String(b.font || '').replace(/["';{}<>]/g, '').trim().slice(0, 60),
  };
}

export async function loadBrand() {
  const user = auth.currentUser;
  if (!user) return { ...DEFAULT_BRAND };
  try {
    const snap = await getDoc(doc(db, 'storySettings', user.uid));
    return snap.exists() ? normalizeBrand(snap.data().brand) : { ...DEFAULT_BRAND };
  } catch (err) {
    console.error('loadBrand failed:', err);
    return { ...DEFAULT_BRAND };
  }
}

export async function saveBrand(brand) {
  const user = auth.currentUser;
  if (!user) throw new Error('צריך להיות מחוברים');
  await setDoc(
    doc(db, 'storySettings', user.uid),
    { ownerUid: user.uid, brand: normalizeBrand(brand), savedAt: serverTimestamp() },
    { merge: true }
  );
}

/* ---------------- התצוגה שנראית כמו הסטורי ---------------- */

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function lines(text) {
  return esc(text)
    .split(/\r?\n/)
    .map((l) => (l.trim() ? `<span class="sp-l">${l}</span>` : '<span class="sp-gap"></span>'))
    .join('');
}

/**
 * הדמיית מדבקת הסקר של אינסטגרם.
 *
 * 02/10/2026 (מאיה): "אם צריך להוסיף סקר אז את יוצרת הדמיה של סקר ואז אנחנו
 * צריכים להוסיף מעל, נכון? תוסיפי בבקשה". זאת הדמיה בלבד, כדי שתראה איפה
 * זה יושב ואיך זה נראה. את המדבקה האמיתית מוסיפים באינסטגרם עצמו.
 */
export function pollHtml(poll, brand) {
  if (!poll || !poll.question) return '';
  return `
    <div class="sp-poll" style="font-family:${fontStack(brand.font)}">
      <p class="sp-poll-q">${esc(poll.question)}</p>
      <div class="sp-poll-opts">
        <span>${esc(poll.a || 'כן')}</span>
        <span>${esc(poll.b || 'לא')}</span>
      </div>
    </div>`;
}

/**
 * סטורי אחד כפי שהוא ייראה.
 * סטורי של דיבור למצלמה אינו מקבל תצוגה, כי אין בו טקסט על המסך. במקומו
 * מוצג שלט "דיבור למצלמה", כדי שלא ייראה כאילו משהו חסר.
 */
export function previewHtml(story, brand) {
  const b = normalizeBrand(brand);
  const text = (story && story.text) || '';
  const small = (story && story.small) || '';
  const poll = (story && story.poll) || {};

  if (!text && !poll.question) {
    return `<div class="sp-frame sp-frame--cam" style="background:${b.bg};color:${b.small};font-family:${fontStack(b.font)}">
      <span>🎥 דיבור למצלמה</span>
    </div>`;
  }

  /* השורה האחרונה היא לרוב המשפט שצריך לקפוץ, ולכן היא מקבלת את צבע
     ההדגשה. ככה התצוגה מרגישה כמו סטורי ולא כמו פסקה על רקע צבעוני. */
  const all = text.split(/\r?\n/);
  let body = text;
  let punch = '';
  if (all.length > 1) {
    const lastIdx = all.map((l) => l.trim()).lastIndexOf(all.filter((l) => l.trim()).pop());
    punch = all[lastIdx] || '';
    body = all.slice(0, lastIdx).join('\n');
  }

  return `
    <div class="sp-frame" style="background:${b.bg};color:${b.text};font-family:${fontStack(b.font)}">
      <div class="sp-text">${lines(body)}${punch ? `<span class="sp-punch" style="color:${b.accent}">${esc(punch)}</span>` : ''}</div>
      ${small ? `<p class="sp-small" style="color:${b.small}">${esc(small)}</p>` : ''}
      ${pollHtml(poll, b)}
    </div>`;
}
