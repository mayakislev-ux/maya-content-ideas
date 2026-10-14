// 13/10/2026: מכונת המצבים הטהורה של "העוזר שלך ליצירת סרטון" - אילו מסכים
// קיימים ולאן עוברים מכל אחד. בלי שום DOM/Firestore כאן בכוונה, כדי
// שהבדיקות יריצו אותה ישירות (ראה test/video-assistant-flow.test.mjs).
//
// 14/10/2026 (מאיה, אחרי ניתוח מעמיק של "מפת הדרכים ליצירת תוכן" האמיתית -
// https://mayakislev.co.il/מפת-דרכים-ליצירת-תוכן.html - ושישה המסמכים
// שמקושרים ממנה): "מרגיש שעכשיו קצת סיבכנו את העניינים" - ההחלטה: לא
// לשכפל בתוך הכלי את כל התוכן העשיר של המסמכים (16 פורמטים, 31 זוויות,
// 3 פרומפטים ל-ChatGPT) - בדיוק כמו שהמפה האמיתית שלה לא עושה את זה,
// רק מפנה אליהם בלינק. מה שכן תוקן כאן: המבנה האמיתי -
// 1. שלושה מסלולי פתיחה אמיתיים (לא שניים): קטע מצולם / מצאתי סרטון
//    שעבד ברשת (שכפול) / יש לי רעיון.
// 2. שער "רלוונטי לקהל היעד / משרת את המותג" אחרי כל מסלול - היה חסר
//    לגמרי קודם.
// 3. "צריך תסריט או לא" - לא כל תוכן צריך תסריט (מודגש פעמיים במסמך שלה).
// 4. קישור אמיתי לרשימת הפורמטים ולפרומפטים, במקום לא להזכיר אותם בכלל.

export const INITIAL_STATE = {
  screen: 'opening', branch: null, hook: null, herWords: null, rerollCount: 0,
  ideaDescription: null, searchKeywords: null, formatFor: null,
};

export function nextStep(state, action) {
  switch (action.type) {
    // ===== שלושת מסלולי הפתיחה =====
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
      // רעיון מהבנק ורפרנס שנמצא שניהם עוברים עכשיו קודם דרך שער
      // הרלוונטיות - בדיוק כמו בכל מסלול אחר במפה האמיתית.
      return { ...state, screen: 'relevance-check' };

    // ===== השער המשותף: "רלוונטי לקהל היעד, או משרת את המותג?" =====
    case 'RELEVANCE_CONFIRMED':
      if (state.branch === 'footage') return { ...state, screen: 'footage-use-choice' };
      if (state.branch === 'reference') return { ...state, screen: 'transcribe' };
      return { ...state, screen: 'format-choice', formatFor: 'idea' };

    // ===== מסלול קטע מצולם =====
    case 'FOOTAGE_AS_IS':
      return { ...state, screen: 'footage-done' };
    case 'FOOTAGE_CONVERT':
      return { ...state, screen: 'format-choice', formatFor: 'footage' };
    case 'FOOTAGE_SCRIPT_SUBMITTED':
      return { ...state, screen: 'footage-done', herWords: action.text };

    // ===== בחירת פורמט הנגשה (רק קישור למסמך האמיתי, לא נבנה מחדש) =====
    case 'FORMAT_ACKNOWLEDGED':
      return state.formatFor === 'footage'
        ? { ...state, screen: 'footage-script' }
        : { ...state, screen: 'needs-script-check' };

    // ===== "צריך תסריט או לא?" - לא כל תוכן צריך תסריט =====
    case 'NEEDS_SCRIPT_NO':
      return { ...state, screen: 'no-script-done' };
    case 'NEEDS_SCRIPT_YES':
      return { ...state, screen: 'has-idea-choice' };

    // ===== בחירת שיטת הכתיבה (יש לה רעיון + פורמט + אישרה שצריך תסריט) =====
    case 'CHOOSE_REVERSE_DUPLICATION':
      return { ...state, screen: 'describe-idea', branch: 'idea-search' };
    case 'CHOOSE_FROM_SCRATCH':
      return { ...state, screen: 'from-scratch', branch: 'scratch' };

    case 'SEARCH_GUIDANCE_READY':
      return { ...state, screen: 'search-guidance', ideaDescription: action.idea, searchKeywords: action.keywords };
    case 'SKIP_TO_TRANSCRIBE':
      return { ...state, screen: 'transcribe' };

    // ===== הצינור המשותף: תמלול → פרומפט 1 → המילים שלה → פרומפט 2 → קריאה בקול → סיום =====
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
