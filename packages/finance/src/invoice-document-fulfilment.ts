import type { EventBus } from "@voyant-travel/core"
import { and, asc, eq, isNotNull, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  type FinanceInvoiceDocumentProvider,
  invoiceDocumentOperationKey,
} from "./contracts/invoice-document-provider.js"
import { invoiceDocumentContentType } from "./invoice-document-runtime.js"
import { invoiceNumberSeries, invoiceRenditions, invoices } from "./schema.js"
import type { InvoiceDocumentRuntimeOptions } from "./service-documents.js"
import { prepareInvoiceDocument } from "./service-documents.js"
import type { InvoiceRenderedEvent } from "./service-shared.js"

/**
 * How many times a rendition may be re-rendered before it is called failed.
 *
 * A terminal row is the point: `waitForInvoiceRendition` treats `ready` and
 * `failed` as terminal and nothing else, so a row that retries forever is a
 * caller blocked forever and a notification bundle that never resolves.
 */
export const INVOICE_DOCUMENT_MAX_ATTEMPTS = 5

/** The `PENDING-<scope>-<uuid>` placeholder an external series leaves behind. */
const PENDING_INVOICE_NUMBER_PREFIX = "PENDING-"

/**
 * How long a claim keeps other callers off a row.
 *
 * A process that dies mid-render leaves its claim behind, so the claim has to
 * expire or the row would be stranded exactly as the orphan it replaced was.
 * Comfortably longer than the renderer's own 30s navigation timeout.
 */
const CLAIM_LEASE_MS = 5 * 60 * 1000

export type InvoiceRenditionFulfilmentOutcome =
  | { status: "fulfilled"; renditionId: string; storageKey: string }
  | {
      status: "skipped"
      renditionId: string
      reason:
        | "not_pending"
        | "claimed_elsewhere"
        | "invoice_not_found"
        | "awaiting_external_allocation"
    }
  | {
      status: "retry"
      renditionId: string
      attempts: number
      message: string
    }
  | {
      status: "failed"
      renditionId: string
      reason: "document_renderer_unavailable" | "render_failed" | "invoice_not_found"
      message: string
    }

export interface FulfilInvoiceRenditionOptions {
  /**
   * Absent when the deployment selected no provider. The engine still runs —
   * recording the miss on the row is the whole point, because the alternative
   * is the orphan this replaced: a row that reads as work in flight forever.
   */
  provider?: FinanceInvoiceDocumentProvider
  eventBus?: EventBus
  resolveCustomFields?: InvoiceDocumentRuntimeOptions["resolveCustomFields"]
  maxAttempts?: number
}

interface FulfilmentMetadata {
  attempts: number
  claim?: string
  claimedAt?: string
  lastError?: string
  lastAttemptAt?: string
}

function readFulfilmentMetadata(metadata: unknown): FulfilmentMetadata {
  if (!metadata || typeof metadata !== "object") return { attempts: 0 }
  const fulfilment = (metadata as { fulfilment?: unknown }).fulfilment
  if (!fulfilment || typeof fulfilment !== "object") return { attempts: 0 }
  const record = fulfilment as Record<string, unknown>
  const attempts = record.attempts
  return {
    attempts: typeof attempts === "number" && attempts > 0 ? attempts : 0,
    ...(typeof record.claim === "string" ? { claim: record.claim } : {}),
    ...(typeof record.claimedAt === "string" ? { claimedAt: record.claimedAt } : {}),
  }
}

/** SQL predicate: this row still carries the claim we wrote. */
function heldClaim(token: string) {
  return sql`${invoiceRenditions.metadata} -> 'fulfilment' ->> 'claim' = ${token}`
}

/** Is another caller already rendering this row, and not yet timed out? */
function isClaimLive(metadata: unknown, at: Date): boolean {
  const { claim, claimedAt } = readFulfilmentMetadata(metadata)
  if (!claim || !claimedAt) return false
  const held = Date.parse(claimedAt)
  return Number.isFinite(held) && at.getTime() - held < CLAIM_LEASE_MS
}

