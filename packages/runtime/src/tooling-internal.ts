// agent-quality: file-size exception -- owner: runtime; project bootstrap, Vite lifecycle, and generated route handling remain together until the public tooling contract stabilizes.
import { randomUUID } from "node:crypto"
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import { Generator, getConfig } from "@tanstack/router-generator"
import viteReact from "@vitejs/plugin-react"
import type { VoyantGraphPresentationDeclaration } from "@voyant-travel/core/project"
import {
  createAnalyzePlugin,
  VOYANT_ROUTE_FILE_IGNORE_PATTERN,
  type VoyantGeneratedRouteFile,
  voyantGeneratedRoutes,
  voyantStartViteConfig,
} from "@voyant-travel/vite-config"
import { NodeRequest, sendNodeResponse } from "srvx/node"
import { register } from "tsx/esm/api"
import {
  createBuilder as createViteBuilder,
  createServer as createViteServer,
  type InlineConfig,
  type PluginOption,
  type ViteDevServer,
} from "vite"

import type {
  BuildVoyantProjectOptions,
  DevelopVoyantProjectOptions,
  VoyantProjectDevelopmentServer,
} from "./tooling.js"

const DEFAULT_DEVELOPMENT_PORT = 3300
const DEVELOPMENT_READINESS_HEADER = "x-voyant-development-readiness"
const DEVELOPMENT_READINESS_PATH = "/.voyant/development-readiness"
const DEVELOPMENT_READINESS_RETRY_MS = 50
const DEVELOPMENT_READINESS_TIMEOUT_MS = 30_000
const TANSTACK_SERVER_ENTRY = "virtual:tanstack-start-server-entry"
const PRODUCT_BOM_ARTIFACT = ".voyant/product-bom.generated.json"
const PRODUCT_ROUTE_FILES_EXPORT = "standard-route-files"
const FRONTEND_SINGLETON_ROOTS = [
  "react",
  "react-dom",
  "@tanstack/react-query",
  "@tanstack/react-router",
] as const
const DEPLOYABLE_DEPENDENCY_FIELDS = ["dependencies", "optionalDependencies"] as const
let developmentAuthFallbackLeaseCount = 0
let developmentAuthFallbackPreviousValue: string | undefined

interface GeneratedRoutes {
  plugin: PluginOption
  routesDirectory: string
  generatedRouteTree: string
}

interface ProjectViteConfigOptions {
  appRootUrl: string
  developmentReadiness?: DevelopmentReadiness
  generatedRoutes: GeneratedRoutes
  bootstrap: ProjectBootstrap
  /**
   * Inline `@voyant-travel/*` from source. True for the development server,
   * where it is what makes a package edit hot-reload; false for a build, where
   * it would ship workspace code without the dependencies that code needs.
   * See `bundleWorkspaceSource` in `@voyant-travel/vite-config`.
   */
  bundleWorkspaceSource?: boolean
}

interface DevelopmentReadiness {
  promise: Promise<void>
  token: string
}

interface ProjectBootstrap {
  serverEntry: string
  routerEntry?: string
  stylesEntry?: string
}

interface ProjectRouteGenerationOptions {
  projectRoot: string
  routesDirectory: string
  generatedRouteTree: string
}

interface ProjectViteServer {
  config: {
    server: {
      host?: string | boolean
    }
  }
  resolvedUrls: ViteDevServer["resolvedUrls"]
  environments?: {
    client?: {
      depsOptimizer?: {
        scanProcessing?: Promise<void>
        metadata?: {
          discovered?: Readonly<Record<string, { processing?: Promise<void> }>>
        }
      }
    }
  }
  listen(): Promise<unknown>
  close(): Promise<void>
}

export interface VoyantProjectToolingDependencies {
  loadStandardRouteFiles(projectRoot: string): Promise<readonly VoyantGeneratedRouteFile[]>
  prepareProjectBootstrap(projectRoot: string): Promise<ProjectBootstrap>
  materializeRoutes(options: {
    appRootUrl: string
    files: readonly VoyantGeneratedRouteFile[]
  }): GeneratedRoutes
  createViteConfig(options: ProjectViteConfigOptions): InlineConfig
  generateRouteTree(options: ProjectRouteGenerationOptions): Promise<void>
  buildVite(config: InlineConfig): Promise<unknown>
  createViteServer(config: InlineConfig): Promise<ProjectViteServer>
  waitForDevelopmentApplication(options: { url: string; token: string }): Promise<void>
  replaceDirectory(source: string, destination: string): Promise<void>
}

