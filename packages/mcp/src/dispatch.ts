/**
 * Tool dispatch and the action-policy gate — the security boundary between an
 * MCP `tools/call` and a domain handler.
 *
 * Dispatch runs the registry (which validates input and output against the
 * untouched domain schemas), routes ledgered work through the selected
 * action-policy gate, and wraps typed pure data in an MCP envelope. Core tools
 * never see an MCP envelope; that wrapping happens only here.
 */
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import {
  TOOL_ACTION_INVOCATION_FIELD,
  TOOL_CONTRACT_VERSION,
  type ToolActionInvocationControl,
  type ToolContext,
  ToolError,
  type ToolManifestEntry,
  type ToolRegistry,
} from "@voyant-travel/tools"

import { isRecord } from "./guards.js"
import {
  isListShapedOutput,
  listFilterFieldsFromInput,
  RESPONSE_FORMAT_FIELD,
  type ResponseFormat,
  shapeResponse,
} from "./response-budget.js"
import { actionInvocationSchemaFor, reviveDateInputs } from "./schema-projection.js"

/** Dispatch through the registry (validates in + out) and wrap pure data in an MCP envelope. */
export async function dispatchToResult(
  registry: ToolRegistry,
  name: string,
  entry: ToolManifestEntry,
  args: unknown,
  ctx: ToolContext,
  requireActionPolicy: boolean,
  envelopeResult: boolean,
  budgetBytes: number,
): Promise<CallToolResult> {
  try {
    // `response_format` is a transport-only control, never a domain input — strip
    // it before the registry re-validates against the untouched domain schema,
    // which would otherwise reject an unexpected key.
    const { format, rest } = extractResponseFormat(args)
    const { commandInput, invocation } = entry.actionPolicy
      ? splitInvocation(rest, entry)
      : { commandInput: rest, invocation: {} }
    if (requireActionPolicy && !entry.actionPolicy && entry.deploymentRisk !== "low") {
      throw new ToolError(
        `Tool "${entry.name}" has no selected graph action policy.`,
        "ACTION_POLICY_REQUIRED",
        { capabilityId: entry.capabilityId },
      )
    }
    const domainInputSchema = registry.get(name)?.inputSchema
    const revivedCommandInput =
      domainInputSchema === undefined
        ? commandInput
        : reviveDateInputs(domainInputSchema, commandInput)
    const baseDispatchContext = withoutHandlerActionPolicy(ctx)
    const dispatch = (dispatchContext: ToolContext = baseDispatchContext) =>
      registry.dispatch(name, revivedCommandInput, dispatchContext)
    if (
      entry.actionPolicy?.enforcement === "handler" &&
      entry.actionPolicy.invocation.requiredFields.includes("confirmed") &&
      invocation.confirmed !== true
    ) {
      throw new ToolError(
        "This Tool requires explicit confirmation before handler-owned policy dispatch.",
        "CONFIRMATION_REQUIRED",
        { capabilityId: entry.capabilityId },
      )
    }
    const data =
      entry.actionPolicy?.enforcement === "generic"
        ? await dispatchGenericAction({
            registry,
            invocationName: name,
            entry,
            commandInput: revivedCommandInput,
            invocation,
            context: ctx,
          })
        : await dispatch(
            entry.actionPolicy?.enforcement === "handler"
              ? handlerDispatchContext(baseDispatchContext, entry, invocation)
              : baseDispatchContext,
          )
    const def = registry.get(name)
    const listShaped = def ? isListShapedOutput(def.outputSchema) : false
    const shaped = shapeResponse(data, {
      format: format ?? (listShaped ? "concise" : undefined),
      budgetBytes,
      filterFields: def ? listFilterFieldsFromInput(def.inputSchema) : [],
      toWire: (value) => toStructuredContent(value, envelopeResult),
    })
    return {
      content: [{ type: "text", text: shaped.text }],
      structuredContent: shaped.structuredContent,
      ...(shaped.meta ? { _meta: shaped.meta } : {}),
    }
  } catch (err) {
    // Normalize any thrown value into a ToolError so the envelope always carries
    // the actionable fields. An unknown throw maps to PROVIDER_ERROR (terminal),
    // the safe-for-writes default — a blind retry of an unknown failure could
    // duplicate a write.
    const toolError =
      err instanceof ToolError
        ? err
        : new ToolError(err instanceof Error ? err.message : String(err), "PROVIDER_ERROR")
    const error = {
      contractVersion: TOOL_CONTRACT_VERSION,
      code: toolError.code,
      message: toolError.message,
      retryable: toolError.retryable,
      nextSteps: toolError.nextSteps,
      ...(toolError.candidates ? { candidates: toolError.candidates } : {}),
      ...(toolError.didYouMean ? { didYouMean: toolError.didYouMean } : {}),
      ...(toolError.meta ? { meta: toolError.meta } : {}),
    }
    return {
      isError: true,
      content: [{ type: "text", text: `[${toolError.code}] ${toolError.message}` }],
      _meta: { "voyant.travel/error": error },
    }
  }
}

