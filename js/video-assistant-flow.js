// 13/10/2026: מכונת המצבים הטהורה של "העוזר שלך ליצירת סרטון" - אילו מסכים
// קיימים ולאן עוברים מכל אחד. בלי שום DOM/Firestore כאן בכוונה, כדי
// שהבדיקות יריצו אותה ישירות (ראה test/video-assistant-flow.test.mjs).
// המסך 'from-scratch' לא ממומש כאן - הוא עוטף את הזרימה הקיימת כבר
// (script-hook-writing-framework), ראה js/video-assistant.js.
//
// 14/10/2026 (מאיה, אחרי בדיקה אמיתית: "השלבים בכלל בכלל לא נכונים"):
// "יש לי רעיון" → "שכפול הפוך" גם הוא צריך רפרנס - רק שהיא מתארת את
// הרעיון במילים שלה ומחפשים לה רפרנסים מתאימים (matchInspirationQuery,
// שכבר קיים באפליקציה בדיוק בשביל זה - ראה ההערה "שכפול הפוך" ב-
// inspiration-view.js), במקום רפרנס אקראי מהתחום כמו במסלול "אין לי
// רעיון". אחרי שנמצא/נבחר רפרנס, שני המסלולים ממשיכים זהה: תמלול →
// פרומפט 1.

export const INITIAL_STATE = {
  screen: 'opening', branch: null, hook: null, herWords: null, rerollCount: 0,
  referenceIds: null, referenceIndex: 0,
};

export function nextStep(state, action) {
  switch (action.type) {
    case 'CHOOSE_NO_IDEA':
      return { ...state, screen: 'no-idea-choice' };
    case 'CHOOSE_HAS_IDEA':
      return { ...state, screen: 'has-idea-choice' };

    case 'CHOOSE_PULL_IDEA':
      return { ...state, screen: 'pulled-idea', branch: 'idea' };
    case 'CHOOSE_REFERENCE':
      return { ...state, screen: 'pulled-reference', branch: 'reference' };
    case 'CHOOSE_REVERSE_DUPLICATION':
      // יש לה כבר רעיון משלה, אבל עדיין צריכה רפרנס לשכפל - רק שהרפרנס
      // נמצא לפי חיפוש על הרעיון שלה, לא אקראי מהתחום.
      return { ...state, screen: 'describe-idea', branch: 'idea-search' };
    case 'CHOOSE_FROM_SCRATCH':
      return { ...state, screen: 'from-scratch', branch: 'scratch' };

    case 'IDEA_DESCRIBED':
      return { ...state, ideaDescription: action.text };
    case 'SEARCH_DONE':
      return { ...state, screen: 'searched-reference', referenceIds: action.ids, referenceIndex: 0 };
    case 'RETRY_SEARCH':
      // "לנסח מחדש ולחפש שוב" - חוזרים למסך התיאור בלי לאבד את ה-branch,
      // ומנקים תוצאות חיפוש ישנות כדי ש-state לא יישאר על 'searched-reference'
      // בזמן שהמסך בפועל מראה את טופס התיאור (חשוב ל-saveSession).
      return { ...state, screen: 'describe-idea', referenceIds: null, referenceIndex: 0 };
    case 'NEXT_SEARCH_RESULT':
      return { ...state, referenceIndex: state.referenceIndex + 1 };
    case 'SKIP_TO_TRANSCRIBE':
      // לא נמצא רפרנס מתאים בחיפוש - היא הולכת לחפש בעצמה בטיקטוק/אינסטגרם
      // ומתמללת את מה שהיא מצאה, בדיוק כמו רפרנס שנמצא דרך הכלי.
      return { ...state, screen: 'transcribe' };

    case 'REROLL':
      return { ...state, rerollCount: state.rerollCount + 1 };

    case 'ACCEPT_PICK':
      // רעיון שנשלף מהבנק כבר יש לו הוק - מדלגים ישר לכתיבה במילים שלה.
      // רפרנס (אקראי או שנמצא בחיפוש) דורש תמלול ידני קודם.
      return state.branch === 'idea'
        ? { ...state, screen: 'her-words' }
        : { ...state, screen: 'transcribe' };

    case 'CONFIRM_DONE':
      if (state.screen === 'transcribe') return { ...state, screen: 'prompt1' };
      if (state.screen === 'read-aloud') return { ...state, screen: 'done' };
      throw new Error(`CONFIRM_DONE not valid from screen "${state.screen}"`);

    case 'HOOK_CHOSEN':
      return { ...state, screen: 'her-words', hook: action.hook };
    case 'HER_WORDS_SUBMITTED':
      return { ...state, screen: 'prompt2', herWords: action.text };
    case 'SCRIPT_READY':
      return { ...state, screen: 'read-aloud' };

    default:
      throw new Error(`unknown action type: ${action.type}`);
  }
}
