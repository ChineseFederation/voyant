"use client"

import { useQuery } from "@tanstack/react-query"
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@voyant-travel/ui/components"
import { type ReactNode, useState } from "react"
import { useAvailabilityUiI18nOrDefault } from "../i18n/index.js"
import {
  type DepartureIssue,
  type DepartureWorkspaceTab,
  defaultDepartureWorkspaceTab,
  useAvailabilitySlotMutation,
  useSlotAllocationAuditLog,
  useVoyantAvailabilityContext,
} from "../index.js"
import { getSlotStatusLabel } from "./availability-columns.js"
import { AvailabilitySlotDetailSkeleton } from "./availability-skeletons.js"
import { ActivityTimeline } from "./availability-slot-detail-activity.js"
import {
  getAvailabilitySlotAllocationQueryOptions,
  getAvailabilitySlotAssignmentsQueryOptions,
  getAvailabilitySlotCloseoutsQueryOptions,
  getAvailabilitySlotDetailQueryOptions,
  getAvailabilitySlotPickupPointsQueryOptions,
  getAvailabilitySlotPickupsQueryOptions,
  getAvailabilitySlotProductQueryOptions,
  getAvailabilitySlotResourcesQueryOptions,
  getAvailabilitySlotSummaryQueryOptions,
} from "./availability-slot-detail-data.js"
import { computeSlotNightsLabel, formatSlotDateRange } from "./availability-slot-detail-meta.js"
import {
  type DepartureLinkTarget,
  resolveAllocationResourceTarget,
} from "./departure-deep-links.js"
import type { DepartureIssueAction } from "./departure-issues.js"
import { DepartureFinancialsSection } from "./departure-workspace-financials.js"
import { DepartureWorkspaceHeader } from "./departure-workspace-header.js"
import { DepartureHeadline } from "./departure-workspace-headline.js"
import { DepartureOperationsSection } from "./departure-workspace-operations.js"
import { DepartureOverviewSection } from "./departure-workspace-overview.js"
import {
  DepartureResourcesSection,
  departureResourceLabel,
  linkTargetLabel,
} from "./departure-workspace-resources.js"
import { DepartureTravelersSection } from "./departure-workspace-travelers.js"

export interface AvailabilitySlotDetailPageProps {
  id: string
  className?: string
  onBack?: () => void
  onDeleted?: () => void
  onOpenProduct?: (productId: string) => void
  onOpenStartTime?: (startTimeId: string) => void
  /**
   * Opens the host's slot-edit dialog (status / pax / dates / notes …).
   * The detail page only surfaces the button — the host owns the dialog
   * because it already has the catalog data (products / rules / start
   * times) the edit form needs.
   */
  onEdit?: () => void
  /**
   * Breadcrumb element rendered above the page header. Hosts that
   * already render breadcrumbs in their sidebar inset top bar can
   * leave this undefined.
   */
  breadcrumb?: ReactNode
  /**
   * Primary header actions (Open product, Delete, …). When supplied,
   * the in-page action buttons are hidden so the host can render the
   * same actions in the inset top bar instead.
   */
  headerActions?: ReactNode
  /**
   * Content for the Allocation section. Hosts mount their allocation
   * manager here (for example, `SlotAllocationPage` from
   * `@voyant-travel/operations-react/availability/allocation` in `embed` mode).
   * When omitted, the section shows a stub message instead.
   */
  renderAllocation?: (context: { slotId: string; productId: string | null }) => ReactNode
  /**
   * Content for the Extras section inside Operations. Hosts that mount
   * `@voyant-travel/bookings/extras` can render a slot-level operations
   * manifest here without making this package depend on booking extras UI.
   */
  renderExtras?: (context: { slotId: string; productId: string | null }) => ReactNode
  /** Overrides the Extras section heading (Bookings owns that vocabulary). */
  extrasTabLabel?: ReactNode
  /**
   * The workspace section to show. Controlled by the host so the section is
   * URL-addressable (`?tab=financials`); when omitted the workspace keeps the
   * selection in component state and a reload lands back on Overview.
   */
  tab?: DepartureWorkspaceTab
  onTabChange?: (tab: DepartureWorkspaceTab) => void
  /** Opens a booking (quick view or detail). */
  onOpenBooking?: (bookingId: string) => void
  /** Opens a row in the operations resource pool. */
  onOpenResource?: (resourceId: string) => void
  /** Opens a supplier a resource is sourced from. */
  onOpenSupplier?: (supplierId: string) => void
  /** Opens Finance's departure profitability report. */
  onOpenFinanceReport?: () => void
  /** Next action for an empty roster: start a booking on this departure. */
  onCreateBooking?: () => void
  /** Next action for an empty Pickup section. */
  onAddPickupPoint?: () => void
  /** Next action for an empty Closeouts section. */
  onAddCloseout?: () => void
}

