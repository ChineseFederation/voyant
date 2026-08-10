import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import type { Plugin } from "vite"
import { describe, expect, it } from "vitest"
import {
  VOYANT_ROUTE_FILE_IGNORE_PATTERN,
  VOYANT_SSR_OPTIMIZE_DEPS,
  voyantChunkOutput,
  voyantGeneratedRoutes,
  voyantStartViteConfig,
  voyantVendorChunk,
} from "../src/index.js"

describe("voyantVendorChunk", () => {
  it("ignores first-party modules", () => {
    expect(voyantVendorChunk("/repo/packages/ui/src/components/button.tsx")).toBeUndefined()
  })

  it("pins react, react-dom, scheduler, and the JSX runtime into the react chunk", () => {
    expect(voyantVendorChunk("/repo/node_modules/react/index.js")).toBe("react")
    expect(voyantVendorChunk("/repo/node_modules/react-dom/client.js")).toBe("react")
    expect(voyantVendorChunk("/repo/node_modules/scheduler/index.js")).toBe("react")
    expect(voyantVendorChunk("/repo/node_modules/react/jsx-runtime.js")).toBe("react")
    expect(voyantVendorChunk("/repo/node_modules/react/jsx-dev-runtime.js")).toBe("react")
  })

  it("isolates the heavy editor, chart, and pdf vendors", () => {
    expect(voyantVendorChunk("/repo/node_modules/@tiptap/core/index.js")).toBe("tiptap")
    expect(voyantVendorChunk("/repo/node_modules/prosemirror-state/index.js")).toBe("tiptap")
    expect(voyantVendorChunk("/repo/packages/ui/src/components/rich-text-editor.tsx")).toBe(
      "tiptap",
    )
    expect(
      voyantVendorChunk(
        "/repo/node_modules/@voyant-travel/ui/src/components/rich-text-variable-extension.ts",
      ),
    ).toBe("tiptap")
    expect(voyantVendorChunk("/repo/packages/ui/src/components/chart.tsx")).toBe("recharts")
    expect(voyantVendorChunk("/repo/node_modules/@voyant-travel/ui/src/components/chart.tsx")).toBe(
      "recharts",
    )
    expect(voyantVendorChunk("/repo/node_modules/recharts/es6/index.js")).toBe("recharts")
    expect(voyantVendorChunk("/repo/node_modules/pdf-lib/cjs/index.js")).toBe("pdf-lib")
    expect(voyantVendorChunk("/repo/node_modules/@pdf-lib/fontkit/index.js")).toBe("pdf-lib")
  })

  it("keeps the complete Drizzle ESM graph in one chunk", () => {
    expect(
      voyantVendorChunk(
        "/repo/node_modules/.pnpm/drizzle-orm@0.45.2/node_modules/drizzle-orm/pg-core/columns/int.common.js",
      ),
    ).toBe("drizzle-orm")
    expect(
      voyantVendorChunk(
        "/repo/node_modules/.pnpm/drizzle-orm@0.45.2/node_modules/drizzle-orm/pg-core/columns/common.js",
      ),
    ).toBe("drizzle-orm")
  })

  it("keeps class-name helpers out of heavy vendor chunks", () => {
    expect(voyantVendorChunk("/repo/node_modules/clsx/dist/clsx.mjs")).toBe("class-utils")
    expect(voyantVendorChunk("/repo/node_modules/tailwind-merge/dist/index.mjs")).toBe(
      "class-utils",
    )
  })

  it("leaves other vendors to the default chunking", () => {
    expect(voyantVendorChunk("/repo/node_modules/zod/index.js")).toBeUndefined()
    // react-hook-form must NOT match the /react/ pin.
    expect(voyantVendorChunk("/repo/node_modules/react-hook-form/dist/index.js")).toBeUndefined()
    expect(
      voyantVendorChunk("/repo/node_modules/better-auth/dist/client/react/index.js"),
    ).toBeUndefined()
    expect(
      voyantVendorChunk("/repo/node_modules/@better-auth/utils/dist/client/react/error-codes.js"),
    ).toBeUndefined()
  })
})

describe("voyantChunkOutput", () => {
  it("uses explicit Rolldown dependency boundaries on Vite 8", () => {
    const output = voyantChunkOutput(8)
    expect("codeSplitting" in output && output.codeSplitting.includeDependenciesRecursively).toBe(
      false,
    )
  })

  it("uses Rollup's explicit manual chunks on Vite 6 and 7", () => {
    const output = voyantChunkOutput(7)
    expect("onlyExplicitManualChunks" in output && output.onlyExplicitManualChunks).toBe(true)
    expect(
      "manualChunks" in output && output.manualChunks("/repo/node_modules/react/index.js"),
    ).toBe("react")
  })
})

