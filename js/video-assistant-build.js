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
    full: (s) => s.referenceLink || s.transcript,
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
    full: (s) => s.rawDump,
    screens: ['scratch-dump'],
  },
  herWords: {
    label: 'מה יש לך להגיד',
    get: (s) => clip(s.herWords),
    full: (s) => s.herWords,
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
    full: (s) => s.draftScript || s.finalScript,
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

/* 31/10/2026 (מאיה: "לא רואים את כל מה שכתבתי, אבל זה מעולה כי זה אורך,
   אז כפתור 'עוד' שנראה הכל במידת הצורך"). value נשאר מקוצר, ו-full הוא
   הטקסט המלא, רק כשבאמת יש עוד מה לראות. */
/** רשימת החלקים להצגה: done (נבנה), now (נבנה במסך הזה), wait (בהמשך).
    ריקה כשעוד לא נבנה כלום, וגם במסך הסיכום, שמציג את הכל בעצמו. */
export function buildParts(state) {
  if (!state || state.screen === 'summary') return [];
  const keys = BY_BRANCH[state.branch];
  if (!keys) return [];
  const rows = keys.map((key) => {
    const part = PARTS[key];
    const value = part.get(state);
    const shown = value ? String(value).trim() : '';
    const whole = part.full ? String(part.full(state) || '').trim() : shown;
    return { key, label: part.label, value: shown, full: whole !== shown ? whole : '', big: !!part.big, here: part.screens.includes(state.screen) };
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

/* 29/10/2026 (מאיה): "שיהיה כפתור 'התסריטים שלי', ואז כל פעם זה ישמור את
   כל מה שהיא כותבת, ויהיה לה אופציה גם לערוך/למחוק". כל סרטון שנבנה הוא
   פריט אחד, והוא נשמר כמו שהוא: כל הסטייט, כדי ש"להמשיך לבנות" יחזיר
   בדיוק לאותו מקום. */

/** השדה בסטייט שמחזיק כל חלק, כדי שעריכה ברשימה תכתוב למקום הנכון. */
const FIELD = {
  reference: (s) => (s.referenceLink ? 'referenceLink' : 'transcript'),
  idea: (s) => (s.ideaTopic ? 'ideaTopic' : (s.ideaBeforePackaging ? 'ideaBeforePackaging' : 'ideaDescription')),
  message: (s) => (s.ideaPunchline ? 'ideaPunchline' : (s.ideaBeforePackaging ? 'ideaBeforePackaging' : 'ideaDescription')),
  packaging: () => 'packaging',
  format: () => 'selectedFormat',
  dump: () => 'rawDump',
  herWords: () => 'herWords',
  hook: () => 'hook',
  reinforce: () => 'hookReinforcement',
  /* כמו finalScriptText במסך הסיכום: בכתיבה מאפס draftScript, בשאר finalScript */
  script: (s) => (s.branch === 'scratch' ? 'draftScript' : 'finalScript'),
};

/* בקטע שצולם הטקסט שלה בסיכום הוא herWords, ולכן גם הוא ברשימה. */
const FIELDS_BY_BRANCH = { ...BY_BRANCH, footage: [...BY_BRANCH.footage, 'herWords'] };

/** כל החלקים שכבר נכתבו בסרטון, במלואם (בלי קיצור), עם השדה של כל אחד. */
export function scriptFields(state) {
  const keys = FIELDS_BY_BRANCH[state && state.branch];
  if (!keys) return [];
  return keys
    .filter((key) => state[FIELD[key](state)])
    .map((key) => {
      const field = FIELD[key](state);
      return { key, label: PARTS[key].label, field, value: String(state[field] || '') };
    })
    .filter((f) => f.value.trim());
}

const IDEA_FIELDS = ['ideaTopic', 'ideaPunchline', 'packaging', 'ideaBeforePackaging', 'ideaDescription'];

/**
 * עריכה ברשימה של הנושא, המסר או האריזה צריכה להגיע גם למשפט המשולב
 * שהפרומפטים והסיכום קוראים (ideaDescription). אותה בנייה כמו
 * IDEA_SHARPENED ו-PACKAGING_CHOSEN ב-video-assistant-flow.js.
 */
export function syncIdea(state, field) {
  if (!IDEA_FIELDS.includes(field)) return state;
  const out = { ...state };
  let base;
  if (out.ideaTopic || out.ideaPunchline) {
    const t = String(out.ideaTopic || '').trim();
    const p = String(out.ideaPunchline || '').trim();
    base = p ? (t && !p.includes(t) ? `${p}. נושא הסרטון: ${t}` : p) : t;
  } else if (field === 'ideaDescription' && !out.packaging) {
    base = out.ideaDescription;
  } else {
    base = out.ideaBeforePackaging || out.ideaDescription;
  }
  if (!base) return out;
  if (out.packaging) {
    out.ideaBeforePackaging = base;
    out.ideaDescription = `${base}. האריזה הקריאייטיבית: ${out.packaging}`;
  } else {
    out.ideaDescription = base;
  }
  return out;
}

/** יש בסרטון משהו שכדאי לשמור: חלק שנבנה, או טקסט שהוקלד ועוד לא עבר הלאה. */
export function hasContent(state) {
  if (!state || !state.branch) return false;
  if (scriptFields(state).length) return true;
  return Object.values(state.drafts || {}).some((v) => String(v || '').trim().length > 2);
}

/** השם של הסרטון ברשימה: הרעיון, ואם אין, הדבר הראשון שנכתב. */
export function scriptTitle(state) {
  const pick = (state.ideaTopic || state.ideaBeforePackaging || state.ideaDescription || state.hook
    || Object.values(state.drafts || {}).find((v) => String(v || '').trim()) || '').trim();
  return pick ? clip(pick.split('\n')[0], 70) : 'סרטון בלי שם';
}

/** המסמך שנשמר ב-videoAssistantScripts/{uid}/items/{id}. */
export function scriptDoc(state, now = Date.now()) {
  return {
    title: scriptTitle(state),
    done: state.screen === 'summary',
    createdAt: state.scriptCreatedAt || now,
    updatedAt: now,
    state: { ...state },
  };
}
