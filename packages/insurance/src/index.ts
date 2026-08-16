import type { Module } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import type { ApiModule } from "@voyant-travel/hono/module"

import { insuranceProviderSourcePort } from "./provider-ports.js"
import {
  createInsuranceAdminRoutes,
  type InsuranceAdminRoutes,
  insuranceAdminRoutes,
} from "./routes.js"
import { type InsuranceRuntime, insuranceRuntimePort } from "./runtime-port.js"

export const insuranceModule: Module = {
  name: "insurance",
  requiresTransactionalDb: true,
}

export interface CreateInsuranceApiModuleOptions {
  adminRoutes?: ApiModule["adminRoutes"]
  lazyAdminRoutes?: ApiModule["lazyAdminRoutes"]
}

export function createInsuranceApiModule(options: CreateInsuranceApiModuleOptions = {}): ApiModule {
  return {
    module: insuranceModule,
    ...(options.lazyAdminRoutes
      ? { lazyAdminRoutes: options.lazyAdminRoutes }
      : { adminRoutes: options.adminRoutes ?? insuranceAdminRoutes }),
  }
}

export const insuranceApiModule: ApiModule = createInsuranceApiModule()

/**
 * Package-owned adapter from the selected graph to the insurance routes.
 *
 * The insurer set is read here rather than captured, and the runtime port is
 * resolved once. A deployment with no insurer connected still mounts the admin
 * surface: an operator has to be able to read what was sold before the last
 * insurer was disconnected.
 */
export interface InsuranceGraphRuntime {
  module: Module
  adminRoutes?: InsuranceAdminRoutes
}

export const createInsuranceVoyantRuntime = defineGraphRuntimeFactory<InsuranceGraphRuntime>(
  async ({ api, getPort, getPorts, hasPort }) => {
    const runtime = hasPort(insuranceRuntimePort)
      ? await getPort<InsuranceRuntime>(insuranceRuntimePort)
      : undefined

    return {
      module: insuranceModule,
      ...(api.some(({ surface }) => surface === "admin")
        ? {
            adminRoutes: createInsuranceAdminRoutes({
              resolveRuntime: (c) => c.get("insuranceRuntime") ?? runtime,
              resolveProviders: () => getPorts(insuranceProviderSourcePort),
            }),
          }
        : {}),
    }
  },
)

export {
  buildInsuranceQuoteRequest,
  createInsuranceAncillaryOfferSource,
  DEFAULT_INSURANCE_LABELS,
  DEFAULT_INSURANCE_QUOTE_TIMEOUT_MS,
  decodeInsuranceQuoteRef,
  encodeInsuranceQuoteRef,
  INSURANCE_ANCILLARY_KIND,
  INSURANCE_ANCILLARY_SOURCE_ID,
  INSURANCE_TRAVELER_FIELD_KEYS,
  type InsuranceAncillarySourceLabels,
  type InsuranceAncillarySourceOptions,
  toAncillaryOffer,
} from "./ancillary-source.js"
export {
  INSURANCE_BOOKING_ACTIVITY_EVENTS,
  INSURANCE_ISSUE_FAILED_ALERT_EVENT,
  type InsuranceBookingDocumentRecorder,
  type InsuranceBookingIntegration,
  type InsuranceDocumentNotifier,
  type InsuranceIssueFailedAlertContext,
  type InsuranceStaffAlertRaiser,
  recordInsuranceBookingActivity,
} from "./booking-integration.js"
export { createInsuranceCustomerPortalReader } from "./customer-portal-runtime.js"
export {
  INSURANCE_EVENT_TYPES,
  type InsuranceApplicationOpenedPayload,
  type InsurancePolicyCancelledPayload,
  type InsurancePolicyIssuedPayload,
  type InsurancePolicyIssueFailedPayload,
} from "./events.js"
export {
  createInsurancePiiService,
  type DecryptedInsuranceInsuredPerson,
  type InsuranceInsuredIdentity,
  type InsuranceInsuredPersonInput,
  type InsurancePiiAuditEvent,
  type InsurancePiiService,
  type InsurancePiiServiceOptions,
  insuranceInsuredIdentitySchema,
  toInsuredPersonInput,
} from "./pii.js"
export {
  type InsurancePiiAccessContext,
  redactInsuranceAnswers,
  redactInsuranceContractingParty,
  redactInsuredIdentity,
  shouldRevealInsurancePii,
} from "./pii-redaction.js"
// The insurer seam. Kept as a subpath too (`@voyant-travel/insurance/ports`)
// so an adapter can bind it without importing this barrel.
export {
  type InsuranceProviderAdapter,
  type InsuranceProviderContext,
  insuranceProviderSourcePort,
} from "./provider-ports.js"
export {
  createInsuranceAdminRoutes,
  type InsuranceAdminRouteOptions,
  type InsuranceAdminRoutes,
  type InsuranceRoutesEnv,
  insuranceAdminRoutes,
} from "./routes.js"
export { INSURANCE_OPENAPI_API_IDS } from "./routes-openapi.js"
export {
  type CustomerPortalInsurancePolicy,
  type InsuranceCustomerPortalReader,
  type InsuranceRuntime,
  insuranceCustomerPortalPort,
  insuranceRuntimePort,
} from "./runtime-port.js"
export * from "./schema.js"
export { type InsuranceReadOptions, type InsuranceService, insuranceService } from "./service.js"
export {
  attachInsuranceApplicationToBooking,
  type CreateInsuranceApplicationInput,
  createInsuranceApplication,
  expireInsuranceApplications,
  getInsuranceApplication,
  getInsuranceApplicationByQuoteRef,
  insuranceApplicationPremium,
  isInsuranceApplicationRowIssuableAt,
  listInsuranceApplicationsForBooking,
  listInsuranceApplicationsForSession,
  setInsuranceApplicationStatus,
} from "./service-applications.js"
export {
  toInsuranceApplicationWire,
  toInsuranceInsuredPersonWire,
  toInsurancePolicyWire,
} from "./service-mapping.js"
export {
  type CancelInsurancePolicyResult,
  cancelInsurancePolicy,
  getInsurancePolicy,
  getInsurancePolicyForApplication,
  type IssueInsurancePolicyInput,
  type IssueInsurancePolicyResult,
  issueInsurancePolicy,
  listInsurancePoliciesForBooking,
  listIssuedInsurancePoliciesForBooking,
  recordInsuranceIssueFailure,
} from "./service-policies.js"
export * from "./validation.js"
export { insuranceVoyantModule } from "./voyant.js"
