import type { ConvertInquiryToBookingSessionCommand } from "@voyant-travel/relationships-contracts"
import { describe, expect, it, vi } from "vitest"

import { VoyantApiError } from "./client.js"
import {
  createInquiryBookingSessionConversionAttempt,
  inquiryBookingSessionConversionFailureKind,
  inquiryBookingSessionConversionPath,
} from "./inquiry-booking-session-conversion.js"

describe("Inquiry Booking Session conversion attempt", () => {
  it("reuses one idempotency key across a retry and clears it after success", async () => {
    const commands: ConvertInquiryToBookingSessionCommand[] = []
    const execute = vi.fn(async (_id: string, command: ConvertInquiryToBookingSessionCommand) => {
      commands.push(command)
      if (commands.length === 1) throw new Error("network")
      return {
        kind: "created" as const,
        conversionId: "cnv_1",
        inquiryId: "inq_1",
        inquiryStatus: "converted" as const,
        target: { kind: "booking_session" as const, id: "bks_1" },
      }
    })
    const attempt = createInquiryBookingSessionConversionAttempt({
      execute,
      createIdempotencyKey: () => "stable-key",
    })
    const options = { targetLinkId: "link_1", keepInquiryOpen: false }

    await expect(attempt.run("inq_1", options)).rejects.toThrow("network")
    await expect(attempt.run("inq_1", options)).resolves.toMatchObject({ kind: "converted" })
    expect(commands.map(({ idempotencyKey }) => idempotencyKey)).toEqual([
      "stable-key",
      "stable-key",
    ])
  })

  it("returns a typed owner refusal", async () => {
    const attempt = createInquiryBookingSessionConversionAttempt({
      execute: vi.fn(async () => {
        throw new VoyantApiError("refused", 409, {
          error: "Booking conversion refused: unsupported_target",
          reason: "unsupported_target",
        })
      }),
    })
    await expect(
      attempt.run("inq_1", { targetLinkId: "link_1", keepInquiryOpen: false }),
    ).resolves.toEqual({
      kind: "refused",
      error: "Booking conversion refused: unsupported_target",
      reason: "unsupported_target",
    })
  })

  it("refuses changed retry inputs instead of silently resubmitting the stale target", async () => {
    const execute = vi.fn(async () => {
      throw new Error("network")
    })
    const attempt = createInquiryBookingSessionConversionAttempt({
      execute,
      createIdempotencyKey: () => "stable-key",
    })
    await expect(
      attempt.run("inq_1", { targetLinkId: "link_old", keepInquiryOpen: false }),
    ).rejects.toThrow("network")

    await expect(
      attempt.run("inq_1", { targetLinkId: "link_new", keepInquiryOpen: false }),
    ).resolves.toMatchObject({ kind: "refused", reason: "idempotency_conflict" })
    expect(execute).toHaveBeenCalledOnce()
  })

  it("encodes paths and distinguishes an unavailable provider", () => {
    expect(inquiryBookingSessionConversionPath("inquiry/one")).toBe(
      "/v1/admin/relationships/inquiries/inquiry%2Fone/convert",
    )
    expect(inquiryBookingSessionConversionFailureKind(new VoyantApiError("x", 503, {}))).toBe(
      "unavailable",
    )
  })
})
