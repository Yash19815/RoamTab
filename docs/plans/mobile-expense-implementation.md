# Mobile Workbook Implementation Plan

The user accepted all review-added operating limits and authorized implementation on 2026-11-15. The approved specification is [mobile-expense-workbook.md](mobile-expense-workbook.md).

Deliver one combined change, verified incrementally:

1. Preserve the calculation engine and legacy layout until an explicit, checkpointed upgrade. Add schema version 3 normalization, categories/IDs, raw recovery storage, verified chunk writes, retention, operation journaling, and protected maintenance.
2. Add the shared validation/dashboard model, category and advisory budget settings, duplicate acknowledgement, and stricter confirmation for upgraded workbooks.
3. Build mobile sheet surfaces, participant navigation/drafts, templates, idempotent submissions, inline status, organizer recovery previews, and one authorized event route.
4. Wire trip archives, import/export, roster changes, new trips, report gates, and reconciliation to upgraded state without changing legacy calculations or existing supported archive formats.
5. Run regression and failure-path tests, syntax and packaging checks, update README and test documentation. Keep Google service, Android/iPhone, and real PDF verification explicitly separate from local proof. Do not upload or send email during local verification.

Use existing Code.js so source/template upload automation continues to copy the complete engine. No new dependencies or build pipeline are required.

## Local Implementation Outcome

The combined implementation is present in Code.js. Existing workbooks retain the classic layout until the owner runs Upgrade / Repair Mobile Workbook. The new code includes native-sheet guided entry, participant links, templates/copying, categories and charts, advisory budgets, duplicate acknowledgement, strict incomplete-row confirmation, stable expense IDs, versioned recovery, maintenance journaling, and authorized trigger installation/repair.

Classic exports retain schema version 2; upgraded exports use version 3 and accept legacy versions 1/2. Recovery captures invalid expense/setup drafts separately from portable-import validation. Budget/template recovery uses the last valid configuration. History can browse earlier trips even when invalid setup prevented a Records archive.

Submission receipts bind values to their original trip and a draft generation. Acknowledgement rotates that generation with the unchecked action control, allowing deliberate identical bills while suppressing retries. Ambiguous outcomes require inspection/cancellation rather than blind re-append. Lightweight maintenance metadata blocks ordinary processing even when an interrupted header write temporarily hides the advanced layout.

## Verification — 2026-11-15

- `node --check Code.js`: passed.
- `node --test --test-reporter=tap`: 288 tests passed, 0 failures, 0 skipped, across 11 suites.
- The 35 new mobile-workbook tests cover migration, archives, budgets, templates, duplicate/incomplete-row behavior, retries, separate-execution lock contention, long Unicode payloads, capacity/protection failures, invalid drafts, and interruption at each persisted maintenance phase.
- `git diff --check`: passed.
- Runtime packaging remains Code.js, TripJson.html, and appsscript.json. No additional runtime file needs copying to the template checkout.

No live Google upload, email delivery, or Android/iPhone validation was performed. Authorization, actual protections and trigger delivery, native navigation/charts, Apps Script timing, and controlled PDF delivery remain the release gates in [tests/README.md](../../tests/README.md#mobile-workbook-tests-and-release-checks). Activation instructions are in [README.md](../../README.md#mobile-workbook-upgrade).

## Documentation Maintenance — 2026-11-15

The documentation refresh separates classic and upgraded workbook behavior, documents the implemented function/state contracts, adds deployment and compatible-rollback instructions, and corrects the contributor guide's timezone and test-framework descriptions. Runtime changes in this refresh are comments only. The historical 288-test result above remains unchanged; documentation checks cover local links/anchors, desktop menu coverage, syntax, and whitespace. Current clasp command names were checked against the official reference; no clasp binary was available locally and no Google upload was attempted.
