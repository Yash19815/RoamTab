const assert = require('node:assert/strict');
const { it } = require('node:test');
const { loadAppsScript, getMockRoster, getMockExpense, plain } = require('./helpers/apps-script.cjs');

function tracker(options = {}) {
  const state = loadAppsScript({ roster: getMockRoster(2), ...options });
  state.setup.getRange('B2').setValue('Mobile trip');
  assert.equal(state.app.upgradeMobileWorkbook(), true, JSON.stringify(state.alerts));
  return state;
}

function edit(state, sheet, address, value) {
  if (value !== undefined) sheet.getRange(address).setValue(value);
  return state.app.onAuthorizedEdit({ range: sheet.getRange(address), authMode: 'FULL' });
}

function fillDraft(state, slot = 1, overrides = {}) {
  const { sheet, first } = state.app.workbookDraft_(slot);
  const values = [new Date('2026-11-15T06:00:00Z'), 'Lunch', 100, 'Alice', 'All', '', 'Food'];
  for (const [index, value] of Object.entries(overrides)) values[Number(index)] = value;
  sheet.getRange(first + 3, 2, 7, 1).setValues(values.map(value => [value]));
  return { sheet, first, values };
}

it('upgrades without losing inputs or saved legacy records, and builds native mobile surfaces', () => {
  const state = loadAppsScript({ roster: getMockRoster(2), expenses: [getMockExpense({ amount: 125.35 })] });
  state.setup.getRange('B2').setValue('Original');
  state.app.saveTrip();
  const original = plain(state.app.captureTrip_());
  assert.equal(state.app.upgradeMobileWorkbook(), true, JSON.stringify(state.alerts));
  assert.equal(state.sheet.cell(2, 3), 125.35);
  assert.equal(state.sheet.cell(1, 7), 'Category');
  assert.equal(state.sheet.cell(1, 8), 'Expense ID');
  assert.equal(state.sheet.cell(1, 9), 'Alice');
  assert.ok(state.sheet.cell(2, 8));
  assert.equal(state.app.readTripRecord_(state.spreadsheet.getSheetByName('Records'), 2).trip.schemaVersion, 2);
  const versions = state.app.workbookGet_(`versions:${original.id}`);
  assert.equal(versions.length, 1);
  assert.equal(state.app.workbookGet_(`version:${versions[0].id}`).raw.advanced, false);
  for (const name of ['Dashboard', 'Quick Entry', 'Budgets', 'History']) assert.ok(state.spreadsheet.getSheetByName(name));
  assert.equal(state.spreadsheet.getSheetByName('Dashboard').getCharts().length, 3);
  const quick = state.spreadsheet.getSheetByName('Quick Entry');
  assert.equal(quick.links.length, 30);
  assert.match(quick.cell(36, 2), /Pending/);
  assert.equal(state.triggers.length, 1);
  assert.equal(state.app.workbookGet_('operation').phase, 'complete');
});

it('commits two participants to distinct rows and keeps consumed/paid amounts separate', () => {
  const state = tracker();
  const first = fillDraft(state, 1);
  const second = fillDraft(state, 2, { 1: 'Taxi', 2: 40, 3: 'Bob', 6: 'Transport' });
  edit(state, first.sheet, `B${first.first + 12}`, true);
  edit(state, second.sheet, `B${second.first + 12}`, true);
  assert.equal(state.sheet.cell(2, 3), 100);
  assert.equal(state.sheet.cell(3, 3), 40);
  assert.notEqual(state.sheet.cell(2, 8), state.sheet.cell(3, 8));
  const ledger = state.app.buildLedger_();
  assert.equal(ledger.totalMinor, 14000);
  const summary = state.app.buildWorkbookSummary_(ledger, state.app.readWorkbookConfig_());
  assert.deepEqual(plain(summary.personRows), [['Alice', 70, 100], ['Bob', 70, 40]]);
  assert.match(first.sheet.cell(first.first + 22, 2), /Expense saved/);
  assert.equal(first.sheet.cell(first.first + 5, 2), '');
});

