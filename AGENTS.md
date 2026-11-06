# Repository Guidelines

## Project Structure & Module Organization

- `Code.js` contains the Google Apps Script engine: spreadsheet setup, edit triggers, ledger calculations, settlements, and PDF email reports.
- `appsscript.json` configures the V8 runtime and `Asia/Kolkata` timezone; `.clasp.json` maps the local files to an Apps Script project.
- `README.md` describes user workflows. Its `main.gs` and `assets/` references are outdated; neither exists in this checkout. There are no separate source, test, or asset directories.

## Build, Test, and Development Commands

- No package manifest, dependency installation, build pipeline, or local server is configured. Execution occurs in Google Sheets.
- With Node.js and the Google clasp CLI installed, use:

```sh
node --check Code.js
clasp login
clasp status
clasp push
clasp open
```

- These commands check JavaScript syntax, authenticate, inspect synchronization status, upload files, and open the Apps Script editor, respectively. Point `.clasp.json` at your development copy before pushing. Syntax checks do not validate Google service calls.

## Coding Style & Naming Conventions

- Follow existing JavaScript: two-space indentation, semicolons, single-quoted strings, and `const` for values that are not reassigned.
- Use camelCase functions and variables, UPPER_SNAKE_CASE constants, and trailing underscores for internal helpers such as `buildLedger_()`.
- Preserve `onOpen()` and `onEdit(e)` trigger names. Calculate money in integer minor units and batch spreadsheet reads/writes. No linter or formatter is configured.

## Testing Guidelines

- No automated test framework or coverage threshold exists. Validate changes in a disposable spreadsheet copy; `setup()` clears and rebuilds tracker sheets.
- Exercise 2- and 15-person rosters, blank/`All` and subgroup splits, rounding remainders, roster changes, and expense confirmation/reopening. Verify balances sum to zero and settlements clear them.
- Run `diagnose()` in Apps Script. Test PDF delivery only with controlled email addresses; reporting functions send real messages.

## Commit & Pull Request Guidelines

- History uses short imperative subjects, such as `Update project architecture in README`; no enforced prefix convention is evident.
- Describe behavior changes, link relevant issues, and record syntax checks and manual scenarios. Include screenshots for sheet layout changes and update documentation when workflows change.
- AI-authored commits must include a `Co-Authored-By` trailer identifying the agent.
