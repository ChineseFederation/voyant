// @vitest-environment jsdom

import {
  ALLOCATION_CONFLICT_CODES,
  type AllocationConflict,
} from "@voyant-travel/operations-react/availability"
import type * as ReactTypes from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { allocationUiEn, allocationUiRo } from "../i18n/index.js"
import {
  AllocationConflictsPanel,
  summarizeAllocationConflicts,
} from "./slot-allocation-conflicts-panel.js"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.mock("@voyant-travel/ui/components", () => {
  const Passthrough = ({ children }: { children?: ReactTypes.ReactNode }) => <>{children}</>
  return {
    Badge: ({ children }: { children?: ReactTypes.ReactNode }) => <span>{children}</span>,
    Empty: ({ children, ...props }: { children?: ReactTypes.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
    EmptyDescription: ({ children }: { children?: ReactTypes.ReactNode }) => <p>{children}</p>,
    EmptyHeader: Passthrough,
    EmptyMedia: Passthrough,
    EmptyTitle: ({ children }: { children?: ReactTypes.ReactNode }) => <h3>{children}</h3>,
  }
})

function conflict(overrides: Partial<AllocationConflict> = {}): AllocationConflict {
  return {
    code: "traveler_unassigned",
    severity: "warning",
    kind: "room",
    subjectType: "traveler",
    subjectId: "trav_1",
    count: 1,
    travelerIds: ["trav_1"],
    resourceIds: [],
    message: "Traveler has not been assigned a place on this departure.",
    ...overrides,
  }
}

describe("AllocationConflictsPanel", () => {
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

  it("renders the clear state when the server reports no conflicts", () => {
    const view = render(<AllocationConflictsPanel conflicts={[]} messages={allocationUiEn} />)

    expect(view.querySelector('[data-slot="allocation-conflicts-clear"]')).not.toBeNull()
    expect(view.textContent).toContain(allocationUiEn.conflicts.clearTitle)
    expect(view.querySelector('[data-slot="allocation-conflict"]')).toBeNull()
  })

  it("groups by severity and localizes every known code", () => {
    const view = render(
      <AllocationConflictsPanel
        conflicts={[
          conflict({
            code: "duplicate_assignment",
            severity: "critical",
            subjectType: "allocation_resource",
            subjectId: "res_1",
            count: 2,
          }),
          conflict({ code: "split_sharing_group", severity: "warning", subjectId: "grp_1" }),
        ]}
        messages={allocationUiEn}
      />,
    )

    const rows = view.querySelectorAll('[data-slot="allocation-conflict"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.getAttribute("data-severity")).toBe("critical")
    expect(rows[1]?.getAttribute("data-severity")).toBe("warning")
    expect(view.textContent).toContain(allocationUiEn.conflicts.criticalGroup)
    expect(view.textContent).toContain(allocationUiEn.conflicts.warningGroup)
    expect(view.textContent).toContain(
      allocationUiEn.conflicts.codes.duplicate_assignment?.title ?? "",
    )
    expect(view.textContent).toContain(
      allocationUiEn.conflicts.codes.split_sharing_group?.description ?? "",
    )
    // Rolled-up rows show how many subjects they stand for, never the id.
    expect(view.textContent).toContain("2 affected")
    expect(view.textContent).not.toContain("res_1")
  })

  it("covers every code the server can emit, in both locales", () => {
    for (const catalogue of [allocationUiEn, allocationUiRo]) {
      for (const code of ALLOCATION_CONFLICT_CODES) {
        expect(catalogue.conflicts.codes[code].title).toBeTruthy()
        expect(catalogue.conflicts.codes[code].description).toBeTruthy()
      }
    }
  })

  it("falls back to the server's English message for a code it has never heard of", () => {
    const view = render(
      <AllocationConflictsPanel
        conflicts={[conflict({ code: "some_future_code", message: "A brand new problem." })]}
        messages={allocationUiEn}
      />,
    )

    expect(view.textContent).toContain("A brand new problem.")
  })

  it("names the subject instead of showing its id", () => {
    const view = render(
      <AllocationConflictsPanel
        conflicts={[
          conflict({
            code: "resource_over_capacity",
            severity: "critical",
            subjectType: "allocation_resource",
            subjectId: "res_1",
          }),
        ]}
        messages={allocationUiEn}
        resolveSubjectLabel={(entry) => (entry.subjectId === "res_1" ? "Room 101" : null)}
      />,
    )

    expect(view.textContent).toContain("Room 101")
    expect(view.textContent).not.toContain("res_1")
  })

  it("reports a failed projection instead of pretending the plan is clean", () => {
    const view = render(
      <AllocationConflictsPanel conflicts={[]} messages={allocationUiEn} loadFailed />,
    )

    expect(view.querySelector('[data-slot="allocation-conflicts-error"]')).not.toBeNull()
    expect(view.querySelector('[data-slot="allocation-conflicts-clear"]')).toBeNull()
  })
})

describe("summarizeAllocationConflicts", () => {
  it("counts each severity", () => {
    expect(
      summarizeAllocationConflicts([
        conflict({ severity: "critical" }),
        conflict({ severity: "critical" }),
        conflict({ severity: "warning" }),
      ]),
    ).toEqual({ critical: 2, warning: 1, total: 3 })
  })
})
