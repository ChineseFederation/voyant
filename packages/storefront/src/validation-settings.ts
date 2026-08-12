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

export const storefrontPaymentMethodCodeSchema = z.enum([
  "card",
  "bank_transfer",
  "cash",
  "travel_credit",
  "invoice",
])

export const storefrontFormFieldTypeSchema = z.enum([
  "text",
  "email",
  "tel",
  "textarea",
  "select",
  "checkbox",
  "date",
  "country",
])

export const storefrontFormFieldOptionSchema = z.object({
  value: z.string().trim().min(1),
  label: z.string().trim().min(1),
})

export const storefrontFormFieldInputSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  type: storefrontFormFieldTypeSchema.default("text"),
  required: z.boolean().default(false),
  placeholder: z.string().trim().min(1).optional().nullable(),
  description: z.string().trim().min(1).optional().nullable(),
  autocomplete: z.string().trim().min(1).optional().nullable(),
  options: z.array(storefrontFormFieldOptionSchema).default([]),
})

export const storefrontFormFieldSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  type: storefrontFormFieldTypeSchema,
  required: z.boolean(),
  placeholder: z.string().trim().min(1).nullable(),
  description: z.string().trim().min(1).nullable(),
  autocomplete: z.string().trim().min(1).nullable(),
  options: z.array(storefrontFormFieldOptionSchema),
})

export const storefrontPaymentMethodInputSchema = z.object({
  code: storefrontPaymentMethodCodeSchema,
  label: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional().nullable(),
  enabled: z.boolean().default(true),
})

export const storefrontPaymentMethodSchema = z.object({
  code: storefrontPaymentMethodCodeSchema,
  label: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable(),
  enabled: z.boolean(),
})

export const storefrontPaymentStructureSchema = z.enum(["full", "split"])

export const storefrontPaymentDueConditionSchema = z.enum(["after_booking", "before_departure"])

export const storefrontPaymentScheduleEntryInputSchema = z.object({
  percent: z.number().min(0).max(100),
  dueInDays: z.number().int().min(0),
  dueCondition: storefrontPaymentDueConditionSchema,
})

export const storefrontPaymentScheduleEntrySchema = storefrontPaymentScheduleEntryInputSchema

export const storefrontSupportLinkInputSchema = z.object({
  label: z.string().trim().min(1),
  url: httpUrlSchema,
})

export const storefrontSupportLinkSchema = storefrontSupportLinkInputSchema

export const storefrontBankTransferAccountInputSchema = z.object({
  provider: z.string().trim().min(1).optional().nullable(),
  currency: z.string().trim().min(1).optional().nullable(),
  iban: z.string().trim().min(1),
  beneficiary: z.string().trim().min(1),
  bank: z.string().trim().min(1),
})

export const storefrontBankTransferAccountSchema = z.object({
  provider: textOrNullSchema,
  currency: textOrNullSchema,
  iban: z.string().trim().min(1),
  beneficiary: z.string().trim().min(1),
  bank: z.string().trim().min(1),
})

export const storefrontBankTransferInputSchema = z.object({
  dueDays: z.number().int().min(0).optional().nullable(),
  account: storefrontBankTransferAccountInputSchema.optional().nullable(),
  accountHolder: z.string().trim().min(1).optional().nullable(),
  bankName: z.string().trim().min(1).optional().nullable(),
  iban: z.string().trim().min(1).optional().nullable(),
  bic: z.string().trim().min(1).optional().nullable(),
  paymentReference: z.string().trim().min(1).optional().nullable(),
  instructions: z.string().trim().min(1).optional().nullable(),
})

export const storefrontBankTransferSchema = z.object({
  dueDays: z.number().int().min(0).nullable(),
  account: storefrontBankTransferAccountSchema.nullable(),
  accountHolder: textOrNullSchema,
  bankName: textOrNullSchema,
  iban: textOrNullSchema,
  bic: textOrNullSchema,
  paymentReference: textOrNullSchema,
  instructions: textOrNullSchema,
})

export const storefrontPaymentScheduleInputSchema = z.object({
  depositPercent: z.number().min(0).max(100).optional().nullable(),
  balanceDueDaysBeforeDeparture: z.number().int().min(0).optional().nullable(),
})

export const storefrontPaymentScheduleSchema = z.object({
  depositPercent: z.number().min(0).max(100).nullable(),
  balanceDueDaysBeforeDeparture: z.number().int().min(0).nullable(),
})

export const storefrontCurrencyDisplaySchema = z.enum(["code", "symbol", "name"])

export const storefrontStoredInstrumentMandateInputSchema = z.object({
  /** The operator's terms authorize charging a stored instrument off-session. */
  enabled: z.boolean(),
  /** Bumped when the mandate wording changes. Recorded on every acceptance. */
  revision: z.string().trim().min(1).max(64),
})

export const storefrontStoredInstrumentMandateSchema = storefrontStoredInstrumentMandateInputSchema

export type StorefrontStoredInstrumentMandate = z.infer<
  typeof storefrontStoredInstrumentMandateSchema
>

