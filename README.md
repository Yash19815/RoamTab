<div align="center">

# ✈️ Dynamic Group Travel Expense Splitter

**A zero-dependency, open-source Splitwise alternative built directly inside Google Sheets.**
Instant per-person split calculations, a live group summary panel, exact minimum-transfer settlements, and 1-click personalized PDF email reports.

[![Google Apps Script](https://img.shields.io/badge/Google%20Apps%20Script-4285F4?style=for-the-badge&logo=google&logoColor=white)](#)
[![Google Sheets](https://img.shields.io/badge/Google%20Sheets-34A853?style=for-the-badge&logo=googlesheets&logoColor=white)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=for-the-badge)](CONTRIBUTING.md)

<br />

<a href="#-quick-start">
  <img src="assets/Expense%20Tab.png" alt="Expense tracker with per-person splits and live group balances" width="850" />
</a>

<br /><br />

[**🚀 Click Here to Make a Copy in Google Drive**](https://docs.google.com/spreadsheets/d/11dY2B2j1dNIRlWfagUtbX13LRmW894mhnhCGBVsx9oQ/copy)
*(No installation required for non-technical users)*

</div>

---

## 🌟 Why Use This Over Splitwise?

* **100% Free & Self-Hosted:** No subscription limits, item limits, or ads. Your trip data stays inside your Google Drive.
* **Instant Live Calculations:** Per-person split columns compute the moment you type an expense — no confirm step, no waiting, just like a native spreadsheet formula.
* **Live Summary Panel:** A persistent dashboard beside your entries always shows the **Total Spent (Everyone)**, each person's **Spent (Share)** — what they technically consumed even if they paid nothing — and their **Net Balance** (+ collect / − owe).
* **Exact Settlement Engine:** On confirmation, uses subset dynamic programming to find the fewest possible transfers for up to 15 people. Every settlement row explains the payment calculation and remaining balances.
* **Automated PDF Email Statements:** Generates clean, personalized HTML/PDF expense reports — each person receives only the expenses that involve them — dispatched via Gmail in one click.
* **Dynamic Roster Scaling:** Scale your group seamlessly from 2 to 15 people — the grid, dropdowns, person columns, and summary panel auto-adjust on the fly.
* **Mobile-First Workflow:** Full functionality through checkboxes and automatic triggers; no dependency on desktop-only custom menus.

---

## 📸 Screenshots & Workflow

### 1. Trip & Roster Setup

<img src="assets/Setup.png" alt="Setup tab with trip name, participant count, currency, and four-person roster" width="586" />

### 2. Expense Tracker & Live Summary

<img src="assets/Expense%20Tab.png" alt="Expenses tab showing shared expenses, individual balances, and the live summary" width="100%" />

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

## ⚡ Quick Start

### Option A: 1-Click Google Sheet Template (Easiest)
1. Click the **[Make a Copy Template Link](https://docs.google.com/spreadsheets/d/11dY2B2j1dNIRlWfagUtbX13LRmW894mhnhCGBVsx9oQ/copy)**.
2. Open the newly created spreadsheet in your Google Drive.
3. Open the custom **Expense Splitter** menu at the top and select `1. Initialize / Reset Tracker`.
4. Authorize the Google Apps Script permissions when prompted.

### Option B: Manual Setup via Google Apps Script
1. Create a blank **Google Sheet**.
2. Navigate to **Extensions** → **Apps Script**.
3. Replace all content in `Code.gs` with the code from [`Code.js`](Code.js).
4. Save the project and click **Run** on the `setup` function to authorize scopes (including **Send email as you**, required for PDF reports).
5. Reload your Google Sheet — the custom **Expense Splitter** menu will appear in the top navigation toolbar.

---

## 🧭 The Three Tabs

### 1️⃣ Setup
Configure the trip and the group:

| Cell | Setting | Default |
|------|---------|---------|
| `Setup!B2` | Trip Name / Destination | Goa Vacation 2026 |
| `Setup!B3` | Number of Participants (dropdown 2–15) | 4 |
| `Setup!B4` | Currency Symbol | ₹ |
| `Setup!B5` | Setup Status (auto-validated) | — |
| `Setup!B6` | **All Expenses Confirmed** master checkbox | ☐ FALSE |
| `Setup!A9:C…` | Roster: `#` · `Name` · `Email (optional)` — rows scale with B3 | — |

> Emails are **optional** — only people with an email address receive PDF reports; everyone else is cleanly skipped and logged.

### 2️⃣ Expenses
Enter expenses in columns **A–E**; everything else is computed live:

| Column | Field | Type |
|--------|-------|------|
| A | Date | Date-validated (dd-mmm-yyyy) |
| B | Description | Free text |
| C | Amount | Currency-formatted |
| D | Paid By | Dropdown, auto-filled from roster |
| E | Split Among | `All`, blank, or comma-separated names |
| F+ | *One column per person* | Auto-computed share per row |
| **K–M** | **LIVE SUMMARY panel** | Always-on totals (4-person roster; shifts right for larger groups) |

**LIVE SUMMARY panel** (updates instantly, never hidden):

```
┌────────────────────┬───────────────┬──────────────────────────┐
│ LIVE SUMMARY                                                │
├────────────────────┴───────────────┬──────────────────────────┤
│ Total Spent (Everyone)             │                 ₹10,000  │
├────────────────────┬───────────────┼──────────────────────────┤
│ Person             │ Spent (Share) │ Net (+ collect / − owe)  │
├────────────────────┼───────────────┼──────────────────────────┤
│ Rahul              │      ₹2,500   │                 −₹2,500  │
│ Priya              │      ₹2,500   │                 +₹7,500  │
└────────────────────┴───────────────┴──────────────────────────┘
```

**Duo example:** if only Person 2 pays a ₹1,000 hotel bill split between both, Person 1's row still shows **Spent ₹500** — their technical share of the expense — with a Net of **−₹500** (they owe), while Person 2 shows Spent ₹500, Net **+₹500**.

### 3️⃣ Send Reports
Gated behind the **All Expenses Confirmed** checkbox. On confirmation it runs the exact settlement engine and shows:

* **Personal Balances Summary** — per-person Total Paid, Total Share, Net Balance, and email delivery status.
* **Simplified Settlement Plan** — the minimum set of "X pays Y ₹amount" transactions that settles the whole group.

---

## ⚙️ How It Works

### Equal & Partial Splits
* **"All" or blank Split Among:** cost splits equally across the whole roster.
* **Comma-separated names** (`Rahul, Neha`): cost splits only within that subgroup.
* **Remainder handling:** leftover whole paisa/cents are distributed one at a time by ascending participant ID among the included people. Shares add up to the original amount, and group balances reconcile to zero.

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
* One batched read + two batched writes per edit — no per-cell API calls in the hot path.
* Structural rebuilds (headers, dropdowns, validations) happen **only** on Setup/roster changes, never while typing expenses.
* The Send Reports sheet rebuilds only on confirm toggles and while confirmed.
* UI dialogs degrade gracefully (alert → toast → log), so mobile and trigger contexts never crash.

---

## 🧰 Menu Reference (Desktop)

| Menu Item | Action |
|-----------|--------|
| `1. Initialize / Reset Tracker` | Builds all sheets, dropdowns, and formatting from scratch |
| `2. Recalculate Expenses & Settlements` | Forces a full recalculation |
| `Confirm All Expenses` | Publishes balances + settlement plan (assignable to a drawing button) |
| `Re-open for Editing (Unconfirm)` | Withdraws the report view |
| `3. Send PDF Reports via Email` | Emails personalized PDF statements to roster emails |
| `Test Email Permission` | Sends a test mail to verify the send-mail authorization |
| `Fix Expenses Sheet Formatting` | One-time cleanup of legacy formatting/validation |
| `Diagnose` | Reports the health of every moving part |

> **Mobile users:** menus don't exist in the Sheets app — use the `Setup!B6` checkbox; everything else is automatic.

---

## 📂 Project Architecture

```
travel-expense-excel/
├── Code.js                   # Google Apps Script engine
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

Open the files in `tests/previews/` and print to PDF using A4 paper with browser headers and footers disabled. Generated previews are Git-ignored and excluded from clasp uploads.

---

## Automated Calculation Tests

Use Node.js 22 or newer. No npm dependencies or Google credentials are needed:

```sh
node --test
```

The tests execute the real `Code.js` in an isolated VM with an in-memory spreadsheet boundary. They cover exact totals, per-person shares and balances, remainder allocation, subgroup splits, invalid rows, generated spreadsheet values, and debt clearance. Exact minimum counts are checked against an independent exhaustive oracle on 625 small balanced cases and 200 seeded groups. Additional cases exercise 15 participants, 500 expense rows, explanation text, roster changes, and consistent spreadsheet/PDF payment instructions. The suite also reports a local 15-person solver benchmark.

See [`tests/README.md`](tests/README.md) for focused commands and limitations. `.claspignore` keeps local tests out of Apps Script uploads. Actual Google Sheets triggers, authorization, PDF generation, and email delivery still require manual checks.

---

## 🔧 Troubleshooting

| Symptom | Fix |
|---------|-----|
| Emails not sending | Run **Test Email Permission** and approve "Send email as you"; mails are sent from the account running the script |
| Person columns blank | Ensure the row has Amount + Paid By; names in Split Among must match roster spelling |
| Stray checkboxes / colors from an old version | Run **Fix Expenses Sheet Formatting** once (clears all expense rows) |
| Something feels off | Run **Diagnose** and read the reported state |

---

## 🤝 Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request:

1. Fork the Repository.
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the Branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
