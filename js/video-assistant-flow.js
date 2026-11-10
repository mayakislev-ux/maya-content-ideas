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

/* 06/11/2026: עזר טהור (בלי DOM), כמו שאר הקובץ */
import { withAngle } from './idea-reply.js';

export const INITIAL_STATE = {
  screen: 'opening', branch: null, hook: null, hookReinforcement: null, herWords: null,
  rerollCount: 0, ideaDescription: null, searchKeywords: null, formatFor: null,
  selectedFormat: null, rawDump: null, draftScript: null, finalScript: null, history: [],
  // 19/10/2026 (מאיה: "הוא כתב את כל התסריט" - שכפול הפוך הדביק את כל
  // התמלול כ"ההוק" בפרומפט ל-ChatGPT) - ההוק הפותח שזוהה אוטומטית מתוך
  // התמלול (extractOpeningHook), נפרד מ-hook שהוא ההוק הסופי שנבחר
  // מתוך ה-30 שChatGPT מחזיר.
  openingHook: null,
  // 10/11/2026: הקהל שנבחר בכפתור הקהל לסרטון הזה. null = העיקרי.
  audiencePick: null,
  // 18/10/2026 (מאיה: "הסיכום בסוף כללי מדי, לא מובן איך אני בונה את
  // הסרטון שלי"): בלי שני השדות האלה אין שום זכר בסטייט לאיזה מסלול
  // קטע-מצולם ספציפי עברה (דיבור, או ויזואלי-רגע/מסר/סיפור) - מסך
  // הסיכום לא יכול להיות קונקרטי בלעדיהם.
  footageKind: null, footageOutcome: null,
  /* 26/10/2026 (מאיה): "בחלק של כתיבת תסריט מ-0 יש תקלה חמורה, שאת
     שואלת אותם מה הזווית הנגשה, אבל זו טעות. אמור להיות רק צ'אט שמדייק
     את הרעיון".

     בנק 31 הזוויות היה מסך בחירה חובה מ-22/10, והוא ירד. במקומו צ'אט
     אחד שמדייק את הרעיון עצמו, ומה שיוצא ממנו הוא הרעיון שממשיך הלאה.
     הזוויות נשארו כחומר עזר ב-video-assistant-content.js.

     שלבים 2 ו-3 במסמך שלה ("בחירת נקודת יציאה" ו"שיוך לסוג התוכן") היו
     עד היום שתי תיבות טקסט ריקות בתוך פופאפ אופציונלי, ולכן פרומפט
     חילוץ התוכן יצא בלעדיהם ברוב המקרים. עכשיו הם שלבים אמיתיים
     בזרימה, בדיוק במקום שבו המסמך שם אותם: אחרי הרעיון ולפני הפורמט. */
  startingPoint: null, contentType: null,
  /* 23/10/2026 (מאיה: "תוסיפי גם מקום לשים לינק לסרטון וגם להוסיף
     תמלול, כדי שבסיכום האחרון יהיה לי הכל מסודר"). התמלול כבר נשמר,
     הלינק לא, ולכן בסוף התהליך לא היה זכר לסרטון שהיא משכפלת. */
  referenceLink: null,
  /* 31/10/2026: האם התסריט עבר את פרומפט "השלכה לתוך סצנה" (שורה בסיכום),
     והגרסה ששוכתבה כשחוזרים מהסיכום, כדי שלא תאבד בדרך. */
  sceneRewritten: false, sceneRewrite: null,
  /* 04/11/2026: שכפול שנפתח מתוך המאגר. { reason, source, foreign, text }
     מ-reference-duplication.js, כדי שמסכי התמלול וההוק יגידו אם אפשר
     לסמוך על התמלול. null בכל כניסה אחרת. */
  bankNotice: null,
  /* על מה הרפרנס ששוכפל מהמאגר (contentSummary), לשם ב"התסריטים שלי" */
  referenceTitle: null,
  /* מזהה הסרטון במאגר, כדי ש"✨ תמלול מדויק" ימצא תמלול שכבר נעשה לו */
  referenceBankId: null,
  /* 06/11/2026 (מאיה): "הוא בוחר זווית אבל אחר כך כשאני מעבירה את הרעיון
     לביצוע הוא שוכח מהזווית". זווית ההנגשה שהצ'אט בחר (או שנשמרה על הרעיון
     בבנק). נכנסת למשפט הרעיון (ideaDescription) שכל הפרומפטים קוראים. */
  ideaAngle: null,
};

