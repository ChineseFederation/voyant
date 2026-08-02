// @vitest-environment jsdom

import type { AllocationResource } from "@voyant-travel/operations-react/availability"
import type * as ReactTypes from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SlotAllocationPage } from "./slot-allocation-page.js"

const testState = vi.hoisted(() => ({
  removeResource: vi.fn(),
  manifest: {
    slot: {
      id: "slot_1",
      productId: "prod_1",
      startsAt: null,
      endsAt: null,
    },
    bookings: [
      {
        id: "book_1",
        bookingNumber: "BK-001",
        status: "awaiting_payment",
        bookingSequence: 1,
        paymentStatus: "unpaid",
        contactFirstName: "Ioana",
        contactLastName: "Iordache",
        contactEmail: null,
        contactPhone: null,
        sellCurrency: "EUR",
        pax: 1,
        travelers: [
          {
            id: "trav_1",
            bookingId: "book_1",
            bookingNumber: "BK-001",
            bookingStatus: "awaiting_payment",
            bookingSequence: 1,
            paymentStatus: "unpaid",
            firstName: "Ioana",
            lastName: "Iordache",
            fullName: "Ioana Iordache",
            email: null,
            phone: null,
            isLeadTraveler: true,
            isPrimary: true,
            sharingGroupId: null,
            roomTypeId: null,
            bedPreference: null,
            allocations: {},
            travelerCategory: null,
            participantType: "traveler",
            hasAccessibilityNeeds: false,
            hasDietaryRequirements: false,
          },
        ],
      },
    ],
    resources: [] as AllocationResource[],
    sharingGroupLabels: {},
    summary: {
      bookingCount: 1,
      travelerCount: 1,
      leadTravelerCount: 1,
      bookingsByStatus: { awaiting_payment: 1 },
    },
  },
}))

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: {
      data: {
        initialPax: 48,
        remainingPax: 43,
        unlimited: false,
      },
    },
  }),
}))

vi.mock("@voyant-travel/operations-react/availability", () => ({
  getSlotQueryOptions: () => ({}),
  useAllocationAutomationMutation: () => ({
    autoAllocate: { isPending: false, mutateAsync: vi.fn() },
    autoMaterialize: { isPending: false, mutateAsync: vi.fn() },
    materializeTemplates: { isPending: false, mutateAsync: vi.fn() },
  }),
  useAllocationResourceMutation: () => ({
    create: { isPending: false, mutateAsync: vi.fn() },
    update: { isPending: false, mutateAsync: vi.fn() },
    remove: { isPending: false, mutateAsync: testState.removeResource },
  }),
  useAssignTravelerAllocationMutation: () => ({
    mutateAsync: vi.fn(),
  }),
  useProductResourceTemplates: () => ({
    data: { data: [] },
  }),
  useSlotAllocation: () => ({
    isPending: false,
    data: { data: testState.manifest },
  }),
  useVoyantAvailabilityContext: () => ({}),
}))

vi.mock("@voyant-travel/ui/components", () => {
  const Passthrough = ({ children }: { children?: ReactTypes.ReactNode }) => <>{children}</>
  return {
    Badge: ({ children }: { children?: ReactTypes.ReactNode }) => <span>{children}</span>,
    Button: ({ children, ...props }: ReactTypes.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
    Card: ({ children }: { children?: ReactTypes.ReactNode }) => <section>{children}</section>,
    CardContent: Passthrough,
    CardHeader: Passthrough,
    CardTitle: ({ children }: { children?: ReactTypes.ReactNode }) => <h2>{children}</h2>,
    cn: (...classes: Array<string | null | false | undefined>) => classes.filter(Boolean).join(" "),
    Dialog: Passthrough,
    DialogBody: Passthrough,
    DialogContent: Passthrough,
    DialogFooter: Passthrough,
    DialogHeader: Passthrough,
    DialogTitle: ({ children }: { children?: ReactTypes.ReactNode }) => <h2>{children}</h2>,
    Input: (props: ReactTypes.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    Label: ({ children, ...props }: ReactTypes.LabelHTMLAttributes<HTMLLabelElement>) => (
      <span {...props}>{children}</span>
    ),
    Select: Passthrough,
    SelectContent: Passthrough,
    SelectItem: ({ children }: { children?: ReactTypes.ReactNode; value?: string }) => (
      <div>{children}</div>
    ),
    SelectTrigger: Passthrough,
    SelectValue: Passthrough,
    Table: ({ children }: { children?: ReactTypes.ReactNode }) => <table>{children}</table>,
    TableBody: ({ children }: { children?: ReactTypes.ReactNode }) => <tbody>{children}</tbody>,
    TableCell: ({ children }: { children?: ReactTypes.ReactNode }) => <td>{children}</td>,
    TableHead: ({ children }: { children?: ReactTypes.ReactNode }) => <th>{children}</th>,
    TableHeader: ({ children }: { children?: ReactTypes.ReactNode }) => <thead>{children}</thead>,
    TableRow: ({ children }: { children?: ReactTypes.ReactNode }) => <tr>{children}</tr>,
    Tabs: Passthrough,
    TabsList: Passthrough,
    TabsTrigger: ({ children }: { children?: ReactTypes.ReactNode }) => (
      <button type="button">{children}</button>
    ),
  }
})

describe("SlotAllocationPage", () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  afterEach(() => {
    if (root) {
      act(() => root?.unmount())
    }
    container?.remove()
    root = null
    container = null
    testState.manifest.resources = []
    testState.manifest.bookings[0]!.travelers[0]!.allocations = {}
    testState.removeResource.mockReset()
  })

  it("shows booked travelers and standard logistics kinds without templates", () => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(<SlotAllocationPage slotId="slot_1" />)
    })

    expect(container.textContent).toContain("Rooms")
    expect(container.textContent).toContain("Vehicles")
    expect(container.textContent).toContain("Seats")
    expect(container.textContent).toContain("Add resource")
    expect(container.textContent).toContain("BK-001")
    expect(container.textContent).toContain("Ioana Iordache")
    expect(container.textContent).not.toContain("This slot has no allocations to manage.")
  })

  it("surfaces resource removal failures in the workspace", async () => {
    testState.manifest.resources = [
      {
        id: "room_1",
        slotId: "slot_1",
        kind: "room",
        refType: null,
        refId: null,
        label: "Room 101",
        capacity: 1,
        flags: {},
        parentId: null,
        sortOrder: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]
    testState.manifest.bookings[0]!.travelers[0]!.allocations = { room: "room_1" }
    testState.removeResource.mockRejectedValueOnce(
      new Error("Remove child resources before deleting their parent"),
    )
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<SlotAllocationPage slotId="slot_1" />)
    })
    const removeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Remove"]')
    expect(removeButton).not.toBeNull()

    await act(async () => {
      removeButton?.click()
    })

    expect(container.textContent).toContain("Remove child resources before deleting their parent")
  })
})