export {
  getAvailabilitySlotAllocationQueryOptions,
  getAvailabilitySlotAssignmentsQueryOptions,
  getAvailabilitySlotCloseoutsQueryOptions,
  getAvailabilitySlotDetailQueryOptions,
  getAvailabilitySlotPickupPointsQueryOptions,
  getAvailabilitySlotPickupsQueryOptions,
  getAvailabilitySlotProductQueryOptions,
  getAvailabilitySlotResourcesQueryOptions,
  getAvailabilitySlotSummaryQueryOptions,
  loadAvailabilitySlotDetailPage,
} from "./availability-slot-detail-data.js"

/**
 * Which section repairs which issue. Departure-level codes name no row, so the
 * only useful navigation is the section that owns the fix; subject-bearing
 * codes prefer the subject's own destination and fall back to this.
 */
const ISSUE_REPAIR_TAB: Record<string, DepartureWorkspaceTab> = {
  allocation_on_cancelled_booking: "travelers",
  allocation_resources_missing: "allocation",
  resource_over_capacity: "allocation",
  stale_held_allocation: "travelers",
  travelers_exceed_booked_pax: "travelers",
  travelers_missing_for_booked_pax: "travelers",
  travelers_unassigned: "allocation",
}

/**
 * The departure workspace: capacity, Bookings and Travelers reconciled in one
 * place (issue #4033).
 *
 * Six sections, every one of them rendered whether or not it has rows —
 * Pickup and Closeouts used to disappear entirely when empty, which made "not
 * set up" indistinguishable from "not applicable" and left the operator no way
 * to act. Each empty section now carries its next authorized action instead.
 */
