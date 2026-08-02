import type { LinkService } from "@voyant-travel/core"
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

function requireLinkService(context: BindingContext): LinkService {
  if (!context.link) {
    throw new Error("Storefront channel binding requires the deployment LinkService.")
  }
  return context.link
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
  }
}

export function createLinkServiceStorefrontChannelBindingProvider(): StorefrontChannelBindingProvider {
  const linkKey = storefrontChannelLink.tableName

  return {
    async listStorefrontChannelBindings(context, storefrontIds) {
      const link = requireLinkService(context)
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

      for (const storefrontId of ids) {
        const bindingRows = rowsByStorefront.get(storefrontId) ?? []
        const channelId = assertSingleBinding(
          storefrontId,
          bindingRows.map((row) => row.rightId),
        )
        const linkRow = bindingRows.find((row) => row.rightId === channelId)
        result[storefrontId] =
          channelId && linkRow ? toBinding(storefrontId, channels.get(channelId), linkRow) : null
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

      const existing = await requireLinkService(context).list(linkKey, { leftId: storefrontId })
      for (const row of existing) {
        if (row.rightId !== input.channelId) {
          await requireLinkService(context).dismiss(linkKey, storefrontId, row.rightId)
        }
      }
      const linkRow = await requireLinkService(context).create(
        linkKey,
        storefrontId,
        input.channelId,
      )
      const binding = toBinding(storefrontId, channel, linkRow)
      if (!binding) {
        throw new StorefrontInputError("Storefront can only bind to an active channel.")
      }
      return binding
    },

    async clearStorefrontChannelBinding(context, storefrontId) {
      const rows = await requireLinkService(context).list(linkKey, { leftId: storefrontId })
      await Promise.all(
        rows.map((row) => requireLinkService(context).dismiss(linkKey, storefrontId, row.rightId)),
      )
    },
  }
}
