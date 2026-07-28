import { sha256 } from "@voyant-travel/action-ledger"
import { bookingItems, bookings } from "@voyant-travel/bookings/schema"
import { and, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"
import { legalContractDetail } from "./contract-dto.js"
import { contracts, contractTemplates, contractTemplateVersions } from "./contracts/schema.js"
import type { bookingContractReviewSchema } from "./tools.js"

type BookingContractReview = z.infer<typeof bookingContractReviewSchema>

export async function bookingContractContentFingerprint(contract: {
  id: string
  bookingId: string | null
  title: string
  language: string
  templateVersionId: string | null
  variables: unknown
  renderedBody: string | null
}): Promise<string> {
  const digest = await sha256({
    contractId: contract.id,
    bookingId: contract.bookingId,
    title: contract.title,
    language: contract.language,
    templateVersionId: contract.templateVersionId,
    variables: contract.variables,
    renderedBody: contract.renderedBody,
  })
  return `booking-contract-content:v1:sha256:${digest}`
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function requiredVariables(schema: unknown): string[] {
  const required = record(schema).required
  return Array.isArray(required)
    ? required.filter((value): value is string => typeof value === "string")
    : []
}

function valueAtPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => record(current)[segment], value)
}

export function bookingContractPrerequisites(input: {
  templateApplicable: boolean
  customerEmail: string | null
  totalAmountCents: number | null
  itemCount: number
  missingRequiredVariables?: readonly string[]
}): string[] {
  return [
    ...(input.templateApplicable ? [] : ["template.applicableCurrentVersion"]),
    ...(input.customerEmail ? [] : ["customer.email"]),
    ...(input.totalAmountCents == null ? ["commercial.totalAmountCents"] : []),
    ...(input.itemCount > 0 ? [] : ["booking.items"]),
    ...(input.missingRequiredVariables ?? []),
  ].filter((value, index, values) => values.indexOf(value) === index)
}

export async function listApplicableBookingContractTemplates(
  db: PostgresJsDatabase,
  input: { bookingId: string; language?: string; channelId?: string },
) {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1)
  if (!booking) return { bookingFound: false, data: [] }
  const bookingProductRows = await db
    .select()
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, booking.id))
  const primaryProduct = bookingProductRows[0]

  const language =
    input.language ?? booking.communicationLanguage ?? booking.contactPreferredLanguage ?? "en"
  const templates = await db
    .select()
    .from(contractTemplates)
    .where(
      and(
        eq(contractTemplates.scope, "customer"),
        eq(contractTemplates.active, true),
        eq(contractTemplates.language, language),
      ),
    )

  const bookingVariables = {
    booking: {
      id: booking.id,
      reference: booking.bookingNumber,
      startDate: booking.startDate,
      endDate: booking.endDate,
      productName: primaryProduct?.productNameSnapshot ?? primaryProduct?.title ?? null,
      items: bookingProductRows.map((item) => ({
        title: item.productNameSnapshot ?? item.title,
        quantity: item.quantity,
        amountCents: item.totalSellAmountCents,
        currency: item.sellCurrency,
      })),
    },
    customer: {
      name: [booking.contactFirstName, booking.contactLastName].filter(Boolean).join(" ") || null,
      email: booking.contactEmail,
    },
    commercial: { currency: booking.sellCurrency, totalAmountCents: booking.sellAmountCents },
    product: {
      title: primaryProduct?.productNameSnapshot ?? primaryProduct?.title ?? null,
    },
  }

  const data = await Promise.all(
    templates
      .filter(
        (template) =>
          !input.channelId || !template.channelId || template.channelId === input.channelId,
      )
      .map(async (template) => {
        const version = template.currentVersionId
          ? await db
              .select()
              .from(contractTemplateVersions)
              .where(eq(contractTemplateVersions.id, template.currentVersionId))
              .limit(1)
              .then(([row]) => row ?? null)
          : null
        const required = requiredVariables(version?.variableSchema ?? template.variableSchema)
        const missing = bookingContractPrerequisites({
          templateApplicable: !!version,
          customerEmail: booking.contactEmail,
          totalAmountCents: booking.sellAmountCents,
          itemCount: bookingProductRows.length,
          missingRequiredVariables: required.filter(
            (path) => valueAtPath(bookingVariables, path) == null,
          ),
        })
        return {
          id: template.id,
          name: template.name,
          slug: template.slug,
          scope: template.scope,
          language: template.language,
          description: template.description,
          currentVersionId: template.currentVersionId,
          channelId: template.channelId,
          isDefault: template.isDefault,
          active: template.active,
          createdAt: template.createdAt.toISOString(),
          updatedAt: template.updatedAt.toISOString(),
          applicable: missing.length === 0,
          missingPrerequisites: missing,
          requiredVariables: required,
        }
      }),
  )
  return { bookingFound: true, data }
}

