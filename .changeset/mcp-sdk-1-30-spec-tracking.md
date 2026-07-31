---
"@voyant-travel/mcp": patch
---

Upgrade `@modelcontextprotocol/sdk` to `^1.30.0` (from `^1.29.0`) and add a
protocol-version negotiation test.

1.30.0 is the latest published SDK; it negotiates protocol `2025-11-25` over our
stateless transport. It shipped one day before the 2026-07-28 spec revision, so
none of that revision's features (cacheable list results, MRTR
`input_required`, the tasks extension, `Mcp-Method`/`Mcp-Name` header routing)
are implemented yet. `tests/protocol-version.test.ts` pins the negotiated
version so a future SDK bump that advances it is visible rather than silent, and
`docs/architecture/mcp-2026-07-28-spec-adoption.md` tracks the features to adopt
as the SDK ships them — including the constraint that Sampling, Roots, and
Logging are now deprecated and must not be built on.

No behaviour change.
