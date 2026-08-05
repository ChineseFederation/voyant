/**
 * Table privacy: a module's tables are private to it.
 *
 * ADR-0016 decision 6. Cross-module access goes through the owning module's
 * service, or through a local `*Ref` mirror (see ref-mirrors.ts) — not by
 * importing another package's Drizzle table object.
 *
 * Unlike the other checks in scripts/checks, this one has real debt behind it:
 * 228 reach-ins across 17 packages at the time of writing. It therefore runs as
 * a RATCHET keyed on importer->owner pairs. A pair may shrink, never grow, and a
 * new pair is always a failure.
 *
 * Foundation packages are exempt. `db`, `core`, `utils`, `types` and
 * `schema-kit` sit below the domain layer and every module may depend on them,
 * so importing a table they own is not a cross-domain reach-in.
 */
export const FOUNDATION_PACKAGES = new Set(["db", "core", "utils", "types", "schema-kit"])

export interface TableOwnership {
  /** Exported table const name -> owning package directory name. */
  owners: ReadonlyMap<string, string>
}

export interface ImportSite {
  /** Package directory name doing the importing. */
  importer: string
  /** Imported binding names. */
  names: readonly string[]
}

export type Baseline = Readonly<Record<string, number>>

/**
 * A cross-module WRITE: `.update(x)` / `.insert(x)` / `.delete(x)` where `x` is
 * another module's table.
 *
 * The reach-in count flattens a read and a write into the same unit, and they
 * are not the same thing. A read has two sanctioned answers — the owning
 * module's service, or a local `*Ref` mirror. A write has only one: a mirror is
 * a read-only partial view by construction, so writing through it is not
 * available. A cross-module write mutates another module's aggregate directly,
 * bypassing whatever the owner does on its own writes — revision bumps,
 * validation, events.
 *
 * That difference is worth measuring separately, and the target is different
 * too: reads are debt to pay down, writes should reach zero.
 */
export interface WriteSite {
  /** Package directory name performing the write. */
  importer: string
  /** Table const names mutated in this file, from imported bindings only. */
  names: readonly string[]
}

export function countWriteReachIns(sites: readonly WriteSite[], ownership: TableOwnership) {
  const counts = new Map<string, number>()
  for (const site of sites) {
    for (const name of site.names) {
      const owner = ownership.owners.get(name)
      if (owner === undefined) continue
      if (name.endsWith("Ref")) continue
      if (owner === site.importer) continue
      if (FOUNDATION_PACKAGES.has(owner)) continue
      const key = `${site.importer}->${owner}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}

/** Write violations name the remedy, which is narrower than for a read. */
export function checkWritesAgainstBaseline(
  counts: ReadonlyMap<string, number>,
  baseline: Baseline,
) {
  const violations: string[] = []
  for (const [pair, count] of [...counts].sort()) {
    const allowed = baseline[pair]
    if (allowed === undefined) {
      violations.push(
        `${pair}: ${count} cross-module WRITE(s) in a pair with no baseline. A module may not ` +
          `mutate another module's tables — call the owning module's service. A *Ref mirror is ` +
          `read-only and is not an option here.`,
      )
    } else if (count > allowed) {
      violations.push(
        `${pair}: ${count} cross-module writes, baseline allows ${allowed}. This number may only fall.`,
      )
    }
  }
  return violations
}

export function countReachIns(sites: readonly ImportSite[], ownership: TableOwnership) {
  const counts = new Map<string, number>()
  for (const site of sites) {
    for (const name of site.names) {
      const owner = ownership.owners.get(name)
      if (owner === undefined) continue
      if (name.endsWith("Ref")) continue
      if (owner === site.importer) continue
      if (FOUNDATION_PACKAGES.has(owner)) continue
      const key = `${site.importer}->${owner}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}

/** Violations are pairs that grew, and pairs that did not exist before. */
export function checkAgainstBaseline(counts: ReadonlyMap<string, number>, baseline: Baseline) {
  const violations: string[] = []
  for (const [pair, count] of [...counts].sort()) {
    const allowed = baseline[pair]
    if (allowed === undefined) {
      violations.push(
        `${pair}: ${count} table reach-in(s) in a pair with no baseline. A module's tables are ` +
          `private — use the owning module's service, or a local *Ref mirror.`,
      )
    } else if (count > allowed) {
      violations.push(`${pair}: ${count} table reach-ins, baseline allows ${allowed}`)
    }
  }
  return violations
}

/** Pairs that improved, so the baseline can be tightened in the same change. */
export function improvements(counts: ReadonlyMap<string, number>, baseline: Baseline) {
  return Object.entries(baseline)
    .filter(([pair, allowed]) => (counts.get(pair) ?? 0) < allowed)
    .map(([pair, allowed]) => `${pair}: now ${counts.get(pair) ?? 0}, baseline still ${allowed}`)
}
