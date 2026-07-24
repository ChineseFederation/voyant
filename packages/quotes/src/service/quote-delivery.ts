import { sha256 } from "@voyant-travel/action-ledger/fingerprint"
import { and, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { z } from "zod"

import { buildQuoteVersionProposalUrl } from "../proposal-routes.js"
import type {
  QuoteProposalNotificationDelivery,
  QuotesNotificationsRuntime,
} from "../runtime-port.js"
import type { QuoteVersion } from "../schema.js"
import { quoteProposalDeliveryRequests, quoteVersions } from "../schema.js"
import { QuoteVersionConflictError, quoteVersionsService } from "./quote-versions.js"

export const snapshotAndSendQuoteInputSchema = z.object({
  quoteId: z.string().min(1),
  to: z.string().trim().min(1),
  templateSlug: z.string().trim().min(1),
  channel: z.enum(["email", "sms"]).default("email"),
  validUntil: z.string().date().nullable().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().trim().min(8).max(255),
})

export type SnapshotAndSendQuoteInput = z.infer<typeof snapshotAndSendQuoteInputSchema>

export interface SnapshotAndSendQuoteResult {
  quoteVersion: QuoteVersion
  proposalUrl: string
  delivery: QuoteProposalNotificationDelivery
  reused: boolean
}

export class QuoteDeliveryIdempotencyConflictError extends Error {
  constructor() {
    super("Quote delivery idempotency key was already used for a different command")
    this.name = "QuoteDeliveryIdempotencyConflictError"
  }
}

export class QuoteDeliveryFailedError extends Error {
  constructor(readonly delivery: QuoteProposalNotificationDelivery) {
    super(`Quote proposal notification finished with status ${delivery.status}`)
    this.name = "QuoteDeliveryFailedError"
  }
}

export async function snapshotAndSendQuote(
  db: PostgresJsDatabase,
  notifications: QuotesNotificationsRuntime,
  input: SnapshotAndSendQuoteInput,
  options: {
    publicProposalBaseUrl?: string | null
    bindings?: Record<string, unknown>
  } = {},
): Promise<SnapshotAndSendQuoteResult | null> {
  const requestFingerprint = `sha256:${await sha256({ ...input, idempotencyKey: null })}`
  const prepared = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`quotes.snapshot-and-send:${input.idempotencyKey}`}))`,
    )
    const [existing] = await tx
      .select()
      .from(quoteProposalDeliveryRequests)
      .where(eq(quoteProposalDeliveryRequests.idempotencyKey, input.idempotencyKey))
      .limit(1)
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new QuoteDeliveryIdempotencyConflictError()
      }
      const [quoteVersion] = await tx
        .select()
        .from(quoteVersions)
        .where(eq(quoteVersions.id, existing.quoteVersionId))
        .limit(1)
      if (!quoteVersion) {
        throw new QuoteVersionConflictError("Prepared quote delivery lost its Quote Version")
      }
      return {
        quoteVersion,
        proposalUrl: existing.proposalUrl,
        reused: true,
        completed: existing.completedAt !== null,
      }
    }

    const quoteVersion = await quoteVersionsService.createVersionSnapshotFromQuote(
      tx as PostgresJsDatabase,
      input.quoteId,
    )
    if (!quoteVersion) return null
    const proposalUrl = buildQuoteVersionProposalUrl(quoteVersion.id, {
      baseUrl: options.publicProposalBaseUrl,
    })
    await tx.insert(quoteProposalDeliveryRequests).values({
      idempotencyKey: input.idempotencyKey,
      requestFingerprint,
      quoteId: input.quoteId,
      quoteVersionId: quoteVersion.id,
      proposalUrl,
    })
    return { quoteVersion, proposalUrl, reused: false, completed: false }
  })
  if (!prepared) return null

  const delivery = await notifications.sendQuoteProposal(db, options.bindings ?? {}, {
    idempotencyKey: `quotes.snapshot-and-send:${input.idempotencyKey}`,
    templateSlug: input.templateSlug,
    to: input.to,
    channel: input.channel,
    quoteId: input.quoteId,
    quoteVersionId: prepared.quoteVersion.id,
    data: {
      ...input.data,
      quoteId: input.quoteId,
      quoteVersionId: prepared.quoteVersion.id,
      proposalUrl: prepared.proposalUrl,
    },
  })
  if (delivery.status === "failed" || delivery.status === "cancelled") {
    throw new QuoteDeliveryFailedError(delivery)
  }

  if (prepared.completed) {
    return {
      quoteVersion: prepared.quoteVersion,
      proposalUrl: prepared.proposalUrl,
      delivery,
      reused: true,
    }
  }

  if (!["draft", "sent"].includes(prepared.quoteVersion.status)) {
    throw new QuoteVersionConflictError(
      `Prepared Quote Version cannot complete delivery from ${prepared.quoteVersion.status}`,
    )
  }
  const quoteVersion =
    prepared.quoteVersion.status === "sent"
      ? prepared.quoteVersion
      : await quoteVersionsService.sendQuoteVersion(db, prepared.quoteVersion.id, {
          validUntil: input.validUntil,
        })
  if (!quoteVersion) throw new QuoteVersionConflictError("Prepared Quote Version was not found")

  await db
    .update(quoteProposalDeliveryRequests)
    .set({ completedAt: new Date() })
    .where(
      and(
        eq(quoteProposalDeliveryRequests.idempotencyKey, input.idempotencyKey),
        eq(quoteProposalDeliveryRequests.quoteVersionId, quoteVersion.id),
      ),
    )

  return { quoteVersion, proposalUrl: prepared.proposalUrl, delivery, reused: prepared.reused }
}
