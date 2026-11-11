/* 11/11/2026 (מאיה: "אהבתי להתאים את הדמות לחגים. חנוכה כמה ימים, סופגנייה,
   הדלקת נרות... חג מולד... בישראל יש מלא חגים"): לוח החגים של הדמות.
   התאריכים העבריים מחושבים מהלוח העברי של הדפדפן, בלי רשימה שצריך לעדכן
   כל שנה. בימי זיכרון (שואה, זיכרון, כיפור, תשעה באב) היא שקטה: בלי בועות,
   בלי חגיגות ובלי בדיחות. */

const HEB = new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: 'UTC', day: 'numeric', month: 'long' });

/** תאריך עברי של יום YYYY-MM-DD: { d, m } (m כמו 'Kislev', 'Adar II') */
export function hebDate(day) {
  const parts = HEB.formatToParts(new Date(`${day}T12:00:00Z`));
  const get = (t) => (parts.find((p) => p.type === t) || {}).value;
  return { d: Number(get('day')), m: String(get('month') || '') };
}

export function addDays(day, n) {
  const t = new Date(`${day}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
function weekday(day) { return new Date(`${day}T12:00:00Z`).getUTCDay(); } /* 0 ראשון ... 6 שבת */

const is = (h, m, d) => h.m === m && h.d === d;
const isAdarOfPurim = (m) => m === 'Adar' || m === 'Adar II';

/** היום בשבוע שבו חל תאריך עברי, בטווח של כמה ימים סביב היום */
function findNear(day, m, d, span = 8) {
  for (let k = -span; k <= span; k += 1) {
    const x = addDays(day, k);
    if (is(hebDate(x), m, d)) return x;
  }
  return null;
}

/** יום הזיכרון ויום העצמאות, כולל ההקדמות והדחיות של הלוח הישראלי */
export function memorialDays(day) {
  const iyar5 = findNear(day, 'Iyar', 5);
  let zikaron = null;
  let atzmaut = null;
  if (iyar5) {
    const w = weekday(iyar5);
    if (w === 5) { atzmaut = addDays(iyar5, -1); zikaron = addDays(iyar5, -2); }
    else if (w === 6) { atzmaut = addDays(iyar5, -2); zikaron = addDays(iyar5, -3); }
    else if (w === 1) { atzmaut = addDays(iyar5, 1); zikaron = iyar5; }
    else { atzmaut = iyar5; zikaron = addDays(iyar5, -1); }
  }
  const nisan27 = findNear(day, 'Nisan', 27);
  let shoah = nisan27;
  if (nisan27) {
    const w = weekday(nisan27);
    if (w === 5) shoah = addDays(nisan27, -1);
    else if (w === 0) shoah = addDays(nisan27, 1);
  }
  return { zikaron, atzmaut, shoah };
}

/**
 * החג של היום, או null.
 * { key, pose, line, quiet, candles }
 *  - pose: התנוחה שבה היא מופיעה בפתיחה
 *  - quiet: יום שקט (זיכרון/צום): בלי בועות, חגיגות ובדיחות
 *  - candles: בחנוכה, כמה נרות דולקים
 */
export function holidayFor(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return null;
  const h = hebDate(day);
  const md = day.slice(5);

  const mem = memorialDays(day);
  if (day === mem.shoah) return { key: 'shoah', pose: 'candle', line: 'יום השואה. זוכרים. 🕯️', quiet: true };
  if (day === mem.zikaron) return { key: 'zikaron', pose: 'candle', line: 'יום הזיכרון. נר לזכרם 🕯️', quiet: true };
  if (day === mem.atzmaut) return { key: 'atzmaut', pose: 'atzmaut', line: 'חג עצמאות שמח! 🇮🇱' };

  if (h.m === 'Tishri' && (h.d === 9 || h.d === 10)) return { key: 'yomkippur', pose: 'yomkippur', line: 'גמר חתימה טובה 🤍', quiet: true };
  /* תשעה באב (ואם חל בשבת, נדחה ליום ראשון) */
  if ((is(h, 'Av', 9) && weekday(day) !== 6) || (is(h, 'Av', 10) && weekday(day) === 0)) {
    return { key: 'tishabeav', pose: null, line: '', quiet: true };
  }

  if ((h.m === 'Elul' && h.d === 29) || (h.m === 'Tishri' && h.d <= 2)) return { key: 'roshhashana', pose: 'roshhashana', line: 'שנה טובה! 🍎🍯 שנה של סרטונים שעפים' };
  if (h.m === 'Tishri' && h.d >= 14 && h.d <= 21) return { key: 'sukkot', pose: 'sukkot', line: 'חג סוכות שמח! 🌿' };
  if (is(h, 'Tishri', 22)) return { key: 'simchattorah', pose: 'simchattorah', line: 'שמחת תורה! 💃' };

  /* חנוכה: 25 בכסלו ועוד שבעה ימים. כל יום נר נוסף */
  for (let k = 0; k <= 7; k += 1) {
    if (is(hebDate(addDays(day, -k)), 'Kislev', 25)) {
      const n = k + 1;
      return { key: 'hanukkah', pose: 'hanukkah', line: n === 8 ? 'זאת חנוכה! כל 8 הנרות דולקים 🕎' : `נר ${n} של חנוכה 🕎🍩`, candles: n };
    }
  }

  if (is(h, 'Shevat', 15)) return { key: 'tubishvat', pose: 'tubishvat', line: 'ט"ו בשבט שמח! 🌱' };
  if (isAdarOfPurim(h.m) && h.d >= 13 && h.d <= 15) return { key: 'purim', pose: 'purim', line: 'פורים שמח! 🎭' };
  if (h.m === 'Nisan' && h.d >= 14 && h.d <= 21) return { key: 'pesach', pose: 'pesach', line: 'חג פסח שמח! 🍷' };
  if (is(h, 'Iyar', 18)) return { key: 'lagbaomer', pose: 'lagbaomer', line: 'ל"ג בעומר שמח! 🔥' };
  if (h.m === 'Sivan' && (h.d === 5 || h.d === 6)) return { key: 'shavuot', pose: 'shavuot', line: 'חג שבועות שמח! 🍰' };
  if (is(h, 'Av', 15)) return { key: 'tubeav', pose: 'tubeav', line: 'ט"ו באב שמח 💕' };

  if (md >= '12-24' && md <= '12-26') return { key: 'christmas', pose: 'christmas', line: 'מרי כריסמס! 🎄' };
  if (md === '12-31' || md === '01-01') return { key: 'newyear', pose: 'newyear', line: 'שנה אזרחית חדשה! 🥂' };
  return null;
}

/** החנוכייה הקטנה שלידה: n נרות דולקים ושמש */
export function hanukkiahSvg(n) {
  const lit = Math.max(0, Math.min(8, Number(n) || 0));
  let s = '';
  for (let i = 0; i < 8; i += 1) {
    /* מדליקים מימין לשמאל: הנר הראשון הכי ימני */
    const x = 92 - i * 11 - (i >= 4 ? 10 : 0);
    s += `<rect x="${x - 2}" y="20" width="4" height="14" rx="1" fill="#f3efe6"/>`;
    if (i < lit) s += `<path class="va-flame" d="M${x} 10 q4 5 0 9 q-4 -4 0 -9z" fill="#ffb627"/>`;
  }
  s += '<rect x="48" y="12" width="4" height="22" rx="1" fill="#f3efe6"/><path class="va-flame" d="M50 2 q4 5 0 9 q-4 -4 0 -9z" fill="#ffb627"/>';
  s += '<path d="M8 34 H96 M50 34 V52 M34 56 H66" stroke="#d4a62a" stroke-width="4" stroke-linecap="round" fill="none"/>';
  return `<svg viewBox="0 0 104 60" width="78" height="45" aria-hidden="true">${s}</svg>`;
}
