import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { FlightsRuntime } from "./runtime-port.js"

/** Build the standard Node Flights runtime from domain-neutral host primitives. */
export function createFlightsRuntime(primitives: VoyantRuntimeHostPrimitives): FlightsRuntime {
  void primitives
  return {
    resolveAdapter() {
      throw new Error(
        "Flight connector is not configured. Provide a flights.runtime port from project customization or an installed connector integration.",
      )
    },
    async listAdmittedShoppingSources() {
      return []
    },
    async startCardPayment() {
      return
    },
  }
}
