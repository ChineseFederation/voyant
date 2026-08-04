import { describe, expect, it } from "vitest"

import { AvailabilityIndexHost } from "./availability-index-host.js"
import { ensureAvailabilityPageData } from "./availability-page-data.js"
import { createAvailabilityAdminExtension } from "./index.js"
import { OptionResourceTemplatesPanel } from "./option-resource-templates-panel.js"
import { AvailabilityRuleDetailHost } from "./rule-detail-host.js"
import { AvailabilitySlotDetailHost } from "./slot-detail-host.js"
import { AvailabilityStartTimeDetailHost } from "./start-time-detail-host.js"

describe("createAvailabilityAdminExtension", () => {
  it("contributes no navigation (availability nav is base-nav-owned)", () => {
    const extension = createAvailabilityAdminExtension()
    expect(extension.id).toBe("availability")
    expect(extension.navigation).toBeUndefined()
  })

  it("describes the index and detail routes with unique ids and paths", () => {
    const extension = createAvailabilityAdminExtension()
    const routes = extension.routes ?? []
    expect(routes).toHaveLength(4)
    expect(new Set(routes.map((route) => route.id)).size).toBe(4)
    expect(routes.map((route) => route.path)).toEqual([
      "/operations/availability",
      "/operations/availability/$id",
      "/operations/availability/rules/$id",
      "/operations/availability/start-times/$id",
    ])
  })

  it("honors basePath and labels", () => {
    const extension = createAvailabilityAdminExtension({
      basePath: "/inventory",
      labels: { availability: "Disponibilitate" },
    })
    const index = extension.routes?.find((route) => route.id === "availability-index")
    expect(index?.path).toBe("/inventory")
    expect(index?.title).toBe("Disponibilitate")
    const slotDetail = extension.routes?.find((route) => route.id === "availability-slot-detail")
    expect(slotDetail?.path).toBe("/inventory/$id")
    expect(slotDetail?.title).toBe("Disponibilitate")
  })

  it("carries a search contract only on the departure workspace", () => {
    // The list pages keep their filters component-local. The slot detail page
    // is the one route with a URL contract: its six workspace sections are
    // addressable, so `?tab=` survives a reload and is linkable.
    const extension = createAvailabilityAdminExtension()
    for (const route of extension.routes ?? []) {
      if (route.id === "availability-slot-detail") continue
      expect(route.validateSearch).toBeUndefined()
    }
  })

  it("round-trips the departure workspace tab through the route search contract", () => {
    const extension = createAvailabilityAdminExtension()
    const slotDetail = extension.routes?.find((route) => route.id === "availability-slot-detail")

    expect(slotDetail?.validateSearch?.({ tab: "financials" })).toEqual({ tab: "financials" })
    // Absent and unrecognized values both land on the overview rather than
    // failing the route — a hand-edited or stale URL must still render.
    expect(slotDetail?.validateSearch?.({})).toEqual({ tab: "overview" })
    expect(slotDetail?.validateSearch?.({ tab: "not-a-section" })).toEqual({ tab: "overview" })
  })

  it("carries lazy page loaders instead of eager components", async () => {
    // The full route implementation lives on the contribution (RFC §4.8):
    // `page` resolves the page module lazily so it stays code-split; no
    // eager `component` reference pins it into the workspace-chrome chunk.
    const extension = createAvailabilityAdminExtension()
    for (const route of extension.routes ?? []) {
      expect(route.component).toBeUndefined()
      expect(typeof route.page).toBe("function")
      const module = await route.page?.()
      expect(typeof module?.default).toBe("function")
    }
  })

  it("attaches data loaders and pending skeletons to every route", () => {
    const extension = createAvailabilityAdminExtension()
    expect(extension.routes).toHaveLength(4)
    for (const route of extension.routes ?? []) {
      expect(typeof route.loader).toBe("function")
      expect(typeof route.pendingComponent).toBe("function")
    }
  })

  it("marks the index route data-only for SSR and leaves the detail routes default", () => {
    const extension = createAvailabilityAdminExtension()
    const ssrById = new Map(extension.routes?.map((route) => [route.id, route.ssr]))
    expect(ssrById.get("availability-index")).toBe("data-only")
    expect(ssrById.get("availability-slot-detail")).toBeUndefined()
    expect(ssrById.get("availability-rule-detail")).toBeUndefined()
    expect(ssrById.get("availability-start-time-detail")).toBeUndefined()
  })
})

describe("packaged availability admin hosts", () => {
  // Importable + renderable component types — the operator's thin route
  // hosts bind these directly, so a broken import surface fails here, not in
  // an app build. (Behavioral rendering needs the workspace provider stack
  // and lives with the host apps.)
  it("exports the page hosts as components from their specific modules", () => {
    for (const host of [
      AvailabilityIndexHost,
      AvailabilityRuleDetailHost,
      AvailabilitySlotDetailHost,
      AvailabilityStartTimeDetailHost,
      OptionResourceTemplatesPanel,
    ]) {
      expect(typeof host).toBe("function")
    }
  })

  it("exports the index page loader for app-side SSR binding", () => {
    expect(typeof ensureAvailabilityPageData).toBe("function")
  })
})
