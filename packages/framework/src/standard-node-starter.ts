import standardNodeStarter from "./standard-node-starter.json" with { type: "json" }

type StandardNodeStarterContract = {
  readonly schemaVersion: "voyant.node-starter.v3"
  readonly rootFiles: readonly [".env.example", ".gitignore", "package.json", "voyant.config.ts"]
  readonly optionalDirectories: readonly [
    "src/api/admin",
    "src/api/public",
    "src/admin",
    "src/modules",
    "src/extensions",
    "src/subscribers",
    "src/links",
    "src/scripts",
  ]
  readonly seedEntry: "src/scripts/seed.ts"
  readonly deploymentTarget: "node"
  readonly databaseProvider: "postgres"
  readonly defaultPlugins: readonly []
  readonly packageScripts: {
    readonly dev: "voyant develop"
    readonly build: "voyant build"
    readonly start: "voyant start"
    readonly seed: "voyant exec ./src/scripts/seed.ts"
    readonly "db:migrate": "voyant migrate"
  }
  readonly runtimeDependencies: readonly [
    "@voyant-travel/admin",
    "@voyant-travel/framework",
    "@voyant-travel/runtime",
    "@voyant-travel/operator-standard",
    "@tanstack/react-query",
    "@tanstack/react-router",
    "react",
    "react-dom",
    "pg",
  ]
  readonly runtimeDependencyCoordinates: {
    readonly "@voyant-travel/admin": "0.135.1"
    readonly "@voyant-travel/framework": "0.63.2"
    readonly "@voyant-travel/runtime": "0.17.9"
    readonly "@voyant-travel/operator-standard": "0.12.3"
    readonly "@tanstack/react-query": "5.101.2"
    readonly "@tanstack/react-router": "1.170.17"
    readonly react: "19.2.7"
    readonly "react-dom": "19.2.7"
    readonly pg: "8.22.0"
  }
  readonly developmentDependencies: readonly ["@voyant-travel/cli", "tsx", "typescript"]
  readonly developmentDependencyCoordinates: {
    readonly "@voyant-travel/cli": "0.40.5"
    readonly tsx: "4.22.4"
    readonly typescript: "6.0.3"
  }
  readonly gitignoreEntries: readonly [
    ".voyant/",
    "dist/",
    "node_modules/",
    ".env",
    ".env.*",
    "!.env.example",
  ]
}

/** Public authored surface of a newly generated standard Node project. */
export const STANDARD_NODE_STARTER = standardNodeStarter as unknown as StandardNodeStarterContract

export const VOYANT_STANDARD_NODE_STARTER_SCHEMA_VERSION = STANDARD_NODE_STARTER.schemaVersion

export function buildStandardNodeStarterSnapshot(): string {
  return `${JSON.stringify(STANDARD_NODE_STARTER, null, 2)}\n`
}
