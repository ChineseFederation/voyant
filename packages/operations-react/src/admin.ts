import {
  type AdminExtension,
  type AdminRouteLoaderContext,
  type AdminRouteRuntime,
  type AdminWidgetContribution,
  adminRoutePageModule,
  composeAdminRouteMessagesProviders,
  defineAdminExtension,
  type SelectedAdminExtensionFactoryContext,
  withAdminRouteMessagesProvider,
} from "@voyant-travel/admin"
import type {} from "@voyant-travel/bookings-react/admin"
import {
  type ProductDetailOptionExtrasSlotContext,
  productDetailOptionExtrasSlot,
} from "@voyant-travel/inventory-react/admin"
import { CalendarDays, Wrench } from "lucide-react"
import { createElement, lazy, Suspense } from "react"

import { defaultFetcher as availabilityDefaultFetcher } from "./availability/client.js"
import {
  AvailabilityPageSkeleton,
  AvailabilityRuleDetailSkeleton,
  AvailabilitySlotDetailSkeleton,
  AvailabilityStartTimeDetailSkeleton,
} from "./availability/components/availability-skeletons.js"
import { ResourcesPageSkeleton } from "./resources/admin/resources-page-skeleton.js"
import { defaultFetcher as resourcesDefaultFetcher } from "./resources/client.js"
import {
  ResourceAllocationDetailSkeleton,
  ResourceAssignmentDetailSkeleton,
  ResourceDetailSkeleton,
  ResourcePoolDetailSkeleton,
} from "./resources/components/resource-detail-skeletons.js"

export {
  type CreateAvailabilityAdminExtensionOptions,
  createAvailabilityAdminExtension,
} from "./availability/admin/index.js"
export {
  type CreateResourcesAdminExtensionOptions,
  createResourcesAdminExtension,
} from "./resources/admin/index.js"

const LazyOptionResourceTemplatesPanel = lazy(() =>
  import("./availability/admin/option-resource-templates-panel.js").then((module) => ({
    default: module.OptionResourceTemplatesPanel,
  })),
)

function ProductOptionResourceTemplates(props: ProductDetailOptionExtrasSlotContext) {
  return createElement(
    Suspense,
    { fallback: null },
    createElement(LazyOptionResourceTemplatesPanel, props),
  )
}

declare module "@voyant-travel/admin" {
  interface AdminDestinations {
    /** The availability landing page (slots list + calendar). */
    "availabilitySlot.list": Record<string, never>
    /** An availability start time's detail page. */
    "availabilityStartTime.detail": { startTimeId: string }
    /** The resources tab dashboard. */
    "resource.list": Record<string, never>
    /** A resource's detail page. */
    "resource.detail": { resourceId: string }
    /** A resource pool's detail page. */
    "resourcePool.detail": { poolId: string }
    /** A resource allocation's detail page. */
    "resourceAllocation.detail": { allocationId: string }
    /** A slot assignment's detail page. */
    "resourceAssignment.detail": { assignmentId: string }
    /** A supplier's detail page. */
    "supplier.detail": { supplierId: string }
    /** A product's detail page. */
    "product.detail": { productId: string }
    /** An availability slot's detail page. */
    "availabilitySlot.detail": { slotId: string }
    /** Finance's departure profitability report (bound by finance-react). */
    "financeProfitability.report": Record<string, never>
  }
}

export interface CreateOperationsAdminExtensionOptions {
  labels?: {
    availability?: string
    resources?: string
  }
  availability?: {
    /** Mount path of the availability pages inside the admin workspace. */
    basePath?: string
  }
  resources?: {
    /** Mount path of the resources pages inside the admin workspace. */
    basePath?: string
  }
}

