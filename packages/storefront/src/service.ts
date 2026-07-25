// agent-quality: file-size exception -- owner: storefront; existing service module stays co-located until a dedicated split preserves behavior and tests.

import type { EventBus } from "@voyant-travel/core"
import type { StorefrontIntakeContext } from "@voyant-travel/relationships-contracts/storefront-intake"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  getStorefrontDeparture,
  getStorefrontDepartureItinerary,
  getStorefrontProductAvailabilitySummary,
  getStorefrontProductExtensions,
  listStorefrontProductDepartures,
  previewStorefrontDeparturePrice,
} from "./service-departures.js"
import {
  createStorefrontLeadSignal,
  type StorefrontCustomerSignalCreatedEvent,
  type StorefrontIntakeGuard,
  type StorefrontIntakeOptions,
  type StorefrontIntakePersistence,
  type StorefrontIntakePersistenceResolver,
  type StorefrontIntakePerson,
  type StorefrontIntakeSignal,
  subscribeStorefrontNewsletter,
} from "./service-intake.js"
import { evaluateStorefrontTransportEligibility } from "./service-transport-eligibility.js"
import {
  type StorefrontDepartureListQuery,
  type StorefrontDeparturePricePreviewInput,
  type StorefrontFormField,
  type StorefrontFormFieldInput,
  type StorefrontLeadIntakeInput,
  type StorefrontNewsletterSubscribeInput,
  type StorefrontOfferApplyInput,
  type StorefrontOfferMutationResult,
  type StorefrontOfferRedeemInput,
  type StorefrontPaymentMethod,
  type StorefrontPaymentMethodCode,
  type StorefrontPaymentMethodInput,
  type StorefrontProductAvailabilitySummaryQuery,
  type StorefrontPromotionalOffer,
  type StorefrontSettings,
  type StorefrontSettingsInput,
  type StorefrontSettingsPatchInput,
  storefrontSettingsInputSchema,
  storefrontSettingsSchema,
} from "./validation.js"
import type {
  StorefrontTransportEligibilityInput,
  StorefrontTransportEligibilityResult,
  StorefrontTransportEligibilityRuleInput,
} from "./validation-transport-eligibility.js"

export interface StorefrontServiceOptions {
  settings?: StorefrontSettingsInput
  resolveSettings?: (
    context: StorefrontRequestContext,
  ) => Promise<StorefrontSettingsInput> | StorefrontSettingsInput
  updateSettings?: (
    input: StorefrontSettings,
    context: StorefrontRequestContext,
  ) =>
    | Promise<StorefrontSettingsInput | StorefrontSettings>
    | StorefrontSettingsInput
    | StorefrontSettings
  offers?: StorefrontOfferResolvers
  resolveOffers?: (
    context: StorefrontRequestContext,
  ) =>
    | Promise<StorefrontOfferResolvers | null | undefined>
    | StorefrontOfferResolvers
    | null
    | undefined
  transportEligibilityRules?: StorefrontTransportEligibilityRuleInput[]
  resolveTransportEligibilityRules?: (
    input: {
      departureId: string
      productId?: string | null
      travelStartsOn?: string | null
      travelEndsOn?: string | null
    } & StorefrontRequestContext,
  ) =>
    | Promise<StorefrontTransportEligibilityRuleInput[]>
    | StorefrontTransportEligibilityRuleInput[]
  intake?: StorefrontIntakeOptions
}

export interface StorefrontRequestContext extends StorefrontIntakeContext {
  db?: PostgresJsDatabase
  eventBus?: EventBus
  env?: unknown
  context?: unknown
}

export interface StorefrontOfferResolvers {
  listApplicableOffers?: (
    input: {
      productId: string
      departureId?: string
      locale?: string
    } & StorefrontRequestContext,
  ) => Promise<StorefrontPromotionalOffer[]> | StorefrontPromotionalOffer[]
  getOfferBySlug?: (
    input: {
      slug: string
      locale?: string
    } & StorefrontRequestContext,
  ) => Promise<StorefrontPromotionalOffer | null> | StorefrontPromotionalOffer | null
  applyOffer?: (
    input: {
      slug: string
      body: StorefrontOfferApplyInput
    } & StorefrontRequestContext,
  ) => Promise<StorefrontOfferMutationResult> | StorefrontOfferMutationResult
  redeemOffer?: (
    input: {
      body: StorefrontOfferRedeemInput
    } & StorefrontRequestContext,
  ) => Promise<StorefrontOfferMutationResult> | StorefrontOfferMutationResult
}

