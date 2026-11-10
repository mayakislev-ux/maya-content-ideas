/* 04/11/2026 (מאיה), שתי בקשות:
   1. "צריך להחזיר את הצ'אט דיוק זווית הנגשה למוח השיווקי אבל רק לבנות שיש
      להן את האפליקציה המלאה... בתהליך היצירה מ-0, בחלק שכותבים רעיון ומסר".
   2. "לשכפול הסרטון" ליד כל רפרנס במאגר, שפותח את העוזר ישר בשכפול עם
      הלינק והתמלול.

   כאן הקוד האמיתי רץ ב-jsdom, על ה-index.html האמיתי, והבדיקה לוחצת על
   הכפתורים עצמם. Firebase מוחלף במאגר בזיכרון (test/helpers/cdn-stub-hooks.mjs).
   בדיקת מקור הייתה עוברת גם על כפתור שלא עושה כלום. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { register, createRequire } from 'node:module';
import { duplicationText, duplicationNotice, joinSegments, readyForHook } from '../js/reference-duplication.js';
import { INITIAL_STATE, nextStep } from '../js/video-assistant-flow.js';

/* ---------- הלוגיקה הטהורה: איזה טקסט נכנס, ומתי סומכים עליו ---------- */

const LONG = 'זה משפט ארוך מספיק כדי להיחשב דיבור של ממש בסרטון. '.repeat(4);

describe('איזה תמלול נכנס לשכפול', () => {
  test('כתוביות קודם: הן התיקון האחרון, ורק מה שנאמר', () => {
    const info = duplicationText(
      { audioKind: 'speech', sourceLanguage: 'he', transcriptHe: `כותרת מהמסך\n${LONG}` },
      [{ s: 0, e: 1, t: 'איך התעייפתי מלשים מסקרה,' }, { s: 1, e: 2, t: ` ${LONG} ` }],
    );
    assert.equal(info.source, 'subtitles');
    assert.equal(info.reason, 'ok');
    assert.ok(info.text.startsWith('איך התעייפתי מלשים מסקרה, זה משפט'), info.text.slice(0, 40));
    assert.ok(!info.text.includes('כותרת מהמסך'));
  });

  test('בלי כתוביות: טקסט הקריאה, ובסרטון זר זה התרגום', () => {
    const he = duplicationText({ audioKind: 'speech', sourceLanguage: 'he', transcriptHe: LONG, translationHe: 'x' }, null);
    assert.equal(he.source, 'text');
    assert.equal(he.text, LONG.trim());
    const ru = duplicationText({ audioKind: 'speech', sourceLanguage: 'ru', translationHe: LONG, transcript: 'по-русски' }, []);
    assert.equal(ru.text, LONG.trim());
    assert.equal(ru.foreign, true);
    assert.match(duplicationNotice(ru).body, /תרגום אוטומטי לעברית/);
  });

  test('ויזואלי ושיר: אין תמלול, ומילות שיר לא נכנסות', () => {
    const silent = duplicationText({ audioKind: 'silent', transcriptHe: LONG }, null);
    assert.deepEqual([silent.text, silent.reason], ['', 'visual']);
    const song = duplicationText({ audioKind: 'song', sourceLanguage: 'en', translationHe: LONG }, [{ t: 'la la' }]);
    assert.deepEqual([song.text, song.reason], ['', 'song']);
    assert.match(duplicationNotice(silent).body, /לתאר כאן במילים שלכם/);
    assert.match(duplicationNotice(song).body, /מילים של שיר הן לא תוכן הסרטון/);
  });

  test('כמעט בלי דיבור: נכנס, אבל לא מדלגים עליו', () => {
    const info = duplicationText({ audioKind: 'speech', sourceLanguage: 'en' }, [{ t: 'זה בדיוק מה שרציתי.' }]);
    assert.equal(info.reason, 'short');
    assert.equal(readyForHook(info), false);
  });

  test('מדובר בלי שום טקסט: חסר, ולא ממציאים', () => {
    const info = duplicationText({ audioKind: 'speech', sourceLanguage: 'he', transcript: 'גולמי', transcriptSkipped: true }, null);
    assert.deepEqual([info.text, info.reason], ['', 'missing']);
    assert.match(duplicationNotice(info).body, /ג'מיני/);
  });

  test('כתוביות ריקות לא נחשבות', () => {
    assert.equal(joinSegments([{ t: '  ' }, {}, null]), '');
  });
});

describe('START_FROM_BANK במכונת המצבים', () => {
  const notice = { reason: 'ok', source: 'subtitles', foreign: false, text: LONG };
  test('תמלול טוב: ישר להוק, והחץ אחורה מוביל לתמלול ואז לפתיחה', () => {
    const busy = { ...INITIAL_STATE, branch: 'scratch', screen: 'scratch-hook', hook: 'ישן', history: [{ screen: 'opening' }] };
    let s = nextStep(busy, { type: 'START_FROM_BANK', link: 'https://x/1', transcript: LONG, ready: true, notice });
    assert.equal(s.screen, 'prompt1');
    assert.equal(s.branch, 'reference');
    assert.equal(s.hook, null, 'נשאר משהו מהסרטון הקודם');
    assert.equal(s.referenceLink, 'https://x/1');
    s = nextStep(s, { type: 'BACK' });
    assert.equal(s.screen, 'transcribe');
    assert.equal(s.transcript, LONG);
    assert.equal(s.referenceLink, 'https://x/1');
    s = nextStep(s, { type: 'BACK' });
    assert.equal(s.screen, 'opening');
  });

  test('בלי תמלול שאפשר לסמוך עליו: נוחתים על מסך התמלול', () => {
    const s = nextStep(INITIAL_STATE, { type: 'START_FROM_BANK', link: 'https://x/2', transcript: '', ready: false, notice: { ...notice, reason: 'visual', text: '' } });
    assert.equal(s.screen, 'transcribe');
    assert.equal(s.history.length, 1);
    const next = nextStep({ ...s, transcript: 'תיאור שלי' }, { type: 'CONFIRM_DONE' });
    assert.equal(next.screen, 'prompt1');
  });
});

/* ---------- לחיצות אמיתיות ב-jsdom ---------- */

const JSDOM_PATH = 'C:/dev/portal-sales/node_modules/jsdom/lib/api.js';
const hasJsdom = existsSync(JSDOM_PATH);

const store = new Map();
const calls = { fetch: [], extractOpeningHook: 0 };
let REPLY = '';
let HOLD = false;
const HELD = [];

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
    setDoc: async (ref, data, opts) => {
      const prev = opts && opts.merge ? (store.get(ref.path) || {}) : {};
      store.set(ref.path, structuredClone({ ...prev, ...data }));
    },
    getDocs: async (col) => {
      const prefix = `${col.path}/`;
      const docs = [...store.entries()]
        .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map(([k, v]) => ({ id: k.slice(prefix.length), data: () => structuredClone(v) }));
      return { docs, forEach: (f) => docs.forEach(f) };
    },
    onSnapshot: () => () => {},
    httpsCallable: (_f, name) => async (data) => {
      if (name === 'extractOpeningHook') {
        calls.extractOpeningHook += 1;
        return { data: { hook: String(data.transcript).split(',')[0] } };
      }
      return { data: {} };
    },
  };
}

