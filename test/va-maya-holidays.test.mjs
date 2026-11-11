/* 11/11/2026: חגים לפי הלוח העברי, קורי עכביש, ערב הבכורה, וההערה בקול של מאיה */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { holidayFor, hanukkiahSvg } from '../js/va-holidays.js';
import { openingMoment, quietToday, noteDue, NOTE_MIN_WORDS, POSES, holidayDay } from '../js/va-maya.js';
import { premiereTitle, wrapLines, premiereHtml } from '../js/va-premiere.js';

const require = createRequire(import.meta.url);
const { buildMayaNotePrompt, cleanMayaNote } = require('../functions/maya-note.js');
const M = readFileSync(new URL('../js/va-maya.js', import.meta.url), 'utf8');
const VA = readFileSync(new URL('../js/video-assistant.js', import.meta.url), 'utf8');
const IDX = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');

test('חנוכה: 8 ימים, נר נוסף בכל יום', () => {
  for (let n = 1; n <= 8; n += 1) {
    const day = `2026-12-${String(4 + n).padStart(2, '0')}`;
    const h = holidayFor(day);
    assert.equal(h.key, 'hanukkah', day);
    assert.equal(h.candles, n, day);
  }
  assert.equal(holidayFor('2026-12-04'), null);
  assert.equal(holidayFor('2026-12-13'), null);
  assert.equal((hanukkiahSvg(3).match(/va-flame/g) || []).length, 4, '3 נרות ושמש');
});

test('החגים יוצאים בתאריכים הנכונים', () => {
  const cases = {
    '2026-09-12': 'roshhashana', '2026-09-21': 'yomkippur', '2026-09-27': 'sukkot', '2026-10-03': 'simchattorah',
    '2026-12-25': 'christmas', '2026-12-31': 'newyear', '2027-01-23': 'tubishvat', '2027-03-23': 'purim',
    '2027-04-22': 'pesach', '2027-05-04': 'shoah', '2027-05-11': 'zikaron', '2027-05-12': 'atzmaut',
    '2027-05-25': 'lagbaomer', '2027-06-11': 'shavuot', '2027-08-18': 'tubeav',
    /* 2028: 5 באייר ביום שני, הכול נדחה ביום. 27 בניסן ביום ראשון, נדחה לשני */
    '2028-05-01': 'zikaron', '2028-05-02': 'atzmaut', '2028-04-24': 'shoah',
  };
  for (const [d, k] of Object.entries(cases)) assert.equal((holidayFor(d) || {}).key, k, d);
  assert.equal(holidayFor('2026-11-11'), null);
});

test('ימי זיכרון וצום: שקט, נר, בלי חגיגות', () => {
  for (const d of ['2027-05-04', '2027-05-11', '2026-09-21']) {
    const h = holidayFor(d);
    assert.equal(h.quiet, true, d);
    const m = openingMoment({ gap: 30, streak: 5, isNewDay: true, hour: 10, day: d, first: 'נועה' });
    assert.ok(m.quiet, `${d}: יום שקט קודם לקורי עכביש ולמדליה`);
    assert.ok(!/[!]/.test(m.text), `${d}: בלי קריאות שמחה`);
  }
  assert.equal(quietToday(new Date('2027-05-11T09:00:00Z')), true);
  assert.equal(quietToday(new Date('2026-11-11T09:00:00Z')), false);
  assert.ok(M.includes('if (!solemn && quietToday()) return false;'), 'בועות לא נחסמות ביום שקט');
  assert.ok(/moneyDance\(\) \{[^}]{0,200}quietToday\(\)/.test(M), 'ריקוד הכסף לא נחסם ביום שקט');
});

test('קורי עכביש למי שנעלמה שבוע, וחג בפתיחה', () => {
  const m = openingMoment({ gap: 9, streak: 1, isNewDay: true, hour: 10, day: '2026-11-20', first: 'נועה' });
  assert.equal(m.pose, 'cobweb');
  assert.match(m.text, /חיכיתי לך, נועה/);
  const h = openingMoment({ gap: 1, streak: 1, isNewDay: true, hour: 10, day: '2026-12-07', first: '' });
  assert.equal(h.pose, 'hanukkah');
  assert.match(h.text, /נר 3/);
});

test('כל תמונות החגים קיימות ורשומות', () => {
  for (const p of ['cobweb', 'oscar', 'candle', 'yomkippur', 'roshhashana', 'sukkot', 'simchattorah', 'tubishvat',
    'purim', 'pesach', 'atzmaut', 'lagbaomer', 'shavuot', 'tubeav', 'christmas', 'newyear', 'hanukkah']) {
    assert.ok(existsSync(new URL(`../assets/maya/maya-${p}.webp`, import.meta.url)), p);
    assert.ok(POSES.includes(p), p);
  }
});

test('ערב הבכורה: שם הסרטון, לוחית, וכפתור סטורי', () => {
  assert.equal(premiereTitle({ hook: '  למה   אף אחד לא קונה ממך  ' }), 'למה אף אחד לא קונה ממך');
  assert.ok(premiereTitle({ hook: 'א'.repeat(120) }).length <= 70);
  assert.equal(premiereTitle({}, '\nשורה ראשונה\nשנייה'), 'שורה ראשונה');
  const html = premiereHtml('<b>x</b>');
  assert.ok(html.includes('&lt;b&gt;'), 'השם לא מנוטרל');
  assert.ok(html.includes('va-premiere-share'));
  const lines = wrapLines((t) => t.length, 'אחת שתיים שלוש ארבע חמש', 10, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith('…'));
  assert.ok(VA.includes('premiereHtml(premiere)') && VA.includes('!quietToday() ? premiereTitle'), 'הבכורה לא במסך הסיכום או לא רק כשהדמות מוצגת');
  assert.ok(M.includes("card.querySelector('.va-premiere')"), 'דמות כפולה בבכורה');
});

