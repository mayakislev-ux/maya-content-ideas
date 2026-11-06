// 05/11/2026 (מאיה): "✍️ תיאור לסרטון" במסך הסיכום של העוזר לסרטון.
// הכללים שלה, מילה במילה:
//   "מה שמעניין זה רק תיאור. לרוב התיאור תלוי מה הסרטון: אם זה בירול קצר
//   עם טקסט אז תיאור יותר ארוך שמפרט; אם זה סרטון ארוך של דיבור אז לרוב
//   התיאור אמור להיות או המסר בקצרה או משפט שמסקרן; ואם יש הנעה לפעולה
//   בסרטון אז להוסיף גם אותה. קאבר אין צורך. כן הוק של טקסט (טקסט על
//   המסך) כהצעה, כאופציה."
//
// 06/11/2026 (מאיה): "והוא כתב לי תיאור אוטומטי גרוע. הוא צריך לקחת את
//   התיאור מהתסריט שלי, או מסר שורה תחתונה או משפט מסקרן ולהוסיף את ההנעה
//   לפעולה. הוא המציא סתם משהו".
// מה היה שבור: הפרומפט ביקש מהמודל "לכתוב תיאור" במילים שלו, והמסר שלה
// (ideaPunchline, "מה הפואנטה שורה תחתונה") בכלל לא נשלח. אז הוא כתב
// מאפס: "מקטילות את האמון", "יכול להיות לי 150 אלף בחודש" (המספר של
// לקוחה מהסיפור, בפה שלה). עכשיו המודל רק *בוחר* שורות: המסר שלה או משפט
// מסקרן מהתסריט, עד 2 שורות נוספות מהתסריט, וההנעה לפעולה. השרת בודק שכל
// שורה באמת כתובה בתסריט/במסר, וזורק שורה שהומצאה. אם לא נשאר כלום, התיאור
// נבנה כאן בלי המודל: המסר שלה + ההנעה לפעולה.
//
// כאן בלי onCall ובלי admin, כדי שהבדיקות יריצו את זה ישירות עם תלויות
// מדומות. החיווט נמצא ב-index.js (writeVideoDescription).

const VIDEO_TYPES = ['בירול קצר עם טקסט', 'סרטון דיבור', 'אחר'];

const LIMITS = {
  script: 8000, idea: 2000, message: 1000, angle: 1000, hook: 1000, hookReinforcement: 1000,
  cta: 300, ctaType: 40, domain: 300, audience: 600, pronoun: 10,
};

const MAYA_RULES = 'מה שמעניין זה רק תיאור. לרוב התיאור תלוי מה הסרטון: אם זה בירול קצר עם טקסט אז תיאור יותר ארוך שמפרט; אם זה סרטון ארוך של דיבור אז לרוב התיאור אמור להיות או המסר בקצרה או משפט שמסקרן; ואם יש הנעה לפעולה בסרטון אז להוסיף גם אותה. קאבר אין צורך. כן הוק של טקסט (טקסט על המסך) כהצעה, כאופציה.';

const MAYA_RULES_0611 = 'הוא צריך לקחת את התיאור מהתסריט שלי, או מסר שורה תחתונה או משפט מסקרן ולהוסיף את ההנעה לפעולה. הוא המציא סתם משהו';

/* הנעה לפעולה פשוטה כשאין אחת בתסריט. בלי להמציא הצעה או מילת קוד. */
const DEFAULT_CTA = {
  'מעורבות': 'מה דעתכם? כתבו לי בתגובות',
  'עוקבים': 'עקבו לעוד תוכן כזה',
  'מכירה': 'לפרטים שלחו לי הודעה בפרטי',
  'משפך': 'לפרטים שלחו לי הודעה בפרטי',
};
const FALLBACK_CTA = 'מה דעתכם? כתבו לי בתגובות';

