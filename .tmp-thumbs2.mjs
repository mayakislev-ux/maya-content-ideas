import { writeFileSync, existsSync } from 'node:fs';
const ids = [
  ['5PgBaJbMCY76BmEbyiee','https://vt.tiktok.com/ZSqk2btKx/'],
  ['DNwDgRfl3tgB5Sj2L9rF','https://vt.tiktok.com/ZSqhmFR1s/'],
  ['KocF7TrvLJUbifRitNil','https://vt.tiktok.com/ZSqhppsme/'],
  ['O9yCAvWo6QOYXfdysS5m','https://vt.tiktok.com/ZSqhsJBSK/'],
  ['Rum908dhQ5cTiUiHbWDA','https://vt.tiktok.com/ZSqh9kjtw/'],
  ['XY5ZY2TlJhqZLt26WzB1','https://vt.tiktok.com/ZSqhaJsvR/'],
  ['ceq4UEuDjfPCOaUdKfGs','https://vt.tiktok.com/ZSqhVWKxQ/'],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(60000);
let got = 0; const dead = [];
for (const [id, url] of ids) {
  const file = `assets/inspiration-thumbnails/${id}.jpg`;
  if (existsSync(file)) continue;
  let ok = false;
  for (let a = 1; a <= 3 && !ok; a += 1) {
    try {
      const r = await fetch('https://www.tiktok.com/oembed?url=' + encodeURIComponent(url));
      if (r.ok) {
        const j = await r.json();
        if (j.thumbnail_url && j.author_name && j.author_name !== '@') {
          const img = await fetch(j.thumbnail_url);
          if (img.ok) { writeFileSync(file, Buffer.from(await img.arrayBuffer())); got += 1; ok = true; console.log('נשמר:', id); }
        } else { console.log('תשובה בלי תמונה:', id, 'status', r.status, 'author', JSON.stringify(j.author_name)); }
      } else { console.log('HTTP', r.status, 'עבור', id); }
    } catch (e) { console.log('שגיאה', id, e.message.slice(0,40)); }
    if (!ok) await sleep(6000);
  }
  if (!ok) dead.push(id);
  await sleep(5000);
}
console.log('');
console.log('הורדו:', got, '| עדיין לא:', dead.length);
