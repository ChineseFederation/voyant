/**
 * Travel Composer ("trips") routes — the dynamic-packaging envelope/component/
 * requirement lifecycle. The `createTripsRoutes` factory is mounted on BOTH the
 * admin (`/v1/admin/...`) and public (`/v1/public/...`) surfaces by
 * `createTripsApiModule`; admin-only operations return 403 on the public
 * surface but are still documented on both (intentional — the same factory
 * produces both specs).
 *
 * Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114 /
 * voyant#2208). Request schemas reuse the existing `validation.ts` schemas the
 * handlers already parse; response schemas are authored from the service return
 * types (§17: `Date`/timestamp columns serialize to strings over the wire).
 * Travel Composer results are deeply composed — the top-level envelope /
 * component / requirement / snapshot row shapes are modeled faithfully, while
 * deeply-nested composed/opaque sub-objects (pricing/candidate payloads,
 * frozen snapshot blobs) are documented pass-throughs typed as `z.unknown()`.
 *
 * The 20 legs are split across per-resource `OpenAPIHono` sub-chains
 * (envelopes / snapshots / components / requirements / lifecycle / health),
 * each composed onto the parent `OpenAPIHono` via `.route("/", subApp)`.
 * Mounting an `OpenAPIHono` child with `.route("/")` DOES propagate the child's
 * `.openapi()` registry definitions into the parent's generated spec (proven by
 * `commerce/src/pricing/routes-rules.ts` and `distribution/src/suppliers/routes.ts`),
 * so all trips operations still reach the composed operator OpenAPI document and
 * the emitted paths are unchanged. The split keeps per-chain type-inference cost
 * bounded — one flat multi-leg `.openapi()` chain has O(n²) inference cost and
 * OOMed CI's typecheck at its 8 GB heap. See voyant#2114 / voyant#2208.
 *
 * agent-quality: file-size exception — intentional: 20 Travel Composer legs
 * (envelope/snapshot/component/requirement CRUD + checkout/cancel lifecycle)
 * authored as `createRoute` objects co-located with their
 * handlers, grouped into per-resource `OpenAPIHono` sub-chains composed onto a
 * single parent. See voyant#2114 / voyant#2208.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { openApiValidationHook } from "@voyant-travel/hono"
import { listResponseSchema } from "@voyant-travel/types"
import type { Context } from "hono"
import {
  type CancelTripComponentsDeps,
  type StartCheckoutDeps,
  TripsInvariantError,
  tripsService,
} from "./service.js"
import { tripRequirementSourcingOperationResultSchema } from "./tool-output-schemas.js"
import {
  addRequirementSchema,
  cancelTripComponentsSchema,
  createTripComponentBodySchema,
  createTripEnvelopeSchema,
  createTripSnapshotSchema,
  listTripsQuerySchema,
  previewTripCancellationSchema,
  reorderTripComponentsSchema,
  selectCandidateSchema,
  startTripCheckoutSchema,
  tripComponentKindSchema,
  tripComponentStatusSchema,
  tripEnvelopeStatusSchema,
  updateTripComponentRefsSchema,
  updateTripComponentSchema,
  updateTripEnvelopeSchema,
} from "./validation.js"

type Env = {
  Bindings: Record<string, unknown>
  Variables: {
    db: AnyDrizzleDb
    organizationId?: string | null
  }
}

export interface TripsRoutesOptions {
  surface?: "admin" | "public"
  startCheckoutDeps?: TripsRouteDeps<StartCheckoutDeps>
  cancelTripComponentsDeps?: TripsRouteDeps<CancelTripComponentsDeps>
}

export type TripsRouteDeps<T> = T | ((c: Context<Env>) => T | Promise<T | undefined> | undefined)
export type TripsRoutesOptionsProvider = () => TripsRoutesOptions | Promise<TripsRoutesOptions>
export type TripsRoutesOptionsInput = TripsRoutesOptions | TripsRoutesOptionsProvider
type ResolveTripsRoutesOptions = () => Promise<TripsRoutesOptions>

const createTripSnapshotBodySchema = createTripSnapshotSchema.omit({ envelopeId: true })
const startCheckoutBodySchema = startTripCheckoutSchema.omit({ envelopeId: true })
const previewCancellationBodySchema = previewTripCancellationSchema.omit({ envelopeId: true })
const cancelTripComponentsBodySchema = cancelTripComponentsSchema.omit({ envelopeId: true })
const addRequirementBodySchema = addRequirementSchema.omit({ envelopeId: true })
const reorderComponentsBodySchema = reorderTripComponentsSchema.omit({ envelopeId: true })
const selectCandidateBodySchema = selectCandidateSchema.omit({ requirementId: true })

// ── Shared response fragments ────────────────────────────────────────────

const errorResponseSchema = z.object({ error: z.string() }).catchall(z.unknown())

/** §17: timestamp columns serialize to ISO strings over the wire. */
const isoTimestamp = z.string()
const jsonObject = z.record(z.string(), z.unknown())

