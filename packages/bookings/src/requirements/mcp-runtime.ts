import { ToolError } from "@voyant-travel/tools"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { type BookingsInventoryRuntime, bookingsInventoryRuntimePort } from "../runtime-port.js"
import { bookingRequirementsService } from "./service.js"
import type { BookingRequirementsToolServices } from "./tools.js"

type ServiceFunction = (...args: never[]) => Promise<unknown>

export function contributeBookingRequirementsToolContext(input: {
  context: { db?: unknown }
  resources: Record<string, unknown>
}) {
  const db = input.context.db as PostgresJsDatabase
  const execute: BookingRequirementsToolServices["execute"] = async (operation, operationInput) => {
    const args = operationInput as Record<string, unknown>
    if (operation === "getPublicTransportRequirements") {
      const { productId, ...query } = args
      const inventory = await requiredInventoryRuntime(
        input.resources[bookingsInventoryRuntimePort.id],
      )
      return bookingRequirementsService.getPublicTransportRequirements(
        db,
        String(productId),
        query,
        inventory.resolveProductSnapshot,
      )
    }
    const candidate = Reflect.get(bookingRequirementsService, operation) as
      | ServiceFunction
      | undefined
    if (typeof candidate !== "function") {
      // voyant#3950: terminal, and deliberately so — `operation` comes from the
      // Tool definition, not from the caller, so no retry and no input change can
      // make this resolve. MISSING_SERVICE says that; PROVIDER_ERROR implied a
      // provider that might recover. The valid operations are already in hand, so
      // list them as candidates rather than making the operator go read the
      // service to find out what it does support.
      throw new ToolError(
        `Unsupported booking requirements operation: ${operation}`,
        "MISSING_SERVICE",
        undefined,
        undefined,
        { candidates: supportedOperations() },
      )
    }
    if (operation.startsWith("list") || operation.startsWith("create")) {
      return candidate(db as never, args as never)
    }
    if (operation.startsWith("get")) {
      return candidate(db as never, String(args.id) as never)
    }
    if (operation.startsWith("update")) {
      const { id, ...data } = args
      return candidate(db as never, String(id) as never, data as never)
    }
    // voyant#3950: reached when the operation EXISTS but its verb prefix is not
    // one this dispatcher knows how to shape arguments for. That is a server-side
    // defect rather than a missing binding, so PROVIDER_ERROR (terminal, "report
    // it to the operator") is the honest code — classified explicitly here rather
    // than inherited from a default nobody revisited.
    throw new ToolError(
      `Unsupported booking requirements operation: ${operation}`,
      "PROVIDER_ERROR",
    )
  }
  return { bookingRequirements: { execute } }
}

/**
 * The booking-requirements operations this runtime can dispatch — the function
 * keys the service exposes. Used as `candidates` on an unsupported-operation
 * failure, where the set is already in memory and costs no extra query.
 */
function supportedOperations(): string[] {
  return Object.keys(bookingRequirementsService)
    .filter((key) => typeof Reflect.get(bookingRequirementsService, key) === "function")
    .sort()
}

async function requiredInventoryRuntime(value: unknown): Promise<BookingsInventoryRuntime> {
  const resolved = await Promise.resolve(value)
  if (resolved === undefined) {
    throw new ToolError(
      "Booking requirements need the selected bookings.inventory.runtime port.",
      "MISSING_SERVICE",
      { service: bookingsInventoryRuntimePort.id },
    )
  }
  await bookingsInventoryRuntimePort.test(resolved as BookingsInventoryRuntime)
  return resolved as BookingsInventoryRuntime
}
