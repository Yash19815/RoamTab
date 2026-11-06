const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { performance } = require('node:perf_hooks');
const {
  getMockLedger, getMockRoster, getMockExpense, loadAppsScript,
  assertSettles, getSeededRandom, plain
} = require('./helpers/apps-script.cjs');
const { exactMinimumTransfers } = require('./helpers/exact-minimum.cjs');

describe('Exact minimum-transfer settlements', () => {
  for (const [balances, minimum] of [
    [[0, 0], 0], [[-50000, 50000], 1], [[-1, 1, 0], 1],
    [[-5000, -3000, 8000], 2], [[-8000, 5000, 3000], 2],
    [[-500, -500, 500, 500], 2], [[-3334, -3333, 6667], 2],
    [[-800, -700, -500, 1200, 800], 3],
    [[-9, -8, -7, -6, 15, 15], 4]
  ]) {
    it(`uses exactly ${minimum} transfers for [${balances}] minor units`, () => {
      const { app } = loadAppsScript();
      const ledger = getMockLedger(balances);
      const before = [...ledger.balances.entries()];
      const settlements = app.calculateOptimalSettlements_(ledger);
      assertSettles(ledger, settlements);
      assert.equal(settlements.length, minimum);
      assert.deepEqual([...ledger.balances.entries()], before);
    });
  }

  it('uses three transfers for the counterexample recreated from expense rows', () => {
    const { app } = loadAppsScript({ roster: getMockRoster(5), expenses: [
      getMockExpense({ amount: 7, payer: 'Person 4', split: 'Bob' }),
      getMockExpense({ amount: 5, payer: 'Person 4', split: 'Cara' }),
      getMockExpense({ amount: 8, payer: 'Person 5', split: 'Alice' })
    ] });
    const ledger = app.buildLedger_();
    const settlements = app.calculateOptimalSettlements_(ledger);
    assertSettles(ledger, settlements);
    assert.equal(settlements.length, 3);
    assert.deepEqual(plain(settlements).map(({ fromId, toId, amountMinor }) => [fromId, toId, amountMinor]), [
      [1, 5, 800], [2, 4, 700], [3, 4, 500]
    ]);
  });

  it('produces the same minimum plan for reordered rosters and balance maps', () => {
    const { app } = loadAppsScript();
    const ledger = getMockLedger([-5, -5, -5, 5, 5, 5]);
    const before = plain(app.calculateOptimalSettlements_(ledger));
    ledger.roster.reverse();
    ledger.balances = new Map([...ledger.balances].reverse());
    assert.deepEqual(plain(app.calculateOptimalSettlements_(ledger)), before);
    assert.equal(before.length, 3);
  });

  it('matches the independent exhaustive oracle for all balanced five-person vectors over -2 through 2', () => {
    const { app } = loadAppsScript();
    for (let encoded = 0; encoded < 625; encoded++) {
      let digits = encoded;
      const balances = [];
      for (let person = 0; person < 4; person++) {
        balances.push(digits % 5 - 2);
        digits = Math.floor(digits / 5);
      }
      balances.push(-balances.reduce((sum, value) => sum + value, 0));
      const ledger = getMockLedger(balances);
      const settlements = app.calculateOptimalSettlements_(ledger);
      assertSettles(ledger, settlements);
      assert.equal(settlements.length, exactMinimumTransfers(balances), `Balances ${balances}`);
    }
  });

  it('matches the exact oracle for 200 seeded groups up to 10 people', () => {
    const random = getSeededRandom(4589);
    const { app } = loadAppsScript();
    for (let scenario = 0; scenario < 200; scenario++) {
      const balances = Array.from({ length: 1 + random(9) }, () => random(401) - 200);
      balances.push(-balances.reduce((sum, value) => sum + value, 0));
      const ledger = getMockLedger(balances);
      const settlements = app.calculateOptimalSettlements_(ledger);
      assertSettles(ledger, settlements);
      assert.equal(settlements.length, exactMinimumTransfers(balances));
    }
  });

  it('settles all 15 people using the known minimum of 14 transfers', () => {
    const { app } = loadAppsScript();
    const ledger = getMockLedger([...new Array(14).fill(-1), 14]);
    const settlements = app.calculateOptimalSettlements_(ledger);
    assertSettles(ledger, settlements);
    assert.equal(settlements.length, 14);
  });

  it('finds seven independent minimum groups with 15 nonzero balances', () => {
    const { app } = loadAppsScript();
    const balances = [-1, 1, -2, 2, -4, 4, -8, 8, -16, 16, -32, 32, -64, -128, 192];
    const ledger = getMockLedger(balances);
    const settlements = app.calculateOptimalSettlements_(ledger);
    assertSettles(ledger, settlements);
    // Seven creditors each require a payment; the last creditor needs two debtors.
    assert.equal(settlements.length, 8);
  });

  it('benchmarks 15-person cases without using an approximate fallback', t => {
    const { app } = loadAppsScript();
    const random = getSeededRandom(1801);
    const cases = Array.from({ length: 20 }, () => {
      const values = Array.from({ length: 14 }, () => random(100001) - 50000);
      return getMockLedger([...values, -values.reduce((sum, value) => sum + value, 0)]);
    });
    let maximumMs = 0;
    for (const ledger of cases) {
      const start = performance.now();
      const settlements = app.calculateOptimalSettlements_(ledger);
      maximumMs = Math.max(maximumMs, performance.now() - start);
      assertSettles(ledger, settlements);
    }
    t.diagnostic(`20 local 15-person solves: slowest ${maximumMs.toFixed(2)} ms (not an Apps Script benchmark)`);
  });

  for (const [balances, message] of [
    [[-100, 99], /not balanced/i],
    [[-1.5, 1.5], /safe integer/i],
    [[NaN, 0], /safe integer/i],
    [[-Infinity, Infinity], /safe integer/i],
    [[-Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER + 1], /safe integer/i],
    [[-Number.MAX_SAFE_INTEGER, -1, Number.MAX_SAFE_INTEGER, 1], /safe integer/i]
  ]) {
    it(`rejects invalid balances ${balances}`, () => {
      const { app } = loadAppsScript();
      assert.throws(() => app.calculateOptimalSettlements_(getMockLedger(balances)), message);
    });
  }

  it('accepts a balanced amount at the safe integer limit', () => {
    const { app } = loadAppsScript();
    const ledger = getMockLedger([-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]);
    const settlements = app.calculateOptimalSettlements_(ledger);
    assertSettles(ledger, settlements);
    assert.equal(settlements[0].amountMinor, Number.MAX_SAFE_INTEGER);
  });

  it('blocks ledgers with validation errors', () => {
    const { app } = loadAppsScript();
    assert.throws(() => app.calculateOptimalSettlements_(getMockLedger([-1, 1], {
      errors: ['Invalid payer']
    })), /Invalid payer/);
  });

  it('rejects groups above 15 people rather than approximating', () => {
    const { app } = loadAppsScript();
    assert.throws(() => app.calculateOptimalSettlements_(getMockLedger([...new Array(15).fill(-1), 15])), /15/);
  });

  it('rejects duplicate participant IDs', () => {
    const { app } = loadAppsScript();
    const ledger = getMockLedger([-1, 1]);
    ledger.roster[1].id = ledger.roster[0].id;
    assert.throws(() => app.calculateOptimalSettlements_(ledger), /participant/i);
  });

  it('rejects missing participant names', () => {
    const { app } = loadAppsScript();
    const ledger = getMockLedger([-1, 1]);
    ledger.roster[0].name = '';
    assert.throws(() => app.calculateOptimalSettlements_(ledger), /participant/i);
  });

  it('rejects balance entries outside the roster and missing roster balances', () => {
    const { app } = loadAppsScript();
    const ledger = getMockLedger([-1, 1]);
    ledger.balances.set(99, 0);
    assert.throws(() => app.calculateOptimalSettlements_(ledger), /balance|roster/i);
    ledger.balances.delete(99);
    ledger.balances.delete(2);
    assert.throws(() => app.calculateOptimalSettlements_(ledger), /balance|roster/i);
  });
});

