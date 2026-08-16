// agent-quality: file-size exception -- owner: storefront; existing service module stays co-located until a dedicated split preserves behavior and tests.

import type { EventBus } from "@voyant-travel/core"
import type {
  TransportEligibilityInput,
  TransportEligibilityResult,
  TransportEligibilityRuleInput,
} from "@voyant-travel/flights/transport-eligibility"
import { evaluateTransportEligibility } from "@voyant-travel/flights/transport-eligibility"
import type { PublicApiIntakeContext } from "@voyant-travel/relationships-contracts/public-api-intake"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  getPublicApiDeparture,
  getPublicApiDepartureItinerary,
  getPublicApiProductAvailabilitySummary,
  getPublicApiProductExtensions,
  listPublicApiProductDepartures,
  previewPublicApiDeparturePrice,
} from "./service-departures.js"
import {
  createPublicApiLeadSignal,
  type PublicApiCustomerSignalCreatedEvent,
  type PublicApiIntakeGuard,
  type PublicApiIntakeOptions,
  type PublicApiIntakePersistence,
  type PublicApiIntakePersistenceResolver,
  type PublicApiIntakePerson,
  type PublicApiIntakeSignal,
  subscribePublicApiNewsletter,
} from "./service-intake.js"
import {
  type PublicApiDepartureListQuery,
  type PublicApiDeparturePricePreviewInput,
  type PublicApiFormField,
  type PublicApiFormFieldInput,
  type PublicApiLeadIntakeInput,
  type PublicApiNewsletterSubscribeInput,
  type PublicApiOfferApplyInput,
  type PublicApiOfferMutationResult,
  type PublicApiOfferRedeemInput,
  type PublicApiPaymentMethod,
  type PublicApiPaymentMethodCode,
  type PublicApiPaymentMethodInput,
  type PublicApiProductAvailabilitySummaryQuery,
  type PublicApiPromotionalOffer,
  type PublicApiSettings,
  type PublicApiSettingsInput,
  type PublicApiSettingsPatchInput,
  publicApiSettingsInputSchema,
  publicApiSettingsSchema,
} from "./validation.js"

export interface PublicApiServiceOptions {
  settings?: PublicApiSettingsInput
  resolveSettings?: (
    context: PublicApiRequestContext,
  ) => Promise<PublicApiSettingsInput> | PublicApiSettingsInput
  updateSettings?: (
    input: PublicApiSettings,
    context: PublicApiRequestContext,
  ) =>
    | Promise<PublicApiSettingsInput | PublicApiSettings>
    | PublicApiSettingsInput
    | PublicApiSettings
  offers?: PublicApiOfferResolvers
  resolveOffers?: (
    context: PublicApiRequestContext,
  ) =>
    | Promise<PublicApiOfferResolvers | null | undefined>
    | PublicApiOfferResolvers
    | null
    | undefined
  transportEligibilityRules?: TransportEligibilityRuleInput[]
  resolveTransportEligibilityRules?: (
    input: {
      departureId: string
      productId?: string | null
      travelStartsOn?: string | null
      travelEndsOn?: string | null
    } & PublicApiRequestContext,
  ) => Promise<TransportEligibilityRuleInput[]> | TransportEligibilityRuleInput[]
  intake?: PublicApiIntakeOptions
  publication?: PublicApiPublicationGuard
}

export interface PublicApiRequestContext extends PublicApiIntakeContext {
  db?: PostgresJsDatabase
  eventBus?: EventBus
  env?: unknown
  context?: unknown
  /** Server-derived storefront identity; never sourced from public params. */
  /** Server-derived sales channel bound to the storefront identity. */
  channelId?: string | null
  channelStatus?: string | null
}

export interface PublicApiPublicationGuard {
  isProductPublished(input: {
    productId: string
    context: PublicApiRequestContext
  }): Promise<boolean> | boolean
}

export interface PublicApiOfferResolvers {
  listApplicableOffers?: (
    input: {
      productId: string
      departureId?: string
      locale?: string
    } & PublicApiRequestContext,
  ) => Promise<PublicApiPromotionalOffer[]> | PublicApiPromotionalOffer[]
  getOfferBySlug?: (
    input: {
      slug: string
      locale?: string
    } & PublicApiRequestContext,
  ) => Promise<PublicApiPromotionalOffer | null> | PublicApiPromotionalOffer | null
  applyOffer?: (
    input: {
      slug: string
      body: PublicApiOfferApplyInput
    } & PublicApiRequestContext,
  ) => Promise<PublicApiOfferMutationResult> | PublicApiOfferMutationResult
  redeemOffer?: (
    input: {
      body: PublicApiOfferRedeemInput
    } & PublicApiRequestContext,
  ) => Promise<PublicApiOfferMutationResult> | PublicApiOfferMutationResult
}

