# Calculation Tests

Run from the repository root with Node.js 22 or newer:

```sh
node --test
node --test tests/calculations.test.cjs
node --test tests/settlements.test.cjs
node --test tests/optimal-settlements.test.cjs
node --test tests/pdf-report.test.cjs
node --test tests/trip-records.test.cjs
node --test tests/trip-json-dialog.test.cjs
node --test tests/splits-fx.test.cjs
node --test tests/timezone-rounding.test.cjs
node --test tests/pre-push.test.cjs
```

No dependencies, Google credentials, live spreadsheets, or email access are required.

Hook tests additionally require Git and Git for Windows Bash at `C:\Program Files\Git\bin\bash.exe` on Windows, or `/bin/bash` elsewhere. They run the unchanged production hook in real temporary Git checkouts with environment-configured template paths, spaces and parentheses in directory names, and mocked upload commands. They check automatic source detection, required/absolute/distinct template paths, native Windows paths, repository-local Git fallback without an inherited variable, environment precedence, copy/verification failures, both project configurations, template-before-main upload order, unattended changed-manifest uploads with `--force`, unchanged local manifests, clasp failures and skipped uploads for either project, both working directories, and stdin isolation for each upload. They do not upload to Google or modify the real target repository. See [hook installation and live verification](../docs/pre-push-setup.md).

## Scope

- Execute the actual `Code.js` using `node:vm`; production functions are neither copied nor replaced.
- Mock spreadsheet reads and writes with fresh factory data for each test. Formatting methods are inert.
- Check integer minor-unit conversion, equal shares, deterministic remainder allocation, and amounts smaller than participant counts.
- Check positional exact and named percentage splits, strict totals, unknown names, duplicate percentages, zero weights, decimal percentages, and seeded 2–15-person trips.
- Check historical FX in all split modes, exact decimal-rate rounding, 500 foreign rows with 2 and 15 people, date/timezone validation, per-pair/date caching, six-hour cache eviction, fixed 24-hour persistent expiry, API failures, simple/authorized edits, layout migration, and version 1/2 trip restoration.
- Check totals paid and consumed, per-person net balances, case-insensitive subgroup names, duplicate selections, incomplete rows, invalid payers, and the 500-row input limit.
- Verify signed expense cells and live summary values written by `recalculateAll()`.
- Verify settlements contain positive integer amounts, use valid debtor/creditor directions, clear each balance exactly, and preserve input balances.
- Exercise 100 seeded trips, 1,000 seeded balance groups, and 100 small groups compared with an independent exact oracle.
- Check the production exact solver against the independent exhaustive oracle for 625 balanced five-person cases and 200 seeded groups of up to 10 people.
- Verify known minimum counts with 15 people and report timing for 20 maximum-size local cases without flaky runtime assertions.
- Verify the simple explanation template with outstanding debt, outstanding credit, and the smaller payment amount; check whole-unit output, configured currency, report cleanup after roster changes or unconfirmation, and identical sheet/PDF payment instructions.
- Check timezone controls inherit the spreadsheet setting, accept custom supported zones, reject invalid/blank zones, and preserve winter/summer calendar dates. Confirm snapshots and FX date selection use the selected timezone.
- Check nearest-unit payments including .49, .50, both requested ₹455 examples, zero-payment removal, unchanged raw expense values, and reconciled sheet/PDF net balances. Seeded 2–15-person groups clear their rounded balances exactly.
- Check PDF statement pay/receive/settled states, payment-first reading order, personal expense filtering, escaped user content, and complete 500-row output.
- Exercise real menu/B6/B7 setup confirmation, pasted roster growth, count shrink/regrowth without name or email loss, dynamic expense headers, legacy summary cleanup, and an always-live Send Reports!H:K summary.
- Exercise trip saves from the menu and E6, repeated archive updates, JSON parts beyond one cell, 15-person/500-expense round trips, real dates, incomplete rows, inactive roster entries, confirmation restoration, save-before-load/reset behavior, import validation, formula-like text, and selected-record deletion with confirmation.

## Visual PDF Previews

Generated files in `tests/previews/` are local artifacts ignored by Git. Keep intentional documentation screenshots in `assets/`.

