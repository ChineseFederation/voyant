import { describe, expect, expectTypeOf, it } from "vitest"

import {
  type PublicApiHttpMethod,
  type PublicApiOperationId,
  type PublicApiOperationMetadata,
  publicApiOperations,
} from "./generated/operation-metadata.js"

describe("generated Public API operation metadata", () => {
  it("exports stable literal identity, routing, and credential posture", () => {
    expect(publicApiOperations.getPublicSettings).toEqual({
      id: "getPublicSettings",
      keyKind: "publishable",
      method: "GET",
      path: "/v1/public/settings",
    })

    expectTypeOf(publicApiOperations.getPublicSettings.id).toEqualTypeOf<"getPublicSettings">()
    expectTypeOf(publicApiOperations.getPublicSettings.method).toEqualTypeOf<"GET">()
  })

  it("keeps IDs unique and internally consistent", () => {
    const entries = Object.entries(publicApiOperations)
    expect(entries.length).toBeGreaterThan(0)
    expect(new Set(entries.map(([id]) => id)).size).toBe(entries.length)
    expect(entries.every(([id, metadata]) => metadata.id === id)).toBe(true)
    expect(entries.every(([, metadata]) => metadata.path.startsWith("/v1/public/"))).toBe(true)
  })
})

const operationId: PublicApiOperationId = publicApiOperations.getPublicSettings.id
const method: PublicApiHttpMethod = publicApiOperations.getPublicSettings.method
const metadata: PublicApiOperationMetadata = publicApiOperations.getPublicSettings
void [operationId, method, metadata]

// @ts-expect-error -- arbitrary Theme capability names are not Public API operation IDs.
const unknownOperation: PublicApiOperationId = "searchProducts"
void unknownOperation
