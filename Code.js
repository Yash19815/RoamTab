/**
 * DYNAMIC GROUP TRAVEL EXPENSE SPLITTER — COMPLETE SCRIPT
 *
 * IMPORTANT
 * - setup() / “Initialize / Reset Tracker” destructively resets active inputs.
 * - New Trip and Load Trip save current inputs before replacing Expenses A:F.
 * - Delete Saved Trip removes only the selected archive after confirmation.
 * - Money is calculated in integer paise/cents to avoid floating-point issues.
 *
 * SETUP FLOW
 * 1. Configure trip name, people count, participant names, and optional emails.
 * 2. Use Expense Splitter > Confirm / Update Setup.
 * 3. The script rebuilds participant columns; Live Summary is in Send Reports.
 * 4. Changes to participant count/names require re-confirmation.
 *
 * EXPENSES LAYOUT
 * A: Date
 * B: Description
 * C: Amount
 * D: Paid By
 * E: Split Among
 * F: Currency (blank inherits Setup!B4)
 * G onward: Generated per-person net values
 *
 * LIVE SUMMARY POSITION
 * Send Reports!H:K always contains the live summary, even before confirmation.
 * Expenses contains inputs A:F and dynamically sized participant net columns.
 */

const SHEET_SETUP = 'Setup';
const SHEET_EXPENSES = 'Expenses';
const SHEET_REPORTS = 'Send Reports';
const SHEET_RECORDS = 'Records';
const TRIP_SCHEMA_VERSION = 3;
const TRIP_JSON_CHUNK_SIZE = 40000;

const COL = {
  DATE: 1,
  DESC: 2,
  AMOUNT: 3,
  PAID_BY: 4,
  SPLIT: 5,
  CURRENCY: 6
};

const FIRST_PERSON_COL = 7; // G
const FX_TTL_MS = 24 * 60 * 60 * 1000;
const FX_CACHE_SECONDS = 21600; // CacheService permits at most six hours.
let fxFetchAllowed_ = true;
const SUMMARY_GAP = 1; // One blank spacer column
const SUMMARY_WIDTH = 4; // Person, Paid, Spent, Net
const MAX_DATA_ROWS = 500;

const MIN_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 15;

const SETUP_TRIP_NAME_CELL = 'B2';
const SETUP_NUM_PEOPLE_CELL = 'B3';
const SETUP_CURRENCY_CELL = 'B4';
const SETUP_STATUS_CELL = 'B5';
const SETUP_CONFIRM_CELL = 'B6';
const SETUP_UPDATE_CELL = 'B7';
const SETUP_SAVE_CELL = 'E6';
const SETUP_TRIP_ID_CELL = 'E3';
const SETUP_TIMEZONE_CELL = 'E4';

const ROSTER_HEADER_ROW = 8;
const ROSTER_START_ROW = 9;
const ROSTER_COL_NUMBER = 1;
const ROSTER_COL_NAME = 2;
const ROSTER_COL_EMAIL = 3;

const COLOR = {
  HEADER: '#0F766E',
  HEADER_DARK: '#1E293B',
  HEADER_MID: '#334155',
  TOTAL_BG: '#E2E8F0',
  GREEN_BG: '#D1FAE5',
  GREEN_TX: '#065F46',
  RED_BG: '#FEE2E2',
  RED_TX: '#991B1B',
  GRAY_BG: '#F3F4F6',
  GRAY_TX: '#374151',
  BLUE_BG: '#EFF6FF',
  BLUE_TX: '#1E40AF',
  WARN_BG: '#FEF3C7',
  WARN_TX: '#B45309'
};

/* =========================================================
   USER INTERFACE
   ========================================================= */

function safeAlert(message) {
  if (workbookQuiet_) {
    workbookStatus_('Processing', String(message));
    return;
  }
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (err) {
    try {
      SpreadsheetApp.getActiveSpreadsheet()
        .toast(message, 'Expense Splitter', 10);
    } catch (toastError) {
      Logger.log(message);
    }
  }
}

function onOpen() {
  // Add archive controls to existing trackers without resetting their inputs.
  if (!workbookPendingOperation_()) ensureTripControls_();
  SpreadsheetApp.getUi()
    .createMenu('Expense Splitter')
    .addItem('Upgrade / Repair Mobile Workbook', 'upgradeMobileWorkbook')
    .addItem('Repair Workbook Automation', 'installWorkbookAutomation')
    .addItem('Recover Interrupted Workbook Operation', 'recoverWorkbookOperation')
    .addItem('1. Initialize / Reset Tracker', 'setup')
    .addItem('2. Recalculate Live Expenses', 'recalculateAll')
    .addItem('Enable Automatic Currency Conversion', 'enableAutomaticFx')
    .addSeparator()
    .addItem('Confirm / Update Setup', 'confirmSetupFromMenu')
    .addItem('Confirm All Expenses', 'confirmAllExpenses')
    .addItem('Re-open for Editing (Unconfirm)', 'unconfirmExpenses')
    .addSeparator()
    .addItem('Save Trip', 'saveTrip')
    .addItem('Load Selected Trip', 'loadSelectedTrip')
    .addItem('Download Selected Trip JSON', 'downloadSelectedTrip')
    .addItem('Import Trip JSON', 'showImportTrip')
    .addItem('Delete Selected Trip', 'deleteSelectedTrip')
    .addItem('New Trip', 'newTrip')
    .addSeparator()
    .addItem('3. Send PDF Reports via Email', 'sendPdfReports')
    .addItem('Test Email Permission', 'testEmailPermission')
    .addSeparator()
    .addItem('Diagnose Settlement Data', 'diagnose')
    .addToUi();
}

/* =========================================================
   INITIAL SETUP
   ========================================================= */

/**
 * Explicit destructive reset operation; saved Records remain intact.
 * Clears Setup, Expenses, and Send Reports sheets and rebuilds all initial UI.
 */
function setup() {
  if (workbookPendingOperation_()) throw new Error('Recover the interrupted workbook operation before resetting.');
  if (workbookV3_()) return newTripV3_();
  initializeTracker_(false);
}

function initializeTracker_(blank) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const setupSheet = ss.getSheetByName(SHEET_SETUP) ||
    ss.insertSheet(SHEET_SETUP);

  const expenseSheet = ss.getSheetByName(SHEET_EXPENSES) ||
    ss.insertSheet(SHEET_EXPENSES);

  const reportsSheet = ss.getSheetByName(SHEET_REPORTS) ||
    ss.insertSheet(SHEET_REPORTS);

  setupSheet.clear();
  expenseSheet.clear();
  reportsSheet.clear();

  setupSheet.getRange('A1:C1')
    .merge()
    .setValue('TRIP CONFIGURATION')
    .setBackground(COLOR.HEADER_DARK)
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');

  setupSheet.getRange('A2:B7').setValues([
    ['Trip Name / Destination:', blank ? '' : 'Goa Vacation 2026'],
    ['Number of People:', blank ? MIN_PARTICIPANTS : 4],
    ['Base Currency (ISO or symbol):', '₹'],
    ['Setup Status:', 'Checking...'],
    ['Setup Confirmed?', false],
    ['Confirm / Update Setup', false]
  ]);

  setupSheet.getRange('A2:A7')
    .setFontWeight('bold');

  setupSheet.getRange(SETUP_CONFIRM_CELL)
    .clearDataValidations()
    .insertCheckboxes()
    .setValue(false);

  setupSheet.getRange(SETUP_UPDATE_CELL)
    .clearDataValidations()
    .insertCheckboxes()
    .setValue(false);

  setupSheet.getRange(SETUP_CONFIRM_CELL).setNote(
    'Tick after entering your participant count, names, and optional emails. ' +
    'Use the menu item “Confirm / Update Setup” whenever you change setup details.'
  );

  setupSheet.getRange(SETUP_UPDATE_CELL).setNote(
    'Optional checkbox trigger. You can also use the menu item: ' +
    'Expense Splitter > Confirm / Update Setup.'
  );
  setupSheet.getRange(SETUP_CURRENCY_CELL).setNote(
    'Trip base currency: use an ISO code such as INR, USD, EUR or THB. ' +
    '₹, $, €, £ and ฿ mean INR, USD, EUR, GBP and THB. Blank expense currencies inherit this value.'
  );

  const participantChoices = [];
  for (let i = MIN_PARTICIPANTS; i <= MAX_PARTICIPANTS; i++) {
    participantChoices.push(String(i));
  }

  setupSheet.getRange(SETUP_NUM_PEOPLE_CELL).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(participantChoices, true)
      .setAllowInvalid(false)
      .setHelpText(`Pick the number of people (${MIN_PARTICIPANTS} to ${MAX_PARTICIPANTS}).`)
      .build()
  );

  setupSheet.getRange(ROSTER_HEADER_ROW, 1, 1, 3)
    .setValues([['#', 'Name', 'Email (optional)']])
    .setBackground(COLOR.HEADER_MID)
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');

  const initialRoster = blank
    ? [[1, '', ''], [2, '', '']]
    : [[1, 'Rahul', ''], [2, 'Priya', ''], [3, 'Amit', ''], [4, 'Neha', '']];
  setupSheet.getRange(ROSTER_START_ROW, 1, initialRoster.length, 3).setValues(initialRoster);
  ensureTripControls_();

  setupSheet.getDataRange()
    .setFontFamily('Roboto')
    .setFontSize(12);

  setupSheet.autoResizeColumns(1, 3);

  validateSetupStatus();
  updateExpensesStructure();
  recalculateAll(true);

  if (!blank) safeAlert(
    'Tracker initialized.\n\n' +
    '1. Enter or update participant names in Setup.\n' +
    '2. Select the correct Number of People.\n' +
    '3. Use Expense Splitter > Confirm / Update Setup.'
  );
}

/* =========================================================
   TRIP ARCHIVES
   ========================================================= */

function ensureTripControls_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SETUP);
  if (sheet) {
    sheet.getRange('D3').setValue('Current Trip ID');
    sheet.getRange('D4').setValue('Timezone').setFontWeight('bold');
    const timeZoneCell = sheet.getRange(SETUP_TIMEZONE_CELL);
    timeZoneCell.setValue(workbookV3_() ? timeZoneCell.getValue() : ss.getSpreadsheetTimeZone()).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList([
        'Etc/UTC', 'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles',
        'America/Denver', 'America/Chicago', 'America/New_York', 'America/Toronto',
        'America/Mexico_City', 'America/Bogota', 'America/Sao_Paulo',
        'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
        'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Asia/Dubai',
        'Asia/Karachi', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dhaka',
        'Asia/Bangkok', 'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo',
        'Asia/Seoul', 'Australia/Perth', 'Australia/Adelaide', 'Australia/Sydney',
        'Pacific/Auckland', 'Pacific/Fiji'
      ], true).setAllowInvalid(true).build()
    ).setNote(
      'Choose a timezone or type any Google Sheets timezone, such as America/New_York. ' +
      'Applies to everyone using this spreadsheet, expense dates, FX dates, and report timestamps. ' +
      'Existing expense calendar dates are preserved. Saved trips retain their own timezone.'
    );
    sheet.getRange('D6').setValue('Save Trip').setFontWeight('bold');
    const pendingSave = workbookV3_() && sheet.getRange(SETUP_SAVE_CELL).getValue() === true;
    sheet.getRange(SETUP_SAVE_CELL).insertCheckboxes().setValue(pendingSave).setNote(
      'Tick to save all trip inputs as JSON in Records. Resets after saving. ' +
      'Select a Records row and use the menu to load, download, or delete it.'
    );
  }
  ensureRecordsSheet_();
}

function applySelectedTimezone_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SETUP);
  const cell = sheet.getRange(SETUP_TIMEZONE_CELL);
  const previous = ss.getSpreadsheetTimeZone();
  const selected = String(cell.getValue() || '').trim();
  if (selected === previous) return true;
  const expenses = ss.getSheetByName(SHEET_EXPENSES);
  const height = expenses ? Math.min(MAX_DATA_ROWS, expenses.getLastRow() - 1) : 0;
  const dates = height > 0 ? expenses.getRange(2, COL.DATE, height, 1).getValues() : [];
  try {
    if (!selected) throw new Error('Choose a timezone, for example America/New_York.');
    // Spreadsheet service validates the zone before any expense inputs change.
    ss.setSpreadsheetTimeZone(selected);
    const converted = dates.map(([value]) => [value instanceof Date
      ? Utilities.parseDate(Utilities.formatDate(value, previous, 'yyyy-MM-dd'), selected, 'yyyy-MM-dd')
      : value]);
    if (height > 0) expenses.getRange(2, COL.DATE, height, 1).setValues(converted);
    cell.setValue(ss.getSpreadsheetTimeZone());
    sheet.getRange(SETUP_CONFIRM_CELL).setValue(false);
    recalculateAll(true);
    return true;
  } catch (err) {
    ss.setSpreadsheetTimeZone(previous);
    if (height > 0) expenses.getRange(2, COL.DATE, height, 1).setValues(dates);
    cell.setValue(previous);
    safeAlert(`Timezone update failed: ${err.message}`);
    return false;
  }
}

function ensureRecordsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_RECORDS) || ss.insertSheet(SHEET_RECORDS);
  sheet.getRange(1, 1, 1, 6).setValues([[
    'Trip ID', 'Trip Name', 'Saved At (UTC)', 'Input Rows', 'JSON Parts', 'Trip JSON (part 1)'
  ]]).setBackground(COLOR.HEADER_DARK).setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.getRange('F1').setNote(
    'Full JSON is stored in 40,000-character parts from F onward, each prefixed JSON:. ' +
    'Use Download Selected Trip JSON for a single portable file. Do not edit archive cells.'
  );
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 280);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 210);
  sheet.setColumnWidth(6, 300);
  return sheet;
}

function withTripLock_(action) {
  if (workbookLockDepth_ > 0) return action();
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  workbookLockDepth_++;
  try {
    return action();
  } finally {
    // Flush pending spreadsheet changes before another archive action can start.
    try {
      SpreadsheetApp.flush();
    } finally {
      try {
        lock.releaseLock();
      } finally {
        workbookLockDepth_--;
      }
    }
  }
}

function tripAction_(action) {
  try {
    const result = withTripLock_(action);
    safeAlert(result);
    return true;
  } catch (err) {
    safeAlert(`Trip action failed: ${err.message}`);
    Logger.log(err.stack || err.message);
    return false;
  }
}

function encodeTripCell_(value) {
  return value instanceof Date
    ? { type: 'date', value: value.toISOString() }
    : value;
}

function decodeTripCell_(value) {
  if (value && typeof value === 'object') return new Date(value.value);
  return literalSheetCell_(value);
}

