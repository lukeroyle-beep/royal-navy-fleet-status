# OSINT provenance architecture

Research cut-off: 2026-08-27.

## Current-state assessment

Before this change, the static Vite application loaded one 71-vessel JSON file directly in the browser. Each vessel combined public state with one `source` object, a check date, a location-evidence date and a broad evidence classification. There was no source registry, observation/publication distinction, common-origin deduplication, assessment history, conflict record, recurring collector or separate public projection. The page request itself did not collect external data, but every provenance URL was shipped to the client.

The existing coordinate-range, unmapped-location and submarine patrol safeguards remain. The vessel card no longer renders a Supporting Source field; its obsolete styling and public source payload have also been removed rather than hidden.

## Design and research basis

The model adapts four practical principles:

- ODNI ICD 203: distinguish underlying information, assumptions and analytic judgement; express confidence qualitatively and explain uncertainty.
- W3C PROV-O: retain entities, responsible sources, derivation, revision and invalidation relationships.
- Bellingcat verification and chronolocation guidance: verify source, place and time independently; capture/publication/retrieval times are not interchangeable.
- Maritime-provider constraints: AIS is fallible and sometimes intentionally absent; licensed APIs and provider terms must govern collection, and absence is not evidence of vessel absence.

The implementation deliberately avoids a database or heavyweight PROV/RDF layer. Four JSON records provide the smallest useful boundary:

1. `vessels.json`: canonical identity, strong aliases and optional pennant/IMO/MMSI/callsign identifiers.
2. `sources.json`: central source identity, category, publisher/account, officiality evidence,
   reliability tier, collection mode, terms notes and enabled state. Its operational records add
   frequency, attempt/success/result times, failure count, retrieval method, mandatory state and
   vessel/family/alias coverage. It also records the complete 68-vessel official-X review.
3. `evidence.json`: immutable source claims with retrieval/publication/observation time semantics, origin cluster, content hash, directness, geographic precision and correction links.
4. `assessments.json`: versioned conclusions with selected, excluded and conflicting evidence, categorical confidence, freshness rationale, method/assessor and previous-assessment linkage.

`scripts/generate-public-projection.mjs` joins canonical identity to the current assessment and emits only card/map fields. Each current assessment must contain a strict, exact-key `publicLocation` decision with explicit public precision and reviewed point/circle-or-null geometry. The projection never derives a city, port or regional radius from report text; absent or invalid direct projection input is list-only, and the assessment validator rejects incomplete current decisions. Build validation proves that the checked-in projection matches the internal assessment index. The production exposure scan rejects internal field names, source URLs, X handles and internal directories in built output.

## Deterministic assessment rules

- Corroboration counts unique `originId` values. Articles, screenshots and reposts derived from one source do not increase independence.
- Current location evidence requires a known observation interval. A publication timestamp alone cannot establish an observation time.
- Transient, port-visit, underway, maintenance and static-location claims use different freshness windows. Historical direct evidence may support the last publicly reported location at low confidence, but it cannot establish a current fix or promote a current operational status.
- Newer credible observations can supersede older transitions; overlapping incompatible observations are retained as conflicts and reduce confidence to `unknown` until resolved.
- `high` requires current direct evidence from at least two independent origin clusters and an entirely Tier A/B source base. One strong current direct source is `moderate`; aging, historical or Tier C direct evidence is `low`; time-unknown or unresolved contradictory evidence is `unknown`.
- Schedules, retrospectives and explicitly historical items cannot become current merely because they were recently published.
- Source authority cannot erase age, lack of geographic precision or unresolved conflict.

## Source universe and lawful collection

The registry contains 186 governed source records, a 68-vessel official-social coverage matrix and these implemented collection classes:

- official MOD/GOV.UK and NATO releases;
- 72 confirmed Royal Navy/MOD organisation, command, unit, establishment, squadron and vessel X
  accounts, one confirmed Tier C OSINT publisher and 22 optional Tier D owner-supplied discovery
  accounts inspected through the governed rendered-public-X stage in the owner's signed-in Chrome;
- 68 vessel-account coverage records from the roster-wide official-page review, including
  machine-tested `@HMS_Spey` and `@HMSTrent` entries;
