const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanNumber, whatIsMissing, FIELDS, PROMPT } = require('./readInsights');

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

/* ---------------- מה חסר, ואיזה מסך ישלים ---------------- */

const empty = Object.fromEntries(FIELDS.map(([k]) => [k, null]));

test('כשאין כלום, אומרים בדיוק איזה מסך לצלם', () => {
  const missing = whatIsMissing(empty);
  const fields = missing.map((m) => m.field);
  assert.deepEqual(fields, ['reach', 'lengthSec', 'watch']);
  missing.forEach((m) => assert.match(m.hint, /[֐-׿]/, 'ההסבר בעברית'));
});

test('צפיות לבדן מספיקות במקום חשיפה, ולא מבקשים שוב', () => {
  const missing = whatIsMissing({ ...empty, views: 9000, lengthSec: 20, avgWatchSec: 11 });
  assert.deepEqual(missing, []);
});

test('בלי נתוני צפייה אומרים שאפשר לאבחן רק חלקית', () => {
  const missing = whatIsMissing({ ...empty, reach: 9000, lengthSec: 20 });
  const watch = missing.find((m) => m.field === 'watch');
  assert.ok(watch, 'חסר הסעיף על מסך הצפייה');
  assert.match(watch.hint, /אפשר לאבחן רק חלקית/);
});

test('גרף הנשירה לבדו מספיק, בלי זמן צפייה ממוצע', () => {
  const missing = whatIsMissing({ ...empty, reach: 9000, lengthSec: 20, retention3s: 61 });
  assert.equal(missing.find((m) => m.field === 'watch'), undefined);
});

test('כשהכל נקרא, לא מבקשים שום דבר נוסף', () => {
  const full = Object.fromEntries(FIELDS.map(([k]) => [k, 10]));
  assert.deepEqual(whatIsMissing(full), []);
});

test('whatIsMissing לא מפיל על קלט חלקי או ריק', () => {
  assert.doesNotThrow(() => whatIsMissing({}));
  assert.doesNotThrow(() => whatIsMissing({ reach: null }));
});
