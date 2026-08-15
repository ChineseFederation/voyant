import {
  EXTERNAL_DOCUMENT_METADATA_KEY,
  SUPERSEDED_DOCUMENTS_METADATA_KEY,
} from "./invoice-external-document.js"
import type {
  CreateInvoiceExternalRefInput,
  CreateTaxClassInput,
  CreateTaxPolicyProfileInput,
  CreateTaxPolicyRuleInput,
  CreateTaxRegimeInput,
  PostgresJsDatabase,
  SupersedeInvoiceExternalRefInput,
  TaxClassListQuery,
  TaxPolicyProfileListQuery,
  TaxPolicyRuleListQuery,
  TaxRegimeListQuery,
  UpdateTaxClassInput,
  UpdateTaxPolicyProfileInput,
  UpdateTaxPolicyRuleInput,
  UpdateTaxRegimeInput,
} from "./service-shared.js"
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  invoiceExternalRefs,
  invoices,
  paginate,
  sql,
  taxClasses,
  taxPolicyProfiles,
  taxPolicyRules,
  taxRegimes,
  toTimestamp,
} from "./service-shared.js"

export class ReferenceDataValidationError extends Error {
  readonly status = 400
  readonly code: string
  readonly details?: Record<string, unknown>

  constructor(message: string, details?: Record<string, unknown>, code = "invalid_request") {
    super(message)
    this.name = "ReferenceDataValidationError"
    this.code = code
    this.details = details
  }
}

type TaxClassRegimeReferenceInput = Pick<CreateTaxClassInput, "defaultRegimeId" | "lines">

async function assertTaxClassRegimesExist(
  db: PostgresJsDatabase,
  data: Partial<TaxClassRegimeReferenceInput>,
) {
  const referencedIds = new Set<string>()
  if (data.defaultRegimeId) referencedIds.add(data.defaultRegimeId)
  for (const line of data.lines ?? []) referencedIds.add(line.regime_id)

  if (referencedIds.size === 0) return

  const requestedIds = [...referencedIds]
  const rows = await db
    .select({ id: taxRegimes.id })
    .from(taxRegimes)
    .where(inArray(taxRegimes.id, requestedIds))
  const existingIds = new Set(rows.map((row) => row.id))
  const missingRegimeIds = requestedIds.filter((id) => !existingIds.has(id))

  if (missingRegimeIds.length > 0) {
    throw new ReferenceDataValidationError(
      "Tax class references unknown tax regimes",
      { missingRegimeIds },
      "invalid_reference",
    )
  }
}

type TaxPolicyRuleReferenceInput = Pick<CreateTaxPolicyRuleInput, "profileId" | "taxRegimeId">

async function assertTaxPolicyRuleReferencesExist(
  db: PostgresJsDatabase,
  data: Partial<TaxPolicyRuleReferenceInput>,
) {
  const missing: { missingProfileId?: string; missingTaxRegimeId?: string } = {}

  if (data.profileId) {
    const [profile] = await db
      .select({ id: taxPolicyProfiles.id })
      .from(taxPolicyProfiles)
      .where(eq(taxPolicyProfiles.id, data.profileId))
      .limit(1)
    if (!profile) missing.missingProfileId = data.profileId
  }

  if (data.taxRegimeId) {
    const [regime] = await db
      .select({ id: taxRegimes.id })
      .from(taxRegimes)
      .where(eq(taxRegimes.id, data.taxRegimeId))
      .limit(1)
    if (!regime) missing.missingTaxRegimeId = data.taxRegimeId
  }

  if (missing.missingProfileId || missing.missingTaxRegimeId) {
    throw new ReferenceDataValidationError(
      "Tax policy rule references unknown records",
      missing,
      "invalid_reference",
    )
  }
}

