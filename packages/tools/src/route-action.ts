import type { ToolActionPolicyBinding } from "./binding.js"
import { actionTransportAdmits, type ToolActionInvocationPolicy } from "./binding.js"
import type { ToolActionInvocationControl, ToolHandlerActionPolicyContext } from "./context.js"
import { ToolError } from "./errors.js"
import { mintHandlerActionPolicyContext } from "./handler-action-policy.js"

/**
 * A selected-graph action served by one HTTP route rather than by a Tool.
 *
 * It carries the same policy a Tool-bound action does, but is never listed on
 * the discovery manifest and can never be dispatched by name.
 */
export interface RouteActionBinding {
  capabilityId: string
  capabilityVersion: string
  /** Stable name for audit and error reporting; not an invocation name. */
  canonicalName: string
  actionPolicy: ToolActionPolicyBinding
  invocation: ToolActionInvocationPolicy
}

export interface RouteActionAdmissionInput {
  /** The authenticated actor, checked against the action's allowed actor types. */
  actor: string
  /** Invocation controls the route resolved server-side. */
  invocation: ToolActionInvocationControl
}

export interface RouteActionRegistry {
  register(binding: RouteActionBinding): void
  admit(actionId: string, input: RouteActionAdmissionInput): ToolHandlerActionPolicyContext
}

/**
 * Registration and admission for route-bound actions.
 *
 * A route never fabricates a `ToolHandlerActionPolicyContext`. It asks this
 * registry to mint one against the graph-registered policy, which is the same
 * unforgeable provenance Tool dispatch relies on — the mint function is
 * package-private, so an admission can only originate here.
 */
export function createRouteActionRegistry(): RouteActionRegistry {
  const actions = new Map<string, RouteActionBinding>()

  return {
    register(binding) {
      const actionId = binding.actionPolicy.id
      if (actions.has(actionId)) {
        throw new Error(`Route action "${actionId}" is already registered`)
      }
      if (!actionTransportAdmits(binding.actionPolicy, "route")) {
        throw new Error(`Route action "${actionId}" does not admit the route transport`)
      }
      actions.set(actionId, binding)
    },
    admit(actionId, input) {
      const binding = actions.get(actionId)
      if (!binding) {
        throw new ToolError("The selected route action is not registered.", "NOT_FOUND", {
          actionId,
        })
      }
      const policy = binding.actionPolicy
      const allowedActorTypes = policy.allowedActorTypes
      if (allowedActorTypes?.length && !allowedActorTypes.includes(input.actor)) {
        throw new ToolError(
          "The authenticated actor is not allowed by the selected route action.",
          "AUTHORIZATION_DENIED",
          { actionId, actor: input.actor },
        )
      }
      return mintHandlerActionPolicyContext(
        {
          capabilityId: binding.capabilityId,
          capabilityVersion: binding.capabilityVersion,
          canonicalName: binding.canonicalName,
          actionPolicy: { ...policy, enforcement: "handler", invocation: binding.invocation },
          invocation: input.invocation,
        },
        "route",
      )
    },
  }
}