const defaultDependencies: VoyantProjectToolingDependencies = {
  loadStandardRouteFiles,
  prepareProjectBootstrap,
  materializeRoutes: voyantGeneratedRoutes,
  createViteConfig: createProjectViteConfig,
  generateRouteTree,
  buildVite: buildViteApplication,
  createViteServer,
  waitForDevelopmentApplication,
  replaceDirectory,
}

type CreateViteBuilder = (config: InlineConfig) => Promise<{ buildApp(): Promise<void> }>

/** Build every Vite application environment, including TanStack Start SSR. */
export async function buildViteApplication(
  config: InlineConfig,
  createBuilder: CreateViteBuilder = createViteBuilder,
): Promise<void> {
  const builder = await createBuilder(config)
  await builder.buildApp()
}

export async function buildVoyantProjectWithDependencies(
  options: BuildVoyantProjectOptions,
  dependencies: VoyantProjectToolingDependencies = defaultDependencies,
): Promise<void> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd())
  const config = await prepareProjectViteConfig(projectRoot, dependencies)

  // Undefined configFile lets Vite merge an optional project-root vite.config.*.
  await dependencies.buildVite({ ...config, root: projectRoot })
  await Promise.all([
    dependencies.replaceDirectory(
      path.join(projectRoot, ".voyant"),
      path.join(projectRoot, "dist/.voyant"),
    ),
    dependencies.replaceDirectory(
      path.join(projectRoot, ".voyant"),
      path.join(projectRoot, "dist/server/.voyant"),
    ),
  ])
}

export async function developVoyantProjectWithDependencies(
  options: DevelopVoyantProjectOptions,
  dependencies: VoyantProjectToolingDependencies = defaultDependencies,
): Promise<VoyantProjectDevelopmentServer> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd())
  let releaseDevelopmentRequests: () => void = () => undefined
  const developmentReadiness: DevelopmentReadiness = {
    promise: new Promise<void>((resolve) => {
      releaseDevelopmentRequests = resolve
    }),
    token: randomUUID(),
  }
  const config = await prepareProjectViteConfig(projectRoot, dependencies, developmentReadiness)
  const port = options.port ?? DEFAULT_DEVELOPMENT_PORT
  // Keep native config discovery aligned with the production build.
  const server = await dependencies.createViteServer({
    ...config,
    root: projectRoot,
    server: {
      ...config.server,
      ...(options.host === undefined ? {} : { host: options.host }),
      port,
    },
  })
  const restoreDevelopmentEnvironment = enableDevelopmentEnvironment(
    normalizeViteHost(server.config.server.host),
  )

  try {
    await server.listen()
    const developmentUrl = resolveDevelopmentUrl(server, options.host, port)
    const clientOptimizer = server.environments?.client?.depsOptimizer
    await clientOptimizer?.scanProcessing
    await Promise.all(
      Object.values(clientOptimizer?.metadata?.discovered ?? {}).map(
        (dependency) => dependency.processing,
      ),
    )
    await dependencies.waitForDevelopmentApplication({
      url: developmentUrl,
      token: developmentReadiness.token,
    })
    releaseDevelopmentRequests()
  } catch (error) {
    releaseDevelopmentRequests()
    await server.close().catch(() => undefined)
    restoreDevelopmentEnvironment()
    throw error
  }

  let closed = false
  return {
    url: resolveDevelopmentUrl(server, options.host, port),
    close: async () => {
      if (closed) return
      closed = true
      try {
        await server.close()
      } finally {
        restoreDevelopmentEnvironment()
      }
    },
  }
}

