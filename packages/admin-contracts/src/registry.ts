import { bookingsOperations } from "./bookings.js"
import type { OperationCapability } from "./core/capabilities.js"
import type { OperationDescriptor } from "./core/operation.js"
import { crmOperations } from "./crm.js"
import { financeOperations } from "./finance.js"
import { legalOperations } from "./legal.js"
import { productsOperations } from "./products.js"

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous descriptor registry -- owner: admin-contracts; existing suppression is intentional pending typed cleanup.
export type AnyOperation = OperationDescriptor<any, any, any>

function isOperation(value: unknown): value is AnyOperation {
  return (
    !!value &&
    typeof value === "object" &&
    "id" in value &&
    "pathTemplate" in value &&
    typeof (value as { path?: unknown }).path === "function"
  )
}

function collect(node: unknown, out: AnyOperation[]): void {
  if (isOperation(node)) {
    out.push(node)
    return
  }
  if (node && typeof node === "object") {
    for (const child of Object.values(node)) collect(child, out)
  }
}

/** Every operation descriptor across all domains, flattened. */
export const allOperations: AnyOperation[] = (() => {
  const out: AnyOperation[] = []
  collect(bookingsOperations, out)
  collect(financeOperations, out)
  collect(crmOperations, out)
  collect(legalOperations, out)
  collect(productsOperations, out)
  return out
})()

/** Lookup a descriptor by its dotted id (`"bookings.cancel"`). */
export function getOperation(id: string): AnyOperation | undefined {
  return allOperations.find((op) => op.id === id)
}

/**
 * Project the registry to the capability-descriptor shape a deployment
 * advertises via `GET /v1/admin/_meta/capabilities`.
 */
export function operationCapabilities(): OperationCapability[] {
  return allOperations.map((op) => ({
    id: op.id,
    method: op.method,
    pathTemplate: op.pathTemplate,
    classification: op.classification,
    scopes: op.scopes,
    capabilityKey: op.capabilityKey,
  }))
}
