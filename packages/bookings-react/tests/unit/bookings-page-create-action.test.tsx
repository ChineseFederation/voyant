// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BookingsPage } from "../../src/components/bookings-page.js"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.mock("../../src/components/booking-list.js", () => ({
  BookingList: () => <div data-testid="booking-list" />,
}))

describe("BookingsPage create action", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it("renders the primary New booking button and invokes route navigation", async () => {
    const onBookingCreate = vi.fn()
    await act(async () => root.render(<BookingsPage onBookingCreate={onBookingCreate} />))
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "New booking",
    )
    expect(button).toBeDefined()
    await act(async () => button?.click())
    expect(onBookingCreate).toHaveBeenCalledOnce()
    expect(container.querySelector('[data-testid="booking-list"]')).not.toBeNull()
  })
})