function mergeMetadata(metadata: unknown, patch: Record<string, unknown>) {
  return { ...(metadata && typeof metadata === "object" ? metadata : {}), ...patch }
}

/**
 * Does an installed accounting app own this document?
 *
 * When the invoice's series delegates numbering to an app, the number on the
 * row is still the `PENDING-…` placeholder until that app allocates a real one.
 * Rendering locally now would produce a fiscally invalid PDF — a document that
 * names a number no authority issued — and then hand it to the operator as the
 * invoice. Leaving the row pending is correct: the app PUTs its own artifact to
 * `/v1/app/finance/documents/:id/artifacts/provider-pdf`, `bindInvoiceRendition`
 * supersedes this row, and the drain stops seeing it.
 */
async function awaitsExternalAllocation(
  db: PostgresJsDatabase,
  invoice: typeof invoices.$inferSelect,
): Promise<boolean> {
  if (!invoice.invoiceNumber?.startsWith(PENDING_INVOICE_NUMBER_PREFIX)) return false
  if (!invoice.seriesId) return true
  const [series] = await db
    .select({ externalProvider: invoiceNumberSeries.externalProvider })
    .from(invoiceNumberSeries)
    .where(eq(invoiceNumberSeries.id, invoice.seriesId))
    .limit(1)
  return Boolean(series?.externalProvider)
}

/**
 * Fulfil one requested rendition: render it, persist it at the one key the row
 * owns, and move the row itself to `ready`.
 *
 * The row is updated in place rather than superseded by a second row, because
 * that is what `renderInvoice` always documented and what every waiter is
 * already watching. `bindInvoiceRendition` keeps inserting — it serves the
 * app-provided path, where the bytes arrive without a request having been made.
 */
