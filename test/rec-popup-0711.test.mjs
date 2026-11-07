/* 07/11/2026 (מאיה), על "אין לי רעיון?" -> "ממה שקרה היום" -> "🎙️ לספר בקול":
   1. "הוא תימצת לי את הרעיון שאמרתי ממש בקצרה ואז אני אשכח מה אמרתי"
      -> לכל רעיון נשמרות המילים שלה (quote -> hookText), וכל התמלול.
   2. "תמחקי את השאלה שראיתי ברשת" (נבדק ב-no-idea.test.mjs).
   3. "המסך קופץ למעלה ולא קופץ פופאפ מסודר של המיקרופון"
      -> ההקלטה כולה בחלון: מיקרופון, שעון, הטקסט החי בתוך החלון, "סיימתי".
   4. "הקלטתי 1:30 על ניהול אנרגיה והוא פיצל ל-3... בתכלס זה רעיון 1"
      -> נושא אחד רציף = רעיון אחד. ו"✨ עוד כיוונים לאותו רעיון".
   5. "כפתור עם מלא שאלות, שפשוט יבחרו שאלה אחת ויענו וכבר יש רילס".

   השרת עם תלויות מדומות, והזרימה האמיתית ב-jsdom על index.html האמיתי. */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { register, createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ifr = require('../functions/ideas-from-recording.js');
const ifs = require('../functions/ideas-from-sources.js');

class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const TAXONOMY = {
  categories: ['בעל ערך', 'אישי', 'מכירתי'],
  categoryDefinitions: {},
  stages: ['שלב 1', 'שלב 2', 'שלב 3'],
  audienceScopes: ['עיקרי', 'משני', 'רחב'],
  strongRating: '🔥 חייב לצלם',
  normalRating: '⭐ שווה לצלם',
};
const req = (data) => ({ auth: { uid: 'u1', token: { email: 'a@b.c' } }, data });

/* ---------------- השרת: חילוץ הרעיונות ---------------- */

describe('ideasFromRecording: נושא אחד = רעיון אחד, והמילים שלה', () => {
  function makeDeps(payload) {
    const state = { gemini: [], committed: 0, released: 0 };
    const slot = async () => ({ commit: () => { state.committed += 1; }, release: async () => { state.released += 1; } });
    const deps = {
      HttpsError,
      enforceAllowlist: async () => {},
      checkRate: slot,
      checkTextRate: slot,
      bucket: { name: 'b', file: () => ({ getMetadata: async () => [{ size: 1000, contentType: 'audio/mp4' }], delete: async () => {} }) },
      getAccessToken: async () => 'tok',
      projectId: 'p',
      fetchImpl: async (url, opts) => {
        state.gemini.push(JSON.parse(opts.body));
        return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(payload) }] } }] }) };
      },
      taxonomy: TAXONOMY,
    };
    return { deps, state };
  }

  for (const source of ['text', 'audio']) {
    test(`הפרומפט (${source}): נושא רציף אחד הוא רעיון אחד, מפצלים רק במעבר ברור`, () => {
      const p = ifr.buildPrompt(TAXONOMY, { source });
      assert.match(p, /רעיון אחד = נושא אחד/);
      assert.match(p, /גם דקה או כמה דקות, עם כמה דוגמאות, טיפים, סיפורים/);
      assert.match(p, /זה רעיון אחד בלבד/);
      assert.match(p, /מפצלים לכמה רעיונות רק כשהדובר\/ת עובר\/ת בבירור לנושא אחר/);
      assert.match(p, /בספק, רעיון אחד/);
      /* הכלל הישן שגרם לפיצול */
      assert.doesNotMatch(p, /אם נאמרו כמה דברים שונים, כל אחד רעיון נפרד/);
      assert.doesNotMatch(p, /את כל הרעיונות לסרטוני/);
    });

    test(`הפרומפט (${source}): "quote" הוא הקטע שלה מילה במילה, לא תקציר`, () => {
      const p = ifr.buildPrompt(TAXONOMY, { source });
      assert.match(p, /"quote": המילים של הדובר\/ת עצמו\/ה/);
      assert.match(p, /מילה במילה ובאותו סדר/);
      assert.match(p, /מותר רק להוריד מילות מילוי/);
      assert.match(p, /אסור לסכם, לקצר, לנסח מחדש/);
      assert.match(p, /דקה וחצי, ה-"quote" הוא כל דקה וחצי הזאת/);
      assert.match(p, /"title": הרעיון במשפט אחד קצר/);
      assert.ok(!/[—–]/.test(p), 'מקף ארוך בפרומפט');
    });
  }

  test('השאלה שנבחרה נכנסת לפרומפט, והכותרת היא התשובה לשאלה', () => {
    const q = 'איזו עצה נפוצה בתחום שלך את/ה לא מסכים/ה איתה?';
    const p = ifr.buildPrompt(TAXONOMY, { source: 'text', question: q });
    assert.ok(p.includes(`השאלה: "${q}"`));
    assert.match(p, /הוא התשובה שלו\/ה לשאלה/);
    assert.doesNotMatch(ifr.buildPrompt(TAXONOMY, { source: 'text' }), /בחר\/ה שאלה וענה\/תה עליה/);
  });

  test('טקסט + שאלה: השאלה מגיעה לג\'מיני, "quote" חוזר ונשמר, והסכמה מבקשת אותו', async () => {
    const quote = 'אז דיברתי היום על ניהול אנרגיה, שאני קמה בבוקר ובודקת קודם כל כמה כוח יש לי';
    const { deps, state } = makeDeps({ ideas: [
      { title: 'ניהול אנרגיה ולא ניהול זמן', quote: `  ${quote}  `, context: 'איך היא מתחילה את הבוקר', categoryIndex: 1, persuasionStageIndex: 1, audienceScopeIndex: 1 },
    ] });
    const out = await ifr.createIdeasFromRecordingHandler(deps)(req({ text: `אממ ${quote}`, question: 'מה למדת השבוע?' }));
    assert.equal(out.ideas.length, 1);
    assert.equal(out.ideas[0].quote, quote);
    assert.equal(out.ideas[0].title, 'ניהול אנרגיה ולא ניהול זמן');
    const body = state.gemini[0];
    assert.match(body.contents[0].parts[0].text, /השאלה: "מה למדת השבוע\?"/);
    assert.ok(body.generationConfig.responseSchema.properties.ideas.items.properties.quote, 'אין quote בסכמה');
    assert.equal(state.committed, 1);
  });

  test('הקלטה (audio) מקבלת גם את השאלה', async () => {
    const { deps, state } = makeDeps({ ideas: [] });
    await ifr.createIdeasFromRecordingHandler(deps)(req({ path: 'transcribeUploads/u1/a.m4a', question: 'מה הטעות הכי יקרה שעשית בעסק?' }));
    assert.match(state.gemini[0].contents[0].parts[1].text, /השאלה: "מה הטעות הכי יקרה שעשית בעסק\?"/);
  });

  test('רעיון בלי quote (שורה, צילום מסך) נשאר בדיוק כמו קודם, בלי שדה ריק', () => {
    const out = ifr.normalizeIdeas({ ideas: [{ title: 'א', context: 'ב', categoryIndex: 1 }] }, TAXONOMY);
    assert.ok(!('quote' in out[0]));
    const long = ifr.normalizeIdeas({ ideas: [{ title: 'א', quote: 'מ'.repeat(ifr.MAX_QUOTE_CHARS + 50), categoryIndex: 1 }] }, TAXONOMY);
    assert.equal(long[0].quote.length, ifr.MAX_QUOTE_CHARS);
    assert.ok(ifr.MAX_QUOTE_CHARS >= ifr.MAX_TEXT_CHARS, 'quote קצר מכל ההקלטה');
  });
});