/* מילים שמסמנות שורה של הנעה לפעולה בסוף התסריט */
const CTA_WORDS = /(תגובות|בתגובה|כתבו|תכתבו|תכתוב|תכתבי|שלחו|תשלחו|בפרטי|הודעה|לינק|קישור|בביו|עקבו|תעקבו|שמרו|תשמרו|שתפו|תשתפו|תייגו|הירשמו|להירשם|לחצו|תלחצו|תגידו לי|ספרו לי)/;

const LONG_DASH = /\s*[—–]\s*/g;

function clean(v) {
  return String(v || '').trim();
}

/** שורות הדיבור של התסריט, בלי הוראות במה ([...]) ובלי שורות ריקות */
function spokenLines(script) {
  return clean(script)
    .split(/\n+/)
    .map((l) => l.replace(/\[[^\]]*\]/g, ''))
    .map((l) => l.replace(/^[\s"״“”']+|[\s"״“”']+$/g, '').trim())
    .filter((l) => /[א-תA-Za-z]/.test(l));
}

/** ההנעה לפעולה שכבר כתובה בסוף התסריט שלה, אם יש. מילה במילה. */
function scriptCta(script) {
  const lines = spokenLines(script);
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 2); i -= 1) {
    if (CTA_WORDS.test(lines[i])) return lines[i];
  }
  /* שורה אחרונה שהיא שאלה לקהל ("על איזו מהן הייתם עוצרים?") היא הנעה למעורבות */
  const last = lines[lines.length - 1] || '';
  if (/\?\s*$/.test(last) && /(תגידו|אתם|אתן|לכם|לכן|הייתם|הייתן|שלכם|שלכן)/.test(last)) return last;
  return '';
}

function typeRule(videoType) {
  if (videoType === 'בירול קצר עם טקסט') {
    return 'זה בירול קצר עם טקסט, ולכן מותר תיאור קצת יותר מפרט: עד 4 שורות נוספות, כולן מהתסריט.';
  }
  if (videoType === 'סרטון דיבור') {
    return 'זה סרטון דיבור, ולכן התיאור קצר: המסר או משפט מסקרן, לכל היותר עוד שורה או שתיים, וההנעה לפעולה.';
  }
  return 'אם רוב התוכן נאמר בסרטון, תיאור קצר (המסר או משפט מסקרן, עוד שורה או שתיים לכל היותר). אם זה סרטון ויזואלי קצר עם טקסט, אפשר עד 4 שורות נוספות מהתסריט.';
}

