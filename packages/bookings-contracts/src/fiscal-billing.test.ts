import { describe, expect, it } from "vitest"

import {
  isCompanyFiscalBuyer,
  isFiscalBillingComplete,
  missingFiscalBillingFields,
} from "./fiscal-billing.js"

const completeIndividual = {
  contactPartyType: "individual",
  contactFirstName: "Ana",
  contactLastName: "Popescu",
  contactAddressLine1: "Strada Lipscani 12",
  contactCity: "Bucuresti",
  contactCountry: "RO",
}

describe("missingFiscalBillingFields", () => {
  it("accepts a private buyer with a name and an address", () => {
    expect(missingFiscalBillingFields(completeIndividual)).toEqual([])
    expect(isFiscalBillingComplete(completeIndividual)).toBe(true)
  })

  it("names every gap on the booking the production defect produced", () => {
    // The observed row: a person was picked, so identity survived, and the
    // whole address block came back null because the manual form never asked.
    expect(
      missingFiscalBillingFields({
        contactPartyType: "individual",
        contactFirstName: "Ana",
        contactLastName: "Popescu",
        contactAddressLine1: null,
        contactCity: null,
        contactCountry: null,
        contactTaxId: null,
      }),
    ).toEqual(["contactAddressLine1", "contactCity", "contactCountry"])
  })

  it("treats whitespace as absent", () => {
    expect(missingFiscalBillingFields({ ...completeIndividual, contactCity: "   " })).toEqual([
      "contactCity",
    ])
  })

  it("accepts either half of the name", () => {
    expect(
      missingFiscalBillingFields({
        ...completeIndividual,
        contactFirstName: "",
        contactLastName: "Popescu",
      }),
    ).toEqual([])
    expect(
      missingFiscalBillingFields({
        ...completeIndividual,
        contactFirstName: "",
        contactLastName: "",
      }),
    ).toEqual(["contactName"])
  })

  it("requires a fiscal code of a company and not of an individual", () => {
    const company = {
      ...completeIndividual,
      contactPartyType: "company",
      contactFirstName: "Acme SRL",
    }
    expect(missingFiscalBillingFields(company)).toEqual(["contactTaxId"])
    expect(missingFiscalBillingFields({ ...company, contactTaxId: "RO12345678" })).toEqual([])
    // An individual is never asked for one, so the same booking without a tax
    // id is complete when it is billed to a person.
    expect(missingFiscalBillingFields({ ...completeIndividual, contactTaxId: null })).toEqual([])
  })

  it("treats a booking billed to an organization as a company, party type or not", () => {
    // `contactPartyType` is an independently optional column and only the
    // manual form always sets it; `create_booking`, `book_product` and the
    // storefront may set `organizationId` alone. Reading the party type by
    // itself judged those an individual, never asked for a fiscal code, and
    // issued a B2B invoice carrying none.
    const orgBooking = {
      ...completeIndividual,
      contactPartyType: null,
      organizationId: "org_1",
      contactFirstName: "Acme SRL",
      contactLastName: null,
    }
    expect(missingFiscalBillingFields(orgBooking)).toEqual(["contactTaxId"])
    expect(missingFiscalBillingFields({ ...orgBooking, contactTaxId: "RO12345678" })).toEqual([])
    expect(isCompanyFiscalBuyer(orgBooking)).toBe(true)
  })

  it("does not read a blank organization id as a company", () => {
    expect(isCompanyFiscalBuyer({ ...completeIndividual, organizationId: "" })).toBe(false)
    expect(isCompanyFiscalBuyer({ ...completeIndividual, organizationId: null })).toBe(false)
    expect(isCompanyFiscalBuyer(completeIndividual)).toBe(false)
  })

  it("treats an unrecognised party type as an individual", () => {
    // The column is plain text; only "company" raises the bar, so an
    // unexpected value cannot silently start demanding a fiscal code.
    expect(
      missingFiscalBillingFields({ ...completeIndividual, contactPartyType: "agency" }),
    ).toEqual([])
    expect(missingFiscalBillingFields({ ...completeIndividual, contactPartyType: null })).toEqual(
      [],
    )
  })
})
