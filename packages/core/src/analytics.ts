/**
 * The vendor-neutral product-analytics port.
 *
 * The framework is self-hostable, so an analytics SDK cannot be hardcoded into
 * `catalog-react` or `admin-react`: that forces a vendor on self-hosters and
 * puts a network client inside packages consumed in environments with no
 * egress. The host binds an implementation instead — Voyant Cloud binds one,
 * a self-hoster binds anything or nothing.
 *
 * Three properties are load-bearing and are enforced by
 * {@link createSafeAnalytics} rather than left to each implementation:
 *
 *   - **Unbound is a supported state.** {@link noopAnalytics} is the default.
 *     A deployment that never binds the port behaves exactly as it did before
 *     this port existed, and pays nothing for it.
 *   - **Fire-and-forget.** `track` returns `void`. There is nothing to await,
 *     so no caller can accidentally put an analytics round-trip on a booking's
 *     critical path.
 *   - **It cannot fail a booking.** A provider that throws — synchronously or
 *     from a returned promise — is swallowed. Measuring the funnel must never
 *     be able to break the funnel.
 *
 * The catalogue of events that travel through it is in `./analytics-events.ts`.
 */

import type { AnalyticsEventName } from "./analytics-events.js"
import { definePort } from "./project.js"

export type {
  AnalyticsEventName,
  AnalyticsEventProperties,
  AnalyticsEventProperty,
  AnalyticsFailureReason,
} from "./analytics-events.js"
export {
  ANALYTICS_EVENT_CATALOGUE,
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_FAILURE_REASONS,
  analyticsFailureReason,
} from "./analytics-events.js"

/** A property value an event may carry. Identifiers and enumerations only. */
export type AnalyticsPropertyValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number)[]

export type AnalyticsProperties = Record<string, AnalyticsPropertyValue>

/**
 * What a host binds.
 *
 * Intentionally the smallest surface that supports a funnel: an event, an
 * actor, and the group the actor belongs to. Anything richer — replay, feature
 * flags, dashboards — is the hosting platform's business, not this repo's.
 *
 * Implementations must not throw and must not block; `createSafeAnalytics`
 * guarantees both regardless, so a host may bind a naive client.
 */
export interface AnalyticsPort {
  track(event: string, properties?: Record<string, unknown>): void
  identify(id: string, properties?: Record<string, unknown>): void
  group(type: string, key: string, properties?: Record<string, unknown>): void
}

/**
 * The typed view internal callers use.
 *
 * `AnalyticsPort.track` takes a `string` because a host implementation should
 * not have to know this repository's taxonomy. Our own call sites should:
 * narrowing `event` to {@link AnalyticsEventName} is what makes an undocumented
 * event a compile error rather than something the conformance checker has to
 * catch after the fact.
 */
export interface AnalyticsEmitter extends AnalyticsPort {
  track(event: AnalyticsEventName, properties?: AnalyticsProperties): void
}

/** The default. Binds nothing, allocates nothing, does nothing. */
export const noopAnalytics: AnalyticsEmitter = Object.freeze({
  track: () => undefined,
  identify: () => undefined,
  group: () => undefined,
})

function swallow(run: () => unknown): void {
  try {
    const result = run()
    // A provider that batches over the network returns a promise. Not awaited
    // — that is the point — but an unhandled rejection would still surface as
    // a process-level error, so it is absorbed here.
    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
      void (result as Promise<unknown>).then(
        () => undefined,
        () => undefined,
      )
    }
  } catch {
    // Deliberately silent. An analytics failure is not a booking failure, and
    // logging it from library code would put vendor noise in a host's logs on
    // every event.
  }
}

/**
 * Wrap a host-bound provider so it satisfies the port's guarantees.
 *
 * Pass `undefined` for an unbound host and get {@link noopAnalytics} back, so
 * every call site can be written against a non-optional emitter.
 */
export function createSafeAnalytics(provider: AnalyticsPort | undefined | null): AnalyticsEmitter {
  if (!provider) return noopAnalytics
  return {
    track: (event, properties) => swallow(() => provider.track(event, properties)),
    identify: (id, properties) => swallow(() => provider.identify(id, properties)),
    group: (type, key, properties) => swallow(() => provider.group(type, key, properties)),
  }
}

/**
 * Wrap a provider that is not resolved yet.
 *
 * Runtime contributors resolve host ports lazily, so a contributor holding an
 * analytics binding usually holds a promise of one. Awaiting it at the call
 * site would make emission asynchronous, which the port forbids; skipping
 * emission until it settles would silently lose the first events of every
 * process — exactly the ones that say a deployment started.
 *
 * So the call stays synchronous and the *delivery* queues behind the promise.
 */
export function createDeferredAnalytics(
  provider: AnalyticsPort | PromiseLike<AnalyticsPort | undefined | null> | undefined | null,
): AnalyticsEmitter {
  if (!provider) return noopAnalytics
  if (typeof (provider as PromiseLike<unknown>).then !== "function") {
    return createSafeAnalytics(provider as AnalyticsPort)
  }
  const pending = Promise.resolve(provider as PromiseLike<AnalyticsPort | undefined | null>).then(
    (resolved) => createSafeAnalytics(resolved),
    () => noopAnalytics,
  )
  const forward = (apply: (analytics: AnalyticsEmitter) => void): void => {
    void pending.then(apply, () => undefined)
  }
  return {
    track: (event, properties) => forward((analytics) => analytics.track(event, properties)),
    identify: (id, properties) => forward((analytics) => analytics.identify(id, properties)),
    group: (type, key, properties) =>
      forward((analytics) => analytics.group(type, key, properties)),
  }
}

/**
 * Drop `undefined` properties before emitting.
 *
 * Call sites build property bags from optional lifecycle state. A key present
 * with an `undefined` value reaches a vendor as an explicit null and shows up
 * in a breakdown as its own bucket, which is not what "we did not know" means.
 */
export function analyticsProperties(properties: AnalyticsProperties): AnalyticsProperties {
  const out: AnalyticsProperties = {}
  for (const [key, value] of Object.entries(properties)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

export const analyticsPort = definePort<AnalyticsPort>({
  id: "analytics.runtime",
  test(provider) {
    if (
      provider === null ||
      typeof provider !== "object" ||
      typeof provider.track !== "function" ||
      typeof provider.identify !== "function" ||
      typeof provider.group !== "function"
    ) {
      throw new Error("analytics.runtime provider must implement track(), identify(), and group().")
    }
  },
})
