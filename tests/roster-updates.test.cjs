const assert = require('node:assert/strict');
const { it } = require('node:test');
const { loadAppsScript, getMockRoster, getMockExpense, plain } = require('./helpers/apps-script.cjs');

it('retains names and emails outside the active roster when the count shrinks', () => {
  const { app, setup } = loadAppsScript({ roster: getMockRoster(4) });
  setup.getRange(12, 3).setValue('four@example.test');
  setup.getRange('B3').setValue(2);
  app.adjustRosterRows();
  assert.equal(setup.cell(12, 2), 'Person 4');
  assert.equal(setup.cell(12, 3), 'four@example.test');
  setup.getRange('B3').setValue(4);
  app.adjustRosterRows();
  assert.equal(app.getRoster().length, 4);
});

it('grows the count when names are pasted below the current roster', () => {
  const { app, setup, sheet } = loadAppsScript({ roster: getMockRoster(2) });
  setup.getRange('B2').setValue('Trip');
  setup.getRange(11, 2, 2, 2).setValues([['Cara', 'cara@example.test'], ['Dev', 'dev@example.test']]);
  app.onEdit({ range: setup.getRange(11, 2, 2, 2) });
  assert.equal(setup.cell(3, 2), 4);
  app.confirmSetupFromMenu();
  assert.equal(setup.cell(12, 2), 'Dev');
  assert.equal(setup.cell(12, 3), 'dev@example.test');
  assert.equal(sheet.cell(1, 9), 'Dev');
});

for (const trigger of ['menu', 'B6', 'B7']) {
  it(`updates headers, preserves input, and builds reports through ${trigger}`, () => {
    const { app, setup, sheet, reports } = loadAppsScript({
      roster: getMockRoster(2), expenses: [getMockExpense({ amount: 100 })]
    });
    setup.getRange('B2').setValue('Trip');
    setup.getRange('B3').setValue(3);
    setup.getRange(11, 2, 1, 2).setValues([['Cara', 'cara@example.test']]);
    const inputs = plain(sheet.getRange(2, 1, 1, 5).getValues());
    if (trigger === 'menu') app.confirmSetupFromMenu();
    else {
      setup.getRange(trigger).setValue(true);
      app.onEdit({ range: setup.getRange(trigger) });
    }
    assert.equal(setup.cell(6, 2), true);
    assert.equal(setup.cell(7, 2), false);
    assert.equal(sheet.cell(1, 8), 'Cara');
    assert.deepEqual(plain(sheet.getRange(2, 1, 1, 5).getValues()), inputs);
    assert.equal(reports.cell(1, 1), 'PERSONAL BALANCES SUMMARY');
    assert.equal(reports.cell(1, 8), 'LIVE SUMMARY');
    assert.equal(reports.cell(2, 11), 100);
  });
}

it('keeps the live summary in Send Reports while unconfirmed and clears legacy Expenses summary', () => {
  const { app, sheet, reports } = loadAppsScript({ expenses: [getMockExpense({ amount: 90 })] });
  sheet.getRange(1, 10).setValue('LIVE SUMMARY');
  app.updateExpensesStructure();
  app.recalculateAll();
  assert.equal(sheet.cell(1, 10), '');
  assert.equal(reports.cell(1, 8), 'LIVE SUMMARY');
  assert.equal(reports.cell(2, 11), 90);
  assert.match(reports.cell(1, 1), /not confirmed/);
});

it('shrinks and regrows participant columns without losing dormant names or expense data', () => {
  const { app, setup, sheet } = loadAppsScript({ roster: getMockRoster(15), expenses: [getMockExpense()] });
  setup.getRange('B2').setValue('Trip');
  app.confirmSetupFromMenu();
  assert.equal(sheet.cell(1, 20), 'Person 15');
  setup.getRange('B3').setValue(2);
  app.onEdit({ range: setup.getRange('B3') });
  assert.equal(sheet.cell(1, 20), '');
  assert.equal(setup.cell(23, 2), 'Person 15');
  assert.equal(setup.cell(6, 2), false);
  setup.getRange('B3').setValue(15);
  app.confirmSetupFromMenu();
  assert.equal(sheet.cell(1, 20), 'Person 15');
  assert.equal(sheet.cell(2, 3), 100);
});

it('clears stale summary when all participant names are removed', () => {
  const { app, setup, reports } = loadAppsScript({ expenses: [getMockExpense()] });
  app.recalculateAll();
  setup.getRange(9, 2, 3, 1).clearContent();
  app.onEdit({ range: setup.getRange(9, 2, 3, 1) });
  assert.equal(reports.cell(2, 11), '');
  assert.match(reports.cell(1, 1), /Complete Setup/);
});
