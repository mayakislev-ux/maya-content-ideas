/* 26/10/2026 (מאיה): "בחלק של כתיבת תסריט מ-0 יש שם תקלה חמורה, שאת
   שואלת אותם מה הזווית הנגשה, אבל זה טעות. אמור להיות רק צ'אט שמדייק
   את הרעיון שעובד וברור בלי תקלות UI UX".

   מסך בחירת הזווית מתוך 31 ירד. מה שנשאר הוא צ'אט אחד שמדייק את
   הרעיון, ושלוש תקלות אמיתיות בו תוקנו. הבדיקות כאן שומרות על שלושתן,
   ועל זה שהזווית לא תחזור בשקט כמסך חובה.

   שאר הבדיקות של הזרימה עצמה יושבות ב-video-assistant-flow.test.mjs,
   שם המכונה רצה באמת. כאן נבדק מה שחי בתוך פונקציית הרינדור ואין דרך
   להריץ אותו בלי DOM - ולכן זו בדיקת מקור, במכוון ובמודע. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const VA = readFileSync(join(ROOT, 'js', 'video-assistant.js'), 'utf8');
const CSS = readFileSync(join(ROOT, 'css', 'style.css'), 'utf8');
const IDEA_CHAT = readFileSync(join(ROOT, 'js', 'idea-chat.js'), 'utf8');

function fnBody(name, nextName) {
  const from = VA.indexOf(`function ${name}(`);
  assert.ok(from > 0, `לא נמצאה ${name}`);
  const to = VA.indexOf(`function ${nextName}(`, from);
  assert.ok(to > from, `לא נמצאה ${nextName} אחרי ${name}`);
  return VA.slice(from, to);
}

const SHARPEN = fnBody('renderIdeaSharpen', 'renderContentBasics');
const BASICS = fnBody('renderContentBasics', 'renderScratchIntro');

describe('הזווית ירדה, והצ׳אט במקומה', () => {
  test('אין יותר מסך בחירת זווית', () => {
    assert.ok(!VA.includes('function renderAngle('), 'מסך הזווית חזר');
    assert.ok(!VA.includes('data-pick-angle'), 'בחירת הזווית חזרה');
    assert.ok(!VA.includes('ANGLES'), 'בנק הזוויות חזר למסך');
  });

  test('הצ׳אט מדייק את הרעיון, ולא את הזווית', () => {
    assert.match(SHARPEN, /streamCheckIdea\(/, 'הצ׳אט לא מריץ את המנוע האמיתי');
    assert.match(SHARPEN, /הרעיון שלי/, 'השאלה הפותחת לא על הרעיון');
    assert.ok(!/הזווית שבחרתי/.test(SHARPEN), 'השאלה הפותחת עדיין על הזווית');
  });

  test('הרעיון שיוצא מהצ׳אט הוא זה שממשיך', () => {
    assert.match(SHARPEN, /IDEA_SHARPENED/, 'הרעיון לא נשמר בחזרה למצב');
    assert.match(SHARPEN, /va-idea-sharp/, 'אין שדה לרעיון המדויק');
  });
});

/* שלוש התקלות שתוקנו. כל אחת הייתה לחיצה שלא עושה כלום. */
describe('הצ׳אט עובד, בלי תקלות UI UX', () => {
  test('Enter שולח, Shift+Enter יורד שורה', () => {
    assert.match(SHARPEN, /e\.key === 'Enter' && !e\.shiftKey/, 'Enter עדיין רק יורד שורה');
    assert.match(SHARPEN, /enterkeyhint="send"/, 'המקלדת לא מציגה "שליחה"');
  });

  test('בזמן שהוא עונה הכפתור אומר את זה, ולא נראה שבור', () => {
    assert.match(SHARPEN, /sendBtn\.disabled = on/, 'הכפתור לא ננעל בזמן תשובה');
    assert.match(SHARPEN, /עונה\.\.\./, 'הכפתור לא אומר שהוא עסוק');
  });

  test('כישלון רשת מקבל כפתור "לנסות שוב" אמיתי', () => {
    assert.match(SHARPEN, /לנסות שוב/, 'אין כפתור ניסיון חוזר');
    assert.match(SHARPEN, /va-chat-retry/, 'כפתור הניסיון החוזר בלי מחלקה');
    assert.match(CSS, /\.va-chat-retry\s*\{/, 'לכפתור אין עיצוב');
    /* השאלה שנכשלה יורדת מההיסטוריה, אחרת ניסיון חוזר שולח אותה פעמיים */
    assert.match(SHARPEN, /history\.pop\(\)/, 'השאלה שנכשלה נשארת בהיסטוריה');
  });

  test('כפתור ההמשך לא מתקדם בלי רעיון כתוב', () => {
    assert.match(SHARPEN, /showToast\(/, 'אין משוב כשאין רעיון');
  });
});

/* שלבים 2 ו-3 במסמך "סיכום כתיבת תסריטים", שעד היום היו תיבות ריקות
   בפופאפ אופציונלי - ולכן פרומפט חילוץ התוכן יצא בלעדיהם. */
describe('נקודת יציאה וסוג תוכן הם שלבים אמיתיים', () => {
  test('שניהם בחירה, ולא הקלדה חופשית', () => {
    assert.match(BASICS, /STARTING_POINTS/, 'נקודת היציאה לא מהרשימה של המסמך');
    assert.match(BASICS, /CONTENT_TYPES/, 'סוג התוכן לא מהרשימה של המסמך');
    assert.match(BASICS, /BASICS_CONFIRMED/, 'הבחירה לא נשמרת');
  });

  test('אי אפשר להמשיך בלי לבחור את שניהם', () => {
    assert.match(BASICS, /if \(!startingPoint \|\| !contentType\)/, 'אפשר להמשיך בלי לבחור');
  });

  test('הפופאפ של חילוץ התוכן מתמלא ממה שכבר נבחר', () => {
    const modal = VA.slice(VA.indexOf('function openExtractionHelperModal'));
    assert.match(modal.slice(0, 3000), /state\.contentType/, 'סוג התוכן לא עובר לפופאפ');
    assert.match(modal.slice(0, 3000), /state\.startingPoint/, 'נקודת היציאה לא עוברת לפופאפ');
  });
});

/* הערכים חייבים להיות מילה במילה מהמסמך, כי הם נכנסים כמות שהם
   לפרומפט שמצהיר בדיוק על הניסוחים האלה. */
describe('הערכים זהים למסמך', () => {
  test('נקודת יציאה: סיפור אישי / סיפור לקוח / כללי', async () => {
    const { STARTING_POINTS } = await import('../js/video-assistant-content.js');
    assert.deepEqual(STARTING_POINTS, ['סיפור אישי', 'סיפור לקוח', 'כללי']);
  });

  test('סוג תוכן: בעל ערך / מכירתי / אישי / בידורי', async () => {
    const { CONTENT_TYPES } = await import('../js/video-assistant-content.js');
    assert.deepEqual(CONTENT_TYPES, ['בעל ערך', 'מכירתי', 'אישי', 'בידורי']);
  });

  test('שתי הרשימות באמת מופיעות ככה במסמך', () => {
    const doc = readFileSync(join(ROOT, 'test', 'fixtures', 'script-doc.txt'), 'utf8');
    assert.ok(doc.includes('סיפור אישי / סיפור לקוח / כללי'), 'נקודת היציאה לא כך במסמך');
    assert.ok(doc.includes('בעל ערך/מכירתי/אישי/בידורי'), 'סוג התוכן לא כך במסמך');
  });
});

/* 26/10/2026, סבב שני (מאיה, צילום מסך): "לא יודעת, משהו דפוק, לא קולט
   את הרעיון שלי, וגם ה-UI UX לא ברור ולא נוח... לא ברור מה עושים כאן".

   בצילום רואים את התקלה המרכזית: בתיבה כתוב רעיון אחד, והצ'אט שואל על
   רעיון אחר. הסיבה: הצ'אט נפתח אוטומטית עם state.ideaDescription שנתפס
   ברגע הציור, בזמן שהתיבה הציגה טיוטה חדשה יותר. שני מקורות אמת לאותו
   דבר, והמשתמשת רואה את הפער. */
describe('הצ׳אט מדבר על מה שכתוב בתיבה, ורק עליו', () => {
  test('הצ׳אט קורא את התיבה ברגע הלחיצה, ולא ערך שנתפס מראש', () => {
    assert.match(SHARPEN, /function currentIdea\(\)/, 'אין קריאה חיה של התיבה');
    assert.match(SHARPEN, /ask\(`הרעיון שלי לסרטון: "\$\{idea0\}"/, 'השאלה הפותחת לא מהתיבה');
    assert.ok(!/^\s*ask\(`אני עובדת על סרטון/m.test(SHARPEN), 'הצ׳אט עדיין נפתח לבד עם ערך קפוא');
  });

  test('כל הודעה נושאת איתה את הרעיון שבתיבה כרגע', () => {
    assert.match(SHARPEN, /הרעיון שבתיבה שלי כרגע/, 'הוא יכול לאבד את הרעיון תוך כדי');
  });

  test('הטיוטה גוברת על המצב, כי היא החדשה', () => {
    assert.match(SHARPEN, /idea-sharpen\|va-idea-sharp/, 'הטיוטה לא נקראת');
    assert.match(SHARPEN, /draft !== undefined \? draft/, 'הטיוטה לא גוברת');
  });

  test('הצ׳אט נפתח בלחיצה, לא לבד', () => {
    assert.match(SHARPEN, /va-sharpen-ask/, 'אין כפתור שפותח את הצ׳אט');
    assert.match(SHARPEN, /wrap\.hidden = false/, 'הצ׳אט לא מוסתר עד הלחיצה');
  });

  test('רעיון קצר מדי עוצר לפני שמבזבזים סיבוב', () => {
    assert.match(SHARPEN, /idea0\.length < 8/, 'הצ׳אט נפתח גם על ג׳יבריש');
  });
});

describe('ברור מה עושים כאן', () => {
  test('יש שלושה צעדים כתובים בראש המסך', () => {
    assert.match(SHARPEN, /cosmic-howto/, 'אין הסבר מה עושים');
    assert.match(SHARPEN, /לכתוב בתיבה את הרעיון/, 'הצעד הראשון לא כתוב');
  });

  test('כתוב במפורש שהתיבה היא מה שקובע', () => {
    assert.match(SHARPEN, /מה שכתוב כאן הוא מה שקובע/, 'לא ברור איזו תיבה קובעת');
  });

  test('לתיבה יש תווית ודוגמה', () => {
    assert.match(SHARPEN, /cosmic-field-label/, 'לתיבה אין תווית');
    assert.match(SHARPEN, /placeholder="למשל:/, 'לתיבה אין דוגמה');
  });

  /* הצעה בתוך פסקה שצריך להעתיק ביד היא לא הצעה. */
  test('הצעת ניסוח עוברת לתיבה בלחיצה אחת', () => {
    assert.match(SHARPEN, /הניסוח המדויק:/, 'הוא לא מתבקש לסיים בפורמט קבוע');
    assert.match(SHARPEN, /va-chat-use/, 'אין כפתור שמעביר את ההצעה');
    assert.match(CSS, /\.va-chat-use\s*\{/, 'לכפתור ההצעה אין עיצוב');
  });

  test('הצ׳אט מוסתר באמת כל עוד לא נפתח', () => {
    assert.match(CSS, /\.va-angle-chat\[hidden\]/, 'hidden עלול להידרס בעתיד');
  });
});

/* הכותרת אמרה "שלב 2 מתוך 5: בדיקת התאמה" בזמן שעל המסך היה כתוב
   "בוא נדייק את הרעיון". שם הפאזה משותף לכמה מסכים. */
describe('הכותרת תואמת את המסך', () => {
  test('למסך חידוד הרעיון יש שם משלו בפס ההתקדמות', () => {
    assert.match(VA, /SCREEN_LABEL\[state\.screen\] \|\| PHASES\[current\]/, 'הכותרת לא לפי המסך');
    assert.match(VA, /'idea-sharpen': 'חידוד הרעיון'/, 'אין שם למסך חידוד הרעיון');
  });

  test('נקודת יציאה וסוג תוכן יושבים בשלב הפורמט, לא בבדיקת ההתאמה', () => {
    assert.match(VA, /'content-basics': 2/, 'השלב שגוי');
  });
});

/* 26/10/2026 (מאיה): "הצ'אט שם זה בול אותו צ'אט כמו בסרגל למעלה, פשוט
   מושתל נכון, בול?"

   המנוע כן היה זהה מהיום הראשון: streamCheckIdea מיוצא מ-idea-chat.js
   בדיוק בשביל זה, אותו שרת ואותו זרם. אבל הטיפול בתשובה לא היה זהה,
   ושם זה נשבר: השרת מנחה את המודל לסיים בשורה טכנית
   [[IDEA_SUMMARY]]רעיון||זווית||סיפור, והלשונית מורידה אותה מהבועה.
   המושתל הציג אותה למשתמשת כטקסט. */
describe('אותו צ\'אט בדיוק, גם בטיפול בתשובה', () => {
  test('אותו מנוע, ולא עותק שני', async () => {
    assert.match(IDEA_CHAT, /export async function streamCheckIdea/, 'המנוע לא מיוצא');
    assert.match(SHARPEN, /streamCheckIdea\(/, 'המושתל לא מריץ את המנוע');
    assert.ok(!/fetch\(/.test(SHARPEN), 'המושתל פונה לשרת בעצמו במקום דרך המנוע');
  });

  test('השורה הטכנית יורדת מהבועה, כמו בלשונית', async () => {
    const { extractIdeaSummary } = await import('../js/idea-reply.js');
    const reply = 'הרעיון שלך רחב מדי.\n[[IDEA_SUMMARY]]למה החלקה שורפת את השיער||טעות נפוצה||';
    const out = extractIdeaSummary(reply);
    assert.equal(out.visibleReply, 'הרעיון שלך רחב מדי.');
    assert.equal(out.idea, 'למה החלקה שורפת את השיער');
    assert.ok(!out.visibleReply.includes('[['), 'המרקר נשאר על המסך');
    assert.ok(!out.visibleReply.includes('||'), 'המפרידים נשארו על המסך');
  });

  test('תשובה בלי מרקר נשארת שלמה', async () => {
    const { extractIdeaSummary } = await import('../js/idea-reply.js');
    const out = extractIdeaSummary('סתם תשובה רגילה');
    assert.equal(out.visibleReply, 'סתם תשובה רגילה');
    assert.equal(out.summary, null);
  });

  test('המושתל באמת מריץ את אותו טיפול', () => {
    assert.match(SHARPEN, /extractIdeaSummary\(/, 'המרקר לא מוסר במושתל');
    assert.match(SHARPEN, /RECOGNIZED_MARKER/, 'סימון "רעיון חזק" לא מטופל');
    assert.match(SHARPEN, /chat-bubble-excellent/, 'הבועה לא מסומנת כמו בלשונית');
  });

  /* הרעיון שהשרת כבר ניסח במרקר עדיף על כל חילוץ מקומי. */
  test('ההצעה שמועברת לתיבה באה קודם כל מהשרת', () => {
    assert.match(SHARPEN, /offerSuggestion\(thinking, finalIdea \|\| visibleReply\)/, 'ההצעה לא מהמרקר');
  });

  test('אותו מיקרופון של הלשונית, אותה פונקציה', () => {
    assert.match(SHARPEN, /wireVoiceInput\(\{ buttonId: 'va-chat-mic'/, 'אין מיקרופון');
    assert.match(VA, /class="mic-btn" id="va-chat-mic"/, 'המיקרופון לא במחלקה של הלשונית');
    assert.match(CSS, /\.mic-btn\[hidden\]/, 'כפתור המיקרופון לא באמת מוסתר כשאין תמיכה');
  });
});

/* הפענוח חי במקום אחד, ושני הצדדים מייבאים ממנו. זה מה שהופך את "אותו
   צ'אט בול" לנכון מבנית, ולא להצהרה שאפשר לסחוף ממנה. */
test('אין שתי גרסאות של פענוח התשובה', () => {
  const reply = readFileSync(join(ROOT, 'js', 'idea-reply.js'), 'utf8');
  assert.match(reply, /export function extractIdeaSummary/, 'הפענוח לא במודול המשותף');
  for (const [name, src] of [['idea-chat.js', IDEA_CHAT], ['video-assistant.js', VA]]) {
    assert.match(src, /from '\.\/idea-reply\.js'/, `${name} לא מייבא מהמודול המשותף`);
    assert.ok(!/function extractIdeaSummary/.test(src), `${name} מחזיק עותק משלו`);
    assert.ok(!/const SUMMARY_MARKER =/.test(src), `${name} מחזיק עותק של המרקר`);
  }
});
