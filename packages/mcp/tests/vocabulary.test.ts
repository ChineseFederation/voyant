/**
 * The search vocabulary stays a projection of UBIQUITOUS_LANGUAGE.md.
 *
 * `vocabulary.ts` exists because a travel agent asks for a "client" and the
 * surface calls it a Person — a gap that made `create_person` unreachable for a
 * frontier model. The fix is only durable if the alias table cannot silently
 * drift from the document it was derived from, so this re-parses that document
 * and fails when a term gains an alias nobody projected.
 */
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { expandSearchTerm, VOCABULARY_ALIASES } from "../src/vocabulary.js"

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..")

/**
 * Rows are `| **Term** | description | *alias, alias* |`. Aliases containing a
 * space or a parenthesis are prose ("technical alias only", "booking draft when
 * referring to…") rather than words a caller types, and are excluded from the
 * projection — so they are excluded here too, or the check would demand entries
 * that would never match anything.
 */
function aliasesFromDoc(): Map<string, Set<string>> {
  const md = readFileSync(join(REPO_ROOT, "UBIQUITOUS_LANGUAGE.md"), "utf8")
  const rows = [...md.matchAll(/^\|\s*\*\*([^*]+)\*\*\s*\|([^|]*)\|\s*\*([^*]+)\*/gm)]
  const map = new Map<string, Set<string>>()
  for (const [, term, , aliasCell] of rows) {
    const canonical = (term ?? "").trim().toLowerCase()
    for (const raw of (aliasCell ?? "").split(",")) {
      const alias = raw.trim().toLowerCase()
      if (!alias || alias.includes("(") || alias.includes(" ")) continue
      if (alias === canonical) continue
      const set = map.get(alias) ?? new Set<string>()
      set.add(canonical)
      map.set(alias, set)
    }
  }
  return map
}

describe("search vocabulary", () => {
  it("covers every single-word alias the ubiquitous language defines", () => {
    const doc = aliasesFromDoc()
    // Guard the guard: a regex that silently stopped matching would make this
    // test vacuously pass and let the vocabulary rot unnoticed.
    expect(doc.size).toBeGreaterThan(100)

    const missing: string[] = []
    for (const [alias, canonical] of doc) {
      const projected = VOCABULARY_ALIASES[alias]
      if (!projected) {
        missing.push(alias)
        continue
      }
      for (const term of canonical) {
        if (!projected.includes(term)) missing.push(`${alias}→${term}`)
      }
    }
    expect(
      missing.sort(),
      "UBIQUITOUS_LANGUAGE.md gained aliases that packages/mcp/src/vocabulary.ts does not " +
        "project. Add them, or an agent using that business word will not find the tool.",
    ).toEqual([])
  })

  it("maps the business words a travel agent actually types", () => {
    // The specific failures measured against the real operator graph. These are
    // not illustrative — each one is a journey that could not complete.
    expect(expandSearchTerm("client")).toContain("person")
    expect(expandSearchTerm("customer")).toContain("person")
    expect(expandSearchTerm("company")).toContain("organization")
    expect(expandSearchTerm("guest")).toContain("traveler")
    expect(expandSearchTerm("pax")).toContain("traveler")
    expect(expandSearchTerm("reservation")).toContain("booking")
  })

  it("resolves the plural a caller actually types", () => {
    // The measured failure: search_tools("clients") missed the alias entirely and
    // routed to identity tools, so the agent reported the client did not exist.
    expect(expandSearchTerm("clients")).toContain("person")
    expect(expandSearchTerm("customers")).toContain("person")
    expect(expandSearchTerm("companies")).toContain("organization")
    expect(expandSearchTerm("reservations")).toContain("booking")
  })

  it("keeps the singular as a match target, not just a lookup key", () => {
    // The measured failure: the doc makes Slot canonical with "departure" as its
    // alias, so "departures" expanded to ["departures", "slot"] and matched
    // neither `create_departure` nor `operations_query`. The agent then told the
    // user no departures were scheduled — a business claim from a search miss.
    const forms = expandSearchTerm("departures")
    expect(forms).toContain("departure")
    expect(forms).toContain("departures")
  })

  it("does not over-singularise a word ending in double-s", () => {
    // "address" must not become "addres". Over-stemming produces a WRONG match,
    // which is worse than the miss it was meant to fix.
    expect(expandSearchTerm("address")).toEqual(["address"])
  })

  it("leaves an unknown term exactly as it was", () => {
    // Expansion must only ever widen. A term we have no alias for has to behave
    // identically to before this existed, or every unrecognised search changes.
    expect(expandSearchTerm("transfagarasan")).toEqual(["transfagarasan"])
  })

  it("splits a multi-word canonical term so a snake_case tool name is reachable", () => {
    // "ap" → "supplier payment" only helps if `list_supplier_payments` matches,
    // which needs the words individually.
    const forms = expandSearchTerm("ap")
    expect(forms).toContain("supplier")
    expect(forms).toContain("payment")
  })
})
