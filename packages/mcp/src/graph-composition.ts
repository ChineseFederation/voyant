/**
 * Composition of a selected deployment graph into an MCP tool registry:
 * resolving each selected Tool's runtime, binding its graph action policy, and
 * gathering the package-owned context contributors the Tools declare.
 */
import {
  TOOL_CONTEXT_CONTRIBUTION_EXPORT,
  type ToolActionPolicyBinding,
  type ToolContext,
  type ToolContextContribution,
} from "@voyant-travel/tools"
import type { Context } from "hono"

import { isRecord } from "./guards.js"
import type { GraphMcpApiRoutesOptions, GraphMcpRuntime } from "./types.js"

export function indexActionsByTool(
  actions: NonNullable<GraphMcpRuntime["actions"]>,
): Map<string, ToolActionPolicyBinding> {
  const result = new Map<string, ToolActionPolicyBinding>()
  for (const action of actions) {
    if (action.availability?.status === "unavailable") continue
    const binding: ToolActionPolicyBinding = {
      id: action.id,
      capabilityId: action.capabilityId ?? action.id,
      version: action.version,
      kind: action.kind,
      targetType: action.targetType,
      ...(action.commandTargetField ? { commandTargetField: action.commandTargetField } : {}),
      ...(action.targetLifecycle ? { targetLifecycle: action.targetLifecycle } : {}),
      ...(action.existingTarget ? { existingTarget: action.existingTarget } : {}),
      ...(action.createdTarget ? { createdTarget: action.createdTarget } : {}),
      risk: action.risk,
      ledger: action.ledger,
      approval: action.approval ?? "never",
      ...(action.policy ? { policy: action.policy } : {}),
      ...(action.reversible !== undefined ? { reversible: action.reversible } : {}),
      ...(action.allowedActorTypes ? { allowedActorTypes: action.allowedActorTypes } : {}),
    }
    for (const toolId of action.from?.tools ?? []) {
      if (result.has(toolId)) {
        throw new Error(`Selected MCP Tool capability "${toolId}" maps to multiple graph actions.`)
      }
      result.set(toolId, binding)
    }
  }
  return result
}

export async function buildContributedContext(
  c: Context,
  options: GraphMcpApiRoutesOptions,
  contributions: Iterable<{ contribution: ToolContextContribution; unitId: string }>,
): Promise<ToolContext> {
  const base = await options.buildContext(c)
  const sharedResources = options.buildResources?.(c) ?? {}
  let context: ToolContext & Record<string, unknown> = base as ToolContext & Record<string, unknown>
  for (const { contribution, unitId } of contributions) {
    const resources = {
      ...sharedResources,
      ...(unitId ? options.buildUnitResources?.(unitId, c) : {}),
    }
    const contributed = await contribution.contribute({ request: c, context, resources })
    const undeclared = Object.keys(contributed).filter((key) => !contribution.context.includes(key))
    if (undeclared.length > 0) {
      throw new Error(
        `Tool context contribution returned undeclared keys: ${undeclared.sort().join(", ")}.`,
      )
    }
    context = {
      ...context,
      ...contributed,
    }
  }
  return context
}

export function assertToolContextContribution(
  value: unknown,
  importEntry: string,
): asserts value is ToolContextContribution {
  if (
    !isRecord(value) ||
    !Array.isArray(value.context) ||
    value.context.some((key) => typeof key !== "string" || key.length === 0) ||
    typeof value.contribute !== "function"
  ) {
    throw new Error(
      `MCP runtime entry "${importEntry}" exports an invalid ${TOOL_CONTEXT_CONTRIBUTION_EXPORT}.`,
    )
  }
}
