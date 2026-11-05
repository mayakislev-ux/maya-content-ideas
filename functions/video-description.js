// 05/11/2026 (מאיה): "✍️ תיאור לסרטון" במסך הסיכום של העוזר לסרטון.
// הכללים שלה, מילה במילה:
//   "מה שמעניין זה רק תיאור. לרוב התיאור תלוי מה הסרטון: אם זה בירול קצר
//   עם טקסט אז תיאור יותר ארוך שמפרט; אם זה סרטון ארוך של דיבור אז לרוב
//   התיאור אמור להיות או המסר בקצרה או משפט שמסקרן; ואם יש הנעה לפעולה
//   בסרטון אז להוסיף גם אותה. קאבר אין צורך. כן הוק של טקסט (טקסט על
//   המסך) כהצעה, כאופציה."
// לכן: בלי האשטגים ובלי קאבר. מחזירים תיאור אחד ושלושה הוקים של טקסט.
//
// כאן בלי onCall ובלי admin, כדי שהבדיקות יריצו את זה ישירות עם תלויות
// מדומות. החיווט נמצא ב-index.js (writeVideoDescription).

const VIDEO_TYPES = ['בירול קצר עם טקסט', 'סרטון דיבור', 'אחר'];

const LIMITS = { script: 8000, idea: 2000, hook: 1000, cta: 300, domain: 300, audience: 600 };

const MAYA_RULES = 'מה שמעניין זה רק תיאור. לרוב התיאור תלוי מה הסרטון: אם זה בירול קצר עם טקסט אז תיאור יותר ארוך שמפרט; אם זה סרטון ארוך של דיבור אז לרוב התיאור אמור להיות או המסר בקצרה או משפט שמסקרן; ואם יש הנעה לפעולה בסרטון אז להוסיף גם אותה. קאבר אין צורך. כן הוק של טקסט (טקסט על המסך) כהצעה, כאופציה.';

function typeRule(videoType) {
  if (videoType === 'בירול קצר עם טקסט') {
    return 'זה בירול קצר עם טקסט, ולכן התיאור ארוך יותר ומפרט: הוא נותן את התוכן שאין מקום להגיד בסרטון עצמו (3 עד 6 משפטים קצרים, עם ירידות שורה).';
  }
  if (videoType === 'סרטון דיבור') {
    return 'זה סרטון דיבור, ולכן התיאור קצר: או המסר של הסרטון בקצרה, או משפט אחד שמסקרן. לא לחזור על כל התסריט.';
  }
  return 'לבחור את סוג התיאור שהכי מתאים לסרטון לפי התסריט: אם רוב התוכן נאמר בסרטון, תיאור קצר (המסר בקצרה או משפט שמסקרן). אם הסרטון קצר ויזואלי, תיאור שמפרט יותר.';
}

function clean(v) {
  return String(v || '').trim();
}

/** הפרומפט. כל הקלט כבר נבדק ב-validateInput. */
function buildVideoDescriptionPrompt({ script, idea, hook, videoType, cta, domain, audience }) {
  const lines = [
    'את/ה כותב/ת תיאור לסרטון קצר באינסטגרם/טיקטוק של בעל/ת עסק קטן בישראל, לפי השיטה של מאיה קיסלב.',
    '',
    `הכללים של מאיה, כמו שהיא כתבה אותם: "${MAYA_RULES}"`,
    '',
    `סוג הסרטון: ${videoType}. ${typeRule(videoType)}`,
    cta
      ? `יש בסרטון הנעה לפעולה: "${cta}". להוסיף אותה גם בסוף התיאור, במשפט אחד ברור.`
      : 'אין בסרטון הנעה לפעולה, ולכן לא להמציא אחת בתיאור.',
  ];
  if (domain) lines.push(`התחום של העסק: ${domain}`);
  if (audience) lines.push(`קהל היעד: ${audience}`);
  if (idea) lines.push('', `הרעיון והמסר של הסרטון: "${idea}"`);
  if (hook) lines.push(`ההוק המדובר של הסרטון: "${hook}"`);
  if (script) lines.push('', 'התסריט של הסרטון:', `"""${script}"""`);
  lines.push(
    '',
    'מה להחזיר:',
    '1. description: התיאור עצמו, בעברית טבעית של רשתות חברתיות, בגוף ראשון של בעל/ת העסק. פנייה לקהל בלשון רבים או בניסוח ניטרלי, אלא אם קהל היעד הוא בבירור רק נשים או רק גברים.',
    '2. textHooks: בדיוק 3 הצעות להוק של טקסט על המסך (לא ההוק המדובר מילה במילה). כל אחת עד 8 מילים, חדה ומסקרנת, שמתאימה לקהל ולמסר. אלה הצעות בלבד, אופציה.',
    '',
    'אסור: האשטגים (#), הצעה לקאבר, אימוג\'י בתוך הוקי הטקסט, קו מפריד ארוך (—), אנגלית.',
    '',
    'להשיב אך ורק ב-JSON תקין, בלי שום טקסט לפני או אחרי:',
    '{"description": "<התיאור>", "textHooks": ["<הוק 1>", "<הוק 2>", "<הוק 3>"]}',
  );
  return lines.join('\n');
}

/* האשטגים וקו ארוך לא עוברים, גם אם המודל התעלם מההוראה */
function sanitize(text) {
  return clean(text)
    .replace(/(^|\s)#[^\s#]+/g, '$1')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** מפרק את תשובת המודל. null כשאין בה תיאור. */
function parseVideoDescription(text) {
  let parsed;
  try {
    const match = String(text || '').match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : text);
  } catch (err) {
    return null;
  }
  const description = sanitize(parsed && parsed.description);
  if (!description) return null;
  const textHooks = (Array.isArray(parsed.textHooks) ? parsed.textHooks : [])
    .map((h) => sanitize(h).replace(/^["“”״']+|["“”״']+$/g, '').trim())
    .filter(Boolean)
    .slice(0, 3);
  return { description, textHooks };
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
  if (!out.script && !out.idea && !out.hook) {
    throw new HttpsError('invalid-argument', 'חסר התסריט או הרעיון של הסרטון');
  }
  return out;
}

/**
 * deps: { HttpsError, enforceAllowlist(email), enforceRateLimit(uid), callModel(prompt) -> text }
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
    const result = parseVideoDescription(text);
    if (!result) {
      console.error('writeVideoDescription: unparseable response:', text);
      throw new HttpsError('internal', 'לא הצלחתי לכתוב תיאור, נסו שוב');
    }
    return result;
  };
}

module.exports = {
  VIDEO_TYPES,
  MAYA_RULES,
  buildVideoDescriptionPrompt,
  parseVideoDescription,
  validateInput,
  createVideoDescriptionHandler,
};
