/**
 * Legal admin operations: contracts (CRUD + issue/send/void) and policies
 * (CRUD + cancellation evaluation).
 *
 * Input schemas derive from `@voyant-travel/legal-contracts` so the SDK can't drift
 * from the routes. Output schemas stay loose client-facing projections
 * (ADR-0003) — unknown server fields are stripped, not rejected.
 */

import {
  bookingContractReviewApprovalSchema,
  contractListQuerySchema,
  insertContractSchema,
  sendContractInputSchema,
  updateContractSchema,
} from "@voyant-travel/legal-contracts/contracts/validation"
import {
  evaluateCancellationInputSchema,
  insertPolicySchema,
  policyListQuerySchema,
  updatePolicySchema,
} from "@voyant-travel/legal-contracts/policies/validation"
import { z } from "zod"

import { defineOperation } from "./core/operation.js"
import { paginated } from "./core/pagination.js"

export const contractSummarySchema = z.object({
  id: z.string(),
  status: z.string().nullable().optional(),
  contractNumber: z.string().nullable().optional(),
  templateId: z.string().nullable().optional(),
  personId: z.string().nullable().optional(),
  organizationId: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type ContractSummary = z.infer<typeof contractSummarySchema>

/**
 * Client-facing projection of the booking-contract review (ADR-0003: loose, so
 * unknown server fields are stripped rather than rejected). The two fields a
 * caller must round-trip into `issue`/`send` are the reason it exists.
 */
export const bookingContractReviewSummarySchema = z.object({
  revision: z.number().int(),
  contentFingerprint: z.string(),
  effectiveStatus: z.string().nullable().optional(),
  previousRevisionId: z.string().nullable().optional(),
  contract: z
    .object({
      id: z.string(),
      contractNumber: z.string().nullable().optional(),
      status: z.string().nullable().optional(),
      renderedBody: z.string().nullable().optional(),
      renderedBodyFormat: z.string().nullable().optional(),
    })
    .optional(),
})
export type BookingContractReviewSummary = z.infer<typeof bookingContractReviewSummarySchema>

export const policySummarySchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  kind: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type PolicySummary = z.infer<typeof policySummarySchema>

// List inputs derive from the canonical route query schemas so the SDK
// advertises exactly the filters the routes accept — not a hand-written subset
// that the server would silently strip (Codex P2). `policyListQuerySchema`
// notably has no `status` filter (it offers `kind`/`language`/`search`).
export const contractsListInputSchema = contractListQuerySchema
export const policiesListInputSchema = policyListQuerySchema

const contractsList = defineOperation({
  id: "legal.contracts.list",
  method: "GET",
  path: () => "/v1/admin/legal/contracts",
  pathTemplate: "/v1/admin/legal/contracts",
  input: contractsListInputSchema,
  output: paginated(contractSummarySchema),
  classification: "read",
  scopes: ["legal:read"],
  envelope: "raw",
  summary: "List legal contracts with filters and offset pagination.",
})

const contractsGet = defineOperation({
  id: "legal.contracts.get",
  method: "GET",
  path: (p: { id: string }) => `/v1/admin/legal/contracts/${p.id}`,
  pathTemplate: "/v1/admin/legal/contracts/:id",
  input: z.object({}),
  output: contractSummarySchema,
  classification: "read",
  scopes: ["legal:read"],
  summary: "Get a single contract by id.",
})

const contractsCreate = defineOperation({
  id: "legal.contracts.create",
  method: "POST",
  path: () => "/v1/admin/legal/contracts",
  pathTemplate: "/v1/admin/legal/contracts",
  input: insertContractSchema,
  output: contractSummarySchema,
  classification: "routine_write",
  scopes: ["legal:write"],
  idempotent: true,
  summary: "Create a contract.",
})

const contractsUpdate = defineOperation({
  id: "legal.contracts.update",
  method: "PATCH",
  path: (p: { id: string }) => `/v1/admin/legal/contracts/${p.id}`,
  pathTemplate: "/v1/admin/legal/contracts/:id",
  input: updateContractSchema,
  output: contractSummarySchema,
  classification: "routine_write",
  scopes: ["legal:write"],
  summary: "Update a contract.",
})

// A managed booking-contract revision only issues against the revision and
// content fingerprint the caller reviewed, so the input derives from the route
// schema rather than staying `z.object({})` — a client that cannot carry the
// approval reaches `approval_required` on every booking contract (voyant#4706).
// Both fields are optional: an ordinary contract still issues with no body.
const contractsIssue = defineOperation({
  id: "legal.contracts.issue",
  method: "POST",
  path: (p: { id: string }) => `/v1/admin/legal/contracts/${p.id}/issue`,
  pathTemplate: "/v1/admin/legal/contracts/:id/issue",
  input: bookingContractReviewApprovalSchema,
  output: contractSummarySchema,
  classification: "routine_write",
  scopes: ["legal:write"],
  idempotent: true,
  summary: "Issue a draft contract (assigns its number, locks the body).",
})

const contractsSend = defineOperation({
  id: "legal.contracts.send",
  method: "POST",
  path: (p: { id: string }) => `/v1/admin/legal/contracts/${p.id}/send`,
  pathTemplate: "/v1/admin/legal/contracts/:id/send",
  input: sendContractInputSchema,
  output: contractSummarySchema,
  classification: "routine_write",
  scopes: ["legal:write"],
  idempotent: true,
  summary: "Send an issued contract to its recipient.",
})

/**
 * The un-redacted booking-contract revision, and the `revision` +
 * `contentFingerprint` that `issue` and `send` are approved against. Managed
 * booking revisions only; anything else 404s. Needs `bookings-pii:read` on top
 * of `legal:read`, because the payload carries the customer's own contract.
 */
const contractsBookingReview = defineOperation({
  id: "legal.contracts.bookingReview",
  method: "GET",
  path: (p: { id: string }) => `/v1/admin/legal/contracts/${p.id}/booking-review`,
  pathTemplate: "/v1/admin/legal/contracts/:id/booking-review",
  input: z.object({}),
  output: bookingContractReviewSummarySchema,
  classification: "read",
  scopes: ["legal:read", "bookings-pii:read"],
  summary: "Read the reviewed booking-contract revision an issue/send approves.",
})

const contractsVoid = defineOperation({
  id: "legal.contracts.void",
  method: "POST",
  path: (p: { id: string }) => `/v1/admin/legal/contracts/${p.id}/void`,
  pathTemplate: "/v1/admin/legal/contracts/:id/void",
  input: z.object({}),
  output: contractSummarySchema,
  classification: "destructive",
  scopes: ["legal:write"],
  idempotent: true,
  summary: "Void a contract (irreversible).",
})

const policiesList = defineOperation({
  id: "legal.policies.list",
  method: "GET",
  path: () => "/v1/admin/legal/policies",
  pathTemplate: "/v1/admin/legal/policies",
  input: policiesListInputSchema,
  output: paginated(policySummarySchema),
  classification: "read",
  scopes: ["legal:read"],
  envelope: "raw",
  summary: "List legal policies with filters and offset pagination.",
})

const policiesGet = defineOperation({
  id: "legal.policies.get",
  method: "GET",
  path: (p: { id: string }) => `/v1/admin/legal/policies/${p.id}`,
  pathTemplate: "/v1/admin/legal/policies/:id",
  input: z.object({}),
  output: policySummarySchema,
  classification: "read",
  scopes: ["legal:read"],
  summary: "Get a single policy by id.",
})

const policiesCreate = defineOperation({
  id: "legal.policies.create",
  method: "POST",
  path: () => "/v1/admin/legal/policies",
  pathTemplate: "/v1/admin/legal/policies",
  input: insertPolicySchema,
  output: policySummarySchema,
  classification: "routine_write",
  scopes: ["legal:write"],
  idempotent: true,
  summary: "Create a policy.",
})

const policiesUpdate = defineOperation({
  id: "legal.policies.update",
  method: "PATCH",
  path: (p: { id: string }) => `/v1/admin/legal/policies/${p.id}`,
  pathTemplate: "/v1/admin/legal/policies/:id",
  input: updatePolicySchema,
  output: policySummarySchema,
  classification: "routine_write",
  scopes: ["legal:write"],
  summary: "Update a policy.",
})

const policiesEvaluate = defineOperation({
  id: "legal.policies.evaluate",
  method: "POST",
  path: (p: { id: string }) => `/v1/admin/legal/policies/${p.id}/evaluate`,
  pathTemplate: "/v1/admin/legal/policies/:id/evaluate",
  input: evaluateCancellationInputSchema,
  // Computation result — no fixed shape across policy kinds; kept loose.
  output: z.object({}).loose(),
  // Read-like, but POST — so an API-key caller needs the `write` action scope
  // (see `requireActor`'s method→action map).
  classification: "read",
  scopes: ["legal:write"],
  summary: "Evaluate a cancellation against a policy and return the outcome.",
})

export const legalOperations = {
  contracts: {
    list: contractsList,
    get: contractsGet,
    create: contractsCreate,
    update: contractsUpdate,
    issue: contractsIssue,
    send: contractsSend,
    bookingReview: contractsBookingReview,
    void: contractsVoid,
  },
  policies: {
    list: policiesList,
    get: policiesGet,
    create: policiesCreate,
    update: policiesUpdate,
    evaluate: policiesEvaluate,
  },
} as const
