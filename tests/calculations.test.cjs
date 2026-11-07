const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  getMockRoster, getMockExpense, loadAppsScript, plain,
  assertSettles, assertLedgerConservesMoney, getSeededRandom
} = require('./helpers/apps-script.cjs');

describe('Money conversion and equal shares', () => {
  for (const [amount, minor] of [[0.01, 1], [0.29, 29], [10.23, 1023], ['125.50', 12550], [999999.99, 99999999]]) {
    it(`converts ${amount} to ${minor} integer minor units and back`, () => {
      const { app } = loadAppsScript();
      assert.equal(app.toMinor_(amount), minor);
      assert.equal(app.fromMinor_(minor), Number(amount));
    });
  }

  for (const amount of [0, -1, '', null, undefined, 'invalid', NaN, Infinity]) {
    it(`ignores non-positive or invalid amount ${String(amount)}`, () => {
      assert.equal(loadAppsScript().app.toMinor_(amount), 0);
    });
  }

  it('distributes 100.00 among three people without losing a cent', () => {
    const { app } = loadAppsScript();
    assert.deepEqual(plain([...app.allocateEqualMinor_(10000, getMockRoster()).entries()]), [
      [1, 3334], [2, 3333], [3, 3333]
    ]);
  });

  it('assigns remainders by ascending person ID regardless of input order', () => {
    const { app } = loadAppsScript();
    const roster = getMockRoster();
    assert.deepEqual(plain([...app.allocateEqualMinor_(2, roster.reverse()).entries()]), [[1, 1], [2, 1], [3, 0]]);
  });

  it('preserves every cent for 2 through 15 participants over many amounts', () => {
    const { app } = loadAppsScript();
    for (let count = 2; count <= 15; count++) {
      for (const amount of [1, 2, 7, 99, 100, 101, 10000, 99999999]) {
        const shares = [...app.allocateEqualMinor_(amount, getMockRoster(count)).values()];
        assert.equal(shares.reduce((sum, value) => sum + value, 0), amount);
        assert.ok(shares.every(value => Number.isSafeInteger(value) && value >= 0));
        assert.ok(Math.max(...shares) - Math.min(...shares) <= 1);
      }
    }
  });

  it('returns no allocations for no people or a zero amount', () => {
    const { app } = loadAppsScript();
    assert.equal(app.allocateEqualMinor_(100, []).size, 0);
    assert.equal(app.allocateEqualMinor_(0, getMockRoster()).size, 0);
  });
});

