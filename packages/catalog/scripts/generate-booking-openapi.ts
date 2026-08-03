import { writeFile } from "node:fs/promises"

import { OpenAPIHono } from "@hono/zod-openapi"
import {
  generateOpenApiDocument,
  type OpenApiDocument,
  selectSurface,
} from "@voyant-travel/hono/openapi"

import { mountCatalogBookingRoutes } from "../src/booking-engine/operator-routes.js"

const options = {
  info: {
    title: "Voyant Catalog Booking API",
    version: "1.0.0",
    description: "Generated from the Booking Platform v1 route modules. Do not edit by hand.",
  },
  servers: [{ url: "/", description: "This deployment (same origin)" }],
}

const app = new OpenAPIHono()
mountCatalogBookingRoutes(app, {
  resolveDb: () => null as never,
  bookingSessions: {
    resolveModule: () => null as never,
    resolveSupplierOperations: () => null as never,
  },
  resolveRegistry: () => null as never,
  getProductContent: async () => null,
  listAvailabilitySlots: async () => [],
  getOwnedProductById: async () => null,
})

const complete = generateOpenApiDocument(app, options)

async function writeDocument(path: string, document: OpenApiDocument) {
  await writeFile(new URL(path, import.meta.url), `${JSON.stringify(document, null, 2)}\n`)
}

await Promise.all([
  writeDocument("../openapi/admin/catalog-booking.json", selectSurface(complete, "admin")),
  writeDocument(
    "../openapi/storefront/catalog-booking.json",
    selectSurface(complete, "storefront"),
  ),
])