async function prepareProjectViteConfig(
  projectRoot: string,
  dependencies: VoyantProjectToolingDependencies,
  developmentReadiness?: DevelopmentReadiness,
): Promise<InlineConfig> {
  const appRootUrl = pathToFileURL(path.join(projectRoot, "generated-config-anchor.ts")).href
  const files = await dependencies.loadStandardRouteFiles(projectRoot)
  const bootstrap = await dependencies.prepareProjectBootstrap(projectRoot)
  const generatedRoutes = dependencies.materializeRoutes({ appRootUrl, files })

  await dependencies.generateRouteTree({
    projectRoot,
    routesDirectory: generatedRoutes.routesDirectory,
    generatedRouteTree: generatedRoutes.generatedRouteTree,
  })

  return dependencies.createViteConfig({
    appRootUrl,
    ...(developmentReadiness ? { developmentReadiness } : {}),
    generatedRoutes,
    bootstrap,
    // `developmentReadiness` is only supplied by the development server, so it
    // is also the signal for whether workspace source may be inlined.
    bundleWorkspaceSource: developmentReadiness !== undefined,
  })
}

export function createProjectViteConfig(options: ProjectViteConfigOptions): InlineConfig {
  const config = voyantStartViteConfig({
    appRootUrl: options.appRootUrl,
    nodeSsr: true,
    bundleWorkspaceSource: options.bundleWorkspaceSource ?? true,
    plugins: [
      createDevelopmentReadinessPlugin(options.developmentReadiness),
      options.generatedRoutes.plugin,
      devtools(),
      tailwindcss(),
      tanstackStart({
        vite: { installDevServerMiddleware: false },
        server: {
          entry: relativeEntry(options.appRootUrl, options.bootstrap.serverEntry),
        },
        router: {
          ...(options.bootstrap.routerEntry
            ? {
                entry: relativeEntry(options.appRootUrl, options.bootstrap.routerEntry),
              }
            : {}),
          routesDirectory: options.generatedRoutes.routesDirectory,
          generatedRouteTree: options.generatedRoutes.generatedRouteTree,
          routeFileIgnorePattern: VOYANT_ROUTE_FILE_IGNORE_PATTERN,
        },
      }),
      createDevelopmentServerPlugin(),
      viteReact(),
      createAnalyzePlugin(options.appRootUrl),
    ],
  })
  config.build = {
    ...config.build,
    // The Node host, admin asset resolver, and deployment artifacts share this layout.
    outDir: "dist",
  }
  if (options.bootstrap.stylesEntry) {
    const alias = config.resolve?.alias
    config.resolve = {
      ...config.resolve,
      alias: [
        { find: /^@\/styles\.css$/, replacement: options.bootstrap.stylesEntry },
        ...(Array.isArray(alias)
          ? alias
          : Object.entries(alias ?? {}).map(([find, replacement]) => ({ find, replacement }))),
      ],
    }
  }
  return config
}

function createDevelopmentServerPlugin(): PluginOption {
  return {
    name: "voyant:development-server",
    configureServer(server) {
      return () => {
        const environment = server.environments.ssr
        if (
          !isFetchableServerEnvironment(environment) &&
          !isRunnableServerEnvironment(environment)
        ) {
          throw new Error("Voyant development requires a runnable or fetchable SSR environment")
        }

        server.middlewares.use(async (request, response) => {
          if (request.originalUrl) request.url = request.originalUrl
          try {
            const webRequest = new NodeRequest({ req: request, res: response })
            const webResponse = isFetchableServerEnvironment(environment)
              ? await environment.dispatchFetch(webRequest)
              : await fetchRunnableDevelopmentResponse(server, environment, webRequest)
            await sendNodeResponse(response, webResponse)
          } catch (error) {
            console.error(error)
            try {
              server.ssrFixStacktrace(error as Error)
            } catch {}
            if (!response.headersSent) {
              await sendNodeResponse(
                response,
                new Response("Internal Server Error", {
                  status: 500,
                  headers: { "content-type": "text/plain; charset=utf-8" },
                }),
              )
            } else {
              response.end()
            }
          }
        })
      }
    },
  }
}

