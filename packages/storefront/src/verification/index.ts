import type { Module } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import { stampOpenApiRegistryApiId } from "@voyant-travel/hono"
import type { ApiModule } from "@voyant-travel/hono/module"
import { storefrontVerificationRuntimePort } from "../runtime-port.js"
import {
  buildStorefrontVerificationSenders,
  createStorefrontVerificationPublicRoutes,
  STOREFRONT_VERIFICATION_SENDERS_CONTAINER_KEY,
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
  StorefrontVerificationPublicRoutes,
  StorefrontVerificationRoutesOptions,
} from "./routes-public.js"
export {
  buildStorefrontVerificationSenders,
  createStorefrontVerificationPublicRoutes,
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

export function createStorefrontVerificationApiModule(
  options?: StorefrontVerificationRoutesOptions,
): ApiModule {
  const module: Module = {
    ...storefrontVerificationModule,
    bootstrap: ({ bindings, container }) => {
      container.register(
        STOREFRONT_VERIFICATION_SENDERS_CONTAINER_KEY,
        buildStorefrontVerificationSenders(bindings as Record<string, unknown>, options),
      )
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
