import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, URL } from "node:url"
import { type Plugin, type PluginOption, type UserConfig, version as viteVersion } from "vite"

/**
 * Force heavy vendor libs into their own chunks so they're only downloaded
 * when a route/component that uses them is reached (combined with React.lazy
 * at the consumer site). Without this, Vite hoists them into the shared entry
 * chunk because the @voyant-travel/ui barrel re-exports components that statically
 * import them, leaking the deps into every route's dep graph.
 *
 * React/JSX runtime + react-dom are pinned FIRST: without that, the bundler
 * can hoist the JSX runtime into another vendor chunk, forcing every
 * React-using chunk to import that chunk just to get `jsx`/`jsxs`.
 */
function isNodeModulePackage(id: string, packageName: string): boolean {
  return id.includes(`/node_modules/${packageName}/`)
}

const ADMIN_SHELL_UI_MODULES = new Set([
  "alert",
  "badge",
  "button",
  "card",
  "input",
  "label",
  "separator",
  "skeleton",
  "table",
  "textarea",
])

function voyantAdminShellUiChunk(id: string): string | undefined {
  const normalizedId = id.replaceAll("\\", "/")
  if (
    !normalizedId.includes("/packages/ui/") &&
    !normalizedId.includes("/node_modules/@voyant-travel/ui/")
  ) {
    return undefined
  }

  if (normalizedId.endsWith("/src/lib/utils.ts") || normalizedId.endsWith("/dist/lib/utils.js")) {
    return "admin-shell-ui"
  }

  const match = normalizedId.match(/\/(?:src|dist)\/components\/([^/]+)\.(?:ts|tsx|js)$/)
  return match?.[1] && ADMIN_SHELL_UI_MODULES.has(match[1]) ? "admin-shell-ui" : undefined
}

const ADMIN_SHELL_LUCIDE_ICONS = new Set(["check", "file-text", "loader-circle", "search"])
const ADMIN_SHELL_LUCIDE_CORE = new Set([
  "Icon.mjs",
  "context.mjs",
  "createLucideIcon.mjs",
  "defaultAttributes.mjs",
  "shared/src/utils/hasA11yProp.mjs",
  "shared/src/utils/mergeClasses.mjs",
  "shared/src/utils/toKebabCase.mjs",
  "shared/src/utils/toPascalCase.mjs",
])

function voyantAdminShellLucideChunk(id: string): string | undefined {
  const normalizedId = id.replaceAll("\\", "/")
  if (!isNodeModulePackage(normalizedId, "lucide-react")) return undefined

  const relativePath = normalizedId.split("/lucide-react/dist/esm/")[1]
  if (!relativePath) return undefined
  if (ADMIN_SHELL_LUCIDE_CORE.has(relativePath)) return "admin-shell-lucide"

  const icon = relativePath.match(/^icons\/([^/]+)\.mjs$/)?.[1]
  return icon && ADMIN_SHELL_LUCIDE_ICONS.has(icon) ? "admin-shell-lucide" : undefined
}

export function voyantVendorChunk(id: string): string | undefined {
  const normalizedId = id.replaceAll("\\", "/")

  // The editor imports Tiptap, but Rolldown can place modules shared by that
  // vendor graph into the editor's automatic chunk. Keep the two editor entry
  // modules with Tiptap so Rolldown cannot emit a circular
  // tiptap <-> rich-text-editor chunk pair. Match both workspace sources and
  // the installed package layout used by portable starters.
  if (
    (normalizedId.includes("/packages/ui/") ||
      normalizedId.includes("/node_modules/@voyant-travel/ui/")) &&
    (normalizedId.endsWith("/src/components/rich-text-editor.tsx") ||
      normalizedId.endsWith("/src/components/rich-text-variable-extension.ts"))
  ) {
    return "tiptap"
  }

  // ChartContainer imports Recharts while Recharts imports D3 helpers that
  // Rolldown can otherwise place beside this first-party module. That creates
  // a recharts <-> chart chunk cycle and leaves dashboard components undefined
  // during browser evaluation. Keep only the UI bridge with the vendor; its D3
  // dependencies can remain in their automatic, one-way dependency chunk.
  if (
    (normalizedId.includes("/packages/ui/") ||
      normalizedId.includes("/node_modules/@voyant-travel/ui/")) &&
    normalizedId.endsWith("/src/components/chart.tsx")
  ) {
    return "recharts"
  }

  if (!normalizedId.includes("node_modules")) return undefined

  if (
    isNodeModulePackage(normalizedId, "react") ||
    isNodeModulePackage(normalizedId, "react-dom") ||
    isNodeModulePackage(normalizedId, "scheduler")
  ) {
    return "react"
  }
  if (normalizedId.includes("/clsx/") || normalizedId.includes("/tailwind-merge/")) {
    return "class-utils"
  }
  if (normalizedId.includes("/@tiptap/") || normalizedId.includes("/prosemirror-")) {
    return "tiptap"
  }
  // Drizzle contains legitimate circular ESM relationships between its base
  // column builders. Keep the complete package in one chunk so Rollup cannot
  // split a base class away from the subclass that extends it.
  if (isNodeModulePackage(normalizedId, "drizzle-orm")) return "drizzle-orm"
  if (normalizedId.includes("/recharts/")) return "recharts"
  if (normalizedId.includes("/pdf-lib/") || normalizedId.includes("/@pdf-lib/")) {
    return "pdf-lib"
  }
  return undefined
}

