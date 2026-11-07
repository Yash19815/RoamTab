<div align="center">

# ✈️ Dynamic Group Travel Expense Splitter

**A zero-dependency, open-source Splitwise alternative built directly inside Google Sheets.**
Instant per-person split calculations, a live group summary panel, exact minimum-transfer settlements, and 1-click personalized PDF email reports.

[![Google Apps Script](https://img.shields.io/badge/Google%20Apps%20Script-4285F4?style=for-the-badge&logo=google&logoColor=white)](#quick-start)
[![Google Sheets](https://img.shields.io/badge/Google%20Sheets-34A853?style=for-the-badge&logo=googlesheets&logoColor=white)](#quick-start)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=for-the-badge)](#contributing)

<br />

<a href="#quick-start">
  <img src="assets/Expense%20Tab.png" alt="Expense tracker with per-person splits and live group balances" width="850" />
</a>

<br /><br />

[**🚀 Click Here to Make a Copy in Google Drive**](https://docs.google.com/spreadsheets/d/1RhpHiZl04dA-AfKIuFesJz137zO-eatgfG5TYGRXXJM/copy)
*(No installation required for non-technical users)*

</div>

---

## 🌟 Why Use This Over Splitwise?

* **Self-Hosted in Google Sheets:** No application subscription or ads. Supports up to 15 people and 500 expense rows per tracker; Google service quotas still apply.
* **Live Calculations:** Per-person net columns update on expense edits. Local expenses need no API call; foreign rates are fetched on the first lookup and reused for 24 hours.
* **Flexible Splits:** Use positional exact amounts, named percentages, or equal shares in the same Split Among cell.
* **Historical Currency Conversion:** Blank row currencies inherit the trip base currency. Override with an ISO code to convert using the transaction date.
* **Live Summary Panel:** **Send Reports!H:K** always shows total group spending, each person's paid amount, consumed share, and net balance. It updates while editing expenses, even before confirmation.
* **Exact Settlement Engine:** On confirmation, uses subset dynamic programming to find the fewest possible transfers for up to 15 people. Every settlement row explains the outstanding debt, credit, and payment amount.
* **Automated PDF Email Statements:** Generates clean, personalized HTML/PDF expense reports — each person receives only the expenses that involve them — dispatched via Gmail in one click.
* **Dynamic Roster Scaling:** Scale your group seamlessly from 2 to 15 people — the grid, dropdowns, person columns, and summary panel auto-adjust on the fly.
* **Mobile Editing & Confirmation:** Enter expenses and confirm setup through checkboxes in the Sheets app. Send PDF emails from the desktop menu or Apps Script editor.
* **Reusable Trip Records:** Save complete trip inputs as JSON, download a portable file, reload past trips, and start a blank trip in the same spreadsheet.

---

## 📸 Screenshots & Workflow

### 1. Trip & Roster Setup

<img src="assets/Setup.png" alt="Setup tab with trip name, participant count, currency, and four-person roster" width="586" />

### 2. Expense Tracker

<img src="assets/Expense%20Tab.png" alt="Expenses tab showing shared expenses, individual balances, and the live summary" width="100%" />

*Sheet screenshots show the previous layout. The current version adds Currency in **Expenses!F**, starts participant outputs at **G**, and keeps the live summary in **Send Reports!H:K**.*

### 3. Simplified Settlements

<img src="assets/Final_Settlement.png" alt="Personal balances and minimum-transfer settlement plan with payment explanations" width="100%" />

### 4. Generated Participant PDF

<table width="100%">
  <tr>
    <td width="50%" align="center" valign="top">
      <b>Receive money</b><br /><br />
      <a href="assets/pdf-report.png"><img src="assets/pdf-report.png" alt="Receive statement showing Alice's amount to collect and incoming payments" width="100%" /></a>
    </td>
    <td width="50%" align="center" valign="top">
      <b>Pay money</b><br /><br />
      <a href="assets/pdf-report-pay.png"><img src="assets/pdf-report-pay.png" alt="Pay statement showing Bob's amount owed and payment instructions" width="100%" /></a>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <b>All settled</b><br /><br />
      <a href="assets/pdf-report-settled.png"><img src="assets/pdf-report-settled.png" alt="All-settled statement with zero outstanding balance and no payment required" width="100%" /></a>
    </td>
    <td width="50%" align="center" valign="top">
      <b>Long statement — first page</b><br /><br />
      <a href="assets/pdf-report-long.png"><img src="assets/pdf-report-long.png" alt="First page of the six-page statement covering 80 expenses" width="100%" /></a>
    </td>
  </tr>
</table>

*PNG screenshots from the rendered [test previews](tests/preview-pdf.cjs), using fictional trip data. Click any image to view it at full size.*

---

<a id="quick-start"></a>

## ⚡ Quick Start

Use a Google account with permission to edit your own spreadsheet copy. Node.js and clasp are only needed for local development.

**Initialize only on a fresh copy:** `setup()` / `1. Initialize / Reset Tracker` clears the **Setup**, **Expenses**, and **Send Reports** sheets. Updating script code does not require running initialization again.

Saved **Records** survive initialization. Use **New Trip** for the next journey: it saves current inputs before clearing the active trip. After installing this update, reload the spreadsheet to add Records and the Save Trip checkbox without resetting existing inputs.

### Option A: 1-Click Google Sheet Template (Easiest)
1. Click the **[Make a Copy Template Link](https://docs.google.com/spreadsheets/d/1RhpHiZl04dA-AfKIuFesJz137zO-eatgfG5TYGRXXJM/copy)**.
2. Open the newly created spreadsheet in your Google Drive.
3. Reload the spreadsheet to load the **Expense Splitter** menu, then select `1. Initialize / Reset Tracker` on the fresh copy.
4. Authorize the script when prompted, then follow **Daily workflow** below. If the menu is missing, open **Extensions → Apps Script** and run `setup()` once.

### Option B: Manual Setup via Google Apps Script
1. Create a blank **Google Sheet**.
2. Navigate to **Extensions** → **Apps Script**.
3. Replace all content in `Code.gs` with the code from [`Code.js`](Code.js).
   Add an HTML file named `TripJson` in Apps Script and copy [`TripJson.html`](TripJson.html) into it for JSON downloads and imports.
4. In Apps Script **Project Settings**, enable the manifest editor and copy [`appsscript.json`](appsscript.json) into the project's `appsscript.json` to match the V8 runtime and timezone.
5. Save, select `setup` in the function dropdown, and click **Run** to initialize the blank sheet and authorize the script.
6. Reload Google Sheets to load the **Expense Splitter** menu, then follow the workflow below.

### Daily workflow

1. Fill in the trip name, participant count, base currency, and unique participant names on **Setup**. Emails are optional. Use names without commas so subgroup selections remain unambiguous.
2. Select **Expense Splitter → Confirm / Update Setup**, or tick `Setup!B6` / `Setup!B7` on mobile.

    Adding names below the active roster automatically raises **Number of People**, up to 15. You can also change `Setup!B3` directly. Reducing the count deactivates extra rows but preserves their names and emails; raising it restores those entries.
3. Enter expenses in **Expenses!A2:F501**. Choose a payer and a [split](#three-split-modes). Leave Currency blank for the base currency. For foreign expenses, first select **Enable Automatic Currency Conversion** from the desktop menu and authorize once; then enter the transaction date and an ISO code in F.
4. When ready to review, select **Confirm All Expenses** and open **Send Reports**. On mobile, tick `Setup!B6`; if already checked, clear it and tick it again to refresh.
5. To send statements, use **3. Send PDF Reports via Email** on desktop and grant email permission if requested. Review delivery status in **Send Reports**.
6. Save the completed trip with **Save Trip** or the `Setup!E6` checkbox. Use **New Trip** to reuse this spreadsheet.

Confirmation is a report-visibility gate, not an edit lock: expense edits continue to recalculate the plan. Changing setup details resets confirmation. After renaming or removing participants, update their names in existing **Paid By** and **Split Among** entries before reconfirming.

---

## 🧭 The Four Tabs

### 1️⃣ Setup
Configure the trip and the group:

| Cell | Setting | Default |
|------|---------|---------|
| `Setup!B2` | Trip Name / Destination | Goa Vacation 2026 |
| `Setup!B3` | Number of Participants (dropdown 2–15) | 4 |
| `Setup!B4` | Base currency: ISO code or supported symbol | ₹ (INR) |
| `Setup!B5` | Setup Status (auto-validated) | — |
| `Setup!B6` | **Setup Confirmed?** checkbox; also gates settlement/report output | ☐ FALSE |
| `Setup!B7` | **Confirm / Update Setup** checkbox action; resets after use | ☐ FALSE |
| `Setup!E6` | **Save Trip** checkbox action; saves a complete JSON snapshot in Records and resets after use | ☐ FALSE |
| `Setup!E3` | Current trip ID; maintained by the script to update the same archive on repeated saves | — |
| `Setup!A9:C…` | Roster: `#` · `Name` · `Email (optional)` — rows scale with B3 | — |

> Emails are **optional** — only people with an email address receive PDF reports; everyone else is cleanly skipped and logged.

### 2️⃣ Expenses
Enter expenses in columns **A–F**; everything else is computed live:

| Column | Field | Type |
|--------|-------|------|
| A | Date | Date-validated (dd-mmm-yyyy) |
| B | Description | Free text |
| C | Amount | Positive amount in the row currency; up to two decimal places |
| D | Paid By | Dropdown, auto-filled from roster |
| E | Split Among | Exact amounts, named percentages, `All`, blank, or comma-separated names |
| F | Currency | Blank inherits Setup!B4; use an ISO code for an override |
| G+ | *One column per person* | Net in base currency: amount paid minus personal share; + collect / − owe |

The live summary is in **Send Reports!H:K**. Expenses contains input columns A:F and participant net columns from G onward. Recalculation or setup confirmation upgrades older trackers automatically: A:E inputs survive, the former generated F output becomes blank Currency input, and participant outputs are rebuilt from G. Later rebuilds preserve F currencies.

**LIVE SUMMARY example (Send Reports):** Priya pays a ₹10,000 bill split equally among four people. Total Spent (Everyone) is ₹10,000:

| Person | Paid | Spent (Share) | Net (+ collect / − owe) |
|--------|-----:|--------------:|-----------------------:|
| Rahul | ₹0 | ₹2,500 | −₹2,500 |
| Priya | ₹10,000 | ₹2,500 | +₹7,500 |
| Amit | ₹0 | ₹2,500 | −₹2,500 |
| Neha | ₹0 | ₹2,500 | −₹2,500 |

**Duo example:** if Person 2 pays a ₹1,000 hotel bill split between both, the summary shows **Spent ₹500** for each person. Person 1's net is **−₹500** and Person 2's net is **+₹500**. The generated expense-row columns show those signed nets, not the ₹500 shares.

### 3️⃣ Send Reports
The live summary in **H:K** is always available and recalculates on expense edits. The report and settlement tables in **A:F** require `Setup!B6` (**Setup Confirmed?**) to be checked. Use **Confirm All Expenses** to refresh the report after reviewing expenses. It shows:

* **Personal Balances Summary** — per-person Total Paid, Total Share, Net Balance, and email delivery status.
* **Simplified Settlement Plan** — the minimum set of "X pays Y ₹amount" transactions that settles the whole group.

### 4️⃣ Records

Each saved trip occupies one row. Columns A:E show the trip ID, name, UTC save time, number of nonempty expense input rows, and JSON part count. JSON occupies F onward in parts of at most 40,000 characters, each prefixed `JSON:`. Large trips therefore fit across multiple cells. Keep archive cells and the current trip ID unchanged; use the menu to manage records.

- **Save:** select **Expense Splitter → Save Trip**, or tick `Setup!E6`. Saving again updates the current trip's existing archive, including after loading that trip. Saves are manual snapshots; individual edits do not automatically update Records.
- **Load:** select a cell in one saved trip's Records row, then choose **Load Selected Trip**. Current inputs are saved before the selected trip replaces them. Expense columns, summaries, and settlement plans are rebuilt without sending email.
- **Download:** select a saved trip row and choose **Download Selected Trip JSON**, then click the download link. This creates one `.json` file on your device. Save current changes first if you want them in the file.
- **Import:** choose **Import Trip JSON**, select a downloaded file, and confirm **Import and load trip**. The file receives a new trip ID, current inputs are saved, and the imported trip is loaded and added to Records.
- **Delete:** select a saved trip row and choose **Delete Selected Trip**. Confirm to remove only that archive. Active inputs and downloaded files remain available; saving active inputs again creates a new archive if its record was deleted.
- **New trip:** choose **New Trip** and confirm. Current inputs are saved first; trip name, participant names, expenses, and confirmation are cleared. The blank canvas starts with two participant slots and ₹ currency. Saved Records remain available.

Snapshots include trip name, base currency, participant count, all 15 roster slots (including inactive names and emails), confirmation, and all 500 supported expense input rows in A:F. Draft entries, interior blank rows, all split modes, row currencies, and actual date values survive a round trip. Only trailing empty rows are omitted. Formulas are saved as their current values. JSON schema version 2 adds row currencies; version 1 files still load with blank inherited currencies. Derived output is recalculated on load; FX cache entries and email delivery statuses are not exported. Loading historical trips can therefore fetch rates again.

Incomplete names and draft expenses can be saved. Participant count must still be 2–15. Invalid or unsupported JSON is rejected before replacing inputs. Loading requires the same spreadsheet timezone as the saved trip, preserving date instants and calendar display. JSON contains participant emails and expense details, so share files with the same care as the spreadsheet.

On mobile, `Setup!E6` saves to Records. File download/import and record-management menu actions use desktop Google Sheets. JSON files download through the browser; no Drive file or email is created.

---

## ⚙️ How It Works

### Supported inputs & delivery

- Supports **2–15 participants** and **500 expense rows**, starting at row 2. Rows after 501 are not included in calculations.
- Enter positive amounts with up to two decimal places. Empty/incomplete rows and non-positive or non-numeric amounts are ignored; refunds and negative expenses are not supported.
- Names match without case sensitivity or surrounding spaces. Duplicate equal-split names count once. Unknown names and duplicate percentage entries produce row errors and block settlement and PDF sending.
- All currencies currently use two decimal places for ledger units, including codes whose standard minor-unit precision differs. Use ISO codes for ambiguous symbols; `$` means USD.
- Sending reports is manual. Missing or invalid email addresses are skipped. Running the send action again sends another email to every valid address, including participants already marked **Sent**.
- PDF conversion and email sending use your Google account's [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas).

<a id="three-split-modes"></a>
### Three Split Modes

All three modes use **Expenses!E**, with no separate split columns:

* **Positional exact:** `400, 500, 100` charges roster positions 1, 2, and 3 those amounts. Remaining people receive zero shares. Enter amounts in the row currency; their sum must match C before conversion. A mismatch produces `Row X: Exact split total (1000) does not match total bill (1200)`. More amounts than active roster members are rejected. Roster reordering changes positional assignments.
* **Named percentages:** `Rahul 30, Neha 40, Amit 30` assigns 30%, 40%, and 30%. An optional `%` suffix and up to four decimal places are supported. Percentages must be nonnegative and sum to exactly 100%; otherwise, for example, `Row X: Split percentages total 90%, must equal 100%`. Unlisted people receive zero shares.
* **"All" or blank Split Among:** cost splits equally across the whole roster.
* **Comma-separated names** (`Rahul, Neha`): cost splits only within that subgroup.
* **Remainder handling:** percentage and equal shares round down to minor units, then distribute leftover units by ascending participant ID among people with a positive share. Exact foreign splits preserve the entered proportions after conversion and reconcile the same way. Allocations always equal the converted bill, and group balances sum to zero. Zero-weight participants never receive a remainder.

### Historical FX Conversion

Set **Setup!B4** to an ISO code such as `INR`, `USD`, `EUR`, `GBP`, or `THB`. Supported symbol aliases are `₹`, `$`, `€`, `£`, and `฿`, respectively. Blank row currencies inherit B4, and explicit matches to the base currency bypass FX services entirely. Other custom display symbols continue to work for local-only trips; foreign conversion requires a recognized base symbol or ISO code.

For a foreign expense, enter its original amount in C, transaction date in A, and currency code in F. Codes match without case sensitivity. RoamTab queries the [Frankfurter v2 historical pair endpoint](https://frankfurter.dev/) using the spreadsheet's calendar date and converts into the base currency before allocating shares. API calls require no key or external package. The first lookup requires a network request; repeated rows with the same pair and date share one request per recalculation. Frankfurter may return an earlier available observation on non-publication days; RoamTab accepts it and never substitutes a latest-rate request. Missing, invalid, future, or unavailable foreign dates and unsupported pairs produce row errors instead of an assumed rate.

Rates use keys such as `FX_USD_INR_2026-01-09`. [CacheService permits at most six hours](https://developers.google.com/apps-script/reference/cache/cache), so document properties retain each rate with a fixed 24-hour expiry. Cache misses repopulate from that backing without another API request. Expired backing entries are removed during fresh fetches. Decimal-rate conversion rounds once to base minor units before any split; totals, settlements, and PDF amounts all use the base currency.

Choose **Expense Splitter → Enable Automatic Currency Conversion** once from desktop Google Sheets and grant the requested permissions. This installs an authorized edit trigger because [simple triggers cannot call services requiring authorization](https://developers.google.com/apps-script/guides/triggers). One designated account should enable it for the spreadsheet; that account owns the trigger and consumes its fetch quota. Once enabled, edits from mobile also recalculate automatically. Repeating the action from the same account repairs a deleted trigger without creating duplicates. If the trigger owner loses access or authorization, use the menu action again from the designated account. Without an installed trigger, local rows and warm cached FX rates still recalculate; uncached foreign rows show an actionable error. **2. Recalculate Live Expenses** can fetch rates manually after authorization.

Split and FX errors appear in **Send Reports!A1** even before confirmation. Invalid rows are excluded from live totals, and settlement/PDF sending remains blocked until all errors are resolved.

### Settlement Engine (Exact Minimum Transfers)
The solver finds the largest number of independent groups whose net balances sum to zero. It then settles each group separately. If there are `n` people with nonzero balances and `g` groups, the minimum number of transfers is `n - g`.

```
Net balances → optimal independent groups → payments within each group
             → verify minimum transfer count and zero remaining balances
```

For debts of ₹8, ₹7, and ₹5 with credits of ₹12 and ₹8, the solver finds two groups: `(−₹8, +₹8)` and `(−₹7, −₹5, +₹12)`. It generates three transfers instead of the four produced by ungrouped greedy matching. The existing greedy helper is used only inside optimal groups, where it produces the required minimum.

The **Explanation** column beside each payment uses this template: “[Person A] owes ₹X. [Person B] needs ₹Y. Pay ₹[smaller of X or Y] so at least one person reaches ₹0 balance.” Names, outstanding amounts, and currency come from the actual payment plan. Payment order is deterministic, and PDF payment instructions use the same plan.

The exact solver uses `O(n × 2^n)` time and `O(2^n)` memory, with at most 32,768 subsets for 15 people. It blocks invalid balances, unsafe integer totals, and groups above the supported limit. It never substitutes an approximate plan. See the [design and decision log](docs/plans/optimal-settlements.md).

### Performance Design
* Expense inputs are read as a range and calculated in memory; participant results and summary rows are written in batches.
* Structural rebuilds (headers, dropdowns, validations) happen **only** on Setup/roster changes, never while typing expenses.
* Send Reports refreshes on expense edits and setup changes. The live summary remains visible while settlement output is unconfirmed.
* UI messages fall back from alerts to toasts or logs when dialogs are unavailable.

---

## 🧰 Menu Reference (Desktop)

| Menu Item | Action |
|-----------|--------|
| `1. Initialize / Reset Tracker` | Clears and rebuilds the three active tracker sheets; preserves Records |
| `2. Recalculate Live Expenses` | Recalculates expense nets and Send Reports live summary; settlement output requires confirmation |
| `Enable Automatic Currency Conversion` | Authorizes and installs an edit trigger for historical FX lookups; refreshes the ledger |
| `Confirm / Update Setup` | Validates the roster, rebuilds generated columns, and confirms setup |
| `Confirm All Expenses` | Publishes balances + settlement plan (assignable to a drawing button) |
| `Re-open for Editing (Unconfirm)` | Withdraws the report view |
| `Save Trip` | Saves or updates the current trip's complete JSON snapshot in Records |
| `Load Selected Trip` | Saves current inputs, then loads the selected Records row |
| `Download Selected Trip JSON` | Opens a download link for the selected saved trip |
| `Import Trip JSON` | Saves current inputs, then loads and archives an exported JSON file with a new ID |
| `Delete Selected Trip` | Deletes the selected archive after confirmation; keeps active inputs |
| `New Trip` | Saves current inputs, then creates a blank trip while keeping Records |
| `3. Send PDF Reports via Email` | Emails personalized PDF statements to roster emails |
| `Test Email Permission` | Sends a test mail to verify the send-mail authorization |
| `Diagnose Settlement Data` | Shows roster, ledger errors, balance checks, and settlement rows |

> **Mobile users:** use `Setup!B6` or `Setup!B7` for confirmation and `Setup!E6` to save a trip. Email sending uses the desktop menu or the `sendPdfReports()` function in Apps Script.

---

## Local Development with clasp

Use Node.js 22+ and the [Google clasp CLI](https://github.com/google/clasp). There is no package manifest, build step, or local server.

```sh
npm install -g @google/clasp
clasp login
```

Enable the **Google Apps Script API** in [Apps Script user settings](https://script.google.com/home/usersettings). Create a development spreadsheet and open its bound script through **Extensions → Apps Script**. Copy its **Script ID** from **Project Settings** into the `scriptId` field of this checkout's `.clasp.json` before pushing, so uploads target your own development sheet.

Run these commands from the repository root:

```sh
node --check Code.js
node --test
clasp status
clasp push
clasp open-script
```

The first commands check syntax and run local tests. `clasp status` lists upload files; `clasp push` uploads to the configured project; `clasp open-script` opens its editor. The upload should contain `Code.js`, `TripJson.html`, and `appsscript.json`; `.claspignore` excludes tests and preview artifacts. Clasp authentication authorizes uploads; spreadsheet and email permissions are granted separately when running the script.

Run `setup()` only when initializing a blank development spreadsheet. For subsequent code updates, reload the sheet and use **2. Recalculate Live Expenses** or **Confirm All Expenses** as needed. For automatic foreign conversion, select **Enable Automatic Currency Conversion** once and authorize the edit trigger and external requests. Edit-trigger behavior, actual PDF conversion, and email delivery require checks in Google Sheets.

For local Windows push automation, use [`scripts/pre-push`](scripts/pre-push) and the [Git Bash/PowerShell setup and verification guide](docs/pre-push-setup.md). The hook overwrites `roamtab-template/Code.js` from this working tree and runs `clasp push` in that repository before allowing the source Git push. It aborts on copy or upload failures. Install it separately in each clone; the guide covers PATH, authentication, and the upload behavior. `.claspignore` excludes local automation scripts from source-project uploads.

---

## 📂 Project Architecture

```
travel-expense-excel/
├── Code.js                   # Google Apps Script engine
├── TripJson.html             # Browser JSON download and file-import dialog
├── appsscript.json           # Apps Script runtime settings
├── .clasp.json               # Apps Script project mapping
├── .claspignore              # Excludes local tests from uploads
├── AGENTS.md                 # Contributor guidelines
├── README.md                 # Project documentation
├── assets/                   # Setup, expenses, settlements, and PDF screenshots
├── docs/plans/               # Settlement design and decision log
└── tests/
    ├── calculations.test.cjs # Money, ledger, and sheet output tests
    ├── optimal-settlements.test.cjs # Exact minima, explanations, and benchmarks
    ├── settlements.test.cjs  # Settlement validity and minimum-count checks
    ├── pdf-report.test.cjs   # Personal statement content and privacy checks
    ├── trip-records.test.cjs # Archive, JSON round-trip, blank trip, and deletion checks
    ├── trip-json-dialog.test.cjs # Download content and import dialog behavior
    ├── preview-pdf.cjs       # Generates sample report HTML without sending email
    ├── helpers/              # Spreadsheet boundary mocks and exact test oracle
    └── README.md             # Test scope and known limitations
```

---

## Participant PDF Design

Each A4 statement starts with the trip and participant, followed by a prominent **You need to pay**, **You will receive**, or **All settled** amount. Exact payment instructions appear before the expense list. Three summary figures show money paid, personal share, and signed net balance.

Expense rows use right-aligned amounts, a bold personal share, alternating backgrounds, and repeating column headings on long reports. Only expenses the recipient paid or shared appear. The final total reconciles to their personal share. Text labels explain pay/receive states without relying on color.

Reports use a self-contained HTML template with system fonts and no external assets. The existing Apps Script PDF conversion and email flow use this template directly. Local Chromium samples verify layout; Apps Script conversion should also be checked in a development spreadsheet.

Generate pay, receive, settled, and long-statement HTML previews without sending email:

```sh
node tests/preview-pdf.cjs
```

Open the files in `tests/previews/` and print to PDF using A4 paper with browser headers and footers disabled. These files are excluded from clasp uploads. The repository includes sample preview artifacts; running the command regenerates HTML, not the committed PDF or PNG files.

---

## Automated Calculation Tests

Use Node.js 22 or newer. No npm dependencies or Google credentials are needed:

```sh
node --test
```

The tests execute the real `Code.js` in an isolated VM with an in-memory spreadsheet boundary. They cover exact totals, per-person shares and balances, remainder allocation, subgroup splits, invalid rows, generated spreadsheet values, and debt clearance. Exact minimum counts are checked against an independent exhaustive oracle on 625 small balanced cases and 200 seeded groups. Additional cases exercise 15 participants, 500 expense rows, explanation text, roster changes, and consistent spreadsheet/PDF payment instructions. The suite also reports a local 15-person solver benchmark.

See [`tests/README.md`](tests/README.md) for focused commands and limitations. `.claspignore` keeps local tests out of Apps Script uploads. Actual Google Sheets triggers, authorization, PDF generation, and email delivery still require manual checks.

Trip archive tests cover 15 participants and all 500 expenses across JSON parts, draft rows, dates, inactive roster entries, repeated saves, confirmation controls, save-before-replace behavior, import validation, deletion confirmation, and formula-like text. In a disposable spreadsheet, also verify `Setup!E6`, a real browser download/import, and cancelled New Trip/Delete actions. Check the new Save Trip control beside the existing setup checkboxes.

Split/FX tests cover exact and percentage validation, deterministic remainders, half-cent conversion, 500 foreign rows with 2 and 15 participants, cache eviction and 24-hour expiry, API failures, timezone dates, column migration, schema versions 1/2, and authorized versus simple edits. Fetch responses and Google service boundaries are mocked. In a disposable spreadsheet, enable the FX trigger, enter a dated USD expense against INR, and verify live nets, cached recalculation, errors before confirmation, and saved-trip restoration. Capture updated sheet screenshots after that live check.

---

## 🔧 Troubleshooting

| Symptom | Fix |
|---------|-----|
| Emails not sending | Run **Test Email Permission** and approve "Send email as you"; mails are sent from the account running the script |
| Expense rows missing from calculations | Check positive Amount + Paid By, valid names, and that the row is between 2 and 501 |
| Reports say unconfirmed or show old results | Reconfirm setup, then select **Confirm All Expenses** to rebuild the report |
| Unknown payer after changing the roster | Update old names in **Paid By** and **Split Among**, then reconfirm |
| FX rate unavailable on edit | Select **Enable Automatic Currency Conversion** or **2. Recalculate Live Expenses** and authorize; check transaction date and currency codes |
| Menu missing after a code update | Reload the spreadsheet; run `onOpen()` in Apps Script if necessary |
| Formatting or generated columns look wrong | Use **Confirm / Update Setup**, then **2. Recalculate Live Expenses** |
| Quota or authorization error | Read the Apps Script execution error, check account quotas, and authorize the required service |
| Something feels off | Run **Diagnose Settlement Data** and read the reported ledger errors |

---

<a id="contributing"></a>

## 🤝 Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request:

1. Fork the Repository.
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the Branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

Include a short behavior summary and validation results. Add screenshots when changing sheet layouts or PDF output; verify financial changes with `node --test`.

---

## 📜 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
