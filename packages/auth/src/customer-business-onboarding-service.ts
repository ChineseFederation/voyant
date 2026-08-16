import {
  customerAuthBusinessAccountRequest,
  customerAuthMember,
  customerAuthOrganization,
  customerAuthUser,
} from "@voyant-travel/db/schema/iam"
import type { VoyantDb } from "@voyant-travel/hono"
import { and, desc, eq } from "drizzle-orm"
import {
  type CustomerBusinessAccountDto,
  type CustomerBusinessAccountRequestDto,
  type CustomerBusinessAccountRequestStatus,
  type CustomerBusinessOnboardingMode,
  type CustomerBusinessProfile,
  customerBusinessAccountRequestSchema,
  customerBusinessAccountSchema,
  customerBusinessProfileSchema,
} from "./customer-business-accounts-contracts.js"
import { businessBuyerAccountId } from "./customer-buyer-accounts.js"

export class CustomerBusinessOnboardingConflictError extends Error {}
export class CustomerBusinessOnboardingNotFoundError extends Error {}

function opaqueId(): string {
  return crypto.randomUUID()
}

function slugBase(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "business"
  )
}

export async function materializeCustomerBusinessAccount(
  db: VoyantDb,
  input: {
    ownerUserId: string
    name: string
    relationshipOrganizationId: string
  },
): Promise<CustomerBusinessAccountDto> {
  const [owner] = await db
    .select({ id: customerAuthUser.id })
    .from(customerAuthUser)
    .where(eq(customerAuthUser.id, input.ownerUserId))
    .limit(1)
  if (!owner) {
    throw new CustomerBusinessOnboardingNotFoundError("Customer owner does not exist")
  }

  let [organization] = await db
    .select()
    .from(customerAuthOrganization)
    .where(
      eq(customerAuthOrganization.relationshipOrganizationId, input.relationshipOrganizationId),
    )
    .limit(1)

  for (let attempt = 0; !organization && attempt < 8; attempt += 1) {
    const suffix = opaqueId().replaceAll("-", "").slice(0, 10)
    const [created] = await db
      .insert(customerAuthOrganization)
      .values({
        id: opaqueId(),
        name: input.name,
        slug: `${slugBase(input.name).slice(0, 52)}-${suffix}`,
        relationshipOrganizationId: input.relationshipOrganizationId,
        createdAt: new Date(),
      })
      .onConflictDoNothing()
      .returning()
    organization = created
    if (!organization) {
      ;[organization] = await db
        .select()
        .from(customerAuthOrganization)
        .where(
          eq(customerAuthOrganization.relationshipOrganizationId, input.relationshipOrganizationId),
        )
        .limit(1)
    }
  }
  if (!organization) {
    throw new CustomerBusinessOnboardingConflictError(
      "Could not allocate a unique customer business organization slug",
    )
  }

  const [membership] = await db
    .insert(customerAuthMember)
    .values({
      id: opaqueId(),
      userId: input.ownerUserId,
      organizationId: organization.id,
      role: "owner",
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [customerAuthMember.userId, customerAuthMember.organizationId],
      set: { role: "owner" },
    })
    .returning()
  if (!membership) {
    throw new CustomerBusinessOnboardingConflictError(
      "Could not create the customer business owner membership",
    )
  }

  return customerBusinessAccountSchema.parse({
    id: businessBuyerAccountId(organization.id),
    kind: "business",
    name: organization.name,
    authOrganizationId: organization.id,
    relationshipOrganizationId: input.relationshipOrganizationId,
    relationshipPersonId: null,
    membershipId: membership.id,
    membershipRole: membership.role,
  })
}

type RequestRow = typeof customerAuthBusinessAccountRequest.$inferSelect

function requestProfile(row: RequestRow): CustomerBusinessProfile {
  return customerBusinessProfileSchema.parse({
    name: row.name,
    legalName: row.legalName,
    taxId: row.taxId,
    website: row.website,
  })
}

function requestDto(
  row: RequestRow,
  requester: { email: string | null; name: string | null },
): CustomerBusinessAccountRequestDto {
  return customerBusinessAccountRequestSchema.parse({
    id: row.id,
    requesterUserId: row.requesterUserId,
    requesterEmail: requester.email,
    requesterName: requester.name,
    publicApiOrigin: row.publicApiOrigin,
    mode: row.mode,
    profile: requestProfile(row),
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    authOrganizationId: row.authOrganizationId,
    relationshipOrganizationId: row.relationshipOrganizationId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedBy: row.decidedBy,
    decisionReason: row.decisionReason,
  })
}

async function hydrateRequest(
  db: VoyantDb,
  row: RequestRow,
): Promise<CustomerBusinessAccountRequestDto> {
  const [requester] = await db
    .select({ email: customerAuthUser.email, name: customerAuthUser.name })
    .from(customerAuthUser)
    .where(eq(customerAuthUser.id, row.requesterUserId))
    .limit(1)
  return requestDto(row, requester ?? { email: null, name: null })
}