const defaultPaymentLabels: Record<PublicApiPaymentMethodCode, string> = {
  card: "Card",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  travel_credit: "Travel credit",
  invoice: "Invoice",
}

function normalizeField(field: PublicApiFormFieldInput): PublicApiFormField {
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

function normalizePaymentMethod(method: PublicApiPaymentMethodInput): PublicApiPaymentMethod {
  return {
    code: method.code,
    label: method.label ?? defaultPaymentLabels[method.code],
    description: method.description ?? null,
    enabled: method.enabled,
  }
}

function normalizePaymentSchedule(
  schedule: NonNullable<NonNullable<PublicApiSettingsInput["payment"]>["defaultSchedule"]> | null,
) {
  if (!schedule) return null

  return {
    depositPercent: schedule.depositPercent ?? null,
    balanceDueDaysBeforeDeparture: schedule.balanceDueDaysBeforeDeparture ?? null,
  }
}

function scheduleEntriesFromDefaultSchedule(
  schedule: ReturnType<typeof normalizePaymentSchedule>,
): PublicApiSettings["payment"]["schedule"] {
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
  schedule: NonNullable<NonNullable<PublicApiSettingsInput["payment"]>["schedule"]> | undefined,
  defaultSchedule: ReturnType<typeof normalizePaymentSchedule>,
): PublicApiSettings["payment"]["schedule"] {
  if (schedule) return schedule
  return scheduleEntriesFromDefaultSchedule(defaultSchedule)
}

function normalizePaymentStructure(
  structure: NonNullable<PublicApiSettingsInput["payment"]>["structure"] | undefined,
  schedule: PublicApiSettings["payment"]["schedule"],
  defaultSchedule: ReturnType<typeof normalizePaymentSchedule>,
): PublicApiSettings["payment"]["structure"] {
  if (structure) return structure
  if (schedule.length > 0) return "split"
  return defaultSchedule?.depositPercent && defaultSchedule.depositPercent > 0 ? "split" : "full"
}

function normalizeBankTransferAccount(
  account: NonNullable<NonNullable<PublicApiSettingsInput["payment"]>["bankTransfer"]>["account"],
  bankTransfer: NonNullable<NonNullable<PublicApiSettingsInput["payment"]>["bankTransfer"]>,
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
  bankTransfer: NonNullable<NonNullable<PublicApiSettingsInput["payment"]>["bankTransfer"]> | null,
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
  current: PublicApiSettings["payment"]["defaultSchedule"],
  patch: NonNullable<NonNullable<PublicApiSettingsPatchInput["payment"]>["defaultSchedule"]> | null,
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
  current: PublicApiSettings["payment"]["bankTransfer"],
  patch: NonNullable<NonNullable<PublicApiSettingsPatchInput["payment"]>["bankTransfer"]> | null,
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

export function resolvePublicApiSettings(input?: PublicApiSettingsInput): PublicApiSettings {
  const parsed = publicApiSettingsInputSchema.parse(input ?? {})
  const defaultSchedule = normalizePaymentSchedule(parsed.payment?.defaultSchedule ?? null)
  const schedule = normalizePaymentScheduleEntries(parsed.payment?.schedule, defaultSchedule)

  return publicApiSettingsSchema.parse({
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
      // Fail closed. An operator who has not stated that their terms carry the
      // mandate has not granted one, and they are the merchant of record who
      // would carry the liability for assuming otherwise.
      storedInstrumentMandate: parsed.legal?.storedInstrumentMandate ?? null,
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

export function mergePublicApiSettingsPatch(
  current: PublicApiSettings,
  patch: PublicApiSettingsPatchInput,
): PublicApiSettings {
  return resolvePublicApiSettings({
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

export function createPublicApiService(options?: PublicApiServiceOptions) {
  const settings = resolvePublicApiSettings(options?.settings)

  async function resolveSettings(context: PublicApiRequestContext = {}) {
    if (!options?.resolveSettings) {
      return settings
    }

    return resolvePublicApiSettings(await options.resolveSettings(context))
  }

  async function updateSettings(
    patch: PublicApiSettingsPatchInput,
    context: PublicApiRequestContext = {},
  ) {
    if (!options?.updateSettings) {
      return null
    }

    const current = await resolveSettings(context)
    const next = mergePublicApiSettingsPatch(current, patch)
    return resolvePublicApiSettings(await options.updateSettings(next, context))
  }

  async function resolveOffers(context: PublicApiRequestContext = {}) {
    return (await options?.resolveOffers?.(context)) ?? options?.offers
  }

  async function resolveTransportEligibilityRules(
    input: {
      departureId: string
      productId?: string | null
      travelStartsOn?: string | null
      travelEndsOn?: string | null
    } & PublicApiRequestContext,
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
          body: PublicApiLeadIntakeInput
          context: PublicApiRequestContext
        }
      | {
          kind: "newsletter"
          body: PublicApiNewsletterSubscribeInput
          context: PublicApiRequestContext
        },
  ) {
    return options?.intake?.guard?.(input)
  }

  return {
    getSettings(): PublicApiSettings {
      return settings
    },
    resolveSettings,
    updateSettings,
    getDeparture(db: PostgresJsDatabase, departureId: string) {
      return getPublicApiDeparture(db, departureId)
    },
    listProductDepartures(
      db: PostgresJsDatabase,
      productId: string,
      query: PublicApiDepartureListQuery,
    ) {
      return listPublicApiProductDepartures(db, productId, query)
    },
    previewDeparturePrice(
      db: PostgresJsDatabase,
      departureId: string,
      input: PublicApiDeparturePricePreviewInput,
      context: PublicApiRequestContext = {},
    ) {
      const offerContext = { ...context, db: context.db ?? db }
      return previewPublicApiDeparturePrice(db, departureId, input, {
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
      return getPublicApiProductExtensions(db, productId, optionId)
    },
    getProductAvailabilitySummary(
      db: PostgresJsDatabase,
      productId: string,
      query: PublicApiProductAvailabilitySummaryQuery,
    ) {
      return getPublicApiProductAvailabilitySummary(db, productId, query)
    },
    getDepartureItinerary(
      db: PostgresJsDatabase,
      input: { departureId: string; productId: string; languageTag?: string | null },
    ) {
      return getPublicApiDepartureItinerary(db, input)
    },
    async checkDepartureTransportEligibility(input: {
      departureId: string
      productId?: string | null
      body: TransportEligibilityInput
      context?: PublicApiRequestContext
    }): Promise<TransportEligibilityResult> {
      const { context, body, departureId } = input
      const needsDeparture =
        context?.db && (!input.productId || !body.travelStartsOn || !body.travelEndsOn)
      const departure =
        needsDeparture && context?.db ? await getPublicApiDeparture(context.db, departureId) : null
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

      return evaluateTransportEligibility({
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
      context?: PublicApiRequestContext
    }): Promise<PublicApiPromotionalOffer[]> {
      const { context, ...offerInput } = input
      const offers = await resolveOffers(context)?.then((resolvers) =>
        resolvers?.listApplicableOffers?.({ ...offerInput, ...(context ?? {}) }),
      )
      return offers ?? []
    },
    async getOfferBySlug(input: {
      slug: string
      locale?: string
      context?: PublicApiRequestContext
    }): Promise<PublicApiPromotionalOffer | null> {
      const { context, ...offerInput } = input
      return (
        (await resolveOffers(context)?.then((resolvers) =>
          resolvers?.getOfferBySlug?.({ ...offerInput, ...(context ?? {}) }),
        )) ?? null
      )
    },
    async applyOffer(input: {
      slug: string
      body: PublicApiOfferApplyInput
      context?: PublicApiRequestContext
    }): Promise<PublicApiOfferMutationResult | null> {
      const { context, ...offerInput } = input
      return (
        (await resolveOffers(context)?.then((resolvers) =>
          resolvers?.applyOffer?.({ ...offerInput, ...(context ?? {}) }),
        )) ?? null
      )
    },
    async redeemOffer(input: {
      body: PublicApiOfferRedeemInput
      context?: PublicApiRequestContext
    }): Promise<PublicApiOfferMutationResult | null> {
      const { context, ...offerInput } = input
      return (
        (await resolveOffers(context)?.then((resolvers) =>
          resolvers?.redeemOffer?.({ ...offerInput, ...(context ?? {}) }),
        )) ?? null
      )
    },
    checkIntakeGuard,
    createLead(input: { body: PublicApiLeadIntakeInput; context: PublicApiRequestContext }) {
      return createPublicApiLeadSignal({ ...input, intake: options?.intake })
    },
    subscribeNewsletter(input: {
      body: PublicApiNewsletterSubscribeInput
      context: PublicApiRequestContext
    }) {
      return subscribePublicApiNewsletter({
        ...input,
        intake: options?.intake,
        requestDoubleOptIn: options?.intake?.requestNewsletterDoubleOptIn,
      })
    },
  }
}

export type {
  PublicApiCustomerSignalCreatedEvent,
  PublicApiIntakeGuard,
  PublicApiIntakeOptions,
  PublicApiIntakePersistence,
  PublicApiIntakePersistenceResolver,
  PublicApiIntakePerson,
  PublicApiIntakeSignal,
}
