# Mobile-Friendly Expense Workbook Design

Date: 2026-11-15
Status: Product scope and review-added operating limits approved by the user. Peer review APPROVED for the design specification.
Implementation status: Implemented locally; automated verification recorded in mobile-expense-implementation.md. Apps Script and native Android/iPhone release checks remain pending.

This document records the approved product design and review decisions. Use the [architecture reference](../architecture.md) for the implemented function/storage contracts and [README](../../README.md#mobile-workbook-upgrade) for activation. Implementation details below are clarified where behavior differs between raw recovery, portable archives, and transient draft controls.

## Confirmed Understanding

- Improve expense-entry speed, spending visibility and budget control, and mistake prevention and recovery.
- Combine existing-sheet improvements, guided entry, and workbook redesign in one release.
- Serve trip organizers and participants on Android, iPhone, and desktop Google Sheets.
- Preserve the existing 2–15 participant and 500-expense limits, split modes, historical currency conversion, exact settlements, PDF reports, and saved trips.
- Keep Google Sheets and Apps Script, existing sharing permissions, and no new external services or dependencies.
- Aim for ordinary edits to update within a few seconds; cold currency lookups may take longer.
- Exclude a separate application and expanded participant/expense limits. New repayment-tracking features are outside this release.

## Assumptions and Accepted Limits

- One-time installation and authorization take place on desktop. Daily entry, budget viewing, validation, and recovery must have mobile cell-based controls.
- Users are online for scripted actions. Offline draft edits are not confirmed submissions, and reconnecting does not imply successful processing.
- Each participant uses a labeled draft block. Blocks are shared spreadsheet cells, not private forms or an authorization boundary.
- History follows workbook permissions. It is recovery storage, not an immutable or private audit log.
- Keep the latest 20 recovery versions per trip. Older versions expire. Automatic checkpoints follow changed inputs at most once per five minutes; manual saves and replacement operations create checkpoints regardless of that interval.
- Five minutes is a write throttle, not a guaranteed backup interval. A final edit inside that interval, a missed trigger, or a failed write can remain uncheckpointed indefinitely until another successful checkpoint. Recovery does not promise every intermediate edit or recovery from deletion of the entire workbook.
- Performance goals require Apps Script and device verification; local timings alone do not establish mobile or Google service performance.
- The organizer maintains categories, templates, budgets, setup, and script authorization. Existing Google service quotas still apply.

## Final Product Design

### Workbook and Navigation

| Surface | Purpose |
| --- | --- |
| Dashboard | Stacked spending totals, remaining budget, category/day/person charts, and unresolved warnings. |
| Quick Entry | Narrow vertical participant draft blocks, templates, recent-expense copying, explicit submission, and inline status. |
| Expenses | Direct editing with categories, clear input styling, and row-level validation feedback. |
| Budgets | Optional trip and category limits in the base currency. |
| History | Select a dated version, preview its trip and input summary, then explicitly restore. |
| Setup | Retain trip configuration, roster, timezone, and existing setup controls. |
| Send Reports | Retain settlement output, live summary, and PDF reporting workflow. |
| Records | Retain saved-trip selection and portable JSON workflows. |

Place Dashboard and Quick Entry first. Keep common entry controls within a narrow phone-width area, use readable row heights, wrap labels, and show status in text as well as color. Charts stack vertically. Direct editing remains available for experienced users and bulk work.

Quick Entry starts with a participant directory linking to each labeled draft block; each block links back to that directory. Freeze the active-trip header and repeat trip/person identity beside submission so users can verify the destination immediately before saving. Test directory links and navigation through all 15 blocks on both mobile apps; narrow columns alone do not prove fast entry.

### Entry and Templates

- Default date to today in the trip timezone, currency to the trip base currency, and split to equal shares among everyone.
- Require an explicit payer and amount. Templates preset description, category, payer, split, and currency; amount remains blank.
- Copying an existing expense fills an editable draft preview. It never saves automatically.
- Initial categories are Food, Transport, Stay, Activities, Shopping, and Other. Allow custom categories and retain uncategorized historical expenses.
- Use existing dropdowns and an Add Expense checkbox. Show Saving expense, Expense saved with its reference, or an actionable save error beside the draft. Preserve draft inputs on failure.
- Give each participant a labeled draft block to reduce collisions. Edits to the same block by multiple people remain a shared-cell risk; do not imply identity-based isolation.
- Prevent retry or double-tap duplication using a submission identifier and serialized commit. A successful status must correspond to a verified stored expense.
- Bind each submission identifier to the original trip ID and immutable submitted values. Store it with the committed expense so a retry can find an existing commit even if the separate status update failed. Reject stale drafts after a trip switch; do not silently retarget them. Reusing an identifier with different values is an error.
- A pending or failed submission remains visible. After success, clear the amount only if draft values still match the submitted draft; retain reusable fields and avoid erasing later edits.
- Keep expense-commit status separate from recovery status. If the expense commits but a checkpoint fails, show Expense saved with its reference and Recovery checkpoint failed; do not resubmit this expense. Retrying recovery must not append an expense. Show last successful recovery time separately.

### Budgets and Dashboard

- Trip and category budgets are optional. Blank means no limit; zero means zero budget allowance. Expenses remain permitted with over-budget warnings.
- Limits are advisory. Over-budget expenses remain permitted.
- Use the existing ledger's converted base-currency amounts, integer minor units, timezone, and allocation rules.
- Person charts show consumed shares separately from paid amounts. Overall spending counts each expense once.
- Uncategorized expenses count toward trip spending and an uncategorized category bucket.
- Show incomplete/invalid expense counts beside totals. Invalid rows must not make partial totals appear complete.
- Keep overall and category limits independent; do not silently change one when the other changes.
- Store the currency associated with budget values. After a base-currency change, mark budget comparisons unavailable until the organizer explicitly confirms or replaces the limits in the new currency. Expense totals can still update. Never silently reinterpret a budget as converted money.

### Validation

- Both guided entry and direct edits use the same validation rules and ledger.
- Incomplete and invalid nonempty rows remain visible with specific row-level warnings. Final confirmation and PDF sending remain blocked until these rows are resolved.
- Detect possible duplicates using normalized date, payer, amount, currency, and description. Warn without deleting entries or treating legitimate repeats as invalid money.
- Allow acknowledgement of a legitimate repeat. Tie acknowledgement to the expense identity and matching values; relevant edits invalidate the acknowledgement.
- Unacknowledged duplicate warnings block final confirmation. Acknowledged legitimate repeats do not block it. Budget warnings never prevent confirmation.
- At the 500-row limit, reject another submission with a visible error and preserve its draft.

### Recovery

- Create a manual version on Save Trip, while maintaining Records as the latest saved trip.
- Create an automatic checkpoint after changed expense/configuration inputs, at most once per five minutes per trip. Show the last successful checkpoint and any checkpoint failure; do not label uncheckpointed data as backed up. No background timer or maximum recovery lag is promised.
- Before migration, import, loading another trip, New Trip, or restoring a version, capture the current inputs in a recovery version. Abort replacement if the checkpoint fails.
- Validate a selected version before replacing inputs. Preview identity, timestamp, roster size, expense count, and budgets before explicit restoration.
- Recalculate derived data after restoration. A failed replacement must show an error and retain the recoverable checkpoint; attempt rollback and report rollback failure explicitly.
- Apply the 20-version retention limit only after a replacement/version write is verified. Do not delete the rollback source while an operation is in progress.
- Recovery payloads include raw expense inputs, IDs, setup/roster/timezone, and the last valid budgets, categories, templates, and duplicate acknowledgements. They do not archive every invalid unsaved budget/template cell or transient Quick Entry field. They do not restore historical email delivery or claim to revoke messages already sent.
- Raw recovery capture must not call strict calculation/import validation. Preserve invalid setup values and incomplete expense rows in an internal recovery envelope, alongside the actual valid spreadsheet timezone and format metadata. Restore invalid versions as unconfirmed drafts with explicit errors and keep reports gated until corrected. Valid expense portions may remain visible in labeled partial totals. Portable trip imports retain strict schema validation.
- Replacements are organizer maintenance operations: pause entry, show maintenance status, serialize scripts, and temporarily restrict affected ranges before capture. Protect the restore confirmation control so other editors cannot initiate it through an owner-run trigger. If effective restrictions cannot be established, abort before replacement and preserve existing permissions.
- Bind the preview/confirmation to immutable source trip ID, version ID, payload fingerprint, destination trip ID, and destination input fingerprint. Check all values again under the operation lock; any change invalidates the preview and requires a new one. Never read a newly selected version as the target of an earlier confirmation.
- Sheet protections cannot block the owner or executing account. They must refrain from direct edits during replacement. Compare captured input fingerprints before writes and verify the complete intended result afterward; abort on observed conflicts. Do not claim atomic isolation from arbitrary owner edits. If later edits are detected, preserve both recovery payloads, mark recovery required, and do not blindly roll back over those edits. Restore original protections after a verified operation or a safe abort.
- Persist an operation journal before modifying protections or inputs: operation identity, bound target, original protection settings, checkpoint references, intended result fingerprint, and phase. Journal phases distinguish prepared, restricted, checkpointed, writing, verifying, cleanup, and complete. Do not declare completion before original protections are restored and cleanup is verified.
- A timeout can bypass normal cleanup. The next authorized organizer action must inspect unfinished journals, block another replacement, and offer explicit recovery of that operation. Resume only a verified safe cleanup/rollback; preserve conflicting payloads for recovery. Reauthorization on desktop may be necessary after access/authorization loss. Never auto-remove pre-existing protections or blindly grant broader access.

### Trigger Ownership and Capacity

- One designated organizer installs the workbook's authorized edit trigger on desktop, including for local-currency trips. Registration is idempotent for that account, records its ownership, and verifies actual registration instead of trusting a stale property flag. Different accounts cannot reliably enumerate each other's installations; document removal/transfer of old organizer-owned triggers and use the operation lock plus durable identities to tolerate accidental duplicate delivery.
- Route each event to one processing path. Preserve the required onEdit/onOpen names, but prevent the simple and installed handlers from both committing a submission, checkpoint, or replacement. Installation/repair includes the existing FX route rather than installing a competing dispatcher.
- Show setup/authorization requirements, last successful processing status, and pending requests. A lost trigger cannot update its own failure message; require a fresh acknowledgement for each request and label unchanged submitted requests as pending, never successful. Organizer reconciliation on desktop repairs authorization/routing and safely retries the original request. Do not promise automatic delivery or recovery while authorization is broken.
- Twenty versions per trip does not bound storage across all trips. Before writing, calculate serialized payload size, chunk count, per-cell fit, required grid growth, and operation-journal storage. Check against current service/workbook limits and available execution budget; stage and read-verify chunks before committing a version marker or replacing active inputs.
- Storage/size/quota failure must preserve inputs and existing committed versions, show a capacity or processing error when execution is available, and leave incomplete candidates uncommitted for cleanup. Never truncate inputs, silently delete another trip, or evict a required rollback version to make replacement fit. A mandatory checkpoint that cannot fit blocks replacement.
- No fixed low payload cap is introduced here. Benchmark large realistic and near-existing text-limit inputs before implementation release, and publish any necessary new operational bound explicitly instead of assuming 500 rows guarantee affordable snapshots. Ordinary edits must not scan every trip's full history.

## Integration and Data Flow

1. Direct edits or a Quick Entry submission provide raw expense inputs.
2. Validate setup, row fields, split rules, and currency availability through the shared calculation path.
3. Serialize guided submissions, allocate an available expense row, and verify its saved values and submission identity.
4. Rebuild the ledger once, then reuse it for participant outputs, warnings, dashboard totals, budgets, and reports. Batch sheet reads/writes and avoid chart reconstruction on every edit.
5. Update inline statuses and checkpoint metadata only for successful operations. Stale or failed derived output must have an explicit visible state.

Keep existing A:F user inputs in place. Add Category at G and a hidden stable Expense ID at H; generated participant values start at I. Warning display must not overwrite inputs or identifiers. Full-row sorting must keep IDs, category, and expense values together; stale warnings and acknowledgements follow IDs, not row numbers. Sorting only part of an expense row is unsupported because associations cannot be inferred reliably; explain the full-row sorting requirement in the sheet and README.

Create IDs for nonempty user-input rows; IDs and warnings alone never make a row an expense. Clearing all user fields clears its identity and acknowledgement; reusing the row receives a new identity. Direct pasted duplicate IDs are reassigned for every ambiguous row and their acknowledgements invalidated, without deleting expense inputs. Missing IDs are repaired. Row deletion removes the active row identity but not its historical recovery data. Keep submission identities separate from editable draft cells so normal ID repair cannot create a second commit on retry.

Extend trip JSON to schema version 3 with the eight-column A:H expense representation and the new trip settings. Normalize version 1 and 2 imports by adding inherited currency where needed, an uncategorized category, and generated stable IDs. Preserve dates, interior blank rows, drafts, inactive roster entries, and exact split text. Reject duplicate/malformed IDs in imported version 3 data. Extend chunked archive storage rather than assuming one JSON cell can hold a trip.

Migration must capture the old layout before calling any helper that clears generated ranges. Validate active inputs and existing Records before writing; never use Initialize / Reset Tracker as an upgrade mechanism. Older saved records can be normalized when loaded instead of destructively rewritten in bulk. Keep existing calculation, settlement, currency, and PDF behavior except for the approved stricter incomplete-row confirmation rule.

Mobile workflows must not require sidebars, custom menus, modal dialogs, or script-assigned drawings. Recovery uses a selected version, a visible preview, and a distinct confirmation checkbox. Desktop JSON import/download and email authorization retain their existing boundaries.

## Verification and Release Gates

- Run JavaScript syntax checks and all existing calculation, split/FX, timezone/rounding, settlement, PDF, archive, dialog, and upload-hook tests.
- Add behavioral tests for templates and defaults, category mapping, independent budgets, zero/blank limits, base-currency totals, excluded-row visibility, duplicate acknowledgement invalidation, and final-confirmation rules.
- Verify migration from both historical input layouts and JSON versions 1/2; preserve all 500 rows, dates, inactive names/emails, draft rows, and old saved Records.
- Verify IDs under supported sorting, retries and repeated trigger delivery, two concurrent submissions, roster changes, and the full-row limit.
- Exercise failed checkpoint writes, partial snapshot writes, corrupt versions, retention, failed migration/restoration, rollback attempts, and stale output/status recovery.
- Inject failures after every submission commit stage, then retry; verify one expense in the original trip. Test stale drafts after trip switches, invalid setup recovery, missing/duplicate IDs, row reuse/deletion, and checkpoint throttling without a later edit.
- Commit an expense successfully and then fail its checkpoint. Verify distinct expense/recovery messages, a retained expense reference, and backup retry without another expense.
- Test direct edits during capture/replacement/rollback, restrictive group/domain sharing, failure to establish maintenance protections, and preservation of existing protections. Verify conflict status and preservation of competing recovery data; document the owner-edit limitation rather than asserting impossible transaction isolation.
- Terminate after each protection/write/journal phase; verify unfinished-operation discovery, original-permission recovery, stale preview rejection, and no false completion. Test trigger owner loss, stale registration flags, simple/installed double delivery, large payloads, and growing multi-trip archives.
- Test Android and iPhone dropdowns, checkboxes, readability, navigation, two-user entry, failed saves, interrupted connectivity, version preview, and explicit restore in a disposable spreadsheet.
- Verify 2- and 15-person groups with 500 expenses. Check zero-sum balances, minimum-transfer plans, unchanged whole-unit rounding, and matching PDF instructions.
- Measure ordinary edits and cold FX separately in Apps Script. Avoid a claim that all uncached currency requests finish within a few seconds.
- Use controlled email addresses for any real PDF delivery. Update README workflows, screenshots, archive documentation, and upload packaging when implementation changes those behaviors.
- A combined release still requires incremental local implementation and verification. Do not publish an unverified migration or claim device testing that was not performed.

## Accepted Risks

The user explicitly accepted checkpoint gaps, expiration after 20 versions, shared workbook permissions, online scripted actions, desktop setup, and the verification requirements. Shared draft editing, schema/layout migration, broader maintenance, and real-device trigger behavior remain material risks to address during implementation and testing.

The following technical constraints were introduced during peer review: mandatory organizer-owned trigger installation even for local currency; organizer-only restoration and cooperative maintenance while owner/executor edits are paused; supported whole-row sorting with partial-row sorting unsupported; no guaranteed five-minute backup interval; and capacity failures that can block replacement. They were presented together after peer review. The user explicitly accepted them and authorized coding with “yes start coding” on 2026-11-15.

## Decision Log

| Decision | Alternatives considered | Reason / confirmation |
| --- | --- | --- |
| Focus on faster entry, spending control, and mistake prevention/recovery | New repayment tracking | User selected goals 1, 2, and 4. |
| Keep existing scale, platform, permissions, and no new dependencies/services | Separate application or expanded limits | User confirmed the understanding summary. |
| Combine sheet improvements, guided entry, and workbook redesign in one release | Pick one of three approaches | User requested all three at once. |
| Use Dashboard, Quick Entry, Expenses, Budgets, and History alongside existing tabs | Smaller isolated additions | User accepted the workbook structure. |
| Use explicit amounts/payers, templates, optional budgets, visible invalid rows, and duplicate acknowledgement | Silent defaults and automatic duplicate deletion | User accepted the entry and budget behavior. |
| Make Android/iPhone cell-based workflows primary | Desktop-dependent panel controls | User explicitly required mobile friendliness and accepted the mobile workflow. |
| Keep 20 versions with throttled automatic checkpoints and unconditional pre-replacement snapshots | Full edit-history retention | User accepted the stated recovery limits. |
| Require regression, migration, concurrency, failure-path, and real-device checks | Syntax-only validation | User accepted verification requirements. |
| Extend schema/layout and reuse the ledger | Separate dashboard calculations or destructive rebuild | Accepted in structured review and implemented locally; regression results are recorded in the implementation plan. Live release checks remain pending. |
| Bind durable submission receipts to the original trip and values | Deduplicate using only transient status | Resolves S1: retries must reconcile a commit after interrupted status writes. |
| Separate raw recovery envelopes from strict trip validation | Reuse strict import validation for every checkpoint | Resolves S3: invalid drafts must remain recoverable. |
| Require cooperative organizer maintenance with recoverable protection changes | Rely on script locks alone | Resolves S2/C1/C2: detect observable conflicts, bind targets, and recover interrupted operations without asserting atomicity. User acknowledged the limit before coding. |
| Use one designated authorized edit route for all upgraded trips | Leave authorization optional for local currency | Resolves C3: maintenance controls require explicit trigger ownership and duplicate-delivery handling. User acknowledged the limit before coding. |
| Preflight and verify snapshot capacity; stop replacement on failure | Assume 20 versions and 500 rows bound storage | Resolves C4: total archive/payload growth remains subject to workbook and service capacity. |
| Show last successful checkpoint without a maximum-lag guarantee | Describe the throttle as a five-minute backup schedule | Resolves S5: no timer or trigger-delivery guarantee exists in this design. User acknowledged the clarified limit before coding. |
| Link participant directory to draft blocks and separate save/backup status | Require scrolling and use one generic Saved message | Resolves U1/U2 within approved navigation and feedback scope. |

## Structured Review

### Skeptic Review — REVISE, addressed by primary designer

| Objection | Resolution and rationale |
| --- | --- |
| Retry can duplicate a committed expense after status failure or target a different trip. | Accept. Bind durable submission identity to immutable inputs and original trip; reconcile retries against the committed expense and test each failure boundary. |
| Script locks do not stop direct edits during restoration. | Accept. Require organizer maintenance, effective temporary range restrictions, fingerprint checks, and conflict-aware recovery. Explicitly retain the owner/executor bypass limitation instead of claiming atomicity. |
| Strict trip validation can prevent recovery of invalid inputs. | Accept. Separate raw recovery envelopes from strict portable/import and calculation validation; restore invalid data only as an unconfirmed draft. |
| IDs do not cover partial sorting, pasted duplicates, deletion, and clearing. | Accept. Define full-row sorting support, ID repair/reset rules, and acknowledgement invalidation. Partial-row sorting remains explicitly unsupported. |
| Five-minute throttle implies an unsupported maximum recovery lag. | Accept. State no maximum lag or timer guarantee, expose last successful checkpoint/failures, and test terminal edits and missed processing. |
| Budget currency review and duplicate confirmation states are ambiguous. | Accept. Suspend budget comparisons until currency confirmation; unacknowledged duplicates block final confirmation, budget warnings do not. |

### Constraint Guardian Review — REVISE, addressed by primary designer

| Objection | Resolution and rationale |
| --- | --- |
| Abrupt termination can leave temporary protections and maintenance state behind. | Accept. Persist original protection settings and operation phases before mutations; require unfinished-operation recovery and verified cleanup before completion. |
| Restore preview is not bound to immutable source/destination parameters. | Accept. Bind source/destination identities and fingerprints, validate under lock, and invalidate stale confirmations. |
| Optional FX-trigger ownership/routing cannot support mandatory owner-run recovery. | Accept. Define organizer-owned installation for all trips, idempotent repair, one event route, durable deduplication, and explicit pending/desktop repair behavior. |
| Per-trip retention leaves total storage and snapshot cost unbounded. | Accept. Preflight size/chunks/grid/journal needs, stage and verify writes, preserve data on capacity/quota failures, and benchmark large inputs and growing archives without inventing an untested payload guarantee. |

### User Advocate Review — REVISE, addressed by primary designer

| Objection | Resolution and rationale |
| --- | --- |
| Fifteen draft blocks lack a defined mobile navigation path. | Accept. Add the participant directory, block return links, visible trip/person identity, and a 15-person native-app navigation check within the already-approved navigation scope. |
| Saved conflates expense commit with recovery success. | Accept. Separate Expense saved and Recovery checkpoint status, retain the committed reference, and prohibit expense resubmission as a backup retry. |
| Zero-budget wording suggests enforcement despite advisory limits. | Accept. Use zero budget allowance and explicitly permit expenses with warnings. |
| Later operating limits are incorrectly implied to have user approval. | Accept. Separate approved product scope from review-added technical constraints; present those constraints and obtain acknowledgement before implementation. |

### Independent Arbiter — APPROVED for the design specification

The Arbiter accepted every objection and the corresponding resolution:

- S1: immutable trip-bound submission identities and commit reconciliation.
- S2: cooperative maintenance restrictions, conflict checks, and explicit owner/executor limitations.
- S3: raw recovery capture distinct from strict portable-import validation.
- S4: ID repair/reset rules and whole-row sorting support.
- S5: checkpoint throttle without a guaranteed recovery interval.
- S6: explicit budget-currency and duplicate-confirmation states.
- C1: durable operation phases and original-protection recovery.
- C2: immutable preview-bound source/destination identities and fingerprints.
- C3: organizer-owned trigger registration/repair, single routing, and pending acknowledgement.
- C4: capacity preflight, staged verification, and preservation on failure.
- U1: participant directory, return navigation, and visible entry destination.
- U2: distinct expense/recovery status and backup retry without expense resubmission.
- U3: advisory zero-budget wording.
- U4: distinct provenance for user-approved product scope and later technical constraints.

No objections were rejected or remain unresolved at specification level. The design and decision log are review-approved. At review time, implementation awaited user acknowledgement and handoff; both were subsequently supplied on 2026-11-15. Design approval does not imply Apps Script execution, performance proof, or Android/iPhone verification; those release gates still apply to the local implementation.

## Sources for Mobile Constraints

- [Google Sheets dropdowns on iPhone/iPad](https://support.google.com/docs/answer/186103?co=GENIE.Platform%3DiOS): existing dropdown choices can be selected on mobile.
- [Google Sheets checkboxes on iPhone/iPad](https://support.google.com/docs/answer/7684717?co=GENIE.Platform%3DiOS): existing checkboxes can be toggled on mobile.
- [Apps Script custom menus and drawings](https://developers.google.com/apps-script/guides/menus): clicking a script-assigned image/drawing does not execute the script on mobile.
- [Apps Script range protections](https://developers.google.com/apps-script/reference/spreadsheet/protection): owners/current executors retain edit access, and group/domain sharing requires care. Temporary protections do not create transaction isolation from those accounts.
- [Installable triggers](https://developers.google.com/apps-script/guides/triggers/installable): authorized triggers execute as their creator, and one account cannot enumerate another account's installed triggers.
- [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas): service limits and exhausted quotas constrain processing and can stop execution.
