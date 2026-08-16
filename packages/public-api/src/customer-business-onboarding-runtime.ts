import type {
  CustomerBusinessAccountOnboardingRuntimeProvider,
  CustomerBusinessOnboardingContext,
} from "@voyant-travel/auth/customer-business-onboarding-runtime-port"
import {
  CustomerBusinessOnboardingConflictError,
  CustomerBusinessOnboardingNotFoundError,
  createCustomerBusinessAccountRequest,
  decideCustomerBusinessAccountRequest,
  getCustomerBusinessAccountRequestForUpdate,
  listCustomerBusinessAccountRequests,
  materializeCustomerBusinessAccount,
} from "@voyant-travel/auth/customer-business-onboarding-service"
import { customerAuthUser } from "@voyant-travel/db/schema/iam"
import type { VoyantDb } from "@voyant-travel/hono"
import { organizations, relationshipsService } from "@voyant-travel/relationships"
import { and, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

const onboardingOrganizationSource = "customer_auth.business_account_request"

type TransactionDb = CustomerBusinessOnboardingContext["db"]

async function canonicalOrganizationForRequest(
  db: TransactionDb,
  input: {
    requestId: string
    profile: {
      name: string
      legalName: string | null
      taxId: string | null
      website: string | null
    }
  },
) {
  const [existing] = await db
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.source, onboardingOrganizationSource),
        eq(organizations.sourceRef, input.requestId),
      ),
    )
    .limit(1)
  if (existing) {
    if (existing.status !== "active") {
      throw new CustomerBusinessOnboardingConflictError(
        "Canonical business organization is not active",
      )
    }
    return existing
  }

  const created = await relationshipsService.createOrganization(
    db as unknown as PostgresJsDatabase,
    {
      name: input.profile.name,
      legalName: input.profile.legalName,
      taxId: input.profile.taxId,
      website: input.profile.website,
      relation: "client",
      status: "active",
      source: onboardingOrganizationSource,
      sourceRef: input.requestId,
      tags: [],
    },
  )
  if (!created) {
    throw new CustomerBusinessOnboardingConflictError(
      "Canonical business organization could not be created",
    )
  }
  return created
}

async function existingCanonicalOrganization(db: TransactionDb, id: string) {
  const organization = await relationshipsService.getOrganizationById(
    db as unknown as PostgresJsDatabase,
    id,
  )
  if (!organization) {
    throw new CustomerBusinessOnboardingNotFoundError(
      "Canonical Relationships organization does not exist",
    )
  }
  if (organization.status !== "active") {
    throw new CustomerBusinessOnboardingConflictError(
      "Canonical Relationships organization is not active",
    )
  }
  return organization
}

async function resolveCustomerOwner(
  db: TransactionDb,
  selector: { userId?: string; email?: string },
) {
  const [owner] = await db
    .select({
      id: customerAuthUser.id,
      email: customerAuthUser.email,
      emailVerified: customerAuthUser.emailVerified,
    })
    .from(customerAuthUser)
    .where(
      selector.userId
        ? eq(customerAuthUser.id, selector.userId)
        : sql`lower(${customerAuthUser.email}) = lower(${selector.email ?? ""})`,
    )
    .limit(1)
  if (!owner) {
    throw new CustomerBusinessOnboardingNotFoundError("Customer owner does not exist")
  }
  if (owner.email && !owner.emailVerified) {
    throw new CustomerBusinessOnboardingConflictError(
      "Customer owner must verify their email before business provisioning",
    )
  }
  return owner
}

async function approveLockedRequest(
  db: TransactionDb,
  input: { requestId: string; decidedBy: string; reason?: string | null },
) {
  const request = await getCustomerBusinessAccountRequestForUpdate(db, input.requestId)
  if (request.status === "approved") {
    if (!request.relationshipOrganizationId) {
      throw new CustomerBusinessOnboardingConflictError(
        "Approved request has no canonical organization",
      )
    }
    return {
      request,
      account: await materializeCustomerBusinessAccount(db, {
        ownerUserId: request.requesterUserId,
        name: request.profile.name,
        relationshipOrganizationId: request.relationshipOrganizationId,
      }),
    }
  }
  if (request.status !== "pending") {
    throw new CustomerBusinessOnboardingConflictError(
      "Business-account request is no longer pending",
    )
  }

  const relationshipOrganization = await canonicalOrganizationForRequest(db, {
    requestId: request.id,
    profile: request.profile,
  })
  const account = await materializeCustomerBusinessAccount(db, {
    ownerUserId: request.requesterUserId,
    name: relationshipOrganization.name,
    relationshipOrganizationId: relationshipOrganization.id,
  })
  const approved = await decideCustomerBusinessAccountRequest(db, {
    requestId: request.id,
    fromStatus: "pending",
    status: "approved",
    decidedBy: input.decidedBy,
    decisionReason: input.reason,
    authOrganizationId: account.authOrganizationId,
    relationshipOrganizationId: account.relationshipOrganizationId,
  })
  return { account, request: approved }
}

