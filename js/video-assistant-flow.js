// 13/10/2026: מכונת המצבים הטהורה של "העוזר שלך ליצירת סרטון" - אילו מסכים
// קיימים ולאן עוברים מכל אחד. בלי שום DOM/Firestore כאן בכוונה, כדי
// שהבדיקות יריצו אותה ישירות (ראה test/video-assistant-flow.test.mjs).
//
// 16/10/2026 (מאיה, אחרי שבדקה בפועל - 10 הערות מפורטות): "לא באלי שיהיה
// אף כפתור שיפתח קובץ בנפרד, הכל בפופאפים" - מהפך מלא מהגרסה הקודמת
// (14/10), שבה ההחלטה היתה "אל תשכפלי את התוכן, רק תפני בלינק". עכשיו
// הפוך: כל התוכן האמיתי (16 פורמטים, 31 זוויות הנגשה, 4 פרומפטים
// ל-ChatGPT כולל בנק הוקים אמיתי) חי בתוך הכלי עצמו - ראה
// video-assistant-content.js. גם נוספו: כפתור חזרה אמיתי מכל מסך (היסטוריה
// מלאה, לא רק per-screen), 3 כפתורי הפתיחה בניסוח המדויק שלה, שאלת "צריך
// תסריט" עם ניסוח מתוקן, בחירת פורמט אמיתית (לא רק אישור), ומסך סיכום
// ברור בסוף שמראה בדיוק מה היא עשתה/צריכה לעשות.

export const INITIAL_STATE = {
  screen: 'opening', branch: null, hook: null, hookReinforcement: null, herWords: null,
  rerollCount: 0, ideaDescription: null, searchKeywords: null, formatFor: null,
  selectedFormat: null, rawDump: null, draftScript: null, finalScript: null, history: [],
};

function withoutHistory(state) {
  const { history, ...rest } = state;
  return rest;
}

function push(state) {
  return [...state.history, withoutHistory(state)];
}

export function nextStep(state, action) {
  if (action.type === 'BACK') {
    if (!state.history.length) return state;
    const prev = state.history[state.history.length - 1];
    return { ...prev, history: state.history.slice(0, -1) };
  }

  const next = step(state, action);
  // neither is a navigational move worth a back-entry: REROLL stays on the
  // same screen, and RESTART already wipes the state (including history).
  if (action.type === 'REROLL' || action.type === 'RESTART') return next;
  return { ...next, history: push(state) };
}