it('creates a daily chart only after valid day data exists', () => {
  const state = tracker();
  const dashboard = state.spreadsheet.getSheetByName('Dashboard');
  assert.equal(dashboard.getCharts().length, 2);
  const draft = fillDraft(state);
  edit(state, draft.sheet, `B${draft.first + 12}`, true);
  assert.equal(dashboard.getCharts().length, 3);
});

it('templates leave amounts blank, copies require explicit submission, and invalid drafts survive', () => {
  const state = tracker({ expenses: [getMockExpense()] });
  const draft = fillDraft(state);
  edit(state, draft.sheet, `B${draft.first + 2}`, 'Hotel');
  assert.equal(draft.sheet.cell(draft.first + 4, 2), 'Hotel');
  assert.equal(draft.sheet.cell(draft.first + 5, 2), '');
  draft.sheet.getRange(draft.first + 10, 2).setValue(2);
  edit(state, draft.sheet, `B${draft.first + 11}`, true);
  assert.equal(draft.sheet.cell(draft.first + 5, 2), 100);
  assert.equal(state.app.buildLedger_().expenses.length, 1);
  draft.sheet.getRange(draft.first + 6, 2).setValue('Unknown');
  assert.equal(edit(state, draft.sheet, `B${draft.first + 12}`, true), false);
  assert.equal(draft.sheet.cell(draft.first + 5, 2), 100);
  assert.match(draft.sheet.cell(draft.first + 22, 2), /payer/);
});

it('uses advisory zero and independent trip/category limits, suspending comparisons after currency changes', () => {
  const state = tracker({ expenses: [getMockExpense({ amount: 100 })] });
  state.sheet.getRange('G2').setValue('Food');
  const budgets = state.spreadsheet.getSheetByName('Budgets');
  budgets.getRange('B4').setValue(150);
  edit(state, budgets, 'B9', 0);
  let summary = state.app.buildWorkbookSummary_(state.app.buildLedger_(), state.app.readWorkbookConfig_());
  assert.equal(summary.remaining, 5000);
  assert.deepEqual(plain(summary.categoryRows[0]), ['Food', 100, 0, 'Over budget']);
  assert.equal(state.app.confirmWorkbookV3_(), true);
  state.setup.getRange('B4').setValue('USD');
  summary = state.app.buildWorkbookSummary_(state.app.buildLedger_(), state.app.readWorkbookConfig_());
  assert.equal(summary.budgetCurrent, false);
  assert.equal(summary.remaining, null);
  edit(state, budgets, 'B5', true);
  assert.equal(state.app.readWorkbookConfig_().budgetCurrency, 'USD');
  assert.equal(state.app.readWorkbookConfig_().tripBudget, 150);
});

it('flags duplicates without deleting money and invalidates acknowledgements after relevant edits', () => {
  const state = tracker({ expenses: [getMockExpense(), getMockExpense()] });
  assert.equal(state.app.buildLedger_().duplicateCount, 2);
  assert.equal(state.app.confirmWorkbookV3_(), false);
  edit(state, state.sheet, 'Y2', true);
  edit(state, state.sheet, 'Y3', true);
  assert.equal(state.app.confirmWorkbookV3_(), true);
  edit(state, state.sheet, 'B2', 'Changed');
  edit(state, state.sheet, 'B2', 'Meal');
  assert.equal(state.app.buildLedger_().duplicateCount, 1);
  assert.equal(state.app.buildLedger_().totalMinor, 20000);
});

it('retains incomplete rows, exposes excluded totals, and blocks confirmation', () => {
  const state = tracker({ expenses: [getMockExpense(), ['', 'unfinished', '', '', '', '']] });
  const ledger = state.app.buildLedger_();
  assert.equal(ledger.excludedRows, 1);
  assert.equal(ledger.totalMinor, 10000);
  assert.match(state.spreadsheet.getSheetByName('Dashboard').cell(3, 2), /PARTIAL TOTALS/);
  assert.equal(state.app.confirmWorkbookV3_(), false);
  assert.equal(state.setup.cell(6, 2), false);
});

