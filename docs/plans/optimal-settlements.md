# Exact Settlement Plans and Explanations

This is the historical design record for the exact settlement engine. The current [architecture reference](../architecture.md) also covers currency conversion, whole-unit payment balances, archive schemas, and the optional mobile layout. The minimum-transfer solver remains shared by both workbook modes.

## Confirmed Understanding

- Trip participants need the fewest possible transfers, not an approximation.
- Keep the existing 2–15 participant and 500-expense limits, splitting rules, and integer minor-unit arithmetic.
- Add an explanation cell alongside each settlement row, showing outstanding debt, outstanding credit, and the smaller payment amount using the user's simple template.
- Keep all processing in Google Apps Script without dependencies or external services.
- Target seconds-scale calculation and benchmark 15-person inputs. Invalid results must block settlement output.
- Use the same deterministic plan in spreadsheet output, diagnostics, and emailed payment instructions. PDF layout redesign is outside scope.

## Assumptions and Risks

- Transfers may connect any debtor with any creditor; original payer relationships do not constrain repayment.
- Zero-balance people need no transfers. Amounts and their aggregate magnitudes must fit JavaScript safe integers.
- Exact search grows exponentially. The 15-person limit bounds the solver at 32,768 subset states; increasing this limit requires a new performance review.
- Local benchmarks do not establish Google Apps Script execution time. Real sheet layout and trigger behavior require manual verification.
- Multiple minimum plans may exist. Stable person IDs resolve ties so repeated runs and email instructions agree.

## Decision Log

| Decision | Alternatives | Reason |
| --- | --- | --- |
| Guarantee minimum transfers | Fast greedy approximation | User explicitly requires the minimum every time. |
| Use exact subset dynamic programming | Exact backtracking | User accepted subset DP after reviewing the grouping example; bounded state count and predictable work suit 15 people. |
| Explain every transfer beside the table | One generic explanatory note | Show why the actual displayed amount is correct. |
| Use the user's simple owes/needs/pay template | Detailed paid-minus-share and before/after breakdown | User requested shorter explanations while keeping the correct calculations. |
| Fail on invalid input or verification errors | Silent approximate fallback | Preserve the minimum-transfer guarantee and money conservation. |

## Final Design

Roster update revision: new name edits can grow the active count to 15; explicit count reductions preserve inactive names and emails. Confirmation updates the flag before rebuilding outputs. The live summary now resides in Send Reports!H:K and refreshes before confirmation; expense inputs A:E remain intact. The existing exact solver and PDF calculations are unchanged.

Later integration retains those original inputs and adds Currency F in classic mode. The optional mobile upgrade adds Category G and Expense ID H, starts participant outputs at I, and adds strict invalid-row/duplicate confirmation gates. Final payment plans use a balanced whole-unit ledger; raw expenses and spending totals retain minor-unit precision. Minimum transfer counts apply to the balanced ledger supplied to the solver. These changes do not replace the subset-DP algorithm below.

Sort nonzero balances by stable person ID. For each subset, store its balance sum, the largest number of zero-sum prefixes reachable in an ordering, and a predecessor. The recurrence removes one participant and adds one completed group when the current subset sums to zero. This takes O(n × 2^n) time and O(2^n) memory.

Reconstruct the chosen ordering and split it wherever the running balance returns to zero. This yields the maximum number of disjoint balanced groups. Settle each group with the existing greedy payment generator. Maximum grouping ensures no group can split further, so a group of k people uses exactly k − 1 transfers. Verify the final count equals nonzero people minus groups and that every balance clears.

Add an `Explanation` column after `Instruction` in `Send Reports`. Derive text from the real ledger and replay the selected payments in display order. Use: “[Person A] owes ₹X. [Person B] needs ₹Y. Pay ₹[smaller of X or Y] so at least one person reaches ₹0 balance.” Substitute actual names, current outstanding amounts, and configured currency. Wrap text and constrain column width.

## Implementation and Verification Plan

1. Add failing tests for exact minimum counts, deterministic plans, invalid input, and explanation output.
2. Implement the solver and explanation builder; route sheet, email, and diagnostic callers through the exact solver.
3. Compare with the independent exhaustive oracle for small inputs; test known-optimum 15-person cases and benchmark maximum-size groups.
4. Verify report cells, rebuilds, empty/error states, existing calculation tests, syntax, clasp exclusions, and documentation.

Mathematical basis: [The debts’ clearing problem: a new approach](https://acta.sapientia.ro/content/docs/the-debts-clearing-problem-a-new-approac.pdf). The maximum zero-sum partition gives minimum transfers as nonzero people minus groups.