/* 06/11/2026: מסלול השכפול ההפוך ירד (branch 'idea-search', והמסך
   'has-idea-choice' שהוביל אליו). סשן או סרטון שנשמרו לפני כן לא יקרסו:
   הם ממשיכים במסלול השכפול הרגיל, שבו ההוק לפני המגילה. מגילה שכבר נכתבה
   נשארת בתיבה שלה. מי שעמדה במסך הבחירה ממשיכה לכתיבה מאפס, בדיוק כמו
   "כן, צריך תסריט". */
function migrateOne(s) {
  if (!s || typeof s !== 'object') return s;
  if (s.screen === 'has-idea-choice') return { ...s, screen: 'scratch-dump', branch: 'scratch' };
  if (s.branch !== 'idea-search') return s;
  const out = { ...s, branch: 'reference' };
  if (!out.hook && (out.screen === 'her-words' || out.screen === 'prompt2')) out.screen = 'prompt1';
  return out;
}

export function migrateLegacyState(state) {
  if (!state || typeof state !== 'object') return state;
  const out = { ...migrateOne(state) };
  if (Array.isArray(state.history)) {
    /* בהיסטוריה מסך הבחירה הישן לא הופך ל"כתיבה מאפס" (חזרה אחורה הייתה
       מעבירה מסלול), והוא פשוט יוצא. ומסך שחוזר על עצמו ברצף יוצא, אחרת
       לחיצת "חזרה" אחת לא זזה */
    const steps = state.history
      .filter((h) => !(h && h.screen === 'has-idea-choice'))
      .map(migrateOne);
    out.history = steps.filter((h, i) => {
      const next = i + 1 < steps.length ? steps[i + 1] : out;
      return !(h && next && h.screen === next.screen);
    });
  }
  return out;
}

/* 31/10/2026: קרוסלה נכתבת לשקופיות ולא מדוברת, ולכן שלבי הסרטון לא חלים עליה. */
export function isCarousel(state) {
  return state.selectedFormat === 'פוסט קרוסלה';
}

/* 10/11/2026 (מאיה): טקסט דינמי נכתב לפריימים, משפט קצר בכל פריים, ולא כמונולוג. */
export function isDynamicText(state) {
  return state.selectedFormat === 'טקסט דינמי';
}

function withoutHistory(state) {
  const { history, ...rest } = state;
  return rest;
}

/* מה שהיא מדביקה או כותבת בכל מסך של שלב הכתיבה, וסדר המסכים בכל מסלול.
   חזרה אחורה לא מוחקת אותם (ראה BACK). */
const PASTED_ON = {
  prompt1: 'hook', 'her-words': 'herWords', prompt2: 'finalScript',
  'scratch-dump': 'rawDump', 'creative-packaging': 'packaging', 'scratch-hook': 'hook', 'scratch-hook-reinforce': 'hookReinforcement', 'scratch-distill': 'draftScript',
};
const WRITING_ORDER = {
  reference: ['transcribe', 'prompt1', 'her-words', 'prompt2', 'read-aloud'],
  scratch: ['scratch-dump', 'scratch-hook', 'scratch-hook-reinforce', 'scratch-distill', 'scratch-scene'],
  /* 10/11/2026: בסדר החדש המגילה נכתבת כשהמסלול עוד 'idea' (לפני האריזה) */
  /* 11/11/2026 (סוכני בדיקה): חזרה עד מסך הרעיון מחקה את המגילה, וחזרה
     מהפורמט מחקה את הקריאייטיב שהודבק. עכשיו כל השלבים של הסדר החדש כאן. */
  /* קטע שצולם (חזותי): הקריאייטיב והפורמט נשמרים בחזרה אחורה */
  footage: ['creative-packaging', 'format-choice', 'needs-script-check'],
  idea: ['idea-sharpen', 'scratch-dump', 'creative-packaging', 'format-choice', 'needs-script-check', 'scratch-hook', 'scratch-hook-reinforce', 'scratch-distill', 'scratch-scene'],
};

/** השדות שחזרה ל-prev שומרת: מה שהודבק במסך הזה ובמסכים שאחריו באותו מסלול. */
export function keptOnBack(prev) {
  const order = WRITING_ORDER[prev.branch];
  const at = order ? order.indexOf(prev.screen) : -1;
  if (at === -1) return [];
  return order.slice(at).map((screen) => PASTED_ON[screen]).filter(Boolean);
}

