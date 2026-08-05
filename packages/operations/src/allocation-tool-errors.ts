/**
 * Status → Tool error code mapping for the allocation service (voyant#3950).
 *
 * Internal: `src/mcp-runtime.ts` is this package's public `./tools` subpath, so
 * the mapping lives here instead, where a test can import it directly without
 * making it supported package API.
 */
import type { ToolErrorCode } from "@voyant-travel/tools"

/**
 * Map an allocation service HTTP status onto a Tool error code.
 *
 * The code decides `retryable`, and an agent that cannot tell "retry" from
 * "stop" does both, wrongly. A transient failure reported as terminal makes it
 * abandon work that would have succeeded on a second attempt; a terminal failure
 * reported as retryable makes it hammer a request that can never succeed — and
 * on an allocation write, a wrong retry risks a duplicate placement.
 *
 * So the transient statuses are named explicitly rather than folded into a
 * 4xx/5xx split, which is what the previous mapping did:
 *
 * - 408 / 429 are 4xx but retryable — a timeout and a rate limit both clear on
 *   their own. Classifying them as `INVALID_INPUT` told the agent to go fix an
 *   input that was never wrong, so it would rewrite a correct request instead of
 *   waiting and repeating it.
 * - 502 / 503 / 504 are the upstream being unavailable rather than rejecting.
 * - A plain 500 stays terminal: it is an unhandled server fault, and repeating
 *   an allocation write against one is not obviously safe.
 */
export function allocationToolErrorCode(status: number): ToolErrorCode {
  if (status === 404) return "NOT_FOUND"
  if (status === 408 || status === 429) return "PROVIDER_UNAVAILABLE"
  if (status === 502 || status === 503 || status === 504) return "PROVIDER_UNAVAILABLE"
  return status >= 400 && status < 500 ? "INVALID_INPUT" : "PROVIDER_ERROR"
}
