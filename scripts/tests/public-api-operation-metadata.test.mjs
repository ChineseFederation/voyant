import assert from "node:assert/strict"
import test from "node:test"

import { derivePublicApiOperationMetadata } from "../lib/public-api-operation-metadata.mjs"

const operation = (operationId) => ({ operationId, responses: { 200: { description: "ok" } } })

test("derives stable operation identity and method from OpenAPI and posture from the graph", () => {
  const document = {
    paths: {
      "/v1/public/settings": { get: operation("getPublicSettings") },
      "/v1/public/leads": { post: operation("postPublicLeads") },
    },
  }
  const bundles = [
    {
      surface: "public",
      mount: "/v1/public",
      publishable: ["settings"],
      guardedIntake: ["leads"],
    },
  ]

  assert.deepEqual(derivePublicApiOperationMetadata(document, bundles), [
    {
      id: "getPublicSettings",
      keyKind: "publishable",
      method: "GET",
      path: "/v1/public/settings",
    },
    {
      id: "postPublicLeads",
      keyKind: "secret",
      method: "POST",
      path: "/v1/public/leads",
    },
  ])
})

test("derives the runtime-stamped ID when the source operation does not author one", () => {
  assert.deepEqual(
    derivePublicApiOperationMetadata(
      {
        paths: {
          "/v1/public/catalog/booking-sessions/{session-id}": {
            post: operation(undefined),
          },
        },
      },
      [],
    ),
    [
      {
        id: "postPublicCatalogBookingSessionsBySessionId",
        keyKind: "secret",
        method: "POST",
        path: "/v1/public/catalog/booking-sessions/{session-id}",
      },
    ],
  )
})

test("a derived ID yields to an authored ID regardless of document order", () => {
  const metadata = derivePublicApiOperationMetadata(
    {
      paths: {
        "/v1/public/products": { get: operation(undefined) },
        "/v1/public/legacy-products": { get: operation("getPublicProducts") },
      },
    },
    [],
  )

  assert.deepEqual(
    metadata.map(({ id }) => id),
    ["getPublicProducts", "getPublicProducts_2"],
  )
  assert.equal(metadata[0].path, "/v1/public/legacy-products")
  assert.equal(metadata[1].path, "/v1/public/products")
})

test("refuses duplicate operationIds even when their routes differ", () => {
  assert.throws(
    () =>
      derivePublicApiOperationMetadata(
        {
          paths: {
            "/v1/public/products": { get: operation("getPublicProducts") },
            "/v1/public/products/{id}": { get: operation("getPublicProducts") },
          },
        },
        [],
      ),
    /duplicate Public API operationId "getPublicProducts".*GET \/v1\/public\/products.*GET \/v1\/public\/products\/\{id\}/,
  )
})
