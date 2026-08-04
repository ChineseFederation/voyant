// @vitest-environment jsdom

import type { AllocationResource } from "@voyant-travel/operations-react/availability"
import type * as ReactTypes from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { allocationUiEn } from "../i18n/index.js"
import { AllocationFleetPanel } from "./slot-allocation-fleet-panel.js"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.mock("@voyant-travel/ui/components", () => {
  const Passthrough = ({ children }: { children?: ReactTypes.ReactNode }) => <>{children}</>
  return {
    Badge: ({ children }: { children?: ReactTypes.ReactNode }) => <span>{children}</span>,
    Button: ({ children, ...props }: ReactTypes.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
    Table: ({ children }: { children?: ReactTypes.ReactNode }) => <table>{children}</table>,
    TableBody: ({ children }: { children?: ReactTypes.ReactNode }) => <tbody>{children}</tbody>,
    TableCell: ({ children }: { children?: ReactTypes.ReactNode }) => <td>{children}</td>,
    TableHead: ({ children }: { children?: ReactTypes.ReactNode }) => <th>{children}</th>,
    TableHeader: Passthrough,
    TableRow: ({ children, ...props }: ReactTypes.HTMLAttributes<HTMLTableRowElement>) => (
      <tr {...props}>{children}</tr>
    ),
  }
})

const coach: AllocationResource = {
  id: "alloc_coach",
  slotId: "slot_1",
  kind: "vehicle",
  refType: "resource",
  // The fleet `resources.id` — what a detach must be addressed by.
  refId: "res_coach",
  label: "Setra S415 (B-99-VYT)",
  capacity: 49,
  occupancyMin: null,
  roomTypeId: null,
  bedConfiguration: null,
  accessible: false,
  minAge: null,
  maxAge: null,
  flags: { resourceAssignmentId: "rsa_1" },
  parentId: null,
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

describe("AllocationFleetPanel", () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  function render(node: ReactTypes.ReactNode) {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root?.render(node)
    })
    return container
  }

  afterEach(() => {
    if (root) act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
  })

  it("names the coach and never shows an id", () => {
    const view = render(
      <AllocationFleetPanel
        attached={[coach]}
        messages={allocationUiEn}
        onDetach={vi.fn()}
        parentIdsWithChildren={new Set()}
        detachPending={false}
      />,
    )

    expect(view.textContent).toContain("Setra S415 (B-99-VYT)")
    expect(view.textContent).not.toContain("alloc_coach")
    expect(view.textContent).not.toContain("res_coach")
  })

  it("detaches by the fleet resource id, cascading when the coach is laid out", async () => {
    const onDetach = vi.fn()
    const view = render(
      <AllocationFleetPanel
        attached={[coach]}
        messages={allocationUiEn}
        onDetach={onDetach}
        parentIdsWithChildren={new Set(["alloc_coach"])}
        detachPending={false}
      />,
    )

    await act(async () => {
      ;[...view.querySelectorAll("button")]
        .find((button) => button.textContent === allocationUiEn.fleet.detach)
        ?.click()
    })

    expect(onDetach).toHaveBeenCalledWith({ resourceId: "res_coach", cascade: true })
  })

  it("does not cascade a coach with no seats laid out", async () => {
    const onDetach = vi.fn()
    const view = render(
      <AllocationFleetPanel
        attached={[coach]}
        messages={allocationUiEn}
        onDetach={onDetach}
        parentIdsWithChildren={new Set()}
        detachPending={false}
      />,
    )

    await act(async () => {
      ;[...view.querySelectorAll("button")]
        .find((button) => button.textContent === allocationUiEn.fleet.detach)
        ?.click()
    })

    expect(onDetach).toHaveBeenCalledWith({ resourceId: "res_coach", cascade: false })
  })

  it("shows the empty state when nothing is attached", () => {
    const view = render(
      <AllocationFleetPanel
        attached={[]}
        messages={allocationUiEn}
        onDetach={vi.fn()}
        parentIdsWithChildren={new Set()}
        detachPending={false}
      />,
    )

    expect(view.textContent).toContain(allocationUiEn.fleet.attachedEmpty)
    expect(view.querySelector('[data-slot="allocation-fleet-row"]')).toBeNull()
  })
})
