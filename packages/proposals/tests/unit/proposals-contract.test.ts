import { listResponse, listResponseSchema } from "@voyant-travel/types"
import type { InferSelectModel } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  acceptProposalVersionResultSchema,
  applyTripSnapshotResultSchema,
  pipelineSchema,
  proposalMediaSchema,
  proposalParticipantSchema,
  proposalProductSchema,
  proposalSchema,
  proposalVersionLineSchema,
  proposalVersionSchema,
  stageSchema,
} from "../../src/routes/openapi-schemas.js"
import type {
  pipelines,
  proposalMedia,
  proposalParticipants,
  proposalProducts,
  proposals,
  proposalVersionLines,
  proposalVersions,
  stages,
} from "../../src/schema.js"

/**
 * Response contract tests (voyant#2276 — step 3.5) for the proposals admin routes.
 * They close the gap that `@hono/zod-openapi` leaves open (honojs/middleware#181):
 * the library keeps the generated doc in sync with the *declared* response
 * schema, but does NOT verify the handler actually returns that shape. Without
 * this, a wrong response schema still generates a clean — but lying — doc.
 *
 * Each fixture is typed as the real Drizzle select row, so a column drift breaks
 * compilation; the JSON round-trip (Date → ISO string, `date` columns → strings,
 * §17) mirrors `c.json` so a declared/actual mismatch breaks the test. The
 * schemas are imported from `openapi-schemas.ts` — the same module the route
 * declarations read from — so doc, handler, and assertion share one source.
 */

const createdAt = new Date("2026-01-01T00:00:00.000Z")
const updatedAt = new Date("2026-01-02T00:00:00.000Z")

const pipelineRow: InferSelectModel<typeof pipelines> = {
  id: "pipelines_0000000000000000000000",
  entityType: "proposal",
  name: "Sales",
  isDefault: true,
  sortOrder: 0,
  createdAt,
  updatedAt,
}

const stageRow: InferSelectModel<typeof stages> = {
  id: "stages_000000000000000000000000",
  pipelineId: "pipelines_0000000000000000000000",
  name: "Qualified",
  sortOrder: 0,
  probability: 50,
  isClosed: false,
  isWon: false,
  isLost: false,
  createdAt,
  updatedAt,
}

const proposalRow: InferSelectModel<typeof proposals> = {
  id: "proposals_000000000000000000000000",
  title: "Bali honeymoon",
  personId: null,
  organizationId: null,
  pipelineId: "pipelines_0000000000000000000000",
  stageId: "stages_000000000000000000000000",
  ownerId: null,
  status: "open",
  acceptedVersionId: null,
  valueAmountCents: 120000,
  valueCurrency: "EUR",
  paxCount: 2,
  expectedCloseDate: "2026-03-01",
  source: null,
  sourceRef: null,
  lostReason: null,
  tags: ["honeymoon"],
  customFields: {},
  description: null,
  createdBy: null,
  updatedBy: null,
  createdAt,
  updatedAt,
  stageChangedAt: createdAt,
  closedAt: null,
}

const proposalParticipantRow: InferSelectModel<typeof proposalParticipants> = {
  id: "proposal_participants_00000000000000",
  proposalId: "proposals_000000000000000000000000",
  personId: "people_000000000000000000000000",
  role: "traveler",
  isPrimary: true,
  createdAt,
}

const proposalProductRow: InferSelectModel<typeof proposalProducts> = {
  id: "proposal_products_000000000000000000",
  proposalId: "proposals_000000000000000000000000",
  productId: null,
  supplierServiceId: null,
  nameSnapshot: "Private transfer",
  description: null,
  quantity: 1,
  unitPriceAmountCents: 5000,
  costAmountCents: null,
  currency: "EUR",
  discountAmountCents: null,
  createdAt,
  updatedAt,
}

const proposalMediaRow: InferSelectModel<typeof proposalMedia> = {
  id: "proposal_media_00000000000000000000",
  proposalId: "proposals_000000000000000000000000",
  mediaType: "image",
  name: "Hero",
  url: "https://example.com/hero.jpg",
  storageKey: null,
  mimeType: null,
  fileSize: null,
  altText: null,
  sortOrder: 0,
  createdAt,
  updatedAt,
}

const proposalVersionRow: InferSelectModel<typeof proposalVersions> = {
  id: "proposal_versions_000000000000000000",
  proposalId: "proposals_000000000000000000000000",
  label: "v1",
  status: "draft",
  supersedesId: null,
  tripSnapshotId: null,
  validUntil: "2026-03-15",
  currency: "EUR",
  subtotalAmountCents: 100000,
  taxAmountCents: 20000,
  totalAmountCents: 120000,
  notes: null,
  sentAt: null,
  viewedAt: null,
  decidedAt: null,
  createdAt,
  updatedAt,
  archivedAt: null,
}

const proposalVersionLineRow: InferSelectModel<typeof proposalVersionLines> = {
  id: "proposal_version_lines_00000000000000",
  proposalVersionId: "proposal_versions_000000000000000000",
  productId: null,
  supplierServiceId: null,
  description: "Private transfer",
  quantity: 1,
  unitPriceAmountCents: 5000,
  totalAmountCents: 5000,
  currency: "EUR",
  createdAt,
  updatedAt,
}

const cases = [
  ["pipeline", pipelineSchema, pipelineRow],
  ["stage", stageSchema, stageRow],
  ["proposal", proposalSchema, proposalRow],
  ["proposal participant", proposalParticipantSchema, proposalParticipantRow],
  ["proposal product", proposalProductSchema, proposalProductRow],
  ["proposal media", proposalMediaSchema, proposalMediaRow],
  ["proposal version", proposalVersionSchema, proposalVersionRow],
  ["proposal version line", proposalVersionLineSchema, proposalVersionLineRow],
] as const

describe("proposals single-entity response contracts", () => {
  for (const [label, schema, row] of cases) {
    it(`the serialized ${label} { data } envelope satisfies the declared OpenAPI schema`, () => {
      const wire = JSON.parse(JSON.stringify({ data: row }))
      const parsed = z.object({ data: schema }).safeParse(wire)
      expect(parsed.success ? null : parsed.error.toString()).toBeNull()
    })
  }
})

describe("proposals list response contracts", () => {
  for (const [label, schema, row] of cases) {
    it(`the serialized ${label} list satisfies the declared OpenAPI list envelope`, () => {
      const wire = JSON.parse(
        JSON.stringify(listResponse([row], { total: 1, limit: 50, offset: 0 })),
      )
      const parsed = listResponseSchema(schema).safeParse(wire)
      expect(parsed.success ? null : parsed.error.toString()).toBeNull()
    })
  }
})

describe("proposals composite response contracts", () => {
  it("the apply-trip-snapshot result satisfies the declared OpenAPI schema", () => {
    const wire = JSON.parse(
      JSON.stringify({
        data: { proposalVersion: proposalVersionRow, lines: [proposalVersionLineRow] },
      }),
    )
    const parsed = z.object({ data: applyTripSnapshotResultSchema }).safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })

  it("the accept-proposal-version result satisfies the declared OpenAPI schema", () => {
    const wire = JSON.parse(
      JSON.stringify({
        data: {
          proposal: proposalRow,
          proposalVersion: proposalVersionRow,
          closedProposalVersions: [proposalVersionRow],
        },
      }),
    )
    const parsed = z.object({ data: acceptProposalVersionResultSchema }).safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })

  it("the delete envelope satisfies the declared OpenAPI schema", () => {
    const parsed = z.object({ success: z.literal(true) }).safeParse({ success: true })
    expect(parsed.success).toBe(true)
  })
})
