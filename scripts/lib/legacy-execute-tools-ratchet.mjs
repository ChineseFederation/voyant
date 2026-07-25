/**
 * A "legacy execute+tools" action is a `kind: "execute"` action bound to at
 * least one callable tool that declares none of the safety-contract facets
 * (availability / effectBoundary / durability / existingTarget). Those facets
 * let the runtime reason about whether an action is safe to expose, retry, or
 * re-target; actions without them are grandfathered rather than newly created.
 *
 * This module is intentionally pure (graph in, ids out) so it can be unit
 * tested without generating the real deployment graph.
 */
export const SAFETY_CONTRACT_FACETS = [
  "availability",
  "effectBoundary",
  "durability",
  "existingTarget",
]

export function collectGraphActions(graph) {
  const units = [
    ...(graph.modules ?? []),
    ...(graph.extensions ?? []),
    ...(graph.plugins ?? []),
    ...(graph.adapters ?? []),
    ...(graph.providers ?? []),
  ]
  return units.flatMap((unit) =>
    (unit.actions ?? []).map((action) => ({ unitId: unit.id, ...action })),
  )
}

export function isLegacyExecuteToolsAction(action) {
  return (
    action.kind === "execute" &&
    (action.from?.tools?.length ?? 0) > 0 &&
    SAFETY_CONTRACT_FACETS.every((facet) => action[facet] === undefined)
  )
}

export function currentLegacyExecuteToolsActionIds(graph) {
  const ids = collectGraphActions(graph)
    .filter(isLegacyExecuteToolsAction)
    .map((action) => action.id)
  return [...new Set(ids)].sort()
}

export function diffLegacyExecuteToolsRatchet(currentIds, allowlistIds) {
  const currentSet = new Set(currentIds)
  const allowlistSet = new Set(allowlistIds)
  return {
    newGrandfathers: currentIds.filter((id) => !allowlistSet.has(id)).sort(),
    staleAllowlistEntries: allowlistIds.filter((id) => !currentSet.has(id)).sort(),
  }
}

export function isSortedUniqueStringArray(value) {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) return false
  if (new Set(value).size !== value.length) return false
  return value.every((entry, index) => index === 0 || value[index - 1] < entry)
}
