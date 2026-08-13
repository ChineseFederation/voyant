// agent-quality: file-size exception -- owner: crm; existing service module stays co-located until a dedicated split preserves behavior and tests.
import { and, desc, eq, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"

import { normalizeProposalPaymentTerms } from "../payment-terms.js"
import {
  type Proposal,
  type ProposalVersion,
  type ProposalVersionLine,
  proposalProducts,
  proposals,
  proposalVersionLines,
  proposalVersions,
} from "../schema.js"
import type {
  acceptProposalVersionSchema,
  applyTripSnapshotToProposalVersionSchema,
  declineProposalVersionSchema,
  expireProposalVersionsSchema,
  insertProposalVersionLineSchema,
  insertProposalVersionSchema,
  proposalVersionListQuerySchema,
  sendProposalVersionSchema,
  updateProposalVersionLineSchema,
  updateProposalVersionSchema,
} from "../validation.js"
import { paginate } from "./helpers.js"

type ProposalVersionListQuery = z.infer<typeof proposalVersionListQuerySchema>
type CreateProposalVersionInput = z.infer<typeof insertProposalVersionSchema>
type UpdateProposalVersionInput = z.infer<typeof updateProposalVersionSchema>
type CreateProposalVersionLineInput = z.infer<typeof insertProposalVersionLineSchema>
type UpdateProposalVersionLineInput = z.infer<typeof updateProposalVersionLineSchema>
type ApplyTripSnapshotToProposalVersionInput = z.infer<
  typeof applyTripSnapshotToProposalVersionSchema
>
type SendProposalVersionInput = z.infer<typeof sendProposalVersionSchema>
type AcceptProposalVersionInput = z.infer<typeof acceptProposalVersionSchema>
type DeclineProposalVersionInput = z.infer<typeof declineProposalVersionSchema>
type ExpireProposalVersionsInput = z.infer<typeof expireProposalVersionsSchema>

// fallow-ignore-next-line unused-type
export interface ProposalVersionProposalReadModel {
  proposal: Proposal
  proposalVersion: ProposalVersion
  lines: ProposalVersionLine[]
}

export interface AcceptProposalVersionResult {
  proposal: Proposal
  proposalVersion: ProposalVersion
  closedProposalVersions: ProposalVersion[]
}

export class ProposalVersionConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProposalVersionConflictError"
  }
}

export class ProposalVersionParentNotFoundError extends Error {
  constructor(proposalId: string) {
    super(`Proposal not found: ${proposalId}`)
    this.name = "ProposalVersionParentNotFoundError"
  }
}

function normalizeTimestamp(value: string | null | undefined) {
  return value == null ? value : new Date(value)
}

function normalizeNow(value: Date | string | null | undefined) {
  return value instanceof Date ? value : value ? new Date(value) : new Date()
}

function toDateString(value: Date) {
  return value.toISOString().slice(0, 10)
}

function uniqueCurrencies(currencies: ReadonlyArray<string | null | undefined>) {
  return Array.from(new Set(currencies.filter((currency): currency is string => Boolean(currency))))
}

export function resolveProposalVersionSnapshotCurrency(
  proposalCurrency: string | null | undefined,
  productCurrencies: ReadonlyArray<string | null | undefined>,
) {
  const currencies = uniqueCurrencies(productCurrencies)
  if (currencies.length > 1) {
    throw new ProposalVersionConflictError(
      "Proposal products must use a single currency before creating a Proposal Version snapshot",
    )
  }
  return currencies[0] ?? proposalCurrency ?? "USD"
}

function assertProposalVersionLineCurrency(
  versionCurrency: string,
  lines: ReadonlyArray<{ currency: string }>,
  message: string,
) {
  if (lines.some((line) => line.currency !== versionCurrency)) {
    throw new ProposalVersionConflictError(message)
  }
}

