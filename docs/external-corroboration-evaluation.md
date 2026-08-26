# External corroboration evaluation

Decision date: 2026-08-26. Re-review before enabling either integration.

## Decision

AISStream and Copernicus Data Space remain disabled by default and internal-only. AISStream is not
approved for live use until the owner accepts its credential boundary and obtains a sufficiently
clear data licence, retention and redistribution position. Copernicus is suitable only for a
disabled proof-of-concept against already-known ports and large surface vessels. Neither source can
independently change public status or location, and no raw payload, precise position, imagery,
credential, registry or diagnostic may enter the public build.

## AISStream review

Official documentation reviewed:

- [Developer documentation](https://aisstream.io/documentation)
- [Privacy policy](https://aisstream.io/privacypolicy)

The service requires a server-side API key, WSS, at least one geographic bounding box and an initial
subscription within three seconds. It permits up to 200 nine-character MMSI filters per
subscription, three subscribed connections per account and three open connections per originating
IP, with subscription changes limited to one per second. Direct browser connections are prohibited.
The provider says that messages are event-driven, can be delayed or missing, can be dropped for slow
consumers, have no durable replay and carry no uptime or delivery service-level guarantee.

The privacy page says the service collects IP address, browser/referrer/request timestamps and the
GitHub identity used for account authentication. It does not state a retention duration. The
reviewed official pages do not provide an AIS-data licence, attribution rule or redistribution grant
sufficient for this project's use. That gap, plus fallible delivery and the sensitivity of precise
warship positions, makes production collection unsuitable at this decision date.

The implemented adapter therefore:

- requires `RNFS_ENABLE_AIS=1`, a server-side `AISSTREAM_API_KEY`, private curated MMSIs and explicit
  bounding boxes;
- omits submarines from subscriptions and never serialises the key in configuration diagnostics;
- rejects invalid coordinates, future/stale/out-of-order reports, out-of-bounds positions and
  implausible jumps while retaining report and receipt times separately;
- treats connection loss and missing transmission as unavailable—not evidence of absence; and
- routes every accepted position to internal human review without public eligibility or authority
  to override stronger official evidence.

No live credential or MMSI registry is supplied by this repository. No raw AIS retention is
approved. If the owner later approves a proof-of-concept, use the external private-input boundary,
encrypted short-lived storage and a separately documented deletion period.

## Copernicus Data Space review

Official documentation reviewed:

- [API catalogue](https://documentation.dataspace.copernicus.eu/APIs.html)
- [Token generation](https://documentation.dataspace.copernicus.eu/APIs/Token.html)
- [Quotas and limitations](https://documentation.dataspace.copernicus.eu/Quotas.html)
- [Terms and conditions](https://dataspace.copernicus.eu/terms-and-conditions)
- [Sentinel-2 mission data](https://documentation.dataspace.copernicus.eu/Data/SentinelMissions/Sentinel2.html)
- [Citation guidance](https://documentation.dataspace.copernicus.eu/FAQ.html)

Registration and an access token are required for product download; the token documentation warns
against hardcoding account credentials. General-user quotas currently include 2,000 S3 requests per
minute, four concurrent immediately-available-data connections, a 12 TB rolling 30-day transfer
limit, 300 Sentinel Hub requests per minute and 10,000 Sentinel Hub requests/processing units per
month. Limits can change and must be rechecked before use.

Copernicus Sentinel data is described as free, full and open under the linked Sentinel legal notice,
with source attribution required. Other portal material is restricted, including a non-commercial
use provision. The service does not guarantee data availability and may be constrained, suspended
or changed. Sentinel-2 optical imagery has 10/20/60 m bands and nominal revisit intervals of five
days with two satellites (two to three days at mid-latitudes), but clouds can remove valid pixels;
even a visible object can be misidentified. Those limits make the imagery corroborative rather than
decisive for vessel identity.

The proof-of-concept evaluator therefore accepts only large surface-vessel observations at ports
already known to the private pipeline, records capture time, cloud and resolution limits, always
records revisit and misidentification risk, and requires independent evidence plus human review. It
never produces a public-eligible result. No imagery, token, cache or collection diagnostic is
committed.

## Enablement gate

Enabling either source requires a separate owner decision covering credentials, external encrypted
storage, retention/deletion, provider terms, attribution, operating ownership and incident response.
After that decision, run the complete disabled-flag, missing-credential, disconnect, temporal,
coordinate, bounds, speed, cloud, resolution, independent-corroboration and public-absence tests.
Production deployment and unattended publication remain prohibited.
