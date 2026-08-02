import type * as React from "react"
import { describe, expect, it } from "vitest"

import {
  CatalogVerticalHost,
  resolveCatalogDefaultMarket,
  resolveCatalogLocaleOptions,
  resolveCatalogScope,
  resolveCatalogScopeSearch,
  resolveCatalogSelectedLocale,
} from "./catalog-vertical-host.js"
import { CruiseDetailHost } from "./cruise-detail-host.js"
import { DynamicCatalogHost } from "./dynamic-catalog-host.js"
import {
  createCatalogAdminExtension,
  createSelectedCatalogAdminExtension,
  productDetailSearchSchema,
  standardCatalogAdminScope,
} from "./index.js"
import { ProductDetailHost } from "./product-detail-host.js"
import { ScheduledCatalogHost } from "./scheduled-catalog-host.js"
import { VerticalDetailHost } from "./vertical-detail-host.js"

describe("createCatalogAdminExtension", () => {
  it("owns standard selected scope defaults and lazy copy", () => {
    expect(standardCatalogAdminScope).toEqual({
      defaultLocale: "en-GB",
      defaultMarket: "default",
      scopeStrategy: "deployment-default",
      hideScopeControls: true,
    })
    const extension = createSelectedCatalogAdminExtension({
      navMessages: {
        catalog: "Catalog",
        catalogProducts: "Pachete",
        catalogExcursions: "Excursii",
        catalogTours: "Tururi",
        catalogBoatTours: "Tururi cu barca",
        catalogActivities: "Activitati",
        catalogAttractions: "Atractii",
        catalogEvents: "Evenimente",
        catalogTransportation: "Transport",
        catalogCruises: "Croaziere",
        catalogAccommodations: "Cazari",
      },
    })
    expect(
      extension.routes?.every((route) => route.redirectTo || route.routeMessagesProvider),
    ).toBe(true)
    expect(extension.navigation?.[0]).toMatchObject({
      order: -140,
      items: [
        {
          id: "catalog",
          title: "Catalog",
          url: "/catalog/products",
          items: [
            { id: "catalog-products", title: "Pachete", url: "/catalog/products" },
            { id: "catalog-tours", title: "Tururi", url: "/catalog/tours" },
            {
              id: "catalog-boat-tours",
              title: "Tururi cu barca",
              url: "/catalog/boat-tours",
            },
            { id: "catalog-activities", title: "Activitati", url: "/catalog/activities" },
            { id: "catalog-attractions", title: "Atractii", url: "/catalog/attractions" },
            { id: "catalog-events", title: "Evenimente", url: "/catalog/events" },
            {
              id: "catalog-transportation",
              title: "Transport",
              url: "/catalog/transportation",
            },
            { id: "catalog-cruises", title: "Croaziere", url: "/catalog/cruises" },
            { id: "catalog-accommodations", title: "Cazari", url: "/catalog/accommodations" },
          ],
        },
      ],
    })
    expect(extension.navigation?.[0]?.items[0]?.icon).toBeDefined()
  })

  it("falls back to stable English selected navigation copy", () => {
    const extension = createSelectedCatalogAdminExtension({ navMessages: {} })
    expect(extension.navigation?.[0]?.items[0]).toMatchObject({
      title: "Catalog",
      items: [
        { title: "Products" },
        { title: "Tours" },
        { title: "Boat Tours" },
        { title: "Activities" },
        { title: "Attractions" },
        { title: "Events" },
        { title: "Transportation" },
        { title: "Cruises" },
        { title: "Accommodations" },
      ],
    })
  })

  it("leaves standard navigation to the graph-selected factory", () => {
    const extension = createCatalogAdminExtension()
    expect(extension.id).toBe("catalog")
    expect(extension.navigation).toBeUndefined()
  })

  it("describes the index redirect plus one route per catalog surface page", () => {
    const extension = createCatalogAdminExtension()
    const routes = extension.routes ?? []
    expect(routes).toHaveLength(21)
    expect(new Set(routes.map((route) => route.id)).size).toBe(21)
    expect(new Set(routes.map((route) => route.path)).size).toBe(21)
    for (const surface of [
      "products",
      "excursions",
      "tours",
      "boat-tours",
      "activities",
      "attractions",
      "events",
      "transportation",
      "cruises",
      "accommodations",
    ]) {
      expect(routes.some((route) => route.path === `/catalog/${surface}`)).toBe(true)
    }
  })

  it("redirects the catalog index to the products surface", () => {
    const extension = createCatalogAdminExtension()
    const index = extension.routes?.find((route) => route.id === "catalog-index")
    expect(index?.path).toBe("/catalog")
    expect(index?.redirectTo).toBe("/catalog/products")
    expect(index?.page).toBeUndefined()
  })

  it("honors basePath and surface labels", () => {
    const extension = createCatalogAdminExtension({
      basePath: "/shop",
      labels: { products: "Pachete" },
    })
    const index = extension.routes?.find((route) => route.id === "catalog-products-index")
    expect(index?.path).toBe("/shop/products")
    expect(index?.title).toBe("Pachete")
  })

  it("carries the packaged browse search contract", () => {
    const extension = createCatalogAdminExtension()
    const index = extension.routes?.find((route) => route.id === "catalog-products-index")
    expect(index?.validateSearch?.({ q: "rome", page: "2" })).toMatchObject({
      q: "rome",
      page: 2,
    })
  })

  it("coerces the product detail search params", () => {
    expect(productDetailSearchSchema.parse({ adults: "2", nights: "7" })).toEqual({
      adults: 2,
      nights: 7,
    })
  })

  it("attaches a lazy page loader (and no eager component) to every contribution", () => {
    // Route implementations are package-owned (packaged-admin RFC §4.8):
    // each contribution carries a lazy `page` module loader the host binder
    // wraps into a code-based route, keeping every page in its own chunk.
    // No contribution attaches an eager `component` — that would pin the
    // page into the chunk that evaluates the extension factory. The index
    // redirect carries no page at all.
    const extension = createCatalogAdminExtension()
    for (const route of extension.routes ?? []) {
      if (route.redirectTo) continue
      expect(typeof route.page).toBe("function")
      expect(route.component).toBeUndefined()
    }
  })

  it("resolves page loaders to modules default-exporting a page component", async () => {
    const extension = createCatalogAdminExtension()
    const detail = extension.routes?.find((route) => route.id === "catalog-cruises-detail")
    const pageModule = await detail?.page?.()
    expect(typeof pageModule?.default).toBe("function")
  })
})