Run `node tests/preview-pdf.cjs` to generate receive, pay, settled, and 80-expense HTML samples in `tests/previews/`. The samples call the production report builder with fictional ledger data; they never send email. Open the HTML files in a browser, then print to A4 PDF with browser headers and footers disabled.

Inspect single-page spacing, currency glyphs, long descriptions, repeated table headings, final totals, and page boundaries. Local Chromium rendering is a visual check, not a substitute for verifying Apps Script's actual HTML-to-PDF converter. The repository includes sample preview artifacts; `.claspignore` excludes them from Apps Script uploads. The command regenerates HTML only; refresh PDF and PNG samples separately after design changes.

## Findings

The tested positive amounts with up to two decimal places preserve money in the accounting ledger. Production payments round the exact plan to whole units for both parties, then solve the resulting balanced payment ledger. Those plans clear the rounded balances; sub-unit differences from the original expense ledger are intentional rounding adjustments. This is regression evidence, not a proof for every possible input.

Ungrouped greedy matching **does not guarantee the minimum number of transfers**. The production solver now finds the exact minimum using subset DP. The regression case uses these net balances:

| Person | Net balance |
| --- | ---: |
| Alice | −₹8 |
| Bob | −₹7 |
| Cara | −₹5 |
| Person 4 | +₹12 |
| Person 5 | +₹8 |

The greedy helper alone generates four transfers. The production exact solver uses three: Alice pays Person 5 ₹8; Bob and Cara pay Person 4 ₹7 and ₹5. The suite checks both algorithms and recreates the balances from expense rows. Greedy-only tests preserve the baseline limitation; exact-solver tests require the globally minimum count.

Remainders go to participants with positive split weights in ascending ID order, not necessarily to the payer. Unknown subgroup names now reject the row even when another name is valid. Exact splits validate totals in the source currency before requesting FX; converted allocations reconcile to the rounded base amount.

## Boundaries

The test oracle exhaustively partitions balances into zero-sum groups and is limited to 10 nonzero balances. Production instead uses an `O(n × 2^n)` prefix DP for up to 15 people, reconstructs the optimal groups, and uses the greedy helper only within those groups. It rejects invalid balances and aggregate magnitudes outside JavaScript's safe integer range. No automated coverage percentage is enforced.

These tests do not validate Google Sheets trigger delivery, real formatting, authorization, PDF conversion, or actual email delivery. PDF instruction HTML and email requests are inspected through mocked service boundaries. Local benchmark timings do not establish Apps Script execution time. The suite does not establish support for negative expenses, arbitrary-precision amounts, or amounts beyond JavaScript's safe integer range.

Timezone tests simulate the spreadsheet timezone setter and date parser with Node's timezone database. In a disposable Google Sheet, select a suggested timezone and a custom supported timezone in E4, verify existing dates remain unchanged, and confirm reports and FX dates follow the selection. Verify invalid entries restore the previous setting. Check ₹455.76, ₹455.23, and ₹455.50 payments in Send Reports and a controlled PDF preview.

FX tests mock CacheService, document properties, ScriptApp triggers, and Frankfurter v2 responses. No live rate request is sent. In a disposable sheet, check the Currency F input and participant outputs from G, enable automatic conversion, edit dated foreign expenses from desktop/mobile, and confirm authorization and trigger delivery. Verify a weekend's prior observation, an unsupported pair error, and zero-sum balances. The ledger uses two decimal places for all currencies. A cold lookup requires network time; local timings do not establish Apps Script performance for 500 distinct uncached pairs/dates.

Archive tests simulate spreadsheet writes, locks, confirmation dialogs, and HTML template preparation. Dialog tests execute the real HTML script with simulated DOM and Apps Script boundaries, checking Blob contents, upload confirmation, file reading, and success/error handling. Verify browser download/file import and actual checkbox trigger delivery in a disposable spreadsheet. Load a saved trip after New Trip and compare dates, roster, raw expense rows, and balances. Confirm cancelled New Trip/Delete actions preserve data and saved Records survive initialization. The JSON schema restores input values, not formulas or historical email delivery statuses.
