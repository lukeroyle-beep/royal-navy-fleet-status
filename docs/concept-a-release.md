# Concept A workspace release

The approved Phase 1 redesign reserves space for map controls, filters and a compact vessel inspector; retains vessel and shore photographs; and keeps historical location coverage and the non-live nature of public reports explicit. The implementation uses the existing Vite/Leaflet architecture without new runtime dependencies or public-data changes.

Physical preview testing on an iPad Pro 13-inch M4 (owner-reported OS 26.6.1) and Windows identified and resolved three regressions: opening a cluster could return to the previously selected vessel, photo display waited on detached decoding, and absent image credits left an empty grey strip. Owner retests confirmed the camera correction and removal of the strip. VoiceOver was explicitly outside the requested physical acceptance scope.

All 68 curated vessel photos now have committed 720-pixel display copies, reducing their combined transfer size from 22,473,531 to 5,554,040 bytes. Original images and existing credits are retained. The macOS maintenance helper `node scripts/generate-card-photos.mjs` regenerates these copies using sips; builds do not require that tool. Fresh cache-busted preview requests from the test device loaded Vanguard in 109.5 ms and Cattistock in 162.9 ms after image assignment. The owner confirmed both appeared instant. The earlier eight-second load was not captured, so its exact cause is not established.

Validation includes full build, public-client exposure checks, Chromium browser regressions, focused WebKit tests for delayed-photo identity, cluster navigation, rotation, missing credit rows and visible historical coverage. An independent local review found the hidden historical coverage qualifier; it was restored before release.

A refreshed five-cold/five-warm lab comparison measured median LCP of 412 ms cold and 40 ms warm on both the production baseline and pre-thumbnail candidate; maximum CLS was 0.00000453 in the candidate. This supersedes the earlier warm-LCP mismatch and is lab evidence, not field INP. Later thumbnail and historical-context changes require the final release verification recorded with the deployment evidence.

The owner explicitly authorised commit and deployment after device testing. Production deployment and rendered verification are separate stages and must be recorded after they occur.