it('round-trips schema 3 with budgets, categories, IDs, drafts, and legacy JSON normalization', () => {
  const state = tracker({ expenses: [getMockExpense({ date: new Date('2026-11-14T18:30:00Z') })] });
  state.sheet.getRange('G2').setValue('Stay');
  const trip = state.app.captureTrip_();
  assert.equal(trip.schemaVersion, 3);
  state.app.validateTrip_(trip);
  state.app.restorePortableV3_(trip);
  assert.deepEqual(plain(state.app.captureTrip_().expenses), plain(trip.expenses));
  const legacy = plain(trip);
  legacy.schemaVersion = 1;
  delete legacy.workbook;
  legacy.expenses = legacy.expenses.map(row => row.slice(0, 5));
  state.app.restorePortableV3_(legacy);
  assert.equal(state.sheet.cell(2, 7), '');
  assert.ok(state.sheet.cell(2, 8));
  assert.equal(state.app.buildLedger_().totalMinor, 10000);
});

it('rejects stale recovery previews without replacing newer inputs', () => {
  const state = tracker({ expenses: [getMockExpense()] });
  const version = state.app.createRecoveryVersion_('Test');
  const history = state.spreadsheet.getSheetByName('History');
  history.getRange('B2').setValue(version.id);
  state.app.previewWorkbookVersion_();
  state.sheet.getRange('B2').setValue('New edit after preview');
  assert.throws(() => state.app.restoreWorkbookPreview_(), /changed after preview/);
  assert.equal(state.sheet.cell(2, 2), 'New edit after preview');
  assert.equal(state.app.workbookGet_('operation').phase, 'aborted');
});

it('keeps 20 versions and treats automatic checkpoint timing as throttling', () => {
  const state = tracker();
  for (let index = 0; index < 23; index++) state.app.createRecoveryVersion_(`Manual ${index}`);
  const id = state.app.workbookTripId_();
  state.app.pruneRecoveryVersions_(id);
  assert.equal(state.app.workbookGet_(`versions:${id}`).length, 20);
  state.app.autoCheckpointWorkbook_();
  const count = state.app.workbookGet_(`versions:${id}`).length;
  state.sheet.getRange('B2').setValue('Unsaved terminal draft');
  state.app.autoCheckpointWorkbook_();
  assert.equal(state.app.workbookGet_(`versions:${id}`).length, count);
});

it('repairs pasted IDs, invalidates ambiguous acknowledgements, and resets cleared row identity', () => {
  const state = tracker({ expenses: [getMockExpense(), getMockExpense()] });
  const copiedId = state.sheet.cell(2, 8);
  state.sheet.getRange('H3').setValue(copiedId);
  state.app.repairExpenseIds_();
  assert.notEqual(state.sheet.cell(2, 8), copiedId);
  assert.notEqual(state.sheet.cell(3, 8), copiedId);
  assert.notEqual(state.sheet.cell(3, 8), state.sheet.cell(2, 8));
  state.sheet.getRange('A2:G2').clearContent();
  state.app.repairExpenseIds_();
  assert.equal(state.sheet.cell(2, 8), '');
});

it('reconciles a committed row after a receipt update fails without appending a second expense', () => {
  const state = tracker();
  const draft = fillDraft(state);
  const put = state.app.workbookPut_;
  let fail = true;
  state.app.workbookPut_ = (key, value) => {
    if (fail && key.startsWith('receipt:') && value.phase === 'committed') {
      fail = false;
      throw new Error('Simulated interruption after expense write');
    }
    return put(key, value);
  };
  edit(state, draft.sheet, `B${draft.first + 12}`, true);
  assert.equal(state.app.buildLedger_().expenses.length, 1);
  assert.equal(draft.sheet.cell(draft.first + 5, 2), 100, 'Unacknowledged draft survives');
  edit(state, draft.sheet, `B${draft.first + 12}`, true);
  assert.equal(state.app.buildLedger_().expenses.length, 1);
  assert.match(draft.sheet.cell(draft.first + 22, 2), /Expense saved/);
});