const defaultPaymentLabels: Record<StorefrontPaymentMethodCode, string> = {
  card: "Card",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  travel_credit: "Travel credit",
  invoice: "Invoice",
}

function normalizeField(field: StorefrontFormFieldInput): StorefrontFormField {
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    placeholder: field.placeholder ?? null,
    description: field.description ?? null,
    autocomplete: field.autocomplete ?? null,
    options: field.options,
  }
}

function normalizePaymentMethod(method: StorefrontPaymentMethodInput): StorefrontPaymentMethod {
  return {
    code: method.code,
    label: method.label ?? defaultPaymentLabels[method.code],
    description: method.description ?? null,
    enabled: method.enabled,
  }
}

function normalizePaymentSchedule(
  schedule: NonNullable<NonNullable<StorefrontSettingsInput["payment"]>["defaultSchedule"]> | null,
) {
  if (!schedule) return null

  return {
    depositPercent: schedule.depositPercent ?? null,
    balanceDueDaysBeforeDeparture: schedule.balanceDueDaysBeforeDeparture ?? null,
  }
}

function scheduleEntriesFromDefaultSchedule(
  schedule: ReturnType<typeof normalizePaymentSchedule>,
): StorefrontSettings["payment"]["schedule"] {
  if (!schedule?.depositPercent || schedule.depositPercent >= 100) {
    return []
  }

  const remainderPercent = 100 - schedule.depositPercent
  return [
    {
      percent: schedule.depositPercent,
      dueInDays: 0,
      dueCondition: "after_booking",
    },
    {
      percent: remainderPercent,
      dueInDays: schedule.balanceDueDaysBeforeDeparture ?? 0,
      dueCondition: "before_departure",
    },
  ]
}

function normalizePaymentScheduleEntries(
  schedule: NonNullable<NonNullable<StorefrontSettingsInput["payment"]>["schedule"]> | undefined,
  defaultSchedule: ReturnType<typeof normalizePaymentSchedule>,
): StorefrontSettings["payment"]["schedule"] {
  if (schedule) return schedule
  return scheduleEntriesFromDefaultSchedule(defaultSchedule)
}

function normalizePaymentStructure(
  structure: NonNullable<StorefrontSettingsInput["payment"]>["structure"] | undefined,
  schedule: StorefrontSettings["payment"]["schedule"],
  defaultSchedule: ReturnType<typeof normalizePaymentSchedule>,
): StorefrontSettings["payment"]["structure"] {
  if (structure) return structure
  if (schedule.length > 0) return "split"
  return defaultSchedule?.depositPercent && defaultSchedule.depositPercent > 0 ? "split" : "full"
}

function normalizeBankTransferAccount(
  account: NonNullable<NonNullable<StorefrontSettingsInput["payment"]>["bankTransfer"]>["account"],
  bankTransfer: NonNullable<NonNullable<StorefrontSettingsInput["payment"]>["bankTransfer"]>,
) {
  const resolved =
    account ??
    (bankTransfer.iban && bankTransfer.accountHolder && bankTransfer.bankName
      ? {
          provider: null,
          currency: null,
          iban: bankTransfer.iban,
          beneficiary: bankTransfer.accountHolder,
          bank: bankTransfer.bankName,
        }
      : null)

  if (!resolved) return null

  return {
    provider: resolved.provider ?? null,
    currency: resolved.currency ?? null,
    iban: resolved.iban,
    beneficiary: resolved.beneficiary,
    bank: resolved.bank,
  }
}

