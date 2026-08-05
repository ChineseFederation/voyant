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
    // Three steps, not two. This used to say "request approval, then re-call",
    // which omits the middle one — so an agent requested approval, immediately
    // re-called, got APPROVAL_REQUIRED again, and looped. Observed driving a real
    // booking: the approval was created and left pending forever because nothing
    // told the caller it also had to be DECIDED.
    nextSteps: [
      "1. Call request_action_approval to create an approval for this exact command; it returns an approval id.",
      "2. Call approve_action_approval with that id. A requested approval is pending until it is decided — re-calling before this step fails identically.",
      "3. Re-call this tool with _voyant.approvalId set to that id, and the command otherwise unchanged.",
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
 * Well-known brand identifying a {@link ToolError} across copies of this
 * package. `instanceof` compares against one module evaluation's class, so an
 * error thrown by a second loaded copy fails it and gets re-wrapped — turning
 * a precise code such as `ACTION_POLICY_REQUIRED` into a generic
 * `PROVIDER_ERROR` whose text reaches the caller verbatim (voyant#4115).
 */
const TOOL_ERROR_BRAND = Symbol.for("@voyant-travel/tools.ToolError")

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
    Object.defineProperty(this, TOOL_ERROR_BRAND, {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
    })
  }
}

/**
 * Recognise a {@link ToolError} thrown by any loaded copy of this package.
 *
 * Prefer this over `instanceof` at a transport boundary: a duplicated install
 * would otherwise strip the error's code and actionable fields and surface its
 * raw message as provider error text.
 */
export function isToolError(value: unknown): value is ToolError {
  if (value instanceof ToolError) return true
  if (typeof value !== "object" || value === null) return false
  if ((value as Record<symbol, unknown>)[TOOL_ERROR_BRAND] === true) return true
  // A copy predating the brand still identifies itself by name and carries a
  // string code, which is enough to forward it rather than flatten it.
  const candidate = value as { name?: unknown; code?: unknown; message?: unknown }
  return (
    value instanceof Error &&
    candidate.name === "ToolError" &&
    typeof candidate.code === "string" &&
    typeof candidate.message === "string"
  )
}

/**
 * Normalise any thrown value into a {@link ToolError} of *this* copy.
 *
 * A branded error from another copy keeps its code, message, meta and
 * actionable fields; anything else becomes the conservative terminal
 * `PROVIDER_ERROR` default.
 */
export function toToolError(value: unknown): ToolError {
  if (value instanceof ToolError) return value
  if (isToolError(value)) {
    const foreign = value as unknown as ToolError
    return new ToolError(
      foreign.message,
      foreign.code,
      foreign.meta,
      { cause: value },
      {
        retryable: foreign.retryable,
        ...(foreign.nextSteps?.length ? { nextSteps: foreign.nextSteps } : {}),
        ...(foreign.candidates?.length ? { candidates: foreign.candidates } : {}),
        ...(foreign.didYouMean ? { didYouMean: foreign.didYouMean } : {}),
      },
    )
  }
  return new ToolError(
    value instanceof Error ? value.message : String(value),
    "PROVIDER_ERROR",
    undefined,
    { cause: value },
  )
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
