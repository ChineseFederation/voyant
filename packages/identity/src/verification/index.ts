import type { Module } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import { stampOpenApiRegistryApiId } from "@voyant-travel/hono"
import type { ApiModule } from "@voyant-travel/hono/module"
import { customerVerificationRuntimePort } from "../runtime-port.js"
import {
  buildCustomerVerificationSenderBundle,
  type CustomerVerificationChannelCoverage,
  type CustomerVerificationRoutesOptions,
  createCustomerVerificationPublicRoutes,
  PUBLIC_API_VERIFICATION_SENDERS_CONTAINER_KEY,
} from "./routes-public.js"
import { customerVerificationModule } from "./schema.js"

export type {
  ConsumeVerifiedChallengeInput,
  ConsumeVerifiedChallengeResult,
} from "./consume.js"
export {
  consumeVerifiedChallenge,
  PUBLIC_API_VERIFICATION_BOOKING_CREATE_PURPOSE,
  peekVerifiedChallengeDestination,
} from "./consume.js"
export type {
  CustomerVerificationChannelCoverage,
  CustomerVerificationPublicRoutes,
  CustomerVerificationRoutesOptions,
  CustomerVerificationSenderBundle,
} from "./routes-public.js"
export {
  buildCustomerVerificationSenderBundle,
  buildCustomerVerificationSenders,
  createCustomerVerificationPublicRoutes,
  PUBLIC_API_VERIFICATION_SENDERS_CONTAINER_KEY,
  resolveCustomerVerificationChannelCoverage,
} from "./routes-public.js"
export type {
  CustomerVerificationChallenge,
  NewCustomerVerificationChallenge,
} from "./schema.js"
export {
  customerVerificationChallenges,
  customerVerificationChannelEnum,
  customerVerificationLinkable,
  customerVerificationModule,
  customerVerificationStatusEnum,
} from "./schema.js"
export type {
  CustomerVerificationDeliveryResult,
  CustomerVerificationEmailSendInput,
  CustomerVerificationNotificationChannel,
  CustomerVerificationNotificationPayload,
  CustomerVerificationNotificationProvider,
  CustomerVerificationNotificationResult,
  CustomerVerificationProviderOptions,
  CustomerVerificationSenders,
  CustomerVerificationServiceOptions,
  CustomerVerificationSmsSendInput,
} from "./service.js"
export {
  CustomerVerificationError,
  createCustomerVerificationSendersFromProviders,
  createCustomerVerificationService,
} from "./service.js"
export type {
  ConfirmEmailVerificationChallengeInput,
  ConfirmSmsVerificationChallengeInput,
  CustomerVerificationChallengeRecord,
  CustomerVerificationChannel,
  CustomerVerificationConfirmResult,
  CustomerVerificationStartResult,
  CustomerVerificationStatus,
  StartEmailVerificationChallengeInput,
  StartSmsVerificationChallengeInput,
} from "./validation.js"
export {
  confirmEmailVerificationChallengeSchema,
  confirmSmsVerificationChallengeSchema,
  customerVerificationChallengeRecordSchema,
  customerVerificationChannelSchema,
  customerVerificationConfirmResultSchema,
  customerVerificationStartResultSchema,
  customerVerificationStatusSchema,
  startEmailVerificationChallengeSchema,
  startSmsVerificationChallengeSchema,
} from "./validation.js"

/**
 * Report a *partial* channel gap at bootstrap rather than at the first shopper.
 *
 * Both start routes mount unconditionally, so a deployment with no SMS-capable
 * provider looks healthy until a guest who gave a phone number is answered with
 * a 501 and cannot book at all (voyant#3948). Surfacing the gap when the module
 * boots gives an operator a signal at the point they can still act on it.
 *
 * Deliberately silent when *no* channel resolves. Bootstrap runs with whatever
 * bindings triggered it — the first request passes the real env, but
 * `app.ready()` defaults to `{}`, which every test and node sibling process
 * uses. An empty provider set is therefore indistinguishable from "bootstrapped
 * without bindings", and warning on it would fire on boots that are not
 * misconfigured at all. A deployment that truly configures no provider still
 * fails loudly on the first start request, naming the same gap.
 */
function warnUndeliverableChannels({
  supported,
  unsupported,
}: CustomerVerificationChannelCoverage) {
  if (unsupported.length === 0 || supported.length === 0) return

  console.warn(
    `[storefront/verification] No notification provider delivers ${unsupported
      .map((channel) => `"${channel}"`)
      .join(" or ")}; those start routes will answer 501 sender_not_configured. ` +
      `Deliverable channels: ${supported.join(", ")}. Configure a verification notification provider covering the missing channel, or stop offering it in the storefront.`,
  )
}

export function createCustomerVerificationApiModule(
  options?: CustomerVerificationRoutesOptions,
): ApiModule {
  const module: Module = {
    ...customerVerificationModule,
    bootstrap: ({ bindings, container }) => {
      const { senders, coverage } = buildCustomerVerificationSenderBundle(
        bindings as Record<string, unknown>,
        options,
      )
      warnUndeliverableChannels(coverage)
      container.register(PUBLIC_API_VERIFICATION_SENDERS_CONTAINER_KEY, senders)
    },
  }

  return {
    module,
    publicRoutes: stampOpenApiRegistryApiId(
      createCustomerVerificationPublicRoutes(options),
      "@voyant-travel/public-api#verification.api",
    ),
  }
}

export const createCustomerVerificationVoyantRuntime = defineGraphRuntimeFactory(
  async ({ getPort }) =>
    createCustomerVerificationApiModule(await getPort(customerVerificationRuntimePort)),
)
