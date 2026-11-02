// 02/11/2026 (מאיה: "לכל הבנות של המרתון תוכן שאין להן מנוי מלא... שתוסיפי
// להן את הכפתור של איך בונים תכנית תוכן עצמאית").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

test('הלשונית קיימת, ופותחת את מסך המדריך', () => {
  assert.match(html, /<button id="tab-content-plan" class="tab-btn tab-cpguide-only">[\s\S]{0,400}איך בונים תכנית תוכן/);
  assert.match(app, /getElementById\('tab-content-plan'\)\.addEventListener\('click', \(\) => showView\('content-plan'\)\)/);
});

test('מוסתרת לכולן, ונפתחת רק למנוי רפרנסים שמסומן ב-contentPlanGuide', () => {
  assert.match(css, /\.tab-cpguide-only \{ display: none !important; \}/);
  assert.match(css, /body\[data-plan="refs"\]\[data-cp-guide="1"\] \.tab-cpguide-only \{ display: inline-flex !important; \}/);
  assert.match(app, /contentPlanGuide: data\.contentPlanGuide === true/);
  assert.match(app, /document\.body\.dataset\.cpGuide = access\.contentPlanGuide \? '1' : ''/);
});

test('תצוגת לקוחה של מאיה (preview=refs&as=) מראה את הלשונית לפי הרשומה של הלקוחה', () => {
  assert.match(app, /document\.body\.dataset\.cpGuide = d\.contentPlanGuide === true \? '1' : ''/);
});
