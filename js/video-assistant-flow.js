// 13/10/2026: מכונת המצבים הטהורה של "העוזר שלך ליצירת סרטון" - אילו מסכים
// קיימים ולאן עוברים מכל אחד. בלי שום DOM/Firestore כאן בכוונה, כדי
// שהבדיקות יריצו אותה ישירות (ראה test/video-assistant-flow.test.mjs).
// המסך 'from-scratch' לא ממומש כאן - הוא עוטף את הזרימה הקיימת כבר
// (script-hook-writing-framework), ראה js/video-assistant.js.

export const INITIAL_STATE = { screen: 'opening', branch: null, hook: null, herWords: null, rerollCount: 0 };

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
      // יש לה כבר רעיון משלה - מדלגים ישר לכתיבה במילים שלה, בלי שלב תמלול
      return { ...state, screen: 'her-words', branch: 'idea' };
    case 'CHOOSE_FROM_SCRATCH':
      return { ...state, screen: 'from-scratch', branch: 'scratch' };

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