type ExtraManualChunks = (id: string) => string | undefined

export function voyantChunkOutput(viteMajor: number, extraManualChunks?: ExtraManualChunks) {
  const chunkName = (id: string) =>
    voyantVendorChunk(id) ??
    voyantAdminShellUiChunk(id) ??
    voyantAdminShellLucideChunk(id) ??
    extraManualChunks?.(id)
  if (viteMajor >= 8) {
    return {
      codeSplitting: {
        // Keep named vendor chunks from absorbing their transitive dependencies.
        // In particular, Recharts shares small helpers with workspace chrome;
        // absorbing those helpers made every route import the full chart bundle.
        includeDependenciesRecursively: false,
        groups: [{ name: (id: string) => chunkName(id) ?? null }],
      },
    }
  }
  return {
    // Rollup 4's equivalent. Vite 6 and 7 use Rollup rather than Rolldown.
    onlyExplicitManualChunks: true,
    manualChunks: chunkName,
  }
}

/**
 * Dependencies pre-bundled for the SSR environment so cold dev-server starts
 * don't pay per-module transform costs for the common runtime set.
 */
export const VOYANT_SSR_OPTIMIZE_DEPS: readonly string[] = [
  "react",
  "react-dom",
  "react-dom/server",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "@tanstack/react-query",
  "@tanstack/react-router",
]

const VOYANT_CLIENT_OPTIMIZE_DEPS_EXCLUDE: readonly string[] = [
  "@voyant-travel/operator-standard",
  "@voyant-travel/operator-standard/standard-frontend",
]

const VOYANT_DEDUPE_DEPENDENCIES: readonly string[] = [
  "react",
  "react-dom",
  "@tanstack/react-query",
  "@tanstack/react-router",
]

/**
 * First-party framework hosts that must remain in the production server graph.
 * They import TanStack Start's server core, whose `#tanstack-*` entry aliases
 * only exist while the TanStack Vite plugin is resolving the application.
 */
const VOYANT_PRODUCTION_BUNDLED_PACKAGES: readonly string[] = [
  "@voyant-travel/runtime",
  "@voyant-travel/admin-host",
]

const TANSTACK_START_BUNDLED_PACKAGES: readonly string[] = [
  "@tanstack/react-start",
  "@tanstack/start-client-core",
  "@tanstack/start-server-core",
]

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const

/**
 * Route-file ignore pattern for TanStack Start's file router: colocated
 * helpers (`_components`, `_hooks`, …) and page/section/dialog modules are
 * not route files. Pass to `tanstackStart({ router: { routeFileIgnorePattern } })`.
 */
export const VOYANT_ROUTE_FILE_IGNORE_PATTERN =
  "^(_components|_hooks|_stores|_sections|_contexts|_lib|_tabs|utils|types\\.ts|shop-product-detail-(?:content|accommodations|cruises|products)\\.(?:ts|tsx)|.*(?:^|[-])(shared|page(?:-[a-z0-9-]+)?|dialogs?(?:-[a-z0-9-]+)?|sections|service-row|day-row|version-row|contact-tab|questions-row|questions-tab|section-header|kanban|queries)\\.(?:ts|tsx))$"

export interface VoyantGeneratedRouteFile {
  readonly path: string
  readonly source: string
}

let generatedRouteWriteSequence = 0

function generatedRouteFiles(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? generatedRouteFiles(path) : [path]
  })
}