function literalSheetCell_(value) {
  // Force text when restoring user input that Sheets would otherwise treat as a formula.
  return typeof value === 'string' && /^[=']/.test(value) ? `'${value}` : value;
}

function captureTrip_() {
  if (workbookPendingOperation_() && !workbookMaintenance_) throw new Error('Recover the interrupted operation before archiving.');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SETUP);
  const expenses = ss.getSheetByName(SHEET_EXPENSES);
  if (!sheet || !expenses) throw new Error('Initialize the tracker first.');
  ensureExpenseLayout_();
  const advanced = workbookV3_();
  if (advanced) repairExpenseIds_();
  const inputRows = expenses.getRange(2, 1, MAX_DATA_ROWS, advanced ? 8 : COL.CURRENCY).getValues();
  // Keep interior blank rows and incomplete entries; omit only trailing empty rows.
  while (inputRows.length && inputRows[inputRows.length - 1].every(value => value === '')) {
    inputRows.pop();
  }
  const trip = {
    format: 'travel-expense-trip',
    schemaVersion: advanced ? TRIP_SCHEMA_VERSION : 2,
    id: String(sheet.getRange(SETUP_TRIP_ID_CELL).getValue() || Utilities.getUuid()),
    savedAt: new Date().toISOString(),
    timeZone: ss.getSpreadsheetTimeZone(),
    setup: {
      tripName: String(sheet.getRange(SETUP_TRIP_NAME_CELL).getValue()),
      participantCount: Number(sheet.getRange(SETUP_NUM_PEOPLE_CELL).getValue()),
      currency: String(sheet.getRange(SETUP_CURRENCY_CELL).getValue()),
      confirmed: sheet.getRange(SETUP_CONFIRM_CELL).getValue() === true,
      roster: sheet.getRange(ROSTER_START_ROW, 1, MAX_PARTICIPANTS, 3)
        .getValues().map(row => row.map(encodeTripCell_))
    },
    expenses: inputRows.map(row => row.map(encodeTripCell_))
  };
  if (advanced) trip.workbook = readWorkbookConfig_();
  validateTrip_(trip);
  return trip;
}

function validateTrip_(trip) {
  if (!trip || trip.format !== 'travel-expense-trip' || ![1, 2, TRIP_SCHEMA_VERSION].includes(trip.schemaVersion)) {
    throw new Error('Unsupported trip JSON format or version.');
  }
  if (typeof trip.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(trip.id) ||
      typeof trip.savedAt !== 'string' || !Number.isFinite(Date.parse(trip.savedAt)) ||
      typeof trip.timeZone !== 'string' || !trip.timeZone) {
    throw new Error('Invalid trip identity, timestamp, or timezone.');
  }
  const settings = trip.setup;
  if (!settings || typeof settings.tripName !== 'string' || typeof settings.currency !== 'string' ||
      settings.tripName.length > 50000 || settings.currency.length > 50000 ||
      typeof settings.confirmed !== 'boolean' || !Number.isInteger(settings.participantCount) ||
      settings.participantCount < MIN_PARTICIPANTS || settings.participantCount > MAX_PARTICIPANTS) {
    throw new Error('Invalid trip settings; participant count must be 2–15.');
  }
  const validCell = value => (typeof value === 'string' && value.length <= 50000) ||
    typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) ||
    (value && typeof value === 'object' && !Array.isArray(value) && value.type === 'date' &&
      typeof value.value === 'string' && Number.isFinite(Date.parse(value.value)));
  const validRows = (rows, width, maximum) => Array.isArray(rows) && rows.length <= maximum &&
    rows.every(row => Array.isArray(row) && row.length === width && row.every(validCell));
  if (!validRows(settings.roster, 3, MAX_PARTICIPANTS) || settings.roster.length !== MAX_PARTICIPANTS ||
      !validRows(trip.expenses, trip.schemaVersion === 3 ? 8 : trip.schemaVersion === 1 ? COL.SPLIT : COL.CURRENCY, MAX_DATA_ROWS)) {
    throw new Error('Invalid roster or expenses; JSON supports 15 roster rows and 500 expense rows.');
  }
  if (trip.schemaVersion === 3) validateWorkbookTrip_(trip);
  return trip;
}

function saveTripSnapshot_(trip) {
  validateTrip_(trip);
  const sheet = ensureRecordsSheet_();
  const lastRow = sheet.getLastRow();
  const ids = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues() : [];
  const index = ids.findIndex(row => row[0] === trip.id);
  const targetRow = index < 0 ? Math.max(2, lastRow + 1) : index + 2;
  const json = JSON.stringify(trip);
  const parts = [];
  for (let start = 0; start < json.length;) {
    let end = Math.min(start + TRIP_JSON_CHUNK_SIZE, json.length);
    // Keep UTF-16 surrogate pairs together when a description contains emoji.
    const lastCode = json.charCodeAt(end - 1);
    if (end < json.length && lastCode >= 0xD800 && lastCode <= 0xDBFF) end--;
    parts.push(`JSON:${json.slice(start, end)}`);
    start = end;
  }
  const width = 5 + parts.length;
  if (width > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  if (targetRow > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), targetRow - sheet.getMaxRows());
  const name = decodeTripCell_(trip.setup.tripName || '(Untitled trip)');
  sheet.getRange(targetRow, 1, 1, width).setValues([[
    trip.id, name, trip.savedAt,
    trip.expenses.filter(row => row.some(value => value !== '')).length, parts.length, ...parts
  ]]);
  if (width < sheet.getMaxColumns()) {
    sheet.getRange(targetRow, width + 1, 1, sheet.getMaxColumns() - width).clearContent();
  }
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETUP)
    .getRange(SETUP_TRIP_ID_CELL).setValue(trip.id);
  return trip;
}

function saveTrip() {
  return tripAction_(() => {
    if (workbookV3_()) createRecoveryVersion_('Manual save');
    const trip = saveTripSnapshot_(captureTrip_());
    return `Trip saved in Records: ${trip.setup.tripName || '(Untitled trip)'}.\n` +
      'All expense inputs are included. Select its Records row to load or download JSON.';
  });
}

function selectedTrip_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const range = sheet.getActiveRange();
  if (sheet.getName() !== SHEET_RECORDS || !range || range.getRow() < 2 || range.getNumRows() !== 1) {
    throw new Error('Select one saved trip row in Records first.');
  }
  return readTripRecord_(sheet, range.getRow());
}

function readTripRecord_(sheet, row) {
  const meta = sheet.getRange(row, 1, 1, 5).getValues()[0];
  const count = meta[4];
  if (!meta[0] || !Number.isInteger(count) || count < 1 || count > sheet.getMaxColumns() - 5) {
    throw new Error('This row does not contain a valid saved trip.');
  }
  const parts = sheet.getRange(row, 6, 1, count).getValues()[0];
  if (parts.some(part => typeof part !== 'string' || !part.startsWith('JSON:'))) {
    throw new Error('Saved JSON is incomplete or damaged.');
  }
  const trip = validateTrip_(JSON.parse(parts.map(part => part.slice(5)).join('')));
  if (trip.id !== meta[0]) throw new Error('Saved trip ID does not match its JSON.');
  return { row, trip };
}

function archiveCurrentTrip_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SHEET_SETUP) || !ss.getSheetByName(SHEET_EXPENSES)) return;
  const trip = captureTrip_();
  const hasInput = trip.setup.tripName || trip.expenses.length ||
    trip.setup.currency !== '₹' || trip.setup.participantCount !== MIN_PARTICIPANTS || trip.setup.confirmed ||
    trip.setup.roster.some(row => row[1] !== '' || row[2] !== '');
  if (hasInput) saveTripSnapshot_(trip);
}

function restoreTrip_(trip) {
  validateTrip_(trip);
  if (workbookV3_()) return restorePortableV3_(trip);
  if (trip.schemaVersion === 3) throw new Error('Upgrade Mobile Workbook before loading a version 3 trip.');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (trip.timeZone !== ss.getSpreadsheetTimeZone()) {
    throw new Error('Trip timezone differs from this spreadsheet. Match spreadsheet timezone before loading to preserve dates.');
  }
  archiveCurrentTrip_();
  initializeTracker_(true);
  const sheet = ss.getSheetByName(SHEET_SETUP);
  sheet.getRange('B2:B4').setValues([
    [decodeTripCell_(trip.setup.tripName)], [trip.setup.participantCount], [decodeTripCell_(trip.setup.currency)]
  ]);
  sheet.getRange(SETUP_TRIP_ID_CELL).setValue(trip.id);
  sheet.getRange(ROSTER_START_ROW, 1, MAX_PARTICIPANTS, 3)
    .setValues(trip.setup.roster.map(row => row.map(decodeTripCell_)));
  if (trip.expenses.length) {
    ss.getSheetByName(SHEET_EXPENSES).getRange(2, 1, trip.expenses.length, COL.CURRENCY)
      .clearDataValidations()
      .setValues(trip.expenses.map(row =>
        (trip.schemaVersion === 1 ? [...row, ''] : row).map(decodeTripCell_)));
  }
  const validSetup = validateSetupStatus();
  sheet.getRange(SETUP_CONFIRM_CELL).setValue(trip.setup.confirmed && validSetup);
  updateExpensesStructure();
  recalculateAll(true);
  ss.setActiveSheet(ss.getSheetByName(SHEET_EXPENSES));
}

function loadSelectedTrip() {
  return tripAction_(() => {
    const selected = selectedTrip_();
    restoreTrip_(selected.trip);
    return `Loaded trip: ${selected.trip.setup.tripName || '(Untitled trip)'}. Current inputs were saved first.`;
  });
}

function newTrip() {
  if (workbookV3_()) return newTripV3_();
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('New Trip', 'Save current inputs in Records and start a blank trip?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  return tripAction_(() => {
    archiveCurrentTrip_();
    initializeTracker_(true);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ss.setActiveSheet(ss.getSheetByName(SHEET_SETUP));
    return 'New trip ready. Enter a trip name and participant names in Setup. Saved Records remain available.';
  });
}

function deleteSelectedTrip() {
  try {
    const selected = selectedTrip_();
    const ui = SpreadsheetApp.getUi();
    if (ui.alert('Delete Saved Trip',
      `Permanently delete the saved trip "${selected.trip.setup.tripName || '(Untitled trip)'}"? ` +
      'Active trip inputs and downloaded JSON files remain available.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
    return tripAction_(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(SHEET_RECORDS);
      // Alerts suspend execution. Re-find the ID after acquiring the lock in case rows moved.
      const rows = sheet.getLastRow() - 1;
      const ids = rows > 0 ? sheet.getRange(2, 1, rows, 1).getValues() : [];
      const index = ids.findIndex(row => row[0] === selected.trip.id);
      if (index < 0) throw new Error('Saved trip was already deleted.');
      sheet.deleteRow(index + 2);
      const setupSheet = ss.getSheetByName(SHEET_SETUP);
      if (setupSheet && setupSheet.getRange(SETUP_TRIP_ID_CELL).getValue() === selected.trip.id) {
        setupSheet.getRange(SETUP_TRIP_ID_CELL).clearContent();
      }
      return 'Saved trip deleted.';
    });
  } catch (err) {
    safeAlert(err.message);
    return false;
  }
}

function downloadSelectedTrip() {
  try {
    const json = withTripLock_(() => JSON.stringify(selectedTrip_().trip, null, 2));
    showTripJsonDialog_(json);
  } catch (err) {
    safeAlert(err.message);
  }
}

function showImportTrip() {
  showTripJsonDialog_('');
}

function showTripJsonDialog_(json) {
  const template = HtmlService.createTemplateFromFile('TripJson');
  // Prevent user text from ending the script element in the evaluated template.
  template.tripJsonLiteral = JSON.stringify(json).replace(/</g, '\\u003c');
  SpreadsheetApp.getUi().showModalDialog(
    template.evaluate().setWidth(460).setHeight(330), json ? 'Download Trip JSON' : 'Import Trip JSON'
  );
}

function importTripJson(json) {
  // Called only after the dialog's explicit replace confirmation.
  if (typeof json !== 'string' || json.length > 125000000) throw new Error('Invalid or oversized JSON file.');
  const trip = validateTrip_(JSON.parse(json));
  return withTripLock_(() => {
    // Imported files receive a fresh identity, so an existing archive is never overwritten.
    trip.id = Utilities.getUuid();
    restoreTrip_(trip);
    saveTripSnapshot_(trip);
    return 'Trip imported and loaded. Previous inputs were saved in Records.';
  });
}

/* =========================================================
   SETUP CONFIRMATION
   ========================================================= */

/**
 * Programmatic confirmation workflow.
 *
 * This does not rely on onEdit() after a programmatic checkbox update,
 * because programmatically changing a cell does not fire onEdit reliably.
 */
function confirmSetupFromMenu() {
  if (workbookPendingOperation_()) throw new Error('Recover the interrupted operation before confirming.');
  if (workbookV3_()) return confirmWorkbookV3_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setupSheet = ss.getSheetByName(SHEET_SETUP);

  if (!setupSheet) {
    safeAlert('Setup sheet not found. Run “Initialize / Reset Tracker” first.');
    return;
  }

  const lock = LockService.getDocumentLock();

  try {
    lock.waitLock(10000);

    setupSheet.getRange(SETUP_CONFIRM_CELL).setValue(false);
    setupSheet.getRange(SETUP_UPDATE_CELL).setValue(false);

    adjustRosterRows();

    if (!validateSetupStatus()) {
      safeAlert(
        'Setup is incomplete or invalid.\n\n' +
        'Check Trip Name, Currency Symbol, Number of People, and participant names.'
      );
      return;
    }

    const roster = getRoster();
    const personCount = roster.length;

    if (personCount < MIN_PARTICIPANTS || personCount > MAX_PARTICIPANTS) {
      safeAlert(
        `A valid roster requires ${MIN_PARTICIPANTS} to ${MAX_PARTICIPANTS} named participants.`
      );
      return;
    }

    setupSheet.getRange(SETUP_CONFIRM_CELL).setValue(true);
    setupSheet.getRange(SETUP_UPDATE_CELL).setValue(false);

    updateExpensesStructure();
    recalculateAll(true);

    const participantStart = colNumToLetter_(expenseFirstPersonCol_());
    const participantEnd = colNumToLetter_(
      expenseFirstPersonCol_() + personCount - 1
    );

    safeAlert(
      'Setup confirmed successfully.\n\n' +
      `Participants: ${personCount}\n` +
      `Participant columns: ${participantStart}:${participantEnd}\n` +
      'Live Summary: Send Reports!H:K'
    );

  } catch (err) {
    setupSheet.getRange(SETUP_CONFIRM_CELL).setValue(false);
    safeAlert(`Setup update failed: ${err.message}`);
    Logger.log(err.stack || err.message);

  } finally {
    try {
      lock.releaseLock();
    } catch (releaseError) {
      Logger.log(releaseError.message);
    }
  }
}

function isSetupConfirmed() {
  const setupSheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_SETUP);

  return !!setupSheet &&
    setupSheet.getRange(SETUP_CONFIRM_CELL).getValue() === true;
}

/**
 * Retained for compatibility with report-email logic.
 * Setup confirmation is the current confirmation gate.
 */
function isExpensesConfirmed() {
  return isSetupConfirmed();
}

/* =========================================================
   COLUMN / FORMAT HELPERS
   ========================================================= */

function getCurrencySymbol_() {
  const setupSheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_SETUP);

  if (!setupSheet) return '₹';

  return String(
    setupSheet.getRange(SETUP_CURRENCY_CELL).getValue() || '₹'
  ).trim();
}

function getCurrencyFormat_() {
  return `"${getCurrencySymbol_()}"#,##0`;
}

function currencyCode_(value) {
  const text = String(value == null ? '' : value).trim();
  const symbols = { '₹': 'INR', '$': 'USD', '€': 'EUR', '£': 'GBP', '฿': 'THB' };
  const code = symbols[text] || text.toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new Error(`Currency '${text}' must be a three-letter ISO code or ₹, $, €, £, ฿.`);
  }
  return code;
}

function fxDate_(value, timeZone) {
  let date;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    date = Utilities.formatDate(value, timeZone, 'yyyy-MM-dd');
  } else {
    date = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
      throw new Error('Foreign currency requires a valid transaction date in column A.');
    }
  }
  if (date > Utilities.formatDate(new Date(), timeZone, 'yyyy-MM-dd')) {
    throw new Error('Foreign currency transaction date cannot be in the future.');
  }
  return date;
}

function convertFxMinor_(amountMinor, rate) {
  // Round the decimal API rate once, avoiding binary floating-point half-cent errors.
  const [coefficient, exponent = '0'] = String(rate).toLowerCase().split('e');
  const decimals = (coefficient.split('.')[1] || '').length;
  const shift = Number(exponent) - decimals;
  let numerator = BigInt(amountMinor) * BigInt(coefficient.replace('.', ''));
  let denominator = BigInt(1);
  if (shift >= 0) numerator *= BigInt(10) ** BigInt(shift);
  else denominator = BigInt(10) ** BigInt(-shift);
  return Number((numerator * BigInt(2) + denominator) / (denominator * BigInt(2)));
}

function getFxRate_(from, to, date, state) {
  const key = `FX_${from}_${to}_${date}`;
  if (state.results.has(key)) {
    const result = state.results.get(key);
    if (result instanceof Error) throw result;
    return result;
  }
  try {
    const now = Date.now();
    const cache = CacheService.getDocumentCache();
    if (!state.properties) {
      state.store = PropertiesService.getDocumentProperties();
      state.properties = state.store.getProperties();
    }
    const cached = (cache && cache.get(key)) || state.properties[key];
    let entry;
    try { entry = JSON.parse(cached || 'null'); } catch (err) { entry = null; }
    if (!entry || !Number.isFinite(entry.rate) || entry.rate <= 0 ||
        !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now || entry.expiresAt > now + FX_TTL_MS) {
      if (!fxFetchAllowed_) {
        throw new Error('FX rate unavailable. Use Enable Automatic Currency Conversion or Recalculate Live Expenses from the menu.');
      }
      const url = `https://api.frankfurter.dev/v2/rate/${from}/${to}?date=${date}`;
      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (response.getResponseCode() !== 200) {
        throw new Error(`FX rate unavailable for ${from}/${to} on ${date} (HTTP ${response.getResponseCode()}).`);
      }
      const data = JSON.parse(response.getContentText());
      if (!data || data.base !== from || data.quote !== to ||
          !Number.isFinite(data.rate) || data.rate <= 0 ||
          !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || data.date > date) {
        throw new Error(`Invalid FX response for ${from}/${to} on ${date}.`);
      }
      entry = { rate: data.rate, expiresAt: now + FX_TTL_MS };
      // Bound persistent storage by removing expired FX entries, preserving other settings.
      Object.keys(state.properties).filter(name => name.startsWith('FX_')).forEach(name => {
        let old;
        try { old = JSON.parse(state.properties[name]); } catch (err) { old = null; }
        if (!old || old.expiresAt <= now) {
          state.store.deleteProperty(name);
          delete state.properties[name];
        }
      });
      state.store.setProperty(key, JSON.stringify(entry));
      state.properties[key] = JSON.stringify(entry);
    }
    if (cache) cache.put(key, JSON.stringify(entry),
      Math.min(FX_CACHE_SECONDS, Math.max(1, Math.ceil((entry.expiresAt - now) / 1000))));
    state.results.set(key, entry.rate);
    return entry.rate;
  } catch (err) {
    const error = new Error(`Currency conversion failed: ${err.message}`);
    state.results.set(key, error);
    throw error;
  }
}

/**
 * Former Expenses Live Summary start column, retained for legacy-area cleanup.
 *
 * Last participant:
 * FIRST_PERSON_COL + personCount - 1
 *
 * Summary:
 * lastParticipant + SUMMARY_GAP + 1
 */
function getSummaryCol_(personCount) {
  const count = Number(personCount);

  if (!Number.isInteger(count) ||
      count < MIN_PARTICIPANTS ||
      count > MAX_PARTICIPANTS) {
    throw new Error(
      `Participant count must be between ${MIN_PARTICIPANTS} and ${MAX_PARTICIPANTS}.`
    );
  }

  const lastParticipantCol = FIRST_PERSON_COL + count - 1;

  return lastParticipantCol + SUMMARY_GAP + 1;
}

/**
 * Converts a one-based column number into its Google Sheets letter.
 *
 * Examples:
 * 1  -> A
 * 9  -> I
 * 26 -> Z
 * 27 -> AA
 */
function colNumToLetter_(columnNumber) {
  let number = Number(columnNumber);

  if (!Number.isInteger(number) || number < 1) {
    throw new Error('Column number must be a positive integer.');
  }

  let letters = '';

  while (number > 0) {
    const remainder = (number - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    number = Math.floor((number - 1) / 26);
  }

  return letters;
}

/* =========================================================
   SETUP VALIDATION AND ROSTER
   ========================================================= */

function validateSetupStatus() {
  const setupSheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_SETUP);

  if (!setupSheet) return false;

  const tripName = String(
    setupSheet.getRange(SETUP_TRIP_NAME_CELL).getValue() || ''
  ).trim();

  const peopleCount = Number(
    setupSheet.getRange(SETUP_NUM_PEOPLE_CELL).getValue()
  );

  const currency = String(
    setupSheet.getRange(SETUP_CURRENCY_CELL).getValue() || ''
  ).trim();

  const statusCell = setupSheet.getRange(SETUP_STATUS_CELL);

  if (!tripName) {
    statusCell
      .setValue('❌ Missing Trip Name')
      .setFontColor(COLOR.RED_TX)
      .setFontWeight('bold');
    return false;
  }

  if (!currency) {
    statusCell
      .setValue('❌ Missing Currency Symbol')
      .setFontColor(COLOR.RED_TX)
      .setFontWeight('bold');
    return false;
  }

  if (workbookV3_() && workbookCurrency_() === 'INVALID') {
    statusCell.setValue('Invalid base currency: choose an ISO code or supported symbol.');
    return false;
  }
  if (workbookV3_() && String(setupSheet.getRange(SETUP_TIMEZONE_CELL).getValue()) !==
      SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone()) {
    statusCell.setValue('Choose a valid timezone in E4; recovered invalid settings remain unconfirmed.');
    return false;
  }

  if (!Number.isInteger(peopleCount) ||
      peopleCount < MIN_PARTICIPANTS ||
      peopleCount > MAX_PARTICIPANTS) {
    statusCell
      .setValue(`❌ Select ${MIN_PARTICIPANTS}–${MAX_PARTICIPANTS} people`)
      .setFontColor(COLOR.RED_TX)
      .setFontWeight('bold');
    return false;
  }

  const rosterRows = setupSheet
    .getRange(ROSTER_START_ROW, 1, peopleCount, 3)
    .getValues();

  const seenNames = new Set();

  for (let i = 0; i < rosterRows.length; i++) {
    const name = String(rosterRows[i][1] || '').trim();

    if (!name) {
      statusCell
        .setValue(`⚠️ Missing name for Person #${i + 1}`)
        .setFontColor(COLOR.WARN_TX)
        .setFontWeight('bold');
      return false;
    }

    const normalizedName = name.toLocaleLowerCase();

    if (seenNames.has(normalizedName)) {
      statusCell
        .setValue(`❌ Duplicate name: ${name}`)
        .setFontColor(COLOR.RED_TX)
        .setFontWeight('bold');
      return false;
    }

    seenNames.add(normalizedName);
  }

  statusCell
    .setValue('Setup complete ✅')
    .setFontColor(COLOR.GREEN_TX)
    .setFontWeight('bold');

  return true;
}

function getRoster() {
  const setupSheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_SETUP);

  if (!setupSheet) return [];

  const count = Number(
    setupSheet.getRange(SETUP_NUM_PEOPLE_CELL).getValue()
  );

  if (!Number.isInteger(count) ||
      count < MIN_PARTICIPANTS ||
      count > MAX_PARTICIPANTS) {
    return [];
  }

  return setupSheet
    .getRange(ROSTER_START_ROW, 1, count, 3)
    .getValues()
    .map((row, index) => ({
      id: Number(row[0]) || index + 1,
      name: String(row[1] || '').trim(),
      email: String(row[2] || '').trim()
    }))
    .filter(person => person.name);
}

/**
 * Synchronizes roster rows with Setup!B3.
 *
 * Does not use getLastRow() as roster truth, because checkboxes, formatting,
 * and output below the roster can make getLastRow() misleading.
 */
function adjustRosterRows() {
  const setupSheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_SETUP);

  if (!setupSheet) return false;

  const target = Number(
    setupSheet.getRange(SETUP_NUM_PEOPLE_CELL).getValue()
  );

  if (!Number.isInteger(target) ||
      target < MIN_PARTICIPANTS ||
      target > MAX_PARTICIPANTS) {
    return false;
  }

  /*
   * Use the configured maximum roster area, rather than getLastRow(),
   * to determine whether names already exist.
   */
  const rosterBlock = setupSheet
    .getRange(ROSTER_START_ROW, 1, MAX_PARTICIPANTS, 3)
    .getValues();

  let current = 0;

  rosterBlock.forEach((row, index) => {
    const number = Number(row[0]);
    const name = String(row[1] || '').trim();
    const email = String(row[2] || '').trim();

    if (number || name || email) {
      current = index + 1;
    }
  });

  current = Math.max(current, MIN_PARTICIPANTS);

  if (target > current) {
    const rowsToAdd = [];

    for (let index = current; index < target; index++) {
      rowsToAdd.push([index + 1, '', '']);
    }

    setupSheet
      .getRange(
        ROSTER_START_ROW + current,
        1,
        rowsToAdd.length,
        3
      )
      .setValues(rowsToAdd);
  }

  if (target < current) {
    /*
     * Clear unused roster row values rather than delete spreadsheet rows.
     * Deleting rows can unexpectedly shift anything below the roster.
     */
    setupSheet
      .getRange(
        ROSTER_START_ROW + target,
        1,
        current - target,
        1
      )
      .clearContent();

    // Preserve names and emails so shrinking and regrowing never erases input.
  }

  const numbering = [];

  for (let index = 0; index < target; index++) {
    numbering.push([index + 1]);
  }

  setupSheet
    .getRange(ROSTER_START_ROW, ROSTER_COL_NUMBER, target, 1)
    .setValues(numbering);

  return true;
}

/* =========================================================
   EDIT TRIGGER
   ========================================================= */

function onEdit(e) {
  if (!e || !e.range) return;
  if (workbookPendingOperation_()) return;
  if (workbookV3_()) return; // Upgraded workbooks use one organizer-owned dispatcher.
  const limited = e.authMode === ScriptApp.AuthMode.LIMITED;
  if (limited && PropertiesService.getDocumentProperties().getProperty('AUTOMATIC_FX_EDIT') ===
      SpreadsheetApp.getActiveSpreadsheet().getId()) return;
  const previous = fxFetchAllowed_;
  fxFetchAllowed_ = !limited;
  try {
    handleEdit_(e);
  } finally {
    fxFetchAllowed_ = previous;
  }
}

function enableAutomaticFx() {
  if (workbookV3_()) return installWorkbookAutomation();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const exists = ScriptApp.getProjectTriggers().some(trigger =>
    trigger.getHandlerFunction() === 'onAuthorizedEdit' && trigger.getTriggerSourceId() === ss.getId());
  if (!exists) ScriptApp.newTrigger('onAuthorizedEdit').forSpreadsheet(ss).onEdit().create();
  PropertiesService.getDocumentProperties().setProperty('AUTOMATIC_FX_EDIT', ss.getId());
  ensureExpenseLayout_();
  recalculateAll(true);
  safeAlert('Automatic currency conversion enabled. Rates are fetched using the trigger owner’s Google account.');
}

function onAuthorizedEdit(e) {
  if (!e || !e.range) return;
  if (workbookV3_() || workbookPendingOperation_()) return handleWorkbookEdit_(e);
  // Confirmation and archive actions already acquire their own document lock.
  if (e.range.getSheet().getName() === SHEET_SETUP &&
      [SETUP_CONFIRM_CELL, SETUP_UPDATE_CELL, SETUP_SAVE_CELL].includes(e.range.getA1Notation())) {
    handleEdit_(e);
    return;
  }
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    handleEdit_(e);
  } finally {
    try {
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  }
}

