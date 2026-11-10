// 10/11/2026: האם דגש 8 ("כמה קרוב לכסף") מסמן כמו מאיה, על רעיונות שלא
// הופיעו כדוגמה בהוראות. הרעיונות והסימונים של מאיה בקובץ JSON חיצוני
// (נתוני לקוחות, לא נכנסים לרפו).
//   node scripts/eval-conversion-1011.mjs <labels.json> <out.json> [model]
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { FEEDBACK_RULES } = require('../functions/system-prompt.js');

const [, , inFile, outFile, model = 'claude-sonnet-5'] = process.argv;
const key = readFileSync(`${process.env.TEMP}/xk.txt`, 'utf8').trim();
const items = JSON.parse(readFileSync(inFile, 'utf8'));
const section = FEEDBACK_RULES.slice(FEEDBACK_RULES.indexOf('8. כמה הרעיון קרוב לכסף'));

const out = [];
for (const it of items) {
  const prompt = `${section}\n\nתחום העסק: ${it.business}\nהרעיון: ${it.idea}\n\nלפי דגש 8 בלבד: ממיר, חשיפה או חלש? השיבו ב-JSON בלבד: {"label":"ממיר|חשיפה|חלש","why":"חצי משפט"}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
  });
  const j = await res.json();
  const text = (j.content || []).map((b) => b.text || '').join('');
  let p = {};
  try { p = JSON.parse(text.match(/\{[\s\S]*\}/)[0]); } catch { p = { label: '?', why: text.slice(0, 120) || JSON.stringify(j).slice(0, 200) }; }
  out.push({ client: it.client, idea: it.idea.slice(0, 90), maya: it.maya, model: p.label, why: p.why, ok: p.label === it.maya });
}
writeFileSync(outFile, JSON.stringify({ agree: out.filter((o) => o.ok).length, total: out.length, out }, null, 1), 'utf8');
console.error('done');
