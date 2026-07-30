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
  | "PROVIDER_UNAVAILABLE"

/**
 * Optional, per-throw-site overrides for the actionable fields on a
 * {@link ToolError}. Anything omitted falls back to the per-code default in
 * {@link TOOL_ERROR_DEFAULTS}, so an unmigrated `new ToolError(message, code)`
 * call still carries sensible `retryable`/`nextSteps` values.
 */
export interface ToolErrorDetails {
  /** Whether an identical retry could plausibly succeed. */
  retryable?: boolean
  /** Ordered, caller-facing remediation steps. */
  nextSteps?: readonly string[]
  /** Ids/values that nearly matched an id-shaped argument, where cheap to compute. */
  candidates?: readonly string[]
  /** The single closest match to a mistyped id-shaped argument. */
  didYouMean?: string
}

interface ToolErrorDefault {
  /** Whether an identical retry could plausibly succeed for this code. */
  retryable: boolean
  /** The documented remediation for this code. */
  nextSteps: readonly string[]
}

/**
 * Documented remediation and retry semantics for every {@link ToolErrorCode}.
 *
 * `retryable` is deliberately conservative: only a genuinely transient upstream
 * failure (`PROVIDER_UNAVAILABLE`) is retryable. Everything else — authorization,
 * bad input, a missing record, a permanent provider rejection — is terminal,
 * because for a write tool the cost of a wrong "retry" is a duplicate action.
 */
export const TOOL_ERROR_DEFAULTS: Record<ToolErrorCode, ToolErrorDefault> = {
  MISSING_SERVICE: {
    retryable: false,
    nextSteps: [
      "This deployment is missing a required service binding. Ask the operator to wire the service into the tool context; an identical retry will fail the same way.",
    ],
  },
  AUTHORIZATION_DENIED: {
    retryable: false,
    nextSteps: [
      "The actor is not authorized for this operation. Obtain the required grant or scope, or call as an authorized actor. Retrying unchanged will be denied identically.",
    ],
  },
  ACTION_POLICY_REQUIRED: {
    retryable: false,
    nextSteps: [
      "This tool has no usable graph action policy and cannot be dispatched until one is configured for the deployment.",
    ],
  },
  APPROVAL_REQUIRED: {
    retryable: false,
    nextSteps: [
      "Request approval via request_action_approval, then re-call this tool with _voyant.approvalId set to the returned approval id.",
    ],
  },
  CONFIRMATION_REQUIRED: {
    retryable: false,
    nextSteps: ["Re-call this tool with _voyant.confirmed=true to proceed."],
  },
  NOT_FOUND: {
    retryable: false,
    nextSteps: [
      "No record matched the supplied id. Verify the id, or use a list/search tool to discover a valid one. Retrying the same id will not find it.",
    ],
  },
  INVALID_INPUT: {
    retryable: false,
    nextSteps: [
      "Correct the reported input fields and call again. The same input will fail validation identically.",
    ],
  },
  INVALID_OUTPUT: {
    retryable: false,
    nextSteps: [
      "The tool produced output that failed its own schema. This is a server-side defect the caller cannot resolve by retrying; report it to the operator.",
    ],
  },
  PROVIDER_ERROR: {
    retryable: false,
    nextSteps: [
      "The upstream provider permanently rejected this request. Correct the request before retrying; an identical retry will be rejected again.",
    ],
  },
  PROVIDER_UNAVAILABLE: {
    retryable: true,
    nextSteps: [
      "The upstream provider is temporarily unavailable. Retry after a short backoff; the same request may succeed once the provider recovers.",
    ],
  },
}

/**
 * Standard error for tool failures. The transport adapter catches these and
 * translates them into its own error envelope (e.g. an MCP `isError` result).
 * The core stays transport-neutral — no `content[]` envelope here.
 *
 * Beyond `message`/`code`/`meta`, every error carries actionable fields —
 * `retryable`, `nextSteps`, and optionally `candidates`/`didYouMean` — so a
 * caller can tell "retry" from "stop" and knows what to do next. These default
 * per code (see {@link TOOL_ERROR_DEFAULTS}); pass `details` to override at a
 * throw site.
 */
export class ToolError extends Error {
  /** Whether an identical retry could plausibly succeed. */
  readonly retryable: boolean
  /** Ordered, caller-facing remediation steps. Never empty. */
  readonly nextSteps: readonly string[]
  /** Ids/values that nearly matched an id-shaped argument, when cheaply known. */
  readonly candidates?: readonly string[]
  /** The single closest match to a mistyped id-shaped argument. */
  readonly didYouMean?: string

  constructor(
    message: string,
    public readonly code: ToolErrorCode,
    public readonly meta?: Record<string, unknown>,
    options?: ErrorOptions,
    details?: ToolErrorDetails,
  ) {
    super(message, options)
    this.name = "ToolError"
    // A domain may throw a code outside the union (the transport forwards it
    // verbatim). Never crash while CONSTRUCTING an error — that replaces the real
    // failure with a TypeError and loses the original cause. Fall back to the
    // conservative terminal defaults instead.
    const defaults = TOOL_ERROR_DEFAULTS[code] ?? TOOL_ERROR_DEFAULTS.PROVIDER_ERROR
    this.retryable = details?.retryable ?? defaults.retryable
    this.nextSteps =
      details?.nextSteps && details.nextSteps.length > 0 ? details.nextSteps : defaults.nextSteps
    if (details?.candidates && details.candidates.length > 0) {
      this.candidates = details.candidates
    }
    if (details?.didYouMean) {
      this.didYouMean = details.didYouMean
    }
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
