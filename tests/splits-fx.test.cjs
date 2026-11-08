const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  loadAppsScript, getMockRoster, getMockExpense, plain,
  assertLedgerConservesMoney, assertSettles, getSeededRandom
} = require('./helpers/apps-script.cjs');

function mockRates(state, rate = 83.1234) {
  state.app.UrlFetchApp.fetch = url => {
    state.fetches.push(url);
    const match = /\/rate\/([A-Z]{3})\/([A-Z]{3})\?date=(\d{4}-\d{2}-\d{2})$/.exec(url);
    assert.ok(match, url);
    return {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ base: match[1], quote: match[2], date: match[3], rate })
    };
  };
}

function foreign(overrides = {}) {
  return getMockExpense({ date: '2026-01-09', amount: 10, currency: 'USD', ...overrides });
}

describe('Three split modes', () => {
  it('maps exact amounts by roster position and leaves trailing people at zero', () => {
    const { app } = loadAppsScript({ roster: getMockRoster(4), expenses: [
      getMockExpense({ amount: 1000, split: '400, 500, 100', payer: 'Person 4' })
    ] });
    const ledger = app.buildLedger_();
    assert.deepEqual([...ledger.spent.values()], [40000, 50000, 10000, 0]);
    assert.equal(ledger.expenses[0].splitMode, 'exact');
    assertLedgerConservesMoney(ledger);
    assertSettles(ledger, app.calculateOptimalSettlements_(ledger));
  });

  it('supports numeric cells, zero exact shares, and decimal exact amounts', () => {
    const { app } = loadAppsScript({ expenses: [
      getMockExpense({ amount: 1.01, split: '0, 1.01' }),
      getMockExpense({ amount: 12, split: 12 })
    ] });
    const ledger = app.buildLedger_();
    assert.deepEqual([...ledger.spent.values()], [1200, 101, 0]);
    assert.deepEqual(plain(ledger.expenses[0].includedIds), [2]);
    assertLedgerConservesMoney(ledger);
  });

  it('allocates percentages with four decimal places and remainders by ascending ID', () => {
    const { app } = loadAppsScript({ expenses: [
      getMockExpense({ amount: 0.05, split: 'Cara 30, Bob 40, Alice 30' }),
      getMockExpense({ amount: 1, split: 'Alice 33.3333%, Bob 33.3333%, Cara 33.3334%' })
    ] });
    const ledger = app.buildLedger_();
    assert.deepEqual(plain([...ledger.expenses[0].allocations]), [[1, 2], [2, 2], [3, 1]]);
    assert.deepEqual(plain([...ledger.expenses[1].allocations]), [[1, 34], [2, 33], [3, 33]]);
    assertLedgerConservesMoney(ledger);
  });

  it('never gives a remainder to a zero-percent participant', () => {
    const { app } = loadAppsScript({ expenses: [
      getMockExpense({ amount: 0.01, split: 'Alice 0, Bob 50, Cara 50' })
    ] });
    const ledger = app.buildLedger_();
    assert.deepEqual([...ledger.spent.values()], [0, 1, 0]);
    assertLedgerConservesMoney(ledger);
  });

  it('keeps complete roster names ending in numbers in equal mode', () => {
    const { app } = loadAppsScript({ roster: getMockRoster(15), expenses: [
      getMockExpense({ amount: 9, split: 'Person 4, Person 15' })
    ] });
    const ledger = app.buildLedger_();
    assert.equal(ledger.spent.get(4), 450);
    assert.equal(ledger.spent.get(15), 450);
    assertLedgerConservesMoney(ledger);
  });

  for (const [split, amount, error] of [
    ['400, 500, 100', 1200, 'Exact split total (1000) does not match total bill (1200)'],
    ['Alice 30, Bob 30, Cara 30', 100, 'Split percentages total 90%, must equal 100%'],
    ['1, 2, 3, 4', 10, 'more positions'],
    ['Alice 50, ALICE 50', 10, 'Duplicate split percentage'],
    ['Alice 50, Typo 50', 10, 'not a roster member'],
    ['Alice 50, Bob', 10, 'every split entry'],
    ['Alice 101, Bob 0', 10, 'between 0 and 100'],
    ['Alice -1, Bob 101', 10, 'every split entry'],
    ['Alice 33.33333, Bob 66.66667', 10, 'no valid roster member'],
    ['Alice, Typo', 10, 'not a roster member'],
    ['1,,2', 3, 'no valid roster member'],
    ['-1, 4', 3, 'no valid roster member'],
    ['1.001, 1.999', 3, 'no valid roster member']
  ]) {
    it(`rejects ${split} before any FX request`, () => {
      const state = loadAppsScript({ expenses: [foreign({ amount, split })] });
      const ledger = state.app.buildLedger_();
      assert.ok(ledger.errors[0].startsWith('Row 2: '));
      assert.ok(ledger.errors[0].includes(error), ledger.errors[0]);
      assert.equal(ledger.totalMinor, 0);
      assert.equal(ledger.rowRecords.get(2), null);
      assert.equal(state.fetches.length, 0);
      assert.throws(() => state.app.calculateOptimalSettlements_(ledger));
    });
  }

  it('reconciles seeded exact and percentage trips for 2 through 15 people', () => {
    const random = getSeededRandom(44991);
    for (let count = 2; count <= 15; count++) {
      const roster = getMockRoster(count);
      const expenses = Array.from({ length: 30 }, (_, index) => {
        const shares = roster.map(() => random(10000));
        const amount = shares.reduce((sum, value) => sum + value, 0) / 100;
        return getMockExpense({ amount, payer: roster[random(count)].name,
          split: index % 2 ? shares.map(value => (value / 100).toFixed(2)).join(', ')
            : `${roster[0].name} 30, ${roster[count - 1].name} 70` });
      });
      const { app } = loadAppsScript({ roster, expenses });
      const ledger = app.buildLedger_();
      assertLedgerConservesMoney(ledger);
      assertSettles(ledger, app.calculateOptimalSettlements_(ledger));
    }
  });
});

