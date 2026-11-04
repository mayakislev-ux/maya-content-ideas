// 04/11/2026: "✨ תמלול מדויק" (transcribeReference). הבדיקות מריצות את
// הפונקציה האמיתית עם תלויות מדומות: הרשאה, מכסה, Storage, הורדה וג'מיני.
const test = require('node:test');
const assert = require('node:assert/strict');
const tr = require('./transcribe-reference');

class FakeHttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

/* ---------- לינקים ונתיבים ---------- */

test('לינקים: טיקטוק ואינסטגרם בכל הצורות שבמאגר, וכל השאר לא', () => {
  const ok = {
    'https://vt.tiktok.com/ZSqhV8jmX/': 'tiktok',
    'https://www.tiktok.com/@reutmukadesdvir/video/7608083398443207956': 'tiktok',
    'https://www.tiktok.com/@a.b/video/7608083398443207956?is_from_webapp=1': 'tiktok',
    'https://vm.tiktok.com/ZMabc123/': 'tiktok',
    'https://www.instagram.com/reel/DZsJ0i7ymDy/': 'instagram',
    'https://www.instagram.com/p/DW-2qXxDd_H/?igsh=abc': 'instagram',
    'https://instagram.com/someone/reel/DSXXTuKjK-P': 'instagram',
    'https://www.instagram.com/reels/DSXXTuKjK-P/': 'instagram',
  };
  for (const [url, platform] of Object.entries(ok)) {
    const link = tr.parseReferenceLink(url);
    assert.ok(link, url);
    assert.equal(link.platform, platform, url);
  }
  assert.equal(tr.parseReferenceLink('https://www.instagram.com/p/DW-2qXxDd_H/?x=1').code, 'DW-2qXxDd_H');
  for (const bad of ['', 'not a url', 'https://youtube.com/shorts/abc', 'https://www.instagram.com/someone/',
    'https://evil.com/www.tiktok.com/@a/video/1', 'https://www.tiktok.com/@a', 'file:///etc/passwd',
    'https://tiktok.com.evil.com/@a/video/1', 'https://www.instagram.com/stories/x/123/']) {
    assert.equal(tr.parseReferenceLink(bad), null, bad);
  }
  /* לא שולחים הלאה את שאר הכתובת (מעקב, פרמטרים) */
  assert.equal(tr.parseReferenceLink('https://www.tiktok.com/@a/video/123?q=1#x').url, 'https://www.tiktok.com/@a/video/123');
});

test('נתיב העלאה: רק בתיקייה של מי שקוראת, ורק שם קובץ פשוט', () => {
  assert.equal(tr.validUploadPath('transcribeUploads/u1/abc-123.mp4', 'u1'), true);
  assert.equal(tr.validUploadPath('transcribeUploads/u2/abc.mp4', 'u1'), false);
  assert.equal(tr.validUploadPath('transcribeUploads/u1/../u2/abc.mp4', 'u1'), false);
  assert.equal(tr.validUploadPath('transcribeUploads/u1/sub/abc.mp4', 'u1'), false);
  assert.equal(tr.validUploadPath('storyAssets/u1/abc.jpg', 'u1'), false);
  assert.equal(tr.validUploadPath('transcribeUploads/u1/', 'u1'), false);
  assert.equal(tr.validUploadPath(null, 'u1'), false);
  assert.equal(tr.validUploadPath('transcribeUploads/u1/a.mp4', ''), false);
});

test('אינסטגרם: כתובת הסרטון מתוך JSON שמקודד פעמיים בעמוד ההטמעה', () => {
  const html = String.raw`...{\"is_video\":true,\"video_url\":\"https:\\\/\\\/scontent.cdninstagram.com\\\/v\\\/a.mp4?efg=eyJ\\u00253D&oh=00_x\",\"x\":1}...`;
  assert.equal(tr.instagramVideoUrlFromEmbed(html), 'https://scontent.cdninstagram.com/v/a.mp4?efg=eyJ%3D&oh=00_x');
  assert.equal(tr.instagramVideoUrlFromEmbed('<html>no video</html>'), null);
  assert.equal(tr.instagramVideoUrlFromEmbed(String.raw`\"video_url\":\"javascript:alert(1)\"`), null);
});

/* ---------- ההורדה, עם fetch מדומה ---------- */

