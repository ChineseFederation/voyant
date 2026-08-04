// @vitest-environment jsdom

import type { AllocationResource } from "@voyant-travel/operations-react/availability"
import type * as ReactTypes from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SlotAllocationPage } from "./slot-allocation-page.js"

const testState = vi.hoisted(() => ({
  removeResource: vi.fn(),
  autoAllocate: vi.fn(),
  previewAutoAllocate: vi.fn(),
  batchAssign: vi.fn(),
  attachFleetResource: vi.fn(),
  detachFleetResource: vi.fn(),
  pairSharingGroup: vi.fn(),
  exportCsv: vi.fn(),
  downloadCsv: vi.fn(),
  conflicts: [] as Array<Record<string, unknown>>,
  fleetCatalogue: [] as Array<Record<string, unknown>>,
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
  downloadCsvDocument: testState.downloadCsv,
  getSlotQueryOptions: () => ({}),
  useAllocationAutomationMutation: () => ({
    autoAllocate: { isPending: false, mutateAsync: testState.autoAllocate },
    autoMaterialize: { isPending: false, mutateAsync: vi.fn() },
    materializeTemplates: { isPending: false, mutateAsync: vi.fn() },
  }),
  useAllocationExportMutation: () => ({
    isPending: false,
    mutateAsync: testState.exportCsv,
  }),
  useAllocationResourceMutation: () => ({
    create: { isPending: false, mutateAsync: vi.fn() },
    update: { isPending: false, mutateAsync: vi.fn() },
    remove: { isPending: false, mutateAsync: testState.removeResource },
  }),
  useAssignTravelerAllocationMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useTravelerRoomingPreferencesMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useAutoAllocatePreviewMutation: () => ({
    isPending: false,
    mutateAsync: testState.previewAutoAllocate,
  }),
  useBatchAssignTravelerAllocationsMutation: () => ({
    isPending: false,
    mutateAsync: testState.batchAssign,
  }),
  useDepartureFleetResourceMutation: () => ({
    attach: { isPending: false, mutateAsync: testState.attachFleetResource },
    detach: { isPending: false, mutateAsync: testState.detachFleetResource },
  }),
  useFleetResources: () => ({ isPending: false, data: { data: testState.fleetCatalogue } }),
  useProductResourceTemplates: () => ({
    data: { data: [] },
  }),
  useSharingGroupLabelMutation: () => ({
    update: { isPending: false, mutateAsync: vi.fn() },
    remove: { isPending: false, mutateAsync: vi.fn() },
  }),
  useSlotAllocation: () => ({
    isPending: false,
    data: { data: testState.manifest },
  }),
  useSlotAllocationConflicts: () => ({
    isError: false,
    data: { data: testState.conflicts },
  }),
  useTravelerSharingGroupMutation: () => ({
    update: { isPending: false, mutateAsync: vi.fn() },
    pair: { isPending: false, mutateAsync: testState.pairSharingGroup },
  }),
  useVoyantAvailabilityContext: () => ({}),
}))

