import { bookings, bookingTravelers } from "@voyant-travel/bookings/schema"
import { customerAuthProfilesTable, customerAuthUser } from "@voyant-travel/db/schema/iam"
import { cleanupTestDb, closeTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { handleApiError } from "@voyant-travel/hono"
import { identityContactPoints } from "@voyant-travel/identity/schema"
import { organizations, people, relationshipsService } from "@voyant-travel/relationships"
import { eq, inArray } from "drizzle-orm"
import { Hono } from "hono"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { createPublicCustomerPortalRoutes } from "../../src/customer-portal/routes-public.js"
import { publicCustomerPortalService } from "../../src/customer-portal/service-public.js"
import { claimPersonalBuyerPerson } from "../../src/customer-portal/service-public-impl.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!TEST_DATABASE_URL)("customer buyer authorization", () => {
  let db: ReturnType<typeof createTestDb>

  beforeAll(() => {
    db = createTestDb()
  })

  beforeEach(async () => {
    await cleanupTestDb(db)
  })

  afterAll(async () => {
    await closeTestDb()
  })

  async function seedUser(input: {
    id: string
    email: string
    relationshipPersonId?: string | null
  }) {
    const now = new Date()
    await db.insert(customerAuthUser).values({
      id: input.id,
      name: input.id,
      email: input.email,
      emailVerified: true,
      phoneNumberVerified: false,
      relationshipPersonId: input.relationshipPersonId ?? null,
      createdAt: now,
      updatedAt: now,
    })
  }

  async function seedBooking(input: {
    bookingNumber: string
    personId?: string | null
    organizationId?: string | null
    travelerEmail?: string | null
  }) {
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: input.bookingNumber,
        status: "on_hold",
        sourceType: "direct",
        sellCurrency: "EUR",
        personId: input.personId ?? null,
        organizationId: input.organizationId ?? null,
      })
      .returning()
    if (input.travelerEmail) {
      await db.insert(bookingTravelers).values({
        bookingId: booking!.id,
        firstName: "Traveler",
        lastName: input.bookingNumber,
        email: input.travelerEmail,
      })
    }
    return booking!
  }

  it("isolates exact business Organization access from personal Person and traveler-email access", async () => {
    await db.insert(people).values({ id: "person-buyer", firstName: "Person", lastName: "Buyer" })
    await db.insert(organizations).values([
      { id: "org-a", name: "Organization A", status: "active" },
      { id: "org-b", name: "Organization B", status: "active" },
    ])
    await seedUser({
      id: "customer-a",
      email: "customer@example.com",
      relationshipPersonId: "person-buyer",
    })
    const personal = await seedBooking({ bookingNumber: "PERSON", personId: "person-buyer" })
    const email = await seedBooking({
      bookingNumber: "EMAIL",
      travelerEmail: "customer@example.com",
    })
    const orgA = await seedBooking({ bookingNumber: "ORG-A", organizationId: "org-a" })
    await seedBooking({ bookingNumber: "ORG-B", organizationId: "org-b" })

    const businessBuyer = {
      userId: "customer-a",
      buyerAccountId: "business:auth-org-a",
      kind: "business" as const,
      authOrganizationId: "auth-org-a",
      relationshipOrganizationId: "org-a",
      relationshipPersonId: null as null,
      membershipId: "member-a",
      membershipRole: "member",
    }
    const businessRows = await publicCustomerPortalService.listBookings(db, businessBuyer)
    expect(businessRows?.map((row) => row.bookingId)).toEqual([orgA.id])
    await expect(
      publicCustomerPortalService.getBooking(db, businessBuyer, orgA.id),
    ).resolves.toEqual(expect.objectContaining({ bookingId: orgA.id }))
    await expect(
      publicCustomerPortalService.getBooking(db, businessBuyer, personal.id),
    ).resolves.toBeNull()
    await expect(
      publicCustomerPortalService.getBooking(db, businessBuyer, email.id),
    ).resolves.toBeNull()

    const personalBuyer = {
      userId: "customer-a",
      buyerAccountId: "personal:customer-a",
      kind: "personal" as const,
      authOrganizationId: null as null,
      relationshipOrganizationId: null as null,
      relationshipPersonId: "person-buyer",
      membershipId: null as null,
      membershipRole: null as null,
    }
    const personalRows = await publicCustomerPortalService.listBookings(db, personalBuyer)
    expect(personalRows?.map((row) => row.bookingId).sort()).toEqual([personal.id, email.id].sort())
    await expect(
      publicCustomerPortalService.getBooking(db, personalBuyer, orgA.id),
    ).resolves.toBeNull()

    await db.update(people).set({ archivedAt: new Date() }).where(eq(people.id, "person-buyer"))
    expect(
      await publicCustomerPortalService.listBookings(db, {
        userId: "customer-a",
        buyerAccountId: "personal:customer-a",
        kind: "personal",
        authOrganizationId: null,
        relationshipOrganizationId: null,
        relationshipPersonId: "person-buyer",
        membershipId: null,
        membershipRole: null,
      }),
    ).toEqual([])

    await db
      .update(organizations)
      .set({ archivedAt: new Date() })
      .where(eq(organizations.id, "org-a"))
    expect(
      await publicCustomerPortalService.listBookings(db, {
        userId: "customer-a",
        buyerAccountId: "business:auth-org-a",
        kind: "business",
        authOrganizationId: "auth-org-a",
        relationshipOrganizationId: "org-a",
        relationshipPersonId: null,
        membershipId: "member-a",
        membershipRole: "member",
      }),
    ).toEqual([])

    await db.delete(organizations).where(eq(organizations.id, "org-a"))
    expect(await db.select().from(bookings).where(eq(bookings.id, orgA.id))).toHaveLength(1)
    expect(
      await publicCustomerPortalService.listBookings(db, {
        userId: "customer-a",
        buyerAccountId: "business:auth-org-a",
        kind: "business",
        authOrganizationId: "auth-org-a",
        relationshipOrganizationId: "org-a",
        relationshipPersonId: null,
        membershipId: "member-a",
        membershipRole: "member",
      }),
    ).toEqual([])
  })

  it("serves /me for a B2B-only customer identity without selecting a buyer", async () => {
    await seedUser({ id: "b2b-only", email: "b2b@example.com" })
    const app = new Hono()
      .onError(handleApiError)
      .use("*", async (c, next) => {
        c.set("db" as never, db)
        c.set("userId" as never, "b2b-only")
        c.set("sessionId" as never, "session-b2b")
        c.set("actor" as never, "customer")
        c.set("realm" as never, "customer")
        await next()
      })
      .route("/", createPublicCustomerPortalRoutes())

    const response = await app.request("/me")
    expect(response.status).toBe(200)
    expect((await response.json()).data).toEqual(
      expect.objectContaining({ userId: "b2b-only", email: "b2b@example.com" }),
    )
  })

  it("rejects an arbitrary Person claim that does not match verified identity contact", async () => {
    await seedUser({ id: "claimant", email: "verified@example.com" })
    await db
      .insert(people)
      .values({ id: "unrelated-person", firstName: "Other", lastName: "Person" })
    await db.insert(identityContactPoints).values({
      entityType: "person",
      entityId: "unrelated-person",
      kind: "email",
      value: "other@example.com",
      normalizedValue: "other@example.com",
    })

    await expect(
      publicCustomerPortalService.bootstrap(db, "claimant", {
        customerRecordId: "unrelated-person",
        createCustomerIfMissing: false,
      }),
    ).resolves.toEqual({ error: "customer_record_not_found" })
  })

  it("rejects a claim when the formerly matching verified contact changes before the claim", async () => {
    await seedUser({ id: "contact-changed", email: "before-change@example.com" })
    await db
      .insert(people)
      .values({ id: "contact-changed-person", firstName: "Changed", lastName: "Contact" })
    const [contact] = await db
      .insert(identityContactPoints)
      .values({
        entityType: "person",
        entityId: "contact-changed-person",
        kind: "email",
        value: "before-change@example.com",
        normalizedValue: "before-change@example.com",
      })
      .returning({ id: identityContactPoints.id })

    // Simulate the contact changing after candidate discovery but before the
    // conditional UPDATE that creates the durable identity link.
    await db
      .update(identityContactPoints)
      .set({
        value: "after-change@example.com",
        normalizedValue: "after-change@example.com",
      })
      .where(eq(identityContactPoints.id, contact!.id))

    await expect(
      claimPersonalBuyerPerson(db, "contact-changed", "contact-changed-person", {
        requireVerifiedIdentityContact: true,
      }),
    ).resolves.toBe(false)
    const [identity] = await db
      .select({ relationshipPersonId: customerAuthUser.relationshipPersonId })
      .from(customerAuthUser)
      .where(eq(customerAuthUser.id, "contact-changed"))
    expect(identity?.relationshipPersonId).toBeNull()
  })

  it("allows only one racing identity to claim a verified Person", async () => {
    await seedUser({ id: "claimant-a", email: "claimant-a@example.com" })
    await seedUser({ id: "claimant-b", email: "claimant-b@example.com" })
    await db.insert(people).values({ id: "shared-person", firstName: "Shared", lastName: "Person" })
    await db.insert(identityContactPoints).values([
      {
        entityType: "person",
        entityId: "shared-person",
        kind: "email",
        value: "claimant-a@example.com",
        normalizedValue: "claimant-a@example.com",
      },
      {
        entityType: "person",
        entityId: "shared-person",
        kind: "email",
        value: "claimant-b@example.com",
        normalizedValue: "claimant-b@example.com",
      },
    ])

    const results = await Promise.all([
      publicCustomerPortalService.bootstrap(db, "claimant-a", {
        customerRecordId: "shared-person",
        createCustomerIfMissing: false,
      }),
      publicCustomerPortalService.bootstrap(db, "claimant-b", {
        customerRecordId: "shared-person",
        createCustomerIfMissing: false,
      }),
    ])
    expect(results.filter((result) => "error" in result)).toHaveLength(1)
    const linked = await db
      .select({ userId: customerAuthUser.id })
      .from(customerAuthUser)
      .where(eq(customerAuthUser.relationshipPersonId, "shared-person"))
    expect(linked).toHaveLength(1)
    expect(
      await db
        .select()
        .from(people)
        .where(inArray(people.id, ["shared-person"])),
    ).toHaveLength(1)
  })

  it("rolls back the losing same-user Person creation race without an orphan", async () => {
    await seedUser({ id: "create-racer", email: "create-racer@example.com" })

    const results = await Promise.all([
      publicCustomerPortalService.bootstrap(db, "create-racer", {
        createCustomerIfMissing: true,
        firstName: "Race",
        lastName: "Winner",
      }),
      publicCustomerPortalService.bootstrap(db, "create-racer", {
        createCustomerIfMissing: true,
        firstName: "Race",
        lastName: "Loser",
      }),
    ])

    expect(
      results.filter((result) => "status" in result && result.status === "created_customer"),
    ).toHaveLength(1)
    const createdPeople = await db.select({ id: people.id }).from(people)
    expect(createdPeople).toHaveLength(1)
    const [identity] = await db
      .select({ relationshipPersonId: customerAuthUser.relationshipPersonId })
      .from(customerAuthUser)
      .where(eq(customerAuthUser.id, "create-racer"))
    expect(identity?.relationshipPersonId).toBe(createdPeople[0]?.id)
  })

  it("rolls back the Person claim and consent when an existing-record update fails", async () => {
    await seedUser({ id: "atomic-claimant", email: "atomic@example.com" })
    await db.insert(people).values({
      id: "atomic-person",
      firstName: "Original",
      lastName: "Person",
    })
    await db.insert(identityContactPoints).values({
      entityType: "person",
      entityId: "atomic-person",
      kind: "email",
      value: "atomic@example.com",
      normalizedValue: "atomic@example.com",
    })
    const updatePerson = vi.spyOn(relationshipsService, "updatePerson").mockResolvedValueOnce(null)

    try {
      await expect(
        publicCustomerPortalService.bootstrap(db, "atomic-claimant", {
          customerRecordId: "atomic-person",
          createCustomerIfMissing: false,
          firstName: "Should Roll Back",
          marketingConsent: true,
          marketingConsentSource: "bootstrap",
        }),
      ).resolves.toEqual({ error: "customer_record_not_found" })
    } finally {
      updatePerson.mockRestore()
    }

    const [identity] = await db
      .select({ relationshipPersonId: customerAuthUser.relationshipPersonId })
      .from(customerAuthUser)
      .where(eq(customerAuthUser.id, "atomic-claimant"))
    expect(identity?.relationshipPersonId).toBeNull()
    expect(
      await db
        .select()
        .from(customerAuthProfilesTable)
        .where(eq(customerAuthProfilesTable.id, "atomic-claimant")),
    ).toEqual([])
  })
})
