/* 21/11/2026 (מאיה: "ליד כל סרטון כפתור של SAVE שהם יכולים לשמור מה הם אהבו
   ואחר כך להשתמש", ו"להעתיק לינק ישירות כאן במסך").
   השמורים של כל משתמשת במסמך אחד: refSaves/{uid} = { ids: [...] }.
   כל ייבוא של Firebase כאן דינמי, כדי שמצב הגלילה והחלון ייבנו גם בלי רשת
   ובבדיקות, והכפתור פשוט לא יעשה כלום אם אין חיבור. */

const FS = 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const saved = new Set();
const listeners = new Set();
let loading = null;

async function fb() {
  const [init, fs] = await Promise.all([import('./firebase-init.js'), import(FS)]);
  const user = init.auth.currentUser;
  if (!user) throw new Error('not signed in');
  return { db: init.db, uid: user.uid, fs };
}

function notify() {
  listeners.forEach((fn) => { try { fn(); } catch (err) { /* כפתור שהוסר */ } });
}

/** טוען פעם אחת את השמורים של המשתמשת המחוברת. */
export function loadSaves() {
  if (!loading) {
    loading = fb()
      .then(({ db, uid, fs }) => fs.getDoc(fs.doc(db, 'refSaves', uid)))
      .then((snap) => {
        const ids = (snap.exists() && snap.data().ids) || [];
        ids.forEach((id) => saved.add(String(id)));
        notify();
      })
      .catch((err) => { loading = null; console.warn('refSaves load failed', err && err.message); });
  }
  return loading;
}

export function isSaved(id) {
  return saved.has(String(id));
}

export function savedCount() {
  return saved.size;
}

/** הוספה או הסרה. המסך מתעדכן מיד, והשמירה נכתבת ברקע. */
export async function toggleSave(id) {
  const key = String(id);
  const add = !saved.has(key);
  if (add) saved.add(key); else saved.delete(key);
  notify();
  try {
    const { db, uid, fs } = await fb();
    await fs.setDoc(fs.doc(db, 'refSaves', uid), {
      ids: add ? fs.arrayUnion(key) : fs.arrayRemove(key),
      updatedAt: fs.serverTimestamp(),
    }, { merge: true });
    return true;
  } catch (err) {
    /* לא נשמר: מחזירים את המצב כדי שהכפתור לא ישקר */
    if (add) saved.delete(key); else saved.add(key);
    notify();
    console.error('refSaves toggle failed', err);
    return false;
  }
}

export function onSavesChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** כפתור שמירה לסרטון. מתעדכן לבד בכל מקום שבו אותו סרטון מוצג. */
export function saveButton(video, className) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  const paint = () => {
    const on = isSaved(video.id);
    btn.textContent = on ? '♥ נשמר' : '♡ שמירה';
    btn.setAttribute('aria-pressed', String(on));
    if (btn.classList && btn.classList.toggle) btn.classList.toggle('is-saved', on);
  };
  paint();
  /* כפתור שהיה במסך ויצא ממנו (כרטיסים נבנים מחדש בכל סינון) מפסיק להאזין */
  const off = onSavesChange(() => {
    if (!btn.isConnected && btn.dataset.seen) { off(); return; }
    if (btn.isConnected) btn.dataset.seen = '1';
    paint();
  });
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await toggleSave(video.id);
    if (!ok) btn.textContent = 'השמירה נכשלה, נסו שוב';
  });
  loadSaves();
  return btn;
}

/** העתקת הקישור המקורי של הסרטון, עם גיבוי לדפדפנים בלי clipboard. */
export async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch (err) {
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }
}

/** כפתור "העתקת קישור". */
export function copyLinkButton(video, className, label = '🔗 העתקת קישור') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = label;
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyLink(video.url);
    btn.textContent = ok ? 'הקישור הועתק ✓' : 'ההעתקה נכשלה';
    setTimeout(() => { btn.textContent = label; }, 1800);
  });
  return btn;
}
