import type {
  CustomerVerificationNotificationPayload,
  CustomerVerificationNotificationProvider,
  CustomerVerificationNotificationResult,
} from "@voyant-travel/identity/verification"

import type { NotificationPayload, NotificationProvider, NotificationResult } from "./types.js"

/**
 * Storefront's verification provider contract and this package's provider
 * contract agree on `name`/`channels` but not on delivery: Storefront calls a
 * bare `send(payload)`, while a `NotificationProvider` only delivers through
 * `durableDelivery`. The two used to meet as `unknown` across the options port,
 * so a `NotificationProvider` handed straight to Storefront type-checked and
 * then failed at request time with `provider.send is not a function`
 * (voyant#3923). Every crossing now goes through the adapter below, and the
 * assignability of the payload/result shapes is asserted at compile time so a
 * drift in either package breaks the build instead of a shopper's checkout.
 */
type AssertAssignableTo<TTarget, TSource extends TTarget> = TSource

type _VerificationPayloadIsANotificationPayload = AssertAssignableTo<
  NotificationPayload,
  CustomerVerificationNotificationPayload
>
type _NotificationResultIsAVerificationResult = AssertAssignableTo<
  CustomerVerificationNotificationResult,
  NotificationResult
>

/**
 * Scoped, payload-derived idempotency keys. Verification codes are minted per
 * challenge, so an identical payload is genuinely the same delivery and must
 * replay rather than re-send; a fresh code produces a fresh key. Deriving the
 * key from the payload also makes provider-side drift rejection unreachable.
 */
const IDEMPOTENCY_KEY_PREFIX = "voyant:storefront-verification"

async function verificationIdempotencyKey(
  payload: CustomerVerificationNotificationPayload,
): Promise<string> {
  const canonical = JSON.stringify([
    payload.channel,
    payload.to,
    payload.template,
    payload.provider ?? null,
    payload.subject ?? null,
    payload.text ?? null,
    payload.data ?? null,
  ])
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical))
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  )
  return `${IDEMPOTENCY_KEY_PREFIX}:${hex}`
}

/** Adapt one durable Notifications provider to Storefront's verification sender. */
export function toCustomerVerificationNotificationProvider(
  provider: NotificationProvider,
): CustomerVerificationNotificationProvider {
  return {
    name: provider.name,
    channels: provider.channels,
    async send(payload) {
      const capability = provider.durableDelivery
      if (
        capability?.protocol !== "notification-provider-idempotency-v1" ||
        typeof capability.send !== "function"
      ) {
        throw new Error(
          `Notification provider "${provider.name}" does not expose durable delivery, so storefront verification cannot deliver over "${payload.channel}".`,
        )
      }
      const result = await capability.send(payload, {
        idempotencyKey: await verificationIdempotencyKey(payload),
      })
      return { id: result.id, provider: result.provider }
    },
  }
}

/** Adapt the configured Notifications provider set for storefront verification. */
export function toCustomerVerificationNotificationProviders(
  providers: ReadonlyArray<NotificationProvider>,
): ReadonlyArray<CustomerVerificationNotificationProvider> {
  return providers.map(toCustomerVerificationNotificationProvider)
}
