import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 30/09/2026: מאיה פתחה את המסך וראתה טופס שהקוד הסתיר.
//
// הסיבה: תכונת hidden ב-HTML שווה ל-display:none בגיליון ברירת המחדל של
// הדפדפן, וכל כלל CSS שנותן לאלמנט display מנצח אותה. .st-sheet-ask היה
// display:flex, ולכן hidden לא עשה כלום.
//
// זה קרה כבר פעם אחת בפורטל, ושם נבנתה בדיקה כזאת. היא לא הועתקה לכאן,
// וזה חזר. הבדיקה הזאת סורקת את כל האלמנטים שמוסתרים ב-index.html או
// מהקוד, ומוודאת שלמחלקה שלהם יש כלל [hidden] מפורש.

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
// תגובות ב-CSS מכילות שמות מחלקות ("במקום .btn-text"), ובלי הסרתן הבדיקה
// מדווחת על מחלקות שאין להן כלל display בכלל.
const CSS = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

/** כל המחלקות שיש להן כלל CSS שקובע display */
function classesWithDisplay(css) {
  const out = new Set();
  const blocks = css.split('}');
  for (const block of blocks) {
    const at = block.indexOf('{');
    if (at === -1) continue;
    const selector = block.slice(0, at);
    const body = block.slice(at + 1);
    const display = (body.match(/(?:^|[;\s])display\s*:\s*([^;]+)/) || [])[1];
    if (!display) continue;
    // כלל שכבר מסתיר לא יכול לגרום לאלמנט מוסתר להופיע
    if (display.trim() === 'none') continue;
    if (selector.includes('[hidden]')) continue;
    // רק המחלקה של האלמנט עצמו מקבלת את ה-display, לא של האבות שלו
    for (const part of selector.split(',')) {
      const target = part.trim().split(/\s+|>|\+|~/).filter(Boolean).pop() || '';
      for (const m of target.matchAll(/\.([a-zA-Z][\w-]*)/g)) out.add(m[1]);
    }
  }
  return out;
}

/** כל המחלקות שיש להן כלל שמבטל אותן כשהן hidden */
function classesGuarded(css) {
  const out = new Set();
  for (const block of css.split('}')) {
    const at = block.indexOf('{');
    if (at === -1) continue;
    const selector = block.slice(0, at);
    const body = block.slice(at + 1);
    if (!selector.includes('[hidden]')) continue;
    if (!/display\s*:\s*none/.test(body)) continue;
    for (const part of selector.split(',')) {
      if (!part.includes('[hidden]')) continue;
      for (const m of part.matchAll(/\.([a-zA-Z][\w-]*)/g)) out.add(m[1]);
    }
  }
  return out;
}

/** כל אלמנט ב-HTML שנושא hidden, עם המחלקות שלו */
function hiddenElements(html) {
  const out = [];
  for (const m of html.matchAll(/<([a-zA-Z][\w-]*)\s([^>]*?)\bhidden\b([^>]*)>/g)) {
    const attrs = `${m[2]} ${m[3]}`;
    const cls = (attrs.match(/class="([^"]*)"/) || [, ''])[1].split(/\s+/).filter(Boolean);
    const id = (attrs.match(/id="([^"]*)"/) || [, ''])[1];
    out.push({ tag: m[1], id, classes: cls });
  }
  return out;
}

test('כל אלמנט מוסתר באמת נעלם, ולא רק מתיימר', () => {
  const withDisplay = classesWithDisplay(CSS);
  const guarded = classesGuarded(CSS);
  const broken = [];

  for (const el of hiddenElements(HTML)) {
    const offenders = el.classes.filter((c) => withDisplay.has(c) && !guarded.has(c));
    if (offenders.length) broken.push(`#${el.id || el.tag} · ${offenders.join(', ')}`);
  }

  assert.deepEqual(
    broken,
    [],
    `אלמנטים שמוסתרים אבל כלל display יגבר על hidden:\n  ${broken.join('\n  ')}\n` +
      'צריך להוסיף כלל .<class>[hidden] { display: none; }'
  );
});

test('הבדיקה באמת בודקת משהו', () => {
  assert.ok(hiddenElements(HTML).length >= 5, 'ציפינו לכמה אלמנטים מוסתרים ב-HTML');
  assert.ok(classesWithDisplay(CSS).size >= 20, 'ציפינו להרבה מחלקות עם display');
});

test('הבדיקה תופסת את המקרה שבאמת קרה', () => {
  const css = '.demo { display: flex; }';
  const html = '<form id="x" class="demo" hidden></form>';
  const withDisplay = classesWithDisplay(css);
  const guarded = classesGuarded(css);
  const el = hiddenElements(html)[0];
  assert.ok(el.classes.some((c) => withDisplay.has(c) && !guarded.has(c)), 'צריך להיתפס');

  const fixed = `${css} .demo[hidden] { display: none; }`;
  const guardedNow = classesGuarded(fixed);
  assert.ok(el.classes.every((c) => guardedNow.has(c)), 'ואחרי התיקון לא');
});
