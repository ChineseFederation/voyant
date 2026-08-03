---
"@voyant-travel/operations": minor
---

Bind every new departure to its Product Version, not just generated ones.

The version binding landed with only recurring generation resolving a version
automatically; a departure created through the admin route recorded none. That
left the guarantee — a departure can always name the definition it sells —
true of the bulk path but not the manual one.

`createSlot` now resolves the product's currently published version itself, and
generation falls back to the same resolver when no override is supplied. An
explicit `productVersionId` still wins, so a caller can materialize against a
chosen version.

The version is read through a local `productVersionsRef`, the same escape hatch
`productsRef` and `productOptionsRef` already use: Inventory owns
`product_versions` and already depends on Operations, so importing it would
close a dependency cycle.

`service-core.ts` had grown past the size gate while owning four unrelated
aggregates, which blocked touching it at all. Availability rules and start
times move to `service-rules.ts` and the shared static-availability guard to
`service-product-guard.ts` — pure moves with no behaviour change, leaving slot
and closeout lifecycle behind. `availabilityService` re-exports everything as
before, so no caller changes.