function res(status, body, headers = {}) {
  const h = new Map(Object.entries(headers));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => h.get(k.toLowerCase()) || null, getSetCookie: () => headers['set-cookie'] ? [headers['set-cookie']] : [] },
    text: async () => String(body),
    json: async () => JSON.parse(body),
    arrayBuffer: async () => (Buffer.isBuffer(body) ? body : Buffer.from(String(body))),
  };
}

test('טיקטוק: מהעמוד לכתובת הקובץ, עם העוגיות של העמוד', async () => {
  const data = { __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct: { video: { playAddr: 'https://v16.tiktokcdn.com/v.mp4' } } } } } };
  const seen = [];
  const fetchImpl = async (url, opts) => {
    seen.push({ url, opts });
    if (url.includes('tiktok.com/@')) {
      return res(200, `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(data)}</script>`, { 'set-cookie': 'tt_chain_token=abc; Path=/' });
    }
    return res(200, Buffer.alloc(50000, 1), { 'content-type': 'video/mp4', 'content-length': '50000' });
  };
  const v = await tr.fetchTiktokVideo('https://www.tiktok.com/@a/video/1', fetchImpl);
  assert.equal(v.buffer.length, 50000);
  assert.equal(v.contentType, 'video/mp4');
  assert.equal(seen[1].url, 'https://v16.tiktokcdn.com/v.mp4');
  assert.equal(seen[1].opts.headers.cookie, 'tt_chain_token=abc');
});

test('הורדה: עמוד בלי נתונים, דף HTML במקום וידאו, וקובץ ענק נכשלים בבירור', async () => {
  await assert.rejects(tr.fetchTiktokVideo('https://www.tiktok.com/@a/video/1', async () => res(200, '<html></html>')), { name: 'LinkFetchError' });
  await assert.rejects(tr.fetchTiktokVideo('https://www.tiktok.com/@a/video/1', async () => res(403, 'blocked')), { name: 'LinkFetchError' });
  const embed = String.raw`\"video_url\":\"https:\\\/\\\/scontent.cdninstagram.com\\\/v.mp4\"`;
  const html = async (url) => (url.includes('/embed/') ? res(200, embed) : res(200, '<html>login</html>', { 'content-type': 'text/html' }));
  await assert.rejects(tr.fetchInstagramVideo('ABCDE', html), /not a video/);
  const huge = async (url) => (url.includes('/embed/') ? res(200, embed) : res(200, '', { 'content-type': 'video/mp4', 'content-length': String(300 * 1024 * 1024) }));
  await assert.rejects(tr.fetchInstagramVideo('ABCDE', huge), /too large/);

  /* זרם בלי content-length שעובר את התקרה: נעצר, ולא נקרא עד הסוף */
  const chunk = new Uint8Array(1024 * 1024);
  let reads = 0;
  const streaming = async (url) => {
    if (url.includes('/embed/')) return res(200, embed);
    const r = res(200, '', { 'content-type': 'video/mp4' });
    r.body = { getReader: () => ({ read: async () => { reads += 1; return { done: false, value: chunk }; }, cancel: async () => {} }) };
    return r;
  };
  await assert.rejects(tr.fetchInstagramVideo('ABCDE', streaming), /too large/);
  assert.ok(reads <= 202, `קרא ${reads} חתיכות במקום לעצור`);
});

test('מורידים רק משרתי הקבצים של הפלטפורמות, וב-https', async () => {
  assert.equal(tr.allowedVideoUrl('https://v16-webapp-prime.tiktok.com/video/x'), true);
  assert.equal(tr.allowedVideoUrl('https://instagram.ftlv5-1.fna.fbcdn.net/o1/v.mp4'), true);
  assert.equal(tr.allowedVideoUrl('https://scontent.cdninstagram.com/v.mp4'), true);
  assert.equal(tr.allowedVideoUrl('http://v16-webapp-prime.tiktok.com/x'), false, 'בלי https');
  assert.equal(tr.allowedVideoUrl('https://169.254.169.254/computeMetadata/v1/'), false);
  assert.equal(tr.allowedVideoUrl('https://eviltiktok.com/v.mp4'), false);
  assert.equal(tr.allowedVideoUrl('https://tiktok.com.evil.net/v.mp4'), false);

  const data = { __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct: { video: { playAddr: 'http://169.254.169.254/x' } } } } } };
  const page = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">${JSON.stringify(data)}</script>`;
  let internalFetched = false;
  await assert.rejects(tr.fetchTiktokVideo('https://www.tiktok.com/@a/video/1', async (url) => {
    if (url.includes('169.254')) internalFetched = true;
    return res(200, page);
  }), /not allowed/);
  assert.equal(internalFetched, false, 'הורד קובץ מכתובת פנימית');

  /* הלינק המקוצר הפנה לאתר אחר: עוצרים, ולא שולחים לשם עוגיות */
  const redirected = async () => ({ ...res(200, page), url: 'https://evil.example/page' });
  await assert.rejects(tr.fetchTiktokVideo('https://vt.tiktok.com/ZSabc/', redirected), /redirected/);
});

