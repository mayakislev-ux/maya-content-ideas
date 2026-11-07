/* 06/11/2026: "🎙️ לספר בקול ולמצוא רעיונות" בהוספת רעיון.
   1. צד השרת (ideas-from-recording.js) עם תלויות מדומות.
   2. העזרים הטהורים של הדפדפן.
   3. הזרימה האמיתית ב-jsdom: לוחצים על הכפתורים האמיתיים, מקליטים
      (MediaRecorder מדומה), מעלים, מקבלים רעיונות, מורידים סימון, שומרים. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { register, createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ifr = require('../functions/ideas-from-recording.js');

const TAXONOMY = {
  categories: ['בעל ערך', 'אישי', 'מכירתי'],
  categoryDefinitions: {},
  stages: ['שלב 1', 'שלב 2', 'שלב 3'],
  audienceScopes: ['עיקרי', 'משני', 'רחב'],
  strongRating: '🔥 חייב לצלם',
  normalRating: '⭐ שווה לצלם',
};

class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function makeDeps(over = {}) {
  const state = { deleted: [], released: 0, committed: 0, gemini: [] };
  const meta = over.meta || { size: 4_000_000, contentType: 'audio/webm' };
  const deps = {
    HttpsError,
    enforceAllowlist: async () => {},
    checkRate: async () => ({ commit: () => { state.committed += 1; }, release: async () => { state.released += 1; } }),
    bucket: {
      name: 'b',
      file: (p) => ({
        getMetadata: async () => [meta],
        delete: async () => { state.deleted.push(p); },
      }),
    },
    getAccessToken: async () => 'tok',
    projectId: 'p',
    fetchImpl: over.fetchImpl || (async (url, opts) => {
      state.gemini.push(JSON.parse(opts.body));
      const text = JSON.stringify(over.result || { ideas: [] });
      return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] }) };
    }),
    taxonomy: TAXONOMY,
  };
  return { deps, state };
}

const req = (path, uid = 'u1') => ({ auth: { uid, token: { email: 'a@b.c' } }, data: { path } });

describe('ideasFromRecording בשרת', () => {
  test('מחזיר רעיונות מסווגים, סופר מכסה ומוחק את הקובץ', async () => {
    const { deps, state } = makeDeps({ result: { ideas: [
      { title: 'לקוחה שאלה למה המחיר שלי גבוה', context: 'היום בשיחה', categoryIndex: 3, persuasionStageIndex: 3, audienceScopeIndex: 1, strong: true },
      { title: 'הטעות שכולם עושים בסטורי', categoryIndex: 1, persuasionStageIndex: 1, audienceScopeIndex: 3, strong: false },
    ] } });
    const out = await ifr.createIdeasFromRecordingHandler(deps)(req('transcribeUploads/u1/abc.webm'));
    assert.equal(out.ideas.length, 2);
    assert.deepEqual(out.ideas[0], {
      title: 'לקוחה שאלה למה המחיר שלי גבוה', context: 'היום בשיחה', category: 'מכירתי',
      persuasionStage: 'שלב 3', audienceScope: 'עיקרי', rating: '🔥 חייב לצלם',
    });
    assert.equal(out.ideas[1].rating, '⭐ שווה לצלם');
    assert.equal(state.committed, 1);
    assert.equal(state.released, 0);
    assert.deepEqual(state.deleted, ['transcribeUploads/u1/abc.webm']);
    const part = state.gemini[0].contents[0].parts[0].fileData;
    assert.deepEqual(part, { fileUri: 'gs://b/transcribeUploads/u1/abc.webm', mimeType: 'audio/webm' });
  });

  test('נתיב של משתמש/ת אחר/ת נחסם לפני כל דבר', async () => {
    const { deps, state } = makeDeps();
    await assert.rejects(ifr.createIdeasFromRecordingHandler(deps)(req('transcribeUploads/u2/abc.webm')), /ההקלטה לא נמצאה/);
    await assert.rejects(ifr.createIdeasFromRecordingHandler(deps)(req('transcribeUploads/u1/../u2/x.webm')), /ההקלטה לא נמצאה/);
    assert.equal(state.gemini.length, 0);
  });

  test('כשל של ג\'מיני מחזיר את המקום במכסה ועדיין מוחק את הקובץ', async () => {
    const { deps, state } = makeDeps({ fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
    await assert.rejects(ifr.createIdeasFromRecordingHandler(deps)(req('transcribeUploads/u1/a.m4a')), /לא הצלחנו להקשיב/);
    assert.equal(state.released, 1);
    assert.equal(state.committed, 0);
    assert.equal(state.deleted.length, 1);
  });

  test('קובץ שהוא לא הקלטה, או גדול מדי, נדחה', async () => {
    let { deps } = makeDeps({ meta: { size: 100, contentType: 'image/png' } });
    await assert.rejects(ifr.createIdeasFromRecordingHandler(deps)(req('transcribeUploads/u1/a.png')), /לא הקלטה/);
    ({ deps } = makeDeps({ meta: { size: ifr.MAX_AUDIO_BYTES + 1, contentType: 'audio/mp4' } }));
    await assert.rejects(ifr.createIdeasFromRecordingHandler(deps)(req('transcribeUploads/u1/a.m4a')), /ארוכה מדי/);
  });

  test('רעיון בלי קטגוריה תקינה נזרק, כפילויות מתאחדות, ועד 15', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ title: `רעיון ${i}`, categoryIndex: 1 }));
    const out = ifr.normalizeIdeas({ ideas: [
      { title: 'בלי קטגוריה', categoryIndex: 9 },
      { title: '', categoryIndex: 1 },
      { title: 'אותו רעיון!', categoryIndex: 2 },
      { title: 'אותו  רעיון', categoryIndex: 2 },
      ...many,
    ] }, TAXONOMY);
    assert.equal(out.length, ifr.MAX_IDEAS);
    assert.equal(out[0].title, 'אותו רעיון!');
    assert.ok(!out.some((i) => i.title === 'בלי קטגוריה'));
    assert.equal(out[0].persuasionStage, '');
  });

  test('הפרומפט מסווג לפי הרשימות האמיתיות ולא ממציא רעיונות', () => {
    const p = ifr.buildPrompt(TAXONOMY);
    assert.match(p, /1\. בעל ערך/);
    assert.match(p, /3\. מכירתי/);
    assert.match(p, /להחזיר רשימה ריקה/);
    assert.match(p, /לעולם לא "אישי"/);
  });

  test('השרת והדפדפן משתמשים באותם ערכים של דירוג וקהל', () => {
    const logic = readFileSync(new URL('../js/ideas-logic.js', import.meta.url), 'utf8');
    const index = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
    assert.match(logic, /RATINGS = \['🔥 חייב לצלם', '⭐ שווה לצלם'/);
    assert.match(logic, /AUDIENCE_SCOPES = \['עיקרי', 'משני', 'רחב'\]/);
    assert.match(index, /strongRating: '🔥 חייב לצלם'/);
    assert.match(index, /normalRating: '⭐ שווה לצלם'/);
    assert.match(index, /ideasFromRecording: 10/);
  });

  test('כללי ה-Storage מתירים הקלטה קולית בתיקייה של המשתמש/ת', () => {
    const rules = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');
    assert.match(rules, /contentType\.matches\('\(video\|audio\)\/\.\*'\)/);
  });
});

/* ---------------- הדפדפן ---------------- */

