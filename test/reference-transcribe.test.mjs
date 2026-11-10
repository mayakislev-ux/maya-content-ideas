/* 04/11/2026 (מאיה): "✨ תמלול מדויק" במסך התמלול של השכפול.
   חלק ראשון: ההחלטות הטהורות (איזה לינק, איך התשובה הופכת לטקסט בתיבה,
   מה אומרים עליו). חלק שני: לחיצות אמיתיות ב-jsdom על index.html האמיתי,
   עם Firebase מדומה (test/helpers/cdn-stub-hooks.mjs): טעינה, הצלחה
   שממלאת את התיבה, לינק שנכשל שמציע העלאה, והעלאה מהגלריה. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { register, createRequire } from 'node:module';
import {
  linkPlatform, uploadProblem, uploadPathFor, uploadContentType, composeTranscript, isVisualResult,
  onScreenWithoutCaptions, accurateNotice, accurateNoticeText, transcribeErrorInfo, MAX_UPLOAD_BYTES,
} from '../js/reference-transcribe.js';

const HE_SPEECH = {
  language: 'he',
  kind: 'speech',
  spoken: 'אדל נסעה שעתיים מתל אביב עד אליי רק בשביל לעשות הלחמת ריסים.\nהיום אני יודעת שהבעיה היא לא המיקום, לקוחה מחפשת את מי שהיא יכולה לסמוך עליה.',
  spokenHe: '',
  onScreenText: [],
  scenes: ['אישה שוכבת על מיטת טיפולים'],
};

describe('לינק, קובץ ונתיב', () => {
  test('רק טיקטוק ואינסטגרם, כמו בשרת', () => {
    assert.equal(linkPlatform('https://vt.tiktok.com/ZSqhV8jmX/'), 'tiktok');
    assert.equal(linkPlatform('https://www.tiktok.com/@a/video/7608083398443207956'), 'tiktok');
    assert.equal(linkPlatform('https://www.instagram.com/reel/DZsJ0i7ymDy/'), 'instagram');
    assert.equal(linkPlatform('https://www.instagram.com/p/DW-2qXxDd_H/?igsh=1'), 'instagram');
    for (const bad of ['', 'abc', 'https://youtube.com/shorts/x', 'https://www.instagram.com/x/', 'https://tiktok.com.evil.com/@a/video/1']) {
      assert.equal(linkPlatform(bad), null, bad);
    }
  });

  test('קובץ: רק וידאו, עד 200MB, לא ריק', () => {
    assert.equal(uploadProblem({ type: 'video/mp4', size: 1000 }), '');
    assert.equal(uploadProblem({ type: '', size: 1000 }), '', 'iOS מחזיר לפעמים סוג ריק');
    assert.match(uploadProblem({ type: 'image/jpeg', size: 1000 }), /לא סרטון/);
    assert.match(uploadProblem({ type: 'video/mp4', size: MAX_UPLOAD_BYTES + 1 }), /200MB/);
    assert.match(uploadProblem({ type: 'video/mp4', size: 0 }), /ריק/);
    assert.match(uploadProblem(null), /לא נבחר/);
  });

  test('נתיב: בתיקייה של המשתמשת, שם קובץ פשוט שהשרת מקבל', () => {
    const p = uploadPathFor('u1', { name: 'הסרטון שלי (1).MOV' }, 1730000000000, 0.123456789);
    assert.match(p, /^transcribeUploads\/u1\/[a-z0-9]+-[a-z0-9]+\.mov$/);
    assert.match(uploadPathFor('u1', { name: 'noext' }), /\.mp4$/);
    assert.equal(uploadContentType({ type: 'video/quicktime' }), 'video/quicktime');
    assert.equal(uploadContentType({ type: '' }), 'video/mp4');
  });
});

describe('מה נכנס לתיבה', () => {
  test('דיבור בעברית: רק מה שנאמר, בלי "מה רואים"', () => {
    const text = composeTranscript(HE_SPEECH);
    assert.equal(text, HE_SPEECH.spoken);
    assert.equal(isVisualResult(HE_SPEECH), false);
  });

  test('דיבור בשפה זרה: התרגום לעברית, ואז הטקסט שעל המסך', () => {
    const r = {
      language: 'en', kind: 'speech',
      spoken: 'if you eat less\nmove more\nyou will lose weight and this is the whole point of the video, keep watching to learn more about it',
      spokenHe: 'אם תאכלו פחות\nתזוזו יותר\nתרדו במשקל וזה כל העניין של הסרטון, תמשיכו לצפות כדי ללמוד על זה עוד, כי רוב האנשים עוצרים ברמה הראשונה',
      onScreenText: ['EAT LESS (אכלו פחות)', 'NEW BODY (גוף חדש)'],
      scenes: ['אישה מדביקה פתקים על לוח'],
    };
    const text = composeTranscript(r);
    assert.ok(text.startsWith('אם תאכלו פחות'), text);
    assert.ok(!text.includes('if you eat less'), 'המקור באנגלית נכנס לתיבה');
    assert.match(text, /\n\nטקסט על המסך:\n• EAT LESS \(אכלו פחות\)\n• NEW BODY \(גוף חדש\)$/);
    assert.ok(!text.includes('מה רואים'), 'סרטון דיבור קיבל תיאור סצנות');
    const notice = accurateNoticeText(accurateNotice(r, text));
    assert.match(notice.body, /ותרגם מאנגלית לעברית/);
    assert.match(notice.body, /וגם מה שכתוב על המסך/);
  });

  test('ויזואלי: טקסט על המסך ומה רואים, ממוספר, וההודעה אומרת שזה ויזואלי', () => {
    const r = {
      language: 'none', kind: 'visual', spoken: '', spokenHe: '',
      onScreenText: ['הרמת ריסים מטורפת 🥹 חכו לסוף', 'זוכרות את הלפני?'],
      scenes: ['בחורה שוכבת על מיטת טיפולים', 'קלוז-אפ על התוצאה'],
    };
    const text = composeTranscript(r);
    assert.equal(text, 'טקסט על המסך:\n• הרמת ריסים מטורפת 🥹 חכו לסוף\n• זוכרות את הלפני?\n\nמה רואים בסרטון:\n1. בחורה שוכבת על מיטת טיפולים\n2. קלוז-אפ על התוצאה');
    const info = accurateNotice(r, text);
    assert.equal(info.visual, true);
    assert.equal(info.reason, 'accurate');
    assert.equal(info.text, text);
    assert.match(accurateNoticeText(info).title, /ויזואלי/);
  });

  test('דיבור קצר בתוך סרטון מעורב: נחשב ויזואלי ומקבל את מה רואים', () => {
    const r = { language: 'he', kind: 'mixed', spoken: 'וואו.', spokenHe: '', onScreenText: [], scenes: ['לפני', 'אחרי'] };
    assert.equal(isVisualResult(r), true);
    assert.equal(composeTranscript(r), 'וואו.\n\nמה רואים בסרטון:\n1. לפני\n2. אחרי');
  });

  test('כתוביות של הדיבור שנכנסו כ"טקסט על המסך" נזרקות, כותרת אמיתית נשארת', () => {
    const spoken = 'אדל נסעה שעתיים מתל אביב עד אליי רק בשביל לעשות הלחמת ריסים כשיש לה עשרות מלחימות';
    const leak = ['אדל נסעה שעתיים', 'מתל אביב עד אליי', 'רק בשביל לעשות', 'הלחמת ריסים', 'כותרת שלא נאמרה'];
    assert.deepEqual(onScreenWithoutCaptions(leak, [spoken]), ['כותרת שלא נאמרה']);
    /* מעט שורות, או רובן לא מהדיבור: הכל נשאר */
    assert.deepEqual(onScreenWithoutCaptions(['EAT LESS', 'MOVE MORE'], ['if you eat less move more']), ['EAT LESS', 'MOVE MORE']);
    const mostlyReal = ['EAT LESS', 'כותרת 1', 'כותרת 2', 'כותרת 3'];
    assert.deepEqual(onScreenWithoutCaptions(mostlyReal, ['eat less']), mostlyReal);
  });

  test('תשובה ריקה לא ממלאת כלום', () => {
    assert.equal(composeTranscript(null), '');
    assert.equal(composeTranscript({ language: 'none', kind: 'music', spoken: '', onScreenText: [], scenes: [] }), '');
  });
});

