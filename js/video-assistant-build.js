/* 29/10/2026 (מאיה): "כותבים תסריט וכאילו כל פעם כל שלב נעלם. אני רוצה
   תוך כדי שאני בונה לראות מול העיניים מה אני בונה". ובחרה שזה יהיה
   "הכרטיס ממשיך למטה": מתחת לשאלה של המסך, באותו כרטיס, כל מה שכבר
   נבנה, החלק שנבנה עכשיו, ומה שעוד מחכה.

   פונקציה טהורה של הסטייט, כדי שאפשר לבדוק כל מסלול בלי דפדפן. */

const clip = (t, n = 140) => {
  const s = String(t || '').trim();
  return s.length > n ? `${s.slice(0, n).trim()}...` : s;
};

/* קטע שצולם נשאר קטע שצולם גם אחרי "צריך תסריט", שמעביר את המסלול
   ל-scratch. footageKind נקבע רק במסלול הזה ומתאפס רק בהתחלה מחדש. */
const isFootage = (s) => s.branch === 'footage' || !!s.footageKind;

/* ברעיון, ideaDescription אחרי המסר הוא "המסר. נושא הסרטון: הנושא", ולכן
   הנושא נלקח מהשדה שלו. בקטע שצולם אין נושא נפרד: מה שנכתב הוא המסר. */
const PARTS = {
  reference: {
    label: 'הרפרנס',
    get: (s) => s.referenceLink || clip(s.transcript, 90),
    screens: ['transcribe'],
  },
  idea: {
    label: 'הרעיון',
    get: (s) => s.ideaTopic || (!s.ideaPunchline && !isFootage(s) ? (s.ideaBeforePackaging || s.ideaDescription) : null),
    screens: ['idea-sharpen', 'type-idea', 'pulled-idea', 'relevance-check'],
  },
  message: {
    label: 'המסר',
    get: (s) => s.ideaPunchline || (isFootage(s) ? (s.ideaBeforePackaging || s.ideaDescription) : null),
    screens: ['idea-sharpen'],
  },
  packaging: {
    label: 'האריזה',
    get: (s) => (s.packaging ? `${s.packaging}${s.startingPoint ? ` · ${s.startingPoint}` : ''}` : null),
    screens: ['creative-packaging'],
  },
  format: {
    label: 'הפורמט',
    get: (s) => s.selectedFormat,
    screens: ['format-choice'],
  },
  dump: {
    label: 'מה יש לך להגיד',
    get: (s) => clip(s.rawDump),
    screens: ['scratch-dump'],
  },
  herWords: {
    label: 'מה יש לך להגיד',
    get: (s) => clip(s.herWords),
    screens: ['her-words'],
  },
  hook: {
    label: 'ההוק',
    get: (s) => s.hook,
    screens: ['scratch-hook', 'prompt1'],
    big: true,
  },
  reinforce: {
    label: 'חיזוק ההוק',
    get: (s) => s.hookReinforcement,
    screens: ['scratch-hook-reinforce'],
  },
  script: {
    label: 'התסריט',
    get: (s) => clip(s.draftScript || s.finalScript, 220),
    screens: ['scratch-distill', 'prompt2', 'read-aloud'],
  },
};

const BY_BRANCH = {
  idea: ['idea', 'message', 'packaging', 'format', 'script'],
  scratch: ['idea', 'message', 'packaging', 'format', 'dump', 'hook', 'reinforce', 'script'],
  footage: ['message', 'packaging', 'format', 'script'],
  reference: ['reference', 'hook', 'herWords', 'script'],
  'idea-search': ['idea', 'message', 'packaging', 'format', 'reference', 'herWords', 'hook', 'script'],
};

/** רשימת החלקים להצגה: done (נבנה), now (נבנה במסך הזה), wait (בהמשך).
    ריקה כשעוד לא נבנה כלום, וגם במסך הסיכום, שמציג את הכל בעצמו. */
export function buildParts(state) {
  if (!state || state.screen === 'summary') return [];
  const keys = BY_BRANCH[state.branch];
  if (!keys) return [];
  const rows = keys.map((key) => {
    const part = PARTS[key];
    const value = part.get(state);
    return { key, label: part.label, value: value ? String(value).trim() : '', big: !!part.big, here: part.screens.includes(state.screen) };
  });
  if (!rows.some((r) => r.value)) return [];
  let cur = rows.findIndex((r) => r.here);
  if (cur === -1) cur = rows.findIndex((r) => !r.value);
  if (cur === -1) cur = rows.length;
  return rows
    .map((r, i) => {
      if (i === cur) return { ...r, status: 'now' };
      if (i > cur) return { ...r, status: 'wait' };
      return r.value ? { ...r, status: 'done' } : null;
    })
    .filter(Boolean);
}
