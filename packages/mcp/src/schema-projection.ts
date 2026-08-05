/**
 * Zod ↔ MCP schema projection for tool discovery.
 *
 * The MCP SDK validates complete Zod schemas, but its discovery serializer only
 * recognizes a direct object, and JSON Schema cannot express every Zod node we
 * use in domain contracts. This module owns the translation in both directions:
 * projecting domain schemas into something `tools/list` can advertise, and
 * reviving wire values back into what the registry's untouched domain schema
 * expects before dispatch.
 */
import { z } from "@hono/zod-openapi"
import { TOOL_ACTION_INVOCATION_FIELD, type ToolManifestEntry } from "@voyant-travel/tools"

import { isRecord } from "./guards.js"
import { RESPONSE_FORMAT_FIELD, responseFormatSchema } from "./response-budget.js"

export interface McpOutputContract {
  schema: z.ZodType
  envelopeResult: boolean
}

/**
 * The `_voyant` control fields, described (voyant#3921).
 *
 * These used to be projected as bare `z.boolean().optional()` and friends — the
 * shape with none of the meaning. An agent could see that `confirmed` existed and
 * had no way to learn it was mandatory, what it authorised, or where an
 * `approvalId` comes from. So it discovered the protocol the only way left: by
 * calling, being refused, reading the error, and calling again. Measured over
 * three runs against the real graph, creating one priced unit that way succeeded
 * 0/3, burning 20+ calls and 200k+ tokens per attempt.
 *
 * A description is not documentation here; it is the only channel that reaches
 * the model before the first call.
 */
/**
 * The `_voyant` control fields, described — and kept SHORT (voyant#3921).
 *
 * They were previously bare `z.boolean().optional()` and friends: the shape with
 * none of the meaning, so an agent could see `confirmed` existed and had no way
 * to learn it was mandatory or where an approvalId comes from.
 *
 * A first pass wrote full protocol explanations here and was measured at no
 * improvement (0/3 before, 0/3 after) while adding ~10KB to the aggregate
 * describe cost, because these fields appear on EVERY action-policy tool. What
 * actually moved that journey was ungating request_action_approval and putting
 * the recipe in the guide. So these say the minimum a caller cannot infer, and
 * the protocol lives in `voyant_guide` where it is read once rather than
 * serialized into every descriptor.
 */
const actionInvocationFields = {
  confirmed: z
    .boolean()
    .describe("Set true to authorise this write; required, or the call is refused."),
  requestId: z.uuid().describe("Caller-generated UUID correlating this request in the ledger."),
  approvalId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Approval authorising this exact command. Get one with request_action_approval, then approve_action_approval — a pending approval is rejected.",
    ),
  reasonCode: z.string().trim().min(1).describe("Optional reason recorded with the action."),
  // Compatibility fields used by handler-owned policies and generic actions
  // that have not yet declared server-owned target resolution.
  targetId: z.string().trim().min(1).describe("Id of the existing record this action targets."),
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .describe("Stable retry key; reuse the same value to replay an identical command."),
  idempotencyFingerprint: z
    .string()
    .trim()
    .min(1)
    .describe("Fingerprint of the approved command, returned with the approval."),
} satisfies z.ZodRawShape

type ZodCompositionDef = {
  type?: string
  innerType?: unknown
  in?: unknown
  out?: unknown
  left?: unknown
  right?: unknown
}

type ZodDiscoveryDef = ZodCompositionDef & {
  coerce?: boolean
  options?: unknown[]
  shape?: z.ZodRawShape | (() => z.ZodRawShape)
  defaultValue?: unknown
}

/**
 * Normalize object-bearing intersections, pipes/effects, and wrappers into one
 * loose object for transport discovery and argument preservation. The registry
 * still validates the untouched domain schema before dispatch, including
 * cross-field refinements and transforms.
 *
 * Date nodes are projected to JSON-Schema-safe datetime strings so `tools/list`
 * does not fail closed when a domain Tool reuses `z.date()` / `z.coerce.date()`.
 * Wire clients send ISO strings; before registry dispatch those strings are
 * revived to `Date` wherever the domain schema expects a date node.
 */
export function toMcpInputSchema(
  schema: z.ZodType,
  entry: ToolManifestEntry,
  listShaped = false,
): z.ZodObject {
  const shape =
    schema instanceof z.ZodObject
      ? schema.shape
      : Object.assign({}, ...collectInputObjectShapes(schema))
  const projectedShape = withServerResolvedFieldsHidden(
    withResponseFormat(projectShapeForMcpDiscovery(shape), listShaped),
    entry,
  )
  if (!entry.actionPolicy) {
    return z.looseObject(projectedShape)
  }
  if (TOOL_ACTION_INVOCATION_FIELD in projectedShape) {
    throw new Error(
      `Tool "${entry.name}" input conflicts with reserved action metadata field "${TOOL_ACTION_INVOCATION_FIELD}".`,
    )
  }
  return z.looseObject({
    ...projectedShape,
    [TOOL_ACTION_INVOCATION_FIELD]: actionInvocationSchemaFor(entry).optional(),
  })
}

