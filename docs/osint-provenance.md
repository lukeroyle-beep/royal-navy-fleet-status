# OSINT provenance architecture

Research cut-off: 2026-08-15.

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
2. `sources.json`: central source identity, category, publisher/account, officiality evidence, reliability tier, collection mode, terms notes and enabled state. It also records the complete 71-vessel official-X review.
3. `evidence.json`: immutable source claims with retrieval/publication/observation time semantics, origin cluster, content hash, directness, geographic precision and correction links.
4. `assessments.json`: versioned conclusions with selected, excluded and conflicting evidence, categorical confidence, freshness rationale, method/assessor and previous-assessment linkage.

`scripts/generate-public-projection.mjs` joins canonical identity to the current assessment and emits only card/map fields. Build validation proves that the checked-in projection matches the internal assessment index. The production exposure scan rejects internal field names, source URLs, X handles and internal directories in built output.

## Deterministic assessment rules

- Corroboration counts unique `originId` values. Articles, screenshots and reposts derived from one source do not increase independence.
- Current location evidence requires a known observation interval. A publication timestamp alone is historical.
- Transient, port-visit, underway, maintenance and static-location claims use different freshness windows. Expired evidence remains in history and cannot establish a current fix.
- Newer credible observations can supersede older transitions; overlapping incompatible observations are retained as conflicts and reduce confidence to `unknown` until resolved.
- `high` requires current direct evidence from at least two independent origin clusters and a Tier A/B source base. One strong current direct source is `moderate`; aging or weaker usable evidence is `low`; expired, time-unknown or unresolved contradictory evidence is `unknown`.
- Schedules, retrospectives and explicitly historical items cannot become current merely because they were recently published.
- Source authority cannot erase age, lack of geographic precision or unresolved conflict.

## Source universe and lawful collection

The registry contains the 28 evidence sources already used by the tracker plus these implemented collection classes:

- official MOD/GOV.UK and NATO releases;
- Royal Navy, DefenceHQ and DefenceHQPress organisation accounts;
- 28 vessel-account records found in the roster-wide official-page review: 23 enabled, three legacy, one registry-only and one provisional/disabled;
- official harbour/dockyard and defence-contractor news;
- licensed MarineTraffic and VesselFinder API entries, disabled until credentials/licence approval;
- MarineVesselTraffic NATO Navy Ships as a manual discovery-only source;
- official imagery, credible media and AIS-derived legacy sources classified by tier and collection mode.

No X scraping, commercial-page scraping, media downloading, satellite automation, webcam automation or automatic archive submission is implemented. X requires an authorised API for automation. Commercial AIS terms and public-output licences require procurement review. Visual material needs copyright, geolocation and chronolocation review. A manual evidence-ingestion command provides a maintainable lawful alternative and fails closed on unknown source/vessel IDs, malformed URLs, hashes or timestamps.

Official account identity never constitutes vessel-location evidence. HMS Middleton is therefore registry-only because its official account was identified but the individual post URL and original timestamp were not recovered. Disabled and unresolved handles are not guessed from naming conventions.

## Pipeline

The practical sweep is:

`discovery -> lawful/manual collection -> source and entity validation -> evidence normalisation -> temporal review -> origin deduplication -> conflict/freshness/confidence assessment -> append assessment revision -> generate public projection -> validate/build`

Collection and assessment stay outside page requests. The page fetches one generated static JSON file and makes no source/API calls, so broader discovery does not add page latency or uncontrolled external requests.

`npm run sweep:sources` materialises the current enabled collection queue from the registry. It includes all 23 enabled official vessel accounts, marks manual review, and forces discovery-only treatment for aggregators. It performs no network collection itself. `scripts/ingest-evidence.mjs` then validates reviewed evidence against the canonical vessel and source registries before an append.

## Known limitations and deferred work

- The 71 migrated evidence records retain legacy source material, but their former date field did not prove whether it represented publication or observation. They are explicitly historical and unknown-confidence until reassessed; no time was manufactured to make the map appear fresher.
- The repository is public-capable. “Internal” means excluded from the client bundle, not secret. A future private datastore is required for licensed or genuinely non-public material.
- The manual ingestion command appends evidence but intentionally does not publish a new conclusion. An analyst must create and validate an assessment revision.
- X/API, AIS, port-feed and archive schedulers are deferred until credentials, terms, rate limits, retention and operating ownership are approved.
- Perceptual image deduplication, satellite automation, route inference, geofencing and impossible-speed checks are deferred until evidence has reliable capture times and coordinates.
- Thirty-four roster entries had no direct X link in the documented official-site search and nine remain unresolved; each registry review must repeat exact unit-page verification before enabling an account.

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
