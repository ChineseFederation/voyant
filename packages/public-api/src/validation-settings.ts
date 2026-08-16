import { z } from "zod"

export const languageTagSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)

const httpUrlSchema = z.url().refine(
  (value) => {
    try {
      const protocol = new URL(value).protocol
      return protocol === "http:" || protocol === "https:"
    } catch {
      return false
    }
  },
  { message: "URL must use http or https" },
)
const urlOrNullSchema = httpUrlSchema.nullable()
const textOrNullSchema = z.string().trim().min(1).nullable()

export const publicApiPaymentMethodCodeSchema = z.enum([
  "card",
  "bank_transfer",
  "cash",
  "travel_credit",
  "invoice",
])

export const publicApiFormFieldTypeSchema = z.enum([
  "text",
  "email",
  "tel",
  "textarea",
  "select",
  "checkbox",
  "date",
  "country",
])

export const publicApiFormFieldOptionSchema = z.object({
  value: z.string().trim().min(1),
  label: z.string().trim().min(1),
})

export const publicApiFormFieldInputSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  type: publicApiFormFieldTypeSchema.default("text"),
  required: z.boolean().default(false),
  placeholder: z.string().trim().min(1).optional().nullable(),
  description: z.string().trim().min(1).optional().nullable(),
  autocomplete: z.string().trim().min(1).optional().nullable(),
  options: z.array(publicApiFormFieldOptionSchema).default([]),
})

export const publicApiFormFieldSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  type: publicApiFormFieldTypeSchema,
  required: z.boolean(),
  placeholder: z.string().trim().min(1).nullable(),
  description: z.string().trim().min(1).nullable(),
  autocomplete: z.string().trim().min(1).nullable(),
  options: z.array(publicApiFormFieldOptionSchema),
})

export const publicApiPaymentMethodInputSchema = z.object({
  code: publicApiPaymentMethodCodeSchema,
  label: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional().nullable(),
  enabled: z.boolean().default(true),
})

export const publicApiPaymentMethodSchema = z.object({
  code: publicApiPaymentMethodCodeSchema,
  label: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable(),
  enabled: z.boolean(),
})

export const publicApiPaymentStructureSchema = z.enum(["full", "split"])

export const publicApiPaymentDueConditionSchema = z.enum(["after_booking", "before_departure"])

export const publicApiPaymentScheduleEntryInputSchema = z.object({
  percent: z.number().min(0).max(100),
  dueInDays: z.number().int().min(0),
  dueCondition: publicApiPaymentDueConditionSchema,
})

export const publicApiPaymentScheduleEntrySchema = publicApiPaymentScheduleEntryInputSchema

export const publicApiSupportLinkInputSchema = z.object({
  label: z.string().trim().min(1),
  url: httpUrlSchema,
})

export const publicApiSupportLinkSchema = publicApiSupportLinkInputSchema

export const publicApiBankTransferAccountInputSchema = z.object({
  provider: z.string().trim().min(1).optional().nullable(),
  currency: z.string().trim().min(1).optional().nullable(),
  iban: z.string().trim().min(1),
  beneficiary: z.string().trim().min(1),
  bank: z.string().trim().min(1),
})

export const publicApiBankTransferAccountSchema = z.object({
  provider: textOrNullSchema,
  currency: textOrNullSchema,
  iban: z.string().trim().min(1),
  beneficiary: z.string().trim().min(1),
  bank: z.string().trim().min(1),
})

export const publicApiBankTransferInputSchema = z.object({
  dueDays: z.number().int().min(0).optional().nullable(),
  account: publicApiBankTransferAccountInputSchema.optional().nullable(),
  accountHolder: z.string().trim().min(1).optional().nullable(),
  bankName: z.string().trim().min(1).optional().nullable(),
  iban: z.string().trim().min(1).optional().nullable(),
  bic: z.string().trim().min(1).optional().nullable(),
  paymentReference: z.string().trim().min(1).optional().nullable(),
  instructions: z.string().trim().min(1).optional().nullable(),
})

export const publicApiBankTransferSchema = z.object({
  dueDays: z.number().int().min(0).nullable(),
  account: publicApiBankTransferAccountSchema.nullable(),
  accountHolder: textOrNullSchema,
  bankName: textOrNullSchema,
  iban: textOrNullSchema,
  bic: textOrNullSchema,
  paymentReference: textOrNullSchema,
  instructions: textOrNullSchema,
})

