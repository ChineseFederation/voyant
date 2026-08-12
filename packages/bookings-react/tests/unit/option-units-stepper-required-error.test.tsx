// @vitest-environment jsdom

import type * as ReactTypes from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.mock("@voyant-travel/ui/components", () => ({
  Button: ({ children, ...props }: ReactTypes.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Label: ({ children }: { children?: ReactTypes.ReactNode }) => <span>{children}</span>,
}))

vi.mock("@tanstack/react-query", () => ({ useQueries: () => [] }))

vi.mock("@voyant-travel/inventory-react", () => ({
  getOptionUnitsQueryOptions: () => ({ queryKey: ["option-units"] }),
  useProductOptions: () => ({ data: { data: [] }, isSuccess: true }),
  useVoyantProductsContext: () => ({}),
}))

vi.mock("@voyant-travel/operations-react/availability", () => ({
  useSlotUnitAvailability: () => ({ data: { data: [] }, isSuccess: true }),
}))

import {
  OptionUnitsStepperSection,
  type OptionUnitsStepperUnit,
} from "../../src/components/option-units-stepper-section.js"
import { bookingsUiEn } from "../../src/i18n/en.js"

const personUnits: OptionUnitsStepperUnit[] = [
  {
    optionId: "opt_excursion",
    optionUnitId: "unit_adult",
    unitName: "Adult",
    unitType: "person",
    occupancyMax: null,
    initial: null,
    reserved: 0,
    remaining: null,
  },
]

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

function render(node: ReactTypes.ReactNode) {
  act(() => root.render(node))
}

describe("OptionUnitsStepperSection required/error anchoring", () => {
  it("renders a person option's uncapped row as drawing on departure capacity", () => {
    render(
      <OptionUnitsStepperSection
        value={{ quantities: {} }}
        onChange={() => {}}
        productId="prod_1"
        slotId="slot_1"
        optionId="opt_excursion"
        slotHasFiniteCapacity
        providedOptions={[{ id: "opt_excursion", name: "One-day excursion" }]}
        providedUnits={personUnits}
      />,
    )

    const text = container.textContent ?? ""
    expect(text).toContain(bookingsUiEn.roomsStepperSection.labels.fillsSlotCapacity)
    expect(text).not.toMatch(/full/i)
  })

  it("anchors the validation message to the section and marks it required", () => {
    render(
      <OptionUnitsStepperSection
        value={{ quantities: {} }}
        onChange={() => {}}
        productId="prod_1"
        slotId="slot_1"
        optionId="opt_excursion"
        required
        error="Select at least one option."
        slotHasFiniteCapacity
        providedOptions={[{ id: "opt_excursion", name: "One-day excursion" }]}
        providedUnits={personUnits}
      />,
    )

    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toBe("Select at least one option.")

    const section = container.querySelector("[aria-invalid]")
    expect(section).not.toBeNull()
    expect(section?.getAttribute("aria-describedby")).toBe(alert?.id)
    expect(container.textContent).toContain(bookingsUiEn.roomsStepperSection.labels.required)
  })

  it("leaves the section unmarked when no message is anchored to it", () => {
    render(
      <OptionUnitsStepperSection
        value={{ quantities: {} }}
        onChange={() => {}}
        productId="prod_1"
        slotId="slot_1"
        optionId="opt_excursion"
        providedOptions={[{ id: "opt_excursion", name: "One-day excursion" }]}
        providedUnits={personUnits}
      />,
    )

    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector("[aria-invalid]")).toBeNull()
  })

  it("exposes a focus anchor so a failed submit can reach the control", () => {
    const sectionRef: { current: HTMLDivElement | null } = { current: null }
    render(
      <OptionUnitsStepperSection
        value={{ quantities: {} }}
        onChange={() => {}}
        productId="prod_1"
        slotId="slot_1"
        optionId="opt_excursion"
        sectionRef={sectionRef}
        providedOptions={[{ id: "opt_excursion", name: "One-day excursion" }]}
        providedUnits={personUnits}
      />,
    )

    expect(sectionRef.current).not.toBeNull()
    act(() => sectionRef.current?.focus())
    expect(document.activeElement).toBe(sectionRef.current)
  })
})
