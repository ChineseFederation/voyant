import type { Module } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import { stampOpenApiRegistryApiId } from "@voyant-travel/hono"
import type { ApiModule } from "@voyant-travel/hono/module"
import { storefrontCustomerPortalRuntimePort } from "../runtime-port.js"

import {
  buildPublicCustomerPortalRouteRuntime,
  CUSTOMER_PORTAL_ROUTE_RUNTIME_CONTAINER_KEY,
} from "./route-runtime.js"
import {
  createPublicCustomerPortalRoutes,
  type PublicCustomerPortalRouteOptions,
} from "./routes-public.js"

export type { CustomerPortalRoutes } from "./routes.js"
export { customerPortalRoutes } from "./routes.js"
export type { PublicCustomerPortalRoutes } from "./routes-public.js"
export { createPublicCustomerPortalRoutes, publicCustomerPortalRoutes } from "./routes-public.js"
export { publicCustomerPortalService } from "./service-public.js"
export type {
  BootstrapCustomerPortalInput,
  BootstrapCustomerPortalResult,
  CreateCustomerPortalCompanionInput,
  CreateCustomerPortalProfileDocumentInput,
  CustomerPortalAddress,
  CustomerPortalBookingBillingContact,
  CustomerPortalBookingDetail,
  CustomerPortalBookingDocument,
  CustomerPortalBookingFinancialDocument,
  CustomerPortalBookingFinancials,
  CustomerPortalBookingPayment,
  CustomerPortalBookingSummary,
  CustomerPortalBootstrapCandidate,
  CustomerPortalCompanion,
  CustomerPortalProfile,
  CustomerPortalProfileDocument,
  ImportCustomerPortalBookingParticipantsInput,
  ImportCustomerPortalBookingParticipantsResult,
  ImportCustomerPortalBookingTravelersInput,
  ImportCustomerPortalBookingTravelersResult,
  UpdateCustomerPortalAddressInput,
  UpdateCustomerPortalCompanionInput,
  UpdateCustomerPortalProfileDocumentInput,
  UpdateCustomerPortalProfileInput,
} from "./validation-public.js"
export {
  bootstrapCustomerPortalResultSchema,
  bootstrapCustomerPortalSchema,
  createCustomerPortalCompanionSchema,
  createCustomerPortalProfileDocumentSchema,
  customerPortalAddressSchema,
  customerPortalBookingBillingContactSchema,
  customerPortalBookingDetailSchema,
  customerPortalBookingDocumentSchema,
  customerPortalBookingFinancialDocumentSchema,
  customerPortalBookingFinancialsSchema,
  customerPortalBookingPaymentSchema,
  customerPortalBookingSummarySchema,
  customerPortalBootstrapCandidateSchema,
  customerPortalCompanionSchema,
  customerPortalProfileDocumentSchema,
  customerPortalProfileSchema,
  importCustomerPortalBookingParticipantsResultSchema,
  importCustomerPortalBookingParticipantsSchema,
  importCustomerPortalBookingTravelersResultSchema,
  importCustomerPortalBookingTravelersSchema,
  updateCustomerPortalAddressSchema,
  updateCustomerPortalCompanionSchema,
  updateCustomerPortalProfileDocumentSchema,
  updateCustomerPortalProfileSchema,
} from "./validation-public.js"

export const customerPortalModule: Module = {
  name: "customer-portal",
}

export function createCustomerPortalApiModule(
  options: PublicCustomerPortalRouteOptions = {},
): ApiModule {
  const module: Module = {
    ...customerPortalModule,
    bootstrap: ({ bindings, container }) => {
      container.register(
        CUSTOMER_PORTAL_ROUTE_RUNTIME_CONTAINER_KEY,
        buildPublicCustomerPortalRouteRuntime(bindings as Record<string, unknown>, options),
      )
    },
  }

  return {
    module,
    publicRoutes: stampOpenApiRegistryApiId(
      createPublicCustomerPortalRoutes(options),
      "@voyant-travel/storefront#customer-portal.api",
    ),
  }
}

export const customerPortalApiModule: ApiModule = createCustomerPortalApiModule()

export const createCustomerPortalVoyantRuntime = defineGraphRuntimeFactory(async ({ getPort }) => {
  return createCustomerPortalApiModule(await getPort(storefrontCustomerPortalRuntimePort))
})

export type {
  CustomerPortalRouteRuntime,
  PublicCustomerPortalRouteRuntime,
  PublicCustomerPortalRuntimeOptions,
} from "./route-runtime.js"
export {
  buildCustomerPortalRouteRuntime,
  buildPublicCustomerPortalRouteRuntime,
  CUSTOMER_PORTAL_ROUTE_RUNTIME_CONTAINER_KEY,
} from "./route-runtime.js"
