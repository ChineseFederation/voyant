// agent-quality: file-size exception -- owner: bookings-react; the focused manual-create form keeps its validation and Tool payload reviewable together.
"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  type PricingAssignmentUnit,
  resolveBookingDraft,
  resolveBookingExtraLines,
  travelersToRows,
} from "@voyant-travel/bookings/pricing-assignment"
import { missingFiscalBillingFields } from "@voyant-travel/bookings-contracts"
import {
  type BookingRequirementsV1,
  type BookingSelectionV1,
  bookingSelectionV1,
  type PaxBandCode,
  type PromotionCodeStatusV1,
} from "@voyant-travel/catalog-contracts/booking-engine/contracts"
import type { UnsatisfiedRequirementV1 } from "@voyant-travel/catalog-contracts/booking-engine/requirements-validation"
import {
  type CatalogDetailEnrichment,
  type CatalogSlot,
  createCatalogEnrichmentFetchers,
  useCatalogSlots,
} from "@voyant-travel/catalog-react"
import {
  type BookingSessionJourneyContinuation,
  BookingSessionJourneyError,
  bookingSessionContinuationIsStale,
  commitBookingSessionJourneyV1,
  createBookingJourneyApi,
  useOfferPreview,
} from "@voyant-travel/catalog-react/booking-engine"
import {
  useOptionUnitPriceRules,
  usePricingCategories,
} from "@voyant-travel/commerce-react/pricing"
import { useAddresses } from "@voyant-travel/identity-react"
import { useProduct } from "@voyant-travel/inventory-react"
import {
  type AvailabilitySlotRecord,
  availabilityQueryKeys,
  getSlotQueryOptions,
  useSlots,
  useSlotUnitAvailability,
  useVoyantAvailabilityContext,
} from "@voyant-travel/operations-react/availability"
import { useOrganization, usePerson } from "@voyant-travel/relationships-react"
import {
  Button,
  Checkbox,
  confirmDialog,
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Input,
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@voyant-travel/ui/components"
import { AsyncCombobox } from "@voyant-travel/ui/components/async-combobox"
import { CountryCombobox } from "@voyant-travel/ui/components/country-combobox"
import { CurrencyCombobox } from "@voyant-travel/ui/components/currency-combobox"
import { PhoneInput } from "@voyant-travel/ui/components/phone-input"
import { Loader2 } from "lucide-react"
import * as React from "react"
import {
  formatMessage,
  useBookingsUiI18nOrDefault,
  type useBookingsUiMessagesOrDefault,
} from "../i18n/index.js"
import {
  type BookingCreateExtraLineInput,
  type BookingCreateGroupMembershipInput,
  type BookingCreateTravelCreditRedemptionInput,
  useBookingContractGenerationCapability,
  usePricingPreview,
} from "../index.js"
import { describeUnsatisfiedRequirements } from "../journey/lib/unsatisfied-requirements.js"
import { useVoyantBookingsContext } from "../provider.js"
import {
  findAlreadyPaidInstallmentMissingPaymentDate,
  generateBookingNumber,
  hasAnyPaidPayment,
  inferTravelerPricingCategoryId,
  isBookingInventoryUnit,
  mergePricingRoomMetadata,
  normalizeBookingUnit,
  type PricingCategoryLike,
  paymentScheduleToRows,
  pricingSnapshotRoomUnits,
  sameRoomUnits,
  stripOptionPrefix,
  stripUnitSuffix,
} from "./booking-create-form-utils.js"
import { BookingPreviewCard } from "./booking-create-preview-card.js"
import {
  type CatalogBookingExtraOption,
  ProductExtrasPickerSection,
} from "./booking-create-product-extras-picker.js"
import {
  getBookableDepartureSlots,
  getOverCapacityInventoryAssignments,
  getSelectedSharedRoomUnitId,
  getTravelerAssignableStepperUnits,
  itemLinesToRows,
} from "./booking-create-utils.js"
import {
  emptyOptionUnitsStepperValue,
  OptionUnitsStepperSection,
  type OptionUnitsStepperUnit,
  type OptionUnitsStepperValue,
} from "./option-units-stepper-section.js"
import {
  emptyPaymentScheduleValue,
  PaymentScheduleSection,
  type PaymentScheduleValue,
} from "./payment-schedule-section.js"
import {
  emptyPersonPickerValue,
  PersonPickerSection,
  type PersonPickerValue,
} from "./person-picker-section.js"
import type { PriceBreakdownValue } from "./price-breakdown-section.js"
import { ProductPickerSection, type ProductPickerValue } from "./product-picker-section.js"
import {
  emptySharedRoomValue,
  SharedRoomSection,
  type SharedRoomValue,
} from "./shared-room-section.js"
import {
  emptyTravelCreditPickerValue,
  TravelCreditPickerSection,
  type TravelCreditPickerValue,
} from "./travel-credit-picker-section.js"
import {
  emptyTravelerListValue,
  type RoomGroup,
  type RoomUnitOption,
  type TravelerListValue,
  type TravelerPricingCategoryOption,
  TravelersSection,
} from "./travelers-section.js"

export interface ManualBookingCreateFormProps {
  defaultProductId?: string
  defaultSlotId?: string
  onCreated: (bookingId: string) => void
  onCancel: () => void
}

export interface ManualBookingAttempt {
  fingerprint: string
  /**
   * Cosmetic reference for the default shared-room group label only. The durable
   * booking reference is allocated by Booking Session Commit, so this is never
   * sent as the booking number.
   */
  labelReference: string | null
  idempotencyKey: string
  continuation?: BookingSessionJourneyContinuation
}

export function formatManualBookingAmount(
  amountCents: number,
  currency: string,
  formatCurrency: (
    value: number,
    currency: string,
    options?: Omit<Intl.NumberFormatOptions, "currency" | "style">,
  ) => string,
): string {
  return formatCurrency(amountCents / 100, currency, { currencyDisplay: "code" })
}

export interface ManualBookingContactInput {
  contactPartyType: "individual" | "company"
  contactTaxId: string | null
  contactFirstName: string
  contactLastName: string | null
  contactEmail: string | null
  contactPhone: string | null
  contactPreferredLanguage: string | null
  contactAddressLine1: string | null
  contactAddressLine2: string | null
  contactCity: string | null
  contactRegion: string | null
  contactPostalCode: string | null
  contactCountry: string | null
}

/** The billing address the operator entered, as the form holds it. */
export interface ManualBookingAddressInput {
  line1: string
  line2: string
  city: string
  region: string
  postalCode: string
  country: string
}

export const emptyManualBookingAddress: ManualBookingAddressInput = {
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
}

export interface ManualBookingResolvedPricing {
  catalogAmountCents: number | null
  confirmedAmountCents: number
  priceOverrideReason: string | null
  currency: string
}

export function travelerRoleToPaxBand(role: string): PaxBandCode {
  if (role === "child") return "child"
  if (role === "infant") return "infant"
  return "adult"
}

function pricingCategoryTypeToPaxBand(categoryType: string | null | undefined): PaxBandCode | null {
  if (
    categoryType === "adult" ||
    categoryType === "child" ||
    categoryType === "infant" ||
    categoryType === "senior" ||
    categoryType === "other"
  ) {
    return categoryType
  }
  return null
}

export function manualBookingTravelerPaxBand(
  traveler: TravelerListValue["travelers"][number],
  pricingCategories: ReadonlyArray<TravelerPricingCategoryOption> = [],
): PaxBandCode {
  const selectedCategory = traveler.pricingCategoryId
    ? pricingCategories.find((category) => category.categoryId === traveler.pricingCategoryId)
    : null
  return (
    pricingCategoryTypeToPaxBand(selectedCategory?.categoryType) ??
    travelerRoleToPaxBand(traveler.role)
  )
}

export function countManualBookingPaxBands(
  travelers: TravelerListValue["travelers"],
  pricingCategories: ReadonlyArray<TravelerPricingCategoryOption> = [],
): Record<string, number> {
  return travelers.reduce<Record<string, number>>((counts, traveler) => {
    const band = manualBookingTravelerPaxBand(traveler, pricingCategories)
    counts[band] = (counts[band] ?? 0) + 1
    return counts
  }, {})
}

export function manualBookingTravelersToRows(
  travelers: TravelerListValue["travelers"],
  pricingCategories: ReadonlyArray<TravelerPricingCategoryOption> = [],
) {
  return travelersToRows({ travelers }).map((row, index) => {
    const traveler = travelers[index]
    return traveler
      ? {
          ...row,
          travelerCategory: manualBookingTravelerPaxBand(traveler, pricingCategories),
        }
      : row
  })
}

/**
 * Drops blank lines so the selection carries only what was filled in. The
 * public billing schema treats every address line as optional; sending `""`
 * would record an address that says nothing rather than no address.
 */
function pruneEmptyAddress(address: Record<string, string | null | undefined>) {
  return Object.fromEntries(
    Object.entries(address).flatMap(([key, value]) => {
      const trimmed = value?.trim()
      return trimmed ? [[key, trimmed]] : []
    }),
  )
}

export function buildManualBookingQuoteDraft(input: {
  productId: string
  sourceKind?: string
  sourceConnectionId?: string
  sourceRef?: string
  optionId: string | null
  slotId: string | null
  quantities: Record<string, number>
  units: ReadonlyArray<OptionUnitsStepperUnit>
  travelers: TravelerListValue
  pricingCategories?: ReadonlyArray<TravelerPricingCategoryOption>
  contact: ManualBookingContactInput | null
  extraLines?: ReadonlyArray<BookingCreateExtraLineInput>
  promotionCode: string
  paymentSchedule: PaymentScheduleValue
}): BookingSelectionV1 | null {
  if (!input.productId) return null
  const unitsById = new Map(input.units.map((unit) => [unit.optionUnitId, unit]))
  return bookingSelectionV1.parse({
    entity: {
      module: "products",
      id: input.productId,
      sourceKind: input.sourceKind ?? "owned",
      ...(input.sourceConnectionId ? { sourceConnectionId: input.sourceConnectionId } : {}),
      ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
    },
    configure: {
      ...(input.slotId ? { departureSlotId: input.slotId } : {}),
      pax: countManualBookingPaxBands(input.travelers.travelers, input.pricingCategories),
      ...(input.optionId ? { variantId: input.optionId } : {}),
      optionSelections: Object.entries(input.quantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([optionUnitId, quantity]) => {
          const unit = unitsById.get(optionUnitId)
          return {
            optionId: unit?.optionId ?? input.optionId ?? optionUnitId,
            optionName: unit ? stripUnitSuffix(unit.unitName) : undefined,
            optionUnitId,
            optionUnitName: unit?.unitName,
            quantity,
          }
        }),
    },
    billing: input.contact
      ? {
          buyerType: input.contact.contactPartyType === "company" ? "B2B" : "B2C",
          contact: {
            firstName: input.contact.contactFirstName,
            lastName: input.contact.contactLastName ?? "",
            email: input.contact.contactEmail ?? "",
            phone: input.contact.contactPhone ?? undefined,
          },
          company:
            input.contact.contactPartyType === "company"
              ? {
                  name: input.contact.contactFirstName,
                  vatId: input.contact.contactTaxId ?? undefined,
                }
              : undefined,
          // voyant#4654: hardcoded `{}` while the storefront's billing step
          // filled the same field, so the quote the operator saw described a
          // buyer with no address and the commit wrote none.
          address: pruneEmptyAddress({
            line1: input.contact.contactAddressLine1,
            line2: input.contact.contactAddressLine2,
            city: input.contact.contactCity,
            region: input.contact.contactRegion,
            postal: input.contact.contactPostalCode,
            country: input.contact.contactCountry,
          }),
        }
      : undefined,
    travelers: input.travelers.travelers.map((traveler, index) => ({
      rowId: traveler.clientTravelerKey ?? `traveler-${index + 1}`,
      firstName: traveler.firstName.trim() || "Traveler",
      lastName: traveler.lastName.trim() || String(index + 1),
      email: traveler.email.trim() || undefined,
      phone: traveler.phone.trim() || undefined,
      personId: traveler.personId ?? undefined,
      band: manualBookingTravelerPaxBand(traveler, input.pricingCategories),
      dateOfBirth: traveler.dateOfBirth ?? undefined,
      preferredLanguage: traveler.preferredLanguage.trim() || undefined,
      isPrimary: traveler.role === "lead",
    })),
    accommodation: {
      rooms: Object.entries(input.quantities)
        .filter(([optionUnitId, quantity]) => {
          const unit = unitsById.get(optionUnitId)
          return quantity > 0 && unit ? isBookingInventoryUnit(unit) : false
        })
        .map(([optionUnitId, quantity]) => ({ optionUnitId, quantity })),
      travelerAssignments: Object.fromEntries(
        input.travelers.travelers.flatMap((traveler) =>
          traveler.clientTravelerKey && traveler.inventoryUnitId
            ? [[traveler.clientTravelerKey, traveler.inventoryUnitId]]
            : [],
        ),
      ),
    },
    addons: (input.extraLines ?? [])
      .filter((line) => line.quantity > 0)
      .map((line) => ({
        extraId: line.productExtraId,
        quantity: line.quantity,
      })),
    payment: { intent: hasAnyPaidPayment(input.paymentSchedule) ? "bank_transfer" : "hold" },
    promotionCode: input.promotionCode.trim() || undefined,
  })
}

/**
 * Whether a typed promotion code lets the booking be created.
 *
 * Before voyant#4615 this was `hasPromotionCode` — any code at all blocked
 * submit, and a second, unreachable guard below it pretended otherwise. The
 * quote now answers for the code, so the only thing that blocks is a code the
 * quote rejected: creating the booking anyway would drop a discount the
 * operator has already promised over the phone, and clearing the field is one
 * keystroke away.
 */
export function resolveManualBookingPromotionState(input: {
  promotionCode: string
  isSettling: boolean
  hasError: boolean
  hasPricing: boolean
  status: PromotionCodeStatusV1 | null | undefined
}): { hasCode: boolean; rejected: boolean; ready: boolean } {
  const hasCode = Boolean(input.promotionCode.trim())
  const rejected = Boolean(hasCode && input.status && input.status.kind !== "code_valid")
  const ready = !hasCode || (!input.isSettling && !input.hasError && input.hasPricing && !rejected)
  return { hasCode, rejected, ready }
}

/**
 * Human copy for the quote's verdict on a promotion code.
 *
 * Every branch names what is actually wrong with the code. The generic
 * `invalid` string stays as the fallback for a status this build does not
 * know, so a server that grows a new rejection reason degrades to a vague
 * message rather than an empty one.
 */
export function promotionCodeStatusMessage(
  status: PromotionCodeStatusV1,
  copy: {
    invalid: string
    notFound: string
    expired: string
    notYetValid: string
    notApplicable: string
  },
): string {
  switch (status.kind) {
    case "code_not_found":
      return copy.notFound
    case "code_expired":
      return copy.expired
    case "code_not_yet_valid":
      return copy.notYetValid
    case "code_not_applicable":
      return copy.notApplicable
    default:
      return copy.invalid
  }
}

const BOOKING_SESSION_ENGINE_OWNED_FIELDS = new Set([
  "productId",
  "optionId",
  "slotId",
  "catalogId",
  "availabilityHoldToken",
  "bookingNumber",
  "initialStatus",
  "sellAmountCentsOverride",
  "catalogSellAmountCents",
  "confirmedSellAmountCents",
  "priceOverrideReason",
])

export function buildManualBookingSessionSelection(input: {
  quoteDraft: BookingSelectionV1
  booking: Record<string, unknown>
  catalogAmountCents: number | null
  confirmedAmountCents: number
  priceOverrideReason: string | null
}): Record<string, unknown> {
  const draftSelection = Object.fromEntries(
    Object.entries(input.quoteDraft).filter(([field]) => field !== "entity"),
  )
  const staffBooking = Object.fromEntries(
    Object.entries(input.booking).filter(
      ([field]) => !BOOKING_SESSION_ENGINE_OWNED_FIELDS.has(field),
    ),
  )
  if (input.catalogAmountCents != null && input.catalogAmountCents !== input.confirmedAmountCents) {
    if (!input.priceOverrideReason) {
      throw new Error("manual_booking_price_override_reason_required")
    }
    staffBooking.manualPriceOverride = {
      amountCents: input.confirmedAmountCents,
      reason: input.priceOverrideReason,
    }
  }
  return { ...draftSelection, staffBooking }
}

export function resolveManualBookingPricing(input: {
  pricing: PriceBreakdownValue | null
  quoteTotalAmountCents: number | null
  productAmountCents: number | null
  currency: string
}): ManualBookingResolvedPricing | null {
  const catalogAmountCents =
    input.quoteTotalAmountCents ?? input.pricing?.catalogAmountCents ?? input.productAmountCents
  const confirmedAmountCents =
    input.pricing?.isManualOverride && input.pricing.confirmedAmountCents != null
      ? input.pricing.confirmedAmountCents
      : catalogAmountCents
  if (confirmedAmountCents == null) return null
  const priceOverrideReason =
    input.pricing?.isManualOverride && confirmedAmountCents !== catalogAmountCents
      ? input.pricing.priceOverrideReason.trim()
      : null
  return {
    catalogAmountCents,
    confirmedAmountCents,
    priceOverrideReason: priceOverrideReason || null,
    currency: input.currency,
  }
}

export function toManualBookingPriceOverride(
  pricing: ManualBookingResolvedPricing,
): { amountCents: number; reason: string } | undefined {
  if (pricing.confirmedAmountCents === pricing.catalogAmountCents || !pricing.priceOverrideReason) {
    return undefined
  }
  return {
    amountCents: pricing.confirmedAmountCents,
    reason: pricing.priceOverrideReason,
  }
}

export function buildManualBookingContactInput(input: {
  billTo: "person" | "organization"
  contact: {
    firstName: string
    lastName: string
    email: string
    phone: string
    preferredLanguage: string
    taxId?: string | null
  }
  /**
   * The buyer's billing address. Optional so existing callers keep working;
   * absent means the booking carries no address, which is what every manually
   * created booking did before voyant#4654 and what made their invoices
   * fiscally invalid.
   */
  address?: ManualBookingAddressInput
}): ManualBookingContactInput {
  const address = input.address ?? emptyManualBookingAddress
  const trimmedOrNull = (value: string) => value.trim() || null
  return {
    contactPartyType: input.billTo === "organization" ? "company" : "individual",
    // A private buyer's tax id is personal data an invoice does not need, so
    // it is only carried for a company. Matches `missingFiscalBillingFields`,
    // which likewise only requires one of a company.
    contactTaxId: input.billTo === "organization" ? (input.contact.taxId ?? null) : null,
    contactFirstName: input.contact.firstName.trim(),
    contactLastName: trimmedOrNull(input.contact.lastName),
    contactEmail: trimmedOrNull(input.contact.email),
    contactPhone: trimmedOrNull(input.contact.phone),
    contactPreferredLanguage: trimmedOrNull(input.contact.preferredLanguage),
    contactAddressLine1: trimmedOrNull(address.line1),
    contactAddressLine2: trimmedOrNull(address.line2),
    contactCity: trimmedOrNull(address.city),
    contactRegion: trimmedOrNull(address.region),
    contactPostalCode: trimmedOrNull(address.postalCode),
    contactCountry: trimmedOrNull(address.country),
  }
}

/**
 * Whether this booking will produce a fiscal document, and so whether the
 * buyer's billing details have to be complete before it may be created.
 *
 * Mirrors booking create's own `shouldCreateInvoice`: either the operator
 * asked for a document, or a schedule is already marked paid and an invoice
 * has to exist for the payment to attach to.
 */
export function manualBookingWillIssueInvoice(input: {
  generateProforma: boolean
  generateInvoiceAndContract: boolean
  paymentSchedule: Pick<PaymentScheduleValue, "installments">
}) {
  return (
    input.generateProforma ||
    input.generateInvoiceAndContract ||
    input.paymentSchedule.installments.some((installment) => installment.alreadyPaid)
  )
}

export function validateManualBookingDraft(input: {
  productId: string
  slotId?: string | null
  requireDeparture?: boolean
  hasSelectedUnits?: boolean
  billing: PersonPickerValue
  contactFirstName: string
  contactLastName: string
  contactEmail: string
  contactPhone: string
  travelers: TravelerListValue
  pricing: ManualBookingResolvedPricing | null
  manualOverrideRequiresReason?: boolean
  paymentRows: Array<{ dueDate: string; amountCents: number }>
  paymentSchedule?: PaymentScheduleValue
  /**
   * The billing address, and whether this booking will produce a fiscal
   * document. Optional so the existing callers and tests that predate
   * voyant#4654 keep compiling; absent means the address is not checked.
   */
  address?: ManualBookingAddressInput
  willIssueInvoice?: boolean
  contactTaxId?: string
  messages: ReturnType<typeof useBookingsUiMessagesOrDefault>["manualBookingCreate"]
}): string | null {
  if (!input.productId) return input.messages.validation.product
  if (input.requireDeparture !== false && !input.slotId) return input.messages.validation.departure
  if (input.hasSelectedUnits === false) return input.messages.validation.units
  const billTo = input.billing.billTo ?? "person"
  if (billTo === "person" && !input.billing.personId) return input.messages.validation.person
  if (billTo === "organization" && !input.billing.organizationId) {
    return input.messages.validation.organization
  }
  if (!input.contactFirstName.trim()) return input.messages.validation.contact
  if (billTo === "person" && !input.contactLastName.trim()) {
    return input.messages.validation.contactName
  }
  if (input.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail)) {
    return input.messages.validation.email
  }
  if (billTo === "person" && !input.contactEmail.trim() && !input.contactPhone.trim()) {
    return input.messages.validation.contactMethod
  }
  // voyant#4654: an invoice needs to name its buyer and where they are, and
  // the cheapest place to establish that is here — the operator has the
  // customer in front of them. Asked only when a document will actually be
  // produced, so a booking that issues nothing is not held up for an address
  // no one will read.
  if (input.willIssueInvoice) {
    const missing = missingFiscalBillingFields({
      contactPartyType: billTo === "organization" ? "company" : "individual",
      contactFirstName: input.contactFirstName,
      contactLastName: input.contactLastName,
      contactTaxId: input.contactTaxId ?? null,
      contactAddressLine1: input.address?.line1 ?? null,
      contactCity: input.address?.city ?? null,
      contactCountry: input.address?.country ?? null,
    })
    if (missing.includes("contactTaxId")) return input.messages.validation.billingTaxId
    if (missing.length > 0) return input.messages.validation.billingAddress
  }
  if (input.travelers.travelers.length === 0) return input.messages.validation.travelers
  if (
    input.travelers.travelers.some(
      (traveler) => !traveler.firstName.trim() || !traveler.lastName.trim(),
    )
  ) {
    return input.messages.validation.travelerNames
  }
  if (input.travelers.travelers.filter((traveler) => traveler.role === "lead").length !== 1) {
    return input.messages.validation.leadTraveler
  }
  if (!input.pricing || input.pricing.confirmedAmountCents < 0)
    return input.messages.validation.amount
  if (input.manualOverrideRequiresReason) return input.messages.validation.overrideReason
  if (
    input.paymentSchedule &&
    findAlreadyPaidInstallmentMissingPaymentDate(input.paymentSchedule) !== null
  ) {
    return input.messages.validation.paidPaymentDate
  }
  if (
    input.paymentRows.length > 0 &&
    (input.paymentRows.some((row) => !row.dueDate) ||
      input.paymentRows.reduce((sum, row) => sum + row.amountCents, 0) !==
        input.pricing.confirmedAmountCents)
  ) {
    return input.messages.validation.payment
  }
  return null
}