/* ---------------- השרת: עוד כיוונים לאותו רעיון ---------------- */

describe('ideaAngles: אותו רעיון, עוד כיוונים', () => {
  function makeDeps(reply) {
    const state = { claude: [], committed: 0, released: 0 };
    const deps = {
      HttpsError,
      enforceAllowlist: async () => {},
      checkRate: async () => ({ commit: () => { state.committed += 1; }, release: async () => { state.released += 1; } }),
      callClaude: async (body) => {
        state.claude.push(body);
        if (reply instanceof Error) throw reply;
        return typeof reply === 'string' ? reply : JSON.stringify(reply);
      },
      getAudience: async () => '',
      actingUid: (uid, email, asUid) => asUid || uid,
    };
    return { deps, state };
  }

  test('מחזיר 3-5 כיוונים, נשען על הכותרת והמילים שלה, בלי prefill', async () => {
    const { deps, state } = makeDeps({ angles: [
      { angle: 'פרובוקטיבי', title: 'תפסיקו לנהל את היומן, תתחילו לנהל את הכוח' },
      { angle: 'סיפור אישי', title: 'הבוקר שבו הבנתי שאני בודקת כוח ולא שעות' },
      { angle: 'ניפוץ מיתוס', title: 'ניהול זמן לא יציל אתכם מעייפות' },
      { angle: 'עוצר גלילה', title: 'ניהול אנרגיה ולא ניהול זמן' },
      { angle: 'טעות נפוצה', title: 'הטעות: למלא את היום בלי לבדוק כמה כוח יש' },
      { angle: 'עוד', title: 'שישי שלא אמור להגיע' },
    ] });
    const out = await ifs.createIdeaAnglesHandler(deps)(req({ title: 'ניהול אנרגיה ולא ניהול זמן', quote: 'אני קמה ובודקת כמה כוח יש לי', question: 'מה למדת השבוע?' }));
    assert.equal(out.angles.length, 5, 'לא נחתך ל-5');
    assert.equal(out.angles.at(-1).title, 'שישי שלא אמור להגיע', 'הכותרת המקורית לא סוננה');
    assert.ok(!out.angles.some((a) => a.title === 'ניהול אנרגיה ולא ניהול זמן'));
    assert.deepEqual(out.angles[0], { angle: 'פרובוקטיבי', title: 'תפסיקו לנהל את היומן, תתחילו לנהל את הכוח' });
    const body = state.claude[0];
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages.at(-1).role, 'user', 'prefill: sonnet-5 דוחה הודעת assistant בסוף');
    const prompt = body.messages[0].content;
    assert.match(prompt, /הרעיון: "ניהול אנרגיה ולא ניהול זמן"/);
    assert.match(prompt, /אני קמה ובודקת כמה כוח יש לי/);
    assert.match(prompt, /השאלה שעליה ענה\/תה: "מה למדת השבוע\?"/);
    assert.match(prompt, /אותה טענה, אותו מסר ואותו נושא/);
    assert.match(prompt, /לא דימויים ומטאפורות שהמצאת/);
    assert.match(prompt, /לפחות כיוון אחד פרובוקטיבי או עוצר גלילה/);
    assert.match(prompt, /לשון רבים ניטרלית/);
    assert.ok(!/[—–]/.test(prompt));
    assert.equal(state.committed, 1);
  });

  test('בלי רעיון: נדחה לפני Claude. כשל או תשובה ריקה מחזירים את המקום במכסה', async () => {
    let m = makeDeps({ angles: [] });
    await assert.rejects(ifs.createIdeaAnglesHandler(m.deps)(req({ title: '  ' })), /חסר הרעיון/);
    assert.equal(m.state.claude.length, 0);
    await assert.rejects(ifs.createIdeaAnglesHandler(m.deps)(req({ title: 'רעיון' })), /לא יצאו כיוונים/);
    assert.equal(m.state.released, 1);
    m = makeDeps(new Error('boom'));
    await assert.rejects(ifs.createIdeaAnglesHandler(m.deps)(req({ title: 'רעיון' })), /לא הצלחנו להביא כיוונים/);
    assert.equal(m.state.released, 1);
    assert.equal(m.state.committed, 0);
  });

  test('index.js: ideaAngles מחובר, עם מכסה יומית, מנוי ותצוגה כלקוחה', () => {
    const index = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
    assert.match(index, /ideaAngles: \d+,/);
    const block = index.slice(index.indexOf('exports.ideaAngles'), index.indexOf('exports.readSheetSections'));
    assert.match(block, /createIdeaAnglesHandler/);
    assert.match(block, /reserveRateLimit\(uid, 'ideaAngles'\)/);
    assert.match(block, /enforceAllowlist/);
    assert.match(block, /actingUid/);
    assert.match(block, /claudeFor\('ideaAngles'\)/);
  });
});

