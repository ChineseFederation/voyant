import type { paths as RelationshipsAdminPaths } from "@voyant-travel/admin-api-client/relationships"
import {
  type ConvertInquiryToBookingSessionCommand,
  convertInquiryToBookingSessionSchema,
  type InquiryBookingConversionRefusalReason,
  type InquiryBookingConversionResult,
  inquiryBookingConversionRefusalSchema,
} from "@voyant-travel/relationships-contracts"

const bookingSessionConversionRoute =
  "/v1/admin/relationships/inquiries/{id}/convert" as const satisfies keyof RelationshipsAdminPaths
type GeneratedBookingSessionConversionCommand = NonNullable<
  RelationshipsAdminPaths[typeof bookingSessionConversionRoute]["post"]
>["requestBody"]["content"]["application/json"]

export type InquiryBookingSessionConversionOptions = Omit<
  ConvertInquiryToBookingSessionCommand,
  "kind" | "idempotencyKey"
>

export type InquiryBookingSessionConversionOutcome =
  | { kind: "converted"; result: InquiryBookingConversionResult }
  | { kind: "refused"; error: string; reason: InquiryBookingConversionRefusalReason }

export function createInquiryBookingSessionConversionAttempt({
  execute,
  createIdempotencyKey = () => crypto.randomUUID(),
}: {
  execute: (
    inquiryId: string,
    command: ConvertInquiryToBookingSessionCommand,
  ) => Promise<InquiryBookingConversionResult>
  createIdempotencyKey?: () => string
}) {
  const pendingCommands = new Map<string, ConvertInquiryToBookingSessionCommand>()
  return {
    async run(
      inquiryId: string,
      options: InquiryBookingSessionConversionOptions,
    ): Promise<InquiryBookingSessionConversionOutcome> {
      const pending = pendingCommands.get(inquiryId)
      const candidate = convertInquiryToBookingSessionSchema.parse({
        ...options,
        kind: "booking_session",
        idempotencyKey: pending?.idempotencyKey ?? createIdempotencyKey(),
      })
      if (pending && JSON.stringify(pending) !== JSON.stringify(candidate)) {
        return {
          kind: "refused",
          error: "A retry is pending with different Booking Session inputs",
          reason: "idempotency_conflict",
        }
      }
      const command = pending ?? candidate
      pendingCommands.set(inquiryId, command)
      const generatedCommand: GeneratedBookingSessionConversionCommand = command
      void generatedCommand
      try {
        const result = await execute(inquiryId, command)
        pendingCommands.delete(inquiryId)
        return { kind: "converted", result }
      } catch (error) {
        const status = errorStatus(error)
        if (status === 409) {
          const refusal = inquiryBookingConversionRefusalSchema.safeParse(errorBody(error))
          if (refusal.success) {
            pendingCommands.delete(inquiryId)
            return { kind: "refused", ...refusal.data }
          }
        }
        if (typeof status === "number" && status >= 400 && status < 500) {
          pendingCommands.delete(inquiryId)
        }
        throw error
      }
    },
  }
}

export function inquiryBookingSessionConversionPath(inquiryId: string) {
  return bookingSessionConversionRoute.replace("{id}", encodeURIComponent(inquiryId))
}

export function inquiryBookingSessionConversionFailureKind(
  error: unknown,
): "unavailable" | "failed" {
  return errorStatus(error) === 503 ? "unavailable" : "failed"
}

function errorStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error ? error.status : undefined
}

function errorBody(error: unknown) {
  return typeof error === "object" && error !== null && "body" in error
    ? (error as { body: unknown }).body
    : undefined
}
