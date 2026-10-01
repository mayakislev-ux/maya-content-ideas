import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// 01/10/2026 (מאיה): "על cold start לא, בלאי, פשוט לשלם עוד, אני משלמת
// הרבה. יש דרך בחינם גם?"
//
// יש. מדידה בפועל על המחשב הזה: googleapis 13,489ms, pdfkit 3,029ms,
// nodemailer 430ms, web-push 362ms - כולם נטענו ברמת המודול, כלומר בכל
// הפעלה קרה של כל פונקציה בפרויקט, גם כשאיש לא צריך אותם. אחרי שהועברו
// לטעינה עצלה, טעינת כל 27 הפונקציות ירדה מ-19.6 שניות ל-169ms.
// זה לא עולה כלום, בניגוד להחזקת מופע חם.
const HEAVY = ['googleapis', 'pdfkit', 'nodemailer', 'web-push'];
const DIR = new URL('../functions/', import.meta.url);

test('אף מודול כבד לא נטען ברמת המודול', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 5, "מצאנו את הקבצים");
  const offenders = [];
  for (const file of files) {
    const src = readFileSync(new URL(file, DIR), 'utf8');
    const lines = src.split(String.fromCharCode(10));
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('const ') && !trimmed.startsWith('let ')) return;
      for (const mod of HEAVY) {
        if (trimmed.includes("require('" + mod + "')")) offenders.push(file + ":" + (i + 1) + " " + mod);
      }
    });
  }
  assert.deepEqual(offenders, [], "מודול כבד שחזר לרמת המודול: " + offenders.join(", "));
});

test('הם עדיין נטענים, רק מתוך פונקציה', () => {
  const sheets = readFileSync(new URL('sheets-content.js', DIR), 'utf8');
  assert.ok(sheets.includes("function loadGoogle()"), "יש טוען עצל");
  assert.ok(sheets.includes("require('googleapis')"), "והוא באמת טוען");
  assert.ok(sheets.includes("new (loadGoogle()).auth.GoogleAuth"), "בסוגריים, אחרת new תופס את הקריאה");
});