export async function fulfilInvoiceRendition(
  db: PostgresJsDatabase,
  renditionId: string,
  options: FulfilInvoiceRenditionOptions = {},
): Promise<InvoiceRenditionFulfilmentOutcome> {
  const maxAttempts = options.maxAttempts ?? INVOICE_DOCUMENT_MAX_ATTEMPTS
  const now = new Date()

  // Serialize the subscriber's fast path against the recovery job. Both are
  // allowed to reach the same row; only one may render it.
  //
  // The advisory lock is transaction-scoped and so ends here, well before
  // `render`/`put` run — on its own it would let two callers both observe
  // `pending`, both render, and both write the same operation key. Only one of
  // them would win the closing compare-and-set, but the loser's upload could
  // still land after the winner recorded its checksum and byte length, leaving
  // a `ready` row describing bytes that are no longer there. So the claim is
  // written into the row while the lock is held and outlives it: a second
  // caller sees a live claim and never renders at all.
  const claimToken = crypto.randomUUID()
  const claimed = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`finance:invoice-rendition:${renditionId}`}))`,
    )
    const [rendition] = await tx
      .select()
      .from(invoiceRenditions)
      .where(eq(invoiceRenditions.id, renditionId))
      .limit(1)
    if (!rendition || rendition.status !== "pending") return null
    if (isClaimLive(rendition.metadata, now)) return "claimed_elsewhere" as const

    const [held] = await tx
      .update(invoiceRenditions)
      .set({
        updatedAt: now,
        metadata: mergeMetadata(rendition.metadata, {
          fulfilment: {
            ...readFulfilmentMetadata(rendition.metadata),
            claim: claimToken,
            claimedAt: now.toISOString(),
          },
        }),
      })
      .where(and(eq(invoiceRenditions.id, renditionId), eq(invoiceRenditions.status, "pending")))
      .returning()
    if (!held) return null

    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, held.invoiceId))
      .limit(1)
    return { rendition: held, invoice: invoice ?? null }
  })

  if (!claimed) return { status: "skipped", renditionId, reason: "not_pending" }
  if (claimed === "claimed_elsewhere") {
    return { status: "skipped", renditionId, reason: "claimed_elsewhere" }
  }
  const { rendition } = claimed

  if (!claimed.invoice) {
    await markFailed(db, rendition, "The invoice this rendition belongs to no longer exists.")
    return {
      status: "failed",
      renditionId,
      reason: "invoice_not_found",
      message: "invoice_not_found",
    }
  }
  const invoice = claimed.invoice

  if (await awaitsExternalAllocation(db, invoice)) {
    await releaseClaim(db, rendition, claimToken)
    return { status: "skipped", renditionId, reason: "awaiting_external_allocation" }
  }

  if (!options.provider) {
    await markFailed(
      db,
      rendition,
      "No document renderer is available on this deployment, so the invoice document could not be produced.",
      "document_renderer_unavailable",
    )
    return {
      status: "failed",
      renditionId,
      reason: "document_renderer_unavailable",
      message: "document_renderer_unavailable",
    }
  }
  const provider = options.provider

  const attempts = readFulfilmentMetadata(rendition.metadata).attempts + 1

  try {
    const prepared = await prepareInvoiceDocument(
      db,
      invoice.id,
      {
        format: rendition.format,
        ...(rendition.templateId ? { templateId: rendition.templateId } : {}),
        ...(rendition.language ? { language: rendition.language } : {}),
      },
      options.resolveCustomFields,
    )
    if (prepared.status === "not_found") {
      await markFailed(db, rendition, "The invoice this rendition belongs to no longer exists.")
      return {
        status: "failed",
        renditionId,
        reason: "invoice_not_found",
        message: "invoice_not_found",
      }
    }

    const artifact = await provider.render({
      renditionId: rendition.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber ?? "",
      templateId: prepared.template?.id ?? null,
      body: prepared.renderedBody,
      bodyFormat: prepared.renderedBodyFormat,
      format: rendition.format,
      language: prepared.language,
      variables: prepared.variables,
    })

    const operationKey = invoiceDocumentOperationKey({
      invoiceId: invoice.id,
      renditionId: rendition.id,
      format: rendition.format,
    })
    const reference = await provider.put({
      renditionId: rendition.id,
      operationKey,
      artifact,
    })

    const contentType = artifact.contentType || invoiceDocumentContentType(rendition.format)
    const [updated] = await db
      .update(invoiceRenditions)
      .set({
        status: "ready",
        storageKey: reference.key,
        fileSize: reference.byteLength,
        checksum: reference.checksumSha256,
        templateId: prepared.template?.id ?? rendition.templateId,
        language: prepared.language ?? rendition.language,
        errorMessage: null,
        generatedAt: new Date(),
        updatedAt: new Date(),
        metadata: mergeMetadata(rendition.metadata, {
          ...(artifact.metadata ?? {}),
          contentType,
          renderedBodyFormat: prepared.renderedBodyFormat,
          provider: provider.identity.id,
          providerVersion: provider.identity.version,
          fulfilment: { attempts, lastAttemptAt: new Date().toISOString() },
        }),
      })
      // Still ours: a claim that expired mid-render may have been taken over,
      // and the row then belongs to whoever holds it now.
      .where(
        and(
          eq(invoiceRenditions.id, rendition.id),
          eq(invoiceRenditions.status, "pending"),
          heldClaim(claimToken),
        ),
      )
      .returning()

    if (!updated) return { status: "skipped", renditionId, reason: "claimed_elsewhere" }

    await options.eventBus?.emit(
      "invoice.rendered",
      {
        invoiceId: invoice.id,
        invoiceStatus: invoice.status,
        invoiceType: invoice.invoiceType,
        renditionId: updated.id,
        format: updated.format,
        storageKey: updated.storageKey,
        contentType,
        byteSize: updated.fileSize,
        contentHash: updated.checksum,
      } satisfies InvoiceRenderedEvent,
      { category: "internal", source: "service" },
    )

    return { status: "fulfilled", renditionId, storageKey: reference.key }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (attempts >= maxAttempts) {
      await markFailed(
        db,
        rendition,
        `Invoice document rendering failed after ${attempts} attempts: ${message}`,
        "render_failed",
        attempts,
      )
      return { status: "failed", renditionId, reason: "render_failed", message }
    }
    await db
      .update(invoiceRenditions)
      .set({
        updatedAt: new Date(),
        metadata: mergeMetadata(rendition.metadata, {
          // No `claim` here: dropping it is how a failed attempt hands the row
          // back rather than making the next runner wait out the lease.
          fulfilment: { attempts, lastError: message, lastAttemptAt: new Date().toISOString() },
        }),
      })
      .where(
        and(
          eq(invoiceRenditions.id, rendition.id),
          eq(invoiceRenditions.status, "pending"),
          heldClaim(claimToken),
        ),
      )
    return { status: "retry", renditionId, attempts, message }
  }
}

/**
 * Hand a row back without rendering it. The claim exists to stop a concurrent
 * render, so a caller that decides not to render must not hold it for the rest
 * of the lease.
 */
async function releaseClaim(
  db: PostgresJsDatabase,
  rendition: typeof invoiceRenditions.$inferSelect,
  token: string,
) {
  const { attempts } = readFulfilmentMetadata(rendition.metadata)
  await db
    .update(invoiceRenditions)
    .set({
      updatedAt: new Date(),
      metadata: mergeMetadata(rendition.metadata, { fulfilment: { attempts } }),
    })
    .where(and(eq(invoiceRenditions.id, rendition.id), heldClaim(token)))
}

async function markFailed(
  db: PostgresJsDatabase,
  rendition: typeof invoiceRenditions.$inferSelect,
  errorMessage: string,
  reason?: string,
  attempts?: number,
) {
  await db
    .update(invoiceRenditions)
    .set({
      status: "failed",
      errorMessage,
      updatedAt: new Date(),
      metadata: mergeMetadata(rendition.metadata, {
        fulfilment: {
          attempts: attempts ?? readFulfilmentMetadata(rendition.metadata).attempts,
          ...(reason ? { reason } : {}),
          lastError: errorMessage,
          lastAttemptAt: new Date().toISOString(),
        },
      }),
    })
    .where(and(eq(invoiceRenditions.id, rendition.id), eq(invoiceRenditions.status, "pending")))
}

export interface FulfilPendingInvoiceRenditionsOptions extends FulfilInvoiceRenditionOptions {
  /** Restrict the drain to one invoice — the subscriber's fast path. */
  invoiceId?: string
  limit?: number
}

/** Drain requested renditions oldest-first. */
export async function fulfilPendingInvoiceRenditions(
  db: PostgresJsDatabase,
  options: FulfilPendingInvoiceRenditionsOptions = {},
): Promise<InvoiceRenditionFulfilmentOutcome[]> {
  const due = await db
    .select({ id: invoiceRenditions.id })
    .from(invoiceRenditions)
    .where(
      options.invoiceId
        ? and(
            eq(invoiceRenditions.status, "pending"),
            eq(invoiceRenditions.invoiceId, options.invoiceId),
          )
        : eq(invoiceRenditions.status, "pending"),
    )
    .orderBy(asc(invoiceRenditions.createdAt))
    .limit(options.limit ?? 25)

  const outcomes: InvoiceRenditionFulfilmentOutcome[] = []
  for (const row of due) {
    outcomes.push(await fulfilInvoiceRendition(db, row.id, options))
  }
  return outcomes
}

/** Is there anything a provider would have fulfilled, had one been selected? */
export async function hasPendingInvoiceRenditions(db: PostgresJsDatabase): Promise<boolean> {
  const [row] = await db
    .select({ id: invoiceRenditions.id })
    .from(invoiceRenditions)
    .where(and(eq(invoiceRenditions.status, "pending"), isNotNull(invoiceRenditions.invoiceId)))
    .limit(1)
  return Boolean(row)
}