export const storefrontSettingsInputSchema = z.object({
  support: z
    .object({
      email: z.email().optional().nullable(),
      phone: z.string().trim().min(1).optional().nullable(),
      links: z.array(storefrontSupportLinkInputSchema).optional(),
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
      storedInstrumentMandate: storefrontStoredInstrumentMandateInputSchema.optional().nullable(),
    })
    .optional(),
  localization: z
    .object({
      defaultLocale: languageTagSchema.optional().nullable(),
      currencyDisplay: storefrontCurrencyDisplaySchema.optional(),
    })
    .optional(),
  forms: z
    .object({
      billing: z
        .object({
          fields: z.array(storefrontFormFieldInputSchema).default([]),
        })
        .optional(),
      travelers: z
        .object({
          fields: z.array(storefrontFormFieldInputSchema).default([]),
        })
        .optional(),
    })
    .optional(),
  payment: z
    .object({
      defaultMethod: storefrontPaymentMethodCodeSchema.optional().nullable(),
      methods: z.array(storefrontPaymentMethodInputSchema).optional(),
      structure: storefrontPaymentStructureSchema.optional(),
      schedule: z.array(storefrontPaymentScheduleEntryInputSchema).optional(),
      defaultSchedule: storefrontPaymentScheduleInputSchema.optional().nullable(),
      bankTransfer: storefrontBankTransferInputSchema.optional().nullable(),
    })
    .optional(),
})

export const storefrontSettingsSchema = z.object({
  support: z.object({
    email: z.email().nullable(),
    phone: z.string().trim().min(1).nullable(),
    links: z.array(storefrontSupportLinkSchema),
  }),
  legal: z.object({
    termsUrl: urlOrNullSchema,
    privacyUrl: urlOrNullSchema,
    cancellationUrl: urlOrNullSchema,
    defaultContractTemplateId: z.string().trim().min(1).nullable(),
    /** Null means the operator has no authority to store instruments. */
    storedInstrumentMandate: storefrontStoredInstrumentMandateSchema.nullable(),
  }),
  localization: z.object({
    defaultLocale: languageTagSchema.nullable(),
    currencyDisplay: storefrontCurrencyDisplaySchema,
  }),
  forms: z.object({
    billing: z.object({
      fields: z.array(storefrontFormFieldSchema),
    }),
    travelers: z.object({
      fields: z.array(storefrontFormFieldSchema),
    }),
  }),
  payment: z.object({
    defaultMethod: storefrontPaymentMethodCodeSchema.nullable(),
    methods: z.array(storefrontPaymentMethodSchema),
    structure: storefrontPaymentStructureSchema,
    schedule: z.array(storefrontPaymentScheduleEntrySchema),
    defaultSchedule: storefrontPaymentScheduleSchema.nullable(),
    bankTransfer: storefrontBankTransferSchema.nullable(),
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
export const storefrontPublicSettingsSchema = storefrontSettingsSchema.extend({
  legal: storefrontSettingsSchema.shape.legal.omit({
    storedInstrumentMandate: true,
  }),
})

export function toPublicStorefrontSettings<T extends { legal: Record<string, unknown> }>(
  settings: T,
): T {
  const { storedInstrumentMandate: _internal, ...legal } = settings.legal
  return { ...settings, legal }
}

export const storefrontSettingsPatchSchema = z.object({
  support: storefrontSettingsInputSchema.shape.support,
  legal: storefrontSettingsInputSchema.shape.legal,
  localization: storefrontSettingsInputSchema.shape.localization,
  forms: storefrontSettingsInputSchema.shape.forms,
  payment: storefrontSettingsInputSchema.shape.payment,
})

export type StorefrontPaymentMethodCode = z.infer<typeof storefrontPaymentMethodCodeSchema>
export type StorefrontFormFieldInput = z.infer<typeof storefrontFormFieldInputSchema>
export type StorefrontFormField = z.infer<typeof storefrontFormFieldSchema>
export type StorefrontPaymentMethodInput = z.infer<typeof storefrontPaymentMethodInputSchema>
export type StorefrontPaymentMethod = z.infer<typeof storefrontPaymentMethodSchema>
export type StorefrontPaymentStructure = z.infer<typeof storefrontPaymentStructureSchema>
export type StorefrontPaymentDueCondition = z.infer<typeof storefrontPaymentDueConditionSchema>
export type StorefrontPaymentScheduleEntryInput = z.infer<
  typeof storefrontPaymentScheduleEntryInputSchema
>
export type StorefrontPaymentScheduleEntry = z.infer<typeof storefrontPaymentScheduleEntrySchema>
export type StorefrontSupportLinkInput = z.infer<typeof storefrontSupportLinkInputSchema>
export type StorefrontSupportLink = z.infer<typeof storefrontSupportLinkSchema>
export type StorefrontBankTransferAccountInput = z.infer<
  typeof storefrontBankTransferAccountInputSchema
>
export type StorefrontBankTransferAccount = z.infer<typeof storefrontBankTransferAccountSchema>
export type StorefrontBankTransferInput = z.infer<typeof storefrontBankTransferInputSchema>
export type StorefrontBankTransfer = z.infer<typeof storefrontBankTransferSchema>
export type StorefrontPaymentScheduleInput = z.infer<typeof storefrontPaymentScheduleInputSchema>
export type StorefrontPaymentSchedule = z.infer<typeof storefrontPaymentScheduleSchema>
export type StorefrontCurrencyDisplay = z.infer<typeof storefrontCurrencyDisplaySchema>
export type StorefrontSettingsInput = z.infer<typeof storefrontSettingsInputSchema>
export type StorefrontSettings = z.infer<typeof storefrontSettingsSchema>
export type StorefrontSettingsPatchInput = z.infer<typeof storefrontSettingsPatchSchema>
