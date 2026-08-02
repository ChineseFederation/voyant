import {
  type AdminExtension,
  type AdminRoutePageModule,
  type AdminRoutePageProps,
  defineAdminExtension,
  type SelectedAdminExtensionFactoryContext,
  withAdminRouteMessagesProvider,
} from "@voyant-travel/admin"
import { Library } from "lucide-react"
import type * as React from "react"
import { z } from "zod"
// Lean static: the browse search contract lives in its own schema-only
// module — importing it through `../index.js` would pin the whole catalog
// data/components barrel into the workspace-chrome chunk that evaluates
// this factory.
import { catalogSearchSchema } from "../catalog-search-params.js"
import type { CatalogDetailSurface } from "../catalog-surfaces.js"
import type { ScheduledScope } from "../components/scheduled-catalog-page.js"

/**
 * Semantic destinations the catalog admin surfaces navigate to (packaged-admin
 * RFC §4.7). The catalog pages link into routes they do not own — the
 * supplier page and product editor — so instead of importing a
 * host route tree they resolve these keys through
 * `useAdminHref`/`useAdminNavigate` from `@voyant-travel/admin`. Hosts register one
 * resolver per key (`satisfies AdminDestinationResolvers`).
 */
declare module "@voyant-travel/admin" {
  interface AdminDestinations {
    /** A catalog surface's browse page (e.g. Packages, Cruises). */
    "catalog.browse": { surface: CatalogDetailSurface }
    /**
     * A catalog surface's dedicated detail page. `adults`/`nights` are retained
     * for older package-offer links; sourced catalog details resolve runtime
     * availability from the content/slots routes.
     */
    "catalog.detail": {
      surface: CatalogDetailSurface
      id: string
      adults?: number
      nights?: number
    }
    /** The owned-product editor/detail page. */
    "product.detail": { productId: string }
    /** A supplier's detail page. */
    "supplier.detail": { supplierId: string }
  }
}

export { type CatalogSearchParams, catalogSearchSchema } from "../catalog-search-params.js"
// Lean taxonomy + search contracts consumed by host route files / host
// wrappers and the generated admin route module.
//
// Endgame rule (packaged-admin RFC §4.8): this barrel re-exports NO page
// or host component values — it is evaluated with the workspace chrome, so
// a static page/host re-export would pin the heavy catalog pages into the
// entry chunk. Pages and hosts import from their specific modules
// (`@voyant-travel/catalog-react/components/*`, `./pages/*` wrappers); only
// their TYPES re-export here.
export {
  type CatalogDetailSurface,
  type CatalogVerticalPageId,
  catalogDetailSurfaces,
  catalogSurfaceVertical,
  catalogVerticalPageIds,
} from "../catalog-surfaces.js"
export type { CatalogPageProps } from "../components/catalog-page.js"
export type {
  CatalogVerticalDetailBreadcrumb,
  CatalogVerticalDetailPageProps,
} from "../components/catalog-vertical-detail-page.js"
export type { CruiseDetailPageProps } from "../components/cruise-detail-page.js"
export type { DynamicCatalogPageProps } from "../components/dynamic-catalog-page.js"
export type {
  ProductBookSelection,
  ProductDetailPageProps,
} from "../components/product-detail-page.js"
export type {
  ScheduledCatalogPageProps,
  ScheduledScope,
} from "../components/scheduled-catalog-page.js"
export type {
  CatalogAdminScopeOptions,
  CatalogAdminScopeStrategy,
  CatalogVerticalHostProps,
} from "./catalog-vertical-host.js"
export type { CruiseDetailHostProps } from "./cruise-detail-host.js"
export type { DynamicCatalogHostProps } from "./dynamic-catalog-host.js"
export type { ProductDetailHostProps } from "./product-detail-host.js"
export type { ScheduledCatalogHostProps } from "./scheduled-catalog-host.js"
export type { VerticalDetailHostProps } from "./vertical-detail-host.js"

/**
 * Back-compatible search context carried onto product detail URLs. Generic
 * sourced product detail uses the content/slots routes; `adults`/`nights`
 * remain accepted so existing package-offer links keep validating.
 */