const JSDOM_PATH = 'C:/dev/portal-sales/node_modules/jsdom/lib/api.js';
const added = [];
const uploads = [];
const calls = [];
let nextResult = null;
function installStub() {
  globalThis.__fbStub = {
      initializeApp: () => ({}),
      getAuth: () => ({ currentUser: { uid: 'u1', email: 'c@x.com' } }),
      getFirestore: () => ({}),
      getFunctions: () => ({}),
      enableIndexedDbPersistence: () => Promise.resolve(),
      collection: (_db, name) => ({ path: name }),
      doc: (_db, ...p) => ({ path: p.join('/') }),
      query: (c) => c,
      where: () => ({}),
      onSnapshot: () => () => {},
      serverTimestamp: () => 'ts',
      addDoc: async (col, data) => { added.push({ col: col.path, data }); return { id: `n${added.length}` }; },
      getStorage: () => ({}),
      ref: (_s, path) => ({ path }),
      uploadBytesResumable: (r, blob, meta) => {
        uploads.push({ path: r.path, type: meta.contentType, size: blob.size });
        return { on: (_e, progress, _err, done) => { progress({ bytesTransferred: 1, totalBytes: 1 }); setTimeout(done, 0); } };
      },
      httpsCallable: (_f, name) => async (payload) => {
        calls.push({ name, payload });
        const r = nextResult;
        if (r instanceof Error) throw r;
        return { data: r };
      },
    };
}

