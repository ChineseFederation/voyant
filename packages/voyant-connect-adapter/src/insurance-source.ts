/**
 * Voyant Connect as one insurer behind `insurance.provider-source`.
 *
 * The direction of dependency is the point. The insurance module knows about a
 * port and nothing else; this adapter knows about the port *and* about Connect;
 * nothing in the framework knows about a specific insurer. An operator with a
 * direct insurer contract writes the same five methods and binds them, and this
 * binding has no privileged position.
 *
 * ## The wire shape is defined here, not by the SDK
 *
 * `@voyant-travel/connect-sdk@0.10.0` has no insurance vertical: the only
 * near-matches are a `CruiseFareComponentKind` value `"insurance"` (a cruise
 * fare-component tag, not a product) and flights' untyped `getAncillaries`. So
 * the calls below go through the SDK's *generic* namespaces and carry a
 * `connectRoute: "insurance"` discriminator, the same way the stay lifecycle
 * dispatches on `request.parameters.connectRoute !== "stays"`:
 *
 * | method     | Connect call                                          |
 * |------------|-------------------------------------------------------|
 * | `quote`    | `availability.calendar(connectionId, …)`               |
 * | `apply`    | `bookings.create(connectionId, …, { idempotencyKey })` |
 * | `issue`    | `bookings.confirm(connectionId, applicationId, …)`     |
 * | `document` | `bookings.get(connectionId, policyId)`                 |
 * | `cancel`   | `bookings.cancel(connectionId, policyId, { reason })`  |
 *
 * `availability.calendar` rather than `products.listOnConnection` because its
 * input type carries an index signature, so the discriminator rides the request
 * without a cast; the product-list options type is a weak type that a
 * discriminator cannot be added to at all. Quoting *is* an availability-and-price
 * question asked of one product over a date range, so the mapping is honest
 * rather than merely convenient.
 *
 * Every Connect-specific encoding and decoding lives in this package and none
 * of it may leak into `@voyant-travel/insurance-contracts`. This file owns the
 * five methods, the request bodies and the deadline; `insurance-wire.ts` turns
 * a response into a quote, an application, a policy or a cancellation, and
 * `insurance-wire-fields.ts` decodes the leaves those are built from.
 */

import { ReservationDispatchError } from "@voyant-travel/catalog-contracts/adapter/contract"
import {
  type AvailabilityCalendarQueryInput,
  createVoyantConnectClient,
  type VoyantConnectClient,
} from "@voyant-travel/connect-sdk"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { InsuranceApplicationInput } from "@voyant-travel/insurance-contracts/application"
import type {
  InsuranceProviderAdapter,
  InsuranceProviderContext,
} from "@voyant-travel/insurance-contracts/provider"
import type { InsuranceQuoteRequest } from "@voyant-travel/insurance-contracts/quote"

import { resolveVoyantConnectEnv } from "./env.js"
import {
  type ConnectQuoteSelection,
  decodeApplication,
  decodeCancellation,
  decodePolicy,
  decodeQuote,
  decodeQuoteRef,
} from "./insurance-wire.js"
import { decodeDocument, decodeList, pickDocument, policyPayload } from "./insurance-wire-fields.js"
import { stringValue } from "./utils.js"

/** The discriminator every Connect call carries so a connector can dispatch. */
const CONNECT_ROUTE = "insurance"

const DEFAULT_PROVIDER_ID = "voyant-connect"
const DEFAULT_DISPLAY_NAME = "Voyant Connect"

/**
 * Which Connect connection sells cover, and as which product.
 *
 * Read from the deployment's environment rather than inferred, because an
 * operator's Connect catalogue is theirs and nothing here may guess which of
 * its products is an insurance product.
 */
const CONNECTION_ID_VAR = "VOYANT_CONNECT_INSURANCE_CONNECTION_ID"
const PRODUCT_ID_VAR = "VOYANT_CONNECT_INSURANCE_PRODUCT_ID"
const PROVIDER_ID_VAR = "VOYANT_CONNECT_INSURANCE_PROVIDER_ID"
const DISPLAY_NAME_VAR = "VOYANT_CONNECT_INSURANCE_DISPLAY_NAME"

export interface ConnectInsuranceSourceOptions {
  client: VoyantConnectClient
  /** The Connect connection that reaches the insurer. */
  connectionId: string
  /** The Connect product the insurer's cover is sold as. */
  productId: string
  /** Stable across deployments; it keys stored applications and policies. */
  providerId?: string
  /** How the insurer is named to a traveller. */
  displayName?: string
}