async function fetchRunnableDevelopmentResponse(
  server: ViteDevServer,
  environment: RunnableServerEnvironment,
  request: Request,
): Promise<Response> {
  if (server.config.experimental.bundledDev) {
    const clientEnvironment = server.environments.client as {
      devEngine?: { ensureLatestBuildOutput?: () => Promise<void> }
    }
    await clientEnvironment.devEngine?.ensureLatestBuildOutput?.()
    environment.moduleGraph?.invalidateAll?.()
    environment.runner.clearCache?.()
  }
  const serverEntry = await environment.runner.import(TANSTACK_SERVER_ENTRY)
  const handler = serverEntry.default
  if (!isFetchHandler(handler)) {
    throw new TypeError(`${TANSTACK_SERVER_ENTRY} must export a default fetch handler`)
  }
  return handler.fetch(request)
}

interface RunnableServerEnvironment {
  runner: {
    clearCache?(): void
    import(id: string): Promise<Record<string, unknown>>
  }
  moduleGraph?: { invalidateAll?(): void }
}

function isRunnableServerEnvironment(
  environment: unknown,
): environment is RunnableServerEnvironment {
  if (typeof environment !== "object" || environment === null || !("runner" in environment)) {
    return false
  }
  const runner = environment.runner
  return (
    typeof runner === "object" &&
    runner !== null &&
    "import" in runner &&
    typeof runner.import === "function"
  )
}

function isFetchHandler(value: unknown): value is { fetch(request: Request): Promise<Response> } {
  return (
    typeof value === "object" &&
    value !== null &&
    "fetch" in value &&
    typeof value.fetch === "function"
  )
}

function isFetchableServerEnvironment(
  environment: unknown,
): environment is { dispatchFetch(request: Request): Promise<Response> } {
  return (
    typeof environment === "object" &&
    environment !== null &&
    "dispatchFetch" in environment &&
    typeof environment.dispatchFetch === "function"
  )
}

function createDevelopmentReadinessPlugin(readiness?: DevelopmentReadiness): PluginOption {
  if (!readiness) return false

  return {
    name: "voyant:development-readiness",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (request.headers[DEVELOPMENT_READINESS_HEADER] === readiness.token) {
          next()
          return
        }
        void readiness.promise.then(() => next(), next)
      })
    },
  }
}

export async function waitForDevelopmentApplication(
  options: { url: string; token: string },
  request: typeof fetch = fetch,
): Promise<void> {
  const deadline = Date.now() + DEVELOPMENT_READINESS_TIMEOUT_MS
  const readinessUrl = new URL(DEVELOPMENT_READINESS_PATH, options.url)
  let lastFailure = "no response"

  while (Date.now() < deadline) {
    try {
      const response = await request(readinessUrl, {
        headers: { [DEVELOPMENT_READINESS_HEADER]: options.token },
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      })
      const body = await response.text()
      if (response.status < 500 && !isConnectFallbackNotFound(body)) return
      lastFailure = `HTTP ${response.status}: ${body.slice(0, 200)}`
    } catch (error) {
      lastFailure = errorMessage(error)
    }
    await new Promise((resolve) => setTimeout(resolve, DEVELOPMENT_READINESS_RETRY_MS))
  }

  throw new Error(
    `Voyant development application did not become ready within ${DEVELOPMENT_READINESS_TIMEOUT_MS}ms (${lastFailure})`,
  )
}

function isConnectFallbackNotFound(body: string): boolean {
  return /<pre>Cannot (?:GET|HEAD) \/[^<]*<\/pre>/.test(body)
}

function relativeEntry(appRootUrl: string, entry: string): string {
  return `../${path.relative(path.dirname(fileURLToPath(appRootUrl)), entry).replaceAll("\\", "/")}`
}