function removeEmptyGeneratedRouteDirectories(root: string, preserveRoot = true): void {
  if (!existsSync(root)) return
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      removeEmptyGeneratedRouteDirectories(join(root, entry.name), false)
    }
  }
  if (!preserveRoot) {
    try {
      rmdirSync(root)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== "ENOENT" && code !== "ENOTEMPTY") throw error
    }
  }
}

/**
 * Materialize package-owned route registrations into the ignored project graph.
 * TanStack's file router still receives physical files, while applications do
 * not copy standard product routes into their authored source tree.
 */
export function voyantGeneratedRoutes(options: {
  appRootUrl: string
  files: readonly VoyantGeneratedRouteFile[]
}): { plugin: Plugin; routesDirectory: string; generatedRouteTree: string } {
  const appRoot = fileURLToPath(new URL(".", options.appRootUrl))
  const routesDirectory = resolve(appRoot, ".voyant/routes")
  const generatedRouteTree = resolve(appRoot, ".voyant/routeTree.gen.ts")

  const generate = () => {
    const expected = new Map<string, string>()
    for (const file of options.files) {
      if (file.path.startsWith("/") || file.path.includes("..")) {
        throw new Error(`Invalid generated route path: ${file.path}`)
      }
      expected.set(resolve(routesDirectory, file.path), `${file.source.trim()}\n`)
    }

    mkdirSync(routesDirectory, { recursive: true })
    for (const [target, source] of expected) {
      if (existsSync(target) && readFileSync(target, "utf8") === source) continue

      mkdirSync(dirname(target), { recursive: true })
      const temporary = resolve(
        appRoot,
        `.voyant/.route-write-${process.pid}-${generatedRouteWriteSequence++}.tmp`,
      )
      try {
        writeFileSync(temporary, source)
        renameSync(temporary, target)
      } finally {
        rmSync(temporary, { force: true })
      }
    }

    for (const path of generatedRouteFiles(routesDirectory)) {
      if (!expected.has(path)) rmSync(path, { force: true })
    }
    removeEmptyGeneratedRouteDirectories(routesDirectory)
  }

  generate()
  return {
    routesDirectory,
    generatedRouteTree,
    plugin: {
      name: "voyant-generated-routes",
      enforce: "pre",
      buildStart: generate,
      configureServer(server) {
        server.watcher.add(options.files.map((file) => resolve(routesDirectory, file.path)))
      },
    },
  }
}

type VisualizerModule = {
  visualizer: (options: {
    filename: string
    template: "treemap"
    gzipSize: boolean
    brotliSize: boolean
  }) => PluginOption
}

/**
 * Opt-in bundle analysis: `ANALYZE=1 pnpm build` emits `dist/stats.html` with
 * a treemap of all client chunks. Off by default so normal builds stay clean.
 * Requires `rollup-plugin-visualizer` in the app's devDependencies; silently
 * disabled when absent.
 */
export function createAnalyzePlugin(importMetaUrl: string): PluginOption | false {
  if (process.env.ANALYZE !== "1") return false

  try {
    const require = createRequire(importMetaUrl)
    const { visualizer } = require("rollup-plugin-visualizer") as VisualizerModule
    return visualizer({
      filename: "dist/stats.html",
      template: "treemap",
      gzipSize: true,
      brotliSize: true,
    })
  } catch {
    return false
  }
}

