import { describe, expect, it } from "vitest"
import { bookingsUiEn } from "../../src/i18n/en.js"
import {
  canAdvanceFromStep,
  defaultMinimalShape,
  stackedStepComplete,
  validationErrorsForStep,
} from "../../src/journey/components/booking-journey-rules.js"
import { emptyDraft, patchBilling, patchConfigure } from "../../src/journey/lib/draft-state.js"

const ENTITY = {
  module: "products",
  id: "prod_1",
  sourceKind: "owned",
} as const

describe("booking-journey-rules", () => {
  it("unlocks a selected departure while the room-shaped baseline quote is unavailable", () => {
    const shape: ReturnType<typeof defaultMinimalShape> = {
      ...defaultMinimalShape(),
      configureSubSteps: [{ kind: "departure", required: true }, { kind: "option-units" }],
    }
    const draft = patchConfigure(emptyDraft(ENTITY), {
      departureSlotId: "slot_1",
    })

    expect(canAdvanceFromStep("departure", draft, shape, false)).toBe(true)
    expect(stackedStepComplete("departure", draft, shape, false)).toBe(true)
    expect(canAdvanceFromStep("options", draft, shape, false)).toBe(false)
  })

  it("allows a B2C billing contact with phone but no email to unlock the next step", () => {
    const shape = defaultMinimalShape()
    const draft = patchConfigure(
      patchBilling(emptyDraft(ENTITY, { buyerType: "B2C" }), {
        contact: {
          firstName: "Test",
          lastName: "Traveler",
          email: "",
          phone: "+15550100000",
          personId: "person_1",
        },
      }),
      { departureSlotId: "slot_1" },
    )

    expect(canAdvanceFromStep("billing", draft, shape, true)).toBe(true)
  })

  it("keeps B2C billing incomplete when neither email nor phone is present", () => {
    const shape = defaultMinimalShape()
    const draft = patchBilling(emptyDraft(ENTITY, { buyerType: "B2C" }), {
      contact: {
        firstName: "Test",
        lastName: "Traveler",
        email: "",
        personId: "person_1",
      },
    })

    expect(canAdvanceFromStep("billing", draft, shape, true)).toBe(false)
  })

  it("blocks a malformed B2C billing email even when phone is present", () => {
    const shape = defaultMinimalShape()
    const draft = patchBilling(emptyDraft(ENTITY, { buyerType: "B2C" }), {
      contact: {
        firstName: "Test",
        lastName: "Traveler",
        email: "not-an-email",
        phone: "+15550100000",
      },
    })

    expect(canAdvanceFromStep("billing", draft, shape, true)).toBe(false)
    expect(validationErrorsForStep("billing", draft, bookingsUiEn)).toContain(
      "Enter a valid email address.",
    )
  })

  it("blocks malformed traveler emails", () => {
    const shape = defaultMinimalShape()
    const draft = {
      ...emptyDraft(ENTITY),
      configure: { ...emptyDraft(ENTITY).configure, pax: { adult: 1 } },
      travelers: [
        {
          rowId: "row_1",
          firstName: "Test",
          lastName: "Traveler",
          email: "not-an-email",
          band: "adult" as const,
        },
      ],
    }

    expect(canAdvanceFromStep("travelers", draft, shape, true)).toBe(false)
    expect(validationErrorsForStep("travelers", draft, bookingsUiEn)).toContain(
      "Enter a valid email address.",
    )
  })

  it("allows B2B organization-only billing", () => {
    const shape = defaultMinimalShape()
    const draft = patchConfigure(
      patchBilling(emptyDraft(ENTITY, { buyerType: "B2B" }), {
        organizationId: "org_1",
        company: { name: "Acme Travel SRL", vatId: "RO123456" },
        contact: {
          firstName: "Stale",
          lastName: "Person",
          email: "stale@example.com",
          phone: "+40700111222",
          personId: "person_stale",
        },
      }),
      { departureSlotId: "slot_1" },
    )

    expect(canAdvanceFromStep("billing", draft, shape, true)).toBe(true)
  })

  it("blocks payment advancement when an already-paid row has no payment date", () => {
    const shape = defaultMinimalShape()
    const draft = {
      ...emptyDraft(ENTITY),
      paymentSchedules: [
        {
          scheduleType: "balance",
          status: "paid",
          dueDate: "2026-06-15",
          currency: "EUR",
          amountCents: 50_000,
          notes: JSON.stringify({
            alreadyPaid: true,
            paymentDate: null,
            paymentMethod: "bank_transfer",
            paymentReference: null,
          }),
        } as const,
      ],
    }

    expect(canAdvanceFromStep("payment", draft, shape, true)).toBe(false)
  })

  it("blocks payment advancement when an already-paid row has a non-string payment date", () => {
    const shape = defaultMinimalShape()
    const draft = {
      ...emptyDraft(ENTITY),
      paymentSchedules: [
        {
          scheduleType: "balance",
          status: "paid",
          dueDate: "2026-06-15",
          currency: "EUR",
          amountCents: 50_000,
          notes: JSON.stringify({
            alreadyPaid: true,
            paymentDate: 123,
            paymentMethod: "bank_transfer",
            paymentReference: null,
          }),
        } as const,
      ],
    }

    expect(canAdvanceFromStep("payment", draft, shape, true)).toBe(false)
  })

  it("allows payment advancement when already-paid rows include payment dates", () => {
    const shape = defaultMinimalShape()
    const draft = {
      ...emptyDraft(ENTITY),
      paymentSchedules: [
        {
          scheduleType: "balance",
          status: "paid",
          dueDate: "2026-06-15",
          currency: "EUR",
          amountCents: 50_000,
          notes: JSON.stringify({
            alreadyPaid: true,
            paymentDate: "2026-06-10",
            paymentMethod: "bank_transfer",
            paymentReference: null,
          }),
        } as const,
      ],
    }

    expect(canAdvanceFromStep("payment", draft, shape, true)).toBe(true)
  })
})
