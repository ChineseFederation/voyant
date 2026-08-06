import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { BookingRecord } from "../../src/index.js"

const bookingsState = vi.hoisted(() => ({
  booking: null as BookingRecord | null,
  itemListReadOnly: null as boolean | null,
}))

vi.mock("@voyant-travel/relationships-react", () => ({
  useOrganization: () => ({ data: null }),
  usePerson: () => ({ data: null }),
}))

vi.mock("@voyant-travel/ui/components", () => ({
  AlertDialog: ({ children, open }: { children?: ReactNode; open?: boolean }) =>
    open ? <div>{children}</div> : null,
  AlertDialogAction: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  AlertDialogCancel: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  AlertDialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children?: ReactNode }) => <footer>{children}</footer>,
  AlertDialogHeader: ({ children }: { children?: ReactNode }) => <header>{children}</header>,
  AlertDialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  Card: ({ children }: { children?: ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" "),
}))

vi.mock("@voyant-travel/ui/components/collapsible", () => ({
  Collapsible: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CollapsibleContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}))

vi.mock("@voyant-travel/ui/components/tabs", () => ({
  Tabs: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children, value }: { children?: ReactNode; value?: string }) =>
    value === "items" ? <section>{children}</section> : null,
  TabsList: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}))

vi.mock("@voyant-travel/ui/components/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}))

vi.mock("../../src/index.js", () => ({
  useBooking: () => ({ data: { data: bookingsState.booking }, isPending: false }),
  useBookingItems: () => ({ data: { data: [] } }),
  useBookingMutation: () => ({ remove: { isPending: false } }),
}))

vi.mock("../../src/components/booking-activity-timeline.js", () => ({
  BookingActivityTimeline: () => <div />,
}))
vi.mock("../../src/components/booking-billing-dialog.js", () => ({
  BookingBillingDialog: () => null,
}))
vi.mock("../../src/components/booking-cancellation-dialog.js", () => ({
  BookingCancellationDialog: () => null,
}))
vi.mock("../../src/components/booking-dialog.js", () => ({ BookingDialog: () => null }))
// Mocked like every other child: the banner is a react-query consumer and this
// suite renders the page bare, without a QueryClientProvider.
vi.mock("../../src/components/booking-dispute-banner.js", () => ({
  BookingDisputeBanner: () => <div />,
}))
vi.mock("../../src/components/booking-refund-banner.js", () => ({
  BookingRefundBanner: () => <div />,
}))
vi.mock("../../src/components/booking-group-section.js", () => ({
  BookingGroupSection: () => <div />,
}))
vi.mock("../../src/components/booking-guarantee-list.js", () => ({
  BookingGuaranteeList: () => <div />,
}))
vi.mock("../../src/components/booking-item-list.js", () => ({
  BookingItemList: ({ readOnly }: { readOnly?: boolean }) => {
    bookingsState.itemListReadOnly = readOnly ?? false
    return readOnly ? <div>items read-only</div> : <button type="button">Add item</button>
  },
}))
vi.mock("../../src/components/booking-notes.js", () => ({ BookingNotes: () => <div /> }))
vi.mock("../../src/components/booking-payment-schedule-list.js", () => ({
  BookingPaymentScheduleList: () => <div />,
}))
vi.mock("../../src/components/booking-payments-summary.js", () => ({
  BookingPaymentsSummary: () => <div />,
}))
vi.mock("../../src/components/status-badge.js", () => ({
  StatusBadge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}))
vi.mock("../../src/components/status-change-dialog.js", () => ({ StatusChangeDialog: () => null }))
vi.mock("../../src/components/supplier-status-list.js", () => ({
  SupplierStatusList: () => <div />,
}))
vi.mock("../../src/components/traveler-list.js", () => ({ TravelerList: () => <div /> }))

import { BookingDetailPage } from "../../src/components/booking-detail-page.js"

beforeEach(() => {
  bookingsState.booking = booking()
  bookingsState.itemListReadOnly = null
})

function booking(data: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id: "book_123",
    bookingNumber: "BK-2026-000001",
    status: "confirmed",
    sellAmountCents: 12000,
    sellCurrency: "EUR",
    costAmountCents: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    startDate: null,
    endDate: null,
    pax: null,
    personId: null,
    organizationId: null,
    contactFirstName: null,
    contactLastName: null,
    priceOverride: null,
    internalNotes: null,
    ...data,
  } as BookingRecord
}

describe("BookingDetailPage cancelled actions", () => {
  it("hides mutation actions and renders items read-only for cancelled bookings", () => {
    bookingsState.booking = booking({ status: "cancelled" })

    const html = renderToStaticMarkup(<BookingDetailPage id="book_123" />)

    expect(html).not.toContain("Edit")
    expect(html).not.toContain("Change status")
    expect(html).not.toContain("Delete")
    expect(html).not.toContain("Add item")
    expect(html).toContain("items read-only")
    expect(bookingsState.itemListReadOnly).toBe(true)
  })

  it("keeps mutation actions available for active bookings", () => {
    bookingsState.booking = booking({ status: "confirmed" })

    const html = renderToStaticMarkup(<BookingDetailPage id="book_123" />)

    expect(html).toContain("Edit")
    expect(html).toContain("Change status")
    expect(html).toContain("Delete")
    expect(html).toContain("Add item")
    expect(bookingsState.itemListReadOnly).toBe(false)
  })
})
