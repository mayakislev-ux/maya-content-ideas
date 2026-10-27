/* מבחן קיצון לצ'אט "דיוק זווית הנגשה לרעיון".
 *
 * 27/10/2026 (מאיה): "תריצי את הבדיקה הכי מחמירה שאת יכולה לכל הרעיונות אי
 * פעם שיכולים לכתוב, אגב גם רעיונות לתוכן אישי, זה חשוב לדייק לא רק עסקי".
 *
 * מה זה עושה: לוקח את הפרומפט האמיתי מ-functions/system-prompt.js, שולח
 * מולו רעיונות אמיתיים (רובם נשלפו מהמאגר שלה) ורעיונות קיצון, ובודק כל
 * תשובה בשתי שכבות: בדיקות קשיחות (אותיות לועזיות, כמה שאלות נשאלו, אורך,
 * שם זווית שקיים בבנק) ושופט מודל עם רובריקה (הפיכת כיוון, המצאת פרטים,
 * דרישת מסגור עסקי לרעיון אישי, קשר אמיתי בין זווית לרעיון).
 *
 * הרצה:
 *   set ANTHROPIC_API_KEY=...   (או: node scripts/stress-idea-chat.mjs --key C:\path\key.txt)
 *   node scripts/stress-idea-chat.mjs [--only personal] [--cases 5]
 *
 * הפלט: טבלה למסך + דוח מלא ב-scripts/stress-report.md
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { buildSystemPrompt } = require('../functions/system-prompt.js');

const MODEL = 'claude-sonnet-5';
const args = process.argv.slice(2);
const argOf = (flag) => { const i = args.indexOf(flag); return i > -1 ? args[i + 1] : null; };
const KEY = argOf('--key') ? readFileSync(argOf('--key'), 'utf8').trim() : process.env.ANTHROPIC_API_KEY;
if (!KEY) {
  console.error('חסר מפתח. ANTHROPIC_API_KEY בסביבה, או --key נתיב-לקובץ');
  process.exit(1);
}

/* הפרופילים האמיתיים במאגר: מתוך 60, ל-51 אין שם ואין לשון פנייה ול-31 אין
   קהל יעד. לכן "פרופיל ריק" הוא לא מקרה קצה אלא רוב המשתמשות. */
const FULL = { name: 'נועה', pronoun: 'את', business: 'הלחמת ריסים', primaryAudience: 'נשים שכירות שמחפשות הכנסה נוספת', secondaryAudience: 'קוסמטיקאיות ותיקות' };
const EMPTY = { name: '', pronoun: '', business: '', primaryAudience: '', secondaryAudience: '' };
const MALE = { name: 'יואב', pronoun: 'אתה', business: 'אימון כושר אישי', primaryAudience: 'גברים 35+ אחרי פציעה', secondaryAudience: '' };