export interface VoyantStartViteConfigOptions {
  /** `import.meta.url` of the app's `vite.config.ts` — anchors the `@` alias. */
  appRootUrl: string
  /**
   * App-supplied plugin instances (cloudflare, tailwindcss, tanstackStart,
   * react, devtools, …). Plugin packages stay app dependencies; this preset
   * only versions the load-bearing config.
   */
  plugins: PluginOption[]
  /**
   * Hosts allowed to reach the dev server. Defaults to `true` (allow all) so
   * Cloudflare-tunnel / ngrok webhooks work in dev; pass an explicit host
   * list to restrict.
   */
  allowedHosts?: true | string[]
  /** Additional chunking rules, consulted after the Voyant vendor rules. */
  extraManualChunks?: (id: string) => string | undefined
  /** Extra SSR optimizeDeps entries appended to the Voyant set. */
  ssrOptimizeDepsInclude?: readonly string[]
  /**
   * Keep entry HTML preloads, but let lazy imports fetch their own dependency
   * graph when they are actually requested. Large generated route graphs can
   * otherwise make Vite embed hundreds of dependency URLs in the entry chunk,
   * increasing parse and compile time before the application can authenticate.
   */
  deferDynamicImportPreloads?: boolean
  /**
   * Build the SSR/server environment for a Node runtime (voyant#2966: Voyant
   * deployments are Node-only — no `@cloudflare/vite-plugin`). Adds the
   * load-bearing Node-SSR config the app would otherwise hand-merge:
   *
   * - `ssr.target: "node"` so `node:` builtins the API graph uses resolve
   *   instead of being externalized for the browser;
   * - `ssr.noExternal` for `@voyant-travel/*` / `@pxmstudio/*` so workspace
   *   packages (whose `exports` point at `.js`-specifier TS source) are bundled
   *   into the server build rather than left unresolvable at runtime;
   * - `ssr.resolve.conditions` with `development` ahead of `node` so those
   *   packages resolve from `./src` and the app build stands alone (no
   *   prebuilt `dist` / `turbo ^build` needed).
   * - `ssr.external` for the CommonJS `pg` driver so Node preserves its native
   *   constructor exports. Drizzle stays bundled in the single `drizzle-orm`
   *   vendor chunk above so packaged servers remain self-contained without
   *   splitting its circular ESM graph.
   *
   * This is the config a Cloud-built hosted admin image would otherwise copy;
   * packaging it keeps it a version bump, not a copy (voyant#3044).
   */
  nodeSsr?: boolean
  /**
   * Resolve `@voyant-travel/*` from `./src` and bundle them into the server
   * build. Defaults to `true`, which is what a development server wants: the
   * packages become real members of the Vite module graph rather than
   * `node_modules` symlinks, so editing one hot-reloads.
   *
   * A production build must pass `false`. Inlining absorbs a workspace
   * package's CODE but not its DEPENDENCIES, and `pnpm deploy --prod` prunes to
   * what the application itself declares — so every external dependency reached
   * only through an inlined package becomes undeclared and unresolvable at
   * runtime. That is what stopped the operator image from booting
   * (voyant#3994); 36 such dependencies were undeclared, so it would have
   * failed progressively, one feature at a time.
   *
   * With `false` the server imports `@voyant-travel/*` normally, `pnpm deploy`
   * installs them as real packages, and their own dependency trees come with
   * them. This requires the workspace dists to be built first, and requires the
   * deployed manifests to point at `dist` — see
   * `scripts/apply-publish-config.mjs`.
   */
  bundleWorkspaceSource?: boolean
}

/**
 * The versioned Vite config for Voyant TanStack Start apps: vendor chunking,
 * SSR dep pre-bundling, `@` alias, and dev-tunnel hosts. The app's
 * `vite.config.ts` shrinks to plugin instantiation + this call.
 */
