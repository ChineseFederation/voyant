import type { PersonalBuyerPersonRuntime } from "@voyant-travel/auth/ports"
import { personalBuyerPersonRuntimePort } from "@voyant-travel/auth/ports"
import { createDbClient } from "@voyant-travel/db"
import {
  customerAuthPersonalBuyerAccount,
  customerAuthProfilesTable,
  customerAuthUser,
} from "@voyant-travel/db/schema/iam"
import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { createAuthRuntimePortContribution } from "../../src/runtime-contributor.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!TEST_DATABASE_URL)("personal Buyer Account Person runtime", () => {
  const db = createDbClient(TEST_DATABASE_URL!, {
    adapter: "node",
    nodeMaxConnections: 2,
    timeouts: { connectMs: false, queryMs: false, statementMs: false },
  })
  const contribution = createAuthRuntimePortContribution({
    primitives: {
      config: { read: () => "better-auth" },
      env: (bindings: unknown) => bindings,
    },
  } as never)
  const runtime = contribution[personalBuyerPersonRuntimePort.id] as PersonalBuyerPersonRuntime

  beforeEach(async () => {
    await db.delete(customerAuthUser)
  })

  afterAll(async () => {
    await db.$client.end({ timeout: 0 })
  })

  it("creates from the verified profile and links the Person in the caller transaction", async () => {
    const now = new Date()
    await db.insert(customerAuthUser).values({
      id: "personal-person-user",
      name: "Fallback Name",
      email: "verified@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(customerAuthPersonalBuyerAccount).values({ userId: "personal-person-user" })
    await db.insert(customerAuthProfilesTable).values({
      id: "personal-person-user",
      firstName: "Profile",
      lastName: "Customer",
    })
    const createPerson = vi.fn(async () => ({ id: "per_fresh_person" }))

    const ensured = await db.transaction((tx) =>
      runtime.ensurePersonalBuyerPerson(tx, { userId: "personal-person-user", createPerson }),
    )

    expect(ensured).toEqual({ id: "per_fresh_person" })
    expect(createPerson).toHaveBeenCalledWith({ firstName: "Profile", lastName: "Customer" })
    const [identity] = await db
      .select({ relationshipPersonId: customerAuthUser.relationshipPersonId })
      .from(customerAuthUser)
      .where(eq(customerAuthUser.id, "personal-person-user"))
    expect(identity?.relationshipPersonId).toBe("per_fresh_person")
  })

  it("does not create for a revoked personal entitlement", async () => {
    const now = new Date()
    await db.insert(customerAuthUser).values({
      id: "revoked-person-user",
      name: "Revoked Customer",
      email: "revoked@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(customerAuthPersonalBuyerAccount).values({
      userId: "revoked-person-user",
      revokedAt: now,
    })
    const createPerson = vi.fn(async () => ({ id: "per_must_not_exist" }))

    await expect(
      db.transaction((tx) =>
        runtime.ensurePersonalBuyerPerson(tx, { userId: "revoked-person-user", createPerson }),
      ),
    ).resolves.toBeNull()
    expect(createPerson).not.toHaveBeenCalled()
  })
})