export const proposalVersionsService = {
  async listProposalVersions(db: PostgresJsDatabase, query: ProposalVersionListQuery) {
    const conditions = []
    if (query.proposalId) conditions.push(eq(proposalVersions.proposalId, query.proposalId))
    if (query.status) conditions.push(eq(proposalVersions.status, query.status))
    const where = conditions.length ? and(...conditions) : undefined

    return paginate(
      db
        .select()
        .from(proposalVersions)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(proposalVersions.updatedAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(proposalVersions).where(where),
      query.limit,
      query.offset,
    )
  },

  async getProposalVersionById(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .select()
      .from(proposalVersions)
      .where(eq(proposalVersions.id, id))
      .limit(1)
    return row ?? null
  },

  /**
   * The payment terms one version states, or `null` when it states none.
   *
   * Narrow on purpose: this is what finance's payment-policy cascade asks for
   * when a booking traces back to an accepted Proposal Version, and it has no
   * business loading the rest of the proposal to get it.
   */
  async getProposalVersionPaymentTerms(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .select({ paymentTerms: proposalVersions.paymentTerms })
      .from(proposalVersions)
      .where(eq(proposalVersions.id, id))
      .limit(1)
    return normalizeProposalPaymentTerms(row?.paymentTerms)
  },

  async getProposalVersionProposal(
    db: PostgresJsDatabase,
    id: string,
  ): Promise<ProposalVersionProposalReadModel | null> {
    const [row] = await db
      .select({
        proposalVersion: proposalVersions,
        proposal: proposals,
      })
      .from(proposalVersions)
      .innerJoin(proposals, eq(proposalVersions.proposalId, proposals.id))
      .where(eq(proposalVersions.id, id))
      .limit(1)

    if (!row) return null

    return {
      proposal: row.proposal,
      proposalVersion: row.proposalVersion,
      lines: await db
        .select()
        .from(proposalVersionLines)
        .where(eq(proposalVersionLines.proposalVersionId, id))
        .orderBy(proposalVersionLines.createdAt),
    }
  },

  async createProposalVersion(db: PostgresJsDatabase, data: CreateProposalVersionInput) {
    if (data.status && data.status !== "draft") {
      throw new ProposalVersionConflictError(
        "Proposal Versions must be created as draft; use lifecycle routes for status changes",
      )
    }

    const [proposal] = await db
      .select({ id: proposals.id })
      .from(proposals)
      .where(eq(proposals.id, data.proposalId))
      .limit(1)
    if (!proposal) throw new ProposalVersionParentNotFoundError(data.proposalId)

    const values = {
      ...data,
      sentAt: normalizeTimestamp(data.sentAt),
      viewedAt: normalizeTimestamp(data.viewedAt),
      decidedAt: normalizeTimestamp(data.decidedAt),
    }
    const [row] = await db.insert(proposalVersions).values(values).returning()
    return row
  },

  /**
   * Snapshot the proposal's CURRENT line items into a new version ("save a
   * proposal"). Copies `proposalProducts` → `proposalVersionLines` with the computed
   * total, links `supersedesId` to the prior current version, and supersedes
   * every still-live (draft/sent) version so exactly one version is current.
   * Returns `null` if the proposal doesn't exist.
   */
  async createVersionSnapshotFromProposal(db: PostgresJsDatabase, proposalId: string) {
    return db.transaction(async (tx) => {
      const [proposal] = await tx
        .select()
        .from(proposals)
        .where(eq(proposals.id, proposalId))
        .limit(1)
      if (!proposal) return null

      const products = await tx
        .select()
        .from(proposalProducts)
        .where(eq(proposalProducts.proposalId, proposalId))
        .orderBy(proposalProducts.createdAt)
      const currency = resolveProposalVersionSnapshotCurrency(
        proposal.valueCurrency,
        products.map((product) => product.currency),
      )

      const lines = products.map((product) => {
        const unit = product.unitPriceAmountCents ?? 0
        return {
          productId: product.productId,
          supplierServiceId: product.supplierServiceId,
          description: product.nameSnapshot,
          quantity: product.quantity,
          unitPriceAmountCents: unit,
          totalAmountCents: unit * product.quantity - (product.discountAmountCents ?? 0),
          currency: product.currency || currency,
        }
      })
      const subtotal = lines.reduce((sum, line) => sum + line.totalAmountCents, 0)

      // The prior current version (newest non-superseded) becomes this one's
      // predecessor before we supersede the live ones.
      const [previous] = await tx
        .select({ id: proposalVersions.id })
        .from(proposalVersions)
        .where(
          and(
            eq(proposalVersions.proposalId, proposalId),
            ne(proposalVersions.status, "superseded"),
          ),
        )
        .orderBy(desc(proposalVersions.updatedAt))
        .limit(1)

      // The prior live version(s) are no longer valid once a new one is saved —
      // mark them expired so exactly one version reads as current.
      await tx
        .update(proposalVersions)
        .set({ status: "expired", updatedAt: new Date() })
        .where(
          and(
            eq(proposalVersions.proposalId, proposalId),
            or(eq(proposalVersions.status, "draft"), eq(proposalVersions.status, "sent")),
          ),
        )

      const [version] = await tx
        .insert(proposalVersions)
        .values({
          proposalId,
          currency,
          status: "draft",
          supersedesId: previous?.id ?? null,
          subtotalAmountCents: subtotal,
          taxAmountCents: 0,
          totalAmountCents: subtotal,
          notes: proposal.description,
        })
        .returning()
      if (!version) throw new Error("Failed to create proposal version snapshot")

      if (lines.length) {
        await tx
          .insert(proposalVersionLines)
          .values(lines.map((line) => ({ ...line, proposalVersionId: version.id })))
      }

      return version
    })
  },

  async updateProposalVersion(
    db: PostgresJsDatabase,
    id: string,
    data: UpdateProposalVersionInput,
  ) {
    if (data.status !== undefined) {
      throw new ProposalVersionConflictError(
        "Proposal Version status changes must use lifecycle routes",
      )
    }

    const values = {
      ...data,
      sentAt: normalizeTimestamp(data.sentAt),
      viewedAt: normalizeTimestamp(data.viewedAt),
      decidedAt: normalizeTimestamp(data.decidedAt),
      updatedAt: new Date(),
    }
    const [row] = await db
      .update(proposalVersions)
      .set(values)
      .where(and(eq(proposalVersions.id, id), eq(proposalVersions.status, "draft")))
      .returning()
    if (row) return row

    const [existing] = await db
      .select({ status: proposalVersions.status })
      .from(proposalVersions)
      .where(eq(proposalVersions.id, id))
      .limit(1)
    if (!existing) return null
    throw new ProposalVersionConflictError("Proposal Versions can only be edited while draft")
  },

  /**
   * Set a version's validity date. Narrow on purpose — the generic update
   * schema carries insert defaults (status/totals) that would otherwise be
   * written, so validity gets its own path.
   */
  async setProposalVersionValidUntil(
    db: PostgresJsDatabase,
    id: string,
    validUntil: string | null,
  ) {
    const [row] = await db
      .update(proposalVersions)
      .set({ validUntil, updatedAt: new Date() })
      .where(eq(proposalVersions.id, id))
      .returning()
    return row ?? null
  },

  async deleteProposalVersion(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(proposalVersions)
      .where(and(eq(proposalVersions.id, id), eq(proposalVersions.status, "draft")))
      .returning({ id: proposalVersions.id })
    if (row) return row

    const [existing] = await db
      .select({ status: proposalVersions.status })
      .from(proposalVersions)
      .where(eq(proposalVersions.id, id))
      .limit(1)
    if (!existing) return null
    throw new ProposalVersionConflictError("Proposal Versions can only be deleted while draft")
  },

  async applyTripSnapshotToProposalVersion(
    db: PostgresJsDatabase,
    id: string,
    data: ApplyTripSnapshotToProposalVersionInput,
  ) {
    assertProposalVersionLineCurrency(
      data.currency,
      data.lines,
      "Trip snapshot lines must use the Proposal Version currency",
    )

    return db.transaction(async (tx) => {
      const [proposalVersion] = await tx
        .update(proposalVersions)
        .set({
          tripSnapshotId: data.tripSnapshotId,
          currency: data.currency,
          subtotalAmountCents: data.subtotalAmountCents,
          taxAmountCents: data.taxAmountCents,
          totalAmountCents: data.totalAmountCents,
          updatedAt: new Date(),
        })
        .where(and(eq(proposalVersions.id, id), eq(proposalVersions.status, "draft")))
        .returning()

      if (!proposalVersion) {
        const [existing] = await tx
          .select({ status: proposalVersions.status })
          .from(proposalVersions)
          .where(eq(proposalVersions.id, id))
          .limit(1)
        if (!existing) return null
        throw new ProposalVersionConflictError(
          "Trip snapshots can only be applied to draft Proposal Versions",
        )
      }

      await tx.delete(proposalVersionLines).where(eq(proposalVersionLines.proposalVersionId, id))

      const lineValues = data.lines.map(({ componentId: _componentId, ...line }) => ({
        ...line,
        proposalVersionId: id,
      }))
      const lines =
        lineValues.length > 0
          ? await tx.insert(proposalVersionLines).values(lineValues).returning()
          : []

      return { proposalVersion, lines }
    })
  },

  async sendProposalVersion(
    db: PostgresJsDatabase,
    id: string,
    data: SendProposalVersionInput = {},
  ) {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(proposalVersions)
        .where(eq(proposalVersions.id, id))
        .limit(1)

      if (!existing) return null
      if (existing.status !== "draft") {
        throw new ProposalVersionConflictError("Proposal Versions can only be sent from draft")
      }
      // A version may be sent for client review whether its lines come from a
      // frozen Trip snapshot or from the proposal's products (line-item proposal).
      // (Accept → reserve still requires a Trip snapshot; see the public accept.)

      const now = new Date()
      const validUntil = data.validUntil === undefined ? existing.validUntil : data.validUntil
      if (validUntil && validUntil < toDateString(now)) {
        throw new ProposalVersionConflictError("Proposal Version validUntil must be today or later")
      }

      const lines = await tx
        .select({ currency: proposalVersionLines.currency })
        .from(proposalVersionLines)
        .where(eq(proposalVersionLines.proposalVersionId, id))
      assertProposalVersionLineCurrency(
        existing.currency,
        lines,
        "Proposal Version lines must use the Proposal Version currency before sending",
      )

      const [row] = await tx
        .update(proposalVersions)
        .set({
          status: "sent",
          validUntil,
          sentAt: now,
          viewedAt: null,
          decidedAt: null,
          updatedAt: now,
        })
        .where(eq(proposalVersions.id, id))
        .returning()

      return row ?? null
    })
  },

  async markProposalVersionViewed(db: PostgresJsDatabase, id: string) {
    const now = new Date()
    const [row] = await db
      .update(proposalVersions)
      .set({
        viewedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(proposalVersions.id, id),
          eq(proposalVersions.status, "sent"),
          isNull(proposalVersions.viewedAt),
        ),
      )
      .returning()

    if (row) return row

    const [existing] = await db
      .select()
      .from(proposalVersions)
      .where(eq(proposalVersions.id, id))
      .limit(1)
    return existing ?? null
  },

  async acceptProposalVersion(
    db: PostgresJsDatabase,
    id: string,
    _data: AcceptProposalVersionInput = {},
  ): Promise<AcceptProposalVersionResult | null> {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          proposalVersion: proposalVersions,
          proposal: proposals,
        })
        .from(proposalVersions)
        .innerJoin(proposals, eq(proposalVersions.proposalId, proposals.id))
        .where(eq(proposalVersions.id, id))
        .limit(1)

      if (!current) return null

      if (
        current.proposal.acceptedVersionId &&
        current.proposal.acceptedVersionId !== current.proposalVersion.id
      ) {
        throw new ProposalVersionConflictError("Proposal already has an accepted Proposal Version")
      }

      if (current.proposalVersion.status === "accepted") {
        return {
          proposal: current.proposal,
          proposalVersion: current.proposalVersion,
          closedProposalVersions: [],
        }
      }

      if (current.proposalVersion.status !== "sent") {
        throw new ProposalVersionConflictError(
          "Proposal Versions can only be accepted after they are sent",
        )
      }

      const now = new Date()
      const [proposalVersion] = await tx
        .update(proposalVersions)
        .set({
          status: "accepted",
          decidedAt: now,
          updatedAt: now,
        })
        .where(and(eq(proposalVersions.id, id), eq(proposalVersions.status, "sent")))
        .returning()

      if (!proposalVersion) {
        throw new ProposalVersionConflictError(
          "Proposal Versions can only be accepted after they are sent",
        )
      }

      const declinedVersions = await tx
        .update(proposalVersions)
        .set({
          status: "declined",
          decidedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(proposalVersions.proposalId, proposalVersion.proposalId),
            ne(proposalVersions.id, proposalVersion.id),
            eq(proposalVersions.status, "sent"),
          ),
        )
        .returning()

      const supersededVersions = await tx
        .update(proposalVersions)
        .set({
          status: "superseded",
          decidedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(proposalVersions.proposalId, proposalVersion.proposalId),
            ne(proposalVersions.id, proposalVersion.id),
            eq(proposalVersions.status, "draft"),
          ),
        )
        .returning()

      const [proposal] = await tx
        .update(proposals)
        .set({
          status: "won",
          acceptedVersionId: proposalVersion.id,
          valueAmountCents: proposalVersion.totalAmountCents,
          valueCurrency: proposalVersion.currency,
          closedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(proposals.id, proposalVersion.proposalId),
            or(
              isNull(proposals.acceptedVersionId),
              eq(proposals.acceptedVersionId, proposalVersion.id),
            ),
          ),
        )
        .returning()

      if (!proposal) {
        throw new ProposalVersionConflictError("Proposal already has an accepted Proposal Version")
      }

      return {
        proposal,
        proposalVersion,
        closedProposalVersions: [...declinedVersions, ...supersededVersions],
      }
    })
  },

  async declineProposalVersion(
    db: PostgresJsDatabase,
    id: string,
    _data: DeclineProposalVersionInput = {},
  ) {
    const now = new Date()
    const [row] = await db
      .update(proposalVersions)
      .set({
        status: "declined",
        decidedAt: now,
        updatedAt: now,
      })
      .where(and(eq(proposalVersions.id, id), eq(proposalVersions.status, "sent")))
      .returning()

    if (row) return row

    const [existing] = await db
      .select({ status: proposalVersions.status })
      .from(proposalVersions)
      .where(eq(proposalVersions.id, id))
      .limit(1)
    if (!existing) return null
    throw new ProposalVersionConflictError(
      "Proposal Versions can only be declined after they are sent",
    )
  },

  async expireProposalVersionIfPastValidUntil(
    db: PostgresJsDatabase,
    id: string,
    nowValue?: Date | string,
  ) {
    const now = normalizeNow(nowValue)
    const [row] = await db
      .update(proposalVersions)
      .set({
        status: "expired",
        decidedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(proposalVersions.id, id),
          eq(proposalVersions.status, "sent"),
          isNotNull(proposalVersions.validUntil),
          lt(proposalVersions.validUntil, toDateString(now)),
        ),
      )
      .returning()

    return row ?? null
  },

  async expireProposalVersions(db: PostgresJsDatabase, data: ExpireProposalVersionsInput = {}) {
    const now = normalizeNow(data.now)
    const rows = await db
      .update(proposalVersions)
      .set({
        status: "expired",
        decidedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(proposalVersions.status, "sent"),
          isNotNull(proposalVersions.validUntil),
          lt(proposalVersions.validUntil, toDateString(now)),
        ),
      )
      .returning()

    return rows
  },

  listProposalVersionLines(db: PostgresJsDatabase, proposalVersionId: string) {
    return db
      .select()
      .from(proposalVersionLines)
      .where(eq(proposalVersionLines.proposalVersionId, proposalVersionId))
      .orderBy(proposalVersionLines.createdAt)
  },

  async createProposalVersionLine(
    db: PostgresJsDatabase,
    proposalVersionId: string,
    data: CreateProposalVersionLineInput,
  ) {
    const [proposalVersion] = await db
      .select({ currency: proposalVersions.currency, status: proposalVersions.status })
      .from(proposalVersions)
      .where(eq(proposalVersions.id, proposalVersionId))
      .limit(1)

    if (!proposalVersion) return null
    if (proposalVersion.status !== "draft") {
      throw new ProposalVersionConflictError(
        "Proposal Version lines can only be edited while draft",
      )
    }
    if (data.currency !== proposalVersion.currency) {
      throw new ProposalVersionConflictError(
        "Proposal Version lines must use the Proposal Version currency",
      )
    }

    const [row] = await db
      .insert(proposalVersionLines)
      .values({ ...data, proposalVersionId })
      .returning()
    return row
  },

  async updateProposalVersionLine(
    db: PostgresJsDatabase,
    id: string,
    data: UpdateProposalVersionLineInput,
  ) {
    const [existing] = await db
      .select({
        currency: proposalVersions.currency,
        status: proposalVersions.status,
      })
      .from(proposalVersionLines)
      .innerJoin(proposalVersions, eq(proposalVersionLines.proposalVersionId, proposalVersions.id))
      .where(eq(proposalVersionLines.id, id))
      .limit(1)

    if (!existing) return null
    if (existing.status !== "draft") {
      throw new ProposalVersionConflictError(
        "Proposal Version lines can only be edited while draft",
      )
    }
    if (data.currency !== undefined && data.currency !== existing.currency) {
      throw new ProposalVersionConflictError(
        "Proposal Version lines must use the Proposal Version currency",
      )
    }

    const [row] = await db
      .update(proposalVersionLines)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(proposalVersionLines.id, id))
      .returning()
    return row ?? null
  },

  async deleteProposalVersionLine(db: PostgresJsDatabase, id: string) {
    const [existing] = await db
      .select({
        status: proposalVersions.status,
      })
      .from(proposalVersionLines)
      .innerJoin(proposalVersions, eq(proposalVersionLines.proposalVersionId, proposalVersions.id))
      .where(eq(proposalVersionLines.id, id))
      .limit(1)

    if (!existing) return null
    if (existing.status !== "draft") {
      throw new ProposalVersionConflictError(
        "Proposal Version lines can only be edited while draft",
      )
    }

    const [row] = await db
      .delete(proposalVersionLines)
      .where(eq(proposalVersionLines.id, id))
      .returning({ id: proposalVersionLines.id })
    return row ?? null
  },
}
