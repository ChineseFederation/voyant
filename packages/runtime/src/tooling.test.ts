// agent-quality: file-size exception -- owner: runtime; this suite keeps project bootstrap and lifecycle fixtures co-located so packaged-consumer behavior is reviewed as one contract.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  buildViteApplication,
  buildVoyantProjectWithDependencies,
  createProjectViteConfig,
  developVoyantProjectWithDependencies,
  loadStandardRouteFiles,
  prepareProjectBootstrap,
  type VoyantProjectToolingDependencies,
  waitForDevelopmentApplication,
} from "./tooling-internal.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  )
})

describe("Voyant project tooling", () => {
  it("builds the complete Vite application instead of only the client environment", async () => {
    const buildApp = vi.fn(async () => {})
    const createBuilder = vi.fn(async () => ({ buildApp }))
    const config = { root: "/workspace/operator", configFile: false as const }

    await buildViteApplication(config, createBuilder)

    expect(createBuilder).toHaveBeenCalledWith(config)
    expect(buildApp).toHaveBeenCalledOnce()
  })

  it("does not alias framework dependencies to product package entry files", () => {
    const config = createProjectViteConfig({
      appRootUrl: pathToFileURL("/workspace/operator/generated-config-anchor.ts").href,
      generatedRoutes: {
        plugin: { name: "generated-routes" },
        routesDirectory: "/workspace/operator/.voyant/routes",
        generatedRouteTree: "/workspace/operator/.voyant/routeTree.gen.ts",
      },
      bootstrap: {
        serverEntry: "/workspace/operator/src/server.ts",
      },
    })
    const aliases = config.resolve?.alias
    expect(JSON.stringify(aliases)).not.toContain("/product/")
  })

  it("mounts HTTP handling without relying on Vite class identity", async () => {
    const config = createProjectViteConfig({
      appRootUrl: pathToFileURL("/workspace/operator/generated-config-anchor.ts").href,
      generatedRoutes: {
        plugin: { name: "generated-routes" },
        routesDirectory: "/workspace/operator/.voyant/routes",
        generatedRouteTree: "/workspace/operator/.voyant/routeTree.gen.ts",
      },
      bootstrap: { serverEntry: "/workspace/operator/src/server.ts" },
    })
    const plugin = (config.plugins as Array<{ name?: string; configureServer?: unknown }>).find(
      (candidate) => candidate.name === "voyant:development-server",
    )
    const use = vi.fn()
    const serverFetch = vi.fn(async (request: Request) =>
      Response.json({ path: new URL(request.url).pathname }),
    )
    const importServerEntry = vi.fn(async () => ({ default: { fetch: serverFetch } }))
    const configureServer = plugin?.configureServer as (server: {
      config: { experimental: { bundledDev: boolean } }
      environments: {
        client: Record<string, never>
        ssr: { runner: { import(id: string): Promise<Record<string, unknown>> } }
      }
      middlewares: { use: typeof use }
    }) => () => void
    const install = configureServer({
      config: { experimental: { bundledDev: false } },
      environments: {
        client: {},
        ssr: { runner: { import: importServerEntry } },
      },
      middlewares: { use },
    })

    expect(use).not.toHaveBeenCalled()
    install()
    expect(use).toHaveBeenCalledOnce()

    const middleware = use.mock.calls[0]?.[0]
    const httpServer = createServer((request, response) => middleware(request, response))
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve))
    try {
      const address = httpServer.address()
      if (!address || typeof address === "string") throw new Error("HTTP test server has no port")
      const response = await fetch(`http://127.0.0.1:${address.port}/runner-proof`)

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ path: "/runner-proof" })
      expect(importServerEntry).toHaveBeenCalledWith("virtual:tanstack-start-server-entry")
      expect(serverFetch).toHaveBeenCalledOnce()
    } finally {
      await new Promise<void>((resolve, reject) =>
        httpServer.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })

  it("keeps the Node distribution under the lifecycle-owned dist directory", () => {
    const config = createProjectViteConfig({
      appRootUrl: pathToFileURL("/workspace/operator/generated-config-anchor.ts").href,
      generatedRoutes: {
        plugin: { name: "generated-routes" },
        routesDirectory: "/workspace/operator/.voyant/routes",
        generatedRouteTree: "/workspace/operator/.voyant/routeTree.gen.ts",
      },
      bootstrap: { serverEntry: "/workspace/operator/src/server.ts" },
    })

    expect(config.build?.outDir).toBe("dist")
  })

  it("holds development HTTP requests until project tooling is ready", async () => {
    let release: () => void = () => undefined
    const readiness = new Promise<void>((resolve) => {
      release = resolve
    })
    const config = createProjectViteConfig({
      appRootUrl: pathToFileURL("/workspace/operator/generated-config-anchor.ts").href,
      developmentReadiness: { promise: readiness, token: "readiness-token" },
      generatedRoutes: {
        plugin: { name: "generated-routes" },
        routesDirectory: "/workspace/operator/.voyant/routes",
        generatedRouteTree: "/workspace/operator/.voyant/routeTree.gen.ts",
      },
      bootstrap: { serverEntry: "/workspace/operator/src/server.ts" },
    })
    const plugin = (config.plugins as Array<{ name?: string; configureServer?: unknown }>).find(
      (candidate) => candidate.name === "voyant:development-readiness",
    )
    const use = vi.fn()
    const configureServer = plugin?.configureServer as (server: {
      middlewares: { use: typeof use }
    }) => void
    configureServer({ middlewares: { use } })
    const middleware = use.mock.calls[0]?.[0] as (
      request: unknown,
      response: unknown,
      next: (error?: unknown) => void,
    ) => void
    const next = vi.fn()

    middleware({ headers: {} }, {}, next)
    await Promise.resolve()
    expect(next).not.toHaveBeenCalled()

    release()
    await readiness
    await Promise.resolve()
    expect(next).toHaveBeenCalledOnce()
  })

  it("lets only the internal application probe bypass the development gate", async () => {
    const readiness = new Promise<void>(() => undefined)
    const config = createProjectViteConfig({
      appRootUrl: pathToFileURL("/workspace/operator/generated-config-anchor.ts").href,
      developmentReadiness: { promise: readiness, token: "readiness-token" },
      generatedRoutes: {
        plugin: { name: "generated-routes" },
        routesDirectory: "/workspace/operator/.voyant/routes",
        generatedRouteTree: "/workspace/operator/.voyant/routeTree.gen.ts",
      },
      bootstrap: { serverEntry: "/workspace/operator/src/server.ts" },
    })
    const plugin = (config.plugins as Array<{ name?: string; configureServer?: unknown }>).find(
      (candidate) => candidate.name === "voyant:development-readiness",
    )
    const use = vi.fn()
    const configureServer = plugin?.configureServer as (server: {
      middlewares: { use: typeof use }
    }) => void
    configureServer({ middlewares: { use } })
    const middleware = use.mock.calls[0]?.[0] as (
      request: { headers: Record<string, string> },
      response: unknown,
      next: (error?: unknown) => void,
    ) => void
    const next = vi.fn()

    middleware({ headers: { "x-voyant-development-readiness": "readiness-token" } }, {}, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it("waits past Connect's fallback 404 until the application handles requests", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          "<!DOCTYPE html><html><body><pre>Cannot GET /.voyant/development-readiness</pre></body></html>",
          { status: 404 },
        ),
      )
      .mockResolvedValueOnce(new Response("application not found", { status: 404 }))

    await waitForDevelopmentApplication(
      { url: "http://localhost:3300/", token: "readiness-token" },
      request,
    )

    expect(request).toHaveBeenCalledTimes(2)
    expect(request).toHaveBeenLastCalledWith(
      new URL("http://localhost:3300/.voyant/development-readiness"),
      expect.objectContaining({
        headers: { "x-voyant-development-readiness": "readiness-token" },
      }),
    )
  })

  it("generates, builds, and copies both deployment artifact layouts", async () => {
    const projectRoot = "/workspace/operator"
    const calls: string[] = []
    const dependencies = createDependencies(calls)

    await buildVoyantProjectWithDependencies({ projectRoot }, dependencies)

    const appRootUrl = pathToFileURL(path.join(projectRoot, "generated-config-anchor.ts")).href
    expect(dependencies.loadStandardRouteFiles).toHaveBeenCalledWith(projectRoot)
    expect(dependencies.materializeRoutes).toHaveBeenCalledWith({
      appRootUrl,
      files: [{ path: "__root.tsx", source: "export const Route = {}" }],
    })
    expect(dependencies.prepareProjectBootstrap).toHaveBeenCalledWith(projectRoot)
    expect(dependencies.generateRouteTree).toHaveBeenCalledWith({
      projectRoot,
      routesDirectory: "/workspace/operator/.voyant/routes",
      generatedRouteTree: "/workspace/operator/.voyant/routeTree.gen.ts",
    })
    expect(dependencies.createViteConfig).toHaveBeenCalledWith({
      appRootUrl,
      generatedRoutes: {
        plugin: { name: "generated-routes" },
        routesDirectory: "/workspace/operator/.voyant/routes",
        generatedRouteTree: "/workspace/operator/.voyant/routeTree.gen.ts",
      },
      bootstrap: { serverEntry: "/workspace/operator/src/server.ts" },
    })
    expect(dependencies.buildVite).toHaveBeenCalledWith({
      marker: "voyant-vite-config",
      root: projectRoot,
      server: { allowedHosts: true },
    })
    expect(vi.mocked(dependencies.buildVite).mock.calls[0]?.[0]).not.toHaveProperty("configFile")
    expect(dependencies.replaceDirectory).toHaveBeenCalledTimes(2)
    expect(dependencies.replaceDirectory).toHaveBeenCalledWith(
      "/workspace/operator/.voyant",
      "/workspace/operator/dist/.voyant",
    )
    expect(dependencies.replaceDirectory).toHaveBeenCalledWith(
      "/workspace/operator/.voyant",
      "/workspace/operator/dist/server/.voyant",
    )
    expect(calls.indexOf("generate-route-tree")).toBeLessThan(calls.indexOf("vite-build"))
    expect(calls.indexOf("vite-build")).toBeLessThan(calls.indexOf("replace-directory"))
  })

  it("starts Vite SSR on port 3300 and closes the server once", async () => {
    const calls: string[] = []
    const dependencies = createDependencies(calls)

    const development = await developVoyantProjectWithDependencies(
      { projectRoot: "/workspace/operator" },
      dependencies,
    )

    expect(dependencies.createViteServer).toHaveBeenCalledWith({
      marker: "voyant-vite-config",
      root: "/workspace/operator",
      server: { allowedHosts: true, port: 3300 },
    })
    expect(vi.mocked(dependencies.createViteServer).mock.calls[0]?.[0]).not.toHaveProperty(
      "configFile",
    )
    expect(
      vi.mocked(dependencies.createViteConfig).mock.calls[0]?.[0].developmentReadiness?.promise,
    ).toBeInstanceOf(Promise)
    expect(development.url).toBe("http://localhost:3300/")
    expect(process.env.VOYANT_AUTH_LOG_SECRET_FALLBACKS).toBe("1")
    expect(calls).toContain("vite-listen")
    expect(calls).toContain("vite-scan")
    expect(calls).toContain("vite-optimize")
    expect(calls).toContain("application-ready")

    await development.close()
    await development.close()
    expect(calls.filter((call) => call === "vite-close")).toHaveLength(1)
    expect(process.env.VOYANT_AUTH_LOG_SECRET_FALLBACKS).toBeUndefined()
  })

  it("keeps the auth fallback active until every loopback development server closes", async () => {
    const first = await developVoyantProjectWithDependencies(
      { projectRoot: "/workspace/first" },
      createDependencies([]),
    )
    const second = await developVoyantProjectWithDependencies(
      { projectRoot: "/workspace/second" },
      createDependencies([]),
    )

    expect(process.env.VOYANT_AUTH_LOG_SECRET_FALLBACKS).toBe("1")
    await first.close()
    expect(process.env.VOYANT_AUTH_LOG_SECRET_FALLBACKS).toBe("1")
    await second.close()
    expect(process.env.VOYANT_AUTH_LOG_SECRET_FALLBACKS).toBeUndefined()
  })

  it("does not enable auth-secret logging for a network-exposed development server", async () => {
    const development = await developVoyantProjectWithDependencies(
      { projectRoot: "/workspace/operator", host: "0.0.0.0" },
      createDependencies([]),
    )

    expect(process.env.VOYANT_AUTH_LOG_SECRET_FALLBACKS).toBeUndefined()
    await development.close()
  })

  it.each([
    "0.0.0.0",
    true,
  ] as const)("does not enable auth-secret logging when project Vite config resolves host to %s", async (host) => {
    const dependencies = createDependencies([])
    vi.mocked(dependencies.createViteServer).mockResolvedValue({
      config: { server: { host } },
      resolvedUrls: null,
      listen: vi.fn(async () => {
        expect(process.env.VOYANT_AUTH_LOG_SECRET_FALLBACKS).toBeUndefined()
      }),
      close: vi.fn(async () => {}),
    })

    const development = await developVoyantProjectWithDependencies(
      { projectRoot: "/workspace/operator" },
      dependencies,
    )

    expect(process.env.VOYANT_AUTH_LOG_SECRET_FALLBACKS).toBeUndefined()
    await development.close()
  })

  it("enables auth-secret logging before listen for a project-configured loopback host", async () => {
    const dependencies = createDependencies([])
    vi.mocked(dependencies.createViteServer).mockResolvedValue({
      config: { server: { host: "127.0.0.1" } },
      resolvedUrls: null,
      listen: vi.fn(async () => {
        expect(process.env.VOYANT_AUTH_LOG_SECRET_FALLBACKS).toBe("1")
      }),
      close: vi.fn(async () => {}),
    })

    const development = await developVoyantProjectWithDependencies(
      { projectRoot: "/workspace/operator" },
      dependencies,
    )

    expect(process.env.VOYANT_AUTH_LOG_SECRET_FALLBACKS).toBe("1")
    await development.close()
    expect(process.env.VOYANT_AUTH_LOG_SECRET_FALLBACKS).toBeUndefined()
  })

  it("canonicalizes Vite's default loopback URL to localhost", async () => {
    const dependencies = createDependencies([])
    vi.mocked(dependencies.createViteServer).mockResolvedValue({
      config: { server: { host: "localhost" } },
      resolvedUrls: { local: ["http://127.0.0.1:3301/"], network: [] },
      listen: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    })

    const development = await developVoyantProjectWithDependencies(
      { projectRoot: "/workspace/operator", port: 3301 },
      dependencies,
    )

    expect(development.url).toBe("http://localhost:3301/")
    await development.close()
  })

  it("passes explicit host and port to Vite and provides a fallback URL", async () => {
    const dependencies = createDependencies([])
    vi.mocked(dependencies.createViteServer).mockResolvedValue({
      config: { server: { host: "127.0.0.1" } },
      resolvedUrls: null,
      listen: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    })

    const development = await developVoyantProjectWithDependencies(
      { projectRoot: "/workspace/operator", host: "127.0.0.1", port: 4400 },
      dependencies,
    )

    expect(dependencies.createViteServer).toHaveBeenCalledWith(
      expect.objectContaining({
        server: { allowedHosts: true, host: "127.0.0.1", port: 4400 },
      }),
    )
    expect(development.url).toBe("http://127.0.0.1:4400")
    await development.close()
  })

  it("closes Vite when the server cannot start listening", async () => {
    const dependencies = createDependencies([])
    const close = vi.fn(async () => {})
    vi.mocked(dependencies.createViteServer).mockResolvedValue({
      config: { server: { host: "localhost" } },
      resolvedUrls: null,
      listen: vi.fn(async () => {
        throw new Error("port unavailable")
      }),
      close,
    })

    await expect(
      developVoyantProjectWithDependencies({ projectRoot: "/workspace/operator" }, dependencies),
    ).rejects.toThrow("port unavailable")
    expect(close).toHaveBeenCalledOnce()
    expect(process.env.VOYANT_AUTH_LOG_SECRET_FALLBACKS).toBeUndefined()
  })

  it("loads selected presentation routes from the product BOM package", async () => {
    const projectRoot = await createTemporaryDirectory()
    await writeProductBom(projectRoot, "@voyant-travel/operator-standard", [
      "@voyant-travel/storefront#presentation.customer",
    ])
    const packageRoot = path.join(projectRoot, "node_modules/@voyant-travel/operator-standard")
    await mkdir(packageRoot, { recursive: true })
    await writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify({
        name: "@voyant-travel/operator-standard",
        type: "module",
        exports: { "./standard-route-files": "./standard-route-files.ts" },
      }),
    )
    await writeFile(
      path.join(packageRoot, "standard-route-files.ts"),
      `interface RouteFile { readonly path: string; readonly source: string }
export function createStandardOperatorRouteFiles(options: { presentationIds: readonly string[] }): readonly RouteFile[] {
  return [{ path: "project.tsx", source: options.presentationIds.join(",") }]
}
`,
    )

    await expect(loadStandardRouteFiles(projectRoot)).resolves.toEqual([
      {
        path: "project.tsx",
        source: "@voyant-travel/storefront#presentation.customer",
      },
    ])
  })

  it("materializes hidden router and style fallbacks for a minimal project", async () => {
    const projectRoot = await createTemporaryDirectory()
    await writeProductBom(projectRoot, "@acme/operator")
    await writeFrontendDependencies(projectRoot)

    const bootstrap = await prepareProjectBootstrap(projectRoot)

    expect(bootstrap).toEqual({
      serverEntry: path.join(projectRoot, ".voyant/app/server.ts"),
      routerEntry: path.join(projectRoot, ".voyant/app/router.tsx"),
      stylesEntry: path.join(projectRoot, ".voyant/app/styles.css"),
    })
    const serverEntry = await readText(bootstrap.serverEntry)
    expect(serverEntry).toContain(
      'import { createGeneratedProjectRuntime } from "./project-runtime.js"',
    )
    expect(serverEntry).toContain("generatedProjectRuntime: createGeneratedProjectRuntime()")
    expect(serverEntry).toContain(
      "createVoyantProjectServerEntry(withGeneratedRuntime(projectOptions)).start",
    )
    const projectRuntimeEntry = await readText(
      path.join(projectRoot, ".voyant/app/project-runtime.ts"),
    )
    expect(projectRuntimeEntry).toContain(
      'import.meta.glob<GeneratedProjectRuntimeModule>(\n    "../runtime/project-runtime.generated.ts",\n    { eager: true },',
    )
    await expect(readText(bootstrap.routerEntry!)).resolves.toContain(
      'from "@acme/operator/standard-frontend"',
    )
    await expect(readText(bootstrap.routerEntry!)).resolves.toContain(
      'from "../routes/_lib/operator-frontend.js"',
    )
    await expect(readText(bootstrap.stylesEntry!)).resolves.toBe(
      '@import "@acme/operator/standard-styles.css";\n',
    )
  })

  it("rejects projects that do not own the frontend singletons", async () => {
    const projectRoot = await createTemporaryDirectory()
    await writeProductBom(projectRoot, "@acme/operator")
    await writeFile(
      path.join(projectRoot, "package.json"),
      JSON.stringify({ dependencies: { "@acme/operator": "1.0.0" } }),
    )
    await expect(prepareProjectBootstrap(projectRoot)).rejects.toThrow(
      "frontend singleton dependencies must be owned by the application",
    )
  })

  it("leaves every frontend singleton app-owned when all four roots are declared", async () => {
    const projectRoot = await createTemporaryDirectory()
    await writeProductBom(projectRoot, "@acme/operator")
    await writeFile(
      path.join(projectRoot, "package.json"),
      JSON.stringify({
        dependencies: {
          react: "1.0.0",
          "react-dom": "1.0.0",
          "@tanstack/react-query": "1.0.0",
          "@tanstack/react-router": "1.0.0",
        },
      }),
    )
    await Promise.all(
      ["react", "react-dom", "@tanstack/react-query", "@tanstack/react-router"].map((dependency) =>
        writeResolvablePackage(projectRoot, dependency),
      ),
    )

    const bootstrap = await prepareProjectBootstrap(projectRoot)

    expect(bootstrap.serverEntry).toBe(path.join(projectRoot, ".voyant/app/server.ts"))
  })

  it("rejects app-owned frontend singletons that are declared but not installed", async () => {
    const projectRoot = await createTemporaryDirectory()
    await writeProductBom(projectRoot, "@acme/operator")
    await writeFile(
      path.join(projectRoot, "package.json"),
      JSON.stringify({
        optionalDependencies: {
          react: "1.0.0",
          "react-dom": "1.0.0",
          "@tanstack/react-query": "1.0.0",
          "@tanstack/react-router": "1.0.0",
        },
      }),
    )

    await expect(prepareProjectBootstrap(projectRoot)).rejects.toThrow(
      "frontend singleton dependencies are app-owned but not all four roots are installed",
    )
  })

  it("rejects partial frontend singleton ownership before Vite can split React", async () => {
    const projectRoot = await createTemporaryDirectory()
    await writeProductBom(projectRoot, "@acme/operator")
    await writeFile(
      path.join(projectRoot, "package.json"),
      JSON.stringify({
        dependencies: {
          react: "1.0.0",
          "@tanstack/react-query": "1.0.0",
        },
      }),
    )

    await expect(prepareProjectBootstrap(projectRoot)).rejects.toThrow(
      "Add all four singleton dependencies (react, react-dom, @tanstack/react-query, @tanstack/react-router) to dependencies or optionalDependencies.",
    )
  })

  it("rejects development-only frontend packages as production ownership", async () => {
    const projectRoot = await createTemporaryDirectory()
    await writeProductBom(projectRoot, "@acme/operator")
    await writeFile(
      path.join(projectRoot, "package.json"),
      JSON.stringify({
        devDependencies: {
          react: "1.0.0",
          "react-dom": "1.0.0",
          "@tanstack/react-query": "1.0.0",
          "@tanstack/react-router": "1.0.0",
        },
      }),
    )
    await expect(prepareProjectBootstrap(projectRoot)).rejects.toThrow(
      "frontend singleton dependencies must be owned by the application",
    )
  })

  it("preserves project-authored server, router, and style overrides", async () => {
    const projectRoot = await createTemporaryDirectory()
    await writeProductBom(projectRoot, "@acme/operator")
    await mkdir(path.join(projectRoot, "src"), { recursive: true })
    await writeFile(path.join(projectRoot, "src/server.ts"), "export default { fetch() {} }\n")
    await writeFile(path.join(projectRoot, "src/router.tsx"), "export const projectRouter = true\n")
    await writeFile(path.join(projectRoot, "src/styles.css"), "/* project */\n")
    await writeFrontendDependencies(projectRoot)

    await expect(prepareProjectBootstrap(projectRoot)).resolves.toEqual({
      serverEntry: path.join(projectRoot, "src/server.ts"),
    })
  })

  it("fails when the generated product BOM artifact is missing", async () => {
    const projectRoot = await createTemporaryDirectory()

    await expect(loadStandardRouteFiles(projectRoot)).rejects.toThrow(
      `Voyant product BOM artifact is missing at ${path.join(
        projectRoot,
        ".voyant/product-bom.generated.json",
      )}`,
    )
  })

  it("fails when productBom.id is not a canonical package name", async () => {
    const projectRoot = await createTemporaryDirectory()
    await writeProductBom(projectRoot, "../operator-standard")

    await expect(loadStandardRouteFiles(projectRoot)).rejects.toThrow(
      "must declare productBom.id as a canonical package name",
    )
  })

  it("fails when the selected product package has no route tooling export", async () => {
    const projectRoot = await createTemporaryDirectory()
    await writeProductBom(projectRoot, "@acme/operator")
    const packageRoot = path.join(projectRoot, "node_modules/@acme/operator")
    await mkdir(packageRoot, { recursive: true })
    await writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify({
        name: "@acme/operator",
        type: "module",
        exports: { ".": "./index.js" },
      }),
    )
    await writeFile(path.join(packageRoot, "index.js"), "export default {}\n")

    await expect(loadStandardRouteFiles(projectRoot)).rejects.toThrow(
      "Voyant product BOM @acme/operator does not provide @acme/operator/standard-route-files",
    )
  })
})

