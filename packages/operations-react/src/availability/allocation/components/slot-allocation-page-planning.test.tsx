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
function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set
  setter?.call(select, value)
  select.dispatchEvent(new Event("change", { bubbles: true }))
}

describe("SlotAllocationPage planning", () => {
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

  it("moves a multi-traveler selection through the atomic batch leg", async () => {
    testState.manifest.resources = [
      {
        id: "room_1",
        slotId: "slot_1",
        kind: "room",
        refType: null,
        refId: null,
        label: "Room 101",
        capacity: 2,
        flags: {},
        parentId: null,
        sortOrder: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]
    testState.batchAssign.mockResolvedValue({
      kind: "room",
      assigned: 1,
      unassigned: 0,
      unchanged: 0,
      travelerIds: ["trav_1"],
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<SlotAllocationPage slotId="slot_1" />)
    })

    // Nothing selected: no bulk bar.
    expect(container.querySelector('[data-slot="allocation-bulk-bar"]')).toBeNull()

    const checkbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"][aria-label="Select Ioana Iordache"]',
    )
    expect(checkbox).not.toBeNull()
    await act(async () => {
      checkbox?.click()
    })

    const bulkBar = container.querySelector('[data-slot="allocation-bulk-bar"]')
    expect(bulkBar).not.toBeNull()
    expect(bulkBar?.textContent).toContain("1 travelers selected")

    const move = container.querySelector<HTMLButtonElement>('[data-slot="allocation-bulk-move"]')
    expect(move?.disabled).toBe(true)

    const target = container.querySelector<HTMLSelectElement>(
      '[data-slot="allocation-bulk-target"] select',
    )
    expect(target).not.toBeNull()
    await act(async () => {
      setSelectValue(target!, "room_1")
    })

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-slot="allocation-bulk-move"]')?.click()
    })

    expect(testState.batchAssign).toHaveBeenCalledTimes(1)
    expect(testState.batchAssign).toHaveBeenCalledWith({
      kind: "room",
      assignments: [{ travelerId: "trav_1", resourceId: "room_1", expectedResourceId: null }],
    })
    // The selection clears once the batch lands, so a second click cannot
    // replay the move against a manifest that has already moved.
    expect(container.querySelector('[data-slot="allocation-bulk-bar"]')).toBeNull()
  })

  it("previews the auto-allocation plan and only writes once it is confirmed", async () => {
    testState.manifest.resources = [
      {
        id: "room_1",
        slotId: "slot_1",
        kind: "room",
        refType: null,
        refId: null,
        label: "Room 101",
        capacity: 2,
        flags: {},
        parentId: null,
        sortOrder: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]
    testState.previewAutoAllocate.mockResolvedValue({
      kind: "room",
      assigned: 1,
      skipped: 0,
      entries: [
        {
          travelerId: "trav_1",
          travelerName: "Ioana Iordache",
          bookingId: "book_1",
          bookingNumber: "BK-001",
          sharingGroupId: null,
          resourceId: "room_1",
          resourceLabel: "Room 101",
          currentResourceId: null,
          unchanged: false,
        },
      ],
      violations: [],
    })
    testState.autoAllocate.mockResolvedValue({ kind: "room", assigned: 1, skipped: 0 })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<SlotAllocationPage slotId="slot_1" />)
    })

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-slot="allocation-auto-allocate"]')?.click()
    })

    expect(testState.previewAutoAllocate).toHaveBeenCalledWith({ kind: "room" })
    // The dry run must not have written anything yet.
    expect(testState.autoAllocate).not.toHaveBeenCalled()
    const planRows = container.querySelectorAll('[data-slot="allocation-preview-entry"]')
    expect(planRows).toHaveLength(1)
    expect(container.textContent).toContain("1 to place, 0 skipped")
    expect(container.textContent).toContain("Room 101")

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('[data-slot="allocation-preview-confirm"]')
        ?.click()
    })

    expect(testState.autoAllocate).toHaveBeenCalledWith({ kind: "room" })
  })

  it("refuses to confirm a plan the server says would exceed capacity", async () => {
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
    testState.previewAutoAllocate.mockResolvedValue({
      kind: "room",
      assigned: 2,
      skipped: 0,
      entries: [],
      violations: [
        {
          slotId: "slot_1",
          resourceId: "room_1",
          kind: "room",
          capacity: 1,
          existingAssigned: 1,
          requested: 2,
        },
      ],
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<SlotAllocationPage slotId="slot_1" />)
    })
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-slot="allocation-auto-allocate"]')?.click()
    })

    expect(container.querySelector('[data-slot="allocation-preview-violations"]')).not.toBeNull()
    expect(
      container.querySelector<HTMLButtonElement>('[data-slot="allocation-preview-confirm"]')
        ?.disabled,
    ).toBe(true)
    expect(testState.autoAllocate).not.toHaveBeenCalled()
  })

  it("downloads the resource CSV for the active kind and prints the departure sheet", async () => {
    testState.manifest.resources = [
      {
        id: "room_1",
        slotId: "slot_1",
        kind: "room",
        refType: null,
        refId: null,
        label: "Room 101",
        capacity: 2,
        flags: {},
        parentId: null,
        sortOrder: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]
    testState.exportCsv.mockResolvedValue({ csv: "Resource\r\n", filename: "rooming-slot_1.csv" })
    const print = vi.fn()
    vi.stubGlobal("print", print)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<SlotAllocationPage slotId="slot_1" departureLabel="Sinaia · 2026-08-04" />)
    })

    const roomingItem = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Rooming",
    )
    expect(roomingItem).toBeDefined()
    await act(async () => {
      roomingItem?.click()
    })

    // The kind rides along, so the same menu entry exports a seating manifest
    // on a coach tab — the route parameter the server slice added.
    expect(testState.exportCsv).toHaveBeenCalledWith({ variant: "resources", kind: "room" })
    expect(testState.downloadCsv).toHaveBeenCalledWith({
      csv: "Resource\r\n",
      filename: "rooming-slot_1.csv",
    })

    const passengersItem = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Passengers",
    )
    await act(async () => {
      passengersItem?.click()
    })
    expect(testState.exportCsv).toHaveBeenCalledWith({ variant: "passengers", kind: "room" })

    const printItem = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Print manifest",
    )
    await act(async () => {
      printItem?.click()
    })
    expect(print).toHaveBeenCalled()

    // The printed sheet names the departure and its rooms, never a typeid.
    const sheet = container.querySelector('[data-slot="allocation-print-view"]')
    expect(sheet).not.toBeNull()
    expect(sheet?.textContent).toContain("Sinaia · 2026-08-04")
    expect(sheet?.textContent).toContain("Room 101")
    expect(sheet?.textContent).not.toContain("room_1")

    vi.unstubAllGlobals()
  })
})
