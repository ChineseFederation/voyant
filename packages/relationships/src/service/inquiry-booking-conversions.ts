import { insertOutboxEvents } from "@voyant-travel/db/outbox"
import type { CatalogInquiryBookingSessionRuntime } from "@voyant-travel/catalog/inquiry-booking-session-runtime-port"
import { and, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { INQUIRY_CONVERTED_EVENT } from "../events.js"
import { inquiries, inquiryConversions } from "../schema.js"
import { InquiryServiceError } from "./inquiries.js"

export type InquiryBookingTarget = {
  linkId: string
  inquiryId: string
  kind: "product" | "option_unit" | "catalog_item" | "trip"
  targetId: string
}

export interface InquiryBookingTargetResolver {
  resolve(db: PostgresJsDatabase, inquiryId: string, targetLinkId: string): Promise<InquiryBookingTarget | null>
}

export type InquiryBookingConversionRefusalReason =
  | "booking_session_required"
  | "target_not_found"
  | "unsupported_target"
  | "idempotency_conflict"
  | "invalid_selection"
  | "target_unavailable"

export class InquiryBookingConversionRefusedError extends InquiryServiceError {
  constructor(readonly reason: InquiryBookingConversionRefusalReason) {
    super("INQUIRY_CONVERSION_REFUSED", `Booking conversion refused: ${reason}`)
    this.name = "InquiryBookingConversionRefusedError"
  }
}

export async function convertInquiryToBookingTarget(
  db: PostgresJsDatabase,
  sessionRuntime: CatalogInquiryBookingSessionRuntime,
  targetResolver: InquiryBookingTargetResolver,
  inquiryId: string,
  command:
    | {
        kind: "booking_session"
        idempotencyKey: string
        targetLinkId: string
        channelId?: string | null
        selection?: Record<string, unknown>
        keepInquiryOpen: boolean
      }
    | { kind: "booking"; idempotencyKey: string },
  actorId: string,
) {
  if (!actorId) throw new InquiryServiceError("INQUIRY_CUSTOMER_REQUIRED", "A staff actor is required")
  if (command.kind === "booking") {
    throw new InquiryBookingConversionRefusedError("booking_session_required")
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`relationships:inquiry-conversion:${inquiryId}:booking_session:${command.idempotencyKey}`}, 0))`,
    )
    const [existing] = await tx
      .select()
      .from(inquiryConversions)
      .where(
        and(
          eq(inquiryConversions.inquiryId, inquiryId),
          eq(inquiryConversions.kind, "booking_session"),
          eq(inquiryConversions.idempotencyKey, command.idempotencyKey),
        ),
      )
      .limit(1)
    if (existing) return conversionResult("replayed", existing)

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
      throw new InquiryServiceError("INQUIRY_CUSTOMER_REQUIRED", "Conversion requires a Person or Organization")
    }

    const target = await targetResolver.resolve(tx, inquiryId, command.targetLinkId)
    if (!target || target.inquiryId !== inquiryId || target.linkId !== command.targetLinkId) {
      throw new InquiryBookingConversionRefusedError("target_not_found")
    }
    const sessionTarget =
      target.kind === "product"
        ? ({ kind: "product", productId: target.targetId } as const)
        : target.kind === "catalog_item"
          ? ({ kind: "catalog_item", catalogItemId: target.targetId } as const)
          : null
    if (!sessionTarget) throw new InquiryBookingConversionRefusedError("unsupported_target")

    const ownerKey = await ownerIdempotencyKey(inquiryId, command.idempotencyKey)
    const outcome = await sessionRuntime.createForInquiry({
      db: tx,
      idempotencyKey: ownerKey,
      target: sessionTarget,
      selection: command.selection,
      actorId,
      organizationId: inquiry.organizationId,
      channelId: command.channelId,
    })
    if (outcome.kind === "refused") {
      throw new InquiryBookingConversionRefusedError(outcome.reason)
    }

    const inquiryStatus = command.keepInquiryOpen ? "qualified" : "converted"
    const [conversion] = await tx
      .insert(inquiryConversions)
      .values({
        inquiryId,
        kind: "booking_session",
        targetId: outcome.bookingSessionId,
        targetSnapshot: { kind: "booking_session", targetLinkId: target.linkId },
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
    await insertOutboxEvents(tx, [
      {
        name: INQUIRY_CONVERTED_EVENT,
        data: {
          id: inquiryId,
          actorId,
          conversionId: conversion.id,
          kind: "booking_session",
          targetId: outcome.bookingSessionId,
          inquiryStatus,
        },
        metadata: {
          category: "domain",
          source: "service",
          eventId: `evt_relationships_inquiry_converted_${conversion.id}`,
        },
      },
    ])
    return conversionResult(outcome.kind, conversion)
  })
}

async function ownerIdempotencyKey(inquiryId: string, idempotencyKey: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${inquiryId}\u0000${idempotencyKey}`)
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes)
  return `inquiry-booking-session:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`
}

function conversionResult(kind: "created" | "replayed", conversion: typeof inquiryConversions.$inferSelect) {
  return {
    kind,
    conversionId: conversion.id,
    inquiryId: conversion.inquiryId,
    inquiryStatus: conversion.inquiryStatus as "qualified" | "converted",
    target: { kind: "booking_session" as const, id: conversion.targetId },
  }
}
