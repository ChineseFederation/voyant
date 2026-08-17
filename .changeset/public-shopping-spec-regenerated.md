---
"@voyant-travel/public-api": patch
---

Repair the public shopping OpenAPI generator and regenerate the document it had
stopped producing.

`generate:shopping-openapi` writes the document and then formats it with biome, so
that a semantic change is not buried under thousands of formatting-only lines. The
document passed biome's default 1 MiB ceiling as the public surface grew, and biome
refuses an oversized file rather than skipping it — so the format step began exiting
non-zero, the generator became unrunnable, and it left an unformatted document behind
when it failed. The ceiling is now raised for this one invocation rather than in
`biome.json`, so repo-wide runs keep skipping the 1.8 MiB migration snapshots.

While it was broken the document drifted from the routes. `POST
/v1/public/shopping/trip-selections/book` was missing from it entirely — a public
endpoint absent from the published contract and from the in-app API reference, which
renders these documents — and `/v1/public/shopping/search` and
`/v1/public/shopping/trip-selections` had both moved on. Nothing else changed: the
other twelve paths and every top-level field are byte-identical.

The generator is now registered in `generated-specs.json`, so `verify:openapi-drift`
regenerates and diffs it. It was the only generator in the repository whose output was
unregistered, which is why the drift was invisible for as long as it was.
