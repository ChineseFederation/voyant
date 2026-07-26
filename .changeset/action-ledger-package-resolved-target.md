---
"@voyant-travel/action-ledger": patch
---

Stop rejecting package-resolved action targets when the command omits the declared target field. A tool with `resolveActionTarget` derives its target from server-owned state, so commands that address a child record (an itinerary day by `dayId` rather than the owning product `id`) no longer fail the command-target cross-check. A caller-supplied target field is still matched exactly.