const hasJsdom = existsSync(JSDOM_PATH);

describe('עזרי ההקלטה', { skip: hasJsdom ? false : 'jsdom לא מותקן' }, () => {
  let rec;
  before(async () => {
    register('./helpers/cdn-stub-hooks.mjs', import.meta.url);
    installStub();
    rec = await import('../js/idea-recorder.js');
  });

  test('בוחר סוג שהדפדפן תומך בו', () => {
    assert.equal(rec.pickMimeType((t) => t === 'audio/mp4'), 'audio/mp4');
    assert.equal(rec.pickMimeType(() => true), 'audio/webm;codecs=opus');
    assert.equal(rec.pickMimeType(() => false), '');
    assert.equal(rec.pickMimeType(null), '');
  });

  test('סוג נקי וסיומת', () => {
    assert.equal(rec.cleanAudioType('audio/webm;codecs=opus'), 'audio/webm');
    assert.equal(rec.cleanAudioType('video/webm'), 'audio/webm');
    assert.equal(rec.cleanAudioType(''), 'audio/webm');
    assert.equal(rec.extensionFor('audio/mp4'), 'm4a');
    assert.equal(rec.extensionFor('audio/webm;codecs=opus'), 'webm');
  });

  test('שעון', () => {
    assert.equal(rec.formatClock(0), '0:00');
    assert.equal(rec.formatClock(65.9), '1:05');
    assert.equal(rec.formatClock(600), '10:00');
  });
});

