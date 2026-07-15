const SHEETS_URL_PATTERN = /https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;

async function fetchSheetsContent(text) {
  if (!text) return null;
  const match = text.match(SHEETS_URL_PATTERN);
  if (!match) return null;

  const sheetId = match[1];
  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;

  let response;
  try {
    response = await fetch(exportUrl);
  } catch (err) {
    console.error('Network error fetching Google Sheet:', err);
    return { error: true };
  }

  if (!response.ok) {
    console.error('Google Sheet export not accessible, status:', response.status);
    return { error: true };
  }

  const csv = await response.text();
  return { error: false, csv: csv.slice(0, 8000) };
}

module.exports = { fetchSheetsContent };
