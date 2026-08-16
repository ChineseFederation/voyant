import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod/v4"

const bookingHooks = vi.hoisted(() => ({
  useBookingStatusMutation: vi.fn(),
}))

vi.mock("@voyant-travel/ui/components", () => ({
  Button: ({ children }: { children?: ReactNode }) => <button type="button">{children}</button>,
  Dialog: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <footer>{children}</footer>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h1>{children}</h1>,
  Label: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectValue: () => <span />,
  // Surfaces the resolved `checked` prop so the default polarity is assertable
  // from static markup.
  Switch: ({ id, checked, disabled }: { id?: string; checked?: boolean; disabled?: boolean }) => (
    <span
      data-switch={id}
      data-checked={String(checked === true)}
      data-disabled={String(disabled === true)}
    />
  ),
  Textarea: () => <textarea />,
}))

vi.mock("../../src/index.js", () => ({
  useBookingStatusMutation: bookingHooks.useBookingStatusMutation,
  bookingStatusOptions: [{ value: "confirmed" }, { value: "cancelled" }],
  bookingStatusSchema: z.enum(["confirmed", "cancelled", "in_progress", "completed"]),
}))

import { StatusChangeDialog } from "../../src/components/status-change-dialog.js"

beforeEach(() => {
  bookingHooks.useBookingStatusMutation.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  })
})

function render(currentStatus: "confirmed" | "cancelled", notificationsSuppressed = false) {
  return renderToStaticMarkup(
    <StatusChangeDialog
      open
      onOpenChange={() => {}}
      bookingId="book_1"
      currentStatus={currentStatus}
      notificationsSuppressed={notificationsSuppressed}
    />,
  )
}

describe("StatusChangeDialog notification toggle", () => {
  // The service takes `suppressNotifications`, so the dialog is the one place
  // the polarity is flipped. Notifying has to stay the default: a staff member
  // who never touches the toggle must not silently strand the customer.
  it("defaults to notifying the customer", () => {
    const html = render("confirmed")

    expect(html).toContain('data-switch="notify-customer"')
    expect(html).toContain('data-checked="true"')
  })

  it("labels the toggle positively rather than as a suppression", () => {
    const html = render("cancelled")

    expect(html).toContain("Notify the customer")
    expect(html).not.toContain("Don't notify the customer")
  })

  // Turning the toggle off latches `notifications_suppressed` on the Booking
  // row, which `updateBookingSchema` types as `z.literal(true)` — nothing can
  // clear it. The helper text is the only place a staff member learns that.
  it("discloses that switching notifications off is permanent", () => {
    const html = render("cancelled")

    expect(html).toContain("permanently")
    expect(html).toContain("cannot be switched back on")
  })

  // A Booking latched silent by an earlier action ignores whatever this dialog
  // sends, so showing the toggle on would promise a send that never happens.
  it("shows the toggle off and disabled when the booking is already silenced", () => {
    const html = render("cancelled", true)

    expect(html).toContain('data-checked="false"')
    expect(html).toContain('data-disabled="true"')
    expect(html).toContain("This booking was silenced earlier")
  })
})
