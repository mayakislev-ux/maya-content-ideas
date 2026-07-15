const { google } = require('googleapis');
const { defineSecret } = require('firebase-functions/params');

const sheetsServiceAccountKey = defineSecret('SHEETS_SERVICE_ACCOUNT_KEY');
const SHEETS_URL_PATTERN = /https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;
const PRIORITY_TAB_KEYWORDS = ['פרסונה', 'קהל יעד', 'חימום', 'רעיונות', 'לידים'];
const MAX_CHARS_PER_TAB = 7000;
const MAX_SHEETS_CHARS = 120000;

async function fetchViaServiceAccount(sheetId) {
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
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

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

async function fetchViaPublicCsv(sheetId) {
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

async function fetchSheetsContent(text) {
  if (!text) return null;
  const match = text.match(SHEETS_URL_PATTERN);
  if (!match) return null;

  const sheetId = match[1];
  const viaServiceAccount = await fetchViaServiceAccount(sheetId);
  if (viaServiceAccount) return { error: false, content: viaServiceAccount };

  const viaCsv = await fetchViaPublicCsv(sheetId);
  if (viaCsv) return { error: false, content: viaCsv };

  return { error: true };
}

module.exports = { fetchSheetsContent, sheetsServiceAccountKey };
