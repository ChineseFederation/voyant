import { describe, expect, it } from "vitest"

import {
  cornerRadiusToPx,
  normalizeBrandColor,
  readableTextOn,
  type StaffAlertBrand,
} from "../../src/emails/brand.js"
import { formatDateRange, formatMoney } from "../../src/emails/format.js"
import { renderStaffAlertEmail } from "../../src/emails/render.js"
import type { StaffAlertContextMap } from "../../src/staff-alert-registry.js"

const brand: StaffAlertBrand = {
  operatorName: "Eturia",
  brandColor: "#f26522",
  cornerRadius: "0.625rem",
  logoUrl: null,
  supportEmail: "support@eturia.ro",
  adminBaseUrl: "https://admin.eturia.ro",
  locale: "en",
}

const base = { adminPath: "/bookings/bk_1", assigneeUserId: null, actorUserId: null }

const bookingConfirmed: StaffAlertContextMap["staff.booking.confirmed"] = {
  ...base,
  bookingId: "bk_1",
  bookingNumber: "VOY-1042",
  customer: { name: "Ana Popescu", email: "ana@example.com" },
  total: { amountCents: 249900, currency: "EUR" },
  travelStartDate: "2027-03-12",
  travelEndDate: "2027-03-19",
  travelerCount: 2,
}

describe("staff alert brand helpers", () => {
  it("converts the stored rem radius to px, because email clients ignore rem", () => {
    expect(cornerRadiusToPx("0.625rem")).toBe("10px")
    expect(cornerRadiusToPx("0rem")).toBe("0px")
    expect(cornerRadiusToPx("1rem")).toBe("16px")
  })

  it("falls back when a stored brand colour is malformed", () => {
    expect(normalizeBrandColor("#abc")).toBe("#abc")
    expect(normalizeBrandColor("#f26522")).toBe("#f26522")
    expect(normalizeBrandColor("orange")).toBe("#f26522")
    expect(normalizeBrandColor(null)).toBe("#f26522")
  })

  it("picks button text that stays readable on a pale brand colour", () => {
    expect(readableTextOn("#f26522")).toBe("#ffffff")
    expect(readableTextOn("#111111")).toBe("#ffffff")
    expect(readableTextOn("#ffee00")).toBe("#1a1a1a")
    expect(readableTextOn("#ffffff")).toBe("#1a1a1a")
  })
})

describe("staff alert formatters", () => {
  it("renders minor units as major currency", () => {
    expect(formatMoney({ amountCents: 249900, currency: "EUR" }, "en")).toContain("2,499")
  })

  it("survives an unknown currency code rather than throwing mid-send", () => {
    expect(formatMoney({ amountCents: 1000, currency: "XYZ123" }, "en")).toBe("10.00 XYZ123")
  })

  it("collapses a single-day range to one date", () => {
    const range = formatDateRange("2027-03-12", "2027-03-12", "en")
    expect(range).not.toContain("–")
  })
})

