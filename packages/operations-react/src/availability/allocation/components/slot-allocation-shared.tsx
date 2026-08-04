"use client"

import type {
  AllocationAuditLogEntry,
  AllocationManifestTraveler,
  AllocationPaymentStatus,
  AllocationResource,
} from "@voyant-travel/operations-react/availability"
import { Badge, Card, CardContent, CardHeader, CardTitle, cn } from "@voyant-travel/ui/components"
import { Accessibility, Crown, History, UtensilsCrossed } from "lucide-react"
import type { ReactNode } from "react"

import { useAllocationUiI18nOrDefault, useAllocationUiMessagesOrDefault } from "../i18n/index.js"
import { flagString } from "./slot-allocation-model.js"

/**
 * Passive grouping container used by the unallocated column and other
 * card-shaped sections. Used to be a drop target during the drag-and-
 * drop era; switched to click-to-allocate, so it's now a plain layout
 * primitive. Kept as a named export so render-prop consumers can
 * compose new sections without re-exporting Card pieces themselves.
 */
export function AllocationColumn({
  id,
  icon,
  title,
  description,
  count,
  capacity,
  action,
  children,
}: {
  id: string
  icon: ReactNode
  title: string
  description: string
  count: number
  capacity: number
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card id={id} className="min-h-40">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {icon}
            {title}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={count > capacity ? "destructive" : "outline"}>
            {count}/{capacity}
          </Badge>
          {action}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">{children}</CardContent>
    </Card>
  )
}

export function TravelerTile({
  traveler,
  sharingGroupLabel,
  renderActions,
}: {
  traveler: AllocationManifestTraveler
  sharingGroupLabel?: string | null
  renderActions?: (traveler: AllocationManifestTraveler) => ReactNode
}) {
  const messages = useAllocationUiMessagesOrDefault()

  return (
    <div
      className={cn(
        "group flex items-start justify-between gap-3 rounded-md border bg-background p-3 text-sm shadow-sm",
        paymentStatusChipClass(traveler.paymentStatus),
      )}
      title={paymentStatusTooltip(traveler.paymentStatus, messages)}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {traveler.isLeadTraveler ? (
            <Crown className="size-3.5 text-amber-500" aria-label={messages.lead} />
          ) : null}
          {traveler.bookingSequence > 0 ? (
            <span className="text-muted-foreground tabular-nums" aria-hidden="true">
              ({traveler.bookingSequence})
            </span>
          ) : null}
          <span className="truncate font-medium">{traveler.fullName}</span>
          {traveler.sharingGroupId ? (
            <Badge variant="secondary" className="max-w-full truncate text-[10px]">
              {sharingGroupLabel ?? messages.sharingGroup}
            </Badge>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{traveler.bookingNumber}</span>
          {traveler.roomTypeId ? <span>{traveler.roomTypeId}</span> : null}
          {traveler.bedPreference ? <span>{traveler.bedPreference}</span> : null}
          {traveler.hasAccessibilityNeeds ? (
            <Accessibility className="size-3.5" aria-label={messages.accessibility} />
          ) : null}
          {traveler.hasDietaryRequirements ? (
            <UtensilsCrossed className="size-3.5" aria-label={messages.dietary} />
          ) : null}
        </div>
      </div>
      {renderActions ? <div className="shrink-0">{renderActions(traveler)}</div> : null}
    </div>
  )
}

export function ResourceFlagBadges({ resource }: { resource: AllocationResource }) {
  const messages = useAllocationUiMessagesOrDefault()
  const flags = resource.flags
  const badges: string[] = []

  if (flags.accessibilityNeeded === true) badges.push(messages.accessibility)
  if (flags.smokingAllowed === true) badges.push(messages.smokingAllowed)
  if (typeof flags.note === "string" && flags.note.trim()) badges.push(flags.note.trim())

  if (badges.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((badge) => (
        <Badge key={badge} variant="outline" className="max-w-full truncate text-[10px]">
          {badge}
        </Badge>
      ))}
    </div>
  )
}

export function SeatPositionBadge({ seat }: { seat: AllocationResource }) {
  const messages = useAllocationUiMessagesOrDefault()
  const position = flagString(seat.flags.position)
  if (!position) return null

  const label =
    position === "window"
      ? messages.windowSeat
      : position === "aisle"
        ? messages.aisleSeat
        : position === "middle"
          ? messages.middleSeat
          : position

  return (
    <Badge variant="outline" className="text-[10px]">
      {label}
    </Badge>
  )
}

export function AuditLogCard({ entries }: { entries: AllocationAuditLogEntry[] }) {
  const { formatDateTime, messages } = useAllocationUiI18nOrDefault()
  if (entries.length === 0) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 py-3">
        <History className="size-4 text-muted-foreground" aria-hidden="true" />
        <div>
          <CardTitle className="text-base">{messages.auditLog}</CardTitle>
          <p className="text-xs text-muted-foreground">{messages.auditLogDescription}</p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {entries.slice(0, 8).map((entry) => (
          <div key={entry.id} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
            <Badge variant="outline">{messages.auditActions[entry.action] ?? entry.action}</Badge>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {entryDetail(entry)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function entryDetail(entry: AllocationAuditLogEntry) {
  const after = entry.after ?? {}
  if (entry.action === "auto-allocate") {
    return `${after.kind ?? ""}: ${after.assigned ?? 0} assigned, ${after.skipped ?? 0} skipped`
  }
  if (entry.action === "resources.materialize") {
    return `${after.kind ?? ""}: ${after.created ?? 0} created`
  }
  if (entry.action.startsWith("resource.")) {
    return [after.kind, after.label, after.capacity ? `capacity ${after.capacity}` : null]
      .filter(Boolean)
      .join(" · ")
  }
  if (entry.action.startsWith("traveler.")) {
    return [after.kind, after.resourceId, after.sharingGroupId].filter(Boolean).join(" · ")
  }
  if (entry.action.startsWith("sharing-group.")) {
    return [after.sharingGroupId, after.label].filter(Boolean).join(" · ")
  }
  return JSON.stringify(after)
}

/**
 * Border + background tint that mirrors the booking's payment status:
 * red for unpaid, amber for partial, emerald for paid. Tailwind class
 * names are written explicitly (no template strings) so the v4 JIT
 * scanner picks them up.
 *
 * The saturation was bumped to `/20` background + `/70` border (from the
 * earlier `/5` + `/40`) because the lower opacities rendered as no color
 * on dark themes — the chips looked uncolored even though the helper
 * was being applied.
 */
export function paymentStatusChipClass(status: AllocationPaymentStatus): string {
  switch (status) {
    case "paid":
      return "border-emerald-500/70 bg-emerald-500/20 text-emerald-700 dark:text-emerald-200"
    case "partial":
      return "border-amber-500/70 bg-amber-500/20 text-amber-700 dark:text-amber-200"
    case "unpaid":
      return "border-rose-500/70 bg-rose-500/20 text-rose-700 dark:text-rose-200"
  }
}

export function paymentStatusTooltip(
  status: AllocationPaymentStatus,
  messages: ReturnType<typeof useAllocationUiMessagesOrDefault>,
): string {
  return messages.paymentStatusLabels?.[status] ?? status
}