export const publicApiPaymentScheduleInputSchema = z.object({
  depositPercent: z.number().min(0).max(100).optional().nullable(),
  balanceDueDaysBeforeDeparture: z.number().int().min(0).optional().nullable(),
})

export const publicApiPaymentScheduleSchema = z.object({
  depositPercent: z.number().min(0).max(100).nullable(),
  balanceDueDaysBeforeDeparture: z.number().int().min(0).nullable(),
})

export const publicApiCurrencyDisplaySchema = z.enum(["code", "symbol", "name"])

export const publicApiStoredInstrumentMandateInputSchema = z.object({
  /** The operator's terms authorize charging a stored instrument off-session. */
  enabled: z.boolean(),
  /** Bumped when the mandate wording changes. Recorded on every acceptance. */
  revision: z.string().trim().min(1).max(64),
})

export const publicApiStoredInstrumentMandateSchema = publicApiStoredInstrumentMandateInputSchema

export type PublicApiStoredInstrumentMandate = z.infer<
  typeof publicApiStoredInstrumentMandateSchema
>

export const publicApiSettingsInputSchema = z.object({
  support: z
    .object({
      email: z.email().optional().nullable(),
      phone: z.string().trim().min(1).optional().nullable(),
      links: z.array(publicApiSupportLinkInputSchema).optional(),
    })
    .optional(),
  legal: z
    .object({
      termsUrl: httpUrlSchema.optional().nullable(),
      privacyUrl: httpUrlSchema.optional().nullable(),
      cancellationUrl: httpUrlSchema.optional().nullable(),
      defaultContractTemplateId: z.string().trim().min(1).optional().nullable(),
      /**
       * The operator's authority to keep a shopper's payment instrument and charge it
       * later while they are away.
       *
       * That authority comes from the operator's own booking terms, which the shopper
       * accepts at checkout, not from a checkbox beside the card field. Card network
       * rules ask the terms to state that payments may be initiated on the shopper's
       * behalf, their anticipated timing and frequency, how the amount is determined,
       * and the cancellation policy — and to keep a record of each acceptance.
       *
       * `revision` is what makes that record meaningful. Without it an acceptance
       * says only that some version of some terms was agreed to at some point, which
       * is not evidence of anything. Bump it whenever the mandate wording changes;
       * acceptances of the old revision stay valid for instruments already stored
       * under it.
       *
       * Absent means the operator has no such authority and nothing is stored. Fail
       * closed is the only safe default: the operator is the merchant of record and
       * carries the liability, so silently assuming an authority they never granted
       * would put that liability on somebody who never chose it.
       */
      storedInstrumentMandate: publicApiStoredInstrumentMandateInputSchema.optional().nullable(),
    })
    .optional(),
  localization: z
    .object({
      defaultLocale: languageTagSchema.optional().nullable(),
      currencyDisplay: publicApiCurrencyDisplaySchema.optional(),
    })
    .optional(),
  forms: z
    .object({
      billing: z
        .object({
          fields: z.array(publicApiFormFieldInputSchema).default([]),
        })
        .optional(),
      travelers: z
        .object({
          fields: z.array(publicApiFormFieldInputSchema).default([]),
        })
        .optional(),
    })
    .optional(),
  payment: z
    .object({
      defaultMethod: publicApiPaymentMethodCodeSchema.optional().nullable(),
      methods: z.array(publicApiPaymentMethodInputSchema).optional(),
      structure: publicApiPaymentStructureSchema.optional(),
      schedule: z.array(publicApiPaymentScheduleEntryInputSchema).optional(),
      defaultSchedule: publicApiPaymentScheduleInputSchema.optional().nullable(),
      bankTransfer: publicApiBankTransferInputSchema.optional().nullable(),
    })
    .optional(),
})

