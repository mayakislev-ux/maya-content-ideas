// 06/11/2026 (מאיה, על מסך הבית "אין לי רעיון?"): שתי דלתות שולפות רעיון
// מהקובץ של הלקוח/ה: "מקהל היעד" (לשונית "ניתוח קהל יעד") ו"מהפרסונה
// השיווקית: הבידול שלך" (לשונית "פרסונה שיווקית").
//
// הקובץ הזה טהור: מקבל את התאים כמו ש-Sheets מחזיר (rows[][]) ומחזיר
// שורות קצרות לפי נושא. אין בו קריאה לרשת, כדי שהבדיקות ירוצו על
// המבנים האמיתיים.
//
// "ניתוח קהל יעד" (נבדק על הקובץ של מאיה): עמודה A = השאלות. שורת כותרת
// שתא A שלה "שאלות לניתוח קהל היעד" מחזיקה ב-B והלאה את כותרות הקבוצות
// ("קבוצה 1: ...", "קבוצה 2: ...", וגם ריקות כמו "קבוצה 4:" שמדלגים
// עליהן). כל תא הוא טקסט חופשי.
//
// "פרסונה שיווקית": שתי עמודות, שאלה | תשובה.

const AUDIENCE_TAB = 'ניתוח קהל יעד';
const PERSONA_TAB = 'פרסונה שיווקית';
const AUDIENCE_HEADER = 'שאלות לניתוח קהל היעד';
const MAX_ROWS_PER_SECTION = 40;

/* הסדר כאן הוא סדר הצ'יפים במסך. match נבדק על התווית בעמודה A. */
const AUDIENCE_SECTIONS = [
  { id: 'pains', label: 'כאבים ובעיות', match: (q) => q.includes('איזה כאבים') || q.includes('כאבים/בעיות') || q.includes('כאבים / בעיות') },
  { id: 'faq', label: 'שאלות נפוצות', match: (q) => q.includes('שאלות נפוצות') },
  { id: 'beliefs', label: 'אמונות מגבילות', match: (q) => q.includes('אמונות מגבילות') },
  { id: 'alternatives', label: 'פתרונות אחרים', match: (q) => q.includes('עוד דרכים') },
  { id: 'result', label: 'התוצאה', match: (q) => q.includes('איזה תוצאה') || q.includes('איזו תוצאה') },
  { id: 'ifnot', label: 'אם לא פותרים', match: (q) => q.includes('מה קורה אם לא פותרים') },
];

function isExample(title) {
  return /דוגמ[אה]/.test(title);
}

/** איזו לשונית היא "ניתוח קהל יעד": השם המדויק, ואחרת שם עם "קהל יעד" שאינו דוגמא. */
function pickAudienceTab(titles) {
  const list = (titles || []).map((t) => String(t));
  return list.find((t) => t.trim() === AUDIENCE_TAB)
    || list.find((t) => t.includes('קהל יעד') && !isExample(t))
    || null;
}

function pickPersonaTab(titles) {
  const list = (titles || []).map((t) => String(t));
  return list.find((t) => t.trim() === PERSONA_TAB)
    || list.find((t) => t.includes('פרסונה') && !isExample(t))
    || null;
}

