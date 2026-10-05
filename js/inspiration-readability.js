// 05/10/2026 (מאיה: "לא כולן מבינות שפות אחרות, וגם לא כל הסרטונים הם
// דיבור, אז לפעמים זה בעיה").
//
// מדידה על 453 הסרטונים: רק 59 בעברית. 209 ברוסית, 129 באנגלית, 65 זרים
// בלי תרגום בכלל, ו-119 כמעט בלי טקסט מדובר. לקוחה נוחתת על מאגר שרובו
// לא בשפה שלה, ואין שום דבר שאומר לה את זה מראש.
//
// המושג הנכון אינו "שפה" אלא "האם אני יכולה להבין את זה", כי זה מאחד את
// שתי הבעיות: סרטון ברוסית בלי תרגום וסרטון בלי דיבור בכלל חוסמים אותה
// באותה מידה, אבל מסיבות הפוכות - ודווקא הסרטון בלי דיבור הוא לרוב
// הנגיש ביותר, כי אין מה להבין.

export const READABILITY = {
  hebrew: { id: 'hebrew', label: 'בעברית', chip: 'עברית', order: 1 },
  translated: { id: 'translated', label: 'מתורגם לעברית', chip: 'תרגום', order: 2 },
  visual: { id: 'visual', label: 'ויזואלי, בלי דיבור', chip: 'ויזואלי', order: 3 },
  untranslated: { id: 'untranslated', label: 'עדיין בלי תרגום', chip: 'בלי תרגום', order: 4 },
};

// מתחת לזה זה לא באמת דיבור: כותרת, קריאה אחת, או רעש שהתמלול תפס
const SPEECH_MIN_CHARS = 120;

export const LANGUAGE_NAME = {
  he: 'עברית', ru: 'רוסית', en: 'אנגלית', pt: 'פורטוגזית', it: 'איטלקית',
  ko: 'קוריאנית', hi: 'הינדי', fa: 'פרסית', si: 'סינהלה', jw: 'יאוואנית',
  la: 'לטינית', nn: 'נורווגית',
};

/**
 * האם הלקוחה תוכל להבין את הסרטון, ולמה.
 * מיוצא לבדיקות - זה מה שקובע את התגית ואת הסינון.
 */
export function readabilityOf(video) {
  const v = video || {};
  const lang = v.sourceLanguage || null;
  const spoken = String(v.transcriptHe || v.transcript || '').trim();
  const translated = String(v.translationHe || '').trim();
  const isForeign = Boolean(lang) && lang !== 'he';

  // כמעט בלי דיבור: הסרטון מובן מהצפייה, בלי קשר לשפה. זאת לא בעיה
  if (spoken.length < SPEECH_MIN_CHARS && translated.length < SPEECH_MIN_CHARS) {
    return READABILITY.visual;
  }
  if (!isForeign && spoken) return READABILITY.hebrew;
  if (translated) return READABILITY.translated;
  return READABILITY.untranslated;
}

/** שם השפה בעברית, או null כשלא ידוע. */
export function languageName(video) {
  const lang = (video || {}).sourceLanguage;
  return lang ? (LANGUAGE_NAME[lang] || lang) : null;
}

/** האם הסרטון עובר את מסנן ההבנה שנבחר. value ריק = הכל. */
export function passesReadability(video, value) {
  if (!value) return true;
  // "מה שאני יכולה להבין" - עברית, מתורגם, או ויזואלי
  if (value === 'understandable') return readabilityOf(video).id !== 'untranslated';
  return readabilityOf(video).id === value;
}