describe('הזרימה במסך (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן' }, () => {
  let w;
  let form;
  const $ = (s) => document.querySelector(s);
  const until = async (fn, label) => {
    for (let i = 0; i < 400; i += 1) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 5));
    }
    assert.fail(`לא קרה: ${label}`);
  };

  before(async () => {
    register('./helpers/cdn-stub-hooks.mjs', import.meta.url);
    installStub();
    const { JSDOM } = require(JSDOM_PATH);
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const dom = new JSDOM(html, { url: 'https://mayakislev-ux.github.io/maya-content-ideas/', pretendToBeVisual: true });
    w = dom.window;
    w.scrollTo = () => {};
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    class FakeRecorder {
      static isTypeSupported(t) { return t === 'audio/webm;codecs=opus'; }
      constructor(stream, opts) { this.mimeType = (opts && opts.mimeType) || 'audio/webm'; this.state = 'inactive'; FakeRecorder.last = this; }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable({ data: new w.Blob(['x'.repeat(2000)], { type: this.mimeType }) });
        setTimeout(() => this.onstop && this.onstop(), 0);
      }
    }
    w.MediaRecorder = FakeRecorder;
    const stopped = [];
    Object.defineProperty(w.navigator, 'mediaDevices', {
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => stopped.push(1) }] }) },
      configurable: true,
    });
    for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent',
      'KeyboardEvent', 'MouseEvent', 'sessionStorage', 'localStorage', 'getComputedStyle', 'requestAnimationFrame',
      'cancelAnimationFrame', 'history', 'location', 'DocumentFragment', 'HTMLTextAreaElement', 'HTMLInputElement',
      'MutationObserver', 'MediaRecorder', 'Blob']) {
      Object.defineProperty(globalThis, k, { value: k === 'window' ? w : w[k], configurable: true, writable: true });
    }
    (await import('../js/confirm-dialog.js')).wireConfirmDialog();
    form = await import('../js/idea-form.js');
    form.wireIdeaForm();
  });

  test('הקלטה -> רעיונות -> הורדת סימון -> שמירה של מה שנבחר בלבד', async () => {
    form.openAddModal();
    const entry = $('#rec-entry');
    assert.ok(entry, 'אין כפתור הקלטה בטופס');
    assert.equal(entry.hidden, false);
    assert.match(entry.textContent, /לספר בקול ולמצוא רעיונות/);
    entry.click();
    assert.equal($('#recorder-modal').hidden, false);
    $('#rec-start-btn').click();
    await until(() => !$('#rec-step-recording').hidden, 'מסך ההקלטה');
    nextResult = { ideas: [
      { title: 'לקוחה שאלה למה המחיר גבוה', context: 'בשיחה היום', category: 'מכירתי', persuasionStage: '', audienceScope: 'עיקרי', rating: '🔥 חייב לצלם' },
      { title: 'הטעות בסטורי', context: '', category: 'בעל ערך', persuasionStage: '', audienceScope: 'רחב', rating: '⭐ שווה לצלם' },
    ] };
    $('#rec-stop-btn').click();
    await until(() => !$('#rec-step-results').hidden, 'מסך התוצאות');
    assert.equal(uploads.length, 1);
    assert.match(uploads[0].path, /^transcribeUploads\/u1\/[a-z0-9]+-[a-z0-9]+\.webm$/);
    assert.equal(uploads[0].type, 'audio/webm');
    assert.deepEqual(calls.at(-1), { name: 'ideasFromRecording', payload: { path: uploads[0].path } });
    assert.equal(document.querySelectorAll('.rec-item').length, 2);
    assert.equal($('#rec-save-btn').textContent, 'לשמור 2 רעיונות');
    assert.match($('#rec-step-results').textContent, /🔥 חזק/);

    const second = $('#rec-keep-1');
    second.checked = false;
    second.dispatchEvent(new w.Event('change', { bubbles: true }));
    assert.equal($('#rec-save-btn').textContent, 'לשמור רעיון אחד');
    const title = document.querySelector('.rec-item__title');
    title.value = 'לקוחה שאלה למה המחיר שלי גבוה';
    title.dispatchEvent(new w.Event('input', { bubbles: true }));

    $('#rec-save-btn').click();
    await until(() => $('#recorder-modal').hidden, 'סגירה אחרי שמירה');
    assert.equal(added.length, 1);
    assert.equal(added[0].col, 'ideas');
    assert.equal(added[0].data.title, 'לקוחה שאלה למה המחיר שלי גבוה');
    assert.equal(added[0].data.category, 'מכירתי');
    assert.equal(added[0].data.hookText, 'בשיחה היום');
    assert.equal(added[0].data.rating, '🔥 חייב לצלם');
    assert.equal(added[0].data.audienceScope, 'עיקרי');
    assert.equal(added[0].data.source, 'הקלטה');
    assert.equal(added[0].data.ownerUid, 'u1');
    assert.equal($('#idea-modal').hidden, true);
  });

  test('במסך החדש (מאיה): בלי "🔥 חזק" ובלי לשמור דירוג, גם כשהשרת מחזיר אותו', async () => {
    const recMod = await import('../js/idea-recorder.js');
    recMod.setRecorderRatings(false);
    try {
      const before = added.length;
      recMod.openIdeasPopup({ progress: 'רגע...' });
      recMod.showIdeasInPopup([
        { title: 'רעיון חם מהבית', context: '', category: 'מכירתי', persuasionStage: '', audienceScope: 'עיקרי', rating: '🔥 חייב לצלם' },
      ], { source: 'הקלטה' });
      await until(() => !$('#rec-step-results').hidden, 'מסך התוצאות');
      assert.ok(!/🔥/.test($('#rec-step-results').textContent), 'תגית 🔥 חזק מוצגת');
      $('#rec-save-btn').click();
      await until(() => added.length > before, 'שמירה');
      assert.equal(added.at(-1).data.rating, '');
      assert.equal(added.at(-1).data.title, 'רעיון חם מהבית');
    } finally {
      recMod.setRecorderRatings(true);
      if (!$('#recorder-modal').hidden) $('#recorder-modal').hidden = true;
    }
  });

  test('שגיאה מהשרת מוצגת, ו"לנסות שוב" שולח את אותה הקלטה בלי להקליט מחדש', async () => {
    form.openAddModal();
    $('#rec-entry').click();
    $('#rec-start-btn').click();
    await until(() => !$('#rec-step-recording').hidden, 'מסך ההקלטה');
    nextResult = new Error('לא הצלחנו להקשיב להקלטה הפעם. לנסות שוב בעוד רגע');
    const before = calls.length;
    $('#rec-stop-btn').click();
    await until(() => !$('#rec-step-error').hidden, 'מסך שגיאה');
    assert.match($('#rec-error-text').textContent, /לא הצלחנו להקשיב/);
    assert.equal($('#rec-retry-btn').hidden, false);
    nextResult = { ideas: [] };
    $('#rec-retry-btn').click();
    await until(() => !$('#rec-step-results').hidden, 'תוצאות אחרי ניסיון חוזר');
    assert.equal(calls.length, before + 2);
    assert.match($('#rec-results-lead').textContent, /לא מצאנו בהקלטה רעיון/);
    assert.equal($('#rec-save-btn').hidden, true);
    $('#rec-close-results').click();
    await until(() => $('#recorder-modal').hidden, 'סגירה');
  });

  test('Escape בזמן הקלטה שואל לפני ביטול ולא מסתיר בשקט, ולחיצה כפולה פותחת מיקרופון אחד', async () => {
    form.openAddModal();
    $('#rec-entry').click();
    const gum = navigator.mediaDevices.getUserMedia;
    let opened = 0;
    navigator.mediaDevices.getUserMedia = async (...a) => { opened += 1; return gum(...a); };
    $('#rec-start-btn').click();
    $('#rec-start-btn').click();
    await until(() => !$('#rec-step-recording').hidden, 'מסך ההקלטה');
    await new Promise((r) => setTimeout(r, 20));
    navigator.mediaDevices.getUserMedia = gum;
    assert.equal(opened, 1, 'נפתחו שני מיקרופונים');
    const recModal = $('#recorder-modal');
    assert.ok(recModal.compareDocumentPosition($('#confirm-dialog')) & w.Node.DOCUMENT_POSITION_FOLLOWING,
      'חלון האישור חייב להיות אחרי חלון ההקלטה');
    document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(recModal.hidden, false, 'Escape הסתיר את ההקלטה והמיקרופון נשאר דולק');
    await until(() => !$('#confirm-dialog').hidden, 'שאלת ביטול');
    $('#confirm-dialog-ok').click();
    await until(() => recModal.hidden, 'סגירה אחרי אישור');
  });

  test('שמירה לא סוגרת טופס שכבר נכתב בו טקסט', async () => {
    form.openAddModal();
    $('#field-title').value = 'רעיון שהתחלתי לכתוב';
    $('#rec-entry').click();
    $('#rec-start-btn').click();
    await until(() => !$('#rec-step-recording').hidden, 'מסך ההקלטה');
    nextResult = { ideas: [{ title: 'רעיון מההקלטה', context: '', category: 'אישי', persuasionStage: '', audienceScope: 'רחב', rating: '⭐ שווה לצלם' }] };
    $('#rec-stop-btn').click();
    await until(() => !$('#rec-step-results').hidden, 'תוצאות');
    $('#rec-save-btn').click();
    await until(() => $('#recorder-modal').hidden, 'סגירת ההקלטה');
    assert.equal($('#idea-modal').hidden, false, 'הטופס עם הטקסט נסגר');
    assert.equal($('#field-title').value, 'רעיון שהתחלתי לכתוב');
  });

  test('בעריכת רעיון קיים אין כפתור הקלטה', () => {
    form.openEditModal({ id: 'x', title: 'רעיון', category: 'אישי', rating: '⭐ שווה לצלם' });
    assert.equal($('#rec-entry').hidden, true);
    form.openAddModal();
    assert.equal($('#rec-entry').hidden, false);
  });
});