/**
 * A validation message plus enough context to keep it honest.
 *
 * Before #4588 this was a bare string cleared only at the top of
 * `handleSubmit`. Every condition that raises a `blocksSubmit` message also
 * disables **Create booking**, so the operator could not resubmit to clear it
 * — and a disabled submit button means Enter does not fire implicit form
 * submission either. The banner outlived its cause until a page reload.
 */
export interface ManualBookingFormError {
  message: string
  /**
   * The control the message refers to, when there is one. `units` renders the
   * message against the Options section and sends focus there on failure —
   * "option" is overloaded in this form and operators read the unanchored
   * sentence as the Document generation checkboxes.
   */
  field?: "units"
  /**
   * Set when the raising condition also disables **Create booking**. Those
   * messages are cleared as soon as submit becomes possible again, because
   * nothing else can clear them.
   */
  blocksSubmit?: boolean
}

/**
 * Wraps a draft validation message with the context above. The units check is
 * the only draft validation that also disables **Create booking**, so it is
 * the only one that gets an anchor and an automatic clear.
 */
export function toManualBookingFormError(
  message: string,
  unitsMessage: string,
): ManualBookingFormError {
  const isUnitsError = message === unitsMessage
  return {
    message,
    field: isUnitsError ? "units" : undefined,
    blocksSubmit: isUnitsError || undefined,
  }
}

/**
 * Which condition is holding **Create booking** shut, in the order the submit
 * handler itself checks them.
 *
 * `settling` is transient and resolves on its own; the other six are states an
 * operator has to act on, and before voyant#4762 all seven rendered as one
 * boolean and one silent, greyed-out button.
 */
export type ManualBookingSubmitBlocker =
  | "sourced"
  | "product"
  | "timing"
  | "units"
  | "settling"
  | "pricing"
  | "promotion"

/**
 * The first condition blocking submit, or `null` when nothing is.
 *
 * This is the same seven-term disjunction the form used to write inline, split
 * so the button can name what it is waiting for. The order is the disjunction's
 * order, which is also `handleSubmit`'s, so the reason shown at the button is
 * the reason a submit would have reported.
 */
export function resolveManualBookingSubmitBlocker(input: {
  isSourcedProduct: boolean
  hasProduct: boolean
  hasBookingTiming: boolean
  hasSelectedUnits: boolean
  quoteIsSettling: boolean
  sourcedQuoteReady: boolean
  promotionReady: boolean
}): ManualBookingSubmitBlocker | null {
  if (input.isSourcedProduct) return "sourced"
  if (!input.hasProduct) return "product"
  if (!input.hasBookingTiming) return "timing"
  if (!input.hasSelectedUnits) return "units"
  if (input.quoteIsSettling) return "settling"
  if (!input.sourcedQuoteReady) return "pricing"
  if (!input.promotionReady) return "promotion"
  return null
}

/**
 * Human copy for a blocker.
 *
 * Every branch but `units` reuses the sentence the submit handler would have
 * raised for the same condition, so the button and a failed submit cannot say
 * different things. `units` gets its own wording: the validation message is
 * anchored to the Options section and reads correctly there, but at the button
 * it has to name where that section is.
 */
