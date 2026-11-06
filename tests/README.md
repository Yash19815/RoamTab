# Calculation Tests

Run from the repository root with Node.js 22 or newer:

```sh
node --test
node --test tests/calculations.test.cjs
node --test tests/settlements.test.cjs
node --test tests/optimal-settlements.test.cjs
node --test tests/pdf-report.test.cjs
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
- Check the production exact solver against the independent exhaustive oracle for 625 balanced five-person cases and 200 seeded groups of up to 10 people.
- Verify known minimum counts with 15 people and report timing for 20 maximum-size local cases without flaky runtime assertions.
- Verify the simple explanation template with outstanding debt, outstanding credit, and the smaller payment amount; check exact cents, configured currency, report cleanup after roster changes or unconfirmation, and identical sheet/PDF payment instructions.
- Check PDF statement pay/receive/settled states, payment-first reading order, personal expense filtering, escaped user content, and complete 500-row output.
- Exercise real menu/B6/B7 setup confirmation, pasted roster growth, count shrink/regrowth without name or email loss, dynamic expense headers, legacy summary cleanup, and an always-live Send Reports!H:K summary.

## Visual PDF Previews

Run `node tests/preview-pdf.cjs` to generate receive, pay, settled, and 80-expense HTML samples in `tests/previews/`. The samples call the production report builder with fictional ledger data; they never send email. Open the HTML files in a browser, then print to A4 PDF with browser headers and footers disabled.

Inspect single-page spacing, currency glyphs, long descriptions, repeated table headings, final totals, and page boundaries. Local Chromium rendering is a visual check, not a substitute for verifying Apps Script's actual HTML-to-PDF converter. The repository includes sample preview artifacts; `.claspignore` excludes them from Apps Script uploads. The command regenerates HTML only; refresh PDF and PNG samples separately after design changes.

## Findings

The tested positive amounts with up to two decimal places preserve money and produce settlement plans that clear every balance. This is regression evidence, not a proof for every possible input.

Ungrouped greedy matching **does not guarantee the minimum number of transfers**. The production solver now finds the exact minimum using subset DP. The regression case uses these net balances:

| Person | Net balance |
| --- | ---: |
| Alice | −₹8 |
| Bob | −₹7 |
| Cara | −₹5 |
| Person 4 | +₹12 |
| Person 5 | +₹8 |

The greedy helper alone generates four transfers. The production exact solver uses three: Alice pays Person 5 ₹8; Bob and Cara pay Person 4 ₹7 and ₹5. The suite checks both algorithms and recreates the balances from expense rows. Greedy-only tests preserve the baseline limitation; exact-solver tests require the globally minimum count.

Remainders go to included participants in ascending ID order, not necessarily to the payer. Unknown subgroup names are currently ignored if at least one valid name remains; a test documents this behavior.

## Boundaries

The test oracle exhaustively partitions balances into zero-sum groups and is limited to 10 nonzero balances. Production instead uses an `O(n × 2^n)` prefix DP for up to 15 people, reconstructs the optimal groups, and uses the greedy helper only within those groups. It rejects invalid balances and aggregate magnitudes outside JavaScript's safe integer range. No automated coverage percentage is enforced.

These tests do not validate Google Sheets trigger delivery, real formatting, authorization, PDF conversion, or actual email delivery. PDF instruction HTML and email requests are inspected through mocked service boundaries. Local benchmark timings do not establish Apps Script execution time. The suite does not establish support for negative expenses, arbitrary-precision amounts, or amounts beyond JavaScript's safe integer range.
