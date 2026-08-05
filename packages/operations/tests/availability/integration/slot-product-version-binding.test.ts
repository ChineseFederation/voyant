import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { availabilityRules, availabilitySlots } from "@voyant-travel/operations/schema"
import { eq } from "drizzle-orm"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { productOptions, products } from "../../../../inventory/src/schema.js"
import { generateAvailabilitySlots } from "../../../src/availability/generate-slots.js"
import {
  countDeparturesOnVersion,
  listUnboundDepartures,
  reportUnboundDepartures,
} from "../../../src/availability/service-aggregates.js"
import { createSlot } from "../../../src/availability/service-core.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

const FUTURE = "2035-06-01"
const PAST = "2020-06-01"
const AS_OF = new Date("2030-01-01T00:00:00.000Z")

describe.skipIf(!DB_AVAILABLE)("departure product-version binding (integration)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: owner: availability; createTestDb returns a driver-specific drizzle test client
  let db: any
  let productId: string
  let optionId: string

  beforeAll(() => {
    db = createTestDb()
  })

  beforeEach(async () => {
    await cleanupTestDb(db)
    productId = newId("products")
    optionId = newId("product_options")
    await db.insert(products).values({
      id: productId,
      name: "Bulgaria Day Tour",
      sellCurrency: "EUR",
      bookingMode: "date",
    })
    await db.insert(productOptions).values({
      id: optionId,
      productId,
      name: "Standard",
      status: "active",
      isDefault: true,
      sortOrder: 0,
    })
  })

  function slotInput(dateLocal = FUTURE, productVersionId?: string) {
    return {
      productId,
      productVersionId,
      dateLocal,
      startsAt: `${dateLocal}T09:00:00.000Z`,
      timezone: "Europe/Bucharest",
      status: "open" as const,
      unlimited: false,
      initialPax: 40,
      pastCutoff: false,
      tooEarly: false,
    }
  }

  describe("manual creation", () => {
    it("records the Product Version the caller materialized against", async () => {
      const versionId = newId("product_versions")

      const row = await createSlot(db, slotInput(FUTURE, versionId))

      expect(row?.productVersionId).toBe(versionId)
    })

    it("records no version when the caller supplies none", async () => {
      // A product that has never been published has no version to bind to.
      // That is recorded as unknown rather than inferred.
      const row = await createSlot(db, slotInput())

      expect(row?.productVersionId).toBeNull()
    })
  })

  describe("recurring generation", () => {
    async function seedRule() {
      const ruleId = newId("availability_rules")
      await db.insert(availabilityRules).values({
        id: ruleId,
        productId,
        optionId,
        timezone: "Europe/Bucharest",
        startDate: FUTURE,
        endDate: "2035-06-05",
        maxCapacity: 40,
        active: true,
      })
      return ruleId
    }

    async function generate(versionId: string | null, ruleId: string) {
      return generateAvailabilitySlots(db, {
        ruleId,
        now: new Date("2035-05-01T00:00:00.000Z"),
        materializeResources: false,
        resolveCurrentProductVersionId: async () => versionId,
      })
    }

    async function slotVersions() {
      const rows = await db
        .select({ productVersionId: availabilitySlots.productVersionId })
        .from(availabilitySlots)
        .where(eq(availabilitySlots.productId, productId))
      return rows.map((r: { productVersionId: string | null }) => r.productVersionId)
    }

    it("binds every generated departure to one version", async () => {
      const ruleId = await seedRule()
      const versionId = newId("product_versions")

      await generate(versionId, ruleId)

      const versions = await slotVersions()
      expect(versions.length).toBeGreaterThan(0)
      // One run, one definition — a publish landing mid-run must not split a
      // generation batch across two versions.
      expect(new Set(versions).size).toBe(1)
      expect(versions[0]).toBe(versionId)
    })

    it("does not rewrite departures an earlier run already bound", async () => {
      const ruleId = await seedRule()
      const first = newId("product_versions")

      await generate(first, ruleId)
      await generate(newId("product_versions"), ruleId)

      const versions = await slotVersions()
      expect(versions.every((v: string | null) => v === first)).toBe(true)
    })

    it("records no version when the product has never been published", async () => {
      const ruleId = await seedRule()

      await generate(null, ruleId)

      const versions = await slotVersions()
      expect(versions.length).toBeGreaterThan(0)
      expect(versions.every((v: string | null) => v === null)).toBe(true)
    })
  })

  describe("legacy departures", () => {
    async function seedUnbound(dateLocal: string) {
      const id = newId("availability_slots")
      await db.insert(availabilitySlots).values({
        id,
        productId,
        dateLocal,
        startsAt: new Date(`${dateLocal}T09:00:00.000Z`),
        timezone: "Europe/Bucharest",
        status: "open",
        unlimited: false,
        initialPax: 40,
      })
      return id
    }

    it("reports unbound departures and separates the actionable ones", async () => {
      await seedUnbound(FUTURE)
      await seedUnbound(PAST)

      const report = await reportUnboundDepartures(db, AS_OF)

      expect(report.total).toBe(2)
      expect(report.upcoming).toBe(1)
      expect(report.productsAffected).toBe(1)
    })

    it("excludes past departures from the review queue by default", async () => {
      const upcoming = await seedUnbound(FUTURE)
      await seedUnbound(PAST)

      const queue = await listUnboundDepartures(db, { now: AS_OF })

      expect(queue.map((d) => d.id)).toEqual([upcoming])
    })

    it("includes past departures only when explicitly asked", async () => {
      await seedUnbound(FUTURE)
      await seedUnbound(PAST)

      const queue = await listUnboundDepartures(db, { now: AS_OF, includePast: true })

      expect(queue).toHaveLength(2)
    })

    it("does not count a bound departure as unbound", async () => {
      await createSlot(db, slotInput(FUTURE, newId("product_versions")))

      const report = await reportUnboundDepartures(db, AS_OF)

      expect(report.total).toBe(0)
    })
  })

  describe("impact set", () => {
    it("counts the departures a product version is operating", async () => {
      const versionId = newId("product_versions")
      await createSlot(db, slotInput(FUTURE, versionId))
      await createSlot(db, slotInput("2035-07-01", versionId))
      await createSlot(db, slotInput("2035-08-01", newId("product_versions")))

      const impact = await countDeparturesOnVersion(db, versionId, AS_OF)

      expect(impact.total).toBe(2)
      expect(impact.upcoming).toBe(2)
      expect(impact.past).toBe(0)
    })

    it("separates departures that have already run", async () => {
      const versionId = newId("product_versions")
      await createSlot(db, slotInput(FUTURE, versionId))
      await createSlot(db, slotInput(PAST, versionId))

      const impact = await countDeparturesOnVersion(db, versionId, AS_OF)

      expect(impact.total).toBe(2)
      expect(impact.upcoming).toBe(1)
      expect(impact.past).toBe(1)
    })
  })
})
