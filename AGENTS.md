# Repository Guidelines

## Project Structure & Module Organization

- `Code.js` contains the Google Apps Script engine: classic setup/ledger/settlements/PDF email and the optional mobile workbook, budgets, submissions, recovery, and migration logic. Keep the runtime together: `scripts/pre-push` copies this complete file to the template checkout.
- `TripJson.html` is the Apps Script HTML dialog for portable JSON download/import. `appsscript.json` configures V8 and neutral `Etc/UTC`; trip dates follow the spreadsheet timezone selected in `Setup!E4`. `.clasp.json` maps the checkout to its Apps Script project.
- `tests/` contains Node.js tests and spreadsheet/service mocks; `assets/` contains curated screenshots; `docs/` contains architecture, upload instructions, marketing drafts, and design/implementation records. `tests/previews/` contains ignored generated artifacts.
- `README.md` is the user/developer entry point. See `docs/architecture.md` for function/storage contracts and `tests/README.md` for verification boundaries.

## Build, Test, and Development Commands

- No package manifest, npm dependencies, build pipeline, or local server is configured. Execution occurs in Google Sheets. Tests use Node.js 22+ built-in modules; hook tests also require Git and Git Bash on Windows.
- With Node.js installed, run the first two commands locally. The remaining commands require the optional Google clasp CLI:

```sh
node --check Code.js
node --test
clasp login
clasp show-file-status
clasp push
clasp open-script
```

- These commands check syntax, run regression tests, authenticate, inspect upload files, upload source, and open the Apps Script editor. Point `.clasp.json` at a disposable development copy before pushing. Syntax/mocked tests do not validate actual Google service calls or native mobile behavior.
- The optional installed pre-push hook uploads template then main project, including working-tree edits. It does not run tests or migrate spreadsheets. Follow `docs/pre-push-setup.md` before exercising an upload-capable Git command.

## Coding Style & Naming Conventions

- Follow existing JavaScript: two-space indentation, semicolons, single-quoted strings, and `const` for values that are not reassigned.
- Use camelCase functions and variables, UPPER_SNAKE_CASE constants, and trailing underscores for internal helpers such as `buildLedger_()`.
- Preserve `onOpen()`, `onEdit(e)`, and `onAuthorizedEdit(e)` trigger names. Calculate money in integer minor units and batch spreadsheet reads/writes. No linter or formatter is configured.
- Preserve classic A:F inputs/G+ outputs until explicit upgrade. Version 3 uses A:G inputs, H identities, I:W participant output, and X:Y warnings/acknowledgements. Do not clear category/ID columns through legacy generated-range cleanup.
- Keep application-managed properties and _Tracker State consistent through the existing commit/journal helpers. Script locks do not prevent arbitrary owner cell edits; maintenance requires the documented editing pause.

## Testing Guidelines

- The automated suite uses `node:test` and runs the actual `Code.js` in isolated VM contexts with mocked Google boundaries. No coverage threshold is configured. Run focused tests for changed behavior and the full suite for integrated runtime changes.
- Validate Google service and mobile changes in a disposable spreadsheet copy. `setup()` resets classic active sheets; upgraded workbooks use the checkpointed New Trip path. Upgrade existing inputs through `upgradeMobileWorkbook()`, never initialization.
- Exercise 2- and 15-person rosters, blank/`All` and subgroup splits, rounding remainders, roster changes, and expense confirmation/reopening. Verify balances sum to zero and settlements clear them.
- Run `diagnose()` in Apps Script. Test PDF delivery only with controlled email addresses; reporting functions send real messages.
- Exercise version 1/2 imports, schema 3 round trips, invalid drafts, retries versus identical deliberate submissions, budget currency review, and restoration/failure paths. Test native Android/iPhone controls separately from the local mocks and keep release status accurate.

## Commit & Pull Request Guidelines

- History uses short imperative subjects, such as `Update project architecture in README`; no enforced prefix convention is evident.
- Describe behavior changes, link relevant issues, and record syntax checks and manual scenarios. Include screenshots for sheet layout changes and update documentation when workflows change.
- AI-authored commits must include a `Co-Authored-By` trailer identifying the agent.