function handleEdit_(e) {
  if (!e || !e.range) return;

  const range = e.range;
  const sheet = range.getSheet();
  const sheetName = sheet.getName();
  const row = range.getRow();
  const col = range.getColumn();
  const a1 = range.getA1Notation();

  if (sheetName === SHEET_SETUP) {
    if (col <= 5 && col + range.getNumColumns() - 1 >= 5 &&
        row <= 4 && row + range.getNumRows() - 1 >= 4) {
      if (!applySelectedTimezone_()) return;
    }
    if (a1 === SETUP_SAVE_CELL) {
      if (range.getValue() === true) {
        try {
          saveTrip();
        } finally {
          range.setValue(false);
        }
      }
      return;
    }
    /*
     * Checkbox confirmation from Setup!B6.
     */
    if (a1 === SETUP_CONFIRM_CELL) {
      if (range.getValue() === true) {
        confirmSetupFromMenu();
      } else {
        recalculateAll(true);
      }
      return;
    }

    /*
     * Optional Setup!B7 checkbox trigger.
     */
    if (a1 === SETUP_UPDATE_CELL) {
      if (range.getValue() === true) {
        confirmSetupFromMenu();
      }
      return;
    }

    const changedTripName = a1 === SETUP_TRIP_NAME_CELL;
    const changedPeopleCount = a1 === SETUP_NUM_PEOPLE_CELL;
    const changedCurrency = a1 === SETUP_CURRENCY_CELL;

    const editedLastRow = row + range.getNumRows() - 1;
    const editedLastCol = col + range.getNumColumns() - 1;
    const changedRoster = editedLastRow >= ROSTER_START_ROW &&
      row < ROSTER_START_ROW + MAX_PARTICIPANTS &&
      col <= ROSTER_COL_EMAIL && editedLastCol >= ROSTER_COL_NUMBER;

    // New names below the active roster expand the selected count automatically.
    // Dormant rows outside this edit remain stored without reactivating them.
    if (changedRoster && col <= ROSTER_COL_NAME && editedLastCol >= ROSTER_COL_NAME) {
      let count = Number(sheet.getRange(SETUP_NUM_PEOPLE_CELL).getValue());
      if (Number.isInteger(count) && count >= MIN_PARTICIPANTS && count <= MAX_PARTICIPANTS) {
        const last = Math.min(editedLastRow, ROSTER_START_ROW + MAX_PARTICIPANTS - 1);
        for (let rosterRow = Math.max(row, ROSTER_START_ROW + count); rosterRow <= last; rosterRow++) {
          if (String(sheet.getRange(rosterRow, ROSTER_COL_NAME).getValue() || '').trim()) {
            count = rosterRow - ROSTER_START_ROW + 1;
          }
        }
        sheet.getRange(SETUP_NUM_PEOPLE_CELL).setValue(count);
      }
    }

    if (changedPeopleCount) {
      sheet.getRange(SETUP_CONFIRM_CELL).setValue(false);
      adjustRosterRows();
      validateSetupStatus();

      /*
       * Immediately rebuild G onward so added participant columns appear
       * even before the user uses the confirmation menu.
       */
      updateExpensesStructure();
      recalculateAll(true);

      /*
       * A participant-count change requires confirmation again.
       */
      sheet.getRange(SETUP_CONFIRM_CELL).setValue(false);
      return;
    }

    if (changedTripName || changedCurrency || changedRoster) {
      sheet.getRange(SETUP_CONFIRM_CELL).setValue(false);
      if (changedRoster) adjustRosterRows();
      validateSetupStatus();

      /*
       * Names must be reflected in Expenses headers immediately.
       * This remains non-destructive for Expenses A:F.
       */
      updateExpensesStructure();
      recalculateAll(true);

      /*
       * Any configuration/name change requires fresh confirmation.
       */
      sheet.getRange(SETUP_CONFIRM_CELL).setValue(false);
      return;
    }

    return;
  }

  /*
   * Recalculate when a user changes actual input fields only.
   * Generated participant columns are not inputs.
   */
  if (sheetName === SHEET_EXPENSES &&
      row + range.getNumRows() - 1 >= 2 &&
      row <= MAX_DATA_ROWS + 1 &&
      col >= COL.DATE &&
      col <= COL.CURRENCY) {
    recalculateAll(false);
  }
}

/* =========================================================
   EXPENSE SHEET STRUCTURE
   ========================================================= */

function ensureExpenseLayout_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EXPENSES);
  if (sheet && sheet.getRange(1, COL.CURRENCY).getValue() !== 'Currency') updateExpensesStructure();
}

/**
 * Rebuilds generated participant columns and moves the summary table.
 *
 * Safety:
 * - Does not delete or clear Expenses A:F.
 * - Clears only generated areas from G through the maximum possible summary end.
 * - Existing expense data remains untouched.
 */
function updateExpensesStructure() {
  if (workbookV3_()) return updateWorkbookExpenseLayout_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_EXPENSES);
  const setupSheet = ss.getSheetByName(SHEET_SETUP);

  if (!sheet || !setupSheet) return false;

  // Older trackers used F for generated values; discard that output before adding currency input.
  if (sheet.getRange(1, COL.CURRENCY).getValue() !== 'Currency') {
    sheet.getRange(1, COL.CURRENCY, MAX_DATA_ROWS + 15, 1)
      .breakApart().clearContent().clearFormat().clearDataValidations();
  }

  const participantCount = Number(
    setupSheet.getRange(SETUP_NUM_PEOPLE_CELL).getValue()
  );

  if (!Number.isInteger(participantCount) ||
      participantCount < MIN_PARTICIPANTS ||
      participantCount > MAX_PARTICIPANTS) {
    Logger.log(`Invalid participant count: ${participantCount}`);
    return false;
  }

  const rosterRows = setupSheet
    .getRange(ROSTER_START_ROW, 1, participantCount, 3)
    .getValues();

  const names = rosterRows.map((row, index) => {
    const name = String(row[1] || '').trim();
    return name || `Person ${index + 1}`;
  });

  const participantStartCol = FIRST_PERSON_COL;
  const participantEndCol = FIRST_PERSON_COL + participantCount - 1;

  const maxSummaryEndCol = getSummaryCol_(MAX_PARTICIPANTS) +
    SUMMARY_WIDTH - 1;

  if (sheet.getMaxColumns() < maxSummaryEndCol) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      maxSummaryEndCol - sheet.getMaxColumns()
    );
  }

  /*
   * Clear all old generated participant output and old summaries.
   *
   * Starts at G, so A:F expense input is never cleared.
   * This also removes stale headings for people who were removed.
   */
  const generatedStartCol = FIRST_PERSON_COL;
  const generatedWidth = maxSummaryEndCol - generatedStartCol + 1;

  const generatedRange = sheet.getRange(
    1,
    generatedStartCol,
    MAX_DATA_ROWS + 15,
    generatedWidth
  );

  generatedRange.breakApart();
  generatedRange.clearContent();
  generatedRange.clearFormat();
  generatedRange.clearDataValidations();

  /*
   * Rebuild normal expense headers plus all configured participants.
   */
  const headers = [
    'Date',
    'Description',
    'Amount',
    'Paid By',
    'Split Among',
    'Currency',
    ...names
  ];

  sheet
    .getRange(1, 1, 1, headers.length)
    .setValues([headers.map(literalSheetCell_)])
    .setBackground(COLOR.HEADER)
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  sheet.setFrozenRows(1);

  /*
   * Restore core input formats and validations without clearing values.
   */
  const dateRule = SpreadsheetApp.newDataValidation()
    .requireDate()
    .setAllowInvalid(false)
    .setHelpText('Enter a valid date, e.g. 09-Jan-2026.')
    .build();

  sheet
    .getRange(2, COL.DATE, MAX_DATA_ROWS, 1)
    .setDataValidation(dateRule)
    .setNumberFormat('dd-mmm-yyyy');

  const paidByRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(names, true)
    .setAllowInvalid(false)
    .build();

  sheet
    .getRange(2, COL.PAID_BY, MAX_DATA_ROWS, 1)
    .setDataValidation(paidByRule);

  sheet
    .getRange(2, COL.AMOUNT, MAX_DATA_ROWS, 1)
    .setNumberFormat('#,##0.00');

  sheet.getRange(2, COL.SPLIT, MAX_DATA_ROWS, 1)
    .clearDataValidations().setNumberFormat('@')
    .setNote('Equal: All, blank, or Rahul, Neha. Exclude: -Amit or -Amit, -Neha. Percentages: Rahul 30, Neha 70. ' +
      'Exact amounts in row currency, by roster position: 400, 500, 100.');
  sheet.getRange(2, COL.CURRENCY, MAX_DATA_ROWS, 1)
    .clearDataValidations().setNumberFormat('@')
    .setNote('Blank inherits Setup!B4. Enter a foreign ISO code such as USD, EUR or THB. ' +
      'Historical conversion requires a date in A and Enable Automatic Currency Conversion from the menu.');

  /*
   * Participant columns are calculated output only.
   * recalculateAll() will populate them immediately afterward.
   */
  sheet
    .getRange(
      2,
      participantStartCol,
      MAX_DATA_ROWS,
      participantCount
    )
    .setNumberFormat(getCurrencyFormat_())
    .setBackground('#FFFFFF')
    .setFontColor('#000000');

  /*
   * Apply practical widths.
   */
  sheet.setColumnWidth(COL.DATE, 100);
  sheet.setColumnWidth(COL.DESC, 200);
  sheet.setColumnWidth(COL.AMOUNT, 105);
  sheet.setColumnWidth(COL.PAID_BY, 120);
  sheet.setColumnWidth(COL.SPLIT, 180);
  sheet.setColumnWidth(COL.CURRENCY, 100);

  for (let column = participantStartCol;
       column <= participantEndCol;
       column++) {
    sheet.setColumnWidth(column, 105);
  }

  Logger.log('Expenses rebuilt; live summary is in Send Reports!H:K.');

  return true;
}

/* =========================================================
   MONEY AND EXPENSE CALCULATION HELPERS
   ========================================================= */

function toMinor_(value) {
  const amount = Number(value);

  return Number.isFinite(amount) && amount > 0
    ? Math.round(amount * 100)
    : 0;
}

function fromMinor_(minor) {
  return minor / 100;
}

function allocateEqualMinor_(amountMinor, people) {
  const sorted = [...people].sort((a, b) => a.id - b.id);
  const allocations = new Map();

  if (!amountMinor || !sorted.length) {
    return allocations;
  }

  const base = Math.floor(amountMinor / sorted.length);
  const remainder = amountMinor % sorted.length;

  sorted.forEach((person, index) => {
    allocations.set(
      person.id,
      base + (index < remainder ? 1 : 0)
    );
  });

  return allocations;
}

function parseIncluded_(splitValue, roster) {
  const value = String(splitValue || '').trim();

  if (!value || value.toLocaleLowerCase() === 'all') {
    return [...roster];
  }

  const byName = new Map(
    roster.map(person => [
      person.name.toLocaleLowerCase(),
      person
    ])
  );

  const seen = new Set();
  const people = [];

  value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .forEach(name => {
      const person = byName.get(name.toLocaleLowerCase());

      if (person && !seen.has(person.id)) {
        seen.add(person.id);
        people.push(person);
      }
    });

  return people;
}

function allocateWeightedMinor_(amountMinor, weights) {
  const total = weights.reduce((sum, item) => sum + item.weight, 0);
  const sorted = [...weights].sort((a, b) => a.person.id - b.person.id);
  const allocations = new Map();
  let allocated = 0;
  sorted.forEach(item => {
    const share = Number(BigInt(amountMinor) * BigInt(item.weight) / BigInt(total));
    allocations.set(item.person.id, share);
    allocated += share;
  });
  let remainder = amountMinor - allocated;
  sorted.filter(item => item.weight > 0).forEach(item => {
    if (remainder > 0) {
      allocations.set(item.person.id, allocations.get(item.person.id) + 1);
      remainder--;
    }
  });
  return allocations;
}

function parseSplitAmong_(splitValue, roster, amountMinor, sourceAmountMinor = amountMinor) {
  const value = String(splitValue == null ? '' : splitValue).trim();
  const parts = value.split(',').map(part => part.trim());
  const byName = new Map(roster.map(person => [person.name.toLocaleLowerCase(), person]));
  const exact = /^\d+(?:\.\d{1,2})?(?:\s*,\s*\d+(?:\.\d{1,2})?)*$/;
  const percentage = /^(.+?)\s+(\d+(?:\.\d{1,4})?)\s*%?$/;
  if (value && exact.test(value)) {
    if (parts.length > roster.length) throw new Error('Exact split has more positions than roster members.');
    const weights = parts.map((part, index) => ({ person: roster[index], weight: toMinor_(part) }));
    const total = weights.reduce((sum, item) => sum + item.weight, 0);
    if (!Number.isSafeInteger(total) || weights.some(item => !Number.isSafeInteger(item.weight))) {
      throw new Error('Exact split exceeds the safe integer range.');
    }
    if (total !== sourceAmountMinor) {
      throw new Error(`Exact split total (${fromMinor_(total)}) does not match total bill (${fromMinor_(sourceAmountMinor)})`);
    }
    return {
      mode: 'exact', included: weights.filter(item => item.weight > 0).map(item => item.person),
      allocations: allocateWeightedMinor_(amountMinor, weights)
    };
  }
  // Prefer a complete name match, so roster names such as "Person 4" remain usable.
  const namedEqual = !value || value.toLocaleLowerCase() === 'all' ||
    parts.every(part => !part || byName.has(part.toLocaleLowerCase()));
  const exclusions = parts.filter(Boolean);
  if (!namedEqual && exclusions.length && exclusions.every(part => part.startsWith('-'))) {
    const excludedIds = new Set();
    exclusions.forEach(part => {
      const name = part.slice(1).trim();
      const person = byName.get(name.toLocaleLowerCase());
      if (!person) throw new Error(`Excluded name '${name}' is not a roster member.`);
      excludedIds.add(person.id);
    });
    const included = roster.filter(person => !excludedIds.has(person.id));
    if (!included.length) throw new Error('Split Among excludes every roster member.');
    return { mode: 'equal', included, allocations: allocateEqualMinor_(amountMinor, included) };
  }
  if (!namedEqual && parts.some(part => percentage.test(part))) {
    const seen = new Set();
    const weights = parts.map(part => {
      const match = percentage.exec(part);
      if (!match) throw new Error('Use name-percentage pairs for every split entry.');
      const person = byName.get(match[1].trim().toLocaleLowerCase());
      if (!person) throw new Error(`Split name '${match[1].trim()}' is not a roster member.`);
      if (seen.has(person.id)) throw new Error(`Duplicate split percentage for '${person.name}'.`);
      seen.add(person.id);
      const weight = Math.round(Number(match[2]) * 10000);
      if (!Number.isSafeInteger(weight) || weight > 1000000) throw new Error('Each split percentage must be between 0 and 100.');
      return { person, weight };
    });
    const total = weights.reduce((sum, item) => sum + item.weight, 0);
    if (total !== 1000000) throw new Error(`Split percentages total ${total / 10000}%, must equal 100%`);
    return {
      mode: 'percentage', included: weights.filter(item => item.weight > 0).map(item => item.person),
      allocations: allocateWeightedMinor_(amountMinor, weights)
    };
  }
  const included = parseIncluded_(value, roster);
  if (!included.length) throw new Error('Split Among has no valid roster member.');
  const unknown = value && value.toLocaleLowerCase() !== 'all' &&
    parts.find(part => part && !byName.has(part.toLocaleLowerCase()));
  if (unknown) throw new Error(`Split name '${unknown}' is not a roster member.`);
  return { mode: 'equal', included, allocations: allocateEqualMinor_(amountMinor, included) };
}

/* =========================================================
   LEDGER CONSTRUCTION
   ========================================================= */

/**
 * Builds an exact financial ledger only from Expenses columns A:F.
 */
function buildLedger_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_EXPENSES);
  const roster = getRoster();

  const peopleById = new Map(
    roster.map(person => [person.id, person])
  );

  const peopleByName = new Map(
    roster.map(person => [
      person.name.toLocaleLowerCase(),
      person
    ])
  );

  const balances = new Map(
    roster.map(person => [person.id, 0])
  );

  const paid = new Map(
    roster.map(person => [person.id, 0])
  );

  const spent = new Map(
    roster.map(person => [person.id, 0])
  );

  const rowRecords = new Map();
  const errors = [];
  const expenses = [];

  let totalMinor = 0;

  if (!sheet || !roster.length) {
    return {
      roster,
      peopleById,
      balances,
      paid,
      spent,
      rowRecords,
      errors,
      expenses,
      totalMinor
    };
  }

  const lastRow = Math.min(
    Math.max(sheet.getLastRow(), 1),
    MAX_DATA_ROWS + 1
  );

  if (lastRow < 2) {
    return {
      roster,
      peopleById,
      balances,
      paid,
      spent,
      rowRecords,
      errors,
      expenses,
      totalMinor
    };
  }

  ensureExpenseLayout_();
  const baseCurrency = getCurrencySymbol_();
  const fxState = { results: new Map() };

  const data = sheet
    .getRange(2, 1, lastRow - 1, workbookV3_() ? 7 : COL.CURRENCY)
    .getValues();

  data.forEach((row, index) => {
    const rowNumber = index + 2;

    const nonEmpty = row.some(value =>
      String(value == null ? '' : value).trim() !== ''
    );

    if (!nonEmpty) {
      rowRecords.set(rowNumber, null);
      return;
    }

    const sourceAmountMinor = toMinor_(row[COL.AMOUNT - 1]);
    const payerText = String(
      row[COL.PAID_BY - 1] || ''
    ).trim();

    /*
     * A partly entered row is ignored during live calculations.
     */
    if (!sourceAmountMinor || !payerText) {
      if (workbookV3_()) errors.push(`Row ${rowNumber}: enter a positive amount and a payer, or clear the draft.`);
      rowRecords.set(rowNumber, null);
      return;
    }

    const payer = peopleByName.get(
      payerText.toLocaleLowerCase()
    );

    if (!payer) {
      errors.push(
        `Row ${rowNumber}: Paid By '${payerText}' is not a roster member.`
      );
      rowRecords.set(rowNumber, null);
      return;
    }

    let amountMinor = sourceAmountMinor;
    let split;
    let sourceCurrency = baseCurrency;
    let exchangeRate = 1;
    try {
      if (!Number.isSafeInteger(sourceAmountMinor)) throw new Error('Amount exceeds the safe integer range.');
      // Validate against the entered bill before requesting any foreign rate.
      split = parseSplitAmong_(row[COL.SPLIT - 1], roster, sourceAmountMinor);
      const currencyText = String(row[COL.CURRENCY - 1] || '').trim();
      if (currencyText) {
        sourceCurrency = currencyCode_(currencyText);
        const targetCurrency = currencyCode_(baseCurrency);
        if (sourceCurrency !== targetCurrency) {
          const date = fxDate_(row[COL.DATE - 1], ss.getSpreadsheetTimeZone());
          exchangeRate = getFxRate_(sourceCurrency, targetCurrency, date, fxState);
          amountMinor = convertFxMinor_(sourceAmountMinor, exchangeRate);
          if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
            throw new Error('Converted amount must be at least one minor unit and within the safe integer range.');
          }
          split = parseSplitAmong_(row[COL.SPLIT - 1], roster, amountMinor, sourceAmountMinor);
        }
      }
      if (!Number.isSafeInteger(totalMinor + amountMinor)) throw new Error('Trip total exceeds the safe integer range.');
    } catch (err) {
      errors.push(`Row ${rowNumber}: ${err.message}`);
      rowRecords.set(rowNumber, null);
      return;
    }
    const { included, allocations } = split;

    let allocationSum = 0;

    allocations.forEach(value => {
      allocationSum += value;
    });

    if (allocationSum !== amountMinor) {
      errors.push(
        `Row ${rowNumber}: allocation does not equal the expense amount.`
      );
      rowRecords.set(rowNumber, null);
      return;
    }

    balances.set(
      payer.id,
      balances.get(payer.id) + amountMinor
    );

    paid.set(
      payer.id,
      paid.get(payer.id) + amountMinor
    );

    allocations.forEach((shareMinor, personId) => {
      balances.set(
        personId,
        balances.get(personId) - shareMinor
      );

      spent.set(
        personId,
        spent.get(personId) + shareMinor
      );
    });

    const rawDate = row[COL.DATE - 1];

    const date = rawDate instanceof Date
      ? Utilities.formatDate(
        rawDate,
        ss.getSpreadsheetTimeZone(),
        'dd-MMM-yyyy'
      )
      : String(rawDate || '');

    const record = {
      row: rowNumber,
      amountMinor,
      sourceAmountMinor,
      sourceCurrency,
      exchangeRate,
      splitMode: split.mode,
      paidById: payer.id,
      includedIds: included.map(person => person.id),
      allocations,
      date,
      description: String(row[COL.DESC - 1] || '')
    };

    rowRecords.set(rowNumber, record);
    expenses.push(record);
    totalMinor += amountMinor;
  });

  let ledgerSum = 0;

  balances.forEach(value => {
    ledgerSum += value;
  });

  if (ledgerSum !== 0) {
    errors.push(
      `Ledger integrity error: balances sum to ${ledgerSum} paise, not zero.`
    );
  }

  const ledger = {
    roster,
    peopleById,
    balances,
    paid,
    spent,
    rowRecords,
    errors,
    expenses,
    totalMinor
  };
  return workbookV3_() ? decorateWorkbookLedger_(ledger, data) : ledger;
}

/* =========================================================
   LIVE CALCULATIONS AND SUMMARY TABLE
   ========================================================= */

