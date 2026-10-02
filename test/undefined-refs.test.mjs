import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * מזהה שנקרא אבל לא הוגדר.
 *
 * 02/10/2026 (מאיה): "עדכנתי בבוקר את טבלת קהל יעד וכל הסעיפים אצלי לא
 * השתנו". הסיבה: `audiences: table.audiences.map(stripDerived)` נכנס
 * ב-01/10, אבל stripDerived מעולם לא הוגדר. כל סנכרון קרס ב-ReferenceError,
 * והטבלאות של כל 42 הלקוחות היו קפואות יממה שלמה. שום בדיקה לא תפסה את זה,
 * כי `node --check` בודק תחביר בלבד וזה תחביר תקין לגמרי.
 *
 * זאת הפעם השנייה שמזהה לא מוגדר מגיע לפרודקשן בפרויקט הזה.
 *
 * הבדיקה שמרנית בכוונה: היא בודקת רק מזהים שמופיעים כקריאה `X(` או כהעברה
 * ערומה `(X)` / `, X)`, ורק כשהשם אינו מופיע בשום הגדרה בקובץ ואינו גלובלי
 * מוכר. מוטב לפספס מקרה נדיר מאשר להתריע על קוד תקין.
 */

const GLOBALS = new Set([
  // שפה
  'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'Math', 'JSON', 'RegExp',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Symbol', 'Error', 'TypeError',
  'RangeError', 'Proxy', 'Reflect', 'BigInt', 'Intl', 'Infinity', 'NaN', 'undefined',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'encodeURI', 'decodeURI', 'structuredClone', 'queueMicrotask',
  // ריצה
  'require', 'module', 'exports', 'process', 'console', 'Buffer', 'URL', 'URLSearchParams',
  'fetch', 'Headers', 'Request', 'Response', 'AbortController', 'AbortSignal', 'TextDecoder',
  'TextEncoder', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate',
  'globalThis', '__dirname', '__filename',
  // דפדפן
  'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'location', 'history',
  'Image', 'File', 'Blob', 'FormData', 'FileReader', 'CustomEvent', 'Event', 'HTMLElement',
  'IntersectionObserver', 'MutationObserver', 'ResizeObserver', 'createImageBitmap',
  'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'alert', 'confirm',
  'caches', 'self', 'clients', 'crypto', 'performance', 'matchMedia', 'Notification',
  'atob', 'btoa', 'Uint8Array', 'ArrayBuffer', 'DataView', 'WebSocket', 'XMLHttpRequest',
  // מילות מפתח שנראות כמו קריאה
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'new', 'await',
  'yield', 'delete', 'void', 'in', 'of', 'do', 'else', 'case', 'throw', 'super', 'this',
  'async', 'try', 'finally', 'break', 'continue', 'export', 'import', 'default', 'instanceof',
]);

function declaredNames(src) {
  const names = new Set();
  const add = (re, group = 1) => {
    for (const m of src.matchAll(re)) {
      String(m[group] || '')
        .split(/[\s,{}[\]:]+/)
        .map((x) => x.trim())
        .filter((x) => /^[A-Za-z_$][\w$]*$/.test(x))
        .forEach((x) => names.add(x));
    }
  };
  add(/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g);
  add(/\b(?:const|let|var)\s+([^=;\n]+)/g);
  add(/\bimport\s+([^;]+?)\s+from/g);
  // פרמטרים של פונקציות ושל חיצים
  add(/\bfunction\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/g);
  add(/\(([^()]*)\)\s*=>/g);
  add(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*=>/gm);
  add(/\bcatch\s*\(([^)]*)\)/g);
  // מפתחות בקיצור אובייקט אינם הגדרה, אבל גם אינם שימוש ערום
  return names;
}

function suspiciousRefs(src) {
  const used = new Map();
  const note = (name, index) => {
    if (!name || GLOBALS.has(name)) return;
    if (!used.has(name)) used.set(name, index);
  };
  // קריאה: X(  כשלפניו אינו נקודה ואינו תו של שם
  for (const m of src.matchAll(/(^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/gm)) note(m[2], m.index);
  // העברה ערומה: .map(X) / .filter(X) / (X) בסוף ארגומנט
  for (const m of src.matchAll(/\.\s*(?:map|filter|forEach|find|some|every|sort|then|catch)\(\s*([A-Za-z_$][\w$]*)\s*\)/g)) {
    note(m[1], m.index);
  }
  return used;
}

function stripNoise(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

function scan(dir, file) {
  const raw = readFileSync(new URL(`../${dir}/${file}`, import.meta.url), 'utf8');
  const src = stripNoise(raw);
  /* ההגדרות נקראות מהמקור המלא והשימושים מהמנוקה, וזה בכוונה הכיוון
     השמרני: הורדת הערות ומחרוזות בולעת לפעמים שורת הגדרה שלמה, ואז הבדיקה
     הייתה מתריעה על קוד תקין. עודף הגדרות מפספס מקרה נדיר, עודף אזעקות
     הופך את הבדיקה לרעש שמתעלמים ממנו. */
  const declared = declaredNames(raw);
  const missing = [];
  for (const [name] of suspiciousRefs(src)) {
    if (declared.has(name)) continue;
    // מזהה שמופיע גם כמאפיין (obj.name) הוא כמעט תמיד שימוש לגיטימי
    if (new RegExp(`\\.${name}\\b`).test(src)) continue;
    missing.push(name);
  }
  return missing;
}

const dirs = { functions: readdirSync(new URL('../functions/', import.meta.url)), js: readdirSync(new URL('../js/', import.meta.url)) };

test('אין מזהה שנקרא בלי שהוגדר, בשרת', () => {
  const found = [];
  for (const file of dirs.functions.filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))) {
    scan('functions', file).forEach((name) => found.push(`${name}  (functions/${file})`));
  }
  assert.deepEqual(found, [], `מזהים שלא הוגדרו:\n${found.join('\n')}`);
});

test('אין מזהה שנקרא בלי שהוגדר, בדפדפן', () => {
  const found = [];
  for (const file of dirs.js.filter((f) => f.endsWith('.js'))) {
    scan('js', file).forEach((name) => found.push(`${name}  (js/${file})`));
  }
  assert.deepEqual(found, [], `מזהים שלא הוגדרו:\n${found.join('\n')}`);
});

test('הבדיקה באמת תופסת את המקרה שקרה', () => {
  const src = `
    const { getFirestore } = require('firebase-admin/firestore');
    function save(table) {
      return { audiences: table.audiences.map(stripDerived) };
    }
    module.exports = { save };
  `;
  const declared = declaredNames(stripNoise(src));
  const refs = [...suspiciousRefs(stripNoise(src)).keys()];
  assert.ok(refs.includes('stripDerived'), 'מזוהה כשימוש');
  assert.ok(!declared.has('stripDerived'), 'ולא כהגדרה');
});

test('הבדיקה לא מתריעה על קוד תקין', () => {
  const src = `
    const helper = (x) => x + 1;
    function run(list) { return list.map(helper); }
    module.exports = { run };
  `;
  const declared = declaredNames(stripNoise(src));
  assert.ok(declared.has('helper'));
  assert.ok(declared.has('run'));
  assert.ok(declared.has('list'), 'פרמטרים נספרים כהגדרה');
});
