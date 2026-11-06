const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = readFileSync(path.join(__dirname, '../../Code.js'), 'utf8');

function getMockPerson(overrides = {}) {
  return { id: 1, name: 'Alice', email: '', ...overrides };
}

function getMockRoster(count = 3) {
  return Array.from({ length: count }, (_, index) => getMockPerson({
    id: index + 1,
    name: ['Alice', 'Bob', 'Cara'][index] || `Person ${index + 1}`
  }));
}

function getMockExpense(overrides = {}) {
  const expense = {
    date: '', description: 'Meal', amount: 100, payer: 'Alice', split: 'All',
    ...overrides
  };
  return [expense.date, expense.description, expense.amount, expense.payer, expense.split];
}

function getMockLedger(balances, overrides = {}) {
  const roster = getMockRoster(balances.length);
  return {
    roster,
    balances: new Map(roster.map((person, index) => [person.id, balances[index]])),
    errors: [],
    ...overrides
  };
}

// Only the spreadsheet boundary is simulated. Calculations run from Code.js unchanged.
function getMockSheet(rows = [], { lastRow = rows.length, maxColumns = 26, maxRows = 1000 } = {}) {
  const cells = new Map();
  const reads = [];
  rows.forEach((row, rowIndex) => row.forEach((value, colIndex) => {
    cells.set(`${rowIndex + 1}:${colIndex + 1}`, value);
  }));
  const cell = (row, col) => cells.get(`${row}:${col}`) ?? '';
  const sheet = {
    reads,
    cell,
    getLastRow: () => Math.max(lastRow, 0, ...[...cells.entries()]
      .filter(([, value]) => value !== '').map(([key]) => Number(key.split(':')[0]))),
    getMaxColumns: () => maxColumns,
    getMaxRows: () => maxRows,
    insertColumnsAfter(after, count) { maxColumns += count; },
    insertRowsAfter(after, count) { maxRows += count; },
    autoResizeColumns() { return sheet; },
    autoResizeRows() { return sheet; },
    setColumnWidth() { return sheet; },
    setFrozenRows() { return sheet; },
    clear() { cells.clear(); lastRow = 0; return sheet; },
    getDataRange() { return sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), maxColumns); },
    deleteRow(row) {
      const oldCells = [...cells.entries()];
      cells.clear();
      oldCells.forEach(([key, value]) => {
        const [r, c] = key.split(':').map(Number);
        if (r !== row) cells.set(`${r > row ? r - 1 : r}:${c}`, value);
      });
      lastRow = Math.max(0, lastRow - 1);
      maxRows--;
    },
    getRange(row, col, height = 1, width = 1) {
      if (typeof row === 'string') {
        const match = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(row);
        assert.ok(match, `Unsupported cell address: ${row}`);
        const columnNumber = text => [...text].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
        col = columnNumber(match[1]);
        row = Number(match[2]);
        if (match[3]) {
          width = columnNumber(match[3]) - col + 1;
          height = Number(match[4]) - row + 1;
        }
      }
      const range = {
        getSheet: () => sheet,
        getRow: () => row,
        getColumn: () => col,
        getNumRows: () => height,
        getNumColumns: () => width,
        getA1Notation: () => `${String.fromCharCode(64 + col)}${row}`,
        getValue: () => cell(row, col),
        getValues() {
          reads.push({ row, col, height, width });
          return Array.from({ length: height }, (_, r) =>
            Array.from({ length: width }, (_, c) => cell(row + r, col + c)));
        },
        setValue(value) {
          cells.set(`${row}:${col}`, typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value);
          return range;
        },
        setValues(values) {
          assert.equal(values.length, height, 'Spreadsheet write height');
          values.forEach((valuesRow, r) => {
            assert.equal(valuesRow.length, width, 'Spreadsheet write width');
            valuesRow.forEach((value, c) => cells.set(`${row + r}:${col + c}`,
              typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value));
          });
          return range;
        },
        clearContent() {
          for (let r = row; r < row + height; r++) {
            for (let c = col; c < col + width; c++) cells.delete(`${r}:${c}`);
          }
          return range;
        }
      };
      for (const method of [
        'breakApart', 'clearFormat', 'merge', 'setBackground', 'setFontColor',
        'setFontWeight', 'setHorizontalAlignment', 'setNumberFormat',
        'setBackgrounds', 'setFontColors', 'setFontStyle', 'setFontSize', 'setWrap',
        'clearDataValidations', 'setVerticalAlignment', 'setDataValidation',
        'setNote', 'setFontFamily', 'insertCheckboxes'
      ]) range[method] = () => range;
      return range;
    }
  };
  return sheet;
}