function recalculateAll(forceReports) {
  if (workbookPendingOperation_() && !workbookMaintenance_) throw new Error('Recover the interrupted operation before recalculating.');
  if (workbookV3_() && workbookLockDepth_ === 0) return withTripLock_(() => recalculateAll(forceReports));
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_EXPENSES);

  if (!sheet) return;

  if (workbookV3_()) repairExpenseIds_();

  const ledger = buildLedger_();
  const roster = ledger.roster;
  if (workbookV3_()) refreshWorkbookViews_(ledger);

  if (!roster.length) {
    updateSendReportsSheet(ledger);
    return;
  }

  const rosterCount = roster.length;
  const format = getCurrencyFormat_();

  const requiredColumns = expenseFirstPersonCol_() + rosterCount - 1;

  if (sheet.getMaxColumns() < requiredColumns) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      requiredColumns - sheet.getMaxColumns()
    );
  }

  const lastRow = Math.min(
    Math.max(sheet.getLastRow(), 1),
    MAX_DATA_ROWS + 1
  );

  if (lastRow >= 2) {
    const matrix = [];

    for (let rowNumber = 2; rowNumber <= lastRow; rowNumber++) {
      const record = ledger.rowRecords.get(rowNumber);

      if (!record) {
        matrix.push(new Array(rosterCount).fill(''));
        continue;
      }

      matrix.push(
        roster.map(person => {
          const paidMinor = record.paidById === person.id
            ? record.amountMinor
            : 0;

          const shareMinor = record.allocations.get(person.id) || 0;

          return fromMinor_(paidMinor - shareMinor);
        })
      );
    }

    sheet
      .getRange(
        2,
        expenseFirstPersonCol_(),
        matrix.length,
        rosterCount
      )
      .setValues(matrix)
      .setNumberFormat(format);
  }

  // The summary remains live in Send Reports even before confirmation.
  updateSendReportsSheet(ledger);
}

function writeLiveSummary_(sheet, col, ledger, format) {
  const roster = ledger.roster;
  const height = roster.length + 5;

  const summaryRange = sheet.getRange(
    1,
    col,
    height + 3,
    SUMMARY_WIDTH
  );

  summaryRange.breakApart();
  summaryRange.clearContent();
  summaryRange.clearFormat();

  sheet.getRange(1, col, 1, SUMMARY_WIDTH)
    .merge()
    .setValue('LIVE SUMMARY')
    .setBackground(COLOR.HEADER_DARK)
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  sheet.getRange(2, col, 1, 3)
    .merge()
    .setValue('Total Spent (Everyone)')
    .setBackground(COLOR.TOTAL_BG)
    .setFontWeight('bold');

  sheet.getRange(2, col + 3)
    .setValue(fromMinor_(ledger.totalMinor))
    .setBackground(COLOR.TOTAL_BG)
    .setFontWeight('bold')
    .setNumberFormat(format);

  sheet.getRange(3, col, 1, SUMMARY_WIDTH)
    .setValues([[
      'Person',
      'Paid',
      'Spent (Share)',
      'Net (+ collect / − owe)'
    ]])
    .setBackground(COLOR.HEADER_MID)
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');

  const rows = roster.map(person => [
    person.name,
    fromMinor_(ledger.paid.get(person.id) || 0),
    fromMinor_(ledger.spent.get(person.id) || 0),
    fromMinor_(ledger.balances.get(person.id) || 0)
  ]);

  sheet
    .getRange(4, col, roster.length, SUMMARY_WIDTH)
    .setValues(rows.map(row => row.map(literalSheetCell_)));

  sheet
    .getRange(4, col + 1, roster.length, 3)
    .setNumberFormat(format);

  sheet
    .getRange(4, col + 1, roster.length, 2)
    .setBackground(COLOR.BLUE_BG)
    .setFontColor(COLOR.BLUE_TX);

  const netBackgrounds = [];
  const netFontColors = [];

  roster.forEach(person => {
    const net = ledger.balances.get(person.id) || 0;

    if (net > 0) {
      netBackgrounds.push([COLOR.GREEN_BG]);
      netFontColors.push([COLOR.GREEN_TX]);
    } else if (net < 0) {
      netBackgrounds.push([COLOR.RED_BG]);
      netFontColors.push([COLOR.RED_TX]);
    } else {
      netBackgrounds.push([COLOR.GRAY_BG]);
      netFontColors.push([COLOR.GRAY_TX]);
    }
  });

  sheet
    .getRange(4, col + 3, roster.length, 1)
    .setBackgrounds(netBackgrounds)
    .setFontColors(netFontColors);

  sheet
    .getRange(roster.length + 4, col, 1, SUMMARY_WIDTH)
    .merge()
    .setValue(
      'Spent = a person’s technical share, even if another person paid the bill.'
    ).setNote('Net includes whole-unit payment rounding. Paid and spent retain exact stored values but display without decimals.')
    .setFontStyle('italic')
    .setFontColor('#64748B')
    .setFontSize(9);
}

/* =========================================================
   SETTLEMENT CALCULATION
   ========================================================= */

/**
 * Finds a globally minimum transfer plan for at most MAX_PARTICIPANTS people.
 * Each connected settlement group must sum to zero. Maximizing the number of
 * disjoint zero-sum groups minimizes transfers: nonzero people minus groups.
 */
function calculateOptimalSettlements_(ledger) {
  if (ledger.errors.length) {
    throw new Error(ledger.errors.join(' | '));
  }

  if (ledger.roster.length > MAX_PARTICIPANTS) {
    throw new Error(`Exact settlement supports at most ${MAX_PARTICIPANTS} participants.`);
  }

  if (ledger.balances.size !== ledger.roster.length) {
    throw new Error('Every roster participant must have exactly one balance.');
  }

  const ids = new Set();
  let creditTotal = 0;
  let debtTotal = 0;

  ledger.roster.forEach(person => {
    if (!Number.isSafeInteger(person.id) || person.id <= 0 || ids.has(person.id) ||
        typeof person.name !== 'string' || !person.name.trim()) {
      throw new Error('Invalid or duplicate settlement participant.');
    }

    ids.add(person.id);

    if (!ledger.balances.has(person.id)) {
      throw new Error(`Missing balance for roster participant ${person.id}.`);
    }

    const net = ledger.balances.get(person.id);

    if (!Number.isSafeInteger(net)) {
      throw new Error('Settlement balances must be safe integer minor units.');
    }

    creditTotal += Math.max(net, 0);
    debtTotal += Math.max(-net, 0);

    if (!Number.isSafeInteger(creditTotal) || !Number.isSafeInteger(debtTotal)) {
      throw new Error('Settlement totals exceed the safe integer range.');
    }
  });

  if (creditTotal !== debtTotal) {
    throw new Error(`Ledger is not balanced: ${creditTotal - debtTotal} paise remaining.`);
  }

  const people = ledger.roster
    .filter(person => ledger.balances.get(person.id) !== 0)
    .sort((a, b) => a.id - b.id);

  if (!people.length) return [];

  const values = people.map(person => ledger.balances.get(person.id));
  const stateCount = 1 << people.length;
  const sums = new Float64Array(stateCount);
  const groupCounts = new Uint8Array(stateCount);
  const choices = new Uint16Array(stateCount);

  // An ordering's zero-sum prefixes delimit independent balanced groups.
  // For each subset, keep the best prefix count after removing one last person.
  // A zero-sum subset completes one more group. Work: O(n * 2^n), space: O(2^n).
  for (let mask = 1; mask < stateCount; mask++) {
    const firstBit = mask & -mask;
    sums[mask] = sums[mask ^ firstBit] + values[31 - Math.clz32(firstBit)];

    let best = -1;

    for (let bits = mask; bits; bits &= bits - 1) {
      const bit = bits & -bits;
      const candidate = groupCounts[mask ^ bit];

      // Ascending IDs and keeping the first tied choice make plans repeatable.
      if (candidate > best) {
        best = candidate;
        choices[mask] = bit;
      }
    }

    groupCounts[mask] = best + (sums[mask] === 0 ? 1 : 0);
  }

  const order = [];

  for (let mask = stateCount - 1; mask; mask ^= choices[mask]) {
    order.push(31 - Math.clz32(choices[mask]));
  }

  order.reverse();

  const groups = [];
  let members = [];
  let groupSum = 0;

  order.forEach(index => {
    members.push(people[index]);
    groupSum += values[index];

    if (groupSum === 0) {
      groups.push(members.sort((a, b) => a.id - b.id));
      members = [];
    }
  });

  if (members.length || groups.length !== groupCounts[stateCount - 1]) {
    throw new Error('Could not reconstruct the minimum settlement groups.');
  }

  groups.sort((a, b) => a[0].id - b[0].id);

  const settlements = [];

  groups.forEach(roster => {
    const balances = new Map(roster.map(person => [person.id, ledger.balances.get(person.id)]));

    // No optimal group can split further. Greedy clears that group in k - 1
    // transfers, and independently verifies every member's balance is cleared.
    settlements.push(...calculateGreedySettlements_({ roster, balances, errors: [] }));
  });

  const minimumCount = people.length - groups.length;

  if (settlements.length !== minimumCount) {
    throw new Error('Settlement count does not match the proven minimum.');
  }

  return settlements;
}

function wholeUnits_(minor) {
  const absolute = Math.abs(minor);
  const rounded = Math.floor(absolute / 100) + (absolute % 100 >= 50 ? 1 : 0);
  return minor < 0 && rounded !== 0 ? -rounded : rounded;
}

function buildWholeUnitLedger_(ledger) {
  if (ledger.wholeUnitPayments || ledger.errors.length) return ledger;
  const balances = new Map(ledger.roster.map(person => [person.id, 0]));
  try {
    // Round each payment once for both parties, so no money is created or lost.
    calculateOptimalSettlements_(ledger).forEach(payment => {
      const amount = wholeUnits_(payment.amountMinor) * 100;
      balances.set(payment.fromId, balances.get(payment.fromId) - amount);
      balances.set(payment.toId, balances.get(payment.toId) + amount);
    });
    const credits = [...balances.values()].reduce((sum, value) => sum + Math.max(value, 0), 0);
    if (!Number.isSafeInteger(credits) || [...balances.values()].some(value => !Number.isSafeInteger(value))) {
      throw new Error('Rounded settlement totals exceed the safe integer range.');
    }
    return { ...ledger, balances, wholeUnitPayments: true };
  } catch (err) {
    return { ...ledger, errors: [...ledger.errors, err.message] };
  }
}

function buildSettlementExplanations_(ledger, settlements, currency) {
  const remaining = new Map(ledger.balances);
  const money = minor => `${minor < 0 ? '-' : ''}${currency}${wholeUnits_(Math.abs(minor))}`;

  return settlements.map(settlement => {
    const fromId = settlement.fromId;
    const toId = settlement.toId;
    const debtBefore = -remaining.get(fromId);
    const creditBefore = remaining.get(toId);
    const debtAfter = debtBefore - settlement.amountMinor;
    const creditAfter = creditBefore - settlement.amountMinor;

    remaining.set(fromId, -debtAfter);
    remaining.set(toId, creditAfter);

    return [
      `${settlement.from} owes ${money(debtBefore)}. ${settlement.to} needs ${money(creditBefore)}.`,
      `Pay ${money(settlement.amountMinor)} so at least one person reaches ${money(0)} balance.`
    ].join('\n');
  });
}

function calculateGreedySettlements_(ledger) {
  if (ledger.errors.length) {
    throw new Error(ledger.errors.join(' | '));
  }

  let total = 0;

  ledger.balances.forEach(value => {
    total += value;
  });

  if (total !== 0) {
    throw new Error(
      `Ledger is not balanced: ${total} paise remaining.`
    );
  }

  const debtors = [];
  const creditors = [];

  ledger.roster.forEach(person => {
    const net = ledger.balances.get(person.id) || 0;

    if (net < 0) {
      debtors.push({
        id: person.id,
        name: person.name,
        remaining: -net
      });
    }

    if (net > 0) {
      creditors.push({
        id: person.id,
        name: person.name,
        remaining: net
      });
    }
  });

  debtors.sort(
    (a, b) => b.remaining - a.remaining || a.id - b.id
  );

  creditors.sort(
    (a, b) => b.remaining - a.remaining || a.id - b.id
  );

  const settlements = [];

  let debtorIndex = 0;
  let creditorIndex = 0;

  while (
    debtorIndex < debtors.length &&
    creditorIndex < creditors.length
  ) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];

    const amountMinor = Math.min(
      debtor.remaining,
      creditor.remaining
    );

    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new Error(
        'Invalid non-positive settlement amount encountered.'
      );
    }

    if (!debtor.name || !creditor.name || debtor.id === creditor.id) {
      throw new Error(
        'Invalid settlement participant encountered.'
      );
    }

    settlements.push({
      fromId: debtor.id,
      from: debtor.name,
      toId: creditor.id,
      to: creditor.name,
      amountMinor
    });

    debtor.remaining -= amountMinor;
    creditor.remaining -= amountMinor;

    if (debtor.remaining === 0) {
      debtorIndex++;
    }

    if (creditor.remaining === 0) {
      creditorIndex++;
    }
  }

  if (
    debtorIndex !== debtors.length ||
    creditorIndex !== creditors.length
  ) {
    throw new Error('Settlement did not clear every balance.');
  }

  const verification = new Map(ledger.balances);

  settlements.forEach(settlement => {
    verification.set(
      settlement.fromId,
      verification.get(settlement.fromId) + settlement.amountMinor
    );

    verification.set(
      settlement.toId,
      verification.get(settlement.toId) - settlement.amountMinor
    );
  });

  verification.forEach((value, participantId) => {
    if (value !== 0) {
      throw new Error(
        `Settlement verification failed for person ID ${participantId}.`
      );
    }
  });

  return settlements;
}

/* =========================================================
   CONFIRM / UNCONFIRM EXPENSES
   ========================================================= */

function confirmAllExpenses() {
  if (workbookV3_()) return confirmWorkbookV3_();
  const setupSheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_SETUP);

  if (!setupSheet) {
    safeAlert('Setup sheet not found. Run “Initialize / Reset Tracker” first.');
    return;
  }

  if (!validateSetupStatus()) {
    safeAlert('Cannot confirm expenses: complete the setup first.');
    return;
  }

  setupSheet.getRange(SETUP_CONFIRM_CELL).setValue(true);

  updateExpensesStructure();
  recalculateAll(true);

  safeAlert('Expenses confirmed. Reports and settlement calculations are now available.');
}

function unconfirmExpenses() {
  const setupSheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_SETUP);

  if (!setupSheet) {
    safeAlert('Setup sheet not found.');
    return;
  }

  setupSheet.getRange(SETUP_CONFIRM_CELL).setValue(false);
  recalculateAll(true);

  safeAlert('Expenses are open for editing again. Reports are marked as unconfirmed.');
}

/* =========================================================
   REPORTS SHEET
   ========================================================= */

function updateSendReportsSheet(existingLedger) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheet = ss.getSheetByName(SHEET_REPORTS) ||
    ss.insertSheet(SHEET_REPORTS);

  const ledger = buildWholeUnitLedger_(existingLedger || buildLedger_());
  const roster = ledger.roster;
  const format = getCurrencyFormat_();

  // Clear the largest supported report footprint even after a roster shrinks.
  const requiredRows = MAX_PARTICIPANTS + 25;

  if (sheet.getMaxRows() < requiredRows) {
    sheet.insertRowsAfter(
      sheet.getMaxRows(),
      requiredRows - sheet.getMaxRows()
    );
  }

  if (sheet.getMaxColumns() < 11) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      11 - sheet.getMaxColumns()
    );
  }

  const output = sheet.getRange(1, 1, requiredRows, 6);

  output.breakApart();
  output.clearContent();
  output.clearFormat();
  output.clearDataValidations();

  const liveRange = sheet.getRange(1, 8, MAX_PARTICIPANTS + 8, SUMMARY_WIDTH);
  liveRange.breakApart().clearContent().clearFormat();
  if (roster.length) writeLiveSummary_(sheet, 8, ledger, format);
  sheet.setColumnWidth(7, 24);
  sheet.setColumnWidth(8, 140);
  sheet.setColumnWidth(9, 110);
  sheet.setColumnWidth(10, 125);
  sheet.setColumnWidth(11, 170);

  if (!roster.length) {
    sheet.getRange('A1:F1').merge().setValue('Complete Setup with valid participant names.');
    return;
  }

  if (ledger.errors.length || (workbookV3_() && ledger.duplicateCount)) {
    sheet.getRange('A1:F1')
      .merge()
      .setValue(
        `❌ Cannot create settlement plan: ${ledger.errors.join(' | ')}${ledger.duplicateCount ? ' Acknowledge duplicate warnings in Expenses!Y.' : ''}`
      )
      .setBackground(COLOR.RED_BG)
      .setFontColor(COLOR.RED_TX)
      .setFontWeight('bold');

    return;
  }

  if (!isExpensesConfirmed()) {
    sheet.getRange('A1:F1')
      .merge()
      .setValue(
        '⚠️ Expenses are not confirmed. Use Setup!B6 or Expense Splitter > Confirm / Update Setup.'
      )
      .setBackground(COLOR.WARN_BG)
      .setFontColor(COLOR.WARN_TX)
      .setFontWeight('bold');

    return;
  }

  sheet.getRange('A1:F1')
    .merge()
    .setValue('PERSONAL BALANCES SUMMARY')
    .setBackground(COLOR.HEADER_DARK)
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');

  sheet.getRange('A2:F2')
    .setValues([[
      'Name',
      'Email',
      'Total Paid',
      'Total Share',
      'Net Balance',
      'Report Status'
    ]])
    .setBackground(COLOR.HEADER_MID)
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');

  const summaryRows = roster.map(person => [
    person.name,
    person.email || '—',
    fromMinor_(ledger.paid.get(person.id) || 0),
    fromMinor_(ledger.spent.get(person.id) || 0),
    fromMinor_(ledger.balances.get(person.id) || 0),
    person.email ? 'Not Sent' : 'No email — will be skipped'
  ]);

  sheet
    .getRange(3, 1, summaryRows.length, 6)
    .setValues(summaryRows.map(row => row.map(literalSheetCell_)));

  sheet
    .getRange(3, 3, summaryRows.length, 3)
    .setNumberFormat(format);

  const netBackgrounds = [];
  const netFontColors = [];

  roster.forEach(person => {
    const net = ledger.balances.get(person.id) || 0;

    if (net > 0) {
      netBackgrounds.push([COLOR.GREEN_BG]);
      netFontColors.push([COLOR.GREEN_TX]);
    } else if (net < 0) {
      netBackgrounds.push([COLOR.RED_BG]);
      netFontColors.push([COLOR.RED_TX]);
    } else {
      netBackgrounds.push([COLOR.GRAY_BG]);
      netFontColors.push([COLOR.GRAY_TX]);
    }
  });

  sheet
    .getRange(3, 5, roster.length, 1)
    .setBackgrounds(netBackgrounds)
    .setFontColors(netFontColors);

  let settlements;
  let explanations;

  try {
    settlements = calculateOptimalSettlements_(ledger);
    explanations = buildSettlementExplanations_(ledger, settlements, getCurrencySymbol_());
  } catch (err) {
    sheet.getRange(roster.length + 5, 1, 1, 6)
      .merge()
      .setValue(`❌ Settlement error: ${err.message}`)
      .setBackground(COLOR.RED_BG)
      .setFontColor(COLOR.RED_TX)
      .setFontWeight('bold');

    return;
  }

  const startRow = roster.length + 5;

  sheet.getRange(startRow, 1, 1, 5)
    .merge()
    .setValue(`SIMPLIFIED SETTLEMENT PLAN — ${settlements.length} transfer${settlements.length === 1 ? '' : 's'} (minimum)`)
    .setBackground(COLOR.HEADER)
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');

  sheet.getRange(startRow + 1, 1, 1, 5)
    .setValues([[
      'From (Debtor)',
      'To (Creditor)',
      'Amount',
      'Instruction',
      'Explanation'
    ]])
    .setBackground(COLOR.HEADER_MID)
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');

  if (settlements.length) {
    const symbol = getCurrencySymbol_();

    const rows = settlements.map((settlement, index) => {
      const amount = fromMinor_(settlement.amountMinor);

      return [
        settlement.from,
        settlement.to,
        amount,
        `${settlement.from} pays ${settlement.to} ${symbol}${amount.toFixed(0)}`,
        explanations[index]
      ];
    });

    sheet
      .getRange(startRow + 2, 1, rows.length, 5)
      .setValues(rows.map(row => row.map(literalSheetCell_)));

    sheet
      .getRange(startRow + 2, 3, rows.length, 1)
      .setNumberFormat(format);

    sheet.getRange(startRow + 2, 5, rows.length, 1)
      .setWrap(true)
      .setVerticalAlignment('top');

  } else {
    sheet.getRange(startRow + 2, 1, 1, 5)
      .merge()
      .setValue('All debts settled!')
      .setFontStyle('italic');
  }

  sheet.autoResizeColumns(1, 4);
  sheet.autoResizeColumns(6, 1);
  sheet.setColumnWidth(5, 480);

  if (settlements.length) {
    sheet.autoResizeRows(startRow + 2, settlements.length);
  }
}

/* =========================================================
   EMAIL AND PDF REPORTS
   ========================================================= */

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Builds the same self-contained, print-oriented HTML used for emailed PDFs.
 * Table layouts avoid reliance on flex/grid support in the PDF converter.
 */
