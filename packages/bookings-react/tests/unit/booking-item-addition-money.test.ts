import { describe, expect, it, vi } from "vitest"

import { formatMinorCurrency } from "../../src/components/booking-item-addition-dialog.js"

describe("booking item addition money", () => {
  it("converts the amendment's minor-unit amount before formatting it", () => {
    const formatCurrency = vi.fn((amount: number, currency: string) => `${currency} ${amount}`)

    expect(formatMinorCurrency(formatCurrency, 49_500, "EUR")).toBe("EUR 495")
    expect(formatCurrency).toHaveBeenCalledWith(495, "EUR")
  })
})
