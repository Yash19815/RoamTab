const assert = require('node:assert/strict');
const { it } = require('node:test');
const { loadAppsScript, getMockRoster, getMockExpense, plain } = require('./helpers/apps-script.cjs');

function tracker(options) {
  const state = loadAppsScript(options);
  state.setup.getRange('B2').setValue('First trip');
  return state;
}

function selectRecord(state, row = 2) {
  const records = state.spreadsheet.getSheetByName('Records');
  state.spreadsheet.setActiveSheet(records);
  records.getActiveRange = () => records.getRange(row, 1);
  return records;
}

it('adds Records, E6, and archive menu actions without resetting an existing tracker', () => {
  const state = tracker({ expenses: [getMockExpense()] });
  const { app, setup, sheet, spreadsheet, menuItems } = state;
  app.onOpen();
  assert.equal(setup.cell(2, 2), 'First trip');
  assert.equal(sheet.cell(2, 3), 100);
  assert.equal(setup.cell(6, 4), 'Save Trip');
  assert.equal(setup.cell(6, 5), false);
  assert.equal(spreadsheet.getSheetByName('Records').cell(1, 6), 'Trip JSON (part 1)');
  for (const action of ['saveTrip', 'loadSelectedTrip', 'downloadSelectedTrip', 'showImportTrip', 'deleteSelectedTrip', 'newTrip']) {
    assert.ok(menuItems.some(item => item[1] === action), action);
  }
});

it('saves all raw input rows, real dates, confirmation, and dormant roster entries', () => {
  const state = tracker({ roster: getMockRoster(2), expenses: [
    getMockExpense({ date: new Date('2026-11-05T18:30:00.000Z'), amount: 10.01 }),
    ['', '', '', '', ''],
    ['', 'Draft without payer or amount', '', '', 'Bob']
  ] });
  const { app, setup } = state;
  setup.getRange(23, 2, 1, 2).setValues([['Dormant person', 'later@example.test']]);
  setup.getRange('B6').setValue(true);
  assert.equal(app.saveTrip(), true);
  const records = selectRecord(state);
  const trip = app.readTripRecord_(records, 2).trip;
  assert.equal(trip.setup.confirmed, true);
  assert.equal(trip.setup.roster.length, 15);
  assert.deepEqual(plain(trip.setup.roster[14]), ['', 'Dormant person', 'later@example.test']);
  assert.equal(trip.expenses.length, 3);
  assert.equal(trip.expenses[0][0].value, '2026-11-05T18:30:00.000Z');
  assert.equal(trip.expenses[2][1], 'Draft without payer or amount');
  assert.equal(records.cell(2, 4), 2);
  assert.equal(setup.cell(3, 5), trip.id);
});

it('updates one archive when saving the same trip again and clears obsolete JSON parts', () => {
  const state = tracker({ expenses: [getMockExpense({ description: 'x'.repeat(45000) })] });
  const { app, sheet } = state;
  app.saveTrip();
  const records = state.spreadsheet.getSheetByName('Records');
  assert.equal(records.cell(2, 5), 2);
  assert.ok(records.cell(2, 7).startsWith('JSON:'));
  sheet.getRange('B2').setValue('Short');
  app.saveTrip();
  assert.equal(records.getLastRow(), 2);
  assert.equal(records.cell(2, 5), 1);
  assert.equal(records.cell(2, 7), '');
  assert.equal(app.readTripRecord_(records, 2).trip.expenses[0][1], 'Short');
});

it('accepts participant counts stored as dropdown text and numeric trip names', () => {
  const { app, setup } = tracker();
  setup.getRange('B2').setValue(2026);
  setup.getRange('B3').setValue('3');
  assert.equal(app.saveTrip(), true);
  assert.equal(app.captureTrip_().setup.tripName, '2026');
  assert.equal(app.captureTrip_().setup.participantCount, 3);
});

