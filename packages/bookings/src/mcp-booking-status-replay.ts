import { ToolError } from "@voyant-travel/tools"

export type BookingStatusToolAction = "confirm" | "cancel"

export async function requiredBookingStatusReplayDetail(input: {
  action: BookingStatusToolAction
  input: { id: string }
  loadBookingDetail: (id: string) => Promise<unknown>
}) {
  const detail = await input.loadBookingDetail(input.input.id)
  if (!detail) {
    throw new ToolError(
      `${input.action === "confirm" ? "Confirmed" : "Cancelled"} booking could not be read.`,
      "NOT_FOUND",
      { bookingId: input.input.id, action: input.action },
    )
  }

  const expectedStatus = bookingStatusToolTerminalStatus(input.action)
  const currentStatus = isRecord(detail) ? detail.status : undefined
  if (currentStatus !== expectedStatus) {
    throw new ToolError(
      `Booking ${input.action} replay no longer matches the booking lifecycle state.`,
      "INVALID_INPUT",
      {
        bookingId: input.input.id,
        action: input.action,
        reason: "replay_state_drift",
        expectedStatus,
        currentStatus,
      },
    )
  }
  return detail
}

function bookingStatusToolTerminalStatus(action: BookingStatusToolAction) {
  return action === "confirm" ? "confirmed" : "cancelled"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