export function AvailabilitySlotDetailPage({
  id,
  className,
  onBack: _onBack,
  onDeleted,
  onOpenProduct,
  onOpenStartTime,
  onEdit,
  breadcrumb,
  headerActions,
  renderAllocation,
  renderExtras,
  extrasTabLabel,
  tab,
  onTabChange,
  onOpenBooking,
  onOpenResource,
  onOpenSupplier,
  onOpenFinanceReport,
  onCreateBooking,
  onAddPickupPoint,
  onAddCloseout,
}: AvailabilitySlotDetailPageProps) {
  const client = useVoyantAvailabilityContext()
  const i18n = useAvailabilityUiI18nOrDefault()
  const messages = i18n.messages
  const detailMessages = messages.details
  const departureMessages = detailMessages.departure
  const noValue = detailMessages.noValue
  const slotMutation = useAvailabilitySlotMutation()
  const [uncontrolledTab, setUncontrolledTab] = useState<DepartureWorkspaceTab>(
    defaultDepartureWorkspaceTab,
  )
  const activeTab = tab ?? uncontrolledTab
  const selectTab = (next: DepartureWorkspaceTab) => {
    setUncontrolledTab(next)
    onTabChange?.(next)
  }

  const { data: slotData, isPending } = useQuery(getAvailabilitySlotDetailQueryOptions(client, id))
  const slot = slotData?.data
  const summaryQuery = useQuery(getAvailabilitySlotSummaryQueryOptions(client, id))
  const summary = summaryQuery.data?.data ?? null
  const productQuery = useQuery({
    ...getAvailabilitySlotProductQueryOptions(client, slot?.productId ?? ""),
    enabled: Boolean(slot?.productId),
  })
  const slotPickupsQuery = useQuery(getAvailabilitySlotPickupsQueryOptions(client, id))
  const pickupPointsQuery = useQuery({
    ...getAvailabilitySlotPickupPointsQueryOptions(client, slot?.productId ?? ""),
    enabled: Boolean(slot?.productId),
  })
  const closeoutsQuery = useQuery(getAvailabilitySlotCloseoutsQueryOptions(client, id))
  const assignmentsQuery = useQuery(getAvailabilitySlotAssignmentsQueryOptions(client, id))
  const resourcesQuery = useQuery(getAvailabilitySlotResourcesQueryOptions(client))
  const allocationQuery = useQuery(getAvailabilitySlotAllocationQueryOptions(client, id))
  const auditLogQuery = useSlotAllocationAuditLog({ slotId: id })

  if (isPending) {
    return <AvailabilitySlotDetailSkeleton />
  }

  if (!slot) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-muted-foreground">{detailMessages.slot.notFound}</p>
      </div>
    )
  }

  const pickupPointById = new Map(
    (pickupPointsQuery.data?.data ?? []).map((item) => [item.id, item]),
  )
  // The operations RESOURCE POOL (`/v1/admin/operations/resources`). Slot
  // assignments reference these rows.
  const poolResourceById = new Map((resourcesQuery.data?.data ?? []).map((item) => [item.id, item]))
  const allocationBookings = allocationQuery.data?.data.bookings ?? []
  // This departure's own `allocation_resources`. The allocation AUDIT LOG
  // references these — a different table from the pool above, which is why
  // resolving audit entries against the pool always missed and rendered a raw
  // id. The manifest is the primary source; the summary's breakdown backfills
  // any row the manifest page did not carry.
  const allocationResourceById = new Map<string, { id: string; name: string }>()
  for (const resource of summary?.capacity.resourceBreakdown ?? []) {
    allocationResourceById.set(resource.id, {
      id: resource.id,
      name: departureResourceLabel(resource),
    })
  }
  for (const resource of allocationQuery.data?.data.resources ?? []) {
    allocationResourceById.set(resource.id, {
      id: resource.id,
      name: departureResourceLabel(resource),
    })
  }
  const resourceLabelById = new Map<string, string>()
  for (const [resourceId, resource] of allocationResourceById) {
    resourceLabelById.set(resourceId, resource.name)
  }
  const resourceBreakdownById = new Map(
    (summary?.capacity.resourceBreakdown ?? []).map((resource) => [resource.id, resource]),
  )
  const bookingById = new Map(allocationBookings.map((item) => [item.id, item]))
  const travelerById = new Map<
    string,
    { fullName: string; bookingNumber: string; bookingId: string }
  >()
  for (const booking of allocationBookings) {
    for (const traveler of booking.travelers) {
      travelerById.set(traveler.id, {
        fullName: traveler.fullName,
        bookingNumber: traveler.bookingNumber,
        bookingId: traveler.bookingId,
      })
    }
  }

  const productName = productQuery.data?.data.name ?? null
  const productTypeName = productQuery.data?.data.productType?.name ?? null
  const dateRangeLabel = formatSlotDateRange(slot)
  const nightsLabel = computeSlotNightsLabel(slot, detailMessages.duration)
  const titleText = productName ?? dateRangeLabel
  const flagBadges = [
    slot.unlimited ? detailMessages.slot.unlimitedLabel : null,
    slot.pastCutoff ? detailMessages.slot.pastCutoffLabel : null,
    slot.tooEarly ? detailMessages.slot.tooEarlyLabel : null,
  ].filter((value): value is string => Boolean(value))

  const pickupRows = slotPickupsQuery.data?.data ?? []
  const assignmentRows = assignmentsQuery.data?.data ?? []
  const closeoutRows = closeoutsQuery.data?.data ?? []
  const auditEntries = auditLogQuery.data?.data ?? []

  const openLink = (target: DepartureLinkTarget) => {
    switch (target.kind) {
      case "resource":
        onOpenResource?.(target.resourceId)
        return
      case "supplier":
        onOpenSupplier?.(target.supplierId)
        return
      case "product":
        onOpenProduct?.(target.productId)
        return
      case "booking":
        onOpenBooking?.(target.bookingId)
    }
  }
  const canOpenLink = (target: DepartureLinkTarget): boolean => {
    switch (target.kind) {
      case "resource":
        return Boolean(onOpenResource)
      case "supplier":
        return Boolean(onOpenSupplier)
      case "product":
        return Boolean(onOpenProduct)
      case "booking":
        return Boolean(onOpenBooking)
    }
  }

  const tabLabels: Record<DepartureWorkspaceTab, string> = departureMessages.tabs
  const goToSection = (target: DepartureWorkspaceTab): DepartureIssueAction => ({
    label: departureMessages.links.goToSection.replace("{section}", tabLabels[target]),
    onSelect: () => selectTab(target),
  })

  const resolveIssueAction = (issue: DepartureIssue): DepartureIssueAction | null => {
    if (issue.subjectType === "booking" && onOpenBooking) {
      return {
        label: departureMessages.links.openBooking,
        onSelect: () => onOpenBooking(issue.subjectId),
      }
    }
    if (issue.subjectType === "allocation_resource") {
      const resource = resourceBreakdownById.get(issue.subjectId)
      const target = resource
        ? resolveAllocationResourceTarget(resource, { productId: slot.productId })
        : null
      if (target && canOpenLink(target)) {
        return {
          label: linkTargetLabel(target, departureMessages.links),
          onSelect: () => openLink(target),
        }
      }
    }
    if (issue.code === "departure_not_version_bound" && onOpenProduct) {
      return {
        label: departureMessages.links.openProduct,
        onSelect: () => onOpenProduct(slot.productId),
      }
    }
    const repairTab = ISSUE_REPAIR_TAB[issue.code]
    return repairTab ? goToSection(repairTab) : null
  }

  const handleDelete = async () => {
    await slotMutation.remove.mutateAsync(slot.id)
    onDeleted?.()
  }

  const attentionCount =
    (summary?.operations.criticalCount ?? 0) + (summary?.operations.warningCount ?? 0)
  const logisticsCount = pickupRows.length + closeoutRows.length

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {breadcrumb ? <div className="text-sm">{breadcrumb}</div> : null}

      <DepartureWorkspaceHeader
        slot={slot}
        titleText={titleText}
        productTypeName={productTypeName}
        dateRangeLabel={dateRangeLabel}
        nightsLabel={nightsLabel}
        flagBadges={flagBadges}
        messages={messages}
        headerActions={headerActions}
        onEdit={onEdit}
        onOpenProduct={onOpenProduct}
        onDelete={handleDelete}
        deletePending={slotMutation.remove.isPending}
      />

      {summary ? (
        <DepartureHeadline
          summary={summary}
          formatCurrency={i18n.formatCurrency}
          messages={{
            pax: detailMessages.slot.paxKpiLabel,
            total: detailMessages.slot.totalKpiLabel,
            paid: detailMessages.slot.paidKpiLabel,
            outstanding: detailMessages.slot.outstandingKpiLabel,
            mixedHint: detailMessages.slot.mixedCurrenciesHint,
            noValue,
          }}
        />
      ) : null}

      <Tabs value={activeTab} onValueChange={(next) => selectTab(next as DepartureWorkspaceTab)}>
        <TabsList className="flex h-auto w-fit flex-wrap justify-start">
          <TabsTrigger value="overview">
            {tabLabels.overview}
            {attentionCount > 0 ? (
              <Badge variant="outline" className="ml-1.5">
                {attentionCount}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="travelers">
            {tabLabels.travelers}
            {summary && summary.travelers.entered > 0 ? (
              <Badge variant="outline" className="ml-1.5">
                {summary.travelers.entered}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="allocation">{tabLabels.allocation}</TabsTrigger>
          <TabsTrigger value="operations">
            {tabLabels.operations}
            {logisticsCount > 0 ? (
              <Badge variant="outline" className="ml-1.5">
                {logisticsCount}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="financials">{tabLabels.financials}</TabsTrigger>
          <TabsTrigger value="activity">
            {tabLabels.activity}
            {auditEntries.length > 0 ? (
              <Badge variant="outline" className="ml-1.5">
                {auditEntries.length}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <DepartureOverviewSection
            summary={summary}
            slot={slot}
            productName={productName}
            statusLabel={getSlotStatusLabel(slot.status, messages)}
            messages={messages}
            formatDateTime={i18n.formatDateTime}
            onEdit={onEdit}
            onClearIssues={() => selectTab("travelers")}
            resolveIssueAction={resolveIssueAction}
            onOpenProduct={onOpenProduct}
            onOpenStartTime={onOpenStartTime}
          />
        </TabsContent>

        <TabsContent value="travelers" className="mt-4">
          <DepartureTravelersSection
            summary={summary}
            bookings={allocationBookings}
            resourceLabelById={resourceLabelById}
            messages={messages}
            onCreateBooking={onCreateBooking}
            onOpenBooking={onOpenBooking}
          />
        </TabsContent>

        <TabsContent value="allocation" className="mt-4 flex flex-col gap-8">
          {renderAllocation ? (
            renderAllocation({ slotId: id, productId: slot.productId })
          ) : (
            <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              {detailMessages.tabs.allocationUnwired}
            </p>
          )}
          <DepartureResourcesSection
            summary={summary}
            messages={messages}
            productId={slot.productId}
            onOpenLink={openLink}
          />
        </TabsContent>

        <TabsContent value="operations" className="mt-4">
          <DepartureOperationsSection
            summary={summary}
            pickupRows={pickupRows}
            pickupPointById={pickupPointById}
            closeoutRows={closeoutRows}
            messages={messages}
            renderExtras={
              renderExtras
                ? () => renderExtras({ slotId: id, productId: slot.productId })
                : undefined
            }
            extrasTitle={extrasTabLabel}
            onAddPickupPoint={onAddPickupPoint}
            onAddCloseout={onAddCloseout}
            onOpenProduct={onOpenProduct}
            productId={slot.productId}
          />
        </TabsContent>

        <TabsContent value="financials" className="mt-4">
          <DepartureFinancialsSection
            summary={summary}
            messages={messages}
            formatCurrency={i18n.formatCurrency}
            formatNumber={i18n.formatNumber}
            onOpenFinanceReport={onOpenFinanceReport}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-4 flex flex-col gap-4">
          {slot.notes ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {detailMessages.notesTitle}
                </CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">{slot.notes}</CardContent>
            </Card>
          ) : null}
          <ActivityTimeline
            assignments={assignmentRows}
            auditEntries={auditEntries}
            resourceById={poolResourceById}
            allocationResourceById={allocationResourceById}
            bookingById={bookingById}
            travelerById={travelerById}
            formatDateTime={i18n.formatDateTime}
            emptyAction={{
              title: departureMessages.activity.emptyTitle,
              description: departureMessages.activity.emptyDescription,
              actionLabel: departureMessages.activity.emptyAction,
              onAction: () => selectTab("allocation"),
            }}
            i18n={{
              title: detailMessages.tabs.activity,
              empty: detailMessages.tabs.activityEmpty,
              filterAll: detailMessages.tabs.activityFilterAll,
              filterAudit: detailMessages.tabs.activityFilterAudit,
              filterAssignments: detailMessages.tabs.activityFilterAssignments,
              byActor: detailMessages.tabs.activityByActor,
              unassignedResource: detailMessages.slot.unassignedResource,
              bookingLabel: detailMessages.slot.bookingLabel,
              auditActionLabels: detailMessages.tabs.auditActionLabels,
              ongoing: detailMessages.tabs.activityOngoing,
              noValue,
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export type { SlotFinancialRollup } from "./availability-slot-detail-financials.js"
export { aggregateSlotFinancials } from "./availability-slot-detail-financials.js"
