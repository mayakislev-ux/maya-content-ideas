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


  test('הרעיון שיוצא מהצ׳אט הוא זה שממשיך', () => {
    assert.match(SHARPEN, /IDEA_SHARPENED/, 'הרעיון לא נשמר בחזרה למצב');
    assert.match(SHARPEN, /va-idea-sharp/, 'אין שדה לרעיון המדויק');
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


  test('הטיוטה גוברת על המצב, כי היא החדשה', () => {
    assert.match(SHARPEN, /idea-sharpen\|va-idea-sharp/, 'הטיוטה לא נקראת');
    assert.match(SHARPEN, /draft !== undefined \? draft/, 'הטיוטה לא גוברת');
  });


});

/* 28/10/2026 (מאיה): "גם בתכלס הוא צריך להופיע גם בקטע שצולם שממירים
   לפורמט אחר וכותבים". אותו מסך משרת עכשיו שני מסלולים, ולכן כאן
   התבנית עצמה מורצת באמת - עם ועד בלי קטע מצולם - ולא רק נבדקת כמקור.
   בדיקת מקור הייתה עוברת גם על תבנית שמתפרקת בהרצה. */
describe('אותו מסך, שני מסלולים', () => {
  const tplFrom = SHARPEN.indexOf('cosmicCard(`') + 'cosmicCard(`'.length;
  const tplTo = SHARPEN.indexOf('\n  `);', tplFrom);
  const render = (forFootage) => {
    assert.ok(tplTo > tplFrom, 'לא נמצאה תבנית המסך');
    const build = new Function('forFootage', 'refsOnly', 'escapeHtml', 'idea', 'punch', 'fromIdea', 'state',
      'return `' + SHARPEN.slice(tplFrom, tplTo) + '`');
    return build(forFootage, false, (s) => s, 'הרעיון הגולמי שלי', 'הפואנטה הגולמית שלי', !forFootage, {});
  };

  /* 29/10/2026 (מאיה): "יש שם בשקוף דוגמה של החלקות, תבטלי, זה מבלבל". */
  test('רעיון מ-0: הכותרת והתווית, בלי דוגמת החלקה בשקוף', () => {
    const html = render(false);
    assert.match(html, /<h2>הרעיון שלך<\/h2>/);
    assert.ok(html.includes('מה הפואנטה שורה תחתונה מהסרטון? מה אתם רוצים שהקהל שלכם יבין? מה המסר?'), 'השאלה על הפואנטה לא בנוסח שלה');
    assert.ok(!html.includes('החלקה'), 'חזרה הדוגמה של ההחלקה');
    assert.ok(html.includes('הרעיון הגולמי שלי'), 'הרעיון לא נכנס לתיבה');
    assert.ok(!html.includes('${'), 'נשארה אינטרפולציה לא פתורה');
  });

  test('קטע שצולם: אותו מסך מדבר על המסר של הקטע', () => {
    const html = render(true);
    assert.match(html, /<h2>המסר של הקטע<\/h2>/);
    assert.match(html, /placeholder="למשל: למה אני עובדת עם מכשיר אחד/);
    assert.ok(html.includes('שכבר צולם'), 'לא כתוב שהחומר כבר קיים');
    assert.ok(!html.includes('${'), 'נשארה אינטרפולציה לא פתורה');
  });

  test('שני המסלולים מקבלים את אותן תיבות ואותו כפתור', () => {
    for (const html of [render(false), render(true)]) {
      for (const id of ['va-idea-sharp', 'va-idea-next-btn']) {
        assert.ok(html.includes(`id="${id}"`), `חסר ${id}`);
      }
    }
  });
});

describe('ברור מה עושים כאן', () => {
  /* 28/10/2026 (מאיה): "מיליון טקסט, מבלבל ועושה כאב ראש, חייב לפשט
     הכל". ההסבר הוא השאלות שעל התיבות, לא פסקאות מעליהן. */
  test('בלי פסקת פתיחה ובלי רשימת צעדים, רק שאלות על התיבות', () => {
    assert.ok(!/cosmic-howto|cosmic-lede|cosmic-hint/.test(SHARPEN.slice(SHARPEN.indexOf('cosmicCard(`'), SHARPEN.indexOf('\n  `);'))), 'חזר טקסט מסביב לתיבות');
    assert.match(SHARPEN, /'על מה הסרטון\?'/, 'לתיבת הנושא אין שאלה');
  });

  test('לתיבה יש תווית, ודוגמה רק לקטע שצולם', () => {
    assert.match(SHARPEN, /cosmic-field-label/, 'לתיבה אין תווית');
    assert.ok(!SHARPEN.includes('החלקה'), 'חזרה הדוגמה של ההחלקה');
    assert.match(SHARPEN, /placeholder="למשל: למה אני עובדת עם מכשיר אחד/, 'לקטע שצולם אין דוגמה משלו');
  });

  /* הצעה בתוך פסקה שצריך להעתיק ביד היא לא הצעה. */

});

/* הכותרת אמרה "שלב 2 מתוך 5: בדיקת התאמה" בזמן שעל המסך היה כתוב
   "בוא נדייק את הרעיון". שם הפאזה משותף לכמה מסכים. */
describe('הכותרת תואמת את המסך', () => {
  test('למסך חידוד הרעיון יש שם משלו בפס ההתקדמות', () => {
    assert.match(VA, /SCREEN_LABEL\[state\.screen\] \|\| PHASES\[current\]/, 'הכותרת לא לפי המסך');
    assert.match(VA, /'idea-sharpen': 'הרעיון והמסר'/, 'אין שם למסך הרעיון');
    assert.match(VA, /'creative-packaging': 'האריזה הקריאייטיבית'/, 'אין שם למסך האריזה');
  });

  test('נקודת יציאה וסוג תוכן יושבים בשלב הפורמט, לא בבדיקת ההתאמה', () => {
    assert.match(VA, /'content-basics': 2/, 'השלב שגוי');
  });
});

/* 28/10/2026 (מאיה): "חייב עוד סעיף שהוא הכי קריטי - מה הפואנטה של
   הסרטון? מה המסר? ואז הפואנטה הופכת להיות הרעיון, ורק אז הצ'אט".
   "מפחדת שזה עומס של שלבים" - ולכן זה שדה באותו מסך, לא מסך חדש. */
describe('הפואנטה: הסעיף הכי קריטי', () => {
  const tplFrom = SHARPEN.indexOf('cosmicCard(`') + 'cosmicCard(`'.length;
  const tplTo = SHARPEN.indexOf('\n  `);', tplFrom);
  const render = (forFootage) => new Function('forFootage', 'refsOnly', 'escapeHtml', 'idea', 'punch', 'fromIdea', 'state',
    'return `' + SHARPEN.slice(tplFrom, tplTo) + '`')(forFootage, false, (s) => s, 'נושא', 'הפואנטה שלי', !forFootage, {});

  /* 28/10/2026 (מאיה: "עומס מנטלי"): "מאיפה הרעיון?" ו"בודקים לפני
     שממשיכים" היו מסכים נפרדים, ועכשיו הם קישור ותיבת סימון כאן. */
  test('ההגרלה ובדיקת הרלוונטיות נמצאות במסך הרעיון', () => {
    const html = render(false);
    assert.ok(html.includes('id="va-pull-idea-link"'), 'אין קישור להגרלה');
    assert.ok(html.includes('id="va-relevance-check"'), 'אין בדיקת רלוונטיות');
    assert.ok(!render(true).includes('va-relevance-check'), 'בקטע שצולם הרלוונטיות כבר נבדקה');
    assert.match(SHARPEN, /relevance && !relevance\.checked/, 'אפשר להמשיך בלי לסמן');
  });

  test('ברעיון מ-0 יש שדה פואנטה באותו מסך, ובקטע שצולם אין', () => {
    assert.ok(render(false).includes('id="va-idea-punch"'), 'אין שדה פואנטה');
    assert.ok(render(false).includes('הפואנטה שלי'), 'הפואנטה לא חוזרת לתיבה');
    assert.ok(!render(true).includes('va-idea-punch'), 'בקטע שצולם המסר כבר קיים, אין צורך בשדה נוסף');
  });



  test('לפואנטה יש עיצוב שמבליט אותה', () => {
    assert.match(CSS, /\.va-punch-box\s*\{/);
  });
});

/* 28/10/2026 (מאיה): "זהו הצ'אט בתכלס זה הזווית הקריאייטיבית, אבל הוא לא
   מתקרב לרמה של הג'מיני". התהליך שלה: רעיון ← מסר ← אריזה קריאייטיבית
   עם ג'מיני ← פורמט ← תסריט. הצ'אט ירד מהעוזר, והפרומפט שלה נכנס במקומו. */
describe('האריזה הקריאייטיבית במקום הצ׳אט', () => {
  test('אין צ׳אט במסך הרעיון', () => {
    assert.ok(!VA.includes('streamCheckIdea'), 'הצ׳אט חזר לעוזר');
    assert.ok(!SHARPEN.includes('va-chat-wrap'), 'תיבת הצ׳אט חזרה למסך');
  });

  test('הפרומפט לג׳מיני הוא הנוסח שלה, מילה במילה', async () => {
    const { buildCreativePackagingPrompt } = await import('../js/video-assistant-prompts.js');
    assert.equal(
      buildCreativePackagingPrompt({ domain: 'החלקות', audience: 'נשים 30+', idea: 'החלקה. המסר: אפשר בלי לשרוף' }),
      ['התחום שלי זה: החלקות', 'קהל היעד שלי זה: נשים 30+',
        'זה הרעיון שלי לתוכן והמסר: החלקה. המסר: אפשר בלי לשרוף',
        'אני רוצה שתמצא לי 30 פורמטי הנגשה מעניינים ולא בנאליים, לסרטון הזה לרשתות החברתיות, מאוד מיוחדים/מושכים תשומת לב/מקוריים/חכמים וממירים. אני רוצה שהפורמטי הנגשה יהיו מגוונים, לא רק דיבור למצלמה (גם) אבל גם בירול עם טקסט, פוסט קרוסלה, ראיון/שיחה עם מישהו, וויס אובר ועוד כל מיני מגוונים. תחשוב על דברים וואוווו'].join(String.fromCharCode(10)));
  });

  test('מסך האריזה: פרומפט להעתקה, תיבה לכיוון שנבחר, ובלי כיוון לא ממשיכים', () => {
    const PK = VA.slice(VA.indexOf('async function renderCreativePackaging'), VA.indexOf('function renderContentBasics'));
    assert.ok(PK.includes('buildCreativePackagingPrompt('));
    assert.ok(PK.includes('va-packaging-input'));
    assert.ok(PK.includes('PACKAGING_CHOSEN'));
    assert.ok(PK.includes('if (!packaging)'));
  });
});

/* 29/10/2026 (מאיה): סוג התוכן ירד ("סתם מיוחד ומסבך"), נקודת היציאה
   נשאלת ברור עם הסבר בפופאפ, יש הסבר "מה זה קריאייטיב", והתחום מתמלא
   לבד מהפרופיל גם במסלול "יש לי רעיון". */
describe('מסך האריזה בלי עומס', () => {
  const PACK = fnBody('renderCreativePackaging', 'chips');
  test('אין יותר בחירת סוג תוכן במסך', () => {
    assert.ok(!PACK.includes('CONTENT_TYPES'), 'סוג התוכן חזר למסך');
    assert.ok(!PACK.includes('va-type-row'));
  });
  test('נקודת היציאה בניסוח החדש, עם הסבר בפופאפ', () => {
    assert.ok(PACK.includes('מה נקודת היציאה של הרעיון?'));
    assert.ok(PACK.includes('id="va-what-start-link"'));
    assert.ok(PACK.includes('הכי חזק זה סיפור לקוח או סיפור אישי'));
  });
  test('הסבר מה זה קריאייטיב', () => {
    assert.ok(PACK.includes('id="va-what-creative-link"'));
    assert.ok(PACK.includes('כל רעיון אפשר להנגיש באלפי דרכים'));
  });
  test('התחום נלקח מהפרופיל כשאין domainInfo', () => {
    assert.match(PACK, /await myDomain\(\)/);
    assert.match(VA, /async function myDomain\(\)[\s\S]{0,200}profile\.business/);
  });
});
