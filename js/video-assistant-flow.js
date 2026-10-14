// 13/10/2026: מכונת המצבים הטהורה של "העוזר שלך ליצירת סרטון" - אילו מסכים
// קיימים ולאן עוברים מכל אחד. בלי שום DOM/Firestore כאן בכוונה, כדי
// שהבדיקות יריצו אותה ישירות (ראה test/video-assistant-flow.test.mjs).
// המסך 'from-scratch' לא ממומש כאן - הוא עוטף את הזרימה הקיימת כבר
// (script-hook-writing-framework), ראה js/video-assistant.js.
//
// 14/10/2026 (מאיה, שני תיקונים אמיתיים על "יש לי רעיון" → "שכפול הפוך"):
// ניסיון ראשון חיפש לה רפרנס אוטומטית (matchInspirationQuery) והציג
// תוצאה - מאיה: "את לא מקשיבה! אני מביאה לה רעיון, ואני רוצה שהיא תמצא
// רפרנס לבד - את תביאי לה כותרות [מילות חיפוש]". הכלי לא מחפש בשבילה
// בכלל כאן - רק מציע מילות חיפוש (suggestSearchKeywords), והיא עצמה
// מחפשת במאגר ההשראה הרגיל או בטיקטוק/אינסטגרם, וחוזרת לכלי כשמצאה.

export const INITIAL_STATE = {
  screen: 'opening', branch: null, hook: null, herWords: null, rerollCount: 0,
  ideaDescription: null, searchKeywords: null,
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
      // יש לה כבר רעיון משלה, אבל עדיין צריכה רפרנס לשכפל - היא עצמה
      // מוצאת אותו, הכלי רק מציע לה מילות חיפוש.
      return { ...state, screen: 'describe-idea', branch: 'idea-search' };
    case 'CHOOSE_FROM_SCRATCH':
      return { ...state, screen: 'from-scratch', branch: 'scratch' };

    case 'SEARCH_GUIDANCE_READY':
      return { ...state, screen: 'search-guidance', ideaDescription: action.idea, searchKeywords: action.keywords };
    case 'SKIP_TO_TRANSCRIBE':
      // היא מצאה רפרנס בעצמה (במאגר או בטיקטוק/אינסטגרם) - ממשיכה לתמלול,
      // בדיוק כמו רפרנס שנשלף אקראית במסלול "אין לי רעיון".
      return { ...state, screen: 'transcribe' };

    case 'REROLL':
      return { ...state, rerollCount: state.rerollCount + 1 };

    case 'ACCEPT_PICK':
      // רעיון שנשלף מהבנק כבר יש לו הוק - מדלגים ישר לכתיבה במילים שלה.
      // רפרנס דורש תמלול ידני קודם.
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