describe('Ledger calculations from spreadsheet input', () => {
  it('calculates a two-person 1000.00 bill paid by Bob', () => {
    const { app } = loadAppsScript({
      roster: getMockRoster(2), expenses: [getMockExpense({ amount: 1000, payer: 'Bob' })]
    });
    const ledger = app.buildLedger_();
    assert.equal(ledger.totalMinor, 100000);
    assert.deepEqual([...ledger.paid.values()], [0, 100000]);
    assert.deepEqual([...ledger.spent.values()], [50000, 50000]);
    assert.deepEqual([...ledger.balances.values()], [-50000, 50000]);
    assertLedgerConservesMoney(ledger);
    assertSettles(ledger, app.calculateOptimalSettlements_(ledger));
  });

  it('calculates multiple payers, subgroups, and a payer outside their own split', () => {
    const { app } = loadAppsScript({ expenses: [
      getMockExpense({ amount: 120, payer: 'Alice' }),
      getMockExpense({ amount: 60, payer: 'Bob', split: 'Bob, Cara' }),
      getMockExpense({ amount: 30, payer: 'Cara', split: 'Alice, Bob' })
    ] });
    const ledger = app.buildLedger_();
    assert.equal(ledger.totalMinor, 21000);
    assert.deepEqual([...ledger.paid.values()], [12000, 6000, 3000]);
    assert.deepEqual([...ledger.spent.values()], [5500, 8500, 7000]);
    assert.deepEqual([...ledger.balances.values()], [6500, -2500, -4000]);
    assertLedgerConservesMoney(ledger);
    assertSettles(ledger, app.calculateOptimalSettlements_(ledger));
  });

  it('gives the rounding cent to the lowest included ID, even when Cara pays', () => {
    const { app } = loadAppsScript({ expenses: [getMockExpense({ amount: 100, payer: 'Cara' })] });
    const ledger = app.buildLedger_();
    assert.deepEqual([...ledger.spent.values()], [3334, 3333, 3333]);
    assert.deepEqual([...ledger.balances.values()], [-3334, -3333, 6667]);
    assertLedgerConservesMoney(ledger);
  });

  for (const split of ['', 'All', ' all ', 'ALL']) {
    it(`treats ${JSON.stringify(split)} as an equal split across the roster`, () => {
      const { app } = loadAppsScript({ expenses: [getMockExpense({ amount: 90, split })] });
      const ledger = app.buildLedger_();
      assert.deepEqual([...ledger.spent.values()], [3000, 3000, 3000]);
      assertLedgerConservesMoney(ledger);
    });
  }

  it('matches names without case or surrounding spaces and counts duplicate split names once', () => {
    const { app } = loadAppsScript({ expenses: [
      getMockExpense({ amount: 10, payer: ' bOB ', split: ' alice, ALICE, cara, ' })
    ] });
    const ledger = app.buildLedger_();
    assert.deepEqual([...ledger.spent.values()], [500, 0, 500]);
    assert.deepEqual([...ledger.balances.values()], [-500, 1000, -500]);
    assertLedgerConservesMoney(ledger);
  });

  it('rejects unknown subgroup names even when some names are valid', () => {
    const { app } = loadAppsScript({ expenses: [getMockExpense({ amount: 12, split: 'Alice, Typo' })] });
    const ledger = app.buildLedger_();
    assert.deepEqual([...ledger.spent.values()], [0, 0, 0]);
    assert.match(ledger.errors[0], /Split name 'Typo' is not a roster member/);
  });

  it('leaves no debt for an expense paid and consumed by the same person', () => {
    const { app } = loadAppsScript({ expenses: [getMockExpense({ amount: 25, split: 'Alice' })] });
    const ledger = app.buildLedger_();
    assert.deepEqual([...ledger.balances.values()], [0, 0, 0]);
    assert.equal(app.calculateOptimalSettlements_(ledger).length, 0);
    assertLedgerConservesMoney(ledger);
  });

  it('ignores empty and incomplete rows while retaining later valid expenses', () => {
    const { app } = loadAppsScript({ expenses: [
      ['', '', '', '', ''],
      getMockExpense({ amount: '', payer: 'Alice' }),
      getMockExpense({ amount: 10, payer: '' }),
      getMockExpense({ amount: -10 }),
      getMockExpense({ amount: 'bad' }),
      getMockExpense({ amount: 12 })
    ] });
    const ledger = app.buildLedger_();
    assert.equal(ledger.expenses.length, 1);
    assert.equal(ledger.expenses[0].row, 7);
    assert.equal(ledger.totalMinor, 1200);
    for (let row = 2; row < 7; row++) assert.equal(ledger.rowRecords.get(row), null);
    assertLedgerConservesMoney(ledger);
  });

  for (const [overrides, message] of [
    [{ payer: 'Unknown' }, /Row 2: Paid By 'Unknown' is not a roster member/],
    [{ split: 'Unknown' }, /Row 2: Split Among has no valid roster member/]
  ]) {
    it(`rejects invalid expense ${JSON.stringify(overrides)} and blocks settlement`, () => {
      const { app } = loadAppsScript({ expenses: [getMockExpense(overrides)] });
      const ledger = app.buildLedger_();
      assert.equal(ledger.totalMinor, 0);
      assert.equal(ledger.expenses.length, 0);
      assert.equal(ledger.rowRecords.get(2), null);
      assert.match(ledger.errors[0], message);
      assert.throws(() => app.calculateOptimalSettlements_(ledger), message);
    });
  }

  it('reads only input columns A:F, capped at 500 expense rows', () => {
    const expenses = Array.from({ length: 501 }, () => getMockExpense({ amount: 0.01 }));
    const { app, sheet } = loadAppsScript({ expenses, lastRow: 1000 });
    const ledger = app.buildLedger_();
    assert.equal(ledger.expenses.length, 500);
    assert.equal(ledger.totalMinor, 500);
    assert.deepEqual(sheet.reads, [{ row: 2, col: 1, height: 500, width: 6 }]);
    assertLedgerConservesMoney(ledger);
  });

  for (const options of [
    {}, { missingSetup: true }, { missingExpenses: true },
    { count: 1 }, { count: 16 }, { count: 2.5 }
  ]) {
    it(`returns an empty ledger safely for ${JSON.stringify(options)}`, () => {
      const { app } = loadAppsScript(options);
      const ledger = app.buildLedger_();
      assert.equal(ledger.totalMinor, 0);
      assert.equal(ledger.expenses.length, 0);
      assertLedgerConservesMoney(ledger);
      assertSettles(ledger, app.calculateOptimalSettlements_(ledger));
    });
  }

  it('preserves totals and clears debts across 100 seeded trips with 2 through 15 people', () => {
    const random = getSeededRandom();
    for (let trip = 0; trip < 100; trip++) {
      const roster = getMockRoster(2 + random(14));
      let expectedTotal = 0;
      const expenses = Array.from({ length: 20 }, () => {
        const minor = 1 + random(1000000);
        expectedTotal += minor;
        const included = roster.filter(() => random(3) !== 0);
        const split = included.length ? included.map(person => person.name).join(', ') : 'All';
        return getMockExpense({ amount: minor / 100, payer: roster[random(roster.length)].name, split });
      });
      const { app } = loadAppsScript({ roster, expenses });
      const ledger = app.buildLedger_();
      assert.equal(ledger.totalMinor, expectedTotal, `Trip ${trip}`);
      assertLedgerConservesMoney(ledger);
      assertSettles(ledger, app.calculateOptimalSettlements_(ledger));
    }
  });
});

