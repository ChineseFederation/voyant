import { ReservationDispatchError } from "@voyant-travel/catalog-contracts/adapter/contract"
import type { VoyantConnectClient } from "@voyant-travel/connect-sdk"
import type { InsuranceApplicationInput } from "@voyant-travel/insurance-contracts/application"
import type { InsuranceIssueInput } from "@voyant-travel/insurance-contracts/provider"
import type { InsuranceQuoteRequest } from "@voyant-travel/insurance-contracts/quote"
import { describe, expect, it, vi } from "vitest"

import { createConnectInsuranceProviderSource } from "./insurance-source.js"

describe("Voyant Connect insurance source", () => {
  it("quotes through the generic availability route and packs a resolvable quote ref", async () => {
    const { source, calendar } = fixture()

    await expect(source.quote(request(), { currency: "EUR" })).resolves.toEqual([
      expect.objectContaining({
        quoteId: "vcq1|prod_ins|opt_1|unit_1|cq_1",
        providerId: "connect-insurer",
        providerLabel: "Connect Insurer",
        planId: "plan_silver",
        planName: "Silver",
        planTier: "Silver",
        premium: { amountMinor: 4500, currency: "EUR" },
        sumInsured: { amountMinor: 3_000_000, currency: "EUR" },
        eligibility: { status: "eligible", reasons: [] },
        validUntil: "2099-01-01T00:00:00.000Z",
        providerReference: "cq_1",
      }),
    ])
    expect(calendar).toHaveBeenCalledWith("conn_ins", {
      productId: "prod_ins",
      connectRoute: "insurance",
      localDateStart: "2026-09-10",
      localDateEnd: "2026-09-20",
      insurance: {
        tripStartDate: "2026-09-10",
        tripEndDate: "2026-09-20",
        destinationScope: { kind: "worldwide" },
        travelPurpose: "leisure",
        currency: "EUR",
        travelers: [
          { ref: "t1", age: 34 },
          { ref: "t2", age: 7, residencyCountry: "RO" },
        ],
        tripCost: { amountMinor: 250_000, currency: "EUR" },
      },
    })
  })

  it("sends ages and dates upstream and nothing that identifies a traveller", async () => {
    const { source, calendar } = fixture()
    const personal = {
      ...request(),
      travelers: [
        {
          ref: "t1",
          age: 34,
          givenName: "Ana",
          familyName: "Popescu",
          dateOfBirth: "1992-04-01",
          email: "ana@example.test",
          passportNumber: "X1234567",
        },
      ],
      contractingParty: { email: "ana@example.test", phone: "+40700000000" },
    } as unknown as InsuranceQuoteRequest

    await source.quote(personal, {})

    const sent = JSON.stringify(calendar.mock.calls[0]?.[1])
    for (const identifying of [
      "Ana",
      "Popescu",
      "1992-04-01",
      "ana@example.test",
      "X1234567",
      "+40700000000",
    ]) {
      expect(sent).not.toContain(identifying)
    }
    expect(calendar.mock.calls[0]?.[1]?.insurance).toMatchObject({
      travelers: [{ ref: "t1", age: 34 }],
    })
  })

  it("turns an upstream refusal into an ineligible quote rather than a throw", async () => {
    const { source, calendar } = fixture()
    calendar.mockResolvedValue([refusedQuoteRow()])

    const [quote, ...rest] = await source.quote(request(), {})

    expect(rest).toHaveLength(0)
    expect(quote?.planName).toBe("Gold")
    expect(quote?.eligibility.status).toBe("ineligible")
    expect(quote?.eligibility.reasons).toEqual([
      {
        code: "traveler_age_above_maximum",
        message: "Cover is not available above age 70.",
        subject: { kind: "traveler", ref: "t2" },
        providerReasonCode: "traveler_age_above_maximum",
      },
      {
        code: "provider_declined",
        message: "The underwriter would not price this trip.",
        subject: { kind: "policy" },
        providerReasonCode: "UW_REFERRAL_ONLY",
      },
    ])
  })

  it("throws when the quote call itself fails", async () => {
    const { source, calendar } = fixture()
    calendar.mockRejectedValue(new Error("connect is unreachable"))

    await expect(source.quote(request(), {})).rejects.toThrow(
      /insurance_quote_unavailable: connect is unreachable/,
    )
  })

  it("stops quoting when the caller's signal aborts", async () => {
    const { source, calendar } = fixture()
    calendar.mockImplementation(() => new Promise(() => {}))
    const controller = new AbortController()

    const pending = source.quote(request(), { signal: controller.signal })
    controller.abort()

    await expect(pending).rejects.toThrow(/aborted/i)
  })

  it("re-resolves the packed quote ref when opening an application", async () => {
    const { source, create } = fixture()

    await expect(
      source.apply(applicationInput(), { idempotencyKey: "bses_1:apply", locale: "ro-RO" }),
    ).resolves.toMatchObject({
      applicationId: "app_1",
      providerId: "connect-insurer",
      quoteId: "vcq1|prod_ins|opt_1|unit_1|cq_1",
      status: "accepted",
      premium: { amountMinor: 4500, currency: "EUR" },
    })
    expect(create).toHaveBeenCalledWith(
      "conn_ins",
      expect.objectContaining({
        productId: "prod_ins",
        optionId: "opt_1",
        connectRoute: "insurance",
        unitItems: [{ unitId: "unit_1", quantity: 1 }],
      }),
      { idempotencyKey: "bses_1:apply" },
    )
  })

  it("passes the caller's idempotency key through the issue call", async () => {
    const { source, confirm } = fixture()

    await expect(
      source.issue(issueInput(), { idempotencyKey: "bses_1:commit_1:issue" }),
    ).resolves.toMatchObject({
      policyId: "pol_1",
      applicationId: "app_1",
      issueState: "issued",
      policyNumber: "POL-1",
      premium: { amountMinor: 4500, currency: "EUR" },
    })
    expect(confirm).toHaveBeenCalledWith(
      "conn_ins",
      "app_1",
      expect.objectContaining({
        connectRoute: "insurance",
        idempotencyKey: "bses_1:commit_1:issue",
        expectedPremium: { amountMinor: 4500, currency: "EUR" },
      }),
    )
  })

  it("refuses to issue without a replay-safe key, and says nothing was sent", async () => {
    const { source, confirm } = fixture()

    const error = await source.issue(issueInput(), {}).catch((value: unknown) => value)

    expect(error).toBeInstanceOf(ReservationDispatchError)
    expect(error).toMatchObject({
      certainty: "not_sent",
      errorClass: "insurance_issue_idempotency_key_required",
    })
    expect(confirm).not.toHaveBeenCalled()
  })

  it("treats an issue of unknown outcome as possibly sent and unwinds nothing", async () => {
    const { source, cancel } = fixture({ confirmError: new Error("gateway timeout") })

    const error = await source
      .issue(issueInput(), { idempotencyKey: "bses_1:commit_1:issue" })
      .catch((value: unknown) => value)

    expect(error).toBeInstanceOf(ReservationDispatchError)
    expect(error).toMatchObject({
      certainty: "possibly_sent",
      errorClass: "insurance_issue_in_doubt",
    })
    expect(cancel).not.toHaveBeenCalled()
  })

  it("treats an issue aborted mid-flight as possibly sent", async () => {
    const { source, confirm } = fixture()
    confirm.mockImplementation(() => new Promise(() => {}))
    const controller = new AbortController()

    const pending = source.issue(issueInput(), {
      idempotencyKey: "bses_1:commit_1:issue",
      signal: controller.signal,
    })
    controller.abort()

    await expect(pending).rejects.toMatchObject({ certainty: "possibly_sent" })
  })

  it("returns the requested document kind in the requested language", async () => {
    const { source } = fixture()

    await expect(
      source.document({ policyId: "pol_1", kind: "policy_certificate", locale: "ro-RO" }, {}),
    ).resolves.toMatchObject({ documentId: "doc_ro", language: "ro-RO" })
    await expect(
      source.document({ policyId: "pol_1", kind: "policy_certificate" }, {}),
    ).resolves.toMatchObject({ documentId: "doc_en" })
  })

  it("cancels a policy and reads back what the insurer refunded", async () => {
    const { source, cancel } = fixture()

    await expect(
      source.cancel({ policyId: "pol_1", reason: "traveller withdrew" }, {}),
    ).resolves.toEqual({
      cancelledAt: "2026-08-16T12:00:00.000Z",
      reason: "traveller withdrew",
      refund: { amountMinor: 4500, currency: "EUR" },
      providerReference: "cx_cancel_1",
    })
    expect(cancel).toHaveBeenCalledWith("conn_ins", "pol_1", { reason: "traveller withdrew" })
  })
})

