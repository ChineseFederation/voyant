---
"@voyant-travel/trips": patch
---

State the manual-service and accommodation date-range rules for trip components
in the `components` / `addComponents` descriptions. Both are enforced by a Zod
refinement over a free-form `metadata` record, and refinements do not serialize
into JSON Schema, so an agent could not see them when choosing arguments.