it('round-trips 15 people and all 500 expenses across JSON parts with exact balances', () => {
  const expenses = Array.from({ length: 500 }, (_, i) => getMockExpense({
    description: `Row ${i + 1}: ${'🚕'.repeat(120)}`, amount: (i + 1) / 100,
    split: i % 2 ? 'Bob, Cara' : 'All'
  }));
  const state = tracker({ roster: getMockRoster(15), expenses });
  const { app, sheet, setup } = state;
  setup.getRange('B6').setValue(true);
  const before = plain(app.captureTrip_());
  const balances = plain([...app.buildLedger_().balances]);
  assert.equal(app.saveTrip(), true);
  const records = selectRecord(state);
  assert.ok(records.cell(2, 5) > 1);
  for (let col = 6; col < 6 + records.cell(2, 5); col++) {
    const part = records.cell(2, col);
    assert.ok(part.length <= 40005);
    assert.ok(!/[\uD800-\uDBFF]$/.test(part), 'JSON parts never split an emoji surrogate pair');
  }
  assert.equal(app.newTrip(), true);
  selectRecord(state);
  assert.equal(app.loadSelectedTrip(), true);
  assert.deepEqual(plain(app.captureTrip_().expenses), before.expenses);
  assert.deepEqual(plain(app.captureTrip_().setup), before.setup);
  assert.deepEqual(plain([...app.buildLedger_().balances]), balances);
  assert.equal(sheet.cell(501, 3), 5);
});

for (const invalid of [false, true]) {
  it(`resets Save Trip checkbox after ${invalid ? 'failed' : 'successful'} save without changing confirmation`, () => {
    const { app, setup, spreadsheet } = tracker();
    setup.getRange('B6').setValue(true);
    if (invalid) setup.getRange('B3').setValue(99);
    setup.getRange('E6').setValue(true);
    app.onEdit({ range: setup.getRange('E6') });
    assert.equal(setup.cell(6, 5), false);
    assert.equal(setup.cell(6, 2), true);
    assert.equal(!!spreadsheet.getSheetByName('Records'), !invalid);
  });
}

it('New Trip archives current inputs, preserves Records, and starts with blank names and expenses', () => {
  const state = tracker({ expenses: [getMockExpense()] });
  const { app, setup, sheet, reports, spreadsheet } = state;
  assert.equal(app.newTrip(), true);
  assert.equal(setup.cell(2, 2), '');
  assert.equal(setup.cell(3, 2), 2);
  assert.equal(setup.cell(3, 5), '');
  assert.equal(setup.cell(6, 2), false);
  assert.equal(setup.cell(6, 5), false);
  assert.ok(setup.getRange(9, 2, 15, 2).getValues().flat().every(value => value === ''));
  assert.ok(sheet.getRange(2, 1, 500, 5).getValues().flat().every(value => value === ''));
  assert.equal(reports.cell(2, 11), '');
  const records = spreadsheet.getSheetByName('Records');
  assert.equal(app.readTripRecord_(records, 2).trip.expenses[0][2], 100);
  assert.equal(spreadsheet.getActiveSheet(), setup);
  app.newTrip();
  assert.equal(records.getLastRow(), 2, 'An untouched blank canvas does not create empty archives');
});

it('cancelling New Trip leaves current inputs and archives untouched', () => {
  const { app, ui, sheet, spreadsheet } = tracker({ expenses: [getMockExpense()] });
  ui.answer = 'NO';
  app.newTrip();
  assert.equal(sheet.cell(2, 3), 100);
  assert.equal(spreadsheet.getSheetByName('Records'), null);
});

it('an archive failure stops New Trip before inputs can be cleared', () => {
  const { app, setup, sheet } = tracker({ expenses: [getMockExpense()] });
  setup.getRange('E3').setValue('invalid/id');
  assert.equal(app.newTrip(), false);
  assert.equal(setup.cell(2, 2), 'First trip');
  assert.equal(sheet.cell(2, 3), 100);
});

