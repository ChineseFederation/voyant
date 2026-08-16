---
"@voyant-travel/catalog": patch
"@voyant-travel/commerce": patch
"@voyant-travel/trips": patch
---

Prepare a Session payment for every target kind, not only products. The Session
payment port returned `not_required` for `owned_entity`, `catalog_item` and
`trip_snapshot` before it read anything, so an accommodation, a cruise cabin, a
sourced entry or a composite trip committed with no payment session, no deposit
and no card ever presented. The port now resolves the policy cascade per target
kind: an owned entity and a sourced entry through the entity-keyed cascade
commerce already composes, an owned product through the product reader that
carries its category layer and localized name, and a Trip through the composite
handler that owns it. A vertical with no payment context still collects nothing,
but that is now its own answer rather than a consequence of the target enum.
