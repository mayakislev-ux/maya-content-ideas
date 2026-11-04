// 04/11/2026 (מאיה): "כשאני מוצאת סרטון במאגר ורוצה לשכפל אותו, אני מעתיקה
// לרובוט את הלינק ואת התמלול בנפרד. זה איטי, ולפעמים התמלול לא מדויק או
// שהסרטון ויזואלי, וזה מטעה". כפתור "לשכפול הסרטון" ליד כל רפרנס פותח את
// העוזר ישר בשכפול, עם הלינק והתמלול כבר בפנים.
//
// כאן רק ההחלטה: איזה טקסט נכנס, והאם אפשר לסמוך עליו. בלי DOM ובלי
// Firestore, כדי שהבדיקות יריצו את זה ישירות.
//
// איזה טקסט, ולמה (נבדק מול המאגר האמיתי, 875 סרטונים, 04/11/2026):
//   - 562 סרטונים עם כתוביות (inspirationSubs). אצל 542 מהם האורך תואם
//     לטקסט הקריאה בטווח של 20%. הכתוביות הן הגרסה שתוקנה אחרונה ובזהירות
//     ("קארמי" ולא "קארמתי", בלי "הממ"), והן רק מה שנאמר בפועל. בטקסט
//     הקריאה נדבקו לפעמים כותרות מהמסך באמצע (26 סרטונים), ובכמה סרטונים
//     בעברית הוא חסר משפטים שבכתוביות כן יש. לכן כתוביות קודם.
//   - בלי כתוביות: טקסט הקריאה (תמלול מתוקן בעברית, או תרגום לעברית).
//   - שיר (123) או בלי דיבור (141): אין תמלול בכלל. מילים של שיר הן לא
//     תוכן הסרטון, ולכן גם לא נכנסות.
//   - 41 סרטונים מדוברים בלי שום טקסט מוכן: אומרים את זה, לא ממציאים.
import { audioKindOf, readableTextOf } from './inspiration-readability.js';

/* מתחת לזה זה לא באמת דיבור. אותו סף כמו בתגית "ויזואלי" במאגר. */
export const SPEECH_MIN_CHARS = 120;

/** הכתוביות כטקסט רציף אחד. */
export function joinSegments(segments) {
  if (!Array.isArray(segments)) return '';
  return segments
    .map((s) => String((s && s.t) || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

/**
 * מה נכנס לתיבת התמלול, ומה מצבו.
 * reason: 'ok' | 'short' (כמעט בלי דיבור) | 'visual' | 'song' | 'missing'
 * source: 'subtitles' | 'text' | 'none'
 */
export function duplicationText(video, segments) {
  const v = video || {};
  const foreign = Boolean(v.sourceLanguage) && v.sourceLanguage !== 'he';
  const kind = audioKindOf(v);
  if (kind === 'song') return { text: '', source: 'none', reason: 'song', foreign };
  if (kind === 'silent') return { text: '', source: 'none', reason: 'visual', foreign };

  const subs = joinSegments(segments);
  const readable = String(readableTextOf(v) || '').trim();
  const text = subs || readable;
  const source = subs ? 'subtitles' : (readable ? 'text' : 'none');
  if (!text) {
    /* מדובר ואין טקסט: חסר. לא ידוע ובלי טקסט: כנראה ויזואלי. */
    return { text: '', source, reason: kind === 'speech' ? 'missing' : 'visual', foreign };
  }
  return { text, source, reason: text.length < SPEECH_MIN_CHARS ? 'short' : 'ok', foreign };
}

/** האם אפשר לדלג ישר למסך ההוק. רק כשיש תמלול של ממש. */
export function readyForHook(info) {
  return Boolean(info) && info.reason === 'ok';
}

const DESCRIBE = 'מה רואים בפתיחה, מה כתוב על המסך, מה קורה לאורך הסרטון ומה הרגע שתופס';

/** ההודעה שליד התמלול. { title, body }, או null כשאין מה להגיד. */
export function duplicationNotice(info) {
  if (!info) return null;
  const what = info.foreign ? 'תרגום אוטומטי לעברית' : 'תמלול אוטומטי';
  switch (info.reason) {
    case 'ok':
      return {
        title: 'התמלול הגיע מהמאגר',
        body: `זה ${what} של מה שנאמר בסרטון. הוא עלול להכיל טעויות, וטקסט שמופיע רק על המסך לא נכנס אליו. כדאי לעבור עליו מול הסרטון, או ללחוץ במסך התמלול על "✨ תמלול מדויק" כדי שג'מיני יצפה בסרטון עצמו.`,
      };
    case 'short':
      return {
        title: 'בסרטון הזה כמעט אין דיבור',
        body: `מה שנאמר בו כבר בתיבה, אבל רוב הסיפור קורה בתמונה. כדי שההוק ישוכפל נכון, להוסיף במילים שלכם: ${DESCRIBE}. או ללחוץ על "✨ תמלול מדויק", וג'מיני יכתוב את זה בשבילכם.`,
      };
    case 'visual':
      return {
        title: 'הסרטון הזה ויזואלי, בלי דיבור',
        body: `ולכן אין לו תמלול. במקום תמלול, לתאר כאן במילים שלכם: ${DESCRIBE}. או ללחוץ על "✨ תמלול מדויק", וג'מיני יכתוב את זה בשבילכם.`,
      };
    case 'song':
      return {
        title: 'בסרטון הזה יש רק מוזיקה, בלי דיבור',
        body: `מילים של שיר הן לא תוכן הסרטון, ולכן לא הכנסנו אותן. במקום תמלול, לתאר כאן במילים שלכם: ${DESCRIBE}. או ללחוץ על "✨ תמלול מדויק", וג'מיני יכתוב את זה בשבילכם.`,
      };
    case 'missing':
      return {
        title: 'לסרטון הזה עדיין אין תמלול במאגר',
        body: `אפשר ללחוץ על "✨ תמלול מדויק", וג'מיני יצפה בסרטון ויתמלל אותו כאן (בתרגום לעברית אם צריך).`,
      };
    default:
      return null;
  }
}