const EXAMPLES = `דוגמה 1
המסר שלה: "פרסומת ממומנת עם עיצוב של בינה מלאכותית במקום תמונה אמיתית שלך הורגת אמון במקום לבנות אותו"
התסריט (קטע):
"""אתם יושבים, מעצבים מודעה ב-AI, מסתכלים עליה ואומרים לעצמכם: וואו, איזה מקצועי זה נראה.
רק שהבן אדם בצד השני אפילו לא עוצר.
הכי מצחיק שאתם בכלל משלמים כדי שאנשים ידלגו עליכם.
אז די להסתתר מאחורי תמונות AI. תעמדו מול המצלמה, תדברו כמו בני אדם.
ועכשיו תגידו לי, על איזו משתי הפרסומות אתם הייתם עוצרים?"""
תשובה נכונה:
{"opening": "הכי מצחיק שאתם בכלל משלמים כדי שאנשים ידלגו עליכם.", "lines": ["אז די להסתתר מאחורי תמונות AI. תעמדו מול המצלמה, תדברו כמו בני אדם."], "cta": "ועכשיו תגידו לי, על איזו משתי הפרסומות אתם הייתם עוצרים?", "textHooks": ["משלמים כדי שידלגו עליכם", "AI או בן אדם אמיתי?", "איזו פרסומת הייתם עוצרים?"]}
תשובה פסולה (המציאה מילים, וזה בדיוק מה שאסור): "בואו נדבר על הפרסומות של AI שמקטילות את האמון במקום לבנות אותו."

דוגמה 2
המסר שלה: "מספר גבוה בעסק לא מספר את כל הסיפור"
התסריט (קטע):
"""העסק שלי מכניס מעל 150 אלף שקל בחודש, אני מוציאה 20 אלף על ממומן, והיועצת מכירות שלי כבר מותשת.
בעלת העסק הזאת הגיעה אליי אחרי שנים שהיא מסתמכת בעיקר על פרסום ממומן.
אבל יודעים מה הרבה יותר קשה?
לשכנע במשך שנים אנשים שלא מכירים אתכם לקנות מכם.
רוצים את הסיסטם שעוזר לי להגיע ל־100 אלף שקל בחודש בלי שיחות מכירה מתישות? כתבו "סיסטם" בתגובות."""
תשובה נכונה:
{"opening": "מספר גבוה בעסק לא מספר את כל הסיפור", "lines": ["אבל יודעים מה הרבה יותר קשה?", "לשכנע במשך שנים אנשים שלא מכירים אתכם לקנות מכם."], "cta": "רוצים את הסיסטם שעוזר לי להגיע ל־100 אלף שקל בחודש בלי שיחות מכירה מתישות? כתבו \\"סיסטם\\" בתגובות.", "textHooks": ["150 אלף בחודש ועדיין מותשת", "מה הרבה יותר קשה?", "המחזור לא מספר את הסיפור"]}
תשובה פסולה (הציוט הראשון הוא של הלקוחה מהסיפור, לא שלה): "יכול להיות לי 150 אלף בחודש, אבל אני משלמת מחיר כבד."`;

