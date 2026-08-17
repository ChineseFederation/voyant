# @voyant-travel/public-api-contracts

## 0.2.1

### Patch Changes

- 694b098: Stop shipping test code in the tarball.

  `tsconfig.build.json` inherited `include: ["src/**/*"]`, so `src/request-contracts.test.ts`
  compiled into `dist/request-contracts.test.js` and `.d.ts` — and `files: ["dist"]` published
  both. 0.1.0 and 0.2.0 each carry them.

  The build now excludes `*.test.ts`. Typechecking is unchanged: `tsconfig.typecheck.json`
  still includes the tests, verified by injecting a type error and watching it fail.

## 0.2.0

### Minor Changes

- 1e323f2: Derive the customer-portal request-body aliases from `z.input` rather than
  `z.infer`. `z.infer` is the schema's OUTPUT type, so a field carrying
  `.default()` read as required and a caller could not satisfy it — every consumer
  had to re-derive its request types by hand. `BootstrapCustomerPortalParsed` and
  `CreateCustomerPortalCompanionParsed` expose the post-parse shapes the server
  needs.

## 0.1.0

### Minor Changes

- 8496d0c: Extract the customer-portal wire contracts into
  `@voyant-travel/public-api-contracts`, a publishable leaf whose only workspace
  dependency is `@voyant-travel/schema-kit`. A browser client can now validate
  `/v1/public/customer-portal` payloads without depending on the server package
  and its eleven domain modules.