/**
 * One insurer reached through one Connect connection.
 *
 * Two rules the `InsuranceProviderAdapter` interface documents but cannot
 * enforce are honoured here:
 *
 * - `quote` returns a **list** and never throws for a business refusal. An
 *   upstream refusal comes back as a quote whose `eligibility.status` is not
 *   `"eligible"`, carrying structured reasons. Only a failure of the call
 *   itself — transport, protocol, abort — throws.
 * - `quote` sends ages and dates upstream and nothing else. The request is
 *   re-projected field by field below, so a personal field appearing on the
 *   contract later still would not travel.
 */
export function createConnectInsuranceProviderSource(
  options: ConnectInsuranceSourceOptions,
): InsuranceProviderAdapter {
  const { client, connectionId, productId } = options
  const providerId = options.providerId ?? DEFAULT_PROVIDER_ID
  const displayName = options.displayName ?? DEFAULT_DISPLAY_NAME

  return {
    providerId,
    displayName,

    async quote(request, context) {
      const rows = await connectCall(context.signal, "insurance_quote_unavailable", () =>
        client.availability.calendar(connectionId, quoteQuery(request, productId, context)),
      )
      return rows.flatMap((row) => {
        const quote = decodeQuote(row, { providerId, displayName, productId, request })
        return quote ? [quote] : []
      })
    },

    async apply(input, context) {
      assertSameProvider(input.providerId, providerId)
      const selection = decodeQuoteRef(input.quoteId)
      const response = await connectCall(context.signal, "insurance_application_failed", () =>
        client.bookings.create(
          connectionId,
          applicationBody(selection, input, context),
          context.idempotencyKey ? { idempotencyKey: context.idempotencyKey } : undefined,
        ),
      )
      return decodeApplication(response, { providerId, input })
    },

    async issue(input, context) {
      // Money moves here. Without a replay-safe key a retry issues a second
      // policy against a real traveller, so this refuses rather than guesses.
      if (!context.idempotencyKey) {
        throw new ReservationDispatchError(
          "Voyant Connect insurance issue requires an idempotency key",
          "not_sent",
          "insurance_issue_idempotency_key_required",
        )
      }
      if (context.signal?.aborted) {
        throw new ReservationDispatchError(
          "Voyant Connect insurance issue was aborted before dispatch",
          "not_sent",
          "insurance_issue_aborted",
        )
      }
      try {
        const response = await raceSignal(context.signal, () =>
          client.bookings.confirm(connectionId, input.applicationId, {
            connectRoute: CONNECT_ROUTE,
            // `bookings.confirm` has no options argument, so the caller's key
            // rides the body rather than being dropped.
            idempotencyKey: context.idempotencyKey,
            expectedPremium: input.expectedPremium,
            ...(context.locale ? { locale: context.locale } : {}),
          }),
        )
        return decodePolicy(response, { providerId, input })
      } catch (error) {
        // The confirmation may have reached the insurer. Nothing is released,
        // unwound or retried here — a policy that exists upstream and is
        // cancelled from this side is a refund the traveller never asked for.
        // Reconciliation against the stored idempotency key owns the outcome.
        throw new ReservationDispatchError(
          messageOf(error, "Voyant Connect insurance issue is in doubt"),
          "possibly_sent",
          "insurance_issue_in_doubt",
        )
      }
    },

    async document(input, context) {
      const response = await connectCall(context.signal, "insurance_document_unavailable", () =>
        client.bookings.get(connectionId, input.policyId),
      )
      const documents = decodeList(policyPayload(response)?.documents, decodeDocument)
      const match = pickDocument(documents, input.kind, input.locale ?? context.locale)
      if (!match) {
        throw new Error(
          `Voyant Connect returned no ${input.kind} document for policy ${input.policyId}`,
        )
      }
      return match
    },

    async cancel(input, context) {
      const response = await connectCall(context.signal, "insurance_cancellation_failed", () =>
        client.bookings.cancel(connectionId, input.policyId, { reason: input.reason }),
      )
      return decodeCancellation(response, input)
    },
  }
}

/**
 * The deployment-bound source: the same adapter, with the connection resolved
 * from environment at first use.
 *
 * An operator that has not pointed Connect at an insurance product is a
 * supported, silent state — `quote` returns an empty list rather than throwing,
 * so the checkout step simply has nothing from this insurer to show. The
 * state-changing methods refuse, because nothing can reach them without a quote.
 */
