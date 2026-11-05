/* 05/11/2026 (מאיה): מד אורך במסך "להקריא בקול" ובסיכום. כמה מילים יש
   בתסריט, וכמה שניות זה ייקח להגיד אותו בקול. בשכפול גם התמלול של
   הרפרנס נמדד באותה דרך, ותסריט שארוך ביותר מ-20% מסומן באדום עם שורה
   קצרה, כי סרטון משוכפל שמתארך מאבד את הקצב שבגללו בחרו אותו.

   הקבוע של קצב הדיבור יושב רק כאן. */

/** קצב דיבור ממוצע בעברית, מילים לשנייה */
export const HEBREW_WORDS_PER_SEC = 2.3;

/** כמה ארוך יותר מהמקור עוד נחשב בסדר (20%) */
export const TOO_LONG_RATIO = 1.2;

export function countWords(text) {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}

export function estimateSeconds(words) {
  return Math.round(Number(words || 0) / HEBREW_WORDS_PER_SEC);
}

/* בתמלול מדויק יש אחרי הדיבור "טקסט על המסך:" ו"מה רואים בסרטון:".
   אלה לא נאמרים בקול, ולכן לא נספרים באורך. */
export function spokenPart(transcript) {
  const text = String(transcript || '');
  const cut = text.search(/(^|\n)\s*(טקסט על המסך:|מה רואים בסרטון:)/);
  return (cut === -1 ? text : text.slice(0, cut)).trim();
}

/** "כ-40 שניות", "כדקה", "כדקה ו-15 שניות" */
export function secondsLabel(sec) {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `כ-${s} שניות`;
  const min = Math.floor(s / 60);
  const rest = s % 60;
  const head = min === 1 ? 'כדקה' : `כ-${min} דקות`;
  return rest ? `${head} ו-${rest} שניות` : head;
}

/**
 * כל מה שהמד מציג. ref ריק כשאין רפרנס להשוות אליו.
 * tooLong רק כשיש רפרנס עם מילים, והתסריט ארוך ממנו ביותר מ-20%.
 */
export function lengthInfo(script, ref = '') {
  const words = countWords(script);
  const refWords = countWords(spokenPart(ref));
  const tooLong = refWords > 0 && words > refWords * TOO_LONG_RATIO;
  return {
    words,
    seconds: estimateSeconds(words),
    refWords,
    refSeconds: estimateSeconds(refWords),
    tooLong,
    overPct: refWords > 0 ? Math.round(((words - refWords) / refWords) * 100) : 0,
  };
}

/** המד עצמו. בלי תסריט אין מה למדוד, ומחזירים ריק. */
export function lengthMeterHtml(script, ref = '') {
  if (!String(script || '').trim()) return '';
  const info = lengthInfo(script, ref);
  const rows = [`<p class="va-length__row"><span>📏 התסריט:</span> <strong>${info.words} מילים</strong> · ${secondsLabel(info.seconds)} בקול</p>`];
  if (info.refWords) {
    rows.push(`<p class="va-length__row"><span>🎬 הסרטון המשוכפל:</span> <strong>${info.refWords} מילים</strong> · ${secondsLabel(info.refSeconds)}</p>`);
  }
  if (info.tooLong) {
    rows.push(`<p class="va-length__warn">התסריט ארוך ב-${info.overPct}% מהסרטון המשוכפל. כדאי לקצר אותו, כדי שהסרטון ישמור על הקצב של המקור.</p>`);
  }
  return `<div class="va-length${info.tooLong ? ' is-long' : ''}" role="note">${rows.join('')}</div>`;
}

/** התמלול של הרפרנס, רק במסלולי השכפול. בשאר המסלולים אין למה להשוות. */
export function duplicationRef(state) {
  const s = state || {};
  return (s.branch === 'reference' || s.branch === 'idea-search') ? String(s.transcript || '') : '';
}
