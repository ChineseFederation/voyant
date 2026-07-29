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
    server: {
      deps: {
        // Workspace `exports` resolve to raw `.ts` sources, but vitest treats
        // symlinked workspace packages as external and hands them to Node,
        // which cannot resolve the `./sibling.js` specifiers TypeScript sources
        // use internally. Inlining routes them through vite's transform.
        inline: [/@voyant-travel\//],
      },
    },
  },
})
