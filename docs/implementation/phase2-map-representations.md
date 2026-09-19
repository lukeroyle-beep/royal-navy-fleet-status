# Reviewed fleet map representations

Phase 2 extends the existing assessment → public projection → map path. It adds no location store and performs no browser-side history search. Public points remain rounded port/city locations, not exact positions; regional centres are cartographic anchors only.

## Selection and evidence

Selection is protected policy override → eligible active point → eligible active region → explicitly reviewed retained point → explicitly reviewed retained region → an explicit completeness failure. An active assessment may carry `last_reported` evidence; selecting it never makes it current. Regions require an explicit reviewed `representative-marker` decision to appear on the map.

`retainedLocation` keeps its prior-assessment reference, evidence IDs, review identity/time, original observation time and reason in private inputs. `current-location-less-precise` permits an older reviewed point to coexist privately with a newer regional assessment. Eligible active regional geography takes precedence; the older point is not relabelled current. A correction link invalidates retention even if the original evidence has no backpatched `supersededBy` field. Unknown timing and publication dates cannot establish observation dates.

Optional public `locationContext` contains only `retained`, observation/publication date-or-null, and optional metadata-only `latestReport` with label, precision, state and its separate dates. Loader and exposure scanning enforce exact nested keys. It contains no evidence IDs, reviewer details, URLs or geometry and has no selection authority. Protected submarines cannot carry this context or use generic retention. Historical views continue to derive geometry solely from their historical ledger, not current context.

The reviewed `mapRepresentation` assessment is the active CASD role authority. Any eligible deployed Vanguard-class SSBN can assume it; duplicate assignments fail. The fixed display anchor is not an observed position or patrol region. The outgoing role loses its representative marker when its reviewed assignment ends.

## Reviewed candidate dispositions

The implementation candidate uses the sealed 12 September baseline. Existing 47 representations and all their geometry/status fields are preserved. Nineteen additional regional records receive display authority for their existing reviewed circles.

- **Proteus:** use the newer 28 August regional evidence. The 21 August observation in the 23 August snapshot does not establish a point; no point is promoted.
- **Tideforce:** retain the separately reviewed 20 August **inbound** regional fact, dated and marked current location unconfirmed. The 21 August **outbound** report remains a distinct fact, not a substitute for the requested candidate. The withdrawn 31 August attribution remains excluded. No point is authorised.
- **Magpie:** East coast of England at regional precision, publication 26 August, observation interval unknown. The reviewed broad offshore circle is a display anchor; it is not a Thames, port or observed-position substitute.

These decisions are append-only in the isolated private candidate. The sealed public release and active private pointer are unchanged. A candidate is not a fresh evidence sweep or a published release.

## Validation and activation

Generate a candidate with the existing private resolver and an external output directory, adding `--require-complete-map` to `scripts/generate-public-projection.mjs`. The flag rejects missing or duplicate fleet IDs, any unrepresented record and anything other than exactly one eligible protected role. It derives the denominator from the candidate, not a hard-coded fleet total. Do not use this gate for partial historical datasets.

Run `npm test`, `npm run build`, and the browser suite. The normal build preserves sealed data when external private inputs are absent. For the staged real candidate, set the browser-only `RNFS_PHASE2_CANDIDATE` file input; tests route that public JSON without replacing the release. Synthetic tests cover unknown dates, retained point and regional labels, separate latest-report metadata, clustering, selection and responsive layouts.

Before any later publication, apply the existing governed snapshot/revision release process, using the reviewed private baseline, the completeness flag, exposure checks and rendered candidate verification. Do not reuse the old release certificate as proof of a newly published data revision. Publication, merge and deployment are separate from this implementation.