function createDependencies(calls: string[]): VoyantProjectToolingDependencies {
  return {
    loadStandardRouteFiles: vi.fn(async () => [
      { path: "__root.tsx", source: "export const Route = {}" },
    ]),
    prepareProjectBootstrap: vi.fn(async () => ({
      serverEntry: "/workspace/operator/src/server.ts",
    })),
    materializeRoutes: vi.fn(() => ({
      plugin: { name: "generated-routes" },
      routesDirectory: "/workspace/operator/.voyant/routes",
      generatedRouteTree: "/workspace/operator/.voyant/routeTree.gen.ts",
    })),
    generateRouteTree: vi.fn(async () => {
      calls.push("generate-route-tree")
    }),
    createViteConfig: vi.fn(() => ({
      marker: "voyant-vite-config",
      server: { allowedHosts: true as const },
    })),
    buildVite: vi.fn(async () => {
      calls.push("vite-build")
    }),
    createViteServer: vi.fn(async (config) => ({
      config: {
        server: {
          host: config.server?.host ?? "localhost",
        },
      },
      resolvedUrls: {
        local: ["http://localhost:3300/"],
        network: [],
      },
      environments: {
        client: {
          depsOptimizer: {
            scanProcessing: Promise.resolve().then(() => {
              calls.push("vite-scan")
            }),
            metadata: {
              discovered: {
                react: {
                  processing: Promise.resolve().then(() => {
                    calls.push("vite-optimize")
                  }),
                },
              },
            },
          },
        },
      },
      listen: vi.fn(async () => {
        calls.push("vite-listen")
      }),
      close: vi.fn(async () => {
        calls.push("vite-close")
      }),
    })),
    waitForDevelopmentApplication: vi.fn(async () => {
      calls.push("application-ready")
    }),
    replaceDirectory: vi.fn(async () => {
      calls.push("replace-directory")
    }),
  }
}

