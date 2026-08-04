/**
 * Supplier commitments are frozen at the Product Version (voyant#4189).
 *
 * `booking_supplier_statuses` used to be seeded from the LIVE, mutable
 * `product_day_services`, so editing a day service after conversion left an
 * already-sold booking committed to services matching no version at all. RFC
 * #4027 minted the immutable Product Version precisely to stop that.
 *
 * The test that matters is the one that MUTATES. A suite that converts and
 * asserts the rows look right proves only that some read happened; it passes
 * just as happily against the live product. So this suite edits the live
 * `product_day_services` row — name, cost amount, AND cost currency — between
 * conversions, and asserts that a conversion performed AFTER the edit still
 * commits the frozen figures. That is the only assertion that can tell a frozen
 * read from a live one.
 *
 * Conversion is driven through the real command seam
 * (`settleBookingCreateDomain` behind an authentic action-ledger mutation
 * lease), not by calling the internal converter directly — the lease is a
 * security boundary and a test that bypassed it would prove less than it claims.
 */
import { executeAdmittedCreatedTargetCommand } from "@voyant-travel/action-ledger"
import { newId } from "@voyant-travel/db/lib/typeid"
import {
  createToolRegistry,
  defineTool,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { asc, eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import {
  optionUnits,
  productDayServices,
  productDays,
  productItineraries,
  productOptions,
  products,
  productVersions,
} from "../../../inventory/src/schema.js"
import { itineraryHistoryProductsService } from "../../../inventory/src/service-itinerary-history.js"
import { availabilitySlotsRef } from "../../src/availability-ref.js"
import { settleBookingCreateDomain } from "../../src/booking-create-command-domain.js"
import { bookingActivityLog, bookingSupplierStatuses } from "../../src/schema.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

/**
 * A locally declared handler policy that mints an AUTHENTIC lease. It pins the
 * command-target facts `settleBookingCreateDomain` compares, and its own action
 * identity is passed back through the `actionName` option, so nothing here
 * weakens the seam — it exercises it.
 */
const TEST_BOOKING_CREATE_ACTION = "@voyant-travel/bookings#test.action.frozen-supplier-statuses"
const TEST_BOOKING_CREATE_POLICY = {
  capabilityId: TEST_BOOKING_CREATE_ACTION,
  capabilityVersion: "v1",
  canonicalName: "create_booking_frozen_supplier_statuses_probe",
  actionPolicy: {
    id: TEST_BOOKING_CREATE_ACTION,
    capabilityId: TEST_BOOKING_CREATE_ACTION,
    version: "v1",
    kind: "execute",
    targetType: "booking",
    targetLifecycle: "created",
    ledger: "required",
    approval: "never",
    risk: "high",
    reversible: false,
    allowedActorTypes: ["staff"],
    createdTarget: {
      commandTargetType: "finance_booking_create_command",
      resultReferenceType: "booking",
      durability: "handler-command-claim-v1",
    },
  },
} as const

async function mintAdmission(idempotencyKey: string): Promise<ToolHandlerActionPolicyContext> {
  let admitted: ToolHandlerActionPolicyContext | undefined
  const registry = createToolRegistry()
  registry.register(
    defineTool({
      owner: "@voyant-travel/bookings",
      capabilityId: TEST_BOOKING_CREATE_POLICY.capabilityId,
      capabilityVersion: TEST_BOOKING_CREATE_POLICY.capabilityVersion,
      name: TEST_BOOKING_CREATE_POLICY.canonicalName,
      description: "Mint an authentic booking-create admission for integration coverage.",
      inputSchema: z.object({}),
      outputSchema: z.object({ ok: z.literal(true) }),
      requiredScopes: [],
      audience: { source: "grant", allowed: ["staff"] },
      tier: "destructive",
      riskPolicy: {
        destructive: true,
        reversible: false,
        dryRunSupported: false,
        confirmationRequired: true,
        sideEffects: ["data-write", "external-booking", "payment"],
      },
      actionPolicyEnforcement: "handler",
      async handler(_args, context) {
        admitted = context.handlerActionPolicy
        return { ok: true as const }
      },
    }),
    { actionPolicy: TEST_BOOKING_CREATE_POLICY.actionPolicy },
  )
  await registry.dispatch(
    TEST_BOOKING_CREATE_POLICY.canonicalName,
    {},
    {
      db: {},
      actor: "staff",
      audience: "staff",
      tenantId: "tenant_bookings_frozen_supplier_statuses",
      resolverScope: {
        locale: "en-GB",
        audience: "staff",
        market: "default",
        actor: "staff",
      },
      handlerActionPolicy: {
        ...TEST_BOOKING_CREATE_POLICY,
        actionPolicy: {
          ...TEST_BOOKING_CREATE_POLICY.actionPolicy,
          enforcement: "handler",
          invocation: {
            controlField: "_voyant",
            requiredFields: ["confirmed", "idempotencyKey"],
            optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
            fingerprintAlgorithm: "action-ledger-command-v1",
          },
        },
        invocation: { confirmed: true, idempotencyKey },
      },
    },
  )
  if (!admitted) throw new Error("Tool registry did not mint the booking-create admission")
  return admitted
}

describe.skipIf(!DB_AVAILABLE)(
  "booking supplier statuses are frozen at the Product Version",
  () => {
    let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>
    let sequence = 0

    beforeAll(async () => {
      const { cleanupTestDb, createTestDb } = await import("@voyant-travel/db/test-utils")
      db = createTestDb()
      await cleanupTestDb(db)
    })

    beforeEach(async () => {
      const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
      await cleanupTestDb(db)
    })

    afterAll(async () => {
      const { closeTestDb } = await import("@voyant-travel/db/test-utils")
      await closeTestDb()
    })

    /**
     * A one-day product with two priced day services, frozen as version 1, plus a
     * departure. `bindVersion` decides whether the departure is version-bound —
     * the single axis every assertion below turns on.
     */
    async function seed(options: { bindVersion: boolean }) {
      const ids = {
        productId: newId("products"),
        optionId: newId("product_options"),
        unitId: newId("option_units"),
        itineraryId: newId("product_itineraries"),
        dayId: newId("product_days"),
        serviceA: newId("product_day_services"),
        serviceB: newId("product_day_services"),
        versionId: newId("product_versions"),
        slotId: newId("availability_slots"),
      }

      await db.insert(products).values({
        id: ids.productId,
        name: "Danube Delta Escape",
        sellCurrency: "EUR",
        sellAmountCents: 90_000,
        costAmountCents: 40_000,
        bookingMode: "date",
      })
      await db.insert(productOptions).values({
        id: ids.optionId,
        productId: ids.productId,
        name: "Standard",
        status: "active",
        isDefault: true,
        sortOrder: 0,
      })
      // Exactly one required unit, so conversion resolves a line without the
      // caller having to supply explicit `itemLines`.
      await db.insert(optionUnits).values({
        id: ids.unitId,
        optionId: ids.optionId,
        name: "Adult",
        unitType: "person",
        isRequired: true,
        minQuantity: 1,
        sortOrder: 0,
      })
      await db.insert(productItineraries).values({
        id: ids.itineraryId,
        productId: ids.productId,
        name: "Default",
        isDefault: true,
        sortOrder: 0,
      })
      await db.insert(productDays).values({
        id: ids.dayId,
        itineraryId: ids.itineraryId,
        dayNumber: 1,
        title: "Arrival",
      })
      await db.insert(productDayServices).values([
        {
          id: ids.serviceA,
          dayId: ids.dayId,
          serviceType: "accommodation",
          name: "Pelican Lodge — half board",
          supplierServiceId: "svc_lodge",
          costCurrency: "EUR",
          costAmountCents: 25_000,
          quantity: 1,
          sortOrder: 0,
        },
        {
          id: ids.serviceB,
          dayId: ids.dayId,
          serviceType: "experience",
          name: "Sunrise boat safari",
          supplierServiceId: "svc_boat",
          costCurrency: "EUR",
          costAmountCents: 15_000,
          quantity: 1,
          sortOrder: 1,
        },
      ])

      const snapshot = await itineraryHistoryProductsService.buildSnapshot(db, ids.productId)
      await db.insert(productVersions).values({
        id: ids.versionId,
        productId: ids.productId,
        versionNumber: 1,
        snapshot,
        authorId: "tester",
      })

      const now = new Date()
      await db.insert(availabilitySlotsRef).values({
        id: ids.slotId,
        productId: ids.productId,
        optionId: ids.optionId,
        productVersionId: options.bindVersion ? ids.versionId : null,
        dateLocal: "2026-09-14",
        startsAt: new Date("2026-09-14T06:00:00.000Z"),
        endsAt: null,
        timezone: "Europe/Bucharest",
        status: "open",
        unlimited: false,
        initialPax: 20,
        remainingPax: 20,
        pastCutoff: false,
        tooEarly: false,
        createdAt: now,
        updatedAt: now,
      })

      return ids
    }

    async function convert(ids: Awaited<ReturnType<typeof seed>>) {
      sequence += 1
      const commandKey = `bookings-frozen-supplier-statuses-${sequence}`
      const admitted = await mintAdmission(commandKey)
      const input = {
        productId: ids.productId,
        optionId: ids.optionId,
        slotId: ids.slotId,
        bookingNumber: `BK-FROZEN-${String(sequence).padStart(6, "0")}`,
        pax: 2,
      }

      const result = await executeAdmittedCreatedTargetCommand(
        {
          db,
          context: {
            userId: "user_bookings_frozen_supplier_statuses",
            callerType: "session",
            actor: "staff",
            organizationId: "tenant_bookings_frozen_supplier_statuses",
          },
          admitted,
          commandTargetType: "finance_booking_create_command",
          canonicalTargetType: "booking",
          resultReferenceType: "booking",
          commandInput: input,
          evaluatedRisk: "high",
        },
        {
          async create(tx, lease) {
            const booking = await settleBookingCreateDomain(
              lease,
              tx,
              commandKey,
              input,
              "tester",
              {
                actionName: TEST_BOOKING_CREATE_ACTION,
                actionVersion: "v1",
              },
            )
            if (!booking) throw new Error("conversion returned no booking")
            return { value: booking, targetId: booking.id }
          },
          async replay() {
            throw new Error("conversion unexpectedly replayed")
          },
        },
      )

      return result.value
    }

    const commitmentsOf = async (bookingId: string) =>
      db
        .select({
          supplierServiceId: bookingSupplierStatuses.supplierServiceId,
          serviceName: bookingSupplierStatuses.serviceName,
          costCurrency: bookingSupplierStatuses.costCurrency,
          costAmountCents: bookingSupplierStatuses.costAmountCents,
        })
        .from(bookingSupplierStatuses)
        .where(eq(bookingSupplierStatuses.bookingId, bookingId))
        .orderBy(asc(bookingSupplierStatuses.createdAt), asc(bookingSupplierStatuses.id))

    const provenanceOf = async (bookingId: string) => {
      const [row] = await db
        .select({ metadata: bookingActivityLog.metadata })
        .from(bookingActivityLog)
        .where(eq(bookingActivityLog.bookingId, bookingId))
      return (row?.metadata as Record<string, unknown> | null)?.supplierCommitmentProvenance as
        | Record<string, unknown>
        | undefined
    }

    const FROZEN = [
      {
        supplierServiceId: "svc_lodge",
        serviceName: "Pelican Lodge — half board",
        costCurrency: "EUR",
        costAmountCents: 25_000,
      },
      {
        supplierServiceId: "svc_boat",
        serviceName: "Sunrise boat safari",
        costCurrency: "EUR",
        costAmountCents: 15_000,
      },
    ]

    it("commits the frozen Version's day services, and a later Product edit changes nothing", async () => {
      const ids = await seed({ bindVersion: true })

      const first = await convert(ids)
      expect(await commitmentsOf(first.id)).toEqual(FROZEN)
      expect(await provenanceOf(first.id)).toMatchObject({
        source: "product_version",
        productVersionId: ids.versionId,
        availabilitySlotId: ids.slotId,
        fallbackReason: null,
        serviceCount: 2,
        servicesMissingCost: 0,
      })

      // The operator now edits the LIVE product: a different supplier service, a
      // different price, and a different currency. Under publish this would mint
      // version 2; the departure stays bound to version 1.
      await db
        .update(productDayServices)
        .set({
          name: "MUTATED — budget hostel",
          supplierServiceId: "svc_hostel",
          costCurrency: "USD",
          costAmountCents: 1_000,
        })
        .where(eq(productDayServices.id, ids.serviceA))
      await db
        .update(productDayServices)
        .set({
          name: "MUTATED — cancelled safari",
          costCurrency: "RON",
          costAmountCents: 999,
        })
        .where(eq(productDayServices.id, ids.serviceB))

      // The commitments already written are untouched.
      expect(await commitmentsOf(first.id)).toEqual(FROZEN)

      // And — the assertion that actually distinguishes a frozen read from a live
      // one — a conversion run AFTER the edit still commits the frozen figures.
      const second = await convert(ids)
      expect(await commitmentsOf(second.id)).toEqual(FROZEN)
      expect(await provenanceOf(second.id)).toMatchObject({
        source: "product_version",
        productVersionId: ids.versionId,
      })
    })

    it("falls back to the live product for an unbound departure, and records that it did", async () => {
      const ids = await seed({ bindVersion: false })

      await db
        .update(productDayServices)
        .set({ name: "Live name", costCurrency: "USD", costAmountCents: 4_200 })
        .where(eq(productDayServices.id, ids.serviceA))

      const booking = await convert(ids)

      // A departure with no `product_version_id` has no frozen source to read, so
      // the live product remains the documented fallback — unchanged behaviour.
      expect(await commitmentsOf(booking.id)).toEqual([
        {
          supplierServiceId: "svc_lodge",
          serviceName: "Live name",
          costCurrency: "USD",
          costAmountCents: 4_200,
        },
        FROZEN[1],
      ])

      // The point of the fallback contract: it is never silent.
      expect(await provenanceOf(booking.id)).toMatchObject({
        source: "live_product",
        productVersionId: null,
        availabilitySlotId: ids.slotId,
        fallbackReason: "departure_not_version_bound",
        serviceCount: 2,
      })
    })
  },
)