test('"היא את": הערה בקול של מאיה, בזמן הנכון', () => {
  assert.equal(noteDue(NOTE_MIN_WORDS - 1, null), false);
  assert.equal(noteDue(NOTE_MIN_WORDS, null), true);
  assert.equal(noteDue(40, { words: 30, count: 1 }), false, 'פחות מ-15 מילים חדשות');
  assert.equal(noteDue(60, { words: 30, count: 2 }), false, 'יותר משתי הערות לתיבה');
  const p = buildMayaNotePrompt({ screen: 'scratch-dump', text: 'טקסט', domain: 'שיווק', pronoun: '' });
  assert.match(p, /את מאיה קיסלב/);
  assert.match(p, /אל תניחי מגדר/);
  assert.match(buildMayaNotePrompt({ text: 't', pronoun: 'את' }), /לשון נקבה/);
  assert.equal(cleanMayaNote('"רגע — זה ההוק שלך!"'), 'רגע, זה ההוק שלך!');
  assert.ok(IDX.includes("exports.mayaNote = onCall") && IDX.includes('mayaNote: 60,'), 'הפונקציה או התקרה היומית חסרות');
});

test('יום עברי מתחיל בערב: הנר הראשון כבר בערב, ערב יום הזיכרון כבר שקט', () => {
  /* 4/12/2026 בשעה 19:00 בישראל = 17:00 UTC: הערב של הנר הראשון */
  assert.equal(holidayDay(new Date('2026-12-04T17:00:00Z')), '2026-12-05');
  assert.equal(holidayFor(holidayDay(new Date('2026-12-04T17:00:00Z'))).candles, 1);
  assert.equal(holidayDay(new Date('2026-12-04T10:00:00Z')), '2026-12-04');
  /* ערב יום הזיכרון 2027 (10/5 בערב) שקט, ובערב יום העצמאות (11/5 בערב) כבר לא */
  assert.equal(quietToday(new Date('2027-05-10T17:30:00Z')), true);
  assert.equal(quietToday(new Date('2027-05-11T17:30:00Z')), false);
});

test('בכורה וקונפטי: לא ביום שקט, לא כשהסתירו את הדמות', () => {
  assert.ok(VA.includes('mayaOn() && !mayaHidden() && !quietToday() ? premiereTitle'));
  assert.ok(VA.includes('if (!quietToday()) burstConfetti(card'));
  const P = readFileSync(new URL('../js/va-premiere.js', import.meta.url), 'utf8');
  assert.ok(P.includes("if (!e || e.name !== 'AbortError') download(blob);"), 'שיתוף שנכשל לא מוריד במקום');
  assert.ok(!P.includes("x.fillText('🎬"), 'אימוגי על הקנבס');
});

test('הדמות התלת־ממדית בטלפון: לכולן, עם ראש עגול כגיבוי', () => {
  const M3 = readFileSync(new URL('../js/va-maya3d.js', import.meta.url), 'utf8');
  /* 11/11/2026: מאיה אישרה לפתוח לכולן */
  assert.ok(VA.includes('setMaya3dAllowed(true);'));
  assert.ok(M.includes('const want3d = head && maya3dAllowed'), 'רק בטלפון');
  assert.ok(!/uYaw/.test(M3), 'סיבוב לצדדים מעוות את הפנים');
  assert.ok(M3.includes('failed = true'), 'בלי גיבוי כשהטעינה נכשלת');
  assert.ok(existsSync(new URL('../assets/maya/maya3d.glb', import.meta.url)));
});

test('תלבושת לפי התחום, ושאלה על הסרטון הקודם', async () => {
  const { outfitFor, outfitPose, lastVideoQuestion, openingMoment: om } = await import('../js/va-maya.js');
  assert.equal(outfitFor('יופי וקוסמטיקה'), 'beauty');
  assert.equal(outfitFor('בריאות נפשית, טיפול ורוח'), 'therapy');
  assert.equal(outfitFor('עיצוב, נדל"ן ואדריכלות'), 'design');
  assert.equal(outfitFor('תוכן אישי וחיבור'), '');
  assert.equal(outfitPose('hug', 'fitness'), 'hug-fitness');
  assert.equal(outfitPose('backlean', 'business'), 'hug-business');
  assert.equal(outfitPose('camera', 'business'), 'camera', 'אביזר של מסך נשאר');
  for (const k of ['beauty', 'fitness', 'therapy', 'business', 'design']) assert.ok(existsSync(new URL(`../assets/maya/maya-hug-${k}.webp`, import.meta.url)), k);
  const lv = { title: 'למה אף אחד לא קונה ממך גם כשאת הכי טובה בתחום', day: '2026-11-09' };
  assert.match(lastVideoQuestion(lv, '2026-11-11'), /^איך יצא הסרטון "למה אף אחד לא קונה ממך…"/);
  assert.equal(lastVideoQuestion(lv, '2026-11-09'), '', 'באותו יום לא שואלים');
  assert.equal(lastVideoQuestion(lv, '2026-12-11'), '', 'אחרי חודש כבר לא');
  const m = om({ gap: 2, streak: 1, isNewDay: true, hour: 19, day: '2026-11-11', first: 'נועה', lastVideo: lv });
  assert.match(m.text, /^ערב טוב, נועה! 🌆 איך יצא הסרטון/);
  assert.ok(VA.includes('if (mayaOn()) rememberVideo(premiereTitle(state, script));'));
});
