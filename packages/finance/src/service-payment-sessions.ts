import type {
  CancelPaymentSessionInput,
  CreatePaymentSessionInput,
  ExpirePaymentSessionInput,
  FailPaymentSessionInput,
  FinanceServiceRuntime,
  MarkPaymentSessionRequiresRedirectInput,
  PaymentSessionListQuery,
  PostgresJsDatabase,
  UpdatePaymentSessionInput,
} from "./service-shared.js"
import {
  and,
  appendActionLedgerMutation,
  buildPaymentSessionCancelledActionLedgerInput,
  buildPaymentSessionCreateActionLedgerInput,
  buildPaymentSessionExpiredActionLedgerInput,
  buildPaymentSessionFailedActionLedgerInput,
  buildPaymentSessionRequiresRedirectActionLedgerInput,
  buildPaymentSessionUpdateActionLedgerInput,
  derivePaymentSessionTarget,
  desc,
  eq,
  paginate,
  paymentSessions,
  sql,
  toTimestamp,
  touchLinkedBookingUpdatedAt,
} from "./service-shared.js"

type PaymentSessionTargetColumns = {
  bookingId?: string
  invoiceId?: string
  bookingPaymentScheduleId?: string
  bookingGuaranteeId?: string
  orderId?: string
}

function mergeJsonbColumn(
  column: typeof paymentSessions.providerPayload | typeof paymentSessions.metadata,
  value: Record<string, unknown> | null | undefined,
) {
  if (value === undefined) return undefined
  if (value === null) return null
  return sql`coalesce(${column}, '{}'::jsonb) || ${JSON.stringify(value)}::jsonb`
}

async function touchPaymentSessionBooking(
  db: PostgresJsDatabase,
  session: typeof paymentSessions.$inferSelect | undefined,
) {
  await touchLinkedBookingUpdatedAt(db, session?.bookingId)
}

function derivePaymentSessionTargetColumns(
  data: CreatePaymentSessionInput | UpdatePaymentSessionInput,
): PaymentSessionTargetColumns {
  const explicitTarget = "target" in data ? data.target : undefined
  if (!explicitTarget) return {}

  switch (explicitTarget.type) {
    case "booking_session":
      return {}
    case "booking":
      return { bookingId: explicitTarget.bookingId }
    case "invoice":
      return { invoiceId: explicitTarget.invoiceId }
    case "booking_payment_schedule":
      return { bookingPaymentScheduleId: explicitTarget.bookingPaymentScheduleId }
    case "booking_guarantee":
      return { bookingGuaranteeId: explicitTarget.bookingGuaranteeId }
    case "legacy_order":
      return { orderId: explicitTarget.legacyOrderId }
    default:
      return {}
  }
}

