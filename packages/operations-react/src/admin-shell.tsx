import {
  type AdminShellExtension,
  type AdminShellRouteContribution,
  type AdminWidgetContribution,
  composeAdminRouteMessagesProviders,
  type SelectedAdminExtensionFactoryContext,
} from "@voyant-travel/admin"
import {
  type ProductDetailOptionExtrasSlotContext,
  productDetailOptionExtrasSlot,
} from "@voyant-travel/inventory-react/admin"
import { CalendarDays, Wrench } from "lucide-react"
import { createElement, lazy, Suspense } from "react"

import type {} from "./admin.js"

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

/** Import-cheap Operations chrome and route contracts. */
export function createSelectedOperationsAdminShellExtension({
  navMessages,
}: SelectedAdminExtensionFactoryContext): AdminShellExtension {
  const availability = navMessages.availability ?? "Availability"
  const resources = navMessages.resources ?? "Resources"
  const route = (
    id: string,
    path: string,
    title: string,
    extra: Partial<AdminShellRouteContribution> = {},
  ): AdminShellRouteContribution => ({
    id,
    path,
    title,
    routeMessagesProvider: operationsRouteMessagesProvider,
    ...extra,
  })

  return {
    id: "operations",
    navigation: [
      {
        order: -110,
        items: [
          {
            id: "availability",
            title: availability,
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
            title: resources,
            url: "/operations/resources",
            icon: Wrench,
          },
        ],
      },
    ],
    routes: [
      route("availability-index", "/operations/availability", availability, {
        destination: "availabilitySlot.list",
        ssr: "data-only",
      }),
      route("availability-slot-detail", "/operations/availability/$id", availability, {
        destination: "availabilitySlot.detail",
        destinationParams: { id: "slotId" },
      }),
      route("availability-rule-detail", "/operations/availability/rules/$id", availability),
      route(
        "availability-start-time-detail",
        "/operations/availability/start-times/$id",
        availability,
        {
          destination: "availabilityStartTime.detail",
          destinationParams: { id: "startTimeId" },
        },
      ),
      route("resources-index", "/operations/resources", resources, {
        destination: "resource.list",
        ssr: "data-only",
      }),
      route("resources-detail", "/operations/resources/$id", resources, {
        destination: "resource.detail",
        destinationParams: { id: "resourceId" },
        ssr: "data-only",
      }),
      route("resources-pool-detail", "/operations/resources/pools/$id", resources, {
        destination: "resourcePool.detail",
        destinationParams: { id: "poolId" },
        ssr: "data-only",
      }),
      route("resources-assignment-detail", "/operations/resources/assignments/$id", resources, {
        destination: "resourceAssignment.detail",
        destinationParams: { id: "assignmentId" },
        ssr: "data-only",
      }),
      route("resources-allocation-detail", "/operations/resources/allocations/$id", resources, {
        destination: "resourceAllocation.detail",
        destinationParams: { id: "allocationId" },
        ssr: "data-only",
      }),
    ],
    widgets: [
      {
        id: "operations-product-option-resource-templates",
        slot: productDetailOptionExtrasSlot,
        component: ProductOptionResourceTemplates,
      } satisfies AdminWidgetContribution<ProductDetailOptionExtrasSlotContext>,
    ],
  }
}
