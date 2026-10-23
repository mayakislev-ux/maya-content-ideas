const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanNumber, FIELDS, PROMPT, runPool, CONCURRENCY } = require('./readInsights');

/**
 * 09/10/2026 (מאיה): "שיעשה סריקה מדויקת, אין מה לטעות יותר מדי".
 *
 * הכלל שנבדק כאן יותר מכל דבר אחר: עדיף שדה ריק מאשר מספר שגוי. טעות
 * בקריאה גרועה יותר מהקלדה ידנית, כי אף אחד לא יודע שהיא קרתה, והכלי
 * יאבחן בביטחון על סמך מספר שלא קיים.
 */

test('כל ערך שאינו מספר תקין הופך לריק, ולא לניחוש', () => {
  assert.equal(cleanNumber(15000), 15000);
  assert.equal(cleanNumber(0), 0);
  assert.equal(cleanNumber(68.5), 68.5);
  // כל השאר ריק
  ['15K', '12.4K', 'לא ידוע', '', null, undefined, NaN, Infinity, {}, []].forEach((v) => {
    assert.equal(cleanNumber(v), null, `${JSON.stringify(v)} היה אמור להיות ריק`);
  });
});

test('הפרומפט אוסר ניחוש, חישוב והמצאה', () => {
  assert.match(PROMPT, /אל תנחש/);
  assert.match(PROMPT, /אל תחשב ואל תגזור/);
  assert.match(PROMPT, /עדיף null מאשר מספר שגוי/);
});

test('הפרומפט מבקש גם את הטקסט שנראה, כדי שאפשר יהיה להשוות בעין', () => {
  assert.match(PROMPT, /הטקסט המדויק שראית/);
  assert.match(PROMPT, /"seen"/);
});

test('הפרומפט מתרגם קיצורים וזמנים ליחידות אחידות', () => {
  assert.match(PROMPT, /12\.4K הוא 12400/);
  assert.match(PROMPT, /0:14 הוא 14/);
  assert.match(PROMPT, /68% הוא 68/);
});

test('כל שדה שהמנוע צריך מופיע בפרומפט', () => {
  ['reach', 'views', 'lengthSec', 'avgWatchSec', 'retention3s'].forEach((f) => {
    assert.ok(PROMPT.includes(f), `${f} חסר בפרומפט`);
    assert.ok(FIELDS.some(([k]) => k === f), `${f} חסר ברשימת השדות`);
  });
});

/* ---------------- הקריאות במקביל ---------------- */

/**
 * 09/10/2026: מסך הנתונים של Reel ארוך, והמדדים מפוזרים בשני חלקים שלו.
 * לכן כל סרטון מגיע בשני צילומים, ובקשה אחת יכולה להכיל שנים עשר. בטור
 * זה היה חורג מהזמן, ולכן ארבע קריאות במקביל.
 *
 * מה שנבדק כאן הוא הדבר שהיה נשבר בשקט: שהתוצאות חוזרות בסדר המקורי.
 * ההתאמה בין צילום לסרטון נשענת על המקום, ולכן ערבוב סדר היה משייך
 * מספרים לסרטון הלא נכון בלי שאף אחד יראה שגיאה.
 */

test('התוצאות חוזרות בסדר המקורי גם כשהן מסתיימות בסדר אחר', async () => {
  const items = [40, 5, 30, 1, 20, 2];
  const out = await runPool(items, async (v, i) => {
    await new Promise((r) => setTimeout(r, v));
    return { index: i, value: v };
  }, 4);
  assert.deepEqual(out.map((o) => o.value), items);
  assert.deepEqual(out.map((o) => o.index), [0, 1, 2, 3, 4, 5]);
});

test('לא רצות יותר קריאות במקביל מהמותר', async () => {
  let now = 0;
  let peak = 0;
  await runPool(new Array(12).fill(0), async () => {
    now += 1;
    peak = Math.max(peak, now);
    await new Promise((r) => setTimeout(r, 5));
    now -= 1;
  }, CONCURRENCY);
  assert.ok(peak <= CONCURRENCY, `רצו ${peak} במקביל, המותר הוא ${CONCURRENCY}`);
  assert.equal(peak, CONCURRENCY, 'לא נוצל המקביליות המותרת');
});

test('כל פריט מטופל בדיוק פעם אחת', async () => {
  const seen = [];
  await runPool([1, 2, 3, 4, 5, 6, 7], async (v) => { seen.push(v); }, 3);
  assert.deepEqual(seen.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
});

test('רשימה ריקה לא תוקעת כלום', async () => {
  assert.deepEqual(await runPool([], async () => 1, 4), []);
});

test('ופחות פריטים מהמותר לא פותח עובדים מיותרים', async () => {
  const out = await runPool([1, 2], async (v) => v * 2, 8);
  assert.deepEqual(out, [2, 4]);
});

test('כשל של צילום אחד לא מוחק את השאר', async () => {
  /* זה היה הסיכון: job שזורק דוחה את Promise.all, והפונקציה הייתה
     מחזירה שגיאה ומאבדת גם אחת עשרה קריאות שכבר הצליחו. */
  const out = await runPool([1, 2, 3, 4], async (v, i) => {
    if (v === 2) throw new Error('boom');
    return { index: i, ok: true, value: v };
  }, 2);
  assert.equal(out.length, 4);
  assert.equal(out[1].ok, false);
  assert.match(out[1].error, /[\u0590-\u05ff]/);
  assert.deepEqual(out.filter((o) => o.ok).map((o) => o.value), [1, 3, 4]);
  assert.deepEqual(out.map((o) => o.index), [0, 1, 2, 3]);
});

test('התשובה נושאת screen, כדי שאפשר יהיה לזהות שני צילומים מאותו חלק', () => {
  assert.match(PROMPT, /"screen"/);
  assert.match(PROMPT, /overview/);
  assert.match(PROMPT, /retention/);
});