describe('שגיאות מהשרת', () => {
  test('לינק שלא ירד או לא נתמך: מציעים העלאה, עם ההודעה מהשרת', () => {
    const info = transcribeErrorInfo({ code: 'functions/failed-precondition', message: 'לא הצלחנו להוריד את הסרטון מאינסטגרם.', details: { reason: 'link-fetch' } });
    assert.deepEqual(info, { linkFailed: true, message: 'לא הצלחנו להוריד את הסרטון מאינסטגרם.' });
    assert.equal(transcribeErrorInfo({ code: 'functions/invalid-argument', message: 'x', details: { reason: 'unsupported-link' } }).linkFailed, true);
  });
  test('מכסה, זמן ושגיאה כללית', () => {
    const quota = transcribeErrorInfo({ code: 'functions/resource-exhausted', message: 'הגעת למכסת השימוש היומית ב-AI' });
    assert.match(quota.message, /המכסה היומית של התמלולים נגמרה/, 'נוסח לא מכליל מהשרת עבר כמו שהוא');
    assert.equal(quota.quota, true);
    assert.match(transcribeErrorInfo({ code: 'functions/deadline-exceeded', message: 'deadline-exceeded' }).message, /יותר מדי זמן/);
    assert.deepEqual(transcribeErrorInfo({ code: 'functions/internal', message: 'internal' }), { linkFailed: false, message: '' });
  });
});

