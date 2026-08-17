---
"@voyant-travel/public-api-contracts": minor
"@voyant-travel/public-api": minor
"@voyant-travel/public-api-react": minor
---

Extract the customer-portal wire contracts into
`@voyant-travel/public-api-contracts`, a publishable leaf whose only workspace
dependency is `@voyant-travel/schema-kit`. A browser client can now validate
`/v1/public/customer-portal` payloads without depending on the server package
and its eleven domain modules.
