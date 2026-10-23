/* 23/10/2026 (מאיה: "מעצבן שכל החלק של העוזר ליצירת סרטון לא כותב הכל
   בגוף זכר ופשוט כתוב את/אתה - זה סתם מכוער בעין ומאריך, באלי פשוט
   שהכל יהיה כתוב כמה שיותר בגוף ניטרלי").

   לשון ניטרלית בעברית נעשית בשם פועל ובשם פעולה, לא בלוכסנים.

   23/10/2026, אחרי "למה העוזר ליצירת סרטון לא מעודכן לפי כל הרשימה":
   הגרסה הראשונה של הבדיקה הזאת עברה בירוק בזמן ש"כתוב/כתבי",
   "חזור/חזרי" ו"פתחי/פתח" היו חיים על המסך. שתי סיבות, ושתיהן תוקנו
   כאן: היא קראה קובץ אחד מתוך חמישה, והביטוי הרגולרי דרש סיומת של עד
   שלוש אותיות אחרי הלוכסן, ולכן "כתבי" ו"חזרי" לא נתפסו בכלל.

   הכלל שמחליף אותו לא סופר אותיות אלא שואל אם שני צדי הלוכסן הם אותה
   מילה בשתי הטיות: צד שהוא רק סיומת, או תחילית משותפת שמשאירה לכל
   היותר שתי אותיות הבדל. כך "אינסטגרם/טיקטוק" ו"המשפטים/המסרים"
   נשארים מותרים, ו"כתוב/כתבי" נתפס. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** כל הקבצים שמרכיבים את העוזר ליצירת סרטון, לא רק הראשי */
const FILES = [
  'video-assistant.js',
  'video-assistant-content.js',
  'video-assistant-flow.js',
  'video-assistant-prompts.js',
  'video-assistant-picker.js',
];

const PAIR = /([א-ת]{2,})\/([א-ת]{1,})/g;

/** האם שני צדי הלוכסן הם אותה מילה בשתי הטיות, כלומר פנייה ממוגדרת */
function sameWordTwoForms(left, right) {
  const a = left.replace(/^[ול]/, '');   /* "וצלמי" הוא "צלמי" עם ו' החיבור */
  const b = right.replace(/^[ול]/, '');

  /* "משתמש/ת", "המשפט/ים": הצד הימני הוא סיומת, לא מילה */
  if (b.length <= 2) return true;

  /* "פתחי/פתח": צד אחד הוא בדיוק תחילית של השני */
  if (a.startsWith(b) || b.startsWith(a)) return true;

  /* "כתוב/כתבי": תחילית משותפת שמשאירה לכל היותר שתי אותיות הבדל */
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
  return shared >= 2 && Math.min(a.length, b.length) - shared <= 2;
}

/** שורה שהיא הערת קוד מתעדת את ההיסטוריה, ומותר שתצטט ניסוח ישן */
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

function scan(re, judge) {
  const hits = [];
  for (const file of FILES) {
    const lines = readFileSync(join(ROOT, 'js', file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (isComment(line)) return;
      for (const m of line.matchAll(re)) {
        if (judge(m)) hits.push(`${file}:${i + 1}: ${m[0]}`);
      }
    });
  }
  return hits;
}

test('אין פנייה ממוגדרת בלוכסן באף קובץ של העוזר', () => {
  const hits = scan(PAIR, (m) => sameWordTwoForms(m[1], m[2]));
  assert.deepEqual(hits, [], `נמצאו פניות ממוגדרות:\n${hits.join('\n')}`);
});

test('אין פנייה בלשון נקבה בטקסט שהמשתמשת רואה', () => {
  /* מופרד מהלוכסנים, כי "בחרי את הזווית" לא מכיל לוכסן בכלל ולכן
     הבדיקה הקודמת לא ראתה אותו. */
  const FEMININE = /(?<![א-ת])(תכתבי|כתבי|בחרי|תבחרי|הדביקי|תדביקי|העתיקי|תעתיקי|לחצי|תלחצי|שימי|תשימי|הקראי|קראי|צלמי|פתחי|תקבלי|שתקבלי|מוכנה|ניגשת|תמצאי|מצאי)(?![א-ת])/g;
  const hits = scan(FEMININE, () => true);
  assert.deepEqual(hits, [], `נמצאה פנייה בלשון נקבה:\n${hits.join('\n')}`);
});

test('הבדיקה מבדילה בין פנייה ממוגדרת ובין לוכסן של "או"', () => {
  /* בלי זה, חידוד הכלל היה יכול להתחיל לפסול "אינסטגרם/טיקטוק". */
  const gendered = [['כתוב', 'כתבי'], ['חזור', 'חזרי'], ['פתחי', 'פתח'], ['וצלמי', 'צלם'], ['משתמש', 'ת'], ['המשפט', 'ים']];
  for (const [l, r] of gendered) {
    assert.ok(sameWordTwoForms(l, r), `${l}/${r} היא פנייה ממוגדרת ולא נתפסה`);
  }
  const either = [['אינסטגרם', 'טיקטוק'], ['המשפטים', 'המסרים'], ['הסרטון', 'התמונה'], ['דוגמאות', 'הוכחות'], ['המסקנה', 'התובנה'], ['הטקסט', 'תסריט'], ['צילום', 'עריכה']];
  for (const [l, r] of either) {
    assert.ok(!sameWordTwoForms(l, r), `${l}/${r} היא בחירה בין אפשרויות ונפסלה בטעות`);
  }
});

test('הניסוחים הניטרליים באמת שם', () => {
  const src = readFileSync(join(ROOT, 'js', 'video-assistant.js'), 'utf8');
  for (const phrase of ['להדביק', 'להעתיק', 'לבחור', 'להקריא בקול', 'לכתוב כאן את הרעיון']) {
    assert.ok(src.includes(phrase), `חסר הניסוח "${phrase}"`);
  }
});
