---
"@voyant-travel/public-api-contracts": patch
---

Stop shipping test code in the tarball.

`tsconfig.build.json` inherited `include: ["src/**/*"]`, so `src/request-contracts.test.ts`
compiled into `dist/request-contracts.test.js` and `.d.ts` — and `files: ["dist"]` published
both. 0.1.0 and 0.2.0 each carry them.

The build now excludes `*.test.ts`. Typechecking is unchanged: `tsconfig.typecheck.json`
still includes the tests, verified by injecting a type error and watching it fail.