describe('Calculated values written to the spreadsheet', () => {
  it('writes signed row nets and summary Paid, Spent, and Net values', () => {
    const { app, sheet, reports } = loadAppsScript({ expenses: [
      getMockExpense({ amount: 120, payer: 'Alice' }),
      getMockExpense({ amount: 60, payer: 'Bob', split: 'Bob, Cara' }),
      getMockExpense({ amount: 30, payer: 'Cara', split: 'Alice, Bob' })
    ] });
    app.recalculateAll();
    assert.deepEqual(plain(sheet.getRange(2, 7, 3, 3).getValues()), [
      [80, -40, -40], [0, 30, -30], [-15, -15, 30]
    ]);
    // Participant nets remain in Expenses; live totals appear in Send Reports!H:K.
    assert.equal(reports.cell(2, 11), 210);
    assert.deepEqual(plain(reports.getRange(4, 8, 3, 4).getValues()), [
      ['Alice', 120, 55, 65], ['Bob', 60, 85, -25], ['Cara', 30, 70, -40]
    ]);
  });

  it('clears stale calculated cells for an incomplete expense row', () => {
    const { app, sheet } = loadAppsScript({ expenses: [getMockExpense({ payer: '' })] });
    sheet.getRange(2, 7, 1, 3).setValues([[99, -50, -49]]);
    app.recalculateAll();
    assert.deepEqual(plain(sheet.getRange(2, 7, 1, 3).getValues()), [['', '', '']]);
  });

  it('places the summary in Send Reports for 15 participants without overwriting input', () => {
    const expense = getMockExpense({ amount: 0.01 });
    const { app, sheet, reports } = loadAppsScript({ roster: getMockRoster(15), expenses: [expense] });
    app.recalculateAll();
    assert.equal(reports.cell(1, 8), 'LIVE SUMMARY');
    assert.equal(reports.cell(2, 11), 0.01);
    assert.equal(sheet.cell(1, 22), '');
    assert.deepEqual(plain(sheet.getRange(2, 1, 1, 6).getValues()), [expense]);
    assert.deepEqual(plain(sheet.getRange(2, 7, 1, 15).getValues()), [new Array(15).fill(0)]);
  });
});
