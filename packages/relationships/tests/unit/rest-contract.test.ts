import { listResponse, listResponseSchema } from "@voyant-travel/types"
import type { InferSelectModel } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  activityLinkSchema,
  activityParticipantSchema,
  activitySchema,
  customerSignalSchema,
  inquirySchema,
  personDocumentRevealSchema,
  personDocumentSchema,
  personRelationshipSchema,
  personTravelSnapshotSchema,
} from "../../src/routes/rest-openapi-schemas.js"
import type { personDocuments, personRelationships } from "../../src/schema-accounts.js"
import type {
  activities,
  activityLinks,
  activityParticipants,
} from "../../src/schema-activities.js"
import type { inquiries } from "../../src/schema-inquiries.js"
import type { customerSignals } from "../../src/schema-signals.js"

/**
 * Response contract tests (voyant#2276 — step 3.5, stage B) for the remaining
 * relationships admin routes (activities, custom-fields, customer-signals,
 * person-documents, person-relationships). They close the gap that
 * `@hono/zod-openapi` leaves open (honojs/middleware#181): the library keeps the
 * generated doc in sync with the *declared* response schema, but does NOT verify
 * the handler actually returns that shape.
 *
 * Each fixture is typed as the real Drizzle select row so a column drift breaks
 * compilation; the JSON round-trip (Date → ISO string, §17) mirrors `c.json` so
 * a declared/actual mismatch breaks the test. Schemas are imported from
 * `rest-openapi-schemas.ts` — the same module the route declarations read from —
 * so doc, handler, and assertion share one source.
 */

const createdAt = new Date("2026-01-01T00:00:00.000Z")
const updatedAt = new Date("2026-01-02T00:00:00.000Z")

const activityRow: InferSelectModel<typeof activities> = {
  id: "activities_00000000000000000000",
  subject: "Call back about the Patagonia trip",
  type: "call",
  ownerId: null,
  status: "planned",
  dueAt: null,
  completedAt: null,
  location: null,
  description: null,
  customFields: {},
  createdAt,
  updatedAt,
}

const activityLinkRow: InferSelectModel<typeof activityLinks> = {
  id: "activity_links_0000000000000000000",
  activityId: "activities_00000000000000000000",
  entityType: "person",
  entityId: "people_000000000000000000000000",
  role: "primary",
  createdAt,
}

const activityParticipantRow: InferSelectModel<typeof activityParticipants> = {
  id: "activity_participants_000000000000",
  activityId: "activities_00000000000000000000",
  personId: "people_000000000000000000000000",
  isPrimary: true,
  createdAt,
}

const customerSignalRow: InferSelectModel<typeof customerSignals> = {
  id: "customer_signals_00000000000000000",
  personId: "people_000000000000000000000000",
  productId: null,
  optionUnitId: null,
  kind: "inquiry",
  source: "form",
  status: "new",
  priority: "normal",
  notes: null,
  tags: [],
  assignedToUserId: null,
  followUpAt: null,
  resolvedBookingId: null,
  sourceSubmissionId: null,
  metadata: null,
  createdAt,
  updatedAt,
}

const inquiryRow: InferSelectModel<typeof inquiries> = {
  id: "inq_01k00000000000000000000000",
  subject: "Anniversary trip",
  kind: "custom_trip",
  status: "new",
  closeOutcome: null,
  closeNote: null,
  duplicateOfInquiryId: null,
  priority: "normal",
  personId: null,
  organizationId: null,
  contactSnapshot: { email: "traveler@example.com" },
  ownerId: null,
  teamId: null,
  unassignedReason: null,
  nextActionAt: null,
  firstResponseDueAt: null,
  firstRespondedAt: null,
  travelBrief: { version: 1, destinations: [{ label: "Kyoto" }] },
  customerMessage: "We would like a custom itinerary.",
  internalSummary: null,
  source: "phone",
  sourceRef: null,
  sourceUrl: null,
  locale: "en",
  consentSnapshot: null,
  tags: [],
  customFields: {},
  lastActivityAt: null,
  qualifiedAt: null,
  convertedAt: null,
  closedAt: null,
  createdAt,
  updatedAt,
}
const inquiryResponseRow = { ...inquiryRow, targets: [] }

const personDocumentRow: InferSelectModel<typeof personDocuments> = {
  id: "person_documents_00000000000000000",
  personId: "people_000000000000000000000000",
  type: "passport",
  numberEncrypted: null,
  issuingAuthority: null,
  issuingCountry: null,
  issueDate: null,
  expiryDate: "2030-01-01",
  attachmentId: null,
  isPrimary: true,
  notes: null,
  metadata: null,
  createdAt,
  updatedAt,
}

const personRelationshipRow: InferSelectModel<typeof personRelationships> = {
  id: "person_relationships_0000000000000",
  fromPersonId: "people_000000000000000000000000",
  toPersonId: "people_111111111111111111111111",
  kind: "spouse",
  inverseKind: "spouse",
  startDate: null,
  endDate: null,
  isPrimary: false,
  notes: null,
  metadata: null,
  createdAt,
  updatedAt,
}

const travelSnapshot: z.infer<typeof personTravelSnapshotSchema> = {
  dateOfBirth: "1990-01-01",
  dietaryRequirements: null,
  accessibilityNeeds: null,
  documentType: "passport",
  documentNumber: null,
  documentExpiry: "2030-01-01",
  documentIssuingCountry: null,
  documentIssuingAuthority: null,
  documentPersonDocumentId: "person_documents_00000000000000000",
}

const reveal: z.infer<typeof personDocumentRevealSchema> = {
  documentId: "person_documents_00000000000000000",
  number: "X1234567",
}

const singleCases = [
  ["activity", activitySchema, activityRow],
  ["activity link", activityLinkSchema, activityLinkRow],
  ["activity participant", activityParticipantSchema, activityParticipantRow],
  ["customer signal", customerSignalSchema, customerSignalRow],
  ["inquiry", inquirySchema, inquiryResponseRow],
  ["person document", personDocumentSchema, personDocumentRow],
  ["person relationship", personRelationshipSchema, personRelationshipRow],
  ["travel snapshot", personTravelSnapshotSchema, travelSnapshot],
  ["document reveal", personDocumentRevealSchema, reveal],
] as const

describe("relationships rest single-entity response contracts", () => {
  for (const [label, schema, row] of singleCases) {
    it(`the serialized ${label} { data } envelope satisfies the declared OpenAPI schema`, () => {
      const wire = JSON.parse(JSON.stringify({ data: row }))
      const parsed = z.object({ data: schema }).safeParse(wire)
      expect(parsed.success ? null : parsed.error.toString()).toBeNull()
    })
  }
})

describe("relationships rest list response contracts", () => {
  // Activities and customer signals are the offset-paginated list surfaces.
  const listCases = [
    ["activity", activitySchema, activityRow],
    ["customer signal", customerSignalSchema, customerSignalRow],
    ["inquiry", inquirySchema, inquiryResponseRow],
  ] as const

  for (const [label, schema, row] of listCases) {
    it(`the serialized ${label} list satisfies the declared OpenAPI list envelope`, () => {
      const wire = JSON.parse(
        JSON.stringify(listResponse([row], { total: 1, limit: 50, offset: 0 })),
      )
      const parsed = listResponseSchema(schema).safeParse(wire)
      expect(parsed.success ? null : parsed.error.toString()).toBeNull()
    })
  }
})
