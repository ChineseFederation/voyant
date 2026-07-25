import {
  type AdminExtension,
  type AdminRouteLoaderContext,
  type AdminRoutePageProps,
  type AdminRouteRuntime,
  type AdminSetupStepActionProps,
  adminRoutePageModule,
  defineAdminExtension,
  type SelectedAdminExtensionFactoryContext,
  useAdminHref,
  withAdminRouteMessagesProvider,
} from "@voyant-travel/admin"
import type {} from "@voyant-travel/catalog-react/admin"
import { buttonVariants } from "@voyant-travel/ui/components"
import { ExternalLink, Package } from "lucide-react"

// Lean statics only: the client module (fetcher) and the skeletons (their
// own modules, no page imports). Query options + the REST api adapter
// resolve via dynamic import inside the loaders so the products data layer
// (client + response schemas) stays out of the workspace-chrome chunk that
// evaluates this factory.
import { defaultFetcher } from "../client.js"
import { ProductDetailSkeleton } from "../components/product-detail/product-detail-skeleton.js"
import { inventoryFirstProductSetupMessageDefinitions } from "../i18n/setup.js"
import { ProductsListSkeleton } from "./products-list-skeleton.js"

/**
 * Semantic destinations the products admin surfaces navigate to
 * (packaged-admin RFC §4.7). The products list opens the owned-product
 * editor, and the editor links back to the list and into the availability
 * slot pages — instead of importing a
 * host route tree they resolve these keys through `useAdminHref`/
 * `useAdminNavigate` from `@voyant-travel/admin`. Hosts register one resolver
 * per key (`satisfies AdminDestinationResolvers`).
 *
 * `product.detail` is also declared by `@voyant-travel/bookings-react/admin` and
 * `@voyant-travel/catalog-react/admin`; `availabilitySlot.detail` by
 * `@voyant-travel/operations-react/availability/admin` and others — interface merging
 * requires the member shapes to stay identical across packages.
 */
declare module "@voyant-travel/admin" {
  interface AdminDestinations {
    /** The owned-products list page. */
    "product.list": Record<string, never>
    /** The owned-product editor/detail page. */
    "product.detail": { productId: string }
    /** The product categories settings page. */
    "productCategory.list": Record<string, never>
    /** An availability slot's detail page. */
    "availabilitySlot.detail": { slotId: string }
  }
}

export type { ProductDetailPageComponentProps } from "./pages/product-detail-page.js"
// Packaged admin hosts (packaged-admin RFC Phase 3): the products pages
// bound to their data wiring + semantic-destination navigation.
//
// Endgame rule (packaged-admin RFC §4.8): this barrel re-exports NO page
// or host component values — it is evaluated with the workspace chrome, so
// a static host re-export would pin the heavy page modules into the entry
// chunk. Hosts import from their specific modules; only their TYPES
// re-export here, plus the lean skeletons.
export type { ProductDetailApiClient } from "./product-detail-api.js"
export { ProductsListSkeleton } from "./products-list-skeleton.js"
export {
  type ProductDetailOptionExtrasSlotContext,
  productDetailOptionExtrasSlot,
} from "./slots.js"
export { ProductDetailSkeleton }

export interface CreateInventoryAdminExtensionOptions {
  /** Mount path of the products pages inside the admin workspace. Default `/products`. */
  basePath?: string
  /** Localized page titles. Defaults are the English operator nav labels. */
  labels?: {
    products?: string
    categories?: string
  }
}

/**
 * The products admin contribution (packaged-admin RFC Phase 3,
 * `@voyant-travel/<domain>-react/admin` convention).
 *
 * NAVIGATION: the general-purpose factory remains neutral. The graph-selected
 * factory below adds the standard operator Products group.
 *
 * ROUTES: contributions carry the FULL route implementation (packaged-admin
 * RFC §4.2/§4.8) — lazy `page` module loaders, data loaders fed by the
 * host-supplied {@link AdminRouteLoaderContext} (QueryClient + runtime +
 * params), per-route SSR mode, and pending skeletons. Hosts bind them into
 * their code-assembled admin route tree; no per-route host files needed.
 * The pages stay code-split because each contribution's `page` dynamically
 * imports the specific host/page module — never the admin barrel — so the
 * heavy page chunks load on navigation, not with workspace chrome.
 * `ProductsHost` and `ProductCategoriesHost` mount as zero-prop pages; the
 * detail page reads the product id from {@link AdminRoutePageProps} via the
 * page thunk below. The pages keep their filter/dialog state local (no URL
 * search contracts) and resolve every cross-route link through the semantic
 * destinations declared above — no app RPC client, no host route tree.
 *
 * WIDGETS: none contributed and no slots exposed yet.
 */
