/* 11/11/2026 (מאיה: "כן כן כן, בכורה על השטיח האדום"): מסך הסיכום נפתח בערב
   בכורה. זרקורים, שטיח אדום, והדמות של מאיה מגישה פסלון זהב עם שם הסרטון.
   כפתור אחד מוציא תמונה מוכנה לסטורי (1080x1920), שאפשר לשתף ישר מהטלפון. */
import { mayaSrc } from './va-maya.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** שם הסרטון לפסלון: ההוק או הרעיון, שורה אחת וקצרה */
export function premiereTitle(state, script = '') {
  const raw = (state && (state.hook || state.ideaDescription)) || String(script || '').split('\n').find((l) => l.trim()) || '';
  const one = String(raw).replace(/\s+/g, ' ').trim();
  return one.length > 70 ? `${one.slice(0, 68).trim()}…` : one;
}

export function premiereHtml(title) {
  return `<div class="va-premiere" aria-label="ערב הבכורה של הסרטון">
    <div class="va-premiere-beam va-premiere-beam--r" aria-hidden="true"></div>
    <div class="va-premiere-beam va-premiere-beam--l" aria-hidden="true"></div>
    <div class="va-premiere-carpet" aria-hidden="true"></div>
    <img class="va-premiere-maya" src="${mayaSrc('oscar')}" alt="מאיה מגישה פסלון זהב" decoding="async">
    <div class="va-premiere-text">
      <div class="va-premiere-kicker">🎬 ערב הבכורה</div>
      ${title ? `<div class="va-premiere-plaque">${esc(title)}</div>` : ''}
      <div class="va-premiere-count"></div>
      <button type="button" class="cosmic-btn va-premiere-share">📸 תמונה לסטורי</button>
    </div>
  </div>`;
}

/** שבירת שורות לפי רוחב, מילה מילה */
export function wrapLines(measure, text, maxW, maxLines = 4) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next) <= maxW || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
    return kept;
  }
  return lines;
}

function loadImg(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}