export const productDetailSearchSchema = z.object({
  adults: z.coerce.number().int().min(1).optional(),
  nights: z.coerce.number().int().min(1).optional(),
  locale: z.string().optional(),
})

export type ProductDetailSearchParams = z.infer<typeof productDetailSearchSchema>

export interface CreateCatalogAdminExtensionOptions {
  /** Mount path of the catalog surfaces inside the admin workspace. Default `/catalog`. */
  basePath?: string
  /**
   * Deployment-level locale fallback for the indexed admin catalog scope.
   * Defaults to the package fallback when omitted.
   */
  defaultLocale?: string
  /**
   * Deployment-level market/scope fallback for the indexed admin catalog
   * scope. Can be a commerce market id/code or a synthetic slice such as
   * `"default"`.
   */
  defaultMarket?: string
  /**
   * Default scope source. `"commerce-market"` preserves legacy behavior;
   * `"deployment-default"` uses `defaultLocale`/`defaultMarket` as the
   * browse fallback while still allowing URL-selected scope to override it.
   */
  scopeStrategy?: "commerce-market" | "deployment-default"
  /** Hide market/locale controls for fixed-scope deployments. */
  hideScopeControls?: boolean
  /** Localized surface labels. Defaults are the English operator nav labels. */
  labels?: {
    products?: string
    excursions?: string
    tours?: string
    boatTours?: string
    activities?: string
    attractions?: string
    events?: string
    transportation?: string
    cruises?: string
    accommodations?: string
  }
}

export interface CatalogAdminRoutePageProps extends AdminRoutePageProps {
  scopeOptions?: Pick<
    CreateCatalogAdminExtensionOptions,
    "defaultLocale" | "defaultMarket" | "hideScopeControls" | "scopeStrategy"
  >
}

function catalogAdminPage(
  loader: () => Promise<AdminRoutePageModule>,
  scopeOptions: CatalogAdminRoutePageProps["scopeOptions"],
): () => Promise<AdminRoutePageModule> {
  return async () => {
    const module = await loader()
    const Page = module.default as React.ComponentType<CatalogAdminRoutePageProps>

    function CatalogAdminRoutePage(props: AdminRoutePageProps) {
      return <Page {...props} scopeOptions={scopeOptions} />
    }

    CatalogAdminRoutePage.displayName = `CatalogAdminRoutePage(${Page.displayName ?? Page.name ?? "anonymous"})`
    return { default: CatalogAdminRoutePage }
  }
}

function scheduledCatalogAdminPage(
  scope: ScheduledScope,
  scopeOptions: CatalogAdminRoutePageProps["scopeOptions"],
): () => Promise<AdminRoutePageModule> {
  return async () => {
    const module = await import("./pages/catalog-scheduled-index-page.js")
    const Page = module.default as React.ComponentType<
      CatalogAdminRoutePageProps & { scope: ScheduledScope }
    >

    return {
      default: (props: AdminRoutePageProps) => (
        <Page {...props} scope={scope} scopeOptions={scopeOptions} />
      ),
    }
  }
}

function scheduledCatalogDetailPage(
  surface: CatalogDetailSurface,
  scopeOptions: CatalogAdminRoutePageProps["scopeOptions"],
): () => Promise<AdminRoutePageModule> {
  return async () => {
    const module = await import("./pages/catalog-scheduled-detail-page.js")
    const Page = module.default as React.ComponentType<
      CatalogAdminRoutePageProps & { surface: CatalogDetailSurface }
    >

    return {
      default: (props: AdminRoutePageProps) => (
        <Page {...props} surface={surface} scopeOptions={scopeOptions} />
      ),
    }
  }
}

