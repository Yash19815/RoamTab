/**
 * DYNAMIC GROUP TRAVEL EXPENSE SPLITTER — COMPLETE SCRIPT
 *
 * IMPORTANT
 * - setup() / “Initialize / Reset Tracker” is the ONLY destructive action.
 * - All other actions preserve entered expense data in Expenses columns A:E.
 * - Money is calculated in integer paise/cents to avoid floating-point issues.
 *
 * SETUP FLOW
 * 1. Configure trip name, people count, participant names, and optional emails.
 * 2. Use Expense Splitter > Confirm / Update Setup.
 * 3. The script rebuilds participant columns and moves the Live Summary table.
 * 4. Changes to participant count/names require re-confirmation.
 *
 * EXPENSES LAYOUT
 * A: Date
 * B: Description
 * C: Amount
 * D: Paid By
 * E: Split Among
 * F onward: Generated per-person net values
 *
 * LIVE SUMMARY POSITION
 * Always begins one blank column after the last participant column:
 * 2 people: F:G participants, H spacer, I summary
 * 3 people: F:H participants, I spacer, J summary
 * 4 people: F:I participants, J spacer, K summary
 * 6 people: F:K participants, L spacer, M summary
 */

const SHEET_SETUP = 'Setup';
const SHEET_EXPENSES = 'Expenses';
const SHEET_REPORTS = 'Send Reports';

const COL = {
  DATE: 1,
  DESC: 2,
  AMOUNT: 3,
  PAID_BY: 4,
  SPLIT: 5
};

const FIRST_PERSON_COL = 6; // F
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
  SpreadsheetApp.getUi()
    .createMenu('Expense Splitter')
    .addItem('1. Initialize / Reset Tracker', 'setup')
    .addItem('2. Recalculate Live Expenses', 'recalculateAll')
    .addSeparator()
    .addItem('Confirm / Update Setup', 'confirmSetupFromMenu')
    .addItem('Confirm All Expenses', 'confirmAllExpenses')
    .addItem('Re-open for Editing (Unconfirm)', 'unconfirmExpenses')
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
 * ONLY destructive operation.
 * Clears Setup, Expenses, and Send Reports sheets and rebuilds all initial UI.
 */