it('keeps expense success distinct from checkpoint failure and backup retries', () => {
  const state = tracker();
  const draft = fillDraft(state);
  const create = state.app.createRecoveryVersion_;
  state.app.createRecoveryVersion_ = () => { throw new Error('Simulated checkpoint quota'); };
  edit(state, draft.sheet, `B${draft.first + 12}`, true);
  assert.match(draft.sheet.cell(draft.first + 22, 2), /Expense saved/);
  assert.match(draft.sheet.cell(draft.first + 14, 2), /Recovery checkpoint failed/);
  state.app.createRecoveryVersion_ = create;
  edit(state, state.spreadsheet.getSheetByName('Dashboard'), 'B15', true);
  assert.equal(state.app.buildLedger_().expenses.length, 1);
});

it('allows explicit identical repeat expenses while ignoring delayed delivery after acknowledgement', () => {
  const state = tracker();
  const draft = fillDraft(state);
  edit(state, draft.sheet, `B${draft.first + 12}`, true);
  state.app.onAuthorizedEdit({ range: draft.sheet.getRange(draft.first + 12, 2), authMode: 'FULL' });
  assert.equal(state.app.buildLedger_().expenses.length, 1);
  draft.sheet.getRange(draft.first + 5, 2).setValue(100);
  edit(state, draft.sheet, `B${draft.first + 12}`, true);
  assert.equal(state.app.buildLedger_().expenses.length, 2);
  assert.equal(state.app.buildLedger_().duplicateCount, 2);
});

it('leaves ambiguous pre-write interruptions pending rather than blindly appending on retry', () => {
  const state = tracker();
  const draft = fillDraft(state);
  const getRange = state.sheet.getRange;
  let fail = true;
  state.sheet.getRange = (...args) => {
    const range = getRange(...args);
    if (args[0] === 2 && args[1] === 1 && args[2] === 1 && args[3] === 8) {
      const setValues = range.setValues;
      range.setValues = values => {
        if (fail) { fail = false; throw new Error('Simulated termination before row write'); }
        return setValues(values);
      };
    }
    return range;
  };
  edit(state, draft.sheet, `B${draft.first + 12}`, true);
  edit(state, draft.sheet, `B${draft.first + 12}`, true);
  assert.equal(state.app.buildLedger_().expenses.length, 0);
  assert.match(draft.sheet.cell(draft.first + 22, 2), /uncertain/);
  assert.equal(draft.sheet.cell(draft.first + 5, 2), 100);
  const history = state.spreadsheet.getSheetByName('History');
  history.getRange('B38').setValue(1);
  state.app.inspectWorkbookSubmission_();
  state.app.cancelWorkbookSubmission_();
  assert.equal(state.app.buildLedger_().expenses.length, 0);
  assert.match(draft.sheet.cell(draft.first + 22, 2), /cancelled/);
  edit(state, draft.sheet, `B${draft.first + 12}`, true);
  assert.equal(state.app.buildLedger_().expenses.length, 1);
});

it('preserves invalid setup in raw recovery and restores it as an unconfirmed draft', () => {
  const state = tracker({ expenses: [getMockExpense()] });
  state.setup.getRange('B3').setValue(99);
  state.setup.getRange('E4').setValue('Not/A_Timezone');
  const version = state.app.createRecoveryVersion_('Invalid draft');
  state.setup.getRange('B3').setValue(2);
  state.setup.getRange('E4').setValue('Asia/Kolkata');
  const history = state.spreadsheet.getSheetByName('History');
  history.getRange('B2').setValue(version.id);
  state.app.previewWorkbookVersion_();
  state.app.restoreWorkbookPreview_();
  assert.equal(state.setup.cell(3, 2), 99);
  assert.equal(state.setup.cell(4, 5), 'Not/A_Timezone');
  assert.equal(state.setup.cell(6, 2), false);
  assert.equal(state.app.confirmWorkbookV3_(), false);
});

