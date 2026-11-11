/* 10/11/2026 שלבים 4-6 של הדמות: ברכה לפי שעה ושם, ביטויים לפי לשון,
   עונה וחג, רצף ימים, התגעגעתי, גביע, בדיחות, דף הבית. ולפי מאיה: לחיצה
   עליה לא מחליפה תנוחה, ואין כניסה בהליכה ואין סולם בגלילה. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { greetingText, phrasesFor, seasonPose, registerVisit, openingMoment, israelHour, israelDay, TROPHY_AT, JOKES, POSES } from '../js/va-maya.js';

const src = readFileSync(new URL('../js/va-maya.js', import.meta.url), 'utf8');

describe('שלב 4: מדברת אלייך', () => {
  test('ברכה לפי שעה ובשם', () => {
    assert.match(greetingText(8, 'נועה'), /^בוקר טוב, נועה!/);
    assert.match(greetingText(14, ''), /^צהריים טובים!/);
    assert.match(greetingText(19, 'דן'), /^ערב טוב, דן!/);
    assert.match(greetingText(2, ''), /עוד לא ישנים/);
  });
  test('ביטויים בלשון הנכונה, וניטרלי בלי לשון', () => {
    assert.ok(phrasesFor('את').includes('תני בראש 🔥'));
    assert.ok(phrasesFor('אתה').includes('תן בראש 🔥'));
    assert.ok(!phrasesFor('').some((p) => /תני|תן |אלופה|אלוף/.test(p)));
  });
  test('שעה ותאריך לפי ישראל', () => {
    assert.equal(israelHour(new Date('2026-11-10T21:30:00Z')), 23);
    assert.equal(israelDay(new Date('2026-11-10T22:30:00Z')), '2026-11-11');
  });
});

describe('שלב 5: מצב רוח ומשחק', () => {
  test('חנוכה, חורף, קיץ', () => {
    assert.equal(seasonPose('2026-12-06'), 'hanukkah');
    assert.equal(seasonPose('2027-01-20'), 'winter');
    assert.equal(seasonPose('2027-07-10'), 'summer');
    assert.equal(seasonPose('2026-11-10'), null);
  });
  test('רצף ימים, ושבוע בלי לבוא = התגעגעתי', () => {
    let r = registerVisit({}, '2026-11-08');
    r = registerVisit(r.v, '2026-11-09');
    r = registerVisit(r.v, '2026-11-10');
    assert.equal(r.streak, 3);
    assert.equal(openingMoment({ ...r, hour: 9, day: '2026-11-10', first: '' }).pose, 'medal');
    const again = registerVisit(r.v, '2026-11-10');
    assert.equal(again.isNewDay, false, 'אותו יום לא סופר שוב');
    const back = registerVisit(r.v, '2026-11-20');
    assert.equal(back.streak, 1);
    assert.equal(openingMoment({ ...back, hour: 9, day: '2026-11-20', first: 'נועה' }).pose, 'cobweb');
  });
  test('גביע על הסרטון הראשון, ובדיחות', () => {
    assert.ok(TROPHY_AT.includes(1));
    assert.ok(JOKES.length >= 4);
  });
  test('לחיצה עליה לא מחליפה תנוחה, אין הליכה ואין סולם', () => {
    assert.ok(!/REACTIONS/.test(src));
    assert.ok(!/maya-walk\.webp'/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
    assert.ok(!POSES.includes('ladder'));
    assert.ok(!/setMayaPose\('ladder'\)/.test(src));
  });
});

describe('שלב 6: דף הבית', () => {
  test('רק מאיה רואה את הדמות בדף הבית', () => {
    const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
    assert.match(app, /if \(mayaVisibleFor\(user\.email\)\) \{\s*getProfile\(\)\.then\(\(profile\) => mountHomeMaya\(/);
  });
});
