// @vitest-environment jsdom

import type * as ReactTypes from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The primitive is reduced to the one thing under test: the option list the
 * combobox is currently offering, by label.
 */
vi.mock("@voyant-travel/ui/components/combobox", () => ({
  Combobox: ({
    items,
    itemToStringValue,
    children,
  }: {
    items: readonly unknown[]
    itemToStringValue: (value: unknown) => string
    children?: ReactTypes.ReactNode
  }) => (
    <div>
      <ul data-testid="options">
        {items.map((value) => (
          <li key={String(value)}>{itemToStringValue(value)}</li>
        ))}
      </ul>
      {children}
    </div>
  ),
  ComboboxCollection: () => null,
  ComboboxContent: () => null,
  ComboboxEmpty: () => null,
  ComboboxInput: () => null,
  ComboboxItem: () => null,
  ComboboxList: () => null,
}))

import { AsyncCombobox, type AsyncComboboxOption } from "./async-combobox.js"

/** Longer than the resolver debounce, so a settled list is what gets asserted. */
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 260))))

function offeredLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll("[data-testid='options'] li")].map((li) =>
    li.textContent!.trim(),
  )
}

const DEPARTURES: Record<string, AsyncComboboxOption[]> = {
  prod_alpine: [
    { value: "slot_1", label: "2026-08-09" },
    { value: "slot_2", label: "2026-08-16" },
  ],
  prod_danube: [{ value: "slot_9", label: "2026-09-06" }],
}

describe("AsyncCombobox", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("offers the unfiltered first page without anything being typed", async () => {
    await act(async () => {
      root.render(
        <AsyncCombobox
          value={null}
          onChange={() => {}}
          searchKey="prod_alpine"
          search={(query) =>
            Promise.resolve(
              DEPARTURES.prod_alpine!.filter((o) => !query || o.label.includes(query)),
            )
          }
        />,
      )
    })
    await settle()

    expect(offeredLabels(container)).toEqual(["2026-08-09", "2026-08-16"])
  })

  it("re-resolves when searchKey changes, without waiting for the user to type", async () => {
    // A dependent picker: `search` closes over the parent selection, and its
    // identity changes every render, so the query alone cannot say when the
    // resolved list went stale.
    const render = (productId: string) =>
      root.render(
        <AsyncCombobox
          value={null}
          onChange={() => {}}
          searchKey={productId}
          search={() => Promise.resolve(DEPARTURES[productId] ?? [])}
        />,
      )

    await act(async () => render("prod_alpine"))
    await settle()
    expect(offeredLabels(container)).toEqual(["2026-08-09", "2026-08-16"])

    await act(async () => render("prod_danube"))
    // The previous product's departures are dropped immediately rather than
    // being offered until the next resolve lands.
    expect(offeredLabels(container)).toEqual([])

    await settle()
    expect(offeredLabels(container)).toEqual(["2026-09-06"])
  })
})
