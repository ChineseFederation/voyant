import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const applicationLib = resolve(root, "apps/operator/src/api/lib")
for (const helper of [
  "owned-booking-handlers.ts",
  "product-booking-handler.ts",
  "product-booking-handler-utils.ts",
  "retained-vertical-booking-handlers.ts",
]) {
  if (existsSync(resolve(applicationLib, helper))) {
    throw new Error(`Operator must not own package booking behavior: ${helper}`)
  }
}

const packageAuthorities = [
  ["packages/inventory/src/booking-engine/product-runtime.ts", "registerProductBookingHandler"],
  ["packages/accommodations/src/booking-engine/runtime.ts", "registerAccommodationBookingHandler"],
  ["packages/cruises/src/booking-engine/runtime.ts", "registerCruiseBookingHandler"],
]
for (const [relativePath, registration] of packageAuthorities) {
  const source = readFileSync(resolve(root, relativePath), "utf8")
  if (!source.includes(`export function ${registration}`)) {
    throw new Error(`${relativePath} must own ${registration}`)
  }
  if (source.includes("apps/operator")) {
    throw new Error(`${relativePath} must not depend on the Operator application`)
  }
}

console.log(
  "Operator product booking backend authority: 0 application bindings; 3 package runtimes",
)
