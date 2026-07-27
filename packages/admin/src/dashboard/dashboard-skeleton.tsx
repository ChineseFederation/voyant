"use client"

import { Card, CardContent, CardHeader } from "@voyant-travel/ui/components/card"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"
import { type ReactNode, useSyncExternalStore } from "react"

import { resolveAdminWidgets } from "../extensions.js"
import { useAdminExtensions } from "../providers/admin-extensions.js"
import {
  DASHBOARD_CHART_SHORT,
  DASHBOARD_CHART_TALL,
  DASHBOARD_HEADER_STRIP_HEIGHT,
  DASHBOARD_LIST_MIN,
  readDashboardHeaderSlotHint,
} from "./dashboard-layout.js"

/**
 * Mirrors `KpiCard` box for box: a `text-base leading-normal` title (24px), a
 * `text-sm` description (20px), a `text-3xl` value (36px), and the trend pill
 * (20px). The placeholder heights are the rendered line boxes, not the font
 * sizes — using the latter made the KPI row 14px short, and because it sits
 * above everything else that error cascaded down the whole page.
 */
export function DashboardKpiSkeleton() {
  return (
    <Card className="gap-0">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-0.5">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-5 w-36" />
        </div>
        <Skeleton className="size-4 rounded" />
      </CardHeader>
      <CardContent className="mt-4">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="mt-3 h-5 w-28 rounded-sm" />
      </CardContent>
    </Card>
  )
}

export function DashboardKpiRowSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable placeholders -- owner: admin; existing suppression is intentional pending typed cleanup.
        <DashboardKpiSkeleton key={i} />
      ))}
    </div>
  )
}

export function DashboardAreaChartSkeleton() {
  return (
    <div className={`flex ${DASHBOARD_CHART_TALL} w-full flex-col justify-end gap-2`}>
      <Skeleton className="h-full w-full rounded-md" />
      <div className="flex justify-between px-2">
        {Array.from({ length: 6 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable placeholders -- owner: admin; existing suppression is intentional pending typed cleanup.
          <Skeleton key={i} className="h-3 w-10" />
        ))}
      </div>
    </div>
  )
}

export function DashboardPieChartSkeleton() {
  return (
    <div className={`flex ${DASHBOARD_CHART_TALL} flex-col items-center justify-center gap-4`}>
      <Skeleton className="h-[200px] w-[200px] rounded-full" />
      <div className="flex flex-wrap justify-center gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable placeholders -- owner: admin; existing suppression is intentional pending typed cleanup.
          <div key={i} className="flex items-center gap-1.5">
            <Skeleton className="h-2.5 w-2.5 rounded-full" />
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function DashboardBarChartSkeleton() {
  const heights = ["h-24", "h-32", "h-20", "h-40", "h-28", "h-36"]
  return (
    <div className={`flex ${DASHBOARD_CHART_SHORT} w-full flex-col justify-end gap-2`}>
      <div className="flex h-full items-end justify-between gap-2 px-1">
        {heights.map((h, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable placeholders -- owner: admin; existing suppression is intentional pending typed cleanup.
          <Skeleton key={i} className={`${h} w-full rounded-sm`} />
        ))}
      </div>
      <div className="flex justify-between px-1">
        {heights.map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable placeholders -- owner: admin; existing suppression is intentional pending typed cleanup.
          <Skeleton key={i} className="h-3 w-10" />
        ))}
      </div>
    </div>
  )
}

