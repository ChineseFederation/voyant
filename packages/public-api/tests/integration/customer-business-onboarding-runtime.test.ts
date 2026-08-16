import { CustomerBusinessOnboardingConflictError } from "@voyant-travel/auth/customer-business-onboarding-service"
import { createDbClient } from "@voyant-travel/db"
import {
  customerAuthBusinessAccountRequest,
  customerAuthMember,
  customerAuthOrganization,
  customerAuthUser,
} from "@voyant-travel/db/schema/iam"
import { organizations } from "@voyant-travel/relationships"
import { and, eq, like } from "drizzle-orm"
import { afterAll, afterEach, describe, expect, it } from "vitest"

import { createPublicApiCustomerBusinessOnboardingRuntime } from "../../src/customer-business-onboarding-runtime.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const testPrefix = `onboarding-${crypto.randomUUID()}`

describe.skipIf(!TEST_DATABASE_URL)("storefront customer business onboarding runtime", () => {
  const db = createDbClient(TEST_DATABASE_URL!, {
    adapter: "node",
    nodeMaxConnections: 6,
    timeouts: { connectMs: false, queryMs: false, statementMs: false },
  })
  const runtime = createPublicApiCustomerBusinessOnboardingRuntime()
  const context = { bindings: {}, db }
  const userIds: string[] = []

  async function customer(label: string) {
    const id = `${testPrefix}-${label}`
    userIds.push(id)
    const now = new Date()
    await db.insert(customerAuthUser).values({
      id,
      name: label,
      email: `${id}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    return id
  }

  afterEach(async () => {
    for (const userId of userIds.splice(0)) {
      await db.delete(customerAuthUser).where(eq(customerAuthUser.id, userId))
    }
    await db
      .delete(customerAuthOrganization)
      .where(like(customerAuthOrganization.name, `${testPrefix}%`))
    await db.delete(organizations).where(like(organizations.name, `${testPrefix}%`))
  })

  afterAll(async () => {
    await db.$client.end({ timeout: 0 })
  })

  it("atomically creates one canonical mapping under concurrent idempotent open requests", async () => {
    const requesterUserId = await customer("open")
    const input = {
      requesterUserId,
      publicApiOrigin: "https://storefront.example.com",
      idempotencyKey: `${testPrefix}-open-key`,
      profile: {
        name: `${testPrefix} Open Company`,
        legalName: null,
        taxId: null,
        website: null,
      },
    }
    const [left, right] = await Promise.all([
      runtime.createBusinessAccount(context, input),
      runtime.createBusinessAccount(context, input),
    ])
    expect(left).toEqual(right)
    expect(left.membershipRole).toBe("owner")

    const requests = await runtime.listRequests(context, { requesterUserId })
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      status: "approved",
      authOrganizationId: left.authOrganizationId,
      relationshipOrganizationId: left.relationshipOrganizationId,
    })
    const [canonical] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, left.relationshipOrganizationId))
    expect(canonical).toMatchObject({
      status: "active",
      source: "customer_auth.business_account_request",
      sourceRef: requests[0]?.id,
    })
    const [member] = await db
      .select()
      .from(customerAuthMember)
      .where(
        and(
          eq(customerAuthMember.userId, requesterUserId),
          eq(customerAuthMember.organizationId, left.authOrganizationId),
        ),
      )
    expect(member?.role).toBe("owner")
  })

  it("deduplicates concurrent requests and makes request decisions CAS-safe", async () => {
    const requesterUserId = await customer("request")
    const input = {
      requesterUserId,
      publicApiOrigin: "https://storefront.example.com",
      idempotencyKey: `${testPrefix}-request-key`,
      profile: {
        name: `${testPrefix} Request Company`,
        legalName: null,
        taxId: "VAT-123",
        website: "https://request.example.com",
      },
    }
    const [left, right] = await Promise.all([
      runtime.requestBusinessAccount(context, input),
      runtime.requestBusinessAccount(context, input),
    ])
    expect(left.id).toBe(right.id)

    await expect(
      runtime.requestBusinessAccount(context, {
        ...input,
        idempotencyKey: `${testPrefix}-different-pending-key`,
      }),
    ).rejects.toBeInstanceOf(CustomerBusinessOnboardingConflictError)

    const decisions = await Promise.all([
      runtime.approveRequest(context, {
        requestId: left.id,
        decidedBy: "workos_admin_subject_1",
      }),
      runtime.approveRequest(context, {
        requestId: left.id,
        decidedBy: "workos_admin_subject_2",
      }),
    ])
    expect(decisions[0]?.account).toEqual(decisions[1]?.account)
    const [persisted] = await db
      .select()
      .from(customerAuthBusinessAccountRequest)
      .where(eq(customerAuthBusinessAccountRequest.id, left.id))
    expect(persisted?.status).toBe("approved")
    expect(["workos_admin_subject_1", "workos_admin_subject_2"]).toContain(persisted?.decidedBy)
    const customerMembers = await db
      .select({ userId: customerAuthMember.userId })
      .from(customerAuthMember)
      .where(eq(customerAuthMember.organizationId, decisions[0]!.account.authOrganizationId))
    expect(customerMembers.map(({ userId }) => userId)).toEqual([requesterUserId])
  })
})
