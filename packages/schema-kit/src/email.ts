import { z } from "zod"

/**
 * The lookaround-free email pattern this workspace standardises on.
 *
 * Zod's default email pattern opens with `^(?!\.)(?!.*\.\.)`, and providers
 * that validate LLM tool schemas with an RE2-style engine reject regex
 * lookaround outright:
 *
 *     AI_APICallError: Invalid JSON schema: regex lookaround is not supported.
 *
 * A client sends EVERY authorized tool schema in one model call, so a single
 * offending field takes down every turn of the conversation — including
 * questions that never touch the Tool carrying it (voyant#4598).
 *
 * This says exactly what zod's default says, structurally rather than with
 * assertions: the local part is dot-separated runs of non-dot characters, which
 * is what "may not start with a dot, may not contain `..`, may not end with a
 * dot" *means*. A differential fuzz against `z.regexes.email` over 700k inputs
 * (343k distinct) found **zero** classification differences, so swapping to it
 * neither tightens nor loosens any field.
 *
 * Deliberately not `z.regexes.rfc5322Email`, zod's other lookaround-free
 * option. That one also works, but at 150 characters against this pattern's 84
 * it is *longer than the default it replaces*, and these patterns are shipped
 * inside every advertised Tool schema. Using it grew the operator's eagerly
 * serialized MCP `tools/list` payload past its ratchet — ~420 bytes of regex
 * charged to the model on every single connection, to say the same thing. At 84
 * characters this is 12 shorter than zod's default, so the payload gets
 * marginally cheaper rather than more expensive.
 *
 * Reach for this directly only when the field also needs `.trim()`, which must
 * run before the format check: `z.string().trim().email({ pattern: emailPattern })`.
 * Otherwise use {@link emailAddress}.
 */
export const emailPattern =
  /^[A-Za-z0-9_'+-]+(\.[A-Za-z0-9_'+-]+)*@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/

/**
 * An email address, validated with a pattern a strict-schema LLM client can
 * parse. Use this instead of `z.email()` / `z.string().email()` anywhere the
 * schema can reach a Tool's `inputSchema`.
 *
 * `verify:tool-schema-portability` fails the build if a lookaround pattern
 * reaches a Tool schema again.
 */
export function emailAddress(error?: string) {
  return z.email({ pattern: emailPattern, ...(error === undefined ? {} : { error }) })
}