const CASES = [
  // ---------- תוכן אישי. זה מה שמאיה ביקשה לשים לב אליו ----------
  { id: 'personal-trip', kind: 'אישי', profile: FULL, real: true, context: { category: 'אישי', audienceScope: 'רחב' },
    idea: '21 ימים של טיול גרמו לי להבין משהו שלא הבנתי בחודשיים. לפעמים צריך להתרחק מהשגרה כדי להבין',
    must: 'לא לדרוש שזה יתחבר לבעיה של הקהל או למה שהיא מוכרת. תוכן אישי נועד לאמון וחיבור, לא לפתרון בעיה' },
  { id: 'personal-anxiety', kind: 'אישי רגיש', profile: FULL, real: true, context: { category: 'אישי', audienceScope: 'רחב' },
    idea: 'כמעט סגרתי את העסק בגלל חרדה חברתית',
    must: 'לא לשפוט אותה, לא לדחוף אותה לחשוף יותר ממה שהיא רוצה, ולא להפוך את זה לטיפ עסקי' },
  { id: 'personal-partner', kind: 'אישי', profile: FULL, real: true, context: { category: 'אישי', audienceScope: 'רחב' },
    idea: 'הדבר הכי חשוב שלמדתי על בחירת בן זוג',
    must: 'לא לפסול כי זה לא קשור לריסים. זוגיות היא חלק מוגדר מקטגוריית אישי' },
  { id: 'personal-wedding', kind: 'אישי', profile: FULL, real: true,
    idea: 'כשאתחתן אעדיף לחסוך על שמלה שלישית אבל לא על האיפור שלי',
    must: 'לזהות שיש כאן כבר אמירה חדה, לא לדרוש "מה הבעיה שזה פותר"' },
  { id: 'personal-dayinlife', kind: 'אישי', profile: FULL,
    idea: 'יום בחיי',
    must: 'לשאול מה מיוחד ביום הזה, לא להטיף שזה נושא ולא רעיון' },
  { id: 'personal-grief', kind: 'אישי קיצוני', profile: FULL,
    idea: 'אבא שלי נפטר לפני שנה ובגלל זה פתחתי את העסק',
    must: 'רגישות אמיתית, בלי "איזה רעיון מעולה", בלי לנתח את האבל ככלי שיווקי' },
  { id: 'personal-mom', kind: 'אישי', profile: FULL,
    idea: 'אני אמא לשלושה ועובדת מהבית וזה בלגן',
    must: 'שאלה אחת ממוקדת, לא הרצאה על ספציפיות' },
  { id: 'personal-value', kind: 'אישי/ערכי', profile: FULL,
    idea: 'הערך הכי חשוב שלי זה יושרה',
    must: 'לבקש רגע אחד קונקרטי שבו היושרה עלתה לה במשהו, לא לפסול כסיסמה ולעצור' },

  // ---------- בעל ערך ומכירתי ----------
  { id: 'claim-negative-pr', kind: 'בעל ערך', profile: FULL, real: true,
    idea: 'יש דבר כזה פרסום שלילי',
    must: 'לשמור על הכיוון: פרסום שפוגע לעסק. אסור לשאול אם היא מתכוונת שזה מועיל' },
  { id: 'claim-no-hard-client', kind: 'בעל ערך', profile: FULL,
    idea: 'אין דבר כזה לקוח קשה',
    must: 'לשמור על הכיוון ההפוך מהאמרה המוכרת, בלי להפוך אותו' },
  { id: 'topic-only', kind: 'נושא כללי', profile: FULL,
    idea: 'קורסים לא מקצועיים',
    must: 'שאלה אחת בלבד, ולא שלוש' },
  { id: 'already-excellent', kind: 'כבר מצוין', profile: FULL,
    idea: 'טעות של הרבה בעלי עסקים לתמחר את עצמם לפי כמה שהם חושבים שהם שווים ולא לפי איך שהעמוד אינסטגרם נראה, אלא אם כן הם אנשי מכירות כרישים',
    must: 'לא לשאול כלום, לסמן RECOGNIZED_EXCELLENT ולעבור ישר ל-5 זוויות' },
  { id: 'listicle', kind: 'רשימה', profile: FULL,
    idea: '3 סימנים שהקוסמטיקאית שלך לא מקצועית',
    must: 'לזהות כרעיון, לא לשאול אם זו שאלה' },
  { id: 'sales', kind: 'מכירתי', profile: FULL, context: { category: 'מכירתי', audienceScope: 'עיקרי' },
    idea: 'למה אני לא מוכרת חבילות של 10 טיפולים',
    must: 'להתייחס לזה כתוכן מכירתי לגיטימי' },
  { id: 'provocative', kind: 'דעה', profile: FULL,
    idea: 'תפסיקו להעלות לפני ואחרי',
    must: 'לא לרכך לה את הדעה ולא להפוך אותה' },

  // ---------- קצוות וחוסן ----------
  { id: 'one-word', kind: 'מילה אחת', profile: FULL, idea: 'ריסים',
    must: 'שאלה אחת קצרה, בלי הרצאה' },
  { id: 'off-topic', kind: 'לא רעיון', profile: FULL, idea: 'כמה עולה הקורס של מאיה?',
    must: 'להסביר בקצרה שזה לא בתחום ולהפנות למאיה' },
  { id: 'typos', kind: 'שגיאות כתיב', profile: FULL,
    idea: 'רעיון שלי זה שבעלי עסקים לא יודעם לתמחר ת עצמם וזה פוגע בהם',
    must: 'לא להעתיק את השגיאות, ולהבין את הרעיון' },
  { id: 'male-personal', kind: 'לשון זכר', profile: MALE,
    idea: 'השנה הראשונה שלי כמאמן הייתה כישלון כלכלי',
    must: 'לשון זכר עקבית לכל אורך התשובה' },
  { id: 'empty-profile', kind: 'פרופיל ריק', profile: EMPTY,
    idea: 'תוכן שמביא לקוחות',
    must: 'אסור להתייחס לקהל יעד כידוע כשאין פרופיל, וצריך דרך לברר' },
  { id: 'long-ramble', kind: 'ארוך ומבולבל', profile: FULL,
    idea: 'אז אני רוצה לעשות סרטון על זה שלקוחות מגיעות אליי אחרי שעשו ריסים אצל מישהי אחרת וזה יצא רע, ואז הן מספרות לי שהן שילמו 150 שקל וזה החזיק שבוע, ואני אומרת להן שזה בגלל החומרים, אבל גם בגלל שלא עשו להן בדיקת רגישות, ובכלל אני חושבת שהתחום מלא באנשים שעושים קורס של יומיים ופותחים עסק, וזה מסוכן, ואני רוצה גם להגיד משהו על זה שהמחיר לא אמור להיות השיקול היחיד, ואולי גם על זה שאני עושה אחריות',
    must: 'לשלוף את הנקודה החדה מתוך מה שהיא כתבה, לא להמציא נושא חדש' },
  { id: 'archive-blob', kind: 'מהארכיון', profile: FULL, real: true,
    idea: 'למחוק את זה vs לפרסם את זה\nפורמט:דיבור למצלמה\nזווית הנגשה:השוואה',
    must: 'לא להתייחס לשורות של הפורמט והזווית כאילו הן חלק מהרעיון' },
  { id: 'trend', kind: 'טרנד', profile: FULL,
    idea: 'הסאונד החדש בטיקטוק של "זה לא אני זאת היא"',
    must: 'לעזור לחבר את הטרנד לנישה, לא לפסול' },
  { id: 'risky-claim', kind: 'אחריות', profile: FULL,
    idea: 'רואקוטן זה רעל ואסור לאף אחת לקחת את זה',
    must: 'לא לאשר אמירה רפואית גורפת כמו שהיא' },
];

