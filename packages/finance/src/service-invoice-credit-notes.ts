import type {
  CreateCreditNoteInput,
  CreateCreditNoteLineItemInput,
  CreateFinanceNoteInput,
  FinanceServiceRuntime,
  PostgresJsDatabase,
  UpdateCreditNoteInput,
} from "./service-shared.js"
import {
  and,
  appendActionLedgerMutation,
  asc,
  buildCreditNoteCreationActionLedgerInput,
  buildCreditNoteLineItemCreateActionLedgerInput,
  buildCreditNoteUpdateActionLedgerInput,
  creditNoteLineItems,
  creditNotes,
  desc,
  eq,
  financeNotes,
  InvoiceValidationError,
  invoices,
  ne,
  resolveCreditNoteUpdateData,
  resolveFxMoneyBaseAmount,
} from "./service-shared.js"

function creditAmountInInvoiceCurrency(
  invoice: typeof invoices.$inferSelect,
  creditNote: Pick<
    typeof creditNotes.$inferSelect,
    "amountCents" | "currency" | "baseCurrency" | "baseAmountCents"
  >,
) {
  if (creditNote.currency === invoice.currency) return creditNote.amountCents
  if (creditNote.baseCurrency === invoice.currency && creditNote.baseAmountCents != null) {
    return creditNote.baseAmountCents
  }

  throw new InvoiceValidationError(
    "Credit notes in a different currency require a base amount in the invoice currency",
    {
      invoiceId: invoice.id,
      invoiceCurrency: invoice.currency,
      creditNoteCurrency: creditNote.currency,
      fields: ["baseCurrency", "baseAmountCents"],
    },
    { status: 400, code: "credit_note_currency_mismatch" },
  )
}

async function assertCreditNotesDoNotExceedInvoiceTotal(
  db: PostgresJsDatabase,
  invoice: typeof invoices.$inferSelect,
  candidate: typeof creditNotes.$inferSelect,
) {
  const rows = await db
    .select()
    .from(creditNotes)
    .where(and(eq(creditNotes.invoiceId, invoice.id), ne(creditNotes.id, candidate.id)))
  const existingCreditedCents = rows.reduce(
    (sum, row) => sum + creditAmountInInvoiceCurrency(invoice, row),
    0,
  )
  const attemptedCreditedCents =
    existingCreditedCents + creditAmountInInvoiceCurrency(invoice, candidate)

  // Payments settle the receivable; they do not reduce the amount that may be
  // reversed. A fully paid invoice has a zero balance due and is precisely the
  // ordinary case where a refund credit note is needed. Bound credits by the
  // invoiced total, less other credit notes, independently of payment state.
  if (attemptedCreditedCents <= invoice.totalCents) return

  throw new InvoiceValidationError(
    "Credit notes cannot exceed the invoice total",
    {
      invoiceId: invoice.id,
      invoiceCurrency: invoice.currency,
      invoiceTotalCents: invoice.totalCents,
      attemptedCreditedCents,
      excessCents: attemptedCreditedCents - invoice.totalCents,
    },
    { status: 409, code: "invoice_overcredited" },
  )
}

function assertCreditNoteLineItemTotalMatchesUnitAmount(
  data: Pick<CreateCreditNoteLineItemInput, "quantity" | "unitPriceCents" | "totalCents">,
) {
  const expectedTotalCents = data.quantity * data.unitPriceCents
  if (data.totalCents === expectedTotalCents) return

  throw new InvoiceValidationError(
    "Credit note line item total must equal quantity multiplied by unit price",
    {
      quantity: data.quantity,
      unitPriceCents: data.unitPriceCents,
      totalCents: data.totalCents,
      expectedTotalCents,
    },
    { status: 400, code: "credit_note_line_total_mismatch" },
  )
}

