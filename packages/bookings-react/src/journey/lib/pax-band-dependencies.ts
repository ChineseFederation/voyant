import type { PaxBandDependency } from "@voyant-travel/catalog-contracts/booking-engine/requirements"

/**
 * A pax-band occupancy rule that the picked traveler counts violate.
 * Carries resolved band labels + the rule kind so the UI can render a
 * localized message without re-resolving codes.
 */
export interface PaxBandDependencyViolation {
  type: PaxBandDependency["type"]
  dependentCode: string
  masterCode: string
  dependentLabel: string
  masterLabel: string
  /** The numeric limit for `limits_per_master` / `limits_sum`. */
  limit?: number
}

/**
 * Evaluate the product's cross-band occupancy rules against the picked
 * pax counts. Returns one violation per broken rule (empty when valid).
 *
 * Rules only fire when at least one dependent is picked — an empty
 * booking never violates "Child requires Adult".
 */
export function evaluatePaxBandDependencies(
  pax: Record<string, number> | undefined,
  dependencies: ReadonlyArray<PaxBandDependency> | undefined,
  bands: ReadonlyArray<{ code: string; label: string }>,
): PaxBandDependencyViolation[] {
  if (!dependencies || dependencies.length === 0) return []
  const counts = pax ?? {}
  const labelByCode = new Map(bands.map((b) => [b.code, b.label]))
  const label = (code: string): string => labelByCode.get(code) ?? code

  const violations: PaxBandDependencyViolation[] = []
  for (const dep of dependencies) {
    const dependent = counts[dep.dependentCode] ?? 0
    const master = counts[dep.masterCode] ?? 0
    // No dependents picked → nothing to enforce.
    if (dependent <= 0) continue

    const base = {
      type: dep.type,
      dependentCode: dep.dependentCode,
      masterCode: dep.masterCode,
      dependentLabel: label(dep.dependentCode),
      masterLabel: label(dep.masterCode),
    }
    switch (dep.type) {
      case "requires":
        if (master <= 0) violations.push(base)
        break
      case "excludes":
        if (master > 0) violations.push(base)
        break
      case "limits_per_master":
        if (dep.maxPerMaster != null && dependent > master * dep.maxPerMaster) {
          violations.push({ ...base, limit: dep.maxPerMaster })
        }
        break
      case "limits_sum":
        if (dep.maxDependentSum != null && dependent > dep.maxDependentSum) {
          violations.push({ ...base, limit: dep.maxDependentSum })
        }
        break
    }
  }
  return violations
}