/* ---------------- הדפדפן ---------------- */

const JSDOM_PATH = 'C:/dev/portal-sales/node_modules/jsdom/lib/api.js';
const hasJsdom = existsSync(JSDOM_PATH);

const added = [];
const updated = [];
const calls = [];
const handlers = {};
const uploads = new Map();

describe('"לספר בקול" בחלון (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן' }, () => {
  let w;
  let noIdea;
  let homeMic;
  let form;
  let scrolls = 0;
  const recorders = [];
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const until = async (fn, label, ms = 3000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 5));
    }
    assert.fail(`לא קרה: ${label}`);
  };

  before(async () => {
    register('./helpers/cdn-stub-hooks.mjs', import.meta.url);
    globalThis.__fbStub = {
      initializeApp: () => ({}),
      getAuth: () => ({ currentUser: { uid: 'u1', email: 'c@x.com' } }),
      getFirestore: () => ({}),
      getFunctions: () => ({}),
      enableIndexedDbPersistence: () => Promise.resolve(),
      collection: (_db, name) => ({ path: name }),
      doc: (_db, ...p) => ({ path: p.join('/') }),
      getDoc: async () => ({ exists: () => true, data: () => ({ sheetId: 'S1' }) }),
      query: (c) => c,
      where: () => ({}),
      onSnapshot: () => () => {},
      serverTimestamp: () => 'ts',
      addDoc: async (col, data) => { added.push({ col: col.path, data }); return { id: `n${added.length}` }; },
      updateDoc: async (ref, data) => { updated.push({ path: ref.path, data }); },
      getStorage: () => ({}),
      ref: (_s, path) => ({ path }),
      uploadBytesResumable: (r, blob) => {
        uploads.set(r.path, blob.size);
        return { on: (_e, _p, _err, done) => { setTimeout(done, 0); } };
      },
      httpsCallable: (_f, name) => async (payload) => {
        calls.push({ name, payload });
        const h = handlers[name];
        if (!h) throw new Error(`no handler for ${name}`);
        return { data: await h(payload) };
      },
    };
    const { JSDOM } = require(JSDOM_PATH);
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const dom = new JSDOM(html, { url: 'https://mayakislev-ux.github.io/maya-content-ideas/', pretendToBeVisual: true });
    w = dom.window;
    /* מאיה: "המסך קופץ למעלה". סופרים כל גלילה של המסך */
    w.scrollTo = () => { scrolls += 1; };
    w.HTMLElement.prototype.scrollIntoView = function scrollIntoView() { scrolls += 1; };
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    class FakeRecorder {
      static isTypeSupported(t) { return t === 'audio/mp4'; }
      constructor(stream, opts) {
        this.mimeType = (opts && opts.mimeType) || 'audio/mp4';
        this.state = 'inactive';
        this.n = recorders.length;
        recorders.push(this);
      }
      start() { this.state = 'recording'; }
      stop() {
        if (this.state === 'inactive') return;
        this.state = 'inactive';
        const size = 1000 + this.n;
        setTimeout(() => {
          this.ondataavailable({ data: new w.Blob(['x'.repeat(size)], { type: this.mimeType }) });
          if (this.onstop) this.onstop();
        }, 0);
      }
    }
    w.MediaRecorder = FakeRecorder;
    Object.defineProperty(w.navigator, 'mediaDevices', {
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
      configurable: true,
    });
    for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent',
      'KeyboardEvent', 'MouseEvent', 'sessionStorage', 'localStorage', 'getComputedStyle', 'requestAnimationFrame',
      'cancelAnimationFrame', 'history', 'location', 'DocumentFragment', 'HTMLTextAreaElement', 'HTMLInputElement',
      'MutationObserver', 'MediaRecorder', 'Blob', 'File', 'FileReader']) {
      Object.defineProperty(globalThis, k, { value: k === 'window' ? w : w[k], configurable: true, writable: true });
    }
    (await import('../js/confirm-dialog.js')).wireConfirmDialog();
    homeMic = await import('../js/home-mic.js');
    Object.assign(homeMic.TIMING, { fixedMs: 80, minMs: 50, maxMs: 120, tickMs: 10, finishWaitMs: 2000 });
    noIdea = await import('../js/no-idea.js');
    form = await import('../js/idea-form.js');
    form.wireIdeaForm();
    homeMic.wireHomeMic();
    noIdea.wireNoIdea({ getIdeas: () => [], loadBankVideos: async () => [] });
    noIdea.setNoIdeaHome(true);
    homeMic.setHomeMicVisible(true);
  });

  beforeEach(() => {
    delete w.webkitSpeechRecognition;
    delete globalThis.webkitSpeechRecognition;
    handlers.transcribeDictation = async ({ path }) => ({ text: `מילה${uploads.get(path) - 1000}` });
    recorders.length = 0;
  });

  function openSpeak() {
    $('#home-mic-card').click();
    $('#no-idea-record').click();
    assert.equal($('#rec-step-speak').hidden, false, 'חלון "לספר בקול" לא נפתח');
  }

  test('השאלות: 80 השאלות של מאיה, במילים ובסדר שלה, בלי מקף ארוך', async () => {
    const mod = await import('../js/reel-questions.js');
    const all = mod.REEL_QUESTIONS;
    assert.equal(noIdea.REEL_QUESTIONS, all);
    assert.equal(mod.REEL_QUESTIONS_TITLE, '80 שאלות ליצירת רילסים אישיים, מקצועיים ומבדלים');
    assert.equal(all.length, 80);
    assert.equal(new Set(all).size, 80, 'שאלה כפולה');
    for (const q of all) assert.ok(!/[—–]/.test(q), `מקף ארוך: ${q}`);
    /* הראשונה (המקף הוחלף בפסיק), השנייה, אחת מהאמצע והאחרונה, מילה במילה */
    assert.equal(all[0], 'איזה חלום או תוצאה שהלקוחות שלכם רוצים להשיג, אתם כבר השגתם בעצמכם? איך זה קרה?');
    assert.equal(all[1], 'איזו בעיה, תחושת תסכול או אמונה מגבילה שאתם מזהים אצל הלקוחות שלכם, חוויתם בעצמכם בעבר?');
    assert.equal(all[20], 'איזו טעות מקצועית עשיתם בתחילת הדרך והיום לא הייתם חוזרים עליה בשום מצב?');
    assert.equal(all[79], 'לאיזה אדם או לקוח אתם יודעים שאתם יכולים לעזור במיוחד, ולאיזה אדם השירות שלכם פשוט לא מתאים?');
  });

  test('אייפון: דלת -> חלון -> בוחרים שאלה -> מקליטים, הטקסט החי בתוך החלון -> "סיימתי" -> רעיון עם המילים שלה -> שמירה', async () => {
    const box = $('#quick-add-input');
    box.value = 'משהו שכתבתי קודם';
    scrolls = 0;
    openSpeak();
    /* לפני שמתחילים: שאלה של היום כברירת מחדל, ורשימת השאלות סגורה */
    assert.equal($('#rec-question').textContent, `💡 שאלה של היום: ${noIdea.promptOfDay()}`);
    assert.equal($('#rec-questions').hidden, true);
    assert.equal($('#rec-questions-btn').textContent, '💬 בחרו שאלה וענו עליה');
    $('#rec-questions-btn').click();
    assert.equal($('#rec-questions').hidden, false);
    assert.equal($('#rec-questions-btn').getAttribute('aria-expanded'), 'true');
    assert.deepEqual($$('.rec-questions__head').map((n) => n.textContent), ['80 שאלות ליצירת רילסים אישיים, מקצועיים ומבדלים']);
    const items = $$('.rec-questions__item');
    assert.equal(items.length, 80);
    assert.deepEqual(items.map((b) => b.textContent), noIdea.REEL_QUESTIONS.map((x, i) => `${i + 1}. ${x}`), 'הסדר שלה השתנה');
    /* חיפוש מסנן, בלי לשנות סדר */
    const search = $('#rec-questions-search');
    search.value = 'טעות מקצועית';
    search.dispatchEvent(new w.Event('input', { bubbles: true }));
    const shown = items.filter((b) => !b.parentElement.hidden);
    assert.equal(shown.length, 1);
    assert.equal($('.rec-questions__empty').hidden, true);
    search.value = 'זברה';
    search.dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.equal($('.rec-questions__empty').hidden, false);
    search.value = '';
    search.dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.equal(items.filter((b) => !b.parentElement.hidden).length, 80);
    const q = noIdea.REEL_QUESTIONS[20];
    shown[0].click();

    /* השאלה למעלה, ומקליטים בתוך אותו חלון */
    assert.equal($('#rec-step-live').hidden, false, 'בחירת שאלה לא התחילה הקלטה');
    assert.equal($('#rec-live-question').hidden, false);
    assert.equal($('#rec-live-question').textContent, `💬 ${q}`);
    assert.ok($('#rec-step-live .rec-mic--live'), 'אין מיקרופון גדול');
    assert.equal($('#rec-back-btn').hidden, true, '"חזרה" באמצע הקלטה משאיר מיקרופון פתוח');
    await until(() => !$('#rec-live-done').disabled, 'מוכן ל"סיימתי"');
    assert.match($('#rec-live-clock').textContent, /^0:0\d$/);
    await until(() => /מילה0 מילה1/.test($('#rec-live-text').textContent), 'טקסט חי בתוך החלון');
    assert.equal($('#rec-step-live').hidden, false, 'הטקסט הגיע רק אחרי שעצרו');
    assert.equal(box.value, 'משהו שכתבתי קודם', 'הטקסט החי נכתב לתיבה במסך הבית');
    assert.equal(box.readOnly, false);
    assert.equal($('#home-mic-card').classList.contains('home-mic-card--live'), false);
    assert.equal(scrolls, 0, 'המסך גלל');

    const quote = 'הטעות הכי יקרה שלי הייתה שלקחתי כל לקוח שהגיע, גם כשהרגשתי שזה לא מתאים';
    handlers.ideasFromRecording = async () => ({ ideas: [
      { title: 'לקחתי כל לקוח שהגיע', quote, context: 'הטעות הכי יקרה', category: 'אישי', persuasionStage: 'שלב 1', audienceScope: 'עיקרי', rating: '⭐ שווה לצלם' },
    ] });
    $('#rec-live-done').click();
    assert.equal($('#recorder-modal').hidden, false, 'החלון נסגר בין ההקלטה לתוצאות');
    assert.equal($('#rec-close-working').hidden, true, 'אפשר לסגור באמצע, ומה שנאמר הולך לאיבוד');
    await until(() => !$('#rec-step-results').hidden, 'התוצאות באותו חלון');
    const ask = calls.filter((c) => c.name === 'ideasFromRecording').at(-1);
    assert.equal(ask.payload.question, q, 'השאלה לא נשלחה לחילוץ');
    assert.match(ask.payload.text, /^מילה0 מילה1( מילה\d+)*$/);
    const spoken = ask.payload.text;
    assert.equal($('#rec-context-line').textContent, `💬 השאלה: ${q}`);

    /* המילים שלה מוצגות על הרעיון, וכל מה שנאמר זמין */
    assert.equal($$('#rec-list .rec-item').length, 1);
    assert.equal($('.rec-item__title').value, 'לקחתי כל לקוח שהגיע');
    assert.equal($('.rec-item__said-text').textContent, quote);
    assert.equal($('.rec-item__said').open, true);
    assert.equal($('#rec-transcript').hidden, false);
    assert.equal($('#rec-transcript-text').textContent, spoken);
    assert.equal($('#rec-to-box').hidden, false);

    const before = added.length;
    $('#rec-save-btn').click();
    await until(() => $('#recorder-modal').hidden, 'נשמר ונסגר');
    assert.equal(added.length, before + 1);
    const saved = added.at(-1).data;
    assert.equal(saved.title, 'לקחתי כל לקוח שהגיע', 'הכותרת הקצרה לא נשארה כותרת');
    assert.equal(saved.hookText, quote, 'המילים שלה לא נשמרו בפירוט');
    assert.equal(saved.transcript, spoken, 'כל התמלול לא נשמר');
    assert.equal(saved.sourceQuestion, q);
    assert.equal(saved.source, 'הקלטה');
    assert.equal(box.value, 'משהו שכתבתי קודם', 'השמירה נגעה בתיבה');
    assert.equal(scrolls, 0, 'המסך גלל');

    /* עריכת הרעיון: "מה אמרת" מתחת לכותרת, עם המילים שלה ועם כל ההקלטה */
    form.openEditModal({ id: 'i1', ...saved, persuasionStage: 'שלב 1', audienceScope: 'עיקרי' });
    assert.equal($('#field-said-wrap').hidden, false, 'אין "מה אמרת" בעריכה');
    assert.equal($('#field-said-label').textContent, '🗣️ מה אמרת');
    assert.equal($('#field-said').value, quote);
    assert.equal($('#field-transcript-wrap').hidden, false);
    assert.equal($('#field-transcript').textContent, spoken);
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.ok(html.indexOf('id="field-title"') < html.indexOf('id="field-said-wrap"'), '"מה אמרת" לא מתחת לכותרת');
    $('#field-said').value = `${quote}. ועוד משהו`;
    $('#idea-form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
    await until(() => updated.length > 0, 'שמירת העריכה');
    assert.equal(updated.at(-1).data.hookText, `${quote}. ועוד משהו`);
    /* רעיון בלי פירוט: אין בלוק, ושמירה לא נוגעת ב-hookText */
    form.openEditModal({ id: 'i2', title: 'רעיון רגיל', category: 'אישי', rating: '⭐ שווה לצלם' });
    assert.equal($('#field-said-wrap').hidden, true);
    form.closeModal();
  });

  test('רעיון יחיד בלי quote מקבל את כל מה שנאמר, ו"עוד כיוונים" מוסיף רעיונות מאותו רעיון', async () => {
    openSpeak();
    $('#rec-speak-go').click();
    await until(() => /מילה0/.test($('#rec-live-text').textContent), 'טקסט חי');
    handlers.ideasFromRecording = async () => ({ ideas: [
      { title: 'ניהול אנרגיה ולא ניהול זמן', context: 'על הבוקר', category: 'בעל ערך', persuasionStage: '', audienceScope: 'רחב', rating: '⭐ שווה לצלם' },
    ] });
    $('#rec-live-done').click();
    await until(() => !$('#rec-step-results').hidden, 'תוצאות');
    const ask = calls.filter((c) => c.name === 'ideasFromRecording').at(-1);
    assert.ok(!('question' in ask.payload), 'נשלחה שאלה שלא נבחרה');
    assert.equal($('.rec-item__said-text').textContent, ask.payload.text, 'רעיון יחיד בלי quote לא קיבל את הטקסט המלא');

    let release;
    handlers.ideaAngles = (payload) => new Promise((resolve) => {
      release = () => resolve({ angles: [
        { angle: 'פרובוקטיבי', title: 'תפסיקו לנהל את היומן' },
        { angle: 'ניפוץ מיתוס', title: 'ניהול זמן לא יציל אתכם' },
        { angle: 'סיפור אישי', title: 'הבוקר שבו הבנתי' },
      ] });
      return payload;
    });
    const btn = $('.rec-angles__btn');
    assert.equal(btn.textContent, '✨ עוד כיוונים לאותו רעיון');
    btn.click();
    await until(() => $('.rec-angles__btn').disabled, 'מצב טעינה');
    assert.equal($('.rec-angles__btn').textContent, 'מביאים כיוונים...');
    const call = calls.filter((c) => c.name === 'ideaAngles').at(-1);
    assert.equal(call.payload.title, 'ניהול אנרגיה ולא ניהול זמן');
    assert.equal(call.payload.quote, ask.payload.text, 'הכיוונים לא נשענים על המילים שלה');
    release();
    await until(() => $$('.rec-angles__item').length === 3, 'הכיוונים');
    assert.deepEqual($$('.rec-angles__item .rec-angles__title').map((n) => n.textContent),
      ['תפסיקו לנהל את היומן', 'ניהול זמן לא יציל אתכם', 'הבוקר שבו הבנתי']);

    $$('.rec-angles__add')[0].click();
    assert.equal($$('#rec-list > .rec-item').length, 2, 'הכיוון לא נוסף כרעיון');
    assert.equal($$('.rec-item__title')[1].value, 'תפסיקו לנהל את היומן');
    assert.ok($$('#rec-list > .rec-item')[1].querySelector('.rec-tag--angle'));
    assert.equal($$('.rec-angles__add')[0].disabled, true);
    assert.equal($('#rec-save-btn').textContent, 'לשמור 2 רעיונות');
    $$('.rec-angles__swap')[1].click();
    assert.equal($$('.rec-item__title')[0].value, 'ניהול זמן לא יציל אתכם');

    const before = added.length;
    $('#rec-save-btn').click();
    await until(() => $('#recorder-modal').hidden, 'שמירה');
    assert.equal(added.length, before + 2);
    assert.equal(added.at(-1).data.title, 'תפסיקו לנהל את היומן');
    assert.equal(added.at(-1).data.hookText, ask.payload.text, 'הכיוון לא שמר את המילים שלה');
  });

  test('כרום: זיהוי חי, הטקסט מופיע בחלון מיד, והתיבה לא נוגעת', async () => {
    const instances = [];
    class FakeSpeech {
      constructor() { instances.push(this); }
      start() {}
      stop() { setTimeout(() => this.onend && this.onend(), 0); }
      abort() {}
    }
    w.webkitSpeechRecognition = FakeSpeech;
    globalThis.webkitSpeechRecognition = FakeSpeech;
    $('#quick-add-input').value = '';
    openSpeak();
    $('#rec-speak-go').click();
    await until(() => instances.length === 1 && !$('#rec-live-done').disabled, 'הקלטה');
    const result = (t) => Object.assign([{ transcript: t }], { isFinal: true });
    instances[0].onresult({ results: [result('היום לקוחה שאלה')] });
    assert.equal($('#rec-live-text').textContent, 'היום לקוחה שאלה');
    assert.equal($('#rec-live-text').classList.contains('rec-live-text--empty'), false);
    assert.equal($('#quick-add-input').value, '');
    handlers.ideasFromRecording = async () => { throw new Error('לא הצלחנו למצוא רעיונות בטקסט הפעם. לנסות שוב בעוד רגע'); };
    $('#rec-live-done').click();
    await until(() => !$('#rec-step-error').hidden, 'שגיאה');
    /* מה שנאמר לא אבד: אפשר להעביר אותו לתיבה ולשמור כרעיון אחד */
    assert.match($('#rec-error-text').textContent, /מה שאמרת לא אבד/);
    assert.ok(!/נשאר בתיבה/.test($('#rec-error-text').textContent));
    assert.equal($('#rec-to-box-error').hidden, false);
    $('#rec-to-box-error').click();
    assert.equal($('#recorder-modal').hidden, true);
    assert.equal($('#quick-add-input').value, 'היום לקוחה שאלה');
  });

  test('ביטול באמצע: שואלים, עוצרים את המיקרופון, ולא שולחים כלום לרעיונות', async () => {
    openSpeak();
    $('#rec-speak-go').click();
    await until(() => !$('#rec-live-done').disabled, 'הקלטה');
    const asked = calls.filter((c) => c.name === 'ideasFromRecording').length;
    $('#rec-live-cancel').click();
    await until(() => !$('#confirm-dialog').hidden, 'שאלת אישור');
    $('#confirm-dialog-ok').click();
    await until(() => $('#recorder-modal').hidden, 'החלון נסגר');
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(recorders.every((r) => r.state === 'inactive'), true, 'הקלטה נשארה פתוחה');
    assert.equal(calls.filter((c) => c.name === 'ideasFromRecording').length, asked);
    assert.equal($('#recorder-modal').hidden, true, 'חלון נפתח שוב אחרי ביטול');
    /* "חזרה לדלתות" מלפני ההקלטה */
    openSpeak();
    $('#rec-back-btn').click();
    assert.equal($('#recorder-modal').hidden, true);
    assert.equal($('#no-idea-modal').hidden, false);
    $('#no-idea-close-btn').click();
  });

  test('בלי מקף ארוך, וה-CSS החדש רק עם טוקנים קיימים', () => {
    for (const f of ['../js/idea-recorder.js', '../js/home-mic.js', '../js/no-idea.js', '../js/idea-form.js']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      assert.ok(!/[—–]/.test(src), `מקף ארוך ב-${f}`);
    }
    const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
    const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    const block = css.slice(css.indexOf('ההקלטה בתוך החלון (js/idea-recorder.js)'));
    const end = block.indexOf('.rec-mic--live { animation: none; }');
    assert.ok(end > 0);
    const used = [...block.slice(0, end).matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);
    assert.ok(used.length > 5);
    assert.deepEqual(used.filter((v) => !defined.has(v)), []);
  });
});
