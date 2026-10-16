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
  selectedFormat: null, rawDump: null, draftScript: null, history: [],
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
      return { ...state, screen: 'pulled-reference', branch: 'reference' };
    case 'CHOOSE_IDEA':
      return { ...state, screen: 'idea-source-choice', branch: 'idea' };

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
      if (state.branch === 'footage') return { ...state, screen: 'footage-use-choice' };
      if (state.branch === 'reference') return { ...state, screen: 'transcribe' };
      return { ...state, screen: 'format-choice', formatFor: 'idea' };

    // ===== מסלול קטע מצולם =====
    case 'FOOTAGE_AS_IS':
      return { ...state, screen: 'summary' };
    case 'FOOTAGE_CONVERT':
      return { ...state, screen: 'format-choice', formatFor: 'footage' };
    case 'FOOTAGE_SCRIPT_SUBMITTED':
      return { ...state, screen: 'summary', herWords: action.text };

    // ===== בחירת פורמט הנגשה - פופאפ אמיתי, בחירה אמיתית (16/10) =====
    case 'FORMAT_SELECTED':
      return {
        ...state,
        selectedFormat: action.format,
        screen: state.formatFor === 'footage' ? 'footage-script' : 'needs-script-check',
      };

    // ===== "צריך תסריט או לא?" - לא כל תוכן צריך תסריט =====
    case 'NEEDS_SCRIPT_NO':
      return { ...state, screen: 'summary' };
    case 'NEEDS_SCRIPT_YES':
      return { ...state, screen: 'has-idea-choice' };

    // ===== בחירת שיטת הכתיבה (יש לה רעיון + פורמט + אישרה שצריך תסריט) =====
    case 'CHOOSE_REVERSE_DUPLICATION':
      return { ...state, screen: 'describe-idea', branch: 'idea-search' };
    case 'CHOOSE_FROM_SCRATCH':
      return { ...state, screen: 'scratch-intro', branch: 'scratch' };

    case 'SEARCH_GUIDANCE_READY':
      return { ...state, screen: 'search-guidance', ideaDescription: action.idea, searchKeywords: action.keywords };
    case 'SKIP_TO_TRANSCRIBE':
      return { ...state, screen: 'transcribe' };

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
      return { ...state, screen: 'read-aloud' };

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
