export function inspectToolProtocolFieldInventory(observed, inventory) {
  const diagnostics = []
  const frameworkControls = inventory?.frameworkControls ?? []
  if (
    frameworkControls.length !== 1 ||
    frameworkControls[0]?.field !== "_voyant" ||
    frameworkControls[0]?.ownership !== "server-issued-continuation"
  ) {
    diagnostics.push(
      'frameworkControls must classify exactly "_voyant" as server-issued-continuation',
    )
  }
  const entries = Array.isArray(inventory?.entries) ? inventory.entries : []
  const observedIds = [...new Set(observed.map((entry) => entry.id))].sort()
  const inventoryIds = entries.map((entry) => entry.id)

  if (new Set(inventoryIds).size !== inventoryIds.length) {
    diagnostics.push("inventory contains duplicate ids")
  }
  if (JSON.stringify(inventoryIds) !== JSON.stringify([...inventoryIds].sort())) {
    diagnostics.push("inventory entries must be sorted by id")
  }

  const inventoryById = new Map(entries.map((entry) => [entry.id, entry]))
  for (const id of observedIds) {
    const entry = inventoryById.get(id)
    if (!entry) {
      diagnostics.push(`unclassified caller-facing protocol field: ${id}`)
      continue
    }
    if (!["caller-owned-command-identity", "server-owned"].includes(entry.ownership)) {
      diagnostics.push(`${id} has invalid ownership classification`)
    }
    const observedEntry = observed.find((item) => item.id === id)
    if (observedEntry?.serverResolved) {
      diagnostics.push(`${id} is server-owned and must not be advertised to callers`)
    }
    const expectedOwnership = observedEntry?.serverResolved
      ? "server-owned"
      : "caller-owned-command-identity"
    if (entry.ownership !== expectedOwnership) {
      diagnostics.push(`${id} must be classified ${expectedOwnership}`)
    }
    if (typeof entry.rationale !== "string" || entry.rationale.trim().length < 20) {
      diagnostics.push(`${id} must explain its business rationale`)
    }
  }
  for (const id of inventoryIds) {
    if (!observedIds.includes(id)) diagnostics.push(`stale inventory entry: ${id}`)
  }

  return { diagnostics, total: observedIds.length }
}
