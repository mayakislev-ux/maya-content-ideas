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