export const financePaymentSessionService = {
  async listPaymentSessions(db: PostgresJsDatabase, query: PaymentSessionListQuery) {
    const conditions = []
    if (query.bookingId) conditions.push(eq(paymentSessions.bookingId, query.bookingId))
    if (query.legacyOrderId) conditions.push(eq(paymentSessions.orderId, query.legacyOrderId))
    if (query.invoiceId) conditions.push(eq(paymentSessions.invoiceId, query.invoiceId))
    if (query.bookingPaymentScheduleId) {
      conditions.push(eq(paymentSessions.bookingPaymentScheduleId, query.bookingPaymentScheduleId))
    }
    if (query.bookingGuaranteeId) {
      conditions.push(eq(paymentSessions.bookingGuaranteeId, query.bookingGuaranteeId))
    }
    if (query.targetType) conditions.push(eq(paymentSessions.targetType, query.targetType))
    if (query.status) conditions.push(eq(paymentSessions.status, query.status))
    if (query.provider) conditions.push(eq(paymentSessions.provider, query.provider))
    if (query.providerConnectionId) {
      conditions.push(eq(paymentSessions.providerConnectionId, query.providerConnectionId))
    }
    if (query.providerSessionId) {
      conditions.push(eq(paymentSessions.providerSessionId, query.providerSessionId))
    }
    if (query.providerPaymentId) {
      conditions.push(eq(paymentSessions.providerPaymentId, query.providerPaymentId))
    }
    if (query.externalReference) {
      conditions.push(eq(paymentSessions.externalReference, query.externalReference))
    }
    if (query.clientReference) {
      conditions.push(eq(paymentSessions.clientReference, query.clientReference))
    }
    if (query.idempotencyKey) {
      conditions.push(eq(paymentSessions.idempotencyKey, query.idempotencyKey))
    }

    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(paymentSessions)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(paymentSessions.createdAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(paymentSessions).where(where),
      query.limit,
      query.offset,
    )
  },

  async getPaymentSessionById(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(paymentSessions).where(eq(paymentSessions.id, id)).limit(1)
    return row ?? null
  },

  async createPaymentSession(
    db: PostgresJsDatabase,
    data: CreatePaymentSessionInput,
    runtime: FinanceServiceRuntime = {},
  ) {
    if (data.idempotencyKey) {
      const [existing] = await db
        .select()
        .from(paymentSessions)
        .where(eq(paymentSessions.idempotencyKey, data.idempotencyKey))
        .limit(1)

      if (existing) {
        return existing
      }
    }

    const target = derivePaymentSessionTarget(data)
    const targetColumns = derivePaymentSessionTargetColumns(data)
    const { legacyOrderId, target: _explicitTarget, provenance: _provenance, ...sessionData } = data
    const resolvedLegacyOrderId = legacyOrderId ?? null
    const createSession = (writer: PostgresJsDatabase) =>
      writer
        .insert(paymentSessions)
        .values({
          ...sessionData,
          ...targetColumns,
          ...target,
          orderId: targetColumns.orderId ?? resolvedLegacyOrderId,
          paymentInstrumentId: data.paymentInstrumentId ?? null,
          paymentAuthorizationId: data.paymentAuthorizationId ?? null,
          paymentCaptureId: data.paymentCaptureId ?? null,
          paymentId: data.paymentId ?? null,
          completedAt: toTimestamp(data.completedAt),
          failedAt: toTimestamp(data.failedAt),
          cancelledAt: toTimestamp(data.cancelledAt),
          expiredAt: toTimestamp(data.expiredAt),
          expiresAt: toTimestamp(data.expiresAt),
        })
        .onConflictDoNothing({ target: paymentSessions.idempotencyKey })
        .returning()

    const loadIdempotentSession = async (writer: PostgresJsDatabase) => {
      if (!data.idempotencyKey) return null
      const [existing] = await writer
        .select()
        .from(paymentSessions)
        .where(eq(paymentSessions.idempotencyKey, data.idempotencyKey))
        .limit(1)
      return existing ?? null
    }

    const actionLedgerContext = runtime.actionLedgerContext
    if (actionLedgerContext) {
      const row = await db.transaction(async (tx) => {
        const created = await createSession(tx)

        if (created[0]) {
          await touchPaymentSessionBooking(tx, created[0])
          await appendActionLedgerMutation(
            tx,
            await buildPaymentSessionCreateActionLedgerInput(
              actionLedgerContext,
              { session: created[0] },
              { authorizationSource: runtime.actionLedgerAuthorizationSource },
            ),
          )
        }

        return created[0] ?? loadIdempotentSession(tx)
      })

      return row
    }

    const [row] = await createSession(db)
    const resolved = row ?? (await loadIdempotentSession(db))
    await touchPaymentSessionBooking(db, resolved ?? undefined)
    return resolved
  },

  async updatePaymentSession(
    db: PostgresJsDatabase,
    id: string,
    data: UpdatePaymentSessionInput,
    runtime: FinanceServiceRuntime = {},
  ) {
    const target = derivePaymentSessionTarget(data)
    const targetColumns = derivePaymentSessionTargetColumns(data)
    const { legacyOrderId, target: _explicitTarget, provenance: _provenance, ...sessionData } = data
    const resolvedLegacyOrderId = legacyOrderId
    const updateSession = (writer: PostgresJsDatabase) =>
      writer
        .update(paymentSessions)
        .set({
          ...sessionData,
          ...targetColumns,
          ...target,
          orderId:
            targetColumns.orderId ??
            (resolvedLegacyOrderId === undefined ? undefined : (resolvedLegacyOrderId ?? null)),
          paymentInstrumentId:
            data.paymentInstrumentId === undefined ? undefined : (data.paymentInstrumentId ?? null),
          paymentAuthorizationId:
            data.paymentAuthorizationId === undefined
              ? undefined
              : (data.paymentAuthorizationId ?? null),
          paymentCaptureId:
            data.paymentCaptureId === undefined ? undefined : (data.paymentCaptureId ?? null),
          paymentId: data.paymentId === undefined ? undefined : (data.paymentId ?? null),
          completedAt: data.completedAt === undefined ? undefined : toTimestamp(data.completedAt),
          failedAt: data.failedAt === undefined ? undefined : toTimestamp(data.failedAt),
          cancelledAt: data.cancelledAt === undefined ? undefined : toTimestamp(data.cancelledAt),
          expiredAt: data.expiredAt === undefined ? undefined : toTimestamp(data.expiredAt),
          expiresAt: data.expiresAt === undefined ? undefined : toTimestamp(data.expiresAt),
          providerPayload: mergeJsonbColumn(paymentSessions.providerPayload, data.providerPayload),
          metadata: mergeJsonbColumn(paymentSessions.metadata, data.metadata),
          updatedAt: new Date(),
        })
        .where(eq(paymentSessions.id, id))
        .returning()

    const actionLedgerContext = runtime.actionLedgerContext
    if (actionLedgerContext) {
      const [row] = await db.transaction(async (tx) => {
        const updated = await updateSession(tx)

        if (updated[0]) {
          await touchPaymentSessionBooking(tx, updated[0])
          await appendActionLedgerMutation(
            tx,
            buildPaymentSessionUpdateActionLedgerInput(
              actionLedgerContext,
              { session: updated[0], changes: data },
              { authorizationSource: runtime.actionLedgerAuthorizationSource },
            ),
          )
        }

        return updated
      })

      return row ?? null
    }

    const [row] = await updateSession(db)
    await touchPaymentSessionBooking(db, row)
    return row ?? null
  },

  async markPaymentSessionRequiresRedirect(
    db: PostgresJsDatabase,
    id: string,
    data: MarkPaymentSessionRequiresRedirectInput,
    runtime: FinanceServiceRuntime = {},
  ) {
    const markRequiresRedirect = (writer: PostgresJsDatabase) =>
      writer
        .update(paymentSessions)
        .set({
          status: "requires_redirect",
          provider: data.provider ?? undefined,
          providerConnectionId: data.providerConnectionId ?? undefined,
          providerSessionId: data.providerSessionId ?? undefined,
          providerPaymentId: data.providerPaymentId ?? undefined,
          externalReference: data.externalReference ?? undefined,
          redirectUrl: data.redirectUrl,
          returnUrl: data.returnUrl ?? undefined,
          cancelUrl: data.cancelUrl ?? undefined,
          callbackUrl: data.callbackUrl ?? undefined,
          expiresAt: data.expiresAt === undefined ? undefined : toTimestamp(data.expiresAt),
          providerPayload: mergeJsonbColumn(paymentSessions.providerPayload, data.providerPayload),
          metadata: mergeJsonbColumn(paymentSessions.metadata, data.metadata),
          notes: data.notes ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(paymentSessions.id, id))
        .returning()

    const actionLedgerContext = runtime.actionLedgerContext
    if (actionLedgerContext) {
      const [row] = await db.transaction(async (tx) => {
        const updated = await markRequiresRedirect(tx)

        if (updated[0]) {
          await touchPaymentSessionBooking(tx, updated[0])
          await appendActionLedgerMutation(
            tx,
            buildPaymentSessionRequiresRedirectActionLedgerInput(
              actionLedgerContext,
              { session: updated[0], changes: data },
              { authorizationSource: runtime.actionLedgerAuthorizationSource },
            ),
          )
        }

        return updated
      })

      return row ?? null
    }

    const [row] = await markRequiresRedirect(db)
    await touchPaymentSessionBooking(db, row)
    return row ?? null
  },

  async failPaymentSession(
    db: PostgresJsDatabase,
    id: string,
    data: FailPaymentSessionInput,
    runtime: FinanceServiceRuntime = {},
  ) {
    const failSession = (writer: PostgresJsDatabase) =>
      writer
        .update(paymentSessions)
        .set({
          status: "failed",
          provider: data.provider ?? undefined,
          providerConnectionId: data.providerConnectionId ?? undefined,
          providerSessionId: data.providerSessionId ?? undefined,
          providerPaymentId: data.providerPaymentId ?? undefined,
          externalReference: data.externalReference ?? undefined,
          failureCode: data.failureCode ?? undefined,
          failureMessage: data.failureMessage ?? undefined,
          failedAt: new Date(),
          providerPayload: mergeJsonbColumn(paymentSessions.providerPayload, data.providerPayload),
          metadata: mergeJsonbColumn(paymentSessions.metadata, data.metadata),
          notes: data.notes ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(paymentSessions.id, id))
        .returning()

    const actionLedgerContext = runtime.actionLedgerContext
    if (actionLedgerContext) {
      const [row] = await db.transaction(async (tx) => {
        const updated = await failSession(tx)

        if (updated[0]) {
          await touchPaymentSessionBooking(tx, updated[0])
          await appendActionLedgerMutation(
            tx,
            buildPaymentSessionFailedActionLedgerInput(
              actionLedgerContext,
              { session: updated[0], changes: data },
              { authorizationSource: runtime.actionLedgerAuthorizationSource },
            ),
          )
        }

        return updated
      })

      return row ?? null
    }

    const [row] = await failSession(db)
    await touchPaymentSessionBooking(db, row)
    return row ?? null
  },

  async cancelPaymentSession(
    db: PostgresJsDatabase,
    id: string,
    data: CancelPaymentSessionInput,
    runtime: FinanceServiceRuntime = {},
  ) {
    const cancelSession = (writer: PostgresJsDatabase) =>
      writer
        .update(paymentSessions)
        .set({
          status: "cancelled",
          provider: data.provider ?? undefined,
          providerConnectionId: data.providerConnectionId ?? undefined,
          cancelledAt: data.cancelledAt ? toTimestamp(data.cancelledAt) : new Date(),
          providerPayload: mergeJsonbColumn(paymentSessions.providerPayload, data.providerPayload),
          metadata: mergeJsonbColumn(paymentSessions.metadata, data.metadata),
          notes: data.notes ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(paymentSessions.id, id))
        .returning()

    const actionLedgerContext = runtime.actionLedgerContext
    if (actionLedgerContext) {
      const [row] = await db.transaction(async (tx) => {
        const updated = await cancelSession(tx)

        if (updated[0]) {
          await touchPaymentSessionBooking(tx, updated[0])
          await appendActionLedgerMutation(
            tx,
            buildPaymentSessionCancelledActionLedgerInput(
              actionLedgerContext,
              { session: updated[0], changes: data },
              { authorizationSource: runtime.actionLedgerAuthorizationSource },
            ),
          )
        }

        return updated
      })

      return row ?? null
    }

    const [row] = await cancelSession(db)
    await touchPaymentSessionBooking(db, row)
    return row ?? null
  },

  async expirePaymentSession(
    db: PostgresJsDatabase,
    id: string,
    data: ExpirePaymentSessionInput,
    runtime: FinanceServiceRuntime = {},
  ) {
    const expireSession = (writer: PostgresJsDatabase) =>
      writer
        .update(paymentSessions)
        .set({
          status: "expired",
          provider: data.provider ?? undefined,
          providerConnectionId: data.providerConnectionId ?? undefined,
          expiredAt: data.expiredAt ? toTimestamp(data.expiredAt) : new Date(),
          providerPayload: mergeJsonbColumn(paymentSessions.providerPayload, data.providerPayload),
          metadata: mergeJsonbColumn(paymentSessions.metadata, data.metadata),
          notes: data.notes ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(paymentSessions.id, id))
        .returning()

    const actionLedgerContext = runtime.actionLedgerContext
    if (actionLedgerContext) {
      const [row] = await db.transaction(async (tx) => {
        const updated = await expireSession(tx)

        if (updated[0]) {
          await touchPaymentSessionBooking(tx, updated[0])
          await appendActionLedgerMutation(
            tx,
            buildPaymentSessionExpiredActionLedgerInput(
              actionLedgerContext,
              { session: updated[0], changes: data },
              { authorizationSource: runtime.actionLedgerAuthorizationSource },
            ),
          )
        }

        return updated
      })

      return row ?? null
    }

    const [row] = await expireSession(db)
    await touchPaymentSessionBooking(db, row)
    return row ?? null
  },
}