function fixture(options: { confirmError?: Error } = {}) {
  const calendar = vi.fn().mockResolvedValue([quoteRow()])
  const create = vi.fn().mockResolvedValue(applicationRow())
  const confirm = options.confirmError
    ? vi.fn().mockRejectedValue(options.confirmError)
    : vi.fn().mockResolvedValue(policyRow())
  const get = vi.fn().mockResolvedValue(policyRow())
  const cancel = vi.fn().mockResolvedValue({
    insurance: {
      cancellation: {
        cancelledAt: "2026-08-16T12:00:00.000Z",
        reason: "traveller withdrew",
        refund: { amountMinor: 4500, currency: "EUR" },
        providerReference: "cx_cancel_1",
      },
    },
  })
  const client = {
    availability: { calendar },
    bookings: { create, confirm, get, cancel },
  } as unknown as VoyantConnectClient

  return {
    calendar,
    create,
    confirm,
    get,
    cancel,
    client,
    source: createConnectInsuranceProviderSource({
      client,
      connectionId: "conn_ins",
      productId: "prod_ins",
      providerId: "connect-insurer",
      displayName: "Connect Insurer",
    }),
  }
}

function request(): InsuranceQuoteRequest {
  return {
    tripStartDate: "2026-09-10",
    tripEndDate: "2026-09-20",
    destinationScope: { kind: "worldwide" },
    travelPurpose: "leisure",
    travelers: [
      { ref: "t1", age: 34 },
      { ref: "t2", age: 7, residencyCountry: "RO" },
    ],
    tripCost: { amountMinor: 250_000, currency: "EUR" },
    currency: "EUR",
  }
}

