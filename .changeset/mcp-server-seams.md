---
"@voyant-travel/mcp": patch
---

Split the MCP transport into focused modules. `server.ts` was 939 lines holding
route wiring, authorization, registration, dispatch, the action-policy gate, and
Zod schema projection in one file. It now owns route wiring and graph
composition, delegating to `authorization.ts`, `register.ts`, `dispatch.ts`,
`schema-projection.ts`, and `graph-composition.ts`.

No behaviour change and no change to the package's public surface — the option
and identity types moved to `types.ts` and are re-exported from `server.ts`.
