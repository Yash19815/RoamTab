# Calculation Tests

Run from the repository root with Node.js 22 or newer:

```sh
node --test
node --test tests/calculations.test.cjs
node --test tests/settlements.test.cjs
```

No dependencies, Google credentials, live spreadsheets, or email access are required.

## Scope

- Execute the actual `Code.js` using `node:vm`; production functions are neither copied nor replaced.
- Mock spreadsheet reads and writes with fresh factory data for each test. Formatting methods are inert.
- Check integer minor-unit conversion, equal shares, deterministic remainder allocation, and amounts smaller than participant counts.
- Check totals paid and consumed, per-person net balances, case-insensitive subgroup names, duplicate selections, incomplete rows, invalid payers, and the 500-row input limit.
- Verify signed expense cells and live summary values written by `recalculateAll()`.
- Verify settlements contain positive integer amounts, use valid debtor/creditor directions, clear each balance exactly, and preserve input balances.
- Exercise 100 seeded trips, 1,000 seeded balance groups, and 100 small groups compared with an independent exact oracle.

## Findings

The tested positive amounts with up to two decimal places preserve money and produce settlement plans that clear every balance. This is regression evidence, not a proof for every possible input.

Greedy matching **does not guarantee the minimum number of transfers**. The regression case uses these net balances:

| Person | Net balance |
| --- | ---: |
| Alice | −₹8 |
| Bob | −₹7 |
| Cara | −₹5 |
| Person 4 | +₹12 |
| Person 5 | +₹8 |

The current algorithm generates four transfers. A minimum plan uses three: Alice pays Person 5 ₹8; Bob and Cara pay Person 4 ₹7 and ₹5. The suite checks both plans and recreates the balances from expense rows. This limitation test intentionally passes when it reproduces current behavior; green tests do not mean greedy is globally optimal.

Remainders go to included participants in ascending ID order, not necessarily to the payer. Unknown subgroup names are currently ignored if at least one valid name remains; a test documents this behavior.

## Boundaries

The exact oracle partitions balances into disjoint zero-sum groups. It is exponential and limited to 10 nonzero balances; production still uses the existing greedy function unchanged. No automated coverage percentage is enforced.

These tests do not validate Google Sheets trigger delivery, real formatting, authorization, PDF generation, or email sending. They do not establish support for negative expenses, arbitrary-precision amounts, or amounts beyond JavaScript's safe integer range.
