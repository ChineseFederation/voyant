import { defineConfig } from "@voyant-travel/framework/project"

export default defineConfig({
  deployment: {
    target: "node",
    providers: {
      database: "postgres",
    },
  },
})