function sseResponse(reply) {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ delta: reply })}\n\n`));
      c.enqueue(enc.encode(`data: ${JSON.stringify({ done: true, reply })}\n\n`));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const tick = async (n = 12) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setTimeout(r, 0)); };
async function until(fn, label, tries = 200) {
  for (let i = 0; i < tries; i += 1) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail(`לא קרה: ${label}`);
}

let $;
let mods;

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
    globalThis.fetch = async (url, opts) => {
      calls.fetch.push({ url, body: JSON.parse(opts.body) });
      /* מצב מושהה: התשובה יוצאת רק כשהבדיקה משחררת אותה */
      if (HOLD) return new Promise((resolve) => { HELD.push((reply) => resolve(sseResponse(reply))); });
      return sseResponse(REPLY);
    };
    w.HTMLMediaElement && (w.HTMLMediaElement.prototype.play = () => Promise.resolve());

    store.set('profiles/u1', { name: 'מיכל', pronoun: 'את', business: 'שיווק', primaryAudience: 'בעלות עסקים' });

    const ideaChat = await import('../js/idea-chat.js');
    const va = await import('../js/video-assistant.js');
    const insp = await import('../js/inspiration-view.js');
    const router = await import('../js/view-router.js');
    const feed = await import('../js/inspiration-feed.js');
    ideaChat.wireIdeaChat();
    va.wireVideoAssistantView();
    insp.wireInspirationView();
    mods = { ideaChat, va, insp, router, feed };
    $ = (sel) => document.querySelector(sel);
  });

  const visible = (id) => !document.getElementById(id).hidden;
  const type = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
  const setPlan = (plan) => { document.body.dataset.plan = plan; };

  async function openAssistantFresh() {
    store.delete('videoAssistantSessions/u1');
    mods.router.showView('video-assistant');
    $('#hub-link-video-assistant').click();
    await until(() => $('#va-idea-btn') || $('#va-start-over-btn'), 'מסך הפתיחה');
    if ($('#va-start-over-btn')) { $('#va-start-over-btn').click(); await until(() => $('#va-idea-btn'), 'פתיחה'); }
  }

  test('יצירה מ-0: הכפתור הבולט במסך הרעיון והמסר, בנוסח של מאיה', async () => {
    setPlan('full');
    await openAssistantFresh();
    $('#va-idea-btn').click();
    await until(() => $('#va-idea-sharp'), 'מסך הרעיון');
    const cta = $('.va-angle-cta');
    assert.ok(cta, 'אין את הקופסה');
    const text = cta.textContent.replace(/\s+/g, ' ');
    assert.match(text, /דיוק רעיון ממוקד, חזק וספציפי הוא הסוד לסרטון מוצלח/);
    assert.match(text, /רעיון לא מדויק יהרוס את כל הכתיבה/);
    assert.match(text, /לא בטוחים שהרעיון חזק\? לחצו כאן/);
    assert.match(text, /כל מה שתכתבו כאן נשמר אוטומטית/);
    assert.ok($('#va-angle-chat-btn').classList.contains('cosmic-btn--primary'), 'הכפתור קטן ולא בולט');
  });

  test('לחיצה: נשמר לפני שעוזבים, הצ׳אט נפתח עם מה שנכתב, וחוזרים עם הרעיון המדויק', async () => {
    calls.fetch.length = 0;
    REPLY = 'הרעיון רחב מדי, הנה ניסוח חד יותר.\n[[IDEA_SUMMARY]]3 טעויות שמבריחות לקוחות מהעמוד||השוואה||';
    const topic = $('#va-idea-sharp');
    const punch = $('#va-idea-punch');
    type(topic, 'למה הממומן לא עובד');
    type(punch, 'העמוד הוא זה שמוכר, לא המודעה');
    /* לוחצים מיד, לפני שהשמירה הרגילה (800ms) הספיקה לרוץ */
    $('#va-angle-chat-btn').click();
    await until(() => visible('chat-view'), 'הצ׳אט לא נפתח');

    const saved = store.get('videoAssistantSessions/u1');
    assert.ok(saved, 'הסשן לא נשמר לפני היציאה');
    assert.equal(saved.screen, 'idea-sharpen');
    assert.equal(saved.drafts['idea-sharpen|va-idea-sharp'], 'למה הממומן לא עובד');
    assert.equal(saved.drafts['idea-sharpen|va-idea-punch'], 'העמוד הוא זה שמוכר, לא המודעה');

    assert.ok(!visible('video-assistant-view'));
    assert.ok(visible('chat-back-to-assistant'), 'אין דרך ברורה לחזור');
    await until(() => calls.fetch.length === 1, 'לא נשלח לצ׳אט');
    const sent = calls.fetch[0].body.messages[0].content;
    assert.match(sent, /למה הממומן לא עובד/);
    assert.match(sent, /העמוד הוא זה שמוכר/);
    assert.match(calls.fetch[0].url, /checkIdea$/);

    await until(() => $('.chat-back-assistant-btn'), 'אין כפתור חזרה עם הרעיון');
    $('.chat-back-assistant-btn').click();
    await until(() => visible('video-assistant-view') && $('#va-idea-sharp'), 'לא חזרנו לעוזר');
    assert.ok(!visible('chat-view'));
    assert.equal($('#va-idea-sharp').value, '3 טעויות שמבריחות לקוחות מהעמוד');
    assert.equal($('#va-idea-punch').value, 'העמוד הוא זה שמוכר, לא המודעה', 'המסר נדרס');
    assert.ok(!visible('chat-back-to-assistant'));
  });

  test('הכפתור למעלה מחזיר בלי לשנות כלום', async () => {
    REPLY = 'שאלה: למי בדיוק זה מיועד?';
    type($('#va-idea-sharp'), 'נושא אחר');
    $('#va-angle-chat-btn').click();
    await until(() => visible('chat-view'), 'הצ׳אט לא נפתח');
    $('#chat-back-to-assistant').click();
    await until(() => visible('video-assistant-view') && $('#va-idea-sharp'), 'לא חזרנו');
    assert.equal($('#va-idea-sharp').value, 'נושא אחר');
  });

  /* סקירה, 04/11: חזרה לעוזר באמצע תשובה ופתיחה מחדש עם רעיון אחר. התשובה
     הישנה לא נכנסת לשיחה החדשה, ולא משחררת את התיבה באמצע התשובה החדשה. */
  test('תשובה ישנה שמגיעה אחרי שהתחילה שיחה חדשה לא נוגעת בה', async () => {
    HOLD = true;
    calls.fetch.length = 0;
    type($('#va-idea-sharp'), 'רעיון ראשון');
    $('#va-angle-chat-btn').click();
    await until(() => calls.fetch.length === 1, 'הבקשה הראשונה לא יצאה');
    $('#chat-back-to-assistant').click();
    await until(() => visible('video-assistant-view') && $('#va-idea-sharp'), 'לא חזרנו');
    type($('#va-idea-sharp'), 'רעיון שני');
    $('#va-angle-chat-btn').click();
    await until(() => calls.fetch.length === 2, 'הבקשה השנייה לא יצאה');
    assert.equal(calls.fetch[1].body.messages.length, 1, 'השיחה החדשה נשלחה עם היסטוריה ישנה');
    assert.match(calls.fetch[1].body.messages[0].content, /רעיון שני/);

    HELD.shift()('תשובה-ישנה-על-הרעיון-הראשון');
    await tick(30);
    assert.ok($('#chat-input').disabled, 'התשובה הישנה שחררה את התיבה באמצע התשובה החדשה');
    assert.ok(!$('#chat-messages').textContent.includes('תשובה-ישנה'), 'התשובה הישנה הופיעה בשיחה החדשה');

    HELD.shift()('תשובה על הרעיון השני');
    await until(() => !$('#chat-input').disabled, 'התיבה לא השתחררה בסוף');
    HOLD = false;
    REPLY = 'המשך';
    $('#chat-input').value = 'ועוד שאלה';
    $('#chat-form').requestSubmit();
    await until(() => calls.fetch.length === 3, 'ההודעה הבאה לא יצאה');
    const contents = calls.fetch[2].body.messages.map((m) => m.content);
    assert.equal(contents.length, 3, contents.join(' | '));
    assert.ok(!contents.some((c) => c.includes('תשובה-ישנה')), 'התשובה הישנה נכנסה להיסטוריה');
    await until(() => !$('#chat-input').disabled, 'התיבה נתקעה');
    $('#chat-back-to-assistant').click();
    await until(() => visible('video-assistant-view') && $('#va-idea-sharp'), 'לא חזרנו');
    type($('#va-idea-sharp'), 'נושא אחר');
    await until(() => store.get('videoAssistantSessions/u1').drafts['idea-sharpen|va-idea-sharp'] === 'נושא אחר', 'לא נשמר', 400);
  });

  test('רענון: העוזר נפתח שוב עם מה שנכתב', async () => {
    /* מודול טרי של העוזר, כמו אחרי טעינת דף, מול אותו סשן שמור */
    const before = store.get('videoAssistantSessions/u1');
    assert.equal(before.drafts['idea-sharpen|va-idea-sharp'], 'נושא אחר');
    const fresh = await import('../js/video-assistant.js?reload=1');
    const old = $('#hub-link-video-assistant');
    const clone = old.cloneNode(true);
    old.replaceWith(clone);
    fresh.wireVideoAssistantView();
    $('#video-assistant-screen').innerHTML = '';
    clone.click();
    await until(() => $('#va-idea-sharp'), 'הסשן לא שוחזר');
    assert.equal($('#va-idea-sharp').value, 'נושא אחר');
    assert.equal($('#va-idea-punch').value, 'העמוד הוא זה שמוכר, לא המודעה');
  });

  test('מנוי רפרנסים לא רואה את הצ׳אט, וגם קטע שצולם לא', async () => {
    setPlan('refs');
    await openAssistantFresh();
    $('#va-idea-btn').click();
    await until(() => $('#va-idea-sharp'), 'מסך הרעיון');
    assert.equal($('#va-angle-chat-btn'), null, 'מנוי רפרנסים רואה את הצ׳אט');
    setPlan('full');
    await openAssistantFresh();
    $('#va-footage-btn').click();
    await until(() => $('#va-relevance-ok-btn') || $('#va-idea-sharp') || $('h2'), 'קטע שצולם');
    assert.equal($('#va-angle-chat-btn'), null, 'הצ׳אט הופיע בקטע שצולם');
  });

  const BANK = {
    talk: { url: 'https://www.instagram.com/reel/TALK1/', platform: 'instagram', domain: 'שיווק', order: 1, contentSummary: 'הוק על טעויות בעמוד', audioKind: 'speech', sourceLanguage: 'he', transcriptHe: `טקסט קריאה ישן.\n${LONG}`, hasSubtitles: true, thumbnailUrl: '' },
    visual: { url: 'https://www.tiktok.com/@a/video/222', platform: 'tiktok', domain: 'שיווק', order: 2, audioKind: 'silent', sourceLanguage: 'he', transcript: '', thumbnailUrl: '' },
  };
  const SUBS = [{ s: 0, e: 2, t: 'שלוש טעויות שמבריחות לקוחות,' }, { s: 2, e: 9, t: LONG }];

  async function openBank() {
    for (const [id, v] of Object.entries(BANK)) store.set(`inspirationBank/${id}`, v);
    store.set('inspirationSubs/talk', { segments: SUBS });
    mods.router.showView('inspiration');
    mods.insp.openInspirationView();
    await until(() => document.querySelectorAll('.inspiration-card-dup-btn').length === 2, 'הכפתורים לא על הכרטיסים');
  }
  const cardOf = (url) => [...document.querySelectorAll('.inspiration-card')].find((c) => c.getAttribute('href') === url);

  for (const plan of ['full', 'refs']) {
    test(`מאגר ← "לשכפול הסרטון" ← מציאת הוק, עם הלינק והכתוביות (${plan})`, async () => {
      setPlan(plan);
      await openBank();
      const prevScript = (store.get('videoAssistantSessions/u1') || {}).scriptId;
      const btn = cardOf(BANK.talk.url).querySelector('.inspiration-card-dup-btn');
      assert.equal(btn.textContent, '🎬 לשכפול הסרטון');
      btn.click();
      await until(() => visible('video-assistant-view') && $('#va-hook-input'), 'לא נחת על מציאת ההוק');
      assert.ok(!visible('inspiration-view'));
      assert.match($('.va-bank-notice').textContent, /התמלול הגיע מהמאגר/);
      assert.match($('.va-bank-notice').textContent, /עלול להכיל טעויות/);
      assert.match($('.cosmic-context-box').textContent, /שלוש טעויות שמבריחות לקוחות/);

      const saved = store.get('videoAssistantSessions/u1');
      assert.equal(saved.branch, 'reference');
      assert.equal(saved.referenceLink, BANK.talk.url);
      assert.equal(saved.transcript, joinSegments(SUBS));
      assert.ok(!saved.transcript.includes('טקסט קריאה ישן'), 'נלקח טקסט הקריאה במקום הכתוביות');
      if (prevScript) assert.notEqual(saved.scriptId, prevScript, 'השכפול נשמר על הסרטון הקודם');

      $('#va-bank-edit-link').click();
      await until(() => $('#va-transcript-input'), 'לא חזר למסך התמלול');
      assert.equal($('#va-transcript-input').value, joinSegments(SUBS));
      assert.equal($('#va-reference-link').value, BANK.talk.url);
    });
  }

  test('סרטון ויזואלי: נוחת על מסך התמלול, ריק, עם הסבר לתאר במילים', async () => {
    setPlan('refs');
    await openBank();
    cardOf(BANK.visual.url).querySelector('.inspiration-card-dup-btn').click();
    /* המסך הקודם (מהבדיקה שלפני) הוא גם מסך תמלול, ולכן מחכים לזה של הסרטון הזה */
    await until(() => visible('video-assistant-view') && $('#va-reference-link') && $('#va-reference-link').value === BANK.visual.url, 'לא נחת על מסך התמלול');
    assert.equal($('#va-transcript-input').value, '');
    assert.equal($('#va-reference-link').value, BANK.visual.url);
    assert.match($('.va-bank-notice').textContent, /ויזואלי, בלי דיבור/);
    assert.match($('#va-transcript-input').getAttribute('placeholder'), /לתאר/);
    $('#va-transcribe-done-btn').click();
    await tick();
    assert.ok($('#va-transcript-input'), 'אפשר היה להמשיך בלי תיאור');
    type($('#va-transcript-input'), 'פותחת עם כיתוב "3 טעויות", מראה עמוד לפני ואחרי');
    $('#va-transcribe-done-btn').click();
    await until(() => $('#va-hook-input'), 'לא המשיך להוק');
    assert.equal($('.va-bank-notice'), null, 'ההודעה על תמלול מהמאגר מופיעה על תיאור שהיא כתבה');
  });

  /* סקירה, 04/11: לחיצה כפולה יצרה שני שכפולים ופריט יתום "סרטון בלי שם". */
  test('לחיצה כפולה: שכפול אחד, הכפתור אומר שזה נפתח, ולפריט יש שם', async () => {
    setPlan('full');
    await openBank();
    const items = () => [...store.keys()].filter((k) => k.startsWith('videoAssistantScripts/u1/items/'));
    const before = items().length;
    const btn = cardOf(BANK.talk.url).querySelector('.inspiration-card-dup-btn');
    btn.click();
    assert.ok(btn.disabled, 'הכפתור לא ננעל');
    assert.equal(btn.textContent, 'פותחים…');
    btn.click();
    /* גם קריאה ישירה (כמו ממצב גלילה) בזמן שהראשונה רצה לא פותחת שנייה */
    mods.va.duplicateFromBank(BANK.visual, {});
    await until(() => $('#va-hook-input') && !btn.disabled, 'השכפול לא נפתח');
    await tick(30);
    const added = items().slice(before);
    assert.equal(items().length - before, 1, `נוצרו ${items().length - before} פריטים`);
    const title = store.get(added[0] || items().at(-1)).title;
    assert.equal(title, 'שכפול: הוק על טעויות בעמוד', title);
    assert.equal(btn.textContent, '🎬 לשכפול הסרטון');
  });

  test('מצב גלילה: הכפתור סוגר את הגלילה ומעביר את הסרטון', async () => {
    const got = [];
    mods.feed.openFeed([BANK.talk], 0, { onDuplicate: (v) => got.push(v) });
    await until(() => $('.feed-dup'), 'אין כפתור במצב גלילה');
    $('.feed-dup').click();
    assert.equal(got.length, 1);
    assert.equal(got[0].url, BANK.talk.url);
    assert.equal(document.getElementById('inspiration-feed'), null, 'הגלילה נשארה פתוחה מעל העוזר');
  });
  /* ---------- 04/11/2026, סבב שני של מאיה על הצ'אט ---------- */

  const greeting = () => {
    const first = $('#chat-messages .chat-bubble-assistant');
    return first ? first.textContent : '';
  };

  test('מרכז הלמידה: כרטיס "צ׳אט לבדיקת רעיון", ופתיחה בלי הטיפ', async () => {
    setPlan('full');
    mods.router.showView('guide');
    const card = $('#hub-link-idea-chat');
    assert.ok(card, 'אין כרטיס במרכז הלמידה');
    assert.match(card.textContent, /צ'אט לבדיקת רעיון/);
    assert.doesNotMatch(card.textContent, /זווית הנגשה|דיוק זווית/, 'השם עדיין מדבר על זווית');
    assert.ok(card.classList.contains('hub-full-only'));
    calls.fetch.length = 0;
    card.click();
    await until(() => visible('chat-view') && greeting(), 'הצ׳אט לא נפתח מהמרכז');
    assert.equal(greeting(), 'מיכל, רשמי לי מה הרעיון שלך ואדייק אותך.');
    assert.equal(calls.fetch.length, 0, 'נשלח משהו לפני שכתבה רעיון');
    assert.match($('.chat-view-title').textContent, /צ'אט לבדיקת רעיון/);
    const img = $('#chat-messages .chat-avatar');
    assert.equal(img.tagName, 'IMG', 'עדיין הרובוט');
    assert.equal(img.getAttribute('src'), 'assets/maya-head-160.webp');
    assert.match(img.getAttribute('srcset'), /maya-head-320\.webp 2x/);
    assert.ok(existsSync(new URL('../assets/maya-head-160.webp', import.meta.url)));
    assert.ok(existsSync(new URL('../assets/maya-head-320.webp', import.meta.url)));

    const back = $('#chat-back-to-assistant');
    assert.ok(!back.hidden);
    assert.match(back.textContent, /חזרה למרכז למידה/);
    back.click();
    assert.ok(visible('guide-view'), 'החזרה לא הובילה למרכז הלמידה');
    assert.ok(!visible('chat-view'));
  });

  test('מנוי רפרנסים: הכרטיס מוסתר, ולחיצה לא פותחת את הצ׳אט', async () => {
    const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
    assert.match(css, /body\[data-plan="refs"\] \.hub-full-only \{ display: none !important; \}/);
    setPlan('refs');
    mods.router.showView('guide');
    $('#hub-link-idea-chat').click();
    await tick();
    assert.ok(!visible('chat-view'), 'מנוי רפרנסים נכנס לצ׳אט');
    setPlan('full');
  });

  const FINAL = 'מעולה, סגרנו.\n\n**הרעיון:** תלמידה שמפחדת לגבות מחיר מלא ועובדת חודשים בחינם\n**המסר האחד:** הלקוחה משלמת על התוצאה, לא על הוותק שלך\n**הזווית:** דעה לא פופולרית - לומר שוותק הוא לא הקריטריון\n**לקהל:** נשים שרק סיימו קורס\n\nזה רעיון עם עמדה. https://mayakislev-ux.github.io/lehiyot-brand/מפת-דרכים-ליצירת-תוכן.html\n[[IDEA_SUMMARY]]תלמידה שמפחדת לגבות מחיר מלא ועובדת חודשים בחינם||דעה לא פופולרית||||הלקוחה משלמת על התוצאה, לא על הוותק שלך';

  test('התוצאה הסופית: בלי כפתור מפת הדרכים, והרעיון והמסר חוזרים לעוזר', async () => {
    setPlan('full');
    await openAssistantFresh();
    $('#va-idea-btn').click();
    await until(() => $('#va-idea-sharp'), 'מסך הרעיון');
    type($('#va-idea-sharp'), 'ביטחון עצמי');
    type($('#va-idea-punch'), 'משהו כללי');
    REPLY = FINAL;
    const sentBefore = calls.fetch.length;
    $('#va-angle-chat-btn').click();
    await until(() => calls.fetch.length > sentBefore && visible('chat-view'), 'לא נשלח');
    await until(() => $('.chat-back-assistant-btn'), 'אין תוצאה סופית');
    const bubble = $('.chat-back-assistant-btn').closest('.chat-bubble');
    const buttons = [...bubble.querySelectorAll('button')].map((b) => b.textContent);
    assert.ok(!buttons.some((t) => t.includes('מפת הדרכים')), buttons.join(' | '));
    assert.equal(buttons.length, 2, buttons.join(' | '));
    assert.ok(!bubble.textContent.includes('IDEA_SUMMARY'));
    assert.match(bubble.textContent, /המסר האחד:/);
    assert.match($('#chat-back-to-assistant').textContent, /חזרה לעוזר ליצירת סרטון/);
    $('.chat-back-assistant-btn').click();
    await until(() => visible('video-assistant-view') && $('#va-idea-sharp'), 'לא חזרנו לעוזר');
    assert.equal($('#va-idea-sharp').value, 'תלמידה שמפחדת לגבות מחיר מלא ועובדת חודשים בחינם');
    assert.equal($('#va-idea-punch').value, 'הלקוחה משלמת על התוצאה, לא על הוותק שלך');
  });

  test('בלי השורה הטכנית: הרעיון והמסר נקראים מהסעיפים', async () => {
    type($('#va-idea-sharp'), 'משהו');
    REPLY = FINAL.split('[[IDEA_SUMMARY]]')[0];
    /* הבועה מהבדיקה הקודמת עוד יושבת בצ׳אט המוסתר, ולכן מחכים לבקשה החדשה */
    const sentBefore = calls.fetch.length;
    $('#va-angle-chat-btn').click();
    await until(() => calls.fetch.length > sentBefore && visible('chat-view'), 'לא נשלח');
    await until(() => $('.chat-back-assistant-btn'), 'אין כפתור חזרה בלי השורה הטכנית');
    $('.chat-back-assistant-btn').click();
    await until(() => visible('video-assistant-view') && $('#va-idea-sharp'), 'לא חזרנו לעוזר');
    assert.equal($('#va-idea-sharp').value, 'תלמידה שמפחדת לגבות מחיר מלא ועובדת חודשים בחינם');
    assert.equal($('#va-idea-punch').value, 'הלקוחה משלמת על התוצאה, לא על הוותק שלך');
  });
});
