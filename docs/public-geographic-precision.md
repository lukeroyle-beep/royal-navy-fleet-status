# Public geographic precision

The public map represents the precision of a reviewed public report, not a live vessel fix. Internal evidence, source identity, grading and analyst metadata remain outside the generated browser dataset.

## Public fields

The generated vessel projection separates two concepts:

- `locationState`: `confirmed`, `last_reported`, `unconfirmed`, `no_recent_information` or `withheld`.
- `locationPrecision`: `port`, `city`, `region` or `none`.

`publicLocationLabel` supplies the neutral map and summary label. A port or city record can contain a rounded `position`. A region record instead contains `uncertaintyArea`, with a coarse centre, radius and the fixed `regional` representation type. A list-only record contains neither.

Regional areas communicate geographic context only. They are not probability boundaries, routes, current positions or evidence that a vessel remains inside the area. The map labels them “Approximate region, not a live position”.

## Publication safeguards

- The projection uses an explicit field allow-list. It never copies an assessment object wholesale.
- Port and city coordinates are rounded to at most two decimal places. Validation rejects more precise public points.
- Regional records cannot contain a point marker. Their bounded representation must have a valid coarse centre and a radius between 5 and 2,500 kilometres.
- Unconfirmed, no-recent-information and withheld records are list-only.
- Unknown records cannot be given geometry.
- Submarine patrol reports cannot contain point or regional geometry.
- Submarine location text cannot publish numbered dock or berth references.
- A withheld patrol has no symbolic marker. The public map never substitutes an invented coordinate for a classified or unavailable position.

These checks run in the loader, public-projection tests and production leakage scan. The final built vessel JavaScript Object Notation (JSON) file is also checked for internal or legacy fields such as source identifiers, evidence metadata, `symbolicPosition` and `unmappedReason`.

## Maintainer workflow

Do not edit `data/royal-navy/vessels.json` directly. Record the reviewed state in the internal assessment workflow, regenerate the allow-listed public projection, and run:

```bash
npm run generate:public
npm run validate:data
npm test
npm run build
```

The regression fixture at `scripts/fixtures/location-precision.json` covers every public state and the Royal Fleet Auxiliary (RFA) Proteus, RFA Tideforce, HMS Spey and HMS Duncan missed-evidence cases. Those fixtures describe expected handling of example reports; they do not fix a vessel’s current published status.