function setup() {
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
    ['Trip Name / Destination:', 'Goa Vacation 2026'],
    ['Number of People:', 4],
    ['Currency Symbol:', '₹'],
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

  setupSheet.getRange(ROSTER_START_ROW, 1, 4, 3).setValues([
    [1, 'Rahul', ''],
    [2, 'Priya', ''],
    [3, 'Amit', ''],
    [4, 'Neha', '']
  ]);

  setupSheet.getDataRange()
    .setFontFamily('Roboto')
    .setFontSize(12);

  setupSheet.autoResizeColumns(1, 3);

  validateSetupStatus();
  updateExpensesStructure();
  recalculateAll(true);

  safeAlert(
    'Tracker initialized.\n\n' +
    '1. Enter or update participant names in Setup.\n' +
    '2. Select the correct Number of People.\n' +
    '3. Use Expense Splitter > Confirm / Update Setup.'
  );
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setupSheet = ss.getSheetByName(SHEET_SETUP);

  if (!setupSheet) {
    safeAlert('Setup sheet not found. Run “Initialize / Reset Tracker” first.');
    return;
  }

  const lock = LockService.getDocumentLock();

  try {
    lock.waitLock(10000);

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

    updateExpensesStructure();
    recalculateAll(true);

    setupSheet.getRange(SETUP_CONFIRM_CELL).setValue(true);
    setupSheet.getRange(SETUP_UPDATE_CELL).setValue(false);

    const participantStart = colNumToLetter_(FIRST_PERSON_COL);
    const participantEnd = colNumToLetter_(
      FIRST_PERSON_COL + personCount - 1
    );
    const summaryStart = colNumToLetter_(getSummaryCol_(personCount));

    safeAlert(
      'Setup confirmed successfully.\n\n' +
      `Participants: ${personCount}\n` +
      `Participant columns: ${participantStart}:${participantEnd}\n` +
      `Live Summary starts at: ${summaryStart}`
    );

  } catch (err) {
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
  return `"${getCurrencySymbol_()}"#,##0.00`;
}

/**
 * Dynamic Live Summary start column.
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
        3
      )
      .clearContent();
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

  const range = e.range;
  const sheet = range.getSheet();
  const sheetName = sheet.getName();
  const row = range.getRow();
  const col = range.getColumn();
  const a1 = range.getA1Notation();

  if (sheetName === SHEET_SETUP) {
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

    const changedRoster = row >= ROSTER_START_ROW &&
      row < ROSTER_START_ROW + MAX_PARTICIPANTS &&
      col >= ROSTER_COL_NUMBER &&
      col <= ROSTER_COL_EMAIL;

    if (changedPeopleCount) {
      adjustRosterRows();
      validateSetupStatus();

      /*
       * Immediately rebuild F onward so added participant columns appear
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
      validateSetupStatus();

      /*
       * Names must be reflected in Expenses headers immediately.
       * This remains non-destructive for Expenses A:E.
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
      row >= 2 &&
      row <= MAX_DATA_ROWS + 1 &&
      col >= COL.DATE &&
      col <= COL.SPLIT) {
    recalculateAll(false);
  }
}

/* =========================================================
   EXPENSE SHEET STRUCTURE
   ========================================================= */

/**
 * Rebuilds generated participant columns and moves the summary table.
 *
 * Safety:
 * - Does not delete or clear Expenses A:E.
 * - Clears only generated areas from F through the maximum possible summary end.
 * - Existing expense data remains untouched.
 */
function updateExpensesStructure() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_EXPENSES);
  const setupSheet = ss.getSheetByName(SHEET_SETUP);

  if (!sheet || !setupSheet) return false;

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

  const summaryCol = getSummaryCol_(participantCount);
  const summaryEndCol = summaryCol + SUMMARY_WIDTH - 1;

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
   * Starts at F, so A:E expense input is never cleared.
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
    ...names
  ];

  sheet
    .getRange(1, 1, 1, headers.length)
    .setValues([headers])
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
    .setNumberFormat(getCurrencyFormat_());

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

  for (let column = participantStartCol;
       column <= participantEndCol;
       column++) {
    sheet.setColumnWidth(column, 105);
  }

  /*
   * One visible blank spacer column before Live Summary.
   */
  sheet.setColumnWidth(summaryCol - 1, 24);

  sheet.setColumnWidth(summaryCol, 140);
  sheet.setColumnWidth(summaryCol + 1, 105);
  sheet.setColumnWidth(summaryCol + 2, 125);
  sheet.setColumnWidth(summaryCol + 3, 170);

  Logger.log(
    `Expenses rebuilt. Participants: ${participantCount}; ` +
    `Participant columns: ${colNumToLetter_(participantStartCol)}:` +
    `${colNumToLetter_(participantEndCol)}; ` +
    `Summary: ${colNumToLetter_(summaryCol)}:` +
    `${colNumToLetter_(summaryEndCol)}`
  );

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

/* =========================================================
   LEDGER CONSTRUCTION
   ========================================================= */

/**
 * Builds an exact financial ledger only from Expenses columns A:E.
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

  const data = sheet
    .getRange(2, 1, lastRow - 1, COL.SPLIT)
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

    const amountMinor = toMinor_(row[COL.AMOUNT - 1]);
    const payerText = String(
      row[COL.PAID_BY - 1] || ''
    ).trim();

    /*
     * A partly entered row is ignored during live calculations.
     */
    if (!amountMinor || !payerText) {
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

    const included = parseIncluded_(
      row[COL.SPLIT - 1],
      roster
    );

    if (!included.length) {
      errors.push(
        `Row ${rowNumber}: Split Among has no valid roster member.`
      );
      rowRecords.set(rowNumber, null);
      return;
    }

    const allocations = allocateEqualMinor_(
      amountMinor,
      included
    );

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

/* =========================================================
   LIVE CALCULATIONS AND SUMMARY TABLE
   ========================================================= */

function recalculateAll(forceReports) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_EXPENSES);

  if (!sheet) return;

  const ledger = buildLedger_();
  const roster = ledger.roster;

  if (!roster.length) return;

  const rosterCount = roster.length;
  const summaryCol = getSummaryCol_(rosterCount);
  const format = getCurrencyFormat_();

  const requiredColumns = summaryCol + SUMMARY_WIDTH - 1;

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
        FIRST_PERSON_COL,
        matrix.length,
        rosterCount
      )
      .setValues(matrix)
      .setNumberFormat(format);
  }

  writeLiveSummary_(sheet, summaryCol, ledger, format);

  if (isExpensesConfirmed() || forceReports === true) {
    updateSendReportsSheet();
  }
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
    .setValues(rows);

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
    )
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

