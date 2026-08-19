import type { EventBus, EventSource } from "@voyant-travel/core"
import type {
  PublicApiIntakeSignal,
  PublicApiIntakePersistence as SharedPublicApiIntakePersistence,
} from "@voyant-travel/relationships-contracts/public-api-intake"

export type {
  PublicApiIntakeContext,
  PublicApiIntakePerson,
  PublicApiIntakeSignal,
} from "@voyant-travel/relationships-contracts/public-api-intake"

import type { PublicApiRequestContext } from "./service.js"
import type {
  PublicApiIntakeResponse,
  PublicApiLeadIntakeInput,
  PublicApiNewsletterSubscribeInput,
  PublicApiNewsletterSubscribeResponse,
} from "./validation.js"

export type PublicApiIntakePersistence = SharedPublicApiIntakePersistence<PublicApiRequestContext>

export const CUSTOMER_SIGNAL_CREATED_EVENT = "customer.signal.created" as const

export interface PublicApiCustomerSignalCreatedEvent {
  id: string
  personId: string
  kind: PublicApiIntakeSignal["kind"]
  source: PublicApiIntakeSignal["source"]
  status: PublicApiIntakeSignal["status"]
  productId?: string | null
  optionUnitId?: string | null
  sourceSubmissionId?: string | null
  intake?:
    | {
        surface: "storefront"
        type: "lead"
      }
    | {
        surface: "storefront"
        type: "newsletter"
        doubleOptIn: "not_configured" | "requested"
      }
}

export async function emitCustomerSignalCreated(
  eventBus: EventBus | undefined,
  payload: PublicApiCustomerSignalCreatedEvent,
  source: EventSource = "service",
): Promise<void> {
  if (!eventBus) return
  await eventBus.emit(CUSTOMER_SIGNAL_CREATED_EVENT, payload, {
    category: "domain",
    source,
  })
}

export interface PublicApiIntakeGuardDecision {
  allowed: boolean
  status?: 400 | 403 | 429
  error?: string
}

export type PublicApiIntakeGuard = (
  input:
    | {
        kind: "lead"
        body: PublicApiLeadIntakeInput
        context: PublicApiRequestContext
      }
    | {
        kind: "newsletter"
        body: PublicApiNewsletterSubscribeInput
        context: PublicApiRequestContext
      },
) => Promise<PublicApiIntakeGuardDecision | undefined> | PublicApiIntakeGuardDecision | undefined

export type PublicApiNewsletterDoubleOptInHook = (input: {
  email: string
  personId: string
  signalId: string
  sourceSubmissionId: string
  body: PublicApiNewsletterSubscribeInput
  context: PublicApiRequestContext
}) => Promise<void> | void

export type PublicApiIntakePersistenceResolver = (
  context: PublicApiRequestContext,
) =>
  | Promise<PublicApiIntakePersistence | null | undefined>
  | PublicApiIntakePersistence
  | null
  | undefined

export interface PublicApiIntakeOptions {
  guard?: PublicApiIntakeGuard
  persistence?: PublicApiIntakePersistence
  resolvePersistence?: PublicApiIntakePersistenceResolver
  requestNewsletterDoubleOptIn?: PublicApiNewsletterDoubleOptInHook
}

async function requirePersistence(
  options: PublicApiIntakeOptions | undefined,
  context: PublicApiRequestContext,
) {
  const persistence = (await options?.resolvePersistence?.(context)) ?? options?.persistence ?? null
  if (!persistence) {
    throw new Error("Storefront intake persistence is not configured")
  }
  return persistence
}

function splitName(name: string | undefined): { firstName?: string; lastName?: string } {
  if (!name) return {}
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return {}
  if (parts.length === 1) return { firstName: parts[0] }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
}