it('recovers a partial replacement and removes only its own maintenance protections', () => {
  const state = tracker({ expenses: [getMockExpense({ amount: 87 })] });
  const existing = state.sheet.getRange('B2').protect().setDescription('Existing user protection');
  const before = state.app.captureWorkbookRaw_();
  const target = plain(before);
  target.expenses[0][2] = 900;
  const write = state.app.writeWorkbookRaw_;
  let fail = true;
  state.app.writeWorkbookRaw_ = raw => {
    if (fail) {
      fail = false;
      state.sheet.getRange('C2').setValue(900);
      throw new Error('Simulated partial replacement');
    }
    return write(raw);
  };
  assert.throws(() => state.app.replaceWorkbook_('test interruption', target), /partial replacement/);
  assert.equal(state.app.workbookGet_('operation').phase, 'writing');
  assert.throws(() => state.app.confirmWorkbookV3_(), /interrupted/);
  assert.equal(state.app.recoverWorkbookOperation(), true);
  assert.equal(state.sheet.cell(2, 3), 87);
  assert.ok(state.sheet.getProtections().includes(existing));
  assert.ok(!state.sheet.getProtections().some(p => p.getDescription().startsWith('Workbook maintenance ')));
  assert.equal(state.app.workbookGet_('operation').phase, 'aborted');
});

it('rejects damaged recovery chunks, changing source selections, and checkpoint failures before replacement', () => {
  const state = tracker({ expenses: [getMockExpense()] });
  const version = state.app.createRecoveryVersion_('Corruption target');
  const history = state.spreadsheet.getSheetByName('History');
  history.getRange('B2').setValue(version.id);
  state.app.previewWorkbookVersion_();
  history.getRange('B2').setValue('another-version');
  assert.throws(() => state.app.restoreWorkbookPreview_(), /selection/);
  const store = state.spreadsheet.getSheetByName('_Tracker State');
  const row = state.app.workbookStateRows_(`version:${version.id}`)[0];
  store.getRange(row, 5).setValue('JSON:corrupt');
  assert.throws(() => state.app.workbookGet_(`version:${version.id}`), /checksum/);
  const target = state.app.captureWorkbookRaw_();
  target.expenses[0][2] = 42;
  state.app.createRecoveryVersion_ = () => { throw new Error('Storage full'); };
  assert.throws(() => state.app.replaceWorkbook_('blocked', target), /Storage full/);
  assert.equal(state.sheet.cell(2, 3), 100);
});

it('repairs stale automation flags, ignores simple events, and reconciles pending mobile requests', () => {
  const state = tracker();
  state.triggers.length = 0;
  const draft = fillDraft(state);
  draft.sheet.getRange(draft.first + 12, 2).setValue(true);
  state.app.onEdit({ range: draft.sheet.getRange(draft.first + 12, 2), authMode: 'LIMITED' });
  assert.equal(state.app.buildLedger_().expenses.length, 0);
  state.app.installWorkbookAutomation();
  state.app.installWorkbookAutomation();
  assert.equal(state.triggers.length, 1);
  assert.equal(state.app.buildLedger_().expenses.length, 1);
});

it('preserves a draft bound to the old trip after New Trip', () => {
  const state = tracker();
  const draft = fillDraft(state);
  assert.equal(state.app.newTrip(), true);
  assert.equal(draft.sheet.cell(draft.first + 5, 2), 100);
  assert.equal(edit(state, draft.sheet, `B${draft.first + 12}`, true), false);
  assert.match(draft.sheet.cell(draft.first + 22, 2), /another trip/);
});

it('keeps an invalid prior trip discoverable in History even when no valid Records archive can be saved', () => {
  const state = tracker();
  state.setup.getRange('B3').setValue(99);
  const previousId = state.app.workbookTripId_();
  assert.equal(state.app.newTrip(), true);
  const directory = state.app.workbookGet_('history-directory');
  const entry = directory.find(item => item.id === previousId);
  assert.ok(entry);
  const history = state.spreadsheet.getSheetByName('History');
  edit(state, history, 'B3', `${entry.name} [${entry.id}]`);
  assert.equal(history.cell(16, 4), previousId);
  assert.ok(history.cell(16, 1));
});

it('handles 15 participants and 500 expenses, retaining a rejected full-capacity draft', () => {
  const expenses = Array.from({ length: 500 }, (_, index) => getMockExpense({
    description: `Expense ${index}`, amount: (index + 1) / 100
  }));
  const state = tracker({ roster: getMockRoster(15), expenses });
  assert.equal(state.sheet.cell(1, 23), 'Person 15');
  const ledger = state.app.buildLedger_();
  assert.equal(ledger.expenses.length, 500);
  assert.equal([...ledger.balances.values()].reduce((sum, value) => sum + value, 0), 0);
  const draft = fillDraft(state);
  assert.equal(edit(state, draft.sheet, `B${draft.first + 12}`, true), false);
  assert.equal(draft.sheet.cell(draft.first + 5, 2), 100);
  assert.match(draft.sheet.cell(draft.first + 22, 2), /500/);
});