function buildParticipantReportHtml_({ ledger, settlements, person, tripName, currency, generatedOn }) {
  if (!ledger.wholeUnitPayments) {
    ledger = buildWholeUnitLedger_(ledger);
    settlements = calculateOptimalSettlements_(ledger);
  }
  const money = minor => escapeHtml_(currency) + String(wholeUnits_(minor))
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const paid = ledger.paid.get(person.id) || 0;
  const spent = ledger.spent.get(person.id) || 0;
  const net = ledger.balances.get(person.id) || 0;
  const state = net < 0 ? 'pay' : net > 0 ? 'receive' : 'settled';
  const headline = net < 0 ? 'You need to pay' : net > 0 ? 'You will receive' : 'All settled';
  const explanation = net < 0
    ? 'Your share is more than you paid. The payments below settle the difference.'
    : net > 0
      ? 'You paid more than your share. The payments below return the difference to you.'
      : 'Your payments already cover your share. No money needs to change hands.';
  const relevantExpenses = ledger.expenses.filter(expense =>
    expense.paidById === person.id || expense.includedIds.includes(person.id)
  );
  const actions = settlements.filter(action => action.fromId === person.id || action.toId === person.id);
  const actionRows = actions.map(action => {
    const text = action.fromId === person.id
      ? `You pay <b>${escapeHtml_(action.to)}</b> ${money(action.amountMinor)}`
      : `<b>${escapeHtml_(action.from)}</b> pays you ${money(action.amountMinor)}`;
    return `<li>${text}</li>`;
  }).join('') || '<li>No settlement required.</li>';
  const expenseRows = relevantExpenses.map(expense => {
    const payer = ledger.peopleById.get(expense.paidById);
    return `<tr class="expense-row">
      <td class="date">${escapeHtml_(expense.date || '—')}</td>
      <td>${escapeHtml_(expense.description || 'Untitled expense')}</td>
      <td class="amount">${money(expense.amountMinor)}</td>
      <td>${escapeHtml_(payer.name)}</td>
      <td class="amount share">${money(expense.allocations.get(person.id) || 0)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="empty">No expenses involve you.</td></tr>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml_(tripName)} — ${escapeHtml_(person.name)} | Expense statement</title>
  <style>
    @page { size: A4; margin: 16mm 14mm 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #172d35; font: 10pt/1.45 Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    table { width: 100%; border-collapse: collapse; }
    .masthead { border-top: 5px solid #0f766e; margin-bottom: 22px; }
    .masthead td { padding-top: 13px; vertical-align: top; }
    .brand { color: #0f766e; font-size: 10pt; font-weight: bold; }
    .document-type { text-align: right; color: #52636b; font-size: 8pt; letter-spacing: 1px; }
    .eyebrow { margin: 0 0 6px; color: #52636b; font-size: 8pt; letter-spacing: 1.6px; text-transform: uppercase; }
    h1 { margin: 0 0 8px; font-size: 27pt; line-height: 1.15; letter-spacing: -0.5px; }
    .intro { margin: 0 0 3px; font-size: 11pt; }
    .generated { margin: 0 0 23px; color: #52636b; font-size: 9pt; }
    h1, h2, td, li, .intro { overflow-wrap: anywhere; word-wrap: break-word; }
    h2 { margin: 0 0 9px; font-size: 11pt; line-height: 1.3;
      page-break-after: avoid; break-after: avoid; }
    .balance { padding: 19px 22px; border: 1px solid #c6e3df; border-left: 4px solid #0f766e;
      background: #f0f8f6; margin: 23px 0 15px; page-break-inside: avoid; break-inside: avoid; }
    .balance.pay { background: #fff8ec; border-color: #e7d6b8; border-left-color: #94620d; }
    .balance.settled { background: #f4f6f7; border-color: #d9e0e3; border-left-color: #52636b; }
    .balance-label { margin: 0; font-size: 10pt; font-weight: bold; }
    .balance-value { margin: 2px 0 7px; font-size: 32pt; line-height: 1.2; font-weight: bold; letter-spacing: -1px; }
    .balance-note { margin: 0; max-width: 490px; font-size: 9pt; color: #364f57; }
    .actions { margin: 0 0 21px; padding: 0 2px; }
    .settlement-list { margin: 0; padding: 0 0 0 19px; }
    .settlement-list li { padding: 4px 0; page-break-inside: avoid; break-inside: avoid; }
    .metrics { table-layout: fixed; border-top: 1px solid #d9e2e5; border-bottom: 1px solid #d9e2e5;
      margin-bottom: 23px; page-break-inside: avoid; break-inside: avoid; }
    .metrics td { width: 33.33%; padding: 14px 10px; vertical-align: top; }
    .metrics td:first-child { padding-left: 0; }
    .metric-label { display: block; font-size: 8pt; color: #52636b; margin-bottom: 4px; }
    .metric-value { display: block; font-weight: bold; font-size: 16pt; line-height: 1.3; }
    .metric-note { display: block; font-size: 8pt; color: #52636b; margin-top: 3px; }
    .section-note { margin: -3px 0 12px; font-size: 9pt; color: #52636b; }
    .expenses { table-layout: fixed; font-size: 9pt; line-height: 1.45; }
    .expenses thead { display: table-header-group; }
    .expenses th { background: #edf3f3; padding: 10px 7px; font-size: 8pt; text-align: left;
      border-top: 1px solid #d3dfe0; border-bottom: 1px solid #d3dfe0; }
    .expenses td { padding: 10px 7px; border-bottom: 1px solid #e2e8ea; vertical-align: top; }
    .expenses tr { page-break-inside: avoid; break-inside: avoid; }
    .expenses tbody tr:nth-child(even) { background: #f7f9fa; }
    .expenses .amount { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .expenses .share { font-weight: bold; }
    .expenses .date { color: #52636b; font-size: 8pt; }
    .expenses .empty { padding: 20px 7px; color: #52636b; }
    .personal-total { margin-top: 0; border-top: 2px solid #52636b; page-break-inside: avoid; break-inside: avoid; }
    .personal-total td { padding: 11px 7px; font-weight: bold; }
    .personal-total .amount { text-align: right; }
    .report-footer { border-top: 1px solid #d9e2e5; margin-top: 25px; padding-top: 12px;
      font-size: 8pt; color: #52636b; page-break-inside: avoid; break-inside: avoid; }
    .report-footer p { margin: 0 0 4px; }
  </style>
</head>
<body>
  <table class="masthead" role="presentation"><tr>
    <td class="brand">Expense Splitter</td><td class="document-type">PERSONAL TRIP STATEMENT</td>
  </tr></table>
  <p class="eyebrow">Your trip, accounted for</p>
  <h1>${escapeHtml_(tripName)}</h1>
  <p class="intro">Prepared for <strong>${escapeHtml_(person.name)}</strong></p>
  <p class="generated">Generated ${escapeHtml_(generatedOn)}</p>

  <section class="balance ${state}">
    <p class="balance-label">${headline}</p>
    <p class="balance-value">${money(Math.abs(net))}</p>
    <p class="balance-note">${explanation}</p>
  </section>
  <section class="actions">
    <h2>Your Settlement Actions</h2>
    <ul class="settlement-list">${actionRows}</ul>
  </section>

  <table class="metrics" role="presentation"><tr>
    <td><span class="metric-label">You paid</span><span class="metric-value">${money(paid)}</span>
      <span class="metric-note">Money you covered</span></td>
    <td><span class="metric-label">Your share</span><span class="metric-value">${money(spent)}</span>
      <span class="metric-note">Your portion of expenses</span></td>
    <td><span class="metric-label">Your net balance</span><span class="metric-value">${net < 0 ? '-' : net > 0 ? '+' : ''}${money(Math.abs(net))}</span>
      <span class="metric-note">${net < 0 ? 'Amount to pay' : net > 0 ? 'Amount to receive' : 'Nothing outstanding'}</span></td>
  </tr></table>

  <h2>Your expense details</h2>
  <p class="section-note">Only expenses you paid or shared are shown. Your share is the part you used, whoever paid.</p>
  <table class="expenses" aria-label="Your relevant expenses">
    <colgroup><col style="width:14%"><col style="width:31%"><col style="width:18%"><col style="width:19%"><col style="width:18%"></colgroup>
    <thead><tr><th scope="col">Date</th><th scope="col">Expense</th><th scope="col" class="amount">Bill total</th><th scope="col">Paid by</th><th scope="col" class="amount">Your share</th></tr></thead>
    <tbody>${expenseRows}</tbody>
  </table>
  <table class="personal-total" role="presentation"><tr><td>Your total share</td><td class="amount">${money(spent)}</td></tr></table>
  <footer class="report-footer">
    <p><strong>How to read this statement</strong></p>
    <p>Your net balance = what you paid minus your share, adjusted for whole-unit payments. A positive balance means you receive money; a negative balance means you pay.</p>
    <p>Payments above settle your share across the group. This statement shows a plan, not a payment receipt.</p>
    <p>Payments use whole currency units; .50 rounds up. Net balances include payment rounding. Expense details are displayed rounded; original entries retain their precision.</p>
  </footer>
</body>
</html>`;
}

function testEmailPermission() {
  const email = Session.getActiveUser().getEmail();

  if (!email) {
    safeAlert(
      'Could not detect your email. Run this from the spreadsheet while signed in.'
    );
    return;
  }

  try {
    MailApp.sendEmail(
      email,
      'Expense Splitter — Test',
      'Email permission is working.'
    );

    safeAlert(`✅ Test email sent to ${email}. Check inbox and spam.`);

  } catch (err) {
    safeAlert(`❌ Test failed: ${err.message}`);
  }
}

function sendPdfReports() {
  if (workbookPendingOperation_()) {
    safeAlert('Recover the interrupted workbook operation before sending reports.');
    return;
  }
  if (!validateSetupStatus()) {
    safeAlert('Cannot send reports: complete Setup first.');
    return;
  }

  if (!isExpensesConfirmed()) {
    safeAlert(
      'Confirm setup and expenses through Setup!B6 or “Confirm / Update Setup” before sending reports.'
    );
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setupSheet = ss.getSheetByName(SHEET_SETUP);
  const reportsSheet = ss.getSheetByName(SHEET_REPORTS);

  const ledger = buildWholeUnitLedger_(buildLedger_());

  if (ledger.errors.length || (workbookV3_() && ledger.duplicateCount)) {
    safeAlert(`Cannot send reports: ${ledger.errors.join(' | ')}${ledger.duplicateCount ? ' Acknowledge duplicate warnings in Expenses!Y.' : ''}`);
    return;
  }

  if (!ledger.expenses.length) {
    safeAlert('No valid expenses found.');
    return;
  }

  let settlements;

  try {
    settlements = calculateOptimalSettlements_(ledger);
  } catch (err) {
    safeAlert(`Cannot send reports: ${err.message}`);
    return;
  }

  const tripName = String(
    setupSheet.getRange(SETUP_TRIP_NAME_CELL).getValue()
  );

  const currency = getCurrencySymbol_();

  const today = Utilities.formatDate(
    new Date(),
    ss.getSpreadsheetTimeZone(),
    'dd-MMM-yyyy'
  );

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let sent = 0;
  let skipped = 0;
  const failures = [];

  ledger.roster.forEach((person, index) => {
    const statusCell = reportsSheet.getRange(3 + index, 6);

    if (!person.email || !emailRegex.test(person.email)) {
      statusCell
        .setValue('Skipped (no email)')
        .setFontColor(COLOR.WARN_TX);

      skipped++;
      return;
    }

    try {
      const html = buildParticipantReportHtml_({
        ledger,
        settlements,
        person,
        tripName,
        currency,
        generatedOn: today
      });

      const pdf = HtmlService
        .createHtmlOutput(html)
        .getAs('application/pdf')
        .setName(`${tripName} - ${person.name} Expense Report.pdf`);

      MailApp.sendEmail(
        person.email,
        `[${tripName}] — Your Expense Report`,
        `Hi ${person.name},\n\nYour itemized expense report is attached.\n\nRegards,\nGroup Expense Splitter`,
        {
          attachments: [pdf]
        }
      );

      const stamp = Utilities.formatDate(
        new Date(),
        ss.getSpreadsheetTimeZone(),
        'dd-MMM HH:mm'
      );

      statusCell
        .setValue(`Sent (${stamp})`)
        .setFontColor(COLOR.GREEN_TX);

      sent++;

    } catch (err) {
      statusCell
        .setValue(`Failed: ${err.message}`)
        .setFontColor(COLOR.RED_TX);

      failures.push(`${person.name}: ${err.message}`);
    }
  });

  let message =
    `Done! Sent: ${sent}, ` +
    `Skipped (no email): ${skipped}, ` +
    `Failed: ${failures.length}.`;

  if (failures.length) {
    message += `\n\n${failures.join('\n')}`;
  }

  safeAlert(message);
}

/* =========================================================
   DIAGNOSTIC TOOL
   ========================================================= */

function diagnose() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setupSheet = ss.getSheetByName(SHEET_SETUP);
  const expensesSheet = ss.getSheetByName(SHEET_EXPENSES);

  const ledger = buildWholeUnitLedger_(buildLedger_());
  const roster = ledger.roster;

  const participantCount = roster.length;

  const lines = [
    `Setup confirmed: ${isSetupConfirmed()}`,
    `Roster count: ${participantCount}`,
    `Roster: ${roster.map(person => `${person.id}:${person.name}`).join(', ') || 'none'}`,
    `Expected participant columns: ${
      participantCount
        ? `${colNumToLetter_(FIRST_PERSON_COL)}:${colNumToLetter_(FIRST_PERSON_COL + participantCount - 1)}`
        : 'none'
    }`,
    'Live Summary: Send Reports!H:K',
    `Expenses sheet exists: ${!!expensesSheet}`,
    `Valid expenses: ${ledger.expenses.length}`,
    `Timezone: ${ss.getSpreadsheetTimeZone()}`,
    `Total spent: ${wholeUnits_(ledger.totalMinor)}`,
    `Ledger errors: ${ledger.errors.length ? ledger.errors.join(' | ') : 'none'}`
  ];

  if (setupSheet) {
    lines.push(
      `Setup Number of People: ${setupSheet.getRange(SETUP_NUM_PEOPLE_CELL).getValue()}`
    );
  }

  let netSum = 0;

  roster.forEach(person => {
    const net = ledger.balances.get(person.id) || 0;
    netSum += net;

    lines.push(
      `${person.name}: ${wholeUnits_(net)}`
    );
  });

  lines.push(`Net balance sum: ${netSum} paise`);

  try {
    const settlements = calculateOptimalSettlements_(ledger);

    lines.push(`Settlement rows: ${settlements.length}`);

    settlements.forEach(item => {
      lines.push(
        `${item.from} -> ${item.to}: ${wholeUnits_(item.amountMinor)}`
      );
    });

  } catch (err) {
    lines.push(`Settlement validation failed: ${err.message}`);
  }

  safeAlert(lines.join('\n'));
}

/* =========================================================
   MOBILE WORKBOOK, VALIDATION, BUDGETS, AND RECOVERY
   ========================================================= */

// Mobile workbook additions remain in this file so both clasp projects receive the complete engine.
const WORKBOOK_STATE_SHEET = '_Tracker State';
const WORKBOOK_CATEGORIES = ['Food', 'Transport', 'Stay', 'Activities', 'Shopping', 'Other'];
const QUICK_BLOCK_FIRST = 23;
const QUICK_BLOCK_HEIGHT = 24;
const TEMPLATE_FIRST_ROW = QUICK_BLOCK_FIRST + MAX_PARTICIPANTS * QUICK_BLOCK_HEIGHT + 3;
const WORKBOOK_WARNING_COL = 24;
let workbookLockDepth_ = 0;
let workbookConfigCache_ = null;
let workbookMaintenance_ = false;
let workbookQuiet_ = false;
let workbookLayoutCache_ = null;
const WORKBOOK_STARTED_AT = Date.now();
// Google Workspace announced the 20-million-cell limit in September 2026.
const WORKBOOK_MAX_CELLS = 20000000;

function workbookCurrency_(fallback = 'INVALID') {
  try { return currencyCode_(getCurrencySymbol_()); } catch (error) { return fallback; }
}

function workbookPendingOperation_() {
  const phase = PropertiesService.getDocumentProperties().getProperty('WORKBOOK_OPERATION_PHASE');
  return !!phase && !['complete', 'aborted'].includes(phase);
}

function workbookV3_() {
  if (workbookLayoutCache_ !== null) return workbookLayoutCache_;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EXPENSES);
  workbookLayoutCache_ = !!sheet && sheet.getRange(1, 7).getValue() === 'Category' &&
    sheet.getRange(1, 8).getValue() === 'Expense ID';
  return workbookLayoutCache_;
}

function expenseFirstPersonCol_() {
  return workbookV3_() ? 9 : FIRST_PERSON_COL;
}

function workbookTripId_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETUP);
  let id = String(sheet.getRange(SETUP_TRIP_ID_CELL).getValue() || '');
  if (!id) {
    id = Utilities.getUuid();
    sheet.getRange(SETUP_TRIP_ID_CELL).setValue(id);
  }
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error('Invalid active trip identity.');
  return id;
}

function workbookHash_(value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value, (key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    serialized, Utilities.Charset.UTF_8)
    .map(byte => (byte & 255).toString(16).padStart(2, '0')).join('');
}

function workbookSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function workbookFit_(sheet, rows, columns) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const extraRows = Math.max(0, rows - sheet.getMaxRows());
  const extraColumns = Math.max(0, columns - sheet.getMaxColumns());
  const existing = ss.getSheets().reduce((sum, item) => sum + item.getMaxRows() * item.getMaxColumns(), 0);
  const growth = (sheet.getMaxRows() + extraRows) * (sheet.getMaxColumns() + extraColumns) -
    sheet.getMaxRows() * sheet.getMaxColumns();
  if (existing + growth > WORKBOOK_MAX_CELLS || columns > 18278) {
    throw new Error('Workbook capacity exceeded. Export/archive data before retrying.');
  }
  if (extraRows) sheet.insertRowsAfter(sheet.getMaxRows(), extraRows);
  if (extraColumns) sheet.insertColumnsAfter(sheet.getMaxColumns(), extraColumns);
}

function workbookStateRows_(key) {
  const sheet = workbookSheet_(WORKBOOK_STATE_SHEET);
  const count = sheet.getLastRow();
  if (!count) return [];
  return sheet.getRange(1, 1, count, 2).getValues().flatMap((row, index) =>
    row[0] === key && row[1] === 'COMMITTED' ? [index + 1] : []);
}

function workbookReadStateRow_(row) {
  const sheet = workbookSheet_(WORKBOOK_STATE_SHEET);
  const meta = sheet.getRange(row, 1, 1, 4).getValues()[0];
  if (meta[1] !== 'COMMITTED' || !Number.isInteger(meta[3]) || meta[3] < 1 ||
      meta[3] > sheet.getMaxColumns() - 4) throw new Error('Incomplete workbook state.');
  const parts = sheet.getRange(row, 5, 1, meta[3]).getValues()[0];
  if (parts.some(part => typeof part !== 'string' || !part.startsWith('JSON:'))) {
    throw new Error('Damaged workbook state chunks.');
  }
  const json = parts.map(part => part.slice(5)).join('');
  if (workbookHash_(json) !== meta[2]) throw new Error('Workbook state checksum mismatch.');
  return JSON.parse(json);
}

function workbookGet_(key) {
  const rows = workbookStateRows_(key);
  return rows.length ? workbookReadStateRow_(rows[rows.length - 1]) : null;
}

function workbookPut_(key, value) {
  if (Date.now() - WORKBOOK_STARTED_AT > 240000) throw new Error('Processing time budget exhausted. Retry or recover in a fresh execution.');
  // Mark maintenance before journal writes; clear it only after a verified terminal journal.
  if (key === 'operation') PropertiesService.getDocumentProperties().setProperty('WORKBOOK_OPERATION_PHASE',
    ['complete', 'aborted'].includes(value.phase) ? 'cleanup' : value.phase);
  const sheet = workbookSheet_(WORKBOOK_STATE_SHEET);
  const json = JSON.stringify(value);
  const parts = [];
  for (let start = 0; start < json.length;) {
    let end = Math.min(start + TRIP_JSON_CHUNK_SIZE, json.length);
    if (end < json.length && /[\uD800-\uDBFF]/.test(json[end - 1])) end--;
    parts.push(`JSON:${json.slice(start, end)}`);
    start = end;
  }
  const oldRows = workbookStateRows_(key);
  const row = sheet.getLastRow() + 1;
  workbookFit_(sheet, row, parts.length + 4);
  const hash = workbookHash_(json);
  // A candidate never supersedes a committed value until every chunk has been read back.
  sheet.getRange(row, 1, 1, parts.length + 4).setValues([[key, 'PREPARING', hash, parts.length, ...parts]]);
  SpreadsheetApp.flush();
  const saved = sheet.getRange(row, 5, 1, parts.length).getValues()[0].map(part => String(part).slice(5)).join('');
  if (workbookHash_(saved) !== hash) throw new Error('Checkpoint write verification failed. Existing data remains available.');
  sheet.getRange(row, 2).setValue('COMMITTED');
  SpreadsheetApp.flush();
  workbookReadStateRow_(row);
  if (key === 'operation') PropertiesService.getDocumentProperties().setProperty('WORKBOOK_OPERATION_PHASE', value.phase);
  oldRows.reverse().forEach(oldRow => sheet.deleteRow(oldRow));
  return value;
}

function workbookDelete_(key) {
  const sheet = workbookSheet_(WORKBOOK_STATE_SHEET);
  workbookStateRows_(key).reverse().forEach(row => sheet.deleteRow(row));
}

function workbookConfigDefaults_() {
  return {
    categories: [...WORKBOOK_CATEGORIES], budgetCurrency: workbookCurrency_('INR'),
    tripBudget: '', categoryBudgets: {}, acknowledgements: {},
    templates: [
      { name: 'Meal', description: 'Meal', category: 'Food', payer: '', split: 'All', currency: '' },
      { name: 'Ride', description: 'Ride', category: 'Transport', payer: '', split: 'All', currency: '' },
      { name: 'Hotel', description: 'Hotel', category: 'Stay', payer: '', split: 'All', currency: '' }
    ]
  };
}

function readWorkbookConfig_() {
  if (workbookConfigCache_) return workbookConfigCache_;
  workbookConfigCache_ = workbookGet_(`config:${workbookTripId_()}`) || workbookConfigDefaults_();
  return workbookConfigCache_;
}

function saveWorkbookConfig_(config) {
  validateWorkbookConfig_(config);
  workbookPut_(`config:${workbookTripId_()}`, config);
  workbookConfigCache_ = config;
}

