# Marketing plan

Positioning: An open-source Google Sheets trip expense splitter with flexible splits, currency conversion, minimum-transfer settlements, and personal PDF statements.

Primary audience: the person organizing expenses for a friends or family trip. Secondary audience: Google Sheets power users and Apps Script contributors. These are hypotheses from the README, not validated user research.

## First month

1. Test the public template from a separate Google account. Record setup friction, authorization prompts, and time to a first settlement. Refresh the outdated sheet screenshots using fictional data.
2. Record a 45-second demo: three travelers, a shared hotel bill, a subgroup dinner, settlement, and a personal PDF. Lead every post with the demo and template link.
3. Ask five trip organizers to try a fictional trip. Ask where they got stuck and whether they would use it for their next trip. Obtain permission before quoting feedback.
4. Share a practical walkthrough in relevant Google Sheets or travel communities after checking their current posting rules. Explain your connection to the project. Answer questions; avoid identical mass posts.
5. Publish an Apps Script article explaining integer-money rounding and the settlement algorithm. Link to tests and runnable source for contributors.
6. Consider Show HN once the template is easy to try. Explain what you made and why, stay available for questions, and never solicit votes: https://news.ycombinator.com/showhn.html

## Repository presentation

Suggested description: Open-source Google Sheets trip expense splitter with FX, settlements, and PDF reports.

Suggested topics: google-sheets, google-apps-script, expense-tracker, expense-splitter, travel, javascript, splitwise-alternative.

Add a current social preview image. Add contributor instructions and bug/feature templates when inviting contributions. Prioritize onboarding and screenshot improvements as small contributor tasks. Do not promise response times you cannot sustain.

## Draft announcement

I built an open-source trip expense splitter inside Google Sheets. It supports 2–15 people, equal/exact/percentage splits, transaction-date currency conversion, and a settlement plan with the fewest transfers. It can also email each participant a personal PDF statement and save trips as JSON.

Try it with fictional data first: https://github.com/Yash19815/dynamic-travel-expense-splitter#quick-start

If you organize group trips, which part of settling expenses takes you the most time?

## Measure

Track weekly GitHub visitors, clones, referrers, setup questions, and voluntary reports of completed trips. GitHub Traffic retains visitor/clone history for 14 days, so record it weekly: https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository

Template copies and completed trips are not measured by repository traffic. Do not add tracking to personal spreadsheets without a separate privacy decision. Treat stars as a secondary signal.

## Cleanup proposal

The root already separates runtime files, assets, docs, scripts, and tests. Keep Code.js, TripJson.html, and appsscript.json in place for Apps Script deployment.

The main clutter candidate is tests/previews/: 18 tracked generated HTML/PDF/PNG artifacts totaling 1,557,837 bytes. Some images may duplicate presentation assets, but their equivalence has not been established. Preserve assets/ images used by README.

Approved cleanup: untrack all 18 generated preview outputs and ignore `tests/previews/`, preserving local copies and curated `assets/` screenshots. The preview script regenerates HTML; PDF/PNG exports require browser printing or rendering. Existing Git history retains previously committed artifacts.