export function DashboardUpcomingListSkeleton({ rows = 4 }: { rows?: number } = {}) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: stable placeholders -- owner: admin; existing suppression is intentional pending typed cleanup.
          key={i}
          className="flex items-center justify-between rounded-lg border p-3"
        >
          {/* `text-sm` title over a `text-xs` meta line, `gap-0.5` apart. */}
          <div className="space-y-0.5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function DashboardOutstandingInvoicesSkeleton({ rows = 3 }: { rows?: number } = {}) {
  return (
    <div className="space-y-3">
      {/* Mirrors the "outstanding total" banner: `text-sm` over `text-xs`. */}
      <div className="flex items-center justify-between rounded-lg border border-dashed p-4">
        <div className="space-y-0">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-7 w-24" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: stable placeholders -- owner: admin; existing suppression is intentional pending typed cleanup.
          key={i}
          className="flex items-center justify-between rounded-lg border p-3"
        >
          <div className="space-y-0.5">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

function DashboardCardSkeleton({
  bodyClassName,
  children,
  className,
  withAction = false,
}: {
  bodyClassName?: string
  children: ReactNode
  className?: string
  withAction?: boolean
}) {
  return (
    <Card className={className}>
      {/* CardTitle is a 24px line box, CardDescription a 20px one, with the
          CardHeader's own `gap-1` between them. */}
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="space-y-1">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-5 w-56" />
        </div>
        {withAction ? <Skeleton className="h-5 w-16" /> : null}
      </CardHeader>
      <CardContent className={bodyClassName}>{children}</CardContent>
    </Card>
  )
}

const EMPTY_SUBSCRIPTION = () => () => {}

/**
 * Reserves the `dashboard.header` strip only when the resolved page will fill
 * it. Reserving unconditionally would trade one shift for another: every
 * workspace whose widget renders nothing — no contributing extension, setup
 * dismissed, or every step terminal — would lose the box on the swap.
 *
 * Two independent signals gate it. The extension registry is known
 * synchronously, so a deployment with no `dashboard.header` widget never
 * reserves. Whether a widget that *does* exist currently renders is only known
 * after its data resolves, so widgets persist that verdict and it is read back
 * here. `useSyncExternalStore` keeps the server snapshot ("reserve") separate
 * from the client one, which avoids a hydration mismatch.
 */
function DashboardHeaderSlotReservation() {
  const extensions = useAdminExtensions()
  const hasWidget = resolveAdminWidgets({ slot: "dashboard.header", extensions }).length > 0
  const reserve = useSyncExternalStore(EMPTY_SUBSCRIPTION, readDashboardHeaderSlotHint, () => true)

  if (!hasWidget || !reserve) return null
  return <Skeleton className={`${DASHBOARD_HEADER_STRIP_HEIGHT} w-full rounded-md`} />
}

/**
 * The dashboard route's pending boundary. It is swapped for `DashboardPage` in
 * a single paint, so it deliberately mirrors that page's structure box for box
 * — same header slot, same page header, same 7-column grids, same body heights
 * (see `dashboard-layout.ts`). Structural drift here shows up as a layout
 * shift on every cold dashboard load.
 */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <DashboardHeaderSlotReservation />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-72 rounded-md" />
      </div>

      <DashboardKpiRowSkeleton />

      <div className="grid gap-4 lg:grid-cols-7">
        <DashboardCardSkeleton className="lg:col-span-4">
          <DashboardAreaChartSkeleton />
        </DashboardCardSkeleton>
        <DashboardCardSkeleton className="lg:col-span-3">
          <DashboardPieChartSkeleton />
        </DashboardCardSkeleton>
      </div>

      <div className="grid gap-4 lg:grid-cols-7">
        <DashboardCardSkeleton className="lg:col-span-3">
          <DashboardBarChartSkeleton />
        </DashboardCardSkeleton>
        <DashboardCardSkeleton
          className="lg:col-span-4"
          bodyClassName={DASHBOARD_LIST_MIN}
          withAction
        >
          <DashboardUpcomingListSkeleton />
        </DashboardCardSkeleton>
      </div>

      <div className="grid gap-4">
        <DashboardCardSkeleton bodyClassName={DASHBOARD_LIST_MIN}>
          <DashboardOutstandingInvoicesSkeleton />
        </DashboardCardSkeleton>
      </div>
    </div>
  )
}