function loadAppsScript({
  roster = getMockRoster(), expenses = [], count = roster.length,
  missingSetup = false, missingExpenses = false, lastRow
} = {}) {
  const setup = getMockSheet();
  setup.getRange('B3').setValue(count);
  setup.getRange('B4').setValue('₹');
  setup.getRange('B6').setValue(false);
  roster.forEach((person, index) => {
    setup.getRange(index + 9, 1, 1, 3).setValues([[person.id, person.name, person.email]]);
  });
  const sheet = getMockSheet([['Date', 'Description', 'Amount', 'Paid By', 'Split Among'], ...expenses], {
    lastRow: lastRow ?? expenses.length + 1
  });
  const reports = getMockSheet([], { maxColumns: 6 });
  setup.getName = () => 'Setup';
  sheet.getName = () => 'Expenses';
  const sheets = new Map([['Setup', setup], ['Expenses', sheet], ['Send Reports', reports]]);
  let activeSheet = sheet;
  const spreadsheet = {
    getSheetByName(name) {
      if (name === 'Setup') return missingSetup ? null : setup;
      if (name === 'Expenses') return missingExpenses ? null : sheet;
      return sheets.get(name) || null;
    },
    insertSheet(name) {
      const newSheet = getMockSheet();
      newSheet.getName = () => name;
      sheets.set(name, newSheet);
      return newSheet;
    },
    getActiveSheet: () => activeSheet,
    setActiveSheet(value) { activeSheet = value; },
    getSpreadsheetTimeZone: () => 'Asia/Kolkata'
  };
  const alerts = [];
  const menuItems = [];
  const ui = {
    ButtonSet: { YES_NO: 'YES_NO' }, Button: { YES: 'YES', NO: 'NO' },
    answer: 'YES',
    alert(...args) { alerts.push(args); return ui.answer; },
    createMenu() {
      const menu = {
        addItem(label, action) { menuItems.push([label, action]); return menu; },
        addSeparator() { return menu; }, addToUi() {}
      };
      return menu;
    }
  };
  let nextId = 0;
  const context = vm.createContext({
    Date,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      getUi: () => ui,
      flush() {},
      newDataValidation() {
        const builder = {};
        for (const method of ['requireDate', 'setAllowInvalid', 'setHelpText', 'requireValueInList']) {
          builder[method] = () => builder;
        }
        builder.build = () => ({});
        return builder;
      }
    },
    Logger: { log() {} },
    LockService: { getDocumentLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      formatDate: date => date.toISOString().slice(0, 10),
      getUuid: () => `test-trip-${++nextId}`
    }
  });
  vm.runInContext(source, context, { filename: 'Code.js', timeout: 1000 });
  return { app: context, sheet, setup, reports, spreadsheet, alerts, ui, menuItems };
}

// Convert VM arrays/objects into the test realm for strict structural assertions.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertSettles(ledger, settlements) {
  const remaining = new Map(ledger.balances);
  const sent = new Map();
  const received = new Map();
  for (const settlement of settlements) {
    assert.ok(Number.isSafeInteger(settlement.amountMinor) && settlement.amountMinor > 0);
    assert.notEqual(settlement.fromId, settlement.toId);
    assert.ok(ledger.balances.get(settlement.fromId) < 0, 'Only original debtors pay');
    assert.ok(ledger.balances.get(settlement.toId) > 0, 'Only original creditors receive');
    assert.equal(settlement.from, ledger.roster.find(person => person.id === settlement.fromId).name);
    assert.equal(settlement.to, ledger.roster.find(person => person.id === settlement.toId).name);
    remaining.set(settlement.fromId, remaining.get(settlement.fromId) + settlement.amountMinor);
    remaining.set(settlement.toId, remaining.get(settlement.toId) - settlement.amountMinor);
    sent.set(settlement.fromId, (sent.get(settlement.fromId) || 0) + settlement.amountMinor);
    received.set(settlement.toId, (received.get(settlement.toId) || 0) + settlement.amountMinor);
  }
  for (const [id, balance] of ledger.balances) {
    assert.ok(remaining.get(id) === 0, `Person ${id} has an uncleared balance`);
    assert.equal(sent.get(id) || 0, Math.max(-balance, 0));
    assert.equal(received.get(id) || 0, Math.max(balance, 0));
  }
  const activeCount = [...ledger.balances.values()].filter(value => value !== 0).length;
  assert.ok(settlements.length <= Math.max(0, activeCount - 1));
}

function assertLedgerConservesMoney(ledger) {
  const sum = values => [...values].reduce((total, value) => total + value, 0);
  assert.equal(ledger.errors.length, 0, ledger.errors.join(' | '));
  assert.equal(sum(ledger.paid.values()), ledger.totalMinor);
  assert.equal(sum(ledger.spent.values()), ledger.totalMinor);
  assert.equal(sum(ledger.balances.values()), 0);
  for (const person of ledger.roster) {
    assert.equal(ledger.balances.get(person.id), ledger.paid.get(person.id) - ledger.spent.get(person.id));
  }
  for (const expense of ledger.expenses) {
    assert.equal(sum(expense.allocations.values()), expense.amountMinor);
    assert.ok([...expense.allocations.values()].every(Number.isSafeInteger));
  }
}

function getSeededRandom(seed = 123456789) {
  return maximum => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % maximum;
  };
}

module.exports = {
  getMockPerson, getMockRoster, getMockExpense, getMockLedger,
  loadAppsScript, plain, assertSettles, assertLedgerConservesMoney, getSeededRandom
};
