import { createRequire } from "node:module"
import { fileURLToPath, URL } from "node:url"
import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig, type PluginOption } from "vite"

const require = createRequire(import.meta.url)
const tuyuRuntime = process.env.TUYU_BOOKING_RUNTIME === "1"
const tuyuOutputDir = process.env.TUYU_VOYANT_OUTPUT_DIR

type VisualizerModule = {
  visualizer: (options: {
    filename: string
    template: "treemap"
    gzipSize: boolean
    brotliSize: boolean
  }) => PluginOption
}

function createAnalyzePlugin(): PluginOption | false {
  if (process.env.ANALYZE !== "1") return false

  try {
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

const config = defineConfig({
  // Allow Cloudflare-tunnel / ngrok hostnames to reach the dev server.
  // Vite's default rejects any Host header that isn't localhost, which
  // breaks Netopia (and other) webhooks delivered through a public tunnel.
  // `true` allows everything — fine for dev, never for production.
  server: {
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      output: {
        // Force heavy vendor libs into their own chunks so they're only
        // downloaded when a route/component that uses them is reached
        // (combined with React.lazy at the consumer site). Without this,
        // Vite hoists them into the shared entry chunk because the
        // @voyantjs/ui barrel re-exports components that statically import
        // them, leaking the deps into every route's dep graph.
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            // Pin React/JSX runtime + react-dom into their own chunk FIRST.
            // Without this, Rolldown was hoisting the JSX runtime into the
            // tiptap vendor chunk, forcing every React-using chunk to
            // import the 370 KB tiptap chunk just to get `jsx`/`jsxs`.
            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("/scheduler/") ||
              id.match(/\/react\/jsx-(dev-)?runtime\b/)
            )
              return "react"
            if (id.includes("/@tiptap/") || id.includes("/prosemirror-")) return "tiptap"
            if (id.includes("/recharts/")) return "recharts"
            if (id.includes("/pdf-lib/") || id.includes("/@pdf-lib/")) return "pdf-lib"
            if (id.includes("/react-phone-number-input/") || id.includes("/libphonenumber-js/"))
              return "phone-input"
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    tsconfigPaths: true,
  },
  ssr: {
    optimizeDeps: {
      include: [
        "clsx",
        "tailwind-merge",
        "react",
        "react-dom",
        "react-dom/server",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/react-router",
        "zustand",
        "zustand/react/shallow",
        "immer",
        "sonner",
        "lucide-react",
        "date-fns",
        "zod",
        "react-hook-form",
        "swr",
      ],
    },
  },
  plugins: [
    tuyuRuntime &&
      nitro({
        preset: "node-server",
        ...(tuyuOutputDir ? { output: { dir: tuyuOutputDir } } : {}),
      }),
    devtools(),
    !tuyuRuntime && cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    tanstackStart({
      router: {
        routeFileIgnorePattern:
          "^(_components|_hooks|_stores|_sections|_contexts|_lib|_tabs|utils|types\\.ts|.*(?:^|[-])(shared|page(?:-[a-z0-9-]+)?|dialogs?(?:-[a-z0-9-]+)?|sections|service-row|day-row|version-row|contact-tab|questions-row|questions-tab|section-header|kanban|queries)\\.(?:ts|tsx))$",
      },
    }),
    viteReact(),
    // Opt-in: `ANALYZE=1 pnpm build` emits dist/stats.html with a treemap
    // of all client chunks. Off by default so normal builds stay clean.
    createAnalyzePlugin(),
  ],
})

export default config
