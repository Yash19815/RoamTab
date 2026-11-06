# Exact Settlement Plans and Explanations

## Confirmed Understanding

- Trip participants need the fewest possible transfers, not an approximation.
- Keep the existing 2–15 participant and 500-expense limits, splitting rules, and integer minor-unit arithmetic.
- Add an explanation cell alongside each settlement row, showing original net balances, balances before payment, the payment calculation, and balances after payment.
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
| Fail on invalid input or verification errors | Silent approximate fallback | Preserve the minimum-transfer guarantee and money conservation. |

## Final Design

Sort nonzero balances by stable person ID. For each subset, store its balance sum, the largest number of zero-sum prefixes reachable in an ordering, and a predecessor. The recurrence removes one participant and adds one completed group when the current subset sums to zero. This takes O(n × 2^n) time and O(2^n) memory.

Reconstruct the chosen ordering and split it wherever the running balance returns to zero. This yields the maximum number of disjoint balanced groups. Settle each group with the existing greedy payment generator. Maximum grouping ensures no group can split further, so a group of k people uses exactly k − 1 transfers. Verify the final count equals nonzero people minus groups and that every balance clears.

Add an `Explanation` column after `Instruction` in `Send Reports`. Derive text from the real ledger and replay the selected payments in display order. Show paid minus share for both people, their outstanding amounts, why the smaller outstanding amount is paid, and the remaining amounts. Wrap text and constrain column width.

## Implementation and Verification Plan

1. Add failing tests for exact minimum counts, deterministic plans, invalid input, and explanation output.
2. Implement the solver and explanation builder; route sheet, email, and diagnostic callers through the exact solver.
3. Compare with the independent exhaustive oracle for small inputs; test known-optimum 15-person cases and benchmark maximum-size groups.
4. Verify report cells, rebuilds, empty/error states, existing calculation tests, syntax, clasp exclusions, and documentation.

Mathematical basis: [The debts’ clearing problem: a new approach](https://acta.sapientia.ro/content/docs/the-debts-clearing-problem-a-new-approac.pdf). The maximum zero-sum partition gives minimum transfers as nonzero people minus groups.
