// @vitest-environment jsdom

import type * as ReactTypes from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import type {
  AllocationManifestBooking,
  AllocationManifestTraveler,
  DepartureIssue,
  DepartureSummary,
} from "../index.js"
import { AvailabilitySlotDetailPage } from "./availability-slot-detail-page.js"

/**
 * Departure workspace acceptance (issue #4033).
 *
 * The three things the redesign has to hold:
 *   - every one of the six sections renders on an EMPTY departure, each with
 *     its next authorized action (AC7) — the old Pickup and Closeouts tabs
 *     vanished entirely when empty;
 *   - the typed attention issues render with their severity and clear once
 *     the underlying disagreement is repaired (AC4);
 *   - the selected section round-trips through the URL contract (AC3).
 */

const EMPTY_SUMMARY: DepartureSummary = {
  departure: {
    id: "slot_1",
    productId: "prod_1",
    productVersionId: "pver_1",
    itineraryId: null,
    optionId: null,
    facilityId: null,
    status: "open",
    dateLocal: "2026-09-01",
    startsAt: "2026-09-01T06:00:00.000Z",
    endsAt: null,
    timezone: "Europe/Bucharest",
    notes: null,
  },
  capacity: {
    slotId: "slot_1",
    unlimited: false,
    initialPax: 20,
    effectivePax: 20,
    remainingPax: 20,
    derivedRemainingPax: 20,
    derivedConsumedPax: 0,
    holds: { active: 0, activePax: 0, expired: 0, expiredPax: 0, released: 0, converted: 0 },
    allocations: {
      held: 0,
      confirmed: 0,
      fulfilled: 0,
      staleHeld: 0,
      released: 0,
      expired: 0,
      cancelled: 0,
      active: 0,
      inactive: 0,
    },
    bookings: { active: 0, cancelledWithLiveAllocation: 0, expectedPax: 0, byStatus: {} },
    travelers: { entered: 0, lead: 0, assigned: 0, unassigned: 0, missing: 0 },
    resources: {
      total: 0,
      // The base fixture is a TOUR: its option declares rooms, none of which have
      // been laid out on this departure yet. An excursion — a departure that
      // allocates nothing at all — is its own fixture below.
      templated: 4,
      seating: 0,
      capacity: 0,
      assigned: 0,
      available: 0,
      overCapacity: 0,
      planned: true,
    },
    resourceBreakdown: [],
  },
  bookings: {
    count: 0,
    byStatus: {},
    expectedPax: 0,
    currency: null,
    soldAmountCents: null,
    paidAmountCents: null,
    outstandingAmountCents: null,
  },
  travelers: { entered: 0, lead: 0, assigned: 0, unassigned: 0, missing: 0 },
  allocation: {
    total: 0,
    // The base fixture is a TOUR: its option declares rooms, none of which have
    // been laid out on this departure yet. An excursion — a departure that
    // allocates nothing at all — is its own fixture below.
    templated: 4,
    seating: 0,
    capacity: 0,
    assigned: 0,
    available: 0,
    overCapacity: 0,
    planned: true,
  },
  operations: { issues: [], criticalCount: 0, warningCount: 0, clear: true },
  extras: null,
  // No Finance provider is bound in this deployment — an explicit
  // "unavailable", not a grid of zeros.
  finance: null,
}

/** A manifest booking with only the fields the roster reads spelled out. */
function booking(
  overrides: Partial<AllocationManifestBooking> & Pick<AllocationManifestBooking, "id">,
): AllocationManifestBooking {
  return {
    bookingNumber: "BK-0000-0000",
    status: "confirmed",
    bookingSequence: 1,
    paymentStatus: "unpaid",
    contactFirstName: null,
    contactLastName: null,
    contactEmail: null,
    contactPhone: null,
    sellCurrency: "RON",
    pax: null,
    sellAmountCents: null,
    paidAmountCents: null,
    travelers: [],
    ...overrides,
  }
}

function travelerRow(
  id: string,
  fullName: string,
  overrides: Partial<AllocationManifestTraveler> = {},
): AllocationManifestTraveler {
  const [firstName = fullName, ...rest] = fullName.split(" ")
  return {
    id,
    bookingId: "bkg_1",
    bookingNumber: "BK-0000-0000",
    bookingStatus: "confirmed",
    bookingSequence: 1,
    paymentStatus: "unpaid",
    firstName,
    lastName: rest.join(" "),
    fullName,
    email: null,
    phone: null,
    isLeadTraveler: false,
    isPrimary: false,
    sharingGroupId: null,
    roomTypeId: null,
    bedPreference: null,
    allocations: {},
    travelerCategory: null,
    participantType: "traveler",
    hasAccessibilityNeeds: false,
    hasDietaryRequirements: false,
    ...overrides,
  }
}

