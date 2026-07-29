import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    passWithNoTests: true,
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 60000,
    testTimeout: 30000,
  },
})
