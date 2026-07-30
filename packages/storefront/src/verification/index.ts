import type { Module } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import { stampOpenApiRegistryApiId } from "@voyant-travel/hono"
import type { ApiModule } from "@voyant-travel/hono/module"
import { storefrontVerificationRuntimePort } from "../runtime-port.js"
import {
  buildStorefrontVerificationSenderBundle,
  createStorefrontVerificationPublicRoutes,
  STOREFRONT_VERIFICATION_SENDERS_CONTAINER_KEY,
  type StorefrontVerificationChannelCoverage,
  type StorefrontVerificationRoutesOptions,
} from "./routes-public.js"
import { storefrontVerificationModule } from "./schema.js"

export type {
  ConsumeVerifiedChallengeInput,
  ConsumeVerifiedChallengeResult,
} from "./consume.js"
export {
  consumeVerifiedChallenge,
  peekVerifiedChallengeDestination,
  STOREFRONT_VERIFICATION_BOOKING_CREATE_PURPOSE,
} from "./consume.js"
export type {
  StorefrontVerificationChannelCoverage,
  StorefrontVerificationPublicRoutes,
  StorefrontVerificationRoutesOptions,
  StorefrontVerificationSenderBundle,
} from "./routes-public.js"
export {
  buildStorefrontVerificationSenderBundle,
  buildStorefrontVerificationSenders,
  createStorefrontVerificationPublicRoutes,
  resolveStorefrontVerificationChannelCoverage,
  STOREFRONT_VERIFICATION_SENDERS_CONTAINER_KEY,
} from "./routes-public.js"
export type {
  NewStorefrontVerificationChallenge,
  StorefrontVerificationChallenge,
} from "./schema.js"
export {
  storefrontVerificationChallenges,
  storefrontVerificationChannelEnum,
  storefrontVerificationLinkable,
  storefrontVerificationModule,
  storefrontVerificationStatusEnum,
} from "./schema.js"
export type {
  StorefrontVerificationDeliveryResult,
  StorefrontVerificationEmailSendInput,
  StorefrontVerificationNotificationChannel,
  StorefrontVerificationNotificationPayload,
  StorefrontVerificationNotificationProvider,
  StorefrontVerificationNotificationResult,
  StorefrontVerificationProviderOptions,
  StorefrontVerificationSenders,
  StorefrontVerificationServiceOptions,
  StorefrontVerificationSmsSendInput,
} from "./service.js"
export {
  createStorefrontVerificationSendersFromProviders,
  createStorefrontVerificationService,
  StorefrontVerificationError,
} from "./service.js"
export type {
  ConfirmEmailVerificationChallengeInput,
  ConfirmSmsVerificationChallengeInput,
  StartEmailVerificationChallengeInput,
  StartSmsVerificationChallengeInput,
  StorefrontVerificationChallengeRecord,
  StorefrontVerificationChannel,
  StorefrontVerificationConfirmResult,
  StorefrontVerificationStartResult,
  StorefrontVerificationStatus,
} from "./validation.js"
export {
  confirmEmailVerificationChallengeSchema,
  confirmSmsVerificationChallengeSchema,
  startEmailVerificationChallengeSchema,
  startSmsVerificationChallengeSchema,
  storefrontVerificationChallengeRecordSchema,
  storefrontVerificationChannelSchema,
  storefrontVerificationConfirmResultSchema,
  storefrontVerificationStartResultSchema,
  storefrontVerificationStatusSchema,
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
}: StorefrontVerificationChannelCoverage) {
  if (unsupported.length === 0 || supported.length === 0) return

  console.warn(
    `[storefront/verification] No notification provider delivers ${unsupported
      .map((channel) => `"${channel}"`)
      .join(" or ")}; those start routes will answer 501 sender_not_configured. ` +
      `Deliverable channels: ${supported.join(", ")}. Configure a verification notification provider covering the missing channel, or stop offering it in the storefront.`,
  )
}

export function createStorefrontVerificationApiModule(
  options?: StorefrontVerificationRoutesOptions,
): ApiModule {
  const module: Module = {
    ...storefrontVerificationModule,
    bootstrap: ({ bindings, container }) => {
      const { senders, coverage } = buildStorefrontVerificationSenderBundle(
        bindings as Record<string, unknown>,
        options,
      )
      warnUndeliverableChannels(coverage)
      container.register(STOREFRONT_VERIFICATION_SENDERS_CONTAINER_KEY, senders)
    },
  }

  return {
    module,
    publicRoutes: stampOpenApiRegistryApiId(
      createStorefrontVerificationPublicRoutes(options),
      "@voyant-travel/storefront#verification.api",
    ),
  }
}

export const createStorefrontVerificationVoyantRuntime = defineGraphRuntimeFactory(
  async ({ getPort }) =>
    createStorefrontVerificationApiModule(await getPort(storefrontVerificationRuntimePort)),
)
