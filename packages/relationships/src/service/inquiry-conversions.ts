import { insertOutboxEvents } from "@voyant-travel/db/outbox"
import type { ProposalInquiryConversionRuntime } from "@voyant-travel/proposals-contracts/inquiry-conversion"
import type {
  ConvertInquiryToProposalCommand,
  InquiryProposalConversionRefusalReason,
  InquiryProposalConversionResult,
} from "@voyant-travel/relationships-contracts"
import { and, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { INQUIRY_CONVERTED_EVENT } from "../events.js"
import { inquiries, inquiryConversions } from "../schema.js"
import { InquiryServiceError } from "./inquiries.js"

export class InquiryProposalConversionRefusedError extends InquiryServiceError {
  constructor(readonly reason: InquiryProposalConversionRefusalReason) {
    super("INQUIRY_CONVERSION_REFUSED", `Proposal conversion refused: ${reason}`)
    this.name = "InquiryProposalConversionRefusedError"
  }
}

function resultFromConversion(
  kind: "created" | "replayed",
  conversion: typeof inquiryConversions.$inferSelect,
): InquiryProposalConversionResult {
  return {
    kind,
    conversionId: conversion.id,
    inquiryId: conversion.inquiryId,
    inquiryStatus: conversion.inquiryStatus as "qualified" | "converted",
    target: {
      kind: "proposal",
      id: conversion.targetId,
      pipelineId: conversion.targetSnapshot.pipelineId,
      stageId: conversion.targetSnapshot.stageId,
    },
  }
}

/**
 * Coordinates the Relationships-owned source lifecycle with the Proposal-owned
 * creation command. The outer transaction is handed to the port: the standard
 * Proposal adapter shares this database, making target creation, provenance,
 * lifecycle, and outbox atomic. Its source identity also makes replay recover
 * safely if another provider had finalized the target independently.
 */
export async function convertInquiryToProposal(
  db: PostgresJsDatabase,
  proposalRuntime: ProposalInquiryConversionRuntime,
  inquiryId: string,
  command: ConvertInquiryToProposalCommand,
  actorId: string,
  testHooks?: { beforeOutbox?: (tx: PostgresJsDatabase) => Promise<void> },
): Promise<InquiryProposalConversionResult> {
  if (!actorId) {
    throw new InquiryServiceError("INQUIRY_CUSTOMER_REQUIRED", "A staff actor is required")
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`relationships:inquiry-conversion:${inquiryId}:proposal:${command.idempotencyKey}`}, 0))`,
    )

    const [existing] = await tx
      .select()
      .from(inquiryConversions)
      .where(
        and(
          eq(inquiryConversions.inquiryId, inquiryId),
          eq(inquiryConversions.kind, "proposal"),
          eq(inquiryConversions.idempotencyKey, command.idempotencyKey),
        ),
      )
      .limit(1)
    if (existing) {
      return resultFromConversion("replayed", existing)
    }

    const [inquiry] = await tx
      .select()
      .from(inquiries)
      .where(eq(inquiries.id, inquiryId))
      .for("update")
    if (!inquiry) throw new InquiryServiceError("INQUIRY_NOT_FOUND", "Inquiry not found")
    if (inquiry.status !== "qualified") {
      throw new InquiryServiceError(
        inquiry.status === "closed" || inquiry.status === "converted"
          ? "INQUIRY_ALREADY_RESOLVED"
          : "INQUIRY_CONVERSION_NOT_READY",
        "Only a qualified inquiry can start a new conversion",
      )
    }
    if (!inquiry.personId && !inquiry.organizationId) {
      throw new InquiryServiceError(
        "INQUIRY_CUSTOMER_REQUIRED",
        "Proposal conversion requires a Person or Organization",
      )
    }

    const outcome = await proposalRuntime.convertInquiry(tx, {
      inquiryId,
      idempotencyKey: command.idempotencyKey,
      title: inquiry.subject,
      summary: inquiry.internalSummary ?? inquiry.customerMessage,
      personId: inquiry.personId,
      organizationId: inquiry.organizationId,
      ownerId: inquiry.ownerId,
      actorId,
      tags: inquiry.tags,
      pipeline: { pipelineId: command.pipelineId, stageId: command.stageId },
      productTargets: [],
    })
    if (outcome.kind === "refused") {
      throw new InquiryProposalConversionRefusedError(outcome.reason)
    }

    const inquiryStatus = command.keepInquiryOpen ? "qualified" : "converted"
    const [conversion] = await tx
      .insert(inquiryConversions)
      .values({
        inquiryId,
        kind: "proposal",
        targetId: outcome.proposalId,
        targetSnapshot: {
          kind: "proposal",
          pipelineId: outcome.pipelineId,
          stageId: outcome.stageId,
        },
        idempotencyKey: command.idempotencyKey,
        mode: "created",
        actorId,
        inquiryStatus,
      })
      .returning()
    if (!conversion) throw new Error("Inquiry conversion insert returned no row")

    const now = new Date()
    await tx
      .update(inquiries)
      .set({
        status: inquiryStatus,
        convertedAt: command.keepInquiryOpen ? inquiry.convertedAt : now,
        nextActionAt: command.keepInquiryOpen ? inquiry.nextActionAt : null,
        updatedAt: now,
      })
      .where(eq(inquiries.id, inquiryId))

    await testHooks?.beforeOutbox?.(tx)
    await insertOutboxEvents(tx, [
      {
        name: INQUIRY_CONVERTED_EVENT,
        data: {
          id: inquiryId,
          actorId,
          conversionId: conversion.id,
          kind: "proposal",
          targetId: outcome.proposalId,
          inquiryStatus,
        },
        metadata: {
          category: "domain",
          source: "service",
          eventId: `evt_relationships_inquiry_converted_${conversion.id}`,
        },
      },
    ])

    return resultFromConversion(outcome.kind, conversion)
  })
}
