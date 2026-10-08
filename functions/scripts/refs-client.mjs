/* ניהול מנויי "רפרנסים בלבד" באפליקציית המוח השיווקי (79 ש"ח לחודש).
 *
 *   node scripts/refs-client.mjs add     dana@gmail.com
 *   node scripts/refs-client.mjs paid    dana@gmail.com      // אחרי חיוב: עוד חודש
 *   node scripts/refs-client.mjs stop    dana@gmail.com      // ביטול מנוי
 *   node scripts/refs-client.mjs list
 *
 * למה paidUntil ולא מתג כן/לא: חיוב חודשי שנכשל סוגר את הגישה מעצמו
 * ברגע שהתאריך עובר. עם מתג, כרטיס שנדחה היה משאיר גישה פתוחה עד
 * שמישהו היה שם לב ידנית, כלומר שירות בחינם בלי שאיש יודע.
 *
 * הלקוחה רואה אך ורק את מאגר ההשראה. זה נאכף ב-firestore.rules,
 * ב-enforceAllowlist בשרת, ורק בסוף גם בממשק.
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

/* 08/10/2026: אין עדיין מפתח שירות לפרויקט הזה על המחשב, רק לפורטל.
   עד שיהיה, אפשר לסמן לקוחה גם ידנית בקונסול של Firebase:
   Firestore → allowlist → המסמך של המייל → plan = refs (מחרוזת),
   paidUntil = תאריך. הסקריפט הזה עושה בדיוק את אותו דבר, בלי מקום
   לטעות בהקלדה, ברגע שיונח כאן מפתח. */
const KEY = process.env.CONTENT_IDEAS_KEY || String.raw`C:\dev\keys\content-ideas-key.json`;
const MONTHLY_ILS = 79;

let creds;
try {
  creds = JSON.parse(readFileSync(KEY, 'utf8'));
} catch {
  console.error(`לא נמצא מפתח שירות ב-${KEY}`);
  console.error('אפשר להוריד אותו מ-Firebase → Project settings → Service accounts,');
  console.error('או להצביע על מיקום אחר עם משתנה הסביבה CONTENT_IDEAS_KEY.');
  process.exit(1);
}
initializeApp({ credential: cert(creds) });
const db = getFirestore();

const [cmd, raw] = process.argv.slice(2);
const email = String(raw || '').trim().toLowerCase();
const il = (d) => (d ? d.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '-');

function monthFrom(start) {
  const d = new Date(start);
  d.setMonth(d.getMonth() + 1);
  return d;
}

if (cmd === 'list') {
  const snap = await db.collection('allowlist').get();
  const rows = [];
  snap.forEach((d) => {
    const v = d.data() || {};
    if (v.plan !== 'refs') return;
    const until = v.paidUntil?.toDate?.() ?? null;
    rows.push({ email: d.id, until, live: !until || until.getTime() > Date.now() });
  });
  if (!rows.length) console.log('אין מנויי רפרנסים.');
  rows.sort((a, b) => a.email.localeCompare(b.email));
  for (const r of rows) {
    console.log(`  ${r.live ? '●' : '○'} ${r.email.padEnd(30)} משולם עד ${il(r.until)}${r.live ? '' : '  (פג, הגישה סגורה)'}`);
  }
  console.log(`\nסך הכל: ${rows.length}`);
  process.exit(0);
}

if (!email.includes('@')) {
  console.error('שימוש: node scripts/refs-client.mjs add|paid|stop <מייל>  |  list');
  process.exit(1);
}

const ref = db.collection('allowlist').doc(email);
const snap = await ref.get();

if (cmd === 'add') {
  if (snap.exists && snap.data()?.plan !== 'refs') {
    console.error(`${email} כבר רשומה עם מנוי מלא. "add" היה מוריד אותה לרפרנסים בלבד.`);
    console.error('אם זה באמת מה שרצית, תמחקי קודם את השורה שלה ידנית.');
    process.exit(2);
  }
  const until = monthFrom(Date.now());
  await ref.set({ plan: 'refs', paidUntil: Timestamp.fromDate(until), monthlyIls: MONTHLY_ILS, addedAt: Timestamp.now() }, { merge: true });
  console.log(`\n${email} נוספה כמנוי רפרנסים, ${MONTHLY_ILS} ש"ח לחודש.`);
  console.log(`משולם עד ${il(until)}. היא מתחברת עם גוגל ורואה רק את מאגר ההשראה.`);
} else if (cmd === 'paid') {
  if (!snap.exists) {
    console.error(`${email} לא רשומה. קודם: add`);
    process.exit(2);
  }
  const now = Date.now();
  const cur = snap.data()?.paidUntil?.toDate?.() ?? null;
  /* מאריכים מהתאריך הקיים אם הוא עוד בתוקף, אחרת מהיום. ככה חיוב שהגיע
     יום אחרי לא גוזל ללקוחה את הימים שכבר שילמה עליהם, וגם לא מצטבר
     לה חודשים אחורה אם הייתה הפסקה. */
  const base = cur && cur.getTime() > now ? cur : new Date(now);
  const until = monthFrom(base);
  await ref.set({ paidUntil: Timestamp.fromDate(until) }, { merge: true });
  console.log(`${email}: הגישה פתוחה עד ${il(until)}`);
} else if (cmd === 'stop') {
  if (!snap.exists) {
    console.error(`${email} לא רשומה.`);
    process.exit(2);
  }
  await ref.delete();
  console.log(`${email} הוסרה. הגישה נסגרת בכניסה הבאה שלה.`);
} else {
  console.error('פקודות: add | paid | stop | list');
  process.exit(1);
}
process.exit(0);
