/* 05/11/2026 (מאיה): "הדבקה חכמה". במסכים שבהם חוזרים מג'מיני או
   מ-ChatGPT עם אפשרות אחת מתוך תשובה ארוכה (30 הוקים, 20 כיווני אריזה,
   חיזוקי הוק), היה צריך לסמן בטלפון בדיוק שורה אחת מתוך קיר של טקסט.
   עכשיו אפשר להדביק את כל התשובה: האפשרויות מזוהות והופכות לכרטיסים,
   ולחיצה על כרטיס שמה אותו בתיבה (ואפשר להמשיך לערוך שם).

   הדבקה של אפשרות אחת עובדת בדיוק כמו קודם: פחות משתי אפשרויות = אין
   כרטיסים ואין שום שינוי. */
import { showToast } from './toast.js';

/* סוגי סימון של אפשרות בתחילת שורה. הסוג של האפשרות הראשונה קובע: סימון
   מסוג אחר (למשל תבליטים בתוך הוק ממוספר) הוא חלק מהאפשרות, לא אפשרות חדשה. */
const MARKERS = [
  { kind: 'num', re: /^\(?(\d{1,2})\s*[.)\-:]\s*(?=\S)/ },
  { kind: 'num', re: /^\((\d{1,2})\)\s*(?=\S)/ },
  { kind: 'heb', re: /^([א-ת])['׳]?\s*[.)]\s*(?=\S)/ },
  { kind: 'bullet', re: /^[-•*●▪◦–]\s+(?=\S)/ },
];

function stripLine(line) {
  /* כותרות markdown ("### 1. ...") והדגשות ("**1.** ...") סביב הסימון */
  return line.replace(/^\s*#{1,6}\s*/, '').replace(/^\s*\*\*(?=\(?\d|[א-ת]['׳]?[.)])/, '').trim();
}

function markerOf(line) {
  const s = stripLine(line);
  for (const m of MARKERS) {
    const hit = s.match(m.re);
    if (hit) return { kind: m.kind, rest: s.slice(hit[0].length) };
  }
  return null;
}

const indentOf = (line) => (line.match(/^\s*/) || [''])[0].length;

/* כותרת קבוצה בין אפשרויות ("**הוקים של סקרנות**", "קבוצה ב':") */
function isHeading(text) {
  const t = text.trim();
  return /^#{1,6}\s/.test(t) || /^\*\*[^*]+\*\*:?$/.test(t) || /:$/.test(t);
}

function cleanOption(text) {
  return text
    .replace(/\*\*|__/g, '')
    .split('\n').map((l) => l.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/^["“”״'](.+)["“”״']$/s, '$1')
    .trim();
}

/**
 * מפרק תשובה ארוכה לאפשרויות. מחזיר מערך של מחרוזות, ריק כשאין לפחות שתיים.
 * תומך ב-1. / 1) / 1- / (1) / - / • / א. / ב), ובאפשרות שנמשכת על כמה שורות.
 */
export function parseOptions(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  let kind = null;
  let baseIndent = 0;
  const options = [];   /* כל אפשרות: מערך פסקאות, כל פסקה מערך שורות */
  let cur = null;
  let blankBefore = false;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw.trim()) { blankBefore = true; continue; }
    const m = markerOf(raw);
    const startsOption = m && (kind === null || (m.kind === kind && indentOf(raw) <= baseIndent + 1));
    if (startsOption) {
      if (kind === null) { kind = m.kind; baseIndent = indentOf(raw); }
      cur = [[m.rest]];
      options.push(cur);
    } else if (cur) {
      if (blankBefore) cur.push([raw]);
      else cur[cur.length - 1].push(raw);
    }
    blankBefore = false;
  }
  if (options.length < 2) return [];

  /* כותרת קבוצה שיושבת בסוף אפשרות, רגע לפני האפשרות הבאה, לא שייכת לה */
  for (let i = 0; i < options.length - 1; i += 1) {
    const paras = options[i];
    const last = paras[paras.length - 1];
    if (paras.length > 1 && last.length === 1 && isHeading(last[0])) paras.pop();
  }
  /* הסיום של התשובה ("רוצה שאכין עוד?") נדבק לאפשרות האחרונה כפסקה נוספת.
     האפשרות האחרונה לא מקבלת יותר פסקאות מהארוכה שבשאר. */
  const maxParas = Math.max(...options.slice(0, -1).map((p) => p.length));
  const last = options[options.length - 1];
  if (last.length > maxParas) last.length = maxParas;

  const out = options
    .map((paras) => cleanOption(paras.map((p) => p.join('\n')).join('\n\n')))
    .filter(Boolean);
  return out.length >= 2 ? out : [];
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * מחבר הדבקה חכמה לתיבה קיימת. הכרטיסים נכנסים מתחת לתיבה. מופיעים
 * אחרי הדבקה, וגם כשהמסך נפתח עם תשובה שלמה שכבר הודבקה (רענון).
 */
export function mountSmartPaste(input) {
  if (!input || input.dataset.smartPaste) return null;
  input.dataset.smartPaste = '1';
  const box = document.createElement('div');
  box.className = 'va-smart-paste';
  box.hidden = true;
  input.insertAdjacentElement('afterend', box);
  let options = [];

  function show(list) {
    options = list;
    if (options.length < 2) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.innerHTML = `<p class="va-smart-paste__title">✨ זיהינו ${options.length} אפשרויות בתשובה. לבחור אחת בלחיצה:</p>
      <div class="va-smart-paste__list">${options.map((o, i) => `
        <button type="button" class="va-smart-paste__card" data-option="${i}" aria-pressed="false"><span class="va-smart-paste__num">${i + 1}</span><span class="va-smart-paste__text">${escapeHtml(o)}</span></button>`).join('')}
      </div>
      <p class="va-smart-paste__hint">אחרי הבחירה אפשר עדיין לערוך את הטקסט בתיבה.</p>`;
    box.hidden = false;
  }

  function scan() {
    show(parseOptions(input.value));
  }

  box.addEventListener('click', (e) => {
    const card = e.target.closest('[data-option]');
    if (!card) return;
    const text = options[Number(card.getAttribute('data-option'))];
    if (text === undefined) return;
    input.value = text;
    /* כמו הקלדה: הטיוטה נשמרת, ומה שמאזין לתיבה מתעדכן */
    input.dispatchEvent(new Event('input', { bubbles: true }));
    box.querySelectorAll('[data-option]').forEach((b) => {
      const on = b === card;
      b.classList.toggle('is-picked', on);
      b.setAttribute('aria-pressed', String(on));
    });
    showToast('האפשרות נכנסה לתיבה ✓');
  });

  /* אחרי שההדבקה נכנסה לתיבה */
  input.addEventListener('paste', () => setTimeout(scan, 0));
  input.addEventListener('input', (e) => {
    if (e.inputType === 'insertFromPaste') scan();
    else if (!input.value.trim()) show([]);
  });
  scan();
  return { box, scan };
}
