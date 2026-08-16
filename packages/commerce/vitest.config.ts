import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    passWithNoTests: true,
    // Database tests here share one test database, and `cleanupTestDb`
    // truncates the whole operator schema — 464 tables. Run in parallel, two
    // files TRUNCATE each other and block until a hook times out; run against
    // vitest's 10s default, even an uncontended truncate on a cold database is
    // marginal.
    //
    // Commerce was the last package in the `integration` CI lane still on both
    // defaults, which is why its file was the one that failed. Finance and
    // relationships already set exactly these three, so this matches them
    // rather than inventing a per-file exception.
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 60_000,
  },
})
