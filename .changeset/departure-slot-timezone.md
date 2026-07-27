---
"@voyant-travel/inventory-react": patch
"@voyant-travel/i18n": patch
---

Resolve departure times in the slot's own timezone on the product detail page.

A slot's `startsAt`/`endsAt` are true UTC instants — the server validates
`dateLocal` by converting `startsAt` through the slot's `timezone`. The product
page ignored that zone on both sides:

- **Read:** `formatSlotTime` / `formatSlotDate` used `getUTC*`, so a departure
  stored as `2026-11-20T12:00:00Z` in `Europe/Bucharest` rendered as 12:00
  instead of 14:00. The End column was wrong in date as well as time, and
  `formatDuration` inherited the error for itineraries crossing local midnight.
- **Write:** `combineLocalToIso` committed the operator's entered wall clock
  straight through as UTC, so a departure entered as "14:00, Europe/Bucharest"
  was stored as `14:00Z` and actually ran at 16:00 local.

The two were wrong in mirror image, so they agreed with each other while the
Availability page — which converts correctly — showed a different time for the
same slot. Both now go through `instantToSlotLocal` / `localToInstant` from
`@voyant-travel/operations/scheduling`. Entering a local time that does not
exist (the spring-forward gap) is now a field error rather than a silently
shifted instant.

`formatSlotTime` and `formatSlotDate` take the slot timezone as a second
argument.