it('serializes separate execution contexts and safely retries a request that met lock contention', () => {
  const state = tracker();
  const first = fillDraft(state, 1);
  const second = fillDraft(state, 2, { 1: 'Train', 2: 55, 3: 'Bob' });
  const other = loadAppsScript();
  for (const boundary of ['SpreadsheetApp', 'PropertiesService', 'LockService', 'Utilities', 'Session']) {
    other.app[boundary] = state.app[boundary];
  }
  second.sheet.getRange(second.first + 12, 2).setValue(true);
  const getRange = state.sheet.getRange;
  let interleaved = false;
  state.sheet.getRange = (...args) => {
    const range = getRange(...args);
    if (args[0] === 2 && args[1] === 1 && args[2] === 1 && args[3] === 8) {
      const setValues = range.setValues;
      range.setValues = values => {
        if (!interleaved) {
          interleaved = true;
          assert.equal(other.app.onAuthorizedEdit({ range: second.sheet.getRange(second.first + 12, 2), authMode: 'FULL' }), false);
        }
        return setValues(values);
      };
    }
    return range;
  };
  edit(state, first.sheet, `B${first.first + 12}`, true);
  assert.equal(interleaved, true);
  assert.equal(second.sheet.cell(second.first + 12, 2), true, 'Contended request remains visibly pending');
  edit(state, state.spreadsheet.getSheetByName('Dashboard'), 'B15', true);
  assert.equal(state.app.buildLedger_().expenses.length, 2);
  assert.equal(state.app.buildLedger_().totalMinor, 15500);
  assert.equal(state.lockStats.held, false);
  assert.equal(state.lockStats.waits, state.lockStats.releases);
});

for (const phase of ['prepared', 'restricted', 'checkpointed', 'writing', 'verifying', 'cleanup']) {
  it(`recovers interruption after persisted maintenance phase ${phase}`, () => {
    const state = tracker({ expenses: [getMockExpense({ amount: 87 })] });
    const existing = state.sheet.getRange('B2').protect().setDescription('Keep original permission');
    const target = plain(state.app.captureWorkbookRaw_());
    target.expenses[0][2] = 42;
    const put = state.app.workbookPut_;
    let interrupted = false;
    state.app.workbookPut_ = (key, value) => {
      const result = put(key, value);
      if (!interrupted && key === 'operation' && value.phase === phase) {
        interrupted = true;
        throw new Error(`Interruption at ${phase}`);
      }
      return result;
    };
    assert.throws(() => state.app.replaceWorkbook_('phase test', target), /Interruption/);
    const operation = state.app.workbookGet_('operation');
    if (!['complete', 'aborted'].includes(operation.phase)) assert.equal(state.app.recoverWorkbookOperation(), true);
    assert.equal(state.sheet.cell(2, 3), ['verifying', 'cleanup'].includes(phase) ? 42 : 87);
    assert.ok(state.sheet.getProtections().includes(existing));
    assert.ok(!state.sheet.getProtections().some(p => p.getDescription().startsWith('Workbook maintenance ')));
  });
}

it('preserves the old committed state if a new chunk candidate cannot be verified', () => {
  const state = tracker();
  state.app.workbookPut_('test-key', { value: 'original' });
  const store = state.spreadsheet.getSheetByName('_Tracker State');
  const getRange = store.getRange;
  store.getRange = (...args) => {
    const range = getRange(...args);
    if (args[1] === 5) range.getValues = () => [['JSON:damaged candidate']];
    return range;
  };
  assert.throws(() => state.app.workbookPut_('test-key', { value: 'replacement' }), /verification failed/);
  store.getRange = getRange;
  assert.equal(state.app.workbookGet_('test-key').value, 'original');
});

