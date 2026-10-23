/**
 * אימות שהאתר החי באמת נטען. להרצה אחרי כל push.
 *
 * 23/10/2026 (מאיה: "תתאפסי על עצמך... יש תקלה חמורה לא נפתח לאף אחד").
 *
 * הבדיקות המקומיות עברו, ה-push עבר, והאפליקציה לא נפתחה לאף אחת. הסיבה
 * הייתה שגיאת תחביר בקובץ אחד שכל האפליקציה תלויה בו. "דחפתי ועבר" הוא
 * לא אימות - אימות זה להוריד מהאתר את מה שהלקוחה באמת מקבלת.
 *
 * הסקריפט הולך על שרשרת ה-import האמיתית מ-index.html, מוריד כל מודול
 * מהאתר החי, ומפרסר אותו בתור מודול (סיומת mjs מכריחה את node לפרסר
 * בדיוק כמו הדפדפן, בניגוד ל-.js שנבדק בתור CommonJS). בודק גם שגרסת
 * המטמון ב-sw.js שבאוויר היא זו שבקוד, אחרת השינוי לא יגיע לאף אחת.
 *
 *   node scripts/verify-live.mjs
 */
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://mayakislev-ux.github.io/maya-content-ideas/';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WORK = join(tmpdir(), 'verify-live-' + Date.now());

const seen = new Set();
const bad = [];
let checked = 0;

async function get(rel) {
  const res = await fetch(BASE + rel + '?cb=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

async function walk(rel) {
  if (seen.has(rel)) return;
  seen.add(rel);

  let src;
  try {
    src = await get(rel);
  } catch (err) {
    bad.push(`${rel}: ${err.message}`);
    return;
  }
  checked++;

  const copy = join(WORK, rel.replace(/[\\/]/g, '_').replace(/\.js$/, '.mjs'));
  mkdirSync(dirname(copy), { recursive: true });
  writeFileSync(copy, src);
  const res = spawnSync(process.execPath, ['--check', copy], { encoding: 'utf8' });
  if (res.status !== 0) {
    const why = (res.stderr || '').split('\n').find((l) => /Error/.test(l)) || 'שגיאת תחביר';
    bad.push(`${rel}: ${why.trim()}`);
  }

  const statik = /(?:^|\n)\s*(?:import|export)[^'"\n]*from\s*['"]([^'"]+)['"]/g;
  const dynamic = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of [...src.matchAll(statik), ...src.matchAll(dynamic)]) {
    const spec = m[1];
    if (!spec.startsWith('.') && !spec.startsWith('/')) continue; /* ספרייה חיצונית */
    await walk(posix.normalize(posix.join(posix.dirname(rel), spec)));
  }
}

/** גרסת המטמון באוויר חייבת להיות זו שבקוד, אחרת השינוי לא מגיע לאף אחת */
async function checkCacheVersion() {
  const local = readFileSync(join(ROOT, 'sw.js'), 'utf8').match(/CACHE_NAME = '([^']+)'/);
  const liveSrc = await get('sw.js');
  const live = liveSrc.match(/CACHE_NAME = '([^']+)'/);
  if (!local || !live) { bad.push('sw.js: לא נמצאה גרסת מטמון'); return; }
  console.log(`גרסת מטמון: בקוד ${local[1]}, באוויר ${live[1]}`);
  if (local[1] !== live[1]) {
    bad.push(`sw.js: באוויר ${live[1]} ובקוד ${local[1]} - או שה-push עוד לא עלה, או ששכחת לקדם גרסה`);
  }
}

try {
  const html = await get('index.html');
  const entries = [...html.matchAll(/<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/g)]
    .map((m) => m[1].replace(/^\.\//, ''));
  if (!entries.length) bad.push('index.html: לא נמצאה נקודת כניסה של מודול');
  for (const e of entries) await walk(e);
  await checkCacheVersion();
} finally {
  rmSync(WORK, { recursive: true, force: true });
}

console.log(`נבדקו ${checked} מודולים מהאתר החי`);
if (bad.length) {
  console.log('\nהאפליקציה לא תיפתח אצל הלקוחות:');
  bad.forEach((b) => console.log('  ' + b));
  process.exit(1);
}
console.log('הכל תקין. האפליקציה נטענת.');
