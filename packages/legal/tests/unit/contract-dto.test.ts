import { describe, expect, it } from "vitest"
import { redactManagedBookingContractForGenericDetail } from "../../src/contract-dto.js"

describe("legal contract DTO redaction", () => {
  it("removes managed booking variables and PII-bearing workflow snapshots from generic rows", () => {
    const row = {
      id: "contract_1",
      variables: {
        customer: { name: "Ana Pop", email: "ana@example.test" },
        commercial: { depositDueCents: 2500 },
      },
      metadata: {
        source: "service",
        bookingContractReviewSnapshot: { customerEmail: "legacy@example.test" },
        bookingContractWorkflow: {
          revision: 2,
          previousRevisionId: "contract_0",
          reviewOnly: true,
          reviewSnapshot: {
            booking: { customerName: "Ana Pop", customerEmail: "ana@example.test" },
          },
          delivery: { recipient: "ana@example.test" },
        },
      },
      personFirstName: null,
    }

    expect(redactManagedBookingContractForGenericDetail(row)).toEqual({
      id: "contract_1",
      variables: null,
      metadata: {
        source: "service",
        bookingContractWorkflow: {
          revision: 2,
          previousRevisionId: "contract_0",
          reviewOnly: true,
          piiRedacted: true,
        },
      },
      personFirstName: null,
    })
  })
})
