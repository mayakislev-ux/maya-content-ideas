/* 11/11/2026 (מאיה: "שהיא מכירה את הלקוחה... ימי מפגש"): לוח המפגשים של
   המחזורים. אותו קובץ שממנו יוצאות התזכורות בווטסאפ (מאגר ציבורי), כך שאין
   לוח נוסף לעדכן. נקרא פעם ביום ונשמר במכשיר. */

const CSV_URL = 'https://raw.githubusercontent.com/mayakislev-ux/maya-session-reminders-agent/master/%D7%9C%D7%95%D7%97-%D7%9E%D7%A4%D7%92%D7%A9%D7%99%D7%9D.csv';
const CACHE_KEY = 'moach.sessionsCache';

/** שורת CSV עם מירכאות */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** [{ cohort, date, time, kind, place }] בלי שדות פנימיים (קישורים, קבוצות) */
export function parseSessions(csv) {
  const lines = String(csv || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = splitCsvLine(lines[0]).map((h) => h.trim());
  const col = (name) => head.indexOf(name);
  const iC = col('מחזור'); const iD = col('תאריך_מפגש'); const iT = col('שעה'); const iK = col('סוג_מפגש'); const iN = col('הערות');
  if (iC < 0 || iD < 0) return [];
  return lines.slice(1).map((l) => {
    const r = splitCsvLine(l);
    const notes = String(r[iN] || '');
    return {
      cohort: String(r[iC] || '').trim(),
      date: String(r[iD] || '').trim(),
      time: String(r[iT] || '').trim(),
      kind: String(r[iK] || '').trim(),
      /* "בני ברק | 10:00-15:00" -> "בני ברק". בזום: "זום" */
      place: notes.split('|')[0].trim(),
    };
  }).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date));
}

/** "7", "מחזור 7" -> "מחזור 7" */
export function cohortLabel(c) {
  const n = String(c || '').match(/\d+/);
  return n ? `מחזור ${n[0]}` : '';
}

/** המפגש של היום, מחר או אתמול: { when: 'today'|'tomorrow'|'yesterday', session } */
export function sessionMoment(sessions, cohort, day, addDays) {
  const label = cohortLabel(cohort);
  if (!label || !Array.isArray(sessions)) return null;
  const mine = sessions.filter((s) => s.cohort === label);
  const find = (d) => mine.find((s) => s.date === d);
  const today = find(day);
  if (today) return { when: 'today', session: today };
  const tomorrow = find(addDays(day, 1));
  if (tomorrow) return { when: 'tomorrow', session: tomorrow };
  const yesterday = find(addDays(day, -1));
  if (yesterday) return { when: 'yesterday', session: yesterday };
  return null;
}

/** מה היא אומרת על המפגש. hour: השעה בישראל (אחרי סוף המפגש כבר שואלים איך היה) */
export function sessionLine(m, hour = null) {
  if (!m) return '';
  const s = m.session;
  if (m.when === 'today' && hour != null) {
    const start = Number(String(s.time || '').split(':')[0]);
    const end = Number.isFinite(start) && start > 0 ? start + 5 : 15;
    if (hour >= end) return 'איך היה היום במפגש? 🤩';
  }
  const zoom = /זום/.test(s.kind) || /זום/.test(s.place);
  const where = zoom ? 'בזום' : (s.place ? `ב${s.place}` : '');
  const at = s.time ? `ב-${s.time}` : '';
  if (m.when === 'today') return `היום נפגשים! ${at} ${where}, נתראה 💛`.replace(/\s+/g, ' ').replace(' ,', ',');
  if (m.when === 'tomorrow') return `מחר נפגשים ${at} ${where} 🗓️ מגיעים עם סרטון?`.replace(/\s+/g, ' ');
  return 'איך היה המפגש אתמול? 🤩 יאללה, ממשיכים מאיפה שעצרנו';
}

/** מה שנשמר במכשיר, מיד (גם אם מאתמול), כדי שהברכה הראשונה של היום תדע */
export function cachedSessions() {
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return (c && Array.isArray(c.list)) ? c.list : null; } catch { return null; }
}

/** הלוח, פעם ביום (נשמר במכשיר). כשל רשת: מה שנשמר, או ריק */
export async function loadSessions(day) {
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { cached = null; }
  if (cached && cached.day === day && Array.isArray(cached.list)) return cached.list;
  try {
    const res = await fetch(CSV_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    const list = parseSessions(await res.text());
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ day, list })); } catch { /* בלי אחסון */ }
    return list;
  } catch {
    return (cached && cached.list) || [];
  }
}