/* ---------- התשובה של ג'מיני ---------- */

test('JSON של ג\'מיני: מנורמל, סובל גדרות קוד, וזורק כשאין כלום', () => {
  const r = tr.parseGeminiResult('```json\n{"language":"RU","kind":"speech","spoken":"  Привет.  \\n\\n Как дела? ","spokenHe":"שלום.\\nמה שלומך со החומר?","onScreenText":["A","A"," ","B"],"scenes":["אחת"]}\n```');
  assert.equal(r.language, 'ru');
  assert.equal(r.spoken, 'Привет.\nКак дела?');
  assert.equal(r.spokenHe, 'שלום.\nמה שלומך עם החומר?', 'מילת יחס ברוסית נשארה בתרגום');
  assert.deepEqual(r.onScreenText, ['A', 'B']);
  const he = tr.parseGeminiResult('{"language":"iw","kind":"weird","spoken":"שלום לכולן","spokenHe":"x","onScreenText":[],"scenes":[]}');
  assert.equal(he.language, 'he');
  assert.equal(he.spokenHe, '', 'בעברית אין צורך בתרגום');
  assert.equal(he.kind, 'speech', 'סוג לא מוכר הופך לפי מה שיש');
  assert.throws(() => tr.parseGeminiResult('אני לא יכול לעזור'), /not json/);
  assert.throws(() => tr.parseGeminiResult('{"language":"none","kind":"music","spoken":"","spokenHe":"","onScreenText":[],"scenes":[]}'), /empty/);
  assert.throws(() => tr.parseGeminiResult('[1,2]'), /not json/);
});

test('הבקשה לג\'מיני: הסרטון מ-Storage, JSON לפי סכמה, והפרומפט מבקש את ארבעת החלקים', () => {
  const body = tr.geminiRequestBody({ fileUri: 'gs://b/transcribeUploads/u1/a.mp4', mimeType: 'video/quicktime' });
  assert.deepEqual(body.contents[0].parts[0], { fileData: { fileUri: 'gs://b/transcribeUploads/u1/a.mp4', mimeType: 'video/quicktime' } });
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(body.generationConfig.responseSchema.required, ['language', 'kind', 'spoken', 'spokenHe', 'onScreenText', 'scenes']);
  assert.match(tr.TRANSCRIBE_PROMPT, /verbatim/);
  assert.match(tr.TRANSCRIBE_PROMPT, /Song lyrics/);
  assert.match(tr.TRANSCRIBE_PROMPT, /Leave out subtitles or captions that only repeat the spoken words/);
  assert.match(tr.TRANSCRIBE_PROMPT, /scene by scene/);
});

test('עלות: לפי טוקנים, כולל טוקני חשיבה', () => {
  const c = tr.costUsd({ promptTokenCount: 1e6, candidatesTokenCount: 5e5, thoughtsTokenCount: 5e5 });
  assert.equal(Math.round(c * 100) / 100, 10.5);
  assert.equal(tr.costUsd(null), 0);
});

/* ---------- הפונקציה עצמה ---------- */

const GEMINI_OK = {
  candidates: [{ content: { parts: [{ text: JSON.stringify({ language: 'he', kind: 'speech', spoken: 'שלום לכולן, היום נדבר על לקוחות.', spokenHe: '', onScreenText: ['3 טעויות'], scenes: ['אישה מדברת למצלמה'] }) }] } }],
  usageMetadata: { promptTokenCount: 5000, candidatesTokenCount: 500, thoughtsTokenCount: 1500 },
};

