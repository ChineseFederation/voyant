/**
 * Remediation has to reach the reader it was written for.
 *
 * A model driving this surface is shown the tool result's `content`. `_meta` is
 * transport-level, is not required to be surfaced, and in practice is not — so
 * for as long as `nextSteps` lived only there, every actionable field
 * voyant#3950 added was invisible to the only consumer that could act on it.
 *
 * The evidence is a matched pair, measured against a real model. Where the
 * remediation was in the RESULT PAYLOAD (`issue_invoice_from_booking`), adding it
 * changed the agent's behaviour immediately — 3 calls and give up became 14 and
 * driving the protocol. Where it was in `_meta` (the approval gate), replacing a
 * first step that provably caused an infinite loop with one that does not changed
 * the trace not at all. The agent never saw either version.
 */
import { ToolError } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import { toErrorResult } from "../src/dispatch.js"

function textOf(result: ReturnType<typeof toErrorResult>): string {
  const [block] = result.content as [{ type: string; text: string }]
  return block.text
}

describe("MCP error remediation visibility", () => {
  it("puts next steps in the content a model actually reads", () => {
    const result = toErrorResult(
      new ToolError(
        "This Tool action is awaiting approval.",
        "APPROVAL_REQUIRED",
        undefined,
        undefined,
        {
          nextSteps: [
            '1. Call approve_action_approval with approvalId "approval_1".',
            "2. Re-call this tool with _voyant.approvalId set to that id.",
          ],
        } as never,
      ),
    )

    const text = textOf(result)
    expect(text).toContain("[APPROVAL_REQUIRED]")
    expect(text).toContain("Next steps:")
    expect(text).toContain("approve_action_approval")
    expect(text).toContain("_voyant.approvalId")
  })

  it("still carries the structured envelope in _meta", () => {
    // Content is for the model; _meta stays for programmatic clients. Moving the
    // remediation must not mean removing it from the structured envelope.
    const result = toErrorResult(new ToolError("Nope.", "NOT_FOUND"))
    const envelope = (result._meta as Record<string, { code: string; nextSteps?: string[] }>)[
      "voyant.travel/error"
    ]
    expect(envelope.code).toBe("NOT_FOUND")
    expect(envelope.nextSteps?.length).toBeGreaterThan(0)
  })

  it("surfaces didYouMean and candidates, which had the same problem", () => {
    const result = toErrorResult(
      new ToolError("Unknown tool.", "NOT_FOUND", undefined, undefined, {
        didYouMean: "book_product",
        candidates: ["book_product", "create_booking"],
      } as never),
    )

    const text = textOf(result)
    expect(text).toContain("Did you mean: book_product")
    expect(text).toContain("create_booking")
  })

  it("renders the per-code default when a throw site supplies none", () => {
    // ToolError falls back to the per-code default whenever `nextSteps` is empty,
    // so "an error with no remediation" cannot occur — which is the right design
    // and means the content rendering never emits a bare "Next steps:" header.
    // It also means the unmigrated `new ToolError(message, code)` calls all over
    // the codebase start carrying visible remediation for free.
    const result = toErrorResult(
      new ToolError("Boom.", "PROVIDER_ERROR", undefined, undefined, { nextSteps: [] } as never),
    )

    const text = textOf(result)
    expect(text.startsWith("[PROVIDER_ERROR] Boom.\nNext steps:\n")).toBe(true)
    expect(text.trimEnd().endsWith("Next steps:")).toBe(false)
  })
})
