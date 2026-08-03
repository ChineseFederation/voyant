---
"@voyant-travel/accommodations-contracts": patch
"@voyant-travel/admin-extension-sdk": patch
"@voyant-travel/catalog-contracts": patch
"@voyant-travel/charters-contracts": patch
"@voyant-travel/cruises-contracts": patch
"@voyant-travel/flights-contracts": patch
"@voyant-travel/payments": patch
"@voyant-travel/products-contracts": patch
"@voyant-travel/schema-kit": patch
"@voyant-travel/ui": patch
---

Describe every package on the public surface.

The npm assembly path is now private — the deployment ships as an image — so the
published surface is the fourteen packages an external adapter, connector, or
extension author builds against. Each now says what it is for.