function validateWorkbookConfig_(config) {
  const text = value => typeof value === 'string' && value.length <= 50000;
  const budget = value => value === '' || (typeof value === 'number' && Number.isFinite(value) &&
    value >= 0 && Number.isSafeInteger(Math.round(value * 100)));
  if (!config || !Array.isArray(config.categories) || config.categories.length > 100 ||
      config.categories.some(value => !text(value) || !value.trim()) ||
      new Set(config.categories.map(value => value.trim().toLowerCase())).size !== config.categories.length ||
      !/^[A-Z]{3}$/.test(config.budgetCurrency) || !budget(config.tripBudget) ||
      !config.categoryBudgets || typeof config.categoryBudgets !== 'object' || Array.isArray(config.categoryBudgets) ||
      Object.values(config.categoryBudgets).some(value => !budget(value)) ||
      !config.acknowledgements || typeof config.acknowledgements !== 'object' || Array.isArray(config.acknowledgements) ||
      Object.entries(config.acknowledgements).some(([id, value]) => !/^[a-zA-Z0-9-]{1,100}$/.test(id) || !/^[a-f0-9]{64}$/.test(value)) ||
      !Array.isArray(config.templates) || config.templates.length > 50 || config.templates.some(template =>
        !template || !['name', 'description', 'category', 'payer', 'split', 'currency'].every(key => text(template[key])) || !template.name.trim()) ||
      new Set(config.templates.map(template => template.name.toLowerCase())).size !== config.templates.length) {
    throw new Error('Invalid workbook categories, budgets, templates, or acknowledgements.');
  }
  return config;
}

function validateWorkbookTrip_(trip) {
  validateWorkbookConfig_(trip.workbook);
  const ids = new Set();
  trip.expenses.forEach(row => {
    const active = row.slice(0, 7).some(value => value !== '');
    if (active && (typeof row[7] !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(row[7]) || ids.has(row[7]))) {
      throw new Error('Expense IDs must be valid and unique.');
    }
    if (active) ids.add(row[7]);
    else if (row[7] !== '') throw new Error('Blank expenses cannot contain an ID.');
  });
}

function repairExpenseIds_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EXPENSES);
  const rows = sheet.getRange(2, 1, MAX_DATA_ROWS, 8).getValues();
  const counts = new Map();
  rows.forEach(row => { if (row[7]) counts.set(row[7], (counts.get(row[7]) || 0) + 1); });
  let changed = false;
  const config = readWorkbookConfig_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timezone = ss.getSpreadsheetTimeZone();
  const baseCurrency = getCurrencySymbol_();
  let changedConfig = false;
  rows.forEach(row => {
    const active = row.slice(0, 7).some(value => value !== '');
    const old = row[7];
    const valid = typeof old === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(old) && counts.get(old) === 1;
    if (!active || !valid) row[7] = active ? Utilities.getUuid() : '';
    if (row[7] !== old) {
      changed = true;
      if (Object.prototype.hasOwnProperty.call(config.acknowledgements, old)) {
        delete config.acknowledgements[old];
        changedConfig = true;
      }
    }
    if (row[7] && Object.prototype.hasOwnProperty.call(config.acknowledgements, row[7]) &&
        config.acknowledgements[row[7]] !== workbookExpenseSignature_(row, timezone, baseCurrency)) {
      delete config.acknowledgements[row[7]];
      changedConfig = true;
    }
  });
  if (changed) sheet.getRange(2, 8, MAX_DATA_ROWS, 1).setValues(rows.map(row => [row[7]]));
  if (changedConfig) saveWorkbookConfig_(config);
  return rows;
}

function captureWorkbookRaw_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setup = ss.getSheetByName(SHEET_SETUP);
  const expenses = ss.getSheetByName(SHEET_EXPENSES);
  const advanced = workbookV3_();
  const raw = {
    format: 'travel-expense-recovery', schemaVersion: 1, advanced,
    tripId: workbookTripId_(), timezone: ss.getSpreadsheetTimeZone(),
    setup: setup.getRange('B2:B7').getValues().map(row => row.map(encodeTripCell_)),
    timezoneCell: encodeTripCell_(setup.getRange(SETUP_TIMEZONE_CELL).getValue()),
    roster: setup.getRange(ROSTER_START_ROW, 1, MAX_PARTICIPANTS, 3).getValues().map(row => row.map(encodeTripCell_)),
    expenses: expenses.getRange(2, 1, MAX_DATA_ROWS, advanced ? 8 :
      expenses.getRange(1, 6).getValue() === 'Currency' ? 6 : 5).getValues()
      .map(row => (row.length === 5 ? [...row, ''] : row).map(encodeTripCell_)),
    config: advanced ? JSON.parse(JSON.stringify(readWorkbookConfig_())) : null
  };
  return raw;
}

function workbookRawFingerprint_(raw) {
  return workbookHash_({ ...raw, setup: raw.setup.map((row, index) => index >= 3 ? [false] : row) });
}

function createRecoveryVersion_(reason, suppliedRaw) {
  const raw = suppliedRaw || captureWorkbookRaw_();
  const version = { id: Utilities.getUuid(), tripId: raw.tripId, at: new Date().toISOString(), reason, raw };
  workbookPut_(`version:${version.id}`, version);
  const indexKey = `versions:${raw.tripId}`;
  const index = workbookGet_(indexKey) || [];
  index.push({ id: version.id, at: version.at, reason });
  workbookPut_(indexKey, index);
  const directory = workbookGet_('history-directory') || [];
  const name = String(raw.setup[0][0] || '(Untitled trip)').slice(0, 100);
  const entry = directory.find(item => item.id === raw.tripId);
  if (!entry || entry.name !== name) {
    if (entry) entry.name = name;
    else directory.push({ id: raw.tripId, name });
    workbookPut_('history-directory', directory);
  }
  workbookStatus_('Recovery', `Checkpoint saved: ${version.at}`);
  if (!workbookPendingOperation_()) pruneRecoveryVersions_(raw.tripId);
  return version;
}

function pruneRecoveryVersions_(tripId) {
  const key = `versions:${tripId}`;
  const index = workbookGet_(key) || [];
  if (index.length <= 20) return;
  const expired = index.slice(0, -20);
  workbookPut_(key, index.slice(-20));
  expired.forEach(version => workbookDelete_(`version:${version.id}`));
}

function autoCheckpointWorkbook_() {
  const raw = captureWorkbookRaw_();
  const key = `checkpoint:${raw.tripId}`;
  const previous = workbookGet_(key);
  const fingerprint = workbookRawFingerprint_(raw);
  if (previous && (previous.fingerprint === fingerprint || Date.now() - previous.time < 300000)) return;
  const version = createRecoveryVersion_('Automatic checkpoint', raw);
  workbookPut_(key, { time: Date.now(), fingerprint, version: version.id });
  pruneRecoveryVersions_(raw.tripId);
}

function workbookStatus_(kind, message) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboard = ss.getSheetByName('Dashboard');
  if (dashboard) dashboard.getRange(kind === 'Recovery' ? 'B13' : 'B14').setValue(literalSheetCell_(message));
}

function workbookOrganizer_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const email = Session.getEffectiveUser().getEmail();
  const owner = ss.getOwner();
  if (!email || (owner && owner.getEmail() !== email)) {
    throw new Error('The spreadsheet owner must install or run workbook maintenance.');
  }
  return email;
}

function workbookProtect_(range, description) {
  const protection = range.protect().setDescription(description);
  protection.addEditor(workbookOrganizer_());
  protection.removeEditors(protection.getEditors());
  if (protection.canDomainEdit()) protection.setDomainEdit(false);
  protection.setWarningOnly(false);
  return protection;
}

function workbookOriginalProtections_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets().flatMap(sheet =>
    sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).map(protection => ({
      sheet: sheet.getName(), description: protection.getDescription(),
      range: protection.getRange().getA1Notation(), warningOnly: protection.isWarningOnly(),
      editors: protection.getEditors().map(editor => editor.getEmail()), domain: protection.canDomainEdit()
    })));
}

function workbookReleaseMaintenance_(operation) {
  const description = `Workbook maintenance ${operation.id}`;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheets().forEach(sheet => {
    sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE)
      .filter(protection => protection.getDescription() === description)
      .forEach(protection => protection.remove());
  });
  if (ss.getSheets().some(sheet => sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE)
      .some(protection => protection.getDescription() === description))) {
    throw new Error('Maintenance protection cleanup is incomplete. Run Recover Interrupted Workbook Operation.');
  }
}

function workbookRestrictMaintenance_(operation) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [SHEET_SETUP, SHEET_EXPENSES, 'Budgets', 'Quick Entry', 'History'].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet) workbookProtect_(sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()),
      `Workbook maintenance ${operation.id}`);
  });
}

function writeWorkbookRaw_(raw) {
  validateRecoveryEnvelope_(raw);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setup = ss.getSheetByName(SHEET_SETUP);
  const sheet = ss.getSheetByName(SHEET_EXPENSES);
  ss.setSpreadsheetTimeZone(raw.timezone);
  setup.getRange('B2:B7').clearDataValidations().setValues(raw.setup.map(row => row.map(decodeTripCell_)));
  setup.getRange(SETUP_TRIP_ID_CELL).setValue(raw.tripId);
  setup.getRange(SETUP_TIMEZONE_CELL).setValue(decodeTripCell_(raw.timezoneCell));
  setup.getRange(ROSTER_START_ROW, 1, MAX_PARTICIPANTS, 3)
    .setValues(raw.roster.map(row => row.map(decodeTripCell_)));
  workbookFit_(sheet, MAX_DATA_ROWS + 15, 26);
  sheet.getRange(1, 1, MAX_DATA_ROWS + 15, 26).breakApart().clearContent().clearDataValidations();
  sheet.getRange(1, 1, 1, raw.advanced ? 8 : 6).setValues([raw.advanced
    ? ['Date', 'Description', 'Amount', 'Paid By', 'Split Among', 'Currency', 'Category', 'Expense ID']
    : ['Date', 'Description', 'Amount', 'Paid By', 'Split Among', 'Currency']]);
  workbookLayoutCache_ = raw.advanced;
  if (raw.expenses.length) sheet.getRange(2, 1, raw.expenses.length, raw.expenses[0].length)
    .setValues(raw.expenses.map(row => row.map(decodeTripCell_)));
  workbookConfigCache_ = null;
  if (raw.advanced) saveWorkbookConfig_(raw.config);
  SpreadsheetApp.flush();
}

function validateRecoveryEnvelope_(raw) {
  const cell = value => typeof value === 'string' || typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (value && value.type === 'date' && typeof value.value === 'string' && Number.isFinite(Date.parse(value.value)));
  const rows = (value, height, width) => Array.isArray(value) && value.length === height &&
    value.every(row => Array.isArray(row) && row.length === width && row.every(cell));
  if (!raw || raw.format !== 'travel-expense-recovery' || raw.schemaVersion !== 1 ||
      !/^[a-zA-Z0-9-]{1,100}$/.test(raw.tripId) || typeof raw.timezone !== 'string' ||
      typeof raw.advanced !== 'boolean' || !cell(raw.timezoneCell) || !rows(raw.setup, 6, 1) || !rows(raw.roster, 15, 3) ||
      !Array.isArray(raw.expenses) || raw.expenses.length > MAX_DATA_ROWS ||
      !raw.expenses.every(row => Array.isArray(row) && row.length === (raw.advanced ? 8 : 6) && row.every(cell))) {
    throw new Error('Invalid recovery envelope. Current inputs were not replaced.');
  }
  if (raw.advanced) validateWorkbookConfig_(raw.config);
  Utilities.formatDate(new Date(), raw.timezone, 'yyyy-MM-dd');
  return raw;
}

function normalizedWorkbookRaw_(raw) {
  const result = JSON.parse(JSON.stringify(raw));
  if (!raw.advanced && result.timezoneCell === '') result.timezoneCell = result.timezone;
  result.config = result.config || workbookConfigDefaults_();
  const counts = new Map();
  result.expenses.forEach(row => { if (row[7]) counts.set(row[7], (counts.get(row[7]) || 0) + 1); });
  result.advanced = true;
  result.expenses = Array.from({ length: MAX_DATA_ROWS }, (_, index) => {
    const row = result.expenses[index] || [];
    const values = Array.from({ length: 8 }, (_, column) => row[column] === undefined ? '' : row[column]);
    const active = values.slice(0, 7).some(value => value !== '');
    const valid = typeof values[7] === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(values[7]) && counts.get(values[7]) === 1;
    if (!active || !valid) {
      delete result.config.acknowledgements[values[7]];
      values[7] = active ? Utilities.getUuid() : '';
    }
    return values;
  });
  result.setup[4] = [false];
  result.setup[5] = [false];
  return result;
}

function replaceWorkbook_(kind, target, boundDestination) {
  if (workbookLockDepth_ === 0) return withTripLock_(() => replaceWorkbook_(kind, target, boundDestination));
  workbookOrganizer_();
  validateRecoveryEnvelope_(target);
  const unfinished = workbookGet_('operation');
  if (unfinished && !['complete', 'aborted'].includes(unfinished.phase)) {
    throw new Error('An interrupted operation needs recovery before another replacement.');
  }
  const operation = {
    id: Utilities.getUuid(), kind, phase: 'prepared', target,
    originalProtections: workbookOriginalProtections_(), at: new Date().toISOString()
  };
  workbookPut_('operation', operation);
  workbookStatus_('Processing', 'Maintenance: everyone must pause editing, including the owner.');
  workbookMaintenance_ = true;
  try {
    workbookRestrictMaintenance_(operation);
    operation.phase = 'restricted';
    workbookPut_('operation', operation);
    const before = captureWorkbookRaw_();
    if (boundDestination && boundDestination !== workbookRawFingerprint_(before)) {
      throw new Error('Current inputs changed after preview. Preview again before restoring.');
    }
    if (workbookRawFingerprint_(before) !== workbookRawFingerprint_(captureWorkbookRaw_())) {
      throw new Error('Inputs changed during capture. Pause editing and retry.');
    }
    operation.before = before;
    const version = createRecoveryVersion_(`Before ${kind}`, before);
    operation.checkpoint = version.id;
    operation.phase = 'checkpointed';
    workbookPut_('operation', operation);
    archiveWorkbookRaw_(before);
    if (workbookRawFingerprint_(before) !== workbookRawFingerprint_(captureWorkbookRaw_())) {
      throw new Error('Inputs changed before replacement. Nothing was replaced.');
    }
    operation.phase = 'writing';
    workbookPut_('operation', operation);
    writeWorkbookRaw_(target);
    if (workbookRawFingerprint_(target) !== workbookRawFingerprint_(captureWorkbookRaw_())) {
      throw new Error('Replacement verification failed. Recovery is required; competing edits will not be overwritten automatically.');
    }
    operation.phase = 'verifying';
    workbookPut_('operation', operation);
    renderWorkbookUi_(true);
    recalculateAll(true);
    operation.phase = 'cleanup';
    workbookPut_('operation', operation);
    workbookReleaseMaintenance_(operation);
    operation.phase = 'complete';
    workbookPut_('operation', operation);
    pruneRecoveryVersions_(before.tripId);
    pruneRecoveryVersions_(target.tripId);
    workbookStatus_('Processing', `${kind} complete. Reconfirm setup after reviewing inputs.`);
    return true;
  } catch (error) {
    operation.error = error.message;
    if (['prepared', 'restricted', 'checkpointed'].includes(operation.phase)) {
      workbookReleaseMaintenance_(operation);
      operation.phase = 'aborted';
    }
    workbookPut_('operation', operation);
    workbookStatus_('Processing', `${operation.phase === 'aborted' ? 'Stopped' : 'Recovery required'}: ${error.message}`);
    const dashboard = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Dashboard');
    if (dashboard) dashboard.getRange('B3').setValue(`Operation incomplete: ${error.message}`);
    throw error;
  } finally {
    workbookMaintenance_ = false;
  }
}

function recoverWorkbookOperation() {
  return tripAction_(() => {
    workbookOrganizer_();
    const operation = workbookGet_('operation');
    if (!operation || ['complete', 'aborted'].includes(operation.phase)) {
      PropertiesService.getDocumentProperties().setProperty('WORKBOOK_OPERATION_PHASE', operation ? operation.phase : 'aborted');
      return 'No interrupted operation needs recovery.';
    }
    workbookMaintenance_ = true;
    try {
      // This is an explicit organizer action, not an automatic rollback over possible later edits.
      const current = captureWorkbookRaw_();
      createRecoveryVersion_('Before explicit interrupted-operation recovery', current);
      if (operation.before && !['cleanup', 'verifying'].includes(operation.phase)) {
        writeWorkbookRaw_(operation.before);
        if (workbookRawFingerprint_(captureWorkbookRaw_()) !== workbookRawFingerprint_(operation.before)) {
          throw new Error('Rollback verification failed. Original checkpoint and operation journal remain available.');
        }
      }
      if (workbookV3_()) {
        renderWorkbookUi_(true);
        recalculateAll(true);
      } else {
        updateExpensesStructure();
        recalculateAll(true);
      }
      workbookReleaseMaintenance_(operation);
      operation.phase = 'aborted';
      operation.recoveredAt = new Date().toISOString();
      workbookPut_('operation', operation);
      pruneRecoveryVersions_(current.tripId);
      if (operation.before) pruneRecoveryVersions_(operation.before.tripId);
      workbookStatus_('Processing', 'Interrupted operation recovered. Review inputs before confirming.');
      return 'Interrupted operation recovered; original protections preserved.';
    } finally {
      workbookMaintenance_ = false;
    }
  });
}

function installWorkbookAutomation() {
  const email = workbookOrganizer_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const exists = ScriptApp.getProjectTriggers().some(trigger =>
    trigger.getHandlerFunction() === 'onAuthorizedEdit' && trigger.getTriggerSourceId() === ss.getId());
  if (!exists) ScriptApp.newTrigger('onAuthorizedEdit').forSpreadsheet(ss).onEdit().create();
  PropertiesService.getDocumentProperties().setProperty('AUTOMATIC_FX_EDIT', ss.getId());
  PropertiesService.getDocumentProperties().setProperty('WORKBOOK_ORGANIZER', email);
  const history = ss.getSheetByName('History');
  [history, ss.getSheetByName(WORKBOOK_STATE_SHEET)].filter(Boolean).forEach(sheet => {
    const description = 'Workbook organizer controls';
    if (!sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).some(p => p.getDescription() === description)) {
      workbookProtect_(sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()), description);
    }
  });
  workbookStatus_('Processing', `Automation installed for ${email}. New submissions need their own saved acknowledgement.`);
  if (workbookV3_()) withTripLock_(() => {
    if (workbookPendingOperation_()) return;
    reconcileWorkbookRequests_();
    repairExpenseIds_();
    recalculateAll(true);
  });
  return true;
}

function upgradeMobileWorkbook() {
  return tripAction_(() => {
    workbookOrganizer_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss.getSheetByName(SHEET_SETUP) || !ss.getSheetByName(SHEET_EXPENSES)) {
      throw new Error('Initialize a fresh tracker with setup() before upgrading.');
    }
    const unfinished = workbookGet_('operation');
    if (unfinished && !['complete', 'aborted'].includes(unfinished.phase)) {
      throw new Error('Recover the interrupted operation before upgrading or repairing the workbook.');
    }
    if (workbookV3_()) {
      renderWorkbookUi_(false);
      installWorkbookAutomation();
      recalculateAll(true);
      return 'Mobile workbook repaired. Existing inputs and draft forms were retained.';
    }
    const raw = normalizedWorkbookRaw_(captureWorkbookRaw_());
    replaceWorkbook_('mobile workbook upgrade', raw);
    installWorkbookAutomation();
    return 'Mobile workbook ready. Open Quick Entry on your phone. Review Setup and confirm expenses on Dashboard.';
  });
}

function portableWorkbookRaw_(trip) {
  const raw = {
    format: 'travel-expense-recovery', schemaVersion: 1, advanced: true, tripId: trip.id,
    timezone: trip.timeZone, timezoneCell: trip.timeZone,
    setup: [[trip.setup.tripName], [trip.setup.participantCount], [trip.setup.currency], ['Checking...'], [false], [false]],
    roster: trip.setup.roster,
    expenses: trip.expenses.map(row => trip.schemaVersion === 1 ? [...row, ''] : row),
    config: trip.schemaVersion === 3 ? trip.workbook : null
  };
  if (!raw.config) {
    raw.config = workbookConfigDefaults_();
    raw.config.budgetCurrency = currencyCode_(trip.setup.currency);
  }
  return normalizedWorkbookRaw_(raw);
}

function restorePortableV3_(trip) {
  const target = portableWorkbookRaw_(trip);
  replaceWorkbook_('load/import trip', target);
  installWorkbookAutomation();
}

function newTripV3_() {
  const ui = SpreadsheetApp.getUi();
  if (!workbookQuiet_ && ui.alert('New Trip', 'Checkpoint current inputs and start a blank trip? Pause all editing during replacement.',
    ui.ButtonSet.YES_NO) !== ui.Button.YES) return false;
  return tripAction_(() => {
    const raw = captureWorkbookRaw_();
    raw.tripId = Utilities.getUuid();
    raw.setup = [[''], [2], ['₹'], ['Checking...'], [false], [false]];
    raw.roster = Array.from({ length: 15 }, (_, index) => [index + 1, '', '']);
    raw.expenses = [];
    raw.config = { ...workbookConfigDefaults_(), budgetCurrency: 'INR' };
    replaceWorkbook_('new trip', normalizedWorkbookRaw_(raw));
    return 'New trip ready. Previous inputs remain in History.';
  });
}

function archiveWorkbookRaw_(raw) {
  const trip = {
    format: 'travel-expense-trip', schemaVersion: raw.advanced ? 3 : 2, id: raw.tripId,
    savedAt: new Date().toISOString(), timeZone: raw.timezone,
    setup: { tripName: String(raw.setup[0][0]), participantCount: Number(raw.setup[1][0]),
      currency: String(raw.setup[2][0]), confirmed: raw.setup[4][0] === true, roster: raw.roster },
    expenses: raw.expenses.map(row => [...row])
  };
  while (trip.expenses.length && trip.expenses[trip.expenses.length - 1].every(value => value === '')) trip.expenses.pop();
  if (raw.advanced) trip.workbook = raw.config;
  try { validateTrip_(trip); } catch (error) { return; } // Invalid drafts remain in raw recovery storage.
  saveTripSnapshot_(trip);
}

