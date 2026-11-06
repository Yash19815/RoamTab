const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { getMockExpense, loadAppsScript } = require('./helpers/apps-script.cjs');

const outputDirectory = path.join(__dirname, 'previews');
mkdirSync(outputDirectory, { recursive: true });

function writeTripPreview(name, expenses, personIndex = 0, tripName = 'A long weekend in Goa') {
  const { app } = loadAppsScript({ expenses });
  const ledger = app.buildLedger_();
  const settlements = app.calculateOptimalSettlements_(ledger);
  const html = app.buildParticipantReportHtml_({
    ledger, settlements, person: ledger.roster[personIndex], tripName,
    currency: '₹', generatedOn: '06-Nov-2026'
  });
  const outputPath = path.join(outputDirectory, `${name}.html`);
  writeFileSync(outputPath, html);
  console.log(outputPath);
}

const expenses = [
  getMockExpense({ date: '01-Nov-2026', description: 'Seaside villa · two nights', amount: 18000, payer: 'Alice' }),
  getMockExpense({ date: '01-Nov-2026', description: 'Airport transfer', amount: 1800, payer: 'Bob' }),
  getMockExpense({ date: '02-Nov-2026', description: 'Dinner at the beach', amount: 3600, payer: 'Cara' }),
  getMockExpense({ date: '02-Nov-2026', description: 'Kayaking & equipment rental', amount: 2400, payer: 'Alice', split: 'Alice, Cara' }),
  getMockExpense({ date: '03-Nov-2026', description: 'Breakfast before checkout', amount: 1200, payer: 'Bob' })
];
writeTripPreview('participant-receive', expenses);
writeTripPreview('participant-pay', expenses, 1);
writeTripPreview('participant-settled', [getMockExpense({ description: 'Personal lunch', amount: 450, split: 'Alice' })]);
writeTripPreview('participant-long', Array.from({ length: 80 }, (_, index) => getMockExpense({
  date: '02-Nov-2026', amount: 333.33, payer: ['Alice', 'Bob', 'Cara'][index % 3],
  description: index === 79 ? 'FINAL EXPENSE · Return airport transfer' : `Travel expense ${index + 1} · meals, local transport, and shared activities`
})), 0, 'Goa & the Konkan coast · shared travel statement');