export async function prepareProjectBootstrap(projectRoot: string): Promise<ProjectBootstrap> {
  const productBomId = await loadProductBomId(projectRoot)
  const generatedRoot = path.join(projectRoot, ".voyant/app")
  const authoredServerEntry = path.join(projectRoot, "src/server.ts")
  await validateProjectFrontendDependencies(projectRoot)
  const bootstrap: ProjectBootstrap = {
    serverEntry: (await pathExists(authoredServerEntry))
      ? authoredServerEntry
      : path.join(generatedRoot, "server.ts"),
  }
  await writeGeneratedFile(
    path.join(generatedRoot, "project-runtime.ts"),
    `import type { LoadVoyantProjectOptions } from "@voyant-travel/runtime"

type GeneratedProjectRuntime = NonNullable<LoadVoyantProjectOptions["generatedProjectRuntime"]>
interface GeneratedProjectRuntimeModule {
  createGeneratedProjectRuntime(): GeneratedProjectRuntime
}

const generatedRuntime = Object.values(
  import.meta.glob<GeneratedProjectRuntimeModule>(
    "../runtime/project-runtime.generated.ts",
    { eager: true },
  ),
).at(0)
if (!generatedRuntime) {
  throw new Error("Generated Voyant project runtime module is missing.")
}

export const createGeneratedProjectRuntime = () =>
  generatedRuntime.createGeneratedProjectRuntime()
`,
  )
  await writeGeneratedFile(
    path.join(generatedRoot, "project-links.ts"),
    `import type { LoadVoyantProjectOptions } from "@voyant-travel/runtime"

type GeneratedProjectLinks = NonNullable<LoadVoyantProjectOptions["generatedProjectLinks"]>
interface GeneratedProjectLinksModule {
  projectLinks?: GeneratedProjectLinks
}

const generatedLinks = Object.values(
  import.meta.glob<GeneratedProjectLinksModule>(
    "../runtime/project-links.generated.ts",
    { eager: true },
  ),
).at(0)
if (!generatedLinks) {
  throw new Error("Generated Voyant project links module is missing.")
}

export const getGeneratedProjectLinks = () => generatedLinks.projectLinks ?? []
`,
  )
  if (!(await pathExists(authoredServerEntry))) {
    await writeGeneratedFile(
      bootstrap.serverEntry,
      `import type { LoadVoyantProjectOptions } from "@voyant-travel/runtime"
import { createVoyantProjectServerEntry } from "@voyant-travel/runtime"
import { getGeneratedProjectLinks } from "./project-links.js"
import { createGeneratedProjectRuntime } from "./project-runtime.js"

const withGeneratedArtifacts = (options: LoadVoyantProjectOptions = {}): LoadVoyantProjectOptions => ({
  ...options,
  generatedProjectLinks: getGeneratedProjectLinks(),
  generatedProjectRuntime: createGeneratedProjectRuntime(),
})
const server = createVoyantProjectServerEntry(withGeneratedArtifacts())
const start = (options: LoadVoyantProjectOptions & { port?: number } = {}) => {
  const { port, ...projectOptions } = options
  return createVoyantProjectServerEntry(withGeneratedArtifacts(projectOptions)).start({ port })
}
export default { fetch: server.fetch, start }
`,
    )
  }

  if (!(await pathExists(path.join(projectRoot, "src/router.tsx")))) {
    bootstrap.routerEntry = path.join(generatedRoot, "router.tsx")
    await writeGeneratedFile(
      bootstrap.routerEntry,
      `import type { StandardOperatorRouterContext } from ${JSON.stringify(`${productBomId}/standard-frontend`)}
import { operatorFrontend } from "../routes/_lib/operator-frontend.js"
import { Route as workspaceRoute } from "../routes/_workspace/route.js"
import { routeTree } from "../routeTree.gen.js"

export type RouterContext = StandardOperatorRouterContext

export function getRouter() {
  return operatorFrontend.createRouter({ routeTree, workspaceRoute })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
`,
    )
  }

  if (!(await pathExists(path.join(projectRoot, "src/styles.css")))) {
    bootstrap.stylesEntry = path.join(generatedRoot, "styles.css")
    await writeGeneratedFile(
      bootstrap.stylesEntry,
      `@import ${JSON.stringify(`${productBomId}/standard-styles.css`)};\n`,
    )
  }
  return bootstrap
}

