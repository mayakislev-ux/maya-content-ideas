/* הערכה אמיתית (לא "בעין") של צ'אט "דיוק רעיון ומסר": פרומפט ישן מול חדש.
 *
 * 06/11/2026 (מאיה): "בצ'אט לדיוק רעיון ומסר הוא כותב הכל ממש בשפה מוזרה ולא
 * בשפה שלי, נגיד דיברתי על בעלת עסק שעושה 6 ספרות בחודש אבל לידים קפואים מלא
 * ממומן והוא כתב לי במסר 'מחזור מדמם' מה זאת השפה הזאת".
 *
 * מה זה עושה: לוקח את הפרומפט הישן (master, דרך git) ואת החדש (מהתיקייה הזו),
 * שולח לשניהם את אותם 6 מקרים, באותו מודל ואותן הגדרות כמו checkIdea, ומדפיס
 * את התשובות זו לצד זו עם בדיקות קשיחות: מילים אסורות/דימויים, כמה מהביטויים
 * של המשתמש/ת חזרו, וסימנים להנחת מגדר של הקהל.
 *
 * זה כלי פיתוח בלבד. הוא לא נטען באפליקציה ולא נפרס.
 *
 * הרצה (המפתח רק בסביבה, אף פעם לא בקובץ):
 *   ANTHROPIC_API_KEY=... node scripts/eval-refine-chat.mjs [--only maya,coach] [--which old|new|both] [--turns 1|2]
 * הפלט: למסך, ועותק מלא ל---out אם ניתן.
 */
import { createRequire, Module } from 'node:module';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const argOf = (flag) => { const i = args.indexOf(flag); return i > -1 ? args[i + 1] : null; };
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('חסר ANTHROPIC_API_KEY בסביבה'); process.exit(1); }
const ONLY = argOf('--only') ? argOf('--only').split(',') : null;
const WHICH = argOf('--which') || 'both';
const TURNS = Number(argOf('--turns') || 2);
const OUT = argOf('--out');
const BASE = argOf('--base') || 'master';

/* אותן הגדרות כמו checkIdea ב-functions/index.js */
const MODEL = 'claude-sonnet-5';

/* --- טעינת שתי גרסאות הפרומפט --- */
function loadFromSource(src, filename) {
  const m = new Module(filename);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(dirname(filename));
  m._compile(src, filename);
  return m.exports;
}
const git = (p) => execSync(`git -C "${ROOT}" show ${BASE}:${p}`, { encoding: 'utf8', maxBuffer: 1 << 24 });
const OLD = loadFromSource(git('functions/system-prompt.js'), join(ROOT, 'functions', '__old_system_prompt.js'));
const NEW = require('../functions/system-prompt.js');

/* מצב הבעלים (מאיה) נוסף ב-index.js. בגרסה הישנה הוא מחרוזת בתוך index.js. */
function oldAdminText() {
  const src = git('functions/index.js');
  const m = /systemPrompt \+= '(\\n\\n\*\*מצב פתוח[^']*)'/.exec(src);
  if (!m) throw new Error('לא נמצא מצב פתוח ב-index.js הישן');
  return m[1].replace(/\\n/g, '\n');
}
const ADMIN = { old: oldAdminText(), new: NEW.ADMIN_OPEN_MODE ? `\n\n${NEW.ADMIN_OPEN_MODE}` : oldAdminText() };

function systemFor(version, c) {
  const mod = version === 'old' ? OLD : NEW;
  const profile = c.admin ? { name: c.profile.name, pronoun: c.profile.pronoun } : c.profile;
  let p = mod.buildSystemPrompt(profile, null);
  if (c.admin) p += ADMIN[version];
  return p;
}

