// ─────────────────────────────────────────────────────────────────
//  Back on Track — Google Apps Script
//
//  SETUP:
//  1. Open your Google Sheet
//  2. Extensions → Apps Script → delete all → paste this → Save
//  3. Deploy → New deployment → Web app
//     - Execute as: Me
//     - Who has access: Anyone
//  4. Click Deploy → copy the URL ending in /exec
//  5. Paste that URL into index.html where it says YOUR_APPS_SCRIPT_URL_HERE
//  6. Re-upload index.html to Netlify
//
//  IMPORTANT: Each time you change this script, create a NEW deployment
//  (not "manage existing") to get an updated URL.
// ─────────────────────────────────────────────────────────────────

const SHEET_NAME  = "Var Costs";
const COL_DATE    = 1;  // Column A
const COL_AMOUNT  = 2;  // Column B
const COL_NOTE    = 3;  // Column C — Biz Name
const COL_CAT     = 4;  // Column D — Category
const COL_SUB     = 0;  // No sub-category column
const HEADER_ROWS = 1;  // Row 1 is headers

// ── GET — fetch all transactions ──────────────────────────────────
// Supports JSONP via ?callback=fnName for cross-origin browser requests
function doGet(e) {
  try {
    const sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const lastRow = sheet.getLastRow();

    if (lastRow <= HEADER_ROWS) {
      return respond({ transactions: [] }, e);
    }

    const values = sheet
      .getRange(HEADER_ROWS + 1, 1, lastRow - HEADER_ROWS, 4)
      .getValues();

    const transactions = values
      .filter(row => row[COL_DATE-1] !== '' && row[COL_AMOUNT-1] !== '')
      .map(row => ({
        date:   formatDate(row[COL_DATE-1]),
        amount: parseFloat(row[COL_AMOUNT-1]) || 0,
        note:   COL_NOTE && row[COL_NOTE-1] ? String(row[COL_NOTE-1]) : '',
        cat:    COL_CAT  && row[COL_CAT-1]  ? String(row[COL_CAT-1])  : 'Other',
        sub:    '',
      }))
      .filter(t => t.amount > 0)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    return respond({ transactions }, e);

  } catch(err) {
    return respond({ error: err.message }, e);
  }
}

// ── POST — append a new transaction row ───────────────────────────
function doPost(e) {
  try {
    const { date, amount, note, cat, sub } = JSON.parse(e.postData.contents);

    if (!date || !amount) {
      return respond({ success: false, error: 'Missing date or amount' }, e);
    }

    const sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const newRow = sheet.getLastRow() + 1;

    sheet.getRange(newRow, COL_DATE).setValue(new Date(date)).setNumberFormat('dd/mm/yyyy');
    sheet.getRange(newRow, COL_AMOUNT).setValue(parseFloat(amount));
    if (COL_NOTE) sheet.getRange(newRow, COL_NOTE).setValue(note || '');
    if (COL_CAT)  sheet.getRange(newRow, COL_CAT).setValue(cat  || 'Other');
    sheet.getRange(newRow, COL_SUB).setValue(sub    || '');
    sheet.getRange(newRow, COL_DATE).setNumberFormat('dd/mm/yyyy');

    return respond({ success: true, row: newRow }, e);

  } catch(err) {
    return respond({ success: false, error: err.message }, e);
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function formatDate(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// JSONP support: if ?callback=fnName is passed, wrap response in fn call
// This bypasses browser CORS restrictions entirely — works from any domain
function respond(obj, e) {
  const json     = JSON.stringify(obj);
  const callback = e && e.parameter && e.parameter.callback;

  if (callback) {
    // JSONP response — browser executes this as a script
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  // Standard JSON response
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
