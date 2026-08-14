/**
 * The two `_meta` blocks a client reads off `tools/list` to classify an entry.
 *
 * Progressive disclosure (voyant#3927) and the folded read groups (voyant#3932)
 * put tools on the wire that the *server* owns rather than the tenant registry —
 * the guide layer, the tier-0 meta-tools, and the synthetic `<domain>_query`
 * groups. None of them are registry Tools, so none can carry
 * `voyant.travel/tool`, and until voyant#4592 they carried nothing at all.
 *
 * Absence is not a signal: a client seeing an entry with no metadata cannot tell
 * a server-owned tool (skip it) from a registry Tool whose metadata is missing or
 * malformed (a contract break, fail closed). Both read as "no `_meta`", and Max
 * failing closed on the first one discarded the whole tenant catalog on every
 * managed deployment from `@voyant-travel/mcp` 0.13 on.
 *
 * So server-owned entries carry a POSITIVE marker instead, and the classification
 * rule becomes total:
 *
 * | `_meta` | meaning | client action |
 * | --- | --- | --- |
 * | {@link VOYANT_TOOL_META_KEY} | registry Tool | parse strictly |
 * | {@link SERVER_TOOL_META_KEY} | server-owned | classify by `kind` |
 * | neither | contract break | fail closed |
 *
 * A `read-query` group is deliberately NOT advertised as a registry Tool. It has
 * no capability identity of its own — it is a projection over several — so a
 * client parsing `voyant.travel/tool` strictly would reject it for incomplete
 * metadata, which is the same outage in a different costume. It is server-owned,
 * it is callable, and `describe_tool` returns the capabilities it absorbed.
 */
import { TOOL_CONTRACT_VERSION } from "@voyant-travel/tools"

/** `_meta` key carrying a registry Tool's capability identity and policy. */
export const VOYANT_TOOL_META_KEY = "voyant.travel/tool"

/** `_meta` key marking an entry the server owns rather than the tenant registry. */
export const SERVER_TOOL_META_KEY = "voyant.travel/server-tool"

/**
 * What a server-owned entry is, so a client can act on it rather than only skip
 * it:
 * - `guide` — `voyant_guide` / `voyant_glossary`, read-only prose.
 * - `meta` — `search_tools` / `describe_tool` / `call_tool`, the tier-0 surface
 *   through which the long tail is discovered and dispatched.
 * - `read-query` — a `<domain>_query` group standing in for the flat reads it
 *   absorbed; the tenant read surface, expanded through `describe_tool`.
 */
export type ServerToolKind = "guide" | "meta" | "read-query"

/**
 * Build the server-owned marker. `details` stays small on purpose: this rides on
 * every `tools/list`, which is the payload progressive disclosure exists to keep
 * short, so identity and classification belong here and schemas do not.
 */
export function serverToolMeta(
  kind: ServerToolKind,
  details: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    [SERVER_TOOL_META_KEY]: {
      contractVersion: TOOL_CONTRACT_VERSION,
      kind,
      ...details,
    },
  }
}
