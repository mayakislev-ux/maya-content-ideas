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
  // 19/10/2026 (מאיה: "הוא כתב את כל התסריט" - שכפול הפוך הדביק את כל
  // התמלול כ"ההוק" בפרומפט ל-ChatGPT) - ההוק הפותח שזוהה אוטומטית מתוך
  // התמלול (extractOpeningHook), נפרד מ-hook שהוא ההוק הסופי שנבחר
  // מתוך ה-30 שChatGPT מחזיר.
  openingHook: null,
  // 18/10/2026 (מאיה: "הסיכום בסוף כללי מדי, לא מובן איך אני בונה את
  // הסרטון שלי"): בלי שני השדות האלה אין שום זכר בסטייט לאיזה מסלול
  // קטע-מצולם ספציפי עברה (דיבור, או ויזואלי-רגע/מסר/סיפור) - מסך
  // הסיכום לא יכול להיות קונקרטי בלעדיהם.
  footageKind: null, footageOutcome: null,
  /* 22/10/2026 (מאיה: "להכניס את זווית ההגשה לרעיון ולא סתם שיכתבו רעיון,
     קודם כל לוודא שיש זווית הגשה חזקה"): עד היום מסלול הכתיבה מאפס התחיל
     משפיכת תוכן והמשיך להוק. זווית ההגשה הייתה חומר עזר בלבד, ולכן אפשר
     היה לכתוב תסריט שלם על רעיון בלי שום זווית. עכשיו היא השלב הראשון,
     ו-angleWhy הוא המשפט שבו היא מנמקת למה הזווית הזאת מחזיקה - זה מה
     שהצ'אט "בדיקת רעיון" לוחץ עליו במסך שאחריו. */
  angle: null, angleWhy: null,
  /* 23/10/2026 (מאיה: "תוסיפי גם מקום לשים לינק לסרטון וגם להוסיף
     תמלול, כדי שבסיכום האחרון יהיה לי הכל מסודר"). התמלול כבר נשמר,
     הלינק לא, ולכן בסוף התהליך לא היה זכר לסרטון שהיא משכפלת. */
  referenceLink: null,
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
      /* 23/10/2026: בקטע שכבר צולם אין מה לבדוק רלוונטיות ואין מה לבחור
         זווית, הוא כבר קיים. משם ממשיכים ישר לפורמט, כמו שמאיה ביקשה:
         "צריך לשאול קודם כל מה הרעיון/מסר שתרצה להעביר, ואז לבקש לבחור
         פורמט הנגשה, ואז לשאול אם צריך תסריט". */
      if (state.branch === 'footage') {
        return { ...state, screen: 'format-choice', formatFor: 'idea', ideaDescription: action.text };
      }
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
      /* 23/10/2026 (מאיה: "אחרי שבחרתי רעיון לפני פורמט חייב לוודא האם
         יש זווית הנגשה חזקה לרעיון... ורק אחרי שיש זווית הנגשה בוחרים
         פורמט הנגשה"). ב-22/10 שמתי את הזווית בתוך מסלול הכתיבה מאפס,
         כלומר אחרי הפורמט ואחרי "צריך תסריט". זה היה מאוחר מדי: אותו
         רעיון אפשר להנגיש באלפי דרכים, והפורמט נבחר כשעוד לא ידוע מה
         בכלל הזווית. */
      return { ...state, screen: 'angle' };

    // ===== מסלול קטע מצולם - "מה צילמת?" (18/10/2026, מאיה: עיצוב מחדש
    // מלא - מחליף את "משתמש/ת בו כמו שהוא / רוצה להמיר לפורמט אחר" בליווי
    // אמיתי ללקיטת הקטע, לפי אם יש בו דיבור או שהוא ויזואלי) =====
    case 'FOOTAGE_IS_SPEECH':
      return { ...state, screen: 'footage-speech-find', footageKind: 'speech' };
    case 'FOOTAGE_IS_VISUAL':
      return { ...state, screen: 'footage-visual-scan', footageKind: 'visual' };

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
      return { ...state, screen: 'footage-visual-extract', footageOutcome: 'extract' };
    case 'FOOTAGE_VISUAL_EXTRACT_DONE':
      return { ...state, screen: 'summary' };
    case 'FOOTAGE_VISUAL_NO_MOMENT':
      return { ...state, screen: 'footage-visual-reframe' };
    case 'FOOTAGE_VISUAL_FOUND_MESSAGE':
      return { ...state, screen: 'footage-visual-message', footageOutcome: 'message' };
    case 'FOOTAGE_VISUAL_FOUND_STORY':
      return { ...state, screen: 'footage-visual-story', footageOutcome: 'story' };
    case 'FOOTAGE_VISUAL_READY':
      /* 23/10/2026 (מאיה: "נגיד שלוחצים על מצאתי מסר או סיפור, בתכלס זה
         סוג של בניית סרטון מ-0"). עד כאן זה קפץ ישר לסיכום, כלומר היא
         ידעה סביב מה לבנות אבל לא קיבלה שום ליווי בבנייה עצמה. */
      return { ...state, screen: 'type-idea' };

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

    // ===== הצינור המשותף: תמלול → [פרומפט 1 → המילים שלה] או [המילים שלה
    // → פרומפט 1] → פרומפט 2 → קריאה בקול → סיכום. הסדר בין פרומפט 1
    // למילים שלה שונה בין שני המסלולים - ראה הערה ב-HOOK_CHOSEN למטה. =====
    case 'CONFIRM_DONE':
      if (state.screen === 'transcribe') {
        // 19/10/2026 (מאיה, אחרי שהבהירה פעמיים: "בשכפול הפוך לפני
        // שמוצאים הוק צריך קודם שידביקו לך את המגילת אסתר") - בשכפול
        // הפוך (idea-search) כותבים את מגילת אסתר (state.herWords) *לפני*
        // שמחפשים הוק, כי התוכן שלה נכנס לתוך פרומפט 1 עצמו (ראה
        // buildReverseDuplicationPrompt) - ChatGPT "מחליט על הוקים" לפי
        // המגילה שלה + הרפרנס, לא רק לפי שורת-רעיון קצרה. בשכפול רגיל
        // (branch 'reference') הסדר נשאר כמו שהיה: קודם ההוק, המגילה רק
        // אחר כך (כי שם עוד אין רעיון קונקרטי לדבר עליו).
        if (state.branch === 'idea-search') return { ...state, screen: 'her-words' };
        return { ...state, screen: 'prompt1' };
      }
      if (state.screen === 'read-aloud') return { ...state, screen: 'summary' };
      throw new Error(`CONFIRM_DONE not valid from screen "${state.screen}"`);
    case 'HOOK_CHOSEN':
      // בשכפול הפוך המגילה כבר נכתבה (לפני ההוק) - ממשיכים ישר לפרומפט
      // הסופי. בשכפול רגיל זה הרגע שבו שואלים אותה מה יש לה להגיד.
      if (state.branch === 'idea-search') return { ...state, screen: 'prompt2', hook: action.hook };
      return { ...state, screen: 'her-words', hook: action.hook };
    case 'HER_WORDS_SUBMITTED':
      if (state.branch === 'idea-search') return { ...state, screen: 'prompt1', herWords: action.text };
      return { ...state, screen: 'prompt2', herWords: action.text };
    case 'SCRIPT_READY':
      // 17/10/2026 (מאיה: "הייתי שמחה שבסיכום יהיה כתוב גם את התסריט") -
      // עכשיו שומרים את התסריט הסופי שחזרה איתו, לא רק ממשיכים הלאה.
      return { ...state, screen: 'read-aloud', finalScript: action.text };

    // ===== מסלול "כתיבה מאפס" - 4 הפרומפטים האמיתיים מתוך המסמך שלה =====
    // שלב 1 (אופציונלי, רק למי שתקועה): פרומפט חילוץ תוכן, או כתיבה חופשית
    // שלב 0 (חדש, 22/10): זווית ההגשה. בלי זווית אין מה לכתוב.
    case 'ANGLE_CHOSEN':
      return { ...state, screen: 'angle-check', angle: action.angle };
    // הנימוק נשמר גם כשהיא מדלגת על הצ'אט, כי הוא נכנס לפרומפטים הבאים
    case 'ANGLE_CONFIRMED':
      return { ...state, screen: 'format-choice', formatFor: 'idea', angleWhy: action.why || null };

    case 'SCRATCH_START_DUMP':
      /* הזווית היא תנאי ולא המלצה. בלי השורה הזאת אפשר היה לקפוץ ישר
         לכתיבה דרך כל קריאה שלא עברה במסך הזווית, וזה בדיוק מה שמאיה
         ביקשה למנוע: "קודם כל לוודא שיש זווית הגשה חזקה". */
      if (!state.angle) throw new Error('SCRATCH_START_DUMP before an angle was chosen');
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
