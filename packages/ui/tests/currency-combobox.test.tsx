import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CurrencyCombobox } from "../src/components/currency-combobox.js"

afterEach(() => {
  cleanup()
})

describe("CurrencyCombobox", () => {
  it("commits a typed ISO code without selecting from the list", () => {
    const onChange = vi.fn()
    render(<CurrencyCombobox value={null} onChange={onChange} placeholder="Select currency" />)

    const input = screen.getByRole("combobox")
    fireEvent.change(input, { target: { value: "EUR" } })

    expect(onChange).toHaveBeenCalledWith("EUR")
  })

  it("normalizes a lowercase typed code to upper case", () => {
    const onChange = vi.fn()
    render(<CurrencyCombobox value={null} onChange={onChange} placeholder="Select currency" />)

    const input = screen.getByRole("combobox")
    fireEvent.change(input, { target: { value: "usd" } })

    expect(onChange).toHaveBeenCalledWith("USD")
  })

  it("does not commit a value while the typed text is not a full valid code", () => {
    const onChange = vi.fn()
    render(<CurrencyCombobox value={null} onChange={onChange} placeholder="Select currency" />)

    const input = screen.getByRole("combobox")
    fireEvent.change(input, { target: { value: "eu" } })
    fireEvent.change(input, { target: { value: "ZZZ" } })

    expect(onChange).not.toHaveBeenCalledWith("EU")
    expect(onChange).not.toHaveBeenCalledWith("ZZZ")
  })

  it("clears the value when the input is emptied", () => {
    const onChange = vi.fn()
    render(<CurrencyCombobox value="EUR" onChange={onChange} placeholder="Select currency" />)

    const input = screen.getByRole("combobox")
    fireEvent.change(input, { target: { value: "" } })

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it("forwards an id to the input so a label can associate with it", () => {
    render(
      <CurrencyCombobox
        id="catalog-currency"
        value={null}
        onChange={() => {}}
        placeholder="Select currency"
      />,
    )

    expect(screen.getByRole("combobox").id).toBe("catalog-currency")
  })

  it("names its icon-only controls", () => {
    render(<CurrencyCombobox value="EUR" onChange={() => {}} />)

    expect(screen.getByRole("button", { name: "Clear selection" })).toBeInstanceOf(HTMLElement)
  })
})