/** הפרומפט. כל הקלט כבר נבדק ב-validateInput. */
function buildVideoDescriptionPrompt(input) {
  const { script, idea, message, angle, hook, hookReinforcement, videoType, cta, ctaType, domain, audience, pronoun } = input;
  const fromScript = scriptCta(script);
  const lines = [
    'התפקיד: לבנות תיאור (כיתוב) לסרטון אינסטגרם/טיקטוק של בעל/ת עסק קטן בישראל, לפי השיטה של מאיה קיסלב.',
    'זה לא כתיבה. זה ליקוט: לוקחים משפטים שהיא כבר כתבה בתסריט או במסר, כמו שהם, ומסדרים אותם.',
    '',
    `הכללים של מאיה: "${MAYA_RULES}"`,
    `ועוד ממנה: "${MAYA_RULES_0611}"`,
    '',
    'מבנה התיאור:',
    '1. opening: שורה אחת שפותחת. או המסר / השורה התחתונה שלה (אם נתון למטה), או המשפט הכי מסקרן מהתסריט. מועתק מילה במילה (מותר רק לקצר בסוף או להוריד מילת חיבור בהתחלה).',
    `2. lines: שורות נוספות (בדרך כלל 0 עד 2), כל אחת מועתקת מילה במילה מהתסריט. ${typeRule(videoType)}`,
    '3. cta: ההנעה לפעולה. אם יש בסוף התסריט הנעה לפעולה, להעתיק אותה מילה במילה.',
    '',
    'חוקים, בלי יוצא מן הכלל:',
    '- אסור להמציא: לא עובדות, לא סיפור, לא מספרים, לא הצעה, לא מילת קוד, לא הבטחה ולא טענה שאינה כתובה בתסריט, במסר או בפרופיל.',
    '- אסור לנסח מחדש. אם אין משפט מתאים, לבחור את הכי קרוב מהתסריט ולהעתיק אותו.',
    '- לשמור על אוצר המילים, הסלנג והגוף שלה בדיוק כמו בתסריט. ציטוט של דמות אחרת מהסיפור (לקוחה, חבר) לא הופך לגוף ראשון שלה.',
    '- לא להניח שהקהל נשים. פנייה לקהל כמו בתסריט, ואם צריך ניסוח חדש (רק בהנעה לפעולה כשאין בתסריט) אז בלשון רבים.',
    '- לא לשאול שאלות ולא לבקש פרטים. כל מה שיש נמצא כאן. חסר משהו? להסיק מהתסריט ולכתוב.',
    '- בלי האשטגים (#), בלי קו מפריד ארוך, בלי אימוג\'י, בלי אנגלית שלא כתובה בתסריט, בלי קאבר.',
    '',
    'הנתונים:',
  ];
  if (domain) lines.push(`התחום של העסק: ${domain}`);
  if (audience) lines.push(`קהל היעד: ${audience}`);
  if (pronoun === 'את' || pronoun === 'אתה') lines.push(`בעל/ת העסק מדבר/ת על עצמו/ה בלשון ${pronoun === 'את' ? 'נקבה' : 'זכר'} (רק אם צריך לנסח משהו בגוף ראשון).`);
  lines.push(`סוג הסרטון: ${videoType}`);
  if (message) lines.push(`המסר / השורה התחתונה שלה, במילים שלה: "${message}"`);
  if (idea) lines.push(`הרעיון של הסרטון: "${idea}"`);
  if (angle) lines.push(`הזווית / האריזה הקריאייטיבית: "${angle}"`);
  if (hook) lines.push(`ההוק המדובר: "${hook}"`);
  if (hookReinforcement) lines.push(`חיזוק ההוק: "${hookReinforcement}"`);
  if (fromScript) {
    lines.push(`ההנעה לפעולה שכבר כתובה בסוף התסריט (להעתיק אותה כמו שהיא): "${fromScript}"`);
  } else if (cta) {
    lines.push(`ההנעה לפעולה שנבחרה: "${cta}". לכתוב אותה במשפט אחד קצר ופשוט, בלי להוסיף הצעה או מילת קוד שלא כתובה כאן.`);
  } else {
    lines.push(`אין הנעה לפעולה כתובה. לכתוב משפט אחד פשוט שמתאים למה שהתסריט מבקש (תגובה, הודעה בפרטי, מעקב). ${ctaType && DEFAULT_CTA[ctaType] ? `למשל: "${DEFAULT_CTA[ctaType]}".` : `למשל: "${FALLBACK_CTA}".`}`);
  }
  if (script) lines.push('', 'התסריט שלה (שורות בסוגריים מרובעים הן הוראות במה, לא לצטט אותן):', `"""${script}"""`);
  else lines.push('', 'אין תסריט כתוב. לבנות את התיאור מהמסר, מהרעיון ומההוק, באותן מילים.');
  lines.push(
    '',
    'textHooks: בדיוק 3 הצעות להוק של טקסט על המסך, עד 8 מילים כל אחת, מבוססות על מילים מהתסריט. אלה הצעות בלבד.',
    '',
    EXAMPLES,
    '',
    'להשיב אך ורק ב-JSON תקין, בלי שום טקסט לפני או אחרי:',
    '{"opening": "<שורה מהמסר או מהתסריט>", "lines": ["<שורה מהתסריט>"], "cta": "<ההנעה לפעולה>", "textHooks": ["<הוק 1>", "<הוק 2>", "<הוק 3>"]}',
  );
  return lines.join('\n');
}