describe('Historical currency conversion', () => {
  for (const base of ['₹', 'INR', 'usd', '$', '€', 'GBP', '฿']) {
    it(`inherits ${base} without dates or API access`, () => {
      const state = loadAppsScript({ expenses: [getMockExpense({ amount: 12.34 })] });
      state.setup.getRange('B4').setValue(base);
      state.app.CacheService.getDocumentCache = () => { throw new Error('Local rows must bypass FX'); };
      const ledger = state.app.buildLedger_();
      assert.equal(ledger.totalMinor, 1234);
      assertLedgerConservesMoney(ledger);
      assert.equal(state.fetches.length, 0);
    });
  }

  it('normalizes codes and bypasses FX for an explicit base currency', () => {
    const state = loadAppsScript({ expenses: [getMockExpense({ currency: ' inr ' })] });
    const ledger = state.app.buildLedger_();
    assert.equal(ledger.totalMinor, 10000);
    assertLedgerConservesMoney(ledger);
    assert.equal(state.fetches.length, 0);
  });

  it('converts all three split modes before updating row nets, summaries, settlements, and PDFs', () => {
    const state = loadAppsScript({ expenses: [
      foreign({ split: '2, 3, 5' }), foreign({ split: 'Cara 30, Alice 30, Bob 40' }), foreign()
    ] });
    mockRates(state);
    state.setup.getRange('B6').setValue(true);
    state.app.recalculateAll();
    const ledger = state.app.buildLedger_();
    assert.equal(ledger.totalMinor, 249369);
    assert.equal(ledger.expenses[0].sourceAmountMinor, 1000);
    assert.equal(ledger.expenses[0].sourceCurrency, 'USD');
    assert.equal(ledger.expenses[0].exchangeRate, 83.1234);
    assert.deepEqual([...ledger.expenses[0].allocations.values()], [16625, 24937, 41561]);
    assert.equal(state.sheet.cell(2, 6), 'USD');
    assert.equal(state.sheet.cell(2, 7), (83123 - 16625) / 100);
    assert.equal(state.reports.cell(2, 11), 2493.69);
    assertLedgerConservesMoney(ledger);
    const settlements = state.app.calculateOptimalSettlements_(ledger);
    assertSettles(ledger, settlements);
    const html = state.app.buildParticipantReportHtml_({ ledger, settlements, person: ledger.roster[0],
      currency: '₹', tripName: 'FX trip', generatedOn: '' });
    assert.match(html, /₹831</);
    assert.equal(state.fetches.length, 1);
    assert.equal(state.cacheWrites[0].key, 'FX_USD_INR_2026-01-09');
  });

  it('uses spreadsheet timezone for actual date cells', () => {
    const state = loadAppsScript({ expenses: [foreign({ date: new Date('2026-01-08T18:30:00Z') })] });
    mockRates(state);
    assertLedgerConservesMoney(state.app.buildLedger_());
    assert.match(state.fetches[0], /date=2026-01-09$/);
  });

  it('rounds decimal FX half-cents once and supports exponent notation', () => {
    const state = loadAppsScript({ expenses: [foreign({ amount: 1 })] });
    mockRates(state, 1.005);
    const ledger = state.app.buildLedger_();
    assert.equal(ledger.totalMinor, 101);
    assertLedgerConservesMoney(ledger);
    assert.equal(state.app.convertFxMinor_(100000000, 1e-7), 10);
    assert.equal(state.app.convertFxMinor_(100, 1e3), 100000);
  });

  for (const count of [2, 15]) {
    it(`reconciles 500 foreign expenses across all modes with ${count} people and one rate request`, () => {
      const expenses = Array.from({ length: 500 }, (_, index) => foreign({
        amount: 0.13 + index / 100, payer: index % 2 ? 'Alice' : 'Bob',
        split: ['All', 'Alice 30, Bob 70', `0.01, ${(0.12 + index / 100).toFixed(2)}`][index % 3]
      }));
      const state = loadAppsScript({ roster: getMockRoster(count), expenses });
      mockRates(state, 0.12345678);
      const ledger = state.app.buildLedger_();
      assert.equal(ledger.expenses.length, 500);
      assert.equal(state.fetches.length, 1);
      assertLedgerConservesMoney(ledger);
      assertSettles(ledger, state.app.calculateOptimalSettlements_(ledger));
    });
  }

  it('reuses persistent 24-hour rates after six-hour cache eviction and expires them without extending the deadline', () => {
    const state = loadAppsScript({ expenses: [foreign()] });
    mockRates(state);
    state.app.buildLedger_();
    const key = 'FX_USD_INR_2026-01-09';
    const entry = state.properties.get(key);
    const expiresAt = JSON.parse(entry).expiresAt;
    assert.ok(expiresAt > Date.now() + 23.99 * 60 * 60 * 1000);
    assert.ok(expiresAt <= Date.now() + 24 * 60 * 60 * 1000);
    state.cacheEntries.clear();
    state.app.buildLedger_();
    assert.equal(state.fetches.length, 1);
    assert.equal(state.properties.get(key), entry);
    assert.ok(state.cacheWrites.every(write => write.seconds <= 21600));
    state.cacheEntries.set(key, JSON.stringify({ rate: 1, expiresAt: Date.now() - 1 }));
    state.properties.set(key, state.cacheEntries.get(key));
    state.properties.set('FX_OLD_ENTRY', state.cacheEntries.get(key));
    state.properties.set('OTHER_SETTING', 'keep');
    state.app.buildLedger_();
    assert.equal(state.fetches.length, 2);
    assert.equal(state.properties.has('FX_OLD_ENTRY'), false);
    assert.equal(state.properties.get('OTHER_SETTING'), 'keep');
  });

  it('keys rates independently by source, target, and transaction date', () => {
    const state = loadAppsScript({ expenses: [foreign(), foreign({ currency: 'EUR' }), foreign({ date: '2026-01-10' })] });
    mockRates(state);
    assertLedgerConservesMoney(state.app.buildLedger_());
    assert.equal(state.fetches.length, 3);
    state.setup.getRange('B4').setValue('THB');
    assertLedgerConservesMoney(state.app.buildLedger_());
    assert.equal(state.fetches.length, 6);
    assert.ok(state.properties.has('FX_USD_THB_2026-01-09'));
  });

  it('accepts a prior observation returned for a non-publication day', () => {
    const state = loadAppsScript({ expenses: [foreign()] });
    state.app.UrlFetchApp.fetch = () => ({ getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ base: 'USD', quote: 'INR', date: '2026-01-08', rate: 83 }) });
    assertLedgerConservesMoney(state.app.buildLedger_());
  });

  for (const overrides of [
    { date: '' }, { date: '09/01/2026' }, { date: '2026-02-30' }, { date: new Date('invalid') },
    { date: '2099-01-01' }, { currency: 'USDD' }
  ]) {
    it(`rejects invalid currency/date ${JSON.stringify(overrides)}`, () => {
      const state = loadAppsScript({ expenses: [foreign(overrides)] });
      const ledger = state.app.buildLedger_();
      assert.equal(ledger.errors.length, 1);
      assert.equal(ledger.totalMinor, 0);
      assert.equal(state.fetches.length, 0);
    });
  }

  for (const response of [
    { code: 404, data: {} }, { code: 429, data: {} }, { code: 503, data: {} },
    { code: 200, text: 'broken JSON' },
    { code: 200, data: { base: 'USD', quote: 'INR', date: '2026-01-09', rate: 0 } },
    { code: 200, data: { base: 'USD', quote: 'EUR', date: '2026-01-09', rate: 83 } },
    { code: 200, data: { base: 'USD', quote: 'INR', date: '2026-01-10', rate: 83 } },
    { code: 200, data: { base: 'USD', quote: 'INR', date: '2026-01-09', rate: '83' } }
  ]) {
    it(`blocks settlements and memoizes failed requests: ${JSON.stringify(response)}`, () => {
      const state = loadAppsScript({ expenses: [foreign(), foreign()] });
      state.app.UrlFetchApp.fetch = url => {
        state.fetches.push(url);
        return { getResponseCode: () => response.code,
          getContentText: () => response.text ?? JSON.stringify(response.data) };
      };
      const ledger = state.app.buildLedger_();
      assert.equal(ledger.errors.length, 2);
      assert.match(ledger.errors[0], /^Row 2: Currency conversion failed:/);
      assert.match(ledger.errors[1], /^Row 3: Currency conversion failed:/);
      assert.equal(state.fetches.length, 1);
      assert.equal(ledger.totalMinor, 0);
      assert.throws(() => state.app.calculateOptimalSettlements_(ledger));
      assert.equal(state.properties.has('FX_USD_INR_2026-01-09'), false);
    });
  }

  it('retries after a transient network failure on a later recalculation', () => {
    const state = loadAppsScript({ expenses: [foreign()] });
    assert.equal(state.app.buildLedger_().errors.length, 1);
    mockRates(state);
    assertLedgerConservesMoney(state.app.buildLedger_());
    assert.equal(state.fetches.length, 2);
  });

  it('rejects amounts beyond safe integer bounds', () => {
    const state = loadAppsScript({ expenses: [foreign({ amount: Number.MAX_SAFE_INTEGER })] });
    assert.match(state.app.buildLedger_().errors[0], /safe integer range/);
    assert.equal(state.fetches.length, 0);
  });
});

