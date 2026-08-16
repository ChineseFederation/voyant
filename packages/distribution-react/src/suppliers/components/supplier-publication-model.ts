/**
 * Reading a supplier's publication rules per channel.
 *
 * Publication is not a filter applied when someone browses — it decides which
 * channel slices a record is indexed into at all (`IndexerSlice.channel`, and
 * `isOwnedProductStorefrontListable`, which returns false outright when there
 * is no channel). So "this supplier is not on the website" is a statement about
 * the index, and the operator-facing job here is only to say what the current
 * decision is per channel, and what silence means.
 */

/** A publication decision as the distribution service records it. */
export type PublicationDecision = "include" | "exclude"

/**
 * A channel's lifecycle status, as `channelRecordSchema` records it. Modelled
 * on the real enum rather than a boolean: only `active` publishes, and the
 * three non-publishing values are not interchangeable to an operator reading
 * the page.
 */
export type ChannelStatus = "active" | "inactive" | "pending" | "archived"

export interface ChannelSummary {
  id: string
  name: string
  status: ChannelStatus
}

export interface SupplierPublicationRule {
  id: string
  channelId: string
  supplierId: string
  decision: PublicationDecision
}

/**
 * What the operator sees for one channel.
 *
 * `state` is deliberately three-valued rather than a boolean. "No rule" is not
 * the same as "excluded": the resolver's default is deny, but a *product* rule
 * can still include an individual product from a supplier that carries no
 * supplier-level rule at all. Collapsing the two would tell the operator this
 * supplier is blocked when nothing about it has been decided.
 */
export type SupplierChannelState = "included" | "excluded" | "undecided" | "channel_inactive"

export interface SupplierChannelRow {
  channel: ChannelSummary
  state: SupplierChannelState
  /** The rule backing `state`, when one exists — needed to clear it. */
  rule: SupplierPublicationRule | null
}

/**
 * Join the channel list to this supplier's rules, one row per channel.
 *
 * Every channel is listed, including the ones with no rule, because the
 * question an operator arrives with is "where does this supplier show up?" and
 * a list of only the decided channels cannot answer it.
 */
export function supplierChannelRows(
  channels: readonly ChannelSummary[],
  rules: readonly SupplierPublicationRule[],
  supplierId: string,
): SupplierChannelRow[] {
  const byChannel = new Map<string, SupplierPublicationRule>()
  for (const rule of rules) {
    if (rule.supplierId === supplierId) byChannel.set(rule.channelId, rule)
  }

  return channels.map((channel) => {
    const rule = byChannel.get(channel.id) ?? null
    return { channel, rule, state: resolveState(channel, rule) }
  })
}

function resolveState(
  channel: ChannelSummary,
  rule: SupplierPublicationRule | null,
): SupplierChannelState {
  // A channel that is not active publishes nothing at all, so reporting a
  // supplier as "included" there would be a lie the resolver never told — it
  // answers `channel_inactive` before it ever looks at a rule.
  if (channel.status !== "active") return "channel_inactive"
  if (!rule) return "undecided"
  return rule.decision === "include" ? "included" : "excluded"
}

/** The decision a toggle should write, given what is there now. */
export function nextDecision(state: SupplierChannelState): PublicationDecision {
  return state === "included" ? "exclude" : "include"
}

/** Whether a row's current state came from an explicit rule the operator can clear. */
export function isDecided(row: SupplierChannelRow): boolean {
  return row.rule !== null
}
