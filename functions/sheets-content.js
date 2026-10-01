// 01/10/2026 (מאיה: "בניית תוכנית לוקחת יותר מדי זמן... יש דרך בחינם?"):
// המודול הזה נטען בכל הפעלה קרה של כל פונקציה בפרויקט, גם כשאף אחד לא
// צריך אותו. מדידה בפועל: googleapis 13.5 שניות, pdfkit 3, nodemailer 0.4,
// web-push 0.36. טעינה עצלה מזיזה את העלות לפונקציה שבאמת משתמשת בו,
// ובפעם הראשונה בלבד. זה לא עולה כלום.
let googleapis = null;
function loadGoogle() {
  if (!googleapis) googleapis = require('googleapis').google;
  return googleapis;
}
const { defineSecret } = require('firebase-functions/params');

const sheetsServiceAccountKey = defineSecret('SHEETS_SERVICE_ACCOUNT_KEY');
const SHEETS_URL_PATTERN = /https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/g;
const DOCS_URL_PATTERN = /https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/g;
const PRIORITY_TAB_KEYWORDS = ['פרסונה', 'קהל יעד', 'חימום', 'רעיונות', 'לידים'];
const MAX_CHARS_PER_TAB = 7000;
const MAX_SHEETS_CHARS = 120000;
const MAX_DOC_CHARS = 40000;

async function fetchSheetViaServiceAccount(sheetId) {
  let keyValue;
  try {
    keyValue = sheetsServiceAccountKey.value();
  } catch (err) {
    return null;
  }
  if (!keyValue) return null;

  let credentials;
  try {
    credentials = JSON.parse(keyValue);
  } catch (err) {
    console.error('Invalid SHEETS_SERVICE_ACCOUNT_KEY JSON:', err.message);
    return null;
  }

  try {
    const auth = new (loadGoogle()).auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = loadGoogle().sheets({ version: 'v4', auth });

    // A spreadsheet can have many tabs (audience tables, persona notes,
    // ideas, etc. often live on separate tabs, not the first/default one)
    // - fetching only a bare "A1:Z1000" range reads just the first tab and
    // silently misses everything else, so pull every tab explicitly.
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      fields: 'sheets.properties.title',
    });
    const tabTitles = (meta.data.sheets || []).map((s) => s.properties.title);
    if (!tabTitles.length) return null;

    const ranges = tabTitles.map((title) => `'${title}'!A1:Z1000`);
    const res = await sheets.spreadsheets.values.batchGet({ spreadsheetId: sheetId, ranges });

    const sections = (res.data.valueRanges || [])
      .map((valueRange, i) => {
        const rows = valueRange.values || [];
        if (!rows.length) return null;
        // Cap each tab individually - some tabs (persona/audience answers)
        // hold full paragraph-length content per cell and would otherwise
        // eat the entire shared budget, starving every tab that comes after.
        const tabText = rows.map((row) => row.join(' | ')).join('\n').slice(0, MAX_CHARS_PER_TAB);
        const title = tabTitles[i];
        const isPriority = PRIORITY_TAB_KEYWORDS.some((kw) => title.includes(kw));
        return { title, isPriority, text: `--- לשונית: ${title} ---\n${tabText}` };
      })
      .filter(Boolean);

    if (!sections.length) return null;

    // Put the tabs most likely to matter (audience/persona/ideas/leads)
    // first, so an overall size ceiling (if the sheet is huge) drops the
    // least important tabs rather than cutting these off arbitrarily.
    sections.sort((a, b) => (b.isPriority ? 1 : 0) - (a.isPriority ? 1 : 0));
    return sections
      .map((s) => s.text)
      .join('\n\n')
      .slice(0, MAX_SHEETS_CHARS);
  } catch (err) {
    console.error('Service account Sheets fetch failed:', err.message);
    return null;
  }
}

async function fetchSheetViaPublicCsv(sheetId) {
  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  let response;
  try {
    response = await fetch(exportUrl);
  } catch (err) {
    console.error('Network error fetching Google Sheet:', err);
    return null;
  }
  if (!response.ok) return null;
  const csv = await response.text();
  return csv.slice(0, 8000);
}

async function fetchOneSheet(sheetId) {
  const viaServiceAccount = await fetchSheetViaServiceAccount(sheetId);
  if (viaServiceAccount) return viaServiceAccount;
  return fetchSheetViaPublicCsv(sheetId);
}

