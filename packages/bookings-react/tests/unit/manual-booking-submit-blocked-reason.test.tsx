// @vitest-environment jsdom

import type * as ReactTypes from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

import {
  MANUAL_BOOKING_SUBMIT_BLOCKED_ID,
  type ManualBookingSubmitBlocker,
  ManualBookingSubmitFooter,
  manualBookingSubmitBlockedNotice,
  manualBookingSubmitBlockerMessage,
  resolveManualBookingSubmitBlocker,
} from "../../src/components/manual-booking-create-form.js"
import { bookingsUiEn } from "../../src/i18n/en.js"
import { bookingsUiRo } from "../../src/i18n/ro.js"

const copy = bookingsUiEn.manualBookingCreate

/** Nothing blocking: every gate open. */
const unblocked = {
  isSourcedProduct: false,
  hasProduct: true,
  hasBookingTiming: true,
  hasSelectedUnits: true,
  quoteIsSettling: false,
  sourcedQuoteReady: true,
  promotionReady: true,
}

describe("resolveManualBookingSubmitBlocker", () => {
  it("returns null when nothing blocks submit", () => {
    expect(resolveManualBookingSubmitBlocker(unblocked)).toBeNull()
  })

  it.each([
    ["sourced", { isSourcedProduct: true }],
    ["product", { hasProduct: false }],
    ["timing", { hasBookingTiming: false }],
    ["units", { hasSelectedUnits: false }],
    ["settling", { quoteIsSettling: true }],
    ["pricing", { sourcedQuoteReady: false }],
    ["promotion", { promotionReady: false }],
  ] as const)("names %s as the blocker", (expected, patch) => {
    expect(resolveManualBookingSubmitBlocker({ ...unblocked, ...patch })).toBe(expected)
  })

  it("reports the first blocker in the submit handler's own order", () => {
    // The handler checks sourced before pricing before promotion, so a form
    // failing all three must report the one a submit would have raised.
    expect(
      resolveManualBookingSubmitBlocker({
        ...unblocked,
        isSourcedProduct: true,
        sourcedQuoteReady: false,
        promotionReady: false,
      }),
    ).toBe("sourced")
    expect(
      resolveManualBookingSubmitBlocker({
        ...unblocked,
        hasSelectedUnits: false,
        quoteIsSettling: true,
      }),
    ).toBe("units")
  })
})

describe("manualBookingSubmitBlockerMessage", () => {
  const blockers: ManualBookingSubmitBlocker[] = [
    "sourced",
    "product",
    "timing",
    "units",
    "settling",
    "pricing",
    "promotion",
  ]

  it("gives every blocker its own non-empty sentence", () => {
    const messages = blockers.map((blocker) =>
      manualBookingSubmitBlockerMessage(blocker, copy, { promotionRejected: false }),
    )
    expect(messages.every((message) => message.trim().length > 0)).toBe(true)
    expect(new Set(messages).size).toBe(blockers.length)
  })

  it("reuses the sentence a failed submit would have raised", () => {
    expect(manualBookingSubmitBlockerMessage("product", copy, { promotionRejected: false })).toBe(
      copy.validation.product,
    )
    expect(manualBookingSubmitBlockerMessage("timing", copy, { promotionRejected: false })).toBe(
      copy.validation.departure,
    )
    expect(manualBookingSubmitBlockerMessage("settling", copy, { promotionRejected: false })).toBe(
      copy.validation.pricingPending,
    )
    expect(manualBookingSubmitBlockerMessage("pricing", copy, { promotionRejected: false })).toBe(
      copy.validation.pricingUnavailable,
    )
    expect(manualBookingSubmitBlockerMessage("sourced", copy, { promotionRejected: false })).toBe(
      copy.validation.sourcedBookingSessionRequired,
    )
  })

  it("distinguishes a rejected promotion code from one it could not check", () => {
    expect(manualBookingSubmitBlockerMessage("promotion", copy, { promotionRejected: true })).toBe(
      copy.promotion.blocked,
    )
    expect(manualBookingSubmitBlockerMessage("promotion", copy, { promotionRejected: false })).toBe(
      copy.promotion.unavailable,
    )
  })

  it("names the Options section for the units blocker rather than repeating the anchored message", () => {
    const message = manualBookingSubmitBlockerMessage("units", copy, { promotionRejected: false })
    expect(message).not.toBe(copy.validation.units)
    // voyant#4762: the operator read "Select at least one option." as the
    // Generate proforma / contract checkboxes beside the button. The
    // button-level sentence has to say which section it means.
    expect(message).toContain(bookingsUiEn.bookingCreateDialog.labels.roomsHeading)
  })
})

