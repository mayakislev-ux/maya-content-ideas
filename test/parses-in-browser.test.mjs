/* 23/10/2026 (מאיה: "כי עכשיו בכלל יש שגיאה וזה חמור").

   האפליקציה לא נפתחה לאף אחת. הסיבה: שורה אחת שהוספתי שמה await בתוך
   פונקציה שלא הוגדרה async. זאת שגיאת תחביר, והדפדפן לא מריץ קובץ עם
   שגיאת תחביר בכלל - לא את השורה הזאת, את כל הקובץ. הקובץ הזה הוא מודול
   שכל האפליקציה תלויה בו, ולכן כל המסך נשאר שחור.

   למה זה עבר את כל הבדיקות: node --check על קובץ .js בודק אותו בתור
   CommonJS, ושם await הוא שם משתנה חוקי. הדפדפן טוען את אותו קובץ בתור
   מודול (<script type="module">), ושם await הוא מילה שמורה. אותו קובץ,
   שתי תוצאות הפוכות.

   לכן הבדיקה הזאת מעתיקה כל קובץ ל-.mjs ומריצה עליו node --check. סיומת
   mjs מכריחה את node לפרסר אותו בתור מודול, כלומר בדיוק כמו הדפדפן. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** כל קובץ js שהדפדפן טוען בתור מודול */
function moduleFiles() {
  return readdirSync(join(ROOT, 'js'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => join('js', f));
}

test('כל קובץ js נפרסר בתור מודול, כמו בדפדפן', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mod-check-'));
  const broken = [];
  try {
    for (const rel of moduleFiles()) {
      const copy = join(dir, rel.replace(/[\\/]/g, '_').replace(/\.js$/, '.mjs'));
      writeFileSync(copy, readFileSync(join(ROOT, rel), 'utf8'));
      const res = spawnSync(process.execPath, ['--check', copy], { encoding: 'utf8' });
      if (res.status !== 0) {
        const why = (res.stderr || '').split('\n').find((l) => /Error/.test(l)) || 'שגיאת תחביר';
        broken.push(`${rel}: ${why.trim()}`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.deepEqual(broken, [], `קבצים שהדפדפן לא יצליח לטעון:\n${broken.join('\n')}`);
});

test('הבדיקה למעלה באמת תופסת await בפונקציה לא אסינכרונית', () => {
  /* בדיקה שמסתכלת על עצמה. אם מישהו יחליף פעם את --check בכלי שמפרסר
     בתור CommonJS, הבדיקה למעלה תתחיל לעבור על הבאג הזה בשתיקה - בדיוק
     מה שקרה. הקנרי הזה ייכשל ראשון ויגיד למה. */
  const dir = mkdtempSync(join(tmpdir(), 'mod-canary-'));
  try {
    const canary = join(dir, 'canary.mjs');
    writeFileSync(canary, 'function f() { const x = await g(); return x; }\n');
    const res = spawnSync(process.execPath, ['--check', canary], { encoding: 'utf8' });
    assert.notEqual(res.status, 0, 'הבדיקה עצמה לא תופסת await בפונקציה לא אסינכרונית');
    assert.match(res.stderr, /reserved word|SyntaxError/, res.stderr.slice(0, 200));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