// Docs don't go through the service account (that key is only scoped for
// Sheets, spreadsheets.readonly) - the public "export as plain text" link
// works the same way the Sheets CSV fallback already does, and needs the
// same "anyone with the link can view" sharing.
async function fetchOneDoc(docId) {
  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
  let response;
  try {
    response = await fetch(exportUrl);
  } catch (err) {
    console.error('Network error fetching Google Doc:', err);
    return null;
  }
  if (!response.ok) return null;
  const text = await response.text();
  return text.slice(0, MAX_DOC_CHARS);
}

// A user can paste more than one link in the same free-text field (e.g. a
// Sheets link for the audience table AND a Docs link with a pile of written
// ideas) - matching only the first Sheets link and silently ignoring
// everything else meant a real attached Docs file was never read at all.
// Fetches every Sheets and every Docs link found, combines whatever
// succeeded, and only reports an error if something was linked but nothing
// could actually be read.
async function fetchExtraContentLinks(text) {
  if (!text) return null;

  const sheetIds = [...text.matchAll(SHEETS_URL_PATTERN)].map((m) => m[1]);
  const docIds = [...text.matchAll(DOCS_URL_PATTERN)].map((m) => m[1]);
  if (!sheetIds.length && !docIds.length) return null;

  const [sheetResults, docResults] = await Promise.all([
    Promise.all(sheetIds.map((id) => fetchOneSheet(id))),
    Promise.all(docIds.map((id) => fetchOneDoc(id))),
  ]);

  const sections = [];
  sheetResults.forEach((content, i) => {
    if (content) sections.push(`=== מתוך Google Sheets (${sheetIds[i]}) ===\n${content}`);
  });
  docResults.forEach((content, i) => {
    if (content) sections.push(`=== מתוך Google Docs (${docIds[i]}) ===\n${content}`);
  });

  if (!sections.length) return { error: true };
  return { error: false, content: sections.join('\n\n') };
}

/**
 * 30/09/2026: טבלת החימום צריכה תאים, לא טקסט.
 *
 * fetchExtraContentLinks מחזיר את הגיליון כטקסט אחד שנועד להיכנס לפרומפט,
 * ושם המבנה נמחק בכוונה. לטבלה צריך בדיוק את ההפך, שורות ועמודות, כדי
 * לדעת שהעמודה של "קבוצה 2" היא העמודה של "קבוצה 2". לכן קריאה נפרדת.
 *
 * מחזיר { [tabTitle]: rows[][] } ללשוניות שנמצאו, או null כשאין גישה בכלל,
 * ואז מי שקורא יכול לומר ללקוחה משהו אמיתי במקום להציג טבלה ריקה.
 */
async function fetchSheetTabs(sheetId, tabTitles) {
  let keyValue;
  try {
    keyValue = sheetsServiceAccountKey.value();
  } catch (err) {
    return null;
  }
  if (!keyValue) return null;

  let credentials;
  try {
    credentials = JSON.parse(keyValue);
  } catch (err) {
    console.error('Invalid SHEETS_SERVICE_ACCOUNT_KEY JSON:', err.message);
    return null;
  }

  try {
    const auth = new (loadGoogle()).auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = loadGoogle().sheets({ version: 'v4', auth });

    // רק לשוניות שקיימות בפועל. batchGet על טווח של לשונית שאינה קיימת
    // מחזיר שגיאה לכל הבקשה ולא רק לאותה לשונית, ואז גם מה שכן היה נעלם.
    // הלקוחות מוחקות ומשנות לשוניות, אז זה קורה באמת.
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      fields: 'sheets.properties.title',
    });
    const present = (meta.data.sheets || []).map((s) => s.properties.title);
    const wanted = tabTitles.filter((t) => present.includes(t));
    if (!wanted.length) return {};

    const res = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId,
      ranges: wanted.map((t) => `'${t}'!A1:L120`),
    });
    const out = {};
    wanted.forEach((title, i) => {
      out[title] = ((res.data.valueRanges || [])[i] || {}).values || [];
    });
    return out;
  } catch (err) {
    console.error('fetchSheetTabs failed:', sheetId, err.message);
    return null;
  }
}

module.exports = { fetchExtraContentLinks, fetchSheetTabs, sheetsServiceAccountKey };
