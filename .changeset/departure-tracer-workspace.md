---
"@voyant-travel/operations-react": minor
"@voyant-travel/finance-react": patch
"@voyant-travel/i18n": minor
---

feat(operations): reconcile a departure in one workspace

The availability slot detail page becomes the departure workspace. It reads its
headline from the composed `GET /slots/{id}/summary` envelope instead of
re-summing the allocation manifest in the browser, so a paged manifest can no
longer move a counter, and Finance's own P&L replaces the client-side revenue
roll-up (`aggregateSlotFinancials` and `KpiStrip` are deprecated but still
exported).

- Six sections — Overview, Travelers, Allocation, Operations, Financials,
  Activity — replace the old six tabs. Extras, Pickup and Closeouts are
  sections inside Operations; Meta is the identity block inside Overview.
- The selected section is URL-addressable (`?tab=`), so it survives a reload
  and is linkable.
- Every section renders when empty, each with its next authorized action.
  Pickup and Closeouts previously disappeared entirely.
- The typed departure issues render with severity, grouped, localized per
  `DepartureIssueCode`, each linking to its subject where one exists.
- Allocation resources' persisted `refType`/`refId` now resolve to a
  destination (resource, supplier, product), and Financials links to Finance's
  profitability report through a new `financeProfitability.report` destination.
- Fixes the allocation audit log resolving `allocation_resources` ids against
  the global operations resource pool, which always missed and rendered a raw
  id.
