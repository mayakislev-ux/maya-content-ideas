# העוזר שלך ליצירת סרטון - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a guided, gamified "cosmic journey" wizard inside the content-ideas app ("המוח השיווקי") that walks a client step-by-step from "I have no idea" / "I have an idea" through to a finished, read-aloud-checked video script - without ever writing content for her, only guiding which existing tool to use next.

**Architecture:** Pure logic (domain-guess prompt, idea/reference picking, ChatGPT-prompt building, step state machine) lives in dependency-free modules, each with real `node --test` coverage. A thin Firestore store module and a DOM-rendering module wire the pure pieces together, following the exact patterns already used by `warming.js`/`story-table-render.js` in this same app (programmatic DOM building, no new build step, no new third-party libs).

**Tech Stack:** Vanilla JS ES modules (browser, via `<script type="module">`, Firebase v10.14.1 from `gstatic.com` CDN - already the app's only pattern), Firebase Functions v2 (`onCall`, existing `callAnthropic`/`getResponseText` helpers in `functions/index.js`), Firestore, Web Audio API (no audio files), `node --test` for pure-logic unit tests.

**Spec:** `docs/superpowers/specs/2026-10-13-video-creation-assistant-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `functions/video-assistant-domain-prompt.js` (new, CommonJS) | Pure: builds the one-time domain-guess AI prompt from persona text, parses the AI's JSON answer against the 6 canonical domains |
| `functions/index.js` (modify) | Add `exports.guessClientDomain` onCall, same pattern as existing `classifyIdea` |
| `js/video-assistant-picker.js` (new, pure ESM) | Pure: `pickIdea`, `pickReference` - random selection with no-immediate-repeat and format-weighting, zero Firebase imports so it's directly `import`-able in tests |
| `js/video-assistant-prompts.js` (new, pure ESM) | Pure: `buildDuplicationPrompt`, `buildScriptPrompt` - the two ChatGPT prompt templates, verbatim from the spec |
| `js/video-assistant-flow.js` (new, pure ESM) | Pure: `nextStep(state, action)` reducer - every screen transition for both branches |
| `js/video-assistant-store.js` (new) | Firestore IO: one-time `ideas` fetch, one-time `inspirationBank` fetch, session doc read/save, wraps `guessClientDomain` callable. Reuses `getProfile`/`saveProfile` from `user-profile.js` directly (not reimplemented) |
| `js/video-assistant-sound.js` (new) | Web Audio synth (`playReroll`, `playSuccess`), mute flag in `localStorage` |
| `js/video-assistant.js` (new) | `wireVideoAssistantView()` - renders each screen, wires every button, calls into the four modules above. Not unit-tested (matches `warming.js` convention), must pass `eslint src`-equivalent (`no-undef`) |
| `index.html` (modify) | New hub-action-card in `#guide-view`'s "🛠️ כלי עבודה" section; new `<main id="video-assistant-view" class="view cosmic-theme" hidden>` container |
| `js/view-router.js` (modify) | Add `'video-assistant'` to `VIEWS` |
| `js/app.js` (modify) | Wire the new hub card's click handler; call `wireVideoAssistantView()` at startup |
| `css/style.css` (modify) | New `.cosmic-*` classes for the dark/starfield/glow theme |
| `firestore.rules` (modify) | New `videoAssistantSessions/{uid}` rule, same shape as existing `storyTables/{uid}` |

---

## Task 1: Domain-guess prompt builder (pure, CommonJS)

**Files:**
- Create: `functions/video-assistant-domain-prompt.js`
- Test: `test/video-assistant-domain-prompt.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// test/video-assistant-domain-prompt.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DOMAINS, buildDomainGuessPrompt, parseDomainGuess } = require('../functions/video-assistant-domain-prompt.js');

test('DOMAINS has exactly the 6 canonical inspiration-bank domains', () => {
  assert.deepEqual(DOMAINS, [
    'יופי וקוסמטיקה',
    'בריאות נפשית, טיפול ורוח',
    'עסקים ויזמות',
    'עיצוב, נדל"ן ואדריכלות',
    'כושר ותזונה',
    'תוכן אישי וחיבור',
  ]);
});

test('buildDomainGuessPrompt includes the persona text and all 6 domains numbered', () => {
  const prompt = buildDomainGuessPrompt({ personaText: 'בחרתי בתחום הציפורניים ובניתי ממנו עסק' });
  assert.match(prompt, /בחרתי בתחום הציפורניים/);
  // plain substring checks, not regex - domain names contain literal
  // parentheses/quotes ('עיצוב, נדל"ן ואדריכלות') that would need fragile
  // escaping if built into a RegExp instead.
  DOMAINS.forEach((d, i) => assert.ok(prompt.includes(`${i + 1}. ${d}`), `missing numbered domain: ${i + 1}. ${d}`));
});

test('parseDomainGuess accepts a valid index and returns the domain name', () => {
  const result = parseDomainGuess('{"domainIndex": 1}');
  assert.equal(result, 'יופי וקוסמטיקה');
});

test('parseDomainGuess returns null on an out-of-range index instead of throwing', () => {
  assert.equal(parseDomainGuess('{"domainIndex": 99}'), null);
});

test('parseDomainGuess returns null on unparsable text instead of throwing', () => {
  assert.equal(parseDomainGuess('not json at all'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/dev/maya-content-ideas && node --test test/video-assistant-domain-prompt.test.mjs`
Expected: FAIL with "Cannot find module '../functions/video-assistant-domain-prompt.js'"

- [ ] **Step 3: Write the implementation**

```javascript
// functions/video-assistant-domain-prompt.js
// 13/10/2026: ניחוש חד-פעמי של תחום הלקוחה בכלי "העוזר ליצירת סרטון" -
// אין שדה "תחום" מובנה באף גיליון (זה טקסט חופשי בתוך הסיפור האישי), אז
// שולחים את הטקסט הזה ל-AI פעם אחת ושומרים את התשובה לצמיתות
// (profiles/{uid}.videoAssistantDomain). ראה docs/superpowers/specs/2026-10-13-video-creation-assistant-design.md

const DOMAINS = [
  'יופי וקוסמטיקה',
  'בריאות נפשית, טיפול ורוח',
  'עסקים ויזמות',
  'עיצוב, נדל"ן ואדריכלות',
  'כושר ותזונה',
  'תוכן אישי וחיבור',
];

function buildDomainGuessPrompt({ personaText }) {
  return `הטקסט הבא הוא הסיפור האישי/העסקי שכתבה לקוחה בגיליון העבודה שלה:

"${personaText}"

על סמך הטקסט הזה בלבד, באיזה תחום מתוך הרשימה הבאה היא עוסקת? בחר/י בדיוק אחד לפי המספר שלו:
${DOMAINS.map((d, i) => `${i + 1}. ${d}`).join('\n')}

השב/י אך ורק ב-JSON תקין, בלי שום טקסט נוסף לפני או אחרי:
{"domainIndex": <מספר בין 1 ל-${DOMAINS.length}>}`;
}

function parseDomainGuess(text) {
  let parsed;
  try {
    const match = String(text || '').match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : text);
  } catch {
    return null;
  }
  const index = Number(parsed.domainIndex);
  return DOMAINS[index - 1] || null;
}

module.exports = { DOMAINS, buildDomainGuessPrompt, parseDomainGuess };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd C:/dev/maya-content-ideas && node --test test/video-assistant-domain-prompt.test.mjs`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add functions/video-assistant-domain-prompt.js test/video-assistant-domain-prompt.test.mjs
git commit -m "feat: pure domain-guess prompt builder for video assistant"
```

---

## Task 2: Wire `guessClientDomain` Cloud Function

**Files:**
- Modify: `functions/index.js` (add new export, right after the existing `classifyIdea` export which ends around line 1010)

- [ ] **Step 1: Add the import at the top of `functions/index.js`, alongside the other same-style imports**

Find this existing line (around line 26):
```javascript
const { CATEGORIES, PERSUASION_STAGES, CATEGORY_DEFINITIONS, PERSUASION_STAGE_DEFINITIONS } = require('./ideas-constants');
```

Add immediately after it:
```javascript
const { buildDomainGuessPrompt, parseDomainGuess } = require('./video-assistant-domain-prompt');
```

- [ ] **Step 2: Add the new exported function right after the `classifyIdea` export (after its closing `});`, before the next comment block)**

```javascript
// "העוזר שלך ליצירת סרטון" - ניחוש חד-פעמי של תחום הלקוחה, ראה
// video-assistant-domain-prompt.js. נקראת פעם אחת לכל לקוחה, התוצאה
// נשמרת בצד הלקוח ב-profiles/{uid}.videoAssistantDomain - לא כאן.
exports.guessClientDomain = onCall({ secrets: [anthropicApiKey], region: 'us-central1', timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'יש להתחבר כדי להשתמש בתכונה הזו');
  }
  await enforceAllowlist(request.auth.token.email);

  const personaText = (request.data && request.data.personaText) || '';
  if (!personaText.trim()) {
    throw new HttpsError('invalid-argument', 'חסר טקסט לניחוש התחום');
  }
  assertMaxLength(personaText, 4000, 'הסיפור האישי');

  await enforceRateLimit(request.auth.uid, 'guessClientDomain');

  const prompt = buildDomainGuessPrompt({ personaText });
  const data = await callAnthropic(
    anthropicApiKey.value(),
    { model: 'claude-haiku-4-5-20251001', max_tokens: 100, messages: [{ role: 'user', content: prompt }] },
    'guessClientDomain'
  );
  const domain = parseDomainGuess(getResponseText(data));
  if (!domain) {
    throw new HttpsError('internal', 'לא הצלחתי לנחש את התחום, נסו שוב או בחרו ידנית');
  }
  return { domain };
});
```

- [ ] **Step 3: Verify the file still loads (no syntax error)**

Run: `cd C:/dev/maya-content-ideas/functions && node -e "const idx = require('./index.js'); console.log(typeof idx.guessClientDomain)"`
Expected output: `function`

- [ ] **Step 4: Commit**

```bash
cd C:/dev/maya-content-ideas
git add functions/index.js
git commit -m "feat: wire guessClientDomain Cloud Function"
```

---

## Task 3: Pure idea/reference picker

**Files:**
- Create: `js/video-assistant-picker.js`
- Test: `test/video-assistant-picker.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// test/video-assistant-picker.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickIdea, pickReference } from '../js/video-assistant-picker.js';