function normalizeBankTransfer(
  bankTransfer: NonNullable<NonNullable<StorefrontSettingsInput["payment"]>["bankTransfer"]> | null,
) {
  if (!bankTransfer) return null

  return {
    dueDays: bankTransfer.dueDays ?? null,
    account: normalizeBankTransferAccount(bankTransfer.account, bankTransfer),
    accountHolder: bankTransfer.accountHolder ?? null,
    bankName: bankTransfer.bankName ?? null,
    iban: bankTransfer.iban ?? null,
    bic: bankTransfer.bic ?? null,
    paymentReference: bankTransfer.paymentReference ?? null,
    instructions: bankTransfer.instructions ?? null,
  }
}

function mergePaymentSchedule(
  current: StorefrontSettings["payment"]["defaultSchedule"],
  patch: NonNullable<
    NonNullable<StorefrontSettingsPatchInput["payment"]>["defaultSchedule"]
  > | null,
) {
  if (patch === null) return null

  return {
    ...(current ?? {
      depositPercent: null,
      balanceDueDaysBeforeDeparture: null,
    }),
    ...patch,
  }
}

function mergeBankTransfer(
  current: StorefrontSettings["payment"]["bankTransfer"],
  patch: NonNullable<NonNullable<StorefrontSettingsPatchInput["payment"]>["bankTransfer"]> | null,
) {
  if (patch === null) return null

  const merged = {
    ...(current ?? {
      dueDays: null,
      account: null,
      accountHolder: null,
      bankName: null,
      iban: null,
      bic: null,
      paymentReference: null,
      instructions: null,
    }),
    ...patch,
  }
  const shouldRefreshAccountFromLegacyFields =
    patch.account === undefined &&
    ("accountHolder" in patch || "bankName" in patch || "iban" in patch)

  return {
    ...merged,
    account: normalizeBankTransferAccount(
      shouldRefreshAccountFromLegacyFields ? null : merged.account,
      merged,
    ),
  }
}

export function resolveStorefrontSettings(input?: StorefrontSettingsInput): StorefrontSettings {
  const parsed = storefrontSettingsInputSchema.parse(input ?? {})
  const defaultSchedule = normalizePaymentSchedule(parsed.payment?.defaultSchedule ?? null)
  const schedule = normalizePaymentScheduleEntries(parsed.payment?.schedule, defaultSchedule)

  return storefrontSettingsSchema.parse({
    support: {
      email: parsed.support?.email ?? null,
      phone: parsed.support?.phone ?? null,
      links: parsed.support?.links ?? [],
    },
    legal: {
      termsUrl: parsed.legal?.termsUrl ?? null,
      privacyUrl: parsed.legal?.privacyUrl ?? null,
      cancellationUrl: parsed.legal?.cancellationUrl ?? null,
      defaultContractTemplateId: parsed.legal?.defaultContractTemplateId ?? null,
    },
    localization: {
      defaultLocale: parsed.localization?.defaultLocale ?? null,
      currencyDisplay: parsed.localization?.currencyDisplay ?? "code",
    },
    forms: {
      billing: {
        fields: (parsed.forms?.billing?.fields ?? []).map(normalizeField),
      },
      travelers: {
        fields: (parsed.forms?.travelers?.fields ?? []).map(normalizeField),
      },
    },
    payment: {
      defaultMethod: parsed.payment?.defaultMethod ?? null,
      methods: (parsed.payment?.methods ?? []).map(normalizePaymentMethod),
      structure: normalizePaymentStructure(parsed.payment?.structure, schedule, defaultSchedule),
      schedule,
      defaultSchedule,
      bankTransfer: normalizeBankTransfer(parsed.payment?.bankTransfer ?? null),
    },
  })
}

