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
const { defineSecret } = require('firebase-functions/params');

const greenApiIdInstance = defineSecret('GREEN_API_ID_INSTANCE');
const greenApiTokenInstance = defineSecret('GREEN_API_TOKEN_INSTANCE');

const REPO_RAW_BASE = 'https://raw.githubusercontent.com/mayakislev-ux/maya-session-reminders-agent/main';
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
  const url = `https://api.green-api.com/waInstance${idInstance}/SendMessage/${token}`;
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
  const url = `https://media.green-api.com/waInstance${idInstance}/SendFileByUpload/${token}`;
  const form = new FormData();
  form.append('chatId', chatId);
  form.append('file', new Blob([buf], { type: mime }), mediaPath.split('/').pop());
  if (caption) form.append('caption', caption);
  const res = await fetch(url, { method: 'POST', body: form });
  const raw = await res.text();
  return { ok: raw.includes('"idMessage"'), raw };
}

async function sendGreenApiPoll(idInstance, token, chatId, question, options) {
  const url = `https://api.green-api.com/waInstance${idInstance}/SendPoll/${token}`;
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

// ---- agentSessionReminders: reminder the day before each session (Saturday-aware) ----
async function runSessionReminders(logger) {
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
exports.agentSessionReminders = onSchedule({ schedule: '7 7 * * *', timeZone: 'Asia/Jerusalem', region, secrets }, (event) => runSessionReminders(console));
exports.agentTaskMessage = onSchedule({ schedule: '7 16 * * *', timeZone: 'Asia/Jerusalem', region, secrets }, (event) => runTaskMessage(console));
exports.agentPodcastFollowup = onSchedule({ schedule: '7 9 * * *', timeZone: 'Asia/Jerusalem', region, secrets }, (event) => runPodcastFollowup(console));
exports.agentZoomLink = onSchedule({ schedule: '32 9 * * *', timeZone: 'Asia/Jerusalem', region, secrets }, (event) => runZoomLink(console));
exports.agentDateBased08 = onSchedule({ schedule: '7 8 * * *', timeZone: 'Asia/Jerusalem', region, secrets }, (event) => runDateBased(console, '08'));
exports.agentDateBased09 = onSchedule({ schedule: '7 9 * * *', timeZone: 'Asia/Jerusalem', region, secrets }, (event) => runDateBased(console, '09'));
exports.agentDateBased10 = onSchedule({ schedule: '7 10 * * *', timeZone: 'Asia/Jerusalem', region, secrets }, (event) => runDateBased(console, '10'));
exports.agentDateBased14 = onSchedule({ schedule: '7 14 * * *', timeZone: 'Asia/Jerusalem', region, secrets }, (event) => runDateBased(console, '14'));

module.exports._internal = { parseCsv, reminderDateFor, addDays, renderReminder, parsePollTemplate };