const OVERSOLD_ISSUE: DepartureIssue = {
  code: "capacity_oversold",
  severity: "critical",
  subjectType: "departure",
  subjectId: "slot_1",
  count: 3,
  message: "Bookings and live holds consume more pax than the departure's authored capacity.",
}

const UNSEATED_ISSUE: DepartureIssue = {
  code: "travelers_unassigned",
  severity: "warning",
  subjectType: "departure",
  subjectId: "slot_1",
  count: 2,
  message: "Travelers on this departure have not been assigned to a room or seat.",
}

const testState = vi.hoisted(() => ({
  summary: null as unknown,
  /** Allocation manifest bookings backing the traveler roster. */
  bookings: [] as unknown[],
  /** Captured from the mocked `Tabs`, so a trigger click can drive it. */
  onValueChange: undefined as ((value: string) => void) | undefined,
  activeTab: undefined as string | undefined,
}))

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: readonly unknown[] }) => {
    const kind = options.queryKey[0]
    switch (kind) {
      case "slot":
        return {
          isPending: false,
          data: {
            data: {
              id: "slot_1",
              productId: "prod_1",
              itineraryId: null,
              optionId: null,
              facilityId: null,
              availabilityRuleId: null,
              startTimeId: null,
              dateLocal: "2026-09-01",
              startsAt: "2026-09-01T06:00:00.000Z",
              endsAt: null,
              timezone: "Europe/Bucharest",
              status: "open",
              unlimited: false,
              initialPax: 20,
              remainingPax: 20,
              nights: null,
              days: null,
              notes: null,
              initialPickups: null,
              remainingPickups: null,
              remainingResources: null,
              pastCutoff: false,
              tooEarly: false,
              createdAt: "2026-08-01T00:00:00.000Z",
              updatedAt: "2026-08-01T00:00:00.000Z",
            },
          },
        }
      case "summary":
        return { isPending: false, data: { data: testState.summary } }
      case "product":
        return {
          isPending: false,
          data: { data: { id: "prod_1", name: "Danube Delta", sellCurrency: "EUR" } },
        }
      case "allocation":
        return {
          isPending: false,
          data: { data: { bookings: testState.bookings, resources: [], sharingGroupLabels: {} } },
        }
      default:
        return { isPending: false, data: { data: [] } }
    }
  },
}))

// The barrel is stubbed so the page's query options and hooks can be driven,
// but `departureAllocatesPositions` is the REAL rule — a reimplementation here
// would let the page and the rule drift apart while both tests stayed green.
vi.mock("../index.js", async () => ({
  departureAllocatesPositions: (
    await vi.importActual<typeof import("../departure-summary-schemas.js")>(
      "../departure-summary-schemas.js",
    )
  ).departureAllocatesPositions,
  getDepartureSummaryQueryOptions: () => ({ queryKey: ["summary"] }),
  getPickupPointsQueryOptions: () => ({ queryKey: ["pickup-points"] }),
  getProductQueryOptions: () => ({ queryKey: ["product"] }),
  getSlotAllocationQueryOptions: () => ({ queryKey: ["allocation"] }),
  getSlotAssignmentsQueryOptions: () => ({ queryKey: ["assignments"] }),
  getSlotCloseoutsQueryOptions: () => ({ queryKey: ["closeouts"] }),
  getSlotPickupsQueryOptions: () => ({ queryKey: ["pickups"] }),
  getSlotQueryOptions: () => ({ queryKey: ["slot"] }),
  getSlotResourcesQueryOptions: () => ({ queryKey: ["resources"] }),
  defaultDepartureWorkspaceTab: "overview",
  productNameById: () => new Map<string, string>(),
  slotLocalEnd: () => null,
  slotLocalStart: (slot: { dateLocal: string }) => ({ date: slot.dateLocal, time: "09:00" }),
  slotStatusTone: {
    open: "positive",
    closed: "muted",
    sold_out: "warning",
    cancelled: "destructive",
  },
  useAvailabilitySlotMutation: () => ({
    remove: { isPending: false, mutateAsync: vi.fn() },
  }),
  useSlotAllocationAuditLog: () => ({ data: { data: [] } }),
  useVoyantAvailabilityContext: () => ({}),
}))