it('loading a different trip saves current inputs before restoring names, dates, and reports', () => {
  const state = tracker({ expenses: [getMockExpense({ date: new Date('2026-11-05T18:30:00Z') })] });
  const { app, setup, sheet, reports } = state;
  setup.getRange('B6').setValue(true);
  app.saveTrip();
  const originalId = setup.cell(3, 5);
  app.newTrip();
  setup.getRange('B2').setValue('Second trip');
  setup.getRange(9, 2, 2, 1).setValues([['Dev'], ['Eve']]);
  sheet.getRange(2, 1, 1, 5).setValues([['', 'Other expense', 50, 'Eve', 'All']]);
  const records = selectRecord(state);
  assert.equal(app.loadSelectedTrip(), true);
  assert.equal(records.getLastRow(), 3);
  assert.equal(app.readTripRecord_(records, 3).trip.setup.tripName, 'Second trip');
  assert.equal(setup.cell(2, 2), 'First trip');
  assert.equal(setup.cell(3, 5), originalId);
  assert.equal(sheet.cell(2, 1).toISOString(), '2026-11-05T18:30:00.000Z');
  assert.equal(reports.cell(2, 11), 100);
  assert.equal(reports.cell(1, 1), 'PERSONAL BALANCES SUMMARY');
});

it('invalid or damaged archive JSON never replaces current inputs', () => {
  const state = tracker({ expenses: [getMockExpense()] });
  const { app, sheet } = state;
  app.saveTrip();
  const records = selectRecord(state);
  records.getRange(2, 6).setValue('JSON:{broken');
  sheet.getRange('B2').setValue('Current unsaved draft');
  assert.equal(app.loadSelectedTrip(), false);
  assert.equal(sheet.cell(2, 2), 'Current unsaved draft');
});

it('delete requires confirmation and affects only the selected archive', () => {
  const state = tracker({ expenses: [getMockExpense()] });
  const { app, setup, sheet, ui } = state;
  app.saveTrip();
  const records = selectRecord(state);
  ui.answer = 'NO';
  app.deleteSelectedTrip();
  assert.equal(records.getLastRow(), 2);
  ui.answer = 'YES';
  assert.equal(app.deleteSelectedTrip(), true);
  assert.equal(records.getLastRow(), 1);
  assert.equal(setup.cell(3, 5), '');
  assert.equal(sheet.cell(2, 3), 100);
});

it('delete re-finds the selected ID if another row is inserted while the confirmation is open', () => {
  const state = tracker();
  const { app, ui } = state;
  app.saveTrip();
  const records = selectRecord(state);
  const selectedId = records.cell(2, 1);
  const alert = ui.alert;
  ui.alert = (...args) => {
    if (args.length === 3) {
      const row = records.getRange(2, 1, 1, 6).getValues();
      records.getRange(3, 1, 1, 6).setValues(row);
      records.getRange(2, 1, 1, 6).setValues([['other-trip', 'Other', '', 0, 0, '']]);
    }
    return alert(...args);
  };
  assert.equal(app.deleteSelectedTrip(), true);
  assert.equal(records.cell(2, 1), 'other-trip');
  assert.notEqual(records.cell(2, 1), selectedId);
});

it('import gives JSON a new identity, archives current work, and rebuilds live balances', () => {
  const state = tracker({ expenses: [getMockExpense({ amount: 10.01 })] });
  const { app, setup, sheet, reports, spreadsheet } = state;
  app.saveTrip();
  const json = JSON.stringify(app.captureTrip_());
  const existingId = setup.cell(3, 5);
  sheet.getRange('C2').setValue(99);
  assert.match(app.importTripJson(json), /imported and loaded/);
  assert.notEqual(setup.cell(3, 5), existingId);
  const records = spreadsheet.getSheetByName('Records');
  assert.equal(app.readTripRecord_(records, 2).trip.expenses[0][2], 99);
  assert.equal(app.readTripRecord_(records, 3).trip.expenses[0][2], 10.01);
  assert.equal(reports.cell(2, 11), 10.01);
});

