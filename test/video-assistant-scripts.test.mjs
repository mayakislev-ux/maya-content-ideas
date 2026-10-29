/* 29/10/2026 (מאיה): "שיהיה כפתור 'התסריטים שלי', ואז כל פעם זה ישמור את
   כל מה שהיא כותבת, ויהיה לה אופציה גם לערוך/למחוק". */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasContent, scriptDoc, scriptFields, scriptTitle } from '../js/video-assistant-build.js';
import { INITIAL_STATE } from '../js/video-assistant-flow.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');

const built = {
  ...INITIAL_STATE, branch: 'scratch', screen: 'scratch-distill',
  ideaTopic: 'ממומן לא מציל שיווק חלש', ideaPunchline: 'העמוד הוא זה שמוכר',
  packaging: 'מכתב מהעמוד', startingPoint: 'סיפור לקוח', selectedFormat: 'דיבור למצלמה',
  rawDump: 'הכל', hook: 'שרפת 5,000?', hookReinforcement: 'כן, שרפת', draftScript: null,
};

test('לפני שנכתב משהו אין מה לשמור', () => {
  assert.equal(hasContent(INITIAL_STATE), false);
  assert.equal(hasContent({ ...INITIAL_STATE, branch: 'idea', screen: 'idea-sharpen' }), false);
});

test('טקסט שהוקלד ועוד לא עבר הלאה כבר נחשב', () => {
  const s = { ...INITIAL_STATE, branch: 'idea', screen: 'idea-sharpen', drafts: { 'idea-sharpen|va-idea-sharp': 'ממומן' } };
  assert.equal(hasContent(s), true);
  assert.equal(scriptTitle(s), 'ממומן');
});

test('השם ברשימה הוא הרעיון', () => {
  assert.equal(scriptTitle(built), 'ממומן לא מציל שיווק חלש');
  assert.equal(scriptTitle({ ...INITIAL_STATE, branch: 'idea' }), 'סרטון בלי שם');
});

test('כל חלק לעריכה, במלואו, עם השדה שלו בסטייט', () => {
  const f = scriptFields(built);
  assert.deepEqual(f.map((x) => x.field), ['ideaTopic', 'ideaPunchline', 'packaging', 'selectedFormat', 'rawDump', 'hook', 'hookReinforcement']);
  assert.equal(f.find((x) => x.key === 'packaging').value, 'מכתב מהעמוד', 'נקודת היציאה לא נכנסת לשדה האריזה');
  const long = 'א'.repeat(400);
  assert.equal(scriptFields({ ...built, draftScript: long }).find((x) => x.key === 'script').value, long, 'התסריט קוצר');
});

test('המסמך שנשמר: שם, האם מוכן, וכל הסטייט', () => {
  const d = scriptDoc({ ...built, scriptCreatedAt: 5 }, 10);
  assert.equal(d.title, 'ממומן לא מציל שיווק חלש');
  assert.equal(d.done, false);
  assert.equal(d.createdAt, 5);
  assert.equal(d.updatedAt, 10);
  assert.equal(d.state.hook, 'שרפת 5,000?');
  assert.equal(scriptDoc({ ...built, screen: 'summary' }).done, true);
});

/* הכללים לא נבדקים בשום שלב אחר. אם הנתיב בקוד והנתיב בכללים לא זהים,
   כל שמירה נכשלת בשקט. */
test('הנתיב שהקוד כותב אליו מותר בכללים', () => {
  const store = read('js', 'video-assistant-store.js');
  const rules = read('firestore.rules');
  assert.match(store, /collection\(db, 'videoAssistantScripts', auth\.currentUser\.uid, 'items'\)/);
  assert.match(rules, /match \/videoAssistantScripts\/\{uid\}\/items\/\{itemId\} \{\s*\n\s*allow read, write: if [^;]*request\.auth\.uid == uid;/);
});

test('הכפתור בראש העוזר מחובר לחלון', () => {
  const html = read('index.html');
  const va = read('js', 'video-assistant.js');
  assert.match(html, /id="video-assistant-scripts-btn"[^>]*>📝 התסריטים שלי</);
  assert.match(va, /getElementById\('video-assistant-scripts-btn'\)\.addEventListener\('click', openScriptsLibrary\)/);
  assert.match(va, /confirmDialog\('למחוק את הסרטון הזה\?/, 'מחיקה בלי שאלת אישור');
});

test('אין יותר שורת "לשמור עכשיו", והשמירה כוללת את הפריט', () => {
  const va = read('js', 'video-assistant.js');
  assert.match(va, /save: \(\) => saveAll\(\)/);
  assert.match(va, /function saveAll\(\) \{[\s\S]{0,400}saveScript\(state\.scriptId, scriptDoc\(state\)\)/);
});

test('עריכת הנושא או האריזה מגיעה גם למשפט שהפרומפטים קוראים', async () => {
  const { syncIdea } = await import('../js/video-assistant-build.js');
  const s = syncIdea({ ...built, ideaPunchline: 'מסר חדש' }, 'ideaPunchline');
  assert.equal(s.ideaBeforePackaging, 'מסר חדש. נושא הסרטון: ממומן לא מציל שיווק חלש');
  assert.equal(s.ideaDescription, 'מסר חדש. נושא הסרטון: ממומן לא מציל שיווק חלש. האריזה הקריאייטיבית: מכתב מהעמוד');
  const p = syncIdea({ ...s, packaging: 'ראיון' }, 'packaging');
  assert.match(p.ideaDescription, /האריזה הקריאייטיבית: ראיון$/);
  assert.equal(syncIdea(built, 'hook'), built, 'שדה שלא קשור לרעיון לא משנה כלום');
});

test('התסריט הוא מה שהסיכום מציג, לפי המסלול', () => {
  const ref = { ...INITIAL_STATE, branch: 'reference', screen: 'read-aloud', transcript: 'ת', hook: 'ה', herWords: 'מ', finalScript: 'סופי', draftScript: 'ישן' };
  assert.equal(scriptFields(ref).find((f) => f.key === 'script').field, 'finalScript');
  const scr = { ...built, draftScript: 'מזוקק' };
  assert.equal(scriptFields(scr).find((f) => f.key === 'script').field, 'draftScript');
});

test('חזרה עד מסך הפתיחה לא מצמידה את הפריט הישן לסרטון הבא', () => {
  const va = read('js', 'video-assistant.js');
  assert.match(va, /scriptId && !state\.scriptId && state\.branch\)/);
  assert.match(va, /if \(state\.scriptId && hasContent\(state\)\)/);
});
