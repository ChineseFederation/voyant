"use client"

import {
  AdminWidgetSlotRenderer,
  resolveAdminWidgets,
  useAdminBreadcrumbs,
  useAdminExtensions,
  useAdminHref,
  useAdminNavigate,
  useLocale,
  useOperatorAdminMessages,
} from "@voyant-travel/admin"
import {
  useAdminBookingPayments,
  useInvoices,
  usePaymentMutation,
} from "@voyant-travel/finance-react"
import { Sheet, SheetContent } from "@voyant-travel/ui/components/sheet"
import { type ReactNode, useCallback, useState } from "react"
import {
  BookingDetailPage,
  type BookingDetailPageSlots,
  type BookingDetailTabValue,
} from "../components/booking-detail-page.js"
import type { BookingPaymentsSummaryRow } from "../components/booking-payments-summary.js"
import { type BookingRecord, useBooking } from "../index.js"
import { BookingDocumentsTable } from "./booking-documents-table.js"
import { BookingInvoiceSheet } from "./booking-invoice-sheet.js"
import {
  bookingDetailFinanceEndSlot,
  bookingDetailFinanceStartSlot,
  bookingDetailInvoicesTabSlot,
  bookingDetailPaymentControllerSlot,
} from "./slots.js"
import { useBookingActionLedgerEvents } from "./use-booking-action-ledger-events.js"

/**
 * Render context handed to the host's app-supplied slots AND to widget
 * contributions targeting {@link bookingDetailInvoicesTabSlot}. Carries the
 * booking plus the host-computed payment aggregates and the invoice-sheet
 * opener so contributed cards can participate without re-deriving them.
 */
export interface BookingDetailHostSlotContext {
  booking: BookingRecord
  /** Customer payments summed across non-credit-note, non-draft invoices. */
  paidAmountCents: number | null
  /**
   * Localized "Booking is fully paid" reason when nothing is left to pay,
   * else `null`. The host already uses it for the Record payment / Add
   * schedule buttons; payment-link slots reuse it for their own gating.
   */
  fullyPaidReason: string | null
  /** Open an invoice in the host's side sheet (stays on the booking page). */
  openInvoiceSheet: (invoiceId: string) => void
  /**
   * Opens the selected Finance package's Generate payment link flow.
   */
  onGenerateLink: (() => void) | undefined
}

export type BookingDetailHostSlot = (context: BookingDetailHostSlotContext) => ReactNode

export interface BookingDetailPaymentActions {
  onEditPayment?: (row: BookingPaymentsSummaryRow) => void
  onGenerateLink?: () => void
  onRecordPayment?: () => void
}

export interface BookingDetailPaymentControllerSlotContext {
  bookingId: string
  onActionsChange: (actions: BookingDetailPaymentActions) => void
}

/**
 * App-supplied extension points. The host owns everything package-clean
 * (the Documents tab, the action-ledger timeline merge, the finance-tab
 * widget slots); these slots remain for app-local additions on top.
 */
export interface BookingDetailHostSlots {
  /** Top of the Finance tab, rendered before any widget contributions. */
  financeStart?: BookingDetailHostSlot
  /** Bottom of the Finance tab, rendered before any widget contributions. */
  financeEnd?: BookingDetailHostSlot
  /** Mounts a dedicated Invoices tab between Payments and Suppliers. */
  invoicesTab?: { label?: string; content: BookingDetailHostSlot }
  /** Replaces the Documents tab content (default: {@link BookingDocumentsTable}). */
  documents?: BookingDetailHostSlot
  /** Extra events merged into the Activity-tab timeline (the host already
   *  merges the booking's central action-ledger entries). */
  activityExtraEvents?: BookingDetailPageSlots["activityExtraEvents"]
  /** Rendered below the activity timeline events, after the host's
   *  action-ledger pager. */
  activityTimelineFooter?: ReactNode
}

export interface BookingDetailHostProps {
  id: string
  /** Controlled tab value; the route file mirrors it into the URL. */
  activeTab?: BookingDetailTabValue
  onTabChange?: (tab: BookingDetailTabValue) => void
  /**
   * Overrides the selected Finance package's record-payment action.
   */
  onRecordPayment?: () => void
  /** Opens the app's record-payment flow pre-filled with the row. */
  onEditPayment?: (row: BookingPaymentsSummaryRow) => void
  /**
   * Overrides the selected Finance package's Generate payment link action.
   */
  onGenerateLink?: () => void
  slots?: BookingDetailHostSlots
}

