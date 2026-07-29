import { defineConfig } from "vitest/config"

export default defineConfig({
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
