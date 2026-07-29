import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@voyant-travel\/framework\/runtime-attestation$/,
        replacement: fileURLToPath(
          new URL("../framework/src/runtime-attestation.ts", import.meta.url),
        ),
      },
      {
        find: /^@voyant-travel\/framework$/,
        replacement: fileURLToPath(new URL("../framework/src/index.ts", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    passWithNoTests: true,
  },
})
