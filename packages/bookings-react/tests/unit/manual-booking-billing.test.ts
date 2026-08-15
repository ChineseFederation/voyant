import { describe, expect, it } from "vitest"

import {
  buildManualBookingContactInput,
  buildManualBookingQuoteDraft,
  emptyManualBookingAddress,
  manualBookingWillIssueInvoice,
  validateManualBookingDraft,
} from "../../src/components/manual-booking-create-form.js"
import { bookingsUiEn } from "../../src/i18n/en.js"

/**
 * voyant#4654. The manual form collected no billing address at all, so an
 * operator-created booking landed with `contact_address_line1`, `contact_city`,
 * `contact_region`, `contact_postal_code` and `contact_country` all null, and
 * the invoice issued from it rendered `Adresa: -, -` / `Judet: -` to a real
 * customer. The command schema had accepted these fields all along.
 */
const address = {
  line1: "Strada Lipscani 12",
  line2: "Ap. 4",
  city: "Bucuresti",
  region: "Bucuresti",
  postalCode: "030167",
  country: "RO",
}

const contact = {
  firstName: "Ana",
  lastName: "Popescu",
  email: "ana@example.com",
  phone: "+40711223344",
  preferredLanguage: "ro",
  taxId: "RO12345678",
}

describe("buildManualBookingContactInput", () => {
  it("carries the whole address through to the command's contact columns", () => {
    expect(buildManualBookingContactInput({ billTo: "person", contact, address })).toMatchObject({
      contactAddressLine1: "Strada Lipscani 12",
      contactAddressLine2: "Ap. 4",
      contactCity: "Bucuresti",
      contactRegion: "Bucuresti",
      contactPostalCode: "030167",
      contactCountry: "RO",
    })
  })

  it("nulls blank lines rather than recording an address that says nothing", () => {
    expect(
      buildManualBookingContactInput({
        billTo: "person",
        contact,
        address: { ...address, line2: "   ", region: "" },
      }),
    ).toMatchObject({ contactAddressLine2: null, contactRegion: null })
  })

  it("omits the whole address when the caller supplies none", () => {
    expect(buildManualBookingContactInput({ billTo: "person", contact })).toMatchObject({
      contactAddressLine1: null,
      contactCity: null,
      contactCountry: null,
    })
  })

  it("keeps the fiscal code for a company and drops it for an individual", () => {
    expect(
      buildManualBookingContactInput({ billTo: "organization", contact, address }).contactTaxId,
    ).toBe("RO12345678")
    expect(
      buildManualBookingContactInput({ billTo: "person", contact, address }).contactTaxId,
    ).toBe(null)
  })
})

describe("buildManualBookingQuoteDraft billing address", () => {
  function draftFor(contactInput: ReturnType<typeof buildManualBookingContactInput>) {
    return buildManualBookingQuoteDraft({
      productId: "prod_1",
      optionId: null,
      slotId: null,
      quantities: {},
      units: [],
      travelers: { travelers: [] },
      contact: contactInput,
      promotionCode: "",
      paymentSchedule: { mode: "full", installments: [] },
    })
  }

  it("quotes the address the operator entered instead of an empty object", () => {
    // Was hard-coded `address: {}` while the storefront filled the same field,
    // so the quote described a buyer with no address and the commit wrote none.
    expect(
      draftFor(buildManualBookingContactInput({ billTo: "person", contact, address }))?.billing
        ?.address,
    ).toEqual({
      line1: "Strada Lipscani 12",
      line2: "Ap. 4",
      city: "Bucuresti",
      region: "Bucuresti",
      postal: "030167",
      country: "RO",
    })
  })

  it("sends no address keys when none were entered", () => {
    expect(
      draftFor(
        buildManualBookingContactInput({
          billTo: "person",
          contact,
          address: emptyManualBookingAddress,
        }),
      )?.billing?.address,
    ).toEqual({})
  })
})

