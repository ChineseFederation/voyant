import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // `src/**` matters as much as `tests/**`: finance kept two test files next to
    // the code they cover (`src/mcp-runtime.test.ts`, and one more), and this
    // include silently excluded both — they had never executed. A test file that
    // cannot run is worse than no test, because it reads as coverage.
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    passWithNoTests: true,
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 60000,
  },
})