/**
 * Packaged admin host for the canonical `BookingDetailPage` (packaged-admin
 * RFC Phase 3). Owns everything package-clean:
 *
 *   - Cross-route links resolve through semantic destinations (RFC §4.7):
 *     `booking.list`, `person.detail`, `organization.detail`,
 *     `product.detail`, `availabilitySlot.detail`, `payment.detail`,
 *     `invoice.detail` — no host route tree import.
 *   - Admin chrome breadcrumbs (`useAdminBreadcrumbs`).
 *   - Admin widget extension points: the `booking.details.header` and
 *     `booking.details.after-summary` slots render through the shared
 *     `AdminWidgetSlotRenderer`, which reads the workspace shell's
 *     `AdminExtensionsProvider` context.
 *   - Paid-amount aggregation across the booking's invoices and the
 *     derived fully-paid disabled reasons.
 *   - Payment row delete (finance-react mutation) and the in-place
 *     invoice sheet ({@link BookingInvoiceSheet}).
 *
 * App-local cards without package-level data access stay injectable via
 * {@link BookingDetailHostSlots}.
 */
export function BookingDetailHost({
  id,
  activeTab,
  onTabChange,
  onRecordPayment,
  onEditPayment,
  onGenerateLink,
  slots,
}: BookingDetailHostProps) {
  const detailMessages = useOperatorAdminMessages().bookings.detail
  const { resolvedLocale } = useLocale()
  const resolveHref = useAdminHref()
  const navigateTo = useAdminNavigate()
  // Finance (or any extension that may not import this package) contributes
  // the Invoices-tab content as widget contributions; the tab mounts whenever
  // an app slot or at least one widget targets it.
  const adminExtensions = useAdminExtensions()
  const hasInvoicesTabWidgets =
    resolveAdminWidgets({ slot: bookingDetailInvoicesTabSlot, extensions: adminExtensions })
      .length > 0
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(null)
  const [contributedPaymentActions, setContributedPaymentActions] =
    useState<BookingDetailPaymentActions>({})
  const onPaymentActionsChange = useCallback((actions: BookingDetailPaymentActions) => {
    setContributedPaymentActions(actions)
  }, [])
  const effectiveRecordPayment = onRecordPayment ?? contributedPaymentActions.onRecordPayment
  const effectiveEditPayment = onEditPayment ?? contributedPaymentActions.onEditPayment
  const effectiveGenerateLink = onGenerateLink ?? contributedPaymentActions.onGenerateLink
  const { remove: removePayment } = usePaymentMutation()
  // Mirror the booking fetch so the admin chrome can render breadcrumbs
  // without prop-drilling through the canonical page. TanStack Query
  // dedupes by key, so this doesn't issue a second network request.
  const { data: bookingData } = useBooking(id)
  const booking = bookingData?.data
  // Sum customer payments across this booking's non-credit-note,
  // non-draft invoices.
  const { data: invoicesData } = useInvoices({ bookingId: id, limit: 20 })
  const { data: adminPaymentsData } = useAdminBookingPayments(id)
  const paidAmountCents = invoicesData?.data
    ? invoicesData.data
        .filter((inv) => {
          const type = (inv as { invoiceType?: string }).invoiceType ?? "invoice"
          return type !== "credit_note" && inv.status !== "draft"
        })
        .reduce((sum, inv) => sum + (inv.paidCents ?? 0), 0)
    : null
  // Any non-credit-note document is a fiscal document the buyer's details
  // have to be complete for (voyant#4654).
  const hasFiscalDocument =
    invoicesData?.data.some(
      (invoice) =>
        ((invoice as { invoiceType?: string }).invoiceType ?? "invoice") !== "credit_note",
    ) ?? false
  const hasRecordedPayment =
    adminPaymentsData?.data.payments.some(
      (payment) => payment.status === "completed" && payment.amountCents > 0,
    ) ?? false
  const fullyPaidReason =
    booking &&
    booking.sellAmountCents != null &&
    paidAmountCents != null &&
    paidAmountCents >= booking.sellAmountCents
      ? detailMessages.generateLinkFullyPaid
      : null

  const bookingsHref = resolveHref("booking.list", {})
  useAdminBreadcrumbs(
    booking
      ? [
          { label: detailMessages.breadcrumbBookings, href: bookingsHref },
          { label: booking.bookingNumber },
        ]
      : [{ label: detailMessages.breadcrumbBookings, href: bookingsHref }],
  )

  const slotContext = (b: BookingRecord): BookingDetailHostSlotContext => ({
    booking: b,
    paidAmountCents,
    fullyPaidReason,
    openInvoiceSheet: setViewingInvoiceId,
    onGenerateLink: effectiveGenerateLink,
  })

  // Central action-ledger entries merged into the Activity timeline —
  // package-owned since the feed ships from `@voyant-travel/bookings-react`.
  const { events: actionLedgerEvents, footer: actionLedgerFooter } =
    useBookingActionLedgerEvents(id)
  const activityExtraEvents = slots?.activityExtraEvents
    ? [...actionLedgerEvents, ...slots.activityExtraEvents]
    : actionLedgerEvents

  return (
    <>
      <AdminWidgetSlotRenderer
        slot={bookingDetailPaymentControllerSlot}
        props={{ bookingId: id, onActionsChange: onPaymentActionsChange }}
      />
      <BookingDetailPage
        id={id}
        locale={resolvedLocale}
        hideBreadcrumb
        activeTab={activeTab}
        onTabChange={onTabChange}
        onBack={() => navigateTo("booking.list", {})}
        onPersonOpen={(personId) => navigateTo("person.detail", { personId })}
        onOrganizationOpen={(organizationId) =>
          navigateTo("organization.detail", { organizationId })
        }
        onRecordPayment={effectiveRecordPayment ? () => effectiveRecordPayment() : undefined}
        recordPaymentDisabledReason={fullyPaidReason}
        addScheduleDisabledReason={fullyPaidReason}
        paidAmountCents={paidAmountCents}
        hasRecordedPayment={hasRecordedPayment}
        hasFiscalDocument={hasFiscalDocument}
        onItemResourceOpen={(kind, resourceId) => {
          if (kind === "product") {
            navigateTo("product.detail", { productId: resourceId })
            return
          }
          if (kind === "availabilitySlot") {
            navigateTo("availabilitySlot.detail", { slotId: resourceId })
          }
        }}
        onInvoiceOpen={(invoiceId) => setViewingInvoiceId(invoiceId)}
        onViewPayment={(row) => navigateTo("payment.detail", { paymentId: row.id })}
        onEditPayment={effectiveEditPayment}
        onDeletePayment={async (row) => {
          await removePayment.mutateAsync(row.id)
        }}
        slots={{
          header: (b) => (
            <AdminWidgetSlotRenderer slot="booking.details.header" props={{ booking: b }} />
          ),
          afterSummary: (b) => (
            <AdminWidgetSlotRenderer slot="booking.details.after-summary" props={{ booking: b }} />
          ),
          financeStart: (b) => (
            <>
              {slots?.financeStart?.(slotContext(b))}
              <AdminWidgetSlotRenderer
                slot={bookingDetailFinanceStartSlot}
                props={{ ...slotContext(b) }}
              />
            </>
          ),
          financeEnd: (b) => (
            <>
              {slots?.financeEnd?.(slotContext(b))}
              <AdminWidgetSlotRenderer
                slot={bookingDetailFinanceEndSlot}
                props={{ ...slotContext(b) }}
              />
            </>
          ),
          invoicesTab:
            slots?.invoicesTab || hasInvoicesTabWidgets
              ? {
                  label: slots?.invoicesTab?.label,
                  content: (b: BookingRecord) => (
                    <>
                      {slots?.invoicesTab?.content(slotContext(b))}
                      <AdminWidgetSlotRenderer
                        slot={bookingDetailInvoicesTabSlot}
                        props={{ ...slotContext(b) }}
                      />
                    </>
                  ),
                }
              : undefined,
          documents: slots?.documents
            ? (b) => slots.documents?.(slotContext(b))
            : () => <BookingDocumentsTable bookingId={id} />,
          activityExtraEvents,
          activityTimelineFooter:
            actionLedgerFooter || slots?.activityTimelineFooter ? (
              <>
                {actionLedgerFooter}
                {slots?.activityTimelineFooter}
              </>
            ) : undefined,
        }}
      />

      <Sheet
        open={Boolean(viewingInvoiceId)}
        onOpenChange={(open) => {
          if (!open) setViewingInvoiceId(null)
        }}
      >
        <SheetContent side="right" className="w-full! max-w-5xl!">
          {viewingInvoiceId ? (
            <BookingInvoiceSheet
              invoiceId={viewingInvoiceId}
              onOpenInvoice={(invoiceId) => {
                setViewingInvoiceId(null)
                navigateTo("invoice.detail", { invoiceId })
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}
