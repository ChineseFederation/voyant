"use client"

import type { QueryClient } from "@tanstack/react-query"
import { useQuery } from "@tanstack/react-query"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
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
import { CalendarDays, Package, Pencil, Truck } from "lucide-react"
import { type ReactNode, useState } from "react"
import { useAvailabilityUiI18nOrDefault } from "../i18n/index.js"
import {
  getPickupPointsQueryOptions,
  getProductQueryOptions,
  getSlotAllocationQueryOptions,
  getSlotAssignmentsQueryOptions,
  getSlotCloseoutsQueryOptions,
  getSlotPickupsQueryOptions,
  getSlotQueryOptions,
  getSlotResourcesQueryOptions,
  slotStatusTone,
  useAvailabilitySlotMutation,
  useSlotAllocationAuditLog,
  useVoyantAvailabilityContext,
  type VoyantAvailabilityContextValue,
} from "../index.js"
import { getSlotStatusLabel } from "./availability-columns.js"
import { AvailabilitySlotDetailSkeleton } from "./availability-skeletons.js"
import { ActivityTimeline } from "./availability-slot-detail-activity.js"
import { aggregateSlotFinancials, KpiStrip } from "./availability-slot-detail-financials.js"
import {
  computeSlotNightsLabel,
  formatSlotDateRange,
  MetaTab,
} from "./availability-slot-detail-meta.js"
import { slotStatusToneClass } from "./slot-status-tone.js"

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
   * Content for the Allocation tab. Hosts mount their allocation
   * manager here (for example, `SlotAllocationPage` from
   * `@voyant-travel/operations-react/availability/allocation` in `embed` mode).
   * When omitted, the tab shows a stub message instead.
   */
  renderAllocation?: (context: { slotId: string; productId: string | null }) => ReactNode
  /**
   * Content for the Extras tab. Hosts that mount `@voyant-travel/bookings/extras` can
   * render a slot-level operations manifest here without making
   * availability-ui depend on booking extras UI.
   */
  renderExtras?: (context: { slotId: string; productId: string | null }) => ReactNode
  extrasTabLabel?: ReactNode
}

export function getAvailabilitySlotDetailQueryOptions(
  client: VoyantAvailabilityContextValue,
  id: string | null | undefined,
) {
  return getSlotQueryOptions(client, id)
}

export function getAvailabilitySlotProductQueryOptions(
  client: VoyantAvailabilityContextValue,
  productId: string | null | undefined,
) {
  return getProductQueryOptions(client, productId)
}

export function getAvailabilitySlotPickupsQueryOptions(
  client: VoyantAvailabilityContextValue,
  id: string | null | undefined,
) {
  return getSlotPickupsQueryOptions(client, id, { limit: 25, offset: 0 })
}

export function getAvailabilitySlotPickupPointsQueryOptions(
  client: VoyantAvailabilityContextValue,
  productId: string | null | undefined,
) {
  return getPickupPointsQueryOptions(client, {
    productId: productId ?? undefined,
    limit: 25,
    offset: 0,
  })
}

export function getAvailabilitySlotCloseoutsQueryOptions(
  client: VoyantAvailabilityContextValue,
  id: string | null | undefined,
) {
  return getSlotCloseoutsQueryOptions(client, id, { limit: 25, offset: 0 })
}

export function getAvailabilitySlotAssignmentsQueryOptions(
  client: VoyantAvailabilityContextValue,
  id: string | null | undefined,
) {
  return getSlotAssignmentsQueryOptions(client, id, { limit: 25, offset: 0 })
}

export function getAvailabilitySlotResourcesQueryOptions(client: VoyantAvailabilityContextValue) {
  return getSlotResourcesQueryOptions(client, { limit: 25, offset: 0 })
}

export function getAvailabilitySlotAllocationQueryOptions(
  client: VoyantAvailabilityContextValue,
  id: string | null | undefined,
) {
  return getSlotAllocationQueryOptions(client, id)
}

