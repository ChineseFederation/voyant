---
"@voyant-travel/quotes": minor
---

Add `list_quote_pipelines`, `list_quote_stages`, `create_quote` and `add_quote_product`. The package advertised the whole lifecycle of a quote that already exists — snapshot, send, accept, decline — but nothing to open one or put a line on it, so an agent could send and accept a quote it had no way to build. `create_quote` needs a pipeline and stage, and neither was discoverable either, so the two reads ship alongside it. Both writes are staff-only, `quotes:write`, and confirmation-gated; the existing `snapshot_quote_version` still owns freezing lines into an immutable proposal.