/* ---------- לחיצות אמיתיות ב-jsdom ---------- */

const JSDOM_PATH = 'C:/dev/portal-sales/node_modules/jsdom/lib/api.js';
const hasJsdom = existsSync(JSDOM_PATH);

const store = new Map();
const calls = { transcribe: [], uploads: [] };
let pending = null; // { resolve, reject } של הקריאה הנוכחית ל-transcribeReference

function installFirebaseStub() {
  const path = (...parts) => parts.filter((p) => typeof p === 'string').join('/');
  globalThis.__fbStub = {
    initializeApp: () => ({}),
    getAuth: () => ({ currentUser: { uid: 'u1', email: 'client@example.com', getIdToken: async () => 'tok' } }),
    getFirestore: () => ({ __db: true }),
    enableIndexedDbPersistence: () => Promise.resolve(),
    getFunctions: () => ({}),
    collection: (base, ...parts) => ({ path: base && base.path ? path(base.path, ...parts) : path(...parts) }),
    doc: (base, ...parts) => ({ path: base && base.path ? path(base.path, ...parts) : path(...parts) }),
    query: (col) => col,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    serverTimestamp: () => Date.now(),
    getDoc: async (ref) => ({ exists: () => store.has(ref.path), data: () => structuredClone(store.get(ref.path)), id: ref.path.split('/').pop() }),
    setDoc: async (ref, data) => { store.set(ref.path, structuredClone(data)); },
    getDocs: async () => ({ docs: [], forEach: () => {} }),
    onSnapshot: () => () => {},
    getStorage: () => ({ __storage: true }),
    ref: (_s, p) => ({ fullPath: p }),
    uploadBytesResumable: (ref, file, meta) => {
      calls.uploads.push({ path: ref.fullPath, file, meta });
      return {
        on: (_ev, next, _err, done) => {
          next({ bytesTransferred: 50, totalBytes: 100 });
          setTimeout(done, 5);
        },
      };
    },
    httpsCallable: (_f, name) => async (data) => {
      if (name === 'transcribeReference') {
        calls.transcribe.push(data);
        return new Promise((resolve, reject) => { pending = { resolve: (d) => resolve({ data: d }), reject }; });
      }
      if (name === 'extractOpeningHook') return { data: { hook: String(data.transcript).split('\n')[0] } };
      return { data: {} };
    },
  };
}

async function until(fn, label, tries = 400) {
  for (let i = 0; i < tries; i += 1) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail(`לא קרה: ${label}`);
}

let $;
let va;

