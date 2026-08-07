// agent-quality: file-size exception -- owner: legal; existing service module stays co-located until a dedicated split preserves behavior and tests.
import { and, desc, eq, exists, gte, ilike, lte, or, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { normalizeLegalTargetFields } from "../targets/service.js"
import {
  policies,
  policyAcceptances,
  policyAssignments,
  policyRules,
  policyVersions,
} from "./schema.js"
import {
  type CancellationPolicySnapshotV1,
  type CancellationRule,
  type CreatePolicyAcceptanceInput,
  type CreatePolicyAssignmentInput,
  type CreatePolicyInput,
  type CreatePolicyRuleInput,
  type CreatePolicyVersionInput,
  type EvaluateCancellationInput,
  evaluateCancellationPolicy,
  evaluateSegmentedCancellation,
  type PolicyAcceptanceListQuery,
  type PolicyAssignmentListQuery,
  type PolicyListQuery,
  paginate,
  type ResolvePolicyInput,
  type SegmentedCancellationResult,
  toDateString,
  type UpdatePolicyAssignmentInput,
  type UpdatePolicyInput,
  type UpdatePolicyRuleInput,
  type UpdatePolicyVersionInput,
} from "./service-shared.js"

export const policiesCoreService = {
  async listPolicies(db: PostgresJsDatabase, query: PolicyListQuery) {
    const conditions = []
    if (query.kind) conditions.push(eq(policies.kind, query.kind))
    if (query.language) conditions.push(eq(policies.language, query.language))
    if (query.search) {
      const term = `%${query.search}%`
      conditions.push(
        or(
          ilike(policies.name, term),
          ilike(policies.slug, term),
          ilike(policies.description, term),
        ),
      )
    }
    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(policies)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(policies.updatedAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(policies).where(where),
      query.limit,
      query.offset,
    )
  },
  async getPolicyById(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(policies).where(eq(policies.id, id)).limit(1)
    return row ?? null
  },
  async getPolicyBySlug(db: PostgresJsDatabase, slug: string) {
    const [row] = await db.select().from(policies).where(eq(policies.slug, slug)).limit(1)
    return row ?? null
  },
  async createPolicy(db: PostgresJsDatabase, data: CreatePolicyInput) {
    const [row] = await db.insert(policies).values(data).returning()
    return row ?? null
  },
  async updatePolicy(db: PostgresJsDatabase, id: string, data: UpdatePolicyInput) {
    const [row] = await db
      .update(policies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(policies.id, id))
      .returning()
    return row ?? null
  },
  async deletePolicy(db: PostgresJsDatabase, id: string) {
    const [policy] = await db
      .select({ id: policies.id })
      .from(policies)
      .where(eq(policies.id, id))
      .limit(1)
    if (!policy) return { status: "not_found" as const }

    const [acceptance] = await db
      .select({ id: policyAcceptances.id })
      .from(policyAcceptances)
      .where(
        exists(
          db
            .select({ id: policyVersions.id })
            .from(policyVersions)
            .where(
              and(
                eq(policyVersions.policyId, id),
                eq(policyVersions.id, policyAcceptances.policyVersionId),
              ),
            ),
        ),
      )
      .limit(1)
    if (acceptance) return { status: "has_acceptances" as const }

    const [row] = await db
      .delete(policies)
      .where(eq(policies.id, id))
      .returning({ id: policies.id })
    return row ? { status: "deleted" as const, id: row.id } : { status: "not_found" as const }
  },
  listPolicyVersions(db: PostgresJsDatabase, policyId: string) {
    return db
      .select()
      .from(policyVersions)
      .where(eq(policyVersions.policyId, policyId))
      .orderBy(desc(policyVersions.version))
  },
  async getPolicyVersionById(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(policyVersions).where(eq(policyVersions.id, id)).limit(1)
    return row ?? null
  },
  async createPolicyVersion(
    db: PostgresJsDatabase,
    policyId: string,
    data: CreatePolicyVersionInput,
  ) {
    return db.transaction(async (tx) => {
      const [policy] = await tx
        .select({ id: policies.id })
        .from(policies)
        .where(eq(policies.id, policyId))
        .limit(1)
      if (!policy) return null
      const [maxRow] = await tx
        .select({ max: sql<number>`coalesce(max(${policyVersions.version}), 0)::int` })
        .from(policyVersions)
        .where(eq(policyVersions.policyId, policyId))
      const nextVersion = (maxRow?.max ?? 0) + 1
      const [row] = await tx
        .insert(policyVersions)
        .values({
          policyId,
          version: nextVersion,
          status: "draft",
          title: data.title,
          body: data.body ?? null,
          publishedBy: data.publishedBy ?? null,
          metadata: data.metadata ?? null,
        })
        .returning()
      return row ?? null
    })
  },
  async updatePolicyVersion(
    db: PostgresJsDatabase,
    versionId: string,
    data: UpdatePolicyVersionInput,
  ) {
    const [row] = await db
      .update(policyVersions)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(policyVersions.id, versionId), eq(policyVersions.status, "draft")))
      .returning()
    return row ?? null
  },
  async publishPolicyVersion(db: PostgresJsDatabase, versionId: string) {
    return db.transaction(async (tx) => {
      const [version] = await tx
        .select()
        .from(policyVersions)
        .where(eq(policyVersions.id, versionId))
        .limit(1)
      if (!version) return { status: "not_found" as const }
      if (version.status !== "draft") return { status: "not_draft" as const }
      const now = new Date()
      await tx
        .update(policyVersions)
        .set({ status: "retired", retiredAt: now, updatedAt: now })
        .where(
          and(
            eq(policyVersions.policyId, version.policyId),
            eq(policyVersions.status, "published"),
          ),
        )
      const [published] = await tx
        .update(policyVersions)
        .set({ status: "published", publishedAt: now, updatedAt: now })
        .where(eq(policyVersions.id, versionId))
        .returning()
      await tx
        .update(policies)
        .set({ currentVersionId: versionId, updatedAt: now })
        .where(eq(policies.id, version.policyId))
      return { status: "published" as const, version: published ?? null }
    })
  },
  async retirePolicyVersion(db: PostgresJsDatabase, versionId: string) {
    const [row] = await db
      .update(policyVersions)
      .set({ status: "retired", retiredAt: new Date(), updatedAt: new Date() })
      .where(eq(policyVersions.id, versionId))
      .returning()
    return row ?? null
  },
  listPolicyRules(db: PostgresJsDatabase, versionId: string) {
    return db
      .select()
      .from(policyRules)
      .where(eq(policyRules.policyVersionId, versionId))
      .orderBy(policyRules.sortOrder, policyRules.createdAt)
  },
  async createPolicyRule(db: PostgresJsDatabase, versionId: string, data: CreatePolicyRuleInput) {
    const [version] = await db
      .select({ id: policyVersions.id })
      .from(policyVersions)
      .where(eq(policyVersions.id, versionId))
      .limit(1)
    if (!version) return null
    const [row] = await db
      .insert(policyRules)
      .values({
        policyVersionId: versionId,
        ruleType: data.ruleType,
        label: data.label ?? null,
        daysBeforeDeparture: data.daysBeforeDeparture ?? null,
        refundPercent: data.refundPercent ?? null,
        refundType: data.refundType ?? null,
        flatAmountCents: data.flatAmountCents ?? null,
        currency: data.currency ?? null,
        validFrom: toDateString(data.validFrom),
        validTo: toDateString(data.validTo),
        conditions: data.conditions ?? null,
        sortOrder: data.sortOrder,
      })
      .returning()
    return row ?? null
  },
  async updatePolicyRule(db: PostgresJsDatabase, ruleId: string, data: UpdatePolicyRuleInput) {
    const [row] = await db
      .update(policyRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(policyRules.id, ruleId))
      .returning()
    return row ?? null
  },
  async deletePolicyRule(db: PostgresJsDatabase, ruleId: string) {
    const [row] = await db
      .delete(policyRules)
      .where(eq(policyRules.id, ruleId))
      .returning({ id: policyRules.id })
    return row ?? null
  },
  async listPolicyAssignments(db: PostgresJsDatabase, query: PolicyAssignmentListQuery) {
    const conditions = []
    if (query.policyId) conditions.push(eq(policyAssignments.policyId, query.policyId))
    if (query.scope) conditions.push(eq(policyAssignments.scope, query.scope))
    if (query.productId) conditions.push(eq(policyAssignments.productId, query.productId))
    if (query.channelId) conditions.push(eq(policyAssignments.channelId, query.channelId))
    if (query.supplierId) conditions.push(eq(policyAssignments.supplierId, query.supplierId))
    if (query.marketId) conditions.push(eq(policyAssignments.marketId, query.marketId))
    if (query.organizationId)
      conditions.push(eq(policyAssignments.organizationId, query.organizationId))
    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(policyAssignments)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(policyAssignments.priority), desc(policyAssignments.createdAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(policyAssignments).where(where),
      query.limit,
      query.offset,
    )
  },
  async createPolicyAssignment(db: PostgresJsDatabase, data: CreatePolicyAssignmentInput) {
    const [row] = await db
      .insert(policyAssignments)
      .values({
        policyId: data.policyId,
        scope: data.scope,
        productId: data.productId ?? null,
        channelId: data.channelId ?? null,
        supplierId: data.supplierId ?? null,
        marketId: data.marketId ?? null,
        organizationId: data.organizationId ?? null,
        validFrom: toDateString(data.validFrom),
        validTo: toDateString(data.validTo),
        priority: data.priority,
        metadata: data.metadata ?? null,
      })
      .returning()
    return row ?? null
  },
  async updatePolicyAssignment(
    db: PostgresJsDatabase,
    id: string,
    data: UpdatePolicyAssignmentInput,
  ) {
    const [row] = await db
      .update(policyAssignments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(policyAssignments.id, id))
      .returning()
    return row ?? null
  },
  async deletePolicyAssignment(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(policyAssignments)
      .where(eq(policyAssignments.id, id))
      .returning({ id: policyAssignments.id })
    return row ?? null
  },
  async resolvePolicy(db: PostgresJsDatabase, input: ResolvePolicyInput) {
    const conditions: ReturnType<typeof eq>[] = []
    const atDate = input.at ?? new Date().toISOString().slice(0, 10)
    const scopeConditions: ReturnType<typeof or>[] = []
    if (input.productId)
      scopeConditions.push(
        or(
          eq(policyAssignments.productId, input.productId),
          // agent-quality: raw-sql reviewed -- owner: legal; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
          sql`${policyAssignments.productId} IS NULL`,
        ),
      )
    if (input.channelId)
      scopeConditions.push(
        or(
          eq(policyAssignments.channelId, input.channelId),
          // agent-quality: raw-sql reviewed -- owner: legal; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
          sql`${policyAssignments.channelId} IS NULL`,
        ),
      )
    if (input.supplierId)
      scopeConditions.push(
        or(
          eq(policyAssignments.supplierId, input.supplierId),
          // agent-quality: raw-sql reviewed -- owner: legal; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
          sql`${policyAssignments.supplierId} IS NULL`,
        ),
      )
    if (input.marketId)
      scopeConditions.push(
        or(
          eq(policyAssignments.marketId, input.marketId),
          // agent-quality: raw-sql reviewed -- owner: legal; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
          sql`${policyAssignments.marketId} IS NULL`,
        ),
      )
    if (input.organizationId)
      scopeConditions.push(
        or(
          eq(policyAssignments.organizationId, input.organizationId),
          // agent-quality: raw-sql reviewed -- owner: legal; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
          sql`${policyAssignments.organizationId} IS NULL`,
        ),
      )
    const validity = and(
      // agent-quality: raw-sql reviewed -- owner: legal; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      or(sql`${policyAssignments.validFrom} IS NULL`, lte(policyAssignments.validFrom, atDate)),
      // agent-quality: raw-sql reviewed -- owner: legal; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      or(sql`${policyAssignments.validTo} IS NULL`, gte(policyAssignments.validTo, atDate)),
    )
    const candidates = await db
      .select({ assignment: policyAssignments, policy: policies })
      .from(policyAssignments)
      .innerJoin(policies, eq(policyAssignments.policyId, policies.id))
      .where(
        and(
          eq(policies.kind, input.kind),
          validity,
          ...conditions,
          ...(scopeConditions.length ? [and(...scopeConditions)] : []),
        ),
      )
      .orderBy(desc(policyAssignments.priority), desc(policyAssignments.createdAt))
    if (candidates.length === 0) return null
    const scored = candidates.map((c) => {
      const a = c.assignment
      const specificity =
        (a.productId ? 1 : 0) +
        (a.channelId ? 1 : 0) +
        (a.supplierId ? 1 : 0) +
        (a.marketId ? 1 : 0) +
        (a.organizationId ? 1 : 0)
      return { ...c, specificity }
    })
    scored.sort((a, b) => {
      if (b.assignment.priority !== a.assignment.priority)
        return b.assignment.priority - a.assignment.priority
      if (b.specificity !== a.specificity) return b.specificity - a.specificity
      return b.assignment.createdAt.getTime() - a.assignment.createdAt.getTime()
    })
    const winner = scored[0]
    if (!winner) return null
    if (!winner.policy.currentVersionId)
      return { policy: winner.policy, assignment: winner.assignment, version: null, rules: [] }
    const [version] = await db
      .select()
      .from(policyVersions)
      .where(eq(policyVersions.id, winner.policy.currentVersionId))
      .limit(1)
    const rules = version
      ? await db
          .select()
          .from(policyRules)
          .where(eq(policyRules.policyVersionId, version.id))
          .orderBy(policyRules.sortOrder)
      : []
    return { policy: winner.policy, assignment: winner.assignment, version: version ?? null, rules }
  },
  async evaluateCancellation(
    db: PostgresJsDatabase,
    policyId: string,
    input: EvaluateCancellationInput,
  ) {
    const [policy] = await db.select().from(policies).where(eq(policies.id, policyId)).limit(1)
    if (!policy?.currentVersionId) return null
    const rules = await db
      .select()
      .from(policyRules)
      .where(eq(policyRules.policyVersionId, policy.currentVersionId))
    const mapped: CancellationRule[] = rules.map((r) => ({
      id: r.id,
      daysBeforeDeparture: r.daysBeforeDeparture,
      refundPercent: r.refundPercent,
      refundType: r.refundType,
      flatAmountCents: r.flatAmountCents,
      label: r.label,
    }))
    return evaluateCancellationPolicy(mapped, input)
  },

  /** Freeze the currently published cancellation version for quote/commit evidence. */
  async captureCancellationPolicySnapshot(
    db: PostgresJsDatabase,
    policyId: string,
    capturedAt: Date = new Date(),
  ): Promise<CancellationPolicySnapshotV1 | null> {
    const [policy] = await db.select().from(policies).where(eq(policies.id, policyId)).limit(1)
    if (policy?.kind !== "cancellation" || !policy.currentVersionId) return null
    const [version] = await db
      .select()
      .from(policyVersions)
      .where(
        and(eq(policyVersions.id, policy.currentVersionId), eq(policyVersions.policyId, policy.id)),
      )
      .limit(1)
    if (version?.status !== "published") return null
    const rules = await db
      .select()
      .from(policyRules)
      .where(eq(policyRules.policyVersionId, version.id))
      .orderBy(policyRules.sortOrder, policyRules.createdAt)
    return {
      schemaVersion: 1,
      policyId: policy.id,
      policyVersionId: version.id,
      version: version.version,
      capturedAt: capturedAt.toISOString(),
      rules: rules.map((rule) => ({
        id: rule.id,
        daysBeforeDeparture: rule.daysBeforeDeparture,
        refundPercent: rule.refundPercent,
        refundType: rule.refundType,
        flatAmountCents: rule.flatAmountCents,
        currency: rule.currency,
        label: rule.label,
      })),
    }
  },

  /**
   * DB variant of {@link evaluateSegmentedCancellation} that resolves
   * each segment's rules from a `policyId`. Use this for multi-segment
   * cancellations where each line item may carry a different
   * cancellation policy (e.g. mid-stay room change with mixed
   * flexible/non-refundable rate plans).
   *
   * Segments referencing a missing or version-less policy are passed
   * through with empty `rules`, which produces a zero refund — surfaces
   * as a per-segment `appliedRule: null` for ops triage rather than
   * throwing on the whole cancellation.
   */
  async evaluateMultiPolicyCancellation(
    db: PostgresJsDatabase,
    segments: Array<{
      id?: string
      label?: string
      policyId: string
      totalCents: number
    }>,
    input: { daysBeforeDeparture: number; currency?: string },
  ): Promise<SegmentedCancellationResult> {
    const policyIds = [...new Set(segments.map((segment) => segment.policyId))]

    const rulesByPolicyId = new Map<string, CancellationRule[]>()
    for (const policyId of policyIds) {
      const [policy] = await db
        .select({ id: policies.id, currentVersionId: policies.currentVersionId })
        .from(policies)
        .where(eq(policies.id, policyId))
        .limit(1)
      if (!policy?.currentVersionId) {
        rulesByPolicyId.set(policyId, [])
        continue
      }
      const rules = await db
        .select()
        .from(policyRules)
        .where(eq(policyRules.policyVersionId, policy.currentVersionId))
      rulesByPolicyId.set(
        policyId,
        rules.map((r) => ({
          id: r.id,
          daysBeforeDeparture: r.daysBeforeDeparture,
          refundPercent: r.refundPercent,
          refundType: r.refundType,
          flatAmountCents: r.flatAmountCents,
          label: r.label,
        })),
      )
    }

    return evaluateSegmentedCancellation({
      daysBeforeDeparture: input.daysBeforeDeparture,
      currency: input.currency,
      segments: segments.map((segment) => ({
        id: segment.id,
        label: segment.label,
        totalCents: segment.totalCents,
        rules: rulesByPolicyId.get(segment.policyId) ?? [],
      })),
    })
  },
  async listPolicyAcceptances(db: PostgresJsDatabase, query: PolicyAcceptanceListQuery) {
    const conditions = []
    if (query.policyId) {
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(policyVersions)
            .where(
              and(
                eq(policyVersions.id, policyAcceptances.policyVersionId),
                eq(policyVersions.policyId, query.policyId),
              ),
            ),
        ),
      )
    }
    if (query.policyVersionId)
      conditions.push(eq(policyAcceptances.policyVersionId, query.policyVersionId))
    if (query.personId) conditions.push(eq(policyAcceptances.personId, query.personId))
    if (query.bookingId) conditions.push(eq(policyAcceptances.bookingId, query.bookingId))
    if (query.targetKind) conditions.push(eq(policyAcceptances.targetKind, query.targetKind))
    if (query.targetId) conditions.push(eq(policyAcceptances.targetId, query.targetId))
    if (query.targetProvider)
      conditions.push(eq(policyAcceptances.targetProvider, query.targetProvider))
    if (query.targetSourceRef)
      conditions.push(eq(policyAcceptances.targetSourceRef, query.targetSourceRef))
    if (query.legacyTransactionOfferId)
      conditions.push(
        eq(policyAcceptances.legacyTransactionOfferId, query.legacyTransactionOfferId),
      )
    if (query.legacyTransactionOrderId)
      conditions.push(
        eq(policyAcceptances.legacyTransactionOrderId, query.legacyTransactionOrderId),
      )
    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(policyAcceptances)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(policyAcceptances.acceptedAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(policyAcceptances).where(where),
      query.limit,
      query.offset,
    )
  },
  async recordPolicyAcceptance(db: PostgresJsDatabase, data: CreatePolicyAcceptanceInput) {
    const [row] = await db
      .insert(policyAcceptances)
      .values({
        policyVersionId: data.policyVersionId,
        personId: data.personId ?? null,
        bookingId: data.bookingId ?? null,
        ...normalizeLegalTargetFields(data),
        acceptedBy: data.acceptedBy ?? null,
        method: data.method,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        metadata: data.metadata ?? null,
      })
      .returning()
    return row ?? null
  },
}