export function mergeStorefrontSettingsPatch(
  current: StorefrontSettings,
  patch: StorefrontSettingsPatchInput,
): StorefrontSettings {
  return resolveStorefrontSettings({
    support: patch.support ? { ...current.support, ...patch.support } : current.support,
    legal: patch.legal ? { ...current.legal, ...patch.legal } : current.legal,
    localization: patch.localization
      ? { ...current.localization, ...patch.localization }
      : current.localization,
    forms: patch.forms
      ? {
          billing: patch.forms.billing
            ? { ...current.forms.billing, ...patch.forms.billing }
            : current.forms.billing,
          travelers: patch.forms.travelers
            ? { ...current.forms.travelers, ...patch.forms.travelers }
            : current.forms.travelers,
        }
      : current.forms,
    payment: patch.payment
      ? {
          ...current.payment,
          ...patch.payment,
          defaultSchedule:
            patch.payment.defaultSchedule === undefined
              ? current.payment.defaultSchedule
              : mergePaymentSchedule(
                  current.payment.defaultSchedule,
                  patch.payment.defaultSchedule,
                ),
          bankTransfer:
            patch.payment.bankTransfer === undefined
              ? current.payment.bankTransfer
              : mergeBankTransfer(current.payment.bankTransfer, patch.payment.bankTransfer),
        }
      : current.payment,
  })
}