export async function getBookingContractReview(
  db: PostgresJsDatabase,
  contractId: string,
): Promise<BookingContractReview | null> {
  const [row] = await db
    .select({
      contract: contracts,
      booking: bookings,
      template: contractTemplates,
      version: contractTemplateVersions,
    })
    .from(contracts)
    .innerJoin(bookings, eq(contracts.bookingId, bookings.id))
    .innerJoin(
      contractTemplateVersions,
      eq(contracts.templateVersionId, contractTemplateVersions.id),
    )
    .innerJoin(contractTemplates, eq(contractTemplateVersions.templateId, contractTemplates.id))
    .where(eq(contracts.id, contractId))
    .limit(1)
  if (!row) return null
  const items = await db
    .select()
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, row.booking.id))
  const metadata = record(row.contract.metadata)
  const workflow = record(metadata.bookingContractWorkflow)
  const delivery = record(workflow.delivery)
  const effectiveStatus =
    row.contract.status === "void"
      ? "void"
      : row.contract.status === "signed" || row.contract.status === "executed"
        ? "signed"
        : delivery.declinedAt
          ? "declined"
          : delivery.viewedAt
            ? "viewed"
            : row.contract.status === "sent"
              ? "sent"
              : "draft"

  return {
    contract: legalContractDetail(row.contract),
    contentFingerprint: await bookingContractContentFingerprint(row.contract),
    effectiveStatus,
    revision: typeof workflow.revision === "number" ? workflow.revision : 1,
    previousRevisionId:
      typeof workflow.previousRevisionId === "string" ? workflow.previousRevisionId : null,
    booking: {
      id: row.booking.id,
      reference: row.booking.bookingNumber,
      customerName:
        [row.booking.contactFirstName, row.booking.contactLastName].filter(Boolean).join(" ") ||
        null,
      customerEmail: row.booking.contactEmail,
      language: row.contract.language,
      currency: row.booking.sellCurrency,
      totalAmountCents: row.booking.sellAmountCents,
      startDate: row.booking.startDate,
      endDate: row.booking.endDate,
    },
    products: items.map((item) => ({
      title: item.productNameSnapshot ?? item.title,
      quantity: item.quantity,
      amountCents: item.totalSellAmountCents,
      currency: item.sellCurrency,
    })),
    template: {
      id: row.template.id,
      name: row.template.name,
      versionId: row.version.id,
      version: row.version.version,
      language: row.template.language,
    },
    commercialTerms: record(
      record(row.contract.variables).commercial,
    ) as BookingContractReview["commercialTerms"],
    delivery: {
      recipient: typeof delivery.recipient === "string" ? delivery.recipient : null,
      channel:
        delivery.channel === "email" ||
        delivery.channel === "sms" ||
        delivery.channel === "whatsapp"
          ? delivery.channel
          : null,
      sentRevision: typeof delivery.revision === "number" ? delivery.revision : null,
      sentAt: row.contract.sentAt?.toISOString() ?? null,
      viewedAt: typeof delivery.viewedAt === "string" ? delivery.viewedAt : null,
      declinedAt: typeof delivery.declinedAt === "string" ? delivery.declinedAt : null,
      notificationsSuppressed: delivery.notificationsSuppressed === true,
    },
    voidConsequences: [
      "The selected revision becomes void and cannot be sent or signed.",
      "Previously delivered copies are not recalled from the recipient.",
      "The complete revision and lifecycle audit history is retained.",
    ],
  }
}

/**
 * Trusted delivery/signature adapters use this narrow durable seam for the two
 * provider states that are not legal lifecycle transitions themselves. It does
 * not send a notification and cannot mark a contract signed.
 */
export async function recordBookingContractDeliveryStatus(
  db: PostgresJsDatabase,
  input: {
    contractId: string
    status: "viewed" | "declined"
    occurredAt: Date
    provider: string
    externalReference: string
  },
) {
  return db.transaction(async (tx) => {
    const [contract] = await tx
      .select()
      .from(contracts)
      .where(eq(contracts.id, input.contractId))
      .for("update")
      .limit(1)
    if (!contract) return { status: "not_found" as const }
    if (contract.status !== "sent") return { status: "not_sent" as const }
    const metadata = record(contract.metadata)
    const workflow = record(metadata.bookingContractWorkflow)
    const delivery = record(workflow.delivery)
    const history = Array.isArray(workflow.deliveryHistory) ? workflow.deliveryHistory : []
    const timestamp = input.occurredAt.toISOString()
    const field = input.status === "viewed" ? "viewedAt" : "declinedAt"
    const replayed = history.some((entry) => {
      const candidate = record(entry)
      if (candidate.status !== input.status || candidate.provider !== input.provider) return false
      return input.externalReference
        ? candidate.externalReference === input.externalReference
        : candidate.occurredAt === timestamp
    })
    if (replayed) return { status: "recorded" as const, replayed: true }
    await tx
      .update(contracts)
      .set({
        metadata: {
          ...metadata,
          bookingContractWorkflow: {
            ...workflow,
            delivery: { ...delivery, [field]: timestamp },
            deliveryHistory: [
              ...history,
              {
                status: input.status,
                occurredAt: timestamp,
                provider: input.provider,
                externalReference: input.externalReference,
              },
            ],
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, contract.id))
    return { status: "recorded" as const, replayed: false }
  })
}
