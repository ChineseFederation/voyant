---
"@voyant-travel/availability": minor
"@voyant-travel/operations": minor
"@voyant-travel/inventory": minor
---

Record which Product Version an operated departure was materialized from.

A departure had no way to name the Product definition it sells. Editing a
product silently changed what every existing departure appeared to offer,
including ones already sold — the gap the product model RFC calls out as the
reason a departure cannot be reconciled, operated, or costed against a stable
definition.

`availability_slots` gains `product_version_id`. It is a soft reference:
`product_versions` is owned by Inventory and a cross-domain foreign key would
violate schema discipline, so the column stays plain text exactly like
`product_id` beside it.

Recurring generation resolves the version **once per rule**, so a publish
landing mid-run cannot split one generation batch across two definitions, and a
later run never rewrites departures an earlier run already bound. The version
arrives through a resolver supplied by the deployment rather than a direct
read — Inventory already depends on Operations, so reaching back the other way
would close a dependency cycle. `resolveCurrentProductVersionId` on the
Inventory side returns the highest version number, which is deterministic by
construction.

Departures created before this column existed are **reported, not backfilled**.
The only signal available after the fact is what the product looks like today,
which is precisely what may have changed since the departure was sold;
assigning that retroactively would manufacture false provenance for exactly the
records where provenance matters most. `reportUnboundDepartures` and
`listUnboundDepartures` expose an operator-review queue that excludes departures
which have already run, since their provenance can no longer affect what is
sold. `countDeparturesOnVersion` gives the impact set for a product edit.

Slot creation accepts an explicit `productVersionId`, so a caller can
materialize a departure against a chosen version.
