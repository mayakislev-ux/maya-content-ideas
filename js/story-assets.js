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

/**
 * כמה להקטין תמונה.
 *
 * 02/10/2026 (מאיה): "גדולות מדי מעצבן תטפלי". תמונה מהטלפון
 * היא בקלות 8 עד 12MB, והיא גם גדולה בהרבה ממה שסטורי צריך. במקום
 * להגיד לה "גדולה מדי", מקטינים בדפדפן לפני ההעלאה. 1920 בצלע
 * הארוך הוא יותר ממסך סטורי מלא (1080x1920), וזה גם מה שגורם לגלריה
 * להיפתח מיד במקום למשוך עשרות מגה-בייט.
 */
export const MAX_EDGE = 1920;
export const SHRINK_ABOVE = 1.5 * 1024 * 1024;

/** המידות אחרי הקטנה, בשמירה על יחס. תמונה קטנה נשארת כמו שהיא. */
export function targetSize(width, height, maxEdge = MAX_EDGE) {
  if (!width || !height) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** האם בכלל כדאי לגעת בקובץ */
export function shouldShrink(file, width, height) {
  if (!file) return false;
  if (file.size > SHRINK_ABOVE) return true;
  return Math.max(width || 0, height || 0) > MAX_EDGE;
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

/**
 * מקטין בפועל. מחזיר את הקובץ המקורי כשאי אפשר, למשל HEIC שהדפדפן לא יודע
 * לפענח, כדי שהעלאה לא תיכשל בגלל שההקטנה נכשלה.
 */
async function shrink(file, width, height) {
  if (!shouldShrink(file, width, height)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    let quality = 0.86;
    let edge = MAX_EDGE;
    for (let attempt = 0; attempt < 3; attempt++) {
      const size = targetSize(bitmap.width, bitmap.height, edge);
      const canvas = document.createElement('canvas');
      canvas.width = size.width || bitmap.width;
      canvas.height = size.height || bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      // eslint-disable-next-line no-await-in-loop
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob) return file;
      if (blob.size <= 9 * 1024 * 1024) {
        const name = String(file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg';
        return new File([blob], name, { type: 'image/jpeg' });
      }
      quality -= 0.18;
      edge = Math.round(edge * 0.75);
    }
    return file;
  } catch (err) {
    console.error('shrink failed, uploading original:', err);
    return file;
  }
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function assetCardHtml(asset) {
  const next = asset.kind === 'bg' ? 'portrait' : asset.kind === 'portrait' ? 'both' : 'bg';
  /* 03/10/2026 (בדיקה): הכותרת היא שם הקובץ שהועלה, והנתיב מגיע מ-Storage.
     גרש אחד בשם הקובץ סגר את התכונה באמצע ושבר את הכרטיס. */
  return `
    <figure class="sa-card" data-path="${escapeHtml(asset.path)}">
      <img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.title || 'תמונה לסטורי')}" loading="lazy">
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
        <p class="sa-note">תמונות גדולות מוקטנות אוטומטית, אין מה להתאים מראש. לחיצה על התווית מחליפה בין רקע נקי, תדמית, ושניהם.</p>
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
      /* 02/10/2026: ההודעה הקודמת לא אמרה כלום ולא הציעה כלום. כשלון רגעי
         נראה כמו תקלה קבועה, ואי אפשר היה לדעת מה קרה. */
      console.error('listAssets failed:', err);
      const why = (err && (err.code || err.message)) || '';
      grid.innerHTML =
        `<p class="sa-empty">לא הצלחנו לטעון את התמונות.` +
        (why ? ` <span class="sa-why">(${String(why).slice(0, 80)})</span>` : '') +
        ` <button type="button" class="sa-retry" id="sa-retry">לנסות שוב</button></p>`;
      const retry = document.getElementById('sa-retry');
      if (retry) retry.addEventListener('click', refresh);
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
      /* בודקים רק שזאת תמונה. הגודל נבדק אחרי ההקטנה, אחרת היינו דוחים
         תמונה מהטלפון שההקטנה הייתה פותרת בשנייה. */
      if (!String(file.type || '').startsWith('image/')) {
        showToast(`${file.name}: אפשר להעלות תמונות בלבד`);
        continue;
      }
      try {
        const { width, height } = await readSize(file);
        const ready = await shrink(file, width, height);
        const reasonAfter = rejectReason(ready);
        if (reasonAfter) { showToast(`${file.name}: ${reasonAfter}`); continue; }
        await uploadAsset(ready, guessKind(width, height));
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
