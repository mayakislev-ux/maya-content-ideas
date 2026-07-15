const { google } = require('googleapis');
const { defineSecret } = require('firebase-functions/params');

const sheetsServiceAccountKey = defineSecret('SHEETS_SERVICE_ACCOUNT_KEY');
const SHEETS_URL_PATTERN = /https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;

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
        if (!rows.length) return '';
        const tabText = rows.map((row) => row.join(' | ')).join('\n');
        return `--- לשונית: ${tabTitles[i]} ---\n${tabText}`;
      })
      .filter(Boolean);

    if (!sections.length) return null;
    return sections.join('\n\n').slice(0, 20000);
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
