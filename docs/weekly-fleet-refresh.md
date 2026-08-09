# Weekly fleet refresh

Buzz workflow `8c44ae64-0b49-48f3-b11e-c653d073e8e9` starts the fleet review every Sunday at 00:00 UTC using cron expression `0 0 * * 7`.

The scheduled message instructs Codex to:

1. review all 71 Royal Navy and Royal Fleet Auxiliary records;
2. keep or revise only dated, public, vessel-specific locations at supported precision;
3. retain the last public location irrespective of age while labelling historical evidence;
4. append every promotion or revision to `data/royal-navy/location-decisions.jsonl`;
5. run the full validation, test and production-build suite;
6. open a pull request linked to the originating Buzz channel for owner review; and
7. report plotted, unknown and withheld counts plus any evidence blockers.

The workflow is deliberately owner-reviewed. It prepares evidence-backed repository changes but does not merge or deploy them automatically.