describe("packaged catalog admin hosts", () => {
  // Importable + renderable component types — the operator's thin route hosts
  // bind these directly, so a broken import surface fails here, not in an app
  // build. (Behavioral rendering needs the workspace provider stack and lives
  // with the host apps.)
  it("exports the page hosts as components from their specific modules", () => {
    for (const host of [
      CatalogVerticalHost,
      CruiseDetailHost,
      DynamicCatalogHost,
      ProductDetailHost,
      ScheduledCatalogHost,
      VerticalDetailHost,
    ]) {
      expect(typeof host).toBe("function")
    }
  })

  it("routes products detail through the generic sourced catalog detail host", () => {
    const element = ProductDetailHost({
      productId: "cdmi_demo_dynamic_pkg_20260629",
      adults: 2,
      nights: 7,
      locale: "en-GB",
    }) as React.ReactElement<{
      surface: string
      id: string
      locale?: string
    }>

    expect(element.type).toBe(VerticalDetailHost)
    expect(element.props).toMatchObject({
      surface: "products",
      id: "cdmi_demo_dynamic_pkg_20260629",
      locale: "en-GB",
    })
  })
})

describe("catalog admin locale defaults", () => {
  const markets = [
    {
      id: "mkt_ro",
      name: "Romania",
      code: "RO",
      defaultLanguageTag: "ro-RO",
    },
    {
      id: "mkt_gb",
      name: "United Kingdom",
      code: "GB",
      defaultLanguageTag: "en-GB",
    },
  ]

  it("uses the first loaded active market when no market is selected", () => {
    const market = resolveCatalogDefaultMarket(markets)
    const localeOptions = resolveCatalogLocaleOptions(market, [
      { languageTag: "ro" },
      { languageTag: "ro-RO" },
    ])

    expect(market?.id).toBe("mkt_ro")
    expect(localeOptions).toEqual(["ro", "ro-RO"])
    expect(resolveCatalogSelectedLocale(undefined, localeOptions, market)).toBe("ro-RO")
  })

  it("keeps an explicitly selected market in control of locale fallback", () => {
    const market = resolveCatalogDefaultMarket(markets, "mkt_gb")
    const localeOptions = resolveCatalogLocaleOptions(market, [{ languageTag: "en" }])

    expect(market?.id).toBe("mkt_gb")
    expect(resolveCatalogSelectedLocale("en", localeOptions, market)).toBe("en")
    expect(resolveCatalogSelectedLocale("ro-RO", localeOptions, market)).toBe("en-GB")
  })

  it("uses the default market scope when embedded browse has no selected market", () => {
    const market = resolveCatalogDefaultMarket(markets)
    const localeOptions = resolveCatalogLocaleOptions(market, [{ languageTag: "ro-RO" }])

    expect(resolveCatalogScope({}, localeOptions, market)).toEqual({
      market: "mkt_ro",
      locale: "ro-RO",
    })
  })

  it("uses deployment defaults when no commerce market exists", () => {
    const market = resolveCatalogDefaultMarket([], undefined, {
      defaultLocale: "en-GB",
      defaultMarket: "default",
      scopeStrategy: "deployment-default",
    })
    const localeOptions = resolveCatalogLocaleOptions(market, [], "en-GB")

    expect(market).toMatchObject({
      id: "default",
      defaultLanguageTag: "en-GB",
    })
    expect(resolveCatalogScope({}, localeOptions, market, { defaultMarket: "default" })).toEqual({
      market: "default",
      locale: "en-GB",
    })
  })

  it("prefers a configured commerce market before falling back to the first market", () => {
    const market = resolveCatalogDefaultMarket(markets, undefined, {
      defaultMarket: "GB",
      scopeStrategy: "deployment-default",
    })

    expect(market?.id).toBe("mkt_gb")
  })

  it("keeps explicit market and locale scope when provided", () => {
    const market = resolveCatalogDefaultMarket(markets, "mkt_gb")
    const localeOptions = resolveCatalogLocaleOptions(market, [
      { languageTag: "en" },
      { languageTag: "en-GB" },
    ])

    expect(resolveCatalogScope({ market: "mkt_gb", locale: "en" }, localeOptions, market)).toEqual({
      market: "mkt_gb",
      locale: "en",
    })
  })

  it("ignores URL market and locale when scope controls are hidden", () => {
    expect(
      resolveCatalogScopeSearch(
        { page: 1, market: "mkt_ro", locale: "ro-RO", q: "delta" },
        { hideScopeControls: true },
      ),
    ).toEqual({
      page: 1,
      market: undefined,
      locale: undefined,
      q: "delta",
    })
  })
})