describe("manualBookingWillIssueInvoice", () => {
  const noSchedule = { installments: [] }

  it("is false for a booking that produces no document", () => {
    expect(
      manualBookingWillIssueInvoice({
        generateProforma: false,
        generateInvoiceAndContract: false,
        paymentSchedule: noSchedule,
      }),
    ).toBe(false)
  })

  it("is true for either requested document", () => {
    expect(
      manualBookingWillIssueInvoice({
        generateProforma: true,
        generateInvoiceAndContract: false,
        paymentSchedule: noSchedule,
      }),
    ).toBe(true)
    expect(
      manualBookingWillIssueInvoice({
        generateProforma: false,
        generateInvoiceAndContract: true,
        paymentSchedule: noSchedule,
      }),
    ).toBe(true)
  })

  it("is true for an already-paid installment, which forces an invoice on its own", () => {
    // Mirrors booking create's `shouldCreateInvoice`: the payment needs an
    // invoice to attach to whether or not a document was asked for.
    expect(
      manualBookingWillIssueInvoice({
        generateProforma: false,
        generateInvoiceAndContract: false,
        paymentSchedule: {
          installments: [
            {
              id: "inst_1",
              amountCents: 1000,
              dueDate: "2027-01-10",
              alreadyPaid: true,
              paymentDate: "2026-12-01",
              paymentMethod: "bank_transfer",
              paymentReference: "",
            },
          ],
        },
      }),
    ).toBe(true)
  })
})

describe("validateManualBookingDraft billing requirements", () => {
  const base = {
    productId: "prod_1",
    slotId: "slot_1",
    hasSelectedUnits: true,
    billing: {
      billTo: "person" as const,
      mode: "existing" as const,
      personId: "person_1",
      newPerson: { firstName: "", lastName: "", email: "", phone: "" },
      organizationId: null,
    },
    contactFirstName: "Ana",
    contactLastName: "Popescu",
    contactEmail: "ana@example.com",
    contactPhone: "",
    travelers: {
      travelers: [
        {
          clientTravelerKey: "trav:1",
          personId: null,
          firstName: "Ana",
          lastName: "Popescu",
          email: "ana@example.com",
          phone: "",
          preferredLanguage: "ro",
          role: "lead" as const,
          dateOfBirth: null,
          pricingUnitId: null,
          pricingCategoryId: null,
          inventoryUnitId: null,
        },
      ],
    },
    pricing: {
      catalogAmountCents: 12_500,
      confirmedAmountCents: 12_500,
      priceOverrideReason: null,
      currency: "EUR",
    },
    paymentRows: [{ dueDate: "2027-01-10", amountCents: 12_500 }],
    messages: bookingsUiEn.manualBookingCreate,
  }

  it("does not ask for an address when no document will be issued", () => {
    expect(validateManualBookingDraft({ ...base, willIssueInvoice: false })).toBeNull()
    expect(
      validateManualBookingDraft({ ...base, willIssueInvoice: false, address: undefined }),
    ).toBeNull()
  })

  it("blocks a booking that will invoice a buyer with no address", () => {
    expect(validateManualBookingDraft({ ...base, willIssueInvoice: true })).toBe(
      bookingsUiEn.manualBookingCreate.validation.billingAddress,
    )
    expect(
      validateManualBookingDraft({
        ...base,
        willIssueInvoice: true,
        address: { ...address, city: "" },
      }),
    ).toBe(bookingsUiEn.manualBookingCreate.validation.billingAddress)
  })

  it("accepts a complete address", () => {
    expect(validateManualBookingDraft({ ...base, willIssueInvoice: true, address })).toBeNull()
  })

  it("asks a company for its fiscal code, and says which is missing", () => {
    const company = {
      ...base,
      billing: { ...base.billing, billTo: "organization" as const, organizationId: "org_1" },
      contactFirstName: "Acme SRL",
    }
    expect(
      validateManualBookingDraft({ ...company, willIssueInvoice: true, address, contactTaxId: "" }),
    ).toBe(bookingsUiEn.manualBookingCreate.validation.billingTaxId)
    expect(
      validateManualBookingDraft({
        ...company,
        willIssueInvoice: true,
        address,
        contactTaxId: "RO12345678",
      }),
    ).toBeNull()
    // A private buyer is never asked for one.
    expect(
      validateManualBookingDraft({ ...base, willIssueInvoice: true, address, contactTaxId: "" }),
    ).toBeNull()
  })
})