describe("units copy no longer collides with the document checkboxes", () => {
  // The exact sentences the operator in voyant#4762 read as Generate proforma
  // / Generate invoice and contract. Pinned so neither locale can drift back.
  const collided = [
    "Select at least one option.",
    "Select at least one option",
    "Selecteaza cel putin o optiune.",
    "Selecteaza cel putin o optiune",
  ]

  it.each([
    ["en", bookingsUiEn],
    ["ro", bookingsUiRo],
  ])("%s no longer offers the bare 'at least one option' sentence", (_locale, messages) => {
    expect(collided).not.toContain(messages.manualBookingCreate.validation.units)
    expect(collided).not.toContain(messages.bookingCreateDialog.validation.selectUnits)
  })

  it.each([
    ["en", bookingsUiEn],
    ["ro", bookingsUiRo],
  ])("%s names the Options section at the button", (_locale, messages) => {
    expect(messages.manualBookingCreate.submitBlocked.units).toContain(
      messages.bookingCreateDialog.labels.roomsHeading,
    )
    expect(messages.manualBookingCreate.submitBlocked.label).toContain("{reason}")
  })
})

describe("manualBookingSubmitBlockedNotice", () => {
  const base = {
    copy,
    promotionRejected: false,
    isSourcedProduct: false,
    formErrorMessage: null,
  }

  it("says nothing when nothing blocks submit", () => {
    expect(manualBookingSubmitBlockedNotice({ ...base, blocker: null })).toBeNull()
  })

  it("names the button so the sentence cannot be read as the checkboxes beside it", () => {
    const notice = manualBookingSubmitBlockedNotice({ ...base, blocker: "units" })
    expect(notice).toContain(copy.submitBlocked.units)
    expect(notice).not.toBe(copy.submitBlocked.units)
  })

  it("does not repeat an alert the footer already renders", () => {
    expect(
      manualBookingSubmitBlockedNotice({ ...base, blocker: "sourced", isSourcedProduct: true }),
    ).toBeNull()
    expect(
      manualBookingSubmitBlockedNotice({
        ...base,
        blocker: "promotion",
        promotionRejected: true,
      }),
    ).toBeNull()
    expect(
      manualBookingSubmitBlockedNotice({
        ...base,
        blocker: "timing",
        formErrorMessage: copy.validation.departure,
      }),
    ).toBeNull()
  })

  it("still speaks when the banner is showing something else", () => {
    expect(
      manualBookingSubmitBlockedNotice({
        ...base,
        blocker: "units",
        formErrorMessage: copy.validation.sharedRoomGroup,
      }),
    ).not.toBeNull()
  })
})

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

describe("ManualBookingSubmitFooter", () => {
  const labels = { cancelLabel: "Cancel", submitLabel: "Create booking" }

  function submitButton() {
    return container.querySelector<HTMLButtonElement>('button[type="submit"]')
  }

  it("renders the reason and points the disabled button at it", () => {
    const reason = "Create booking is disabled: set a quantity in Options."
    render(
      <ManualBookingSubmitFooter
        {...labels}
        submitting={false}
        submitBlocked
        blockedReason={reason}
        onCancel={() => {}}
      />,
    )

    const button = submitButton()
    expect(button?.disabled).toBe(true)
    expect(button?.getAttribute("aria-describedby")).toBe(MANUAL_BOOKING_SUBMIT_BLOCKED_ID)
    const description = container.querySelector(`#${MANUAL_BOOKING_SUBMIT_BLOCKED_ID}`)
    expect(description?.textContent).toBe(reason)
  })

  it("leaves the button undescribed when nothing is blocking", () => {
    render(
      <ManualBookingSubmitFooter
        {...labels}
        submitting={false}
        submitBlocked={false}
        blockedReason={null}
        onCancel={() => {}}
      />,
    )

    const button = submitButton()
    expect(button?.disabled).toBe(false)
    expect(button?.hasAttribute("aria-describedby")).toBe(false)
    expect(container.querySelector(`#${MANUAL_BOOKING_SUBMIT_BLOCKED_ID}`)).toBeNull()
  })

  it("drops the reason while the booking is being submitted", () => {
    render(
      <ManualBookingSubmitFooter
        {...labels}
        submitting
        submitBlocked={false}
        blockedReason="Create booking is disabled: something."
        onCancel={() => {}}
      />,
    )

    expect(submitButton()?.disabled).toBe(true)
    expect(submitButton()?.hasAttribute("aria-describedby")).toBe(false)
    expect(container.querySelector(`#${MANUAL_BOOKING_SUBMIT_BLOCKED_ID}`)).toBeNull()
  })
})
