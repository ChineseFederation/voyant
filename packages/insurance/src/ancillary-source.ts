/**
 * The insurance module as one `commerce.ancillary-offer-source`.
 *
 * The cardinality changes here and that is the point of the file. Commerce
 * knows about a single seam and never learns what an insurer is; this side of
 * it fans out across every connected insurer. So the port is one-valued at the
 * commerce boundary and many-valued at the insurer boundary, and the code that
 * turns one into the other lives in exactly one place.
 *
 * The fan-out mirrors `packages/catalog/src/search/availability-fan-out.ts`: run
 * every provider in parallel, give each one a hard deadline, and let a slow or
 * broken provider become a `diagnostics` entry rather than a failed checkout
 * step. A traveller with two insurers connected, one of which is down, sees one
 * offer — not an error page.
 *
 * The quote request carries **ages and dates only**. That is not a convention
 * to remember: `AncillaryQuoteInput` and `InsuranceQuoteRequest` are both
 * closed shapes with nowhere to put a name, and `buildInsuranceQuoteRequest`
 * below is the only thing that constructs one.
 */

import type {
  AncillaryDisclosureV1,
  AncillaryOfferGroupV1,
  AncillaryOfferV1,
  AncillarySourceDiagnosticV1,
  AncillaryTravelerFieldV1,
} from "@voyant-travel/catalog-contracts/booking-engine/ancillary-contracts"
import { orderAncillaryOffers } from "@voyant-travel/catalog-contracts/booking-engine/ancillary-contracts"
import type {
  AncillaryCancelInput,
  AncillaryFulfillInput,
  AncillaryFulfillmentResult,
  AncillaryOfferSource,
  AncillaryPreparedSelection,
  AncillaryPrepareInput,
  AncillaryQuoteInput,
} from "@voyant-travel/commerce/checkout/ancillary-ports"
import type { EventBus } from "@voyant-travel/core"
import type {
  InsuranceApplicationInput,
  InsuranceCover,
  InsuranceDestinationScope,
  InsuranceProviderAdapter,
  InsuranceQuote,
  InsuranceQuoteRequest,
} from "@voyant-travel/insurance-contracts"
import { headlineSumInsured } from "@voyant-travel/insurance-contracts"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { InsuranceBookingIntegration } from "./booking-integration.js"
import { type InsurancePiiService, toInsuredPersonInput } from "./pii.js"
import {
  attachInsuranceApplicationToBooking,
  createInsuranceApplication,
  getInsuranceApplication,
} from "./service-applications.js"
import {
  cancelInsurancePolicy,
  getInsurancePolicyForApplication,
  issueInsurancePolicy,
} from "./service-policies.js"

/** Stable across deployments; stamped on every offer and every selection. */
export const INSURANCE_ANCILLARY_SOURCE_ID = "insurance" as const
export const INSURANCE_ANCILLARY_KIND = "insurance" as const

/** One slow insurer must not become the checkout step's latency. */
export const DEFAULT_INSURANCE_QUOTE_TIMEOUT_MS = 5000

/**
 * The per-traveller fields an insurer needs before it will commit.
 *
 * Declared as data so the checkout step renders them without knowing what
 * insurance is, and marked `sensitive` where they are — a sensitive field is
 * collected only after an offer is accepted, kept minimal on screen, and never
 * logged.
 */
export const INSURANCE_TRAVELER_FIELD_KEYS = {
  givenName: "given_name",
  familyName: "family_name",
  dateOfBirth: "date_of_birth",
  documentType: "identity_document_type",
  documentNumber: "identity_document_number",
  documentCountry: "identity_document_country",
} as const

export interface InsuranceAncillarySourceLabels {
  /** How the bucket is named to a traveller, already localised. */
  group: string
  fields: {
    givenName: string
    familyName: string
    dateOfBirth: string
    documentType: string
    documentNumber: string
    documentCountry: string
  }
  highlights: {
    sumInsured: string
    excess: string
    covers: string
  }
}

