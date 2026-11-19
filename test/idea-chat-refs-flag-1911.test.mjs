/* 19/11/2026 (מאיה: "תפתחי למאיה לי פן את הצאט לבדיקת רעיון, הוא לא קיים אצלה באפליקציה").
   מנוית רפרנסים עם ideaChat:true ברשומה מקבלת את הצ'אט בלבד, וכל השאר נשאר סגור. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SRV = read('../functions/index.js');
const APP = read('../js/app.js');
const CHAT = read('../js/idea-chat.js');
const CSS = read('../css/style.css');
const HTML = read('../index.html');

test('השרת: checkIdea פתוח למנוית רפרנסים רק עם הדגל', () => {
  assert.ok(SRV.includes("const flagOpen = Boolean(refsFlag) && data[refsFlag] === true;"));
  assert.ok(SRV.includes("if (data.plan === 'refs' && !allowRefs && !flagOpen) {"));
  const i = SRV.indexOf('exports.checkIdea = onRequest(');
  const body = SRV.slice(i, SRV.indexOf('exports.', i + 20));
  assert.ok(body.includes("enforceAllowlist(email, { refsFlag: 'ideaChat' })"));
  const gw = SRV.slice(SRV.indexOf('exports.generateWarmingPlan'), SRV.indexOf('exports.generateWarmingPlan') + 4000);
  assert.ok(!gw.includes('refsFlag'), 'רק הצ׳אט נפתח');
});

test('הממשק: לשונית רק למי שמסומנת, והכניסה לא חוסמת אותה', () => {
  assert.match(HTML, /id="tab-idea-chat" class="tab-btn tab-ideachat-only"/);
  assert.match(CSS, /\.tab-ideachat-only \{ display: none !important; \}/);
  assert.match(CSS, /body\[data-plan="refs"\]\[data-idea-chat="1"\] \.tab-ideachat-only/);
  assert.ok(APP.includes("ideaChat: data.ideaChat === true"));
  assert.ok(APP.includes("document.body.dataset.ideaChat = access.ideaChat ? '1' : '';"));
  assert.ok(CHAT.includes("if (document.body.dataset.ideaChat !== '1') return Promise.resolve();"));
});
