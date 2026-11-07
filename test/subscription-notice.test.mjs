// 31/10/2026 (מאיה): גישה לשבוע, עם הצעת חידוש וקישור לוואטסאפ על המסך.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RENEW_WHATSAPP_URL, showSubscriptionCountdown, showExpiredNotice } from '../js/subscription-notice.js';

/* מספיק DOM כדי לראות מה נכתב, בלי תלות ב-jsdom במאגר הזה. */
function fakeDocument() {
  const prepended = [];
  globalThis.document = {
    querySelector: () => prepended[0] || null,
    createElement: () => ({ setAttribute() {} }),
    body: { prepend: (el) => prepended.push(el) },
  };
  return prepended;
}

const UNTIL = new Date('2026-11-07T21:59:59Z');
const NOW = Date.parse('2026-10-31T18:00:00Z');
let bars;
beforeEach(() => { bars = fakeDocument(); });

test('הקישור מוביל לוואטסאפ העסקי עם ההודעה המובנית', () => {
  const url = new URL(RENEW_WHATSAPP_URL);
  assert.equal(url.origin + url.pathname, 'https://wa.me/972554353889');
  assert.match(url.searchParams.get('text'), /אשמח לחדש את המנוי.*79/);
});

test('בזמן הגישה: התאריך, ההצעה והקישור על המסך', () => {
  showSubscriptionCountdown({ showCountdown: true, renewOffer: true, paidUntil: UNTIL }, NOW);
  const html = bars[0].innerHTML;
  assert.match(html, /הגישה שלך נגמרת בעוד 7 ימים/);
  assert.ok(html.includes('7.11'), html);
  assert.ok(html.includes('מנוי ב-79 ש"ח לחודש, מתחדש'));
  assert.ok(html.includes(`href="${RENEW_WHATSAPP_URL}"`));
});

test('23:59 בליל ה-7.11 בישראל עוד נחשב ה-7.11', () => {
  showSubscriptionCountdown({ showCountdown: true, renewOffer: true, paidUntil: UNTIL }, Date.parse('2026-11-07T10:00:00Z'));
  assert.match(bars[0].innerHTML, /היום/);
  assert.ok(bars[0].innerHTML.includes('7.11'));
});

test('מנוי חודש בודד בלי הסימון רואה את השעון הישן, בלי הצעה', () => {
  showSubscriptionCountdown({ showCountdown: true, paidUntil: UNTIL }, NOW);
  assert.match(bars[0].innerHTML, /המנוי שלך למאגר הרפרנסים נגמר/);
  assert.ok(!bars[0].innerHTML.includes('wa.me'));
});

test('אחרי התאריך: הודעת חידוש עם קישור רק למי שסומנה', () => {
  const offered = { hidden: true };
  showExpiredNotice(offered, { renewOffer: true });
  assert.equal(offered.hidden, false);
  assert.ok(offered.innerHTML.includes('79') && offered.innerHTML.includes(RENEW_WHATSAPP_URL));
  const plain = { hidden: true };
  showExpiredNotice(plain, {});
  assert.equal(plain.textContent, 'המנוי הסתיים. לחידוש אפשר לפנות למאיה');
  assert.equal(plain.innerHTML, undefined);
});

test('app.js מעביר את הסימון מהרשומה, וגם לתצוגת לקוחה', () => {
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /renewOffer: data\.renewOffer === true/);
  assert.match(app, /renewOffer: d\.renewOffer === true/);
  assert.match(app, /showExpiredNotice\(errorEl, access\)/);
});
