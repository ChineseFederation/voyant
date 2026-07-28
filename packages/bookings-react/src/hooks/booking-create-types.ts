export interface BookingCreatePaymentScheduleInput {
  scheduleType?: "deposit" | "installment" | "balance" | "hold" | "other"
  status?: "pending" | "due" | "paid" | "waived" | "cancelled" | "expired"
  dueDate: string
  currency: string
  amountCents: number
  notes?: string | null
}

export interface BookingCreateItemLineInput {
  clientLineKey?: string | null
  optionId?: string | null
  optionUnitId: string
  pricingCategoryId?: string | null
  quantity: number
  title?: string | null
  description?: string | null
  unitSellAmountCents?: number | null
  totalSellAmountCents?: number | null
  travelerKeys?: string[] | null
}

export interface BookingCreateExtraLineInput {
  clientLineKey?: string | null
  productExtraId: string
  optionExtraConfigId?: string | null
  name: string
  description?: string | null
  pricingMode?: string | null
  pricedPerPerson?: boolean | null
  quantity: number
  sellCurrency: string
  unitSellAmountCents?: number | null
  totalSellAmountCents?: number | null
  travelerKeys?: string[] | null
}

export interface BookingCreateTravelCreditRedemptionInput {
  travelCreditId: string
  amountCents: number
}

export type BookingCreateGroupMembershipInput =
  | {
      action: "create"
      kind: "shared_room"
      label: string
      optionUnitId?: string | null
      makeBookingPrimary?: boolean
    }
  | {
      action: "join"
      groupId: string
      role?: string | null
    }
