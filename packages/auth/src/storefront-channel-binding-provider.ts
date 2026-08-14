import type { LinkService } from "@voyant-travel/core"
import type { DrizzleClient } from "@voyant-travel/db"
import { createLinkServiceFactory } from "@voyant-travel/db/links"
import { sql } from "drizzle-orm"

import { storefrontChannelLink } from "./standard-links.js"
import { StorefrontInputError } from "./storefront-origins.js"
import type {
  StorefrontChannelBindingDto,
  StorefrontChannelBindingProvider,
  StorefrontRequestContext,
  StorefrontResolveContext,
} from "./storefront-runtime-port.js"

type BindingContext = (StorefrontRequestContext | StorefrontResolveContext) & {
  link?: LinkService
}

type ChannelRow = {
  id: string
  name: string | null
  status: string
}

const ACTIVE_CHANNEL_STATUS = "active"

/**
 * A deployment-wide `LinkService` reaches the request context only when the
 * composition wired the generated project link registry. `loadVoyantProject`
 * does; the managed operator runtime composes the graph straight from a profile
 * snapshot and never reads those artifacts, so `context.link` is absent on every
 * managed request and this provider used to throw on all of them (voyant#4336).
 *
 * The one link it needs is its own, and its pivot table ships as a
 * `@voyant-travel/db` migration, so serve it from the request database when the
 * deployment supplied nothing. That keeps `link` genuinely optional — the type
 * already said so — instead of naming a service half the compositions cannot
 * produce.
 */
const createOwnedLinkService = createLinkServiceFactory([storefrontChannelLink])

