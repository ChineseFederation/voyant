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

const actionInvocationFields = {
  confirmed: z.boolean().optional(),
  requestId: z.uuid().optional(),
  approvalId: z.string().trim().min(1).optional(),
  reasonCode: z.string().trim().min(1).optional(),
  // Compatibility fields used by handler-owned policies and generic actions
  // that have not yet declared server-owned target resolution.
  targetId: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
  idempotencyFingerprint: z.string().trim().min(1).optional(),
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
  const projectedShape = withResponseFormat(projectShapeForMcpDiscovery(shape), listShaped)
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

export function actionInvocationSchemaFor(entry: ToolManifestEntry): z.ZodObject {
  const fields = new Set([
    ...(entry.actionPolicy?.invocation.requiredFields ?? []),
    ...(entry.actionPolicy?.invocation.optionalFields ?? []),
  ])
  return z.strictObject(
    Object.fromEntries(
      Object.entries(actionInvocationFields).filter(([field]) =>
        fields.has(field as keyof typeof actionInvocationFields),
      ),
    ) as z.ZodRawShape,
  )
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