- official harbour/dockyard and defence-contractor news;
- licensed MarineTraffic and VesselFinder API entries, disabled until credentials/licence approval;
- MarineVesselTraffic NATO Navy Ships as a manual discovery-only source;
- official imagery, credible media and AIS-derived legacy sources classified by tier and collection mode.

No non-rendered X extraction, browser-state inspection, protected/private social access,
commercial-page scraping, media downloading, satellite automation, webcam automation or automatic
archive submission is implemented. The public-X stage uses only bounded rendered pages in the
owner's signed-in Chrome and records typed access blockers. Commercial AIS terms
and public-output licences require procurement review. Visual material needs copyright, geolocation and
chronolocation review. A manual evidence-ingestion command provides a maintainable lawful alternative
and fails closed on unknown source/vessel IDs, malformed URLs, hashes or timestamps.

`npm run sweep:coverage` produces the machine-readable account-gap report and the manual discovery
queues for official Royal Navy/RFA, GOV.UK/MOD, YouTube, NATO/allied government, embassy/exercise,
port, Google News RSS, GDELT, general/local news and named maritime publishers. Discovery queues do
not confer evidence status and record access or terms failures instead of converting them to “no
change”.

The scheduled public-index collector makes one read-only `GET` request to each explicitly allowlisted
publisher index or feed. It uses a bounded timeout and response size, accepts only expected document
types, rejects cross-host redirects and stores only canonical links and hashes. An empty parse, HTTP
failure, rate limit or content-type change becomes a typed blocker. The collector does not follow the
article links and cannot promote a discovery into evidence. A required automatic blocker produces a
non-zero job result after the ledger is written, while the workflow still uploads that ledger with an
`always()` artifact step.

Royal Navy News is a mandatory recurring manual review. Its public index and advertised sitemaps
returned Cloudflare HTTP 403 during the 24 August review, so the implementation records the blocker
and does not attempt a bypass. Westward Shipping News RSS is the replacement automatic target. It is
Tier C and discovery-only: a candidate still needs origin, temporal and corroboration review before
it can become evidence.

Official account identity never constitutes vessel-location evidence. HMS Middleton and HMS Dasher
are enabled only because their current Royal Navy unit pages directly link their handles; that identity
does not recover or validate any historical post. Disabled and unresolved handles are not guessed from
naming conventions.

## Pipeline

The practical sweep is:

`discovery -> lawful/manual collection -> source and entity validation -> evidence normalisation -> temporal review -> origin deduplication -> conflict/freshness/confidence assessment -> append assessment revision -> generate public projection -> validate/build`

Collection and assessment stay outside page requests. The page fetches one generated static JSON file and makes no source/API calls, so broader discovery does not add page latency or uncontrolled external requests.

`npm run sweep:sources` materialises the recurring manual-source queue and approved discovery targets.
`npm run sweep:collect -- --output=<run.json>` creates a versioned sweep run and collects only the
allowlisted public publisher indexes. The scheduled GitHub workflow uploads this incomplete run as an
artifact; it has read-only repository permission and cannot commit, ingest or publish. Buzz or an
analyst must separately record every required recurring manual-source check and all 68 vessel
outcomes. Newly governed sources and normalised evidence are added before an `updated` outcome is
finalised. Candidate assessment revisions and the target release date/revision must exist before
finalisation so the run can derive and bind every vessel outcome to the exact reviewed state.
`npm run sweep:x -- --run=<run.json> --output=x-social-run.json` adds the trusted-host public-X
source checks and produces a separate private candidate artifact. The endpoint provides a bounded
popular-post sample without date parameters or pagination, so local date filtering cannot establish
complete weekly coverage. Stable IDs and origin clusters prevent repost/cross-post double counting;
source claims, machine interpretation and conflicts remain distinct and publication-ineligible.
`npm run sweep:finalise -- <run.json>` succeeds only when the required interval and checks are complete.
The finalised file is retained under the configured private root's `sweep-runs/` directory. During
the approved non-destructive migration state, an unset root continues to use
`data/internal/provenance/sweep-runs/` as the append-only legacy ledger.

