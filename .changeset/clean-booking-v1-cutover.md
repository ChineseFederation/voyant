---
"@voyant-travel/catalog": minor
"@voyant-travel/catalog-contracts": patch
"@voyant-travel/finance": minor
"@voyant-travel/commerce": patch
"@voyant-travel/schema-kit": patch
---

Make Booking Sessions the sole Booking Platform v1 pre-commit lifecycle.

The transactional beta-data cutover verifies genuine commitments, releases
owned capacity, preserves resumable staff attempts as canonical Sessions,
redacts disposable attempts into audited tombstones, and then removes
`booking_drafts`. The duplicate quote/draft/hold routes, draft capability,
reaper, low-level quote tool, and deployment source-provider gate are removed.