for (const [label, mutate] of [
  ['version', trip => { trip.schemaVersion = 99; }],
  ['participant count', trip => { trip.setup.participantCount = 16; }],
  ['row limit', trip => { trip.expenses = Array(501).fill(['', '', '', '', '']); }],
  ['row width', trip => { trip.expenses = [['short row']]; }],
  ['date', trip => { trip.expenses = [[{ type: 'date', value: 'invalid' }, '', '', '', '']]; }],
  ['object cell', trip => { trip.expenses = [[{}, '', '', '', '']]; }],
  ['null cell', trip => { trip.expenses = [[null, '', '', '', '']]; }],
  ['roster', trip => { trip.setup.roster.pop(); }],
  ['timezone', trip => { trip.timeZone = 'Etc/UTC'; }]
]) {
  it(`rejects invalid import ${label} before saving or clearing current data`, () => {
    const { app, setup, sheet, spreadsheet } = tracker({ expenses: [getMockExpense()] });
    const trip = plain(app.captureTrip_());
    mutate(trip);
    assert.throws(() => app.importTripJson(JSON.stringify(trip)));
    assert.equal(setup.cell(2, 2), 'First trip');
    assert.equal(sheet.cell(2, 3), 100);
    assert.equal(spreadsheet.getSheetByName('Records'), null);
  });
}

it('restores formula-like text as literal data in inputs, headers, and reports', () => {
  const { app, setup, sheet, reports } = tracker({ roster: getMockRoster(2) });
  const trip = plain(app.captureTrip_());
  trip.setup.tripName = '=1+1';
  trip.setup.roster[0][1] = '=1+2';
  trip.setup.roster[0][2] = '=1+3';
  trip.setup.confirmed = true;
  trip.expenses = [['', '=1+4', 10, '=1+2', 'All'], ['', "'literal", '', '', '']];
  app.importTripJson(JSON.stringify(trip));
  assert.equal(setup.cell(2, 2), '=1+1');
  assert.equal(sheet.cell(2, 2), '=1+4');
  assert.equal(sheet.cell(3, 2), "'literal");
  assert.equal(sheet.cell(1, 6), '=1+2');
  assert.equal(reports.cell(4, 8), '=1+2');
  assert.equal(reports.cell(3, 1), '=1+2');
  assert.equal(app.literalSheetCell_('=1+2'), "'=1+2");
});

it('initialization preserves archives and clears the active trip identity', () => {
  const state = tracker();
  state.app.saveTrip();
  const records = state.spreadsheet.getSheetByName('Records');
  state.app.setup();
  assert.equal(records.getLastRow(), 2);
  assert.equal(state.setup.cell(3, 5), '');
});

it('archive action releases its document lock even when an operation fails', () => {
  const { app } = tracker();
  let released = 0;
  let flushed = 0;
  app.LockService.getDocumentLock = () => ({ waitLock() {}, releaseLock() { released++; } });
  app.SpreadsheetApp.flush = () => { flushed++; };
  assert.throws(() => app.withTripLock_(() => { throw new Error('write failed'); }), /write failed/);
  assert.equal(released, 1);
  assert.equal(flushed, 1);
});

it('download escapes script-closing text before passing saved JSON to the HTML template', () => {
  const state = tracker({ expenses: [getMockExpense({ description: '</script><script>alert(1)</script>' })] });
  const { app, ui } = state;
  app.saveTrip();
  selectRecord(state);
  let template;
  app.HtmlService = {
    createTemplateFromFile(name) {
      assert.equal(name, 'TripJson');
      template = { evaluate: () => ({ setWidth() { return this; }, setHeight() { return this; } }) };
      return template;
    }
  };
  ui.showModalDialog = () => {};
  app.downloadSelectedTrip();
  assert.ok(!template.tripJsonLiteral.includes('</script>'));
  const trip = JSON.parse(JSON.parse(template.tripJsonLiteral));
  assert.equal(trip.expenses[0][1], '</script><script>alert(1)</script>');
});