/**
 * English is the fallback, not the policy.
 *
 * A deployment passes its own localised labels; these exist so a source
 * constructed without them still produces something readable rather than
 * message keys leaking onto a checkout page.
 */
export const DEFAULT_INSURANCE_LABELS: InsuranceAncillarySourceLabels = {
  group: "Travel insurance",
  fields: {
    givenName: "First name",
    familyName: "Last name",
    dateOfBirth: "Date of birth",
    documentType: "Document type",
    documentNumber: "Document number",
    documentCountry: "Issuing country",
  },
  highlights: {
    sumInsured: "Cover up to",
    excess: "Excess",
    covers: "Includes",
  },
}

export interface InsuranceAncillarySourceOptions {
  /**
   * Every bound `insurance.provider-source`. A function rather than an array so
   * the runtime factory can pass `() => getPorts(insuranceProviderSourcePort)`
   * and the set stays whatever the graph resolved.
   */
  resolveProviders: () => Promise<readonly InsuranceProviderAdapter[]>
  resolveDb: () => PostgresJsDatabase | Promise<PostgresJsDatabase>
  /**
   * Resolvers rather than values, because everything here is resolved from the
   * deployment graph — and a source constructed at module load would capture a
   * runtime the graph had not composed yet.
   */
  resolvePii: () => InsurancePiiService | Promise<InsurancePiiService>
  resolveIntegration?: () => InsuranceBookingIntegration | Promise<InsuranceBookingIntegration>
  /**
   * The bus the module's declared events go to. Resolved lazily for the same
   * reason as everything else here: the source is constructed while the graph
   * is still composing.
   */
  resolveEventBus?: () => EventBus | undefined | Promise<EventBus | undefined>
  perProviderTimeoutMs?: number
  labels?: InsuranceAncillarySourceLabels
  sourceId?: string
  now?: () => Date
}

/**
 * The opaque handle a selection carries back.
 *
 * Base64url over `{p, q}` rather than a delimiter join: a provider id or quote
 * id containing the delimiter would silently produce a ref that resolves to the
 * wrong quote, and "opaque" has to mean the caller cannot construct one.
 */
export function encodeInsuranceQuoteRef(providerId: string, quoteId: string): string {
  return Buffer.from(JSON.stringify({ p: providerId, q: quoteId }), "utf8").toString("base64url")
}

export function decodeInsuranceQuoteRef(
  ref: string,
): { providerId: string; quoteId: string } | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(ref, "base64url").toString("utf8"))
    if (parsed === null || typeof parsed !== "object") return null
    const candidate = parsed as { p?: unknown; q?: unknown }
    if (typeof candidate.p !== "string" || typeof candidate.q !== "string") return null
    return { providerId: candidate.p, quoteId: candidate.q }
  } catch {
    return null
  }
}

/**
 * Turn the trip into something an insurer can price.
 *
 * The only function in this package that builds a quote request, so "the quote
 * carries no personal data" is checkable by reading one place. Every field it
 * reads from `input` is an age, a date, a country or a currency; the traveller
 * `ref` is the caller's own opaque handle and is echoed back on refusal reasons
 * so a storefront can anchor them.
 */
export function buildInsuranceQuoteRequest(input: AncillaryQuoteInput): InsuranceQuoteRequest {
  const destinationScope: InsuranceDestinationScope =
    input.destinationCountries.length > 0
      ? { kind: "countries", countries: [...input.destinationCountries] }
      : { kind: "worldwide" }

  return {
    tripStartDate: input.tripStartDate,
    tripEndDate: input.tripEndDate,
    destinationScope,
    travelPurpose: "leisure",
    travelers: input.travelers.map((traveler) => ({
      ref: traveler.ref,
      age: traveler.age,
      ...(input.originCountry ? { residencyCountry: input.originCountry } : {}),
    })),
    ...(typeof input.tripCostMinor === "number"
      ? { tripCost: { amountMinor: input.tripCostMinor, currency: input.currency } }
      : {}),
    currency: input.currency,
    ...(input.locale ? { locale: input.locale } : {}),
  }
}

