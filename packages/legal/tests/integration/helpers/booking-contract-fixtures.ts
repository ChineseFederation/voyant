import { bookingItems, bookings } from "@voyant-travel/bookings/schema"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { contractsService } from "../../../src/contracts/service.js"
import { LEGAL_CONTRACT_DRAFT_HANDLER_EXPECTATION } from "../../../src/created-target-policy.js"
import { executeLegalContractDraftCreate } from "../../../src/mcp-runtime.js"
import { contractTemplates, contractTemplateVersions } from "../../../src/schema.js"

/**
 * One confirmed booking with a single item and an active customer template
 * whose current version renders `customer.name` — the minimum a managed
 * booking-contract draft needs to exist.
 */
export async function seedBookingTemplate(db: PostgresJsDatabase, bookingNumber: string) {
  const [booking] = await db
    .insert(bookings)
    .values({
      bookingNumber,
      status: "confirmed",
      contactFirstName: "Ana",
      contactLastName: "Pop",
      contactEmail: "ana@example.test",
      contactPhone: "+40700000000",
      contactPreferredLanguage: "en",
      sellCurrency: "EUR",
      sellAmountCents: 100_00,
      startDate: "2026-09-01",
      endDate: "2026-09-07",
    })
    .returning()
  const [item] = await db
    .insert(bookingItems)
    .values({
      bookingId: booking!.id,
      title: "Fallback title",
      status: "confirmed",
      productNameSnapshot: "Original tour",
      quantity: 2,
      sellCurrency: "EUR",
      totalSellAmountCents: 100_00,
    })
    .returning()
  const [template] = await db
    .insert(contractTemplates)
    .values({
      name: `Customer ${bookingNumber}`,
      slug: `customer-${bookingNumber.toLowerCase()}`,
      scope: "customer",
      language: "en",
      body: "Hello {{ customer.name }}",
      active: true,
    })
    .returning()
  const [version] = await db
    .insert(contractTemplateVersions)
    .values({
      templateId: template!.id,
      version: 1,
      body: "Hello {{ customer.name }}",
      variableSchema: { required: ["customer.name"] },
    })
    .returning()
  await db
    .update(contractTemplates)
    .set({ currentVersionId: version!.id })
    .where(eq(contractTemplates.id, template!.id))
  return { booking: booking!, item: item!, template: template!, version: version! }
}

/**
 * Creates a managed booking-contract draft the way the Tool does — through the
 * created-target command with a handler admission — so the revision metadata
 * and review snapshot are the real ones rather than a hand-written fixture.
 */
export function createManagedDraft(
  db: PostgresJsDatabase,
  idempotencyKey: string,
  input: Parameters<typeof executeLegalContractDraftCreate>[2],
) {
  return executeLegalContractDraftCreate(
    db,
    {
      userId: "usr_legal_booking_contract",
      callerType: "session",
      actor: "staff",
      organizationId: "org_legal_booking_contract",
      scopes: ["legal:write", "bookings-pii:read"],
    },
    { ...input, idempotencyKey },
    legalDraftAdmission(idempotencyKey),
    async (command, handlers) => {
      const mutation = await command.db.transaction((tx) => handlers.create(tx as never))
      return {
        replayed: false as const,
        value: mutation.value,
        result: {
          entry: {} as never,
          reference: {
            type: "legal-contract",
            id: mutation.targetId,
            value: `legal-contract:${mutation.targetId}` as const,
          },
        },
      }
    },
    contractsService.createContract,
  )
}

export function legalDraftAdmission(idempotencyKey: string) {
  const expected = LEGAL_CONTRACT_DRAFT_HANDLER_EXPECTATION
  return {
    capabilityId: expected.capabilityId,
    capabilityVersion: expected.capabilityVersion,
    canonicalName: expected.canonicalName,
    actionPolicy: {
      ...expected.actionPolicy,
      enforcement: "handler" as const,
      invocation: {
        controlField: "_voyant" as const,
        requiredFields: ["confirmed"] as const,
        optionalFields: [] as const,
        fingerprintAlgorithm: "action-ledger-command-v1" as const,
      },
    },
    invocation: { confirmed: true, idempotencyKey },
  }
}
