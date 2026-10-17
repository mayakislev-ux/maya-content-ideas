/**
 * Reconstructed backup (2026-07-25) of the live WhatsApp session-reminders agent.
 *
 * Why this file exists: the version actually running in production (Firebase project
 * content-ideas-becd7, functions agentSessionReminders / agentTaskMessage /
 * agentPodcastFollowup / agentZoomLink / agentDateBased08 / agentDateBased09 /
 * agentDateBased10 / agentDateBased14) was deployed directly and was never committed
 * to any git repo - there was no source-controlled copy anywhere on disk. This file is
 * a faithful port of the ORIGINAL, still-versioned Python scripts in
 * github.com/mayakislev-ux/maya-session-reminders-agent (שלח_תזכורות_אוטומטי.py,
 * שלח_הודעת_משימות_אוטומטי.py, שלח_הודעת_פודקאסט_אוטומטי.py,
 * שלח_קישור_זום_אוטומטי.py, שלח_הודעה_לפי_תאריך_אוטומטי.py) plus the documented
 * behavior in the session-reminders-agent-status memory file.
 *
 * IMPORTANT: this file has been written to disk and committed as a real backup, but it
 * has deliberately NOT been deployed (no `firebase deploy` was run). The live functions
 * are untouched. Before ever deploying this, verify secret names, region, and the exact
 * cron schedules against the real deployed config (this reconstruction's schedule times
 * are best-effort from documentation, not pulled from the live source).
 *
 * The known CSV parsing gotcha is preserved here on purpose: these CSVs contain literal
 * Hebrew gershayim characters (e.g. ע"י) mid-field, not real CSV quoting - a normal CSV
 * parser that treats every `"` as a quote-toggle silently merges rows. parseCsv() below
 * only treats `"` as the start of a quoted field when it is the very first character of
 * that field, matching Python's csv module (which never had this bug).
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const quiet = require('./quietDays');

/**
 * כתובת הבסיס של גרין, נגזרת ממזהה המופע.
 *
 * 11/10/2026: הדומיין המשותף api.green-api.com יושב על ענן רוסי ונחסם
 * מהרשת של מאיה, בלי פרוקסי ובלי חוק בחומת אש. הדומיין לכל מופע עובד,
 * והוא גם מה שגרין ממליצים עליו.
 */
function greenBase(idInstance) {
  const prefix = String(idInstance || '').slice(0, 4);
  return prefix ? `https://${prefix}.api.greenapi.com` : 'https://api.greenapi.com';
}

/**
 * כתובת המדיה של גרין, לשליחת קבצים. גם media.green-api.com חסום
 * מהרשת של מאיה (TCP 443 נכשל), והדומיין לכל מופע עונה.
 */
function greenMediaBase(idInstance) {
  const prefix = String(idInstance || '').slice(0, 4);
  return prefix ? `https://${prefix}.media.greenapi.com` : 'https://media.greenapi.com';
}


const greenApiIdInstance = defineSecret('GREEN_API_ID_INSTANCE');
const greenApiTokenInstance = defineSecret('GREEN_API_TOKEN_INSTANCE');

/* 12/10/2026: כאן היה 'main', והענף בריפו נקרא 'master'. כל קריאה
   ללוח המפגשים ולתבניות החזירה 404, ולכן הסוכן לא ידע שיש מפגש בכלל
   ולא שלח כלום. התזכורת למפגש של מחזור 6 ב-13/10 לא יצאה, ומאיה גילתה
   את זה יום לפני. אומת: main מחזיר 404, master מחזיר את הקובץ. */