function push(state) {
  return [...state.history, withoutHistory(state)];
}

export function nextStep(state, action) {
  if (action.type === 'BACK') {
    if (!state.history.length) return state;
    const prev = state.history[state.history.length - 1];
    const back = { ...prev, history: state.history.slice(0, -1) };
    /* 06/11/2026: חזרה מהאריזה למסך הרעיון השאירה את שתי התיבות ריקות, כי
       הסטייט הקודם נשמר לפני שהרעיון נכתב. מה שכבר נכתב נשאר. */
    /* 10/11/2026: לא עד מסך הפתיחה. משם בוחרים מסלול חדש (רפרנס, קטע
       שצולם), והרעיון של הסרטון הנטוש היה ממשיך לתיאור ולשם של הסרטון החדש. */
    if (back.screen !== 'opening') {
      for (const key of ['ideaTopic', 'ideaPunchline', 'ideaAngle']) {
        if (back[key] == null && state[key] != null) back[key] = state[key];
      }
    }
    /* חזרה משחזרת סטייט מלפני שהתסריט נכתב, וגם הפריט ב"התסריטים שלי" נשמר
       ממנו. בלי זה תסריט שהודבק נמחק מכל מקום. */
    const sceneBack = state.screen === 'summary' && prev.screen === 'scratch-scene';
    if (sceneBack) {
      back.sceneRewrite = state.draftScript !== prev.draftScript ? state.draftScript : null;
    }
    /* 04/11/2026 (סקירה): חזרה מ"להקריא בקול" מחקה את התסריט שהודבק
       (finalScript חזר ל-null), והשמירה שאחריה דרסה אותו גם ב"התסריטים
       שלי". וחזרה מחיזוק ההוק רוקנה את ההוק. מה שהודבק במסך שאליו חוזרים,
       ובמסכים שאחריו, נשאר בתיבה שלו ובפריט השמור עד שיוחלף. ריק שנשלח
       בכוונה ("מה יש לך להוסיף") הוא גם תשובה.
       חזרה אל מחוץ לשלב הכתיבה (מקור אחר, רעיון אחר, פתיחה) היא בסיס
       חדש, ושם לא סוחבים הוק ותסריט שנכתבו על הבסיס הקודם. */
    for (const f of keptOnBack(prev)) {
      if (sceneBack && f === 'draftScript') continue;
      if (state[f] != null && state[f] !== prev[f]) back[f] = state[f];
    }
    return back;
  }

  /* 04/11/2026 (מאיה): "לשכפול הסרטון" מתוך מאגר ההשראה. נכנסים ישר
     לשכפול עם הלינק והתמלול, בלי "יש לך רפרנס?" ובלי לתמלל ביד.
     שכפול חדש מתחיל נקי, כמו "להתחיל מחדש". ההיסטוריה נבנית כאילו עברו
     במסכים, כדי שהחץ אחורה יוביל למסך התמלול (לבדוק ולתקן) ומשם לפתיחה.
     בלי תמלול שאפשר לסמוך עליו נוחתים על מסך התמלול עצמו, עם הסבר. */
  if (action.type === 'START_FROM_BANK') {
    const base = {
      ...INITIAL_STATE,
      branch: 'reference',
      referenceLink: action.link || null,
      referenceTitle: action.title || null,
      referenceBankId: action.bankId || null,
      transcript: action.transcript || null,
      bankNotice: action.notice || null,
    };
    const opening = withoutHistory({ ...INITIAL_STATE });
    const transcribe = { ...withoutHistory(base), screen: 'transcribe' };
    return action.ready && base.transcript
      ? { ...base, screen: 'prompt1', history: [opening, transcribe] }
      : { ...base, screen: 'transcribe', history: [opening] };
  }

  const next = step(state, action);
  // neither is a navigational move worth a back-entry: REROLL stays on the
  // same screen, and RESTART already wipes the state (including history).
  if (action.type === 'REROLL' || action.type === 'RESTART') return next;
  return { ...next, history: push(state) };
}