/**
 * Hide a top-level `idempotencyKey` from tools whose handler derives one.
 *
 * A Tool that declares `resolvesIdempotencyKeyServerSide` is excluded from the
 * admission's required fields — but its DOMAIN schema often still advertises a
 * legacy top-level `idempotencyKey`, and an advertised field is an invitation.
 * Measured against the real graph: the agent supplied its own key to
 * `create_option_unit`, which overrode the derived one, then reused that key on a
 * retry with different arguments and got "Action ledger idempotency key was
 * reused with a different fingerprint". The derivation was correct and the
 * caller was able to defeat it simply by being offered the field.
 *
 * Deriving and advertising are the two halves that have to agree. This is the
 * second half, scoped to exactly the tools that already derive: if the policy
 * does not ask the caller for a key, the caller is not shown one.
 */
function withServerResolvedFieldsHidden(
  shape: z.ZodRawShape,
  entry: ToolManifestEntry,
): z.ZodRawShape {
  const policy = entry.actionPolicy
  if (!policy || !("idempotencyKey" in shape)) return shape
  const required: readonly string[] = policy.invocation.requiredFields
  if (required.includes("idempotencyKey")) return shape
  const { idempotencyKey: _hidden, ...rest } = shape
  return rest
}

/**
 * Advertise `response_format` on a list-shaped tool so callers can pick concise
 * (the default) or detailed. A domain schema that already owns the field is left
 * untouched — the domain's own meaning wins over the transport control.
 */
function withResponseFormat(shape: z.ZodRawShape, listShaped: boolean): z.ZodRawShape {
  if (!listShaped || RESPONSE_FORMAT_FIELD in shape) return shape
  return { ...shape, [RESPONSE_FORMAT_FIELD]: responseFormatSchema }
}

const mcpDateTimeSchema = z.iso.datetime({ offset: true })

function projectShapeForMcpDiscovery(shape: z.ZodRawShape): z.ZodRawShape {
  return Object.fromEntries(
    Object.entries(shape).map(([key, value]) => [
      key,
      projectSchemaForMcpDiscovery(value as z.ZodType),
    ]),
  )
}

/**
 * Pick the schema REGISTERED with the MCP SDK — which both advertises the tool
 * and parses the caller's arguments before the callback runs.
 *
 * Do NOT "fix" this the way the registry manifest was fixed, by asking for
 * `io: "input"` so a transform-bearing schema passes and is returned as-is.
 * That schema would then execute domain transforms during the SDK's parse, and
 * `dispatchToResult` re-parses the result through the registry's original
 * schema: `booleanQueryParam` is `z.enum(["true","false","1","0"]).transform()`,
 * so `active: "true"` becomes `true` and the second parse rejects a boolean
 * against a string enum with INVALID_INPUT.
 *
 * The projection below replaces a transform with its INPUT side, which is both
 * what the wire actually carries and safe to parse twice. The output-direction
 * probe is what routes transforms here, so it is deliberate.
 */
function projectSchemaForMcpDiscovery(schema: z.ZodType): z.ZodType {
  try {
    z.toJSONSchema(schema)
    return schema
  } catch {
    return projectUnrepresentableSchema(schema)
  }
}

function projectUnrepresentableSchema(schema: z.ZodType): z.ZodType {
  const def = (schema as { _zod?: { def?: ZodDiscoveryDef } })._zod?.def
  switch (def?.type) {
    case "date":
      return mcpDateTimeSchema
    case "optional":
      return projectSchemaForMcpDiscovery(def.innerType as z.ZodType).optional()
    case "nullable":
      return projectSchemaForMcpDiscovery(def.innerType as z.ZodType).nullable()
    case "default": {
      const inner = projectSchemaForMcpDiscovery(def.innerType as z.ZodType)
      return def.defaultValue === undefined ? inner : inner.default(def.defaultValue as never)
    }
    case "catch":
    case "nonoptional":
    case "readonly":
      return projectSchemaForMcpDiscovery(def.innerType as z.ZodType)
    case "object": {
      const shape = typeof def.shape === "function" ? def.shape() : (def.shape ?? {})
      return z.looseObject(projectShapeForMcpDiscovery(shape))
    }
    case "union": {
      const options = (def.options ?? []).map((option) =>
        projectSchemaForMcpDiscovery(option as z.ZodType),
      )
      if (options.length === 0) return z.unknown()
      if (options.length === 1) return options[0]!
      return z.union(options as [z.ZodType, z.ZodType, ...z.ZodType[]])
    }
    case "intersection":
      return projectSchemaForMcpDiscovery(def.left as z.ZodType).and(
        projectSchemaForMcpDiscovery(def.right as z.ZodType),
      )
    case "pipe":
      return projectSchemaForMcpDiscovery((def.in ?? def.out) as z.ZodType)
    default:
      return z.unknown()
  }
}

/**
 * Project the `_voyant` control object for one tool, preserving which fields the
 * action policy actually REQUIRES.
 *
 * Everything here used to be optional regardless of the policy, which threw away
 * the one fact that makes the protocol followable. The policy already knows that
 * `confirmed` is required for a confirmable write; advertising it as optional
 * told the agent the opposite, so the first call was always refused and the
 * protocol was learned by failure instead of read from the schema.
 *
 * Required stays required, optional stays optional, and the descriptions above
 * explain how to satisfy each one.
 */
