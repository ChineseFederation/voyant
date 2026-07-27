---
"@voyant-travel/quotes": patch
---

Seed a default "Sales" quote pipeline and its six stages. `quotes.pipeline_id`
and `quotes.stage_id` are both NOT NULL and nothing created a pipeline, so
`create_quote` could not succeed on a fresh operator. Guarded on the table being
empty, so an operator with their own pipeline is untouched.
