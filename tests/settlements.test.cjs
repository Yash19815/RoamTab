const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  getMockLedger, getMockExpense, getMockRoster, loadAppsScript,
  plain, assertSettles, getSeededRandom
} = require('./helpers/apps-script.cjs');
const { exactMinimumTransfers } = require('./helpers/exact-minimum.cjs');

describe('Greedy settlement correctness', () => {
  for (const balances of [
    [0, 0], [-50000, 50000], [-1, 1, 0],
    [-5000, -3000, 8000], [-8000, 5000, 3000],
    [-500, -500, 500, 500], [-3334, -3333, 6667],
    [-1200, -800, -500, 1000, 1500],
    [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 14]
  ]) {
    it(`clears every balance for [${balances.join(', ')}] minor units`, () => {
      const { app } = loadAppsScript();
      const ledger = getMockLedger(balances);
      const before = [...ledger.balances.entries()];
      const settlements = app.calculateGreedySettlements_(ledger);
      assertSettles(ledger, settlements);
      assert.deepEqual([...ledger.balances.entries()], before, 'Input balances must remain unchanged');
    });
  }

  it('returns the expected debtor, creditor, and exact amount for a simple debt', () => {
    const { app } = loadAppsScript();
    assert.deepEqual(plain(app.calculateGreedySettlements_(getMockLedger([-50000, 50000]))), [
      { fromId: 1, from: 'Alice', toId: 2, to: 'Bob', amountMinor: 50000 }
    ]);
  });

  it('uses IDs to resolve tied balances consistently when the roster is reordered', () => {
    const { app } = loadAppsScript();
    const ledger = getMockLedger([-500, -500, 500, 500]);
    const first = plain(app.calculateGreedySettlements_(ledger));
    ledger.roster.reverse();
    assert.deepEqual(plain(app.calculateGreedySettlements_(ledger)), first);
    assert.deepEqual(first.map(({ fromId, toId }) => [fromId, toId]), [[1, 3], [2, 4]]);
  });

  it('rejects a ledger containing validation errors', () => {
    const { app } = loadAppsScript();
    assert.throws(() => app.calculateGreedySettlements_(getMockLedger([-5, 5], {
      errors: ['Invalid payer']
    })), /Invalid payer/);
  });

  it('rejects balances that do not sum to zero', () => {
    const { app } = loadAppsScript();
    assert.throws(() => app.calculateGreedySettlements_(getMockLedger([-100, 99])), /not balanced: -1 paise/);
  });

  it('rejects fractional minor units', () => {
    const { app } = loadAppsScript();
    assert.throws(() => app.calculateGreedySettlements_(getMockLedger([-1.5, 1.5])), /Invalid non-positive settlement amount/);
  });

  it('rejects missing participant names', () => {
    const { app } = loadAppsScript();
    const ledger = getMockLedger([-100, 100]);
    ledger.roster[0].name = '';
    assert.throws(() => app.calculateGreedySettlements_(ledger), /Invalid settlement participant/);
  });

  it('clears 1000 reproducible random balanced groups of 2 through 15 people', () => {
    const random = getSeededRandom(9173);
    const { app } = loadAppsScript();
    for (let scenario = 0; scenario < 1000; scenario++) {
      const balances = Array.from({ length: 1 + random(14) }, () => random(200001) - 100000);
      balances.push(-balances.reduce((sum, value) => sum + value, 0));
      const ledger = getMockLedger(balances);
      assertSettles(ledger, app.calculateGreedySettlements_(ledger));
    }
  });
});

describe('Minimum transaction claim', () => {
  it('checks the independent exact oracle against hand-solved examples', () => {
    for (const [balances, minimum] of [
      [[0, 0], 0], [[-5, 5], 1], [[-5, -5, 10], 2],
      [[-5, -5, 5, 5], 2], [[-8, -7, -5, 12, 8], 3]
    ]) assert.equal(exactMinimumTransfers(balances), minimum);
  });

  it('proves greedy can use four transfers when three suffice', () => {
    const { app } = loadAppsScript();
    const ledger = getMockLedger([-800, -700, -500, 1200, 800]);
    const greedy = app.calculateGreedySettlements_(ledger);
    assertSettles(ledger, greedy);
    const better = [
      { fromId: 1, from: 'Alice', toId: 5, to: 'Person 5', amountMinor: 800 },
      { fromId: 2, from: 'Bob', toId: 4, to: 'Person 4', amountMinor: 700 },
      { fromId: 3, from: 'Cara', toId: 4, to: 'Person 4', amountMinor: 500 }
    ];
    assertSettles(ledger, better);
    assert.equal(greedy.length, 4, 'Regression fixture for the current greedy limitation');
    assert.equal(exactMinimumTransfers([...ledger.balances.values()]), 3);
    assert.equal(better.length, 3);
  });

  it('reproduces the non-minimal plan from actual expense rows', () => {
    const { app } = loadAppsScript({ roster: getMockRoster(5), expenses: [
      getMockExpense({ amount: 7, payer: 'Person 4', split: 'Bob' }),
      getMockExpense({ amount: 5, payer: 'Person 4', split: 'Cara' }),
      getMockExpense({ amount: 8, payer: 'Person 5', split: 'Alice' })
    ] });
    const ledger = app.buildLedger_();
    assert.deepEqual([...ledger.balances.values()], [-800, -700, -500, 1200, 800]);
    const settlements = app.calculateGreedySettlements_(ledger);
    assertSettles(ledger, settlements);
    assert.equal(settlements.length, 4);
    assert.equal(exactMinimumTransfers([...ledger.balances.values()]), 3);
  });

  it('compares greedy with the exact oracle for 100 seeded small groups', () => {
    const random = getSeededRandom(77);
    const { app } = loadAppsScript();
    for (let scenario = 0; scenario < 100; scenario++) {
      const balances = Array.from({ length: 1 + random(6) }, () => random(21) - 10);
      balances.push(-balances.reduce((sum, value) => sum + value, 0));
      const ledger = getMockLedger(balances);
      const settlements = app.calculateGreedySettlements_(ledger);
      assertSettles(ledger, settlements);
      const minimum = exactMinimumTransfers(balances);
      assert.ok(settlements.length >= minimum);
    }
  });
});