function harness({ allow = true, limitHit = false, fetchFails = false, gemini = GEMINI_OK, geminiStatus = 200, meta = { size: '5000000', contentType: 'video/mp4' } } = {}) {
  const log = { checks: 0, increments: 0, saved: [], deleted: [], fetched: [], geminiCalls: [], usage: [] };
  const bucket = {
    name: 'test-bucket',
    file: (path) => ({
      save: async (buf, opts) => { log.saved.push({ path, size: buf.length, opts }); },
      delete: async () => { log.deleted.push(path); },
      getMetadata: async () => {
        if (!meta) throw new Error('404');
        return [meta];
      },
    }),
  };
  const deps = {
    HttpsError: FakeHttpsError,
    enforceAllowlist: async (email) => {
      if (!allow) throw new FakeHttpsError('permission-denied', 'המייל הזה לא רשום במערכת');
      assert.equal(email, 'client@example.com');
    },
    checkRate: async () => {
      log.checks += 1;
      if (limitHit) throw new FakeHttpsError('resource-exhausted', 'הגעת למכסת השימוש היומית ב-AI, נסו שוב מחר');
    },
    incrementRate: async () => { log.increments += 1; },
    bucket,
    fetchLinkVideo: async (link) => {
      log.fetched.push(link);
      if (fetchFails) throw new Error('instagram embed 429');
      return { buffer: Buffer.alloc(20000), contentType: 'video/mp4' };
    },
    fetchImpl: async (url, opts) => {
      log.geminiCalls.push({ url, body: JSON.parse(opts.body) });
      return res(geminiStatus, JSON.stringify(gemini));
    },
    getAccessToken: async () => 'tok',
    projectId: 'content-ideas-becd7',
    logUsage: async (uid, info) => { log.usage.push(info); },
  };
  return { handler: tr.createTranscribeHandler(deps), log };
}

const req = (data, auth = { uid: 'u1', token: { email: 'client@example.com' } }) => ({ auth, data });

test('בלי התחברות: נחסם לפני הכל', async () => {
  const { handler, log } = harness();
  await assert.rejects(handler({ data: { link: 'https://vt.tiktok.com/ZSqhV8jmX/' } }), { code: 'unauthenticated' });
  assert.equal(log.checks, 0);
});

test('מי שלא ברשימה (או שהמנוי שלה הסתיים): נחסם, ולא מוריד כלום', async () => {
  const { handler, log } = harness({ allow: false });
  await assert.rejects(handler(req({ link: 'https://vt.tiktok.com/ZSqhV8jmX/' })), { code: 'permission-denied' });
  assert.equal(log.fetched.length, 0);
});

test('בלי לינק ובלי קובץ, לינק שאינו טיקטוק/אינסטגרם, וקובץ של מישהי אחרת', async () => {
  const { handler, log } = harness();
  await assert.rejects(handler(req({})), { code: 'invalid-argument' });
  await assert.rejects(handler(req({ link: 'https://youtube.com/shorts/x' })), (err) => err.code === 'invalid-argument' && err.details.reason === 'unsupported-link');
  await assert.rejects(handler(req({ uploadPath: 'transcribeUploads/u2/a.mp4' })), { code: 'permission-denied' });
  await assert.rejects(handler(req({ uploadPath: 'storyAssets/u1/a.jpg' })), { code: 'permission-denied' });
  await assert.rejects(handler(req({ link: `https://vt.tiktok.com/${'a'.repeat(700)}/` })), { code: 'invalid-argument' });
  assert.equal(log.checks, 0, 'בקשה לא תקינה לא נוגעת במכסה');
  assert.equal(log.deleted.length, 0, 'קובץ של מישהי אחרת לא נמחק');
});

test('מכסה יומית: נחסם לפני שמורידים, ולא שולחים לג\'מיני', async () => {
  const { handler, log } = harness({ limitHit: true });
  await assert.rejects(handler(req({ link: 'https://vt.tiktok.com/ZSqhV8jmX/' })), { code: 'resource-exhausted' });
  assert.equal(log.fetched.length, 0);
  assert.equal(log.geminiCalls.length, 0);
  assert.equal(log.saved.length, 0);
  /* קובץ שהועלה ונחסם במכסה לא נשאר ב-Storage */
  const up = harness({ limitHit: true });
  await assert.rejects(up.handler(req({ uploadPath: 'transcribeUploads/u1/a.mp4' })), { code: 'resource-exhausted' });
  assert.deepEqual(up.log.deleted, ['transcribeUploads/u1/a.mp4']);
  assert.equal(up.log.geminiCalls.length, 0);
});

