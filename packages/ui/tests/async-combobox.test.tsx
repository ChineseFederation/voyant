import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AsyncCombobox } from "../src/components/async-combobox.js"

afterEach(() => {
  cleanup()
})

type Item = {
  id: string
  label: string
  secondary?: string
}

describe("AsyncCombobox", () => {
  it("exposes search results as named options with an active descendant", () => {
    const onChange = vi.fn()
    const items: Item[] = [
      { id: "product-paris", label: "Paris City Tour", secondary: "products" },
      { id: "product-rome", label: "Rome Food Walk", secondary: "products" },
    ]

    render(
      <AsyncCombobox
        value={null}
        onChange={onChange}
        items={items}
        getKey={(item) => item.id}
        getLabel={(item) => item.label}
        getSecondary={(item) => item.secondary}
        placeholder="Search products"
      />,
    )

    const input = screen.getByRole("combobox")
    fireEvent.click(screen.getByRole("button", { name: "Open options" }))
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: "ArrowDown" })

    const listbox = screen.getByRole("listbox")
    const options = within(listbox).getAllByRole("option")

    expect(options).toHaveLength(2)
    expect(within(listbox).getByRole("option", { name: /Paris City Tour/ })).toBeInstanceOf(
      HTMLElement,
    )
    expect(within(listbox).getByRole("option", { name: /Rome Food Walk/ })).toBeInstanceOf(
      HTMLElement,
    )
    expect(options.map((option) => option.id)).toContain(
      input.getAttribute("aria-activedescendant"),
    )
  })

  it("keeps server-returned options when the input matches only secondary fields", () => {
    const onChange = vi.fn()
    const onSearchChange = vi.fn()
    const items: Item[] = [
      { id: "traveler-ada", label: "Ada Lovelace", secondary: "ada@example.com" },
      { id: "traveler-grace", label: "Grace Hopper", secondary: "grace@example.com" },
    ]

    render(
      <AsyncCombobox
        value={null}
        onChange={onChange}
        onSearchChange={onSearchChange}
        items={items}
        getKey={(item) => item.id}
        getLabel={(item) => item.label}
        getSecondary={(item) => item.secondary}
        placeholder="Search travelers"
      />,
    )

    const input = screen.getByRole("combobox")
    fireEvent.click(screen.getByRole("button", { name: "Open options" }))
    fireEvent.change(input, { target: { value: "ada@example.com" } })
    fireEvent.keyDown(input, { key: "ArrowDown" })

    const listbox = screen.getByRole("listbox")
    const adaOption = within(listbox).getByRole("option", { name: /Ada Lovelace/ })

    expect(onSearchChange).toHaveBeenCalledWith("ada@example.com")
    expect(adaOption).toBeInstanceOf(HTMLElement)
    expect(input.getAttribute("aria-activedescendant")).toBe(adaOption.id)
  })
})
