import type { KmsEnvelope } from "@voyant-travel/db/schema/iam"
import { describe, expect, it } from "vitest"

import type { DecryptedInsuranceInsuredPerson } from "../../src/pii.js"
import { insuredDisplayInitial } from "../../src/pii.js"
import {
  redactInsuranceAnswers,
  redactInsuranceContractingParty,
  redactInsuredIdentity,
  shouldRevealInsurancePii,
} from "../../src/pii-redaction.js"
import type { InsuranceInsuredPersonRow } from "../../src/schema-insured-persons.js"
import { toInsuranceInsuredPersonWire } from "../../src/service-mapping.js"

const IDENTITY = {
  givenName: "Ioana",
  familyName: "Popescu",
  dateOfBirth: "1984-03-11",
  residencyCountry: "RO",
  identityDocuments: [{ type: "passport" as const, number: "X0293841", issuingCountry: "RO" }],
}

const ROW: InsuranceInsuredPersonRow = {
  id: "inip_1",
  applicationId: "insa_1",
  policyId: "inpo_1",
  ref: "t1",
  displayInitial: "P",
  bookingTravelerId: "btrv_1",
  identityEncrypted: { enc: "ciphertext" } as unknown as KmsEnvelope,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
}

const DECRYPTED: DecryptedInsuranceInsuredPerson = {
  id: ROW.id,
  applicationId: ROW.applicationId,
  policyId: ROW.policyId,
  ref: ROW.ref,
  bookingTravelerId: ROW.bookingTravelerId,
  identity: IDENTITY,
}

const PLAINTEXT_FRAGMENTS = ["Ioana", "Popescu", "1984-03-11", "X0293841"]

describe("insurance-pii scope gate", () => {
  it("reveals for the explicit scope, the wildcard on it, and superuser", () => {
    expect(shouldRevealInsurancePii({ scopes: ["insurance-pii:read"] })).toBe(true)
    expect(shouldRevealInsurancePii({ scopes: ["insurance-pii:*"] })).toBe(true)
    expect(shouldRevealInsurancePii({ scopes: ["*"] })).toBe(true)
  })

  it("does not reveal for a staff session that only holds insurance:read", () => {
    // Unlike bookings, there is no "staff always sees it" legacy to preserve —
    // insurance identity data has never been readable without the scope.
    expect(
      shouldRevealInsurancePii({ actor: "staff", scopes: ["insurance:read", "insurance:write"] }),
    ).toBe(false)
    expect(shouldRevealInsurancePii({ actor: "staff", scopes: [] })).toBe(false)
    expect(shouldRevealInsurancePii({})).toBe(false)
  })

  it("reveals for an in-process caller, which has to send the insurer a real name", () => {
    expect(shouldRevealInsurancePii({ isInternalRequest: true })).toBe(true)
  })
})

describe("insured-person projection", () => {
  it("returns no plaintext identity without the scope, even when it is in hand", () => {
    const wire = toInsuranceInsuredPersonWire({ row: ROW, decrypted: DECRYPTED }, false)

    expect(wire.identityVisibility).toBe("redacted")
    const serialized = JSON.stringify(wire)
    for (const fragment of PLAINTEXT_FRAGMENTS) {
      expect(serialized, `leaked "${fragment}"`).not.toContain(fragment)
    }
    // The soft link and the initial survive: an operator has to be able to tell
    // two insured people apart without the row carrying a name.
    expect(wire.displayInitial).toBe("P")
    expect(wire.bookingTravelerId).toBe("btrv_1")
    // The document's kind and issuing country survive; the number does not.
    expect(wire.identity?.identityDocuments?.[0]).toMatchObject({
      type: "passport",
      issuingCountry: "RO",
      number: "***41",
    })
    expect(wire.identity?.dateOfBirth).toBe("1984-**-**")
  })

  it("returns no plaintext identity when nothing was decrypted", () => {
    const wire = toInsuranceInsuredPersonWire({ row: ROW, decrypted: null }, true)

    expect(wire.identityVisibility).toBe("redacted")
    expect(wire.identity).toBeNull()
  })

  it("distinguishes 'you may not see this' from 'there is nothing here'", () => {
    const wire = toInsuranceInsuredPersonWire({ row: { ...ROW, identityEncrypted: null } }, true)

    expect(wire.identityVisibility).toBe("absent")
    expect(wire.identity).toBeNull()
  })

  it("returns the identity in the clear only with the scope AND a decryption", () => {
    const wire = toInsuranceInsuredPersonWire({ row: ROW, decrypted: DECRYPTED }, true)

    expect(wire.identityVisibility).toBe("revealed")
    expect(wire.identity).toMatchObject({ givenName: "Ioana", familyName: "Popescu" })
  })
})

describe("redaction helpers", () => {
  it("keeps the year of birth and loses the rest of it", () => {
    expect(redactInsuredIdentity(IDENTITY).dateOfBirth).toBe("1984-**-**")
    expect(redactInsuredIdentity({ dateOfBirth: "not-a-date" }).dateOfBirth).toBe("***")
  })

  it("keeps an email's domain and loses the person", () => {
    const party = redactInsuranceContractingParty({
      givenName: "Ioana",
      familyName: "Popescu",
      email: "ioana@example.com",
      phone: "+40 712 345 678",
      address: { line1: "Str. Lunga 4", city: "Cluj", postalCode: "400001", country: "RO" },
    })

    expect(party.email).toBe("i***a@example.com")
    expect(party.givenName).toBe("***")
    expect(party.address?.city).toBe("***")
    // The country survives: it is what the insurer priced on, and it identifies
    // nobody.
    expect(party.address?.country).toBe("RO")
  })

  it("drops an underwriting answer's value entirely, keeping only that it exists", () => {
    const redacted = redactInsuranceAnswers([
      { questionId: "cardiac_condition", value: true },
      { questionId: "medications", value: "warfarin" },
    ])

    expect(redacted).toEqual([
      { questionId: "cardiac_condition", value: "***" },
      { questionId: "medications", value: "***" },
    ])
    expect(JSON.stringify(redacted)).not.toContain("warfarin")
  })

  it("derives a display initial from the family name, never a fragment of it", () => {
    expect(insuredDisplayInitial(IDENTITY)).toBe("P")
    expect(insuredDisplayInitial({ ...IDENTITY, familyName: " " })).toBe("I")
  })
})
