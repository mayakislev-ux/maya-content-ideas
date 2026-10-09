import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  shouldOfferApply,
  reportSummary,
  appliedSummary,
  breakdownText,
  biduriErrorText,
} from '../js/biduri-logic.js';

/**
 * 09/10/2026 (מאיה: "בעצם לכל הלקוחות להעיף בריעונות סינון לפי בידורי
 * ופשוט להתאים לשאר סוגי התוכן אפשרי ואז להעלות לאפליקציה? תמצאי פתרון").
 *
 * המסך נוגע לרעיונות של כל הלקוחות, ולכן נבדק כאן הרצף המלא כמו שהיא
 * עוברת אותו: דוח, ואז ביצוע. בלי דפדפן, דרך ההחלטות עצמן.
 */

const MODULE = readFileSync(new URL('../js/biduri-migration.js', import.meta.url), 'utf8');
const FUNCS = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const APP = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');

/* גבול של פונקציה בקובץ השרת. indexOf שמחזיר -1 היה הופך slice לכל
   הקובץ, והבדיקות היו עוברות על השומר של פונקציה אחרת לגמרי. */
function serverFunction(name, nextName) {
  const start = FUNCS.indexOf(`exports.${name} = onCall(`);
  const end = FUNCS.indexOf(`exports.${nextName} = onCall(`);
  assert.ok(start > 0, `לא נמצאה הפונקציה ${name}`);
  assert.ok(end > start, `לא נמצא הגבול ${nextName} אחרי ${name}`);
  return FUNCS.slice(start, end);
}

const REPORT_FN = serverFunction('recategorizeBiduri', 'applyRecategorizeBiduri');
const APPLY_FN = serverFunction('applyRecategorizeBiduri', 'undoRecategorizeBiduri');
const UNDO_FN = serverFunction('undoRecategorizeBiduri', 'getClientUsageStats');

// ---------------------------------------------------------------------------
// הזרימה
// ---------------------------------------------------------------------------

test('הרצף שמאיה עוברת: דוח, ואז ביצוע', () => {
  const dry = {
    found: 3,
    handled: 3,
    failed: 0,
    byTarget: { 'בעל ערך': 2, 'אישי': 1 },
    report: [
      { id: 'a', ownerUid: 'u1', title: 'מם על לקוחות', to: 'בעל ערך', note: 'מוצע' },
      { id: 'b', ownerUid: 'u1', title: 'טרנד', to: 'בעל ערך', note: 'מוצע' },
      { id: 'c', ownerUid: 'u2', title: 'רגע מהבית', to: 'אישי', note: 'מוצע' },
    ],
  };
  const text = reportSummary(dry);
  assert.match(text, /נמצאו 3/);
  assert.match(text, /שום דבר עוד לא שונה/, 'דוח חייב לומר במפורש שלא נגעו בכלום');
  assert.ok(shouldOfferApply(dry.report), 'אחרי דוח מוצלח הכפתור "להחיל" מוצע');

  const after = appliedSummary({ changed: 3, skipped: 0, remaining: 0, byTarget: dry.byTarget });
  assert.match(after, /הועברו 3/);
  assert.doesNotMatch(after, /שום דבר עוד לא שונה/);
});

test('דוח שבו שום רעיון לא הצליח להיסווג לא מציע ביצוע', () => {
  /* אחרת לחיצה על "להחיל" לא תעשה כלום, וזה נראה בדיוק כמו כפתור שבור. */
  assert.equal(shouldOfferApply([{ id: 'a', title: 'רעיון', to: null, note: 'הסיווג נכשל' }]), false);
  assert.equal(shouldOfferApply([{ id: null, to: 'אישי' }]), false, 'בלי מזהה אין מה לכתוב');
  assert.equal(shouldOfferApply([]), false);
  assert.equal(shouldOfferApply(undefined), false);
});

test('כשאין יותר רעיונות "בידורי" הסיכום אומר את זה ולא מציג מספרים ריקים', () => {
  const text = reportSummary({ found: 0, handled: 0, failed: 0, byTarget: {}, report: [] });
  assert.equal(text, 'אין יותר רעיונות מתויגים "בידורי". אין מה להתאים.');
});

test('רעיונות שלא סווגו או שדולגו מדווחים, לא נעלמים', () => {
  assert.match(reportSummary({ found: 5, handled: 5, failed: 1, byTarget: { 'אישי': 4 } }),
    /1 לא הצלחנו לסווג, הם יישארו "בידורי"/);
  assert.match(appliedSummary({ changed: 4, skipped: 1, remaining: 0, byTarget: { 'אישי': 4 } }),
    /1 דולגו/);
});