export function createStorefrontService(options?: StorefrontServiceOptions) {
  const settings = resolveStorefrontSettings(options?.settings)

  async function resolveSettings(context: StorefrontRequestContext = {}) {
    if (!options?.resolveSettings) {
      return settings
    }

    return resolveStorefrontSettings(await options.resolveSettings(context))
  }

  async function updateSettings(
    patch: StorefrontSettingsPatchInput,
    context: StorefrontRequestContext = {},
  ) {
    if (!options?.updateSettings) {
      return null
    }

    const current = await resolveSettings(context)
    const next = mergeStorefrontSettingsPatch(current, patch)
    return resolveStorefrontSettings(await options.updateSettings(next, context))
  }

  async function resolveOffers(context: StorefrontRequestContext = {}) {
    return (await options?.resolveOffers?.(context)) ?? options?.offers
  }

  async function resolveTransportEligibilityRules(
    input: {
      departureId: string
      productId?: string | null
      travelStartsOn?: string | null
      travelEndsOn?: string | null
    } & StorefrontRequestContext,
  ) {
    return (
      (await options?.resolveTransportEligibilityRules?.(input)) ??
      options?.transportEligibilityRules ??
      []
    )
  }

  async function checkIntakeGuard(
    input:
      | {
          kind: "lead"
          body: StorefrontLeadIntakeInput
          context: StorefrontRequestContext
        }
      | {
          kind: "newsletter"
          body: StorefrontNewsletterSubscribeInput
          context: StorefrontRequestContext
        },
  ) {
    return options?.intake?.guard?.(input)
  }

  return {
    getSettings(): StorefrontSettings {
      return settings
    },
    resolveSettings,
    updateSettings,
    getDeparture(db: PostgresJsDatabase, departureId: string) {
      return getStorefrontDeparture(db, departureId)
    },
    listProductDepartures(
      db: PostgresJsDatabase,
      productId: string,
      query: StorefrontDepartureListQuery,
    ) {
      return listStorefrontProductDepartures(db, productId, query)
    },
    previewDeparturePrice(
      db: PostgresJsDatabase,
      departureId: string,
      input: StorefrontDeparturePricePreviewInput,
      context: StorefrontRequestContext = {},
    ) {
      const offerContext = { ...context, db: context.db ?? db }
      return previewStorefrontDeparturePrice(db, departureId, input, {
        listApplicableOffers: async (offerInput) => {
          const offers = await resolveOffers(offerContext)?.then((resolvers) =>
            resolvers?.listApplicableOffers?.({ ...offerInput, ...offerContext }),
          )
          return offers ?? []
        },
        applyOffer: async (offerInput) =>
          (await resolveOffers(offerContext)?.then((resolvers) =>
            resolvers?.applyOffer?.({ ...offerInput, ...offerContext }),
          )) ?? null,
        redeemOffer: async (offerInput) =>
          (await resolveOffers(offerContext)?.then((resolvers) =>
            resolvers?.redeemOffer?.({ ...offerInput, ...offerContext }),
          )) ?? null,
      })
    },
    getProductExtensions(db: PostgresJsDatabase, productId: string, optionId?: string) {
      return getStorefrontProductExtensions(db, productId, optionId)
    },
    getProductAvailabilitySummary(
      db: PostgresJsDatabase,
      productId: string,
      query: StorefrontProductAvailabilitySummaryQuery,
    ) {
      return getStorefrontProductAvailabilitySummary(db, productId, query)
    },
    getDepartureItinerary(
      db: PostgresJsDatabase,
      input: { departureId: string; productId: string; languageTag?: string | null },
    ) {
      return getStorefrontDepartureItinerary(db, input)
    },
    async checkDepartureTransportEligibility(input: {
      departureId: string
      productId?: string | null
      body: StorefrontTransportEligibilityInput
      context?: StorefrontRequestContext
    }): Promise<StorefrontTransportEligibilityResult> {
      const { context, body, departureId } = input
      const needsDeparture =
        context?.db && (!input.productId || !body.travelStartsOn || !body.travelEndsOn)
      const departure =
        needsDeparture && context?.db ? await getStorefrontDeparture(context.db, departureId) : null
      const productId = input.productId ?? departure?.productId ?? null
      const travelStartsOn =
        body.travelStartsOn ?? departure?.dateLocal ?? departure?.startAt?.slice(0, 10) ?? null
      const travelEndsOn =
        body.travelEndsOn ?? departure?.endAt?.slice(0, 10) ?? departure?.dateLocal ?? null
      const rules = await resolveTransportEligibilityRules({
        ...(context ?? {}),
        departureId,
        productId,
        travelStartsOn,
        travelEndsOn,
      })

      return evaluateStorefrontTransportEligibility({
        departureId,
        productId,
        travelStartsOn,
        travelEndsOn,
        travelers: body.travelers,
        rules,
      })
    },
    async listApplicableOffers(input: {
      productId: string
      departureId?: string
      locale?: string
      context?: StorefrontRequestContext
    }): Promise<StorefrontPromotionalOffer[]> {
      const { context, ...offerInput } = input
      const offers = await resolveOffers(context)?.then((resolvers) =>
        resolvers?.listApplicableOffers?.({ ...offerInput, ...(context ?? {}) }),
      )
      return offers ?? []
    },
    async getOfferBySlug(input: {
      slug: string
      locale?: string
      context?: StorefrontRequestContext
    }): Promise<StorefrontPromotionalOffer | null> {
      const { context, ...offerInput } = input
      return (
        (await resolveOffers(context)?.then((resolvers) =>
          resolvers?.getOfferBySlug?.({ ...offerInput, ...(context ?? {}) }),
        )) ?? null
      )
    },
    async applyOffer(input: {
      slug: string
      body: StorefrontOfferApplyInput
      context?: StorefrontRequestContext
    }): Promise<StorefrontOfferMutationResult | null> {
      const { context, ...offerInput } = input
      return (
        (await resolveOffers(context)?.then((resolvers) =>
          resolvers?.applyOffer?.({ ...offerInput, ...(context ?? {}) }),
        )) ?? null
      )
    },
    async redeemOffer(input: {
      body: StorefrontOfferRedeemInput
      context?: StorefrontRequestContext
    }): Promise<StorefrontOfferMutationResult | null> {
      const { context, ...offerInput } = input
      return (
        (await resolveOffers(context)?.then((resolvers) =>
          resolvers?.redeemOffer?.({ ...offerInput, ...(context ?? {}) }),
        )) ?? null
      )
    },
    checkIntakeGuard,
    createLead(input: { body: StorefrontLeadIntakeInput; context: StorefrontRequestContext }) {
      return createStorefrontLeadSignal({ ...input, intake: options?.intake })
    },
    subscribeNewsletter(input: {
      body: StorefrontNewsletterSubscribeInput
      context: StorefrontRequestContext
    }) {
      return subscribeStorefrontNewsletter({
        ...input,
        intake: options?.intake,
        requestDoubleOptIn: options?.intake?.requestNewsletterDoubleOptIn,
      })
    },
  }
}

export type {
  StorefrontCustomerSignalCreatedEvent,
  StorefrontIntakeGuard,
  StorefrontIntakeOptions,
  StorefrontIntakePersistence,
  StorefrontIntakePersistenceResolver,
  StorefrontIntakePerson,
  StorefrontIntakeSignal,
}