const REPO_RAW_BASE = 'https://raw.githubusercontent.com/mayakislev-ux/maya-session-reminders-agent/master';
const HEBREW_WEEKDAYS = { 1: 'שני', 2: 'שלישי', 3: 'רביעי', 4: 'חמישי', 5: 'שישי', 6: 'שבת', 0: 'ראשון' };
const MIME_TYPES = { '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };

function israelToday() {
  // en-CA gives YYYY-MM-DD directly, in the Asia/Jerusalem calendar day.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

/** Parses CSV text the same way Python's csv.DictReader does for this project's files:
 * a `"` only starts a quoted field when it is the first character of that field -
 * mid-field gershayim (ע"י) are treated as plain text, never as quote-toggles. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let atFieldStart = true;
  let i = 0;
  const s = text.replace(/\r\n/g, '\n');
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && atFieldStart) { inQuotes = true; atFieldStart = false; i++; continue; }
    if (c === ',') { row.push(field); field = ''; atFieldStart = true; i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; atFieldStart = true; i++; continue; }
    field += c; atFieldStart = false; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1)
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''))
    .map((r) => {
      const obj = {};
      header.forEach((h, idx) => { obj[h] = r[idx] ?? ''; });
      return obj;
    });
}

async function fetchRaw(path) {
  const res = await fetch(`${REPO_RAW_BASE}/${path}`);
  if (!res.ok) return null;
  return res.text();
}

async function fetchRawBuffer(path) {
  const res = await fetch(`${REPO_RAW_BASE}/${encodeURI(path)}`);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

function extOf(name) {
  const m = /\.[^.]+$/.exec(name || '');
  return m ? m[0].toLowerCase() : '';
}

async function sendGreenApiMessage(idInstance, token, chatId, message) {
  const url = `${greenBase(idInstance)}/waInstance${idInstance}/SendMessage/${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message }),
  });
  const raw = await res.text();
  return { ok: raw.includes('"idMessage"'), raw };
}

async function sendGreenApiFile(idInstance, token, chatId, mediaPath, caption) {
  const buf = await fetchRawBuffer(mediaPath);
  if (!buf) return { ok: false, raw: `media not found in repo: ${mediaPath}` };
  const mime = MIME_TYPES[extOf(mediaPath)] || 'application/octet-stream';
  const url = `${greenMediaBase(idInstance)}/waInstance${idInstance}/SendFileByUpload/${token}`;
  const form = new FormData();
  form.append('chatId', chatId);
  form.append('file', new Blob([buf], { type: mime }), mediaPath.split('/').pop());
  if (caption) form.append('caption', caption);
  const res = await fetch(url, { method: 'POST', body: form });
  const raw = await res.text();
  return { ok: raw.includes('"idMessage"'), raw };
}

async function sendGreenApiPoll(idInstance, token, chatId, question, options) {
  const url = `${greenBase(idInstance)}/waInstance${idInstance}/SendPoll/${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message: question, options: options.map((o) => ({ optionName: o })) }),
  });
  const raw = await res.text();
  return { ok: raw.includes('"idMessage"'), raw };
}

function parsePollTemplate(template) {
  const lines = template.split('\n');
  if (!lines.length || lines[0].trim() !== '###POLL###') return null;
  const question = (lines[1] || '').trim();
  const options = lines.slice(2).map((l) => l.trim()).filter(Boolean);
  return { question, options };
}

// new Date(`${dateStr}T00:00:00`) parses as LOCAL time, but .toISOString()
// always serializes back in UTC - on a server whose local time isn't UTC+0
// (Cloud Functions containers, or Israel's own UTC+2/+3), that round-trip
// silently shifts the extracted date backward by a day. Constructing via
// Date.UTC() from the start (and reading back with the UTC getters) keeps
// the calendar date stable no matter what timezone the process runs in -
// israelToday() itself is unaffected (it derives the day from a real
// Asia/Jerusalem clock read, not from this construct-then-serialize dance).
function parseDateUTC(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Reminder date: 1 day before the session, except Saturday (no sends that day) ->
 * 3 days before (so a Sunday session reminds on Thursday, not the skipped Saturday). */
function reminderDateFor(sessionDateStr) {
  const d = parseDateUTC(sessionDateStr);
  const candidate = new Date(d);
  candidate.setUTCDate(candidate.getUTCDate() - 1);
  if (candidate.getUTCDay() === 6) { // Saturday
    candidate.setUTCDate(d.getUTCDate() - 3);
  }
  return candidate.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = parseDateUTC(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function renderReminder(template, row, sessionDateStr, sendDateStr) {
  const sessionDate = parseDateUTC(sessionDateStr);
  const weekday = HEBREW_WEEKDAYS[sessionDate.getUTCDay()];
  const gapDays = Math.round((sessionDate - parseDateUTC(sendDateStr)) / 86400000);
  const timeRef = gapDays === 1 ? 'מחר' : `ביום ${weekday}`;
  const [, mm, dd] = sessionDateStr.split('-');
  return template
    .replace('{התייחסות_זמן}', timeRef)
    .replace('{יום_בשבוע}', weekday)
    .replace('{תאריך}', `${dd}.${mm}`)
    .replace('{שעה}', row['שעה'] || '')
    .replace('{הערות}', row['הערות'] || '')
    .replace('{מחזור}', row['מחזור'] || '')
    .replace('{לינק}', (row['לינק_זום'] || '').trim() || '⚠️ אין עדיין לינק זום בטבלה');
}

async function loadScheduleRows() {
  const text = await fetchRaw('לוח-מפגשים.csv');
  return text ? parseCsv(text) : [];
}
async function loadDateBasedRows() {
  const text = await fetchRaw('הודעות-לפי-תאריך.csv');
  return text ? parseCsv(text) : [];
}

function creds() {
  return { id: greenApiIdInstance.value(), token: greenApiTokenInstance.value() };
}

/**
 * האם מותר לשלוח עכשיו: 9:00 עד 19:00, ולא בשישי, שבת, כיפור, פסח,
 * יום הזיכרון וכו'.
 *
 * 12/10/2026 (מאיה: "7:07 זה לא שעות העבודה"): לסוכנים האלה לא הייתה
 * שום בדיקה כזאת, בניגוד לכל שולח אחר במערכת. הם היו שולחים ללקוחות
 * בשבת ובכיפור, ושניים מהם תוזמנו ל-07:07 ול-08:07, לפני תחילת
 * שעות העבודה.
 *
 * השומר כאן הוא רשת ביטחון מעל התזמון עצמו: גם אם מישהו יזיז cron
 * לשעה לא נכונה בעתיד, שום הודעה לא תצא ללקוחה מחוץ לחלון.
 */
function mayRunNow(logger, name) {
  if (quiet.canRemindNow(new Date(), { from: 9, to: 19 })) return true;
  logger.log(`⏸ ${name}: מחוץ לשעות השליחה או יום שקט, לא נשלח כלום`);
  return false;
}

// ---- agentSessionReminders: reminder the day before each session (Saturday-aware) ----
async function runSessionReminders(logger) {
  if (!mayRunNow(logger, 'תזכורות מפגשים')) return;
  const today = israelToday();
  const rows = await loadScheduleRows();
  const { id, token } = creds();
  for (const row of rows) {
    const sessionDate = row['תאריך_מפגש'];
    if (!sessionDate || reminderDateFor(sessionDate) !== today) continue;
    const chatId = (row['chatId_ווטסאפ'] || '').trim();
    const sessionType = row['סוג_מפגש'];
    const reminderName = (row['תזכורת_שם'] || '').trim() || sessionType;
    const label = `מחזור '${row['מחזור']}' מפגש ${sessionDate} (${sessionType})`;
    if (!chatId.endsWith('@g.us')) { logger.warn(`⛔ דילוג: ${label} - אין chatId אמיתי בטבלה.`); continue; }
    const rawTemplate = await fetchRaw(`תבניות-הודעות/${reminderName}.txt`);
    if (rawTemplate == null) { logger.warn(`⛔ דילוג: ${label} - אין תבנית '${reminderName}'.`); continue; }
    const template = rawTemplate.split('--- הוראה:')[0].trim();
    const caption = renderReminder(template, row, sessionDate, today);
    const mediaName = (row['מדיה_מצורפת'] || '').trim();
    if (mediaName) {
      const { ok, raw } = await sendGreenApiFile(id, token, chatId, `תבניות-הודעות/${mediaName}`, caption);
      logger.log(ok ? `✅ נשלח (מדיה): ${label}` : `❌ שגיאה בשליחה: ${label} -> ${raw}`);
    } else {
      const { ok, raw } = await sendGreenApiMessage(id, token, chatId, caption);
      logger.log(ok ? `✅ נשלח: ${label}` : `❌ שגיאה בשליחה: ${label} -> ${raw}`);
    }
  }
}

// ---- agentTaskMessage: task/follow-up message on the day of the session itself ----
async function runTaskMessage(logger) {
  if (!mayRunNow(logger, 'משימות אחרי מפגש')) return;
  const today = israelToday();
  const rows = await loadScheduleRows();
  const { id, token } = creds();
  for (const row of rows) {
    const sessionDate = row['תאריך_מפגש'];
    if (sessionDate !== today) continue;
    const chatId = (row['chatId_ווטסאפ'] || '').trim();
    const sessionType = row['סוג_מפגש'];
    const taskName = (row['משימות_שם'] || '').trim();
    const label = `מחזור '${row['מחזור']}' מפגש ${sessionDate} (${sessionType})`;
    if (!chatId.endsWith('@g.us')) { logger.warn(`⛔ דילוג (משימות): ${label} - אין chatId אמיתי.`); continue; }
    if (!taskName) { logger.warn(`⛔ דילוג (משימות): ${label} - אין משימות_שם.`); continue; }
    const template = await fetchRaw(`תבניות-הודעות/משימות-אחרי-מפגש/${taskName}.txt`);
    if (template == null) { logger.warn(`⛔ דילוג (משימות): ${label} - אין תבנית '${taskName}'.`); continue; }
    const mediaName = (row['משימות_מדיה'] || '').trim();
    if (mediaName) {
      const { ok, raw } = await sendGreenApiFile(id, token, chatId, `תבניות-הודעות/${mediaName}`, template);
      logger.log(ok ? `✅ נשלחה הודעת משימות: ${label}` : `❌ שגיאה: ${label} -> ${raw}`);
    } else {
      const { ok, raw } = await sendGreenApiMessage(id, token, chatId, template);
      logger.log(ok ? `✅ נשלחה הודעת משימות: ${label}` : `❌ שגיאה: ${label} -> ${raw}`);
    }
  }
}

// ---- agentPodcastFollowup: banner+caption then separate audio, one day after a frontal session ----
async function runPodcastFollowup(logger) {
  if (!mayRunNow(logger, 'פודקאסט')) return;
  const today = israelToday();
  const rows = await loadScheduleRows();
  const { id, token } = creds();
  for (const row of rows) {
    const sessionType = row['סוג_מפגש'] || '';
    if (!sessionType.startsWith('פרונטלי')) continue;
    const sessionDate = row['תאריך_מפגש'];
    if (!sessionDate || addDays(sessionDate, 1) !== today) continue;
    const chatId = (row['chatId_ווטסאפ'] || '').trim();
    const podcastName = (row['פודקאסט_שם'] || '').trim();
    const label = `מחזור '${row['מחזור']}' מפגש ${sessionDate} (${sessionType})`;
    if (!chatId.endsWith('@g.us')) { logger.warn(`⛔ דילוג (פודקאסט): ${label} - אין chatId אמיתי.`); continue; }
    if (!podcastName) { logger.warn(`⛔ דילוג (פודקאסט): ${label} - אין פודקאסט_שם.`); continue; }
    const caption = await fetchRaw(`תבניות-הודעות/פודקאסט-אחרי-מפגש/${podcastName}.txt`);
    if (caption == null) { logger.warn(`⛔ דילוג (פודקאסט): ${label} - אין תבנית '${podcastName}'.`); continue; }
    const imageName = (row['פודקאסט_תמונה'] || '').trim();
    const audioName = (row['פודקאסט_אודיו'] || '').trim();
    if (!imageName) { logger.warn(`⛔ דילוג (פודקאסט): ${label} - חסרה תמונת באנר.`); continue; }
    if (!audioName) { logger.warn(`⛔ דילוג (פודקאסט): ${label} - חסר קובץ אודיו.`); continue; }
    const r1 = await sendGreenApiFile(id, token, chatId, `תבניות-הודעות/${imageName}`, caption);
    if (!r1.ok) { logger.error(`❌ שגיאה בשליחת באנר הפודקאסט: ${label} -> ${r1.raw}`); continue; }
    const r2 = await sendGreenApiFile(id, token, chatId, `תבניות-הודעות/${audioName}`, null);
    logger.log(r2.ok ? `✅ נשלחה הודעת פודקאסט: ${label}` : `⚠️ באנר נשלח, אודיו נכשל: ${label} -> ${r2.raw}`);
  }
}

// ---- agentZoomLink: link reminder the morning of a zoom session, once link+code are filled in ----
async function runZoomLink(logger) {
  if (!mayRunNow(logger, 'קישור זום')) return;
  const today = israelToday();
  const rows = await loadScheduleRows();
  const { id, token } = creds();
  for (const row of rows) {
    const linkName = (row['לינק_זום_שם'] || '').trim();
    if (!linkName) continue;
    const sessionDate = row['תאריך_מפגש'];
    if (sessionDate !== today) continue;
    const chatId = (row['chatId_ווטסאפ'] || '').trim();
    const label = `מחזור '${row['מחזור']}' מפגש ${sessionDate} (קישור-זום: ${linkName})`;
    if (!chatId.endsWith('@g.us')) { logger.warn(`⛔ דילוג (זום): ${label} - אין chatId אמיתי.`); continue; }
    const template = await fetchRaw(`תבניות-הודעות/קישור-זום/${linkName}.txt`);
    if (template == null) { logger.warn(`⛔ דילוג (זום): ${label} - אין תבנית '${linkName}'.`); continue; }
    const link = (row['לינק_זום'] || '').trim();
    const code = (row['קוד_זום'] || '').trim();
    if (!link || !code) { logger.warn(`⛔ דילוג (זום): ${label} - עדיין אין לינק/קוד אמיתיים.`); continue; }
    const message = template.replace('{לינק}', link).replace('{קוד}', code);
    const { ok, raw } = await sendGreenApiMessage(id, token, chatId, message);
    logger.log(ok ? `✅ נשלחה הודעת קישור זום: ${label}` : `❌ שגיאה: ${label} -> ${raw}`);
  }
}

// ---- agentDateBasedNN: exact-date one-off messages, filtered to this routine's hour ----
async function runDateBased(logger, hourFilter) {
  if (!mayRunNow(logger, 'הודעות לפי תאריך')) return;
  const today = israelToday();
  const rows = await loadDateBasedRows();
  const { id, token } = creds();
  for (const row of rows) {
    if (row['תאריך_שליחה'] !== today) continue;
    if (hourFilter && !(row['שעה'] || '').trim().startsWith(hourFilter)) continue;
    const chatId = (row['chatId_ווטסאפ'] || '').trim();
    const messageType = row['סוג_הודעה'];
    const label = `מחזור '${row['מחזור']}' הודעה '${messageType}' (${row['תאריך_שליחה']})`;
    if (!chatId.endsWith('@g.us')) { logger.warn(`⛔ דילוג: ${label} - אין chatId אמיתי.`); continue; }
    const template = await fetchRaw(`תבניות-הודעות/${messageType}.txt`);
    if (template == null) { logger.warn(`⛔ דילוג: ${label} - אין תבנית.`); continue; }
    const poll = parsePollTemplate(template);
    if (poll) {
      const { ok, raw } = await sendGreenApiPoll(id, token, chatId, poll.question, poll.options);
      logger.log(ok ? `✅ נשלח פול: ${label}` : `❌ שגיאה בשליחת פול: ${label} -> ${raw}`);
      continue;
    }
    const mediaName = (row['מדיה'] || '').trim();
    const audioName = (row['אודיו'] || '').trim();
    if (mediaName) {
      const r1 = await sendGreenApiFile(id, token, chatId, `תבניות-הודעות/${mediaName}`, template);
      if (!r1.ok) { logger.error(`❌ שגיאה: ${label} -> ${r1.raw}`); continue; }
    } else {
      const r1 = await sendGreenApiMessage(id, token, chatId, template);
      if (!r1.ok) { logger.error(`❌ שגיאה: ${label} -> ${r1.raw}`); continue; }
    }
    if (audioName) {
      const r2 = await sendGreenApiFile(id, token, chatId, `תבניות-הודעות/${audioName}`, null);
      logger.log(r2.ok ? `✅ נשלחה הודעה (כולל אודיו): ${label}` : `⚠️ אודיו נכשל: ${label} -> ${r2.raw}`);
    } else {
      logger.log(`✅ נשלחה הודעה: ${label}`);
    }
  }
}

const secrets = [greenApiIdInstance, greenApiTokenInstance];
const region = 'us-central1';

// Schedule times are best-effort from documentation (memory + Python filenames), NOT
// pulled from the live deployed config - verify against the real schedule before
// ever deploying this file.
exports.agentSessionReminders = onSchedule({ schedule: '5 9 * * *', timeZone: 'Asia/Jerusalem', region, secrets }, (event) => runSessionReminders(console));
exports.agentTaskMessage = onSchedule({ schedule: '7 16 * * *', timeZone: 'Asia/Jerusalem', region, secrets }, (event) => runTaskMessage(console));
exports.agentPodcastFollowup = onSchedule({ schedule: '7 9 * * *', timeZone: 'Asia/Jerusalem', region, secrets }, (event) => runPodcastFollowup(console));
exports.agentZoomLink = onSchedule({ schedule: '32 9 * * *', timeZone: 'Asia/Jerusalem', region, secrets }, (event) => runZoomLink(console));
exports.agentDateBased08 = onSchedule({ schedule: '7 9 * * *', timeZone: 'Asia/Jerusalem', region, secrets }, (event) => runDateBased(console, '08'));
exports.agentDateBased09 = onSchedule({ schedule: '7 9 * * *', timeZone: 'Asia/Jerusalem', region, secrets }, (event) => runDateBased(console, '09'));
exports.agentDateBased10 = onSchedule({ schedule: '7 10 * * *', timeZone: 'Asia/Jerusalem', region, secrets }, (event) => runDateBased(console, '10'));
exports.agentDateBased14 = onSchedule({ schedule: '7 14 * * *', timeZone: 'Asia/Jerusalem', region, secrets }, (event) => runDateBased(console, '14'));
/* 12/10/2026: בטבלת ההודעות לפי תאריך יש הודעה שתוזמנה ל-17:00, ולא
   היה לה סוכן בכלל. היא לא נשלחה מעולם, ושום דבר לא התריע. */
exports.agentDateBased17 = onSchedule({ schedule: '7 17 * * *', timeZone: 'Asia/Jerusalem', region, secrets }, (event) => runDateBased(console, '17'));

/* 17/10/2026 (מאיה: "אני חייבת מחר אוטומציה לשעה 9:00 בבוקר בדיוק, שיעבוד
   בוודאות גם בלי מחשב"). הסוכנים של הודעות לפי תאריך רצים ב-X:07, ולכן
   לשליחה "בדיוק" יש תג שעה משלה בטבלה: שעה שמתחילה ב-"=" (למשל =09:00).
   אף סוכן קיים לא תופס אותה, כי "=09:00" לא מתחיל ב-"09".

   ההבדל מ-runDateBased: כאן כל שליחה נרשמת ב-exactSends לפני שהיא יוצאת,
   ויש ריצת גיבוי עשר דקות אחר כך שמשלימה רק את מה שלא יצא (הטקסט או
   ההקלטה). תקלה לא ודאית (רשת שנפלה באמצע) לא נשלחת שוב, כי זה בדיוק מה
   שגרם לכפילות האמיתית ב-26/07; במקום זה מאיה מקבלת הודעה לבדוק.
   בסוף, מאיה מקבלת אישור לטלפון הפרטי שלה. */
const MAYA_PRIVATE = '972525533679@c.us';

async function runExactDateBased(logger, tag, { pass = 'main' } = {}) {
  if (!mayRunNow(logger, `הודעות בדיוק ${tag}`)) return;
  const admin = require('firebase-admin');
  const db = admin.firestore();
  const today = israelToday();
  const rows = (await loadDateBasedRows()).filter(
    (r) => r['תאריך_שליחה'] === today && (r['שעה'] || '').trim() === tag
  );
  if (rows.length === 0) return;
  const { id, token } = creds();
  for (const row of rows) {
    const chatId = (row['chatId_ווטסאפ'] || '').trim();
    const type = row['סוג_הודעה'];
    const label = `מחזור '${row['מחזור']}' הודעה '${type}' (${today} ${tag})`;
    if (!chatId.endsWith('@g.us')) { logger.warn(`⛔ דילוג: ${label} - אין chatId אמיתי.`); continue; }
    const template = await fetchRaw(`תבניות-הודעות/${type}.txt`);
    if (template == null) {
      logger.error(`❌ ${label} - אין תבנית, לא נשלח כלום`);
      await sendGreenApiMessage(id, token, MAYA_PRIVATE, `⚠️ ההודעה המתוזמנת "${type}" לא יצאה: לא נמצאה התבנית שלה.`).catch(() => {});
      continue;
    }
    const mediaName = (row['מדיה'] || '').trim();
    const audioName = (row['אודיו'] || '').trim();
    const ref = db.collection('exactSends').doc(`${today}_${type}_${chatId}`.replace(/[/@.]/g, '_'));

    const claimed = await db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      const d = s.exists ? s.data() : {};
      if (d.status === 'uncertain') return null; // כבר דווח למאיה
      if (d.status === 'sending') {
        // ריצת הגיבוי מוצאת שליחה שנתקעה באמצע: לא ידוע אם יצאה. לא שולחים שוב
        if (pass === 'retry') { tx.set(ref, { status: 'uncertain' }, { merge: true }); return { stuck: true }; }
        return null;
      }
      if (d.textSent && (d.audioSent || !audioName)) return null; // הכל כבר יצא
      tx.set(ref, { status: 'sending', pass, label, chatId, at: new Date().toISOString() }, { merge: true });
      return d;
    });
    if (!claimed) { logger.log(`⏭ ${label}: כבר נשלח או בטיפול`); continue; }
    if (claimed.stuck) {
      logger.error(`❓ ${label}: השליחה הראשית נתקעה באמצע`);
      await sendGreenApiMessage(id, token, MAYA_PRIVATE,
        `⚠️ ההודעה "${type}" לקבוצת ${row['מחזור']}: השליחה של 9:00 נתקעה באמצע ולא ידוע אם יצאה. כדאי להציץ בקבוצה. המערכת לא תשלח שוב לבד.`).catch(() => {});
      continue;
    }

    let textSent = Boolean(claimed.textSent);
    let audioSent = Boolean(claimed.audioSent);
    try {
      if (!textSent) {
        const r1 = mediaName
          ? await sendGreenApiFile(id, token, chatId, `תבניות-הודעות/${mediaName}`, template)
          : await sendGreenApiMessage(id, token, chatId, template);
        textSent = r1.ok;
        if (!r1.ok) logger.error(`❌ טקסט נכשל: ${label} -> ${String(r1.raw).slice(0, 300)}`);
      }
      if (textSent && audioName && !audioSent) {
        const r2 = await sendGreenApiFile(id, token, chatId, `תבניות-הודעות/${audioName}`, null);
        audioSent = r2.ok;
        if (!r2.ok) logger.error(`❌ הקלטה נכשלה: ${label} -> ${String(r2.raw).slice(0, 300)}`);
      }
    } catch (err) {
      // רשת שנפלה באמצע: לא ידוע אם יצא. לא שולחים שוב, מבקשים ממאיה לבדוק
      await ref.set({ status: 'uncertain', textSent, audioSent, error: String(err && err.message).slice(0, 300) }, { merge: true });
      logger.error(`❓ ${label}: תקלה באמצע, לא ידוע אם יצא - ${err && err.message}`);
      await sendGreenApiMessage(id, token, MAYA_PRIVATE,
        `⚠️ ההודעה "${type}" לקבוצת ${row['מחזור']}: הייתה תקלה באמצע השליחה ולא ידוע אם יצאה. כדאי להציץ בקבוצה. המערכת לא תשלח שוב לבד כדי לא לשלוח פעמיים.`).catch(() => {});
      continue;
    }

    const done = textSent && (audioSent || !audioName);
    await ref.set({ status: done ? 'sent' : 'failed', textSent, audioSent, finishedAt: new Date().toISOString() }, { merge: true });
    if (done) {
      logger.log(`✅ נשלח בדיוק ב-${tag}: ${label}`);
      await sendGreenApiMessage(id, token, MAYA_PRIVATE,
        `✅ ההודעה "${type}" נשלחה עכשיו לקבוצת ההכרזות של ${row['מחזור']}${audioName ? ', כולל ההקלטה' : ''}.`).catch(() => {});
    } else if (pass === 'retry') {
      await sendGreenApiMessage(id, token, MAYA_PRIVATE,
        `⚠️ ההודעה "${type}" לקבוצת ${row['מחזור']} לא יצאה במלואה גם בניסיון החוזר (${textSent ? 'הטקסט יצא, ההקלטה לא' : 'לא יצא כלום'}). צריך לשלוח ידנית.`).catch(() => {});
    }
  }
}

exports.agentDateBasedExact0900 = onSchedule({ schedule: '0 9 * * *', timeZone: 'Asia/Jerusalem', region, secrets },
  () => runExactDateBased(console, '=09:00'));
exports.agentDateBasedExact0900Retry = onSchedule({ schedule: '10 9 * * *', timeZone: 'Asia/Jerusalem', region, secrets },
  () => runExactDateBased(console, '=09:00', { pass: 'retry' }));

/* 13/10/2026: הפעלה ידנית של הודעת המשימות, באותו רגע.
 *
 * מאיה ביקשה לשלוח את הודעת המשימות של מחזור 6 מיד ולא לחכות ל-16:07,
 * וההרצה הידנית דרך Cloud Scheduler דרשה ממנה לנווט בקונסולה ולא הצליחה.
 *
 * אותה לוגיקה בדיוק כמו הסוכן המתוזמן, כולל בדיקת ימים ושעות שקטות: רק
 * הטריגר שונה. המפתחות נשארים בענן ואף אחד לא שולף אותם החוצה, בדיוק
 * כמו ב-nightlyScriptsNow.
 *
 * אחרי שליחה ידנית צריך לרוקן את משימות_שם בשורה של היום בלוח המפגשים,
 * אחרת הריצה המתוזמנת תשלח את אותה הודעה שוב.
 */
const MANUAL_KEY = 'f6df8fd76498e7a2afa6056c7821a548';

exports.taskMessageNow = onRequest({ region, maxInstances: 1, secrets }, async (req, res) => {
  if (req.query.key !== MANUAL_KEY) { res.status(403).json({ ok: false }); return; }
  const logs = [];
  const logger = {
    log: (m) => logs.push(String(m)),
    warn: (m) => logs.push(`warn: ${m}`),
    error: (m) => logs.push(`error: ${m}`),
  };
  try {
    await runTaskMessage(logger);
    res.json({ ok: true, logs });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err && err.message), logs });
  }
});

module.exports._internal = { parseCsv, reminderDateFor, addDays, renderReminder, parsePollTemplate, runExactDateBased, sendGreenApiMessage, sendGreenApiFile, fetchRaw };
