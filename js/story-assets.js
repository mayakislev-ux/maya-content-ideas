/**
 * התיקייה של מאיה לרקעים ותמונות תדמית לסטוריז.
 *
 * 02/10/2026 (מאיה): "צריך בחלק של הסטורי כרגע רק לי תיקייה שאני יכולה
 * בעצם להעלות תמונות לרקעים של סטוריז", ואחר כך "אני יעלה רקעים נקיים
 * ותמונות תדמית גם וגם, וגם תמונת תדמית אפשר לסטורי מקצועי לרקע".
 *
 * לכן תיקייה אחת ולא שתיים, וכל תמונה נושאת סוג: רקע נקי, תדמית, או שניהם.
 * "שניהם" הוא ברירת המחדל לתדמית, כי בדיוק זה מה שהיא אמרה.
 *
 * כרגע רק אצלה. זה לא מוסתר בממשק אלא לא קיים בו: הבלוק הזה אינו ב-HTML
 * בכלל ונבנה כאן רק כשהמייל הוא שלה, בדיוק כמו שורת הניהול בטבלה. ובשרת
 * storage.rules חוסם גם קריאה וגם כתיבה לכל אחת אחרת, כך שגם ניחוש כתובת
 * לא יעזור.
 *
 * הסוג נשמר כ-customMetadata על הקובץ עצמו ולא במסמך נפרד, כדי שלא ייווצר
 * מצב של תמונה בלי רשומה או רשומה בלי תמונה.
 */

import { app, auth } from './firebase-init.js';
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject, listAll, getMetadata, updateMetadata,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { showToast } from './toast.js';
import { confirmDialog } from './confirm-dialog.js';

const OWNER_EMAIL = 'mayakislev@gmail.com';
const BUCKET = 'gs://content-ideas-becd7-story-assets';
const MAX_BYTES = 10 * 1024 * 1024;

export const KINDS = {
  bg: 'רקע נקי',
  portrait: 'תדמית',
  both: 'תדמית שאפשר גם כרקע',
};

const storage = getStorage(app, BUCKET);

function folderRef() {
  const user = auth.currentUser;
  if (!user) return null;
  return ref(storage, `storyAssets/${user.uid}`);
}