async function readText(file: string): Promise<string> {
  return readFile(file, "utf8")
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "voyant-runtime-tooling-"))
  temporaryDirectories.push(directory)
  return directory
}

async function writeProductBom(
  projectRoot: string,
  id: string,
  presentationIds: readonly string[] = [],
): Promise<void> {
  const artifactDirectory = path.join(projectRoot, ".voyant")
  await mkdir(artifactDirectory, { recursive: true })
  await writeFile(
    path.join(artifactDirectory, "product-bom.generated.json"),
    JSON.stringify({
      schemaVersion: "voyant.product-bom-expansion.v1",
      productBom: {
        schemaVersion: "voyant.product-bom-reference.v1",
        id,
        version: "1",
      },
      graph: { presentations: presentationIds },
    }),
  )
}

async function writeFrontendDependencies(projectRoot: string): Promise<void> {
  const dependencies = {
    react: "1.0.0",
    "react-dom": "1.0.0",
    "@tanstack/react-query": "1.0.0",
    "@tanstack/react-router": "1.0.0",
  }
  await writeFile(path.join(projectRoot, "package.json"), JSON.stringify({ dependencies }))
  await Promise.all(
    Object.keys(dependencies).map((dependency) => writeResolvablePackage(projectRoot, dependency)),
  )
}

async function writeResolvablePackage(projectRoot: string, id: string): Promise<void> {
  const packageRoot = path.join(projectRoot, "node_modules", ...id.split("/"))
  await mkdir(packageRoot, { recursive: true })
  await writeFile(
    path.join(packageRoot, "package.json"),
    JSON.stringify({ name: id, type: "module", exports: "./index.js" }),
  )
  await writeFile(path.join(packageRoot, "index.js"), "export {}\n")
}
