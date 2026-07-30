import { customerBusinessAccountOnboardingRuntimePort } from "@voyant-travel/auth/customer-business-onboarding-runtime-port"
import {
  type BookingsGuestVerificationRuntime,
  bookingsGuestVerificationRuntimePort,
} from "@voyant-travel/bookings/runtime-port"
import { createCommerceStorefrontOfferResolvers } from "@voyant-travel/commerce"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import { createStorefrontCustomerBusinessOnboardingRuntime } from "./customer-business-onboarding-runtime.js"
import { storefrontCustomerPortalRuntimePort, storefrontOffersRuntimePort } from "./runtime-port.js"
import {
  consumeVerifiedChallenge,
  peekVerifiedChallengeDestination,
  STOREFRONT_VERIFICATION_BOOKING_CREATE_PURPOSE,
} from "./verification/consume.js"

export interface StorefrontRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
  hasRuntimePort?(port: { id: string }): boolean
}

/** Storefront-owned adapters derived exclusively from generic Node primitives. */
export function createStorefrontRuntimePortContribution(
  host: StorefrontRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  return {
    // Bookings owns the public create route but not the challenge that
    // authorizes a guest; it arrives through this port.
    [bookingsGuestVerificationRuntimePort.id]: {
      peekVerifiedDestination: (db, input) =>
        peekVerifiedChallengeDestination(db, {
          challengeId: input.challengeId,
          purpose: STOREFRONT_VERIFICATION_BOOKING_CREATE_PURPOSE,
          subjectRef: input.subjectRef,
        }),
      consume: (tx, input) =>
        consumeVerifiedChallenge(tx, {
          challengeId: input.challengeId,
          purpose: STOREFRONT_VERIFICATION_BOOKING_CREATE_PURPOSE,
          subjectRef: input.subjectRef,
          destination: input.destination,
          consumedRef: input.consumedRef,
        }),
    } satisfies BookingsGuestVerificationRuntime,
    [storefrontOffersRuntimePort.id]: createCommerceStorefrontOfferResolvers(),
    [storefrontCustomerPortalRuntimePort.id]: {
      resolveDocumentDownloadUrl: host.primitives.storage.downloadUrl,
    },
    ...(host.hasRuntimePort?.(customerBusinessAccountOnboardingRuntimePort)
      ? {}
      : {
          [customerBusinessAccountOnboardingRuntimePort.id]:
            createStorefrontCustomerBusinessOnboardingRuntime(),
        }),
  }
}
