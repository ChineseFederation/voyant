---
"@voyant-travel/mcp": minor
---

Add an MCP guide layer: the server now advertises `instructions` on `initialize`
and registers read-only guide Tools (`voyant_guide`, `voyant_glossary`). The
instructions explain that the deployment is a travel-operator platform and how
to discover capabilities via `tools/list` / the manifest; the guide Tools cover
the booking journey and supply models, quote versioning (acceptance is not
confirmation), product authoring vs publication, room/unit/traveller vocabulary,
and the `_voyant` confirmation/approval protocol. All content is sourced from
`docs/architecture/` and `UBIQUITOUS_LANGUAGE.md`, and the guidance is
scope-aware so a read-only key is never shown write workflows as available.