/* 10/11/2026 (מאיה): מסך "בודקים לפני שממשיכים" (רלוונטי לקהל או משרת את
   המותג) ירד: "תוריד, לא רלוונטי". כל מעבר שהוביל אליו הולך ישר למסך שהיה
   אחריו. המסך עצמו נשאר רק לסשן שכבר עומד עליו. */
function afterRelevance(state) {
  if (state.branch === 'footage') return { ...state, screen: 'footage-speech-find', footageKind: 'speech' };
  if (state.branch === 'reference') return { ...state, screen: 'transcribe' };
  return { ...state, screen: 'idea-sharpen' };
}

function step(state, action) {
  switch (action.type) {
    // ===== שלושת מסלולי הפתיחה (ניסוח מדויק של מאיה, 16/10) =====
    // "מצאתי רפרנס לשכפול" / "יש לי קטע שצולם" / "יש לי רעיון מ-0"
    case 'CHOOSE_FOOTAGE':
      return afterRelevance({ ...state, branch: 'footage' });
    case 'CHOOSE_REFERENCE':
      return { ...state, screen: 'reference-source-choice', branch: 'reference' };
    /* 28/10/2026 (מאיה: "עומס מנטלי... צריך יותר סדר"). עד היום רעיון
       עבר דרך "מאיפה הרעיון?", "מה הרעיון?" ו"בודקים לפני שממשיכים"
       לפני שהגיע למסך הרעיון עצמו. שלושתם נכנסו לתוכו: ההגרלה היא קישור
       שם, ובדיקת הרלוונטיות היא תיבת סימון שם. */
    case 'CHOOSE_IDEA':
      return { ...state, screen: 'idea-sharpen', branch: 'idea' };

    // ===== מסלול "מצאתי רפרנס" - יש לה כבר אחד, או שצריך להגריל לה (17/10,
    // מאיה: "צריך להיות 2 כפתורים יש לי רפרנס / אין לי רפרנס ואז להגריל") =====
    case 'CHOOSE_HAS_REFERENCE':
      return afterRelevance(state);
    case 'CHOOSE_PULL_REFERENCE':
      return { ...state, screen: 'pulled-reference' };

    // ===== מסלול "יש לי רעיון" - איך מקבלים את הרעיון =====
    case 'CHOOSE_TYPE_IDEA':
      return { ...state, screen: 'type-idea' };
    case 'IDEA_TYPED':
      /* 23/10/2026: בקטע שכבר צולם אין מה לבדוק רלוונטיות, הוא כבר צולם.
         סדר השלבים שלה נשאר: "צריך לשאול קודם כל מה הרעיון/מסר שתרצה
         להעביר, ואז לבקש לבחור פורמט הנגשה, ואז לשאול אם צריך תסריט".

         28/10/2026 (מאיה): "גם בתכלס הוא צריך להופיע גם בקטע שצולם
         שממירים לפורמט אחר וכותבים". צ'אט חידוד הרעיון נכנס בין הרעיון
         לפורמט גם כאן: החומר אכן צולם, אבל המסר שבונים סביבו נכתב רק
         עכשיו, ולכן הוא זה שצריך להיות מדויק. */
      if (state.branch === 'footage') {
        return { ...state, screen: 'idea-sharpen', ideaDescription: action.text };
      }
      return afterRelevance({ ...state, ideaDescription: action.text });
    case 'CHOOSE_PULL_IDEA':
      return { ...state, screen: 'pulled-idea' };

    // ===== בחירה/הגרלה (קיים, ללא שינוי) =====
    case 'REROLL':
      return { ...state, rerollCount: state.rerollCount + 1 };
    case 'ACCEPT_PICK':
      /* רעיון מהבנק חוזר למסך הרעיון, שם בודקים רלוונטיות ופואנטה. */
      /* ההגרלה שמה את כותרת הרעיון גם ב-hook. ברעיון זה לא הוק, ובלי
         הניקוי הוא הופיע כ"ההוק" מוכן ב"התסריט שלך" עוד לפני שנבחר. */
      if (state.branch === 'idea') return { ...state, screen: 'idea-sharpen', ideaTopic: null, ideaPunchline: null, hook: null };
      return afterRelevance(state);

    // ===== השער המשותף: "רלוונטי לקהל היעד, או משרת את המותג?" =====
    case 'RELEVANCE_CONFIRMED':
      /* 02/11/2026 (מאיה: "בואי נשאיר רק את הקטע שצולם דיבור, וזה פשוט לא
         צריך את הבחירה של ה-2 כפתורים"). קטע שצולם הוא ליקוט: בוחרים ממנו
         את הפואנטה. קטע ויזואלי בלי דיבור נבנה מ"יש לי רעיון". מסכי
         הוויזואל נשארים בקוד רק כדי שסרטון שכבר באמצע יוכל להיגמר. */
      if (state.branch === 'footage') return { ...state, screen: 'footage-speech-find', footageKind: 'speech' };
      if (state.branch === 'reference') return { ...state, screen: 'transcribe' };
      /* 23/10/2026 (מאיה): חידוד הרעיון קורה לפני בחירת הפורמט, כי אי
         אפשר לבחור פורמט לרעיון שעוד לא ברור. 26/10/2026: זה צ'אט
         שמדייק את הרעיון, ולא בחירת זווית מתוך רשימה. */
      return { ...state, screen: 'idea-sharpen' };

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
      /* 11/11/2026: בסדר החדש (מגילה לפני הקריאייטיב) השאלה "צריך תסריט?"
         ירדה: אחרי הפורמט ממשיכים ישר להוק. סשן ישן בלי מגילה נשאר כמו קודם. */
      if (state.formatFor === 'idea' && state.rawDump) {
        return { ...state, selectedFormat: action.format, screen: 'scratch-hook', branch: 'scratch' };
      }
      return { ...state, selectedFormat: action.format, screen: 'needs-script-check' };

    // ===== "צריך תסריט או לא?" - לא כל תוכן צריך תסריט =====
    case 'NEEDS_SCRIPT_NO':
      return { ...state, screen: 'summary' };
    /* 28/10/2026: עד היום "כן" הוביל ל"יש לך רפרנס לשכפול הפוך?" ומשם
       למסך קריאה "כתיבה מאפס". שניהם ירדו: שכפול הפוך הוא עכשיו אפשרות
       בתוך מסך ההוק, ומבנה התסריט נפתח מתוך מסך המגילה למי שרוצה. */
    case 'NEEDS_SCRIPT_YES':
      /* 10/11/2026: המגילה כבר נכתבה לפני הקריאייטיב, ולכן ממשיכים להוק */
      return { ...state, screen: state.rawDump ? 'scratch-hook' : 'scratch-dump', branch: 'scratch' };

    /* 06/11/2026 (מאיה): "שתעיפי לגמרי את שיטת השכפול ההפוך, סתם מבלבל".
       המסלול שלה (branch 'idea-search') ירד. סשנים ישנים שנשמרו בו עוברים
       דרך migrateLegacyState למסלול השכפול הרגיל. */
    case 'CHOOSE_FROM_SCRATCH':
      return { ...state, screen: 'scratch-intro', branch: 'scratch' };

    // ===== השכפול: תמלול → פרומפט 1 → המילים שלה → פרומפט 2 → קריאה
    // בקול → סיכום. =====
    case 'CONFIRM_DONE':
      if (state.screen === 'transcribe') {
        return { ...state, screen: 'prompt1' };
      }
      if (state.screen === 'read-aloud') return { ...state, screen: 'summary' };
      throw new Error(`CONFIRM_DONE not valid from screen "${state.screen}"`);
    case 'HOOK_CHOSEN':
      // אחרי ההוק שואלים אותה מה יש לה להוסיף.
      return { ...state, screen: 'her-words', hook: action.hook };
    case 'HER_WORDS_SUBMITTED':
      return { ...state, screen: 'prompt2', herWords: action.text };
    case 'SCRIPT_READY':
      // 17/10/2026 (מאיה: "הייתי שמחה שבסיכום יהיה כתוב גם את התסריט") -
      // עכשיו שומרים את התסריט הסופי שחזרה איתו, לא רק ממשיכים הלאה.
      return { ...state, screen: 'read-aloud', finalScript: action.text };

    // ===== מסלול "כתיבה מאפס" - 4 הפרומפטים האמיתיים מתוך המסמך שלה =====
    // שלב 1 (אופציונלי, רק למי שתקועה): פרומפט חילוץ תוכן, או כתיבה חופשית
    // שלב 0 (חדש, 22/10): זווית ההגשה. בלי זווית אין מה לכתוב.
    /* הרעיון שיוצא מהצ'אט הוא הרעיון שממשיך הלאה. אם לא שינתה אותו,
       נשאר מה שהיה. צ'אט שלא משנה כלום במצב הוא קישוט. */
    /* 28/10/2026 (מאיה): "אני כותבת את הרעיון, מזקקת פואנטה/מסר, ואז
       מוצאת עם ג'מיני את האריזה הקריאייטיבית... ואז בוחרת את פורמט
       ההנגשה, וכותבת תסריט". אחרי המסר מגיעה האריזה, בשני המסלולים. */
    case 'IDEA_SHARPENED': {
      const raw = (action.idea && action.idea.trim()) || state.ideaDescription;
      /* הזווית נוסעת עם הרעיון לאריזה, להוק ולתסריט */
      const sharpened = state.ideaAngle ? withAngle(raw, state.ideaAngle) : raw;
      /* הנושא והפואנטה נשמרים גם בנפרד, כדי שחזרה למסך תציג כל אחד
         בתיבה שלו ולא את המשפט המשולב בתיבת הנושא. */
      /* 10/11/2026 (מאיה): סדר חדש במסלול מ-0: רעיון ומסר (עם נקודת היציאה)
         ← מגילת אסתר ← קריאייטיב ← פורמט ← הוק וחיזוק ← זיקוק. המגילה לפני
         הקריאייטיב, כי ג'מיני מקבל אותה ובוחר קריאייטיב שמתאים למה שיש לה
         להגיד. בקטע שצולם: כמו קודם, ישר לאריזה. */
      const nextScreen = state.branch === 'footage' ? 'creative-packaging' : 'scratch-dump';
      return {
        ...state, screen: nextScreen, ideaDescription: sharpened, ideaBeforePackaging: null,
        ideaTopic: action.topic ?? state.ideaTopic ?? null,
        ideaPunchline: action.punchline ?? state.ideaPunchline ?? null,
        startingPoint: action.startingPoint ?? state.startingPoint ?? null,
      };
    }
    /* הכיוון שבחרה מתוך ה-30 נשמר בנפרד, ונוסע עם הרעיון לכל הפרומפטים
       שאחריו, כדי שההוק והתסריט ייכתבו לפי האריזה ולא לפי הרעיון הגולמי. */
    case 'PACKAGING_CHOSEN': {
      const packaging = (action.packaging && action.packaging.trim()) || null;
      const base = state.ideaBeforePackaging || state.ideaDescription;
      const ideaDescription = packaging ? `${base}. האריזה הקריאייטיבית: ${packaging}` : base;
      /* נקודת היציאה וסוג התוכן נבחרים עכשיו באותו מסך, ולכן ממשיכים ישר
         לפורמט. בקטע שצולם הם לא נשאלים, כי נקבעו בצילום עצמו. */
      return {
        ...state, packaging, ideaBeforePackaging: base, ideaDescription,
        startingPoint: action.startingPoint ?? state.startingPoint ?? null,
        contentType: action.contentType ?? state.contentType ?? null,
        screen: 'format-choice', formatFor: 'idea',
      };
    }
    /* שלבים 2 ו-3 במסמך: נקודת היציאה וסוג התוכן. שניהם נכנסים לפרומפט
       חילוץ התוכן, ולכן הם נשמרים במצב ולא נכתבים מחדש ביד בכל פעם. */
    case 'BASICS_CONFIRMED':
      return {
        ...state,
        screen: 'format-choice',
        formatFor: 'idea',
        startingPoint: action.startingPoint || null,
        contentType: action.contentType || null,
      };

    case 'SCRATCH_START_DUMP':
      /* הרעיון הוא התנאי. אי אפשר לשפוך תוכן על כלום, ובלי השורה הזאת
         אפשר לקפוץ לכתיבה דרך כל קריאה שלא עברה במסך הרעיון. */
      if (!state.ideaDescription) throw new Error('SCRATCH_START_DUMP before an idea was set');
      return { ...state, screen: 'scratch-dump' };
    case 'SCRATCH_DUMP_READY':
      /* 10/11/2026: אחרי המגילה הקריאייטיב (אם עוד לא נבחר). סשן ישן שכבר
         בחר אריזה לפני המגילה ממשיך להוק, כמו קודם. */
      /* בסדר החדש (המסלול עוד 'idea') תמיד לקריאייטיב, גם אם הוא נשמר מחזרה אחורה */
      return { ...state, screen: state.branch === 'idea' || !state.packaging ? 'creative-packaging' : 'scratch-hook', rawDump: action.text };
    // שלב 2: פרומפט מציאת הוק (בנק של כ-140 הוקים אמיתיים מוטמע)
    case 'SCRATCH_HOOK_CHOSEN':
      return { ...state, screen: 'scratch-hook-reinforce', hook: action.hook };
    // שלב 3: פרומפט חיזוק הוק
    case 'SCRATCH_REINFORCEMENT_CHOSEN':
      return { ...state, screen: 'scratch-distill', hookReinforcement: action.text };
    // שלב 4: פרומפט זיקוק תסריט סופי
    case 'SCRATCH_SCRIPT_READY':
      /* שכתוב ל"מונולוג של 45 שניות" היה הורס קרוסלה, ולכן הוא לא מוצע לה. */
      /* 10/11/2026: וגם לא לטקסט דינמי, שבנוי ממשפט קצר בכל פריים. */
      return { ...state, screen: isCarousel(state) || isDynamicText(state) ? 'summary' : 'scratch-scene', draftScript: action.text };
    // שלב 5, במידת הצורך: שכתוב תסריט שיצא מסביר. בלי טקסט התסריט נשאר כמו שהוא.
    case 'SCRATCH_SCENE_DONE':
      return action.text
        ? { ...state, screen: 'summary', draftScript: action.text, sceneRewritten: true, sceneRewrite: null }
        : { ...state, screen: 'summary', sceneRewritten: false, sceneRewrite: null };

    // ===== מסך הסיכום הסופי - "אפילו ילד בן 10 יכול להבין" =====
    case 'RESTART':
      return { ...INITIAL_STATE };

    default:
      throw new Error(`unknown action type: ${action.type}`);
  }
}

