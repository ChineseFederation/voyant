# @voyant-travel/public-api-contracts

## 0.1.0

### Minor Changes

- 8496d0c: Extract the customer-portal wire contracts into
  `@voyant-travel/public-api-contracts`, a publishable leaf whose only workspace
  dependency is `@voyant-travel/schema-kit`. A browser client can now validate
  `/v1/public/customer-portal` payloads without depending on the server package
  and its eleven domain modules.
