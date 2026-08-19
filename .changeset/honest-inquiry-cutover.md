---
"@voyant-travel/bookings": minor
"@voyant-travel/inventory": patch
"@voyant-travel/operations": patch
"@voyant-travel/proposals": minor
"@voyant-travel/proposals-contracts": minor
"@voyant-travel/public-api-client": patch
"@voyant-travel/public-api": minor
"@voyant-travel/relationships": minor
"@voyant-travel/relationships-contracts": minor
---

Route legacy inquiry intake through the canonical Inquiry aggregate, retain read-compatible Booking inquiry projections, add a resumable provenance-preserving legacy cutover job, and retire the duplicated Proposals checkout-inquiry runtime surface.

See the [Proposals checkout-inquiry migration note](../docs/migrations/removed-proposals-checkout-inquiry.md) for removed exports and replacement paths.