describe("renderStaffAlertEmail", () => {
  it("renders a localized Inquiry alert with its semantic detail link", async () => {
    const context: StaffAlertContextMap["staff.inquiry.first-response-overdue"] = {
      adminPath: "/inquiries/inq_1",
      assigneeUserId: "usr_1",
      actorUserId: null,
      inquiryId: "inq_1",
      alertKind: "first_response_overdue",
      subject: "Private tour",
      contact: { name: "Ana", email: "ana@example.com" },
      source: "storefront",
      status: "triaged",
      firstResponseDueAt: "2026-08-18T10:00:00.000Z",
    }

    const email = await renderStaffAlertEmail({
      eventKey: "staff.inquiry.first-response-overdue",
      context,
      brand: { ...brand, locale: "ro" },
      isAssignee: true,
    })

    expect(email.subject).toContain("Răspuns întârziat")
    expect(email.html).toContain("https://admin.eturia.ro/inquiries/inq_1")
    expect(email.html).toContain("Această solicitare îți este alocată")
  })

  it("renders a booking inquiry with the shopper question and selection", async () => {
    const email = await renderStaffAlertEmail({
      eventKey: "staff.booking.inquiry-created",
      context: {
        ...base,
        adminPath: "/bookings/inquiries/bkin_1",
        inquiryId: "bkin_1",
        contact: { name: "Ana Popescu", email: "ana@example.com" },
        contactPhone: "+40700000000",
        productId: "prod_1",
        departureId: "departure_1",
        locale: "ro",
        message: "Mai sunt locuri?",
      },
      brand,
    })

    expect(email.subject).toContain("Ana Popescu")
    expect(email.html).toContain("Mai sunt locuri?")
    expect(email.html).toContain("departure_1")
    expect(email.html).toContain("/bookings/inquiries/bkin_1")
  })

  it("renders a booking confirmation carrying the facts staff triage on", async () => {
    const email = await renderStaffAlertEmail({
      eventKey: "staff.booking.confirmed",
      context: bookingConfirmed,
      brand,
    })

    expect(email.subject).toBe("Booking VOY-1042 confirmed")
    expect(email.html).toContain("VOY-1042")
    expect(email.html).toContain("Ana Popescu")
    expect(email.html).toContain("Eturia")
    expect(email.html).toContain("https://admin.eturia.ro/bookings/bk_1")
  })

  it("emits a plain-text alternative so the mail is not HTML-only", async () => {
    const email = await renderStaffAlertEmail({
      eventKey: "staff.booking.confirmed",
      context: bookingConfirmed,
      brand,
    })

    expect(email.text.length).toBeGreaterThan(0)
    expect(email.text).not.toContain("<div")
    expect(email.text).toContain("VOY-1042")
  })

  it("renders Romanian copy when the recipient locale is ro", async () => {
    const email = await renderStaffAlertEmail({
      eventKey: "staff.booking.confirmed",
      context: bookingConfirmed,
      brand: { ...brand, locale: "ro" },
    })

    expect(email.subject).toContain("a fost confirmată")
    expect(email.html).toContain("Deschide în Voyant")
  })

  it("matches a regional tag onto its base locale", async () => {
    const email = await renderStaffAlertEmail({
      eventKey: "staff.booking.confirmed",
      context: bookingConfirmed,
      brand: { ...brand, locale: "ro-RO" },
    })

    expect(email.subject).toContain("a fost confirmată")
  })

  it("renders without a logo, since Gmail blocks remote images by default", async () => {
    const email = await renderStaffAlertEmail({
      eventKey: "staff.booking.confirmed",
      context: bookingConfirmed,
      brand: { ...brand, logoUrl: null },
    })

    expect(email.html).not.toContain("<img")
    // The operator name must still identify the sender.
    expect(email.html).toContain("Eturia")
  })

  it("says nothing about the balance when paid-in-full is unknown", async () => {
    const context: StaffAlertContextMap["staff.payment.completed"] = {
      ...base,
      adminPath: "/finance/payments/ps_1",
      paymentSessionId: "ps_1",
      bookingId: "bk_1",
      bookingNumber: "VOY-1042",
      customer: { name: "Ana Popescu", email: "ana@example.com" },
      amount: { amountCents: 50000, currency: "EUR" },
      provider: "netopia",
      paidInFull: null,
    }

    const email = await renderStaffAlertEmail({
      eventKey: "staff.payment.completed",
      context,
      brand,
    })

    expect(email.html).not.toContain("paid in full")
    expect(email.html).not.toContain("balance remains")
  })

  it("tells the assignee an enquiry is theirs, and does not otherwise", async () => {
    const context: StaffAlertContextMap["staff.customer-signal.created"] = {
      ...base,
      adminPath: "/crm/signals/csig_1",
      assigneeUserId: "user_1",
      signalId: "csig_1",
      person: { name: "Ana Popescu", email: "ana@example.com" },
      kind: "inquiry",
      source: "form",
      priority: "high",
      productTitle: "Kilimanjaro Trek",
      notes: "Wants a March departure",
    }

    const toAssignee = await renderStaffAlertEmail({
      eventKey: "staff.customer-signal.created",
      context,
      brand,
      isAssignee: true,
    })
    const toEveryoneElse = await renderStaffAlertEmail({
      eventKey: "staff.customer-signal.created",
      context,
      brand,
      isAssignee: false,
    })

    expect(toAssignee.html).toContain("assigned to you")
    expect(toEveryoneElse.html).not.toContain("assigned to you")
    expect(toEveryoneElse.html).toContain("Kilimanjaro Trek")
  })
})
