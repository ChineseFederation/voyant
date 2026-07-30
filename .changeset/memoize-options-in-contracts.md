---
"@voyant-travel/cruises-contracts": patch
"@voyant-travel/charters-contracts": patch
"@voyant-travel/cruises": patch
"@voyant-travel/charters": patch
---

Move the pure `MemoizeOptions` type into `@voyant-travel/cruises-contracts` and
`@voyant-travel/charters-contracts` so external consumers can reference the
adapter cache option shape without taking a runtime dependency on the cruises
or charters modules (ADR-0002).

The `@voyant-travel/cruises` and `@voyant-travel/charters` runtimes re-export
`MemoizeOptions` from their contracts package, so existing importers keep
working — no breaking change.