function quoteRow() {
  return {
    planId: "plan_silver",
    planName: "Silver",
    planTier: "Silver",
    premium: { amountMinor: 4500, currency: "EUR" },
    sumInsured: { amountMinor: 3_000_000, currency: "EUR" },
    includedCovers: [
      {
        category: "medical_expenses",
        label: "Medical expenses",
        included: true,
        sumInsured: { amountMinor: 3_000_000, currency: "EUR" },
        limitBasis: "per_person",
      },
    ],
    validUntil: "2099-01-01T00:00:00.000Z",
    productId: "prod_ins",
    optionId: "opt_1",
    unitId: "unit_1",
    quoteId: "cq_1",
  }
}

function refusedQuoteRow() {
  return {
    planId: "plan_gold",
    planName: "Gold",
    premium: { amountMinor: 9900, currency: "EUR" },
    validUntil: "2099-01-01T00:00:00.000Z",
    unitId: "unit_2",
    quoteId: "cq_2",
    eligibility: {
      status: "declined",
      reasons: [
        {
          code: "traveler_age_above_maximum",
          message: "Cover is not available above age 70.",
          subject: { kind: "traveler", ref: "t2" },
        },
        {
          code: "UW_REFERRAL_ONLY",
          message: "The underwriter would not price this trip.",
        },
      ],
    },
  }
}

function applicationInput(): InsuranceApplicationInput {
  return {
    quoteId: "vcq1|prod_ins|opt_1|unit_1|cq_1",
    providerId: "connect-insurer",
    selectedOptionalCoverIds: [],
    insuredPersons: [
      {
        ref: "t1",
        givenName: "Ana",
        familyName: "Popescu",
        dateOfBirth: "1992-04-01",
        identityDocuments: [],
      },
    ],
    contractingParty: {
      givenName: "Ana",
      familyName: "Popescu",
      email: "ana@example.test",
    },
    answers: [],
    acceptedDisclosures: [],
  }
}

function applicationRow() {
  return {
    insurance: {
      applicationId: "app_1",
      status: "accepted",
      expiresAt: "2026-08-17T00:00:00.000Z",
      premium: { amountMinor: 4500, currency: "EUR" },
      createdAt: "2026-08-16T10:00:00.000Z",
      eligibility: { status: "eligible" },
    },
  }
}

function issueInput(): InsuranceIssueInput {
  return { applicationId: "app_1", expectedPremium: { amountMinor: 4500, currency: "EUR" } }
}

function policyRow() {
  return {
    insurance: {
      policy: {
        policyId: "pol_1",
        policyNumber: "POL-1",
        issueState: "issued",
        issuedAt: "2026-08-16T10:05:00.000Z",
        effectiveFrom: "2026-09-10",
        effectiveTo: "2026-09-20",
        premium: { amountMinor: 4500, currency: "EUR" },
        covers: [{ category: "medical_expenses", label: "Medical expenses", included: true }],
        insuredPersons: [
          { ref: "t1", givenName: "Ana", familyName: "Popescu", dateOfBirth: "1992-04-01" },
        ],
        contractingParty: {
          givenName: "Ana",
          familyName: "Popescu",
          email: "ana@example.test",
        },
        documents: [
          {
            documentId: "doc_en",
            kind: "policy_certificate",
            filename: "certificate-en.pdf",
            mimeType: "application/pdf",
            language: "en-GB",
            source: { kind: "url", url: "https://insurer.example.test/cert-en.pdf" },
          },
          {
            documentId: "doc_ro",
            kind: "policy_certificate",
            filename: "certificate-ro.pdf",
            mimeType: "application/pdf",
            language: "ro-RO",
            source: { kind: "url", url: "https://insurer.example.test/cert-ro.pdf" },
          },
        ],
      },
    },
  }
}