function workbookExpenseSignature_(row, timezone, baseCurrency) {
  const norm = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  let date = row[0] instanceof Date ? Utilities.formatDate(row[0], timezone, 'yyyy-MM-dd') : norm(row[0]);
  let currency;
  try { currency = currencyCode_(row[5] || baseCurrency || getCurrencySymbol_()); } catch (error) { currency = norm(row[5]); }
  return workbookHash_([date, norm(row[3]), toMinor_(row[2]), currency, norm(row[1])]);
}

function decorateWorkbookLedger_(ledger, data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EXPENSES);
  const ids = sheet.getRange(2, 8, data.length, 1).getValues();
  const config = readWorkbookConfig_();
  const timezone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const baseCurrency = getCurrencySymbol_();
  const groups = new Map();
  const warnings = new Map();
  ledger.expenses.forEach(expense => {
    const row = data[expense.row - 2];
    expense.category = String(row[6] || '').trim() || 'Uncategorized';
    expense.day = row[0] instanceof Date ? Utilities.formatDate(row[0], timezone, 'yyyy-MM-dd') : String(row[0] || 'No date');
    expense.expenseId = ids[expense.row - 2][0];
    expense.duplicateSignature = workbookExpenseSignature_(row, timezone, baseCurrency);
    const group = groups.get(expense.duplicateSignature) || [];
    group.push(expense);
    groups.set(expense.duplicateSignature, group);
  });
  let duplicateCount = 0;
  groups.forEach(group => {
    if (group.length < 2) return;
    group.forEach(expense => {
      const acknowledged = config.acknowledgements[expense.expenseId] === expense.duplicateSignature;
      if (!acknowledged) duplicateCount++;
      warnings.set(expense.row, acknowledged ? 'Duplicate acknowledged' : 'Possible duplicate: check Y to acknowledge a legitimate repeat.');
    });
  });
  ledger.errors.forEach(message => {
    const match = /^Row (\d+):/.exec(message);
    if (match) warnings.set(Number(match[1]), message);
  });
  ledger.duplicateCount = duplicateCount;
  ledger.warnings = warnings;
  ledger.excludedRows = data.filter((row, index) => row.some(value => value !== '') && !ledger.rowRecords.get(index + 2)).length;
  return ledger;
}

function workbookBudgetMinor_(value) {
  if (value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || !Number.isSafeInteger(Math.round(number * 100))) {
    throw new Error('Budgets must be blank or nonnegative amounts. Zero is an advisory zero allowance.');
  }
  return Math.round(number * 100);
}

function buildWorkbookSummary_(ledger, config) {
  const categories = new Map(config.categories.map(category => [category, 0]));
  const days = new Map();
  ledger.expenses.forEach(expense => {
    const category = expense.category || 'Uncategorized';
    categories.set(category, (categories.get(category) || 0) + expense.amountMinor);
    const day = expense.day || expense.date || 'No date';
    days.set(day, (days.get(day) || 0) + expense.amountMinor);
  });
  const budgetCurrent = config.budgetCurrency === workbookCurrency_();
  const tripLimit = workbookBudgetMinor_(config.tripBudget);
  const categoryRows = [...categories].map(([category, minor]) => {
    const limit = Object.prototype.hasOwnProperty.call(config.categoryBudgets, category)
      ? workbookBudgetMinor_(config.categoryBudgets[category]) : null;
    return [category, fromMinor_(minor), budgetCurrent && limit !== null ? fromMinor_(limit) : '',
      !budgetCurrent ? 'Review budget currency' : limit !== null && minor > limit ? 'Over budget' : ''];
  });
  return {
    budgetCurrent, tripLimit,
    remaining: budgetCurrent && tripLimit !== null ? tripLimit - ledger.totalMinor : null,
    categoryRows, dayRows: [...days].sort((a, b) => a[0].localeCompare(b[0])).map(([day, minor]) => [day, fromMinor_(minor)]),
    personRows: ledger.roster.map(person => [person.name, fromMinor_(ledger.spent.get(person.id) || 0),
      fromMinor_(ledger.paid.get(person.id) || 0)])
  };
}

function workbookSurface_(name, title) {
  const sheet = workbookSheet_(name);
  workbookFit_(sheet, 1000, 6);
  sheet.getRange('A1:B1').breakApart().merge().setValue(title)
    .setBackground(COLOR.HEADER_DARK).setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.setFrozenRows(2);
  sheet.setColumnWidth(1, 145);
  sheet.setColumnWidth(2, 215);
  sheet.setRowHeights(1, Math.max(1, sheet.getMaxRows()), 32);
  sheet.getRange(1, 1, sheet.getMaxRows(), 2).setFontFamily('Arial').setFontSize(12).setWrap(true);
  return sheet;
}

function workbookLink_(sheet, row, label) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const url = `https://docs.google.com/spreadsheets/d/${ss.getId()}/edit#gid=${sheet.getSheetId()}&range=A${row}:B${row + 18}`;
  return SpreadsheetApp.newRichTextValue().setText(label).setLinkUrl(url).build();
}

function renderWorkbookUi_(replaceSettings) {
  if (!workbookV3_()) return;
  const timezoneCell = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETUP).getRange(SETUP_TIMEZONE_CELL).getValue();
  ensureTripControls_();
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETUP).getRange(SETUP_TIMEZONE_CELL).setValue(literalSheetCell_(timezoneCell));
  const config = readWorkbookConfig_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const budgets = workbookSurface_('Budgets', 'BUDGETS — warnings only');
  budgets.getRange('A2:A6').setValues([['Current currency'], ['Budget currency'], ['Trip allowance'],
    ['Confirm new currency'], ['Blank = no limit; zero = zero allowance']]);
  budgets.getRange('B2').setValue(workbookCurrency_());
  if (replaceSettings || budgets.getRange('A8').getValue() !== 'Category') {
    budgets.getRange('B3').setValue(config.budgetCurrency);
    budgets.getRange('B4').setValue(config.tripBudget);
    budgets.getRange('B5').insertCheckboxes().setValue(false);
    budgets.getRange('A8:B108').clearContent();
    budgets.getRange('A8:B8').setValues([['Category', 'Allowance']]);
    if (config.categories.length) budgets.getRange(9, 1, config.categories.length, 2).setValues(config.categories.map(category =>
      [literalSheetCell_(category), config.categoryBudgets[category] === undefined ? '' : config.categoryBudgets[category]]));
  }
  budgets.getRange('B4').setNumberFormat('#,##0.00');
  budgets.getRange('B9:B108').setNumberFormat('#,##0.00');
  const quick = workbookSurface_('Quick Entry', 'QUICK ENTRY');
  const roster = getRoster();
  const tripName = ss.getSheetByName(SHEET_SETUP).getRange(SETUP_TRIP_NAME_CELL).getValue();
  quick.getRange('A2:B2').setValues([['Active trip', literalSheetCell_(tripName)]]);
  quick.getRange('A3:B3').setValues([['Choose your block below', 'Shared cells: use your own labeled block.']]);
  for (let index = 0; index < MAX_PARTICIPANTS; index++) {
    const first = QUICK_BLOCK_FIRST + index * QUICK_BLOCK_HEIGHT;
    const person = roster[index];
    const name = person ? person.name : `Inactive slot ${index + 1}`;
    quick.getRange(4 + index, 1).setRichTextValue(workbookLink_(quick, first, `${index + 1}. ${name}`));
    quick.getRange(first, 1, 1, 2).setValues([['Participant', literalSheetCell_(name)]])
      .setBackground(COLOR.HEADER).setFontColor('#FFFFFF').setFontWeight('bold');
    quick.getRange(first + 1, 1).setRichTextValue(workbookLink_(quick, 1, 'Back to participants'));
    quick.getRange(first + 2, 1, 19, 1).setValues([
      ['Template'], ['Date'], ['Description'], ['Amount'], ['Payer'], ['Split among'], ['Currency'], ['Category'],
      ['Copy Expenses row #'], ['Load copy'], ['Add expense'], ['Expense status'], ['Recovery status'],
      ['Destination trip'], ['Submitting for'], ['Reset draft'], ['Request ID'], ['Bound trip ID'], ['Instructions']
    ]);
    quick.getRange(first + 15, 2).setValue(literalSheetCell_(tripName));
    quick.getRange(first + 16, 2).setValue(literalSheetCell_(name));
    [11, 12, 17].forEach(offset => {
      if (quick.getRange(first + offset, 2).getValue() === '') quick.getRange(first + offset, 2).insertCheckboxes().setValue(false);
    });
    quick.getRange(first + 3, 2).setNumberFormat('dd-mmm-yyyy');
    quick.getRange(first + 5, 2).setNumberFormat('#,##0.00');
    const rule = choices => SpreadsheetApp.newDataValidation().requireValueInList(choices, true).setAllowInvalid(true).build();
    quick.getRange(first + 2, 2).setDataValidation(rule(config.templates.map(template => template.name)));
    quick.getRange(first + 6, 2).setDataValidation(rule(roster.map(item => item.name)));
    quick.getRange(first + 9, 2).setDataValidation(rule(config.categories));
    quick.getRange(first + 20, 2).setValue('Review payer and amount. Check Add expense. Wait for Expense saved.');
    quick.getRange(first + 13, 2).setFormula(`=IF(B${first + 12},"Pending — wait for script acknowledgement",B${first + 22})`);
    quick.hideRows(first + 18, 2);
    quick.hideRows(first + 22, 1);
    if (!quick.getRange(first + 4, 2).getValue() && !quick.getRange(first + 5, 2).getValue() &&
        !quick.getRange(first + 6, 2).getValue()) resetWorkbookDraft_(index + 1, true);
  }
  quick.getRange(TEMPLATE_FIRST_ROW, 1, 1, 6).setValues([['Template name', 'Description', 'Category', 'Payer', 'Split among', 'Currency']]);
  if (replaceSettings || !quick.getRange(TEMPLATE_FIRST_ROW + 1, 1).getValue()) {
    quick.getRange(TEMPLATE_FIRST_ROW + 1, 1, 50, 6).clearContent();
    if (config.templates.length) quick.getRange(TEMPLATE_FIRST_ROW + 1, 1, config.templates.length, 6)
      .setValues(config.templates.map(template => ['name', 'description', 'category', 'payer', 'split', 'currency']
        .map(key => literalSheetCell_(template[key]))));
  }
  const dashboard = workbookSurface_('Dashboard', 'TRIP DASHBOARD');
  dashboard.getRange('A2:A16').setValues([['Trip'], ['Calculation status'], ['Currency'], ['Total spent'], ['Trip budget'],
    ['Remaining budget'], ['Excluded rows'], ['Unacknowledged duplicates'], ['Valid expenses'], ['Budget status'],
    ['Backup timing'], ['Recovery status'], ['Processing status'], ['Refresh / retry processing'], ['Confirm expenses']]);
  dashboard.getRange('B12').setValue('Five minutes is a throttle, not a backup guarantee.');
  [15, 16].forEach(row => {
    if (dashboard.getRange(row, 2).getValue() === '') dashboard.getRange(row, 2).insertCheckboxes().setValue(false);
  });
  renderWorkbookHistory_(workbookTripId_());
  updateWorkbookExpenseLayout_();
  ['Dashboard', 'Quick Entry'].forEach((name, index) => {
    ss.setActiveSheet(ss.getSheetByName(name));
    ss.moveActiveSheet(index + 1);
  });
  ss.setActiveSheet(dashboard);
}

function updateWorkbookExpenseLayout_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EXPENSES);
  const names = getRoster().map(person => person.name);
  workbookFit_(sheet, MAX_DATA_ROWS + 15, 26);
  // A:H are permanent inputs/identities in version 3. Clear generated output only.
  sheet.getRange(1, 9, MAX_DATA_ROWS + 15, 18).breakApart().clearContent().clearFormat().clearDataValidations();
  const headers = ['Date', 'Description', 'Amount', 'Paid By', 'Split Among', 'Currency', 'Category', 'Expense ID', ...names];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers.map(literalSheetCell_)])
    .setBackground(COLOR.HEADER).setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.getRange(1, WORKBOOK_WARNING_COL, 1, 2).setValues([['Validation / duplicate warning', 'Acknowledge duplicate']]);
  sheet.getRange(2, WORKBOOK_WARNING_COL + 1, MAX_DATA_ROWS, 1).insertCheckboxes();
  sheet.getRange('A1').setNote('Sort complete expense rows A:Y together. Sorting only part of a row is unsupported.');
  sheet.getRange('H1').setNote('Stable internal identity. Do not edit or copy IDs manually.');
  sheet.hideColumns(8);
  sheet.setFrozenRows(1);
  sheet.getRange(2, 1, MAX_DATA_ROWS, 1).setNumberFormat('dd-mmm-yyyy');
  sheet.getRange(2, 3, MAX_DATA_ROWS, 1).setNumberFormat('#,##0.00');
  sheet.getRange(2, 5, MAX_DATA_ROWS, 4).setNumberFormat('@');
  sheet.getRange(2, 1, MAX_DATA_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireDate().setAllowInvalid(false).build());
  sheet.getRange(2, 7, MAX_DATA_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(readWorkbookConfig_().categories, true).setAllowInvalid(true).build());
  sheet.getRange(2, 4, MAX_DATA_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(names.length ? names : ['Complete Setup'], true).setAllowInvalid(true).build());
  sheet.getRange(2, 9, MAX_DATA_ROWS, Math.max(1, names.length)).setNumberFormat(getCurrencyFormat_());
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(WORKBOOK_WARNING_COL, 300);
}

function refreshWorkbookViews_(ledger) {
  const config = readWorkbookConfig_();
  const summary = buildWorkbookSummary_(ledger, config);
  const dashboard = workbookSheet_('Dashboard');
  const setup = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETUP);
  const validSetup = validateSetupStatus();
  dashboard.getRange('B2:B11').setValues([
    [literalSheetCell_(setup.getRange(SETUP_TRIP_NAME_CELL).getValue())],
    [!validSetup ? `Setup incomplete: ${setup.getRange(SETUP_STATUS_CELL).getValue()}` : ledger.errors.length ?
      `PARTIAL TOTALS: ${ledger.excludedRows || 0} excluded row(s). ${ledger.errors.join(' | ')}` : `Updated ${new Date().toISOString()}`],
    [getCurrencySymbol_()], [fromMinor_(ledger.totalMinor)],
    [summary.budgetCurrent && summary.tripLimit !== null ? fromMinor_(summary.tripLimit) : 'No active limit'],
    [summary.remaining === null ? '' : fromMinor_(summary.remaining)], [ledger.excludedRows || 0],
    [ledger.duplicateCount || 0], [ledger.expenses.length],
    [!summary.budgetCurrent ? 'Budget currency review required in Budgets!B5' : summary.remaining !== null && summary.remaining < 0 ? 'OVER BUDGET — expenses remain permitted' : 'Advisory limits']
  ]);
  dashboard.getRange('B5:B7').setNumberFormat('#,##0.00');
  const tables = [
    { title: 'Category spending', header: ['Category', 'Spent', 'Allowance', 'Status'], rows: summary.categoryRows },
    { title: 'Daily spending', header: ['Day', 'Spent'], rows: summary.dayRows },
    { title: 'Participant consumption and payments', header: ['Person', 'Consumed', 'Paid'], rows: summary.personRows }
  ];
  let cursor = 20;
  const chartRanges = [];
  const oldHeight = Number(PropertiesService.getDocumentProperties().getProperty('WORKBOOK_DASHBOARD_HEIGHT') || 20);
  workbookFit_(dashboard, Math.max(oldHeight, 800), 6);
  dashboard.getRange(20, 1, Math.max(1, oldHeight - 19), 4).clearContent();
  tables.forEach(table => {
    dashboard.getRange(cursor, 1).setValue(table.title).setFontWeight('bold');
    dashboard.getRange(cursor + 1, 1, 1, table.header.length).setValues([table.header]);
    if (table.rows.length) dashboard.getRange(cursor + 2, 1, table.rows.length, table.header.length)
      .setValues(table.rows.map(row => row.map(literalSheetCell_)));
    const chartRow = cursor + table.rows.length + 3;
    chartRanges.push({ range: dashboard.getRange(cursor + 1, 1, Math.max(2, table.rows.length + 1),
      table.header.length === 4 ? 2 : table.header.length), row: chartRow, title: table.title, count: table.rows.length });
    cursor = chartRow + 10;
  });
  PropertiesService.getDocumentProperties().setProperty('WORKBOOK_DASHBOARD_HEIGHT', String(cursor));
  const chartShape = JSON.stringify(tables.map(table => table.rows.length));
  if (PropertiesService.getDocumentProperties().getProperty('WORKBOOK_CHART_SHAPE') !== chartShape || !dashboard.getCharts().length) {
    dashboard.getCharts().forEach(chart => dashboard.removeChart(chart));
    chartRanges.filter(item => item.count > 0).forEach(item => dashboard.insertChart(dashboard.newChart().setChartType(Charts.ChartType.COLUMN)
      .addRange(item.range).setNumHeaders(1).setPosition(item.row, 1, 0, 0)
      .setOption('title', item.title).setOption('width', 355).setOption('height', 245).build()));
    PropertiesService.getDocumentProperties().setProperty('WORKBOOK_CHART_SHAPE', chartShape);
  }
  const expenses = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EXPENSES);
  const warnings = Array.from({ length: MAX_DATA_ROWS }, (_, index) => {
    const expense = ledger.rowRecords.get(index + 2);
    return [literalSheetCell_(ledger.warnings ? ledger.warnings.get(index + 2) || '' : ''),
      !!expense && config.acknowledgements[expense.expenseId] === expense.duplicateSignature];
  });
  expenses.getRange(2, WORKBOOK_WARNING_COL, MAX_DATA_ROWS, 2).setValues(warnings);
}

function workbookDraft_(slot) {
  if (!Number.isInteger(slot) || slot < 1 || slot > MAX_PARTICIPANTS) throw new Error('Invalid participant draft slot.');
  const sheet = workbookSheet_('Quick Entry');
  const first = QUICK_BLOCK_FIRST + (slot - 1) * QUICK_BLOCK_HEIGHT;
  return { sheet, first, values: sheet.getRange(first + 3, 2, 7, 1).getValues().map(row => row[0]),
    tripId: String(sheet.getRange(first + 19, 2).getValue() || '') };
}

