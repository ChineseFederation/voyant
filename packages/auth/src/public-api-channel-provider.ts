/**
 * Resolves the channel a public API key publishes to.
 *
 * There is no storefront->channel link table any more: the key names a channel
 * or it names nothing, and nothing means the deployment's Direct channel
 * (voyant#4633). What survives from the link-based provider is the part that
 * genuinely needed a seam — reading `channels`, which belongs to
 * `@voyant-travel/distribution`, from `@voyant-travel/auth`.
 */
import { sql } from "drizzle-orm"

import type {
  PublicApiChannelProvider,
  PublicApiRequestContext,
  PublicApiResolveContext,
  ResolvedPublicApiChannel,
} from "./public-api-runtime-port.js"

type ChannelContext = PublicApiRequestContext | PublicApiResolveContext

type ChannelRow = {
  id: string
  name: string | null
  status: string
}

const ACTIVE_CHANNEL_STATUS = "active"

async function executeRows(context: ChannelContext, query: ReturnType<typeof sql>) {
  // agent-quality: raw SQL reads channel rows without importing distribution tables into auth.
  const result = await (
    context.db as { execute(query: ReturnType<typeof sql>): Promise<unknown> }
  ).execute(query)
  if (Array.isArray(result)) return result as Record<string, unknown>[]
  return ((result as { rows?: Record<string, unknown>[] })?.rows ?? []) as Record<string, unknown>[]
}

function channelFromRow(row: Record<string, unknown>): ChannelRow | null {
  if (typeof row.id !== "string" || typeof row.status !== "string") return null
  return {
    id: row.id,
    name: typeof row.name === "string" ? row.name : null,
    status: row.status,
  }
}

/**
 * The deployment's Direct channel — the one everything sold through the
 * operator's own surfaces publishes to. `@voyant-travel/distribution` marks it
 * with `system_key = 'direct'` and provisions exactly one by migration.
 *
 * The fallback to `kind = 'direct'` is not belt-and-braces: it is what a
 * deployment whose operator hand-created a self-representing channel before the
 * system row existed already publishes through. Preferring the system row and
 * falling back to the oldest active `direct` keeps both resolving to the row
 * their publication rules are keyed by.
 *
 * `IS NOT DISTINCT FROM` and not `= 'direct'`: `system_key` is NULL on every
 * operator-created channel, `NULL = 'direct'` is NULL, and a DESC sort puts
 * NULLs first — so the plain equality ranked the operator's own channel above
 * the system row the clause exists to prefer.
 *
 * Returns null rather than throwing when the lookup faults — a deployment that
 * has not run the distribution migration has no `system_key` column, and the
 * honest answer there is "no Direct channel".
 */
async function loadDirectChannel(context: ChannelContext): Promise<ChannelRow | null> {
  try {
    const rows = await executeRows(
      context,
      sql`
        SELECT id, name, status
        FROM channels
        WHERE status = 'active'
          AND (system_key = 'direct' OR kind = 'direct')
        ORDER BY (system_key IS NOT DISTINCT FROM 'direct') DESC, created_at, id
        LIMIT 1
      `,
    )
    const row = rows[0]
    return row ? channelFromRow(row) : null
  } catch {
    return null
  }
}

async function loadChannels(
  context: ChannelContext,
  channelIds: readonly string[],
): Promise<Map<string, ChannelRow>> {
  const ids = [...new Set(channelIds)].filter(Boolean)
  if (ids.length === 0) return new Map()
  const rows = await executeRows(
    context,
    sql`
      SELECT id, name, status
      FROM channels
      WHERE id = ANY(${sql.param(ids)})
    `,
  )
  return new Map(
    rows.flatMap((row) => {
      const channel = channelFromRow(row)
      return channel ? [[channel.id, channel] as const] : []
    }),
  )
}

function toResolved(channel: ChannelRow, implicit: boolean): ResolvedPublicApiChannel | null {
  if (channel.status !== ACTIVE_CHANNEL_STATUS) return null
  return {
    channelId: channel.id,
    channelName: channel.name,
    channelStatus: channel.status,
    implicit,
  }
}

export function createPublicApiChannelProvider(): PublicApiChannelProvider {
  return {
    async resolveChannelForKey(context, channelId) {
      if (channelId) {
        const channels = await loadChannels(context, [channelId])
        const named = channels.get(channelId)
        const explicit = named ? toResolved(named, false) : null
        if (explicit) return explicit
        // The named channel is gone or no longer active. Fall back to Direct
        // rather than to nothing: losing the channel an operator chose is a
        // reason to serve the default, not a reason to take the public surface
        // down. The 403 that used to follow from an absent binding was asking
        // the operator to hand-create a counterparty representing themselves.
      }
      const direct = await loadDirectChannel(context)
      return direct ? toResolved(direct, true) : null
    },

    async resolveChannelsForKeys(context, channelIds) {
      const result = new Map<string | null, ResolvedPublicApiChannel | null>()
      const named = [...new Set(channelIds.filter((id): id is string => Boolean(id)))]
      const channels = await loadChannels(context, named)
      // Resolved once for the whole batch, and lazily: a deployment where every
      // key names an active channel never issues the query.
      let direct: ChannelRow | null | undefined

      for (const channelId of new Set(channelIds)) {
        const explicit = channelId ? channels.get(channelId) : undefined
        const resolved = explicit ? toResolved(explicit, false) : null
        if (resolved) {
          result.set(channelId, resolved)
          continue
        }
        if (direct === undefined) direct = await loadDirectChannel(context)
        result.set(channelId, direct ? toResolved(direct, true) : null)
      }
      return result
    },
  }
}
