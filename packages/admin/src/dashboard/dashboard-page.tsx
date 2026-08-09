"use client"

import { useQuery } from "@tanstack/react-query"
import { useVoyantReactContext } from "@voyant-travel/react"
import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SegmentedControl,
} from "@voyant-travel/ui/components"
import { CalendarCheck, DollarSign, Package, Users } from "lucide-react"
import { lazy, Suspense, useState } from "react"

import { AdminWidgetSlotRenderer } from "../components/admin-widget-slot.js"
import { formatMessage } from "../lib/i18n.js"
import { useLocale } from "../providers/locale.js"
import { useOperatorAdminMessages } from "../providers/operator-admin-messages.js"
import {
  buildDashboardEmptyStates,
  DashboardEmptyState,
  type DashboardEmptyStateConfig,
  type DashboardEmptyStateKey,
} from "./dashboard-empty-states.js"
import { KpiCard } from "./dashboard-kpi-card.js"
import {
  DASHBOARD_CHART_SHORT,
  DASHBOARD_CHART_TALL,
  DASHBOARD_LIST_MIN,
} from "./dashboard-layout.js"
import {
  buildMonthSeries,
  DASHBOARD_RANGE_MONTHS,
  type DashboardRangeMonths,
  DEFAULT_DASHBOARD_RANGE_MONTHS,
  formatCurrency,
  getDashboardBookingsAggregatesQueryOptions,
  getDashboardFinanceAggregatesQueryOptions,
  getDashboardProductsAggregatesQueryOptions,
  getDashboardSuppliersAggregatesQueryOptions,
  getStatusColor,
  pickPrimaryCurrency,
} from "./dashboard-query-options.js"
import {
  DashboardAreaChartSkeleton,
  DashboardBarChartSkeleton,
  DashboardOutstandingInvoicesSkeleton,
  DashboardPieChartSkeleton,
  DashboardUpcomingListSkeleton,
} from "./dashboard-skeleton.js"

const RevenueTrendChart = lazy(() =>
  import("./dashboard-charts.js").then((module) => ({
    default: module.RevenueTrendChart,
  })),
)
const BookingStatusChart = lazy(() =>
  import("./dashboard-charts.js").then((module) => ({
    default: module.BookingStatusChart,
  })),
)
const MonthlyBookingsChart = lazy(() =>
  import("./dashboard-charts.js").then((module) => ({
    default: module.MonthlyBookingsChart,
  })),
)

export type {
  DashboardEmptyAction,
  DashboardEmptyStateConfig,
  DashboardEmptyStateKey,
} from "./dashboard-empty-states.js"

export interface DashboardPageProps {
  emptyStates?: Partial<Record<DashboardEmptyStateKey, DashboardEmptyStateConfig>>
}