vi.mock("@voyant-travel/ui/components", () => {
  const Passthrough = ({ children }: { children?: ReactTypes.ReactNode }) => <>{children}</>
  return {
    Badge: ({ children }: { children?: ReactTypes.ReactNode }) => <span>{children}</span>,
    Checkbox: ({
      checked,
      onCheckedChange,
      ...props
    }: {
      checked?: boolean
      onCheckedChange?: (checked: boolean) => void
    } & ReactTypes.AriaAttributes) => (
      <input
        type="checkbox"
        checked={checked ?? false}
        onChange={() => onCheckedChange?.(!checked)}
        {...props}
      />
    ),
    Button: ({ children, ...props }: ReactTypes.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
    Card: ({ children }: { children?: ReactTypes.ReactNode }) => <section>{children}</section>,
    CardContent: Passthrough,
    CardHeader: Passthrough,
    CardTitle: ({ children }: { children?: ReactTypes.ReactNode }) => <h2>{children}</h2>,
    cn: (...classes: Array<string | null | false | undefined>) => classes.filter(Boolean).join(" "),
    Command: Passthrough,
    CommandEmpty: Passthrough,
    CommandGroup: Passthrough,
    CommandInput: Passthrough,
    CommandItem: Passthrough,
    CommandList: Passthrough,
    Dialog: Passthrough,
    DialogBody: Passthrough,
    DialogContent: Passthrough,
    DialogFooter: Passthrough,
    DialogHeader: Passthrough,
    DialogTitle: ({ children }: { children?: ReactTypes.ReactNode }) => <h2>{children}</h2>,
    DropdownMenu: Passthrough,
    DropdownMenuContent: Passthrough,
    DropdownMenuItem: ({
      children,
      onClick,
    }: {
      children?: ReactTypes.ReactNode
      onClick?: () => void
    }) => (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuTrigger: ({ render }: { render?: ReactTypes.ReactNode }) => <>{render}</>,
    Empty: ({ children }: { children?: ReactTypes.ReactNode }) => <div>{children}</div>,
    EmptyDescription: ({ children }: { children?: ReactTypes.ReactNode }) => <p>{children}</p>,
    EmptyHeader: Passthrough,
    EmptyMedia: Passthrough,
    EmptyTitle: ({ children }: { children?: ReactTypes.ReactNode }) => <h3>{children}</h3>,
    Input: (props: ReactTypes.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    Textarea: (props: ReactTypes.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
      <textarea {...props} />
    ),
    Label: ({ children, ...props }: ReactTypes.LabelHTMLAttributes<HTMLLabelElement>) => (
      <span {...props}>{children}</span>
    ),
    Popover: Passthrough,
    PopoverContent: Passthrough,
    PopoverTrigger: ({ render }: { render?: ReactTypes.ReactNode }) => <>{render}</>,
    RadioGroup: Passthrough,
    RadioGroupItem: ({ value }: { value?: string }) => (
      <input type="radio" value={value} readOnly />
    ),
    SelectionActionBar: ({
      selectionSummary,
      children,
      onClear,
      clearLabel,
    }: {
      selectionSummary?: ReactTypes.ReactNode
      children?: ReactTypes.ReactNode
      onClear?: () => void
      clearLabel?: string
    }) => (
      <div>
        <span>{selectionSummary}</span>
        {children}
        <button type="button" onClick={onClear}>
          {clearLabel}
        </button>
      </div>
    ),
    // A native <select> so a test can actually pick a destination. Base UI's
    // Select renders through a portal that jsdom cannot drive.
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string
      onValueChange?: (value: string) => void
      children?: ReactTypes.ReactNode
    }) => (
      <select value={value ?? ""} onChange={(event) => onValueChange?.(event.target.value)}>
        <option value="" />
        {children}
      </select>
    ),
    SelectContent: Passthrough,
    SelectItem: ({ children, value }: { children?: ReactTypes.ReactNode; value?: string }) => (
      <option value={value}>{children}</option>
    ),
    SelectTrigger: () => null,
    SelectValue: () => null,
    Table: ({ children }: { children?: ReactTypes.ReactNode }) => <table>{children}</table>,
    TableBody: ({ children }: { children?: ReactTypes.ReactNode }) => <tbody>{children}</tbody>,
    TableCell: ({ children }: { children?: ReactTypes.ReactNode }) => <td>{children}</td>,
    TableHead: ({ children }: { children?: ReactTypes.ReactNode }) => <th>{children}</th>,
    TableHeader: ({ children }: { children?: ReactTypes.ReactNode }) => <thead>{children}</thead>,
    TableRow: ({ children, ...props }: ReactTypes.HTMLAttributes<HTMLTableRowElement>) => (
      <tr {...props}>{children}</tr>
    ),
    Tabs: Passthrough,
    TabsList: Passthrough,
    TabsTrigger: ({ children }: { children?: ReactTypes.ReactNode }) => (
      <button type="button">{children}</button>
    ),
  }
})

/**
 * React installs its own value setter on the select element, so assigning
 * `.value` directly is invisible to it. Go through the prototype setter and
 * then dispatch, the standard React-testing workaround.
 */
function _setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set
  setter?.call(select, value)
  select.dispatchEvent(new Event("change", { bubbles: true }))
}

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
    testState.conflicts = []
    testState.fleetCatalogue = []
    testState.removeResource.mockReset()
    testState.autoAllocate.mockReset()
    testState.previewAutoAllocate.mockReset()
    testState.batchAssign.mockReset()
    testState.attachFleetResource.mockReset()
    testState.detachFleetResource.mockReset()
    testState.pairSharingGroup.mockReset()
    testState.exportCsv.mockReset()
    testState.downloadCsv.mockReset()
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
        occupancyMin: null,
        roomTypeId: null,
        bedConfiguration: null,
        accessible: false,
        minAge: null,
        maxAge: null,
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
