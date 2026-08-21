"use client"

import type { QueryKey } from "@tanstack/react-query"
import type { ReactNode } from "react"

import type { RealtimeConnector } from "./connector.js"
import { RealtimeReactProvider, type RealtimeReactProviderProps } from "./provider.js"
import type { RealtimeInvalidationHint } from "./query-keys.js"
import { useLiveQueries } from "./use-live-queries.js"

const ADMIN_CHANNELS = ["admin"] as const
const DASH_BOOKINGS: QueryKey = ["dashboard-bookings-aggregates"]
const DASH_FINANCE: QueryKey = ["dashboard-finance-aggregates"]
const DASH_PRODUCTS: QueryKey = ["dashboard-products-aggregates"]

const ADMIN_INVALIDATIONS: Readonly<Record<string, ReadonlyArray<QueryKey>>> = {
  product: [["voyant", "products"], DASH_PRODUCTS],
  person: [["voyant", "relationships", "people"]],
  organization: [["voyant", "relationships", "organizations"]],
  signal: [["voyant", "relationships", "customer-signals"]],
  inquiry: [["voyant", "relationships", "inquiries"]],
  supplier: [["voyant", "suppliers"]],
  proposal: [["voyant", "proposals"]],
  invoice: [["voyant", "finance"], DASH_FINANCE],
  contract: [["legal", "contracts"]],
  cruise: [["voyant", "cruises"]],
  pricing: [
    ["voyant", "pricing"],
    ["voyant", "products"],
  ],
  promotion: [["promotions"], ["voyant", "pricing"]],
  booking: [["voyant", "bookings"], DASH_BOOKINGS, DASH_FINANCE],
  payment: [["voyant", "bookings"], ["voyant", "finance"], DASH_BOOKINGS, DASH_FINANCE],
  availability: [["voyant", "availability"], ["voyant", "products"], DASH_PRODUCTS],
}

/** Selected-graph marker for Realtime's workspace-level admin integration. */
export function createSelectedRealtimeAdminExtension() {
  return { id: "realtime" }
}

export function adminInvalidationKeys(hint: RealtimeInvalidationHint): ReadonlyArray<QueryKey> {
  return ADMIN_INVALIDATIONS[hint.entity] ?? []
}

export function hasAdminRealtimeSession(session: unknown): boolean {
  if (!session || typeof session !== "object") return false
  const record = session as {
    user?: { id?: unknown } | null
    session?: { userId?: unknown } | null
  }
  return Boolean(
    (typeof record.user?.id === "string" && record.user.id.trim()) ||
      (typeof record.session?.userId === "string" && record.session.userId.trim()),
  )
}

export interface AdminRealtimeProviderProps
  extends Pick<RealtimeReactProviderProps, "fetcher" | "tokenEndpoint"> {
  children: ReactNode
  connector: RealtimeConnector
  session: unknown
}

export function AdminRealtimeProvider({
  children,
  connector,
  fetcher,
  session,
  tokenEndpoint = "/v1/admin/realtime/token",
}: AdminRealtimeProviderProps) {
  return (
    <RealtimeReactProvider connector={connector} fetcher={fetcher} tokenEndpoint={tokenEndpoint}>
      <AdminLiveQueries enabled={hasAdminRealtimeSession(session)} />
      {children}
    </RealtimeReactProvider>
  )
}

function AdminLiveQueries({ enabled }: { enabled: boolean }) {
  useLiveQueries(ADMIN_CHANNELS, adminInvalidationKeys, { enabled })
  return null
}