export function voyantStartViteConfig(options: VoyantStartViteConfigOptions): UserConfig {
  const {
    appRootUrl,
    plugins,
    allowedHosts = true,
    extraManualChunks,
    nodeSsr,
    bundleWorkspaceSource = true,
    deferDynamicImportPreloads = false,
  } = options
  const resolvableSsrDependencies = resolvableAppRootDependencies(
    appRootUrl,
    VOYANT_SSR_OPTIMIZE_DEPS,
  )
  const productionRuntimeExternalPlugin = bundleWorkspaceSource
    ? undefined
    : createProductionRuntimeExternalPlugin(appRootUrl)
  return {
    server: {
      allowedHosts,
    },
    build: {
      ...(deferDynamicImportPreloads
        ? {
            modulePreload: {
              resolveDependencies: (
                _url: string,
                dependencies: string[],
                context: { hostType: "html" | "js" },
              ) => (context.hostType === "js" ? [] : dependencies),
            },
          }
        : {}),
      rollupOptions: {
        output: {
          ...voyantChunkOutput(
            Number.parseInt(viteVersion.split(".")[0] ?? "0", 10),
            extraManualChunks,
          ),
        } as never,
      },
    },
    resolve: {
      alias: [{ find: "@", replacement: fileURLToPath(new URL("./src", appRootUrl)) }],
      dedupe: resolvableAppRootDependencies(appRootUrl, VOYANT_DEDUPE_DEPENDENCIES),
      tsconfigPaths: true,
      ...(!bundleWorkspaceSource && {
        // Vite's environment API reads noExternal from resolve. Keep this in
        // addition to ssr.noExternal below for the Vite 6 compatibility range.
        noExternal: [...VOYANT_PRODUCTION_BUNDLED_PACKAGES, ...TANSTACK_START_BUNDLED_PACKAGES],
      }),
    },
    optimizeDeps: {
      exclude: [...VOYANT_CLIENT_OPTIMIZE_DEPS_EXCLUDE],
    },
    ssr: {
      optimizeDeps: {
        include: [
          ...new Set([...resolvableSsrDependencies, ...(options.ssrOptimizeDepsInclude ?? [])]),
        ],
      },
      ...(nodeSsr
        ? {
            target: "node" as const,
            ...(bundleWorkspaceSource
              ? {
                  external: ["pg"],
                  noExternal: [/^@voyant-travel\//, /^@pxmstudio\//],
                  resolve: {
                    conditions: ["development", "module", "node", "import", "default"],
                  },
                }
              : {
                  // The production externalizer marks only first-party package
                  // imports external. Keep ordinary dependencies in Vite's
                  // default SSR pipeline so framework plugins can still bundle
                  // the framework hosts and packages that contain virtual
                  // imports.
                  external: ["pg"],
                  noExternal: [
                    ...VOYANT_PRODUCTION_BUNDLED_PACKAGES,
                    ...TANSTACK_START_BUNDLED_PACKAGES,
                  ],
                }),
          }
        : {}),
    },
    plugins: [
      ...(productionRuntimeExternalPlugin ? [productionRuntimeExternalPlugin] : []),
      ...plugins,
    ],
  }
}

function createProductionRuntimeExternalPlugin(appRootUrl: string): Plugin {
  const productionDependencies = declaredAppRootDependencies(appRootUrl, [
    "dependencies",
    "optionalDependencies",
  ])
  return {
    name: "voyant:externalize-production-runtime",
    enforce: "pre",
    resolveId(source, importer) {
      if (this.environment.config.consumer !== "server") return null
      if (importer && source.startsWith(".")) {
        const target = resolve(dirname(importer.split("?", 1)[0]!), source)
        const normalizedTarget = target.replaceAll("\\", "/")
        if (/\/node_modules\/@(?:voyant-travel|pxmstudio)\/[^/]+(?:\/|$)/.test(normalizedTarget)) {
          // Keep BOM-anchored package files outside the bundle. Rollup rebases
          // this absolute external to the output chunk, and Node then resolves
          // the package's own dependencies from its preserved pnpm location.
          return { id: target, external: true }
        }
      }
      if (!/^@(?:voyant-travel|pxmstudio)\/[^/]+(?:\/.*)?$/.test(source)) return null
      const packageName = packageNameForSubpath(source)
      if (VOYANT_PRODUCTION_BUNDLED_PACKAGES.includes(packageName)) return null
      if (!productionDependencies.has(packageName)) return null
      return { id: source, external: true }
    },
  }
}

function resolvableAppRootDependencies(
  appRootUrl: string,
  candidates: readonly string[],
): string[] {
  const declaredDependencies = declaredAppRootDependencies(appRootUrl, DEPENDENCY_FIELDS)
  const packageJsonPath = fileURLToPath(new URL("./package.json", appRootUrl))
  const resolveFromApp = createRequire(packageJsonPath)
  return candidates.filter((dependency) => {
    if (!declaredDependencies.has(packageNameForSubpath(dependency))) return false
    try {
      resolveFromApp.resolve(dependency)
      return true
    } catch {
      return false
    }
  })
}

function declaredAppRootDependencies(appRootUrl: string, fields: readonly string[]): Set<string> {
  const packageJsonPath = fileURLToPath(new URL("./package.json", appRootUrl))
  let parsedManifest: unknown
  try {
    parsedManifest = JSON.parse(readFileSync(packageJsonPath, "utf8"))
  } catch {
    return new Set()
  }
  if (typeof parsedManifest !== "object" || parsedManifest === null) return new Set()
  const manifest = parsedManifest as Record<string, unknown>

  const declaredDependencies = new Set<string>()
  for (const field of fields) {
    const dependencies = manifest[field]
    if (typeof dependencies !== "object" || dependencies === null) continue
    for (const dependency of Object.keys(dependencies)) declaredDependencies.add(dependency)
  }

  return declaredDependencies
}

function packageNameForSubpath(specifier: string): string {
  const segments = specifier.split("/")
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0]!
}
