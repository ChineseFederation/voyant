import { legalTargetKindSchema } from "@voyant-travel/legal-contracts/targets/validation"
import { listResponse, listResponseSchema } from "@voyant-travel/types"
import type { InferSelectModel } from "drizzle-orm"
import { Hono } from "hono"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { contractsPublicRoutes, createContractsAdminRoutes } from "../../../src/contracts/routes.js"
import type {
  contractAttachments,
  contractNumberSeries,
  contractSignatures,
  contracts,
  contractTemplates,
  contractTemplateVersions,
} from "../../../src/contracts/schema.js"
import { contractsService } from "../../../src/contracts/service.js"
import {
  contractBodyFormatSchema,
  contractNumberResetStrategySchema,
  contractScopeSchema,
  contractSignatureMethodSchema,
  contractStageHistoryEntrySchema,
  contractStatusSchema,
} from "../../../src/contracts/validation.js"

/**
 * Response contract tests (voyant#2114) for the legal contracts admin routes.
 * Each table-backed fixture is typed as the real Drizzle `$inferSelect` row so
 * column drift breaks compilation; the JSON round-trip (Date → ISO string)
 * mirrors `c.json` so a declared/actual mismatch breaks the test. The schemas
 * below mirror the response shapes declared in `src/contracts/routes.ts` (§17
 * dates → strings). The contract LIST left-joins `people` + the
 * `person_directory` view, so its row extends the base contract schema with the
 * four nullable joined columns.
 */

const isoTimestamp = z.string()
const jsonRecord = z.record(z.string(), z.unknown())

const contractTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  scope: contractScopeSchema,
  language: z.string(),
  description: z.string().nullable(),
  body: z.string(),
  variableSchema: jsonRecord.nullable(),
  currentVersionId: z.string().nullable(),
  channelId: z.string().nullable(),
  isDefault: z.boolean(),
  active: z.boolean(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const contractTemplateVersionSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  version: z.number().int(),
  body: z.string(),
  variableSchema: jsonRecord.nullable(),
  changelog: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: isoTimestamp,
})

const contractNumberSeriesSchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  separator: z.string(),
  padLength: z.number().int(),
  currentSequence: z.number().int(),
  resetStrategy: contractNumberResetStrategySchema,
  resetAt: isoTimestamp.nullable(),
  scope: contractScopeSchema,
  isDefault: z.boolean(),
  externalProvider: z.string().nullable(),
  externalConfigKey: z.string().nullable(),
  active: z.boolean(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const contractSchema = z.object({
  id: z.string(),
  contractNumber: z.string().nullable(),
  scope: contractScopeSchema,
  status: contractStatusSchema,
  stageHistory: z.array(contractStageHistoryEntrySchema),
  title: z.string(),
  templateVersionId: z.string().nullable(),
  seriesId: z.string().nullable(),
  personId: z.string().nullable(),
  organizationId: z.string().nullable(),
  supplierId: z.string().nullable(),
  channelId: z.string().nullable(),
  bookingId: z.string().nullable(),
  targetKind: legalTargetKindSchema.nullable(),
  targetId: z.string().nullable(),
  targetProvider: z.string().nullable(),
  targetSourceRef: z.string().nullable(),
  legacyTransactionOfferId: z.string().nullable(),
  legacyTransactionOrderId: z.string().nullable(),
  issuedAt: isoTimestamp.nullable(),
  sentAt: isoTimestamp.nullable(),
  executedAt: isoTimestamp.nullable(),
  expiresAt: isoTimestamp.nullable(),
  voidedAt: isoTimestamp.nullable(),
  language: z.string(),
  renderedBodyFormat: contractBodyFormatSchema,
  renderedBody: z.string().nullable(),
  variables: jsonRecord.nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const contractListRowSchema = contractSchema.extend({
  personFirstName: z.string().nullable(),
  personLastName: z.string().nullable(),
  personEmail: z.string().nullable(),
  personPhone: z.string().nullable(),
})

const contractSignatureSchema = z.object({
  id: z.string(),
  contractId: z.string(),
  signerName: z.string(),
  signerEmail: z.string().nullable(),
  signerRole: z.string().nullable(),
  personId: z.string().nullable(),
  targetKind: legalTargetKindSchema.nullable(),
  targetId: z.string().nullable(),
  targetProvider: z.string().nullable(),
  targetSourceRef: z.string().nullable(),
  legacyTransactionOfferId: z.string().nullable(),
  legacyTransactionOrderId: z.string().nullable(),
  method: contractSignatureMethodSchema,
  provider: z.string().nullable(),
  externalReference: z.string().nullable(),
  signatureData: z.string().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  signedAt: isoTimestamp,
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
})

const contractAttachmentSchema = z.object({
  id: z.string(),
  contractId: z.string(),
  kind: z.string(),
  name: z.string(),
  mimeType: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  storageKey: z.string().nullable(),
  checksum: z.string().nullable(),
  targetKind: legalTargetKindSchema.nullable(),
  targetId: z.string().nullable(),
  targetProvider: z.string().nullable(),
  targetSourceRef: z.string().nullable(),
  legacyTransactionOfferId: z.string().nullable(),
  legacyTransactionOrderId: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
})

const createdAt = new Date("2026-01-01T00:00:00.000Z")
const updatedAt = new Date("2026-01-02T00:00:00.000Z")

const templateRow: InferSelectModel<typeof contractTemplates> = {
  id: "contract_templates_0000000000000000000",
  name: "Customer agreement",
  slug: "customer-agreement",
  scope: "customer",
  language: "en",
  description: "Standard customer agreement",
  body: "# Agreement",
  variableSchema: { traveler: "string" },
  currentVersionId: "contract_template_versions_000000000000",
  channelId: null,
  isDefault: true,
  active: true,
  createdAt,
  updatedAt,
}

const templateVersionRow: InferSelectModel<typeof contractTemplateVersions> = {
  id: "contract_template_versions_000000000000",
  templateId: "contract_templates_0000000000000000000",
  version: 1,
  body: "# Agreement v1",
  variableSchema: null,
  changelog: "Initial version",
  createdBy: "users_00000000000000000000000000000",
  createdAt,
}

const numberSeriesRow: InferSelectModel<typeof contractNumberSeries> = {
  id: "contract_number_series_00000000000000000",
  name: "Customer contracts",
  prefix: "CTR",
  separator: "-",
  padLength: 4,
  currentSequence: 12,
  resetStrategy: "annual",
  resetAt: createdAt,
  scope: "customer",
  isDefault: true,
  externalProvider: null,
  externalConfigKey: null,
  active: true,
  createdAt,
  updatedAt,
}

const contractRow: InferSelectModel<typeof contracts> = {
  id: "contracts_000000000000000000000000000",
  contractNumber: "CTR-0012",
  scope: "customer",
  status: "issued",
  stageHistory: [
    {
      stage: "issued",
      previousStage: "draft",
      transition: "issued",
      enteredAt: createdAt.toISOString(),
      actorId: "users_00000000000000000000000000000",
    },
  ],
  title: "Tour package agreement",
  templateVersionId: "contract_template_versions_000000000000",
  seriesId: "contract_number_series_00000000000000000",
  personId: "people_00000000000000000000000000000",
  organizationId: null,
  supplierId: null,
  channelId: null,
  bookingId: "bookings_000000000000000000000000000",
  targetKind: "booking",
  targetId: "bookings_000000000000000000000000000",
  targetProvider: null,
  targetSourceRef: null,
  legacyTransactionOfferId: null,
  legacyTransactionOrderId: null,
  issuedAt: createdAt,
  sentAt: null,
  executedAt: null,
  expiresAt: null,
  voidedAt: null,
  language: "en",
  renderedBodyFormat: "html",
  renderedBody: "<h1>Agreement</h1>",
  variables: { traveler: "Ada" },
  metadata: { source: "ui" },
  createdAt,
  updatedAt,
}

// The contract LIST query is `contracts.$inferSelect` plus four nullable joined
// columns (`people` first/last name + the `person_directory` email/phone view).
const contractListRow: InferSelectModel<typeof contracts> & {
  personFirstName: string | null
  personLastName: string | null
  personEmail: string | null
  personPhone: string | null
} = {
  ...contractRow,
  personFirstName: "Ada",
  personLastName: "Lovelace",
  personEmail: "ada@example.com",
  personPhone: null,
}

const managedBookingWorkflowMetadata = {
  bookingContractWorkflow: {
    revision: 2,
    previousRevisionId: "contracts_previous",
    reviewOnly: true,
    reviewSnapshot: {
      booking: { customerName: "Ada Lovelace", customerEmail: "ada@example.com" },
    },
    delivery: { recipient: "ada@example.com", channel: "email" },
  },
}

const signatureRow: InferSelectModel<typeof contractSignatures> = {
  id: "contract_signatures_0000000000000000000",
  contractId: "contracts_000000000000000000000000000",
  signerName: "Ada Lovelace",
  signerEmail: "ada@example.com",
  signerRole: "Traveler",
  personId: "people_00000000000000000000000000000",
  targetKind: null,
  targetId: null,
  targetProvider: null,
  targetSourceRef: null,
  legacyTransactionOfferId: null,
  legacyTransactionOrderId: null,
  method: "electronic",
  provider: "docusign",
  externalReference: "envelope-123",
  signatureData: null,
  ipAddress: "203.0.113.4",
  userAgent: "Mozilla/5.0",
  signedAt: createdAt,
  metadata: null,
  createdAt,
}

const attachmentRow: InferSelectModel<typeof contractAttachments> = {
  id: "contract_attachments_000000000000000000",
  contractId: "contracts_000000000000000000000000000",
  kind: "document",
  name: "agreement.pdf",
  mimeType: "application/pdf",
  fileSize: 20480,
  storageKey: "contracts/ctr/attachments/agreement.pdf",
  checksum: "sha256:abc",
  targetKind: null,
  targetId: null,
  targetProvider: null,
  targetSourceRef: null,
  legacyTransactionOfferId: null,
  legacyTransactionOrderId: null,
  metadata: { originalName: "agreement.pdf" },
  createdAt,
}

const listCases = [
  ["contract template", contractTemplateSchema, templateRow],
  ["contract (with joined person columns)", contractListRowSchema, contractListRow],
] as const

const singleCases = [
  ["contract template", contractTemplateSchema, templateRow],
  ["contract template version", contractTemplateVersionSchema, templateVersionRow],
  ["contract number series", contractNumberSeriesSchema, numberSeriesRow],
  ["contract", contractSchema, contractRow],
  ["contract signature", contractSignatureSchema, signatureRow],
  ["contract attachment", contractAttachmentSchema, attachmentRow],
] as const

const arrayEnvelopeCases = [
  ["template versions", contractTemplateVersionSchema, templateVersionRow],
  ["number series", contractNumberSeriesSchema, numberSeriesRow],
  ["contract signatures", contractSignatureSchema, signatureRow],
  ["contract attachments", contractAttachmentSchema, attachmentRow],
] as const

describe("legal contracts list response contracts", () => {
  for (const [label, schema, row] of listCases) {
    it(`the serialized ${label} list satisfies the declared OpenAPI schema`, () => {
      const wire = JSON.parse(
        JSON.stringify(listResponse([row], { total: 1, limit: 20, offset: 0 })),
      )
      const parsed = listResponseSchema(schema).safeParse(wire)
      expect(parsed.success ? null : parsed.error.toString()).toBeNull()
    })
  }
})

describe("legal contracts single-entity response contracts", () => {
  for (const [label, schema, row] of singleCases) {
    it(`the serialized ${label} { data } envelope satisfies the declared OpenAPI schema`, () => {
      const wire = JSON.parse(JSON.stringify({ data: row }))
      const parsed = z.object({ data: schema }).safeParse(wire)
      expect(parsed.success ? null : parsed.error.toString()).toBeNull()
    })
  }
})

describe("legal contracts array { data } envelope response contracts", () => {
  for (const [label, schema, row] of arrayEnvelopeCases) {
    it(`the serialized ${label} { data } array envelope satisfies the declared OpenAPI schema`, () => {
      const wire = JSON.parse(JSON.stringify({ data: [row] }))
      const parsed = z.object({ data: z.array(schema) }).safeParse(wire)
      expect(parsed.success ? null : parsed.error.toString()).toBeNull()
    })
  }
})

describe("legal contracts managed booking generic redaction", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("redacts managed booking rendered bodies from generic admin list rows", async () => {
    vi.spyOn(contractsService, "listContracts").mockResolvedValue({
      data: [
        {
          ...contractListRow,
          renderedBody: "<p>Ada Lovelace ada@example.com</p>",
          variables: { customer: { name: "Ada Lovelace", email: "ada@example.com" } },
          metadata: managedBookingWorkflowMetadata,
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    })
    const app = new Hono().route("/", createContractsAdminRoutes())

    const res = await app.request("/")

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Array<Record<string, unknown>> }
    expect(body.data[0]).toMatchObject({
      renderedBody: null,
      variables: null,
      metadata: {
        bookingContractWorkflow: {
          revision: 2,
          previousRevisionId: "contracts_previous",
          reviewOnly: true,
          piiRedacted: true,
        },
      },
    })
  })

  it("redacts managed booking rendered bodies from generic admin detail rows", async () => {
    vi.spyOn(contractsService, "getContractById").mockResolvedValue({
      ...contractRow,
      renderedBody: "<p>Ada Lovelace ada@example.com</p>",
      variables: { customer: { name: "Ada Lovelace", email: "ada@example.com" } },
      metadata: managedBookingWorkflowMetadata,
    })
    const app = new Hono().route("/", createContractsAdminRoutes())

    const res = await app.request(`/${contractRow.id}`)

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      renderedBody: null,
      variables: null,
      metadata: {
        bookingContractWorkflow: {
          revision: 2,
          previousRevisionId: "contracts_previous",
          reviewOnly: true,
          piiRedacted: true,
        },
      },
    })
  })

  it("blocks managed booking contracts on the generic admin render surface", async () => {
    vi.spyOn(contractsService, "getContractById").mockResolvedValue({
      ...contractRow,
      metadata: managedBookingWorkflowMetadata,
    })
    const app = new Hono().route("/", createContractsAdminRoutes())

    const res = await app.request(`/${contractRow.id}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variables: { customer: { name: "Ada Lovelace", email: "ada@example.com" } },
        body: "<p>{{ customer.name }} {{ customer.email }}</p>",
      }),
    })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Contract not found" })
  })

  it("keeps generic admin render behavior for non-managed contracts", async () => {
    vi.spyOn(contractsService, "getContractById").mockResolvedValue(contractRow)
    const app = new Hono().route("/", createContractsAdminRoutes())

    const res = await app.request(`/${contractRow.id}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variables: { customer: { name: "Ada Lovelace" } },
        body: "<p>{{ customer.name }}</p>",
      }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { rendered: "<p>Ada Lovelace</p>" } })
  })
})

describe("legal contracts public token guard", () => {
  const app = new Hono().route("/", contractsPublicRoutes)

  it("rejects public contract read by id alone before database lookup", async () => {
    const res = await app.request("/contracts_000000000000000000000000000")

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Contract not found" })
  })

  it("rejects public contract signing by id alone before database lookup", async () => {
    const res = await app.request("/contracts_000000000000000000000000000/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signerName: "Ada Lovelace",
        method: "manual",
      }),
    })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Contract not found" })
  })
})