test('הפירוט לא מציג קטגוריה עם אפס', () => {
  assert.equal(breakdownText({ 'בעל ערך': 2, 'אישי': 0 }), '2 ל"בעל ערך"');
  assert.equal(breakdownText({}), '');
  assert.equal(breakdownText(null), '');
});

test('הרצה חתוכה אומרת שהיא חתוכה, ואומרת איך להמשיך', () => {
  /* השרת מטפל במנה אחת בכל הרצה. דוח של 520 שמציג 150 ולא אומר כלום
     נקרא כאילו סיים את העבודה. ואחרי ההחלה הכפתור "להחיל" נעלם, ולכן
     "אפשר להריץ שוב" בלי לומר על מה ללחוץ הוא הוראה ללא כפתור. */
  assert.match(reportSummary({ found: 520, handled: 150, failed: 0, byTarget: { 'אישי': 150 } }),
    /מוצגים 150 מהם/);
  const applied = appliedSummary({ changed: 150, skipped: 0, remaining: 370, byTarget: { 'אישי': 150 } });
  assert.match(applied, /נשארו עוד 370/);
  assert.match(applied, /"להציג דוח"/, 'חייב לומר על איזה כפתור ללחוץ');
});

test('הרצה שסיימה הכול לא מוסיפה הערה על המשך', () => {
  assert.doesNotMatch(reportSummary({ found: 12, handled: 12, failed: 0, byTarget: { 'אישי': 12 } }),
    /מוצגים/);
  assert.doesNotMatch(appliedSummary({ changed: 12, skipped: 0, remaining: 0, byTarget: { 'אישי': 12 } }),
    /נשארו עוד/);
});

test('לחיצה לפני שהפונקציה הועלתה אומרת מה לעשות, לא "משהו נתקע"', () => {
  assert.match(biduriErrorText({ code: 'functions/not-found' }), /העלאת-בידורי\.bat/);
  assert.match(biduriErrorText({ code: 'functions/permission-denied' }), /מאיה בלבד/);
  assert.match(biduriErrorText({ code: 'functions/deadline-exceeded' }), /נשמר/,
    'אחרי timeout היא חייבת לדעת שמה שהועבר לא אבד');
  assert.equal(biduriErrorText({ message: 'משהו אחר' }), 'משהו אחר');
  assert.equal(biduriErrorText(null), 'משהו נתקע. אפשר לנסות שוב.');
});

// ---------------------------------------------------------------------------
// השרת
// ---------------------------------------------------------------------------

test('שלוש הפונקציות חסומות לכל מי שאינה מאיה', () => {
  /* זאת הגנה אמיתית ולא נוחות: הן קוראות וכותבות רעיונות של כולן. */
  for (const [name, src] of [
    ['recategorizeBiduri', REPORT_FN],
    ['applyRecategorizeBiduri', APPLY_FN],
    ['undoRecategorizeBiduri', UNDO_FN],
  ]) {
    assert.match(src, /request\.auth\.token\.email !== ADMIN_EMAIL/, `${name} בלי שומר מנהלת`);
    assert.match(src, /permission-denied/, `${name} בלי דחייה`);
  }
});