/* --- המקרים --- */
const CASES = [
  {
    id: 'maya',
    admin: true,
    profile: { name: 'מאיה', pronoun: 'את' },
    /* כמו שהעוזר שולח: "על מה הסרטון" + "המסר" */
    seed: 'על מה הסרטון: בעלת עסק שעושה 6 ספרות בחודש אבל הלידים שלה קפואים, היא שמה מלא כסף על ממומן\nהמסר: שממומן לבד לא מספיק',
    reply: 'הלידים משאירים פרטים מהמודעה ולא עונים לטלפון, או שואלים כמה זה עולה ונעלמים. הם לא מכירים אותה בכלל. מה שאני רוצה שיבינו זה שהבעיה היא לא בממומן, אלא שאין תוכן שמחמם את הלידים לפני שהם מגיעים',
    phrases: ['6 ספרות', 'קפואים', 'ממומן', 'לידים'],
  },
  {
    id: 'coach',
    profile: { name: 'אורי', pronoun: 'אתה', business: 'אימון כושר אישי', primaryAudience: 'גברים בני 30-45 שעובדים במשרד' },
    seed: 'גברים שמתאמנים 3 פעמים בשבוע כבר שנה ולא רואים שינוי בבטן כי בערב הם אוכלים מה שנשאר בצלחת של הילדים',
    reply: 'המסר שלי זה שהאימונים בסדר גמור, מה שתוקע אותם זה האכילה בערב בלי לשים לב. הם בכלל לא סופרים את השאריות של הילדים',
    phrases: ['3 פעמים בשבוע', 'בטן', 'נשאר בצלחת של הילדים', 'בערב'],
  },
  {
    id: 'clinic',
    profile: { name: 'שירן', pronoun: 'את', business: 'קליניקה לטיפולי פנים ואקנה', primaryAudience: '' },
    seed: 'אנשים שמוציאים אלפי שקלים על קרמים מהסופר פארם ועדיין יש להם פצעונים',
    reply: 'הם קונים כל קרם שממליצים עליו בטיקטוק, מחליפים כל שבועיים, ואף אחד לא בדק להם מה סוג העור. המסר זה שבלי אבחון של העור הקרמים זה ניחוש',
    phrases: ['אלפי שקלים', 'קרמים', 'סופר פארם', 'פצעונים'],
  },
  {
    id: 'therapist',
    profile: { name: '', pronoun: '', business: 'טיפול זוגי', primaryAudience: 'זוגות נשואים 5-15 שנה' },
    seed: 'זוגות שמתווכחים כל ערב על מי משכיב את הילדים לישון, ובעצם הריב בכלל לא על זה',
    reply: 'הריב הוא על זה שאחד מרגיש שהוא סוחב לבד ואף אחד לא רואה אותו. אני רוצה שיבינו שכשהם רבים על השכבה הם בעצם רבים על הרגשה',
    phrases: ['כל ערב', 'משכיב את הילדים לישון', 'הריב', 'לבד'],
  },
  {
    id: 'vague',
    profile: { name: 'דנה', pronoun: 'את', business: 'ייעוץ משכנתאות', primaryAudience: 'זוגות צעירים שקונים דירה ראשונה' },
    seed: 'חשיבות של תכנון פיננסי',
    reply: 'זוגות שחותמים על דירה ורק אז הולכים לבנק לבדוק כמה משכנתא הם יקבלו, ואז מגלים שחסרים להם 200 אלף',
    phrases: ['דירה', 'בנק', 'משכנתא', '200 אלף'],
  },
  {
    id: 'marketer',
    profile: { name: 'רון', pronoun: 'אתה', business: 'שיווק דיגיטלי לעסקים קטנים', primaryAudience: 'בעלי עסקים קטנים' },
    seed: 'על מה הסרטון: בעלי עסקים שמעלים תוכן כל יום ואין פניות\nהמסר: תוכן בלי מסר ברור זה סתם רעש',
    reply: 'הם מעלים כל יום טיפ אחר, פעם על זה ופעם על זה, ואף אחד לא יודע מה הם בעצם מוכרים. המסר שלי שכמות לא מביאה פניות, מה שמביא פניות זה שיבינו מה אתה פותר',
    phrases: ['כל יום', 'אין פניות', 'מסר', 'תוכן'],
  },
].filter((c) => !ONLY || ONLY.includes(c.id));

/* --- קריאה למודל, כמו checkIdea (בלי סטרימינג) --- */
let calls = 0;
async function ask(system, messages) {
  calls += 1;
  const body = {
    model: MODEL, max_tokens: 8192,
    thinking: { type: 'adaptive' }, output_config: { effort: 'low' },
    system, messages,
  };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

/* --- בדיקות קשיחות --- */
const BANNED = [
  'מדמם', 'דימום', 'מדממ', 'דולף', 'דליפה', 'בור ללא תחתית', 'חור שחור', 'מכונת', 'מנוע צמיחה',
  'קרים כמו', 'קרח', 'מוקפא', 'מתים', 'גוסס', 'רעב', 'שורף', 'בוער', 'טובע', 'מסע', 'טרנספורמציה',
  'אותנטי', 'להעצים', 'מעורבות', 'המרה', 'אופטימיזציה', 'פיין', 'ערך מוסף', 'אקו', 'סינרגיה',
];
const FEM_AUDIENCE = /(בעלות עסקים|בעלות העסק|(?<![א-ת])נשים|מישהי|לקוחות שלך שהן|אמהות|את מרגישה|את מוציאה|את מתאמנת|היא מבינה|הן מבינות|תרגישי|שלך היא)/;
const askedQuestion = (t) => /\?/.test(t.replace(/\[\[IDEA_SUMMARY\]\][^\n]*/, ''));

function checks(text, c) {
  const banned = BANNED.filter((w) => text.includes(w));
  const kept = c.phrases.filter((p) => text.includes(p));
  const fem = (text.match(new RegExp(FEM_AUDIENCE.source, 'g')) || []);
  return { banned, kept: `${kept.length}/${c.phrases.length}`, fem, chars: text.length };
}

async function runCase(version, c) {
  const system = systemFor(version, c);
  const convo = [{ role: 'user', content: c.seed }];
  const t1 = await ask(system, convo);
  const out = [{ turn: 1, text: t1, ...checks(t1, c) }];
  /* תור שני רק אם התור הראשון שאל ולא סגר מסר: עונים במילים של המשתמש/ת */
  if (TURNS > 1 && askedQuestion(t1)) {
    convo.push({ role: 'assistant', content: t1 }, { role: 'user', content: c.reply });
    const t2 = await ask(system, convo);
    out.push({ turn: 2, text: t2, ...checks(t2, c) });
  }
  return out;
}

const versions = WHICH === 'both' ? ['old', 'new'] : [WHICH];
let report = '';
const log = (s) => { console.log(s); report += `${s}\n`; };

for (const c of CASES) {
  const results = await Promise.all(versions.map((v) => runCase(v, c).catch((e) => [{ turn: 0, text: `ERROR ${e.message}`, banned: [], kept: '-', fem: [] }])));
  log(`\n${'='.repeat(70)}\nמקרה: ${c.id}\nמשתמש/ת: ${c.seed}`);
  versions.forEach((v, i) => {
    for (const r of results[i]) {
      log(`\n--- ${v.toUpperCase()} | תור ${r.turn} | ביטויים שלה: ${r.kept} | אסורות: ${r.banned.join(',') || '-'} | מגדר: ${r.fem.join(',') || '-'}`);
      log(r.text);
    }
  });
}
log(`\nסה"כ קריאות: ${calls}`);
if (OUT) writeFileSync(OUT, report, 'utf8');