export function actionInvocationSchemaFor(entry: ToolManifestEntry): z.ZodObject {
  const required = new Set<string>(entry.actionPolicy?.invocation.requiredFields ?? [])
  const optional = new Set<string>(entry.actionPolicy?.invocation.optionalFields ?? [])
  // Every field stays OPTIONAL in the projection, deliberately, even the ones the
  // policy requires. Marking them required moves the gate into schema validation,
  // and the MCP SDK then rejects the call with a raw
  // "-32602 Invalid input: expected boolean at _voyant.confirmed" — losing
  // CONFIRMATION_REQUIRED and the nextSteps that tell the caller what to do. The
  // domain error is strictly more useful than the transport one, so requiredness
  // is communicated in the DESCRIPTION instead, which reaches the model just as
  // early without costing the better failure.
  const shape = Object.fromEntries(
    Object.entries(actionInvocationFields)
      .filter(([field]) => required.has(field) || optional.has(field))
      .map(([field, schema]) => [field, schema.optional()]),
  ) as z.ZodRawShape
  return z.strictObject(shape)
}

function collectInputObjectShapes(schema: unknown, seen = new Set<unknown>()): z.ZodRawShape[] {
  if (!schema || seen.has(schema)) return []
  seen.add(schema)
  if (schema instanceof z.ZodObject) return [schema.shape]

  const def = (schema as { _zod?: { def?: ZodCompositionDef } })._zod?.def
  switch (def?.type) {
    case "intersection":
      return [
        ...collectInputObjectShapes(def.left, seen),
        ...collectInputObjectShapes(def.right, seen),
      ]
    case "pipe":
      return [...collectInputObjectShapes(def.in, seen), ...collectInputObjectShapes(def.out, seen)]
    case "catch":
    case "default":
    case "nonoptional":
    case "nullable":
    case "optional":
    case "readonly":
      return collectInputObjectShapes(def.innerType, seen)
    default:
      return []
  }
}

/**
 * MCP structured output must have an object root. Decide once whether the
 * domain value needs a `{ result }` envelope, then use that same decision for
 * both the advertised schema and the returned structured content.
 */
export function toMcpOutputContract(schema: z.ZodType): McpOutputContract {
  try {
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>
    if (jsonSchema.type === "object") return { schema, envelopeResult: false }
    return { schema: z.object({ result: schema }), envelopeResult: true }
  } catch {
    // The custom manifest labels this runtime-only schema. MCP still requires a
    // serializable object output schema, so preserve the value in an explicit
    // permissive result envelope.
    return { schema: z.object({ result: z.unknown() }), envelopeResult: true }
  }
}

/**
 * MCP discovery advertises dates as ISO strings. Revive those strings back to
 * `Date` before the registry validates the domain schema, including plain
 * `z.date()` fields that reject strings.
 */
export function reviveDateInputs(schema: z.ZodType, value: unknown): unknown {
  if (value === undefined || value === null) return value
  const def = (schema as { _zod?: { def?: ZodDiscoveryDef & { element?: unknown } } })._zod?.def
  switch (def?.type) {
    case "date": {
      if (typeof value !== "string") return value
      const parsed = new Date(value)
      return Number.isNaN(parsed.getTime()) ? value : parsed
    }
    case "optional":
    case "nullable":
    case "default":
    case "catch":
    case "nonoptional":
    case "readonly":
      return reviveDateInputs(def.innerType as z.ZodType, value)
    case "object": {
      if (!isRecord(value)) return value
      const shape = typeof def.shape === "function" ? def.shape() : (def.shape ?? {})
      const next: Record<string, unknown> = { ...value }
      for (const [key, field] of Object.entries(shape)) {
        if (Object.hasOwn(next, key)) {
          next[key] = reviveDateInputs(field as z.ZodType, next[key])
        }
      }
      return next
    }
    case "array": {
      if (!Array.isArray(value) || !def.element) return value
      return value.map((item) => reviveDateInputs(def.element as z.ZodType, item))
    }
    case "union": {
      if (typeof value === "string") {
        for (const option of def.options ?? []) {
          const optionDef = (option as { _zod?: { def?: ZodDiscoveryDef } })._zod?.def
          if (optionDef?.type === "date") {
            return reviveDateInputs(option as z.ZodType, value)
          }
        }
      }
      if (isRecord(value)) {
        for (const option of def.options ?? []) {
          const optionDef = (option as { _zod?: { def?: ZodDiscoveryDef } })._zod?.def
          if (optionDef?.type === "object" || optionDef?.type === "intersection") {
            return reviveDateInputs(option as z.ZodType, value)
          }
        }
      }
      return value
    }
    case "intersection":
      return reviveDateInputs(
        def.right as z.ZodType,
        reviveDateInputs(def.left as z.ZodType, value),
      )
    case "pipe":
      return reviveDateInputs((def.in ?? def.out) as z.ZodType, value)
    default:
      return value
  }
}