describe("voyantGeneratedRoutes", () => {
  it("writes package-owned route files under the ignored graph directory", () => {
    const root = mkdtempSync(join(tmpdir(), "voyant-routes-"))
    try {
      const generated = voyantGeneratedRoutes({
        appRootUrl: pathToFileURL(join(root, "vite.config.ts")).href,
        files: [{ path: "(auth)/sign-in.tsx", source: "export const Route = true" }],
      })

      expect(generated.routesDirectory).toBe(join(root, ".voyant/routes"))
      expect(generated.generatedRouteTree).toBe(join(root, ".voyant/routeTree.gen.ts"))
      expect(readFileSync(join(generated.routesDirectory, "(auth)/sign-in.tsx"), "utf8")).toBe(
        "export const Route = true\n",
      )
      expect(existsSync(join(root, "src/routes"))).toBe(false)

      writeFileSync(join(generated.routesDirectory, "stale.tsx"), "stale\n")
      voyantGeneratedRoutes({
        appRootUrl: pathToFileURL(join(root, "vite.config.ts")).href,
        files: [{ path: "(auth)/sign-in.tsx", source: "export const Route = true" }],
      })
      expect(existsSync(join(generated.routesDirectory, "stale.tsx"))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("rejects route paths that can escape the generated directory", () => {
    const root = mkdtempSync(join(tmpdir(), "voyant-routes-"))
    try {
      expect(() =>
        voyantGeneratedRoutes({
          appRootUrl: pathToFileURL(join(root, "vite.config.ts")).href,
          files: [{ path: "../route.tsx", source: "" }],
        }),
      ).toThrow("Invalid generated route path")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("voyantStartViteConfig", () => {
  const base = {
    appRootUrl: "file:///repo/apps/operator/vite.config.ts",
    plugins: [],
  }

  it("anchors the @ alias at the app's src directory", () => {
    const config = voyantStartViteConfig(base)
    const aliases = config.resolve?.alias

    expect(aliases).toEqual([{ find: "@", replacement: "/repo/apps/operator/src" }])
  })

  it("deduplicates framework dependencies declared and resolvable from a fresh app root", () => {
    const root = createAppFixture([
      "react",
      "react-dom",
      "@tanstack/react-query",
      "@tanstack/react-router",
    ])
    try {
      const config = voyantStartViteConfig({
        ...base,
        appRootUrl: pathToFileURL(join(root, "vite.config.ts")).href,
      })

      expect(config.resolve?.dedupe).toEqual([
        "react",
        "react-dom",
        "@tanstack/react-query",
        "@tanstack/react-router",
      ])
      expect(config.resolve?.dedupe).not.toContain("@voyant-travel/admin")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("does not deduplicate framework dependencies only installed below a legacy app dependency", () => {
    const root = createAppFixture(["@voyant-travel/operator-standard"])
    try {
      for (const dependency of [
        "react",
        "react-dom",
        "@tanstack/react-query",
        "@tanstack/react-router",
      ]) {
        writeResolvablePackage(
          join(root, "node_modules/@voyant-travel/operator-standard/node_modules"),
          dependency,
        )
      }

      const config = voyantStartViteConfig({
        ...base,
        appRootUrl: pathToFileURL(join(root, "vite.config.ts")).href,
      })

      expect(config.resolve?.dedupe).toEqual([])
      expect(config.ssr?.optimizeDeps?.include).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("does not prebundle the broad operator composition entry", () => {
    const config = voyantStartViteConfig(base)

    expect(config.optimizeDeps?.exclude).toEqual([
      "@voyant-travel/operator-standard",
      "@voyant-travel/operator-standard/standard-frontend",
    ])
  })

  it("can defer only JavaScript-hosted dynamic import preloads", () => {
    const config = voyantStartViteConfig({ ...base, deferDynamicImportPreloads: true })
    const resolveDependencies = config.build?.modulePreload
    if (
      !resolveDependencies ||
      typeof resolveDependencies === "boolean" ||
      typeof resolveDependencies.resolveDependencies !== "function"
    ) {
      throw new Error("missing module preload dependency resolver")
    }

    const dependencies = ["assets/react.js", "assets/route.js"]
    expect(
      resolveDependencies.resolveDependencies("assets/index.js", dependencies, {
        hostId: "index.html",
        hostType: "html",
      }),
    ).toEqual(dependencies)
    expect(
      resolveDependencies.resolveDependencies("assets/route.js", dependencies, {
        hostId: "assets/index.js",
        hostType: "js",
      }),
    ).toEqual([])
  })

  it("keeps Vite's default preload behavior unless explicitly enabled", () => {
    expect(voyantStartViteConfig(base).build?.modulePreload).toBeUndefined()
  })

  it("layers extra manual chunks after the Voyant vendor rules", () => {
    const config = voyantStartViteConfig({
      ...base,
      extraManualChunks: (id) => (id.includes("/lodash/") ? "lodash" : undefined),
    })
    const output = config.build?.rollupOptions?.output
    const codeSplitting = (Array.isArray(output) ? output[0] : output)?.codeSplitting
    expect(codeSplitting).not.toBe(false)
    expect(codeSplitting).not.toBe(true)
    if (!codeSplitting || typeof codeSplitting !== "object") throw new Error("missing chunk config")
    expect(codeSplitting.includeDependenciesRecursively).toBe(false)
    const chunkName = codeSplitting.groups?.[0]?.name
    if (typeof chunkName !== "function") throw new Error("missing chunk name function")

    expect(chunkName("/repo/node_modules/react/index.js", {} as never)).toBe("react")
    expect(chunkName("/repo/packages/ui/src/components/button.tsx", {} as never)).toBe(
      "admin-shell-ui",
    )
    expect(
      chunkName("/repo/node_modules/@voyant-travel/ui/dist/components/button.js", {} as never),
    ).toBe("admin-shell-ui")
    expect(chunkName("/repo/packages/ui/src/components/date-picker.tsx", {} as never)).toBeNull()
    expect(
      chunkName("/repo/node_modules/lucide-react/dist/esm/icons/loader-circle.mjs", {} as never),
    ).toBe("admin-shell-lucide")
    expect(
      chunkName("/repo/node_modules/lucide-react/dist/esm/createLucideIcon.mjs", {} as never),
    ).toBe("admin-shell-lucide")
    expect(
      chunkName("/repo/node_modules/lucide-react/dist/esm/icons/settings.mjs", {} as never),
    ).toBeNull()
    expect(chunkName("/repo/node_modules/lodash/index.js", {} as never)).toBe("lodash")
    expect(chunkName("/repo/node_modules/zod/index.js", {} as never)).toBeNull()
  })

  it("appends app-specific SSR optimizeDeps to the Voyant set", () => {
    const root = createAppFixture([
      "react",
      "react-dom",
      "@tanstack/react-query",
      "@tanstack/react-router",
    ])
    try {
      const config = voyantStartViteConfig({
        ...base,
        appRootUrl: pathToFileURL(join(root, "vite.config.ts")).href,
        ssrOptimizeDepsInclude: ["my-lib"],
      })
      const include = config.ssr?.optimizeDeps?.include ?? []

      expect(include).toEqual([...VOYANT_SSR_OPTIMIZE_DEPS, "my-lib"])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("prebundles only direct generated-app dependencies", () => {
    expect(VOYANT_SSR_OPTIMIZE_DEPS).toEqual([
      "react",
      "react-dom",
      "react-dom/server",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/react-router",
    ])
  })

  it("keeps only the CommonJS database driver external in Node SSR builds", () => {
    const config = voyantStartViteConfig({ ...base, nodeSsr: true })

    expect(config.ssr?.external).toEqual(["pg"])
  })

  it("externalizes only first-party runtime packages for production builds", async () => {
    const root = createAppFixture(["@voyant-travel/bookings"])
    try {
      const config = voyantStartViteConfig({
        ...base,
        appRootUrl: pathToFileURL(join(root, "vite.config.ts")).href,
        nodeSsr: true,
        bundleWorkspaceSource: false,
      })

      expect(config.ssr?.external).toEqual(["pg"])
      expect(config.ssr?.noExternal).toEqual([
        "@voyant-travel/runtime",
        "@voyant-travel/admin-host",
        "@tanstack/react-start",
        "@tanstack/start-client-core",
        "@tanstack/start-server-core",
      ])
      expect(config.resolve?.noExternal).toEqual(config.ssr?.noExternal)
      expect(config.plugins).toEqual([
        expect.objectContaining({
          name: "voyant:externalize-production-runtime",
          enforce: "pre",
          resolveId: expect.any(Function),
        }),
      ])
      const [externalizer] = config.plugins as Plugin[]
      const resolveId = externalizer?.resolveId
      expect(typeof resolveId).toBe("function")
      if (typeof resolveId !== "function") return
      const serverContext = { environment: { config: { consumer: "server" } } }
      const clientContext = { environment: { config: { consumer: "client" } } }
      expect(
        await resolveId.call(
          serverContext as never,
          "@voyant-travel/bookings/runtime",
          undefined,
          {} as never,
        ),
      ).toEqual({ id: "@voyant-travel/bookings/runtime", external: true })
      expect(
        await resolveId.call(
          serverContext as never,
          "@voyant-travel/data-sdk",
          undefined,
          {} as never,
        ),
      ).toBeNull()
      const importer = join(root, ".voyant/runtime/project-runtime.generated.ts")
      const anchoredRuntime =
        "../../node_modules/@voyant-travel/operator-standard/node_modules/@voyant-travel/data-sdk/dist/index.js"
      expect(
        await resolveId.call(serverContext as never, anchoredRuntime, importer, {} as never),
      ).toEqual({
        id: join(
          root,
          "node_modules/@voyant-travel/operator-standard/node_modules/@voyant-travel/data-sdk/dist/index.js",
        ),
        external: true,
      })
      expect(
        await resolveId.call(
          serverContext as never,
          "@voyant-travel/runtime",
          undefined,
          {} as never,
        ),
      ).toBeNull()
      expect(
        await resolveId.call(
          serverContext as never,
          "@voyant-travel/admin-host/ssr",
          undefined,
          {} as never,
        ),
      ).toBeNull()
      expect(
        await resolveId.call(
          serverContext as never,
          "@tanstack/start-server-core",
          undefined,
          {} as never,
        ),
      ).toBeNull()
      expect(
        await resolveId.call(
          clientContext as never,
          "@voyant-travel/bookings/runtime",
          undefined,
          {} as never,
        ),
      ).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("allows dev tunnel hosts by default and supports an explicit host list", () => {
    expect(voyantStartViteConfig(base).server?.allowedHosts).toBe(true)
    expect(
      voyantStartViteConfig({ ...base, allowedHosts: ["app.example.test"] }).server?.allowedHosts,
    ).toEqual(["app.example.test"])
  })
})

function createAppFixture(dependencies: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), "voyant-vite-config-"))
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "test-app",
      dependencies: Object.fromEntries(dependencies.map((id) => [id, "1.0.0"])),
    }),
  )
  for (const dependency of dependencies)
    writeResolvablePackage(join(root, "node_modules"), dependency)
  return root
}

function writeResolvablePackage(nodeModulesRoot: string, name: string): void {
  const packageRoot = join(nodeModulesRoot, name)
  mkdirSync(packageRoot, { recursive: true })
  writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name, main: "index.js" }))
  writeFileSync(join(packageRoot, "index.js"), "module.exports = {}\n")
  if (name === "react") {
    writeFileSync(join(packageRoot, "jsx-runtime.js"), "module.exports = {}\n")
    writeFileSync(join(packageRoot, "jsx-dev-runtime.js"), "module.exports = {}\n")
  }
  if (name === "react-dom") {
    writeFileSync(join(packageRoot, "server.js"), "module.exports = {}\n")
  }
}

describe("VOYANT_ROUTE_FILE_IGNORE_PATTERN", () => {
  const pattern = new RegExp(VOYANT_ROUTE_FILE_IGNORE_PATTERN)

  it("ignores colocated non-route modules", () => {
    expect(pattern.test("_components")).toBe(true)
    expect(pattern.test("_hooks")).toBe(true)
    expect(pattern.test("booking-detail-page.tsx")).toBe(true)
    expect(pattern.test("contract-dialogs.tsx")).toBe(true)
    expect(pattern.test("shop-product-detail-content.ts")).toBe(true)
    expect(pattern.test("shop-product-detail-accommodations.tsx")).toBe(true)
    expect(pattern.test("shop-product-detail-cruises.tsx")).toBe(true)
    expect(pattern.test("shop-product-detail-products.tsx")).toBe(true)
    expect(pattern.test("types.ts")).toBe(true)
  })

  it("keeps real route files", () => {
    expect(pattern.test("index.tsx")).toBe(false)
    expect(pattern.test("route.tsx")).toBe(false)
    expect(pattern.test("$bookingId.tsx")).toBe(false)
  })
})
