/* הערכה חיה של חילוץ הרעיונות מהקלטה (ideasFromRecording, נתיב הטקסט).
 *
 * 07/11/2026 (מאיה): "הקלטתי 1:30 שדיברתי על ניהול אנרגיה אז הוא פיצל לי
 * ל-3 רעיונות, אבל בתכלס זה רעיון 1". ו"הוא תימצת לי את הרעיון שאמרתי ממש
 * בקצרה ואז אני אשכח מה אמרתי".
 *
 * מה זה עושה: שולח כמה תמלולים לדוגמה לג'מיני, באותו מודל, אותן הגדרות
 * ואותו פרומפט כמו השרת (buildPrompt מ-functions/ideas-from-recording.js),
 * ובודק לכל אחד:
 *   1. כמה רעיונות יצאו מול כמה צריך לצאת (נושא רציף אחד = 1).
 *   2. שה-"quote" הוא המילים שלה ולא תקציר: כמה מהמילים של התמלול נשארו בו.
 * עם --old משווה גם לפרומפט של master (דרך git), כדי לראות את השינוי.
 *
 * כלי פיתוח בלבד. לא נטען באפליקציה ולא נפרס.
 *
 * הרצה (גישה ל-Vertex AI בפרויקט, דרך gcloud):
 *   gcloud auth application-default login
 *   node scripts/eval-one-idea.mjs [--old] [--only energy,mixed] [--runs 2]
 */
import { createRequire, Module } from 'node:module';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const fnRequire = createRequire(join(ROOT, 'functions', 'index.js'));

const args = process.argv.slice(2);
const argOf = (flag) => { const i = args.indexOf(flag); return i > -1 ? args[i + 1] : null; };
const WITH_OLD = args.includes('--old');
const ONLY = argOf('--only') ? argOf('--only').split(',') : null;
const RUNS = Number(argOf('--runs') || 1);
const PROJECT = 'content-ideas-becd7';
const MODEL = 'gemini-3.5-flash';

const NEW = require('../functions/ideas-from-recording.js');
function loadOld() {
  const src = execSync(`git -C "${ROOT}" show master:functions/ideas-from-recording.js`, { encoding: 'utf8', maxBuffer: 1 << 24 });
  const filename = join(ROOT, 'functions', '__old_ideas_from_recording.js');
  const m = new Module(filename);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(dirname(filename));
  m._compile(src, filename);
  return m.exports;
}

const TAXONOMY = {
  categories: ['בעל ערך', 'אישי', 'מכירתי'],
  categoryDefinitions: {
    'בעל ערך': 'תוכן שמלמד, מסביר או נותן טיפ מקצועי',
    'אישי': 'תוכן על בעל/ת העסק עצמו/ה: סיפור, ערכים, דעות',
    'מכירתי': 'תוכן שמראה תוצאה, הוכחה או מזמין לקנות',
  },
  stages: ['שלב שכנוע 1 - מודעות לבעיה / חומרת הבעיה', 'שלב שכנוע 2 - מודעות לפתרון', 'שלב שכנוע 3 - למה דווקא אני'],
  audienceScopes: ['עיקרי', 'משני', 'רחב'],
  strongRating: '🔥 חייב לצלם',
  normalRating: '⭐ שווה לצלם',
};