function step(state, action) {
  switch (action.type) {
    // ===== שלושת מסלולי הפתיחה (ניסוח מדויק של מאיה, 16/10) =====
    // "מצאתי רפרנס לשכפול" / "יש לי קטע שצולם" / "יש לי רעיון מ-0"
    case 'CHOOSE_FOOTAGE':
      return { ...state, screen: 'relevance-check', branch: 'footage' };
    case 'CHOOSE_REFERENCE':
      return { ...state, screen: 'reference-source-choice', branch: 'reference' };
    case 'CHOOSE_IDEA':
      return { ...state, screen: 'idea-source-choice', branch: 'idea' };

    // ===== מסלול "מצאתי רפרנס" - יש לה כבר אחד, או שצריך להגריל לה (17/10,
    // מאיה: "צריך להיות 2 כפתורים יש לי רפרנס / אין לי רפרנס ואז להגריל") =====
    case 'CHOOSE_HAS_REFERENCE':
      return { ...state, screen: 'relevance-check' };
    case 'CHOOSE_PULL_REFERENCE':
      return { ...state, screen: 'pulled-reference' };

    // ===== מסלול "יש לי רעיון" - איך מקבלים את הרעיון =====
    case 'CHOOSE_TYPE_IDEA':
      return { ...state, screen: 'type-idea' };
    case 'IDEA_TYPED':
      return { ...state, screen: 'relevance-check', ideaDescription: action.text };
    case 'CHOOSE_PULL_IDEA':
      return { ...state, screen: 'pulled-idea' };

    // ===== בחירה/הגרלה (קיים, ללא שינוי) =====
    case 'REROLL':
      return { ...state, rerollCount: state.rerollCount + 1 };
    case 'ACCEPT_PICK':
      return { ...state, screen: 'relevance-check' };

    // ===== השער המשותף: "רלוונטי לקהל היעד, או משרת את המותג?" =====
    case 'RELEVANCE_CONFIRMED':
      if (state.branch === 'footage') return { ...state, screen: 'footage-type-choice' };
      if (state.branch === 'reference') return { ...state, screen: 'transcribe' };
      return { ...state, screen: 'format-choice', formatFor: 'idea' };

    // ===== מסלול קטע מצולם - "מה צילמת?" (18/10/2026, מאיה: עיצוב מחדש
    // מלא - מחליף את "משתמש/ת בו כמו שהוא / רוצה להמיר לפורמט אחר" בליווי
    // אמיתי ללקיטת הקטע, לפי אם יש בו דיבור או שהוא ויזואלי) =====
    case 'FOOTAGE_IS_SPEECH':
      return { ...state, screen: 'footage-speech-find' };
    case 'FOOTAGE_IS_VISUAL':
      return { ...state, screen: 'footage-visual-scan' };

    // --- תת-ענף "יש בו דיבור" - 18/10/2026 (מאיה: "כל המטרות כאן נכונות,
    // יש פה בלבול") - זה לא באמת 3 מסלולים נפרדים שבוחרים ביניהם, זה 3
    // שלבים שכולם רלוונטיים לאותו קטע: קודם מוצאים רגע חזק, אז מקצרים
    // אותו, ואז מחדדים אותו שיווקית. רצף אחד, לא בחירה. מסתיים באותו מסך
    // סיום (Hook → Point → Proof → End). אותו דפוס כמו CONFIRM_DONE -
    // הצעד הבא נקבע לפי המסך הנוכחי. ---
    case 'FOOTAGE_SPEECH_NEXT':
      if (state.screen === 'footage-speech-find') return { ...state, screen: 'footage-speech-shorten' };
      if (state.screen === 'footage-speech-shorten') return { ...state, screen: 'footage-speech-sharpen' };
      if (state.screen === 'footage-speech-sharpen') return { ...state, screen: 'footage-speech-done' };
      throw new Error(`FOOTAGE_SPEECH_NEXT not valid from screen "${state.screen}"`);
    case 'FOOTAGE_SPEECH_DONE':
      return { ...state, screen: 'summary' };

    // --- תת-ענף "קטע ויזואלי" - קודם סריקה אחת, ואז או שיש רגע לחלץ או
    // שהופכים את החומר לתוכן אחר. 18/10/2026 (מאיה: "מצאתי שאלה/התנגדות
    // חוסם... אז רגע מסר וסיפור בלי עוד כפתור") - "שאלה/התנגדות" הוסר,
    // נשארו רק מסר וסיפור. ---
    case 'FOOTAGE_VISUAL_FOUND_MOMENT':
      return { ...state, screen: 'footage-visual-extract' };
    case 'FOOTAGE_VISUAL_EXTRACT_DONE':
      return { ...state, screen: 'summary' };
    case 'FOOTAGE_VISUAL_NO_MOMENT':
      return { ...state, screen: 'footage-visual-reframe' };
    case 'FOOTAGE_VISUAL_FOUND_MESSAGE':
      return { ...state, screen: 'footage-visual-message' };
    case 'FOOTAGE_VISUAL_FOUND_STORY':
      return { ...state, screen: 'footage-visual-story' };
    case 'FOOTAGE_VISUAL_READY':
      return { ...state, screen: 'summary' };

    // ===== בחירת פורמט הנגשה - פופאפ אמיתי, בחירה אמיתית (16/10) - מסלול
    // "רעיון מ-0" בלבד; קטע מצולם עבר למסלול הייעודי שלו למעלה =====
    case 'FORMAT_SELECTED':
      return { ...state, selectedFormat: action.format, screen: 'needs-script-check' };

    // ===== "צריך תסריט או לא?" - לא כל תוכן צריך תסריט =====
    case 'NEEDS_SCRIPT_NO':
      return { ...state, screen: 'summary' };
    case 'NEEDS_SCRIPT_YES':
      return { ...state, screen: 'has-idea-choice' };

    // ===== בחירת שיטת הכתיבה (יש לה רעיון + פורמט + אישרה שצריך תסריט) =====
    // 18/10/2026 (מאיה: "מצאתי רפרנס מתאים לשכפול הפוך" / "לא מצאתי רפרנס
    // שיכול להתאים"): מי שלוחצת שהיא כבר מצאה רפרנס מדלגת ישר לתמלול -
    // אין טעם להציע לה עזרה בחיפוש רפרנס שהיא כבר אומרת שיש לה.
    case 'CHOOSE_REVERSE_DUPLICATION':
      return { ...state, screen: 'transcribe', branch: 'idea-search' };
    case 'CHOOSE_FROM_SCRATCH':
      return { ...state, screen: 'scratch-intro', branch: 'scratch' };

    // ===== הצינור המשותף (מסלול שכפול הפוך/רגיל): תמלול → פרומפט 1 →
    // המילים שלה → פרומפט 2 → קריאה בקול → סיכום =====
    case 'CONFIRM_DONE':
      if (state.screen === 'transcribe') return { ...state, screen: 'prompt1' };
      if (state.screen === 'read-aloud') return { ...state, screen: 'summary' };
      throw new Error(`CONFIRM_DONE not valid from screen "${state.screen}"`);
    case 'HOOK_CHOSEN':
      return { ...state, screen: 'her-words', hook: action.hook };
    case 'HER_WORDS_SUBMITTED':
      return { ...state, screen: 'prompt2', herWords: action.text };
    case 'SCRIPT_READY':
      // 17/10/2026 (מאיה: "הייתי שמחה שבסיכום יהיה כתוב גם את התסריט") -
      // עכשיו שומרים את התסריט הסופי שחזרה איתו, לא רק ממשיכים הלאה.
      return { ...state, screen: 'read-aloud', finalScript: action.text };

    // ===== מסלול "כתיבה מאפס" - 4 הפרומפטים האמיתיים מתוך המסמך שלה =====
    // שלב 1 (אופציונלי, רק למי שתקועה): פרומפט חילוץ תוכן, או כתיבה חופשית
    case 'SCRATCH_START_DUMP':
      return { ...state, screen: 'scratch-dump' };
    case 'SCRATCH_DUMP_READY':
      return { ...state, screen: 'scratch-hook', rawDump: action.text };
    // שלב 2: פרומפט מציאת הוק (בנק של כ-140 הוקים אמיתיים מוטמע)
    case 'SCRATCH_HOOK_CHOSEN':
      return { ...state, screen: 'scratch-hook-reinforce', hook: action.hook };
    // שלב 3: פרומפט חיזוק הוק
    case 'SCRATCH_REINFORCEMENT_CHOSEN':
      return { ...state, screen: 'scratch-distill', hookReinforcement: action.text };
    // שלב 4: פרומפט זיקוק תסריט סופי
    case 'SCRATCH_SCRIPT_READY':
      return { ...state, screen: 'summary', draftScript: action.text };

    // ===== מסך הסיכום הסופי - "אפילו ילד בן 10 יכול להבין" =====
    case 'RESTART':
      return { ...INITIAL_STATE };

    default:
      throw new Error(`unknown action type: ${action.type}`);
  }
}