export function manualBookingSubmitBlockerMessage(
  blocker: ManualBookingSubmitBlocker,
  copy: ReturnType<typeof useBookingsUiMessagesOrDefault>["manualBookingCreate"],
  options: { promotionRejected: boolean },
): string {
  switch (blocker) {
    case "sourced":
      return copy.validation.sourcedBookingSessionRequired
    case "product":
      return copy.validation.product
    case "timing":
      return copy.validation.departure
    case "units":
      return copy.submitBlocked.units
    case "settling":
      return copy.validation.pricingPending
    case "pricing":
      return copy.validation.pricingUnavailable
    case "promotion":
      return options.promotionRejected ? copy.promotion.blocked : copy.promotion.unavailable
  }
}

/**
 * The sentence to render beside **Create booking**, named after the button so
 * it cannot be read as belonging to the document checkboxes above it.
 *
 * Returns `null` when nothing is blocking, and also when the reason would
 * repeat — word for word, a line or two apart — an alert the footer already
 * renders. Those alerts carry `role="alert"`; saying the same thing twice in
 * one screenful is noise, not clarity.
 */
export function manualBookingSubmitBlockedNotice(input: {
  blocker: ManualBookingSubmitBlocker | null
  copy: ReturnType<typeof useBookingsUiMessagesOrDefault>["manualBookingCreate"]
  promotionRejected: boolean
  isSourcedProduct: boolean
  formErrorMessage: string | null
}): string | null {
  if (!input.blocker) return null
  const reason = manualBookingSubmitBlockerMessage(input.blocker, input.copy, {
    promotionRejected: input.promotionRejected,
  })
  const alreadyShown = [
    input.formErrorMessage,
    input.isSourcedProduct ? input.copy.validation.sourcedBookingSessionRequired : null,
    input.promotionRejected ? input.copy.promotion.blocked : null,
  ]
  if (alreadyShown.includes(reason)) return null
  return formatMessage(input.copy.submitBlocked.label, { reason })
}

/**
 * DOM id of the reason paragraph, so **Create booking** can point
 * `aria-describedby` at it. A literal rather than `useId` because this form
 * renders exactly one action row.
 */
export const MANUAL_BOOKING_SUBMIT_BLOCKED_ID = "manual-booking-submit-blocked"

export interface ManualBookingSubmitFooterProps {
  submitting: boolean
  submitBlocked: boolean
  /**
   * Why **Create booking** is shut, already formatted for display. `null`
   * when nothing is blocking, or when the same sentence is already rendered
   * as an alert a couple of lines above this footer.
   */
  blockedReason: string | null
  cancelLabel: string
  submitLabel: string
  onCancel: () => void
}

/**
 * The manual create form's action row.
 *
 * voyant#4762: **Create booking** used to be `disabled` with no `title`, no
 * `aria-describedby` and no adjacent text, so seven independent conditions all
 * rendered as the same dead button. The one message that did exist sat with
 * the Options section near the top of the form, far enough from the button
 * that operators read it as the document checkboxes beside it instead.
 *
 * The reason is rendered here, next to the control it explains, and pointed at
 * from the button — `title` alone would be invisible on touch and to screen
 * readers.
 *
 * Kept in this module rather than its own file: `package.json` maps
 * `./components/*` onto every `src/components/*.tsx`, so a separate file would
 * publish this form-only row as a supported package entry point.
 */
export function ManualBookingSubmitFooter({
  submitting,
  submitBlocked,
  blockedReason,
  cancelLabel,
  submitLabel,
  onCancel,
}: ManualBookingSubmitFooterProps) {
  // While submitting, the button is busy rather than blocked, and saying why
  // it cannot be pressed would contradict the spinner.
  const reason = submitting ? null : blockedReason
  return (
    <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t px-1 pt-3">
      {reason ? (
        <p id={MANUAL_BOOKING_SUBMIT_BLOCKED_ID} className="mr-auto text-xs text-muted-foreground">
          {reason}
        </p>
      ) : null}
      <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
        {cancelLabel}
      </Button>
      <Button
        type="submit"
        size="sm"
        disabled={submitting || submitBlocked}
        aria-describedby={reason ? MANUAL_BOOKING_SUBMIT_BLOCKED_ID : undefined}
      >
        {submitting ? (
          <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
        ) : null}
        {submitLabel}
      </Button>
    </div>
  )
}

/**
 * Drops a message raised by a submit-gating condition once submit is possible
 * again. Messages the operator can act on and resubmit are left alone.
 */
export function clearUnblockedManualBookingError(
  previous: ManualBookingFormError | null,
  submitBlocked: boolean,
): ManualBookingFormError | null {
  if (submitBlocked) return previous
  return previous?.blocksSubmit ? null : previous
}

/**
 * The documents this booking asks the server to produce, given what the
 * deployment can actually produce.
 *
 * voyant#4634: `contractAvailable` is optimistic — the capability query answers
 * after the form has already rendered, so the contract box can be ticked before
 * the deployment says it has no customer contract template. Disabling the
 * control at that point is not enough: the tick is still standing and the
 * request would still carry `contractDocument: true`, which is the same silent
 * drop this change exists to end. The selection is therefore resolved here,
 * from the same value the checkbox renders.
 */
export function resolveManualBookingDocumentGeneration(input: {
  generateProforma: boolean
  generateInvoiceAndContract: boolean
  contractAvailable: boolean
}):
  | { contractDocument: boolean; invoiceDocument: true; invoiceType: "proforma" | "invoice" }
  | { contractDocument: false; invoiceDocument: false } {
  if (input.generateProforma) {
    return { contractDocument: false, invoiceDocument: true, invoiceType: "proforma" }
  }
  if (input.generateInvoiceAndContract && input.contractAvailable) {
    return { contractDocument: true, invoiceDocument: true, invoiceType: "invoice" }
  }
  return { contractDocument: false, invoiceDocument: false }
}