/**
 * The catalog admin contribution (packaged-admin RFC Phase 2,
 * `@voyant-travel/<domain>-ui/admin` convention).
 *
 * NAVIGATION: the general-purpose factory remains neutral. The graph-selected
 * factory below adds the standard operator Catalog group.
 *
 * ROUTES: contributions carry the FULL route implementation (packaged-admin
 * RFC §4.8 endgame) — the package-owned search contracts
 * (`catalogSearchSchema` from `@voyant-travel/catalog-react` for the browse
 * surfaces, {@link productDetailSearchSchema} for the package detail page)
 * plus a lazy `page` module loader per route. Hosts assemble a code-based
 * route tree straight from these contributions (no per-route host files);
 * the host binder hands each page {@link AdminRoutePageProps}
 * (params/search/updateSearch/title), which the page modules under
 * `./pages/*` bind onto the `*Host` components exported from this entrypoint
 * ({@link CatalogVerticalHost}, {@link DynamicCatalogHost},
 * {@link ScheduledCatalogHost}, {@link ProductDetailHost},
 * {@link CruiseDetailHost}, {@link VerticalDetailHost}). The hosts own the
 * data wiring (catalog provider context, markets/suppliers/products hooks)
 * and resolve every cross-route link through the semantic destinations
 * declared above — no app RPC client, no host route tree.
 *
 * Every `page:` loader dynamically imports its SPECIFIC page module — never
 * this barrel — so each page stays code-split in its own chunk instead of
 * landing in the workspace-chrome chunk that evaluates this factory.
 */
export function createCatalogAdminExtension(
  options: CreateCatalogAdminExtensionOptions = {},
): AdminExtension {
  const {
    basePath = "/catalog",
    labels = {},
    defaultLocale,
    defaultMarket,
    hideScopeControls,
  } = options
  const scopeStrategy =
    options.scopeStrategy ?? (defaultLocale || defaultMarket ? "deployment-default" : undefined)
  const scopeOptions = { defaultLocale, defaultMarket, hideScopeControls, scopeStrategy }
  const {
    products = "Packages",
    excursions = "Excursions",
    tours = "Tours",
    boatTours = "Boat Tours",
    activities = "Activities",
    attractions = "Attractions",
    events = "Events",
    transportation = "Transportation",
    cruises = "Cruises",
    accommodations = "Accommodations",
  } = labels

  const browseSearch = (search: Record<string, unknown>) => catalogSearchSchema.parse(search)
  const productDetailSearch = (search: Record<string, unknown>) =>
    productDetailSearchSchema.parse(search)

  return defineAdminExtension({
    id: "catalog",
    routes: [
      {
        // Index redirect (formerly the host's `catalog/index.tsx` file
        // route): `/catalog` lands on the products surface.
        id: "catalog-index",
        path: basePath,
        title: products,
        redirectTo: `${basePath}/products`,
      },
      {
        id: "catalog-products-index",
        path: `${basePath}/products`,
        title: products,
        validateSearch: browseSearch,
        page: catalogAdminPage(
          () => import("./pages/catalog-products-index-page.js"),
          scopeOptions,
        ),
      },
      {
        id: "catalog-products-detail",
        path: `${basePath}/products/$productId`,
        title: products,
        validateSearch: productDetailSearch,
        page: catalogAdminPage(
          () => import("./pages/catalog-products-detail-page.js"),
          scopeOptions,
        ),
      },
      {
        id: "catalog-excursions-index",
        path: `${basePath}/excursions`,
        title: excursions,
        validateSearch: browseSearch,
        page: catalogAdminPage(
          () => import("./pages/catalog-excursions-index-page.js"),
          scopeOptions,
        ),
      },
      {
        id: "catalog-excursions-detail",
        path: `${basePath}/excursions/$id`,
        title: excursions,
        page: catalogAdminPage(
          () => import("./pages/catalog-excursions-detail-page.js"),
          scopeOptions,
        ),
      },
      {
        id: "catalog-tours-index",
        path: `${basePath}/tours`,
        title: tours,
        validateSearch: browseSearch,
        page: catalogAdminPage(() => import("./pages/catalog-tours-index-page.js"), scopeOptions),
      },
      {
        id: "catalog-tours-detail",
        path: `${basePath}/tours/$id`,
        title: tours,
        page: catalogAdminPage(() => import("./pages/catalog-tours-detail-page.js"), scopeOptions),
      },
      ...(
        [
          ["boat-tours", boatTours],
          ["activities", activities],
          ["attractions", attractions],
          ["events", events],
          ["transportation", transportation],
        ] as const
      ).flatMap(([scope, title]) => [
        {
          id: `catalog-${scope}-index`,
          path: `${basePath}/${scope}`,
          title,
          validateSearch: browseSearch,
          page: scheduledCatalogAdminPage(scope, scopeOptions),
        },
        {
          id: `catalog-${scope}-detail`,
          path: `${basePath}/${scope}/$id`,
          title,
          page: scheduledCatalogDetailPage(scope, scopeOptions),
        },
      ]),
      {
        id: "catalog-cruises-index",
        path: `${basePath}/cruises`,
        title: cruises,
        validateSearch: browseSearch,
        page: catalogAdminPage(() => import("./pages/catalog-cruises-index-page.js"), scopeOptions),
      },
      {
        id: "catalog-cruises-detail",
        path: `${basePath}/cruises/$id`,
        title: cruises,
        page: catalogAdminPage(
          () => import("./pages/catalog-cruises-detail-page.js"),
          scopeOptions,
        ),
      },
      {
        id: "catalog-accommodations-index",
        path: `${basePath}/accommodations`,
        title: accommodations,
        validateSearch: browseSearch,
        page: catalogAdminPage(
          () => import("./pages/catalog-accommodations-index-page.js"),
          scopeOptions,
        ),
      },
      {
        id: "catalog-accommodations-detail",
        path: `${basePath}/accommodations/$id`,
        title: accommodations,
        page: catalogAdminPage(
          () => import("./pages/catalog-accommodations-detail-page.js"),
          scopeOptions,
        ),
      },
    ],
  })
}