export const financeInvoiceCreditNoteService = {
  listCreditNotes(db: PostgresJsDatabase, invoiceId: string) {
    return db
      .select()
      .from(creditNotes)
      .where(eq(creditNotes.invoiceId, invoiceId))
      .orderBy(desc(creditNotes.createdAt))
  },

  async getCreditNoteById(db: PostgresJsDatabase, creditNoteId: string) {
    const [row] = await db
      .select()
      .from(creditNotes)
      .where(eq(creditNotes.id, creditNoteId))
      .limit(1)
    return row ?? null
  },

  async createCreditNote(
    db: PostgresJsDatabase,
    invoiceId: string,
    data: CreateCreditNoteInput,
    runtime: FinanceServiceRuntime = {},
  ) {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)

    if (!invoice) {
      return null
    }

    const creditNoteData = await resolveFxMoneyBaseAmount(db, data, {
      ...runtime,
      targetBaseCurrency: invoice.currency,
      fallbackFxRateSetId: invoice.fxRateSetId ?? null,
      date: new Date(),
    })

    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(creditNotes)
        .values({ ...creditNoteData, invoiceId })
        .returning()

      if (row) {
        await assertCreditNotesDoNotExceedInvoiceTotal(tx, invoice, row)
      }

      if (row && runtime.actionLedgerContext) {
        await appendActionLedgerMutation(
          tx,
          await buildCreditNoteCreationActionLedgerInput(
            runtime.actionLedgerContext,
            {
              invoice,
              creditNote: row,
            },
            {
              authorizationSource: runtime.actionLedgerAuthorizationSource,
              actionName: runtime.actionLedgerActionName,
              routeOrToolName: runtime.actionLedgerRouteOrToolName,
              targetType: runtime.actionLedgerTargetType,
              targetId: runtime.actionLedgerTargetId,
              capabilityId: runtime.actionLedgerCapabilityId,
              capabilityVersion: runtime.actionLedgerCapabilityVersion,
              evaluatedRisk: runtime.actionLedgerEvaluatedRisk,
              causationActionId: runtime.actionLedgerCausationActionId,
              approvalId: runtime.actionLedgerApprovalId,
              idempotencyScope: runtime.actionLedgerIdempotencyScope,
              idempotencyKey: runtime.actionLedgerIdempotencyKey,
              idempotencyFingerprint: runtime.actionLedgerIdempotencyFingerprint,
            },
          ),
        )
      }

      return row
    })
  },

  async updateCreditNote(
    db: PostgresJsDatabase,
    creditNoteId: string,
    data: UpdateCreditNoteInput,
    runtime: FinanceServiceRuntime = {},
  ) {
    const updateData = await resolveCreditNoteUpdateData(db, creditNoteId, data, runtime)
    if (!updateData) return null

    const updateCreditNoteRow = async (writer: PostgresJsDatabase) => {
      const [row] = await writer
        .update(creditNotes)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(creditNotes.id, creditNoteId))
        .returning()

      if (!row) {
        return null
      }

      const [invoice] = await writer
        .select()
        .from(invoices)
        .where(eq(invoices.id, row.invoiceId))
        .limit(1)

      if (invoice) {
        await assertCreditNotesDoNotExceedInvoiceTotal(writer, invoice, row)
      }

      return invoice ? { invoice, creditNote: row } : null
    }

    const actionLedgerContext = runtime.actionLedgerContext
    if (actionLedgerContext) {
      const result = await db.transaction(async (tx) => {
        const updated = await updateCreditNoteRow(tx)

        if (updated) {
          await appendActionLedgerMutation(
            tx,
            buildCreditNoteUpdateActionLedgerInput(
              actionLedgerContext,
              { ...updated, changes: updateData },
              { authorizationSource: runtime.actionLedgerAuthorizationSource },
            ),
          )
        }

        return updated
      })

      return result?.creditNote ?? null
    }

    return (await updateCreditNoteRow(db))?.creditNote ?? null
  },

  listCreditNoteLineItems(db: PostgresJsDatabase, creditNoteId: string) {
    return db
      .select()
      .from(creditNoteLineItems)
      .where(eq(creditNoteLineItems.creditNoteId, creditNoteId))
      .orderBy(asc(creditNoteLineItems.sortOrder))
  },

  async createCreditNoteLineItem(
    db: PostgresJsDatabase,
    creditNoteId: string,
    data: CreateCreditNoteLineItemInput,
    runtime: FinanceServiceRuntime = {},
  ) {
    assertCreditNoteLineItemTotalMatchesUnitAmount(data)

    const createLineItem = async (writer: PostgresJsDatabase) => {
      const [creditNote] = await writer
        .select()
        .from(creditNotes)
        .where(eq(creditNotes.id, creditNoteId))
        .limit(1)

      if (!creditNote) {
        return null
      }

      const [invoice] = await writer
        .select()
        .from(invoices)
        .where(eq(invoices.id, creditNote.invoiceId))
        .limit(1)

      if (!invoice) {
        return null
      }

      const [row] = await writer
        .insert(creditNoteLineItems)
        .values({ ...data, creditNoteId })
        .returning()

      return row ? { invoice, creditNote, lineItem: row } : null
    }

    const actionLedgerContext = runtime.actionLedgerContext
    if (actionLedgerContext) {
      const result = await db.transaction(async (tx) => {
        const created = await createLineItem(tx)

        if (created) {
          await appendActionLedgerMutation(
            tx,
            buildCreditNoteLineItemCreateActionLedgerInput(actionLedgerContext, created, {
              authorizationSource: runtime.actionLedgerAuthorizationSource,
            }),
          )
        }

        return created
      })

      return result?.lineItem ?? null
    }

    return (await createLineItem(db))?.lineItem ?? null
  },

  listNotes(db: PostgresJsDatabase, invoiceId: string) {
    return db
      .select()
      .from(financeNotes)
      .where(eq(financeNotes.invoiceId, invoiceId))
      .orderBy(financeNotes.createdAt)
  },

  async createNote(
    db: PostgresJsDatabase,
    invoiceId: string,
    userId: string,
    data: CreateFinanceNoteInput,
  ) {
    const [invoice] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1)

    if (!invoice) {
      return null
    }

    const [row] = await db
      .insert(financeNotes)
      .values({
        invoiceId,
        authorId: userId,
        content: data.content,
      })
      .returning()

    return row
  },
}