test('הדוח לא כותב כלום, ואין בו בכלל מסלול כתיבה', () => {
  assert.doesNotMatch(REPORT_FN, /\.update\(/, 'פונקציית הדוח כותבת');
  assert.doesNotMatch(REPORT_FN, /\.set\(/, 'פונקציית הדוח כותבת');
  assert.doesNotMatch(REPORT_FN, /request\.data\.apply/, 'דגל apply מחזיר מסלול כתיבה בלי אישור');
});

test('הכתיבה מקבלת את ההחלטות מהדוח, ולא מסווגת מחדש', () => {
  /* סיווג שני היה יכול להחזיר קטגוריה אחרת ממה שמאיה אישרה בדוח. */
  assert.match(APPLY_FN, /request\.data\.decisions/);
  assert.doesNotMatch(APPLY_FN, /callAnthropic/, 'הכתיבה מסווגת מחדש');
  assert.match(APPLY_FN, /if \(!Array\.isArray\(decisions\) \|\| decisions\.length === 0\)/,
    'כתיבה בלי החלטות חייבת להיכשל, לא לסווג בעצמה');
  assert.match(APPLY_FN, /!CATEGORIES\.includes\(to\)/, 'יעד שאינו אחת משלוש הקטגוריות');
});

test('הכתיבה קוראת כל רעיון שוב, ולא דורסת מה שהשתנה בינתיים', () => {
  assert.match(APPLY_FN, /if \(idea\.category !== 'בידורי'\)/,
    'רעיון שהלקוחה שינתה בעצמה חייב להידלג');
  assert.match(APPLY_FN, /categoryBefore: 'בידורי'/, 'בלי categoryBefore אין דרך חזרה');
  assert.match(APPLY_FN, /categoryAfter: to/, 'בלי categoryAfter ההחזרה דורסת בחירה מאוחרת');
});

test('ההחזרה אחורה מכבדת לקוחה ששינתה רעיון בעצמה', () => {
  assert.match(UNDO_FN, /idea\.categoryAfter && idea\.category !== idea\.categoryAfter/);
  assert.match(UNDO_FN, /kept \+= 1;/, 'מה שלא הוחזר חייב להיספר ולהידווח');
});

test('רעיונות מחוקים לא נספרים ולא נוגעים בהם', () => {
  /* מחיקה באפליקציה היא רכה. בלי הסינון הזה הדוח סופר אשפה, והמחוקים
     תופסים חלק מהמנה ומסתירים רעיונות אמיתיים. */
  assert.match(REPORT_FN, /!\(doc\.data\(\) \|\| \{\}\)\.deletedAt/);
  assert.match(APPLY_FN, /deletedAt/, 'ספירת הנותרים חייבת לדלג על מחוקים גם היא');
});

test('הדוח מזהה של מי הרעיון', () => {
  /* השדה בקולקציה הוא ownerUid, לא uid. עם uid כל שורה בדוח היתה
     חוזרת בלי שום שיוך, והדוח הוא שער הביקורת היחיד לפני כתיבה. */
  assert.match(REPORT_FN, /ownerUid: idea\.ownerUid \|\| null/);
  assert.doesNotMatch(REPORT_FN, /uid: idea\.uid/);
});

test('מנה חסומה משני הכיוונים, גם למספר שלילי', () => {
  /* Math.min(-1, 150) הוא -1, ו-slice(0, -1) הוא כל המסמכים חסר אחד -
     כלומר ההפך מהגבול. */
  assert.match(REPORT_FN, /Math\.min\(Math\.max\(Math\.trunc\(asked\), 1\), BIDURI_BATCH\)/);
  assert.match(REPORT_FN, /Number\.isFinite\(asked\)/, 'ערך שאינו מספר הפך את המנה לריקה בשקט');
  assert.match(APPLY_FN, /decisions\.length > BIDURI_BATCH/);
});

test('המסווג יכול להחזיר רק את שלוש הקטגוריות שנשארו, ובאופן יציב', () => {
  assert.match(REPORT_FN, /category = CATEGORIES\[Number\(parsed\.categoryIndex\) - 1\] \|\| null;/);
  assert.doesNotMatch(REPORT_FN, /ALL_CATEGORIES|LEGACY_CATEGORIES/,
    'סיווג מתוך הרשימה הישנה יכול להחזיר "בידורי" לעצמו');
  assert.match(REPORT_FN, /temperature: 0/, 'בלי זה אותו רעיון יכול לקבל תשובה אחרת בכל הרצה');
});

// ---------------------------------------------------------------------------
// המסך
// ---------------------------------------------------------------------------

test('הכפתור של המסך מוסתר מכל מי שאינה מאיה', () => {
  assert.match(HTML, /id="biduri-migrate-btn"[^>]*hidden/, 'הכפתור חייב להיות מוסתר ב-HTML עצמו');
  assert.match(APP, /getElementById\('biduri-migrate-btn'\)\.hidden = !isAdmin;/);
  assert.match(APP, /biduriModule\.wireBiduriMigration\(\);/);
  assert.match(APP, /import\('\.\/biduri-migration\.js'\)/, 'המודול נטען רק בחבילת המנהלת');
});

test('התכונות הקבועות של המנהלת מחוברות לפני המסך הזמני', () => {
  /* אם החיבור של מסך זמני ייפול, הוא לא אמור לקחת איתו את "מעקב
     לקוחות" ואת טופס ההתראות, שמחוברים באותו then. */
  assert.ok(APP.indexOf('clientUsageModule.wireClientUsageView();') <
    APP.indexOf('biduriModule.wireBiduriMigration();'));
  assert.ok(APP.indexOf("getElementById('client-usage-back-btn')") <
    APP.indexOf('biduriModule.wireBiduriMigration();'));
});

test('כל מזהה שהמסך פונה אליו קיים ב-HTML', () => {
  const ids = [...MODULE.matchAll(/(?:^|[^A-Za-z])el\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length >= 8, 'הבדיקה לא בודקת כלום אם לא נמצאו מזהים');
  const missing = [...new Set(ids)].filter((id) => !HTML.includes(`id="${id}"`));
  assert.deepEqual(missing, [], `מזהים חסרים: ${missing.join(', ')}`);
});

test('דיאלוג האישור נצבע מעל המודאל, אחרת הלחיצה נראית מתה', () => {
  /* #confirm-dialog מוכרז ב-HTML לפני #biduri-modal, ושניהם .modal עם
     z-index 50. בלי רמה משלו הוא נשאר מתחת, והלחיצה על "להחיל" רק
     מכהה את המסך בלי שום דיאלוג, שום הודעה ושום דרך להתקדם. */
  assert.ok(HTML.indexOf('id="confirm-dialog"') < HTML.indexOf('id="biduri-modal"'),
    'אם הסדר התהפך, הבדיקה הזאת כבר לא מתארת את הסיכון');
  const rule = CSS.match(/\.confirm-dialog-modal\s*\{[^}]*z-index:\s*(\d+)/);
  assert.ok(rule, 'אין ל-.confirm-dialog-modal רמת z משלו');
  const modalZ = CSS.match(/\.modal\s*\{[\s\S]*?z-index:\s*(\d+)/);
  assert.ok(modalZ, 'לא נמצא z-index של .modal');
  assert.ok(Number(rule[1]) > Number(modalZ[1]),
    `דיאלוג האישור (${rule[1]}) חייב להיות מעל .modal (${modalZ[1]})`);
});

test('שתי הפעולות שמשנות נתונים עוברות דרך אישור', () => {
  const applyAt = MODULE.indexOf('async function applyReport()');
  const undoAt = MODULE.indexOf('async function undo()');
  assert.ok(applyAt > 0 && undoAt > applyAt);
  for (const [name, src] of [
    ['החלה', MODULE.slice(applyAt, undoAt)],
    ['החזרה', MODULE.slice(undoAt, MODULE.indexOf('export function wireBiduriMigration'))],
  ]) {
    assert.match(src, /await confirmDialog\(/, `${name} בלי אישור`);
    assert.match(src, /if \(!ok\) return;/, `${name} ממשיכה גם בביטול`);
  }
});

test('"להחיל" בלי החלטות בזיכרון מסביר, ולא שולח בקשה ריקה', () => {
  const src = MODULE.slice(MODULE.indexOf('async function applyReport()'), MODULE.indexOf('async function undo()'));
  assert.match(src, /if \(!pendingDecisions\.length\)/);
  assert.ok(src.indexOf('if (!pendingDecisions.length)') < src.indexOf('confirmDialog'),
    'הבדיקה חייבת לקרות לפני שנפתח דיאלוג אישור על כלום');
  assert.match(src, /decisions: pendingDecisions/, 'נשלח בדיוק מה שהוצג בדוח');
});

test('שלושת מסלולי הכשל על המסך מסבירים את עצמם, והכפתורים חוזרים לעבוד', () => {
  const uses = [...MODULE.matchAll(/fail\(err\);/g)];
  assert.equal(uses.length, 3, 'דוח, החלה והחזרה');
  const finallies = [...MODULE.matchAll(/\} finally \{\s*setBusy\(false\);/g)];
  assert.equal(finallies.length, 3, 'כפתור שנשאר כבוי בלי הסבר נקרא כמו אפליקציה שבורה');
  assert.match(MODULE, /errorEl\.hidden = false;/);
});

test('פתיחה שנייה של המסך לא מציגה את תוצאות הפעם הקודמת', () => {
  const open = MODULE.slice(MODULE.indexOf("openBtn.addEventListener"), MODULE.indexOf('closeBtn.addEventListener'));
  for (const cleared of ['biduri-summary', 'biduri-status', 'biduri-error', 'biduri-list-wrap', 'biduri-list']) {
    assert.ok(open.includes(cleared), `${cleared} לא מתאפס בפתיחה`);
  }
  assert.match(open, /pendingDecisions = \[\];/, 'החלטות מהפעם הקודמת נשארות בזיכרון');
  assert.match(open, /applyBtn\.hidden = true;/);
});

test('כל שורה בדוח נצבעת לפי הקטגוריה שהיא עוברת אליה', () => {
  assert.match(MODULE, /to\.style\.color = categoryColorVar\(row\.to\);/);
  assert.doesNotMatch(CSS, /\.biduri-row-to \{[^}]*--cat-baal-erech/,
    'צבע קבוע אחד לכל השורות לא נושא שום מידע');
});