function resolveLinkService(context: BindingContext): LinkService {
  return context.link ?? createOwnedLinkService(() => context.db as DrizzleClient)
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

async function executeRows(context: BindingContext, query: ReturnType<typeof sql>) {
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
 * deployment whose operator hand-created a self-representing channel before
 * the system row existed already binds to, and it is the same tie-break the
 * storefront-channel-binding cutover used. Preferring the system row and
 * falling back to the oldest active `direct` keeps both resolving to the row
 * their publication rules are keyed by.
 *
 * Returns null rather than throwing when the lookup faults — a deployment that
 * has not run the distribution migration has no `system_key` column, and the
 * honest answer there is "no Direct channel", which leaves behaviour exactly as
 * it was before this existed.
 */
async function loadDirectChannel(context: BindingContext): Promise<ChannelRow | null> {
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
  context: BindingContext,
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

function assertSingleBinding(storefrontId: string, channelIds: string[]): string | null {
  const unique = [...new Set(channelIds)]
  if (unique.length === 0) return null
  if (unique.length > 1) {
    throw new StorefrontInputError(
      `Storefront ${storefrontId} has multiple active channel bindings.`,
    )
  }
  return unique[0] ?? null
}

function toBinding(
  storefrontId: string,
  channel: ChannelRow | undefined,
  linkRow: Awaited<ReturnType<LinkService["list"]>>[number],
): StorefrontChannelBindingDto | null {
  if (!channel || channel.status !== ACTIVE_CHANNEL_STATUS) return null
  return {
    storefrontId,
    channelId: channel.id,
    channelName: channel.name,
    channelStatus: channel.status,
    createdAt: iso(linkRow.createdAt),
    updatedAt: iso(linkRow.updatedAt),
    implicit: false,
  }
}

/**
 * The binding a storefront has by default. There is no link row behind it, so
 * the timestamps are null — nothing was ever configured, which is the point.
 */
function toImplicitDirectBinding(
  storefrontId: string,
  channel: ChannelRow | null,
): StorefrontChannelBindingDto | null {
  if (!channel || channel.status !== ACTIVE_CHANNEL_STATUS) return null
  return {
    storefrontId,
    channelId: channel.id,
    channelName: channel.name,
    channelStatus: channel.status,
    createdAt: null,
    updatedAt: null,
    implicit: true,
  }
}

export function createLinkServiceStorefrontChannelBindingProvider(): StorefrontChannelBindingProvider {
  const linkKey = storefrontChannelLink.tableName

  return {
    async listStorefrontChannelBindings(context, storefrontIds) {
      const link = resolveLinkService(context)
      const ids = [...new Set(storefrontIds)].filter(Boolean)
      const result = Object.fromEntries(ids.map((id) => [id, null])) as Record<
        string,
        StorefrontChannelBindingDto | null
      >
      if (ids.length === 0) return result

      const rows = await link.list(linkKey, { leftIds: ids })
      const rowsByStorefront = new Map<string, typeof rows>()
      for (const row of rows) {
        const current = rowsByStorefront.get(row.leftId) ?? []
        current.push(row)
        rowsByStorefront.set(row.leftId, current)
      }

      const channelIds = ids.flatMap((storefrontId) => {
        const bindingRows = rowsByStorefront.get(storefrontId) ?? []
        const channelId = assertSingleBinding(
          storefrontId,
          bindingRows.map((row) => row.rightId),
        )
        return channelId ? [channelId] : []
      })
      const channels = await loadChannels(context, channelIds)
      // Resolved once for the whole batch, and lazily: a deployment where every
      // storefront is explicitly bound never issues the query.
      let directChannel: ChannelRow | null | undefined

      for (const storefrontId of ids) {
        const bindingRows = rowsByStorefront.get(storefrontId) ?? []
        const channelId = assertSingleBinding(
          storefrontId,
          bindingRows.map((row) => row.rightId),
        )
        const linkRow = bindingRows.find((row) => row.rightId === channelId)
        const explicit =
          channelId && linkRow ? toBinding(storefrontId, channels.get(channelId), linkRow) : null
        if (explicit) {
          result[storefrontId] = explicit
          continue
        }
        // No explicit binding — or one pointing at a channel that is gone or no
        // longer active. Either way the storefront falls back to Direct rather
        // than to nothing: publishing to yourself is the default, and the 403
        // that used to follow from an absent binding was asking the operator to
        // hand-create a counterparty representing themselves (#4624).
        if (directChannel === undefined) directChannel = await loadDirectChannel(context)
        result[storefrontId] = toImplicitDirectBinding(storefrontId, directChannel)
      }

      return result
    },

    async getStorefrontChannelBinding(context, storefrontId) {
      const bindings = await this.listStorefrontChannelBindings(context, [storefrontId])
      return bindings[storefrontId] ?? null
    },

    async setStorefrontChannelBinding(context, storefrontId, input) {
      const [channel] = await loadChannels(context, [input.channelId]).then((channels) => [
        channels.get(input.channelId),
      ])
      if (!channel) throw new StorefrontInputError("Channel was not found.")
      if (channel.status !== ACTIVE_CHANNEL_STATUS) {
        throw new StorefrontInputError("Storefront can only bind to an active channel.")
      }

      const link = resolveLinkService(context)
      const existing = await link.list(linkKey, { leftId: storefrontId })
      for (const row of existing) {
        if (row.rightId !== input.channelId) {
          await link.dismiss(linkKey, storefrontId, row.rightId)
        }
      }
      const linkRow = await link.create(linkKey, storefrontId, input.channelId)
      const binding = toBinding(storefrontId, channel, linkRow)
      if (!binding) {
        throw new StorefrontInputError("Storefront can only bind to an active channel.")
      }
      return binding
    },

    /**
     * Drop the explicit binding. The storefront does not become channel-less —
     * it falls back to the deployment's Direct channel, which is what it had
     * before anyone chose otherwise.
     */
    async clearStorefrontChannelBinding(context, storefrontId) {
      const link = resolveLinkService(context)
      const rows = await link.list(linkKey, { leftId: storefrontId })
      await Promise.all(rows.map((row) => link.dismiss(linkKey, storefrontId, row.rightId)))
    },
  }
}