export function ManualBookingCreateForm({
  defaultProductId,
  defaultSlotId,
  onCreated,
  onCancel,
}: ManualBookingCreateFormProps) {
  const { baseUrl, fetcher } = useVoyantBookingsContext()
  const { messages, formatDate, formatCurrency } = useBookingsUiI18nOrDefault()
  const copy = messages.manualBookingCreate
  // The shared v1 Session transport. `surface: "admin"` keeps the manual form
  // on the staff routes it has always used.
  const client = React.useMemo(
    () => createBookingJourneyApi({ baseUrl, fetcher, surface: "admin" }),
    [baseUrl, fetcher],
  )
  const queryClient = useQueryClient()
  const availabilityClient = useVoyantAvailabilityContext()
  const [product, setProduct] = React.useState<ProductPickerValue>({
    productId: defaultProductId ?? "",
    optionId: null,
  })
  const [slotId, setSlotId] = React.useState<string | null>(defaultSlotId ?? null)
  const [rooms, setRooms] = React.useState<OptionUnitsStepperValue>(emptyOptionUnitsStepperValue)
  const [roomUnits, setRoomUnits] = React.useState<OptionUnitsStepperUnit[]>([])
  const [extraLines, setExtraLines] = React.useState<BookingCreateExtraLineInput[]>([])
  const [billing, setBilling] = React.useState<PersonPickerValue>(emptyPersonPickerValue)
  const [sharedRoom, setSharedRoom] = React.useState<SharedRoomValue>(emptySharedRoomValue)
  const [travelers, setTravelers] = React.useState<TravelerListValue>(emptyTravelerListValue)
  const [travelCredit, setTravelCredit] = React.useState<TravelCreditPickerValue>(
    emptyTravelCreditPickerValue,
  )
  const [pricing, setPricing] = React.useState<PriceBreakdownValue | null>(null)
  const handlePricingChange = React.useCallback((next: PriceBreakdownValue) => {
    setPricing((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next))
  }, [])
  const [promotionCode, setPromotionCode] = React.useState("")
  const [paymentSchedule, setPaymentScheduleState] =
    React.useState<PaymentScheduleValue>(emptyPaymentScheduleValue)
  const paymentScheduleTouchedRef = React.useRef(false)
  const setPaymentSchedule = React.useCallback((next: PaymentScheduleValue) => {
    paymentScheduleTouchedRef.current = true
    setPaymentScheduleState(next)
  }, [])
  const [generateProforma, setGenerateProformaState] = React.useState(false)
  const [generateInvoiceAndContract, setGenerateInvoiceAndContractState] = React.useState(false)
  const setGenerateProforma = (next: boolean) => {
    setGenerateProformaState(next)
    if (next) setGenerateInvoiceAndContractState(false)
  }
  const setGenerateInvoiceAndContract = (next: boolean) => {
    setGenerateInvoiceAndContractState(next)
    if (next) setGenerateProformaState(false)
  }
  // voyant#4634: the contract half of this option is only real where the
  // deployment can render one. It used to be offered unconditionally and drop
  // the contract in silence.
  const contractGeneration = useBookingContractGenerationCapability()
  // The capability is optimistic while it resolves, so the box can be ticked
  // before the deployment answers that it cannot honour it — and a `disabled`
  // that arrives afterwards leaves the tick standing and still submits it.
  // Derived rather than cleared in an effect so the checkbox and the request
  // read the same value and cannot disagree for a render.
  const generateInvoiceAndContractSelected =
    generateInvoiceAndContract && contractGeneration.available
  // Whether this booking will produce a fiscal document, and so whether the
  // buyer's billing details have to be complete before it can be created.
  const willIssueInvoice = manualBookingWillIssueInvoice({
    generateProforma,
    generateInvoiceAndContract: generateInvoiceAndContractSelected,
    paymentSchedule,
  })
  const [notifyTraveler, setNotifyTraveler] = React.useState(true)
  const [contact, setContact] = React.useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    preferredLanguage: "",
    taxId: "",
  })
  const [contactTouched, setContactTouched] = React.useState(false)
  const [address, setAddress] = React.useState<ManualBookingAddressInput>(emptyManualBookingAddress)
  const [addressTouched, setAddressTouched] = React.useState(false)
  const updateAddress = React.useCallback((patch: Partial<ManualBookingAddressInput>) => {
    setAddressTouched(true)
    setAddress((current) => ({ ...current, ...patch }))
  }, [])
  const [notes, setNotes] = React.useState("")
  const [error, setError] = React.useState<ManualBookingFormError | null>(null)
  /**
   * The requirements the Booking Session said this selection does not satisfy.
   *
   * This form is one page of bespoke inputs rather than the journey's step
   * components, so there is no per-control anchor to attach these to without
   * rebuilding it. They render as a list under the error banner — which is
   * still every missing requirement named, in one pass, instead of the single
   * "some required booking details are still missing" sentence this form showed
   * before.
   */
  const [unsatisfied, setUnsatisfied] = React.useState<UnsatisfiedRequirementV1[]>([])
  const errorRef = React.useRef<HTMLParagraphElement>(null)
  const unitsSectionRef = React.useRef<HTMLDivElement>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [payloadMismatchUnitIds, setPayloadMismatchUnitIds] = React.useState<string[]>([])
  const attemptRef = React.useRef<ManualBookingAttempt | null>(null)
  const submissionRef = React.useRef(false)
  const [slotsFromIso, setSlotsFromIso] = React.useState(() => new Date().toISOString())

  React.useEffect(() => {
    if (!error) return
    // Anchored messages take the operator to the control that blocked the
    // submit; everything else falls back to the banner.
    const target = error.field === "units" ? unitsSectionRef.current : errorRef.current
    target?.focus()
    target?.scrollIntoView({ block: "nearest" })
  }, [error])

  const defaultSlotQuery = useQuery({
    ...getSlotQueryOptions(availabilityClient, defaultSlotId),
    enabled: Boolean(defaultSlotId),
  })
  const defaultSlot = defaultSlotQuery.data?.data ?? null

  const productQuery = useProduct(product.productId || undefined, {
    enabled: Boolean(product.productId) && (!product.sourceKind || product.sourceKind === "owned"),
  })
  const productRecord = productQuery.data
  const enrichmentFetchers = React.useMemo(
    () =>
      createCatalogEnrichmentFetchers({
        baseUrl,
        fetch: fetcher as typeof globalThis.fetch,
        contentBasePathByVertical: { products: "/v1/admin/products" },
      }),
    [baseUrl, fetcher],
  )
  const productContentQuery = useQuery({
    queryKey: ["manual-booking-product-content", product.productId],
    queryFn: () =>
      enrichmentFetchers.loadProductDetail(
        { id: product.productId, score: 0, document: { id: product.productId, fields: {} } },
        "products",
      ),
    enabled: Boolean(product.productId),
    staleTime: 30_000,
  })
  const productContent = productContentQuery.data ?? null
  const resolvedSourceKind =
    productContent?.sourceKind ?? product.sourceKind ?? (productRecord ? "owned" : "")
  const resolvedSourceConnectionId =
    productContent?.sourceConnectionId ?? product.sourceConnectionId
  const resolvedSourceRef = productContent?.sourceRef ?? product.sourceRef
  const isSourcedProduct = Boolean(resolvedSourceKind && resolvedSourceKind !== "owned")
  const productDisplayName =
    productContent?.name ?? productRecord?.name ?? product.productName ?? product.productId

  React.useEffect(() => {
    if (!product.productId || !productContent) return
    setProduct((current) => {
      if (current.productId !== product.productId) return current
      const next = {
        ...current,
        ...(productContent.name ? { productName: productContent.name } : {}),
        ...(productContent.supplier ? { supplierName: productContent.supplier } : {}),
        ...(productContent.sourceKind ? { sourceKind: productContent.sourceKind } : {}),
        ...(productContent.sourceConnectionId
          ? { sourceConnectionId: productContent.sourceConnectionId }
          : {}),
        ...(productContent.sourceRef ? { sourceRef: productContent.sourceRef } : {}),
      }
      return JSON.stringify(next) === JSON.stringify(current) ? current : next
    })
  }, [product.productId, productContent])
  const billingPersonQuery = usePerson(
    (billing.billTo ?? "person") === "person" ? billing.personId || undefined : undefined,
    { enabled: (billing.billTo ?? "person") === "person" && Boolean(billing.personId) },
  )
  const billingPerson = billingPersonQuery.data
  const billingOrganization = useOrganization(
    billing.billTo === "organization" ? (billing.organizationId ?? undefined) : undefined,
    { enabled: billing.billTo === "organization" && Boolean(billing.organizationId) },
  ).data

  // The billing party's own address, so the operator confirms it rather than
  // retyping it. A CRM person has no address columns — addresses are Identity
  // records keyed by entity — which is why picking a person never populated
  // the booking's `contact_*` columns and every manual booking's invoice came
  // out without one (voyant#4654).
  const billTo = billing.billTo ?? "person"
  const billingParty =
    billTo === "organization" ? (billing.organizationId ?? null) : (billing.personId ?? null)
  const billingAddressEntity = {
    entityType: billTo === "organization" ? ("organization" as const) : ("person" as const),
    entityId: billingParty,
  }
  const billingAddressQuery = useAddresses({
    entityType: billingAddressEntity.entityType,
    entityId: billingAddressEntity.entityId ?? undefined,
    isPrimary: true,
    limit: 1,
    enabled: Boolean(billingAddressEntity.entityId),
  })
  const billingAddress = billingAddressQuery.data?.data?.[0] ?? null
  const billingAddressLoading = Boolean(billingParty) && billingAddressQuery.isLoading

  React.useEffect(() => {
    // Same contract as the contact prefill below: fill until the operator
    // edits, then never overwrite what they typed.
    if (addressTouched) return
    if (!billingAddressEntity.entityId) return
    setAddress({
      line1: billingAddress?.line1 ?? "",
      line2: billingAddress?.line2 ?? "",
      city: billingAddress?.city ?? "",
      region: billingAddress?.region ?? "",
      postalCode: billingAddress?.postalCode ?? "",
      country: billingAddress?.country ?? "",
    })
  }, [addressTouched, billingAddress, billingAddressEntity.entityId])

  React.useEffect(() => {
    if (product.productId) setSlotsFromIso(new Date().toISOString())
  }, [product.productId])

  const ownedSlotsQuery = useSlots({
    productId: product.productId || undefined,
    status: "open",
    startsAtFrom: slotsFromIso,
    limit: 100,
    enabled: Boolean(product.productId) && !isSourcedProduct,
  })
  const sourcedSlotsQuery = useCatalogSlots({
    entityModule: "products",
    entityId: product.productId,
    surface: "admin",
    enabled: Boolean(product.productId) && isSourcedProduct,
  })
  const catalogSlots = React.useMemo(
    () =>
      (sourcedSlotsQuery.data?.rows ?? []).flatMap((slot) => {
        const normalized = normalizeCatalogBookingSlot(slot, product.productId)
        return normalized ? [normalized] : []
      }),
    [sourcedSlotsQuery.data?.rows, product.productId],
  )
  const availableSlots = React.useMemo(
    () => (isSourcedProduct ? catalogSlots : (ownedSlotsQuery.data?.data ?? [])),
    [isSourcedProduct, catalogSlots, ownedSlotsQuery.data?.data],
  )
  const allOpenSlots = React.useMemo(
    () =>
      getBookableDepartureSlots(availableSlots, {
        nowIso: slotsFromIso,
        optionId: null,
      }),
    [availableSlots, slotsFromIso],
  )
  const slots = React.useMemo(() => {
    const optionSlots = getBookableDepartureSlots(availableSlots, {
      nowIso: slotsFromIso,
      optionId: product.optionId,
    })
    return optionSlots.length > 0 ? optionSlots : allOpenSlots
  }, [availableSlots, slotsFromIso, product.optionId, allOpenSlots])
  const selectedSlot = React.useMemo(
    () =>
      slots.find((slot) => slot.id === slotId) ?? (defaultSlot?.id === slotId ? defaultSlot : null),
    [slots, slotId, defaultSlot],
  )
  const canBookWithoutDeparture =
    isSourcedProduct && sourcedSlotsQuery.isSuccess && catalogSlots.length === 0
  const hasBookingTiming = Boolean(slotId) || canBookWithoutDeparture
  const departureDateIso = selectedSlot?.startsAt?.slice(0, 10) ?? null

  const formatSlotLabel = React.useCallback(
    (slot: AvailabilitySlotRecord) => {
      const date = formatDate(slot.startsAt, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
      const remaining =
        !slot.unlimited && typeof slot.remainingPax === "number"
          ? ` · ${slot.remainingPax} ${messages.bookingCreateDialog.labels.remainingCapacity}`
          : ""
      return `${date}${remaining}`
    },
    [formatDate, messages],
  )

  const setSelectedSlot = React.useCallback(
    (nextSlotId: string | null) => {
      setPayloadMismatchUnitIds([])
      const nextSlot = nextSlotId ? allOpenSlots.find((slot) => slot.id === nextSlotId) : null
      if (nextSlot?.optionId && nextSlot.optionId !== product.optionId) {
        setProduct((prev) => ({ ...prev, optionId: nextSlot.optionId }))
      }
      setSlotId(nextSlotId)
    },
    [allOpenSlots, product.optionId],
  )

  React.useEffect(() => {
    setProduct((prev) => {
      const nextProductId = defaultProductId ?? defaultSlot?.productId ?? prev.productId
      const nextOptionId = defaultSlotId ? (defaultSlot?.optionId ?? prev.optionId) : prev.optionId
      return prev.productId === nextProductId && prev.optionId === nextOptionId
        ? prev
        : { ...prev, productId: nextProductId, optionId: nextOptionId }
    })
    setSlotId(defaultSlotId ?? null)
  }, [defaultProductId, defaultSlotId, defaultSlot?.productId, defaultSlot?.optionId])

  // biome-ignore lint/correctness/useExhaustiveDependencies: manual-create intentionally resets transient selection state when the selected product/default departure changes.
  React.useEffect(() => {
    setRooms(emptyOptionUnitsStepperValue)
    setRoomUnits([])
    setExtraLines([])
    setSharedRoom(emptySharedRoomValue)
    setPayloadMismatchUnitIds([])
  }, [product.productId, defaultSlotId])

  // Unit quantities belong to a (departure, option) pair, so they are dropped
  // when the operator changes either. Keyed on the ids and NOT on the slots
  // array identity: `allOpenSlots` and `defaultSlot` get a new identity on
  // every refetch — including one triggered by an unrelated booking mutating
  // a slot row the query returns — which used to wipe a filled-in stepper
  // under the operator mid-form (#4588).
  // biome-ignore lint/correctness/useExhaustiveDependencies: the ids are the reset key, not values the effect reads.
  React.useEffect(() => {
    setRooms(emptyOptionUnitsStepperValue)
    setRoomUnits([])
    setPayloadMismatchUnitIds([])
  }, [slotId, product.optionId])

  // Reconcile a departure that is bound to a different option than the one
  // selected. Setting either id re-runs the reset above.
  React.useEffect(() => {
    if (!slotId || !product.optionId) return
    const departure =
      allOpenSlots.find((slot) => slot.id === slotId) ??
      (defaultSlot?.id === slotId ? defaultSlot : null)
    if (!departure?.optionId || departure.optionId === product.optionId) return
    if (defaultSlotId && departure.id === defaultSlotId) {
      setProduct((prev) => ({ ...prev, optionId: departure.optionId }))
      return
    }
    setSlotId(null)
  }, [allOpenSlots, product.optionId, slotId, defaultSlotId, defaultSlot])

  React.useEffect(() => {
    if (!departureDateIso || paymentScheduleTouchedRef.current) return
    setPaymentScheduleState((prev) => {
      if (prev.mode !== "full" || prev.installments.length !== 1) return prev
      const installment = prev.installments[0]
      if (!installment || installment.dueDate === departureDateIso) return prev
      return { ...prev, installments: [{ ...installment, dueDate: departureDateIso }] }
    })
  }, [departureDateIso])

  React.useEffect(() => {
    if (contactTouched) return
    if (billingPerson && billingPerson.id === billing.personId) {
      setContact({
        firstName: billingPerson.firstName,
        lastName: billingPerson.lastName,
        email: billingPerson.email ?? "",
        phone: billingPerson.phone ?? "",
        preferredLanguage: billingPerson.preferredLanguage ?? "",
        taxId: "",
      })
    } else if (billingOrganization && billingOrganization.id === billing.organizationId) {
      setContact({
        firstName: billingOrganization.name,
        lastName: "",
        email: "",
        phone: "",
        preferredLanguage: billingOrganization.preferredLanguage ?? "",
        taxId: billingOrganization.taxId ?? "",
      })
    }
  }, [billing.personId, billing.organizationId, billingPerson, billingOrganization, contactTouched])

  const handleBillingChange = React.useCallback(
    (next: PersonPickerValue) => {
      const currentParty =
        (billing.billTo ?? "person") === "organization"
          ? `organization:${billing.organizationId ?? ""}`
          : `person:${billing.personId ?? ""}`
      const nextParty =
        (next.billTo ?? "person") === "organization"
          ? `organization:${next.organizationId ?? ""}`
          : `person:${next.personId ?? ""}`
      if (currentParty !== nextParty) {
        setContactTouched(false)
        setContact({
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          preferredLanguage: "",
          taxId: "",
        })
        // The address belongs to the party, so changing the party clears it
        // and re-arms the prefill. Leaving it would bill the new buyer at the
        // previous one's address.
        setAddressTouched(false)
        setAddress(emptyManualBookingAddress)
      }
      setBilling(next)
    },
    [billing.billTo, billing.organizationId, billing.personId],
  )

  const sourcedQuoteDraft = React.useMemo(
    () =>
      buildManualBookingQuoteDraft({
        productId: product.productId,
        sourceKind: resolvedSourceKind || undefined,
        sourceConnectionId: resolvedSourceConnectionId,
        sourceRef: resolvedSourceRef,
        optionId: product.optionId,
        slotId,
        quantities: rooms.quantities,
        units: roomUnits,
        travelers,
        contact: null,
        extraLines,
        promotionCode,
        paymentSchedule,
      }),
    [
      product.productId,
      product.optionId,
      resolvedSourceKind,
      resolvedSourceConnectionId,
      resolvedSourceRef,
      slotId,
      rooms.quantities,
      roomUnits,
      travelers,
      extraLines,
      promotionCode,
      paymentSchedule,
    ],
  )
  // Non-binding price probe. The beta `POST /catalog/quote` this replaced is
  // gone; Offer Preview is its successor and mints no Session per keystroke.
  // The Session that actually books is opened by the submit handler below.
  const sourcedQuote = useOfferPreview({
    surface: "admin",
    baseUrl,
    fetcher,
    // Sourced products resolve through the catalog plane, which is what
    // `catalog_item` names; `product` would dispatch to the owned handler.
    target: product.productId ? { kind: "catalog_item", catalogItemId: product.productId } : null,
    selection: sourcedQuoteDraft,
    scope: { ...(product.sellCurrency ? { currency: product.sellCurrency } : {}) },
    enabled:
      isSourcedProduct && Boolean(product.productId && hasBookingTiming && resolvedSourceKind),
  })
  const [sourcedQuoteProductId, setSourcedQuoteProductId] = React.useState("")
  React.useEffect(() => {
    if (isSourcedProduct && product.productId && !sourcedQuote.isSettling && sourcedQuote.data) {
      setSourcedQuoteProductId(product.productId)
    }
  }, [isSourcedProduct, product.productId, sourcedQuote.data, sourcedQuote.isSettling])
  const currentSourcedQuoteData =
    sourcedQuoteProductId === product.productId ? sourcedQuote.data : null
  const sourcedProductOptions = React.useMemo(
    () => resolveSourcedProductOptions(currentSourcedQuoteData?.requirements, productContent),
    [currentSourcedQuoteData?.requirements, productContent],
  )
  const sourcedProductSelectItems = React.useMemo(
    () => sourcedProductOptions.map((option) => ({ label: option.name, value: option.id })),
    [sourcedProductOptions],
  )
  const sourcedOptionUnits = React.useMemo(
    () =>
      resolveSourcedOptionUnits(
        sourcedProductOptions,
        product.optionId,
        selectedSlot?.remainingPax ?? null,
      ),
    [sourcedProductOptions, product.optionId, selectedSlot?.remainingPax],
  )
  const sourcedExtras = React.useMemo(
    () =>
      (currentSourcedQuoteData?.requirements?.addons?.catalog ?? []) as CatalogBookingExtraOption[],
    [currentSourcedQuoteData?.requirements?.addons?.catalog],
  )

  React.useEffect(() => {
    if (!isSourcedProduct || sourcedExtras.length === 0) return
    setExtraLines((current) => {
      const extrasById = new Map(sourcedExtras.map((extra) => [extra.id, extra]))
      const synchronized = current.flatMap((line) => {
        const extra = extrasById.get(line.productExtraId)
        if (!extra || extra.selectionType === "unavailable") return []
        const pricingMode = extra.pricingMode ?? (extra.pricedPerPerson ? "per_person" : "fixed")
        const chargedQuantity =
          pricingMode === "per_person" || extra.pricedPerPerson
            ? Math.max(1, travelers.travelers.length) * line.quantity
            : line.quantity
        const unitSellAmountCents = extra.unitAmountCents ?? null
        return [
          {
            ...line,
            name: extra.name,
            description: extra.description ?? null,
            pricingMode,
            pricedPerPerson: Boolean(extra.pricedPerPerson),
            sellCurrency:
              extra.currency ??
              currentSourcedQuoteData?.pricing?.currency ??
              product.sellCurrency ??
              line.sellCurrency,
            unitSellAmountCents,
            totalSellAmountCents:
              unitSellAmountCents == null ? null : unitSellAmountCents * chargedQuantity,
          },
        ] satisfies BookingCreateExtraLineInput[]
      })
      const selectedIds = new Set(synchronized.map((line) => line.productExtraId))
      const defaults = sourcedExtras.flatMap((extra) => {
        if (
          selectedIds.has(extra.id) ||
          (extra.selectionType !== "required" && extra.selectionType !== "default_selected")
        ) {
          return []
        }
        const quantity = Math.max(
          extra.selectionType === "required" ? 1 : 0,
          extra.minQuantity ?? 0,
          extra.defaultQuantity ?? 0,
        )
        if (quantity <= 0) return []
        const sellCurrency =
          extra.currency ?? currentSourcedQuoteData?.pricing?.currency ?? product.sellCurrency
        if (!sellCurrency) return []
        const pricingMode = extra.pricingMode ?? (extra.pricedPerPerson ? "per_person" : "fixed")
        const chargedQuantity =
          pricingMode === "per_person" || extra.pricedPerPerson
            ? Math.max(1, travelers.travelers.length) * quantity
            : quantity
        return [
          {
            productExtraId: extra.id,
            name: extra.name,
            description: extra.description ?? null,
            pricingMode,
            pricedPerPerson: Boolean(extra.pricedPerPerson),
            quantity,
            sellCurrency,
            unitSellAmountCents: extra.unitAmountCents ?? null,
            totalSellAmountCents:
              extra.unitAmountCents == null ? null : extra.unitAmountCents * chargedQuantity,
          },
        ] satisfies BookingCreateExtraLineInput[]
      })
      const next = defaults.length > 0 ? [...synchronized, ...defaults] : synchronized
      return JSON.stringify(next) === JSON.stringify(current) ? current : next
    })
  }, [
    isSourcedProduct,
    product.sellCurrency,
    sourcedExtras,
    currentSourcedQuoteData?.pricing?.currency,
    travelers.travelers.length,
  ])

  React.useEffect(() => {
    if (
      !isSourcedProduct ||
      sourcedProductOptions.length === 0 ||
      (product.optionId && sourcedProductOptions.some((option) => option.id === product.optionId))
    ) {
      return
    }
    const preferred =
      sourcedProductOptions.find((option) => option.isDefault) ?? sourcedProductOptions[0]
    if (preferred) setProduct((current) => ({ ...current, optionId: preferred.id }))
  }, [isSourcedProduct, product.optionId, sourcedProductOptions])

  const slotUnitAvailability = useSlotUnitAvailability({
    slotId: slotId ?? undefined,
    enabled: Boolean(slotId) && !isSourcedProduct,
  })
  const pricingPreview = usePricingPreview({
    productId: product.productId,
    optionId: product.optionId,
    enabled: Boolean(product.productId) && !isSourcedProduct,
  })
  const pricingCategoriesQuery = usePricingCategories({
    active: true,
    limit: 200,
    enabled: Boolean(product.productId) && !isSourcedProduct,
  })
  const optionUnitPriceRulesQuery = useOptionUnitPriceRules({
    optionId: product.optionId ?? selectedSlot?.optionId ?? undefined,
    active: true,
    limit: 200,
    enabled: Boolean(product.productId) && !isSourcedProduct,
  })
  const handleRoomUnitsChange = React.useCallback((units: OptionUnitsStepperUnit[]) => {
    setRoomUnits((prev) => (sameRoomUnits(prev, units) ? prev : units))
  }, [])
  const pricingRoomUnits = React.useMemo(
    () => pricingSnapshotRoomUnits(pricingPreview.data?.data),
    [pricingPreview.data],
  )
  const bookingUnits = React.useMemo(
    () => mergePricingRoomMetadata(roomUnits, pricingRoomUnits),
    [roomUnits, pricingRoomUnits],
  )
  const roomUnitOptions: RoomUnitOption[] = React.useMemo(() => {
    type UnitLike = {
      optionId?: string | null
      optionUnitId: string
      unitName: string
      unitCode?: string | null
      unitType?: OptionUnitsStepperUnit["unitType"]
      occupancyMax: number | null
    }
    const sourceUnits: UnitLike[] =
      bookingUnits.length > 0 ? bookingUnits : (slotUnitAvailability.data?.data ?? [])
    const units = sourceUnits.filter(isBookingInventoryUnit)
    return units
      .filter((unit) => (rooms.quantities[unit.optionUnitId] ?? 0) > 0)
      .map((unit) => {
        const totalQty = rooms.quantities[unit.optionUnitId] ?? 0
        const occupancyMax = Math.max(1, unit.occupancyMax ?? 1)
        const seats = totalQty * occupancyMax
        const assigned = travelers.travelers.filter(
          (traveler) => traveler.inventoryUnitId === unit.optionUnitId,
        ).length
        return {
          unitId: unit.optionUnitId,
          unitName: stripOptionPrefix(unit.unitName),
          remainingCapacity: Math.max(0, seats - assigned),
        }
      })
  }, [bookingUnits, slotUnitAvailability.data, rooms.quantities, travelers.travelers])

  const roomGroups: RoomGroup[] = React.useMemo(() => {
    if (bookingUnits.length === 0) return []
    const groups = new Map<string, RoomGroup>()
    for (const rawUnit of bookingUnits) {
      const unit = normalizeBookingUnit(rawUnit)
      if (!unit.optionId) continue
      const isInventory = isBookingInventoryUnit(unit)
      const isAdultCoded = (unit.unitCode ?? "").toUpperCase() === "ADULT"
      const roomUnit = {
        unitId: unit.optionUnitId,
        unitName: stripOptionPrefix(unit.unitName),
        unitCode: unit.unitCode ?? null,
        minAge: unit.minAge ?? null,
        maxAge: unit.maxAge ?? null,
        unitType: (unit.unitType ?? null) as RoomGroup["units"][number]["unitType"],
      }
      const existing = groups.get(unit.optionId)
      if (existing) {
        existing.units.push(roomUnit)
        if (isInventory) existing.primaryUnitId = unit.optionUnitId
        else if (
          isAdultCoded &&
          !existing.units.some(
            (candidate) => candidate.unitType === "room" || candidate.unitType === "vehicle",
          )
        ) {
          existing.primaryUnitId = unit.optionUnitId
        }
      } else {
        groups.set(unit.optionId, {
          optionId: unit.optionId,
          optionName: stripUnitSuffix(unit.unitName),
          primaryUnitId: unit.optionUnitId,
          units: [roomUnit],
        })
      }
    }
    return Array.from(groups.values())
  }, [bookingUnits])

  const travelerPricingCategories: TravelerPricingCategoryOption[] = React.useMemo(() => {
    if (isSourcedProduct) {
      const unitIds = sourcedOptionUnits.map((unit) => unit.optionUnitId)
      return (currentSourcedQuoteData?.requirements?.paxBands ?? []).map((band) => ({
        categoryId: band.code,
        name: band.label,
        code: band.code,
        categoryType: paxBandCategoryType(band.code),
        minAge: band.minAge ?? null,
        maxAge: band.maxAge ?? null,
        unitIds,
      }))
    }
    const snapshot = pricingPreview.data?.data
    const categoriesById = new Map<string, PricingCategoryLike>()
    const bookingUnitIds = new Set(bookingUnits.map((unit) => unit.optionUnitId))
    for (const category of pricingCategoriesQuery.data?.data ?? [])
      categoriesById.set(category.id, category)
    for (const category of snapshot?.pricingCategories ?? [])
      categoriesById.set(category.id, category)
    const unitIdsByCategoryId = new Map<string, Set<string>>()
    for (const unitPrice of snapshot?.unitPrices ?? []) {
      if (!unitPrice.pricingCategoryId) continue
      if (bookingUnitIds.size > 0 && !bookingUnitIds.has(unitPrice.unitId)) continue
      const existing = unitIdsByCategoryId.get(unitPrice.pricingCategoryId) ?? new Set<string>()
      existing.add(unitPrice.unitId)
      unitIdsByCategoryId.set(unitPrice.pricingCategoryId, existing)
    }
    for (const rule of optionUnitPriceRulesQuery.data?.data ?? []) {
      if (!rule.pricingCategoryId) continue
      if (bookingUnitIds.size > 0 && !bookingUnitIds.has(rule.unitId)) continue
      const existing = unitIdsByCategoryId.get(rule.pricingCategoryId) ?? new Set<string>()
      existing.add(rule.unitId)
      unitIdsByCategoryId.set(rule.pricingCategoryId, existing)
    }
    return Array.from(unitIdsByCategoryId.entries())
      .flatMap(([categoryId, unitIds]) => {
        const category = categoriesById.get(categoryId)
        return category
          ? [
              {
                categoryId,
                name: category.name,
                code: category.code,
                categoryType: category.categoryType,
                minAge: category.minAge,
                maxAge: category.maxAge,
                unitIds: Array.from(unitIds),
              },
            ]
          : []
      })
      .sort((left, right) => {
        const leftSort = categoriesById.get(left.categoryId)?.sortOrder ?? 0
        const rightSort = categoriesById.get(right.categoryId)?.sortOrder ?? 0
        return leftSort - rightSort || left.name.localeCompare(right.name)
      })
  }, [
    pricingPreview.data,
    pricingCategoriesQuery.data?.data,
    optionUnitPriceRulesQuery.data?.data,
    bookingUnits,
    isSourcedProduct,
    sourcedOptionUnits,
    currentSourcedQuoteData?.requirements?.paxBands,
  ])

  const travelerPricingCategoryLabels = React.useMemo(
    () =>
      Object.fromEntries(
        travelerPricingCategories.map((category) => [category.categoryId, category.name]),
      ),
    [travelerPricingCategories],
  )
  const displayDraft = React.useMemo(
    () =>
      resolveBookingDraft({
        quantities: rooms.quantities,
        travelers: travelers.travelers,
        units: bookingUnits as PricingAssignmentUnit[],
      }),
    [rooms.quantities, travelers.travelers, bookingUnits],
  )
  const travelerPricingCategoryQuantities = React.useMemo(() => {
    const quantities: Record<string, Record<string, number>> = {}
    for (const [unitId, indexes] of Object.entries(displayDraft.travelerIndexesByUnitId)) {
      for (const index of indexes) {
        const traveler = displayDraft.travelers[index]
        if (!traveler) continue
        const pricingCategoryId = inferTravelerPricingCategoryId(
          traveler,
          travelerPricingCategories,
        )
        if (!pricingCategoryId) continue
        const unitQuantities = quantities[unitId] ?? {}
        unitQuantities[pricingCategoryId] = (unitQuantities[pricingCategoryId] ?? 0) + 1
        quantities[unitId] = unitQuantities
      }
    }
    return quantities
  }, [displayDraft, travelerPricingCategories])
  const displayExtraLines = React.useMemo(
    () =>
      resolveBookingExtraLines({
        extraLines,
        travelerCount: travelers.travelers.length,
      }),
    [extraLines, travelers.travelers.length],
  )
  const roomUnitLabels = React.useMemo(
    () => Object.fromEntries(bookingUnits.map((unit) => [unit.optionUnitId, unit.unitName])),
    [bookingUnits],
  )
  const quoteContact = React.useMemo(
    () =>
      buildManualBookingContactInput({
        billTo: billing.billTo ?? "person",
        contact,
        address,
      }),
    [billing.billTo, contact, address],
  )
  const quoteDraft = React.useMemo(
    () =>
      buildManualBookingQuoteDraft({
        productId: product.productId,
        sourceKind: resolvedSourceKind || undefined,
        sourceConnectionId: resolvedSourceConnectionId,
        sourceRef: resolvedSourceRef,
        optionId: product.optionId,
        slotId,
        quantities: displayDraft.quantities,
        units: bookingUnits,
        travelers: { travelers: displayDraft.travelers },
        pricingCategories: travelerPricingCategories,
        contact: quoteContact,
        extraLines: displayExtraLines,
        promotionCode,
        paymentSchedule,
      }),
    [
      product.productId,
      product.optionId,
      resolvedSourceKind,
      resolvedSourceConnectionId,
      resolvedSourceRef,
      slotId,
      displayDraft.quantities,
      bookingUnits,
      displayDraft.travelers,
      travelerPricingCategories,
      quoteContact,
      displayExtraLines,
      promotionCode,
      paymentSchedule,
    ],
  )
  const ownedQuote = useOfferPreview({
    surface: "admin",
    baseUrl,
    fetcher,
    target: product.productId ? { kind: "product", productId: product.productId } : null,
    selection: quoteDraft,
    scope: { ...(productRecord?.sellCurrency ? { currency: productRecord.sellCurrency } : {}) },
    enabled:
      !isSourcedProduct &&
      Boolean(
        product.productId &&
          slotId &&
          Object.values(displayDraft.quantities).some((qty) => qty > 0),
      ),
  })
  const quote = isSourcedProduct ? { ...sourcedQuote, data: currentSourcedQuoteData } : ownedQuote
  const quoteTotalAmountCents =
    quote.isSettling || quote.data?.available === false
      ? null
      : (quote.data?.pricing?.total ?? null)
  const pricingCurrency =
    quote.data?.pricing?.currency ??
    productRecord?.sellCurrency ??
    product.sellCurrency ??
    pricing?.currency ??
    messages.bookingCreateDialog.labels.currency
  const quotePreviewPricing = React.useMemo(() => {
    const quotePricing = quote.data?.pricing
    if (!quotePricing) return undefined
    return {
      totalAmountCents: quotePricing.total,
      currency: quotePricing.currency,
      lines: quotePricing.lines,
    }
  }, [quote.data?.pricing])
  const resolvedPricing = resolveManualBookingPricing({
    pricing,
    quoteTotalAmountCents,
    productAmountCents: productRecord?.sellAmountCents ?? product.sellAmountCents ?? null,
    currency: pricingCurrency,
  })
  const paymentRows = paymentScheduleToRows(
    paymentSchedule,
    pricingCurrency,
    resolvedPricing?.confirmedAmountCents ?? null,
  )
  const requiresUnitSelection = !isSourcedProduct || sourcedOptionUnits.length > 0
  const hasSelectedUnits =
    !requiresUnitSelection || Object.values(rooms.quantities).some((qty) => qty > 0)
  const manualOverrideRequiresReason = Boolean(
    pricing?.isManualOverride &&
      resolvedPricing &&
      pricing.confirmedAmountCents !== resolvedPricing.catalogAmountCents &&
      !pricing.priceOverrideReason.trim(),
  )
  // The quote is authoritative about the code now (voyant#4615). Before that
  // the selection's `promotionCode` was projected away server-side, so the
  // form had nothing to read and inferred rejection from an unrelated
  // `available === false` — which is why a perfectly good departure reported
  // the operator's code as invalid.
  const promotionCodeStatus = quote.data?.pricing?.promotionCodeStatus ?? null
  const {
    hasCode: hasPromotionCode,
    rejected: promotionRejected,
    ready: promotionReady,
  } = resolveManualBookingPromotionState({
    promotionCode,
    isSettling: quote.isSettling,
    hasError: Boolean(quote.error),
    hasPricing: Boolean(quote.data?.pricing),
    status: promotionCodeStatus,
  })
  const sourcedQuoteReady =
    !isSourcedProduct ||
    (!quote.isSettling &&
      !quote.error &&
      quote.data?.available !== false &&
      Boolean(quote.data?.pricing))
  const promoFeedback = !hasPromotionCode
    ? null
    : quote.isSettling
      ? copy.promotion.checking
      : quote.error || !quote.data?.pricing
        ? copy.promotion.unavailable
        : promotionCodeStatus && promotionCodeStatus.kind !== "code_valid"
          ? promotionCodeStatusMessage(promotionCodeStatus, copy.promotion)
          : formatMessage(copy.promotion.valid, {
              amount: formatManualBookingAmount(
                quote.data.pricing.total,
                quote.data.pricing.currency,
                formatCurrency,
              ),
            })

  /**
   * Every condition that keeps **Create booking** disabled, resolved to the
   * first one that applies. Named once so the button, the reason rendered
   * beside it, and the error-clearing effect below cannot drift apart.
   */
  const submitBlocker = resolveManualBookingSubmitBlocker({
    isSourcedProduct,
    hasProduct: Boolean(product.productId),
    hasBookingTiming,
    hasSelectedUnits,
    quoteIsSettling: quote.isSettling,
    sourcedQuoteReady,
    promotionReady,
  })
  const submitBlocked = submitBlocker !== null

  // #4588: a message raised by a submit-gating condition has no other way out
  // — the button is dead, and Enter does not fire implicit submission through
  // a disabled submit button either. Drop it the moment submit is possible
  // again, so it can never outlive the condition that produced it.
  React.useEffect(() => {
    setError((prev) => clearUnblockedManualBookingError(prev, submitBlocked))
  }, [submitBlocked])

  // Human copy for the server's findings. The descriptor is only consulted for
  // labels, and an owned product's form never loaded one — the messages then
  // name the requirement by its own key, which is what an operator would look
  // up anyway.
  const unsatisfiedMessages = React.useMemo(
    () =>
      describeUnsatisfiedRequirements(
        unsatisfied,
        messages,
        currentSourcedQuoteData?.requirements,
      ).map((entry) => entry.message),
    [unsatisfied, messages, currentSourcedQuoteData?.requirements],
  )

  const handleSubmit = async () => {
    setError(null)
    setUnsatisfied([])
    setPayloadMismatchUnitIds([])
    if (quote.isSettling) {
      setError({ message: copy.validation.pricingPending, blocksSubmit: true })
      return
    }
    if (isSourcedProduct) {
      setError({ message: copy.validation.sourcedBookingSessionRequired, blocksSubmit: true })
      return
    }
    if (!sourcedQuoteReady) {
      setError({ message: copy.validation.pricingUnavailable, blocksSubmit: true })
      return
    }
    if (!promotionReady) {
      setError({
        message: promotionRejected ? copy.promotion.blocked : copy.promotion.unavailable,
        blocksSubmit: true,
      })
      return
    }
    const validationError = validateManualBookingDraft({
      productId: product.productId,
      slotId,
      requireDeparture: !canBookWithoutDeparture,
      hasSelectedUnits,
      billing,
      contactFirstName: contact.firstName,
      contactLastName: contact.lastName,
      contactEmail: contact.email,
      contactPhone: contact.phone,
      travelers: { travelers: displayDraft.travelers },
      pricing: resolvedPricing,
      manualOverrideRequiresReason,
      paymentRows,
      paymentSchedule,
      address,
      contactTaxId: contact.taxId,
      willIssueInvoice,
      messages: copy,
    })
    if (validationError) {
      setError(toManualBookingFormError(validationError, copy.validation.units))
      return
    }
    if (sharedRoom.enabled && sharedRoom.mode === "join" && !sharedRoom.groupId) {
      setError({ message: copy.validation.sharedRoomGroup })
      return
    }
    const overCapacity = getOverCapacityInventoryAssignments(
      bookingUnits,
      displayDraft.quantities,
      displayDraft.travelers,
    )[0]
    if (overCapacity) {
      setError({
        message: formatMessage(messages.bookingCreateDialog.validation.roomCapacityExceeded, {
          room: overCapacity.unitName,
          assigned: overCapacity.assignedTravelers,
          capacity: overCapacity.capacity,
        }),
      })
      return
    }
    if (!resolvedPricing) return

    const confirmed = await confirmDialog({
      title: copy.confirm.title,
      description: copy.confirm.description
        .replace("{product}", productDisplayName)
        .replace(
          "{amount}",
          formatManualBookingAmount(
            resolvedPricing.confirmedAmountCents,
            resolvedPricing.currency,
            formatCurrency,
          ),
        )
        .replace("{travelers}", String(displayDraft.travelers.length)),
      confirmLabel: copy.actions.confirmCreate,
      cancelLabel: messages.common.cancel,
    })
    if (!confirmed) return
    if (submissionRef.current) return
    submissionRef.current = true

    const submitUnits =
      bookingUnits.length > 0
        ? bookingUnits
        : getTravelerAssignableStepperUnits(
            (slotUnitAvailability.data?.data ?? []).map((unit) => ({
              ...unit,
              optionId: product.optionId,
            })),
          )
    const redistributed = resolveBookingDraft({
      quantities: rooms.quantities,
      travelers: travelers.travelers,
      units: submitUnits as PricingAssignmentUnit[],
    })
    const travelerKeysByUnitId = Object.fromEntries(
      Object.entries(redistributed.travelerIndexesByUnitId).map(([unitId, indexes]) => [
        unitId,
        indexes.every((index) => Boolean(redistributed.travelers[index]?.clientTravelerKey))
          ? indexes
              .map((index) => redistributed.travelers[index]?.clientTravelerKey)
              .filter((key): key is string => Boolean(key))
          : [],
      ]),
    )
    const travelerKeysByUnitAndCategoryId: Record<string, Record<string, string[]>> = {}
    for (const [unitId, indexes] of Object.entries(redistributed.travelerIndexesByUnitId)) {
      for (const index of indexes) {
        const traveler = redistributed.travelers[index]
        if (!traveler) continue
        const pricingCategoryId = inferTravelerPricingCategoryId(
          traveler,
          travelerPricingCategories,
        )
        if (!pricingCategoryId) continue
        const key = traveler.clientTravelerKey
        if (key) {
          travelerKeysByUnitAndCategoryId[unitId] ??= {}
          travelerKeysByUnitAndCategoryId[unitId][pricingCategoryId] ??= []
          travelerKeysByUnitAndCategoryId[unitId][pricingCategoryId].push(key)
        }
      }
    }
    const travelerKeys = redistributed.travelers
      .map((traveler) => traveler.clientTravelerKey)
      .filter((key): key is string => Boolean(key))
    const itemLines = itemLinesToRows(
      redistributed.quantities,
      submitUnits,
      pricing,
      travelerKeysByUnitId,
      travelerKeysByUnitAndCategoryId,
    )
    const resolvedExtraLines = resolveBookingExtraLines({
      extraLines,
      travelerCount: travelers.travelers.length,
      travelerKeys:
        travelerKeys.length === redistributed.travelers.length ? travelerKeys : undefined,
    })
    const travelerRows = manualBookingTravelersToRows(
      redistributed.travelers,
      travelerPricingCategories,
    )
    const labelReference = attemptRef.current?.labelReference ?? null
    const selectedSharedRoomUnitId = getSelectedSharedRoomUnitId(rooms.quantities)
    const groupMembership: BookingCreateGroupMembershipInput | undefined = sharedRoom.enabled
      ? sharedRoom.mode === "create"
        ? {
            action: "create",
            kind: "shared_room",
            label:
              sharedRoom.groupLabel?.trim() ||
              `${messages.bookingCreateDialog.labels.sharedRoomGeneratedLabelPrefix} - ${
                labelReference ?? "pending"
              }`,
            optionUnitId: selectedSharedRoomUnitId,
            makeBookingPrimary: true,
          }
        : sharedRoom.groupId
          ? { action: "join", groupId: sharedRoom.groupId, role: "shared" }
          : undefined
      : undefined
    const travelCreditRedemption: BookingCreateTravelCreditRedemptionInput | undefined =
      travelCredit.picked?.remainingAmountCents != null
        ? {
            travelCreditId: travelCredit.picked.id,
            amountCents: travelCredit.picked.remainingAmountCents,
          }
        : undefined
    const contactPayload = buildManualBookingContactInput({
      billTo,
      contact,
      address,
    })
    const booking = {
      productId: product.productId,
      optionId: selectedSlot?.optionId ?? product.optionId,
      slotId,
      personId: billTo === "person" ? billing.personId : null,
      organizationId: billTo === "organization" ? billing.organizationId : null,
      internalNotes: notes.trim() || null,
      manualPriceOverride: toManualBookingPriceOverride(resolvedPricing),
      itemLines: itemLines.length > 0 ? itemLines : undefined,
      extraLines: resolvedExtraLines.length > 0 ? resolvedExtraLines : undefined,
      travelers: travelerRows.length > 0 ? travelerRows : undefined,
      paymentSchedules: paymentRows.length > 0 ? paymentRows : undefined,
      travelCreditRedemption,
      groupMembership,
      documentGeneration: resolveManualBookingDocumentGeneration({
        generateProforma,
        generateInvoiceAndContract,
        contractAvailable: contractGeneration.available,
      }),
      suppressNotifications: !notifyTraveler ? true : undefined,
      allowDuplicate: false,
      ...contactPayload,
    } satisfies Record<string, unknown>
    if (!quoteDraft) {
      submissionRef.current = false
      setError({ message: copy.validation.pricingUnavailable, blocksSubmit: true })
      return
    }
    const fingerprint = JSON.stringify({
      booking: {
        ...booking,
        // The generated default label is cosmetic. Fingerprint the user's
        // explicit choice so an identical retry keeps the same continuation.
        ...(groupMembership?.action === "create"
          ? {
              groupMembership: {
                ...groupMembership,
                label: sharedRoom.groupLabel?.trim() || null,
              },
            }
          : {}),
      },
      quoteDraft,
      quantity: redistributed.travelers.length,
    })
    if (!attemptRef.current || attemptRef.current.fingerprint !== fingerprint) {
      attemptRef.current = {
        fingerprint,
        // Cosmetic reference for the default shared-room group label; Booking
        // Session Commit allocates the durable booking reference server-side.
        labelReference: generateBookingNumber(),
        idempotencyKey: createIdempotencyKey(),
      }
    }

    setSubmitting(true)
    try {
      const attempt = attemptRef.current
      if (groupMembership?.action === "create") {
        booking.groupMembership = {
          ...groupMembership,
          label:
            sharedRoom.groupLabel?.trim() ||
            `${messages.bookingCreateDialog.labels.sharedRoomGeneratedLabelPrefix} - ${attempt.labelReference}`,
        }
      }
      const result = await commitBookingSessionJourneyV1(client, {
        target: { kind: "product", productId: product.productId },
        selection: buildManualBookingSessionSelection({
          quoteDraft,
          booking,
          catalogAmountCents: resolvedPricing.catalogAmountCents,
          confirmedAmountCents: resolvedPricing.confirmedAmountCents,
          priceOverrideReason: resolvedPricing.priceOverrideReason,
        }),
        quantity: redistributed.travelers.length,
        idempotencyKey: attempt.idempotencyKey,
        ...(attempt.continuation ? { continuation: attempt.continuation } : {}),
        onContinuation: (continuation) => {
          if (attemptRef.current?.idempotencyKey === attempt.idempotencyKey) {
            attemptRef.current = { ...attemptRef.current, continuation }
          }
        },
      })
      if (result.kind === "payment_required") {
        if (result.redirectUrl && typeof window !== "undefined") {
          window.location.assign(result.redirectUrl)
          return
        }
        throw new Error(copy.validation.paymentGuaranteeRequired)
      }
      await queryClient.invalidateQueries({ queryKey: availabilityQueryKeys.slots() })
      attemptRef.current = null
      onCreated(result.bookingId)
    } catch (cause) {
      setError({
        message:
          cause instanceof BookingSessionJourneyError
            ? copy.validation.bookingSession[cause.recovery]
            : cause instanceof Error
              ? cause.message
              : copy.validation.create,
      })
      // The typed outcome carried the list; keep it. Collapsing it back into
      // the sentence above is what made the server's enforcement invisible.
      setUnsatisfied(cause instanceof BookingSessionJourneyError ? (cause.unsatisfied ?? []) : [])
      if (
        cause instanceof BookingSessionJourneyError &&
        bookingSessionContinuationIsStale(cause.outcome)
      ) {
        // The server said the Quote, Hold or revision we are holding is dead.
        // Keeping the attempt would replay the same dead continuation on every
        // resubmit, which is how one operator hit the same failure three times
        // in a row (voyant#4662). Dropping it makes the next submit run a fresh
        // Create → Quote → Hold → Commit under a new idempotency key — safe
        // precisely because these outcomes mean no booking was created.
        attemptRef.current = null
      }
    } finally {
      submissionRef.current = false
      setSubmitting(false)
    }
  }

  const updateContact = (field: keyof typeof contact, value: string) => {
    setContactTouched(true)
    setContact((current) => ({ ...current, [field]: value }))
  }

  const billingPersonContactIncomplete = Boolean(
    billingPerson &&
      (!billingPerson.firstName.trim() ||
        !billingPerson.lastName.trim() ||
        (!billingPerson.email?.trim() && !billingPerson.phone?.trim())),
  )
  const billingPersonContactUnavailable = Boolean(
    billing.personId && !billingPersonQuery.isLoading && !billingPerson,
  )

  return (
    <form
      className="grid min-h-0 flex-1 gap-6 lg:grid-cols-12"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void handleSubmit()
      }}
    >
      <div className="flex min-h-0 min-w-0 flex-col lg:col-span-8">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-1 pb-2">
          <ProductPickerSection
            value={product}
            onChange={(next) => {
              setPayloadMismatchUnitIds([])
              if (next.productId !== product.productId) {
                setSlotId(null)
                setPricing(null)
              }
              setProduct(next)
            }}
            lockProduct={Boolean(defaultProductId || defaultSlotId)}
            labels={{ optionNone: messages.bookingCreateDialog.labels.noSpecificOption }}
            showOptionPicker={false}
          />
          {product.productId && !canBookWithoutDeparture ? (
            <div className="flex flex-col gap-1">
              <Label>{messages.bookingCreateDialog.fields.departure}</Label>
              <AsyncCombobox<AvailabilitySlotRecord>
                value={slotId}
                onChange={(v) => setSelectedSlot(v)}
                items={slots}
                selectedItem={selectedSlot}
                getKey={(slot) => slot.id}
                getLabel={(slot) => formatSlotLabel(slot)}
                placeholder={messages.bookingCreateDialog.placeholders.departure}
                emptyText={messages.bookingCreateDialog.placeholders.departureEmpty}
                triggerClassName="w-full"
                disabled={Boolean(defaultSlotId)}
                clearable={!defaultSlotId}
              />
            </div>
          ) : null}

          {isSourcedProduct &&
          product.productId &&
          hasBookingTiming &&
          sourcedProductOptions.length > 0 ? (
            <Field className="gap-2">
              <FieldLabel>{messages.productPickerSection.labels.option}</FieldLabel>
              <Select
                items={sourcedProductSelectItems}
                value={product.optionId ?? undefined}
                onValueChange={(optionId) => {
                  setRooms(emptyOptionUnitsStepperValue)
                  setRoomUnits([])
                  setExtraLines([])
                  setProduct((current) => ({ ...current, optionId: optionId ?? null }))
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={messages.productPickerSection.labels.optionNone} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {sourcedProductOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {product.productId &&
          hasBookingTiming &&
          (!isSourcedProduct || sourcedOptionUnits.length > 0) ? (
            <OptionUnitsStepperSection
              value={rooms}
              onChange={(next) => {
                setPayloadMismatchUnitIds([])
                setRooms(next)
              }}
              productId={product.productId}
              slotId={slotId ?? undefined}
              optionId={product.optionId}
              onUnitsChange={handleRoomUnitsChange}
              slotHasFiniteCapacity={
                Boolean(selectedSlot) &&
                !selectedSlot?.unlimited &&
                typeof selectedSlot?.remainingPax === "number"
              }
              invalidOptionUnitIds={payloadMismatchUnitIds}
              providedOptions={isSourcedProduct ? sourcedProductOptions : undefined}
              providedUnits={isSourcedProduct ? sourcedOptionUnits : undefined}
              sectionRef={unitsSectionRef}
              required={requiresUnitSelection}
              error={error?.field === "units" ? error.message : null}
              labels={{
                heading: messages.bookingCreateDialog.labels.roomsHeading,
                noOption: messages.bookingCreateDialog.labels.roomsNoOption,
                noSlot: messages.bookingCreateDialog.labels.roomsNoSlot,
                noUnits: messages.bookingCreateDialog.labels.roomsNoUnits,
                remaining: messages.bookingCreateDialog.labels.roomsRemaining,
                unlimited: messages.bookingCreateDialog.labels.roomsUnlimited,
              }}
            />
          ) : null}

          {product.productId && hasBookingTiming ? (
            <ProductExtrasPickerSection
              productId={product.productId}
              optionId={product.optionId}
              currency={pricingCurrency}
              travelerCount={travelers.travelers.length}
              value={extraLines}
              onChange={setExtraLines}
              enabled
              providedExtras={isSourcedProduct ? sourcedExtras : undefined}
              labels={{
                heading: messages.bookingCreateDialog.labels.extrasHeading,
                empty: messages.bookingCreateDialog.labels.extrasEmpty,
                included: messages.bookingCreateDialog.labels.extrasIncluded,
                onRequest: messages.bookingCreateDialog.labels.extrasOnRequest,
                perPerson: messages.bookingCreateDialog.labels.extrasPerPerson,
              }}
            />
          ) : null}

          {product.productId && hasBookingTiming ? (
            <FieldSet className="gap-4 rounded-md border p-3">
              <FieldLegend className="px-1">
                {messages.bookingCreateDialog.labels.billingHeading}
              </FieldLegend>
              <PersonPickerSection
                value={billing}
                onChange={handleBillingChange}
                labels={{
                  createNewPerson: messages.bookingCreateDialog.labels.createNewPerson,
                  selectExistingPerson: messages.bookingCreateDialog.labels.selectExistingPerson,
                  organizationNone: messages.bookingCreateDialog.labels.organizationNone,
                }}
              />
              {(billing.billTo ?? "person") === "person" ? (
                billing.personId && billingPersonQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">{copy.hints.contactLoading}</p>
                ) : billingPersonContactUnavailable ? (
                  <div
                    className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
                    role="alert"
                  >
                    <p>{copy.hints.contactUnavailable}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => void billingPersonQuery.refetch()}
                    >
                      {copy.actions.retryContact}
                    </Button>
                  </div>
                ) : billingPersonContactIncomplete ? (
                  <p
                    className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
                    role="alert"
                  >
                    {copy.hints.contactIncomplete}
                  </p>
                ) : null
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <EditableContactField
                    id="manual-booking-contact-first-name"
                    label={copy.fields.contactFirstName}
                    value={contact.firstName}
                    required
                    onChange={(value) => updateContact("firstName", value)}
                  />
                  <EditableContactField
                    id="manual-booking-contact-last-name"
                    label={copy.fields.contactLastName}
                    value={contact.lastName}
                    onChange={(value) => updateContact("lastName", value)}
                  />
                  <EditableContactField
                    id="manual-booking-contact-email"
                    label={copy.fields.contactEmail}
                    value={contact.email}
                    type="email"
                    onChange={(value) => updateContact("email", value)}
                  />
                  <Field className="gap-2">
                    <FieldLabel htmlFor="manual-booking-contact-phone">
                      {copy.fields.contactPhone}
                    </FieldLabel>
                    <PhoneInput
                      id="manual-booking-contact-phone"
                      value={contact.phone}
                      onChange={(value) => updateContact("phone", value)}
                    />
                  </Field>
                </div>
              )}
              {billingParty ? (
                <ManualBookingBillingAddressFields
                  address={address}
                  onChange={updateAddress}
                  copy={copy}
                  required={willIssueInvoice}
                  loading={billingAddressLoading}
                  {...(billTo === "organization"
                    ? {
                        taxId: contact.taxId,
                        onTaxIdChange: (value: string) => updateContact("taxId", value),
                      }
                    : {})}
                />
              ) : null}
            </FieldSet>
          ) : null}

          {product.productId &&
          hasBookingTiming &&
          (!isSourcedProduct || sourcedOptionUnits.some(isBookingInventoryUnit)) ? (
            <SharedRoomSection
              value={sharedRoom}
              onChange={setSharedRoom}
              productId={product.productId || undefined}
              labels={{
                toggle: messages.bookingCreateDialog.labels.sharedRoomToggle,
                createMode: messages.bookingCreateDialog.labels.sharedRoomCreateMode,
                joinMode: messages.bookingCreateDialog.labels.sharedRoomJoinMode,
                selectPlaceholder: messages.bookingCreateDialog.labels.sharedRoomSelectPlaceholder,
                noGroups: messages.bookingCreateDialog.labels.sharedRoomNoGroups,
                createHint: messages.bookingCreateDialog.labels.sharedRoomCreateHint,
                remove: messages.bookingCreateDialog.labels.sharedRoomRemove,
              }}
            />
          ) : null}

          {product.productId && hasBookingTiming ? (
            <TravelersSection
              value={travelers}
              onChange={(next) => {
                setPayloadMismatchUnitIds([])
                setTravelers(next)
              }}
              roomUnits={roomUnitOptions.length > 0 ? roomUnitOptions : undefined}
              roomGroups={roomGroups.length > 0 ? roomGroups : undefined}
              pricingCategories={
                travelerPricingCategories.length > 0 ? travelerPricingCategories : undefined
              }
              billingPersonId={(billing.billTo ?? "person") === "person" ? billing.personId : null}
              labels={{
                heading: messages.bookingCreateDialog.labels.travelerHeading,
                addTraveler: messages.bookingCreateDialog.labels.addTraveler,
                person: messages.bookingCreateDialog.labels.travelerPerson,
                personSearchPlaceholder:
                  messages.bookingCreateDialog.labels.travelerPersonSearchPlaceholder,
                personEmpty: messages.bookingCreateDialog.labels.travelerPersonEmpty,
                createNewPerson: messages.bookingCreateDialog.labels.createNewPerson,
                createPersonSheetTitle: messages.bookingCreateDialog.labels.createPersonSheetTitle,
                addBillingPerson: messages.bookingCreateDialog.labels.addBillingPersonAsTraveler,
                role: messages.bookingCreateDialog.labels.travelerRole,
                roleLead: messages.bookingCreateDialog.labels.travelerLead,
                roleAdult: messages.bookingCreateDialog.labels.travelerAdult,
                roleChild: messages.bookingCreateDialog.labels.travelerChild,
                roleInfant: messages.bookingCreateDialog.labels.travelerInfant,
                room: messages.bookingCreateDialog.labels.travelerRoom,
                noRoom: messages.bookingCreateDialog.labels.travelerNoRoom,
                remove: messages.bookingCreateDialog.labels.travelerRemove,
                empty: messages.bookingCreateDialog.labels.travelerEmpty,
              }}
            />
          ) : null}

          {product.productId && hasBookingTiming ? (
            <Field className="gap-2">
              <FieldLabel htmlFor="manual-booking-notes">
                {messages.bookingCreateDialog.fields.internalNotes}
              </FieldLabel>
              <Textarea
                id="manual-booking-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={messages.bookingCreateDialog.placeholders.internalNotes}
              />
            </Field>
          ) : null}

          {product.productId && hasBookingTiming ? (
            <div className="flex flex-col gap-3 rounded-md border p-3">
              <Label>{messages.bookingCreateDialog.labels.documentGenerationHeading}</Label>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <Checkbox
                    id="manual-booking-generate-proforma"
                    checked={generateProforma}
                    onCheckedChange={(value) => setGenerateProforma(value === true)}
                  />
                  <Label htmlFor="manual-booking-generate-proforma" className="cursor-pointer">
                    {messages.bookingCreateDialog.labels.generateProforma}
                  </Label>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id="manual-booking-generate-invoice-and-contract"
                      checked={generateInvoiceAndContractSelected}
                      disabled={!contractGeneration.available}
                      onCheckedChange={(value) => setGenerateInvoiceAndContract(value === true)}
                    />
                    <Label
                      htmlFor="manual-booking-generate-invoice-and-contract"
                      className={
                        contractGeneration.available
                          ? "cursor-pointer"
                          : "cursor-not-allowed text-muted-foreground"
                      }
                    >
                      {messages.bookingCreateDialog.labels.generateInvoiceAndContract}
                    </Label>
                  </div>
                  {contractGeneration.available ? null : (
                    <p className="pl-6 text-muted-foreground text-xs">
                      {messages.bookingCreateDialog.labels.generateInvoiceAndContractUnavailable}
                    </p>
                  )}
                </div>
                <div className="flex items-start gap-2 border-t pt-2 text-sm">
                  <Checkbox
                    id="manual-booking-notify-traveler"
                    checked={notifyTraveler}
                    onCheckedChange={(value) => setNotifyTraveler(value === true)}
                    className="mt-0.5"
                  />
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor="manual-booking-notify-traveler"
                      className="cursor-pointer text-sm"
                    >
                      {messages.bookingCreateDialog.fields.notifyTraveler}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {messages.bookingCreateDialog.fields.notifyTravelerHint}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {error ? (
          <p
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {error.message}
          </p>
        ) : null}
        {unsatisfiedMessages.length > 0 ? (
          <div
            role="alert"
            className="mt-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-destructive text-xs"
          >
            <div className="font-medium">{messages.bookingJourney.unsatisfied.title}</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {unsatisfiedMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {isSourcedProduct ? (
          <p
            role="alert"
            className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {copy.validation.sourcedBookingSessionRequired}
          </p>
        ) : null}
        {promotionRejected ? (
          <p
            role="alert"
            className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {copy.promotion.blocked}
          </p>
        ) : null}
        <ManualBookingSubmitFooter
          submitting={submitting}
          submitBlocked={submitBlocked}
          blockedReason={manualBookingSubmitBlockedNotice({
            blocker: submitBlocker,
            copy,
            promotionRejected,
            isSourcedProduct,
            formErrorMessage: error?.message ?? null,
          })}
          cancelLabel={messages.common.cancel}
          submitLabel={messages.bookingCreateDialog.actions.createBooking}
          onCancel={onCancel}
        />
      </div>

      <div className="flex flex-col gap-4 lg:col-span-4">
        <BookingPreviewCard
          productId={product.productId}
          productName={productDisplayName}
          isSourcedProduct={isSourcedProduct}
          quotePricing={quotePreviewPricing}
          optionId={product.optionId}
          slotId={slotId}
          slotLabel={selectedSlot ? formatSlotLabel(selectedSlot) : null}
          unitQuantities={displayDraft.quantities}
          unitLabels={roomUnitLabels}
          pricingCategoryQuantities={travelerPricingCategoryQuantities}
          pricingCategoryLabels={travelerPricingCategoryLabels}
          extraLines={displayExtraLines}
          travelers={displayDraft.travelers}
          messages={messages}
          onPricingChange={handlePricingChange}
        />
        {product.productId &&
        hasBookingTiming &&
        isSourcedProduct &&
        !quote.isSettling &&
        !sourcedQuoteReady ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {copy.validation.pricingUnavailable}
          </p>
        ) : null}
        {product.productId && hasBookingTiming ? (
          <FieldSet className="gap-3 rounded-md border p-3">
            <FieldLegend className="px-1">{copy.promotion.heading}</FieldLegend>
            <Field className="gap-2">
              <FieldLabel htmlFor="manual-booking-promotion-code">{copy.promotion.code}</FieldLabel>
              <Input
                id="manual-booking-promotion-code"
                value={promotionCode}
                onChange={(event) => setPromotionCode(event.target.value)}
                placeholder={copy.promotion.placeholder}
              />
              {promoFeedback ? (
                <FieldDescription
                  className={
                    !quote.isSettling && (quote.error || promotionRejected || !quote.data?.pricing)
                      ? "text-destructive"
                      : undefined
                  }
                >
                  {promoFeedback}
                </FieldDescription>
              ) : null}
            </Field>
          </FieldSet>
        ) : null}
        {product.productId && hasBookingTiming ? (
          <FieldSet className="gap-3 rounded-md border p-3">
            <FieldLegend className="px-1">{copy.fields.currency}</FieldLegend>
            <CurrencyCombobox
              value={pricingCurrency}
              onChange={() => undefined}
              disabled
              placeholder={copy.fields.currency}
            />
          </FieldSet>
        ) : null}
        {product.productId && hasBookingTiming ? (
          <TravelCreditPickerSection
            value={travelCredit}
            onChange={setTravelCredit}
            currency={pricingCurrency}
            labels={{
              heading: messages.bookingCreateDialog.labels.travelCreditHeading,
              codePlaceholder: messages.bookingCreateDialog.labels.travelCreditCodePlaceholder,
              apply: messages.bookingCreateDialog.labels.travelCreditApply,
              clear: messages.bookingCreateDialog.labels.travelCreditClear,
              remainingLabel: messages.bookingCreateDialog.labels.travelCreditRemainingLabel,
              invalidLabel: messages.bookingCreateDialog.labels.travelCreditInvalidLabel,
            }}
          />
        ) : null}
        {product.productId && hasBookingTiming ? (
          <PaymentScheduleSection
            value={paymentSchedule}
            onChange={setPaymentSchedule}
            currency={pricingCurrency}
            totalAmountCents={resolvedPricing?.confirmedAmountCents}
            departureDate={departureDateIso}
            labels={{
              heading: messages.bookingCreateDialog.labels.paymentHeading,
              modeUnpaid: messages.bookingCreateDialog.labels.paymentModeUnpaid,
              modeFull: messages.bookingCreateDialog.labels.paymentModeFull,
              modeAdvance: messages.bookingCreateDialog.labels.paymentModeAdvance,
              modeSplit: messages.bookingCreateDialog.labels.paymentModeSplit,
              dueDate: messages.bookingCreateDialog.labels.paymentDueDate,
              dueDatePlaceholder: messages.bookingCreateDialog.labels.paymentDueDatePlaceholder,
              amount: messages.bookingCreateDialog.labels.paymentAmount,
              firstInstallment: messages.bookingCreateDialog.labels.paymentFirstInstallment,
              secondInstallment: messages.bookingCreateDialog.labels.paymentSecondInstallment,
              installmentN: messages.bookingCreateDialog.labels.paymentInstallmentN,
              preset5050: messages.bookingCreateDialog.labels.paymentPreset5050,
              unpaidHint: messages.bookingCreateDialog.labels.paymentUnpaidHint,
              totalDue: messages.bookingCreateDialog.labels.paymentTotalDue,
              scheduledTotal: messages.bookingCreateDialog.labels.paymentScheduledTotal,
              remaining: messages.bookingCreateDialog.labels.paymentRemaining,
              alreadyPaid: messages.bookingCreateDialog.labels.paymentAlreadyPaid,
              paymentDate: messages.bookingCreateDialog.labels.paymentDate,
              paymentDatePlaceholder: messages.bookingCreateDialog.labels.paymentDatePlaceholder,
              paymentMethod: messages.bookingCreateDialog.labels.paymentMethod,
              paymentReference: messages.bookingCreateDialog.labels.paymentReference,
            }}
          />
        ) : null}
      </div>
    </form>
  )
}

export interface SourcedProductOption {
  id: string
  name: string
  isDefault?: boolean
  units?: ReadonlyArray<{
    id: string
    name: string
    unitType?: string | null
    minQuantity?: number | null
    maxQuantity?: number | null
  }>
}

export function resolveSourcedProductOptions(
  shape: BookingRequirementsV1 | undefined,
  content: CatalogDetailEnrichment | null,
): SourcedProductOption[] {
  const optionStep = shape?.configureSubSteps?.find((step) => step.kind === "product-option")
  if (optionStep?.kind === "product-option" && optionStep.options.length > 0) {
    return optionStep.options
  }
  return (content?.options ?? []).map((option) => ({
    id: option.id,
    name: option.name,
  }))
}

export function resolveSourcedOptionUnits(
  options: ReadonlyArray<SourcedProductOption>,
  selectedOptionId: string | null,
  remainingPax: number | null,
): OptionUnitsStepperUnit[] {
  const selected =
    options.find((option) => option.id === selectedOptionId) ??
    (options.length === 1 ? options[0] : undefined)
  if (!selected?.units) return []
  return selected.units.map((unit) => {
    const remaining = unit.maxQuantity ?? remainingPax
    return {
      optionId: selected.id,
      optionUnitId: unit.id,
      unitName: `${selected.name} · ${unit.name}`,
      unitType: normalizeSourcedUnitType(unit.unitType),
      occupancyMax: null,
      initial: remaining,
      reserved: 0,
      remaining,
    }
  })
}

function normalizeSourcedUnitType(
  unitType: string | null | undefined,
): OptionUnitsStepperUnit["unitType"] {
  switch (unitType) {
    case "person":
    case "group":
    case "room":
    case "vehicle":
    case "service":
    case "other":
      return unitType
    default:
      return "other"
  }
}

export function normalizeCatalogBookingSlot(
  slot: CatalogSlot,
  productId: string,
): AvailabilitySlotRecord | null {
  if (!slot.startsAt) return null
  const status = normalizeCatalogSlotStatus(slot.status)
  return {
    id: slot.id,
    productId,
    itineraryId: null,
    optionId: null,
    facilityId: null,
    availabilityRuleId: null,
    startTimeId: null,
    dateLocal: slot.startsAt.slice(0, 10),
    endDateLocal: null,
    startsAt: slot.startsAt,
    endsAt: null,
    timezone: "UTC",
    status,
    unlimited: slot.unlimited ?? slot.remainingPax == null,
    initialPax: slot.initialPax ?? null,
    remainingPax: slot.remainingPax ?? null,
    nights: null,
    days: null,
    notes: null,
  }
}

function normalizeCatalogSlotStatus(
  status: string | null | undefined,
): AvailabilitySlotRecord["status"] {
  switch (status) {
    case "closed":
    case "sold_out":
    case "cancelled":
      return status
    default:
      return "open"
  }
}

function paxBandCategoryType(code: string): TravelerPricingCategoryOption["categoryType"] {
  switch (code.trim().toLowerCase()) {
    case "child":
    case "children":
      return "child"
    case "infant":
    case "infants":
      return "infant"
    case "senior":
    case "seniors":
      return "senior"
    default:
      return "adult"
  }
}

function EditableContactField({
  id,
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
}) {
  return (
    <Field className="gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={type}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  )
}

/**
 * The buyer's billing address, and the fiscal code when the buyer is a
 * company.
 *
 * Prefilled from the picked party's primary address and editable, matching
 * `BookingBillingDialog` — the operator confirms what the CRM already knows
 * rather than retyping it, and can correct it when the invoice goes somewhere
 * else. `required` follows whether this booking will actually produce a
 * document, so a booking that issues nothing never asks (voyant#4654).
 */
function ManualBookingBillingAddressFields({
  address,
  onChange,
  copy,
  required,
  loading,
  taxId,
  onTaxIdChange,
}: {
  address: ManualBookingAddressInput
  onChange: (patch: Partial<ManualBookingAddressInput>) => void
  copy: ReturnType<typeof useBookingsUiMessagesOrDefault>["manualBookingCreate"]
  required: boolean
  loading: boolean
  taxId?: string
  onTaxIdChange?: (value: string) => void
}) {
  return (
    <FieldSet className="gap-4">
      <FieldLegend className="px-1 text-sm font-medium">
        {required ? copy.fields.billingAddressRequired : copy.fields.billingAddress}
      </FieldLegend>
      {loading ? (
        <p className="text-sm text-muted-foreground">{copy.hints.billingAddressLoading}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {required ? copy.hints.billingAddressRequired : copy.hints.billingAddress}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <EditableContactField
          id="manual-booking-billing-line1"
          label={copy.fields.billingAddressLine1}
          value={address.line1}
          required={required}
          onChange={(value) => onChange({ line1: value })}
        />
        <EditableContactField
          id="manual-booking-billing-line2"
          label={copy.fields.billingAddressLine2}
          value={address.line2}
          onChange={(value) => onChange({ line2: value })}
        />
        <EditableContactField
          id="manual-booking-billing-city"
          label={copy.fields.billingCity}
          value={address.city}
          required={required}
          onChange={(value) => onChange({ city: value })}
        />
        <EditableContactField
          id="manual-booking-billing-region"
          label={copy.fields.billingRegion}
          value={address.region}
          onChange={(value) => onChange({ region: value })}
        />
        <EditableContactField
          id="manual-booking-billing-postal-code"
          label={copy.fields.billingPostalCode}
          value={address.postalCode}
          onChange={(value) => onChange({ postalCode: value })}
        />
        <Field className="gap-2">
          <FieldLabel htmlFor="manual-booking-billing-country">
            {copy.fields.billingCountry}
          </FieldLabel>
          <CountryCombobox
            value={address.country || null}
            onChange={(code) => onChange({ country: code ?? "" })}
          />
        </Field>
        {onTaxIdChange ? (
          <EditableContactField
            id="manual-booking-billing-tax-id"
            label={copy.fields.billingTaxId}
            value={taxId ?? ""}
            required={required}
            onChange={onTaxIdChange}
          />
        ) : null}
      </div>
    </FieldSet>
  )
}

function createIdempotencyKey(): string {
  const id =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `manual-booking:${id}`
}