export async function createCustomerBusinessAccountRequest(
  db: VoyantDb,
  input: {
    requesterUserId: string
    publicApiOrigin: string
    mode: CustomerBusinessOnboardingMode
    idempotencyKey: string
    profile: CustomerBusinessProfile
  },
): Promise<CustomerBusinessAccountRequestDto> {
  const profile = customerBusinessProfileSchema.parse(input.profile)
  const [existing] = await db
    .select()
    .from(customerAuthBusinessAccountRequest)
    .where(
      and(
        eq(customerAuthBusinessAccountRequest.requesterUserId, input.requesterUserId),
        eq(customerAuthBusinessAccountRequest.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1)
  if (existing) {
    const samePayload =
      existing.publicApiOrigin === input.publicApiOrigin &&
      existing.mode === input.mode &&
      existing.name === profile.name &&
      existing.legalName === profile.legalName &&
      existing.taxId === profile.taxId &&
      existing.website === profile.website
    if (!samePayload) {
      throw new CustomerBusinessOnboardingConflictError(
        "Idempotency key was already used with a different business-account request",
      )
    }
    return hydrateRequest(db, existing)
  }

  const [created] = await db
    .insert(customerAuthBusinessAccountRequest)
    .values({
      id: opaqueId(),
      requesterUserId: input.requesterUserId,
      publicApiOrigin: input.publicApiOrigin,
      mode: input.mode,
      name: profile.name,
      legalName: profile.legalName,
      taxId: profile.taxId,
      website: profile.website,
      idempotencyKey: input.idempotencyKey,
    })
    .onConflictDoNothing()
    .returning()
  if (created) return hydrateRequest(db, created)

  const [racedIdempotent] = await db
    .select()
    .from(customerAuthBusinessAccountRequest)
    .where(
      and(
        eq(customerAuthBusinessAccountRequest.requesterUserId, input.requesterUserId),
        eq(customerAuthBusinessAccountRequest.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1)
  if (racedIdempotent) {
    const samePayload =
      racedIdempotent.publicApiOrigin === input.publicApiOrigin &&
      racedIdempotent.mode === input.mode &&
      racedIdempotent.name === profile.name &&
      racedIdempotent.legalName === profile.legalName &&
      racedIdempotent.taxId === profile.taxId &&
      racedIdempotent.website === profile.website
    if (samePayload) return hydrateRequest(db, racedIdempotent)
    throw new CustomerBusinessOnboardingConflictError(
      "Idempotency key was already used with a different business-account request",
    )
  }

  const [pending] = await db
    .select({ id: customerAuthBusinessAccountRequest.id })
    .from(customerAuthBusinessAccountRequest)
    .where(
      and(
        eq(customerAuthBusinessAccountRequest.requesterUserId, input.requesterUserId),
        eq(customerAuthBusinessAccountRequest.status, "pending"),
      ),
    )
    .limit(1)
  if (pending) {
    throw new CustomerBusinessOnboardingConflictError(
      "Customer already has a pending business-account request",
    )
  }
  throw new CustomerBusinessOnboardingConflictError("Business-account request could not be created")
}

export async function listCustomerBusinessAccountRequests(
  db: VoyantDb,
  input: {
    requesterUserId?: string
    status?: CustomerBusinessAccountRequestStatus
  },
): Promise<CustomerBusinessAccountRequestDto[]> {
  const conditions = [
    ...(input.requesterUserId
      ? [eq(customerAuthBusinessAccountRequest.requesterUserId, input.requesterUserId)]
      : []),
    ...(input.status ? [eq(customerAuthBusinessAccountRequest.status, input.status)] : []),
  ]
  const rows = await db
    .select({
      request: customerAuthBusinessAccountRequest,
      requesterEmail: customerAuthUser.email,
      requesterName: customerAuthUser.name,
    })
    .from(customerAuthBusinessAccountRequest)
    .innerJoin(
      customerAuthUser,
      eq(customerAuthUser.id, customerAuthBusinessAccountRequest.requesterUserId),
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(customerAuthBusinessAccountRequest.createdAt))
  return rows.map((row) =>
    requestDto(row.request, { email: row.requesterEmail, name: row.requesterName }),
  )
}

export async function getCustomerBusinessAccountRequestForUpdate(
  db: VoyantDb,
  requestId: string,
): Promise<CustomerBusinessAccountRequestDto> {
  const [row] = await db
    .select()
    .from(customerAuthBusinessAccountRequest)
    .where(eq(customerAuthBusinessAccountRequest.id, requestId))
    .for("update")
    .limit(1)
  if (!row) throw new CustomerBusinessOnboardingNotFoundError("Business-account request not found")
  return hydrateRequest(db, row)
}

export async function decideCustomerBusinessAccountRequest(
  db: VoyantDb,
  input: {
    requestId: string
    fromStatus: "pending"
    status: "approved" | "rejected" | "canceled"
    decidedBy: string | null
    decisionReason?: string | null
    authOrganizationId?: string
    relationshipOrganizationId?: string
  },
): Promise<CustomerBusinessAccountRequestDto> {
  const now = new Date()
  const [updated] = await db
    .update(customerAuthBusinessAccountRequest)
    .set({
      status: input.status,
      updatedAt: now,
      decidedAt: now,
      decidedBy: input.decidedBy,
      decisionReason: input.decisionReason ?? null,
      authOrganizationId: input.authOrganizationId,
      relationshipOrganizationId: input.relationshipOrganizationId,
    })
    .where(
      and(
        eq(customerAuthBusinessAccountRequest.id, input.requestId),
        eq(customerAuthBusinessAccountRequest.status, input.fromStatus),
      ),
    )
    .returning()
  if (!updated) {
    throw new CustomerBusinessOnboardingConflictError(
      "Business-account request is no longer pending",
    )
  }
  return hydrateRequest(db, updated)
}
