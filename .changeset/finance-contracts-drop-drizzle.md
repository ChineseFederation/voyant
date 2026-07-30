---
"@voyant-travel/finance-contracts": minor
"@voyant-travel/finance": patch
"@voyant-travel/apps": patch
---

Remove the `drizzle-orm` dependency from `@voyant-travel/finance-contracts`.

`FinanceAppApiRuntime` took a concrete `PostgresJsDatabase` for a handle it only
ever passes through — it never calls a method on it — which forced a Drizzle
dependency into a package ADR-0002 requires to stay dependency-light. The handle
is now a type parameter, `FinanceAppApiRuntime<TDatabase = unknown>`, and the
implementing runtimes instantiate it as
`FinanceAppApiRuntime<PostgresJsDatabase>`.

Consumers that write the bare `FinanceAppApiRuntime` still compile; the handle
resolves to `unknown` for them, so an implementer relying on the previous
implicit `PostgresJsDatabase` should instantiate the parameter explicitly.