function personNameFromNewsletter(input: PublicApiNewsletterSubscribeInput) {
  const split = splitName(input.name)
  const emailLocalPart = input.email
    .split("@")[0]
    ?.replace(/[._-]+/g, " ")
    .trim()
  return {
    firstName: input.firstName ?? split.firstName ?? emailLocalPart ?? "Newsletter",
    lastName: input.lastName ?? split.lastName ?? "Subscriber",
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function defaultNewsletterSubmissionId(email: string) {
  return `newsletter:${normalizeEmail(email)}`
}

function normalizePhone(phone: string | undefined) {
  return phone?.replace(/[^\d+]/g, "").toLowerCase()
}

function defaultLeadSubmissionId(input: PublicApiLeadIntakeInput) {
  const contactKey = input.contact.email
    ? `email:${normalizeEmail(input.contact.email)}`
    : `phone:${normalizePhone(input.contact.phone) ?? "unknown"}`
  return [
    "lead",
    input.kind,
    input.source,
    input.productId ?? "-",
    input.optionUnitId ?? "-",
    contactKey,
  ].join(":")
}

async function findExistingSignal(
  persistence: PublicApiIntakePersistence,
  context: PublicApiRequestContext,
  input: {
    kind: PublicApiIntakeSignal["kind"]
    sourceSubmissionId?: string | null
  },
) {
  if (!input.sourceSubmissionId) return null
  return await persistence.findSignal({
    context,
    kind: input.kind,
    sourceSubmissionId: input.sourceSubmissionId,
  })
}

function leadResponse(
  signal: NonNullable<Awaited<ReturnType<typeof findExistingSignal>>>,
  duplicate: boolean,
): PublicApiIntakeResponse {
  return {
    id: signal.id,
    personId: signal.personId,
    kind: signal.kind,
    source: signal.source,
    status: signal.status,
    duplicate,
  }
}

function newsletterDoubleOptInFromSignal(
  signal: NonNullable<Awaited<ReturnType<typeof findExistingSignal>>>,
) {
  const metadata = signal.metadata
  const newsletter =
    metadata && typeof metadata === "object" && "newsletter" in metadata
      ? metadata.newsletter
      : null
  if (!newsletter || typeof newsletter !== "object" || !("doubleOptIn" in newsletter)) {
    return "not_configured"
  }
  return newsletter.doubleOptIn === "requested" ? "requested" : "not_configured"
}

function newsletterSignalMetadata(input: {
  email: string
  doubleOptIn: "not_configured" | "requested"
  body: PublicApiNewsletterSubscribeInput
}) {
  return {
    intake: { surface: "storefront", type: "newsletter" },
    newsletter: { email: input.email, doubleOptIn: input.doubleOptIn },
    payload: input.body.payload,
    consent: input.body.consent,
    source: {
      url: input.body.sourceUrl ?? null,
      locale: input.body.locale ?? null,
    },
  }
}

export async function createPublicApiLeadSignal(input: {
  body: PublicApiLeadIntakeInput
  context: PublicApiRequestContext
  intake?: PublicApiIntakeOptions
}): Promise<PublicApiIntakeResponse> {
  const persistence = await requirePersistence(input.intake, input.context)
  const sourceSubmissionId = input.body.sourceSubmissionId ?? defaultLeadSubmissionId(input.body)
  const explicitName =
    input.body.contact.name ??
    [input.body.contact.firstName, input.body.contact.lastName].filter(Boolean).join(" ")
  const inquiry = await persistence.createInquiry({
    context: input.context,
    data: {
      sourceRef: sourceSubmissionId,
      contact: {
        ...(explicitName ? { name: explicitName } : {}),
        ...(input.body.contact.email ? { email: normalizeEmail(input.body.contact.email) } : {}),
        ...(input.body.contact.phone ? { phone: input.body.contact.phone } : {}),
      },
      productId: input.body.productId,
      optionUnitId: input.body.optionUnitId,
      message: input.body.notes,
      sourceUrl: input.body.sourceUrl,
      locale: input.body.locale,
      tags: input.body.tags,
      payload: input.body.payload,
      consent: input.body.consent,
    },
  })

  return {
    id: inquiry.id,
    personId: inquiry.personId ?? "",
    kind: input.body.kind,
    source: input.body.source,
    status: "new",
    duplicate: inquiry.duplicate,
  }
}

export async function subscribePublicApiNewsletter(input: {
  body: PublicApiNewsletterSubscribeInput
  context: PublicApiRequestContext
  intake?: PublicApiIntakeOptions
  requestDoubleOptIn?: PublicApiNewsletterDoubleOptInHook
}): Promise<PublicApiNewsletterSubscribeResponse> {
  const persistence = await requirePersistence(input.intake, input.context)
  const email = normalizeEmail(input.body.email)
  const sourceSubmissionId =
    input.body.sourceSubmissionId ?? defaultNewsletterSubmissionId(input.body.email)
  const existing = await findExistingSignal(persistence, input.context, {
    kind: "notify",
    sourceSubmissionId,
  })
  if (existing) {
    return {
      ...leadResponse(existing, true),
      doubleOptIn: newsletterDoubleOptInFromSignal(existing),
    }
  }

  const { firstName, lastName } = personNameFromNewsletter(input.body)
  const person = await persistence.createPerson({
    context: input.context,
    data: {
      firstName,
      lastName,
      status: "active",
      website: null,
      email,
      source: "storefront-newsletter",
      sourceRef: sourceSubmissionId,
      tags: input.body.tags,
    },
  })
  if (!person) throw new Error("Failed to create intake person for newsletter subscription")

  const doubleOptIn = input.requestDoubleOptIn ? "requested" : "not_configured"
  let signal = await persistence.createCustomerSignal({
    context: input.context,
    data: {
      personId: person.id,
      kind: "notify",
      source: input.body.source,
      status: "new",
      priority: "normal",
      notes: "Newsletter subscription",
      tags: input.body.tags,
      sourceSubmissionId,
      metadata: newsletterSignalMetadata({
        email,
        doubleOptIn: "not_configured",
        body: input.body,
      }),
    },
  })
  if (!signal) throw new Error("Failed to create customer signal for newsletter subscription")

  if (input.requestDoubleOptIn) {
    try {
      await input.requestDoubleOptIn({
        email,
        personId: person.id,
        signalId: signal.id,
        sourceSubmissionId,
        body: input.body,
        context: input.context,
      })
    } catch (error) {
      await Promise.resolve(
        persistence.deleteCustomerSignal({
          context: input.context,
          id: signal.id,
        }),
      ).catch(() => null)
      await Promise.resolve(
        persistence.deletePerson({
          context: input.context,
          id: person.id,
        }),
      ).catch(() => null)
      throw error
    }

    signal =
      (await persistence.updateCustomerSignal({
        context: input.context,
        id: signal.id,
        data: {
          metadata: newsletterSignalMetadata({
            email,
            doubleOptIn,
            body: input.body,
          }),
        },
      })) ?? signal
  }

  await emitCustomerSignalCreated(
    input.context.eventBus,
    {
      id: signal.id,
      personId: signal.personId,
      kind: signal.kind,
      source: signal.source,
      status: signal.status,
      productId: signal.productId,
      optionUnitId: signal.optionUnitId,
      sourceSubmissionId: signal.sourceSubmissionId,
      intake: { surface: "storefront", type: "newsletter", doubleOptIn },
    },
    "route",
  )

  return {
    ...leadResponse(signal, false),
    doubleOptIn,
  }
}
