/* בדיקות לקליטת שאלון ההכנה לפגישת אסטרטגיה.
 *
 * מה שחשוב כאן הוא לא "האם המייל יצא" אלא הסדר: התשובות נשמרות לפני
 * כל שליחה, ולקוחה שמילאה לא מקבלת שגיאה רק כי המייל נכשל. זה מה
 * שמבדיל בין "אבדו לה עשרים דקות של מילוי" לבין "מאיה תצטרך לשלוף
 * ידנית".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../functions/strategy-form.js', import.meta.url), 'utf8');

test('השמירה קודמת לשליחות', () => {
  const save = SRC.indexOf("collection('strategyForms').add");
  const mail = SRC.indexOf('sendMail');
  const wa = SRC.indexOf('notifyWhatsApp(');
  assert.ok(save > 0 && mail > 0, 'שני השלבים קיימים');
  assert.ok(save < mail, 'שומרים לפני ששולחים מייל');
  assert.ok(save < SRC.indexOf('notifyWhatsApp(\n') || save < wa, 'שומרים לפני הוואטסאפ');
});

test('כישלון במייל לא מפיל את ההגשה', () => {
  // אחרי ה-sendMail חייב לבוא catch שרק רושם ללוג, בלי להחזיר שגיאה ללקוחה
  const after = SRC.slice(SRC.indexOf('sendMail'));
  const nextCatch = after.slice(0, after.indexOf('whatsappSent'));
  assert.ok(/catch \(err\)/.test(nextCatch), 'יש catch סביב שליחת המייל');
  assert.ok(!/return res\.status\(5/.test(nextCatch), 'והוא לא מחזיר שגיאה ללקוחה');
});

test('כישלון בשמירה כן מוחזר ללקוחה, אחרת היא תחשוב שנשלח', () => {
  const block = SRC.slice(SRC.indexOf("collection('strategyForms').add"), SRC.indexOf('sendMail'));
  assert.ok(/return res\.status\(500\)/.test(block), 'שמירה שנכשלה מחזירה שגיאה');
});

test('רק הדומיינים של מאיה רשאים לשלוח', () => {
  assert.ok(SRC.includes("'https://maya-liui.web.app'"));
  assert.ok(SRC.includes("'https://mayakislev-ux.github.io'"));
  assert.ok(SRC.includes('ALLOWED_ORIGINS.has(origin)'), 'הבדיקה באמת נאכפת ולא רק מוגדרת');
});

test('הקובץ המצורף נפתח בעברית תקינה', () => {
  assert.ok(SRC.includes('String.fromCharCode(0xFEFF)'), 'ה-BOM כתוב כקוד ולא כתו סמוי');
  assert.ok(SRC.includes('content: BOM + text'), 'והוא באמת נוסף לתחילת הקובץ');
  assert.ok(SRC.includes('charset=utf-8'));
});

test('יש תקרת גודל, שלא יישלח אליה קובץ ענק', () => {
  assert.ok(/MAX_TEXT\s*=\s*\d+/.test(SRC));
  assert.ok(SRC.includes('text.length > MAX_TEXT'), 'והתקרה נבדקת');
});

test('שאלון ריק נדחה', () => {
  assert.ok(SRC.includes('if (!text) return res.status(400)'));
});

test('הכתובות והיעדים הם של מאיה', () => {
  assert.ok(SRC.includes("MAYA_EMAIL = 'mayakislev@gmail.com'"));
  assert.ok(SRC.includes("MAYA_CHAT_ID = '972525533679@c.us'"), 'המספר האישי שלה, כמו בסיכום היומי');
});

/* 09/10/2026: שלוש הגשות זהות נקלטו בתוך שנייה וחצי בבדיקה של השאלון,
   וכל אחת הקפיצה למאיה וואטסאפ ומייל נפרדים. הניסיון הראשון למנוע את
   זה היה שאילתה, והיא נכשלה בשקט כי חסר אינדקס מורכב. */
test('הגשה כפולה לא מודיעה למאיה פעמיים', () => {
  assert.ok(SRC.includes("collection('strategyFormLocks')"), 'יש נעילה');
  assert.ok(SRC.includes('lockRef.create('), 'והיא create, שהוא אטומי ולכן עמיד בשתי בקשות בו זמנית');
  const dedupe = SRC.slice(SRC.indexOf('lockRef.create('), SRC.indexOf("collection('strategyForms').add"));
  assert.ok(/duplicate: true/.test(dedupe), 'כפולה מסומנת ככפולה');
  assert.ok(/return res\.status\(200\)/.test(dedupe), 'ומוחזרת לה הצלחה, לא שגיאה');
  assert.ok(dedupe.indexOf('sendMail') === -1, 'ולא נשלח עליה מייל');
});

test('הדדופ לא נשען על שאילתה, שדורשת אינדקס', () => {
  assert.ok(!SRC.includes("where('fingerprint'"), 'בלי שאילתה על טביעה');
  assert.ok(SRC.includes('WINDOW_MS'), 'יש חלון זמן מוגדר');
});

test('נעילה ישנה לא חוסמת הגשה חדשה של אותו תוכן', () => {
  assert.ok(SRC.includes('Date.now() - at < WINDOW_MS'), 'הכפילות נמדדת לפי זמן');
  assert.ok(SRC.includes('lockRef.set('), 'ונעילה שפגה מתחדשת במקום לחסום');
});

/* 09/10/2026: עריכה שלי מחקה בטעות את ההגדרה של fileName, והמייל נפל
   עם "fileName is not defined" בזמן שהוואטסאפ דווקא יצא. */
test('כל מה שהמייל משתמש בו באמת מוגדר', () => {
  for (const name of ['fileName', 'BOM', 'stamp']) {
    assert.ok(
      new RegExp('const ' + name + '\\s*=').test(SRC),
      name + ' מוגדר'
    );
  }
});
