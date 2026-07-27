"use client"

import { Card, CardContent } from "@voyant-travel/ui/components"
import { buttonVariants } from "@voyant-travel/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@voyant-travel/ui/components/empty"
import { cn } from "@voyant-travel/ui/lib/utils"
import {
  BarChart3,
  CalendarCheck,
  ClipboardList,
  DollarSign,
  FileText,
  Sparkles,
} from "lucide-react"
import type { ReactNode } from "react"

import type { OperatorAdminMessages } from "../providers/operator-admin-messages.js"

export type DashboardEmptyStateKey =
  | "revenueTrend"
  | "bookingStatus"
  | "monthlyBookings"
  | "upcomingDepartures"
  | "outstandingInvoices"
  | "onboarding"

export interface DashboardEmptyAction {
  href: string
  label: string
}

export interface DashboardEmptyStateConfig {
  action?: DashboardEmptyAction | null
  description?: string | null
  icon?: ReactNode
  title?: string | null
}

export function buildDashboardEmptyStates(
  messages: OperatorAdminMessages,
  emptyStates: Partial<Record<DashboardEmptyStateKey, DashboardEmptyStateConfig>>,
) {
  return {
    revenueTrend: {
      title: messages.dashboard.revenueTrendEmptyTitle,
      description: messages.dashboard.revenueTrendEmptyDescription,
      action: { href: "/bookings", label: messages.dashboard.revenueTrendEmptyAction },
      icon: <DollarSign className="size-5" />,
      ...emptyStates.revenueTrend,
    },
    bookingStatus: {
      title: messages.dashboard.bookingStatusEmptyTitle,
      description: messages.dashboard.bookingStatusEmptyDescription,
      action: { href: "/bookings", label: messages.dashboard.bookingStatusEmptyAction },
      icon: <ClipboardList className="size-5" />,
      ...emptyStates.bookingStatus,
    },
    monthlyBookings: {
      title: messages.dashboard.monthlyBookingsEmptyTitle,
      description: messages.dashboard.monthlyBookingsEmptyDescription,
      action: { href: "/bookings", label: messages.dashboard.monthlyBookingsEmptyAction },
      icon: <BarChart3 className="size-5" />,
      ...emptyStates.monthlyBookings,
    },
    upcomingDepartures: {
      title: messages.dashboard.noUpcomingDepartures,
      description: messages.dashboard.noUpcomingDeparturesDescription,
      action: null,
      icon: <CalendarCheck className="size-5" />,
      ...emptyStates.upcomingDepartures,
    },
    outstandingInvoices: {
      title: messages.dashboard.outstandingInvoicesEmptyTitle,
      description: messages.dashboard.outstandingInvoicesEmptyDescription,
      action: {
        href: "/finance",
        label: messages.dashboard.outstandingInvoicesEmptyAction,
      },
      icon: <FileText className="size-5" />,
      ...emptyStates.outstandingInvoices,
    },
    onboarding: {
      title: messages.dashboard.onboardingTitle,
      description: messages.dashboard.onboardingDescription,
      icon: <Sparkles className="size-5" />,
      ...emptyStates.onboarding,
    },
  } satisfies Record<DashboardEmptyStateKey, DashboardEmptyStateConfig>
}

export function DashboardEmptyState({
  className,
  compact = false,
  emptyState,
}: {
  /**
   * Height override so an empty card occupies the same box as the chart or
   * list it stands in for — see `dashboard-layout.ts`.
   */
  className?: string
  compact?: boolean
  emptyState: DashboardEmptyStateConfig
}) {
  const action = emptyState.action ?? null

  return (
    <Empty className={cn("min-h-[250px] border", compact && "min-h-[180px] p-8", className)}>
      <EmptyHeader>
        {emptyState.icon ? <EmptyMedia variant="icon">{emptyState.icon}</EmptyMedia> : null}
        {emptyState.title ? <EmptyTitle>{emptyState.title}</EmptyTitle> : null}
        {emptyState.description ? (
          <EmptyDescription>{emptyState.description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action ? (
        <EmptyContent>
          <a href={action.href} className={cn(buttonVariants({ size: "sm" }))}>
            {action.label}
          </a>
        </EmptyContent>
      ) : null}
    </Empty>
  )
}

export function DashboardOnboardingEmptyState({
  children,
  emptyState,
}: {
  children: ReactNode
  emptyState: DashboardEmptyStateConfig
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <Empty className="border p-6">
          <EmptyHeader>
            {emptyState.icon ? <EmptyMedia variant="icon">{emptyState.icon}</EmptyMedia> : null}
            {emptyState.title ? <EmptyTitle>{emptyState.title}</EmptyTitle> : null}
            {emptyState.description ? (
              <EmptyDescription>{emptyState.description}</EmptyDescription>
            ) : null}
          </EmptyHeader>
          <div className="grid w-full gap-3 md:grid-cols-2">{children}</div>
        </Empty>
      </CardContent>
    </Card>
  )
}

export function OnboardingAction({
  actionLabel,
  description,
  href,
  icon,
  title,
}: {
  actionLabel: string
  description: string
  href: string
  icon: ReactNode
  title: string
}) {
  return (
    <a
      href={href}
      className="flex min-w-0 items-start justify-between gap-4 rounded-lg border bg-background p-4 text-left transition-colors hover:bg-muted/50"
    >
      <span className="flex min-w-0 gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </span>
        <span className="min-w-0 space-y-1">
          <span className="block text-sm font-medium">{title}</span>
          <span className="block text-sm text-muted-foreground">{description}</span>
        </span>
      </span>
      <span className="shrink-0 text-sm font-medium text-primary">{actionLabel}</span>
    </a>
  )
}