export function createPublicApiCustomerBusinessOnboardingRuntime(): CustomerBusinessAccountOnboardingRuntimeProvider {
  return {
    async getCapabilities() {
      return { viewRequests: true, decideRequests: true, provisionAccounts: true }
    },

    async createBusinessAccount(context, input) {
      return context.db.transaction(async (tx) => {
        const database = tx as unknown as VoyantDb
        const request = await createCustomerBusinessAccountRequest(database, {
          ...input,
          mode: "open",
        })
        return (
          await approveLockedRequest(database, {
            requestId: request.id,
            decidedBy: `customer:${input.requesterUserId}`,
          })
        ).account
      })
    },

    async requestBusinessAccount(context, input) {
      return context.db.transaction((tx) =>
        createCustomerBusinessAccountRequest(tx as unknown as VoyantDb, {
          ...input,
          mode: "request",
        }),
      )
    },

    async listRequests(context, input) {
      return listCustomerBusinessAccountRequests(context.db, input)
    },

    async cancelRequest(context, input) {
      return context.db.transaction(async (tx) => {
        const database = tx as unknown as VoyantDb
        const request = await getCustomerBusinessAccountRequestForUpdate(database, input.requestId)
        if (request.requesterUserId !== input.requesterUserId) {
          throw new CustomerBusinessOnboardingNotFoundError("Business-account request not found")
        }
        return decideCustomerBusinessAccountRequest(database, {
          requestId: request.id,
          fromStatus: "pending",
          status: "canceled",
          decidedBy: null,
        })
      })
    },

    async approveRequest(context, input) {
      return context.db.transaction((tx) => approveLockedRequest(tx as unknown as VoyantDb, input))
    },

    async rejectRequest(context, input) {
      return context.db.transaction(async (tx) => {
        const database = tx as unknown as VoyantDb
        const request = await getCustomerBusinessAccountRequestForUpdate(database, input.requestId)
        if (request.status !== "pending") {
          throw new CustomerBusinessOnboardingConflictError(
            "Business-account request is no longer pending",
          )
        }
        return decideCustomerBusinessAccountRequest(database, {
          requestId: request.id,
          fromStatus: "pending",
          status: "rejected",
          decidedBy: input.decidedBy,
          decisionReason: input.reason,
        })
      })
    },

    async provisionBusinessAccount(context, input) {
      return context.db.transaction(async (tx) => {
        const database = tx as unknown as VoyantDb
        const owner = await resolveCustomerOwner(database, input.owner)
        const existingCanonical =
          "relationshipOrganizationId" in input && input.relationshipOrganizationId
            ? await existingCanonicalOrganization(database, input.relationshipOrganizationId)
            : null
        const profile = existingCanonical
          ? {
              name: existingCanonical.name,
              legalName: existingCanonical.legalName,
              taxId: existingCanonical.taxId,
              website: existingCanonical.website,
            }
          : input.profile
        if (!profile) {
          throw new CustomerBusinessOnboardingConflictError(
            "A business profile is required when provisioning a new canonical organization",
          )
        }
        const request = await createCustomerBusinessAccountRequest(database, {
          requesterUserId: owner.id,
          publicApiOrigin: input.publicApiOrigin,
          mode: "invite-only",
          idempotencyKey: input.idempotencyKey,
          profile,
        })

        if (existingCanonical) {
          const account = await materializeCustomerBusinessAccount(database, {
            ownerUserId: owner.id,
            name: existingCanonical.name,
            relationshipOrganizationId: existingCanonical.id,
          })
          if (request.status === "approved") return account
          await decideCustomerBusinessAccountRequest(database, {
            requestId: request.id,
            fromStatus: "pending",
            status: "approved",
            decidedBy: input.decidedBy,
            authOrganizationId: account.authOrganizationId,
            relationshipOrganizationId: account.relationshipOrganizationId,
          })
          return account
        }

        return (
          await approveLockedRequest(database, {
            requestId: request.id,
            decidedBy: input.decidedBy,
          })
        ).account
      })
    },
  }
}