/** תמונת הסטורי, כ-Blob של PNG */
export async function premiereStory(title, { count = 0 } = {}) {
  const W = 1080;
  const H = 1920;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  try { await document.fonts.load('90px "Ploni Black"'); } catch { /* גופן ברירת מחדל */ }
  const font = (px) => `${px}px "Ploni Black", "Heebo", Arial, sans-serif`;

  /* רקע קטיפה */
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0d0a2b'); bg.addColorStop(0.55, '#24103f'); bg.addColorStop(1, '#3d0b22');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  /* זרקורים */
  for (const [sx, tx] of [[80, 640], [1000, 440]]) {
    const g = x.createLinearGradient(sx, 0, tx, 1500);
    g.addColorStop(0, 'rgba(255,240,200,.55)'); g.addColorStop(1, 'rgba(255,240,200,0)');
    x.fillStyle = g;
    x.beginPath(); x.moveTo(sx - 30, 0); x.lineTo(sx + 30, 0); x.lineTo(tx + 260, 1500); x.lineTo(tx - 260, 1500); x.closePath(); x.fill();
  }
  /* שטיח אדום */
  const rg = x.createLinearGradient(0, 1150, 0, H);
  rg.addColorStop(0, '#8e0f23'); rg.addColorStop(1, '#d11a3a');
  x.fillStyle = rg;
  x.beginPath(); x.moveTo(430, 1150); x.lineTo(650, 1150); x.lineTo(1000, H); x.lineTo(80, H); x.closePath(); x.fill();
  /* עמודי חבל זהב */
  x.strokeStyle = '#c8a24a'; x.lineWidth = 10;
  for (const px of [150, 930]) { x.beginPath(); x.moveTo(px, 1430); x.lineTo(px, 1640); x.stroke(); x.fillStyle = '#e6c46a'; x.beginPath(); x.arc(px, 1420, 22, 0, Math.PI * 2); x.fill(); }
  x.strokeStyle = '#8e0f23'; x.lineWidth = 16;
  x.beginPath(); x.moveTo(150, 1450); x.quadraticCurveTo(300, 1540, 400, 1470); x.stroke();
  x.beginPath(); x.moveTo(930, 1450); x.quadraticCurveTo(780, 1540, 680, 1470); x.stroke();

  /* מאיה מגישה את הפסלון */
  try {
    const im = await loadImg(mayaSrc('oscar'));
    const h = 1080;
    const w = (im.width / im.height) * h;
    x.drawImage(im, (W - w) / 2, H - h - 90, w, h);
  } catch { /* בלי תמונה, רק הטקסט */ }

  x.direction = 'rtl';
  x.textAlign = 'center';
  x.fillStyle = '#ffffff';
  x.font = font(84);
  x.fillText('ערב הבכורה', W / 2, 190);
  x.font = font(52);
  x.fillStyle = 'rgba(255,255,255,.85)';
  x.fillText(count > 1 ? `הסרטון ה-${count} שלי מוכן!` : 'הסרטון שלי מוכן!', W / 2, 280);

  if (title) {
    x.font = font(60);
    const lines = wrapLines((t) => x.measureText(t).width, title, 860, 4);
    const top = 360;
    const lh = 78;
    const boxH = lines.length * lh + 60;
    const plaque = x.createLinearGradient(0, top, 0, top + boxH);
    plaque.addColorStop(0, '#f6dc8a'); plaque.addColorStop(1, '#c8962e');
    x.fillStyle = plaque;
    const r = 28;
    x.beginPath();
    x.moveTo(110 + r, top); x.lineTo(970 - r, top); x.quadraticCurveTo(970, top, 970, top + r);
    x.lineTo(970, top + boxH - r); x.quadraticCurveTo(970, top + boxH, 970 - r, top + boxH);
    x.lineTo(110 + r, top + boxH); x.quadraticCurveTo(110, top + boxH, 110, top + boxH - r);
    x.lineTo(110, top + r); x.quadraticCurveTo(110, top, 110 + r, top); x.closePath(); x.fill();
    x.fillStyle = '#3a2405';
    lines.forEach((l, i) => x.fillText(l, W / 2, top + 30 + lh * (i + 0.78)));
  }

  /* בלי אימוג'י ובלי מירכאות על הקנבס: לא בכל מכשיר יש גופן אימוג'י,
     והמירכאות קופצות לצד הלא נכון בשבירת שורה מימין לשמאל */
  x.font = font(38);
  x.fillStyle = 'rgba(255,255,255,.9)';
  x.fillText('נבנה עם המוח השיווקי · מאיה קיסלב', W / 2, H - 40);

  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
}

/** מחבר את כפתור הסטורי: שיתוף ישר מהטלפון, ואם אין, הורדה */
export function wirePremiere(root, title, opts = {}) {
  const getCount = opts.getCount || (() => 0);
  const toast = opts.toast || (() => {});
  const btn = root && root.querySelector('.va-premiere-share');
  if (!btn) return;
  /* 11/11/2026 (ביקורת): באייפון שיתוף שמגיע הרבה אחרי הלחיצה נדחה. התמונה
     מוכנה מראש כשהסיכום נפתח, והלחיצה רק משתפת. */
  let ready = null;
  const prepare = () => {
    if (!ready) ready = premiereStory(title, { count: getCount() }).catch((e) => { ready = null; throw e; });
    return ready;
  };
  setTimeout(() => { prepare().catch(() => {}); }, 1200);
  const download = (blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'הבכורה-שלי.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('התמונה ירדה למכשיר. מעלים אותה לסטורי 🎬');
  };
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'מכינה את התמונה…';
    try {
      const blob = await prepare();
      if (!blob) throw new Error('no image');
      const file = new File([blob], 'הבכורה-שלי.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'הסרטון שלי מוכן!' });
        } catch (e) {
          /* ביטול זה בסדר. כל שגיאה אחרת: מורידים במקום */
          if (!e || e.name !== 'AbortError') download(blob);
        }
      } else {
        download(blob);
      }
    } catch (err) {
      console.error('premiere story failed:', err);
      toast('לא הצלחתי להכין את התמונה. אפשר לנסות שוב');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });
}