const IDEAS = [
  { id: 'a', title: 'רעיון א', hookText: 'הוק א', rating: 3 },
  { id: 'b', title: 'רעיון ב', hookText: 'הוק ב', rating: 5 },
  { id: 'c', title: 'רעיון ג', hookText: '', rating: 5 },
  { id: 'd', title: 'רעיון ד', hookText: 'הוק ד', rating: 1, deletedAt: { seconds: 1 } },
  { id: 'e', title: 'רעיון ה', hookText: 'הוק ה', rating: 4, completedAt: { seconds: 1 } },
];

test('pickIdea excludes deleted and completed ideas, and ideas with no hookText', () => {
  for (let i = 0; i < 20; i++) {
    const picked = pickIdea(IDEAS, null);
    assert.ok(['a', 'b'].includes(picked.id), `unexpected pick: ${picked.id}`);
  }
});

test('pickIdea never repeats the excluded id when another option exists', () => {
  for (let i = 0; i < 20; i++) {
    assert.equal(pickIdea(IDEAS, 'a').id, 'b');
  }
});

test('pickIdea returns null when nothing is eligible', () => {
  assert.equal(pickIdea([], null), null);
  assert.equal(pickIdea([IDEAS[3], IDEAS[4]], null), null);
});

const VIDEOS = [
  { id: 'v1', domain: 'יופי וקוסמטיקה', formatTags: ['סיפור אישי'] },
  { id: 'v2', domain: 'יופי וקוסמטיקה', formatTags: ['לפני ואחרי'] },
  { id: 'v3', domain: 'כושר ותזונה', formatTags: ['סיפור אישי'] },
];

test('pickReference only returns videos from the requested domain', () => {
  for (let i = 0; i < 20; i++) {
    assert.equal(pickReference(VIDEOS, 'יופי וקוסמטיקה', null).domain, 'יופי וקוסמטיקה');
  }
});

test('pickReference prefers easy-to-transcribe formats when both exist in-domain', () => {
  for (let i = 0; i < 20; i++) {
    assert.equal(pickReference(VIDEOS, 'יופי וקוסמטיקה', null).id, 'v1');
  }
});

test('pickReference falls back to any in-domain video if no preferred-format video is left', () => {
  assert.equal(pickReference(VIDEOS, 'יופי וקוסמטיקה', 'v1').id, 'v2');
});