export const publicApiSettingsSchema = z.object({
  support: z.object({
    email: z.email().nullable(),
    phone: z.string().trim().min(1).nullable(),
    links: z.array(publicApiSupportLinkSchema),
  }),
  legal: z.object({
    termsUrl: urlOrNullSchema,
    privacyUrl: urlOrNullSchema,
    cancellationUrl: urlOrNullSchema,
    defaultContractTemplateId: z.string().trim().min(1).nullable(),
    /** Null means the operator has no authority to store instruments. */
    storedInstrumentMandate: publicApiStoredInstrumentMandateSchema.nullable(),
  }),
  localization: z.object({
    defaultLocale: languageTagSchema.nullable(),
    currencyDisplay: publicApiCurrencyDisplaySchema,
  }),
  forms: z.object({
    billing: z.object({
      fields: z.array(publicApiFormFieldSchema),
    }),
    travelers: z.object({
      fields: z.array(publicApiFormFieldSchema),
    }),
  }),
  payment: z.object({
    defaultMethod: publicApiPaymentMethodCodeSchema.nullable(),
    methods: z.array(publicApiPaymentMethodSchema),
    structure: publicApiPaymentStructureSchema,
    schedule: z.array(publicApiPaymentScheduleEntrySchema),
    defaultSchedule: publicApiPaymentScheduleSchema.nullable(),
    bankTransfer: publicApiBankTransferSchema.nullable(),
  }),
})

/**
 * The shopper-facing projection.
 *
 * The mandate is operator configuration, not something a storefront renders:
 * what the shopper reads is the booking terms themselves, through the contract
 * template. Publishing which revision authorizes stored cards tells a visitor
 * nothing they can act on and puts operator settings on an anonymous endpoint.
 */
export const publicApiPublicSettingsSchema = publicApiSettingsSchema.extend({
  legal: publicApiSettingsSchema.shape.legal.omit({
    storedInstrumentMandate: true,
  }),
})

export function toPublicPublicApiSettings<T extends { legal: Record<string, unknown> }>(
  settings: T,
): T {
  const { storedInstrumentMandate: _internal, ...legal } = settings.legal
  return { ...settings, legal }
}

export const publicApiSettingsPatchSchema = z.object({
  support: publicApiSettingsInputSchema.shape.support,
  legal: publicApiSettingsInputSchema.shape.legal,
  localization: publicApiSettingsInputSchema.shape.localization,
  forms: publicApiSettingsInputSchema.shape.forms,
  payment: publicApiSettingsInputSchema.shape.payment,
})

export type PublicApiPaymentMethodCode = z.infer<typeof publicApiPaymentMethodCodeSchema>
export type PublicApiFormFieldInput = z.infer<typeof publicApiFormFieldInputSchema>
export type PublicApiFormField = z.infer<typeof publicApiFormFieldSchema>
export type PublicApiPaymentMethodInput = z.infer<typeof publicApiPaymentMethodInputSchema>
export type PublicApiPaymentMethod = z.infer<typeof publicApiPaymentMethodSchema>
export type PublicApiPaymentStructure = z.infer<typeof publicApiPaymentStructureSchema>
export type PublicApiPaymentDueCondition = z.infer<typeof publicApiPaymentDueConditionSchema>
export type PublicApiPaymentScheduleEntryInput = z.infer<
  typeof publicApiPaymentScheduleEntryInputSchema
>
export type PublicApiPaymentScheduleEntry = z.infer<typeof publicApiPaymentScheduleEntrySchema>
export type PublicApiSupportLinkInput = z.infer<typeof publicApiSupportLinkInputSchema>
export type PublicApiSupportLink = z.infer<typeof publicApiSupportLinkSchema>
export type PublicApiBankTransferAccountInput = z.infer<
  typeof publicApiBankTransferAccountInputSchema
>
export type PublicApiBankTransferAccount = z.infer<typeof publicApiBankTransferAccountSchema>
export type PublicApiBankTransferInput = z.infer<typeof publicApiBankTransferInputSchema>
export type PublicApiBankTransfer = z.infer<typeof publicApiBankTransferSchema>
export type PublicApiPaymentScheduleInput = z.infer<typeof publicApiPaymentScheduleInputSchema>
export type PublicApiPaymentSchedule = z.infer<typeof publicApiPaymentScheduleSchema>
export type PublicApiCurrencyDisplay = z.infer<typeof publicApiCurrencyDisplaySchema>
export type PublicApiSettingsInput = z.infer<typeof publicApiSettingsInputSchema>
export type PublicApiSettings = z.infer<typeof publicApiSettingsSchema>
export type PublicApiSettingsPatchInput = z.infer<typeof publicApiSettingsPatchSchema>
