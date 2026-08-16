# Public API live cruise commerce

The live cruise slice is a closed managed Public API path. A browser may send only the cruise search vocabulary and an operator-enabled market, locale, and presentation currency. The response contains public sailing/cabin presentation plus a single-use opaque offer reference. Supplier, connection, source, credential, booking, payment, and FX authority never enters the theme contract.

Only Catalog-admitted cruise source adapters are considered. A source must support live resolution, booking forwarding, and lookup by the stable supplier idempotency key. Sources without reconciliation are excluded. Request-only, wait-list, sold-out, and other non-reservable fare policies are excluded from sellable results. Per-source timeout and failure remain anonymous coverage counts.

The opaque payload pins the exact Catalog source connection, encoded source reference, sailing, cabin, occupancy, fare, and supplier terms used at search time. The managed consumer must redeem it against the same public surface, channel, owner, market, locale, and currency; then create/quote/commit the existing Catalog Booking Session. Catalog revalidates through the same source adapter and its supplier-operation workflow owns idempotency and ambiguous-outcome reconciliation. Themes never reserve inventory or process payment.

## Stack and remaining gates

This change stacks immediately after the merged managed shopping provider wiring. Its `cruise-offer` redemption mapping must be added while restacking the opaque package consumer, before flight/package lifecycle and generic opaque-pagination stacks are consolidated. After those land, release Public API and pin it in Platform's managed bridge before enabling `cruise.sailing.v1`, `cruise.pricing.v1`, or `cruise.quote.v1`.

This OSS seam does not complete Themes Slice 6 by itself. The reference theme still needs live cruise search-to-checkout rendering, a second substantially different first-party theme must render tours and cruises through the same contract, and stable `v1` remains blocked on cross-theme/cross-vertical conformance and browser evidence.