async function dispatchGenericAction(input: {
  registry: ToolRegistry
  invocationName: string
  entry: ToolManifestEntry
  commandInput: unknown
  invocation: ToolActionInvocationControl
  context: ToolContext
}): Promise<unknown> {
  const actionPolicy = input.entry.actionPolicy
  if (actionPolicy?.enforcement !== "generic") {
    throw new ToolError(
      "Generic action dispatch requires a generic action policy.",
      "INVALID_INPUT",
    )
  }
  const dispatchContext = withoutHandlerActionPolicy(input.context)
  if (!actionPolicy.invocation.targetResolution) {
    return requireActionGate(input.context).execute(
      {
        capabilityId: input.entry.capabilityId,
        capabilityVersion: input.entry.capabilityVersion,
        canonicalName: input.entry.name,
        actionPolicy,
        commandInput: input.commandInput,
        invocation: input.invocation,
      },
      () => input.registry.dispatch(input.invocationName, input.commandInput, dispatchContext),
    )
  }
  const prepared = await input.registry.prepareAction(
    input.invocationName,
    input.commandInput,
    dispatchContext,
  )
  const needsTarget = actionPolicy.ledger === "required"
  const resolvedTargetId = prepared.resolvedTargetId
  if (needsTarget && !resolvedTargetId) {
    throw new ToolError(
      "This ledgered Tool has no valid server-owned action target; refusing dispatch.",
      "ACTION_POLICY_REQUIRED",
      {
        capabilityId: input.entry.capabilityId,
        targetResolution: actionPolicy.invocation.targetResolution ?? "missing",
      },
    )
  }
  return requireActionGate(input.context).execute(
    {
      capabilityId: input.entry.capabilityId,
      capabilityVersion: input.entry.capabilityVersion,
      canonicalName: input.entry.name,
      actionPolicy,
      commandInput: prepared.commandInput,
      invocation: input.invocation,
      ...(resolvedTargetId ? { resolvedTargetId } : {}),
    },
    () => input.registry.dispatchPrepared(prepared, dispatchContext),
  )
}

function withoutHandlerActionPolicy(context: ToolContext): ToolContext {
  if (!("handlerActionPolicy" in context)) return context
  const { handlerActionPolicy: _handlerActionPolicy, ...base } = context
  return base
}

function handlerDispatchContext(
  context: ToolContext,
  entry: ToolManifestEntry,
  invocation: ToolActionInvocationControl,
): ToolContext {
  const actionPolicy = entry.actionPolicy
  if (actionPolicy?.enforcement !== "handler") return context
  const handlerContext: ToolContext = {
    ...context,
    handlerActionPolicy: {
      capabilityId: entry.capabilityId,
      capabilityVersion: entry.capabilityVersion,
      canonicalName: entry.name,
      actionPolicy: {
        ...actionPolicy,
        ...(actionPolicy.existingTarget
          ? { existingTarget: { ...actionPolicy.existingTarget } }
          : {}),
        ...(actionPolicy.createdTarget ? { createdTarget: { ...actionPolicy.createdTarget } } : {}),
        ...(actionPolicy.allowedActorTypes
          ? { allowedActorTypes: [...actionPolicy.allowedActorTypes] }
          : {}),
        invocation: {
          ...actionPolicy.invocation,
          requiredFields: [...actionPolicy.invocation.requiredFields],
          optionalFields: [...actionPolicy.invocation.optionalFields],
        },
      },
      invocation: { ...invocation },
    },
  }
  return handlerContext
}

function toStructuredContent(data: unknown, envelopeResult: boolean): Record<string, unknown> {
  if (envelopeResult) return { result: data }
  if (isRecord(data)) return data
  throw new ToolError(
    "MCP object output did not produce object structured content.",
    "INVALID_OUTPUT",
  )
}

function splitInvocation(
  args: unknown,
  entry: ToolManifestEntry,
): {
  commandInput: unknown
  invocation: ToolActionInvocationControl
} {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { commandInput: args, invocation: {} }
  }
  const { [TOOL_ACTION_INVOCATION_FIELD]: rawInvocation, ...commandInput } = args as Record<
    string,
    unknown
  >
  const parsed = actionInvocationSchemaFor(entry).safeParse(rawInvocation ?? {})
  if (!parsed.success) {
    throw new ToolError("Invalid Voyant action invocation metadata.", "INVALID_INPUT", {
      issues: parsed.error.issues,
    })
  }
  return { commandInput, invocation: parsed.data }
}

function requireActionGate(ctx: ToolContext) {
  if (!ctx.toolActionPolicy) {
    throw new ToolError(
      "The selected action-policy gate is unavailable; refusing Tool dispatch.",
      "ACTION_POLICY_REQUIRED",
    )
  }
  return ctx.toolActionPolicy
}

/** Peel the transport-only `response_format` control off the caller's arguments. */
function extractResponseFormat(args: unknown): { format?: ResponseFormat; rest: unknown } {
  if (!isRecord(args) || !(RESPONSE_FORMAT_FIELD in args)) return { rest: args }
  const { [RESPONSE_FORMAT_FIELD]: raw, ...rest } = args
  const format = raw === "detailed" ? "detailed" : raw === "concise" ? "concise" : undefined
  return { ...(format ? { format } : {}), rest }
}
