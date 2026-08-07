# Occupancy pricing semantics

Occupancy prices must declare whether they are supplements or all-in fares. This is a versioned
cross-runtime invariant; authoring, storefront presentation, sellability quotes, and booking
reconciliation must all use the contract exported by
`@voyant-travel/products-contracts/occupancy-pricing`.

Version 1 defines two bases:

- `supplement`: the occupancy amount is added once to the traveler base fare total.
- `all_in`: the occupancy amount already contains the traveler fare, so no base fare is added.

For example, a EUR 165 traveler base and a EUR 265 all-in single-room price produce EUR 265, not
EUR 430. If EUR 265 is a supplement, the same inputs produce EUR 430 only when the author explicitly
selects `supplement`.

New and edited price rules declare `occupancyPriceBasis`. Authoring rejects a positive room amount
combined with a positive traveler base when the basis is absent. Quote resolution also rejects that
shape, and storefront rate-plan construction omits it, so an ambiguous rule cannot become bookable.

Historical rows keep a nullable column so deployments can migrate without guessing commercial
intent. A missing basis is normalized only when composition cannot double-charge:

- no positive traveler base implies `all_in`;
- no positive occupancy amount implies `supplement`;
- positive traveler base plus positive occupancy amount is quarantined as ambiguous.

Operators must review quarantined rows and select the intended basis. Managed-environment import,
audit, and remediation remain tracked by platform issue
[voyant-platform#1938](https://github.com/voyant-travel/voyant-platform/issues/1938).