async function validateProjectFrontendDependencies(projectRoot: string): Promise<void> {
  const packageJsonPath = path.join(projectRoot, "package.json")
  let manifest: {
    dependencies?: Record<string, unknown>
    optionalDependencies?: Record<string, unknown>
  }
  try {
    manifest = JSON.parse(await readFile(packageJsonPath, "utf8")) as typeof manifest
  } catch (error) {
    throw new Error("Voyant projects must provide a readable package.json.", { cause: error })
  }
  const declared = new Set(
    DEPLOYABLE_DEPENDENCY_FIELDS.flatMap((field) => Object.keys(manifest[field] ?? {})),
  )
  const declaredSingletonRoots = FRONTEND_SINGLETON_ROOTS.filter((dependency) =>
    declared.has(dependency),
  )
  const resolveFromProject = createRequire(packageJsonPath)
  if (declaredSingletonRoots.length !== FRONTEND_SINGLETON_ROOTS.length) {
    const missingSingletonRoots = FRONTEND_SINGLETON_ROOTS.filter(
      (dependency) => !declared.has(dependency),
    )
    throw new Error(
      `Voyant frontend singleton dependencies must be owned by the application. This project is missing ${missingSingletonRoots.join(", ")}. Add all four singleton dependencies (${FRONTEND_SINGLETON_ROOTS.join(", ")}) to dependencies or optionalDependencies.`,
    )
  }
  try {
    for (const dependency of FRONTEND_SINGLETON_ROOTS) {
      const directPackageJson = path.join(
        projectRoot,
        "node_modules",
        ...dependency.split("/"),
        "package.json",
      )
      if (!(await pathExists(directPackageJson))) {
        throw new Error(`${dependency} is not installed directly in the project`)
      }
      resolveFromProject.resolve(dependency)
    }
  } catch (error) {
    throw new Error(
      `Voyant frontend singleton dependencies are app-owned but not all four roots are installed (${FRONTEND_SINGLETON_ROOTS.join(", ")}).`,
      { cause: error },
    )
  }
}

async function generateRouteTree(options: ProjectRouteGenerationOptions): Promise<void> {
  const config = getConfig(
    {
      target: "react",
      routesDirectory: options.routesDirectory,
      generatedRouteTree: options.generatedRouteTree,
      routeFileIgnorePattern: VOYANT_ROUTE_FILE_IGNORE_PATTERN,
      disableLogging: true,
    },
    options.projectRoot,
  )
  await new Generator({ config, root: options.projectRoot }).run()
}

export async function loadStandardRouteFiles(
  projectRoot: string,
): Promise<readonly VoyantGeneratedRouteFile[]> {
  const { productBomId, presentations } = await loadProductBomSelection(projectRoot)
  const routeFilesExport = `${productBomId}/${PRODUCT_ROUTE_FILES_EXPORT}`
  const resolveFromProject = createRequire(path.join(projectRoot, "package.json"))
  let resolved: string
  try {
    resolved = resolveFromProject.resolve(routeFilesExport)
  } catch (error) {
    throw new Error(
      `Voyant product BOM ${productBomId} does not provide ${routeFilesExport}: ${errorMessage(error)}`,
      { cause: error },
    )
  }

  const module = (await importProjectModule(resolved)) as {
    createStandardOperatorRouteFiles?: unknown
  }

  if (typeof module.createStandardOperatorRouteFiles !== "function") {
    throw new TypeError(
      `${routeFilesExport} must export createStandardOperatorRouteFiles as a function`,
    )
  }
  const files = module.createStandardOperatorRouteFiles({ presentations })
  if (!isGeneratedRouteFileArray(files)) {
    throw new TypeError(`${routeFilesExport} createStandardOperatorRouteFiles must return an array`)
  }
  return files
}

export async function loadProductBomId(projectRoot: string): Promise<string> {
  return (await loadProductBomSelection(projectRoot)).productBomId
}