const CHECKS = [
  { id: 'latin', label: 'אותיות לועזיות בתשובה', bad: (r) => /[A-Za-z]{2,}/.test(r.replace(/https?:\/\/\S+/g, '').replace(/\[\[[A-Z_]+\]\]/g, '')) },
  { id: 'two-questions', label: 'יותר משאלה אחת', bad: (r) => (r.match(/\?/g) || []).length > 1 && !/^\s*\[\[RECOGNIZED/.test(r) && !/\n\s*5[.)]/.test(r) },
  { id: 'lecture', label: 'הודעת הבהרה ארוכה מדי', bad: (r) => !/\n\s*5[.)]/.test(r) && r.length > 700 },
  { id: 'markdown-head', label: 'כותרות מרקדאון', bad: (r) => /^#{1,6}\s/m.test(r) },
];

const BANK = (() => {
  const src = readFileSync(new URL('../functions/system-prompt.js', import.meta.url), 'utf8');
  const start = src.indexOf('בנק זוויות הנגשה לרעיון');
  const block = src.slice(start, src.indexOf('שלב אחרון', start));
  return [...block.matchAll(/^\s*\d{1,2}\.\s*(.+?)\s+-\s/gm)].map((m) => m[1].trim());
})();

async function anthropic(body) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

const JUDGE = `את/ה בודק/ת איכות של עוזר תוכן. לפניך רעיון שמשתמשת כתבה, הדרישה שהתשובה הייתה צריכה לעמוד בה, והתשובה בפועל.
החזר/י JSON בלבד בפורמט: {"pass": true|false, "flipped": true|false, "invented": true|false, "forcedBusiness": true|false, "angleLinks": true|false|null, "why": "משפט אחד בעברית"}
flipped = התשובה הפכה או שינתה את הכיוון של הטענה שהמשתמשת כתבה.
invented = התשובה המציאה פרט שהמשתמשת לא נתנה (מספר, מקצוע, מקרה, שם).
forcedBusiness = התשובה דרשה מסגור עסקי/קהל יעד/בעיה שהרעיון לא התיימר לפתור, ברעיון אישי.
angleLinks = אם התשובה כוללת 5 זוויות: האם כל אחת אומרת במפורש מה הקשר שלה לרעיון שנכתב. אחרת null.
pass = התשובה עומדת בדרישה.`;

async function judge(c, reply) {
  const text = await anthropic({
    model: MODEL, max_tokens: 400,
    messages: [{ role: 'user', content: `${JUDGE}\n\nהרעיון: ${c.idea}\n\nהדרישה: ${c.must}\n\nהתשובה:\n"""${reply}"""` }],
  });
  try { return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { return { pass: null, why: 'השופט לא החזיר JSON' }; }
}

const only = argOf('--only');
const limit = Number(argOf('--cases') || 0);
let list = only ? CASES.filter((c) => c.kind.includes(only) || c.id.includes(only)) : CASES;
if (limit) list = list.slice(0, limit);

const out = [];
for (const c of list) {
  process.stdout.write(`▸ ${c.id} ... `);
  let reply = '';
  let err = null;
  const t0 = Date.now();
  try {
    reply = await anthropic({
      model: MODEL, max_tokens: 8192,
      system: buildSystemPrompt(c.profile, c.context || null),
      messages: [{ role: 'user', content: c.idea }],
    });
  } catch (e) { err = String(e.message).slice(0, 200); }
  const ms = Date.now() - t0;

  const hard = err ? [] : CHECKS.filter((ch) => ch.bad(reply)).map((ch) => ch.label);
  const summary = /\[\[IDEA_SUMMARY\]\]([^\n]*)/.exec(reply || '');
  if (summary) {
    const angle = (summary[1].split('||')[1] || '').trim();
    if (angle && !BANK.includes(angle)) hard.push(`שם זווית מחוץ לבנק: ${angle}`);
  }
  const v = err ? { pass: false, why: err } : await judge(c, reply);
  out.push({ ...c, reply, ms, hard, v });
  console.log(v.pass === true && !hard.length ? 'עבר' : 'נפל');
}

const lines = ['# מבחן קיצון לצ\'אט דיוק הזווית', '', `הורץ: ${new Date().toLocaleString('he-IL')} | מקרים: ${out.length}`, ''];
for (const r of out) {
  const flags = [
    ...r.hard,
    r.v.flipped ? 'הפך את הכיוון' : '',
    r.v.invented ? 'המציא פרט' : '',
    r.v.forcedBusiness ? 'דרש מסגור עסקי' : '',
    r.v.angleLinks === false ? 'זוויות בלי קשר לרעיון' : '',
  ].filter(Boolean);
  lines.push(`## ${r.id} (${r.kind})${r.real ? ' · רעיון אמיתי מהמאגר' : ''}`);
  lines.push(`**הרעיון:** ${r.idea}`, '', `**דרישה:** ${r.must}`, '');
  lines.push(`**תוצאה:** ${flags.length ? `נפל - ${flags.join(', ')}` : 'עבר'} · ${(r.ms / 1000).toFixed(1)} שניות`);
  lines.push(`**השופט:** ${r.v.why || ''}`, '', '```', (r.reply || '').trim(), '```', '');
}
writeFileSync(new URL('./stress-report.md', import.meta.url), lines.join('\n'), 'utf8');

const failed = out.filter((r) => r.hard.length || r.v.pass === false || r.v.flipped || r.v.forcedBusiness);
console.log(`\nנפלו ${failed.length} מתוך ${out.length}`);
failed.forEach((r) => console.log('  ✗', r.id.padEnd(20), [...r.hard, r.v.why].filter(Boolean).join(' | ').slice(0, 110)));
console.log('\nהדוח המלא: scripts/stress-report.md');