describe('בדפדפן (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן במחשב הזה' }, () => {
  before(async () => {
    register('./helpers/cdn-stub-hooks.mjs', import.meta.url);
    installFirebaseStub();
    const require = createRequire(import.meta.url);
    const { JSDOM } = require(JSDOM_PATH);
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const dom = new JSDOM(html, { url: 'https://mayakislev-ux.github.io/maya-content-ideas/', pretendToBeVisual: true });
    const w = dom.window;
    w.scrollTo = () => {};
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent',
      'KeyboardEvent', 'MouseEvent', 'sessionStorage', 'localStorage', 'getComputedStyle', 'requestAnimationFrame',
      'cancelAnimationFrame', 'history', 'location', 'DocumentFragment', 'HTMLTextAreaElement', 'HTMLInputElement']) {
      Object.defineProperty(globalThis, k, { value: k === 'window' ? w : w[k], configurable: true, writable: true });
    }
    w.HTMLMediaElement && (w.HTMLMediaElement.prototype.play = () => Promise.resolve());
    store.set('profiles/u1', { name: 'מיכל', pronoun: 'את', business: 'שיווק', primaryAudience: 'בעלות עסקים' });
    va = await import('../js/video-assistant.js');
    va.wireVideoAssistantView();
    $ = (sel) => document.querySelector(sel);
  });

  const VISUAL = { id: 'vis1', url: 'https://www.tiktok.com/@a/video/7497612811804282130', platform: 'tiktok', audioKind: 'silent', sourceLanguage: 'he', transcript: '' };

  async function openTranscribeScreen(video = VISUAL) {
    await va.duplicateFromBank(video, {});
    await until(() => $('#va-accurate-btn') && $('#va-reference-link').value === video.url, 'מסך התמלול עם הכפתור');
  }

  /* 10/11/2026 (מאיה): הכפתור נקרא "לתמלול אוטומטי ומיידי", וההסבר על ג'מיני ירד מהמסך */
  test('הכפתור במסך התמלול, בלי הסבר על ג׳מיני, ועם העלאה מהגלריה', async () => {
    document.body.dataset.plan = 'refs';
    await openTranscribeScreen();
    assert.equal($('#va-accurate-btn').textContent.trim(), '✨ לתמלול אוטומטי ומיידי');
    assert.equal($('.va-accurate-hint'), null);
    assert.match($('#va-accurate-upload-btn').textContent, /להעלות את הסרטון מהגלריה/);
    assert.equal($('#va-accurate-file').getAttribute('accept'), 'video/*');
    assert.ok($('#va-accurate-status').hidden);
  });

  test('לחיצה: מצב טעינה, ואז התמלול נכנס לתיבה עם הודעה שזה ויזואלי', async () => {
    calls.transcribe.length = 0;
    $('#va-accurate-btn').click();
    await until(() => calls.transcribe.length === 1, 'לא נשלח לשרת');
    /* 04/11/2026: גם המזהה במאגר, למטמון התמלולים בשרת */
    assert.deepEqual(calls.transcribe[0], { link: VISUAL.url, bankId: 'vis1' });
    assert.ok(!$('#va-accurate-status').hidden);
    assert.match($('#va-accurate-status').textContent, /ג'מיני צופה בו/);
    assert.match($('#va-accurate-status').textContent, /20-60 שניות/);
    assert.ok($('#va-accurate-btn').disabled, 'אפשר ללחוץ שוב באמצע');
    assert.ok($('#va-transcribe-done-btn').disabled, 'אפשר להמשיך באמצע התמלול');

    pending.resolve({
      language: 'none', kind: 'visual', spoken: '', spokenHe: '',
      onScreenText: ['הרמת ריסים מטורפת 🥹 חכו לסוף'], scenes: ['בחורה על מיטת טיפולים', 'התוצאה מקרוב'],
      source: 'tiktok', model: 'gemini-3.5-flash',
    });
    await until(() => $('#va-transcript-input') && $('#va-transcript-input').value.includes('חכו לסוף'), 'התיבה לא התמלאה');
    const value = $('#va-transcript-input').value;
    assert.match(value, /^טקסט על המסך:\n• הרמת ריסים מטורפת/);
    assert.match(value, /מה רואים בסרטון:\n1\. בחורה על מיטת טיפולים/);
    assert.match($('.va-bank-notice').textContent, /הסרטון הזה בעיקר ויזואלי/);
    assert.ok(!$('#va-accurate-btn').disabled);
    assert.equal($('#va-transcript-input').getAttribute('placeholder').includes('לתאר'), false, 'נשאר במצב "לתאר במילים"');
    await until(() => (store.get('videoAssistantSessions/u1') || {}).transcript === value, 'התמלול לא נשמר בסשן');
    assert.equal(store.get('videoAssistantSessions/u1').bankNotice.reason, 'accurate');

    /* ואפשר להמשיך הלאה עם מה שנכנס */
    $('#va-transcribe-done-btn').click();
    await until(() => $('#va-hook-input'), 'לא עבר למציאת הוק');
  });

  test('לינק שלא ירד: אומרים את זה, וכפתור העלאה אחד שפותח את הגלריה', async () => {
    await openTranscribeScreen({ ...VISUAL, id: 'ig1', url: 'https://www.instagram.com/reel/DZsJ0i7ymDy/', platform: 'instagram' });
    calls.transcribe.length = 0;
    $('#va-accurate-btn').click();
    await until(() => calls.transcribe.length === 1, 'לא נשלח');
    const err = Object.assign(new Error('לא הצלחנו להוריד את הסרטון מאינסטגרם. זה קורה לפעמים כשהפלטפורמה חוסמת. אפשר להעלות אותו מהגלריה וזה יעבוד'),
      { code: 'functions/failed-precondition', details: { reason: 'link-fetch', platform: 'instagram' } });
    pending.reject(err);
    await until(() => $('#va-accurate-upload-fallback'), 'אין הצעה להעלות');
    assert.match($('#va-accurate-status').textContent, /לא הצלחנו להוריד את הסרטון מאינסטגרם/);
    assert.ok($('#va-accurate-status').classList.contains('va-accurate-status--error'));
    assert.equal($('#va-transcript-input').value, '', 'התיבה השתנתה למרות הכישלון');
    assert.ok(!$('#va-accurate-btn').disabled);
    let opened = 0;
    $('#va-accurate-file').click = () => { opened += 1; };
    $('#va-accurate-upload-fallback').click();
    assert.equal(opened, 1, 'הכפתור לא פתח את בחירת הקובץ');
  });

  test('העלאה מהגלריה: אחוזים, ואז השרת מקבל את הנתיב בתיקייה שלה', async () => {
    calls.transcribe.length = 0;
    calls.uploads.length = 0;
    const input = $('#va-accurate-file');
    const file = { name: 'reel.MOV', type: 'video/quicktime', size: 5 * 1024 * 1024 };
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new window.Event('change'));
    await until(() => calls.transcribe.length === 1, 'הקובץ לא נשלח לתמלול');
    assert.equal(calls.uploads.length, 1);
    assert.match(calls.uploads[0].path, /^transcribeUploads\/u1\/[a-z0-9-]+\.mov$/);
    assert.equal(calls.uploads[0].meta.contentType, 'video/quicktime');
    assert.deepEqual(calls.transcribe[0], { uploadPath: calls.uploads[0].path });
    pending.resolve({ ...HE_SPEECH, source: 'upload' });
    await until(() => $('#va-transcript-input').value === HE_SPEECH.spoken, 'התיבה לא התמלאה מההעלאה');
    assert.match($('.va-bank-notice').textContent, /התמלול המדויק מוכן/);
  });

  test('קובץ שאינו סרטון, ולינק שאינו טיקטוק/אינסטגרם: נאמר מיד, בלי לשלוח', async () => {
    calls.transcribe.length = 0;
    const input = $('#va-accurate-file');
    Object.defineProperty(input, 'files', { value: [{ name: 'a.jpg', type: 'image/jpeg', size: 1000 }], configurable: true });
    input.dispatchEvent(new window.Event('change'));
    await until(() => /לא סרטון/.test($('#va-accurate-status').textContent), 'אין הודעה על קובץ שגוי');
    $('#va-reference-link').value = 'https://youtube.com/shorts/abc';
    $('#va-accurate-btn').click();
    await until(() => /רק עם לינק לסרטון מטיקטוק או מאינסטגרם/.test($('#va-accurate-status').textContent), 'אין הודעה על לינק לא נתמך');
    assert.ok($('#va-accurate-upload-fallback'), 'אין הצעה להעלות');
    $('#va-reference-link').value = '';
    $('#va-accurate-btn').click();
    await until(() => /אין עדיין לינק/.test($('#va-accurate-status').textContent), 'אין הודעה על לינק חסר');
    assert.equal(calls.transcribe.length, 0);
  });

  test('מכסה שנגמרה: אומרים את זה, ולא מציעים העלאה (גם היא נספרת)', async () => {
    await openTranscribeScreen();
    calls.transcribe.length = 0;
    $('#va-accurate-btn').click();
    await until(() => calls.transcribe.length === 1, 'לא נשלח');
    assert.ok($('#va-transcript-input').readOnly, 'אפשר להקליד בזמן ההמתנה, וזה יידרס');
    pending.reject(Object.assign(new Error('הגעת למכסת השימוש היומית ב-AI, נסו שוב מחר'), { code: 'functions/resource-exhausted' }));
    await until(() => /המכסה היומית של התמלולים נגמרה/.test($('#va-accurate-status').textContent), 'אין הודעת מכסה');
    assert.equal($('#va-accurate-upload-fallback'), null);
    assert.equal($('#va-transcript-input').readOnly, false);
  });

  test('עזבו את המסך באמצע: התוצאה לא נכנסת לשום מקום אחר, ושכפול חדש לא מקבל אותה', async () => {
    await openTranscribeScreen();
    calls.transcribe.length = 0;
    $('#va-accurate-btn').click();
    await until(() => calls.transcribe.length === 1, 'לא נשלח');
    const first = pending;
    /* שכפול של סרטון אחר בזמן שהראשון עוד רץ */
    await openTranscribeScreen({ ...VISUAL, id: 'vis2', url: 'https://www.tiktok.com/@b/video/111' });
    assert.ok(!$('#va-accurate-btn').disabled, 'הסרטון החדש נשאר נעול בגלל הריצה הקודמת');
    first.resolve({ language: 'none', kind: 'visual', spoken: '', spokenHe: '', onScreenText: ['של הסרטון הקודם'], scenes: ['x'] });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal($('#va-transcript-input').value, '', 'תמלול של הסרטון הקודם נכנס לסרטון החדש');
    assert.ok($('#va-accurate-status').hidden);
  });

  /* 04/11/2026: תמלול שהגיע ממטמון השרת. ללקוחה זה נראה בדיוק כמו תמלול
     רגיל. רק מאיה רואה "לתמלל מחדש", והוא שולח refresh לשרת. */
  test('מטמון: התוצאה נכנסת כרגיל, ורק מאיה מקבלת "לתמלל מחדש"', async () => {
    const { auth } = await import('../js/firebase-init.js');
    await openTranscribeScreen({ ...VISUAL, id: 'c1', url: 'https://www.instagram.com/reel/DZsJ0i7ymDy/' });
    calls.transcribe.length = 0;
    $('#va-accurate-btn').click();
    await until(() => calls.transcribe.length === 1, 'לא נשלח');
    pending.resolve({ ...HE_SPEECH, source: 'instagram', cached: true });
    await until(() => $('#va-transcript-input').value === HE_SPEECH.spoken, 'התיבה לא התמלאה');
    assert.equal($('#va-accurate-refresh'), null, 'לקוחה רואה את כפתור המנהלת');

    auth.currentUser.email = 'mayakislev@gmail.com';
    try {
      await openTranscribeScreen({ ...VISUAL, id: 'c2', url: 'https://www.instagram.com/reel/DZsJ0i7ymDy/' });
      calls.transcribe.length = 0;
      $('#va-accurate-btn').click();
      await until(() => calls.transcribe.length === 1, 'לא נשלח');
      pending.resolve({ ...HE_SPEECH, source: 'instagram', cached: true });
      await until(() => $('#va-accurate-refresh'), 'אין "לתמלל מחדש" למאיה');
      calls.transcribe.length = 0;
      $('#va-accurate-refresh').click();
      await until(() => calls.transcribe.length === 1, 'לתמלל מחדש לא שלח כלום');
      assert.deepEqual(calls.transcribe[0], { link: 'https://www.instagram.com/reel/DZsJ0i7ymDy/', bankId: 'c2', refresh: true });
      pending.resolve({ ...HE_SPEECH, spoken: `${HE_SPEECH.spoken}\nותמלול חדש`, source: 'instagram' });
      await until(() => $('#va-transcript-input').value.endsWith('ותמלול חדש'), 'התמלול החדש לא נכנס');
      assert.equal($('#va-accurate-refresh'), null, 'תמלול טרי עדיין מוצג כמהמטמון');
    } finally {
      auth.currentUser.email = 'client@example.com';
    }
  });
});