async function loadProductBomSelection(projectRoot: string): Promise<{
  productBomId: string
  presentations: readonly VoyantGraphPresentationDeclaration[]
}> {
  const artifactPath = path.join(projectRoot, PRODUCT_BOM_ARTIFACT)
  let source: string
  try {
    source = await readFile(artifactPath, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Voyant product BOM artifact is missing at ${artifactPath}. Run voyant build first.`,
        {
          cause: error,
        },
      )
    }
    throw error
  }

  let artifact: unknown
  try {
    artifact = JSON.parse(source)
  } catch (error) {
    throw new Error(`Voyant product BOM artifact at ${artifactPath} is not valid JSON.`, {
      cause: error,
    })
  }

  const productBomId = (artifact as { productBom?: { id?: unknown } })?.productBom?.id
  if (typeof productBomId !== "string" || !isPackageName(productBomId)) {
    throw new TypeError(
      `Voyant product BOM artifact at ${artifactPath} must declare productBom.id as a canonical package name.`,
    )
  }
  const presentations = (artifact as { graph?: { presentations?: unknown } }).graph?.presentations
  if (
    !Array.isArray(presentations) ||
    presentations.some(
      (entry) => typeof entry !== "object" || entry === null || typeof entry.id !== "string",
    )
  ) {
    throw new TypeError(
      `Voyant product BOM artifact at ${artifactPath} must declare graph.presentations as an array of presentation declarations.`,
    )
  }
  return {
    productBomId,
    presentations: presentations as readonly VoyantGraphPresentationDeclaration[],
  }
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

async function writeGeneratedFile(file: string, source: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, source)
}

async function importProjectModule(resolved: string): Promise<unknown> {
  const moduleUrl = pathToFileURL(resolved).href
  if (/\.[cm]?tsx?$/.test(resolved)) {
    const unregister = register()
    try {
      return await import(moduleUrl)
    } finally {
      await unregister()
    }
  }
  return import(moduleUrl)
}

function isPackageName(value: string): boolean {
  return (
    /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(value) ||
    /^[a-z0-9][a-z0-9._-]*$/.test(value)
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isGeneratedRouteFileArray(value: unknown): value is readonly VoyantGeneratedRouteFile[] {
  return (
    Array.isArray(value) &&
    value.every(
      (file) =>
        typeof file === "object" &&
        file !== null &&
        typeof (file as { path?: unknown }).path === "string" &&
        typeof (file as { source?: unknown }).source === "string",
    )
  )
}

async function replaceDirectory(source: string, destination: string): Promise<void> {
  await rm(destination, { recursive: true, force: true })
  await mkdir(path.dirname(destination), { recursive: true })
  await cp(source, destination, { recursive: true })
}

function resolveDevelopmentUrl(
  server: Pick<ProjectViteServer, "resolvedUrls">,
  host: string | undefined,
  port: number,
): string {
  const resolved = server.resolvedUrls?.local[0] ?? server.resolvedUrls?.network[0]
  if (resolved) {
    if (host === undefined) {
      const url = new URL(resolved)
      if (url.hostname === "127.0.0.1" || url.hostname === "[::1]") {
        url.hostname = "localhost"
      }
      return url.toString()
    }
    return resolved
  }

  const fallbackHost = host && host !== "0.0.0.0" && host !== "::" ? host : "localhost"
  return `http://${formatUrlHost(fallbackHost)}:${port}`
}

function enableDevelopmentEnvironment(host: string | undefined): () => void {
  if (!isLoopbackDevelopmentHost(host)) {
    return () => undefined
  }

  if (developmentAuthFallbackLeaseCount === 0) {
    if (process.env.VOYANT_AUTH_LOG_SECRET_FALLBACKS !== undefined) {
      return () => undefined
    }
    developmentAuthFallbackPreviousValue = process.env.VOYANT_AUTH_LOG_SECRET_FALLBACKS
    process.env.VOYANT_AUTH_LOG_SECRET_FALLBACKS = "1"
  }
  developmentAuthFallbackLeaseCount += 1

  let restored = false

  return () => {
    if (restored) return
    restored = true
    developmentAuthFallbackLeaseCount -= 1
    if (developmentAuthFallbackLeaseCount > 0) return

    if (developmentAuthFallbackPreviousValue === undefined) {
      delete process.env.VOYANT_AUTH_LOG_SECRET_FALLBACKS
    } else {
      process.env.VOYANT_AUTH_LOG_SECRET_FALLBACKS = developmentAuthFallbackPreviousValue
    }
    developmentAuthFallbackPreviousValue = undefined
  }
}

function isLoopbackDevelopmentHost(host: string | undefined): boolean {
  if (host === undefined) return true
  const normalizedHost = host.replace(/^\[|\]$/g, "").toLowerCase()
  return (
    normalizedHost === "localhost" ||
    normalizedHost === "::1" ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost.startsWith("127.")
  )
}

function normalizeViteHost(host: string | boolean | undefined): string | undefined {
  if (host === true) return "0.0.0.0"
  if (host === false) return undefined
  return host
}

function formatUrlHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host
}
