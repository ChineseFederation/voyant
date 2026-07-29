// agent-quality: file-size exception -- owner: bookings-react; the focused manual-create form keeps its validation and Tool payload reviewable together.
"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  type PricingAssignmentUnit,
  resolveBookingDraft,
  resolveBookingExtraLines,
  travelersToRows,
} from "@voyant-travel/bookings/pricing-assignment"
import {
  type BookingDraftShapeV1,
  type BookingDraftV1,
  bookingDraftV1,
  type PaxBandCode,
} from "@voyant-travel/catalog-contracts/booking-engine/contracts"
import {
  type CatalogDetailEnrichment,
  type CatalogSlot,
  createCatalogEnrichmentFetchers,
  useCatalogSlots,
} from "@voyant-travel/catalog-react"
import { useBookingQuote } from "@voyant-travel/catalog-react/booking-engine"
import {
  useOptionUnitPriceRules,
  usePricingCategories,
} from "@voyant-travel/commerce-react/pricing"
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
  usePricingPreview,
} from "../index.js"
import {
  allocateManualBookingNumber,
  createManualBookingThroughTool,
  getManualBookingToolAvailability,
} from "../manual-booking-mcp-client.js"
import { useVoyantBookingsContext } from "../provider.js"
import {
  findAlreadyPaidInstallmentMissingPaymentDate,
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
  bookingNumber: string | null
  idempotencyKey: string
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
}): BookingDraftV1 | null {
  if (!input.productId) return null
  const unitsById = new Map(input.units.map((unit) => [unit.optionUnitId, unit]))
  return bookingDraftV1.parse({
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
          address: {},
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
}): ManualBookingContactInput {
  return {
    contactPartyType: input.billTo === "organization" ? "company" : "individual",
    contactTaxId: input.billTo === "organization" ? (input.contact.taxId ?? null) : null,
    contactFirstName: input.contact.firstName.trim(),
    contactLastName: input.contact.lastName.trim() || null,
    contactEmail: input.contact.email.trim() || null,
    contactPhone: input.contact.phone.trim() || null,
    contactPreferredLanguage: input.contact.preferredLanguage.trim() || null,
  }
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

export function ManualBookingCreateForm({
  defaultProductId,
  defaultSlotId,
  onCreated,
  onCancel,
}: ManualBookingCreateFormProps) {
  const { baseUrl, fetcher } = useVoyantBookingsContext()
  const { messages, formatDate, formatCurrency } = useBookingsUiI18nOrDefault()
  const copy = messages.manualBookingCreate
  const client = React.useMemo(() => ({ baseUrl, fetcher }), [baseUrl, fetcher])
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
  const [notes, setNotes] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const errorRef = React.useRef<HTMLParagraphElement>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [payloadMismatchUnitIds, setPayloadMismatchUnitIds] = React.useState<string[]>([])
  const [permissionState, setPermissionState] = React.useState<
    "checking" | "allowed" | "denied" | "error"
  >("checking")
  const attemptRef = React.useRef<ManualBookingAttempt | null>(null)
  const submissionRef = React.useRef(false)
  const [slotsFromIso, setSlotsFromIso] = React.useState(() => new Date().toISOString())

  React.useEffect(() => {
    if (!error) return
    errorRef.current?.focus()
    errorRef.current?.scrollIntoView({ block: "nearest" })
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
    let active = true
    void getManualBookingToolAvailability(client)
      .then((availability) => {
        if (active) setPermissionState(availability.canCreate ? "allowed" : "denied")
      })
      .catch(() => {
        if (active) setPermissionState("error")
      })
    return () => {
      active = false
    }
  }, [client])

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

  React.useEffect(() => {
    setRooms(emptyOptionUnitsStepperValue)
    setRoomUnits([])
    setPayloadMismatchUnitIds([])
    if (!slotId || !product.optionId) return
    const departure =
      allOpenSlots.find((slot) => slot.id === slotId) ??
      (defaultSlot?.id === slotId ? defaultSlot : null)
    if (departure?.optionId && departure.optionId !== product.optionId) {
      if (defaultSlotId && departure.id === defaultSlotId) {
        setProduct((prev) => ({ ...prev, optionId: departure.optionId }))
        return
      }
      setSlotId(null)
    }
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
  const sourcedQuote = useBookingQuote({
    surface: "admin",
    baseUrl,
    fetcher,
    draft: sourcedQuoteDraft,
    scope: { audience: "staff", currency: product.sellCurrency },
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
    () => resolveSourcedProductOptions(currentSourcedQuoteData?.shape, productContent),
    [currentSourcedQuoteData?.shape, productContent],
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
    () => (currentSourcedQuoteData?.shape?.addons?.catalog ?? []) as CatalogBookingExtraOption[],
    [currentSourcedQuoteData?.shape?.addons?.catalog],
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
      return (currentSourcedQuoteData?.shape?.paxBands ?? []).map((band) => ({
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
    currentSourcedQuoteData?.shape?.paxBands,
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
      }),
    [billing.billTo, contact],
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
  const ownedQuote = useBookingQuote({
    surface: "admin",
    baseUrl,
    fetcher,
    draft: quoteDraft,
    scope: { audience: "staff", currency: productRecord?.sellCurrency ?? undefined },
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
  const hasPromotionCode = Boolean(promotionCode.trim())
  const promotionReady =
    !hasPromotionCode ||
    (!quote.isSettling &&
      !quote.error &&
      quote.data?.available !== false &&
      Boolean(quote.data?.pricing))
  const sourcedQuoteReady =
    !isSourcedProduct ||
    (!quote.isSettling &&
      !quote.error &&
      quote.data?.available !== false &&
      Boolean(quote.data?.pricing))
  const promoFeedback = promotionCode.trim()
    ? quote.isSettling
      ? copy.promotion.checking
      : quote.error
        ? copy.promotion.unavailable
        : quote.data?.available === false
          ? copy.promotion.invalid
          : quote.data?.pricing
            ? formatMessage(copy.promotion.valid, {
                amount: formatManualBookingAmount(
                  quote.data.pricing.total,
                  quote.data.pricing.currency,
                  formatCurrency,
                ),
              })
            : copy.promotion.unavailable
    : null

  const handleSubmit = async () => {
    setError(null)
    setPayloadMismatchUnitIds([])
    if (quote.isSettling) {
      setError(copy.validation.pricingPending)
      return
    }
    if (!sourcedQuoteReady) {
      setError(copy.validation.pricingUnavailable)
      return
    }
    if (hasPromotionCode && !promotionReady) {
      setError(
        quote.data?.available === false ? copy.promotion.invalid : copy.promotion.unavailable,
      )
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
      messages: copy,
    })
    if (validationError) {
      setError(validationError)
      return
    }
    if (sharedRoom.enabled && sharedRoom.mode === "join" && !sharedRoom.groupId) {
      setError(copy.validation.sharedRoomGroup)
      return
    }
    const overCapacity = getOverCapacityInventoryAssignments(
      bookingUnits,
      displayDraft.quantities,
      displayDraft.travelers,
    )[0]
    if (overCapacity) {
      setError(
        formatMessage(messages.bookingCreateDialog.validation.roomCapacityExceeded, {
          room: overCapacity.unitName,
          assigned: overCapacity.assignedTravelers,
          capacity: overCapacity.capacity,
        }),
      )
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

    const billTo = billing.billTo ?? "person"
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
    const bookingNumber = attemptRef.current?.bookingNumber ?? null
    const selectedSharedRoomUnitId = getSelectedSharedRoomUnitId(rooms.quantities)
    const groupMembership: BookingCreateGroupMembershipInput | undefined = sharedRoom.enabled
      ? sharedRoom.mode === "create"
        ? {
            action: "create",
            kind: "shared_room",
            label:
              sharedRoom.groupLabel?.trim() ||
              `${messages.bookingCreateDialog.labels.sharedRoomGeneratedLabelPrefix} - ${
                bookingNumber ?? "pending"
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
    })
    const initialStatus = hasAnyPaidPayment(paymentSchedule)
      ? ("confirmed" as const)
      : ("awaiting_payment" as const)
    const booking = {
      productId: product.productId,
      optionId: selectedSlot?.optionId ?? product.optionId,
      slotId,
      personId: billTo === "person" ? billing.personId : null,
      organizationId: billTo === "organization" ? billing.organizationId : null,
      internalNotes: notes.trim() || null,
      catalogSellAmountCents: resolvedPricing.catalogAmountCents,
      confirmedSellAmountCents: resolvedPricing.confirmedAmountCents,
      sellAmountCentsOverride:
        pricing?.isManualOverride &&
        resolvedPricing.confirmedAmountCents !== resolvedPricing.catalogAmountCents
          ? resolvedPricing.confirmedAmountCents
          : null,
      priceOverrideReason: resolvedPricing.priceOverrideReason,
      itemLines: itemLines.length > 0 ? itemLines : undefined,
      extraLines: resolvedExtraLines.length > 0 ? resolvedExtraLines : undefined,
      travelers: travelerRows.length > 0 ? travelerRows : undefined,
      paymentSchedules: paymentRows.length > 0 ? paymentRows : undefined,
      travelCreditRedemption,
      groupMembership,
      documentGeneration: generateProforma
        ? { contractDocument: false, invoiceDocument: true, invoiceType: "proforma" as const }
        : generateInvoiceAndContract
          ? { contractDocument: true, invoiceDocument: true, invoiceType: "invoice" as const }
          : { contractDocument: false, invoiceDocument: false },
      initialStatus,
      suppressNotifications: initialStatus === "confirmed" && !notifyTraveler ? true : undefined,
      allowDuplicate: false,
      ...contactPayload,
    } satisfies Record<string, unknown>
    const fingerprint = JSON.stringify(booking)
    if (!attemptRef.current || attemptRef.current.fingerprint !== fingerprint) {
      attemptRef.current = {
        fingerprint,
        bookingNumber: null,
        idempotencyKey: createIdempotencyKey(),
      }
    }

    setSubmitting(true)
    try {
      const attempt = attemptRef.current
      if (!attempt.bookingNumber) {
        attempt.bookingNumber = await allocateManualBookingNumber(client)
      }
      if (groupMembership?.action === "create") {
        booking.groupMembership = {
          ...groupMembership,
          label:
            sharedRoom.groupLabel?.trim() ||
            `${messages.bookingCreateDialog.labels.sharedRoomGeneratedLabelPrefix} - ${attempt.bookingNumber}`,
        }
      }
      const result = await createManualBookingThroughTool(client, {
        booking: { ...booking, bookingNumber: attempt.bookingNumber },
        idempotencyKey: attempt.idempotencyKey,
      })
      await queryClient.invalidateQueries({ queryKey: availabilityQueryKeys.slots() })
      attemptRef.current = null
      onCreated(result.bookingId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.validation.create)
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
                <div className="flex items-center gap-2 text-sm">
                  <Checkbox
                    id="manual-booking-generate-invoice-and-contract"
                    checked={generateInvoiceAndContract}
                    onCheckedChange={(value) => setGenerateInvoiceAndContract(value === true)}
                  />
                  <Label
                    htmlFor="manual-booking-generate-invoice-and-contract"
                    className="cursor-pointer"
                  >
                    {messages.bookingCreateDialog.labels.generateInvoiceAndContract}
                  </Label>
                </div>
                {hasAnyPaidPayment(paymentSchedule) ? (
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
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {permissionState === "denied" ? (
          <p
            role="alert"
            className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {copy.permissions.denied}
          </p>
        ) : null}
        {permissionState === "error" ? (
          <p
            role="alert"
            className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {copy.permissions.error}
          </p>
        ) : null}
        {error ? (
          <p
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex items-center justify-end gap-2 border-t px-1 pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
            {messages.common.cancel}
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={
              submitting ||
              permissionState !== "allowed" ||
              !product.productId ||
              !hasBookingTiming ||
              !hasSelectedUnits ||
              quote.isSettling ||
              !sourcedQuoteReady ||
              !promotionReady
            }
          >
            {submitting ? (
              <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            ) : null}
            {permissionState === "checking"
              ? copy.permissions.checking
              : hasAnyPaidPayment(paymentSchedule)
                ? messages.bookingCreateDialog.actions.createConfirmedBooking
                : messages.bookingCreateDialog.actions.createAwaitingPaymentBooking}
          </Button>
        </div>
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
                    quote.error || quote.data?.available === false ? "text-destructive" : undefined
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
              amount: messages.bookingCreateDialog.labels.paymentAmount,
              firstInstallment: messages.bookingCreateDialog.labels.paymentFirstInstallment,
              secondInstallment: messages.bookingCreateDialog.labels.paymentSecondInstallment,
              preset5050: messages.bookingCreateDialog.labels.paymentPreset5050,
              unpaidHint: messages.bookingCreateDialog.labels.paymentUnpaidHint,
              totalDue: messages.bookingCreateDialog.labels.paymentTotalDue,
              scheduledTotal: messages.bookingCreateDialog.labels.paymentScheduledTotal,
              remaining: messages.bookingCreateDialog.labels.paymentRemaining,
              alreadyPaid: messages.bookingCreateDialog.labels.paymentAlreadyPaid,
              paymentDate: messages.bookingCreateDialog.labels.paymentDate,
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
  shape: BookingDraftShapeV1 | undefined,
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

function createIdempotencyKey(): string {
  const id =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `manual-booking:${id}`
}
