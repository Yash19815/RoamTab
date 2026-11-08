const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { getMockRoster, getMockExpense, loadAppsScript } = require('./helpers/apps-script.cjs');

function getReport(overrides = {}) {
  const { app } = loadAppsScript({ expenses: [
    getMockExpense({ amount: 120, payer: 'Alice', description: 'Hotel stay' }),
    getMockExpense({ amount: 60, payer: 'Bob', split: 'Bob, Cara', description: 'Dinner' }),
    getMockExpense({ amount: 30, payer: 'Cara', split: 'Alice, Bob', description: 'Taxi' })
  ], ...overrides });
  const ledger = app.buildLedger_();
  const settlements = app.calculateOptimalSettlements_(ledger);
  return {
    app, ledger, settlements,
    render(person = ledger.roster[0], options = {}) {
      return app.buildParticipantReportHtml_({
        ledger, settlements, person, tripName: 'Goa weekend', currency: '₹',
        generatedOn: '06-Nov-2026', ...options
      });
    }
  };
}

describe('Participant PDF statement', () => {
  it('puts a clear receive amount and payment instructions before the expense details', () => {
    const report = getReport();
    const html = report.render();
    assert.match(html, /You will receive/);
    assert.match(html, /₹65</);
    assert.match(html, /Cara<\/b> pays you ₹40</);
    assert.match(html, /Bob<\/b> pays you ₹25</);
    assert.ok(html.indexOf('Your Settlement Actions') < html.indexOf('Your expense details'));
    assert.match(html, /Prepared for <strong>Alice<\/strong>/);
  });

  it('states the positive amount to pay rather than relying on a negative sign or color', () => {
    const report = getReport();
    const html = report.render(report.ledger.roster[1]);
    assert.match(html, /You need to pay/);
    assert.match(html, /You pay <b>Alice<\/b> ₹25</);
    assert.match(html, /Your net balance/);
    assert.match(html, /-₹25</);
  });

  it('has an explicit all-settled state with no payment instructions', () => {
    const report = getReport({ expenses: [getMockExpense({ amount: 10, split: 'Alice' })] });
    const html = report.render();
    assert.match(html, /All settled/);
    assert.match(html, /No settlement required\./);
    assert.doesNotMatch(html, /You need to pay|You will receive/);
  });

  it('lists only expenses the participant paid or shared, including zero-share payments', () => {
    const report = getReport();
    const html = report.render();
    assert.match(html, /Hotel stay/);
    assert.match(html, /Taxi/);
    assert.doesNotMatch(html, /Dinner/);
    const outsideSplit = getReport({ expenses: [
      getMockExpense({ payer: 'Alice', split: 'Bob, Cara', description: 'Paid for friends' })
    ] });
    assert.match(outsideSplit.render(), /Paid for friends/);
    assert.match(outsideSplit.render(), /Your total share/);
  });

  it('escapes participant names, trip names, descriptions, dates, and currency', () => {
    const roster = getMockRoster(2);
    roster[0].name = 'Alice <script>alert(1)</script>';
    const report = getReport({ roster, expenses: [getMockExpense({
      payer: roster[0].name, description: '<img src=x onerror=alert(1)>', date: '<unsafe-date>'
    })] });
    const html = report.render(report.ledger.roster[0], { tripName: '<Trip & friends>', currency: '<USD>' });
    assert.match(html, /&lt;Trip &amp; friends&gt;/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /&lt;unsafe-date&gt;/);
    assert.match(html, /&lt;USD&gt;/);
    assert.doesNotMatch(html, /<script>|<img |<unsafe-date>|<USD>/);
  });

  it('keeps all 500 expense rows, a personal total, and the final record for long reports', () => {
    const report = getReport({ expenses: Array.from({ length: 500 }, (_, index) => getMockExpense({
      amount: 3, description: `Expense ${index + 1}`
    })) });
    const html = report.render();
    assert.equal((html.match(/class="expense-row"/g) || []).length, 500);
    assert.match(html, /Expense 500/);
    assert.match(html, /Your total share/);
    assert.match(html, /₹500</);
  });

  it('shows an empty personal expense state without inventing any expenses', () => {
    const report = getReport({ expenses: [] });
    const html = report.render();
    assert.match(html, /No expenses involve you\./);
    assert.match(html, /All settled/);
  });
});