/** שם קובץ בטוח וייחודי. השם המקורי נשמר במטא-דאטה, לא בנתיב. */
export function safeName(originalName) {
  const dot = String(originalName || '').lastIndexOf('.');
  const ext = dot > -1 ? String(originalName).slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : 'jpg';
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${rand}.${ext || 'jpg'}`;
}

/** מה אפשר להעלות. מחזיר הודעה בעברית כשלא, ולא רק false. */
export function rejectReason(file) {
  if (!file) return 'לא נבחר קובץ';
  if (!String(file.type || '').startsWith('image/')) return 'אפשר להעלות תמונות בלבד';
  if (file.size > MAX_BYTES) return 'התמונה גדולה מדי, עד 10MB';
  return '';
}

/** ברירת המחדל לסוג, לפי יחס הצדדים. אפשר לשנות בלחיצה. */
export function guessKind(width, height) {
  if (!width || !height) return 'both';
  const ratio = height / width;
  // תמונה מאוד מאורכת היא כמעט תמיד רקע מוכן לסטורי
  return ratio >= 1.5 ? 'bg' : 'both';
}

export async function listAssets() {
  const folder = folderRef();
  if (!folder) return [];
  const { items } = await listAll(folder);
  const out = await Promise.all(
    items.map(async (item) => {
      const [url, meta] = await Promise.all([getDownloadURL(item), getMetadata(item)]);
      const custom = meta.customMetadata || {};
      return {
        path: item.fullPath,
        name: item.name,
        url,
        kind: KINDS[custom.kind] ? custom.kind : 'both',
        title: custom.title || '',
        uploadedAt: meta.timeCreated || '',
      };
    })
  );
  return out.sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
}

export async function uploadAsset(file, kind) {
  const folder = folderRef();
  if (!folder) throw new Error('צריך להיות מחוברים');
  const target = ref(storage, `${folder.fullPath}/${safeName(file.name)}`);
  await uploadBytes(target, file, {
    contentType: file.type,
    customMetadata: { kind: KINDS[kind] ? kind : 'both', title: String(file.name || '').slice(0, 120) },
  });
  return target.fullPath;
}

export async function setKind(path, kind) {
  await updateMetadata(ref(storage, path), { customMetadata: { kind } });
}

export async function removeAsset(path) {
  await deleteObject(ref(storage, path));
}

/* ------------------------------------------------------------------ */

const el = (id) => document.getElementById(id);

/** קורא את מידות התמונה לפני ההעלאה, כדי לנחש סוג. לא מפיל כשנכשל. */
function readSize(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ width: 0, height: 0 }); };
    img.src = url;
  });
}

export function assetCardHtml(asset) {
  const next = asset.kind === 'bg' ? 'portrait' : asset.kind === 'portrait' ? 'both' : 'bg';
  return `
    <figure class="sa-card" data-path="${asset.path}">
      <img src="${asset.url}" alt="${asset.title || 'תמונה לסטורי'}" loading="lazy">
      <figcaption>
        <button type="button" class="sa-kind" data-next="${next}">${KINDS[asset.kind]}</button>
        <button type="button" class="sa-del" aria-label="מחיקה">✕</button>
      </figcaption>
    </figure>`;
}

export async function wireStoryAssets() {
  if ((auth.currentUser && auth.currentUser.email) !== OWNER_EMAIL) return;
  const host = el('story-table-panel');
  const anchor = el('story-table');
  if (!host || !anchor) return;

  let box = el('sa-box');
  if (!box) {
    box = document.createElement('section');
    box.id = 'sa-box';
    box.className = 'sa-box';
    box.innerHTML = `
      <button type="button" class="sa-head" id="sa-toggle" aria-expanded="false">
        <span>🖼️ רקעים ותמונות לסטורי</span>
        <span class="sa-count" id="sa-count"></span>
        <span class="sa-sign" aria-hidden="true">+</span>
      </button>
      <div class="sa-body" id="sa-body" hidden>
        <label class="sa-upload">
          <input type="file" id="sa-file" accept="image/*" multiple hidden>
          <span>להעלות תמונות</span>
        </label>
        <p class="sa-note">עד 10MB לתמונה. לחיצה על התווית מחליפה בין רקע נקי, תדמית, ושניהם.</p>
        <div class="sa-grid" id="sa-grid"></div>
      </div>`;
    host.insertBefore(box, anchor);
  }

  const grid = el('sa-grid');
  const count = el('sa-count');

  async function refresh() {
    try {
      const assets = await listAssets();
      grid.innerHTML = assets.length
        ? assets.map(assetCardHtml).join('')
        : '<p class="sa-empty">עוד אין תמונות. אפשר להעלות מכאן.</p>';
      count.textContent = assets.length ? `${assets.length}` : '';
    } catch (err) {
      console.error('listAssets failed:', err);
      grid.innerHTML = '<p class="sa-empty">לא הצלחנו לטעון את התמונות.</p>';
    }
  }

  el('sa-toggle').addEventListener('click', async () => {
    const body = el('sa-body');
    const open = body.hidden;
    body.hidden = !open;
    el('sa-toggle').setAttribute('aria-expanded', String(open));
    box.querySelector('.sa-sign').textContent = open ? '−' : '+';
    if (open && !grid.children.length) await refresh();
  });

  el('sa-file').addEventListener('change', async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    let ok = 0;
    for (const file of files) {
      const reason = rejectReason(file);
      if (reason) { showToast(`${file.name}: ${reason}`); continue; }
      try {
        const { width, height } = await readSize(file);
        await uploadAsset(file, guessKind(width, height));
        ok += 1;
      } catch (err) {
        console.error('uploadAsset failed:', err);
        showToast(`${file.name} לא עלתה`);
      }
    }
    if (ok) showToast(ok === 1 ? 'התמונה עלתה' : `${ok} תמונות עלו`);
    await refresh();
  });

  grid.addEventListener('click', async (e) => {
    const card = e.target.closest('.sa-card');
    if (!card) return;
    const path = card.dataset.path;

    if (e.target.closest('.sa-kind')) {
      const btn = e.target.closest('.sa-kind');
      const next = btn.dataset.next;
      try {
        await setKind(path, next);
        await refresh();
      } catch (err) {
        console.error('setKind failed:', err);
        showToast('לא הצלחנו לשנות את הסוג');
      }
      return;
    }

    if (e.target.closest('.sa-del')) {
      const yes = await confirmDialog('למחוק את התמונה הזאת?', { okLabel: 'מחיקה', cancelLabel: 'ביטול' });
      if (!yes) return;
      try {
        await removeAsset(path);
        await refresh();
      } catch (err) {
        console.error('removeAsset failed:', err);
        showToast('לא הצלחנו למחוק');
      }
    }
  });

  await refresh();
}