describe('Settlement explanations in the report sheet', () => {
  function getTrip() {
    const result = loadAppsScript({ expenses: [
      getMockExpense({ amount: 120, payer: 'Alice' }),
      getMockExpense({ amount: 60, payer: 'Bob', split: 'Bob, Cara' }),
      getMockExpense({ amount: 30, payer: 'Cara', split: 'Alice, Bob' })
    ] });
    result.setup.getRange('B6').setValue(true);
    return result;
  }

  it('explains original balances and replays the actual payment order', () => {
    const { app } = getTrip();
    const ledger = app.buildLedger_();
    const settlements = app.calculateOptimalSettlements_(ledger);
    const explanations = app.buildSettlementExplanations_(ledger, settlements, '₹');
    assert.equal(explanations.length, 2);
    assert.match(explanations[0], /Cara.*₹30\.00.*₹70\.00.*-₹40\.00/);
    assert.match(explanations[0], /Alice.*₹120\.00.*₹55\.00.*₹65\.00/);
    assert.match(explanations[0], /Before: Cara owes ₹40\.00; Alice needs ₹65\.00/);
    assert.match(explanations[0], /After: Cara owes ₹0\.00; Alice needs ₹25\.00/);
    assert.match(explanations[1], /Before: Bob owes ₹25\.00; Alice needs ₹25\.00/);
    assert.match(explanations[1], /After: Bob owes ₹0\.00; Alice needs ₹0\.00/);
    assert.equal(ledger.balances.get(1), 6500, 'Explanation building must not mutate the ledger');
  });

  it('uses the configured currency and exact cents in explanation text', () => {
    const { app } = loadAppsScript({ roster: getMockRoster(2), expenses: [getMockExpense({ amount: 0.03 })] });
    const ledger = app.buildLedger_();
    const settlements = app.calculateOptimalSettlements_(ledger);
    const [explanation] = app.buildSettlementExplanations_(ledger, settlements, '$');
    assert.match(explanation, /Bob owes \$0\.01/);
    assert.match(explanation, /Alice needs \$0\.01/);
    assert.doesNotMatch(explanation, /₹|0\.009|0\.0100/);
  });

  it('renders an explanation cell next to each minimum settlement', () => {
    const { app, reports } = getTrip();
    app.updateSendReportsSheet();
    const titleRow = 8;
    assert.match(reports.cell(titleRow, 1), /2 transfers.*minimum/i);
    assert.equal(reports.cell(titleRow + 1, 5), 'Explanation');
    const rows = plain(reports.getRange(titleRow + 2, 1, 2, 5).getValues());
    assert.deepEqual(rows.map(row => row.slice(0, 4)), [
      ['Cara', 'Alice', 40, 'Cara pays Alice ₹40.00'],
      ['Bob', 'Alice', 25, 'Bob pays Alice ₹25.00']
    ]);
    assert.match(rows[0][4], /After: Cara owes ₹0\.00; Alice needs ₹25\.00/);
    assert.match(rows[1][4], /After: Bob owes ₹0\.00; Alice needs ₹0\.00/);
  });

  it('renders three report rows for the old four-transfer greedy case', () => {
    const { app, setup, reports } = loadAppsScript({ roster: getMockRoster(5), expenses: [
      getMockExpense({ amount: 7, payer: 'Person 4', split: 'Bob' }),
      getMockExpense({ amount: 5, payer: 'Person 4', split: 'Cara' }),
      getMockExpense({ amount: 8, payer: 'Person 5', split: 'Alice' })
    ] });
    setup.getRange('B6').setValue(true);
    app.updateSendReportsSheet();
    assert.match(reports.cell(10, 1), /3 transfers.*minimum/i);
    assert.deepEqual(plain(reports.getRange(12, 1, 3, 3).getValues()), [
      ['Alice', 'Person 5', 8], ['Bob', 'Person 4', 7], ['Cara', 'Person 4', 5]
    ]);
  });

  it('removes obsolete payment explanations when rebuilding an already-settled trip', () => {
    const { app, sheet, reports } = getTrip();
    app.updateSendReportsSheet();
    sheet.getRange(2, 1, 3, 5).clearContent();
    app.updateSendReportsSheet();
    assert.equal(reports.cell(10, 1), 'All debts settled!');
    assert.equal(reports.cell(10, 5), '');
    assert.equal(reports.cell(11, 5), '');
  });

  it('removes the settlement table and explanations when confirmation is revoked', () => {
    const { app, setup, reports } = getTrip();
    app.updateSendReportsSheet();
    setup.getRange('B6').setValue(false);
    app.updateSendReportsSheet();
    assert.match(reports.cell(1, 1), /not confirmed/);
    assert.equal(reports.cell(10, 5), '');
  });

  it('clears old explanations below the new table when a 15-person roster shrinks to two', () => {
    const { app, setup, reports } = loadAppsScript({
      roster: getMockRoster(15), expenses: [getMockExpense({ amount: 15 })]
    });
    setup.getRange('B6').setValue(true);
    app.updateSendReportsSheet();
    assert.notEqual(reports.cell(35, 5), '');
    setup.getRange('B3').setValue(2);
    app.updateSendReportsSheet();
    assert.equal(reports.cell(35, 5), '');
    assert.equal(reports.cell(35, 1), '');
  });

  it('shows validation errors instead of stale settlement instructions', () => {
    const { app, sheet, reports } = getTrip();
    app.updateSendReportsSheet();
    sheet.getRange(2, 4).setValue('Unknown');
    app.updateSendReportsSheet();
    assert.match(reports.cell(1, 1), /Cannot create settlement plan/);
    assert.equal(reports.cell(10, 5), '');
  });

  it('uses the minimum plan in diagnostics', () => {
    const { app } = loadAppsScript({ roster: getMockRoster(5), expenses: [
      getMockExpense({ amount: 7, payer: 'Person 4', split: 'Bob' }),
      getMockExpense({ amount: 5, payer: 'Person 4', split: 'Cara' }),
      getMockExpense({ amount: 8, payer: 'Person 5', split: 'Alice' })
    ] });
    let message;
    app.safeAlert = value => { message = value; };
    app.diagnose();
    assert.match(message, /Settlement rows: 3/);
  });

  it('uses the same minimum payments in report cells and generated PDF instructions', () => {
    const roster = getMockRoster(5).map(person => ({ ...person, email: `person${person.id}@example.test` }));
    const { app, setup, reports } = loadAppsScript({ roster, expenses: [
      getMockExpense({ amount: 7, payer: 'Person 4', split: 'Bob' }),
      getMockExpense({ amount: 5, payer: 'Person 4', split: 'Cara' }),
      getMockExpense({ amount: 8, payer: 'Person 5', split: 'Alice' })
    ] });
    setup.getRange('B2').setValue('Regression trip');
    setup.getRange('B6').setValue(true);
    app.updateSendReportsSheet();
    const payments = plain(reports.getRange(12, 1, 3, 3).getValues());
    const outgoing = [];
    let notification;
    // Mock only PDF conversion and email delivery; capture the real report HTML.
    app.HtmlService = {
      createHtmlOutput(html) {
        return {
          getAs(type) {
            assert.equal(type, 'application/pdf');
            return { html, setName(name) { this.name = name; return this; } };
          }
        };
      }
    };
    app.MailApp = {
      sendEmail(to, subject, body, options) { outgoing.push({ to, subject, body, options }); }
    };
    app.safeAlert = message => { notification = message; };
    app.sendPdfReports();
    assert.equal(outgoing.length, 5);
    assert.match(notification, /Sent: 5, Skipped \(no email\): 0, Failed: 0/);
    for (const person of roster) {
      const email = outgoing.find(item => item.to === person.email);
      const html = email.options.attachments[0].html;
      const [, actions] = /<h4>Your Settlement Actions<\/h4>\s*<ul>(.*?)<\/ul>/s.exec(html);
      const expected = payments.flatMap(([from, to, amount]) => {
        if (from === person.name) return [`<li>You pay <b>${to}</b> ₹${amount.toFixed(2)}</li>`];
        if (to === person.name) return [`<li><b>${from}</b> pays you ₹${amount.toFixed(2)}</li>`];
        return [];
      }).join('');
      assert.equal(actions, expected);
    }
  });
});
