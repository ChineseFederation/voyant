"use client"

import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@voyant-travel/ui/components"
import {
  Activity,
  History,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  UserMinus,
  UserPlus,
  Wrench,
} from "lucide-react"
import { type ComponentType, type ReactNode, useState } from "react"
import type {
  AllocationAuditLogEntry,
  AllocationManifestBooking,
  AvailabilitySlotAssignmentRow,
} from "../index.js"

type ActivityTimelineSource = "assignment" | "audit"

interface ActivityTimelineEvent {
  id: string
  source: ActivityTimelineSource
  title: string
  description?: ReactNode
  timestamp: string
  /**
   * Active assignments expose no released timestamp — surface them as
   * "ongoing" in the meta line and sort them above released history so
   * unreleased rows aren't pinned to the bottom by a sentinel epoch.
   */
  isOngoing?: boolean
  actorId?: string | null
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  badge?: string
}

const AUDIT_ACTION_ICONS: Record<
  string,
  ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  "resource.create": Plus,
  "resource.update": Pencil,
  "resource.delete": Trash2,
  "traveler.assign": UserPlus,
  "traveler.unassign": UserMinus,
  "resources.materialize": Sparkles,
  "auto-allocate": Sparkles,
}

function humanizeAction(action: string, labels: Record<string, string>): string {
  return labels[action] ?? action.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export function ActivityTimeline({
  assignments,
  auditEntries,
  resourceById,
  allocationResourceById,
  bookingById,
  travelerById,
  formatDateTime: formatDateTimeFn,
  emptyAction,
  i18n,
}: {
  assignments: AvailabilitySlotAssignmentRow[]
  auditEntries: AllocationAuditLogEntry[]
  /**
   * The operations RESOURCE POOL (`/v1/admin/operations/resources`), keyed by
   * `resources.id`. `slot_assignments.resource_id` points here.
   */
  resourceById: Map<string, { id: string; name: string }>
  /**
   * This departure's `allocation_resources`, keyed by
   * `allocation_resources.id`. The allocation AUDIT LOG points here — a
   * different table from the pool above. Resolving audit entries against the
   * pool always missed and rendered a raw typeid to the operator.
   */
  allocationResourceById?: Map<string, { id: string; name: string }>
  bookingById: Map<string, AllocationManifestBooking>
  travelerById: Map<string, { fullName: string; bookingNumber: string; bookingId: string }>
  formatDateTime: (value: string | Date) => string
  /** Next action offered when the departure has no history yet (AC7). */
  emptyAction?: {
    title: string
    description: string
    actionLabel: string
    onAction: () => void
  }
  i18n: {
    title: string
    empty: string
    filterAll: string
    filterAudit: string
    filterAssignments: string
    byActor: string
    unassignedResource: string
    bookingLabel: string
    auditActionLabels: Record<string, string>
    ongoing: string
    noValue: string
  }
}) {
  const [filter, setFilter] = useState<ActivityTimelineSource | "all">("all")
  const poolResourceLabel = (id: string | null | undefined) =>
    (id ? resourceById.get(id)?.name : null) ?? id ?? i18n.unassignedResource
  /**
   * Audit entries name an `allocation_resources` row. Fall back to the pool
   * only for a legacy entry that predates the split, then to the placeholder —
   * never to the raw id, which reads as noise to an operator.
   */
  const allocationResourceLabel = (id: string | null | undefined) =>
    (id ? (allocationResourceById?.get(id)?.name ?? resourceById.get(id)?.name) : null) ??
    i18n.unassignedResource

  const events: ActivityTimelineEvent[] = []
  const nowIso = new Date().toISOString()
  for (const assignment of assignments) {
    const resource = poolResourceLabel(assignment.resourceId)
    const booking = bookingById.get(assignment.bookingId ?? "")
    // Active assignments don't carry a released timestamp. Sort them
    // alongside current activity using `now`, and flag the entry so
    // the row meta line renders "ongoing" instead of formatting the
    // sentinel time.
    const isOngoing = assignment.releasedAt == null
    events.push({
      id: `assignment:${assignment.id}`,
      source: "assignment",
      icon: Wrench,
      title: resource,
      badge: assignment.status,
      description: (
        <span>
          {i18n.bookingLabel}: {booking?.bookingNumber ?? assignment.bookingId ?? i18n.noValue}
          {assignment.notes ? ` · ${assignment.notes}` : null}
        </span>
      ),
      timestamp: assignment.releasedAt ?? nowIso,
      isOngoing,
      actorId: assignment.assignedBy,
    })
  }
  for (const entry of auditEntries) {
    const resource = entry.resourceId ? allocationResourceLabel(entry.resourceId) : null
    const traveler = entry.travelerId ? travelerById.get(entry.travelerId) : null
    const detailParts: string[] = []
    if (traveler) detailParts.push(traveler.fullName)
    if (resource) detailParts.push(resource)
    events.push({
      id: `audit:${entry.id}`,
      source: "audit",
      icon: AUDIT_ACTION_ICONS[entry.action] ?? History,
      title: humanizeAction(entry.action, i18n.auditActionLabels),
      description: detailParts.length > 0 ? detailParts.join(" → ") : null,
      timestamp: entry.createdAt,
      actorId: entry.actorId,
    })
  }
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  const visible = filter === "all" ? events : events.filter((e) => e.source === filter)
  const hasAssignments = assignments.length > 0
  const hasAudit = auditEntries.length > 0
  const filters: Array<{ id: ActivityTimelineSource | "all"; label: string; show: boolean }> = [
    { id: "all", label: i18n.filterAll, show: true },
    { id: "assignment", label: i18n.filterAssignments, show: hasAssignments },
    { id: "audit", label: i18n.filterAudit, show: hasAudit },
  ]

  return (
    <div data-slot="slot-activity-timeline" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {i18n.title}
        </h2>
        {events.length > 0 && hasAssignments && hasAudit ? (
          <div className="flex flex-wrap items-center gap-1">
            {filters
              .filter((f) => f.show)
              .map((f) => (
                <Button
                  key={f.id}
                  variant={filter === f.id ? "default" : "ghost"}
                  size="sm"
                  className="h-7 capitalize"
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </Button>
              ))}
          </div>
        ) : null}
      </div>

      {visible.length === 0 ? (
        emptyAction ? (
          <Empty data-slot="departure-activity-empty" className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <History aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{emptyAction.title}</EmptyTitle>
              <EmptyDescription>{emptyAction.description}</EmptyDescription>
            </EmptyHeader>
            <Button variant="outline" onClick={emptyAction.onAction}>
              {emptyAction.actionLabel}
            </Button>
          </Empty>
        ) : (
          <div className="rounded-md border bg-background p-6 text-center">
            <p className="text-sm text-muted-foreground">{i18n.empty}</p>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((event) => (
            <ActivityTimelineItem
              key={event.id}
              event={event}
              formatDateTime={formatDateTimeFn}
              byActor={i18n.byActor}
              ongoingLabel={i18n.ongoing}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ActivityTimelineItem({
  event,
  formatDateTime: formatDateTimeFn,
  byActor,
  ongoingLabel,
}: {
  event: ActivityTimelineEvent
  formatDateTime: (value: string | Date) => string
  byActor: string
  ongoingLabel: string
}) {
  const Icon = event.icon
  const timestamp = event.isOngoing ? ongoingLabel : formatDateTimeFn(event.timestamp)
  const actor = event.actorId && event.actorId !== "system" ? event.actorId : null
  const meta = actor
    ? byActor.replace("{actor}", actor).replace("{timestamp}", timestamp)
    : timestamp

  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden={true} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium capitalize">{event.title}</p>
          {event.badge ? (
            <Badge variant="outline" className="text-xs capitalize">
              {event.badge}
            </Badge>
          ) : null}
        </div>
        {event.description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{event.description}</p>
        ) : null}
        <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>
      </div>
    </div>
  )
}