/* 10/11/2026 (מאיה: "הוא העתיק לפרומפט רק את המסר בלי הרעיון, חמור").
   אצל מור אדרי הנושא והמסר היו אותו משפט בדיוק, והפרומפט יצא "X. המסר: X".
   כשהם זהים, או שאחד מכיל את השני, נכנס משפט אחד ולא כפול. */
/* השוואה בלי רווחים כפולים, ירידות שורה וסימני פיסוק */
export function normText(s) {
  return String(s || '').replace(/[\s.,!?"'״׳:;()\-–—]+/g, ' ').trim();
}

/** אחד מכיל את השני (או זהים), אחרי ניקוי */
function overlaps(a, b) {
  const x = normText(a);
  const y = normText(b);
  return Boolean(x && y) && (x === y || x.includes(y) || y.includes(x));
}

export function ideaWithMessage(topic, punchline) {
  const tp = String(topic || '').trim();
  const p = String(punchline || '').trim();
  if (!tp) return p;
  if (!p) return tp;
  if (overlaps(tp, p)) return normText(tp).length > normText(p).length ? tp : p;
  return `הרעיון: ${tp}. המסר: ${p}`;
}

/** אותו משפט בשתי התיבות: אין רעיון נפרד, רק מסר */
export function sameIdeaAndMessage(topic, punchline) {
  return Boolean(normText(topic)) && normText(topic) === normText(punchline);
}

/* 10/11/2026 (סריקה אחרי הבאג של מור): המשפט שממשיך מהמסך "רעיון ומסר"
   (ideaDescription). קודם נבדק p.includes(topic) בלי ניקוי, ולכן "למה X"
   מול "X" נכנס פעמיים. */
export function sharpenedIdea(topic, punchline) {
  const t = String(topic || '').trim();
  const p = String(punchline || '').trim();
  if (!p) return t;
  if (!t || overlaps(t, p)) return normText(t).length > normText(p).length ? t : p;
  return `${p}. נושא הסרטון: ${t}`;
}

/* האריזה כבר נשלחת לכל פרומפט בבלוק הקריאייטיב שלה (creative). הרעיון
   שנכנס לסוגריים "הרעיון של התוכן" הוא בלעדיה, אחרת היא מופיעה פעמיים
   עד ארבע פעמים, ו"לחבר את הקריאייטיב לרעיון" מחבר אותה לעצמה. */
export function ideaForPrompt(state) {
  const s = state || {};
  if (s.packaging && s.ideaBeforePackaging) return s.ideaBeforePackaging;
  return s.ideaDescription || '';
}