export function createOperationsAdminExtension(
  options: CreateOperationsAdminExtensionOptions = {},
): AdminExtension {
  const { basePath: availabilityBasePath = "/operations/availability" } = options.availability ?? {}
  const { basePath: resourcesBasePath = "/operations/resources" } = options.resources ?? {}
  const availability = options.labels?.availability ?? "Availability"
  const resources = options.labels?.resources ?? "Resources"

  return defineAdminExtension({
    id: "operations",
    routes: [
      {
        id: "availability-index",
        path: availabilityBasePath,
        title: availability,
        destination: "availabilitySlot.list",
        ssr: "data-only",
        page: () =>
          import("./availability/admin/availability-index-host.js").then((module) =>
            adminRoutePageModule(module.AvailabilityIndexHost),
          ),
        loader: async ({ queryClient, runtime }: AdminRouteLoaderContext) => {
          const { ensureAvailabilityPageData } = await import(
            "./availability/admin/availability-page-data.js"
          )
          return ensureAvailabilityPageData(queryClient, availabilityLoaderClient(runtime))
        },
        pendingComponent: AvailabilityPageSkeleton,
      },
      {
        id: "availability-slot-detail",
        path: `${availabilityBasePath}/$id`,
        title: availability,
        destination: "availabilitySlot.detail",
        destinationParams: { id: "slotId" },
        page: () => import("./availability/admin/pages/availability-slot-detail-page.js"),
        loader: async ({ queryClient, runtime, params }: AdminRouteLoaderContext) => {
          const id = params.id
          if (!id) return
          const { loadAvailabilitySlotDetailPage } = await import(
            "./availability/components/availability-slot-detail-page.js"
          )
          return loadAvailabilitySlotDetailPage(queryClient, availabilityLoaderClient(runtime), id)
        },
        pendingComponent: AvailabilitySlotDetailSkeleton,
      },
      {
        id: "availability-rule-detail",
        path: `${availabilityBasePath}/rules/$id`,
        title: availability,
        page: () => import("./availability/admin/pages/availability-rule-detail-page.js"),
        loader: async ({ queryClient, runtime, params }: AdminRouteLoaderContext) => {
          const id = params.id
          if (!id) return
          const { loadAvailabilityRuleDetailPage } = await import(
            "./availability/components/availability-rule-detail-page.js"
          )
          return loadAvailabilityRuleDetailPage(queryClient, availabilityLoaderClient(runtime), id)
        },
        pendingComponent: AvailabilityRuleDetailSkeleton,
      },
      {
        id: "availability-start-time-detail",
        path: `${availabilityBasePath}/start-times/$id`,
        title: availability,
        destination: "availabilityStartTime.detail",
        destinationParams: { id: "startTimeId" },
        page: () => import("./availability/admin/pages/availability-start-time-detail-page.js"),
        loader: async ({ queryClient, runtime, params }: AdminRouteLoaderContext) => {
          const id = params.id
          if (!id) return
          const { loadAvailabilityStartTimeDetailPage } = await import(
            "./availability/components/availability-start-time-detail-page.js"
          )
          return loadAvailabilityStartTimeDetailPage(
            queryClient,
            availabilityLoaderClient(runtime),
            id,
          )
        },
        pendingComponent: AvailabilityStartTimeDetailSkeleton,
      },
      {
        id: "resources-index",
        path: resourcesBasePath,
        title: resources,
        destination: "resource.list",
        ssr: "data-only",
        page: () =>
          import("./resources/admin/resources-host.js").then((module) =>
            adminRoutePageModule(module.ResourcesHost),
          ),
        loader: async ({ queryClient, runtime }: AdminRouteLoaderContext) => {
          const { ensureResourcesPageData } = await import(
            "./resources/admin/resources-page-data.js"
          )
          return ensureResourcesPageData(queryClient, resourcesLoaderClient(runtime))
        },
        pendingComponent: ResourcesPageSkeleton,
      },
      {
        id: "resources-detail",
        path: `${resourcesBasePath}/$id`,
        title: resources,
        destination: "resource.detail",
        destinationParams: { id: "resourceId" },
        ssr: "data-only",
        page: () => import("./resources/admin/pages/resource-detail-page.js"),
        loader: async ({ queryClient, runtime, params }: AdminRouteLoaderContext) => {
          const id = params.id
          if (!id) return
          const { ensureResourceDetailPageData } = await import(
            "./resources/components/resource-detail-data.js"
          )
          return ensureResourceDetailPageData(queryClient, resourcesLoaderClient(runtime), id)
        },
        pendingComponent: ResourceDetailSkeleton,
      },
      {
        id: "resources-pool-detail",
        path: `${resourcesBasePath}/pools/$id`,
        title: resources,
        destination: "resourcePool.detail",
        destinationParams: { id: "poolId" },
        ssr: "data-only",
        page: () => import("./resources/admin/pages/resource-pool-detail-page.js"),
        loader: async ({ queryClient, runtime, params }: AdminRouteLoaderContext) => {
          const id = params.id
          if (!id) return
          const { ensureResourcePoolDetailPageData } = await import(
            "./resources/components/resource-detail-data.js"
          )
          return ensureResourcePoolDetailPageData(queryClient, resourcesLoaderClient(runtime), id)
        },
        pendingComponent: ResourcePoolDetailSkeleton,
      },
      {
        id: "resources-assignment-detail",
        path: `${resourcesBasePath}/assignments/$id`,
        title: resources,
        destination: "resourceAssignment.detail",
        destinationParams: { id: "assignmentId" },
        ssr: "data-only",
        page: () => import("./resources/admin/pages/resource-assignment-detail-page.js"),
        loader: async ({ queryClient, runtime, params }: AdminRouteLoaderContext) => {
          const id = params.id
          if (!id) return
          const { ensureResourceAssignmentDetailPageData } = await import(
            "./resources/components/resource-detail-data.js"
          )
          return ensureResourceAssignmentDetailPageData(
            queryClient,
            resourcesLoaderClient(runtime),
            id,
          )
        },
        pendingComponent: ResourceAssignmentDetailSkeleton,
      },
      {
        id: "resources-allocation-detail",
        path: `${resourcesBasePath}/allocations/$id`,
        title: resources,
        destination: "resourceAllocation.detail",
        destinationParams: { id: "allocationId" },
        ssr: "data-only",
        page: () => import("./resources/admin/pages/resource-allocation-detail-page.js"),
        loader: async ({ queryClient, runtime, params }: AdminRouteLoaderContext) => {
          const id = params.id
          if (!id) return
          const { ensureResourceAllocationDetailPageData } = await import(
            "./resources/components/resource-detail-data.js"
          )
          return ensureResourceAllocationDetailPageData(
            queryClient,
            resourcesLoaderClient(runtime),
            id,
          )
        },
        pendingComponent: ResourceAllocationDetailSkeleton,
      },
    ],
    widgets: [
      {
        id: "operations-product-option-resource-templates",
        slot: productDetailOptionExtrasSlot,
        component: ProductOptionResourceTemplates,
      } satisfies AdminWidgetContribution<ProductDetailOptionExtrasSlotContext>,
    ],
  })
}

