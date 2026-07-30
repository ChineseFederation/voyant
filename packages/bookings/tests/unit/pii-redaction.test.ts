import { describe, expect, it } from "vitest"

import {
  redactBookingContact,
  redactEmail,
  redactPhone,
  redactString,
  redactTravelerIdentity,
  shouldRevealBookingPii,
} from "../../src/pii-redaction.js"

describe("shouldRevealBookingPii()", () => {
  it("reveals on internal requests regardless of scopes", () => {
    expect(shouldRevealBookingPii({ isInternalRequest: true })).toBe(true)
    expect(shouldRevealBookingPii({ isInternalRequest: true, scopes: [] })).toBe(true)
  })

  it("reveals when scope includes superuser '*' or 'bookings-pii:read' or 'bookings-pii:*'", () => {
    expect(shouldRevealBookingPii({ scopes: ["*"] })).toBe(true)
    expect(shouldRevealBookingPii({ scopes: ["bookings-pii:*"] })).toBe(true)
    expect(shouldRevealBookingPii({ scopes: ["bookings-pii:read"] })).toBe(true)
  })

  it("reveals for staff dashboard sessions when enforceRbac is not set", () => {
    expect(shouldRevealBookingPii({ actor: "staff", scopes: [] })).toBe(true)
    expect(shouldRevealBookingPii({ actor: "staff", scopes: ["bookings:read"] })).toBe(true)
  })

  it("gates staff PII on the scope when RBAC enforcement is on (voyant#2085)", () => {
    // Restricted staff member without the PII scope is now redacted.
    expect(
      shouldRevealBookingPii({ actor: "staff", scopes: ["bookings:read"], enforceRbac: true }),
    ).toBe(false)
    expect(shouldRevealBookingPii({ actor: "staff", scopes: [], enforceRbac: true })).toBe(false)
    // Full-access (`*`) and explicit PII scope still reveal under enforcement.
    expect(shouldRevealBookingPii({ actor: "staff", scopes: ["*"], enforceRbac: true })).toBe(true)
    expect(
      shouldRevealBookingPii({
        actor: "staff",
        scopes: ["bookings-pii:read"],
        enforceRbac: true,
      }),
    ).toBe(true)
    // Internal requests bypass even under enforcement.
    expect(
      shouldRevealBookingPii({ actor: "staff", isInternalRequest: true, enforceRbac: true }),
    ).toBe(true)
  })

  it("does NOT reveal for customer / partner / supplier actors", () => {
    expect(shouldRevealBookingPii({ actor: "customer", scopes: [] })).toBe(false)
    expect(shouldRevealBookingPii({ actor: "partner", scopes: ["bookings:read"] })).toBe(false)
  })

  it("does NOT reveal when no scopes/actor at all", () => {
    expect(shouldRevealBookingPii({})).toBe(false)
  })
})

describe("redactEmail()", () => {
  it("masks the local-part but keeps the domain", () => {
    expect(redactEmail("alice@example.com")).toBe("a***e@example.com")
  })

  it("masks short local parts entirely", () => {
    expect(redactEmail("bo@example.com")).toBe("**@example.com")
    expect(redactEmail("a@example.com")).toBe("*@example.com")
  })

  it("returns *** for malformed addresses", () => {
    expect(redactEmail("not-an-email")).toBe("***")
    expect(redactEmail("@example.com")).toBe("***")
  })

  it("preserves null and undefined", () => {
    expect(redactEmail(null)).toBeNull()
    expect(redactEmail(undefined)).toBeNull()
  })
})

describe("redactPhone()", () => {
  it("keeps the last four digits", () => {
    expect(redactPhone("+40 712 345 678")).toBe("***5678")
    expect(redactPhone("0712345678")).toBe("***5678")
  })

  it("returns *** for short values", () => {
    expect(redactPhone("123")).toBe("***")
    expect(redactPhone("1234")).toBe("***")
  })

  it("preserves null and undefined", () => {
    expect(redactPhone(null)).toBeNull()
    expect(redactPhone(undefined)).toBeNull()
  })
})

describe("redactString()", () => {
  it("masks any non-empty string with ***", () => {
    expect(redactString("Bucharest")).toBe("***")
  })

  it("preserves empty strings (so client schemas don't break)", () => {
    expect(redactString("")).toBe("")
  })

  it("preserves null and undefined", () => {
    expect(redactString(null)).toBeNull()
    expect(redactString(undefined)).toBeNull()
  })
})

