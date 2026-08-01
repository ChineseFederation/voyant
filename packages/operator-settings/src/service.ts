/**
 * Operator settings data access — readers/writers + validation for the
 * operator profile, payment instructions/defaults, and booking-tax settings.
 *
 * Transport-agnostic (no Hono): a deployment mounts the HTTP routes over these
 * and injects the readers into the standard modules that need them (legal
 * contract variables, quotes proposal, commerce checkout tax, finance
 * booking-tax). The schema lives in `./schema`.
 */

import type { BookingTaxSettings, PaymentPolicy } from "@voyant-travel/finance"
import { desc, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { z } from "zod"

import {
  DEFAULT_OPERATOR_BRAND_COLOR,
  DEFAULT_OPERATOR_CORNER_RADIUS,
  DEFAULT_OPERATOR_FONT,
  DEFAULT_OPERATOR_LOCALE,
  OPERATOR_CORNER_RADII,
  OPERATOR_FONT_IDS,
  OPERATOR_LOCALE_IDS,
} from "./branding.js"
import {
  bookingTaxSettings,
  operatorPaymentDefaults,
  operatorPaymentInstructions,
  operatorProfile,
} from "./schema.js"

const depositRuleSchema = z.object({
  kind: z.enum(["none", "percent", "fixed_cents"]),
  percent: z.number().min(0).max(100).optional(),
  amountCents: z.number().int().min(0).optional(),
})

export const paymentPolicySchema = z.object({
  deposit: depositRuleSchema,
  minDaysBeforeDepartureForDeposit: z.number().int().min(0),
  balanceDueDaysBeforeDeparture: z.number().int().min(0),
  balanceDueMinDaysFromNow: z.number().int().min(0),
})

function parseStoredPaymentPolicy(value: unknown): PaymentPolicy | null {
  if (value == null) return null
  return paymentPolicySchema.parse(value)
}

const updateOperatorProfileObjectSchema = z.object({
  name: z.string().nullable().optional(),
  legalName: z.string().nullable().optional(),
  vatId: z.string().nullable().optional(),
  registrationNumber: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  website: z.string().url().nullable().optional().or(z.literal("")),
  logoLightAssetKey: z.string().max(1_024).nullable().optional(),
  logoLightMimeType: z.string().max(255).nullable().optional(),
  logoDarkAssetKey: z.string().max(1_024).nullable().optional(),
  logoDarkMimeType: z.string().max(255).nullable().optional(),
  iconLightAssetKey: z.string().max(1_024).nullable().optional(),
  iconLightMimeType: z.string().max(255).nullable().optional(),
  iconDarkAssetKey: z.string().max(1_024).nullable().optional(),
  iconDarkMimeType: z.string().max(255).nullable().optional(),
  brandColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Brand color must be a #rrggbb hex value")
    .optional(),
  cornerRadius: z.enum(OPERATOR_CORNER_RADII).optional(),
  headingFont: z.enum(OPERATOR_FONT_IDS).optional(),
  bodyFont: z.enum(OPERATOR_FONT_IDS).optional(),
  faviconAssetKey: z.string().max(1_024).nullable().optional(),
  faviconMimeType: z.string().max(255).nullable().optional(),
  supportEmail: z.string().email().nullable().optional().or(z.literal("")),
  termsUrl: z.string().url().nullable().optional().or(z.literal("")),
  privacyUrl: z.string().url().nullable().optional().or(z.literal("")),
  supportedLocales: z
    .array(z.enum(OPERATOR_LOCALE_IDS))
    .min(1)
    .max(OPERATOR_LOCALE_IDS.length)
    .refine((locales) => new Set(locales).size === locales.length, "Locales must be unique")
    .describe("Unique locales supported by the operator")
    .optional(),
  defaultLocale: z.enum(OPERATOR_LOCALE_IDS).optional(),
  license: z.string().nullable().optional(),
  licenseAuthority: z.string().nullable().optional(),
  signatoryName: z.string().nullable().optional(),
  signatoryRole: z.string().nullable().optional(),
})

function requireSupportedDefaultLocale(
  value: { supportedLocales?: string[]; defaultLocale?: string },
  context: z.RefinementCtx,
) {
  const updatesSupported = value.supportedLocales !== undefined
  const updatesDefault = value.defaultLocale !== undefined
  if (updatesSupported !== updatesDefault) {
    context.addIssue({
      code: "custom",
      path: [updatesSupported ? "defaultLocale" : "supportedLocales"],
      message: "Supported locales and default locale must be updated together",
    })
    return
  }
  if (
    value.supportedLocales &&
    value.defaultLocale &&
    !value.supportedLocales.includes(value.defaultLocale)
  ) {
    context.addIssue({
      code: "custom",
      path: ["defaultLocale"],
      message: "Default locale must be included in supported locales",
    })
  }
}

export const updateOperatorProfileSchema = updateOperatorProfileObjectSchema.superRefine(
  requireSupportedDefaultLocale,
)

export const updateOperatorPaymentInstructionsSchema = z.object({
  bankTransferBeneficiary: z.string().nullable().optional(),
  iban: z.string().nullable().optional(),
  bank: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export const updateOperatorPaymentDefaultsSchema = z.object({
  customerPaymentPolicy: paymentPolicySchema.nullable().optional(),
  bookingCheckoutUrlTemplate: z.string().trim().nullable().optional(),
  invoicePayUrlTemplate: z.string().trim().nullable().optional(),
})

export const updateOperatorSettingsSchema = updateOperatorProfileObjectSchema
  .merge(updateOperatorPaymentInstructionsSchema)
  .merge(updateOperatorPaymentDefaultsSchema)
  .superRefine(requireSupportedDefaultLocale)

export type UpdateOperatorProfileInput = z.infer<typeof updateOperatorProfileSchema>
export type UpdateOperatorPaymentInstructionsInput = z.infer<
  typeof updateOperatorPaymentInstructionsSchema
>
export type UpdateOperatorPaymentDefaultsInput = z.infer<typeof updateOperatorPaymentDefaultsSchema>
export type UpdateOperatorSettingsInput = z.infer<typeof updateOperatorSettingsSchema>

type OperatorProfileRow = typeof operatorProfile.$inferSelect
type OperatorPaymentInstructionsRow = typeof operatorPaymentInstructions.$inferSelect
type OperatorPaymentDefaultsRow = typeof operatorPaymentDefaults.$inferSelect

export async function getOperatorProfile(db: PostgresJsDatabase) {
  const [row] = await db
    .select()
    .from(operatorProfile)
    .orderBy(desc(operatorProfile.createdAt))
    .limit(1)
  return row ?? null
}

export async function upsertOperatorProfile(
  db: PostgresJsDatabase,
  patch: UpdateOperatorProfileInput,
) {
  const existing = await getOperatorProfile(db)
  if (!existing) {
    const [created] = await db.insert(operatorProfile).values(patch).returning()
    return created ?? null
  }

  const [updated] = await db
    .update(operatorProfile)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(operatorProfile.id, existing.id))
    .returning()
  return updated ?? null
}

export async function getOperatorPaymentInstructions(db: PostgresJsDatabase) {
  const [row] = await db
    .select()
    .from(operatorPaymentInstructions)
    .orderBy(desc(operatorPaymentInstructions.createdAt))
    .limit(1)
  return row ?? null
}

export async function upsertOperatorPaymentInstructions(
  db: PostgresJsDatabase,
  patch: UpdateOperatorPaymentInstructionsInput,
) {
  const existing = await getOperatorPaymentInstructions(db)
  if (!existing) {
    const [created] = await db.insert(operatorPaymentInstructions).values(patch).returning()
    return created ?? null
  }

  const [updated] = await db
    .update(operatorPaymentInstructions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(operatorPaymentInstructions.id, existing.id))
    .returning()
  return updated ?? null
}

export async function getOperatorPaymentDefaults(db: PostgresJsDatabase) {
  const [row] = await db
    .select()
    .from(operatorPaymentDefaults)
    .orderBy(desc(operatorPaymentDefaults.createdAt))
    .limit(1)
  return row ?? null
}

export async function upsertOperatorPaymentDefaults(
  db: PostgresJsDatabase,
  patch: UpdateOperatorPaymentDefaultsInput,
) {
  const existing = await getOperatorPaymentDefaults(db)
  const values: Partial<typeof operatorPaymentDefaults.$inferInsert> = {}

  if ("customerPaymentPolicy" in patch) {
    values.customerPaymentPolicy = (patch.customerPaymentPolicy ?? null) as unknown
  }
  if ("bookingCheckoutUrlTemplate" in patch) {
    values.bookingCheckoutUrlTemplate = patch.bookingCheckoutUrlTemplate?.trim() || null
  }
  if ("invoicePayUrlTemplate" in patch) {
    values.invoicePayUrlTemplate = patch.invoicePayUrlTemplate?.trim() || null
  }

  if (!existing) {
    const [created] = await db.insert(operatorPaymentDefaults).values(values).returning()
    return created ?? null
  }

  if (Object.keys(values).length === 0) return existing

  const [updated] = await db
    .update(operatorPaymentDefaults)
    .set({
      ...values,
      updatedAt: new Date(),
    } as Partial<typeof operatorPaymentDefaults.$inferInsert>)
    .where(eq(operatorPaymentDefaults.id, existing.id))
    .returning()
  return updated ?? null
}

export async function resolveOperatorDefaultPaymentPolicy(
  db: PostgresJsDatabase,
): Promise<PaymentPolicy | null> {
  const defaults = await getOperatorPaymentDefaults(db)
  return parseStoredPaymentPolicy(defaults?.customerPaymentPolicy)
}

export async function resolveBookingTaxSettings(
  db: PostgresJsDatabase,
): Promise<BookingTaxSettings> {
  const [settings] = await db
    .select()
    .from(bookingTaxSettings)
    .orderBy(desc(bookingTaxSettings.createdAt))
    .limit(1)

  return {
    taxPriceMode: settings?.taxPriceMode === "exclusive" ? "exclusive" : "inclusive",
    taxPolicyProfileId: settings?.taxPolicyProfileId ?? null,
    invoicingMode: normalizeInvoicingMode(settings?.invoicingMode),
  }
}

function normalizeInvoicingMode(value: string | null | undefined): "direct" | "proforma-first" {
  return value === "direct" ? "direct" : "proforma-first"
}

/**
 * Resolve just the operator invoicing mode. Defaults to `proforma-first`
 * (the historical bank-transfer behaviour) when no settings row exists.
 * Provided through the finance operator-settings runtime port.
 */
export async function resolveInvoicingMode(
  db: PostgresJsDatabase,
): Promise<"direct" | "proforma-first"> {
  const settings = await resolveBookingTaxSettings(db)
  return normalizeInvoicingMode(settings.invoicingMode)
}

export async function updateBookingTaxSettings(
  db: PostgresJsDatabase,
  patch: BookingTaxSettings,
): Promise<BookingTaxSettings> {
  const [existing] = await db
    .select()
    .from(bookingTaxSettings)
    .orderBy(desc(bookingTaxSettings.createdAt))
    .limit(1)

  if (!existing) {
    const [created] = await db
      .insert(bookingTaxSettings)
      .values({
        taxPriceMode: patch.taxPriceMode === "exclusive" ? "exclusive" : "inclusive",
        taxPolicyProfileId: patch.taxPolicyProfileId ?? null,
        invoicingMode: normalizeInvoicingMode(patch.invoicingMode),
      })
      .returning()
    return {
      taxPriceMode: created?.taxPriceMode === "exclusive" ? "exclusive" : "inclusive",
      taxPolicyProfileId: created?.taxPolicyProfileId ?? null,
      invoicingMode: normalizeInvoicingMode(created?.invoicingMode),
    }
  }

  const [updated] = await db
    .update(bookingTaxSettings)
    .set({
      taxPriceMode: patch.taxPriceMode === "exclusive" ? "exclusive" : "inclusive",
      taxPolicyProfileId: patch.taxPolicyProfileId ?? null,
      invoicingMode: normalizeInvoicingMode(patch.invoicingMode),
      updatedAt: new Date(),
    })
    .where(eq(bookingTaxSettings.id, existing.id))
    .returning()

  return {
    taxPriceMode: updated?.taxPriceMode === "exclusive" ? "exclusive" : "inclusive",
    taxPolicyProfileId: updated?.taxPolicyProfileId ?? null,
    invoicingMode: normalizeInvoicingMode(updated?.invoicingMode),
  }
}

export interface OperatorInvoiceFxSettings {
  baseCurrency: string | null
  fxCommissionBps: number | null
  fxCommissionInvoiceMention: string | null
}

/**
 * Resolve the invoice-FX settings from the finance operator-settings singleton.
 * Co-located on `booking_tax_settings`; provided through the finance
 * operator-settings runtime port so the invoice-FX routes can persist the
 * operator's chosen base currency.
 */
export async function resolveInvoiceFxSettings(
  db: PostgresJsDatabase,
): Promise<OperatorInvoiceFxSettings> {
  const [settings] = await db
    .select()
    .from(bookingTaxSettings)
    .orderBy(desc(bookingTaxSettings.createdAt))
    .limit(1)
  return {
    baseCurrency: settings?.baseCurrency ?? null,
    fxCommissionBps: settings?.fxCommissionBps ?? null,
    fxCommissionInvoiceMention: settings?.fxCommissionInvoiceMention ?? null,
  }
}

export async function updateInvoiceFxSettings(
  db: PostgresJsDatabase,
  patch: Partial<OperatorInvoiceFxSettings>,
): Promise<OperatorInvoiceFxSettings> {
  const [existing] = await db
    .select()
    .from(bookingTaxSettings)
    .orderBy(desc(bookingTaxSettings.createdAt))
    .limit(1)
  const values = {
    baseCurrency: patch.baseCurrency ?? null,
    fxCommissionBps: patch.fxCommissionBps ?? null,
    fxCommissionInvoiceMention: patch.fxCommissionInvoiceMention ?? null,
  }
  const [row] = existing
    ? await db
        .update(bookingTaxSettings)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(bookingTaxSettings.id, existing.id))
        .returning()
    : await db.insert(bookingTaxSettings).values(values).returning()
  return {
    baseCurrency: row?.baseCurrency ?? null,
    fxCommissionBps: row?.fxCommissionBps ?? null,
    fxCommissionInvoiceMention: row?.fxCommissionInvoiceMention ?? null,
  }
}

export interface PublicOperatorBrandingUrls {
  logoLightUrl?: string | null
  logoDarkUrl?: string | null
  iconLightUrl?: string | null
  iconDarkUrl?: string | null
  faviconUrl?: string | null
}

export function toPublicOperatorProfile(
  row: OperatorProfileRow,
  defaults?: OperatorPaymentDefaultsRow | null,
  brandingUrls: PublicOperatorBrandingUrls = {},
): PublicOperatorProfile {
  return {
    name: row.name ?? "",
    legalName: row.legalName ?? "",
    address: row.address ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    website: row.website ?? "",
    logoLightAssetKey: row.logoLightAssetKey ?? null,
    logoLightUrl: brandingUrls.logoLightUrl ?? null,
    logoLightMimeType: row.logoLightMimeType ?? null,
    logoDarkAssetKey: row.logoDarkAssetKey ?? null,
    logoDarkUrl: brandingUrls.logoDarkUrl ?? null,
    logoDarkMimeType: row.logoDarkMimeType ?? null,
    iconLightAssetKey: row.iconLightAssetKey ?? null,
    iconLightUrl: brandingUrls.iconLightUrl ?? null,
    iconLightMimeType: row.iconLightMimeType ?? null,
    iconDarkAssetKey: row.iconDarkAssetKey ?? null,
    iconDarkUrl: brandingUrls.iconDarkUrl ?? null,
    iconDarkMimeType: row.iconDarkMimeType ?? null,
    brandColor: row.brandColor ?? DEFAULT_OPERATOR_BRAND_COLOR,
    cornerRadius: row.cornerRadius ?? DEFAULT_OPERATOR_CORNER_RADIUS,
    headingFont: row.headingFont ?? DEFAULT_OPERATOR_FONT,
    bodyFont: row.bodyFont ?? DEFAULT_OPERATOR_FONT,
    faviconAssetKey: row.faviconAssetKey ?? null,
    faviconUrl: brandingUrls.faviconUrl ?? null,
    faviconMimeType: row.faviconMimeType ?? null,
    supportEmail: row.supportEmail ?? null,
    termsUrl: row.termsUrl ?? null,
    privacyUrl: row.privacyUrl ?? null,
    supportedLocales: row.supportedLocales ?? [DEFAULT_OPERATOR_LOCALE],
    defaultLocale: row.defaultLocale ?? DEFAULT_OPERATOR_LOCALE,
    license: row.license ?? "",
    licenseAuthority: row.licenseAuthority ?? "",
    customerPaymentPolicy: parseStoredPaymentPolicy(defaults?.customerPaymentPolicy),
    bookingCheckoutUrlTemplate: defaults?.bookingCheckoutUrlTemplate ?? null,
    invoicePayUrlTemplate: defaults?.invoicePayUrlTemplate ?? null,
  }
}

export interface PublicOperatorProfile {
  name: string
  legalName: string
  address: string
  phone: string
  email: string
  website: string
  logoLightAssetKey: string | null
  logoLightUrl: string | null
  logoLightMimeType: string | null
  logoDarkAssetKey: string | null
  logoDarkUrl: string | null
  logoDarkMimeType: string | null
  iconLightAssetKey: string | null
  iconLightUrl: string | null
  iconLightMimeType: string | null
  iconDarkAssetKey: string | null
  iconDarkUrl: string | null
  iconDarkMimeType: string | null
  brandColor: string
  cornerRadius: string
  headingFont: string
  bodyFont: string
  faviconAssetKey: string | null
  faviconUrl: string | null
  faviconMimeType: string | null
  supportEmail: string | null
  termsUrl: string | null
  privacyUrl: string | null
  supportedLocales: string[]
  defaultLocale: string
  license: string
  licenseAuthority: string
  customerPaymentPolicy: PaymentPolicy | null
  bookingCheckoutUrlTemplate: string | null
  invoicePayUrlTemplate: string | null
}

type CombinedOperatorSettings = Partial<OperatorProfileRow> &
  Partial<OperatorPaymentInstructionsRow> & {
    customerPaymentPolicy: PaymentPolicy | null
    bookingCheckoutUrlTemplate: string | null
    invoicePayUrlTemplate: string | null
  }

function combineOperatorSettings(
  profile: OperatorProfileRow | null,
  instructions: OperatorPaymentInstructionsRow | null,
  defaults: OperatorPaymentDefaultsRow | null,
): CombinedOperatorSettings | null {
  if (!profile && !instructions && !defaults) return null
  return {
    ...(profile ?? {}),
    bankTransferBeneficiary: instructions?.bankTransferBeneficiary ?? null,
    iban: instructions?.iban ?? null,
    bank: instructions?.bank ?? null,
    notes: instructions?.notes ?? null,
    customerPaymentPolicy: parseStoredPaymentPolicy(defaults?.customerPaymentPolicy),
    bookingCheckoutUrlTemplate: defaults?.bookingCheckoutUrlTemplate ?? null,
    invoicePayUrlTemplate: defaults?.invoicePayUrlTemplate ?? null,
  }
}

export async function getOperatorSettings(db: PostgresJsDatabase) {
  const [profile, instructions, defaults] = await Promise.all([
    getOperatorProfile(db),
    getOperatorPaymentInstructions(db),
    getOperatorPaymentDefaults(db),
  ])
  return combineOperatorSettings(profile, instructions, defaults)
}

export async function upsertOperatorSettings(
  db: PostgresJsDatabase,
  patch: UpdateOperatorSettingsInput,
) {
  const profilePatch = updateOperatorProfileSchema.parse(patch)
  const paymentInstructionsPatch = updateOperatorPaymentInstructionsSchema.parse(patch)
  const paymentDefaultsPatch: UpdateOperatorPaymentDefaultsInput = {}
  if ("customerPaymentPolicy" in patch) {
    paymentDefaultsPatch.customerPaymentPolicy = patch.customerPaymentPolicy
  }
  if ("bookingCheckoutUrlTemplate" in patch) {
    paymentDefaultsPatch.bookingCheckoutUrlTemplate = patch.bookingCheckoutUrlTemplate
  }
  if ("invoicePayUrlTemplate" in patch) {
    paymentDefaultsPatch.invoicePayUrlTemplate = patch.invoicePayUrlTemplate
  }

  const [profile, instructions, defaults] = await Promise.all([
    upsertOperatorProfile(db, profilePatch),
    upsertOperatorPaymentInstructions(db, paymentInstructionsPatch),
    upsertOperatorPaymentDefaults(db, paymentDefaultsPatch),
  ])
  return combineOperatorSettings(profile, instructions, defaults)
}

export function toPublicOperatorSettings(
  row: Awaited<ReturnType<typeof getOperatorSettings>>,
  brandingUrls: PublicOperatorBrandingUrls = {},
): PublicOperatorProfile {
  return {
    name: row?.name ?? "",
    legalName: row?.legalName ?? "",
    address: row?.address ?? "",
    phone: row?.phone ?? "",
    email: row?.email ?? "",
    website: row?.website ?? "",
    logoLightAssetKey: row?.logoLightAssetKey ?? null,
    logoLightUrl: brandingUrls.logoLightUrl ?? null,
    logoLightMimeType: row?.logoLightMimeType ?? null,
    logoDarkAssetKey: row?.logoDarkAssetKey ?? null,
    logoDarkUrl: brandingUrls.logoDarkUrl ?? null,
    logoDarkMimeType: row?.logoDarkMimeType ?? null,
    iconLightAssetKey: row?.iconLightAssetKey ?? null,
    iconLightUrl: brandingUrls.iconLightUrl ?? null,
    iconLightMimeType: row?.iconLightMimeType ?? null,
    iconDarkAssetKey: row?.iconDarkAssetKey ?? null,
    iconDarkUrl: brandingUrls.iconDarkUrl ?? null,
    iconDarkMimeType: row?.iconDarkMimeType ?? null,
    brandColor: row?.brandColor ?? DEFAULT_OPERATOR_BRAND_COLOR,
    cornerRadius: row?.cornerRadius ?? DEFAULT_OPERATOR_CORNER_RADIUS,
    headingFont: row?.headingFont ?? DEFAULT_OPERATOR_FONT,
    bodyFont: row?.bodyFont ?? DEFAULT_OPERATOR_FONT,
    faviconAssetKey: row?.faviconAssetKey ?? null,
    faviconUrl: brandingUrls.faviconUrl ?? null,
    faviconMimeType: row?.faviconMimeType ?? null,
    supportEmail: row?.supportEmail ?? null,
    termsUrl: row?.termsUrl ?? null,
    privacyUrl: row?.privacyUrl ?? null,
    supportedLocales: row?.supportedLocales ?? [DEFAULT_OPERATOR_LOCALE],
    defaultLocale: row?.defaultLocale ?? DEFAULT_OPERATOR_LOCALE,
    license: row?.license ?? "",
    licenseAuthority: row?.licenseAuthority ?? "",
    customerPaymentPolicy: row?.customerPaymentPolicy ?? null,
    bookingCheckoutUrlTemplate: row?.bookingCheckoutUrlTemplate ?? null,
    invoicePayUrlTemplate: row?.invoicePayUrlTemplate ?? null,
  }
}
