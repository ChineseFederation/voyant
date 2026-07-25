import type { Visibility } from "./context.js"

export type ToolErrorCode =
  | "MISSING_SERVICE"
  | "AUTHORIZATION_DENIED"
  | "ACTION_POLICY_REQUIRED"
  | "APPROVAL_REQUIRED"
  | "CONFIRMATION_REQUIRED"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "INVALID_OUTPUT"
  | "PROVIDER_ERROR"

/**
 * Standard error for tool failures. The transport adapter catches these and
 * translates them into its own error envelope (e.g. an MCP `isError` result).
 * The core stays transport-neutral — no `content[]` envelope here.
 */
export class ToolError extends Error {
  constructor(
    message: string,
    public readonly code: ToolErrorCode,
    public readonly meta?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = "ToolError"
  }
}

/**
 * Assert that a required injected service is present on the context. Throws
 * `MISSING_SERVICE` if not — the deployment forgot to wire it.
 */
export function requireService<T>(service: T | undefined, name: string): T {
  if (!service) {
    throw new ToolError(
      `Tool requires the "${name}" service to be wired into the context, but it was not provided.`,
      "MISSING_SERVICE",
      { service: name },
    )
  }
  return service
}

/**
 * Enforce per-actor audience authorization. Non-staff actors may only query
 * their own audience pool; staff may federate across pools.
 */
export function enforceAudienceAuthorization(
  actor: Visibility,
  requestedAudiences?: readonly string[],
): void {
  if (!requestedAudiences || requestedAudiences.length === 0) return
  if (actor === "staff") return
  if (requestedAudiences.length === 1 && requestedAudiences[0] === actor) return
  throw new ToolError(
    `Actor "${actor}" is not authorized to query audiences ${JSON.stringify(requestedAudiences)}. Non-staff actors may only query their own audience pool.`,
    "AUTHORIZATION_DENIED",
    { actor, requestedAudiences },
  )
}