test('pickReference never repeats the excluded id when another option exists', () => {
  for (let i = 0; i < 20; i++) {
    assert.equal(pickReference(VIDEOS, 'כושר ותזונה', 'v3'), null); // only one video in this domain
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/dev/maya-content-ideas && node --test test/video-assistant-picker.test.mjs`
Expected: FAIL with "Cannot find module '../js/video-assistant-picker.js'"

- [ ] **Step 3: Write the implementation**

```javascript
// js/video-assistant-picker.js
// 13/10/2026: בחירה אקראית ללא חזרה מיידית, לשני המסלולים של "אין לי
// רעיון". קובץ ללא שום import של Firebase בכוונה - כך הוא ניתן ל-import
// ישיר בבדיקה (ראה test/video-assistant-picker.test.mjs), באותה שיטה
// שפונקציות טהורות ב-functions/ נבדקות דרך require().

const EASY_FORMATS = ['סיפור אישי', 'טיפים או רשימה', 'הדגמה או הוראה', 'שאלות ותשובות'];

function pickFrom(list, excludeId) {
  if (!list.length) return null;
  const withoutExcluded = list.filter((item) => item.id !== excludeId);
  const pool = withoutExcluded.length ? withoutExcluded : list;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** רעיון אחד מתוך בנק הרעיונות שלה - רק כאלה עם הוק ממשי, לא מחוקים/גמורים */
export function pickIdea(ideas, excludeId) {
  const eligible = (ideas || []).filter(
    (idea) => idea && idea.hookText && idea.hookText.trim() && !idea.deletedAt && !idea.completedAt
  );
  return pickFrom(eligible, excludeId);
}

/** רפרנס אחד מהתחום שלה - עדיפות לפורמטים קלים לתמלול מילולי */
export function pickReference(videos, domain, excludeId) {
  const inDomain = (videos || []).filter((v) => v && v.domain === domain);
  const easy = inDomain.filter((v) => Array.isArray(v.formatTags) && v.formatTags.some((f) => EASY_FORMATS.includes(f)));
  const pool = easy.length ? easy : inDomain;
  return pickFrom(pool, excludeId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd C:/dev/maya-content-ideas && node --test test/video-assistant-picker.test.mjs`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add js/video-assistant-picker.js test/video-assistant-picker.test.mjs
git commit -m "feat: pure idea/reference picker for video assistant"
```

---

## Task 4: Pure ChatGPT prompt builder

**Files:**
- Create: `js/video-assistant-prompts.js`
- Test: `test/video-assistant-prompts.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// test/video-assistant-prompts.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDuplicationPrompt, buildScriptPrompt } from '../js/video-assistant-prompts.js';

test('buildDuplicationPrompt fills audience, domain and hook, keeps her exact wording', () => {
  const prompt = buildDuplicationPrompt({ audience: 'נשים 25-40', domain: 'יופי וקוסמטיקה', hook: 'ככה התחלתי בלי ניסיון' });
  assert.match(prompt, /הקהל יעד העיקרי שלי הוא: נשים 25-40/);
  assert.match(prompt, /התחום שלי הוא: יופי וקוסמטיקה/);
  assert.match(prompt, /אני רוצה שתקח את ההוק הזה: ככה התחלתי בלי ניסיון/);
  assert.match(prompt, /עוד 30 רעיונות חזקים/);
  assert.match(prompt, /בול לשכפל מגנון\s*\n?1:1 ואותו אורך/);
});

test('buildDuplicationPrompt falls back to a bracket placeholder when audience is missing', () => {
  const prompt = buildDuplicationPrompt({ audience: '', domain: 'כושר ותזונה', hook: 'הוק' });
  assert.match(prompt, /הקהל יעד העיקרי שלי הוא: \[הקהל שלי\]/);
});

test('buildScriptPrompt fills the chosen hook and her own words', () => {
  const prompt = buildScriptPrompt({ hook: 'ככה התחלתי בלי ניסיון', herWords: 'סיפרתי על הלקוחה הראשונה שלי' });
  assert.match(prompt, /זה ההוק שבחרתי: ככה התחלתי בלי ניסיון/);
  assert.match(prompt, /זה מה שיש לי להגיד: סיפרתי על הלקוחה הראשונה שלי/);
  assert.match(prompt, /אל תעשה יותר ארוך/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/dev/maya-content-ideas && node --test test/video-assistant-prompts.test.mjs`
Expected: FAIL with "Cannot find module '../js/video-assistant-prompts.js'"

- [ ] **Step 3: Write the implementation**

```javascript
// js/video-assistant-prompts.js
// 13/10/2026: שני הפרומפטים ל-ChatGPT מתוך "העוזר שלך ליצירת סרטון",
// מילה במילה מהניסוח של מאיה (docs/superpowers/specs/2026-10-13-video-creation-assistant-design.md)
// - אסור לשנות את הניסוח, רק למלא את המשתנים.

export function buildDuplicationPrompt({ audience, domain, hook }) {
  const audienceText = audience && audience.trim() ? audience.trim() : '[הקהל שלי]';
  const domainText = domain && domain.trim() ? domain.trim() : '[התחום שלי]';
  return `הקהל יעד העיקרי שלי הוא: ${audienceText}
התחום שלי הוא: ${domainText}
אני רוצה שתקח את ההוק הזה: ${hook}
ובעצם תשכפל אותו בול 1:1, אותו מנגנון 1:1, אותו אורך, אותו מבנה רק מותאם
לעולם ולקהל שלי ותביא לי עוד 30 רעיונות חזקים אבל תזכור בול לשכפל מגנון
1:1 ואותו אורך! שים לב מדויק לכל הדגשים שכתבתי ומותאם לקהל יעד שלי בול`;
}

export function buildScriptPrompt({ hook, herWords }) {
  return `זה ההוק שבחרתי: ${hook}
זה מה שיש לי להגיד: ${herWords}
אני רוצה עכשיו שתקח את ההוק שלי תלביש אותו בתסריט המקורי יחד עם כל מה
שיש לי להגיד אבל הכי חשוב? תשמור על מנגנון התסריט 1:1, את האורך אותו
אורך, אל תעשה יותר ארוך, אותו מבנה, אותו מנגנון רק הכל מותאם לקהל שלי
ולהוק שלי!!`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd C:/dev/maya-content-ideas && node --test test/video-assistant-prompts.test.mjs`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add js/video-assistant-prompts.js test/video-assistant-prompts.test.mjs
git commit -m "feat: pure ChatGPT prompt builders for video assistant"
```

---

## Task 5: Pure step state machine

**Files:**
- Create: `js/video-assistant-flow.js`
- Test: `test/video-assistant-flow.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// test/video-assistant-flow.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_STATE, nextStep } from '../js/video-assistant-flow.js';

test('initial state is the opening screen', () => {
  assert.equal(INITIAL_STATE.screen, 'opening');
});

test('no-idea -> pull-idea -> straight to her-words (no transcription needed)', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_NO_IDEA' });
  assert.equal(s.screen, 'no-idea-choice');
  s = nextStep(s, { type: 'CHOOSE_PULL_IDEA' });
  assert.equal(s.screen, 'pulled-idea');
  s = nextStep(s, { type: 'ACCEPT_PICK' });
  assert.equal(s.screen, 'her-words');
  assert.equal(s.branch, 'idea');
});

test('no-idea -> reference -> transcribe -> prompt1 -> her-words -> prompt2 -> read-aloud -> done', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_NO_IDEA' });
  s = nextStep(s, { type: 'CHOOSE_REFERENCE' });
  assert.equal(s.screen, 'pulled-reference');
  s = nextStep(s, { type: 'ACCEPT_PICK' });
  assert.equal(s.screen, 'transcribe');
  s = nextStep(s, { type: 'CONFIRM_DONE' });
  assert.equal(s.screen, 'prompt1');
  s = nextStep(s, { type: 'HOOK_CHOSEN', hook: 'ההוק שבחרה' });
  assert.equal(s.screen, 'her-words');
  assert.equal(s.hook, 'ההוק שבחרה');
  s = nextStep(s, { type: 'HER_WORDS_SUBMITTED', text: 'מה שיש לה להגיד' });
  assert.equal(s.screen, 'prompt2');
  assert.equal(s.herWords, 'מה שיש לה להגיד');
  s = nextStep(s, { type: 'SCRIPT_READY' });
  assert.equal(s.screen, 'read-aloud');
  s = nextStep(s, { type: 'CONFIRM_DONE' });
  assert.equal(s.screen, 'done');
});

test('REROLL replaces the reroll count and keeps the same screen', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_NO_IDEA' });
  s = nextStep(s, { type: 'CHOOSE_REFERENCE' });
  const before = nextStep(s, { type: 'REROLL' });
  assert.equal(before.screen, 'pulled-reference');
  assert.equal(before.rerollCount, 1);
});

test('has-idea -> reverse-duplication skips reference selection entirely', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_HAS_IDEA' });
  assert.equal(s.screen, 'has-idea-choice');
  s = nextStep(s, { type: 'CHOOSE_REVERSE_DUPLICATION' });
  assert.equal(s.screen, 'her-words'); // she already has the hook, no reference to pull
  assert.equal(s.branch, 'idea');
});

test('has-idea -> from-scratch is its own branch, independent of reverse-duplication', () => {
  const fresh = nextStep(INITIAL_STATE, { type: 'CHOOSE_HAS_IDEA' });
  const s = nextStep(fresh, { type: 'CHOOSE_FROM_SCRATCH' });
  assert.equal(s.screen, 'from-scratch');
  assert.equal(s.branch, 'scratch');
});

test('nextStep throws on an unknown action instead of silently no-op-ing', () => {
  assert.throws(() => nextStep(INITIAL_STATE, { type: 'NOT_A_REAL_ACTION' }), /unknown action/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/dev/maya-content-ideas && node --test test/video-assistant-flow.test.mjs`
Expected: FAIL with "Cannot find module '../js/video-assistant-flow.js'"

- [ ] **Step 3: Write the implementation**

```javascript
// js/video-assistant-flow.js
// 13/10/2026: מכונת המצבים הטהורה של "העוזר שלך ליצירת סרטון" - אילו מסכים
// קיימים ולאן עוברים מכל אחד. בלי שום DOM/Firestore כאן בכוונה, כדי
// שהבדיקות יריצו אותה ישירות (ראה test/video-assistant-flow.test.mjs).
// המסך 'from-scratch' לא ממומש כאן - הוא עוטף את הזרימה הקיימת כבר
// (script-hook-writing-framework), ראה js/video-assistant.js.

export const INITIAL_STATE = { screen: 'opening', branch: null, hook: null, herWords: null, rerollCount: 0 };

export function nextStep(state, action) {
  switch (action.type) {
    case 'CHOOSE_NO_IDEA':
      return { ...state, screen: 'no-idea-choice' };
    case 'CHOOSE_HAS_IDEA':
      return { ...state, screen: 'has-idea-choice' };

    case 'CHOOSE_PULL_IDEA':
      return { ...state, screen: 'pulled-idea', branch: 'idea' };
    case 'CHOOSE_REFERENCE':
      return { ...state, screen: 'pulled-reference', branch: 'reference' };
    case 'CHOOSE_REVERSE_DUPLICATION':
      // יש לה כבר רעיון משלה - מדלגים ישר לכתיבה במילים שלה, בלי שלב תמלול
      return { ...state, screen: 'her-words', branch: 'idea' };
    case 'CHOOSE_FROM_SCRATCH':
      return { ...state, screen: 'from-scratch', branch: 'scratch' };

    case 'REROLL':
      return { ...state, rerollCount: state.rerollCount + 1 };

    case 'ACCEPT_PICK':
      // רעיון שנשלף מהבנק כבר יש לו הוק - מדלגים ישר לכתיבה במילים שלה.
      // רפרנס דורש תמלול ידני קודם.
      return state.branch === 'idea'
        ? { ...state, screen: 'her-words' }
        : { ...state, screen: 'transcribe' };

    case 'CONFIRM_DONE':
      if (state.screen === 'transcribe') return { ...state, screen: 'prompt1' };
      if (state.screen === 'read-aloud') return { ...state, screen: 'done' };
      throw new Error(`CONFIRM_DONE not valid from screen "${state.screen}"`);

    case 'HOOK_CHOSEN':
      return { ...state, screen: 'her-words', hook: action.hook };
    case 'HER_WORDS_SUBMITTED':
      return { ...state, screen: 'prompt2', herWords: action.text };
    case 'SCRIPT_READY':
      return { ...state, screen: 'read-aloud' };

    default:
      throw new Error(`unknown action type: ${action.type}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd C:/dev/maya-content-ideas && node --test test/video-assistant-flow.test.mjs`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add js/video-assistant-flow.js test/video-assistant-flow.test.mjs
git commit -m "feat: pure step state machine for video assistant"
```

---

## Task 6: Firestore store module

**Files:**
- Create: `js/video-assistant-store.js`
- Modify: `firestore.rules`

- [ ] **Step 1: Add the Firestore rule, right after the existing `storyTables/{uid}` block (around line 58)**

```
    // 13/10/2026: "העוזר שלך ליצירת סרטון" - מסמך אחד לכל לקוחה (הסשן
    // הפעיל שלה, לא היסטוריה), אותה צורה בדיוק כמו storyTables.
    match /videoAssistantSessions/{uid} {
      allow read, write: if isFull() && request.auth.uid == uid;
      allow read: if isAdmin();
    }
```

- [ ] **Step 2: Write `js/video-assistant-store.js`**

```javascript
// js/video-assistant-store.js
// 13/10/2026: כל הגישה ל-Firestore/Functions עבור "העוזר שלך ליצירת
// סרטון", במקום אחד - שימוש חוזר ב-getProfile/saveProfile הקיימים
// (user-profile.js) בלי לשכפל אותם.
import { db, auth, functions } from './firebase-init.js';
import {
  collection, query, where, getDocs, doc, getDoc, setDoc,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { getProfile, saveProfile } from './user-profile.js';

const guessClientDomainFn = httpsCallable(functions, 'guessClientDomain');

/** רעיונות פעילים של הלקוחה הנוכחית - קריאה חד-פעמית, לא listener */
export async function fetchIdeas() {
  const q = query(collection(db, 'ideas'), where('ownerUid', '==', auth.currentUser.uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** כל מאגר ההשראה - קריאה חד-פעמית, בלי cache משותף עם inspiration-view.js
   בכוונה (זה מסך נפרד, לא חייב לשתף promise עם המסך האחר). */
export async function fetchInspirationBank() {
  const snap = await getDocs(collection(db, 'inspirationBank'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** ניחוש/שמירה חד-פעמית של התחום - ראה profiles/{uid}.videoAssistantDomain */
export async function getSavedDomain() {
  const profile = await getProfile();
  return profile && profile.videoAssistantDomain ? { domain: profile.videoAssistantDomain, subCategory: profile.videoAssistantSubCategory || null } : null;
}

export async function guessDomain(personaText) {
  const result = await guessClientDomainFn({ personaText });
  return result.data.domain;
}

export async function saveDomain(domain, subCategory) {
  await saveProfile({ videoAssistantDomain: domain, videoAssistantSubCategory: subCategory || null });
}

/** הסשן הפעיל - מסמך יחיד לפי uid, לא היסטוריה (ראה firestore.rules) */
export async function loadSession() {
  const snap = await getDoc(doc(db, 'videoAssistantSessions', auth.currentUser.uid));
  return snap.exists() ? snap.data() : null;
}

export async function saveSession(state) {
  await setDoc(doc(db, 'videoAssistantSessions', auth.currentUser.uid), state);
}
```

- [ ] **Step 3: Verify the module has no syntax errors**

Run: `cd C:/dev/maya-content-ideas && node --check js/video-assistant-store.js`
Expected: no output (exit code 0)

- [ ] **Step 4: Commit**

```bash
git add js/video-assistant-store.js firestore.rules
git commit -m "feat: Firestore store module for video assistant"
```

---

## Task 7: Sound module

**Files:**
- Create: `js/video-assistant-sound.js`

- [ ] **Step 1: Write the implementation** (no automated test - `AudioContext` isn't available in `node --test`; this mirrors how the rest of the app has no browser-audio coverage either. Manual QA in Task 10 covers it.)

```javascript
// js/video-assistant-sound.js
// 13/10/2026 (מאיה: "מוזיקה וצלילים מגניבים"): בלי קבצי אודיו חיצוניים
// (רישוי, גודל קובץ, תלות ברשת) - צלילים מסונתזים ב-Web Audio API.
// בלי מוזיקת רקע רציפה (autoplay policies + מסיח בשימוש חוזר) - רק
// שני אפקטים קצרים: הגרלה (whoosh עולה) והצלחה (chime).
const MUTE_KEY = 'video-assistant-muted';
let ctx = null;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

function isMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(muted) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // localStorage חסום (מצב פרטי וכו') - פשוט לא נשמר, לא קריטי
  }
}

export function getMuted() {
  return isMuted();
}

function tone({ freq, duration, type = 'sine', sweepTo }) {
  if (isMuted()) return;
  const audio = getCtx();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audio.currentTime);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, audio.currentTime + duration);
  gain.gain.setValueAtTime(0.15, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + duration);
}

export function playReroll() {
  tone({ freq: 220, sweepTo: 440, duration: 0.25, type: 'sine' });
}

export function playSuccess() {
  tone({ freq: 523.25, duration: 0.18, type: 'sine' });
  setTimeout(() => tone({ freq: 783.99, duration: 0.22, type: 'sine' }), 120);
}
```

- [ ] **Step 2: Verify the module has no syntax errors**

Run: `cd C:/dev/maya-content-ideas && node --check js/video-assistant-sound.js`
Expected: no output (exit code 0)

- [ ] **Step 3: Commit**

```bash
git add js/video-assistant-sound.js
git commit -m "feat: synthesized sound effects for video assistant"
```

---

## Task 8: CSS - cosmic theme

**Files:**
- Modify: `css/style.css` (append at end of file)

- [ ] **Step 1: Read the existing token block first**

Run: `cd C:/dev/maya-content-ideas && node -e "console.log(require('fs').readFileSync('css/style.css','utf8').slice(0,1200))"`

Confirm `--accent: #263ea8`, `--accent-2: #ff2ea8` exist (used below instead of hardcoding new colors).

- [ ] **Step 2: Append the cosmic theme block to `css/style.css`**

```css
/* 13/10/2026: "העוזר שלך ליצירת סרטון" - כיוון "מסע קוסמי" שאושר ב-
   brainstorm session (docs/superpowers/specs/2026-10-13-video-creation-assistant-design.md).
   דארק-פירסט במכוון, גם במצב light של המכשיר - זו חוויה, לא מסמך לקריאה. */
.cosmic-theme {
  background: linear-gradient(160deg, #0b0f2e 0%, #1c2f82 55%, #2a1850 100%);
  color: #fff;
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  padding: 24px 16px;
}
.cosmic-theme::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    radial-gradient(2px 2px at 20% 30%, #fff 100%, transparent),
    radial-gradient(2px 2px at 70% 60%, #fff 100%, transparent),
    radial-gradient(1.5px 1.5px at 40% 80%, #fff 100%, transparent),
    radial-gradient(1.5px 1.5px at 85% 20%, #fff 100%, transparent),
    radial-gradient(1.5px 1.5px at 55% 15%, #fff 100%, transparent),
    radial-gradient(1.5px 1.5px at 10% 65%, #fff 100%, transparent),
    radial-gradient(1.5px 1.5px at 92% 75%, #fff 100%, transparent);
  opacity: .7;
}
.cosmic-card {
  position: relative;
  max-width: 480px;
  margin: 40px auto;
  background: rgba(255,255,255,.08);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255,255,255,.22);
  border-radius: 20px;
  padding: 28px 24px;
  text-align: center;
  box-shadow: 0 0 40px rgba(255,46,168,.3);
  animation: cosmic-fade-in .25s ease-out;
}
@keyframes cosmic-fade-in {
  from { opacity: 0; transform: scale(.96); }
  to { opacity: 1; transform: scale(1); }
}
.cosmic-card h2 { margin: 0 0 8px; font-size: 20px; }
.cosmic-card p { margin: 0 0 20px; opacity: .85; font-size: 14px; }
.cosmic-btn-row { display: flex; flex-direction: column; gap: 12px; }
.cosmic-btn {
  background: rgba(255,255,255,.12);
  border: 1px solid rgba(255,255,255,.3);
  color: #fff;
  border-radius: 14px;
  padding: 14px 18px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background .15s, transform .1s;
}
.cosmic-btn:hover { background: rgba(255,255,255,.2); }
.cosmic-btn:active { transform: scale(.97); }
.cosmic-btn--primary {
  background: var(--accent-2);
  border-color: var(--accent-2);
}
.cosmic-btn--primary:hover { background: #ff53bb; }
.cosmic-reroll-btn {
  background: transparent;
  border: none;
  color: rgba(255,255,255,.75);
  font-size: 13px;
  text-decoration: underline;
  cursor: pointer;
  margin-top: 10px;
}
.cosmic-mute-btn {
  position: absolute;
  top: 16px;
  left: 16px;
  background: rgba(255,255,255,.12);
  border: none;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  color: #fff;
  cursor: pointer;
  font-size: 16px;
}
.cosmic-textarea {
  width: 100%;
  min-height: 90px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.3);
  background: rgba(255,255,255,.06);
  color: #fff;
  padding: 12px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
}
.cosmic-textarea::placeholder { color: rgba(255,255,255,.4); }
.cosmic-prompt-box {
  background: rgba(0,0,0,.25);
  border-radius: 12px;
  padding: 14px;
  text-align: right;
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 14px;
  max-height: 260px;
  overflow-y: auto;
}
```

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "feat: cosmic theme CSS for video assistant"
```

---

## Task 9: HTML - hub card + view container

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the hub card, right after the existing `hub-link-warming` button (inside the same `.hub-action-grid`, around line 313)**

Find:
```html
        <button type="button" id="hub-link-warming" class="hub-action-card">
          <span class="hub-action-icon">🔥</span>
          <span class="hub-action-label">חימום בסטורי</span>
          <span class="hub-action-desc">חממו קהל לפני מכירה</span>
        </button>
      </div>
    </section>
```

Replace with:
```html
        <button type="button" id="hub-link-warming" class="hub-action-card">
          <span class="hub-action-icon">🔥</span>
          <span class="hub-action-label">חימום בסטורי</span>
          <span class="hub-action-desc">חממו קהל לפני מכירה</span>
        </button>
        <button type="button" id="hub-link-video-assistant" class="hub-action-card">
          <span class="hub-action-icon">🎬</span>
          <span class="hub-action-label">העוזר שלך ליצירת סרטון</span>
          <span class="hub-action-desc">מסע שלב-אחר-שלב מרעיון לתסריט מוכן</span>
        </button>
      </div>
    </section>
```

- [ ] **Step 2: Add the new view container, right after the closing `</main>` of `#ideas-guide-view` (around line 338)**

```html
  <main id="video-assistant-view" class="view cosmic-theme" hidden>
    <button type="button" id="video-assistant-back-btn" class="hub-back-btn" style="position:relative;z-index:1;color:#fff">‹ חזרה למרכז למידה</button>
    <button type="button" id="video-assistant-mute-btn" class="cosmic-mute-btn" aria-label="השתקת צלילים">🔊</button>
    <div id="video-assistant-screen"></div>
  </main>
```

- [ ] **Step 3: Verify the file is still valid HTML (no unclosed tags) by checking the diff is balanced**

Run: `cd C:/dev/maya-content-ideas && node -e "
const html = require('fs').readFileSync('index.html','utf8');
const opens = (html.match(/<main /g)||[]).length;
const closes = (html.match(/<\/main>/g)||[]).length;
console.log('main opens:', opens, 'closes:', closes);
if (opens !== closes) process.exit(1);
"`
Expected: `main opens: N closes: N` with equal numbers (N = however many `<main>` views existed before, +1), exit code 0

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add video assistant hub card and view container to HTML"
```

---

## Task 10: Wire the view router and app startup

**Files:**
- Modify: `js/view-router.js:4`
- Modify: `js/app.js` (add near the other `hub-link-*` listeners, around line 354, and near the other `wire*View()` calls, around line 479)

- [ ] **Step 1: Add `'video-assistant'` to `VIEWS` in `js/view-router.js`**

```javascript
const VIEWS = ['home', 'archive', 'progress', 'chat', 'guide', 'ideas-guide', 'inspiration', 'roadmap', 'content-plan', 'warming', 'video-assistant', 'feedback', 'client-usage'];
```

- [ ] **Step 2: Import and wire in `js/app.js`**

Find the other `js/*.js` imports near the top of `app.js` (same style as `wireWarmingView`'s import) and add:
```javascript
import { wireVideoAssistantView } from './video-assistant.js';
```

Find this block (around line 343-344):
```javascript
document.getElementById('hub-link-ideas-guide').addEventListener('click', () => showView('ideas-guide'));
document.getElementById('ideas-guide-back-btn').addEventListener('click', () => showView('guide'));
```

Add immediately after it:
```javascript
document.getElementById('hub-link-video-assistant').addEventListener('click', () => showView('video-assistant'));
document.getElementById('video-assistant-back-btn').addEventListener('click', () => showView('guide'));
```

Find this line (around line 478):
```javascript
wireWarmingView();
```

Add immediately after it:
```javascript
wireVideoAssistantView();
```

- [ ] **Step 3: Verify no obvious reference error by checking every id referenced exists in index.html**

Run: `cd C:/dev/maya-content-ideas && node -e "
const html = require('fs').readFileSync('index.html','utf8');
['hub-link-video-assistant','video-assistant-back-btn','video-assistant-mute-btn','video-assistant-view','video-assistant-screen'].forEach((id) => {
  if (!html.includes('id=\"' + id + '\"')) { console.error('MISSING id:', id); process.exit(1); }
});
console.log('all ids present');
"`
Expected: `all ids present`

- [ ] **Step 4: Commit**

```bash
git add js/view-router.js js/app.js
git commit -m "feat: wire video assistant into view router and app startup"
```

---

## Task 11: Main DOM module - opening, no-idea and has-idea branch points

**Files:**
- Create: `js/video-assistant.js` (first slice - later tasks extend the same file)

- [ ] **Step 1: Write the implementation (opening screen + the two top-level choices + domain-guess-on-first-entry)**

```javascript
// js/video-assistant.js
// 13/10/2026: "העוזר שלך ליצירת סרטון" - שכבת הכוונה, לא כלי יצירה (ראה
// docs/superpowers/specs/2026-10-13-video-creation-assistant-design.md).
// מרנדר תמיד מחדש innerHTML של #video-assistant-screen לפי ה-state הנוכחי
// של video-assistant-flow.js, בדיוק כמו ש-warming.js מרנדר renderPlan()
// מחדש בכל שינוי - לא DOM דיפ, זה מסך-אחד-בכל-רגע, לא רשימה גדולה.
import { auth } from './firebase-init.js';
import { INITIAL_STATE, nextStep } from './video-assistant-flow.js';
import { pickIdea, pickReference } from './video-assistant-picker.js';
import { buildDuplicationPrompt, buildScriptPrompt } from './video-assistant-prompts.js';
import { playReroll, playSuccess, setMuted, getMuted } from './video-assistant-sound.js';
import {
  fetchIdeas, fetchInspirationBank, getSavedDomain, guessDomain, saveDomain, loadSession, saveSession,
} from './video-assistant-store.js';
import { getProfile } from './user-profile.js';
import { showToast } from './toast.js';

let state = INITIAL_STATE;
let ideasCache = null;
let videosCache = null;
let domainInfo = null; // { domain, subCategory }
let currentPickId = null;

function screenEl() {
  return document.getElementById('video-assistant-screen');
}

function dispatch(action) {
  state = nextStep(state, action);
  saveSession(state).catch((err) => console.error('saveSession failed:', err));
  render();
}

function cosmicCard(innerHtml) {
  screenEl().innerHTML = `<div class="cosmic-card">${innerHtml}</div>`;
}

function renderOpening() {
  cosmicCard(`
    <h2>✨ היי מאיה</h2>
    <p>בואי ניצור את הסרטון הבא שלך</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn" id="va-no-idea-btn">אין לי רעיון</button>
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-has-idea-btn">יש לי רעיון</button>
    </div>
  `);
  document.getElementById('va-no-idea-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_NO_IDEA' }));
  document.getElementById('va-has-idea-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_HAS_IDEA' }));
}

function renderNoIdeaChoice() {
  cosmicCard(`
    <h2>בואי נמצא מאיפה להתחיל</h2>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn" id="va-pull-idea-btn">לשלוף רעיון מהבנק שלי</button>
      <button type="button" class="cosmic-btn" id="va-reference-btn">לשכפל רפרנס מהמאגר</button>
    </div>
  `);
  document.getElementById('va-pull-idea-btn').addEventListener('click', async () => {
    if (!ideasCache) ideasCache = await fetchIdeas();
    const picked = pickIdea(ideasCache, null);
    if (!picked) {
      showToast('אין עדיין רעיונות בבנק שלך - בואי נשכפל רפרנס במקום');
      dispatch({ type: 'CHOOSE_REFERENCE' });
      return;
    }
    currentPickId = picked.id;
    dispatch({ type: 'CHOOSE_PULL_IDEA' });
  });
  document.getElementById('va-reference-btn').addEventListener('click', () => {
    // currentPickId must not leak in from a previous idea-pull in the same
    // session (e.g. she went back and switched branches) - renderPulledReference
    // only picks a fresh video when currentPickId is null, so a stale idea id
    // here would make it look up a non-existent video and crash on video.url.
    currentPickId = null;
    dispatch({ type: 'CHOOSE_REFERENCE' });
  });
}

function renderHasIdeaChoice() {
  cosmicCard(`
    <h2>שתי דרכים לכתוב את התסריט</h2>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-reverse-btn">שכפול הפוך (מומלץ, קל יותר)</button>
      <button type="button" class="cosmic-btn" id="va-scratch-btn">כתיבה מ-0</button>
    </div>
  `);
  document.getElementById('va-reverse-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_REVERSE_DUPLICATION' }));
  document.getElementById('va-scratch-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_FROM_SCRATCH' }));
}

function render() {
  if (state.screen === 'opening') return renderOpening();
  if (state.screen === 'no-idea-choice') return renderNoIdeaChoice();
  if (state.screen === 'has-idea-choice') return renderHasIdeaChoice();
  // שאר המסכים נוספים במשימות הבאות
  cosmicCard(`<p>מסך "${state.screen}" עוד לא בנוי</p>`);
}

export function wireVideoAssistantView() {
  document.getElementById('video-assistant-mute-btn').addEventListener('click', (e) => {
    const muted = !getMuted();
    setMuted(muted);
    e.target.textContent = muted ? '🔇' : '🔊';
  });
  document.getElementById('video-assistant-mute-btn').textContent = getMuted() ? '🔇' : '🔊';

  document.getElementById('hub-link-video-assistant').addEventListener('click', async () => {
    const saved = await loadSession();
    state = saved || INITIAL_STATE;
    render();
  });
}
```

- [ ] **Step 2: Verify the module has no syntax errors**

Run: `cd C:/dev/maya-content-ideas && node --check js/video-assistant.js`
Expected: no output (exit code 0)

- [ ] **Step 3: Commit**

```bash
git add js/video-assistant.js
git commit -m "feat: video assistant opening screen and top-level branch choices"
```

---

## Task 12: Main DOM module - idea/reference pull screens with reroll

**Files:**
- Modify: `js/video-assistant.js`

- [ ] **Step 1: Add the domain-resolution helper and the two "pulled X" screens, right before the `function render()` function**

```javascript
async function resolveDomain() {
  if (domainInfo) return domainInfo;
  const saved = await getSavedDomain();
  if (saved) {
    domainInfo = saved;
    return domainInfo;
  }
  const profile = await getProfile();
  const personaText = profile && profile.primaryAudience ? profile.primaryAudience : '';
  let guessed = null;
  try {
    guessed = personaText ? await guessDomain(personaText) : null;
  } catch (err) {
    console.error('guessDomain failed:', err);
  }
  domainInfo = { domain: guessed, subCategory: null };
  return domainInfo;
}

const DOMAIN_OPTIONS = [
  'יופי וקוסמטיקה', 'בריאות נפשית, טיפול ורוח', 'עסקים ויזמות',
  'עיצוב, נדל"ן ואדריכלות', 'כושר ותזונה', 'תוכן אישי וחיבור',
];

function renderDomainConfirm(guessedDomain, onConfirmed) {
  const options = DOMAIN_OPTIONS.map(
    (d) => `<option value="${d}" ${d === guessedDomain ? 'selected' : ''}>${d}</option>`
  ).join('');
  cosmicCard(`
    <h2>ניחשתי את התחום שלך</h2>
    <p>${guessedDomain ? `ניחשתי: ${guessedDomain} - נכון?` : 'לא הצלחתי לנחש - בחרי בעצמך:'}</p>
    <select id="va-domain-select" class="cosmic-textarea" style="min-height:auto">${options}</select>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-domain-confirm-btn">מאשרת</button>
    </div>
  `);
  document.getElementById('va-domain-confirm-btn').addEventListener('click', async () => {
    const chosen = document.getElementById('va-domain-select').value;
    await saveDomain(chosen, null);
    domainInfo = { domain: chosen, subCategory: null };
    onConfirmed();
  });
}

function renderPulledIdea() {
  const idea = ideasCache.find((i) => i.id === currentPickId);
  cosmicCard(`
    <h2>🎲 הרעיון הזה</h2>
    <p style="font-size:16px;color:#fff;font-weight:600">${idea.title}</p>
    <p>${idea.hookText}</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-accept-idea-btn">אהבתי, בואי נמשיך</button>
    </div>
    <button type="button" class="cosmic-reroll-btn" id="va-reroll-idea-btn">לא אהבתי - הגרילי שוב</button>
  `);
  document.getElementById('va-accept-idea-btn').addEventListener('click', () => dispatch({ type: 'ACCEPT_PICK' }));
  document.getElementById('va-reroll-idea-btn').addEventListener('click', () => {
    playReroll();
    const picked = pickIdea(ideasCache, currentPickId);
    if (picked) currentPickId = picked.id;
    dispatch({ type: 'REROLL' });
  });
}

async function renderPulledReference() {
  if (!videosCache) videosCache = await fetchInspirationBank();
  const { domain } = await resolveDomain();
  if (!domain) {
    renderDomainConfirm(null, () => render());
    return;
  }
  if (!currentPickId) {
    const picked = pickReference(videosCache, domain, null);
    if (!picked) {
      cosmicCard(`<h2>אין עדיין רפרנסים בתחום הזה</h2><p>בחרי "יש לי רעיון" במקום, או חזרי מאוחר יותר.</p>`);
      return;
    }
    currentPickId = picked.id;
  }
  const video = videosCache.find((v) => v.id === currentPickId);
  cosmicCard(`
    <h2>🎲 הרפרנס הזה</h2>
    <p><a href="${video.url}" target="_blank" rel="noopener" style="color:#fff">פתחי לצפייה ←</a></p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-accept-ref-btn">אהבתי, בואי נמשיך</button>
    </div>
    <button type="button" class="cosmic-reroll-btn" id="va-reroll-ref-btn">לא אהבתי - הגרילי שוב</button>
  `);
  document.getElementById('va-accept-ref-btn').addEventListener('click', () => dispatch({ type: 'ACCEPT_PICK' }));
  document.getElementById('va-reroll-ref-btn').addEventListener('click', () => {
    playReroll();
    const picked = pickReference(videosCache, domain, currentPickId);
    if (picked) currentPickId = picked.id;
    dispatch({ type: 'REROLL' });
    renderPulledReference();
  });
}
```

- [ ] **Step 2: Wire these two screens into `render()`, replacing the previous placeholder branch**

```javascript
function render() {
  if (state.screen === 'opening') return renderOpening();
  if (state.screen === 'no-idea-choice') return renderNoIdeaChoice();
  if (state.screen === 'has-idea-choice') return renderHasIdeaChoice();
  if (state.screen === 'pulled-idea') return renderPulledIdea();
  if (state.screen === 'pulled-reference') return renderPulledReference();
  // שאר המסכים נוספים במשימה הבאה
  cosmicCard(`<p>מסך "${state.screen}" עוד לא בנוי</p>`);
}
```

- [ ] **Step 3: Verify the module has no syntax errors**

Run: `cd C:/dev/maya-content-ideas && node --check js/video-assistant.js`
Expected: no output (exit code 0)

- [ ] **Step 4: Commit**

```bash
git add js/video-assistant.js
git commit -m "feat: idea/reference pull screens with reroll and domain confirmation"
```

---

## Task 13: Main DOM module - transcribe, prompts, her-words, read-aloud, done

**Files:**
- Modify: `js/video-assistant.js`

- [ ] **Step 1: Add the remaining screens, right before `function render()`**

```javascript
function copyBtn(text, label) {
  return `<button type="button" class="cosmic-btn" data-copy-text="${encodeURIComponent(text)}">${label}</button>`;
}

function wireCopyButtons(root) {
  root.querySelectorAll('[data-copy-text]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = decodeURIComponent(btn.getAttribute('data-copy-text'));
      try {
        await navigator.clipboard.writeText(text);
        showToast('הועתק ✓');
      } catch {
        showToast('לא הצלחתי להעתיק - סמני ידנית');
      }
    });
  });
}

function renderTranscribe() {
  cosmicCard(`
    <h2>תמללי את הרפרנס</h2>
    <p>פתחי את הסרטון וכתבי כאן מה נאמר בו, במילים שלו (או קרובות לזה)</p>
    <textarea class="cosmic-textarea" id="va-transcript-input" placeholder="מה נאמר בסרטון..."></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-transcribe-done-btn">✓ עשיתי</button>
    </div>
  `);
  document.getElementById('va-transcribe-done-btn').addEventListener('click', () => {
    state.transcript = document.getElementById('va-transcript-input').value;
    dispatch({ type: 'CONFIRM_DONE' });
  });
}

async function renderPrompt1() {
  const profile = await getProfile();
  const audience = profile && profile.primaryAudience ? profile.primaryAudience : '';
  const prompt = buildDuplicationPrompt({ audience, domain: domainInfo ? domainInfo.domain : '', hook: state.transcript || '' });
  cosmicCard(`
    <h2>פרומפט מוכן ל-ChatGPT</h2>
    <p>העתיקי, הדביקי ב-ChatGPT, ותחזרי עם ההוק שהכי קרץ לך מתוך ה-30</p>
    <div class="cosmic-prompt-box">${prompt}</div>
    ${copyBtn(prompt, 'העתיקי פרומפט')}
    <textarea class="cosmic-textarea" id="va-hook-input" placeholder="הדביקי כאן את ההוק שבחרת..." style="margin-top:14px"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-hook-chosen-btn">המשך</button>
    </div>
  `);
  wireCopyButtons(screenEl());
  document.getElementById('va-hook-chosen-btn').addEventListener('click', () => {
    const hook = document.getElementById('va-hook-input').value.trim();
    if (!hook) {
      showToast('צריך להדביק את ההוק שבחרת קודם');
      return;
    }
    dispatch({ type: 'HOOK_CHOSEN', hook });
  });
}

function renderHerWords() {
  cosmicCard(`
    <h2>מה יש לך להגיד?</h2>
    <p>סיפור קצר, דוגמא, או דיבור כללי על הנושא - במילים שלך</p>
    <textarea class="cosmic-textarea" id="va-herwords-input"></textarea>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-herwords-done-btn">המשך</button>
    </div>
  `);
  document.getElementById('va-herwords-done-btn').addEventListener('click', () => {
    const text = document.getElementById('va-herwords-input').value.trim();
    if (!text) {
      showToast('צריך לכתוב משהו קודם');
      return;
    }
    dispatch({ type: 'HER_WORDS_SUBMITTED', text });
  });
}

function renderPrompt2() {
  const hook = state.hook || state.transcript || '';
  const prompt = buildScriptPrompt({ hook, herWords: state.herWords });
  cosmicCard(`
    <h2>הפרומפט השני</h2>
    <p>העתיקי, הדביקי ב-ChatGPT, ותקבלי תסריט מלא</p>
    <div class="cosmic-prompt-box">${prompt}</div>
    ${copyBtn(prompt, 'העתיקי פרומפט')}
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-script-ready-btn">יש לי תסריט</button>
    </div>
  `);
  wireCopyButtons(screenEl());
  document.getElementById('va-script-ready-btn').addEventListener('click', () => {
    playSuccess();
    dispatch({ type: 'SCRIPT_READY' });
  });
}

function renderReadAloud() {
  cosmicCard(`
    <h2>קראי בקול את התסריט</h2>
    <p>תבדקי שהכל מתחבר, שאין פספוסים, ושהאורך מרגיש נכון</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-read-done-btn">✓ מוכן לעריכה</button>
    </div>
  `);
  document.getElementById('va-read-done-btn').addEventListener('click', () => {
    playSuccess();
    dispatch({ type: 'CONFIRM_DONE' });
  });
}

function renderDone() {
  cosmicCard(`
    <h2>🎬 מוכן!</h2>
    <p>לכי לעריכה - בהצלחה עם הסרטון</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-restart-btn">ליצור סרטון נוסף</button>
    </div>
  `);
  document.getElementById('va-restart-btn').addEventListener('click', () => {
    state = INITIAL_STATE;
    currentPickId = null;
    saveSession(state).catch((err) => console.error('saveSession failed:', err));
    render();
  });
}
```

- [ ] **Step 2: Extend `render()` to cover all remaining screens**

```javascript
function render() {
  if (state.screen === 'opening') return renderOpening();
  if (state.screen === 'no-idea-choice') return renderNoIdeaChoice();
  if (state.screen === 'has-idea-choice') return renderHasIdeaChoice();
  if (state.screen === 'pulled-idea') return renderPulledIdea();
  if (state.screen === 'pulled-reference') return renderPulledReference();
  if (state.screen === 'transcribe') return renderTranscribe();
  if (state.screen === 'prompt1') return renderPrompt1();
  if (state.screen === 'her-words') return renderHerWords();
  if (state.screen === 'prompt2') return renderPrompt2();
  if (state.screen === 'read-aloud') return renderReadAloud();
  if (state.screen === 'done') return renderDone();
  if (state.screen === 'from-scratch') {
    // 13/10/2026: אין היום שום מסך/כלי בשם "כתיבת תסריטים" בתוך האפליקציה
    // (זו רק לשונית בגיליון שלה) - בדוק בפועל לפני המימוש, לא הונח. לכן
    // כאן תקציר קצר של 5 השלבים כטקסט הכוונה, לא הפניה לכלי שלא קיים.
    // Wizard מלא לנתיב הזה הוא scope נפרד לגרסה הבאה (ראה design doc).
    cosmicCard(`
      <h2>כתיבה מ-0 - 5 השלבים</h2>
      <p style="text-align:right">
        1. בחרי נקודת פתיחה: סיפור אישי / סיפור לקוח / כללי<br>
        2. בחרי סוג תוכן: ערכי / מכירתי / אישי / בידורי<br>
        3. בחרי פורמט נגישות<br>
        4. "מגילת אסתר" - שפכי הכל בלי סינון, כל מה שבא לך להגיד על זה<br>
        5. צמצמי ל-5 חלקים: הוק → חיזוק הוק → נימוק → מסר → קריאה לפעולה<br><br>
        ולבסוף: קראי בקול, תבדקי שהכל זורם
      </p>
      <div class="cosmic-btn-row">
        <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-scratch-ok-btn">הבנתי, יוצאת לכתוב</button>
      </div>
    `);
    document.getElementById('va-scratch-ok-btn').addEventListener('click', () => {
      state = INITIAL_STATE;
      render();
    });
    return;
  }
  cosmicCard(`<p>מסך לא מוכר: "${state.screen}"</p>`);
}
```

- [ ] **Step 3: Verify the module has no syntax errors**

Run: `cd C:/dev/maya-content-ideas && node --check js/video-assistant.js`
Expected: no output (exit code 0)

- [ ] **Step 4: Commit**

```bash
git add js/video-assistant.js
git commit -m "feat: complete video assistant screen flow through to done"
```

---

## Task 14: Full test suite + manual QA + deploy prep

**Files:** none new - verification only

- [ ] **Step 1: Run the full pure-logic test suite**

Run: `cd C:/dev/maya-content-ideas && node --test test/*.test.mjs`
Expected: PASS, all tests across all files (including the 4 new test files from Tasks 1, 3, 4, 5 - 22 new tests total: 5 + 7 + 3 + 7)

- [ ] **Step 2: Check every `getElementById` call in `js/video-assistant.js` resolves to an id that actually exists somewhere in `index.html`** (same class of bug as [[feedback-import-test-is-not-a-render-test]] - a typo'd id silently returns `null` and crashes on `.addEventListener`)

Run:
```bash
cd C:/dev/maya-content-ideas && node -e "
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const src = fs.readFileSync('js/video-assistant.js', 'utf8');
const ids = [...src.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
const missing = [...new Set(ids)].filter((id) => !html.includes('id=\"' + id + '\"') && id !== 'video-assistant-screen');
// video-assistant-screen's children are rendered dynamically by this same file, not present in index.html statically
const dynamic = new Set(['va-no-idea-btn','va-has-idea-btn','va-pull-idea-btn','va-reference-btn','va-reverse-btn','va-scratch-btn','va-accept-idea-btn','va-reroll-idea-btn','va-accept-ref-btn','va-reroll-ref-btn','va-domain-select','va-domain-confirm-btn','va-transcript-input','va-transcribe-done-btn','va-hook-input','va-hook-chosen-btn','va-herwords-input','va-herwords-done-btn','va-script-ready-btn','va-read-done-btn','va-restart-btn','va-scratch-ok-btn']);
const realMissing = missing.filter((id) => !dynamic.has(id));
console.log('statically-missing ids (should be empty):', realMissing);
if (realMissing.length) process.exit(1);
"
```
Expected: `statically-missing ids (should be empty): []`

- [ ] **Step 3: Manual QA in the browser** (this app has no build step - open `index.html` via the existing local dev flow, e.g. `firebase emulators:start` or whatever this repo's README already documents)

Walk through, as a real logged-in test account with at least one `ideas` doc and some `inspirationBank` docs in her domain:
1. מרכז למידה → "העוזר שלך ליצירת סרטון" card opens the cosmic view
2. "אין לי רעיון" → "לשלוף רעיון מהבנק" shows a real idea, reroll plays a sound and swaps it, "אהבתי" advances to "מה יש לך להגיד"
3. Fresh account with zero domain saved → "לשכפל רפרנס" triggers the domain-guess screen, confirming saves it permanently (reload the page - it does NOT ask again)
4. Prompt screens show the exact verbatim templates with real data filled in, copy button works
5. Mute button toggles and persists across a reload
6. "יש לי רעיון" → "כתיבה מ-0" shows the hand-off message and returns cleanly to the opening screen

- [ ] **Step 4: Fix anything found in manual QA, then final commit**

```bash
cd C:/dev/maya-content-ideas
git add -A
git commit -m "fix: video assistant manual QA fixes"
```
(skip this commit if QA found nothing to fix)

- [ ] **Step 5: Deploy** (functions need an explicit deploy per [[content-ideas-deploy-split]] - front-end publishes by git push, functions need `firebase deploy`)

Run: `cd C:/dev/maya-content-ideas/functions && firebase deploy --only functions:guessClientDomain,firestore:rules`
Expected: deploy succeeds

Then push the front-end:
```bash
cd C:/dev/maya-content-ideas && git push
```