/* האשטגים, קו ארוך וקו מפריד עם רווחים לא עוברים, גם אם המודל התעלם מההוראה */
function sanitize(text) {
  return clean(text)
    .replace(/(^|\s)#[^\s#]+/g, '$1')
    .replace(LONG_DASH, ', ')
    .replace(/ +- +/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/^[,\s]+/, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ---------- בדיקה שהשורה באמת שלה ---------- */

function words(text) {
  return clean(text)
    .replace(/־/g, ' ') // מקף עברי (ל־100) הוא מפריד, כמו ל-100
    .replace(/[֑-ֽֿ-ׇ]/g, '')
    .replace(/[^א-תA-Za-z0-9]+/g, ' ')
    .toLowerCase()
    .split(' ')
    .filter(Boolean);
}

/* "ואתם", "שאנשים", "בתגובות": אותה מילה עם אותיות שימוש בהתחלה */
function stems(w) {
  const out = [w];
  let s = w;
  for (let i = 0; i < 2 && s.length > 3 && /^[והשבלמכ]/.test(s); i += 1) {
    s = s.slice(1);
    out.push(s);
  }
  return out;
}

/* הצורה הבסיסית של מילה, לזוגות מילים */
function canon(w) {
  const st = stems(w);
  return st[st.length - 1];
}

/** כל המילים וכל זוגות המילים הצמודות במקור (התסריט, המסר, הרעיון) */
function sourceSet(texts) {
  const set = new Set();
  const pairs = new Set();
  for (const t of texts) {
    const ws = words(t);
    ws.forEach((w, i) => {
      for (const s of stems(w)) set.add(s);
      if (i > 0) pairs.add(`${canon(ws[i - 1])} ${canon(w)}`);
    });
  }
  set.pairs = pairs;
  return set;
}

/**
 * האם השורה כתובה (כמעט) מילה במילה במקור. כל משפט בשורה נבדק לבד:
 * 85% מהמילים שלו כתובות במקור, ו-60% מזוגות המילים הצמודות מופיעים שם
 * באותו סדר. ככה ניסוח מחדש עם אותן מילים לא עובר, וקיצור קטן כן.
 */
function isGrounded(line, set) {
  const sentences = clean(line).split(/[.!?\n]+/).map((x) => words(x)).filter((ws) => ws.length);
  if (!sentences.length || sentences.reduce((n, ws) => n + ws.length, 0) < 2) return false;
  const pairs = set.pairs || new Set();
  return sentences.every((ws) => {
    const hit = ws.filter((w) => stems(w).some((s) => set.has(s))).length;
    if (hit / ws.length < 0.85) return false;
    if (ws.length < 3) return true;
    let pairHit = 0;
    for (let i = 1; i < ws.length; i += 1) if (pairs.has(`${canon(ws[i - 1])} ${canon(ws[i])}`)) pairHit += 1;
    return pairHit / (ws.length - 1) >= 0.6;
  });
}

/** מפרק את תשובת המודל. null כשאין בה כלום שאפשר לעבוד איתו. */
function parseVideoDescription(text) {
  let parsed;
  try {
    const match = String(text || '').match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : text);
  } catch (err) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const opening = sanitize(parsed.opening || '');
  const lines = (Array.isArray(parsed.lines) ? parsed.lines : []).map(sanitize).filter(Boolean);
  const cta = sanitize(parsed.cta || '');
  const description = sanitize(parsed.description || '');
  const textHooks = (Array.isArray(parsed.textHooks) ? parsed.textHooks : [])
    .map((h) => sanitize(h).replace(/^["“”״']+|["“”״']+$/g, '').trim())
    .filter(Boolean)
    .slice(0, 3);
  if (!opening && !lines.length && !description) return null;
  return { opening, lines, cta, description, textHooks };
}

/** המשפט הראשון של המסר, כפתיחה כשאין שורה טובה מהמודל */
function firstSentence(text) {
  const t = sanitize(text);
  const m = t.match(/^[^.!?\n]+[.!?]?/);
  return (m ? m[0] : t).trim();
}

/**
 * מרכיב את התיאור הסופי מהשורות שהמודל בחר, אחרי שכל שורה נבדקה מול
 * התסריט והמסר שלה. שורה שהומצאה נזרקת. בלי פתיחה תקינה: המסר שלה, ואם
 * אין מסר, ההוק או שורת הדיבור הראשונה.
 */
function composeDescription(input, picked) {
  const set = sourceSet([input.script, input.message, input.idea, input.hook, input.hookReinforcement, input.angle]);
  const maxLines = input.videoType === 'בירול קצר עם טקסט' ? 4 : 2;
  const p = picked || { opening: '', lines: [], cta: '' };

  let opening = p.opening && isGrounded(p.opening, set) ? p.opening : '';
  if (!opening) {
    const firstSpoken = spokenLines(input.script)[0] || '';
    opening = firstSentence(input.message) || sanitize(input.hook) || sanitize(firstSpoken) || firstSentence(input.idea);
  }
  const seen = new Set([opening]);
  const body = [];
  for (const l of p.lines || []) {
    if (body.length >= maxLines) break;
    if (!seen.has(l) && isGrounded(l, set)) { body.push(l); seen.add(l); }
  }

  /* ההנעה לפעולה: מה שכתוב בתסריט גובר. אחר כך מה שהמודל כתב, רק אם הוא
     לא הוסיף מילים שלא כתובות בתסריט, בהנעה שנבחרה או בברירת המחדל. */
  const fromScript = sanitize(scriptCta(input.script));
  const fallbackCta = DEFAULT_CTA[input.ctaType] || FALLBACK_CTA;
  let cta = fromScript;
  if (!cta && p.cta && isGrounded(p.cta, sourceSet([input.script, input.cta, input.message, fallbackCta, 'לי לנו לכם לכן את זה עוד כאן']))) cta = p.cta;
  if (!cta) cta = fallbackCta;
  if (body.includes(cta)) body.splice(body.indexOf(cta), 1);
  if (cta === opening) cta = '';

  return sanitize([opening, ...body, cta].filter(Boolean).join('\n'));
}

/** בודק את הקלט ומחזיר אותו נקי, או זורק HttpsError. */
function validateInput(data, HttpsError) {
  const d = data || {};
  const out = {};
  for (const [k, max] of Object.entries(LIMITS)) {
    const v = clean(d[k]);
    if (v.length > max) throw new HttpsError('invalid-argument', `השדה "${k}" ארוך מדי (מקסימום ${max} תווים)`);
    out[k] = v;
  }
  out.videoType = VIDEO_TYPES.includes(clean(d.videoType)) ? clean(d.videoType) : 'אחר';
  if (!out.script && !out.idea && !out.message && !out.hook) {
    throw new HttpsError('invalid-argument', 'חסר התסריט או הרעיון של הסרטון');
  }
  return out;
}

/**
 * deps: { HttpsError, enforceAllowlist(email), enforceRateLimit(uid), callModel(prompt) -> text }
 * 06/11/2026: לא שואלים את המשתמשת כלום. גם כשהמודל החזיר זבל, התיאור
 * נבנה מהמסר / מהתסריט שלה ומההנעה לפעולה, כדי שלא תקבל שגיאה.
 */
function createVideoDescriptionHandler(deps) {
  const { HttpsError } = deps;
  return async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'יש להתחבר כדי להשתמש בתכונה הזו');
    }
    await deps.enforceAllowlist(request.auth.token.email);
    const input = validateInput(request.data, HttpsError);
    await deps.enforceRateLimit(request.auth.uid);
    const text = await deps.callModel(buildVideoDescriptionPrompt(input));
    const picked = parseVideoDescription(text);
    if (!picked) console.error('writeVideoDescription: unparseable response, using her own lines:', text);
    const description = composeDescription(input, picked);
    if (!description) throw new HttpsError('internal', 'לא הצלחתי לכתוב תיאור, נסו שוב');
    return { description, textHooks: picked ? picked.textHooks : [] };
  };
}

module.exports = {
  VIDEO_TYPES,
  MAYA_RULES,
  MAYA_RULES_0611,
  DEFAULT_CTA,
  buildVideoDescriptionPrompt,
  parseVideoDescription,
  composeDescription,
  scriptCta,
  spokenLines,
  isGrounded,
  sourceSet,
  sanitize,
  validateInput,
  createVideoDescriptionHandler,
};