export function createInventoryAdminExtension(
  options: CreateInventoryAdminExtensionOptions = {},
): AdminExtension {
  const { basePath = "/products", labels = {} } = options
  const { products = "Products", categories = "Categories" } = labels

  return defineAdminExtension({
    id: "inventory",
    routes: [
      {
        id: "products-index",
        path: basePath,
        title: products,
        // Route-backed destination (RFC §4.7 endgame): the key resolves by
        // pure path interpolation of this route, so the host's resolver is
        // generated (`voyant admin generate --destinations`).
        destination: "product.list",
        ssr: "data-only",
        page: () =>
          import("./products-host.js").then((module) => adminRoutePageModule(module.ProductsHost)),
        // Dynamic import on purpose: the query options pull the products
        // data layer (client + response schemas), and a static import here
        // would pin it into the workspace-chrome chunk that evaluates this
        // factory.
        loader: async ({ queryClient, runtime }: AdminRouteLoaderContext) => {
          const { getProductsQueryOptions } = await import("../query-options.js")
          return queryClient.ensureQueryData(
            getProductsQueryOptions(loaderClient(runtime), { limit: 25, offset: 0 }),
          )
        },
        pendingComponent: ProductsListSkeleton,
      },
      {
        id: "products-categories",
        path: `${basePath}/categories`,
        title: categories,
        destination: "productCategory.list",
        ssr: "data-only",
        page: () =>
          import("./product-categories-host.js").then((module) =>
            adminRoutePageModule(module.ProductCategoriesHost),
          ),
        // Dynamic import on purpose — see the products index loader above.
        loader: async ({ queryClient, runtime }: AdminRouteLoaderContext) => {
          const { getProductCategoriesQueryOptions } = await import("../query-options.js")
          return queryClient.ensureQueryData(
            getProductCategoriesQueryOptions(loaderClient(runtime), { limit: 25, offset: 0 }),
          )
        },
      },
      {
        id: "products-detail",
        path: `${basePath}/$id`,
        title: products,
        destination: "product.detail",
        destinationParams: { id: "productId" },
        ssr: "data-only",
        pendingComponent: ProductDetailSkeleton,
        // Critical path only: await the product itself so the header has
        // data and the loader unblocks after one round-trip. Everything
        // else is a background prefetch — the page's `useQuery` calls light
        // up as data arrives. Dynamic imports on purpose — see the products
        // index loader above.
        loader: async ({ queryClient, runtime, params }: AdminRouteLoaderContext) => {
          const id = params.id
          if (!id) return
          const [
            { getProductQueryOptions },
            {
              getChannelsQueryOptions,
              getProductChannelMappingsQueryOptions,
              getProductDetailMediaQueryOptions,
              getProductRulesQueryOptions,
              getProductSlotsQueryOptions,
            },
            {
              getProductDetailPricingCategoriesQueryOptions,
              getProductDetailProductOptionsQueryOptions,
            },
            { createProductDetailRestApi },
          ] = await Promise.all([
            import("../query-options.js"),
            import("../components/product-detail/product-detail-shared.js"),
            import("../components/product-detail/product-options-shared.js"),
            import("./product-detail-api.js"),
          ])

          const client = loaderClient(runtime)
          const api = createProductDetailRestApi(client)

          await queryClient.ensureQueryData(getProductQueryOptions(client, id))

          void queryClient.prefetchQuery(getProductDetailProductOptionsQueryOptions(client, id))
          void queryClient.prefetchQuery(getProductSlotsQueryOptions(api, id))
          void queryClient.prefetchQuery(getProductRulesQueryOptions(api, id))
          void queryClient.prefetchQuery(getChannelsQueryOptions(api))
          void queryClient.prefetchQuery(getProductChannelMappingsQueryOptions(api, id))
          void queryClient.prefetchQuery(getProductDetailMediaQueryOptions(api, id))
          void queryClient.prefetchQuery(getProductDetailPricingCategoriesQueryOptions(api))
        },
        page: async () => {
          const module = await import("./pages/product-detail-page.js")
          const Page = module.default
          return {
            default: ({ params }: AdminRoutePageProps) => <Page id={params.id ?? ""} />,
          }
        },
      },
    ],
  })
}

export function createSelectedInventoryAdminExtension({
  navMessages,
}: SelectedAdminExtensionFactoryContext): AdminExtension {
  const labels = {
    products: navMessages.products ?? "Products",
    categories: navMessages.categories ?? "Categories",
  }
  const extension = withAdminRouteMessagesProvider(createInventoryAdminExtension({ labels }), () =>
    import("../i18n.js").then((module) => ({ default: module.ProductsUiMessagesProvider })),
  )

  return {
    ...extension,
    setupSteps: [
      {
        id: "@voyant-travel/inventory#setup.first-product",
        order: 70,
        skippable: true,
        actionComponent: FirstProductSetupAction,
        messages: inventoryFirstProductSetupMessageDefinitions,
        isComplete: hasInventoryProduct,
      },
    ],
    navigation: [
      {
        order: -120,
        items: [
          {
            id: "products",
            title: labels.products,
            url: "/products",
            icon: Package,
            items: [
              {
                id: "product-categories",
                title: labels.categories,
                url: "/products/categories",
              },
            ],
          },
        ],
      },
    ],
  }
}

function FirstProductSetupAction({ label }: AdminSetupStepActionProps) {
  const resolveHref = useAdminHref()
  const href = resolveHref("product.list", {})
  return (
    <a href={href} className={buttonVariants()}>
      {label}
      <ExternalLink className="size-4" />
    </a>
  )
}

async function hasInventoryProduct({ runtime }: AdminRouteLoaderContext): Promise<boolean> {
  const response = await (runtime.fetcher ?? fetch)(
    `${runtime.baseUrl}/v1/admin/products/aggregates`,
  )
  if (!response.ok) return false
  return (((await response.json()) as { data?: { total?: number } }).data?.total ?? 0) > 0
}

/**
 * Bridge the host-supplied {@link AdminRouteRuntime} (optional fetcher) to
 * the required-fetcher client contract the products query options take —
 * SSR loaders run with the host runtime's cookie-forwarding fetcher.
 */
function loaderClient(runtime: AdminRouteRuntime) {
  return { baseUrl: runtime.baseUrl, fetcher: runtime.fetcher ?? defaultFetcher }
}
