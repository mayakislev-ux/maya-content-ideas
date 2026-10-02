/**
 * קריאת הרצף מפורמט שורות, במקום מ-JSON.
 *
 * 02/10/2026 (מאיה): "הגיוני שלוקח המון זמן?". מהלוג: התשובה הראשונה
 * הסתיימה תקין (end_turn) אבל לא הצליחה להיפרס, ולכן יצאה קריאה שנייה
 * שלמה, וסך הכל 148 שניות.
 *
 * הסיבה: ביקשנו JSON, והיא כותבת בעברית עם מרכאות בפנים. משפט כמו
 * `הכול קורה בלחץ של "מה נעלה היום?"` שובר מחרוזת JSON, וגם שורות חדשות
 * בתוך טקסט חייבות בריחה שהמודל לא תמיד זוכר. זה לא תקלה חד פעמית אלא
 * מחלקה שלמה של כשלים, והיא נעלמת ברגע שהפורמט אינו JSON.
 *
 * הפורמט כאן אינו יכול להישבר ממרכאות, מאימוג'ים, מחצים או משורות ריקות:
 *
 *   @@STORY 1
 *   @role עצירה / שיקוף
 *   @format רקע נקי + טקסט בלבד
 *   @asset רקע לבן נקי
 *   @poll מוכר לי מדי | דווקא לא
 *   @note בלי מסקנה עדיין
 *   @text
 *   אתם גוללים.
 *   עוצרים על רילס שמסביר "איך להביא עוד לקוחות".
 *   @@STORY 2
 *   ...
 *
 * שדה בשורה אחת מתחיל ב-@ ואחריו שם. שדה רב שורתי (@text, @speech, @small)
 * לוקח את כל מה שאחריו עד השדה הבא.
 */

const SINGLE = new Set(['role', 'format', 'asset', 'note']);
const MULTI = new Set(['text', 'speech', 'small']);

/** "שאלה | א | ב" או "א | ב" */
function parsePoll(value) {
  const parts = String(value || '').split('|').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return { question: parts[0], a: parts[1], b: parts[2] };
  if (parts.length === 2) return { question: '', a: parts[0], b: parts[1] };
  return { question: '', a: '', b: '' };
}

function emptyStory(n) {
  return {
    n,
    role: '',
    format: '',
    asset: '',
    text: '',
    speech: '',
    small: '',
    note: '',
    poll: { question: '', a: '', b: '' },
  };
}

/**
 * מחזיר { stories, job }. טקסט לפני הסטורי הראשון או אחרי האחרון נזרק, כי
 * מודלים נוטים להוסיף משפט פתיחה או סיכום גם כשמבקשים שלא.
 */
function parseSequence(raw) {
  const lines = String(raw == null ? '' : raw).split(/\r?\n/);
  const stories = [];
  let job = '';
  let current = null;
  let multi = null;
  let buffer = [];

  const flushMulti = () => {
    if (current && multi) current[multi] = buffer.join('\n').trim();
    multi = null;
    buffer = [];
  };

  for (const line of lines) {
    /* @@JOB אומר איזה מבנה נבחר, שיקוף או עמדה. הבדיקות שאחרי זה
       שונות לכל אחד מהם, ולכן צריך לדעת. */
    const jobLine = /^\s*@@\s*JOB[ 	]+(mirror|stance)/i.exec(line);
    if (jobLine) { job = jobLine[1].toLowerCase(); continue; }

    const start = /^\s*@@\s*STORY\s*(\d+)?/i.exec(line);
    if (start) {
      flushMulti();
      current = emptyStory(stories.length + 1);
      if (start[1]) current.n = Number(start[1]);
      stories.push(current);
      continue;
    }
    if (/^\s*@@\s*END/i.test(line)) {
      flushMulti();
      current = null;
      continue;
    }

    const field = /^\s*@([a-zA-Z]+)[ \t]*(.*)$/.exec(line);
    if (field && current) {
      const name = field[1].toLowerCase();
      if (MULTI.has(name)) {
        flushMulti();
        multi = name;
        const inline = field[2].trim();
        buffer = inline ? [inline] : [];
        continue;
      }
      flushMulti();
      if (name === 'poll') current.poll = parsePoll(field[2]);
      else if (SINGLE.has(name)) current[name] = field[2].trim();
      // שדה לא מוכר פשוט נזרק, ולא מפיל את הפירוק
      continue;
    }

    if (multi) buffer.push(line);
  }
  flushMulti();

  /* סטורי בלי טקסט ובלי דיבור הוא שארית של פירוק, לא סטורי. מסירים אותו
     כאן כדי שהבדיקה שאחרי זה לא תתלונן על משהו שהמודל בכלל לא התכוון אליו. */
  const clean = stories
    .filter((s) => s.text || s.speech)
    .map((s, i) => ({ ...s, n: Number.isFinite(s.n) && s.n > 0 ? s.n : i + 1 }));
  return { stories: clean, job: job || 'mirror' };
}

module.exports = { parseSequence, parsePoll };
