import { defineToolContextContribution, requireService, ToolError } from "@voyant-travel/tools"
import type { Context } from "hono"

import {
  type CatalogSearchRuntimeOptions,
  catalogBookingRuntimePort,
  catalogSearchRuntimePort,
} from "./api-runtime-ports.js"
import { createCatalogBookingToolServices } from "./booking-tool-services.js"
import { executeSemanticSearch } from "./search/semantic.js"
import type { CatalogToolServices } from "./tools.js"

export * from "./tools.js"

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["catalog", "catalogBooking"],
  async contribute({ request, resources }) {
    const provider = await Promise.resolve(
      requireService(
        resources[catalogSearchRuntimePort.id] as
          | CatalogSearchRuntimeOptions
          | Promise<CatalogSearchRuntimeOptions>
          | undefined,
        catalogSearchRuntimePort.id,
      ),
    )
    catalogSearchRuntimePort.test(provider)
    const runtime = provider.resolveRuntime(request as Context)
    const catalog: CatalogToolServices = {
      async search({ slice, request }) {
        const indexer = runtime.indexer
        if (!indexer) {
          throw new ToolError(
            "Catalog search indexer is not configured for this deployment.",
            "PROVIDER_ERROR",
          )
        }
        if (request.mode === "keyword") return indexer.search(slice, request)
        try {
          return await executeSemanticSearch({
            adapter: indexer,
            embeddings: runtime.embeddings as Parameters<
              typeof executeSemanticSearch
            >[0]["embeddings"],
            slice,
            request,
          })
        } catch {
          return indexer.search(slice, {
            ...request,
            mode: "keyword",
            query_embedding: undefined,
            query_embedding_model_id: undefined,
          })
        }
      },
      async getEntry() {
        return null
      },
    }
    const bookingResource = resources[catalogBookingRuntimePort.id] as
      | import("./booking-engine/operator-routes.js").CatalogBookingRouteModuleOptions
      | Promise<import("./booking-engine/operator-routes.js").CatalogBookingRouteModuleOptions>
      | undefined
    if (!bookingResource) return { catalog }
    const bookingProvider = await Promise.resolve(bookingResource)
    catalogBookingRuntimePort.test(bookingProvider)
    return {
      catalog,
      catalogBooking: createCatalogBookingToolServices(bookingProvider, request as Context),
    }
  },
})