vi.mock("@voyant-travel/ui/components", () => {
  const Passthrough = ({ children }: { children?: ReactTypes.ReactNode }) => <>{children}</>
  const Block = ({ children }: { children?: ReactTypes.ReactNode }) => <div>{children}</div>

  return {
    Alert: Block,
    AlertDescription: Block,
    AlertTitle: Block,
    AlertDialog: Passthrough,
    AlertDialogAction: Block,
    AlertDialogCancel: Block,
    AlertDialogContent: Passthrough,
    AlertDialogDescription: Block,
    AlertDialogFooter: Passthrough,
    AlertDialogHeader: Passthrough,
    AlertDialogTitle: Block,
    Badge: ({ children }: { children?: ReactTypes.ReactNode }) => <span>{children}</span>,
    Button: ({ children, ...props }: ReactTypes.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button type="button" {...props}>
        {children}
      </button>
    ),
    Card: Block,
    CardContent: Block,
    CardHeader: Block,
    CardTitle: ({ children }: { children?: ReactTypes.ReactNode }) => <h2>{children}</h2>,
    cn: (...classes: Array<string | null | false | undefined>) => classes.filter(Boolean).join(" "),
    Empty: ({ children, ...props }: ReactTypes.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    EmptyContent: Block,
    EmptyDescription: Block,
    EmptyHeader: Block,
    EmptyMedia: Block,
    EmptyTitle: Block,
    Table: ({ children }: { children?: ReactTypes.ReactNode }) => <table>{children}</table>,
    TableBody: ({ children }: { children?: ReactTypes.ReactNode }) => <tbody>{children}</tbody>,
    TableCell: ({ children }: { children?: ReactTypes.ReactNode }) => <td>{children}</td>,
    TableHead: ({ children }: { children?: ReactTypes.ReactNode }) => <th>{children}</th>,
    TableHeader: ({ children }: { children?: ReactTypes.ReactNode }) => <thead>{children}</thead>,
    TableRow: ({ children }: { children?: ReactTypes.ReactNode }) => <tr>{children}</tr>,
    // Radix unmounts inactive tab panels; the mock renders every panel so one
    // assertion can prove all six sections exist on an empty departure.
    Tabs: ({
      children,
      value,
      onValueChange,
    }: {
      children?: ReactTypes.ReactNode
      value?: string
      onValueChange?: (value: string) => void
    }) => {
      testState.onValueChange = onValueChange
      testState.activeTab = value
      return <div data-active-tab={value}>{children}</div>
    },
    TabsContent: Block,
    TabsList: Block,
    TabsTrigger: ({ children, value }: { children?: ReactTypes.ReactNode; value: string }) => (
      <button
        type="button"
        data-tab-trigger={value}
        onClick={() => testState.onValueChange?.(value)}
      >
        {children}
      </button>
    ),
  }
})

describe("AvailabilitySlotDetailPage — the departure workspace", () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  const render = (element: ReactTypes.ReactElement) => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root?.render(element))
    return container
  }

  afterEach(() => {
    if (root) act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
    testState.summary = null
    testState.bookings = []
    testState.onValueChange = undefined
    testState.activeTab = undefined
  })

  it("renders all six sections on an empty departure, each with its next action", () => {
    testState.summary = EMPTY_SUMMARY
    const view = render(
      <AvailabilitySlotDetailPage
        id="slot_1"
        // The Allocation section is the host's manager (SlotAllocationPage in
        // the operator); its own empty state — "Add resource" / "Generate
        // resources" — is covered by slot-allocation-page.test.tsx.
        renderAllocation={() => <p>allocation-manager</p>}
        renderExtras={() => <p>extras-manifest</p>}
        onCreateBooking={() => undefined}
        onAddPickupPoint={() => undefined}
        onAddCloseout={() => undefined}
        onOpenProduct={() => undefined}
        onOpenFinanceReport={() => undefined}
      />,
    )

    // All six section triggers exist, whether or not the section has rows.
    for (const tab of [
      "overview",
      "travelers",
      "allocation",
      "operations",
      "financials",
      "activity",
    ]) {
      expect(view.querySelector(`[data-tab-trigger="${tab}"]`)).not.toBeNull()
    }

    const text = view.textContent ?? ""

    // Overview — nothing to reconcile, with somewhere to go next.
    expect(text).toContain("Nothing needs attention")
    expect(text).toContain("Review the roster")
    // Travelers.
    expect(text).toContain("Nobody is booked on this departure yet")
    expect(text).toContain("Create a booking")
    // Allocation.
    expect(text).toContain("allocation-manager")
    // Operations — the two sections that used to disappear entirely.
    expect(text).toContain("No pickup points on this departure")
    expect(text).toContain("Add a pickup point")
    expect(text).toContain("This departure is open for sale")
    expect(text).toContain("Close this date")
    expect(text).toContain("No extras are offered on this departure")
    expect(text).toContain("Configure extras on the product")
    // Financials — no Finance provider bound is an explicit state, not zeros.
    expect(text).toContain("Profitability is unavailable")
    expect(text).toContain("Open the profitability report")
    // Activity.
    expect(text).toContain("Nothing has happened on this departure yet")
    expect(text).toContain("Go to Allocation")
  })

  it("groups the roster by reservation instead of repeating a booking number per row", () => {
    testState.summary = {
      ...EMPTY_SUMMARY,
      travelers: { entered: 3, lead: 1, assigned: 0, unassigned: 3, missing: 0 },
      bookings: { ...EMPTY_SUMMARY.bookings, count: 2 },
    } satisfies DepartureSummary
    testState.bookings = [
      booking({
        id: "bkg_2",
        bookingNumber: "BK-2605-6381",
        bookingSequence: 2,
        pax: 1,
        travelers: [travelerRow("trv_3", "Violeta Luca")],
      }),
      booking({
        id: "bkg_1",
        bookingNumber: "BK-2605-1014",
        bookingSequence: 1,
        paymentStatus: "paid",
        contactFirstName: "Mariana",
        contactLastName: "Marin",
        pax: 3,
        travelers: [
          travelerRow("trv_1", "Mariana Marin", { isLeadTraveler: true }),
          travelerRow("trv_2", "Ileana Plangă"),
        ],
      }),
    ]

    const view = render(<AvailabilitySlotDetailPage id="slot_1" tab="travelers" />)

    const groups = [...view.querySelectorAll("[data-slot='departure-traveler-group']")]
    // Two reservations, in departure-local sequence — not the manifest's order.
    expect(groups.map((group) => group.getAttribute("data-booking-id"))).toEqual(["bkg_1", "bkg_2"])
    // Every traveler sits inside its own reservation, so who came together is
    // structural rather than a booking number the reader has to match by eye.
    expect(groups[0]?.querySelectorAll("[data-slot='departure-traveler']")).toHaveLength(2)
    expect(groups[1]?.querySelectorAll("[data-slot='departure-traveler']")).toHaveLength(1)
    expect(groups[0]?.textContent).toContain("BK-2605-1014")
    expect(groups[0]?.textContent).toContain("Mariana Marin")
    expect(groups[0]?.textContent).toContain("Ileana Plangă")
    expect(groups[1]?.textContent).toContain("Violeta Luca")

    const text = view.textContent ?? ""
    // The group carries what belongs to the party: who booked it, whether it is
    // paid, and which reservation is short of names.
    expect(text).toContain("Booked by Mariana Marin")
    expect(text).toContain("Paid")
    expect(text).toContain("2 / 3 names")
    expect(text).toContain("1 / 1 names")
  })

  it("drops every seat-shaped affordance on a departure that allocates nothing", () => {
    const excursion = {
      total: 0,
      templated: 0,
      seating: 0,
      capacity: 0,
      assigned: 0,
      available: 0,
      overCapacity: 0,
      planned: false,
    }
    testState.summary = {
      ...EMPTY_SUMMARY,
      capacity: { ...EMPTY_SUMMARY.capacity, resources: excursion },
      allocation: excursion,
      travelers: { entered: 2, lead: 1, assigned: 0, unassigned: 2, missing: 0 },
    } satisfies DepartureSummary
    testState.bookings = [
      booking({
        id: "bkg_1",
        bookingNumber: "BK-2608-907921",
        bookingSequence: 1,
        pax: 2,
        travelers: [travelerRow("trv_1", "Jeni Irimia"), travelerRow("trv_2", "Andrei Irimia")],
      }),
    ]

    const view = render(
      <AvailabilitySlotDetailPage
        id="slot_1"
        renderAllocation={() => <p>allocation-manager</p>}
        onOpenProduct={() => undefined}
      />,
    )
    const text = view.textContent ?? ""

    // No "0 seated / 2 not seated" against a rooming plan that does not exist…
    expect(text).not.toContain("Seated")
    expect(text).not.toContain("Not seated")
    // …and the roster itself is still there.
    expect(text).toContain("Jeni Irimia")
    // The Allocation section says so plainly rather than opening an empty
    // rooming plan, and still leaves a way in.
    expect(view.querySelector("[data-slot='departure-allocation-not-planned']")).not.toBeNull()
    expect(text).toContain("This departure does not allocate rooms or seats")
    expect(text).not.toContain("allocation-manager")
    expect(text).toContain("Lay out rooms or seats anyway")
  })

  it("renders typed issues with their severity and clears them after the repair", () => {
    testState.summary = {
      ...EMPTY_SUMMARY,
      operations: {
        issues: [OVERSOLD_ISSUE, UNSEATED_ISSUE],
        criticalCount: 1,
        warningCount: 1,
        clear: false,
      },
    } satisfies DepartureSummary
    const view = render(<AvailabilitySlotDetailPage id="slot_1" />)

    const issues = [...view.querySelectorAll("[data-slot='departure-issue']")]
    expect(issues).toHaveLength(2)
    expect(issues.map((issue) => issue.getAttribute("data-severity"))).toEqual([
      "critical",
      "warning",
    ])
    expect(issues.map((issue) => issue.getAttribute("data-code"))).toEqual([
      "capacity_oversold",
      "travelers_unassigned",
    ])

    const text = view.textContent ?? ""
    // The LOCALIZED copy for the code, not the server's English fallback.
    expect(text).toContain("Departure is oversold")
    expect(text).toContain("Travelers are not seated")
    expect(text).not.toContain(OVERSOLD_ISSUE.message)
    expect(text).toContain("Critical — fix before this departure runs")
    expect(text).toContain("To reconcile")
    expect(text).not.toContain("Nothing needs attention")

    // Repair: the server now reports a clear departure.
    testState.summary = EMPTY_SUMMARY
    act(() => root?.render(<AvailabilitySlotDetailPage id="slot_1" />))

    expect(view.querySelectorAll("[data-slot='departure-issue']")).toHaveLength(0)
    expect(view.querySelector("[data-slot='departure-issues-clear']")).not.toBeNull()
    expect(view.textContent).toContain("Nothing needs attention")
  })

  it("falls back to the server message for a code it has no catalogue entry for", () => {
    testState.summary = {
      ...EMPTY_SUMMARY,
      operations: {
        issues: [
          {
            code: "a_code_from_a_newer_server",
            severity: "warning",
            subjectType: "departure",
            subjectId: "slot_1",
            count: 1,
            message: "Something this client has never heard of.",
          },
        ],
        criticalCount: 0,
        warningCount: 1,
        clear: false,
      },
    } satisfies DepartureSummary
    const view = render(<AvailabilitySlotDetailPage id="slot_1" />)

    expect(view.textContent).toContain("Something this client has never heard of.")
  })

  it("round-trips the selected section through the tab contract", () => {
    testState.summary = EMPTY_SUMMARY
    const onTabChange = vi.fn()
    const view = render(
      <AvailabilitySlotDetailPage id="slot_1" tab="financials" onTabChange={onTabChange} />,
    )

    // The controlled value drives the workspace…
    expect(view.querySelector("[data-active-tab]")?.getAttribute("data-active-tab")).toBe(
      "financials",
    )

    // …and selecting another section reports it back for the URL to carry.
    act(() => {
      view.querySelector<HTMLButtonElement>('[data-tab-trigger="travelers"]')?.click()
    })
    expect(onTabChange).toHaveBeenCalledWith("travelers")
  })

  it("keeps the workspace uncontrolled when the host binds no tab contract", () => {
    testState.summary = EMPTY_SUMMARY
    const view = render(<AvailabilitySlotDetailPage id="slot_1" />)

    expect(view.querySelector("[data-active-tab]")?.getAttribute("data-active-tab")).toBe(
      "overview",
    )

    act(() => {
      view.querySelector<HTMLButtonElement>('[data-tab-trigger="operations"]')?.click()
    })
    expect(view.querySelector("[data-active-tab]")?.getAttribute("data-active-tab")).toBe(
      "operations",
    )
  })
})