export async function loadAvailabilitySlotDetailPage(
  queryClient: QueryClient,
  client: VoyantAvailabilityContextValue,
  id: string,
) {
  const slotData = await queryClient.ensureQueryData(
    getAvailabilitySlotDetailQueryOptions(client, id),
  )

  return Promise.all([
    Promise.resolve(slotData),
    queryClient.ensureQueryData(getAvailabilitySlotPickupsQueryOptions(client, id)),
    queryClient.ensureQueryData(getAvailabilitySlotCloseoutsQueryOptions(client, id)),
    queryClient.ensureQueryData(getAvailabilitySlotAssignmentsQueryOptions(client, id)),
    queryClient.ensureQueryData(getAvailabilitySlotResourcesQueryOptions(client)),
    queryClient.ensureQueryData(getAvailabilitySlotAllocationQueryOptions(client, id)),
    queryClient.ensureQueryData(
      getAvailabilitySlotProductQueryOptions(client, slotData.data.productId),
    ),
    queryClient.ensureQueryData(
      getAvailabilitySlotPickupPointsQueryOptions(client, slotData.data.productId),
    ),
  ])
}

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
}: AvailabilitySlotDetailPageProps) {
  const client = useVoyantAvailabilityContext()
  const i18n = useAvailabilityUiI18nOrDefault()
  const messages = i18n.messages
  const detailMessages = messages.details
  const noValue = detailMessages.noValue
  const slotMutation = useAvailabilitySlotMutation()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const { data: slotData, isPending } = useQuery(getAvailabilitySlotDetailQueryOptions(client, id))
  const slot = slotData?.data
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
  const resourceById = new Map((resourcesQuery.data?.data ?? []).map((item) => [item.id, item]))
  const allocationBookings = allocationQuery.data?.data.bookings ?? []
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
  const productSellCurrency = productQuery.data?.data.sellCurrency ?? null
  const financialRollup = aggregateSlotFinancials(allocationBookings, productSellCurrency)

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

  const handleDelete = async () => {
    await slotMutation.remove.mutateAsync(slot.id)
    setDeleteDialogOpen(false)
    onDeleted?.()
  }

  const fallbackActions = headerActions ?? (
    <div className="flex flex-wrap items-center gap-2">
      {onEdit ? (
        <Button variant="outline" onClick={onEdit}>
          <Pencil data-icon="inline-start" aria-hidden="true" />
          {detailMessages.editSlot}
        </Button>
      ) : null}
      {slot.productId && onOpenProduct ? (
        <Button variant="outline" onClick={() => onOpenProduct(slot.productId)}>
          <Package data-icon="inline-start" aria-hidden="true" />
          {detailMessages.openProduct}
        </Button>
      ) : null}
      <Button
        variant="destructive"
        onClick={() => setDeleteDialogOpen(true)}
        disabled={slotMutation.remove.isPending}
      >
        {detailMessages.delete}
      </Button>
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{detailMessages.slot.deleteConfirm}</AlertDialogTitle>
            <AlertDialogDescription>{detailMessages.slot.deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{detailMessages.slot.deleteCancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={slotMutation.remove.isPending}
            >
              {detailMessages.slot.deleteConfirmAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {breadcrumb ? <div className="text-sm">{breadcrumb}</div> : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{titleText}</h1>
            <Badge variant="outline" className={slotStatusToneClass[slotStatusTone[slot.status]]}>
              {getSlotStatusLabel(slot.status, messages)}
            </Badge>
            {productTypeName ? <Badge variant="outline">{productTypeName}</Badge> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {dateRangeLabel}
              {nightsLabel ? ` · ${nightsLabel}` : null}
            </span>
            <Badge variant="outline">{slot.timezone}</Badge>
          </div>
          {flagBadges.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {flagBadges.map((label) => (
                <Badge key={label} variant="secondary">
                  {label}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        {fallbackActions}
      </div>

      <KpiStrip
        slot={slot}
        rollup={financialRollup}
        formatCurrency={i18n.formatCurrency}
        i18nLabels={{
          pax: detailMessages.slot.paxKpiLabel,
          total: detailMessages.slot.totalKpiLabel,
          paid: detailMessages.slot.paidKpiLabel,
          outstanding: detailMessages.slot.outstandingKpiLabel,
          mixedHint: detailMessages.slot.mixedCurrenciesHint,
          noValue,
        }}
      />

      <Tabs defaultValue="allocation">
        <TabsList className="flex h-auto w-fit flex-wrap justify-start">
          <TabsTrigger value="allocation">{detailMessages.tabs.allocation}</TabsTrigger>
          {renderExtras ? (
            <TabsTrigger value="extras">{extrasTabLabel ?? detailMessages.tabs.extras}</TabsTrigger>
          ) : null}
          {pickupRows.length > 0 ? (
            <TabsTrigger value="pickup">
              {detailMessages.tabs.pickup}
              <Badge variant="outline" className="ml-1.5">
                {pickupRows.length}
              </Badge>
            </TabsTrigger>
          ) : null}
          {closeoutRows.length > 0 ? (
            <TabsTrigger value="closeouts">
              {detailMessages.tabs.closeouts}
              <Badge variant="outline" className="ml-1.5">
                {closeoutRows.length}
              </Badge>
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="activity">
            {detailMessages.tabs.activity}
            {auditEntries.length > 0 ? (
              <Badge variant="outline" className="ml-1.5">
                {auditEntries.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="meta">{detailMessages.tabs.meta}</TabsTrigger>
        </TabsList>

        <TabsContent value="allocation" className="mt-4">
          {renderAllocation ? (
            renderAllocation({ slotId: id, productId: slot.productId })
          ) : (
            <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              {detailMessages.tabs.allocationUnwired}
            </p>
          )}
        </TabsContent>

        {renderExtras ? (
          <TabsContent value="extras" className="mt-4">
            {renderExtras({ slotId: id, productId: slot.productId })}
          </TabsContent>
        ) : null}

        {pickupRows.length > 0 ? (
          <TabsContent value="pickup" className="mt-4">
            <div className="flex flex-col gap-3 text-sm">
              {pickupRows.map((pickup) => {
                const point = pickupPointById.get(pickup.pickupPointId)
                return (
                  <div key={pickup.id} className="rounded-md border p-3">
                    <div className="flex items-center gap-2 font-medium">
                      <Truck className="size-4" aria-hidden="true" />
                      {point?.name ?? pickup.pickupPointId}
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      {point?.locationText ?? detailMessages.slot.noLocationText}
                    </div>
                    <div className="mt-2">
                      {detailMessages.slot.initialLabel}: {pickup.initialCapacity ?? noValue} ·{" "}
                      {detailMessages.slot.remainingLabel}: {pickup.remainingCapacity ?? noValue}
                    </div>
                  </div>
                )
              })}
            </div>
          </TabsContent>
        ) : null}

        {closeoutRows.length > 0 ? (
          <TabsContent value="closeouts" className="mt-4">
            <div className="flex flex-col gap-3 text-sm">
              {closeoutRows.map((closeout) => (
                <div key={closeout.id} className="rounded-md border p-3">
                  <div className="flex items-center gap-2 font-medium">
                    <CalendarDays className="size-4" aria-hidden="true" />
                    {closeout.dateLocal}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {detailMessages.slot.createdByLabel}: {closeout.createdBy ?? noValue}
                  </div>
                  {closeout.reason ? (
                    <div className="mt-2 whitespace-pre-wrap">{closeout.reason}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </TabsContent>
        ) : null}

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
            resourceById={resourceById}
            bookingById={bookingById}
            travelerById={travelerById}
            formatDateTime={i18n.formatDateTime}
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

        <TabsContent value="meta" className="mt-4">
          <MetaTab
            slot={slot}
            productName={productName}
            statusLabel={getSlotStatusLabel(slot.status, messages)}
            onOpenProduct={onOpenProduct}
            onOpenStartTime={onOpenStartTime}
            i18n={{
              title: detailMessages.tabs.metaTitle,
              slotIdLabel: detailMessages.tabs.metaSlotId,
              ruleLabel: detailMessages.slot.ruleLabel,
              startTimeLabel: detailMessages.slot.startTimeIdLabel,
              endsAtLabel: detailMessages.slot.endsAtLabel,
              createdLabel: detailMessages.createdLabel,
              updatedLabel: detailMessages.updatedLabel,
              productLabel: messages.productLabel,
              statusLabel: messages.statusLabel,
              timezoneLabel: messages.timezoneLabel,
              noValue,
              format: i18n.formatDateTime,
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export type { SlotFinancialRollup } from "./availability-slot-detail-financials.js"
export { aggregateSlotFinancials } from "./availability-slot-detail-financials.js"
