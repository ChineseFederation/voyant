import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    passWithNoTests: true,
    hookTimeout: 60000,
    fileParallelism: false,
    maxWorkers: 1,
  },
})
