import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  entryId,
  findRefinementPaths,
  inspectRefinementInventory,
} from "../../../scripts/lib/tool-refinement-inventory.mjs"

/**
 * Lives here rather than under `scripts/tests` because these cases build real
 * Zod schemas, and this package owns `zod`. The checker itself imports no zod —
 * it introspects the schemas the Tool modules bring with them — so nothing has
 * to be added to the workspace root for it to run.
 */
describe("findRefinementPaths", () => {
  it("finds a refinement on the object root", () => {
    expect(findRefinementPaths(z.object({ a: z.string() }).refine(() => true)).paths).toEqual([
      "<root>",
    ])
  })

  it("finds superRefine the same as refine", () => {
    expect(findRefinementPaths(z.object({ a: z.string() }).superRefine(() => {})).paths).toEqual([
      "<root>",
    ])
  })

  it("finds a refinement on a field", () => {
    const schema = z.object({ a: z.string().refine(() => true), b: z.number() })
    expect(findRefinementPaths(schema).paths).toEqual(["a"])
  })

  it("descends through optional, nullable and default wrappers", () => {
    const schema = z.object({
      a: z
        .string()
        .refine(() => true)
        .optional(),
      b: z
        .string()
        .refine(() => true)
        .nullable(),
      c: z
        .string()
        .refine(() => true)
        .default("x"),
    })
    expect(findRefinementPaths(schema).paths.sort()).toEqual(["a", "b", "c"])
  })

  it("descends into arrays and nested objects", () => {
    const schema = z.object({
      items: z.array(z.object({ note: z.string().refine(() => true) })),
    })
    expect(findRefinementPaths(schema).paths).toEqual(["items[].note"])
  })

  it("descends into record keys", () => {
    const schema = z.object({
      visibility: z.record(
        z.string().refine(() => true),
        z.boolean(),
      ),
    })
    expect(findRefinementPaths(schema).paths).toEqual(["visibility{key}"])
  })

  it("does not report constraints JSON Schema can express", () => {
    const schema = z.object({ a: z.string().min(3).max(9), b: z.number().int() })
    expect(findRefinementPaths(schema).paths).toEqual([])
  })

  // A walker that silently skips an unfamiliar node reports a confident zero,
  // which is how the first sweep convinced itself the class did not exist.
  it("reports an unrecognised node type instead of skipping it", () => {
    const result = findRefinementPaths({ _zod: { def: { type: "quantum" } } })
    expect(result.paths).toEqual([])
    expect(result.unknownTypes).toEqual(["<root>: quantum"])
  })

  // A recursive schema must terminate; the getter mints a fresh node each call.
  it("terminates on a recursive schema", () => {
    const node: z.ZodType = z.object({
      name: z.string().refine(() => true),
      get children() {
        return z.array(node).optional()
      },
    })
    expect(findRefinementPaths(node).paths).toContain("name")
  })
})

const NOTE = "Stated on the field description."

function inventory(
  entries: { id: string; documented?: boolean; note?: string }[],
  maxUndocumented?: number,
) {
  return { entries, maxUndocumented }
}

describe("inspectRefinementInventory", () => {
  it("passes when every refinement is classified and the ceiling matches", () => {
    const result = inspectRefinementInventory(
      [{ id: "p:t:<root>" }],
      inventory([{ id: "p:t:<root>", documented: true, note: NOTE }], 0),
    )
    expect(result.diagnostics).toEqual([])
    expect(result.documented).toBe(1)
    expect(result.undocumented).toBe(0)
  })

  it("fails on a refinement nobody has classified", () => {
    const result = inspectRefinementInventory([{ id: "p:t:<root>" }], inventory([], 0))
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]).toMatch(/Unregistered refinement "p:t:<root>"/)
  })

  it("fails on an inventory entry whose refinement has gone", () => {
    const result = inspectRefinementInventory(
      [],
      inventory([{ id: "p:t:<root>", documented: true, note: NOTE }], 0),
    )
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]).toMatch(/Stale inventory entry/)
  })

  it("fails when an entry has no note", () => {
    const result = inspectRefinementInventory(
      [{ id: "p:t:<root>" }],
      inventory([{ id: "p:t:<root>", documented: false, note: "  " }], 1),
    )
    expect(result.diagnostics.some((d: string) => /needs a note/.test(d))).toBe(true)
  })

  it("fails when documented is not recorded as a boolean", () => {
    const result = inspectRefinementInventory(
      [{ id: "p:t:<root>" }],
      inventory([{ id: "p:t:<root>", note: NOTE }], 0),
    )
    expect(result.diagnostics.some((d: string) => /must record `documented`/.test(d))).toBe(true)
  })

  it("ratchets: a new undocumented refinement above the ceiling fails", () => {
    const result = inspectRefinementInventory(
      [{ id: "p:t:a" }, { id: "p:t:b" }],
      inventory(
        [
          { id: "p:t:a", documented: false, note: NOTE },
          { id: "p:t:b", documented: false, note: NOTE },
        ],
        1,
      ),
    )
    expect(result.diagnostics.some((d: string) => /exceeds the ceiling of 1/.test(d))).toBe(true)
  })

  it("ratchets: documenting one forces the ceiling down", () => {
    const result = inspectRefinementInventory(
      [{ id: "p:t:a" }],
      inventory([{ id: "p:t:a", documented: true, note: NOTE }], 1),
    )
    expect(result.diagnostics.some((d: string) => /Lower `maxUndocumented` to 0/.test(d))).toBe(
      true,
    )
  })

  it("fails when the ceiling is missing entirely", () => {
    const result = inspectRefinementInventory(
      [{ id: "p:t:a" }],
      inventory([{ id: "p:t:a", documented: true, note: NOTE }]),
    )
    expect(result.diagnostics.some((d: string) => /must set `maxUndocumented`/.test(d))).toBe(true)
  })

  it("entryId composes package, tool and path", () => {
    expect(entryId("@voyant-travel/trips", "create_trip", "components[]")).toBe(
      "@voyant-travel/trips:create_trip:components[]",
    )
  })
})