it('fails closed when maintenance restrictions or workbook capacity cannot be established', () => {
  const state = tracker({ expenses: [getMockExpense()] });
  const target = plain(state.app.captureWorkbookRaw_());
  target.expenses[0][2] = 42;
  state.app.workbookRestrictMaintenance_ = () => { throw new Error('Group restriction failed'); };
  assert.throws(() => state.app.replaceWorkbook_('protection failure', target), /Group restriction/);
  assert.equal(state.sheet.cell(2, 3), 100);
  const sheet = state.spreadsheet.getSheetByName('_Tracker State');
  const getMaxRows = sheet.getMaxRows;
  sheet.getMaxRows = () => 20000000;
  assert.throws(() => state.app.workbookFit_(sheet, 20000000, 30), /capacity/);
  sheet.getMaxRows = getMaxRows;
  assert.equal(state.sheet.cell(2, 3), 100);
});

it('blocks classic dispatch after a partial header write and recovers through the mobile maintenance control', () => {
  const state = tracker({ expenses: [getMockExpense()] });
  state.sheet.getRange('G2').setValue('Food');
  const id = state.sheet.cell(2, 8);
  const target = plain(state.app.captureWorkbookRaw_());
  state.app.writeWorkbookRaw_ = () => {
    state.sheet.getRange('G1').clearContent();
    throw new Error('Interrupted header write');
  };
  assert.throws(() => state.app.replaceWorkbook_('header interruption', target), /Interrupted header/);
  const fresh = loadAppsScript();
  for (const boundary of ['SpreadsheetApp', 'PropertiesService', 'LockService', 'Utilities', 'Session']) {
    fresh.app[boundary] = state.app[boundary];
  }
  assert.equal(fresh.app.workbookV3_(), false);
  assert.equal(fresh.app.onAuthorizedEdit({ range: state.sheet.getRange('A2'), authMode: 'FULL' }), false);
  assert.equal(state.sheet.cell(2, 7), 'Food');
  assert.equal(state.sheet.cell(2, 8), id);
  const history = state.spreadsheet.getSheetByName('History');
  history.getRange('B10').setValue(true);
  fresh.app.onAuthorizedEdit({ range: history.getRange('B10'), authMode: 'FULL' });
  assert.equal(fresh.app.workbookV3_(), true);
  assert.equal(state.sheet.cell(2, 7), 'Food');
  assert.equal(state.sheet.cell(2, 8), id);
  assert.equal(fresh.app.workbookPendingOperation_(), false);
});

it('rejects version 3 imports with duplicate IDs before changing active inputs', () => {
  const state = tracker({ expenses: [getMockExpense()] });
  const trip = plain(state.app.captureTrip_());
  trip.expenses.push([...trip.expenses[0]]);
  assert.throws(() => state.app.importTripJson(JSON.stringify(trip)), /unique/);
  assert.equal(state.app.buildLedger_().expenses.length, 1);
});

it('repairs a conservative maintenance flag left before an operation journal could be committed', () => {
  const state = tracker();
  state.properties.set('WORKBOOK_OPERATION_PHASE', 'prepared');
  assert.throws(() => state.app.recalculateAll(), /interrupted/);
  assert.equal(state.app.recoverWorkbookOperation(), true);
  assert.equal(state.app.workbookPendingOperation_(), false);
});

it('preserves long Unicode descriptions and 500-row recovery payloads across verified chunks', () => {
  const description = '🚕'.repeat(22500);
  const expenses = Array.from({ length: 500 }, (_, index) => getMockExpense({
    description: index === 0 ? description : `Row ${index} ${'x'.repeat(300)}`
  }));
  const state = tracker({ expenses });
  const version = state.app.createRecoveryVersion_('Large text');
  const stored = state.app.workbookGet_(`version:${version.id}`);
  assert.equal(stored.raw.expenses[0][1], description);
  assert.equal(stored.raw.expenses.length, 500);
  const store = state.spreadsheet.getSheetByName('_Tracker State');
  const row = state.app.workbookStateRows_(`version:${version.id}`)[0];
  const parts = store.cell(row, 4);
  assert.ok(parts > 1);
  for (let index = 0; index < parts; index++) {
    const part = store.cell(row, index + 5);
    assert.ok(part.length <= 40005);
    assert.ok(!/[\uD800-\uDBFF]$/.test(part));
  }
});
