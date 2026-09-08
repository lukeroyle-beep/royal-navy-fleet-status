# Vengeance and Fort Victoria correction

Draft [PR #91](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/91), linked to Issue #90, contains the approved corrections. This is an unpublished candidate. The active private inputs and production deployment are unchanged by this work.

## Reconciled candidate

The candidate is based on published `db0400b6ec87971c35d630f904edf010de5ee0ba` and stages **6 September r2**, following the separately published r1. It preserves the reviewed Tamar representative regional marker, Magpie UK East Coast description without a point marker, and Tideforce unconfirmed location. Every other existing public vessel record is also unchanged except Vengeance.

- HMS Vengeance remains one deployed Vanguard-class SSBN. Public location text is `On patrol`. Actual position and uncertainty geometry remain null, precision remains `none`, and location remains withheld.
- `mapRepresentation: representative-patrol` is a strict opt-in to the previously retained fixed symbolic North Atlantic anchor. Invalid geometry, a different anchor or an arbitrary submarine cannot enable it. No actual SSBN position, patrol area, route, likely operating location or geographical-presence inference is introduced.
- The two representative-marker conventions coexist: Tamar uses the independently reviewed reported-region representation; Vengeance uses deliberately withheld location plus symbolic display. Filters, clustering, selection and shareable URL state use the normal map architecture.
- RFA Fort Victoria is a Fort-class RFA replenishment ship, A387, commissioned in 1994. Her established canonical status enum `In re-fit` renders as `In Re-fit`. Location is `Seaforth Docks, Liverpool`, with long-term lay-up context and the rounded port-level anchor 53.46, -3.02. No exact berth is asserted. Home port remains `Not recorded`.
- Inventory **68 → 69**, RFA **8 → 9**, Royal Navy **60 unchanged**, Fort class **0 → 1**, refit **14 → 15**.
- Visible fleet markers **41 → 43**, now **41 ordinary point markers and 2 representative markers**. The other 26 records remain regional or list-only. All 41 markers from the newly published base are preserved. The old pre-sweep baseline is superseded only by the independently published r1 corrections.
- Published status and location ledgers are retained byte-for-byte, with one new r2 record appended. Earlier snapshots do not acquire Fort Victoria or the Vengeance marker. The unmerged draft r1 was replaced by the actual published r1 during reconciliation; no shipped history was rewritten.
- Provenance fields remain absent from public cards, including Precision, evidence dates/classification and sources. Existing vessel photographs are preserved. No dedicated Fort Victoria image exists; the existing lookup and accessible fallback remain in use.

## Canonical preparation and evidence boundary

A separate r2 private candidate was composed from the current authoritative inputs, retaining all reviewed r1 assessments and adding only the previously prepared owner-directed Vengeance and Fort Victoria amendments. Neither the active root nor the retained draft-r1 root was overwritten. Fort Victoria has an explicitly unreviewed, disabled social-coverage disposition; no successful collection is asserted.

The owner's instruction supplies the operational corrections. Fort Victoria's class, role, pennant and commission year were checked against the [official Royal Navy vessel page](https://www.royalnavy.mod.uk/organisation/units-and-squadrons/support-ships/rfa-fort-victoria). Dock-level geography was checked against the [Wikimedia Seaforth location record](https://commons.wikimedia.org/wiki/Category:Seaforth_Container_Terminal,_Port_of_Liverpool). These are not berth-level vessel observations. No actual SSBN-location research was performed.

The projection method is now 1.3.3, distinguishing the combined representation semantics from the independently published r1 method. That r1 sweep covers 68 vessels and its own sealed projection. It cannot authorize the new 69-vessel r2 candidate. Native validation reports `no sweep run covers 2026-09-06 r2`. The final release timestamp remains provisional until a legitimate matching correction sweep is complete. No scheduler or collection workflow was changed by this PR reconciliation.

## Validation

- Regression coverage verifies one symbolic Vengeance marker, null real geometry, Fort's status/location/counts, both vessels' filters and URL state, normal cards and image fallback.
- The baseline fixture now identifies the published base commit and preserves all of its point markers, history byte prefixes, and exact Tamar/Magpie/Tideforce records. A separate assertion confirms that published r1 does not contain Fort Victoria.
- The full public and canonical-input suites and both production/Pages builds passed for the reconciled candidate. All 43 browser tests passed. Independent integration review found no must-fix code issue; final exact-head review and CI are recorded on the PR. Public CI build success is separate from native publication authorization.
- The r2 evidence-release gate remains blocked. Do not merge until a matching finalized review covers the full 69-vessel candidate, the release artifacts are finalized, and native checks and exact-head review pass.

Rollback of this unpublished work leaves production untouched. Retain the draft branch and separate private candidate for review; do not reset, overwrite or backfill the published release.