/* expected: כמה רעיונות צריכים לצאת. [min, max] כשיש טווח סביר. */
const CASES = [
  {
    id: 'energy',
    note: 'דקה וחצי על נושא אחד (ניהול אנרגיה) עם כמה דוגמאות. צריך לצאת רעיון אחד.',
    expected: [1, 1],
    text: 'אז אממ רציתי לדבר היום על משהו שאני מגלה שוב ושוב, שזה ניהול אנרגיה ולא ניהול זמן. כאילו כולם מדברים על יומן ועל לנהל את הזמן, אבל אני מגלה שהבעיה היא לא הזמן. יש ימים שיש לי שש שעות פנויות ואני לא מצליחה לעשות כלום, ויש ימים שיש לי שעה ואני עושה בה את כל השבוע. אז מה שאני עושה עכשיו זה שאני קמה בבוקר ובודקת קודם כל כמה כוח יש לי. אם יש לי הרבה כוח, אני שמה בבוקר את הדברים הקשים, את הצילומים, את השיחות מכירה. ואם אני עייפה אני עושה דברים טכניים, מיילים, חשבוניות. ועוד דבר, אני שמה לב שאחרי פגישה עם לקוחה קשה אני צריכה הפסקה, אז אני לא קובעת שתי פגישות כאלה ברצף. וגם הלקוחות שלי, אני רואה אצלן בדיוק אותו דבר, הן אומרות לי אין לי זמן לצלם, ואז כשאני שואלת אותן, מתברר שיש זמן, אין כוח. אז זה בעצם כל העניין, לנהל את הכוח ולא את השעות.',
  },
  {
    id: 'mixed',
    note: 'שלושה נושאים שלא קשורים זה לזה. צריכים לצאת 3.',
    expected: [3, 3],
    text: 'היום הייתה לי שיחה עם לקוחה שאמרה לי שהיא לא מעלה סטורי כי היא מפחדת שהחברות שלה יצחקו עליה, וזה הזכיר לי כמה הפחד הזה משתק. דבר אחר לגמרי, אני ממש מתעצבנת על כל המאמנים שמוכרים קורס של שבע ספרות בחודש, זה פשוט לא אמיתי וזה עושה נזק לאנשים שמתחילים. ועוד משהו, גיליתי השבוע שכשאני מצלמת ליד החלון בבוקר האור הרבה יותר יפה, וזה טיפ שכל אחד יכול לעשות בבית בלי ציוד.',
  },
  {
    id: 'question',
    note: 'תשובה לשאלה שנבחרה מהרשימה. צריך לצאת רעיון אחד שהכותרת שלו עונה על השאלה.',
    expected: [1, 1],
    question: 'מה הטעות הכי יקרה שעשית בעסק?',
    text: 'הטעות הכי יקרה שלי? אה, שנתיים לקחתי כל לקוחה שהגיעה. כל מי שרצתה, גם אם הרגשתי בשיחה הראשונה שזה לא מתאים, אמרתי כן כי פחדתי שלא יהיו לקוחות. ומה שקרה זה שבדיוק הלקוחות האלה היו אלה שביטלו באמצע, שביקשו החזר, שלקחו לי את כל הכוח. ועד שלא התחלתי להגיד לא, לא היה לי מקום ללקוחות הנכונות.',
  },
  {
    id: 'two-related',
    note: 'סיפור על לקוחה והמסקנה ממנו. זה נושא אחד, צריך לצאת רעיון אחד (2 עדיין סביר).',
    expected: [1, 2],
    text: 'הגיעה אליי לקוחה שעשתה תשעה חודשים תוכן כל יום ולא קיבלה אף פנייה. ישבנו ביחד ועברנו על הסרטונים, וכל הסרטונים היו טיפים כלליים, אפשר היה להחליף את הלוגו ולשים אותם אצל כל אחד אחר. אז שינינו את זה שהיא תספר על המקרים האמיתיים מהקליניקה, וכבר בשבוע הראשון היו שלוש פניות. זה בעצם מה שאני אומרת כל הזמן, טיפים כלליים לא מוכרים, הסיפורים שלכם מוכרים.',
  },
];

async function accessToken() {
  const { GoogleAuth } = fnRequire('google-auth-library');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const t = await client.getAccessToken();
  return t && t.token ? t.token : t;
}

/* אותה קריאה כמו callGemini בשרת, בנתיב הטקסט (thinking LOW) */
async function extract(lib, token, c) {
  const prompt = lib.buildPrompt(TAXONOMY, { source: 'text', audience: '', question: c.question || '' });
  const res = await fetch(`https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/publishers/google/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }, { text: `הטקסט:\n<<<\n${c.text}\n>>>` }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 16384,
        thinkingConfig: { thinkingLevel: 'LOW' },
      },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(json.error && json.error.message) || ''}`);
  const parts = json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts;
  const text = (parts || []).map((p) => p.text || '').join('');
  return lib.normalizeIdeas(lib.parseJson(text), TAXONOMY);
}

const words = (t) => String(t || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1);

/** כמה מהמילים של התמלול נשארו ב-quote של כל הרעיונות ביחד (0-1). */
function keptRatio(ideas, text) {
  const said = new Set(words(ideas.map((i) => i.quote || '').join(' ')));
  const all = words(text);
  return all.length ? all.filter((w) => said.has(w)).length / all.length : 0;
}

const token = await accessToken();
const libs = [['new', NEW]];
if (WITH_OLD) libs.unshift(['old', loadOld()]);
let failures = 0;
for (const c of CASES.filter((x) => !ONLY || ONLY.includes(x.id))) {
  console.log(`\n=== ${c.id}: ${c.note}`);
  for (const [name, lib] of libs) {
    for (let run = 1; run <= RUNS; run += 1) {
      const ideas = await extract(lib, token, c);
      const [min, max] = c.expected;
      const okCount = ideas.length >= min && ideas.length <= max;
      const kept = keptRatio(ideas, c.text);
      const okQuote = name === 'old' || kept >= 0.6;
      if (name === 'new' && !(okCount && okQuote)) failures += 1;
      console.log(`  [${name}${RUNS > 1 ? ` #${run}` : ''}] ${okCount ? 'OK ' : 'BAD'} ${ideas.length} רעיונות (צריך ${min === max ? min : `${min}-${max}`})`
        + (name === 'new' ? ` · ${Math.round(kept * 100)}% מהמילים שלה נשמרו ב-quote ${okQuote ? 'OK' : 'BAD (תקציר?)'}` : ''));
      for (const idea of ideas) {
        console.log(`     - ${idea.title}  [${idea.category}]`);
        if (idea.quote) console.log(`       quote (${idea.quote.length} תווים): ${idea.quote.slice(0, 160)}${idea.quote.length > 160 ? '…' : ''}`);
      }
    }
  }
}
console.log(failures ? `\n${failures} בדיקות נכשלו בפרומפט החדש` : '\nהכל עבר');
process.exit(failures ? 1 : 0);