export const standardCatalogAdminScope = {
  defaultLocale: "en-GB",
  defaultMarket: "default",
  scopeStrategy: "deployment-default",
  hideScopeControls: true,
} as const

export function createSelectedCatalogAdminExtension({
  navMessages,
}: SelectedAdminExtensionFactoryContext): AdminExtension {
  const labels = {
    catalog: navMessages.catalog ?? "Catalog",
    products: navMessages.catalogProducts ?? "Products",
    excursions: navMessages.catalogExcursions ?? "Excursions",
    tours: navMessages.catalogTours ?? "Tours",
    boatTours: navMessages.catalogBoatTours ?? "Boat Tours",
    activities: navMessages.catalogActivities ?? "Activities",
    attractions: navMessages.catalogAttractions ?? "Attractions",
    events: navMessages.catalogEvents ?? "Events",
    transportation: navMessages.catalogTransportation ?? "Transportation",
    cruises: navMessages.catalogCruises ?? "Cruises",
    accommodations: navMessages.catalogAccommodations ?? "Accommodations",
  }
  const extension = withAdminRouteMessagesProvider(
    createCatalogAdminExtension({
      ...standardCatalogAdminScope,
      labels,
    }),
    () =>
      import("../i18n/index.js").then((module) => ({ default: module.CatalogUiMessagesProvider })),
  )

  return {
    ...extension,
    navigation: [
      {
        order: -140,
        items: [
          {
            id: "catalog",
            title: labels.catalog,
            url: "/catalog/products",
            icon: Library,
            items: [
              {
                id: "catalog-products",
                title: labels.products,
                url: "/catalog/products",
              },
              { id: "catalog-tours", title: labels.tours, url: "/catalog/tours" },
              {
                id: "catalog-boat-tours",
                title: labels.boatTours,
                url: "/catalog/boat-tours",
              },
              {
                id: "catalog-activities",
                title: labels.activities,
                url: "/catalog/activities",
              },
              {
                id: "catalog-attractions",
                title: labels.attractions,
                url: "/catalog/attractions",
              },
              { id: "catalog-events", title: labels.events, url: "/catalog/events" },
              {
                id: "catalog-transportation",
                title: labels.transportation,
                url: "/catalog/transportation",
              },
              { id: "catalog-cruises", title: labels.cruises, url: "/catalog/cruises" },
              {
                id: "catalog-accommodations",
                title: labels.accommodations,
                url: "/catalog/accommodations",
              },
            ],
          },
        ],
      },
    ],
  }
}