The release gate applies to dataset dates from 24 August 2026. It requires the sweep roster and source
hashes to match the proposed release, the exact required target sets to be present, no pending or
blocked checks, all 68 vessel outcomes, and an explicit finalisation timestamp. Gate-effective runs
capture self-contained registry, discovery-target, roster, public-projection and current-assessment
baselines. CI authenticates a newly added baseline against the pull request base commit and keeps
previously committed runs append-only. The authenticated prior release date also sets the latest
permitted sweep-window lower bound, preventing a caller from omitting part of the period under
review.

Finalisation derives `updated`, `unchanged`, `unknown-retained` or `withheld-policy` from the captured
and candidate projections, requires a new assessment ID for a changed state, binds the exact selected
evidence set and rejects in-place assessment edits. It seals the current projection, assessment,
referenced-evidence, supporting-source and projection-method closure. CI recomputes that seal and all
outcome bindings, including that selected evidence was retrieved no later than its assessment,
vessel review and finalisation. It then evaluates only the latest finalised sweep eligible at the
release instant. A valid typed
blocker preserves the failure for audit but cannot authorise an `asOfDate` advance.

Runs created from 26 August 2026 also require authenticated-prior-snapshot, source-family-volume,
cutoff, late-discovery, duplicate-origin and contradiction integrity decisions. Finalisation records
`complete-with-changes`, `complete-no-supported-changes`, `partial`, `degraded` or `failed`; only the
two complete outcomes are publication eligible. A critical source failure is therefore visible and
cannot silently advance a zero-change snapshot.

Deterministic evidence processing is implemented in `scripts/lib/evidence-processing.mjs`. It emits
explainable canonical-name, alias, account and pennant matches; keeps ambiguous/unmatched items
unresolved; extracts publication and event times separately; clusters exact/common-origin copies;
retains conflicting fields; grades candidates from explicit source/evidence properties; and routes
new, stale, contradictory, unmatched and low-support items to private queues. A model suggestion must
cite exact input spans, preserves missing fields as null and is never publication eligible. Grading
also emits a conservative maximum-public-precision cap; missing location support forces `none`.

## Known limitations and deferred work

- Unreassessed migrated evidence retains legacy source material, but its former date field did not prove whether it represented publication or observation. It remains explicitly historical and unknown-confidence; no time is manufactured to make the map appear fresher.
- The checked-in legacy provenance remains non-sensitive and public-capable during migration.
  Licensed or genuinely non-public material is accepted only through the external fail-closed
  boundary described in [`private-input-boundary.md`](private-input-boundary.md); it is never supplied
  to public CI.
- The manual ingestion command appends evidence but intentionally does not publish a new conclusion. An analyst must create and validate an assessment revision.
- Port-feed, archive and additional provider schedulers are deferred until credentials, terms, rate
  limits, retention and operating ownership are approved. AIS and Copernicus now have disabled internal
  validation/proof-of-concept paths only; see
  [`external-corroboration-evaluation.md`](external-corroboration-evaluation.md).
- Perceptual image deduplication, satellite automation and route inference remain deferred. The
  disabled AIS validator now rejects invalid, stale, out-of-order, out-of-bounds and implausible
  position reports.
- Fifteen official-social coverage rows remain disabled; each registry review must repeat exact
  unit-page verification before enabling an account.

## Research references

- [ODNI Intelligence Community Directive 203](https://www.dni.gov/files/documents/ICD/ICD-203.pdf)
- [W3C PROV-O](https://www.w3.org/TR/prov-o/)
- [Bellingcat social-media verification](https://www.bellingcat.com/resources/2021/11/01/a-beginners-guide-to-social-media-verification/)
- [Bellingcat chronolocation guidance](https://www.bellingcat.com/resources/2023/05/08/chronolocation-determining-when-a-photo-was-taken-using-facebook-google-street-view-and-assorted-tiny-details/)
- [MarineTraffic data collection](https://support.marinetraffic.com/en/articles/9552862-how-is-the-data-collected-and-used-by-marinetraffic)
- [VesselFinder terms](https://www.vesselfinder.com/terms)
- [MarineVesselTraffic NATO Navy Ships](https://www.marinevesseltraffic.com/NATO-navy-ships)
- [MOD official social-media register](https://www.gov.uk/government/organisations/ministry-of-defence/about/social-media-use)
- [X automation rules](https://help.x.com/en/rules-and-policies/x-automation?lang=browser)
