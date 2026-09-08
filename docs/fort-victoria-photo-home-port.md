# Fort Victoria photograph and home port

This follow-up to merged PR #91 adds a dedicated local photograph and corrects Fort Victoria's
home port to **Marchwood Military Port, Southampton**, as requested by the owner. Her operational
location remains Seaforth Docks, Liverpool, and status remains In Re-fit. Fleet69/RFA9 and every
marker remain unchanged.

## Photograph

- Royal Navy photograph, [RFA Fort Victoria (A387)](https://commons.wikimedia.org/wiki/File:RFA_Fort_Victoria_(A387).jpg), via Wikimedia Commons.
- [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
- Contains public sector information licensed under the Open Government Licence v3.0.
- Original retained at `public/photos/fort_victoria.jpg`; 720-pixel display copy at `public/photos/cards/fort_victoria.jpg`, generated using the existing sips quality65 convention.
- The existing card credit links to the attribution/licensing page. This historical photograph is illustrative, not evidence of the vessel's current location or condition.

## Home port and release integrity

The owner's home-port instruction is corroborated by the MOD's
[FOI2021-03678 base-port list](https://assets.publishing.service.gov.uk/media/65d75f2c54f1e70011165889/FOI2021-03678.pdf).
That document lists Marchwood for Fort Victoria; it is reference data, not a current-position report.

A separate r3 private candidate updates the canonical entity and generated public identity catalog.
The operational assessment is retained unchanged. Published r1/r2 status and location history bytes
remain intact, with one r3 append. Compare reports the home-port metadata change without describing
it as a deployment or location change. No new sweep or new operational observation is claimed.

The private correction validator now supports a hash-bound prior correction and a narrowly limited
home-port-only mode. Each parent validates with its original Git code and published data, back to
the completed original sweep. Wrong hashes, ancestry, unlisted changes, assessment edits and history
rewrites fail. The active private root and released r2 candidate are preserved; the r3 candidate is
retained separately for the release handoff.

## Verification

Regression checks cover the local image and attribution without external image services, home-port
text on desktop/mobile cards, unchanged Liverpool marker/status/counts, image fallback on genuine
load failures, the metadata Compare entry, and chained correction integrity. Existing photographs
and public provenance policy are unchanged.