function resetWorkbookDraft_(slot, initializing) {
  const draft = workbookDraft_(slot);
  const previous = workbookGet_(`draft:${slot}`);
  if (!initializing && previous) {
    const receipt = workbookGet_(`receipt:${previous}`);
    if (receipt && receipt.phase === 'writing') throw new Error('A submission needs reconciliation before this draft can be reset.');
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const today = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  draft.sheet.getRange(draft.first + 2, 2).clearContent();
  draft.sheet.getRange(draft.first + 3, 2, 7, 1).setValues([
    [Utilities.parseDate(today, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd')], [''], [''], [''], ['All'], [''], ['']
  ]);
  draft.sheet.getRange(draft.first + 18, 2).setValue(Utilities.getUuid());
  draft.sheet.getRange(draft.first + 19, 2).setValue(workbookTripId_());
  draft.sheet.getRange(draft.first + 22, 2).setValue('Ready — enter payer and amount.');
  draft.sheet.getRange(draft.first + 14, 2).setValue('Expense saving and recovery checkpoints have separate statuses.');
}

function validateWorkbookDraft_(values) {
  if (!validateSetupStatus()) throw new Error('Complete trip setup and participant names first.');
  const roster = getRoster();
  const payer = roster.find(person => person.name.toLowerCase() === String(values[3]).trim().toLowerCase());
  if (!payer) throw new Error('Choose a payer from the current roster.');
  const minor = toMinor_(values[2]);
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new Error('Enter a positive amount within the supported range.');
  const row = [...values];
  if (!(row[0] instanceof Date)) {
    const date = fxDate_(row[0], SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone());
    row[0] = Utilities.parseDate(date, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  if (!Number.isFinite(row[0].getTime())) throw new Error('Enter a valid date.');
  row[3] = payer.name;
  parseSplitAmong_(row[4], roster, minor);
  const source = currencyCode_(row[5] || getCurrencySymbol_());
  const target = currencyCode_(getCurrencySymbol_());
  if (source !== target) getFxRate_(source, target,
    fxDate_(row[0], SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone()), { results: new Map() });
  return row;
}

function reconcileWorkbookReceipt_(receipt) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EXPENSES);
  const rows = sheet.getRange(2, 1, MAX_DATA_ROWS, 8).getValues();
  const matches = rows.flatMap((row, index) => row[7] === receipt.expenseId ? [index] : []);
  if (matches.length > 1) throw new Error('Submission identity was copied. Organizer reconciliation is required.');
  if (matches.length === 1) {
    const row = rows[matches[0]].map(encodeTripCell_);
    if (workbookHash_(row) !== receipt.payloadHash) throw new Error('Submitted expense was edited. It will not be appended again.');
    receipt.phase = 'committed';
    receipt.row = matches[0] + 2;
    workbookPut_(`receipt:${receipt.id}`, receipt);
    return true;
  }
  return receipt.phase === 'committed';
}

function submitWorkbookDraft_(slot) {
  const draft = workbookDraft_(slot);
  if (draft.tripId !== workbookTripId_()) throw new Error('Draft belongs to another trip. Reset draft before entering this trip.');
  const boundHash = workbookHash_(draft.values.map(encodeTripCell_));
  let generation = String(draft.sheet.getRange(draft.first + 18, 2).getValue() || '');
  if (!generation) {
    generation = Utilities.getUuid();
    draft.sheet.getRange(draft.first + 18, 2).setValue(generation);
  }
  let previousId = workbookGet_(`draft:${slot}`);
  let receipt = previousId ? workbookGet_(`receipt:${previousId}`) : null;
  if (receipt && receipt.generation === generation && receipt.tripId === draft.tripId && receipt.draftHash === boundHash) {
    if (!reconcileWorkbookReceipt_(receipt)) {
      if (receipt.phase === 'writing') throw new Error('Submission outcome is uncertain. Organizer must inspect its request ID; do not submit a new copy.');
      // An allocated request has not entered its write phase and can safely proceed.
    }
  } else {
    if (receipt && receipt.phase === 'writing' && !reconcileWorkbookReceipt_(receipt)) {
      throw new Error('Resolve the previous pending submission before changing this draft.');
    }
    if (slot > getRoster().length) throw new Error('This participant slot is inactive. Update Setup first.');
    const values = validateWorkbookDraft_(draft.values);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EXPENSES);
    const rows = sheet.getRange(2, 1, MAX_DATA_ROWS, 8).getValues();
    const empty = rows.findIndex(row => row.every(value => value === ''));
    if (empty < 0) throw new Error('All 500 expense rows are occupied. Draft retained.');
    const id = Utilities.getUuid();
    const expenseId = Utilities.getUuid();
    const payload = [...values, expenseId].map(encodeTripCell_);
    receipt = { id, generation, tripId: draft.tripId, draftHash: boundHash, expenseId, payload,
      payloadHash: workbookHash_(payload), phase: 'allocated', row: empty + 2 };
    workbookPut_(`receipt:${id}`, receipt);
    workbookPut_(`draft:${slot}`, id);
  }
  draft.sheet.getRange(draft.first + 22, 2).setValue('Saving expense');
  if (receipt.phase !== 'committed') {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EXPENSES);
    if (sheet.getRange(receipt.row, 1, 1, 8).getValues()[0].some(value => value !== '')) {
      throw new Error('Allocated row changed. Organizer reconciliation is required; draft retained.');
    }
    receipt.phase = 'writing';
    workbookPut_(`receipt:${receipt.id}`, receipt);
    sheet.getRange(receipt.row, 1, 1, 8).setValues([receipt.payload.map(decodeTripCell_)]);
    SpreadsheetApp.flush();
    if (!reconcileWorkbookReceipt_(receipt)) throw new Error('Expense write could not be verified. Retain this request ID.');
  }
  // Rotate the generation with the acknowledgement/checkbox in one range write. A new explicit
  // tap may create an identical legitimate expense; a delayed event still sees an unchecked box.
  const acknowledgement = draft.sheet.getRange(draft.first + 12, 2, 11, 1).getValues();
  acknowledgement[0] = [false];
  acknowledgement[1] = [`=IF(B${draft.first + 12},"Pending — wait for script acknowledgement",B${draft.first + 22})`];
  acknowledgement[6] = [Utilities.getUuid()];
  acknowledgement[10] = [`Expense saved — ID ${receipt.expenseId}. Do not resubmit for backup errors.`];
  draft.sheet.getRange(draft.first + 12, 2, 11, 1).setValues(acknowledgement);
  const currentHash = workbookHash_(workbookDraft_(slot).values.map(encodeTripCell_));
  if (currentHash === boundHash) draft.sheet.getRange(draft.first + 5, 2).clearContent();
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETUP).getRange(SETUP_CONFIRM_CELL).setValue(false);
  return receipt;
}

function applyWorkbookTemplate_(slot) {
  const draft = workbookDraft_(slot);
  const name = draft.sheet.getRange(draft.first + 2, 2).getValue();
  const template = readWorkbookConfig_().templates.find(item => item.name === name);
  if (!template) throw new Error('Choose an existing template.');
  draft.sheet.getRange(draft.first + 4, 2, 6, 1).setValues([
    [literalSheetCell_(template.description)], [''], [literalSheetCell_(template.payer)],
    [literalSheetCell_(template.split)], [literalSheetCell_(template.currency)], [literalSheetCell_(template.category)]
  ]);
}

function copyWorkbookExpense_(slot) {
  const draft = workbookDraft_(slot);
  const row = Number(draft.sheet.getRange(draft.first + 10, 2).getValue());
  if (!Number.isInteger(row) || row < 2 || row > MAX_DATA_ROWS + 1) throw new Error('Choose an Expenses row from 2 to 501.');
  const values = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EXPENSES).getRange(row, 1, 1, 7).getValues()[0];
  if (values.every(value => value === '')) throw new Error('Selected expense row is empty.');
  draft.sheet.getRange(draft.first + 3, 2, 7, 1).setValues(values.map(value => [literalSheetCell_(value)]));
  draft.sheet.getRange(draft.first + 22, 2).setValue('Copy loaded for review. Check Add expense to save a new expense.');
}

function saveWorkbookSettings_() {
  const config = JSON.parse(JSON.stringify(readWorkbookConfig_()));
  const sheet = workbookSheet_('Budgets');
  const categories = sheet.getRange(9, 1, 100, 2).getValues().filter(row => row.some(value => value !== ''));
  const categoryBudgets = Object.create(null);
  config.categories = categories.map(([name, budget]) => {
    const label = String(name).trim();
    if (!label) throw new Error('A category allowance needs a category name.');
    workbookBudgetMinor_(budget);
    categoryBudgets[label] = budget === '' ? '' : Number(budget);
    return label;
  });
  workbookBudgetMinor_(sheet.getRange('B4').getValue());
  config.tripBudget = sheet.getRange('B4').getValue() === '' ? '' : Number(sheet.getRange('B4').getValue());
  config.categoryBudgets = categoryBudgets;
  if (sheet.getRange('B5').getValue() === true) config.budgetCurrency = currencyCode_(getCurrencySymbol_());
  // Budget currency is metadata; editing B3 alone never reinterprets monetary limits.
  saveWorkbookConfig_(config);
  sheet.getRange('B3').setValue(config.budgetCurrency);
  sheet.getRange('B5').setValue(false);
}

function saveWorkbookTemplates_() {
  const rows = workbookSheet_('Quick Entry').getRange(TEMPLATE_FIRST_ROW + 1, 1, 50, 6).getValues();
  const config = JSON.parse(JSON.stringify(readWorkbookConfig_()));
  config.templates = rows.filter(row => row.some(value => value !== '')).map(row =>
    Object.fromEntries(['name', 'description', 'category', 'payer', 'split', 'currency'].map((key, index) => [key, String(row[index]).trim()])));
  saveWorkbookConfig_(config);
}

function refreshWorkbookChoices_() {
  const config = readWorkbookConfig_();
  const names = getRoster().map(person => person.name);
  const choices = values => SpreadsheetApp.newDataValidation().requireValueInList(values.length ? values : [''], true)
    .setAllowInvalid(true).build();
  const categoryRule = choices(config.categories);
  const templateRule = choices(config.templates.map(template => template.name));
  const payerRule = choices(names);
  const quick = workbookSheet_('Quick Entry');
  for (let index = 0; index < MAX_PARTICIPANTS; index++) {
    const first = QUICK_BLOCK_FIRST + index * QUICK_BLOCK_HEIGHT;
    quick.getRange(first + 2, 2).setDataValidation(templateRule);
    quick.getRange(first + 6, 2).setDataValidation(payerRule);
    quick.getRange(first + 9, 2).setDataValidation(categoryRule);
  }
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EXPENSES).getRange(2, 7, MAX_DATA_ROWS, 1).setDataValidation(categoryRule);
}

function reconcileWorkbookRequests_() {
  const quick = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Quick Entry');
  if (!quick) return;
  const values = quick.getRange(1, 2, QUICK_BLOCK_FIRST + MAX_PARTICIPANTS * QUICK_BLOCK_HEIGHT, 1).getValues();
  for (let slot = 1; slot <= MAX_PARTICIPANTS; slot++) {
    const draft = workbookDraft_(slot);
    if (values[draft.first + 11][0] !== true) continue;
    try {
      submitWorkbookDraft_(slot);
    } catch (error) {
      draft.sheet.getRange(draft.first + 22, 2).setValue(`Save not acknowledged: ${error.message}. Retain this draft and request ID.`);
      draft.sheet.getRange(draft.first + 12, 2).setValue(false);
    }
  }
}

function renderWorkbookHistory_(preferredTrip) {
  const sheet = workbookSurface_('History', 'RECOVERY HISTORY — organizer controls');
  sheet.getRange('A2:A11').setValues([['Version ID'], ['History trip'], ['Preview version'], ['Preview'],
    ['Source trip'], ['Destination trip'], ['Restore previewed version'], ['Operation status'],
    ['Recover interrupted operation'], ['Maintenance rule']]);
  [4, 8, 10].forEach(row => {
    if (sheet.getRange(row, 2).getValue() === '') sheet.getRange(row, 2).insertCheckboxes().setValue(false);
  });
  const tripId = workbookTripId_();
  const directory = workbookGet_('history-directory') || [];
  if (!directory.some(item => item.id === tripId)) directory.push({ id: tripId,
    name: String(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETUP).getRange(SETUP_TRIP_NAME_CELL).getValue() || '(Untitled trip)').slice(0, 100) });
  const label = item => `${item.name} [${item.id}]`;
  const selectedLabel = sheet.getRange('B3').getValue();
  const selected = directory.find(item => item.id === preferredTrip) ||
    directory.find(item => label(item) === selectedLabel) || directory.find(item => item.id === tripId);
  sheet.getRange('B3').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(directory.map(label), true).setAllowInvalid(false).build())
    .setValue(literalSheetCell_(label(selected)));
  sheet.getRange('B7').setValue(tripId);
  sheet.getRange('B11').setValue('Everyone, including owner, must pause editing during replacement.');
  const versions = (workbookGet_(`versions:${selected.id}`) || []).slice(-20).reverse();
  sheet.getRange('A15:D35').clearContent();
  sheet.getRange('A15:D15').setValues([['Version ID', 'Saved UTC', 'Reason', 'Trip ID']]);
  if (versions.length) sheet.getRange(16, 1, versions.length, 4).setValues(versions.map(version =>
    [version.id, version.at, version.reason, selected.id]));
  sheet.getRange('B2').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(versions.length ? versions.map(version => version.id) : ['No versions yet'], true).setAllowInvalid(false).build());
  sheet.getRange('A38:A41').setValues([['Pending participant slot'], ['Inspect submission'], ['Submission review'], ['Cancel inspected request']]);
  sheet.getRange('B38').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(Array.from({ length: 15 }, (_, index) => String(index + 1)), true).setAllowInvalid(false).build());
  [39, 41].forEach(row => {
    if (sheet.getRange(row, 2).getValue() === '') sheet.getRange(row, 2).insertCheckboxes().setValue(false);
  });
}

function inspectWorkbookSubmission_() {
  workbookOrganizer_();
  const history = workbookSheet_('History');
  const slot = Number(history.getRange('B38').getValue());
  const draft = workbookDraft_(slot);
  const id = workbookGet_(`draft:${slot}`);
  const receipt = id && workbookGet_(`receipt:${id}`);
  if (!receipt) throw new Error('This slot has no pending submission receipt.');
  let found = receipt.phase === 'committed';
  let conflict = '';
  if (!found && receipt.tripId === workbookTripId_()) {
    try { found = reconcileWorkbookReceipt_(receipt); } catch (error) { conflict = error.message; }
  }
  if (found) {
    history.getRange('B40').setValue(`Expense already saved: ${receipt.expenseId}. No retry or cancellation is needed.`);
    draft.sheet.getRange(draft.first + 22, 2).setValue(`Expense saved — ID ${receipt.expenseId}.`);
    workbookDelete_('request-preview');
    return;
  }
  workbookPut_('request-preview', { slot, id, receiptHash: workbookHash_(receipt),
    destinationHash: workbookRawFingerprint_(captureWorkbookRaw_()) });
  history.getRange('B40').setValue(`Request ${id}, trip ${receipt.tripId}, amount ${receipt.payload[2]}, ` +
    `${receipt.payload[1]}. ${conflict || 'Outcome uncertain.'} Review Expenses first. ` +
    'Cancellation releases the draft; it never adds or deletes an expense.');
}

function cancelWorkbookSubmission_() {
  workbookOrganizer_();
  const history = workbookSheet_('History');
  const preview = workbookGet_('request-preview');
  if (!preview || Number(history.getRange('B38').getValue()) !== preview.slot ||
      workbookGet_(`draft:${preview.slot}`) !== preview.id ||
      workbookHash_(workbookGet_(`receipt:${preview.id}`)) !== preview.receiptHash ||
      workbookRawFingerprint_(captureWorkbookRaw_()) !== preview.destinationHash) {
    throw new Error('Submission or inputs changed. Inspect the pending submission again.');
  }
  const receipt = workbookGet_(`receipt:${preview.id}`);
  receipt.phase = 'cancelled';
  workbookPut_(`receipt:${preview.id}`, receipt);
  workbookDelete_(`draft:${preview.slot}`);
  workbookDelete_('request-preview');
  const draft = workbookDraft_(preview.slot);
  draft.sheet.getRange(draft.first + 12, 2).setValue(false);
  draft.sheet.getRange(draft.first + 22, 2).setValue('Pending request cancelled. Existing expenses are unchanged. Review before submitting a new request.');
  history.getRange('B40').setValue('Request cancelled. No expense was added or deleted.');
}

function previewWorkbookVersion_() {
  workbookOrganizer_();
  const sheet = workbookSheet_('History');
  const id = String(sheet.getRange('B2').getValue());
  const version = workbookGet_(`version:${id}`);
  if (!version || version.id !== id) throw new Error('Choose an available recovery version.');
  const destination = captureWorkbookRaw_();
  const target = normalizedWorkbookRaw_(version.raw);
  const preview = { id, sourceHash: workbookHash_(version), target,
    destinationTrip: destination.tripId, destinationHash: workbookRawFingerprint_(destination) };
  workbookPut_('preview', preview);
  sheet.getRange('B5').setValue(`${version.at} | ${version.reason} | ${version.raw.expenses.filter(row => row.slice(0, 7).some(value => value !== '')).length} input rows | ${version.raw.setup[1][0]} participants | budget ${target.config.tripBudget === '' ? 'none' : target.config.tripBudget} ${target.config.budgetCurrency}`);
  sheet.getRange('B6').setValue(version.tripId);
  sheet.getRange('B7').setValue(destination.tripId);
  sheet.getRange('B9').setValue('Preview ready. Pause all editing, then check Restore previewed version.');
}

function restoreWorkbookPreview_() {
  workbookOrganizer_();
  const sheet = workbookSheet_('History');
  const preview = workbookGet_('preview');
  if (!preview || sheet.getRange('B2').getValue() !== preview.id || workbookTripId_() !== preview.destinationTrip ||
      sheet.getRange('B7').getValue() !== preview.destinationTrip || sheet.getRange('B6').getValue() !== preview.target.tripId ||
      workbookHash_(workbookGet_(`version:${preview.id}`)) !== preview.sourceHash) {
    throw new Error('Recovery selection or destination changed. Preview again.');
  }
  replaceWorkbook_('restore version', preview.target, preview.destinationHash);
  workbookDelete_('preview');
  sheet.getRange('B9').setValue('Version restored as unconfirmed inputs. Review and confirm on Dashboard.');
}

function confirmWorkbookV3_() {
  let message = 'Expenses confirmed.';
  const confirmed = withTripLock_(() => {
    if (workbookPendingOperation_()) {
      throw new Error('Recover the interrupted operation before confirming.');
    }
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETUP);
    sheet.getRange(SETUP_CONFIRM_CELL).setValue(false);
    if (!validateSetupStatus()) {
      message = 'Complete Setup before confirming.';
      return false;
    }
    repairExpenseIds_();
    const ledger = buildLedger_();
    if (ledger.errors.length || ledger.duplicateCount) {
      recalculateAll(true);
      message = `Cannot confirm: ${ledger.errors.join(' | ')}${ledger.duplicateCount ? ` ${ledger.duplicateCount} duplicate warning(s) need acknowledgement in Expenses!Y.` : ''}`;
      return false;
    }
    sheet.getRange(SETUP_CONFIRM_CELL).setValue(true);
    recalculateAll(true);
    return true;
  });
  safeAlert(message);
  return confirmed;
}

function handleWorkbookEdit_(e) {
  workbookConfigCache_ = null;
  const organizer = PropertiesService.getDocumentProperties().getProperty('WORKBOOK_ORGANIZER');
  if (organizer && organizer !== Session.getEffectiveUser().getEmail()) return false;
  const previousQuiet = workbookQuiet_;
  workbookQuiet_ = true;
  let draft = null;
  let receipt = null;
  try {
    return withTripLock_(() => {
      const sheet = e.range.getSheet();
      const name = sheet.getName();
      const row = e.range.getRow();
      const col = e.range.getColumn();
      const cell = e.range.getA1Notation();
      if (name === 'History' && cell === 'B10' && e.range.getValue() === true) return recoverWorkbookOperation();
      if (workbookPendingOperation_()) {
        throw new Error('Maintenance is unfinished. Organizer must recover the interrupted operation.');
      }
      if (name === 'Quick Entry' && row >= QUICK_BLOCK_FIRST && row < TEMPLATE_FIRST_ROW - 3) {
        const slot = Math.floor((row - QUICK_BLOCK_FIRST) / QUICK_BLOCK_HEIGHT) + 1;
        draft = workbookDraft_(slot);
        const offset = row - draft.first;
        if (col !== 2 || e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;
        if (offset === 2) applyWorkbookTemplate_(slot);
        else if (offset === 11 && e.range.getValue() === true) copyWorkbookExpense_(slot);
        else if (offset === 12 && e.range.getValue() === true) receipt = submitWorkbookDraft_(slot);
        else if (offset === 17 && e.range.getValue() === true) resetWorkbookDraft_(slot, false);
        else return;
        if (offset === 11 || offset === 17) e.range.setValue(false);
      } else if (name === 'Quick Entry' && row >= TEMPLATE_FIRST_ROW + 1 && row <= TEMPLATE_FIRST_ROW + 50) {
        saveWorkbookTemplates_();
        refreshWorkbookChoices_();
      } else if (name === 'Budgets') {
        saveWorkbookSettings_();
        refreshWorkbookChoices_();
      } else if (name === 'History') {
        if (cell === 'B3') {
          workbookDelete_('preview');
          sheet.getRange('B2').clearContent();
          sheet.getRange('B5:B6').clearContent();
          renderWorkbookHistory_();
        } else if (cell === 'B4' && e.range.getValue() === true) previewWorkbookVersion_();
        else if (cell === 'B8' && e.range.getValue() === true) restoreWorkbookPreview_();
        else if (cell === 'B39' && e.range.getValue() === true) inspectWorkbookSubmission_();
        else if (cell === 'B41' && e.range.getValue() === true) cancelWorkbookSubmission_();
        else return;
        if (cell !== 'B3') e.range.setValue(false);
        return;
      } else if (name === 'Dashboard') {
        if (cell === 'B16' && e.range.getValue() === true) confirmWorkbookV3_();
        else if (cell !== 'B15' || e.range.getValue() !== true) return;
        if (cell === 'B15') reconcileWorkbookRequests_();
        e.range.setValue(false);
      } else if (name === SHEET_EXPENSES && row >= 2 && row <= MAX_DATA_ROWS + 1 && col <= 25) {
        SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETUP).getRange(SETUP_CONFIRM_CELL).setValue(false);
        const rows = repairExpenseIds_();
        if (col === 25) {
          const config = readWorkbookConfig_();
          for (let index = row - 2; index < Math.min(MAX_DATA_ROWS, row - 2 + e.range.getNumRows()); index++) {
            const values = rows[index];
            if (!values[7]) continue;
            if (sheet.getRange(index + 2, 25).getValue() === true) {
              config.acknowledgements[values[7]] = workbookExpenseSignature_(values, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone());
            } else delete config.acknowledgements[values[7]];
          }
          saveWorkbookConfig_(config);
        } else if (col > 8) return;
      } else if (name === SHEET_SETUP) {
        handleEdit_(e);
        renderWorkbookUi_(false);
      } else return;
      repairExpenseIds_();
      recalculateAll(false);
      try {
        autoCheckpointWorkbook_();
        renderWorkbookHistory_();
        if (draft && receipt) draft.sheet.getRange(draft.first + 14, 2).setValue('Expense saved. Recovery status: see Dashboard.');
      } catch (error) {
        workbookStatus_('Recovery', `Checkpoint failed: ${error.message}. Expense saves are separate; do not resubmit them.`);
        if (draft) draft.sheet.getRange(draft.first + 14, 2).setValue(`Recovery checkpoint failed: ${error.message}. Do not resubmit a saved expense.`);
      }
      workbookStatus_('Processing', `Processed ${new Date().toISOString()}`);
    });
  } catch (error) {
    workbookStatus_('Processing', `Processing failed: ${error.message}`);
    const dashboard = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Dashboard');
    if (dashboard) dashboard.getRange('B3').setValue(`Refresh required: ${error.message}`);
    if (draft) {
      const id = workbookGet_(`draft:${Math.floor((draft.first - QUICK_BLOCK_FIRST) / QUICK_BLOCK_HEIGHT) + 1}`);
      const committed = id && workbookGet_(`receipt:${id}`);
      draft.sheet.getRange(draft.first + 22, 2).setValue(committed && committed.phase === 'committed'
        ? `Expense saved — ID ${committed.expenseId}; processing failed: ${error.message}. Do not resubmit.`
        : `Save not acknowledged: ${error.message}. Retain request ID; retry the same draft.`);
      draft.sheet.getRange(draft.first + 12, 2).setValue(false);
    }
    return false;
  } finally {
    workbookQuiet_ = previousQuiet;
  }
}
