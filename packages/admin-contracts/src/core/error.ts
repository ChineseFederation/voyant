import { z } from "zod"

/**
 * Admin API error envelope. Wire-compatible with `@voyant-travel/types`'
 * `apiErrorSchema` (`{ error, code?, requestId?, details? }`); defined here so
 * the contract package stays zod-only and owns its client-facing error shape.
 */
export const adminErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  requestId: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
})

export type AdminError = z.infer<typeof adminErrorSchema>

/**
 * Thrown by `@voyant-travel/admin-react/client` when a deployment returns a non-2xx
 * response. Carries the HTTP status and the parsed error envelope so callers
 * can branch on `status` / `code` without re-reading the body.
 */
export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: AdminError,
  ) {
    super(body.error)
    this.name = "AdminApiError"
  }

  get code(): string | undefined {
    return this.body.code
  }

  get requestId(): string | undefined {
    return this.body.requestId
  }
}

/**
 * Parse an arbitrary response body into an `AdminError`, tolerating non-conforming
 * bodies (falls back to a stringified message). Used by clients to normalize
 * error responses.
 */
export function toAdminError(status: number, body: unknown): AdminError {
  const parsed = adminErrorSchema.safeParse(body)
  if (parsed.success) return parsed.data
  if (typeof body === "string" && body.length > 0) return { error: body }
  return { error: `Request failed with status ${status}` }
}

/**
 * The approval-required envelope a gated mutation returns (HTTP 202) when the
 * action needs human approval before it runs — e.g. an agent/workflow caller
 * confirming or cancelling a booking. Carries the approval id the caller needs
 * to continue the flow. Mirrors the booking action-ledger approval response.
 */
export const approvalRequiredSchema = z.object({
  approvalRequired: z.literal(true),
  requestedAction: z.object({
    id: z.string(),
    status: z.string(),
    actionName: z.string().optional(),
    targetType: z.string().nullable().optional(),
    targetId: z.string().nullable().optional(),
  }),
  approval: z.object({
    id: z.string(),
    status: z.string(),
    requestedActionId: z.string().optional(),
    expiresAt: z.string().nullable().optional(),
  }),
  replayed: z.boolean().optional(),
})

export type ApprovalRequired = z.infer<typeof approvalRequiredSchema>

/**
 * Thrown by `@voyant-travel/admin-react/client` when a `requires_confirmation` operation
 * returns HTTP 202 with an approval-required envelope instead of the entity.
 * Catch it to drive the approval flow — the approval id is on `.approvalId`.
 */
export class AdminApprovalRequiredError extends Error {
  constructor(public readonly approval: ApprovalRequired) {
    super(`Action requires approval (${approval.approval.id})`)
    this.name = "AdminApprovalRequiredError"
  }

  get approvalId(): string {
    return this.approval.approval.id
  }
}
