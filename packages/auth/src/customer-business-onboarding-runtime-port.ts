import { definePort } from "@voyant-travel/core/project"
import type { VoyantDb } from "@voyant-travel/hono"

import type {
  CustomerBusinessAccountCapabilitiesDto,
  CustomerBusinessAccountDecisionInput,
  CustomerBusinessAccountDto,
  CustomerBusinessAccountProvisionInput,
  CustomerBusinessAccountRequestDto,
  CustomerBusinessAccountRequestStatus,
  CustomerBusinessProfile,
} from "./customer-business-accounts-contracts.js"

export interface CustomerBusinessOnboardingContext {
  bindings: unknown
  db: VoyantDb
}

export interface CustomerBusinessAccountOperationInput {
  requesterUserId: string
  publicApiOrigin: string
  idempotencyKey: string
  profile: CustomerBusinessProfile
}

export interface CustomerBusinessAccountOnboardingRuntimeProvider {
  getCapabilities(
    context: CustomerBusinessOnboardingContext,
  ): Promise<CustomerBusinessAccountCapabilitiesDto>
  createBusinessAccount(
    context: CustomerBusinessOnboardingContext,
    input: CustomerBusinessAccountOperationInput,
  ): Promise<CustomerBusinessAccountDto>
  requestBusinessAccount(
    context: CustomerBusinessOnboardingContext,
    input: CustomerBusinessAccountOperationInput,
  ): Promise<CustomerBusinessAccountRequestDto>
  listRequests(
    context: CustomerBusinessOnboardingContext,
    input: {
      requesterUserId?: string
      status?: CustomerBusinessAccountRequestStatus
    },
  ): Promise<CustomerBusinessAccountRequestDto[]>
  cancelRequest(
    context: CustomerBusinessOnboardingContext,
    input: { requestId: string; requesterUserId: string },
  ): Promise<CustomerBusinessAccountRequestDto>
  approveRequest(
    context: CustomerBusinessOnboardingContext,
    input: { requestId: string; decidedBy: string } & CustomerBusinessAccountDecisionInput,
  ): Promise<{
    account: CustomerBusinessAccountDto
    request: CustomerBusinessAccountRequestDto
  }>
  rejectRequest(
    context: CustomerBusinessOnboardingContext,
    input: { requestId: string; decidedBy: string } & CustomerBusinessAccountDecisionInput,
  ): Promise<CustomerBusinessAccountRequestDto>
  provisionBusinessAccount(
    context: CustomerBusinessOnboardingContext,
    input: CustomerBusinessAccountProvisionInput & { decidedBy: string },
  ): Promise<CustomerBusinessAccountDto>
}

const requiredMethods = [
  "getCapabilities",
  "createBusinessAccount",
  "requestBusinessAccount",
  "listRequests",
  "cancelRequest",
  "approveRequest",
  "rejectRequest",
  "provisionBusinessAccount",
] as const

export const customerBusinessAccountOnboardingRuntimePort =
  definePort<CustomerBusinessAccountOnboardingRuntimeProvider>({
    id: "auth.customer-business-onboarding.runtime",
    test(provider) {
      if (provider === null || typeof provider !== "object") {
        throw new Error("auth.customer-business-onboarding.runtime provider must be an object.")
      }
      for (const method of requiredMethods) {
        if (typeof provider[method] !== "function") {
          throw new Error(
            `auth.customer-business-onboarding.runtime provider must implement ${method}().`,
          )
        }
      }
    },
  })
