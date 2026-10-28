// 28/10/2026 (מאיה): "אני מרגישה עומס מנטלי, וחלק מהכפתורים מסובכים או
// לא מובנים, וצריך יותר סדר". ארבעה דברים שהיו בכל מסך, ועכשיו לא.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = readFileSync(join(ROOT, 'js', 'video-assistant.js'), 'utf8');

test('מד התקדמות אחד: בלי שרשרת ה-DNA', () => {
  assert.ok(!SRC.includes('cosmic-dna-chain'), 'השרשרת חזרה');
});

test('כפתור ההמשך הראשי מנוסח אותו דבר בכל המסכים', () => {
  const labels = [...SRC.matchAll(/cosmic-btn--primary" id="va-[a-z-]+(?:next|done|ready|chosen|accept)[a-z-]*-btn">([^<]*)</g)].map((m) => m[1]);
  assert.ok(labels.length >= 15, 'לא נמצאו הכפתורים');
  assert.deepEqual([...new Set(labels)], ['ממשיכים ←']);
});

test('אין SOS שקופץ לבד', () => {
  assert.ok(!SRC.includes('IDLE_MS'), 'הטיימר חזר');
  assert.ok(!SRC.includes('va-sos-mascot'), 'המסקוט חזר');
});

test('הפרומפטים סגורים מאחורי שורה אחת, וכפתור ההעתקה נשאר', () => {
  assert.ok(!/<div class="cosmic-prompt-box"[^>]*>\$\{highlightPlaceholders/.test(SRC), 'נשאר פרומפט פתוח');
  assert.ok((SRC.match(/promptPeek\(/g) || []).length >= 7, 'לא כל הפרומפטים עברו');
});

// בדיקת מובייל אחרי הפישוט (28/10/2026)
const CSS = readFileSync(join(ROOT, 'css', 'style.css'), 'utf8');
test('חזרה מצביעה ימינה, כי "ממשיכים ←" מצביע שמאלה (RTL)', () => {
  assert.match(SRC, /aria-label="חזרה אחורה">→<\/button>/);
});
test('השורות שנפתחות וקישור ההגרלה בגובה אצבע', () => {
  assert.match(CSS, /\.va-text-link \{ min-height: 44px/);
  assert.match(CSS, /\.va-more summary \{ min-height: 44px/);
});
