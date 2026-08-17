import type { AdminRouteLoaderContext } from "@voyant-travel/admin"
import { describe, expect, it, vi } from "vitest"

import {
  createRelationshipsAdminExtension,
  createSelectedRelationshipsAdminExtension,
  InquiryDetailSkeleton,
  InquiryQueueSkeleton,
  OrganizationDetailSkeleton,
  OrganizationsListSkeleton,
  PeopleListSkeleton,
  PersonDetailSkeleton,
  personDetailBookingsTabSlot,
} from "./index.js"
import { InquiryDetailHost } from "./inquiry-detail-host.js"
import { InquiryQueueHost } from "./inquiry-queue-host.js"
import { OrganizationDetailHost } from "./organization-detail-host.js"
import { OrganizationsHost } from "./organizations-host.js"
import { PeopleHost } from "./people-host.js"
import { PersonDetailHost } from "./person-detail-host.js"

describe("createRelationshipsAdminExtension", () => {
  it("adds localized standard navigation only through the selected factory", () => {
    const extension = createRelationshipsAdminExtension()
    expect(extension.id).toBe("relationships")
    expect(extension.navigation).toBeUndefined()

    const selected = createSelectedRelationshipsAdminExtension({
      navMessages: { inquiries: "Solicitari", people: "Persoane", organizations: "Organizatii" },
    })
    expect(selected.navigation?.[0]).toMatchObject({
      order: -70,
      items: [
        { id: "inquiries", title: "Solicitari", url: "/inquiries" },
        { id: "people", title: "Persoane", url: "/people" },
        { id: "organizations", title: "Organizatii", url: "/organizations" },
      ],
    })
    expect(selected.navigation?.[0]?.items.every((item) => item.icon)).toBe(true)
  })

  it("uses stable labels when selected navigation messages are absent", () => {
    const selected = createSelectedRelationshipsAdminExtension({ navMessages: {} })

    expect(selected.navigation?.[0]?.items).toMatchObject([
      { id: "inquiries", title: "Inquiries" },
      { id: "people", title: "People" },
      { id: "organizations", title: "Organizations" },
    ])
    expect(selected.routes?.map((route) => route.title)).toEqual([
      "Inquiries",
      "Inquiries",
      "People",
      "People",
      "Organizations",
      "Organizations",
    ])
  })

  it("describes inquiry, people, and organization routes with unique ids and paths", () => {
    const extension = createRelationshipsAdminExtension()
    const routes = extension.routes ?? []
    expect(routes).toHaveLength(6)
    expect(new Set(routes.map((route) => route.id)).size).toBe(6)
    expect(routes.map((route) => route.path)).toEqual([
      "/inquiries",
      "/inquiries/$id",
      "/people",
      "/people/$id",
      "/organizations",
      "/organizations/$id",
    ])
  })

  it("honors base paths and labels", () => {
    const extension = createRelationshipsAdminExtension({
      peopleBasePath: "/persoane",
      organizationsBasePath: "/organizatii",
      inquiriesBasePath: "/solicitari",
      labels: { inquiries: "Solicitari", people: "Persoane", organizations: "Organizatii" },
    })
    const peopleIndex = extension.routes?.find((route) => route.id === "relationships-people-index")
    expect(peopleIndex?.path).toBe("/persoane")
    expect(peopleIndex?.title).toBe("Persoane")
    const organizationsDetail = extension.routes?.find(
      (route) => route.id === "relationships-organizations-detail",
    )
    expect(organizationsDetail?.path).toBe("/organizatii/$id")
    expect(organizationsDetail?.title).toBe("Organizatii")
    const inquiryDetail = extension.routes?.find(
      (route) => route.id === "relationships-inquiries-detail",
    )
    expect(inquiryDetail?.path).toBe("/solicitari/$id")
    expect(inquiryDetail?.title).toBe("Solicitari")
    expect(inquiryDetail?.destination).toBe("inquiry.detail")
    expect(inquiryDetail?.destinationParams).toEqual({ id: "inquiryId" })
  })

  it("carries no search contracts (Relationships lists keep filter state in memory)", () => {
    const extension = createRelationshipsAdminExtension()
    for (const route of extension.routes ?? []) {
      expect(route.validateSearch).toBeUndefined()
    }
  })

  it("carries lazy page loaders instead of eager components", async () => {
    // The full route implementation lives on the contribution (RFC §4.8):
    // `page` resolves the page module lazily so it stays code-split; no
    // eager `component` reference pins it into the workspace-chrome chunk.
    const extension = createRelationshipsAdminExtension()
    for (const route of extension.routes ?? []) {
      expect(route.component).toBeUndefined()
      expect(typeof route.page).toBe("function")
      const module = await route.page?.()
      expect(typeof module?.default).toBe("function")
    }
  })

  it("attaches data loaders and pending skeletons to every route", () => {
    const extension = createRelationshipsAdminExtension()
    expect(extension.routes).toHaveLength(6)
    for (const route of extension.routes ?? []) {
      expect(typeof route.loader).toBe("function")
      expect(typeof route.pendingComponent).toBe("function")
    }
  })

  it("marks the list routes data-only for SSR and leaves the detail routes default", () => {
    const extension = createRelationshipsAdminExtension()
    const ssrById = new Map(extension.routes?.map((route) => [route.id, route.ssr]))
    expect(ssrById.get("relationships-people-index")).toBe("data-only")
    expect(ssrById.get("relationships-inquiries-index")).toBe("data-only")
    expect(ssrById.get("relationships-organizations-index")).toBe("data-only")
    expect(ssrById.get("relationships-people-detail")).toBeUndefined()
    expect(ssrById.get("relationships-organizations-detail")).toBeUndefined()
    expect(ssrById.get("relationships-inquiries-detail")).toBeUndefined()
  })

  it("loads the inquiry queue as actionable open work by default", async () => {
    const route = createRelationshipsAdminExtension().routes?.find(
      (candidate) => candidate.id === "relationships-inquiries-index",
    )
    const ensureQueryData = vi.fn().mockResolvedValue(undefined)
    await route?.loader?.({
      queryClient: { ensureQueryData },
      runtime: { baseUrl: "https://example.test" },
      params: {},
    } as unknown as AdminRouteLoaderContext)
    const options = ensureQueryData.mock.calls[0]?.[0] as { queryKey?: readonly unknown[] }
    expect(options.queryKey).toEqual([
      "voyant",
      "relationships",
      "inquiries",
      "list",
      { view: "actionable", limit: 50 },
    ])
  })
})

describe("packaged relationships admin hosts", () => {
  // Importable + renderable component types — host apps bind these from
  // their SPECIFIC modules (the admin barrel re-exports types only, so the
  // workspace-chrome chunk that evaluates the factory never pins the heavy
  // hosts). A broken import surface fails here, not in an app build.
  it("exports the page hosts as components from their specific modules", () => {
    for (const host of [
      OrganizationDetailHost,
      InquiryDetailHost,
      InquiryDetailSkeleton,
      InquiryQueueHost,
      InquiryQueueSkeleton,
      OrganizationDetailSkeleton,
      OrganizationsHost,
      OrganizationsListSkeleton,
      PeopleHost,
      PeopleListSkeleton,
      PersonDetailHost,
      PersonDetailSkeleton,
    ]) {
      expect(typeof host).toBe("function")
    }
  })

  it("exposes the person-bookings widget slot id (bookings-ui targets it)", () => {
    expect(personDetailBookingsTabSlot).toBe("person.details.bookings-tab")
  })
})
