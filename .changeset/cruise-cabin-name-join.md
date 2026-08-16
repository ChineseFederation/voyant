---
"@voyant-travel/catalog-react": patch
---

Name the cabin in a sourced cruise's rate rows instead of printing the provider's raw id.

The per-cabin rate rows under a selected sailing join live pricing to catalog
cabins by provider id. The decode behind that join only understood the
SourceRef-wrapped catalog id (`<prefix>_sr_<base64url>`) and returned `null` for
anything else — but the cruise content adapter emits cabin category ids as bare
provider ids (`88-from-2027_CLASSIC`). So no cabin carried an external id, the
join never matched, and every row fell back to printing the id where the cabin
name belongs.

A catalog id is now read for what it is: unwrapped when it carries a SourceRef,
taken verbatim when it does not — the same rule
`sourceRefFromExternalKeyRef` already applies in `@voyant-travel/cruises`, where
an unwrappable ref is a raw external id rather than an absent one. The join
itself is now a named `findCabinForPrice` so it is the thing under test.

Only visible now that per-cabin pricing returns rows at all; a platform ingest
bug had aborted every pricing chunk before it wrote, so the join had never run
against real data.