describe('Currency layout, archives, and edit authorization', () => {
  it('migrates old F output without changing A:E and keeps currencies across subsequent rebuilds', () => {
    const state = loadAppsScript({ expenses: [getMockExpense()] });
    const before = plain(state.sheet.getRange('A2:E2').getValues());
    state.sheet.getRange('F1:F2').setValues([['Alice'], [66.66]]);
    state.app.recalculateAll();
    assert.equal(state.sheet.cell(1, 6), 'Currency');
    assert.equal(state.sheet.cell(2, 6), '');
    assert.equal(state.sheet.cell(1, 7), 'Alice');
    assert.deepEqual(plain(state.sheet.getRange('A2:E2').getValues()), before);
    state.sheet.getRange('F2').setValue('INR');
    state.app.updateExpensesStructure();
    assert.equal(state.sheet.cell(2, 6), 'INR');
    assertLedgerConservesMoney(state.app.buildLedger_());
  });

  it('round-trips currency and both new splits in version 2 JSON', () => {
    const state = loadAppsScript({ expenses: [foreign({ split: '2, 3, 5' }), foreign({ split: 'Alice 40, Bob 60' })] });
    state.setup.getRange('B2').setValue('FX trip');
    mockRates(state);
    const before = state.app.buildLedger_();
    const trip = plain(state.app.captureTrip_());
    assert.equal(trip.schemaVersion, 2);
    state.app.restoreTrip_(trip);
    assert.deepEqual(plain(state.app.captureTrip_().expenses), trip.expenses);
    assert.deepEqual([...state.app.buildLedger_().balances], [...before.balances]);
    assert.equal(state.fetches.length, 1);
  });

  it('loads version 1 JSON with a blank inherited currency', () => {
    const state = loadAppsScript({ expenses: [getMockExpense({ amount: 12 })] });
    state.setup.getRange('B2').setValue('Old trip');
    const trip = plain(state.app.captureTrip_());
    trip.schemaVersion = 1;
    trip.expenses = trip.expenses.map(row => row.slice(0, 5));
    state.app.restoreTrip_(trip);
    assert.equal(state.sheet.cell(2, 6), '');
    assert.equal(state.app.buildLedger_().totalMinor, 1200);
    assert.equal(state.app.captureTrip_().schemaVersion, 2);
  });

  it('never fetches under a simple edit trigger and shows an actionable row error', () => {
    const state = loadAppsScript({ expenses: [foreign()] });
    state.app.onEdit({ range: state.sheet.getRange('F2'), authMode: 'LIMITED' });
    assert.equal(state.fetches.length, 0);
    assert.equal(state.sheet.cell(2, 7), '');
    assert.match(JSON.stringify(state.reports.getDataRange().getValues()), /Enable Automatic Currency Conversion/);
    mockRates(state);
    assertLedgerConservesMoney(state.app.buildLedger_());
  });

  it('uses warm FX rates even under a simple edit trigger', () => {
    const state = loadAppsScript({ expenses: [foreign()] });
    mockRates(state);
    state.app.buildLedger_();
    state.app.onEdit({ range: state.sheet.getRange('F2'), authMode: 'LIMITED' });
    assert.equal(state.fetches.length, 1);
    assert.equal(state.reports.cell(2, 11), 831.23);
  });

  it('installs one authorized edit handler, avoids duplicate simple edits, and processes currency changes', () => {
    const state = loadAppsScript({ expenses: [foreign()] });
    mockRates(state);
    state.app.enableAutomaticFx();
    state.app.enableAutomaticFx();
    assert.equal(state.triggers.length, 1);
    assert.equal(state.properties.get('AUTOMATIC_FX_EDIT'), state.spreadsheet.getId());
    state.sheet.getRange('F2').setValue('EUR');
    state.app.onEdit({ range: state.sheet.getRange('F2'), authMode: 'LIMITED' });
    assert.equal(state.fetches.length, 1);
    state.app.onAuthorizedEdit({ range: state.sheet.getRange('F2'), authMode: 'FULL' });
    assert.equal(state.fetches.length, 2);
    assert.ok(state.properties.has('FX_EUR_INR_2026-01-09'));
  });

  it('does not suppress local editing when a copied sheet has the original trigger marker', () => {
    const state = loadAppsScript({ expenses: [getMockExpense()] });
    state.properties.set('AUTOMATIC_FX_EDIT', 'original-spreadsheet-id');
    state.app.onEdit({ range: state.sheet.getRange('C2'), authMode: 'LIMITED' });
    assert.equal(state.reports.cell(2, 11), 100);
  });

  for (const cell of ['B6', 'B7', 'E6']) {
    it(`retains ${cell} checkbox actions under the authorized trigger without nesting locks`, () => {
      const state = loadAppsScript({ expenses: [getMockExpense()] });
      state.setup.getRange('B2').setValue('Trip');
      state.app.enableAutomaticFx();
      let held = false;
      let locks = 0;
      state.app.LockService.getDocumentLock = () => ({
        waitLock() {
          assert.equal(held, false, 'Document locks must not nest');
          held = true;
          locks++;
        },
        releaseLock() { held = false; }
      });
      state.setup.getRange(cell).setValue(true);
      state.app.onAuthorizedEdit({ range: state.setup.getRange(cell), authMode: 'FULL' });
      assert.equal(locks, 1);
      assert.equal(held, false);
      if (cell === 'E6') {
        assert.ok(state.spreadsheet.getSheetByName('Records'));
        assert.equal(state.setup.cell(6, 5), false);
      } else {
        assert.equal(state.setup.cell(6, 2), true);
        assert.equal(state.reports.cell(2, 11), 100);
      }
    });
  }
});
