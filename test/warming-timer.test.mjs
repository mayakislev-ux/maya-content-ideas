import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  readDurations, recordDuration, estimateSeconds, clockText, timerView, stepText,
  DEFAULT_ESTIMATE_SEC,
} from '../js/warming-timer.js';

// 01/10/2026 (מאיה): "שבזמן שזה בונה יהיה טיימר ספירה לאחורה כמה זמן זה לוקח".

function fakeStorage(initial) {
  const map = new Map(initial ? Object.entries(initial) : []);
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    _dump: () => Object.fromEntries(map),
  };
}

test('בפעם הראשונה, בלי היסטוריה, ההערכה היא ברירת המחדל', () => {
  assert.equal(estimateSeconds(fakeStorage()), DEFAULT_ESTIMATE_SEC);
  assert.equal(estimateSeconds(null), DEFAULT_ESTIMATE_SEC);
});

test('ההערכה נלמדת מהבניות האמיתיות, ולפי חציון', () => {
  const s = fakeStorage();
  [40, 44, 48].forEach((n) => recordDuration(s, n));
  assert.equal(estimateSeconds(s), 44);
});

test('בנייה אחת איטית לא מנפחת את ההערכה לכולן', () => {
  const s = fakeStorage();
  [40, 42, 140, 44, 41].forEach((n) => recordDuration(s, n));
  // ממוצע היה יוצא 61, החציון נשאר קרוב למה שבאמת קורה
  assert.equal(estimateSeconds(s), 42);
});

test('שומר רק את חמש האחרונות', () => {
  const s = fakeStorage();
  [10, 20, 30, 40, 50, 60, 70].forEach((n) => recordDuration(s, n));
  assert.deepEqual(readDurations(s), [30, 40, 50, 60, 70]);
});

test('זמן לא הגיוני לא נשמר ולא נקרא', () => {
  const s = fakeStorage();
  recordDuration(s, 0);
  recordDuration(s, -5);
  recordDuration(s, 9999);
  recordDuration(s, NaN);
  assert.deepEqual(readDurations(s), []);
  assert.equal(estimateSeconds(s), DEFAULT_ESTIMATE_SEC);
});

test('אחסון שבור או חסום לא מפיל כלום', () => {
  const broken = { getItem: () => 'לא JSON', setItem: () => { throw new Error('חסום'); } };
  assert.deepEqual(readDurations(broken), []);
  assert.doesNotThrow(() => recordDuration(broken, 40));
  assert.equal(estimateSeconds(broken), DEFAULT_ESTIMATE_SEC);
  assert.deepEqual(readDurations({ getItem: () => '{"a":1}' }), []);
});

test('הטיימר סופר לאחורה', () => {
  assert.equal(timerView(0, 50).clock, '0:50');
  assert.equal(timerView(10, 50).clock, '0:40');
  assert.equal(timerView(49, 50).clock, '0:01');
  assert.equal(timerView(5, 50).over, false);
});

test('כשהזמן נגמר הוא לא מראה מינוס ולא נתקע על אפס', () => {
  const v = timerView(70, 50);
  assert.equal(v.over, true);
  assert.equal(v.clock, '1:10', 'עובר לספירה עולה, כדי שיהיה ברור שזה עוד רץ');
  assert.match(v.note, /יותר מהרגיל/);
  assert.equal(timerView(50, 50).over, true, 'בדיוק על הזמן זה כבר חריגה');
});

test('הפורמט תמיד דקות ושניות, בלי לקפוץ', () => {
  assert.equal(clockText(5), '0:05');
  assert.equal(clockText(60), '1:00');
  assert.equal(clockText(125), '2:05');
  assert.equal(clockText(-3), '0:00');
});

test('שורת השלב מתארת את שני השבועות, לא שלושה', () => {
  assert.match(stepText(0), /הטבלה/);
  assert.match(stepText(5), /חימום השוטף/);
  assert.match(stepText(20), /המכירה/);
  const all = [0, 3, 12, 30, 90].map(stepText).join(' ');
  assert.ok(!/שבועיים/.test(all), 'אין יותר שבועיים של חימום');
});

// המזהה שהטיימר כותב אליו חייב להתקיים ב-index.html. קריאה למזהה שלא קיים
// מפילה את האתחול, וכל הבדיקות המבניות עוברות בכל זאת.
test('המזהים שהמסך צריך קיימים ב-index.html', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../js/warming.js', import.meta.url), 'utf8');
  for (const id of ['warming-countdown', 'warming-timer-clock']) {
    if (!js.includes(id)) continue;
    assert.ok(html.includes(`id="${id}"`), `חסר ב-index.html: ${id}`);
  }
});