function buildSettlementExplanations_(ledger, settlements, currency) {
  const remaining = new Map(ledger.balances);
  const money = minor => `${minor < 0 ? '-' : ''}${currency}${fromMinor_(Math.abs(minor)).toFixed(2)}`;

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
      `${settlement.from}: paid ${money(ledger.paid.get(fromId))} − share ${money(ledger.spent.get(fromId))} = ${money(ledger.balances.get(fromId))} net (owes).`,
      `${settlement.to}: paid ${money(ledger.paid.get(toId))} − share ${money(ledger.spent.get(toId))} = ${money(ledger.balances.get(toId))} net (collects).`,
      `Before: ${settlement.from} owes ${money(debtBefore)}; ${settlement.to} needs ${money(creditBefore)}. Pay the smaller amount: ${money(settlement.amountMinor)}.`,
      `After: ${settlement.from} owes ${money(debtAfter)}; ${settlement.to} needs ${money(creditAfter)}.`
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

function updateSendReportsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheet = ss.getSheetByName(SHEET_REPORTS) ||
    ss.insertSheet(SHEET_REPORTS);

  const ledger = buildLedger_();
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

  if (sheet.getMaxColumns() < 6) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      6 - sheet.getMaxColumns()
    );
  }

  const output = sheet.getRange(1, 1, requiredRows, 6);

  output.breakApart();
  output.clearContent();
  output.clearFormat();
  output.clearDataValidations();

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

  if (ledger.errors.length) {
    sheet.getRange('A1:F1')
      .merge()
      .setValue(
        `❌ Cannot create settlement plan: ${ledger.errors.join(' | ')}`
      )
      .setBackground(COLOR.RED_BG)
      .setFontColor(COLOR.RED_TX)
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
    .setValues(summaryRows);

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
        `${settlement.from} pays ${settlement.to} ${symbol}${amount.toFixed(2)}`,
        explanations[index]
      ];
    });

    sheet
      .getRange(startRow + 2, 1, rows.length, 5)
      .setValues(rows);

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

  const ledger = buildLedger_();

  if (ledger.errors.length) {
    safeAlert(`Cannot send reports: ${ledger.errors.join(' | ')}`);
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
      const relevantExpenses = ledger.expenses.filter(expense =>
        expense.paidById === person.id ||
        expense.includedIds.includes(person.id)
      );

      const actions = settlements.filter(settlement =>
        settlement.fromId === person.id ||
        settlement.toId === person.id
      );

      const expenseRows = relevantExpenses.map(expense => {
        const payer = ledger.peopleById.get(expense.paidById);

        const share = fromMinor_(
          expense.allocations.get(person.id) || 0
        );

        return (
          `<tr>` +
          `<td>${escapeHtml_(expense.date)}</td>` +
          `<td>${escapeHtml_(expense.description)}</td>` +
          `<td>${currency}${fromMinor_(expense.amountMinor).toFixed(2)}</td>` +
          `<td>${escapeHtml_(payer.name)}</td>` +
          `<td>${currency}${share.toFixed(2)}</td>` +
          `</tr>`
        );
      }).join('') || '<tr><td colspan="5">No expenses involve you.</td></tr>';

      const actionRows = actions.map(action => {
        const text = action.fromId === person.id
          ? `You pay <b>${escapeHtml_(action.to)}</b> ${currency}${fromMinor_(action.amountMinor).toFixed(2)}`
          : `<b>${escapeHtml_(action.from)}</b> pays you ${currency}${fromMinor_(action.amountMinor).toFixed(2)}`;

        return `<li>${text}</li>`;
      }).join('') || '<li>No settlement required.</li>';

      const paid = fromMinor_(
        ledger.paid.get(person.id) || 0
      );

      const spent = fromMinor_(
        ledger.spent.get(person.id) || 0
      );

      const net = fromMinor_(
        ledger.balances.get(person.id) || 0
      );

      const html = `
        <html>
          <head>
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 24px;
                color: #1f2937;
              }
              h1 {
                color: #0f766e;
                margin-bottom: 4px;
              }
              h3 {
                font-weight: normal;
                color: #64748b;
                margin-top: 0;
              }
              .cards {
                display: flex;
                gap: 10px;
                margin: 20px 0;
              }
              .card {
                flex: 1;
                padding: 12px;
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                text-align: center;
              }
              .label {
                font-size: 11px;
                color: #64748b;
                text-transform: uppercase;
              }
              .value {
                font-size: 18px;
                font-weight: bold;
                margin-top: 4px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 10px;
              }
              th {
                background: #1e293b;
                color: #ffffff;
                padding: 8px;
                text-align: left;
                font-size: 12px;
              }
              td {
                padding: 8px;
                border-bottom: 1px solid #e2e8f0;
                font-size: 11px;
              }
              .box {
                margin-top: 18px;
                padding: 12px;
                background: #f0fdf4;
                border: 1px solid #bbf7d0;
              }
            </style>
          </head>
          <body>
            <h1>${escapeHtml_(tripName)}</h1>
            <h3>
              Expense Report for <b>${escapeHtml_(person.name)}</b>
              · Generated ${today}
            </h3>

            <div class="cards">
              <div class="card">
                <div class="label">Total Paid</div>
                <div class="value">${currency}${paid.toFixed(2)}</div>
              </div>
              <div class="card">
                <div class="label">Spent (Share)</div>
                <div class="value">${currency}${spent.toFixed(2)}</div>
              </div>
              <div class="card">
                <div class="label">Net Balance</div>
                <div class="value">${currency}${net.toFixed(2)}</div>
              </div>
            </div>

            <h4>Your Relevant Expenses</h4>

            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Paid By</th>
                  <th>Your Share</th>
                </tr>
              </thead>
              <tbody>
                ${expenseRows}
              </tbody>
            </table>

            <div class="box">
              <h4>Your Settlement Actions</h4>
              <ul>${actionRows}</ul>
            </div>
          </body>
        </html>`;

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

  const ledger = buildLedger_();
  const roster = ledger.roster;

  const participantCount = roster.length;
  const summaryCol = participantCount
    ? getSummaryCol_(participantCount)
    : null;

  const lines = [
    `Setup confirmed: ${isSetupConfirmed()}`,
    `Roster count: ${participantCount}`,
    `Roster: ${roster.map(person => `${person.id}:${person.name}`).join(', ') || 'none'}`,
    `Expected participant columns: ${
      participantCount
        ? `${colNumToLetter_(FIRST_PERSON_COL)}:${colNumToLetter_(FIRST_PERSON_COL + participantCount - 1)}`
        : 'none'
    }`,
    `Expected summary start: ${
      summaryCol ? colNumToLetter_(summaryCol) : 'none'
    }`,
    `Expenses sheet exists: ${!!expensesSheet}`,
    `Valid expenses: ${ledger.expenses.length}`,
    `Total spent: ${fromMinor_(ledger.totalMinor).toFixed(2)}`,
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
      `${person.name}: ${fromMinor_(net).toFixed(2)}`
    );
  });

  lines.push(`Net balance sum: ${netSum} paise`);

  try {
    const settlements = calculateOptimalSettlements_(ledger);

    lines.push(`Settlement rows: ${settlements.length}`);

    settlements.forEach(item => {
      lines.push(
        `${item.from} -> ${item.to}: ${fromMinor_(item.amountMinor).toFixed(2)}`
      );
    });

  } catch (err) {
    lines.push(`Settlement validation failed: ${err.message}`);
  }

  safeAlert(lines.join('\n'));
}
