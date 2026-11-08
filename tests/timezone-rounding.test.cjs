const assert = require('node:assert/strict');
const { it } = require('node:test');
const {
  loadAppsScript, getMockRoster, getMockExpense, getMockLedger,
  assertSettles, plain, getSeededRandom
} = require('./helpers/apps-script.cjs');

it('adds timezone selection without replacing the spreadsheet timezone or inputs', () => {
  const { app, setup, sheet, spreadsheet } = loadAppsScript({ expenses: [getMockExpense()] });
  spreadsheet.setSpreadsheetTimeZone('America/New_York');
  app.onOpen();
  assert.equal(setup.cell(4, 4), 'Timezone');
  assert.equal(setup.cell(4, 5), 'America/New_York');
  assert.equal(sheet.cell(2, 3), 100);
  app.setup();
  assert.equal(setup.cell(4, 5), 'America/New_York');
});

it('preserves winter and summer calendar dates when changing timezone through the real edit handler', () => {
  const { app, setup, sheet, spreadsheet } = loadAppsScript({ expenses: [
    getMockExpense({ date: new Date('2026-01-08T18:30:00Z') }),
    getMockExpense({ date: new Date('2026-07-08T18:30:00Z') }),
    getMockExpense({ date: '2026-01-10' }),
    getMockExpense({ date: '' })
  ] });
  setup.getRange('B6').setValue(true);
  setup.getRange('E4').setValue('America/New_York');
  app.onEdit({ range: setup.getRange('E4') });
  assert.equal(spreadsheet.getSpreadsheetTimeZone(), 'America/New_York');
  assert.equal(sheet.cell(2, 1).toISOString(), '2026-01-09T05:00:00.000Z');
  assert.equal(sheet.cell(3, 1).toISOString(), '2026-07-09T04:00:00.000Z');
  assert.equal(sheet.cell(4, 1), '2026-01-10');
  assert.equal(sheet.cell(5, 1), '');
  assert.equal(setup.cell(6, 2), false);
  assert.equal(app.fxDate_(sheet.cell(2, 1), spreadsheet.getSpreadsheetTimeZone()), '2026-01-09');
  assert.equal(app.captureTrip_().timeZone, 'America/New_York');
});

it('accepts a supported timezone outside the suggested dropdown list', () => {
  const { app, setup, spreadsheet } = loadAppsScript();
  setup.getRange('E4').setValue('America/Argentina/Buenos_Aires');
  assert.equal(app.applySelectedTimezone_(), true);
  assert.equal(spreadsheet.getSpreadsheetTimeZone(), 'America/Argentina/Buenos_Aires');
});

for (const selected of ['', 'Mars/Olympus_Mons']) {
  it(`rejects invalid timezone ${JSON.stringify(selected)} without changing dates or confirmation`, () => {
    const date = new Date('2026-01-08T18:30:00Z');
    const { app, setup, sheet, spreadsheet, alerts } = loadAppsScript({ expenses: [getMockExpense({ date })] });
    setup.getRange('B6').setValue(true);
    setup.getRange('E4').setValue(selected);
    assert.equal(app.applySelectedTimezone_(), false);
    assert.equal(spreadsheet.getSpreadsheetTimeZone(), 'Asia/Kolkata');
    assert.equal(setup.cell(4, 5), 'Asia/Kolkata');
    assert.equal(setup.cell(6, 2), true);
    assert.equal(sheet.cell(2, 1), date);
    assert.match(alerts.at(-1)[0], /Timezone update failed/);
  });
}

for (const [amount, rounded] of [[455.76, 456], [455.23, 455], [455.49, 455], [455.50, 456], [455, 455], [0.49, 0], [0.50, 1]]) {
  it(`uses ${rounded} for a ${amount} payment in cells and PDFs while preserving expense precision`, () => {
    const { app, setup, sheet, reports } = loadAppsScript({
      roster: getMockRoster(2), expenses: [getMockExpense({ amount, split: 'Bob' })]
    });
    setup.getRange('B6').setValue(true);
    const raw = app.buildLedger_();
    const before = plain([...raw.balances]);
    const ledger = app.buildWholeUnitLedger_(raw);
    const settlements = app.calculateOptimalSettlements_(ledger);
    assertSettles(ledger, settlements);
    assert.deepEqual([...ledger.balances.values()], [rounded * 100, rounded ? -rounded * 100 : 0]);
    assert.deepEqual(plain([...raw.balances]), before);
    assert.equal(ledger.totalMinor, raw.totalMinor);
    assert.equal(sheet.cell(2, 3), amount);
    app.recalculateAll();
    assert.equal(reports.cell(4, 11), rounded);
    assert.equal(reports.cell(5, 11), rounded ? -rounded : 0);
    if (rounded) {
      assert.equal(reports.cell(9, 3), rounded);
      assert.equal(reports.cell(9, 4), `Bob pays Alice ₹${rounded}`);
    } else {
      assert.equal(reports.cell(9, 1), 'All debts settled!');
    }
    const html = app.buildParticipantReportHtml_({ ledger: raw, settlements: app.calculateOptimalSettlements_(raw),
      person: raw.roster[1], currency: '₹', tripName: 'Rounded trip', generatedOn: '' });
    assert.match(html, new RegExp(`<p class="balance-value">₹${rounded}</p>`));
    assert.doesNotMatch(html, /₹-?\d[\d,]*\.\d/);
    assert.equal(app.getCurrencyFormat_(), '"₹"#,##0');
    assert.equal(app.wholeUnits_(-1), 0);
  });
}

it('reconciles multiple rounded payments and finds a minimum plan for the resulting balances', () => {
  const { app } = loadAppsScript();
  const raw = getMockLedger([-140, 70, 70]);
  const ledger = app.buildWholeUnitLedger_(raw);
  assert.deepEqual([...ledger.balances.values()], [-200, 100, 100]);
  assertSettles(ledger, app.calculateOptimalSettlements_(ledger));
  assert.deepEqual([...raw.balances.values()], [-140, 70, 70]);
});

it('clears rounded balances for seeded groups of 2 through 15 people', () => {
  const { app } = loadAppsScript();
  const random = getSeededRandom(301);
  for (let count = 2; count <= 15; count++) {
    for (let sample = 0; sample < 5; sample++) {
      const balances = Array.from({ length: count - 1 }, () => random(200000) - 100000);
      balances.push(-balances.reduce((sum, value) => sum + value, 0));
      const ledger = app.buildWholeUnitLedger_(getMockLedger(balances));
      const settlements = app.calculateOptimalSettlements_(ledger);
      assert.ok(settlements.every(payment => payment.amountMinor % 100 === 0));
      assertSettles(ledger, settlements);
      assert.equal([...ledger.balances.values()].reduce((sum, value) => sum + value, 0), 0);
    }
  }
});

it('reports unsafe rounded totals without mutating the accounting ledger', () => {
  const { app } = loadAppsScript();
  const raw = getMockLedger([-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]);
  const rounded = app.buildWholeUnitLedger_(raw);
  assert.match(rounded.errors.join(' '), /safe integer range/);
  assert.equal(raw.errors.length, 0);
  assert.deepEqual([...raw.balances.values()], [-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]);
});