const QUOTES = /^["'״׳“”„`]+|["'״׳“”„`]+$/g;

/** תווית של שאלה בעמודה A: בלי רווחים ומרכאות בקצוות. */
function normLabel(value) {
  return String(value == null ? '' : value).replace(/ /g, ' ').replace(/\s+/g, ' ').trim().replace(QUOTES, '').trim();
}

/* תבליט או מספור בתחילת שורה: מקף, נקודה, אימוג'י מספר (1️⃣), "1." או "1)". */
const BULLET = /^(?:[-–—•*·●▪◦►➤✔✓☑✅🔹🔸🔺🔻👉➖⭐]️?\s*|\d{1,2}[.)](?=\s|$)\s*|\(\d{1,2}\)\s*|\d{1,2}\s+-\s+|[0-9#*]️?⃣\s*|🔟\s*)/u;

/** שורה אחת נקייה: בלי תבליטים, מספור ומרכאות בקצוות. */
function cleanLine(value) {
  let t = String(value == null ? '' : value).replace(/ /g, ' ').trim();
  for (let i = 0; i < 5; i += 1) {
    const next = t.replace(BULLET, '').trim();
    if (next === t) break;
    t = next;
  }
  return t.replace(QUOTES, '').replace(/\s+/g, ' ').trim();
}

/** כותרת בתוך תא ("כאבים רגשיים:") או שארית קצרה מדי, לא שורה לסרטון. */
function headingLike(line) {
  if (!line) return true;
  if (/[:：]$/.test(line)) return true;
  if (line.replace(/[^\p{L}\p{N}]/gu, '').length < 4) return true;
  return false;
}

/** תא חופשי -> שורות: שורה לכל שורה בתא, בלי כותרות, בלי כפולות, עד 40. */
function splitCell(value) {
  const out = [];
  const seen = new Set();
  for (const raw of String(value == null ? '' : value).split(/\r?\n/)) {
    const line = cleanLine(raw);
    if (headingLike(line)) continue;
    const key = line.replace(/[^\p{L}\p{N}]+/gu, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
    if (out.length >= MAX_ROWS_PER_SECTION) break;
  }
  return out;
}

/** "קבוצה 1: נשים בעלות עסקים" -> "נשים בעלות עסקים". "קבוצה 4:" -> "". */
function groupLabel(header) {
  const h = normLabel(header);
  const m = h.match(/^קבוצה\s*\d*\s*[:：.\-–]?\s*(.*)$/);
  return (m ? m[1] : h).trim();
}

/**
 * rows[][] של "ניתוח קהל יעד" ->
 * { groups: [{ index, label, header, sections: [{ id, label, rows: [string] }] }] }
 * קבוצה בלי שם או בלי אף שורה לא נכנסת. נושא בלי שורות לא נכנס (למשל
 * "התוצאה" בקבצים שאין בהם את השאלה הזאת), ולכן גם הצ'יפ שלו לא מוצג.
 */
function parseAudienceTab(rows) {
  const table = Array.isArray(rows) ? rows : [];
  let headerAt = table.findIndex((r) => Array.isArray(r) && normLabel(r[0]).includes(AUDIENCE_HEADER));
  let columns;
  if (headerAt >= 0) {
    columns = [];
    const header = table[headerAt];
    for (let c = 1; c < header.length; c += 1) {
      const raw = normLabel(header[c]);
      if (!raw) continue;
      columns.push({ col: c, header: raw, label: groupLabel(raw) });
    }
  } else {
    /* בלי שורת הכותרת: עמודה B היא הקבוצה היחידה */
    headerAt = -1;
    columns = [{ col: 1, header: '', label: '' }];
  }

  /* השורה הראשונה שמתאימה לכל נושא, מתחת לשורת הכותרת */
  const sectionRow = new Map();
  for (let r = headerAt + 1; r < table.length; r += 1) {
    const row = table[r];
    if (!Array.isArray(row)) continue;
    const q = normLabel(row[0]);
    if (!q) continue;
    const def = AUDIENCE_SECTIONS.find((s) => !sectionRow.has(s.id) && s.match(q));
    if (def) sectionRow.set(def.id, r);
  }

  const groups = [];
  for (const column of columns) {
    if (headerAt >= 0 && !column.label) continue; // "קבוצה 4:" ריקה
    const sections = [];
    for (const def of AUDIENCE_SECTIONS) {
      if (!sectionRow.has(def.id)) continue;
      const lines = splitCell((table[sectionRow.get(def.id)] || [])[column.col]);
      if (lines.length) sections.push({ id: def.id, label: def.label, rows: lines });
    }
    if (!sections.length) continue;
    groups.push({ index: groups.length, label: column.label, header: column.header, sections });
  }
  return { groups };
}

/* ---------- פרסונה שיווקית ---------- */

/* תווית קצרה לכל שאלה לפי מילת מפתח. הסדר חשוב: הספציפי קודם. */
const PERSONA_LABELS = [
  { label: 'ביקורת מקצועית', match: (q) => q.includes('ביקורת') },
  { label: 'החלומות שלך', match: (q) => q.includes('חלומות') || q.includes('חלום') },
  { label: 'איפה חווית את הכאבים', match: (q) => /חוו|חיית|חווית/.test(q) && q.includes('כאב') },
  { label: 'אג׳נדה עסקית', match: (q) => /אג['׳]?נד/.test(q) && q.includes('עסק') },
  { label: 'אג׳נדה אישית', match: (q) => /אג['׳]?נד/.test(q) && q.includes('איש') },
  { label: 'אג׳נדות', match: (q) => /אג['׳]?נד/.test(q) },
  { label: 'ערכים', match: (q) => q.includes('ערכים') || q.includes('ערכי') },
  { label: 'מה הקהל צריך לשמוע', match: (q) => q.includes('לשמוע') },
  { label: 'במה את/ה שונה', match: (q) => q.includes('שונה') || q.includes('בידול') || q.includes('מבדל') || q.includes('מייחד') },
  { label: 'למה את/ה חזק/ה', match: (q) => q.includes('חזק') },
  { label: 'תוצאות', match: (q) => q.includes('תוצאות') || q.includes('תוצאה') },
  { label: 'הסיפור שלך', match: (q) => q.includes('סיפור') },
];

function personaLabel(question) {
  const q = normLabel(question);
  const hit = PERSONA_LABELS.find((p) => p.match(q));
  if (hit) return hit.label;
  const short = q.replace(/[?？]+$/, '').trim();
  return short.length > 28 ? `${short.slice(0, 26).trim()}…` : short;
}

/* תחילת שורה חדשה בתשובה ארוכה: כותרת markdown, "1." / "1)" או 1️⃣ */
const ROW_START = /^\s*(?:#{1,6}\s+|\d{1,2}[.)]\s+|[0-9]️?⃣|🔟)/u;

function stripRowStart(line) {
  return String(line).replace(/^\s*#{1,6}\s+/, '').replace(/^\s*(?:\d{1,2}[.)]\s+|[0-9]️?⃣\s*|🔟\s*)/u, '').trim();
}

function meaningful(text) {
  return text.replace(/[^\p{L}\p{N}]/gu, '').length >= 4;
}

/**
 * תשובה ארוכה -> שורות שכל אחת היא יחידה אחת (אג'נדה, סיפור, ערך):
 * - יש מספור או כותרות: כל אחד מהם פותח שורה, והשורות שאחריו שייכות אליו.
 * - אחרת, פסקאות (שורה ריקה ביניהן): כל פסקה שורה.
 * - אחרת, כמה שורות בלי שורה ריקה: כל שורה לבד.
 */
function splitPersonaAnswer(value) {
  const text = String(value == null ? '' : value).replace(/\r/g, '').replace(/ /g, ' ');
  const lines = text.split('\n');
  const rows = [];
  const push = (t) => {
    const v = t.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
    if (!v || !meaningful(v)) return;
    if (rows.length >= MAX_ROWS_PER_SECTION) return;
    rows.push(v);
  };

  if (lines.some((l) => ROW_START.test(l))) {
    let preamble = [];
    let current = null;
    for (const line of lines) {
      if (!line.trim()) continue;
      if (ROW_START.test(line)) {
        if (current !== null) push(current);
        current = stripRowStart(line);
      } else if (current === null) {
        preamble.push(line.trim());
      } else {
        current += `\n${cleanLine(line) || line.trim()}`;
      }
    }
    if (current !== null) push(current);
    /* פתיח לפני הפריט הראשון ("יש לי שלוש אג'נדות:") הוא כותרת, אלא אם יש בו תוכן */
    const pre = preamble.join(' ').trim();
    if (pre && !headingLike(pre)) rows.unshift(pre);
    if (rows.length > MAX_ROWS_PER_SECTION) rows.length = MAX_ROWS_PER_SECTION;
    return rows;
  }

  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length > 1) {
    for (const p of paragraphs) {
      const ls = p.split('\n').map((l) => cleanLine(l)).filter(Boolean);
      if (ls.length === 1 && headingLike(ls[0])) continue;
      push(ls.join('\n'));
    }
    return rows;
  }
  const single = paragraphs[0] || '';
  const ls = single.split('\n').map((l) => cleanLine(l)).filter(Boolean);
  if (ls.length > 1) {
    for (const l of ls) if (!headingLike(l)) push(l);
    return rows;
  }
  push(cleanLine(single));
  return rows;
}

/**
 * rows[][] של "פרסונה שיווקית" (שאלה | תשובה) ->
 * { groups: [{ index: 0, label: '', sections: [{ id, label, question, rows }] }] }
 */
function parsePersonaTab(rows) {
  const table = Array.isArray(rows) ? rows : [];
  const sections = [];
  const used = new Map();
  for (const row of table) {
    if (!Array.isArray(row)) continue;
    const question = normLabel(row[0]);
    const answer = row[1];
    if (!question || !String(answer == null ? '' : answer).trim()) continue;
    if (/^(שאלה|שאלות|תשובה|תשובות)$/.test(question)) continue;
    const parts = splitPersonaAnswer(answer);
    if (!parts.length) continue;
    let label = personaLabel(question);
    const n = (used.get(label) || 0) + 1;
    used.set(label, n);
    if (n > 1) label = `${label} ${n}`;
    sections.push({ id: `p${sections.length + 1}`, label, question, rows: parts });
  }
  return { groups: sections.length ? [{ index: 0, label: '', header: '', sections }] : [] };
}

module.exports = {
  AUDIENCE_TAB,
  PERSONA_TAB,
  AUDIENCE_SECTIONS,
  MAX_ROWS_PER_SECTION,
  pickAudienceTab,
  pickPersonaTab,
  parseAudienceTab,
  parsePersonaTab,
  splitCell,
  splitPersonaAnswer,
  personaLabel,
  cleanLine,
  groupLabel,
};