function availabilityLoaderClient(runtime: AdminRouteRuntime) {
  return { baseUrl: runtime.baseUrl, fetcher: runtime.fetcher ?? availabilityDefaultFetcher }
}

function resourcesLoaderClient(runtime: AdminRouteRuntime) {
  return { baseUrl: runtime.baseUrl, fetcher: runtime.fetcher ?? resourcesDefaultFetcher }
}

const operationsRouteMessagesProvider = composeAdminRouteMessagesProviders(
  () =>
    import("./availability/i18n/index.js").then((module) => ({
      default: module.AvailabilityUiMessagesProvider,
    })),
  () =>
    import("./availability/allocation/i18n/index.js").then((module) => ({
      default: module.AllocationUiMessagesProvider,
    })),
  () =>
    import("./resources/i18n/index.js").then((module) => ({
      default: module.ResourcesUiMessagesProvider,
    })),
)

export function createSelectedOperationsAdminExtension({
  navMessages,
}: SelectedAdminExtensionFactoryContext): AdminExtension {
  const labels = {
    availability: navMessages.availability ?? "Availability",
    resources: navMessages.resources ?? "Resources",
  }
  const extension = withAdminRouteMessagesProvider(
    createOperationsAdminExtension({ labels }),
    operationsRouteMessagesProvider,
  )

  return {
    ...extension,
    navigation: [
      {
        order: -110,
        items: [
          {
            id: "availability",
            title: labels.availability,
            url: "/operations/availability",
            icon: CalendarDays,
          },
        ],
      },
      {
        order: -60,
        items: [
          {
            id: "resources",
            title: labels.resources,
            url: "/operations/resources",
            icon: Wrench,
          },
        ],
      },
    ],
  }
}