describe("redactBookingContact()", () => {
  it("masks contactFirstName/Last/Email/Phone/Address/PostalCode and leaves other fields alone", () => {
    const input = {
      id: "book_1",
      bookingNumber: "BK-1",
      status: "confirmed" as const,
      contactFirstName: "Alice",
      contactLastName: "Smith",
      contactTaxId: "RO12345678",
      contactEmail: "alice@example.com",
      contactPhone: "+40712345678",
      contactAddressLine1: "Str. Lipscani 1",
      contactAddressLine2: "Ap. 4",
      contactPostalCode: "030031",
      contactCity: "Bucharest",
    }
    const output = redactBookingContact(input)
    expect(output.id).toBe("book_1")
    expect(output.bookingNumber).toBe("BK-1")
    expect(output.status).toBe("confirmed")
    expect(output.contactFirstName).toBe("***")
    expect(output.contactLastName).toBe("***")
    expect(output.contactTaxId).toBe("***")
    expect(output.contactEmail).toBe("a***e@example.com")
    expect(output.contactPhone).toBe("***5678")
    expect(output.contactAddressLine1).toBe("***")
    expect(output.contactAddressLine2).toBe("***")
    expect(output.contactPostalCode).toBe("***")
    // contactCity is NOT in the redaction set — it's coarse-grained
    expect(output.contactCity).toBe("Bucharest")
  })

  it("passes nulls through", () => {
    const input = {
      id: "book_1",
      contactFirstName: null,
      contactLastName: null,
      contactTaxId: null,
      contactEmail: null,
      contactPhone: null,
      contactAddressLine1: null,
      contactAddressLine2: null,
      contactPostalCode: null,
    }
    const output = redactBookingContact(input)
    expect(output.contactTaxId).toBeNull()
    expect(output.contactEmail).toBeNull()
    expect(output.contactPhone).toBeNull()
  })
})

describe("redactTravelerIdentity()", () => {
  it("masks identity columns + specialRequests/notes (accessibility lives in the encrypted bucket)", () => {
    const input = {
      id: "bkpt_1",
      bookingId: "book_1",
      participantType: "traveler" as const,
      firstName: "Mihai",
      lastName: "Popa",
      email: "mihai@example.com",
      phone: "+40712345678",
      specialRequests: "kosher meal",
      notes: "VIP guest",
      isPrimary: true,
    }
    const output = redactTravelerIdentity(input)
    expect(output.firstName).toBe("***")
    expect(output.lastName).toBe("***")
    expect(output.email).toBe("m***i@example.com")
    expect(output.phone).toBe("***5678")
    expect(output.specialRequests).toBe("***")
    expect(output.notes).toBe("***")
    // Untouched
    expect(output.id).toBe("bkpt_1")
    expect(output.participantType).toBe("traveler")
    expect(output.isPrimary).toBe(true)
  })

  // Regression guard for the semantic-identifier work (voyant#3929): a booking's
  // human-readable reference is non-PII and returned to bookings:read callers,
  // but a traveller's name IS PII and must stay behind bookings-pii:read. Any
  // read path (get_booking by id OR by bookingNumber) applies this redaction
  // whenever shouldRevealBookingPii() is false, so identity never leaks without
  // the scope.
  it("keeps traveller identity behind the PII scope while the booking reference stays visible", () => {
    const traveler = {
      id: "bkpt_1",
      bookingId: "book_1",
      participantType: "traveler" as const,
      firstName: "Mihai",
      lastName: "Popa",
      email: "mihai@example.com",
      phone: "+40712345678",
      isPrimary: true,
    }
    const readerWithoutPiiScope = {
      actor: "staff" as const,
      scopes: ["bookings:read"],
      enforceRbac: true,
    }
    expect(shouldRevealBookingPii(readerWithoutPiiScope)).toBe(false)
    const redacted = redactTravelerIdentity(traveler)
    expect(redacted.firstName).toBe("***")
    expect(redacted.lastName).toBe("***")
    expect(redacted.email).toBe("m***i@example.com")
    expect(redacted.phone).toBe("***5678")

    const readerWithPiiScope = {
      actor: "staff" as const,
      scopes: ["bookings-pii:read"],
      enforceRbac: true,
    }
    expect(shouldRevealBookingPii(readerWithPiiScope)).toBe(true)
  })
})