export function createVoyantConnectInsuranceProviderSource(
  primitives: VoyantRuntimeHostPrimitives,
): InsuranceProviderAdapter {
  const env = primitives.env(undefined)
  const providerId = stringValue(env[PROVIDER_ID_VAR]) ?? DEFAULT_PROVIDER_ID
  const displayName = stringValue(env[DISPLAY_NAME_VAR]) ?? DEFAULT_DISPLAY_NAME

  let resolved: InsuranceProviderAdapter | null | undefined
  const resolve = (): InsuranceProviderAdapter | null => {
    if (resolved !== undefined) return resolved
    const config = resolveVoyantConnectEnv(env, {
      warn: (message) => console.warn(`[voyant-connect] ${message}`),
    })
    const connectionId = stringValue(env[CONNECTION_ID_VAR])
    const productId = stringValue(env[PRODUCT_ID_VAR])
    resolved =
      config && connectionId && productId
        ? createConnectInsuranceProviderSource({
            client: createVoyantConnectClient({
              apiKey: config.apiKey,
              operatorId: config.operatorId,
              ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
            }),
            connectionId,
            productId,
            providerId,
            displayName,
          })
        : null
    return resolved
  }
  const required = (): InsuranceProviderAdapter => {
    const source = resolve()
    if (!source) {
      throw new Error(
        `Voyant Connect insurance is not configured; set ${CONNECTION_ID_VAR} and ${PRODUCT_ID_VAR}.`,
      )
    }
    return source
  }

  return {
    providerId,
    displayName,
    async quote(request, context) {
      return (await resolve()?.quote(request, context)) ?? []
    },
    apply: (input, context) => required().apply(input, context),
    issue: (input, context) => required().issue(input, context),
    document: (input, context) => required().document(input, context),
    cancel: (input, context) => required().cancel(input, context),
  }
}

/* -------------------------------------------------------------------------- */
/* Request encoding                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The quote request as it goes on the wire.
 *
 * Rebuilt field by field on purpose. Copying the request wholesale would make
 * "no personal data upstream" a property of whatever `InsuranceQuoteRequest`
 * happens to contain today; projecting each traveller down to a ref, an age and
 * a residency country makes it a property of this function.
 */
function quoteQuery(
  request: InsuranceQuoteRequest,
  productId: string,
  context: InsuranceProviderContext,
): AvailabilityCalendarQueryInput {
  const locale = context.locale ?? request.locale
  return {
    productId,
    connectRoute: CONNECT_ROUTE,
    localDateStart: request.tripStartDate,
    localDateEnd: request.tripEndDate,
    insurance: {
      tripStartDate: request.tripStartDate,
      tripEndDate: request.tripEndDate,
      destinationScope: request.destinationScope,
      travelPurpose: request.travelPurpose,
      currency: context.currency ?? request.currency,
      travelers: request.travelers.map((traveler) => ({
        ref: traveler.ref,
        age: traveler.age,
        ...(traveler.residencyCountry ? { residencyCountry: traveler.residencyCountry } : {}),
      })),
      ...(request.tripCost ? { tripCost: request.tripCost } : {}),
      ...(request.requestedCovers ? { requestedCovers: request.requestedCovers } : {}),
      ...(locale ? { locale } : {}),
    },
  }
}

function applicationBody(
  selection: ConnectQuoteSelection,
  input: InsuranceApplicationInput,
  context: InsuranceProviderContext,
) {
  return {
    productId: selection.productId,
    ...(selection.optionId ? { optionId: selection.optionId } : {}),
    unitItems: [{ unitId: selection.unitId, quantity: input.insuredPersons.length }],
    connectRoute: CONNECT_ROUTE,
    insurance: {
      quoteId: selection.quoteId,
      selectedOptionalCoverIds: input.selectedOptionalCoverIds,
      insuredPersons: input.insuredPersons,
      contractingParty: input.contractingParty,
      answers: input.answers,
      acceptedDisclosures: input.acceptedDisclosures,
      ...(context.locale ? { locale: context.locale } : {}),
    },
  }
}

function assertSameProvider(requested: string, providerId: string) {
  if (requested !== providerId) {
    throw new Error(
      `Voyant Connect insurance source ${providerId} was asked to apply for ${requested}`,
    )
  }
}

/* -------------------------------------------------------------------------- */
/* Transport                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Run a Connect call, cut short by the caller's signal.
 *
 * The SDK's data-plane methods take no `AbortSignal`, so the deadline is
 * enforced on this side. Quoting fans out across every connected insurer with a
 * per-provider deadline, and an adapter that ignored the signal would make the
 * whole checkout step as slow as its worst insurer.
 */
async function raceSignal<T>(signal: AbortSignal | undefined, run: () => Promise<T>): Promise<T> {
  if (!signal) return run()
  if (signal.aborted) throw abortError()
  let onAbort: (() => void) | undefined
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(abortError())
        signal.addEventListener("abort", onAbort, { once: true })
      }),
    ])
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort)
  }
}

function abortError(): Error {
  const error = new Error("Voyant Connect insurance call was aborted")
  error.name = "AbortError"
  return error
}

async function connectCall<T>(
  signal: AbortSignal | undefined,
  errorClass: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await raceSignal(signal, run)
  } catch (error) {
    throw new Error(`${errorClass}: ${messageOf(error, errorClass)}`, { cause: error })
  }
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
