// agent-quality: file-size exception -- owner: bookings-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
"use client"

import { useOrganization, usePerson } from "@voyant-travel/relationships-react"
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
} from "@voyant-travel/ui/components"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@voyant-travel/ui/components/collapsible"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@voyant-travel/ui/components/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@voyant-travel/ui/components/tooltip"
import {
  Ban,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Info,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { Fragment, type ReactNode, useState } from "react"
import {
  formatMessage,
  useBookingsUiI18nOrDefault,
  useBookingsUiMessagesOrDefault,
} from "../i18n/index.js"
import { type BookingRecord, useBooking, useBookingItems, useBookingMutation } from "../index.js"
import { BookingActivityTimeline, type TimelineEvent } from "./booking-activity-timeline.js"
import { BookingBillingDialog } from "./booking-billing-dialog.js"
import { BookingCancellationDialog } from "./booking-cancellation-dialog.js"
import { BookingDialog } from "./booking-dialog.js"
import { BookingDisputeBanner } from "./booking-dispute-banner.js"
import { BookingGroupSection } from "./booking-group-section.js"
import { BookingGuaranteeList } from "./booking-guarantee-list.js"
import { BookingItemList, type BookingItemResourceKind } from "./booking-item-list.js"
import { BookingNotes } from "./booking-notes.js"
import { BookingPaymentScheduleList } from "./booking-payment-schedule-list.js"
import {
  BookingPaymentsSummary,
  type BookingPaymentsSummaryRow,
} from "./booking-payments-summary.js"
import { BookingRefundBanner } from "./booking-refund-banner.js"
import { StatusBadge } from "./status-badge.js"
import { StatusChangeDialog } from "./status-change-dialog.js"
import { SupplierStatusList } from "./supplier-status-list.js"
import { TravelerList } from "./traveler-list.js"

/**
 * Optional extra tab. When provided, the canonical layout renders a
 * trigger and a content panel. Modeled after PersonDetailPage's
 * commercial-tab slot shape. The trigger label falls back to the i18n
 * default (`messages.bookingDetailPage.tabInvoices` etc.).
 */
export interface BookingDetailTabSlot {
  label?: string
  /** Receives the loaded booking so the slot can use sell amount, ids, etc. */
  content: BookingDetailSlotContent
}

export type BookingDetailSlotContent = ReactNode | ((booking: BookingRecord) => ReactNode)

export interface BookingDetailPageSlots {
  /** Rendered between the title row and the summary card. */
  header?: (booking: BookingRecord) => ReactNode
  /** Rendered between the summary card and the tabs. */
  afterSummary?: (booking: BookingRecord) => ReactNode
  overviewStart?: (booking: BookingRecord) => ReactNode
  overviewEnd?: (booking: BookingRecord) => ReactNode
  travelersStart?: (booking: BookingRecord) => ReactNode
  financeStart?: (booking: BookingRecord) => ReactNode
  /** Replaces the default finance-tab `BookingPaymentsSummary` card. */
  paymentsContent?: BookingDetailSlotContent
  financeEnd?: (booking: BookingRecord) => ReactNode
  documents?: (booking: BookingRecord) => ReactNode
  activityEnd?: (booking: BookingRecord) => ReactNode
  /** Mounts a dedicated `Invoices` tab between Payments and Suppliers. */
  invoicesTab?: BookingDetailTabSlot
  /**
   * Extra events merged into the Activity-tab timeline. Operator
   * templates pass action-ledger entries here so the timeline stays a
   * single chronological feed.
   */
  activityExtraEvents?: readonly TimelineEvent[]
  /** Rendered below the activity timeline events — typically a "load more" pager. */
  activityTimelineFooter?: ReactNode
}

/** Tab values used by the canonical `BookingDetailPage`. */
export type BookingDetailTabValue =
  | "items"
  | "travelers"
  | "finance"
  | "invoices"
  | "documents"
  | "suppliers"
  | "activity"
  | "metadata"

export interface BookingDetailPageProps {
  id: string
  className?: string
  locale?: string
  /** When true, the inline `Bookings > #` breadcrumb is suppressed
   * (use when the host shell already renders breadcrumbs). */
  hideBreadcrumb?: boolean
  onBack?: () => void
  /**
   * Forwarded to the finance-tab `BookingPaymentsSummary` header as a
   * `Record payment` action button.
   */
  onRecordPayment?: (booking: BookingRecord) => void
  /**
   * When set, the Record payment header button renders disabled and its
   * tooltip shows this reason. Use for "nothing left to pay" states.
   */
  recordPaymentDisabledReason?: string | null
  /**
   * When set, the Add schedule button in the payment-schedule section
   * renders disabled and its tooltip shows this reason.
   */
  addScheduleDisabledReason?: string | null
  /**
   * Amount the customer has paid so far against this booking, in cents
   * of `booking.sellCurrency`. When provided, a `Paid` stat is shown
   * next to `Total`. Resolution (invoices vs. raw payments) is left to
   * the host template — `bookings-ui` doesn't fetch finance data.
   */
  paidAmountCents?: number | null
  /**
   * True when the host has found at least one recorded customer payment. Kept
   * separate from `paidAmountCents` because host invoice summaries can be
   * paginated while the cancellation settlement path checks all paid invoices.
   */
  hasRecordedPayment?: boolean
  /**
   * Open a linked resource referenced by a booking item (product or
   * availability slot) in the host app. When omitted, the item-snapshot
   * sheet renders the names as plain text.
   */
  onItemResourceOpen?: (kind: BookingItemResourceKind, id: string) => void
  /** Open the linked CRM person's detail page (used by the Payer card). */
  onPersonOpen?: (personId: string) => void
  /** Open the linked CRM organization's detail page (used by the Payer card). */
  onOrganizationOpen?: (organizationId: string) => void
  /**
   * Open an invoice in-place when the operator clicks the invoice
   * number in the Payments row. Typically wired to a `Sheet` that
   * renders the invoice-detail view so the admin doesn't leave the
   * booking screen.
   */
  onInvoiceOpen?: (invoiceId: string, row: BookingPaymentsSummaryRow) => void
  /** Forwarded to the finance-tab `BookingPaymentsSummary` row menu. */
  onViewPayment?: (row: BookingPaymentsSummaryRow) => void
  /** Forwarded to the finance-tab `BookingPaymentsSummary` row menu. */
  onEditPayment?: (row: BookingPaymentsSummaryRow) => void
  /** Forwarded to the finance-tab `BookingPaymentsSummary` row menu. */
  onDeletePayment?: (row: BookingPaymentsSummaryRow) => Promise<void> | void
  /**
   * Controlled active-tab value. Hosts wire this to their router so
   * the active tab can be reflected in the URL (`?tab=activity` etc.)
   * and the page reloads to the right tab when a link is shared.
   * Leave both `activeTab` + `onTabChange` undefined for uncontrolled
   * mode (defaults to `overview`).
   */
  activeTab?: BookingDetailTabValue
  /** Fires when the user switches tabs. Hosts push the new value into the URL. */
  onTabChange?: (tab: BookingDetailTabValue) => void
  slots?: BookingDetailPageSlots
}

export function BookingDetailPage({
  id,
  className,
  locale,
  hideBreadcrumb,
  onBack,
  onRecordPayment,
  recordPaymentDisabledReason,
  addScheduleDisabledReason,
  paidAmountCents,
  hasRecordedPayment,
  onItemResourceOpen,
  onPersonOpen,
  onOrganizationOpen,
  onInvoiceOpen,
  onViewPayment,
  onEditPayment,
  onDeletePayment,
  activeTab,
  onTabChange,
  slots,
}: BookingDetailPageProps) {
  const i18n = useBookingsUiI18nOrDefault()
  const messages = useBookingsUiMessagesOrDefault()
  const detailMessages = messages.bookingDetailPage
  const resolvedLocale = locale ?? i18n.locale
  const [editOpen, setEditOpen] = useState(false)
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const { data: bookingData, isPending } = useBooking(id)
  const { remove } = useBookingMutation()
  const headerPersonId = bookingData?.data?.personId ?? null
  const headerOrganizationId = bookingData?.data?.organizationId ?? null
  const headerPerson = usePerson(headerPersonId ?? undefined, {
    enabled: Boolean(headerPersonId),
  }).data
  const headerOrganization = useOrganization(headerOrganizationId ?? undefined, {
    enabled: Boolean(headerOrganizationId) && !headerPersonId,
  }).data
  // Pull booking items so the subtitle can link to the primary product
  // + availability slot. We pick the first item (or the one flagged
  // `isPrimary` when present) — most bookings only have one product.
  const headerItems = useBookingItems(id).data?.data ?? []
  const primaryItem =
    headerItems.find((item) => (item as { isPrimary?: boolean }).isPrimary) ??
    headerItems[0] ??
    null

  if (isPending) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <p className="text-sm text-muted-foreground">{messages.common.loading}</p>
      </div>
    )
  }

  const booking = bookingData?.data
  if (!booking) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-4 py-12", className)}>
        <p className="text-muted-foreground">{detailMessages.notFound}</p>
        {onBack ? (
          <Button variant="outline" onClick={onBack}>
            {detailMessages.backToBookings}
          </Button>
        ) : null}
      </div>
    )
  }

  const canCancel = ["confirmed", "in_progress"].includes(booking.status)
  const isCancelled = booking.status === "cancelled"
  const sellHint = booking.priceOverride?.isManual
    ? `${detailMessages.summaryPriceOverride}: ${booking.priceOverride.reason}`
    : undefined

  const billingPersonName =
    [booking.contactFirstName, booking.contactLastName].filter(Boolean).join(" ") ||
    (headerPerson
      ? [headerPerson.firstName, headerPerson.lastName].filter(Boolean).join(" ")
      : "") ||
    headerOrganization?.name ||
    ""
  const billingHref = headerPersonId
    ? () => onPersonOpen?.(headerPersonId)
    : headerOrganizationId
      ? () => onOrganizationOpen?.(headerOrganizationId)
      : null
  const billingClickable =
    billingHref && (headerPersonId ? Boolean(onPersonOpen) : Boolean(onOrganizationOpen))
  const headerDateRange = booking.startDate
    ? `${formatDate(booking.startDate, resolvedLocale, detailMessages.noValue)} - ${formatDate(
        booking.endDate,
        resolvedLocale,
        detailMessages.noValue,
      )}`
    : null
  const headerPax =
    booking.pax != null ? `${booking.pax} ${messages.bookingQuickViewSheet.paxSuffix}` : null
  const headerProductTitle = primaryItem?.productNameSnapshot ?? primaryItem?.title ?? null
  const headerProductId = primaryItem?.productId ?? null
  const headerSlotId = primaryItem?.availabilitySlotId ?? null
  const headerSubtitleParts = [
    billingPersonName ? (
      billingClickable ? (
        <button
          key="billing"
          type="button"
          onClick={billingHref}
          className="hover:text-foreground hover:underline"
        >
          {billingPersonName}
        </button>
      ) : (
        <span key="billing">{billingPersonName}</span>
      )
    ) : null,
    headerProductTitle ? (
      headerProductId && onItemResourceOpen ? (
        <button
          key="product"
          type="button"
          onClick={() => onItemResourceOpen("product", headerProductId)}
          className="inline-block max-w-[18rem] truncate align-bottom hover:text-foreground hover:underline"
          title={headerProductTitle}
        >
          {headerProductTitle}
        </button>
      ) : (
        <span
          key="product"
          className="inline-block max-w-[18rem] truncate align-bottom"
          title={headerProductTitle}
        >
          {headerProductTitle}
        </span>
      )
    ) : null,
    headerDateRange ? (
      headerSlotId && onItemResourceOpen ? (
        <button
          key="dates"
          type="button"
          onClick={() => onItemResourceOpen("availabilitySlot", headerSlotId)}
          className="hover:text-foreground hover:underline"
        >
          {headerDateRange}
        </button>
      ) : (
        <span key="dates">{headerDateRange}</span>
      )
    ) : null,
    headerPax ? <span key="pax">{headerPax}</span> : null,
  ].filter(Boolean) as ReactNode[]

  return (
    <div data-slot="booking-detail-page" className={cn("flex flex-col gap-6", className)}>
      {hideBreadcrumb ? null : (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="transition-colors hover:text-foreground"
            >
              {detailMessages.breadcrumbBookings}
            </button>
          ) : (
            <span>{detailMessages.breadcrumbBookings}</span>
          )}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="font-normal text-foreground">{booking.bookingNumber}</span>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{booking.bookingNumber}</h1>
            <StatusBadge status={booking.status}>
              {getBookingStatusLabel(booking.status, messages.common.bookingStatusLabels)}
            </StatusBadge>
          </div>
          {headerSubtitleParts.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              {headerSubtitleParts.map((part, idx) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: order-stable, no reordering or removal -- owner: bookings-react; existing suppression is intentional pending typed cleanup.
                <Fragment key={idx}>
                  {idx > 0 ? <span className="text-muted-foreground/60">/</span> : null}
                  {part}
                </Fragment>
              ))}
            </div>
          ) : null}
        </div>
        {isCancelled ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {detailMessages.editAction}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setStatusDialogOpen(true)}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {detailMessages.changeStatusAction}
            </Button>
            {canCancel ? (
              <Button variant="outline" size="sm" onClick={() => setCancelDialogOpen(true)}>
                <Ban className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {detailMessages.cancelBookingAction}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={remove.isPending}
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {detailMessages.deleteAction}
            </Button>
          </div>
        )}
      </div>

      {slots?.header?.(booking)}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label={detailMessages.summaryTotal} hint={sellHint}>
          {formatAmount(
            booking.sellAmountCents,
            booking.sellCurrency,
            resolvedLocale,
            detailMessages.noValue,
          )}
        </StatCard>
        <StatCard
          label={detailMessages.summaryPaid}
          badge={
            paidAmountCents != null && booking.sellAmountCents
              ? renderPercentBadge(
                  Math.round((paidAmountCents / booking.sellAmountCents) * 100),
                  paidBadgeClass,
                )
              : null
          }
        >
          {paidAmountCents != null
            ? formatAmount(
                paidAmountCents,
                booking.sellCurrency,
                resolvedLocale,
                detailMessages.noValue,
              )
            : detailMessages.noValue}
        </StatCard>
        <StatCard
          label={detailMessages.summaryCostMargin}
          badge={
            booking.marginPercent != null
              ? renderPercentBadge(booking.marginPercent, marginBadgeClass)
              : null
          }
        >
          {formatAmount(
            booking.costAmountCents,
            booking.sellCurrency,
            resolvedLocale,
            detailMessages.noValue,
          )}
        </StatCard>
        <StatCard label={detailMessages.summaryCreated}>
          {formatDate(booking.createdAt, resolvedLocale, detailMessages.noValue)}
        </StatCard>
      </div>

      {/*
        Above the tabs, not inside the finance one. A contested payment leaves
        every other reading of this booking saying `paid`, so an operator must
        not have to open a particular tab to find out the money is being taken
        back (voyant#4289). Renders nothing when the booking was never disputed.
      */}
      <BookingDisputeBanner bookingId={id} />

      {/*
        Money owed the other way. An issued credit note reads identically
        whether or not it was paid, so nothing else on this page can say the
        customer is still waiting for their money (voyant#4303). Renders
        nothing when the booking has never had a refund.
      */}
      <BookingRefundBanner bookingId={id} />

      {slots?.afterSummary?.(booking)}

      <Tabs
        defaultValue="items"
        value={activeTab}
        onValueChange={(value) => onTabChange?.(String(value) as BookingDetailTabValue)}
      >
        {/* The tab set is wider than a phone viewport; scroll it here rather than
            letting it push the whole document sideways. */}
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList className="w-full min-w-max justify-start">
            <TabsTrigger value="items">{detailMessages.tabOverview}</TabsTrigger>
            <TabsTrigger value="travelers">{detailMessages.tabTravelers}</TabsTrigger>
            <TabsTrigger value="finance">{detailMessages.tabFinance}</TabsTrigger>
            {slots?.invoicesTab ? (
              <TabsTrigger value="invoices">
                {slots.invoicesTab.label ?? detailMessages.tabInvoices}
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="documents">{detailMessages.tabDocuments}</TabsTrigger>
            <TabsTrigger value="suppliers">{detailMessages.tabSuppliers}</TabsTrigger>
            <TabsTrigger value="activity">{detailMessages.tabActivity}</TabsTrigger>
            <TabsTrigger value="metadata">{detailMessages.tabMetadata}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="items" className="mt-4 flex flex-col gap-6">
          {slots?.overviewStart?.(booking)}
          <BookingItemList
            bookingId={id}
            onResourceOpen={onItemResourceOpen}
            readOnly={isCancelled}
          />
          <BookingGroupSection bookingId={id} />
          {visibleInternalNotes(booking.internalNotes) ? (
            <Card>
              <CardHeader>
                <CardTitle>{detailMessages.internalNotesLabel}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">
                  {visibleInternalNotes(booking.internalNotes)}
                </p>
              </CardContent>
            </Card>
          ) : null}
          {slots?.overviewEnd?.(booking)}
        </TabsContent>

        <TabsContent value="travelers" className="mt-4 flex flex-col gap-6">
          {slots?.travelersStart?.(booking)}
          <BookingBillingContextCard
            booking={booking}
            onPersonOpen={onPersonOpen}
            onOrganizationOpen={onOrganizationOpen}
          />
          <TravelerList bookingId={id} autoReveal />
        </TabsContent>

        <TabsContent value="finance" className="mt-4 flex flex-col gap-6">
          <BookingPaymentScheduleList
            bookingId={id}
            addScheduleDisabledReason={addScheduleDisabledReason ?? null}
          />
          {slots?.paymentsContent ? (
            renderDetailSlot(slots.paymentsContent, booking)
          ) : (
            <BookingPaymentsSummary
              bookingId={id}
              variant="admin"
              onViewPayment={onViewPayment}
              onInvoiceOpen={onInvoiceOpen}
              onEditPayment={onEditPayment}
              onDeletePayment={onDeletePayment}
              headerAction={
                onRecordPayment ? (
                  <RecordPaymentHeaderButton
                    label={detailMessages.recordPaymentAction}
                    disabledReason={recordPaymentDisabledReason ?? null}
                    onClick={() => onRecordPayment(booking)}
                  />
                ) : null
              }
            />
          )}
          {slots?.financeStart?.(booking)}
          <Collapsible>
            <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md border bg-background px-4 py-3 text-sm font-semibold hover:bg-muted/30">
              {messages.bookingGuaranteeList.title}
              <ChevronDown className="h-4 w-4 transition-transform group-data-panel-open:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <BookingGuaranteeList bookingId={id} />
            </CollapsibleContent>
          </Collapsible>
          {slots?.financeEnd?.(booking)}
        </TabsContent>

        {slots?.invoicesTab ? (
          <TabsContent value="invoices" className="mt-4 flex flex-col gap-6">
            {renderDetailSlot(slots.invoicesTab.content, booking)}
          </TabsContent>
        ) : null}

        <TabsContent value="documents" className="mt-4 flex flex-col gap-4">
          {slots?.documents ? (
            slots.documents(booking)
          ) : (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              {detailMessages.documentsSlotEmpty}
            </p>
          )}
        </TabsContent>

        <TabsContent value="suppliers" className="mt-4">
          <SupplierStatusList bookingId={id} />
        </TabsContent>

        <TabsContent value="activity" className="mt-4 flex flex-col gap-6">
          <BookingNotes bookingId={id} />
          <BookingActivityTimeline
            bookingId={id}
            paymentsVariant="admin"
            additionalEvents={slots?.activityExtraEvents}
            footer={slots?.activityTimelineFooter}
          />
          {slots?.activityEnd?.(booking)}
        </TabsContent>

        <TabsContent value="metadata" className="mt-4">
          <BookingMetadataList
            booking={booking}
            messages={detailMessages.metadataSection}
            statusLabel={getBookingStatusLabel(booking.status, messages.common.bookingStatusLabels)}
            formatDateTime={i18n.formatDateTime}
            noValue={detailMessages.noValue}
          />
        </TabsContent>
      </Tabs>

      <BookingDialog open={editOpen} onOpenChange={setEditOpen} booking={booking} />

      <StatusChangeDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        bookingId={id}
        currentStatus={booking.status}
      />

      <BookingCancellationDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        booking={booking}
        paidAmountCents={paidAmountCents}
        hasRecordedPayment={hasRecordedPayment}
      />

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(next) => {
          if (!next && !remove.isPending) setDeleteDialogOpen(false)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{detailMessages.deleteConfirm}</AlertDialogTitle>
            <AlertDialogDescription>
              {booking.bookingNumber
                ? formatMessage(detailMessages.deleteConfirmDescription, {
                    number: booking.bookingNumber,
                  })
                : detailMessages.deleteConfirmDescriptionFallback}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              {detailMessages.deleteCancel}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={async () => {
                await remove.mutateAsync(id)
                setDeleteDialogOpen(false)
                onBack?.()
              }}
            >
              {detailMessages.deleteConfirmAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function RecordPaymentHeaderButton({
  label,
  disabledReason,
  onClick,
}: {
  label: string
  disabledReason: string | null
  onClick: () => void
}) {
  if (disabledReason) {
    return (
      <Tooltip>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: required so disabled-button tooltips remain keyboard-discoverable  -- owner: bookings-react; existing suppression is intentional pending typed cleanup. */}
        <TooltipTrigger render={<span tabIndex={0} className="inline-block" />}>
          <Button variant="outline" size="sm" disabled className="pointer-events-none">
            <Plus className="mr-2 h-4 w-4" />
            {label}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <Plus className="mr-2 h-4 w-4" />
      {label}
    </Button>
  )
}

function renderDetailSlot(content: BookingDetailSlotContent, booking: BookingRecord): ReactNode {
  return typeof content === "function" ? content(booking) : content
}

/**
 * Billing/contact card for the Travelers tab. Snapshot fields on the
 * booking row are the source of truth (they capture contact info at
 * the time of booking). When they're empty — typically for bookings
 * created via flows that don't snapshot — fall back to the linked CRM
 * person / organization so the operator still sees who they're
 * billing.
 */
export function BookingBillingContextCard({
  booking,
  onPersonOpen,
  onOrganizationOpen,
}: {
  booking: BookingRecord
  /** Open the linked CRM person's detail page. */
  onPersonOpen?: (personId: string) => void
  /** Open the linked CRM organization's detail page. */
  onOrganizationOpen?: (organizationId: string) => void
}) {
  const messages = useBookingsUiMessagesOrDefault().bookingDetailPage
  const [editOpen, setEditOpen] = useState(false)
  const person = usePerson(booking.personId ?? undefined, {
    enabled: Boolean(booking.personId),
  }).data
  const organization = useOrganization(booking.organizationId ?? undefined, {
    enabled: Boolean(booking.organizationId) && !booking.personId,
  }).data

  const payerName =
    [booking.contactFirstName, booking.contactLastName].filter(Boolean).join(" ") ||
    (person ? [person.firstName, person.lastName].filter(Boolean).join(" ") : "") ||
    organization?.name ||
    ""
  const email = booking.contactEmail ?? person?.email ?? null
  const phone = booking.contactPhone ?? person?.phone ?? null
  const taxId = booking.contactTaxId ?? organization?.taxId ?? null
  const address = [
    booking.contactAddressLine1,
    booking.contactAddressLine2,
    booking.contactCity,
    booking.contactRegion,
    booking.contactPostalCode,
    booking.contactCountry,
  ]
    .filter(Boolean)
    .join(", ")

  return (
    <div data-slot="booking-billing-context" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <CreditCard className="h-4 w-4" aria-hidden="true" />
          {messages.billingPayer}
        </h2>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          {messages.editAction}
        </Button>
      </div>
      <div className="flex flex-col gap-4 rounded-md border p-4">
        <div className="grid gap-4 md:grid-cols-4">
          <BillingField
            label={messages.billingPayer}
            value={
              payerName ? (
                booking.personId && onPersonOpen ? (
                  <button
                    type="button"
                    onClick={() => onPersonOpen(booking.personId as string)}
                    className="text-left text-primary hover:underline"
                  >
                    {payerName}
                  </button>
                ) : booking.organizationId && !booking.personId && onOrganizationOpen ? (
                  <button
                    type="button"
                    onClick={() => onOrganizationOpen(booking.organizationId as string)}
                    className="text-left text-primary hover:underline"
                  >
                    {payerName}
                  </button>
                ) : (
                  payerName
                )
              ) : (
                messages.noValue
              )
            }
          />
          <BillingField label={messages.billingTaxId} value={taxId ?? messages.noValue} />
          <BillingField
            label={messages.billingEmail}
            value={email ?? messages.noValue}
            icon={<Mail className="h-3.5 w-3.5" aria-hidden="true" />}
          />
          <BillingField
            label={messages.billingPhone}
            value={phone ?? messages.noValue}
            icon={<Phone className="h-3.5 w-3.5" aria-hidden="true" />}
          />
        </div>
        <BillingField
          label={messages.billingAddress}
          value={address || messages.noValue}
          icon={<MapPin className="h-3.5 w-3.5" aria-hidden="true" />}
        />
      </div>
      <BookingBillingDialog open={editOpen} onOpenChange={setEditOpen} booking={booking} />
    </div>
  )
}

function StatCard({
  label,
  children,
  hint,
  badge,
}: {
  label: string
  children: ReactNode
  hint?: string
  badge?: ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xl font-semibold tabular-nums leading-none">{children}</div>
          {badge}
        </div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  )
}

/**
 * Definition-list metadata panel for the Metadata tab. Surfaces booking
 * fields that don't fit any other tab but are still useful for support
 * / debugging: raw id, booking number, status, communication language,
 * created/updated timestamps. Label-left, value-right rows matching the
 * supplier-status / documents / notes tab style.
 */
function BookingMetadataList({
  booking,
  messages,
  statusLabel,
  formatDateTime,
  noValue,
}: {
  booking: BookingRecord
  messages: {
    title: string
    bookingId: string
    bookingNumber: string
    status: string
    communicationLanguage: string
    created: string
    updated: string
  }
  statusLabel: string
  formatDateTime: (iso: string) => string
  noValue: string
}) {
  const rows: Array<{ label: string; value: ReactNode }> = [
    {
      label: messages.bookingId,
      value: <span className="font-mono text-xs">{booking.id}</span>,
    },
    {
      label: messages.bookingNumber,
      value: <span className="font-mono text-xs">{booking.bookingNumber}</span>,
    },
    {
      label: messages.status,
      value: <StatusBadge status={booking.status}>{statusLabel}</StatusBadge>,
    },
    {
      label: messages.communicationLanguage,
      value: booking.communicationLanguage ? (
        <span className="uppercase">{booking.communicationLanguage}</span>
      ) : (
        <span className="text-muted-foreground">{noValue}</span>
      ),
    },
    { label: messages.created, value: formatDateTime(booking.createdAt) },
    { label: messages.updated, value: formatDateTime(booking.updatedAt) },
  ]

  return (
    <div data-slot="booking-metadata" className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Info className="h-4 w-4 text-muted-foreground" />
        {messages.title}
      </h2>
      <div className="overflow-hidden rounded-md border bg-background">
        <dl className="divide-y">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
            >
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="text-right">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

/**
 * Traffic-light badge for a percentage value. Color thresholds are
 * passed in by the caller (Paid uses 0 → red, 0..100 → yellow, 100 →
 * green; Margin uses <0 → red, 0..10 → yellow, >10 → green).
 */
function renderPercentBadge(percent: number, classFor: (percent: number) => string): ReactNode {
  return (
    <Badge variant="outline" className={cn("border-transparent", classFor(percent))}>
      {percent}%
    </Badge>
  )
}

function paidBadgeClass(percent: number): string {
  if (percent <= 0) return "bg-red-500/10 text-red-600 dark:text-red-400"
  if (percent >= 100) return "bg-green-500/10 text-green-600 dark:text-green-400"
  return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
}

function marginBadgeClass(percent: number): string {
  if (percent < 0) return "bg-red-500/10 text-red-600 dark:text-red-400"
  if (percent > 10) return "bg-green-500/10 text-green-600 dark:text-green-400"
  return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
}

function BillingField({
  label,
  value,
  icon,
}: {
  label: string
  value: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="truncate text-sm font-medium">{value}</div>
    </div>
  )
}

function getBookingStatusLabel(status: string, labels: Record<string, string>) {
  return labels[status] ?? status
}

function formatAmount(
  cents: number | null,
  currency: string,
  locale: string,
  empty: string,
): string {
  if (cents == null) return empty
  const amount = cents / 100
  const amountText = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(amount)
  // RON's "symbol" is just the ISO code itself, so a `<symbol> <amount> <code>`
  // layout would print "RON 1.185 RON" — collapse it back to "1.185 RON".
  if (currency.toUpperCase() === "RON") {
    return `${amountText} ${currency}`
  }
  // Extract the locale's native symbol so we can always render
  // `<symbol> <amount> <code>` regardless of where Intl would otherwise
  // place the symbol for this locale (e.g. Romanian puts it after).
  const parts = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).formatToParts(amount)
  const symbol = parts.find((p) => p.type === "currency")?.value ?? currency
  return `${symbol} ${amountText} ${currency}`
}

function formatDate(iso: string | null, locale: string, empty: string): string {
  if (!iso) return empty
  return new Date(iso).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/**
 * Strip internal markers (`__contract_acceptance__:`,
 * `__payment_policy_source__:`) before rendering — those are
 * server-side relays, not human-readable notes. Their canonical home
 * is on the contract signature row / schedule history; surfacing them
 * here just confuses operators with raw JSON.
 */
function visibleInternalNotes(notes: string | null | undefined): string | null {
  if (!notes) return null
  const visible = notes
    .split("\n")
    .filter((line) => !/^__[a-z0-9_]+__:/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return visible.length > 0 ? visible : null
}