test('לינק שלא ירד: failed-precondition עם reason, בלי לספור במכסה', async () => {
  const { handler, log } = harness({ fetchFails: true });
  await assert.rejects(handler(req({ link: 'https://www.instagram.com/reel/DZsJ0i7ymDy/' })), (err) => {
    assert.equal(err.code, 'failed-precondition');
    assert.equal(err.details.reason, 'link-fetch');
    assert.match(err.message, /מאינסטגרם/);
    assert.match(err.message, /מהגלריה/);
    return true;
  });
  assert.equal(log.increments, 0);
  assert.equal(log.geminiCalls.length, 0);
});

test('לינק שעבד: נשמר זמנית בתיקייה שלה, ג\'מיני קורא משם, נספר פעם אחת ונמחק', async () => {
  const { handler, log } = harness();
  const out = await handler(req({ link: 'https://vt.tiktok.com/ZSqhV8jmX/' }));
  assert.equal(out.kind, 'speech');
  assert.equal(out.spoken, 'שלום לכולן, היום נדבר על לקוחות.');
  assert.deepEqual(out.onScreenText, ['3 טעויות']);
  assert.equal(out.source, 'tiktok');
  assert.equal(log.saved.length, 1);
  assert.match(log.saved[0].path, /^transcribeUploads\/u1\/link-[a-z0-9-]+\.mp4$/);
  const uri = log.geminiCalls[0].body.contents[0].parts[0].fileData.fileUri;
  assert.equal(uri, `gs://test-bucket/${log.saved[0].path}`);
  assert.match(log.geminiCalls[0].url, /aiplatform\.googleapis\.com\/v1\/projects\/content-ideas-becd7\/locations\/global\/publishers\/google\/models\/gemini-3\.5-flash:generateContent$/);
  assert.equal(log.increments, 1);
  assert.deepEqual(log.deleted, [log.saved[0].path]);
  assert.ok(log.usage[0].costUsd > 0);
});

test('קובץ שהועלה: נקרא מהתיקייה שלה ונמחק בסוף, גם כשג\'מיני נכשל', async () => {
  const ok = harness();
  const out = await ok.handler(req({ uploadPath: 'transcribeUploads/u1/abc.mov' }));
  assert.equal(out.source, 'upload');
  assert.equal(ok.log.saved.length, 0, 'קובץ שכבר הועלה לא נשמר שוב');
  assert.deepEqual(ok.log.deleted, ['transcribeUploads/u1/abc.mov']);

  const bad = harness({ geminiStatus: 500, gemini: { error: { message: 'boom' } } });
  await assert.rejects(bad.handler(req({ uploadPath: 'transcribeUploads/u1/abc.mov' })), { code: 'internal' });
  assert.deepEqual(bad.log.deleted, ['transcribeUploads/u1/abc.mov']);
  assert.equal(bad.log.increments, 0, 'כישלון לא נספר במכסה');

  const junk = harness({ gemini: { candidates: [{ content: { parts: [{ text: 'sorry' }] } }] } });
  await assert.rejects(junk.handler(req({ uploadPath: 'transcribeUploads/u1/abc.mov' })), { code: 'internal' });
  assert.equal(junk.log.increments, 0);
});

test('קובץ שהועלה: לא קיים, לא וידאו, או גדול מדי', async () => {
  const missing = harness({ meta: null });
  await assert.rejects(missing.handler(req({ uploadPath: 'transcribeUploads/u1/a.mp4' })), { code: 'not-found' });
  const notVideo = harness({ meta: { size: '100', contentType: 'image/jpeg' } });
  await assert.rejects(notVideo.handler(req({ uploadPath: 'transcribeUploads/u1/a.jpg' })), { code: 'invalid-argument' });
  assert.deepEqual(notVideo.log.deleted, ['transcribeUploads/u1/a.jpg']);
  const huge = harness({ meta: { size: String(250 * 1024 * 1024), contentType: 'video/mp4' } });
  await assert.rejects(huge.handler(req({ uploadPath: 'transcribeUploads/u1/a.mp4' })), { code: 'invalid-argument' });
  assert.equal(huge.log.geminiCalls.length, 0);
});
