import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* 12/10/2026. מאיה: "למה התזכורת למפגש מחר לא יצאה לבד?"

   מפגש זום של מחזור 6 ב-13/10 ב-10:00, והתזכורת שאמורה לצאת יום לפני
   לא יצאה. שתי תקלות נפרדות, שתיהן כאן:

   1. REPO_RAW_BASE הצביע על ענף 'main', והענף בריפו נקרא 'master'.
      כל קריאה ללוח המפגשים ולתבניות החזירה 404, ולכן הסוכן לא ידע
      שיש מפגש בכלל. אומת: main מחזיר 404, master מחזיר את הקובץ.

   2. reminders-agent.js לא היה מחובר ל-index.js, ולכן Firebase לא
      הכיר את שמונה הפונקציות שבו. הן רצו בענן על קוד ישן שנפרס פעם
      ונשכח, ואי אפשר היה לעדכן אותן כלל: גם התיקון של גרין מ-11/10
      לא הגיע אליהן. */

const agent = readFileSync(new URL('../functions/reminders-agent.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');

test('הסוכן מושך מהענף שבאמת קיים', () => {
  assert.match(agent, /maya-session-reminders-agent\/master/);
  assert.ok(!/maya-session-reminders-agent\/main/.test(agent), 'חזר לענף main שלא קיים');
});

test('והוא מחובר ל-index, אחרת אי אפשר לעדכן אותו', () => {
  assert.match(index, /require\('\.\/reminders-agent'\)/);
});

test('שמונה הפונקציות באמת מיוצאות', () => {
  const names = ['agentSessionReminders', 'agentTaskMessage', 'agentPodcastFollowup',
    'agentZoomLink', 'agentDateBased08', 'agentDateBased09', 'agentDateBased10', 'agentDateBased14'];
  const missing = names.filter((n) => !agent.includes(`exports.${n} =`));
  assert.deepEqual(missing, [], `לא מיוצאות מהסוכן: ${missing.join(', ')}`);
});

test('וגרין אצלו עובר דרך הדומיין החי', () => {
  assert.match(agent, /greenBase\(/);
  assert.ok(!/https:\/\/(api|media)\.green-api\.com/.test(agent), 'חזר לדומיין המת');
});

/* 12/10/2026 (מאיה: "7:07 זה לא שעות העבודה").

   לשמונת הסוכנים לא הייתה שום בדיקת שעות או ימים שקטים, בניגוד לכל
   שולח אחר במערכת. שניים מהם תוזמנו ל-07:07 ול-08:07, לפני תחילת
   שעות העבודה, והם היו שולחים ללקוחות גם בשבת ובכיפור. */

test('כל סוכן רץ בתוך 9:00 עד 19:00', () => {
  const bad = [];
  for (const m of agent.matchAll(/exports\.(agent\w+) = onSchedule\(\{ schedule: '(\d+) (\d+)/g)) {
    const hour = Number(m[3]);
    if (hour < 9 || hour >= 19) bad.push(`${m[1]} ב-${String(hour).padStart(2, '0')}:${m[2]}`);
  }
  assert.deepEqual(bad, [], `מחוץ לשעות: ${bad.join(', ')}`);
});

test('ויש שומר שחוסם גם אם התזמון ישתנה בעתיד', () => {
  /* רשת ביטחון מעל ה-cron: גם אם מישהו יזיז שעה בטעות, שום הודעה
     לא תצא ללקוחה מחוץ לחלון או ביום שקט. */
  assert.match(agent, /function mayRunNow\(/);
  assert.match(agent, /quiet\.canRemindNow\(new Date\(\), \{ from: 9, to: 19 \}\)/);
});

test('והשומר נקרא בכל חמשת המסלולים', () => {
  const calls = (agent.match(/if \(!mayRunNow\(logger/g) || []).length;
  assert.equal(calls, 5, `השומר נקרא ב-${calls} מסלולים במקום 5`);
});

test('ויש סוכן לכל שעה שמופיעה בטבלת ההודעות', () => {
  /* בטבלה יש הודעה שתוזמנה ל-17:00 ולא היה לה סוכן בכלל, ולכן היא
     לא נשלחה מעולם ושום דבר לא התריע. */
  ['08', '09', '10', '14', '17'].forEach((h) => {
    assert.match(agent, new RegExp(`exports\.agentDateBased${h} =`), `חסר סוכן לשעה ${h}`);
  });
});