export const financeReferenceDataService = {
  async listTaxRegimes(db: PostgresJsDatabase, query: TaxRegimeListQuery) {
    const conditions = []
    if (query.code) conditions.push(eq(taxRegimes.code, query.code))
    if (query.jurisdiction) conditions.push(eq(taxRegimes.jurisdiction, query.jurisdiction))
    if (typeof query.active === "boolean") conditions.push(eq(taxRegimes.active, query.active))
    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(taxRegimes)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(taxRegimes.updatedAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(taxRegimes).where(where),
      query.limit,
      query.offset,
    )
  },

  async getTaxRegimeById(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(taxRegimes).where(eq(taxRegimes.id, id)).limit(1)
    return row ?? null
  },

  async createTaxRegime(db: PostgresJsDatabase, data: CreateTaxRegimeInput) {
    const [row] = await db
      .insert(taxRegimes)
      .values({
        code: data.code,
        name: data.name,
        jurisdiction: data.jurisdiction ?? null,
        ratePercent: data.ratePercent ?? null,
        description: data.description ?? null,
        legalReference: data.legalReference ?? null,
        active: data.active,
        metadata: data.metadata ?? null,
      })
      .returning()
    return row ?? null
  },

  async updateTaxRegime(db: PostgresJsDatabase, id: string, data: UpdateTaxRegimeInput) {
    const [row] = await db
      .update(taxRegimes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(taxRegimes.id, id))
      .returning()
    return row ?? null
  },

  async deleteTaxRegime(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(taxRegimes)
      .where(eq(taxRegimes.id, id))
      .returning({ id: taxRegimes.id })
    return row ?? null
  },

  // ============================================================================
  // Tax classes
  // ============================================================================

  async listTaxClasses(db: PostgresJsDatabase, query: TaxClassListQuery) {
    const conditions = []
    if (query.code) conditions.push(eq(taxClasses.code, query.code))
    if (typeof query.active === "boolean") conditions.push(eq(taxClasses.active, query.active))
    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(taxClasses)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(taxClasses.updatedAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(taxClasses).where(where),
      query.limit,
      query.offset,
    )
  },

  async getTaxClassById(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(taxClasses).where(eq(taxClasses.id, id)).limit(1)
    return row ?? null
  },

  async createTaxClass(db: PostgresJsDatabase, data: CreateTaxClassInput) {
    await assertTaxClassRegimesExist(db, data)

    const [row] = await db
      .insert(taxClasses)
      .values({
        code: data.code,
        label: data.label,
        description: data.description ?? null,
        defaultRegimeId: data.defaultRegimeId ?? null,
        lines: data.lines ?? null,
        active: data.active,
      })
      .returning()
    return row ?? null
  },

  async updateTaxClass(db: PostgresJsDatabase, id: string, data: UpdateTaxClassInput) {
    await assertTaxClassRegimesExist(db, data)

    const [row] = await db
      .update(taxClasses)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(taxClasses.id, id))
      .returning()
    return row ?? null
  },

  async deleteTaxClass(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(taxClasses)
      .where(eq(taxClasses.id, id))
      .returning({ id: taxClasses.id })
    return row ?? null
  },

  // ============================================================================
  // Tax policy profiles
  // ============================================================================

  async listTaxPolicyProfiles(db: PostgresJsDatabase, query: TaxPolicyProfileListQuery) {
    const conditions = []
    if (query.code) conditions.push(eq(taxPolicyProfiles.code, query.code))
    if (query.jurisdiction) conditions.push(eq(taxPolicyProfiles.jurisdiction, query.jurisdiction))
    if (typeof query.active === "boolean") {
      conditions.push(eq(taxPolicyProfiles.active, query.active))
    }
    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(taxPolicyProfiles)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(taxPolicyProfiles.updatedAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(taxPolicyProfiles).where(where),
      query.limit,
      query.offset,
    )
  },

  async getTaxPolicyProfileById(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .select()
      .from(taxPolicyProfiles)
      .where(eq(taxPolicyProfiles.id, id))
      .limit(1)
    return row ?? null
  },

  async createTaxPolicyProfile(db: PostgresJsDatabase, data: CreateTaxPolicyProfileInput) {
    const [row] = await db
      .insert(taxPolicyProfiles)
      .values({
        code: data.code,
        name: data.name,
        jurisdiction: data.jurisdiction ?? null,
        description: data.description ?? null,
        active: data.active,
      })
      .returning()
    return row ?? null
  },

  async updateTaxPolicyProfile(
    db: PostgresJsDatabase,
    id: string,
    data: UpdateTaxPolicyProfileInput,
  ) {
    const [row] = await db
      .update(taxPolicyProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(taxPolicyProfiles.id, id))
      .returning()
    return row ?? null
  },

  async deleteTaxPolicyProfile(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(taxPolicyProfiles)
      .where(eq(taxPolicyProfiles.id, id))
      .returning({ id: taxPolicyProfiles.id })
    return row ?? null
  },

  // ============================================================================
  // Tax policy rules
  // ============================================================================

  async listTaxPolicyRules(db: PostgresJsDatabase, query: TaxPolicyRuleListQuery) {
    const conditions = []
    if (query.profileId) conditions.push(eq(taxPolicyRules.profileId, query.profileId))
    if (query.side) conditions.push(eq(taxPolicyRules.side, query.side))
    if (typeof query.active === "boolean") conditions.push(eq(taxPolicyRules.active, query.active))
    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(taxPolicyRules)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(asc(taxPolicyRules.priority), desc(taxPolicyRules.updatedAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(taxPolicyRules).where(where),
      query.limit,
      query.offset,
    )
  },

  async getTaxPolicyRuleById(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(taxPolicyRules).where(eq(taxPolicyRules.id, id)).limit(1)
    return row ?? null
  },

  async createTaxPolicyRule(db: PostgresJsDatabase, data: CreateTaxPolicyRuleInput) {
    await assertTaxPolicyRuleReferencesExist(db, data)

    const [row] = await db
      .insert(taxPolicyRules)
      .values({
        profileId: data.profileId,
        side: data.side,
        priority: data.priority,
        name: data.name,
        appliesTo: data.appliesTo,
        condition: data.condition ?? null,
        taxRegimeId: data.taxRegimeId,
        active: data.active,
      })
      .returning()
    return row ?? null
  },

  async updateTaxPolicyRule(db: PostgresJsDatabase, id: string, data: UpdateTaxPolicyRuleInput) {
    await assertTaxPolicyRuleReferencesExist(db, data)

    const [row] = await db
      .update(taxPolicyRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(taxPolicyRules.id, id))
      .returning()
    return row ?? null
  },

  async deleteTaxPolicyRule(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(taxPolicyRules)
      .where(eq(taxPolicyRules.id, id))
      .returning({ id: taxPolicyRules.id })
    return row ?? null
  },

  // ============================================================================
  // Invoice external refs (e-invoicing provider ids)
  // ============================================================================

  async listInvoiceExternalRefs(db: PostgresJsDatabase, invoiceId: string) {
    return db
      .select()
      .from(invoiceExternalRefs)
      .where(eq(invoiceExternalRefs.invoiceId, invoiceId))
      .orderBy(desc(invoiceExternalRefs.createdAt))
  },

  /**
   * Idempotent upsert on (invoiceId, provider). Used by e-invoicing plugins
   * (SmartBill, e-Factura, Stripe) to register the external reference
   * immediately after a successful provider call.
   */
  async registerInvoiceExternalRef(
    db: PostgresJsDatabase,
    invoiceId: string,
    data: CreateInvoiceExternalRefInput,
  ) {
    const [invoice] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1)
    if (!invoice) return null

    const [existing] = await db
      .select()
      .from(invoiceExternalRefs)
      .where(
        and(
          eq(invoiceExternalRefs.invoiceId, invoiceId),
          eq(invoiceExternalRefs.provider, data.provider),
        ),
      )
      .limit(1)

    const values = {
      externalId: data.externalId ?? null,
      externalNumber: data.externalNumber ?? null,
      externalUrl: data.externalUrl ?? null,
      status: data.status ?? null,
      metadata: data.metadata ?? null,
      syncedAt: toTimestamp(data.syncedAt),
      syncError: data.syncError ?? null,
    }

    if (existing) {
      const [row] = await db
        .update(invoiceExternalRefs)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(invoiceExternalRefs.id, existing.id))
        .returning()
      return row ?? null
    }

    const [row] = await db
      .insert(invoiceExternalRefs)
      .values({
        invoiceId,
        provider: data.provider,
        ...values,
      })
      .returning()
    return row ?? null
  },

  /**
   * Record that the provider document a reference points at was cancelled in
   * the provider's own UI, and optionally repoint the reference at the document
   * that replaces it.
   *
   * voyant#4688: once a duplicate fiscal document had been issued, the only
   * remedy was cancelling it by hand in the provider, which left the reference
   * naming a cancelled document with nothing supported to do about it —
   * `voidInvoice` refuses on a recorded payment, and overwriting the reference
   * would lose the identity of the document the operator's accounting system
   * still has on file. So the previous identity is kept, appended to the row's
   * own metadata, and the cancelled status is what releases the
   * duplicate-issuance guard.
   *
   * Deleting the row instead is not the same thing: it erases the fact that a
   * document was ever issued there, which is what an audit needs to see.
   */
  async supersedeInvoiceExternalRef(
    db: PostgresJsDatabase,
    id: string,
    input: SupersedeInvoiceExternalRefInput,
    // Reference ids are globally addressable, so a route that resolves one from
    // its own path must also prove it belongs to the invoice in that path.
    // Without this, superseding under invoice A can mutate a reference on
    // invoice B — releasing B's duplicate-document guard from a request that
    // never named it.
    scope: { invoiceId?: string } = {},
  ) {
    const [existing] = await db
      .select()
      .from(invoiceExternalRefs)
      .where(
        scope.invoiceId
          ? and(eq(invoiceExternalRefs.id, id), eq(invoiceExternalRefs.invoiceId, scope.invoiceId))
          : eq(invoiceExternalRefs.id, id),
      )
      .limit(1)
    if (!existing) return null

    const previousMetadata =
      existing.metadata &&
      typeof existing.metadata === "object" &&
      !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {}
    const history = Array.isArray(previousMetadata[SUPERSEDED_DOCUMENTS_METADATA_KEY])
      ? (previousMetadata[SUPERSEDED_DOCUMENTS_METADATA_KEY] as unknown[])
      : []

    const replacement = input.replacement ?? null
    const now = new Date()

    const [row] = await db
      .update(invoiceExternalRefs)
      .set({
        externalId: replacement ? (replacement.externalId ?? null) : existing.externalId,
        externalNumber: replacement
          ? (replacement.externalNumber ?? null)
          : existing.externalNumber,
        externalUrl: replacement ? (replacement.externalUrl ?? null) : existing.externalUrl,
        // With a replacement the row now names a live document again, so it
        // carries the replacement's status (or none). Without one it is the
        // cancellation itself, and `cancelled` is what tells the guard this
        // booking may be invoiced again.
        status: replacement ? (replacement.status ?? null) : "cancelled",
        metadata: {
          ...previousMetadata,
          ...(replacement?.series
            ? {
                [EXTERNAL_DOCUMENT_METADATA_KEY]: {
                  ...(typeof previousMetadata[EXTERNAL_DOCUMENT_METADATA_KEY] === "object" &&
                  previousMetadata[EXTERNAL_DOCUMENT_METADATA_KEY] !== null
                    ? (previousMetadata[EXTERNAL_DOCUMENT_METADATA_KEY] as Record<string, unknown>)
                    : {}),
                  series: replacement.series,
                  number: replacement.externalNumber ?? null,
                },
              }
            : {}),
          [SUPERSEDED_DOCUMENTS_METADATA_KEY]: [
            ...history,
            {
              externalId: existing.externalId,
              externalNumber: existing.externalNumber,
              externalUrl: existing.externalUrl,
              status: existing.status,
              reason: input.reason,
              supersededAt: now.toISOString(),
            },
          ],
        },
        // The platform did not talk to the provider here either way: an
        // operator told it what happened there.
        syncedAt: null,
        updatedAt: now,
      })
      .where(eq(invoiceExternalRefs.id, id))
      .returning()
    return row ?? null
  },

  async deleteInvoiceExternalRef(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(invoiceExternalRefs)
      .where(eq(invoiceExternalRefs.id, id))
      .returning({ id: invoiceExternalRefs.id })
    return row ?? null
  },
}
