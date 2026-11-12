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
  assert.deepEqual(f.map((x) => x.field), ['ideaTopic', 'ideaPunchline', 'rawDump', 'packaging', 'selectedFormat', 'hook', 'hookReinforcement']);
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
  assert.match(store, /collection\(db, 'videoAssistantScripts', subjectUid\(auth\.currentUser\.uid\), 'items'\)/);
  assert.match(rules, /match \/videoAssistantScripts\/\{uid\}\/items\/\{itemId\} \{\s*\n\s*allow read, write: if [^;]*request\.auth\.uid == uid;/);
});

test('הכפתור בראש העוזר מחובר לחלון', () => {
  const html = read('index.html');
  const va = read('js', 'video-assistant.js');
  assert.match(html, /id="video-assistant-scripts-btn"[^>]*>📝 התסריטים שלי</);
  assert.match(va, /getElementById\('video-assistant-scripts-btn'\)\.addEventListener\('click', openScriptsLibrary\)/);
  assert.match(read('js', 'video-assistant-library.js'), /confirmDialog\('למחוק את הסרטון הזה\?/, 'מחיקה בלי שאלת אישור');
});

test('אין יותר שורת "לשמור עכשיו", והשמירה כוללת את הפריט', () => {
  const va = read('js', 'video-assistant.js');
  assert.match(va, /save: \(\) => saveAll\(\)/);
  assert.match(va, /function saveAll\(\) \{[\s\S]{0,600}saveScript\(state\.scriptId, scriptDoc\(state\)\)/);
});

/* 12/11/2026 (מאיה: "כתבתי את התסריט מהמובייל ועכשיו נכנסתי למחשב וזה היה באמצע
   ולא נשמר"). חלון ישן לא דורס את מה שנכתב במכשיר אחר */
test('כשחוזרים לחלון, גרסה חדשה יותר ממכשיר אחר נטענת, ועד אז לא שומרים', async () => {
  const va = read('js', 'video-assistant.js');
  assert.match(va, /document\.addEventListener\('visibilitychange'[^\n]*refreshFromCloud\(\)/);
  assert.match(va, /window\.addEventListener\('focus', \(\) => refreshFromCloud\(\)\)/);
  assert.match(va, /if \(refreshing\) return refreshing\.then\(\(\) => saveAll\(\)\);/);
  assert.match(va, /saveSession\(state, \{ deviceId: DEVICE_ID \}\)/);
  assert.ok(!/saveSession\(state\)\./.test(va), 'שמירה בלי זיהוי מכשיר');
  /* הכלל עצמו */
  const src = va.slice(va.indexOf('export function cloudIsNewer'), va.indexOf('async function refreshFromCloud'));
  const cloudIsNewer = new Function(`${src.replace('export ', '')}; return cloudIsNewer;`)();
  assert.equal(cloudIsNewer({ updatedAt: 200, deviceId: 'phone' }, 100, 'pc'), true, 'נכתב בטלפון אחרי שהמחשב שמר');
  assert.equal(cloudIsNewer({ updatedAt: 200, deviceId: 'pc' }, 100, 'pc'), false, 'השמירה של החלון הזה עצמו');
  assert.equal(cloudIsNewer({ updatedAt: 90, deviceId: 'phone' }, 100, 'pc'), false, 'ישן יותר ממה שיש בחלון');
  assert.equal(cloudIsNewer({ updatedAt: 200 }, 100, 'pc'), false, 'סשן ישן בלי מכשיר');
  const store = read('js', 'video-assistant-store.js');
  assert.match(store, /export async function saveSession\(state, \{ deviceId = null \} = \{\}\)[\s\S]{0,200}return updatedAt;/);
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

/* 29/10/2026 (מאיה): "נכנסתי לתסריטים ולא נותן לי ללחוץ X". */
test('ה-X מחובר לחלון שלו, והסגירה מורידה כל חלון פתוח', () => {
  const modal = read('js', 'video-assistant-modal.js');
  assert.match(modal, /overlay\.querySelector\('\.cosmic-modal-close'\)\.addEventListener\('click', \(\) => overlay\.vaTryClose\(\)\)/);
  assert.doesNotMatch(read('js', 'video-assistant.js') + modal, /getElementById\('va-modal-close'\)/);
  assert.match(modal, /function closeModal\(\) \{\s*document\.querySelectorAll\('\.cosmic-modal-overlay'\)\.forEach/);
  assert.match(read('js', 'video-assistant-library.js'), /if \(opening\) return;/);
});