/** Authored from `TripEnvelope` (`tripEnvelopes.$inferSelect`). */
const tripEnvelopeRowSchema = z.object({
  id: z.string(),
  status: tripEnvelopeStatusSchema,
  title: z.string().nullable(),
  description: z.string().nullable(),
  travelerParty: jsonObject,
  constraints: jsonObject,
  aggregateCurrency: z.string().nullable(),
  aggregateSubtotalAmountCents: z.number().int().nullable(),
  aggregateTaxAmountCents: z.number().int().nullable(),
  aggregateTotalAmountCents: z.number().int().nullable(),
  // Deeply-composed pricing snapshot — documented pass-through.
  aggregatePricingSnapshot: z.unknown().nullable(),
  currentPriceExpiresAt: isoTimestamp.nullable(),
  bookingGroupId: z.string().nullable(),
  orderId: z.string().nullable(),
  paymentSessionId: z.string().nullable(),
  reserveIdempotencyKey: z.string().nullable(),
  reserveStartedAt: isoTimestamp.nullable(),
  reservedAt: isoTimestamp.nullable(),
  checkoutIdempotencyKey: z.string().nullable(),
  checkoutStartedAt: isoTimestamp.nullable(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

/** Authored from `TripComponent` (`tripComponents.$inferSelect`). */
const tripComponentRowSchema = z.object({
  id: z.string(),
  envelopeId: z.string(),
  sequence: z.number().int(),
  kind: tripComponentKindSchema,
  status: tripComponentStatusSchema,
  title: z.string().nullable(),
  description: z.string().nullable(),
  entityModule: z.string().nullable(),
  entityId: z.string().nullable(),
  sourceKind: z.string().nullable(),
  sourceConnectionId: z.string().nullable(),
  sourceRef: z.string().nullable(),
  bookingDraftId: z.string().nullable(),
  catalogQuoteId: z.string().nullable(),
  bookingId: z.string().nullable(),
  bookingGroupId: z.string().nullable(),
  orderId: z.string().nullable(),
  paymentSessionId: z.string().nullable(),
  providerRef: z.string().nullable(),
  supplierRef: z.string().nullable(),
  componentCurrency: z.string().nullable(),
  componentSubtotalAmountCents: z.number().int().nullable(),
  componentTaxAmountCents: z.number().int().nullable(),
  componentTotalAmountCents: z.number().int().nullable(),
  // Composed pricing / tax / cancellation snapshots — documented pass-throughs.
  pricingSnapshot: z.unknown().nullable(),
  taxLines: z.array(z.unknown()).nullable(),
  cancellationSnapshot: z.unknown().nullable(),
  holdToken: z.string().nullable(),
  holdExpiresAt: isoTimestamp.nullable(),
  priceExpiresAt: isoTimestamp.nullable(),
  warningCodes: z.array(z.string()),
  metadata: jsonObject,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

/** Authored from `TripRequirement` (`tripRequirements.$inferSelect`). */
const tripRequirementRowSchema = z.object({
  id: z.string(),
  envelopeId: z.string(),
  sequence: z.number().int(),
  status: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  vertical: z.string(),
  criteria: jsonObject,
  criteriaVersion: z.string(),
  required: z.boolean(),
  selectedCandidateId: z.string().nullable(),
  resolvedComponentId: z.string().nullable(),
  lastSourcedAt: isoTimestamp.nullable(),
  metadata: jsonObject,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

/** Authored from `TripCandidate` (`tripCandidates.$inferSelect`). */
const tripCandidateRowSchema = z.object({
  id: z.string(),
  requirementId: z.string(),
  envelopeId: z.string(),
  rank: z.number().int(),
  status: z.string(),
  candidateRef: z.string(),
  entityModule: z.string(),
  entityId: z.string(),
  sourceKind: z.string(),
  sourceConnectionId: z.string().nullable(),
  sourceModule: z.string().nullable(),
  selection: jsonObject,
  priceCurrency: z.string(),
  priceAmount: z.string(),
  expiresAt: isoTimestamp.nullable(),
  // Internal economics / replay payload — never serialized to public DTOs,
  // modeled as an opaque pass-through.
  providerData: z.unknown().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

/** Authored from `TripSnapshot` (`tripSnapshots.$inferSelect`). The frozen
 *  envelope/components blobs + proposal are deeply composed pass-throughs. */
const tripSnapshotRowSchema = z.object({
  id: z.string(),
  envelopeId: z.string(),
  sourceEnvelopeUpdatedAt: isoTimestamp,
  titleSnapshot: z.string().nullable(),
  descriptionSnapshot: z.string().nullable(),
  travelerPartySnapshot: jsonObject,
  constraintsSnapshot: jsonObject,
  currency: z.string(),
  subtotalAmountCents: z.number().int(),
  taxAmountCents: z.number().int(),
  totalAmountCents: z.number().int(),
  componentCount: z.number().int(),
  pricedComponentCount: z.number().int(),
  frozenEnvelope: z.unknown(),
  frozenComponents: z.array(z.unknown()),
  proposal: z.unknown(),
  createdBy: z.string().nullable(),
  createdAt: isoTimestamp,
})

/** `{ envelope, components }` — the shared Trip aggregate returned by most
 *  lifecycle operations. */
const tripAggregateSchema = z.object({
  envelope: tripEnvelopeRowSchema,
  components: z.array(tripComponentRowSchema),
})

const envelopeDataSchema = z.object({ data: tripEnvelopeRowSchema })
const componentDataSchema = z.object({ data: tripComponentRowSchema })

/**
 * Lifecycle result envelopes (checkout/cancellation). The
 * envelope + components rows are modeled faithfully; the per-operation
 * composed result fields (checkout/cancellation payloads)
 * pass through as `z.unknown()` — bounded effort per voyant#2208.
 */
const lifecycleResultSchema = z.object({
  data: tripAggregateSchema.catchall(z.unknown()),
})

// ── Surface gating helpers ────────────────────────────────────────────────

function isPublicSurface(options: TripsRoutesOptions): boolean {
  return options.surface === "public"
}

function publicForbidden(c: Context<Env>) {
  return c.json({ error: "Trips operation is admin-only" }, 403)
}

function routeError(error: unknown): { message: string; status: 400 | 404 | 409 } {
  if (error instanceof TripsInvariantError) {
    return {
      message: error.message,
      status: error.message.includes("was not found") ? 404 : 409,
    }
  }

  const message = error instanceof Error ? error.message : "Trips route failed"
  return {
    message: isInternalErrorMessage(message) ? "Trips route failed" : message,
    status: 400,
  }
}

function isInternalErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes("failed query:") ||
    normalized.includes("params:") ||
    normalized.includes("drizzlequeryerror") ||
    normalized.includes("postgre") ||
    /insert\s+into\s+["\w.]+/.test(normalized) ||
    /update\s+["\w.]+\s+set/.test(normalized) ||
    normalized.includes("violates not-null constraint") ||
    normalized.includes("violates foreign key constraint") ||
    normalized.includes("duplicate key value violates")
  )
}

function createTripsRoutesOptionsResolver(
  options: TripsRoutesOptionsInput = {},
): ResolveTripsRoutesOptions {
  if (typeof options !== "function") return () => Promise.resolve(options)

  const provider = options
  let optionsPromise: Promise<TripsRoutesOptions> | undefined
  return () => {
    optionsPromise ??= Promise.resolve()
      .then(provider)
      .catch((error) => {
        optionsPromise = undefined
        throw error
      })
    return optionsPromise
  }
}

async function resolveRouteDeps<T>(c: Context<Env>, deps: TripsRouteDeps<T> | undefined) {
  if (typeof deps !== "function") return deps
  const resolver = deps as (c: Context<Env>) => T | Promise<T | undefined> | undefined
  return resolver(c)
}

async function isPublicRouteSurface(readOptions: ResolveTripsRoutesOptions): Promise<boolean> {
  return isPublicSurface(await readOptions())
}

async function resolveConfiguredRouteDeps<T>(
  c: Context<Env>,
  readOptions: ResolveTripsRoutesOptions,
  select: (options: TripsRoutesOptions) => TripsRouteDeps<T> | undefined,
) {
  const options = await readOptions()
  return resolveRouteDeps(c, select(options))
}

const envelopeIdParamSchema = z.object({ envelopeId: z.string() })
const componentIdParamSchema = z.object({ componentId: z.string() })
const requirementIdParamSchema = z.object({ requirementId: z.string() })
const sourcingOperationParamSchema = z.object({
  requirementId: z.string(),
  operationId: z.string(),
})
const snapshotIdParamSchema = z.object({ snapshotId: z.string() })

// ── Route definitions ─────────────────────────────────────────────────────

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  responses: {
    200: {
      description: "Trips module health status",
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({ module: z.literal("trips"), status: z.literal("scaffolded") }),
          }),
        },
      },
    },
  },
})

const listTripsRoute = createRoute({
  method: "get",
  path: "/",
  request: { query: listTripsQuerySchema },
  responses: {
    200: {
      description: "Paginated list of trip envelopes with their components",
      content: { "application/json": { schema: listResponseSchema(tripAggregateSchema) } },
    },
  },
})

const createTripRoute = createRoute({
  method: "post",
  path: "/",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createTripEnvelopeSchema } },
    },
  },
  responses: {
    201: {
      description: "The created trip envelope with its (initially empty) components",
      content: { "application/json": { schema: z.object({ data: tripAggregateSchema }) } },
    },
    400: {
      description: "invalid_request — body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "A referenced entity was not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "The envelope could not be created in the requested state",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const getTripRoute = createRoute({
  method: "get",
  path: "/{envelopeId}",
  request: { params: envelopeIdParamSchema },
  responses: {
    200: {
      description: "A trip envelope with its components",
      content: { "application/json": { schema: z.object({ data: tripAggregateSchema }) } },
    },
    404: {
      description: "Trip envelope not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateTripRoute = createRoute({
  method: "patch",
  path: "/{envelopeId}",
  request: {
    params: envelopeIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateTripEnvelopeSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated trip envelope",
      content: { "application/json": { schema: envelopeDataSchema } },
    },
    400: {
      description: "invalid_request — body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Admin-only operation invoked on the public surface",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Trip envelope not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Invalid trip envelope state transition",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

// snapshots ────────────────────────────────────────────────────────────────

const listSnapshotsRoute = createRoute({
  method: "get",
  path: "/{envelopeId}/snapshots",
  request: { params: envelopeIdParamSchema },
  responses: {
    200: {
      description: "Frozen snapshots for a trip envelope",
      content: {
        "application/json": { schema: z.object({ data: z.array(tripSnapshotRowSchema) }) },
      },
    },
    403: {
      description: "Admin-only operation invoked on the public surface",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const createSnapshotRoute = createRoute({
  method: "post",
  path: "/{envelopeId}/snapshots",
  request: {
    params: envelopeIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: createTripSnapshotBodySchema } },
    },
  },
  responses: {
    201: {
      description: "The frozen trip snapshot",
      content: { "application/json": { schema: z.object({ data: tripSnapshotRowSchema }) } },
    },
    400: {
      description: "invalid_request — body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Admin-only operation invoked on the public surface",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Trip envelope not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Trip envelope cannot be snapshotted in its current state",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const getSnapshotRoute = createRoute({
  method: "get",
  path: "/snapshots/{snapshotId}",
  request: { params: snapshotIdParamSchema },
  responses: {
    200: {
      description: "A frozen trip snapshot by id",
      content: { "application/json": { schema: z.object({ data: tripSnapshotRowSchema }) } },
    },
    403: {
      description: "Admin-only operation invoked on the public surface",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Trip snapshot not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

// components ─────────────────────────────────────────────────────────────────

const addComponentRoute = createRoute({
  method: "post",
  path: "/{envelopeId}/components",
  request: {
    params: envelopeIdParamSchema,
    body: {
      required: true,
      // Cross-field rule: `manual_placeholder` components templated as "manual"
      // require `metadata.manualService.name` (superRefine in validation.ts).
      content: { "application/json": { schema: createTripComponentBodySchema } },
    },
  },
  responses: {
    201: {
      description: "The created trip component",
      content: { "application/json": { schema: componentDataSchema } },
    },
    400: {
      description:
        "invalid_request — body failed validation (manual services require metadata.manualService.name)",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Trip envelope not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Trip component cannot be added in the envelope's current state",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const reorderComponentsRoute = createRoute({
  method: "post",
  path: "/{envelopeId}/components/reorder",
  request: {
    params: envelopeIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: reorderComponentsBodySchema } },
    },
  },
  responses: {
    200: {
      description: "The reordered trip components",
      content: {
        "application/json": { schema: z.object({ data: z.array(tripComponentRowSchema) }) },
      },
    },
    400: {
      description: "invalid_request — body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Admin-only operation invoked on the public surface",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Trip envelope not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Component set mismatch or invalid reorder",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateComponentRoute = createRoute({
  method: "patch",
  path: "/components/{componentId}",
  request: {
    params: componentIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateTripComponentSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated trip component",
      content: { "application/json": { schema: componentDataSchema } },
    },
    400: {
      description: "invalid_request — body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Admin-only operation invoked on the public surface",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Trip component not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Trip component cannot be updated in its current state",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateComponentRefsRoute = createRoute({
  method: "post",
  path: "/components/{componentId}/refs",
  request: {
    params: componentIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateTripComponentRefsSchema } },
    },
  },
  responses: {
    200: {
      description: "The trip component with updated commit references",
      content: { "application/json": { schema: componentDataSchema } },
    },
    400: {
      description: "invalid_request — body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Admin-only operation invoked on the public surface",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Trip component not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Trip component cannot receive references in its current state",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteComponentRoute = createRoute({
  method: "delete",
  path: "/components/{componentId}",
  request: { params: componentIdParamSchema },
  responses: {
    200: {
      description: "The removed trip component",
      content: { "application/json": { schema: componentDataSchema } },
    },
    400: {
      description: "invalid_request — the removal could not be processed",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Admin-only operation invoked on the public surface",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Trip component not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Trip component cannot be removed in its current state",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

// requirements (RFC #2082, admin-only) ───────────────────────────────────────

const addRequirementRoute = createRoute({
  method: "post",
  path: "/{envelopeId}/requirements",
  request: {
    params: envelopeIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: addRequirementBodySchema } },
    },
  },
  responses: {
    201: {
      description: "The created trip requirement",
      content: { "application/json": { schema: z.object({ data: tripRequirementRowSchema }) } },
    },
    400: {
      description: "invalid_request — body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Admin-only operation invoked on the public surface",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Trip envelope not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Requirement cannot be added in the envelope's current state",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const listRequirementsRoute = createRoute({
  method: "get",
  path: "/{envelopeId}/requirements",
  request: { params: envelopeIdParamSchema },
  responses: {
    200: {
      description: "Requirements for a trip envelope",
      content: {
        "application/json": { schema: z.object({ data: z.array(tripRequirementRowSchema) }) },
      },
    },
    400: {
      description: "invalid_request — the requirements could not be listed",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Admin-only operation invoked on the public surface",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Trip envelope not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Requirements cannot be listed in the envelope's current state",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const getRequirementSourcingOperationRoute = createRoute({
  method: "get",
  path: "/requirements/{requirementId}/sourcing-operations/{operationId}",
  request: { params: sourcingOperationParamSchema },
  responses: {
    200: {
      description:
        "Durable sourcing operation status, immutable accepted result, terminal outcome, and error",
      content: {
        "application/json": {
          schema: z.object({ data: tripRequirementSourcingOperationResultSchema }),
        },
      },
    },
    403: {
      description: "Admin-only operation invoked on the public surface",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Sourcing operation not found for this organization and requirement",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const selectCandidateRoute = createRoute({
  method: "post",
  path: "/requirements/{requirementId}/select",
  request: {
    params: requirementIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: selectCandidateBodySchema } },
    },
  },
  responses: {
    200: {
      description: "The resolved requirement, selected candidate, and pinned component",
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({
              requirement: tripRequirementRowSchema,
              candidate: tripCandidateRowSchema,
              component: tripComponentRowSchema,
            }),
          }),
        },
      },
    },
    400: {
      description: "invalid_request — body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Admin-only operation invoked on the public surface",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Trip requirement or candidate not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Candidate is not selectable (expired / superseded / wrong state)",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

// lifecycle ──────────────────────────────────────────────────────────────────

const checkoutTripRoute = createRoute({
  method: "post",
  path: "/{envelopeId}/checkout",
  request: {
    params: envelopeIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: startCheckoutBodySchema } },
    },
  },
  responses: {
    200: {
      description: "The checkout-started envelope with components and a composed handoff result",
      content: { "application/json": { schema: lifecycleResultSchema } },
    },
    400: {
      description: "invalid_request — body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Trip envelope not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Envelope cannot start checkout in its current state",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    501: {
      description: "Trips checkout dependencies are not configured",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const cancellationPreviewRoute = createRoute({
  method: "post",
  path: "/{envelopeId}/cancellation-preview",
  request: {
    params: envelopeIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: previewCancellationBodySchema } },
    },
  },
  responses: {
    200: {
      description: "A composed cancellation preview for the envelope / selected components",
      content: { "application/json": { schema: lifecycleResultSchema } },
    },
    400: {
      description: "invalid_request — body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Admin-only operation invoked on the public surface",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Trip envelope not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Cancellation cannot be previewed in the envelope's current state",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const cancelComponentsRoute = createRoute({
  method: "post",
  path: "/{envelopeId}/cancel-components",
  request: {
    params: envelopeIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: cancelTripComponentsBodySchema } },
    },
  },
  responses: {
    200: {
      description: "A composed cancellation result for the envelope / selected components",
      content: { "application/json": { schema: lifecycleResultSchema } },
    },
    400: {
      description: "invalid_request — body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Admin-only operation invoked on the public surface",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Trip envelope not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Components cannot be cancelled in their current state",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

// ── Per-resource sub-chain factories ──────────────────────────────────────
//
// Each factory builds a small `OpenAPIHono` chain for one resource group,
// closing over `options` (surface gating + injected deps). The parent
// `createTripsRoutes` composes them via `.route("/", subApp)`, which propagates
// each child's `.openapi()` registry definitions into the parent spec while
// keeping per-chain type-inference cost bounded. See voyant#2114 / voyant#2208.

function createEnvelopeRoutes(readOptions: ResolveTripsRoutesOptions): OpenAPIHono<Env> {
  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(listTripsRoute, async (c) =>
      c.json(await tripsService.listTrips(c.get("db"), c.req.valid("query")), 200),
    )
    .openapi(createTripRoute, async (c) => {
      try {
        const trip = await tripsService.createTrip(c.get("db"), c.req.valid("json"))
        return c.json({ data: trip }, 201)
      } catch (error) {
        const { message, status } = routeError(error)
        return c.json({ error: message }, status)
      }
    })
    .openapi(getTripRoute, async (c) => {
      const trip = await tripsService.getTrip(c.get("db"), c.req.valid("param").envelopeId)
      if (!trip) return c.json({ error: "Trip envelope not found" }, 404)
      return c.json({ data: trip }, 200)
    })
    .openapi(updateTripRoute, async (c) => {
      if (await isPublicRouteSurface(readOptions)) return publicForbidden(c)
      try {
        const envelope = await tripsService.updateTrip(
          c.get("db"),
          c.req.valid("param").envelopeId,
          c.req.valid("json"),
        )
        if (!envelope) return c.json({ error: "Trip envelope not found" }, 404)
        return c.json({ data: envelope }, 200)
      } catch (error) {
        const { message, status } = routeError(error)
        return c.json({ error: message }, status)
      }
    })
}

function createSnapshotRoutes(readOptions: ResolveTripsRoutesOptions): OpenAPIHono<Env> {
  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(listSnapshotsRoute, async (c) => {
      if (await isPublicRouteSurface(readOptions)) return publicForbidden(c)
      return c.json(
        {
          data: await tripsService.listTripSnapshots(c.get("db"), c.req.valid("param").envelopeId),
        },
        200,
      )
    })
    .openapi(createSnapshotRoute, async (c) => {
      if (await isPublicRouteSurface(readOptions)) return publicForbidden(c)
      try {
        const snapshot = await tripsService.freezeTripSnapshot(c.get("db"), {
          ...c.req.valid("json"),
          envelopeId: c.req.valid("param").envelopeId,
        })
        return c.json({ data: snapshot }, 201)
      } catch (error) {
        const { message, status } = routeError(error)
        return c.json({ error: message }, status)
      }
    })
    .openapi(getSnapshotRoute, async (c) => {
      if (await isPublicRouteSurface(readOptions)) return publicForbidden(c)
      const snapshot = await tripsService.getTripSnapshotById(
        c.get("db"),
        c.req.valid("param").snapshotId,
      )
      if (!snapshot) return c.json({ error: "Trip snapshot not found" }, 404)
      return c.json({ data: snapshot }, 200)
    })
}

function createComponentRoutes(readOptions: ResolveTripsRoutesOptions): OpenAPIHono<Env> {
  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(addComponentRoute, async (c) => {
      try {
        const component = await tripsService.addComponent(c.get("db"), {
          ...c.req.valid("json"),
          envelopeId: c.req.valid("param").envelopeId,
        })
        return c.json({ data: component }, 201)
      } catch (error) {
        const { message, status } = routeError(error)
        return c.json({ error: message }, status)
      }
    })
    .openapi(reorderComponentsRoute, async (c) => {
      if (await isPublicRouteSurface(readOptions)) return publicForbidden(c)
      try {
        const components = await tripsService.reorderComponents(c.get("db"), {
          ...c.req.valid("json"),
          envelopeId: c.req.valid("param").envelopeId,
        })
        return c.json({ data: components }, 200)
      } catch (error) {
        const { message, status } = routeError(error)
        return c.json({ error: message }, status)
      }
    })
    .openapi(updateComponentRoute, async (c) => {
      if (await isPublicRouteSurface(readOptions)) return publicForbidden(c)
      try {
        const component = await tripsService.updateComponent(
          c.get("db"),
          c.req.valid("param").componentId,
          c.req.valid("json"),
        )
        if (!component) return c.json({ error: "Trip component not found" }, 404)
        return c.json({ data: component }, 200)
      } catch (error) {
        const { message, status } = routeError(error)
        return c.json({ error: message }, status)
      }
    })
    .openapi(updateComponentRefsRoute, async (c) => {
      if (await isPublicRouteSurface(readOptions)) return publicForbidden(c)
      try {
        const component = await tripsService.updateComponentRefs(
          c.get("db"),
          c.req.valid("param").componentId,
          c.req.valid("json"),
        )
        if (!component) return c.json({ error: "Trip component not found" }, 404)
        return c.json({ data: component }, 200)
      } catch (error) {
        const { message, status } = routeError(error)
        return c.json({ error: message }, status)
      }
    })
    .openapi(deleteComponentRoute, async (c) => {
      if (await isPublicRouteSurface(readOptions)) return publicForbidden(c)
      try {
        const component = await tripsService.removeComponent(
          c.get("db"),
          c.req.valid("param").componentId,
        )
        if (!component) return c.json({ error: "Trip component not found" }, 404)
        return c.json({ data: component }, 200)
      } catch (error) {
        const { message, status } = routeError(error)
        return c.json({ error: message }, status)
      }
    })
}

function createRequirementRoutes(readOptions: ResolveTripsRoutesOptions): OpenAPIHono<Env> {
  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(addRequirementRoute, async (c) => {
      if (await isPublicRouteSurface(readOptions)) return publicForbidden(c)
      try {
        const requirement = await tripsService.addRequirement(c.get("db"), {
          ...c.req.valid("json"),
          envelopeId: c.req.valid("param").envelopeId,
        })
        return c.json({ data: requirement }, 201)
      } catch (error) {
        const { message, status } = routeError(error)
        return c.json({ error: message }, status)
      }
    })
    .openapi(listRequirementsRoute, async (c) => {
      if (await isPublicRouteSurface(readOptions)) return publicForbidden(c)
      try {
        const data = await tripsService.listEnvelopeRequirements(
          c.get("db"),
          c.req.valid("param").envelopeId,
        )
        return c.json({ data }, 200)
      } catch (error) {
        const { message, status } = routeError(error)
        return c.json({ error: message }, status)
      }
    })
    .openapi(getRequirementSourcingOperationRoute, async (c) => {
      if (await isPublicRouteSurface(readOptions)) return publicForbidden(c)
      const params = c.req.valid("param")
      const result = await tripsService.getTripRequirementSourcingOperation(c.get("db"), {
        operationId: params.operationId,
        requirementId: params.requirementId,
        organizationId: c.get("organizationId") ?? null,
      })
      if (!result) {
        return c.json({ error: "Trip requirement sourcing operation was not found" }, 404)
      }
      c.header("cache-control", "private, no-store")
      return c.json({ data: result }, 200)
    })
    .openapi(selectCandidateRoute, async (c) => {
      if (await isPublicRouteSurface(readOptions)) return publicForbidden(c)
      try {
        const result = await tripsService.selectCandidate(c.get("db"), {
          ...c.req.valid("json"),
          requirementId: c.req.valid("param").requirementId,
        })
        return c.json({ data: result }, 200)
      } catch (error) {
        const { message, status } = routeError(error)
        return c.json({ error: message }, status)
      }
    })
}

function createLifecycleRoutes(readOptions: ResolveTripsRoutesOptions): OpenAPIHono<Env> {
  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(checkoutTripRoute, async (c) => {
      const deps = await resolveConfiguredRouteDeps(
        c,
        readOptions,
        (options) => options.startCheckoutDeps,
      )
      if (!deps) {
        return c.json({ error: "Trips checkout dependencies are not configured" }, 501)
      }
      try {
        const result = await tripsService.startCheckout(
          c.get("db"),
          { ...c.req.valid("json"), envelopeId: c.req.valid("param").envelopeId },
          deps,
        )
        return c.json({ data: result }, 200)
      } catch (error) {
        const { message, status } = routeError(error)
        return c.json({ error: message }, status)
      }
    })
    .openapi(cancellationPreviewRoute, async (c) => {
      if (await isPublicRouteSurface(readOptions)) return publicForbidden(c)
      try {
        const deps = await resolveConfiguredRouteDeps(
          c,
          readOptions,
          (options) => options.cancelTripComponentsDeps,
        )
        const result = await tripsService.previewCancellation(
          c.get("db"),
          { ...c.req.valid("json"), envelopeId: c.req.valid("param").envelopeId },
          deps,
        )
        return c.json({ data: result }, 200)
      } catch (error) {
        const { message, status } = routeError(error)
        return c.json({ error: message }, status)
      }
    })
    .openapi(cancelComponentsRoute, async (c) => {
      if (await isPublicRouteSurface(readOptions)) return publicForbidden(c)
      try {
        const deps = await resolveConfiguredRouteDeps(
          c,
          readOptions,
          (options) => options.cancelTripComponentsDeps,
        )
        const result = await tripsService.cancelComponents(
          c.get("db"),
          { ...c.req.valid("json"), envelopeId: c.req.valid("param").envelopeId },
          deps,
        )
        return c.json({ data: result }, 200)
      } catch (error) {
        const { message, status } = routeError(error)
        return c.json({ error: message }, status)
      }
    })
}

function createHealthRoutes(): OpenAPIHono<Env> {
  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook }).openapi(healthRoute, (c) =>
    c.json({ data: tripsService.getStatus() }, 200),
  )
}

export function createTripsRoutes(options: TripsRoutesOptionsInput = {}): OpenAPIHono<Env> {
  const readOptions = createTripsRoutesOptionsResolver(options)
  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .route("/", createHealthRoutes())
    .route("/", createEnvelopeRoutes(readOptions))
    .route("/", createSnapshotRoutes(readOptions))
    .route("/", createComponentRoutes(readOptions))
    .route("/", createRequirementRoutes(readOptions))
    .route("/", createLifecycleRoutes(readOptions))
}

export const tripsRoutes = createTripsRoutes()

export type TripsRoutes = ReturnType<typeof createTripsRoutes>