export function DashboardPage({ emptyStates = {} }: DashboardPageProps = {}) {
  const client = useVoyantReactContext()
  const messages = useOperatorAdminMessages()
  const { resolvedLocale } = useLocale()
  const [rangeMonths, setRangeMonths] = useState<DashboardRangeMonths>(
    DEFAULT_DASHBOARD_RANGE_MONTHS,
  )
  const { data: bookingsAggregates, isPending: bookingsPending } = useQuery(
    getDashboardBookingsAggregatesQueryOptions(client, rangeMonths),
  )
  const { data: productsAggregates, isPending: productsPending } = useQuery(
    getDashboardProductsAggregatesQueryOptions(client),
  )
  const { data: suppliersAggregates, isPending: suppliersPending } = useQuery(
    getDashboardSuppliersAggregatesQueryOptions(client),
  )
  const { data: financeAggregates, isPending: financePending } = useQuery(
    getDashboardFinanceAggregatesQueryOptions(client, rangeMonths),
  )

  const rangeLabels: Record<DashboardRangeMonths, string> = {
    3: messages.dashboard.range3Months,
    6: messages.dashboard.range6Months,
    12: messages.dashboard.range12Months,
  }

  const bookings = bookingsAggregates?.data
  const products = productsAggregates?.data
  const suppliers = suppliersAggregates?.data
  const finance = financeAggregates?.data

  const monthSeries = buildMonthSeries(rangeMonths)
  const defaultCurrency = pickPrimaryCurrency(bookings?.monthlyRevenue ?? [])

  const monthlyRevenue = monthSeries.map((entry) => {
    const revenue =
      bookings?.monthlyRevenue
        .filter((row) => row.yearMonth === entry.yearMonth)
        .reduce((sum, row) => sum + row.sellAmountCents, 0) ?? 0
    const bookingsInMonth =
      bookings?.monthlyCounts.find((row) => row.yearMonth === entry.yearMonth)?.count ?? 0
    return { month: entry.month, revenue: revenue / 100, bookings: bookingsInMonth }
  })
  const monthlyBookings = monthSeries.map((entry) => ({
    month: entry.month,
    count: bookings?.monthlyCounts.find((row) => row.yearMonth === entry.yearMonth)?.count ?? 0,
  }))

  const totalRevenueCents =
    bookings?.monthlyRevenue
      .filter((row) => row.currency === defaultCurrency)
      .reduce((sum, row) => sum + row.sellAmountCents, 0) ?? 0

  const confirmedBookings =
    (bookings?.countsByStatus.find((row) => row.status === "confirmed")?.count ?? 0) +
    (bookings?.countsByStatus.find((row) => row.status === "in_progress")?.count ?? 0)

  const totalPax = bookings?.totalPax ?? 0
  const activeProducts = products?.active ?? 0
  const totalProducts = products?.total ?? 0
  const totalSuppliers = suppliers?.total ?? 0

  const outstandingInvoiceCount = finance?.outstanding.reduce((sum, row) => sum + row.count, 0) ?? 0
  const outstandingPrimaryCurrency = finance?.outstanding[0]?.currency ?? defaultCurrency
  const outstandingAmount =
    finance?.outstanding.find((row) => row.currency === outstandingPrimaryCurrency)
      ?.balanceDueCents ?? 0
  const outstandingTopN = finance?.outstandingTopN ?? []

  const currentMonthRevenue = monthlyRevenue[monthlyRevenue.length - 1]?.revenue ?? 0
  const prevMonthRevenue = monthlyRevenue[monthlyRevenue.length - 2]?.revenue ?? 0
  const revenueTrend =
    prevMonthRevenue > 0 ? ((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100 : 0
  const currentMonthBookings = monthlyBookings[monthlyBookings.length - 1]?.count ?? 0
  const prevMonthBookings = monthlyBookings[monthlyBookings.length - 2]?.count ?? 0
  const bookingTrend =
    prevMonthBookings > 0
      ? ((currentMonthBookings - prevMonthBookings) / prevMonthBookings) * 100
      : 0

  const revenueChartConfig = {
    revenue: { label: messages.dashboard.chartRevenueLabel, color: "var(--chart-1)" },
    bookings: { label: messages.dashboard.chartBookingsLabel, color: "#86cb3c" },
  }
  const bookingStatusConfig = {
    confirmed: { label: messages.dashboard.statusConfirmedLabel, color: "#86cb3c" },
    completed: { label: messages.dashboard.statusCompletedLabel, color: "#6172f3" },
    in_progress: { label: messages.dashboard.statusInProgressLabel, color: "hsl(47 96% 53%)" },
    draft: { label: messages.dashboard.statusDraftLabel, color: "#efefeb" },
    cancelled: { label: messages.dashboard.statusCancelledLabel, color: "#ff4405" },
  }
  const monthlyBookingsConfig = {
    count: { label: messages.dashboard.chartBookingsLabel, color: "var(--chart-1)" },
  }

  const localizedStatusBreakdown = (bookings?.countsByStatus ?? [])
    .filter((entry) => entry.count > 0)
    .map((entry) => ({
      // Keep the raw status key so the chart config (keyed by
      // `confirmed`/`completed`/...) can resolve the localized label
      // for both the legend and the tooltip.
      status: entry.status,
      count: entry.count,
      fill: getStatusColor(entry.status),
    }))

  const upcoming = bookings?.upcomingDepartures.items ?? []
  const hasRevenueData = monthlyRevenue.some((entry) => entry.revenue > 0)
  const hasMonthlyBookingsData = monthlyBookings.some((entry) => entry.count > 0)
  const hasBookingStatusData = localizedStatusBreakdown.length > 0
  const hasOutstandingInvoices = outstandingInvoiceCount > 0 || outstandingTopN.length > 0

  const resolvedEmptyStates = buildDashboardEmptyStates(messages, {
    ...emptyStates,
    // The monthly-bookings empty copy names a window, so it has to follow the
    // selector rather than stay pinned to six months. An explicit caller
    // override still wins.
    monthlyBookings: {
      title: formatMessage(messages.dashboard.monthlyBookingsRangeEmptyTitle, {
        range: rangeLabels[rangeMonths],
      }),
      ...emptyStates.monthlyBookings,
    },
  })

  const dashboardMetrics = {
    totalRevenueCents,
    confirmedBookings,
    totalPax,
    activeProducts,
    outstandingAmount,
    outstandingInvoiceCount,
    defaultCurrency,
  }

  const widgetProps = {
    bookingsAggregates: bookings ?? null,
    productsAggregates: products ?? null,
    suppliersAggregates: suppliers ?? null,
    financeAggregates: finance ?? null,
    metrics: dashboardMetrics,
    emptyStates: resolvedEmptyStates,
  }

  return (
    <div className="flex flex-col gap-6">
      <AdminWidgetSlotRenderer slot="dashboard.header" props={widgetProps} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {messages.dashboard.title}
          </h1>
          <p className="text-sm text-muted-foreground">{messages.dashboard.description}</p>
        </div>
        <SegmentedControl
          aria-label={messages.dashboard.rangeLabel}
          value={String(rangeMonths)}
          onValueChange={(next) => setRangeMonths(Number(next) as DashboardRangeMonths)}
          options={DASHBOARD_RANGE_MONTHS.map((months) => ({
            value: String(months),
            label: rangeLabels[months],
          }))}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={messages.dashboard.totalRevenueTitle}
          value={formatCurrency(totalRevenueCents, defaultCurrency)}
          // The total is summed from the ranged aggregate response, so the
          // copy has to name the range rather than claim "all-time".
          description={formatMessage(messages.dashboard.totalRevenueRangeDescription, {
            range: rangeLabels[rangeMonths],
          })}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
          trend={revenueTrend}
          trendLabel={messages.dashboard.trendVsLastMonth}
          empty={!hasRevenueData}
          emptyLabel={messages.dashboard.metricUnavailable}
          isLoading={bookingsPending}
        />
        <KpiCard
          title={messages.dashboard.activeBookingsTitle}
          value={confirmedBookings.toString()}
          description={formatMessage(messages.dashboard.activeBookingsDescription, {
            count: bookings?.total ?? 0,
          })}
          icon={<CalendarCheck className="h-4 w-4 text-muted-foreground" />}
          trend={bookingTrend}
          trendLabel={messages.dashboard.trendVsLastMonth}
          empty={(bookings?.total ?? 0) === 0}
          emptyLabel={messages.dashboard.metricUnavailable}
          isLoading={bookingsPending}
        />
        <KpiCard
          title={messages.dashboard.totalTravelersTitle}
          value={totalPax.toLocaleString(resolvedLocale)}
          description={messages.dashboard.totalTravelersDescription}
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
          empty={totalPax === 0 && (bookings?.total ?? 0) === 0}
          emptyLabel={messages.dashboard.metricUnavailable}
          isLoading={bookingsPending}
        />
        <KpiCard
          title={messages.dashboard.activeProductsTitle}
          value={activeProducts.toString()}
          description={formatMessage(messages.dashboard.activeProductsDescription, {
            products: totalProducts,
            suppliers: totalSuppliers,
          })}
          icon={<Package className="h-4 w-4 text-muted-foreground" />}
          empty={activeProducts === 0 && totalProducts === 0}
          emptyLabel={messages.dashboard.metricUnavailable}
          isLoading={productsPending || suppliersPending}
        />
      </div>
      <AdminWidgetSlotRenderer slot="dashboard.after-kpis" props={widgetProps} />

      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>{messages.dashboard.revenueTrendTitle}</CardTitle>
            <CardDescription>
              {formatMessage(messages.dashboard.revenueTrendRangeDescription, {
                range: rangeLabels[rangeMonths],
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bookingsPending ? (
              <DashboardAreaChartSkeleton />
            ) : !hasRevenueData ? (
              <DashboardEmptyState
                className={DASHBOARD_CHART_TALL}
                emptyState={resolvedEmptyStates.revenueTrend}
              />
            ) : (
              <Suspense fallback={<DashboardAreaChartSkeleton />}>
                <RevenueTrendChart
                  config={revenueChartConfig}
                  currency={defaultCurrency}
                  data={monthlyRevenue}
                  className={`${DASHBOARD_CHART_TALL} w-full`}
                />
              </Suspense>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{messages.dashboard.bookingStatusTitle}</CardTitle>
            <CardDescription>{messages.dashboard.bookingStatusDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            {bookingsPending ? (
              <DashboardPieChartSkeleton />
            ) : !hasBookingStatusData ? (
              <DashboardEmptyState
                className={DASHBOARD_CHART_TALL}
                emptyState={resolvedEmptyStates.bookingStatus}
              />
            ) : (
              <Suspense fallback={<DashboardPieChartSkeleton />}>
                <BookingStatusChart
                  config={bookingStatusConfig}
                  data={localizedStatusBreakdown}
                  className={`mx-auto ${DASHBOARD_CHART_TALL} w-full`}
                />
              </Suspense>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{messages.dashboard.monthlyBookingsTitle}</CardTitle>
            <CardDescription>{messages.dashboard.monthlyBookingsDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            {bookingsPending ? (
              <DashboardBarChartSkeleton />
            ) : !hasMonthlyBookingsData ? (
              <DashboardEmptyState
                className={DASHBOARD_CHART_SHORT}
                emptyState={resolvedEmptyStates.monthlyBookings}
                compact
              />
            ) : (
              <Suspense fallback={<DashboardBarChartSkeleton />}>
                <MonthlyBookingsChart
                  config={monthlyBookingsConfig}
                  data={monthlyBookings}
                  className={`${DASHBOARD_CHART_SHORT} w-full`}
                />
              </Suspense>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>{messages.dashboard.upcomingDeparturesTitle}</CardTitle>
            <CardDescription>{messages.dashboard.upcomingDeparturesDescription}</CardDescription>
            <CardAction>
              <a href="/bookings" className="text-sm text-primary hover:underline">
                {messages.dashboard.viewAll}
              </a>
            </CardAction>
          </CardHeader>
          <CardContent className={DASHBOARD_LIST_MIN}>
            {bookingsPending ? (
              <DashboardUpcomingListSkeleton />
            ) : upcoming.length === 0 ? (
              <DashboardEmptyState
                className={DASHBOARD_LIST_MIN}
                emptyState={resolvedEmptyStates.upcomingDepartures}
                compact
              />
            ) : (
              <div className="space-y-3">
                {upcoming.map((booking) => (
                  <a
                    key={booking.id}
                    href={`/bookings/${encodeURIComponent(booking.id)}`}
                    className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">
                        {booking.bookingNumber ?? booking.id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {booking.startDate
                          ? new Date(booking.startDate).toLocaleDateString(resolvedLocale, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : messages.dashboard.noDate}
                        {booking.pax
                          ? ` · ${formatMessage(messages.dashboard.paxCount, {
                              count: booking.pax,
                            })}`
                          : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {booking.sellAmountCents != null && (
                        <span className="text-sm font-medium tabular-nums">
                          {formatCurrency(
                            booking.sellAmountCents,
                            booking.sellCurrency ?? defaultCurrency,
                          )}
                        </span>
                      )}
                      <Badge variant="outline" className="capitalize">
                        {booking.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{messages.dashboard.outstandingInvoicesTitle}</CardTitle>
            <CardDescription>{messages.dashboard.outstandingInvoicesDescription}</CardDescription>
          </CardHeader>
          <CardContent className={DASHBOARD_LIST_MIN}>
            {financePending ? (
              <DashboardOutstandingInvoicesSkeleton />
            ) : !hasOutstandingInvoices ? (
              <DashboardEmptyState
                className={DASHBOARD_LIST_MIN}
                emptyState={resolvedEmptyStates.outstandingInvoices}
              />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-dashed p-4">
                  <div>
                    <p className="text-sm font-medium">
                      {messages.dashboard.outstandingTotalTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatMessage(messages.dashboard.outstandingInvoicesDue, {
                        count: outstandingInvoiceCount,
                      })}
                    </p>
                  </div>
                  <p className="text-lg font-semibold">
                    {formatCurrency(outstandingAmount, outstandingPrimaryCurrency)}
                  </p>
                </div>
                {outstandingTopN.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">
                        {invoice.invoiceNumber ?? invoice.id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {invoice.dueDate
                          ? new Date(invoice.dueDate).toLocaleDateString(resolvedLocale, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : invoice.issueDate
                            ? new Date(invoice.issueDate).toLocaleDateString(resolvedLocale, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : messages.dashboard.noIssueDate}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {formatCurrency(invoice.balanceDueCents, invoice.currency)}
                      </span>
                      <Badge variant="secondary" className="capitalize">
                        {invoice.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <AdminWidgetSlotRenderer slot="dashboard.footer" props={widgetProps} />
    </div>
  )
}