interface ProviderOutcome {
  providerId: string
  quotes: InsuranceQuote[]
  diagnostic: AncillarySourceDiagnosticV1
}

async function quoteOneProvider(
  sourceId: string,
  provider: InsuranceProviderAdapter,
  request: InsuranceQuoteRequest,
  timeoutMs: number,
  locale: string | undefined,
): Promise<ProviderOutcome> {
  const startedAt = Date.now()
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      // Abort as well as resolve: a provider that honours the signal stops
      // work, and one that does not at least stops holding the step up.
      controller.abort()
      resolve("timeout")
    }, timeoutMs)
  })

  try {
    const outcome = await Promise.race([
      provider.quote(request, {
        signal: controller.signal,
        currency: request.currency,
        ...(locale ? { locale } : {}),
      }),
      timeout,
    ])

    const latencyMs = Date.now() - startedAt
    if (outcome === "timeout") {
      return {
        providerId: provider.providerId,
        quotes: [],
        diagnostic: {
          sourceId,
          providerId: provider.providerId,
          status: "timeout",
          message: `${provider.displayName} did not answer within ${timeoutMs}ms.`,
          latencyMs,
        },
      }
    }

    return {
      providerId: provider.providerId,
      quotes: [...outcome],
      diagnostic: {
        sourceId,
        providerId: provider.providerId,
        status: outcome.length > 0 ? "ok" : "unavailable",
        ...(outcome.length > 0 ? {} : { message: `${provider.displayName} returned no plans.` }),
        latencyMs,
      },
    }
  } catch (error) {
    return {
      providerId: provider.providerId,
      quotes: [],
      diagnostic: {
        sourceId,
        providerId: provider.providerId,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startedAt,
      },
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function coverHighlights(
  covers: readonly InsuranceCover[],
  labels: InsuranceAncillarySourceLabels,
): AncillaryOfferV1["highlights"] {
  const included = covers.filter((cover) => cover.included)
  const headline = headlineSumInsured(covers)
  const highlights: Array<{ label: string; value?: string }> = []

  if (headline) {
    highlights.push({
      label: labels.highlights.sumInsured,
      value: formatMinor(headline.amountMinor, headline.currency),
    })
  }
  const excess = included.find((cover) => cover.excess)?.excess
  if (excess) {
    highlights.push({
      label: labels.highlights.excess,
      value: formatMinor(excess.amountMinor, excess.currency),
    })
  }
  if (included.length > 0) {
    // The insurer's own wording, already localised — never a category slug
    // re-labelled here, which would be this package inventing product copy.
    highlights.push({
      label: labels.highlights.covers,
      value: included
        .slice(0, 4)
        .map((cover) => cover.label)
        .join(", "),
    })
  }
  return highlights
}

/**
 * A minor-unit amount rendered as a bare decimal plus its code.
 *
 * Deliberately not locale-aware: this string is a highlight value inside an
 * offer, and the surface that renders it owns the shopper's locale. Formatting
 * here would produce a second, divergent money format on the same page.
 */
function formatMinor(amountMinor: number, currency: string): string {
  return `${(amountMinor / 100).toFixed(2)} ${currency}`
}

function travelerFields(labels: InsuranceAncillarySourceLabels): AncillaryTravelerFieldV1[] {
  return [
    {
      key: INSURANCE_TRAVELER_FIELD_KEYS.givenName,
      label: labels.fields.givenName,
      type: "text",
      required: true,
      sensitive: true,
    },
    {
      key: INSURANCE_TRAVELER_FIELD_KEYS.familyName,
      label: labels.fields.familyName,
      type: "text",
      required: true,
      sensitive: true,
    },
    {
      key: INSURANCE_TRAVELER_FIELD_KEYS.dateOfBirth,
      label: labels.fields.dateOfBirth,
      type: "date",
      required: true,
      sensitive: true,
    },
    {
      key: INSURANCE_TRAVELER_FIELD_KEYS.documentType,
      label: labels.fields.documentType,
      type: "select",
      required: false,
      sensitive: true,
      options: [
        { value: "passport", label: "Passport" },
        { value: "national_identity", label: "National identity document" },
        { value: "residence_permit", label: "Residence permit" },
      ],
    },
    {
      key: INSURANCE_TRAVELER_FIELD_KEYS.documentNumber,
      label: labels.fields.documentNumber,
      type: "text",
      required: false,
      sensitive: true,
    },
    {
      key: INSURANCE_TRAVELER_FIELD_KEYS.documentCountry,
      label: labels.fields.documentCountry,
      type: "text",
      required: false,
      sensitive: true,
    },
  ]
}

function toDisclosures(quote: InsuranceQuote): AncillaryDisclosureV1[] {
  return quote.disclosures.map((disclosure) => ({
    kind: disclosure.kind,
    label: disclosure.label,
    versionId: disclosure.versionId,
    ...(disclosure.document.source.kind === "url" ? { url: disclosure.document.source.url } : {}),
    required: disclosure.required,
  }))
}

/** `InsuranceQuote` → `AncillaryOfferV1`. Nothing insurance-specific escapes. */
export function toAncillaryOffer(
  quote: InsuranceQuote,
  sourceId: string,
  labels: InsuranceAncillarySourceLabels,
): AncillaryOfferV1 {
  return {
    offerId: quote.quoteId,
    sourceId,
    providerId: quote.providerId,
    providerLabel: quote.providerLabel,
    kind: INSURANCE_ANCILLARY_KIND,
    title: quote.planName,
    // `planTier` is the insurer's own wording and is carried as `planLabel`,
    // which the contracts mark display-only. It is never a sort key here.
    ...(quote.planTier ? { planLabel: quote.planTier } : {}),
    price: quote.premium,
    pricedPerPerson: false,
    highlights: coverHighlights(quote.includedCovers, labels),
    eligibility: {
      status: quote.eligibility.status,
      reasons: quote.eligibility.reasons.map((reason) => ({
        code: reason.code,
        message: reason.message,
      })),
    },
    disclosures: toDisclosures(quote),
    requiredTravelerFields: travelerFields(labels),
    validUntil: quote.validUntil,
    quoteRef: encodeInsuranceQuoteRef(quote.providerId, quote.quoteId),
    metadata: { planId: quote.planId },
  }
}

/**
 * Build the insured set from what the checkout step collected.
 *
 * A traveller whose required fields are missing is skipped rather than sent to
 * the insurer half-populated: an application rejected for a blank surname is
 * indistinguishable, from the traveller's side, from an insurer declining them.
 */
function toApplicationInput(
  input: AncillaryPrepareInput,
  quoteId: string,
  providerId: string,
): InsuranceApplicationInput | null {
  const keys = INSURANCE_TRAVELER_FIELD_KEYS
  // A row that cannot be named is a REFUSAL, not something to skip. Dropping it
  // and applying for the rest issues a policy covering fewer people than the
  // traveller paid to cover, and nothing downstream ever says so — the booking
  // total is right, the certificate lists two of four, and it surfaces at a
  // claim. So one incomplete row fails the whole application.
  const incomplete = input.selection.travelers.some(
    (traveler) =>
      !traveler.fields[keys.givenName] ||
      !traveler.fields[keys.familyName] ||
      !traveler.fields[keys.dateOfBirth],
  )
  if (incomplete) return null
  const insuredPersons = input.selection.travelers.flatMap((traveler) => {
    const givenName = traveler.fields[keys.givenName]
    const familyName = traveler.fields[keys.familyName]
    const dateOfBirth = traveler.fields[keys.dateOfBirth]
    if (!givenName || !familyName || !dateOfBirth) return []

    const documentNumber = traveler.fields[keys.documentNumber]
    const documentCountry = traveler.fields[keys.documentCountry]
    const documentType = traveler.fields[keys.documentType]

    return [
      {
        ref: traveler.ref,
        givenName,
        familyName,
        dateOfBirth,
        identityDocuments:
          documentNumber && documentCountry
            ? [
                {
                  type: (documentType ??
                    "passport") as InsuranceApplicationInput["insuredPersons"][number]["identityDocuments"][number]["type"],
                  number: documentNumber,
                  issuingCountry: documentCountry,
                },
              ]
            : [],
        bookingTravelerRef: traveler.ref,
      },
    ]
  })

  if (insuredPersons.length === 0) return null

  return {
    quoteId,
    providerId,
    selectedOptionalCoverIds: [...input.selection.selectedOptionIds],
    insuredPersons,
    contractingParty: {
      givenName: input.contact.firstName,
      familyName: input.contact.lastName,
      email: input.contact.email,
      ...(input.contact.phone ? { phone: input.contact.phone } : {}),
    },
    answers: [],
    acceptedDisclosures: input.selection.acceptedDisclosures.map((entry) => ({
      kind: entry.kind,
      versionId: entry.versionId,
      acceptedAt: entry.acceptedAt,
    })),
  }
}

export function createInsuranceAncillaryOfferSource(
  options: InsuranceAncillarySourceOptions,
): AncillaryOfferSource {
  const sourceId = options.sourceId ?? INSURANCE_ANCILLARY_SOURCE_ID
  const labels = options.labels ?? DEFAULT_INSURANCE_LABELS
  const timeoutMs = options.perProviderTimeoutMs ?? DEFAULT_INSURANCE_QUOTE_TIMEOUT_MS
  const now = () => options.now?.() ?? new Date()

  async function resolveProvider(providerId: string): Promise<InsuranceProviderAdapter | null> {
    const providers = await options.resolveProviders()
    return providers.find((provider) => provider.providerId === providerId) ?? null
  }

  return {
    sourceId,
    kind: INSURANCE_ANCILLARY_KIND,
    label: labels.group,

    async quote(input: AncillaryQuoteInput): Promise<AncillaryOfferGroupV1> {
      const providers = await options.resolveProviders()
      if (providers.length === 0) {
        // Zero connected insurers is a supported, silent state — not an error
        // and not an empty state with an explanation. The step simply has
        // nothing to show and does not mount.
        return { kind: INSURANCE_ANCILLARY_KIND, label: labels.group, offers: [], diagnostics: [] }
      }

      const request = buildInsuranceQuoteRequest(input)
      const outcomes = await Promise.all(
        providers.map((provider) =>
          quoteOneProvider(sourceId, provider, request, timeoutMs, input.locale),
        ),
      )

      const offers = outcomes.flatMap((outcome) =>
        outcome.quotes.map((quote) => toAncillaryOffer(quote, sourceId, labels)),
      )

      return {
        kind: INSURANCE_ANCILLARY_KIND,
        label: labels.group,
        offers: orderAncillaryOffers(offers),
        diagnostics: outcomes.map((outcome) => outcome.diagnostic),
      }
    },

    async prepare(input: AncillaryPrepareInput): Promise<AncillaryPreparedSelection> {
      const quoteRef = input.selection.quoteRef
      if (!quoteRef) throw new Error("An accepted insurance selection must carry a quoteRef.")
      const decoded = decodeInsuranceQuoteRef(quoteRef)
      if (!decoded) throw new Error("The insurance selection's quoteRef is not resolvable.")

      const provider = await resolveProvider(decoded.providerId)
      if (!provider) {
        throw new Error(`No insurance provider is connected for "${decoded.providerId}".`)
      }

      const applicationInput = toApplicationInput(input, decoded.quoteId, decoded.providerId)
      if (!applicationInput) {
        throw new Error("Every insured person needs a name and a date of birth.")
      }

      const application = await provider.apply(applicationInput, {
        idempotencyKey: input.idempotencyKey,
      })

      const db = await options.resolveDb()
      const row = await createInsuranceApplication(
        db,
        { pii: await options.resolvePii(), eventBus: await options.resolveEventBus?.() },
        {
          bookingSessionId: input.bookingSessionId,
          sourceId,
          providerId: provider.providerId,
          providerApplicationRef: application.applicationId,
          quoteRef,
          title: `${provider.displayName} travel insurance`,
          planName: null,
          status: application.status,
          expiresAt: new Date(application.expiresAt),
          premium: application.premium,
          eligibility: application.eligibility,
          selectedOptionalCoverIds: applicationInput.selectedOptionalCoverIds,
          acceptedDisclosures: applicationInput.acceptedDisclosures,
          insuredPersons: application.insuredPersons.map((person) => toInsuredPersonInput(person)),
          contractingParty: application.contractingParty,
          answers: application.answers,
        },
      )

      return {
        sourceId,
        providerId: provider.providerId,
        applicationRef: row.id,
        // Authoritative from here on: what the insurer will hold, not what it
        // quoted. A price it can no longer honour is re-confirmed with the
        // traveller by the caller, never silently charged.
        priceMinor: application.premium.amountMinor,
        currency: application.premium.currency,
        title: row.title,
        expiresAt: row.expiresAt.toISOString(),
      }
    },

    async fulfill(input: AncillaryFulfillInput): Promise<AncillaryFulfillmentResult> {
      const db = await options.resolveDb()
      const application = await getInsuranceApplication(db, input.applicationRef)
      if (!application) {
        return {
          status: "failed",
          code: "application_not_found",
          message: `No insurance application ${input.applicationRef}.`,
          retryable: false,
        }
      }

      if (!application.bookingId) {
        await attachInsuranceApplicationToBooking(db, application.id, input.bookingId)
      }

      // A re-delivered `payment.completed` re-runs the finalize saga from its
      // first step, so this is reached again for a policy that already exists.
      // Answering from the row rather than asking the insurer again is what
      // makes the second run free: `issue` is idempotent at the provider by
      // key, but a second call still costs a round trip and a second
      // `issueAttempts` bump that reads like a retry after a failure.
      const existing = await getInsurancePolicyForApplication(db, application.id)
      if (existing?.issueState === "issued") {
        return {
          status: "fulfilled",
          reference: existing.policyNumber ?? existing.id,
          settledPriceMinor: existing.premiumAmountMinor,
          currency: existing.premiumCurrency,
          documentIds: [],
        }
      }

      const provider = await resolveProvider(application.providerId)
      if (!provider) {
        return {
          status: "failed",
          code: "provider_not_connected",
          message: `No insurance provider is connected for "${application.providerId}".`,
          retryable: true,
        }
      }

      const result = await issueInsurancePolicy(
        db,
        {
          pii: await options.resolvePii(),
          integration: await options.resolveIntegration?.(),
          eventBus: await options.resolveEventBus?.(),
          now,
        },
        {
          application: { ...application, bookingId: input.bookingId },
          provider,
          bookingId: input.bookingId,
          idempotencyKey: input.idempotencyKey,
          // `fulfill` is only ever called once payment has succeeded, so the
          // failure path here always raises the staff alert.
          paid: true,
        },
      )

      if (result.status === "failed") {
        return {
          status: "failed",
          code: result.code,
          message: result.message,
          retryable: result.retryable,
        }
      }

      return {
        status: "fulfilled",
        reference: result.policy.policyNumber ?? result.policy.id,
        settledPriceMinor: result.policy.premiumAmountMinor,
        currency: result.policy.premiumCurrency,
        documentIds: result.documentIds,
      }
    },

    async cancel(input: AncillaryCancelInput): Promise<void> {
      const db = await options.resolveDb()
      const application = await getInsuranceApplication(db, input.applicationRef)
      if (!application) return

      const policy = await getInsurancePolicyForApplication(db, application.id)
      // Nothing to unwind unless the insurer actually issued: cancelling a
      // pending or failed attempt at the insurer asks it about a policy it does
      // not have.
      if (policy?.issueState !== "issued") return

      const provider = await resolveProvider(application.providerId)
      if (!provider) return

      await cancelInsurancePolicy(
        db,
        {
          pii: await options.resolvePii(),
          integration: await options.resolveIntegration?.(),
          eventBus: await options.resolveEventBus?.(),
          now,
        },
        {
          policy,
          provider,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
        },
      )
    },
  }
}
