import type {
  operatorPaymentDefaults,
  operatorPaymentInstructions,
  operatorProfile,
} from "@voyant-travel/operator-settings/schema"
import type { InferSelectModel } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { z } from "zod"

/**
 * Response contract tests (voyant#2114 — operator-settings sub-batch) for the
 * operator-settings admin/public routes. Each Drizzle-backed fixture is typed as
 * the real `$inferSelect` row so column drift breaks compilation; the JSON
 * round-trip (Date → ISO string) mirrors `c.json` so a declared/actual mismatch
 * breaks the test. The schemas below mirror the response shapes declared in
 * `routes.ts` (§17: timestamp columns → strings; jsonb `customerPaymentPolicy`
 * is an opaque pass-through).
 *
 * Every reader returns the row or `null`, so the `{ data }` envelope is nullable.
 * The combined-settings + public-profile projections are asserted from their own
 * synthetic shapes (the service spreads the profile row and folds in the payment
 * columns / projects a flat public object).
 */

const isoTimestamp = z.string()
const opaqueJson = z.unknown().nullable()

const operatorProfileRowSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  legalName: z.string().nullable(),
  vatId: z.string().nullable(),
  registrationNumber: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  logoLightAssetKey: z.string().nullable(),
  logoLightMimeType: z.string().nullable(),
  logoDarkAssetKey: z.string().nullable(),
  logoDarkMimeType: z.string().nullable(),
  iconLightAssetKey: z.string().nullable(),
  iconLightMimeType: z.string().nullable(),
  iconDarkAssetKey: z.string().nullable(),
  iconDarkMimeType: z.string().nullable(),
  brandColor: z.string(),
  cornerRadius: z.string(),
  headingFont: z.string(),
  bodyFont: z.string(),
  faviconAssetKey: z.string().nullable(),
  faviconMimeType: z.string().nullable(),
  supportEmail: z.string().nullable(),
  termsUrl: z.string().nullable(),
  privacyUrl: z.string().nullable(),
  supportedLocales: z.array(z.string()),
  defaultLocale: z.string(),
  license: z.string().nullable(),
  licenseAuthority: z.string().nullable(),
  signatoryName: z.string().nullable(),
  signatoryRole: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const operatorPaymentInstructionsRowSchema = z.object({
  id: z.string(),
  bankTransferBeneficiary: z.string().nullable(),
  iban: z.string().nullable(),
  bank: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const operatorPaymentDefaultsRowSchema = z.object({
  id: z.string(),
  customerPaymentPolicy: opaqueJson,
  bookingCheckoutUrlTemplate: z.string().nullable(),
  invoicePayUrlTemplate: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const combinedOperatorSettingsSchema = operatorProfileRowSchema.partial().extend({
  bankTransferBeneficiary: z.string().nullable(),
  iban: z.string().nullable(),
  bank: z.string().nullable(),
  notes: z.string().nullable(),
  customerPaymentPolicy: opaqueJson,
  bookingCheckoutUrlTemplate: z.string().nullable(),
  invoicePayUrlTemplate: z.string().nullable(),
})

const publicOperatorProfileSchema = z.object({
  name: z.string(),
  legalName: z.string(),
  address: z.string(),
  phone: z.string(),
  email: z.string(),
  website: z.string(),
  logoLightAssetKey: z.string().nullable(),
  logoLightMimeType: z.string().nullable(),
  logoDarkAssetKey: z.string().nullable(),
  logoDarkMimeType: z.string().nullable(),
  iconLightAssetKey: z.string().nullable(),
  iconLightMimeType: z.string().nullable(),
  iconDarkAssetKey: z.string().nullable(),
  iconDarkMimeType: z.string().nullable(),
  brandColor: z.string(),
  cornerRadius: z.string(),
  headingFont: z.string(),
  bodyFont: z.string(),
  faviconAssetKey: z.string().nullable(),
  faviconMimeType: z.string().nullable(),
  supportEmail: z.string().nullable(),
  termsUrl: z.string().nullable(),
  privacyUrl: z.string().nullable(),
  supportedLocales: z.array(z.string()),
  defaultLocale: z.string(),
  license: z.string(),
  licenseAuthority: z.string(),
  customerPaymentPolicy: opaqueJson,
  bookingCheckoutUrlTemplate: z.string().nullable(),
  invoicePayUrlTemplate: z.string().nullable(),
})

const createdAt = new Date("2026-01-01T00:00:00.000Z")
const updatedAt = new Date("2026-01-02T00:00:00.000Z")

// Drizzle-backed rows — typed so a column rename/retype breaks compilation.
const profileRow: InferSelectModel<typeof operatorProfile> = {
  id: "operator_profile_0000000000000000000000",
  name: "Voyant DMC",
  legalName: "Voyant DMC SRL",
  vatId: "RO12345678",
  registrationNumber: "J40/1234/2020",
  address: "1 Travel Way, Bucharest",
  phone: "+40 21 000 0000",
  email: "hello@voyant.test",
  website: "https://voyant.test",
  logoLightAssetKey: "uploads/logo-light.png",
  logoLightMimeType: "image/png",
  logoDarkAssetKey: "uploads/logo-dark.png",
  logoDarkMimeType: "image/png",
  iconLightAssetKey: "uploads/icon-light.png",
  iconLightMimeType: "image/png",
  iconDarkAssetKey: "uploads/icon-dark.png",
  iconDarkMimeType: "image/png",
  brandColor: "#f26522",
  cornerRadius: "0.625rem",
  headingFont: "inter-tight",
  bodyFont: "inter-tight",
  faviconAssetKey: "uploads/favicon.png",
  faviconMimeType: "image/png",
  supportEmail: "support@voyant.test",
  termsUrl: "https://voyant.test/terms",
  privacyUrl: "https://voyant.test/privacy",
  supportedLocales: ["en", "ro"],
  defaultLocale: "ro",
  license: "ANPC-1234",
  licenseAuthority: "ANPC",
  signatoryName: "Ana Pop",
  signatoryRole: "Director",
  createdAt,
  updatedAt,
}

const paymentInstructionsRow: InferSelectModel<typeof operatorPaymentInstructions> = {
  id: "operator_payment_instructions_0000000000",
  bankTransferBeneficiary: "Voyant DMC SRL",
  iban: "RO49AAAA1B31007593840000",
  bank: "Test Bank",
  notes: "Reference your booking id",
  createdAt,
  updatedAt,
}

const paymentDefaultsRow: InferSelectModel<typeof operatorPaymentDefaults> = {
  id: "operator_payment_defaults_00000000000000",
  customerPaymentPolicy: {
    deposit: { kind: "percent", percent: 25 },
    minDaysBeforeDepartureForDeposit: 0,
    balanceDueDaysBeforeDeparture: 30,
    balanceDueMinDaysFromNow: 3,
  },
  bookingCheckoutUrlTemplate: "https://pay.voyant.test/booking/{bookingId}",
  invoicePayUrlTemplate: "https://pay.voyant.test/invoice/{invoiceId}",
  createdAt,
  updatedAt,
}

const cases: Array<{ name: string; row: object; schema: z.ZodTypeAny }> = [
  { name: "operator profile", row: profileRow, schema: operatorProfileRowSchema },
  {
    name: "operator payment instructions",
    row: paymentInstructionsRow,
    schema: operatorPaymentInstructionsRowSchema,
  },
  {
    name: "operator payment defaults",
    row: paymentDefaultsRow,
    schema: operatorPaymentDefaultsRowSchema,
  },
]

describe("operator-settings Drizzle-backed response contracts", () => {
  for (const { name, row, schema } of cases) {
    it(`the ${name} { data } envelope satisfies the declared schema`, () => {
      const wire = JSON.parse(JSON.stringify({ data: row }))
      const parsed = z.object({ data: schema.nullable() }).safeParse(wire)
      expect(parsed.success ? null : parsed.error.toString()).toBeNull()
    })

    it(`the ${name} { data: null } envelope satisfies the declared schema`, () => {
      const parsed = z.object({ data: schema.nullable() }).safeParse({ data: null })
      expect(parsed.success ? null : parsed.error.toString()).toBeNull()
    })
  }

  it("the combined operator settings envelope satisfies the declared schema", () => {
    const combined = {
      ...profileRow,
      bankTransferBeneficiary: paymentInstructionsRow.bankTransferBeneficiary,
      iban: paymentInstructionsRow.iban,
      bank: paymentInstructionsRow.bank,
      notes: paymentInstructionsRow.notes,
      customerPaymentPolicy: paymentDefaultsRow.customerPaymentPolicy,
      bookingCheckoutUrlTemplate: paymentDefaultsRow.bookingCheckoutUrlTemplate,
      invoicePayUrlTemplate: paymentDefaultsRow.invoicePayUrlTemplate,
    }
    const wire = JSON.parse(JSON.stringify({ data: combined }))
    const parsed = z.object({ data: combinedOperatorSettingsSchema.nullable() }).safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })

  it("the public operator profile envelope satisfies the declared schema", () => {
    const publicProfile = {
      name: profileRow.name ?? "",
      legalName: profileRow.legalName ?? "",
      address: profileRow.address ?? "",
      phone: profileRow.phone ?? "",
      email: profileRow.email ?? "",
      website: profileRow.website ?? "",
      logoLightAssetKey: profileRow.logoLightAssetKey,
      logoLightUrl: "https://cdn.example.test/logo-light.png",
      logoLightMimeType: profileRow.logoLightMimeType,
      logoDarkAssetKey: profileRow.logoDarkAssetKey,
      logoDarkUrl: null,
      logoDarkMimeType: profileRow.logoDarkMimeType,
      iconLightAssetKey: profileRow.iconLightAssetKey,
      iconLightUrl: "/v1/public/operator-branding/icon-light",
      iconLightMimeType: profileRow.iconLightMimeType,
      iconDarkAssetKey: profileRow.iconDarkAssetKey,
      iconDarkUrl: null,
      iconDarkMimeType: profileRow.iconDarkMimeType,
      brandColor: profileRow.brandColor,
      cornerRadius: profileRow.cornerRadius,
      headingFont: profileRow.headingFont,
      bodyFont: profileRow.bodyFont,
      faviconAssetKey: profileRow.faviconAssetKey,
      faviconUrl: "/v1/public/operator-branding/favicon",
      faviconMimeType: profileRow.faviconMimeType,
      supportEmail: profileRow.supportEmail,
      termsUrl: profileRow.termsUrl,
      privacyUrl: profileRow.privacyUrl,
      supportedLocales: profileRow.supportedLocales,
      defaultLocale: profileRow.defaultLocale,
      license: profileRow.license ?? "",
      licenseAuthority: profileRow.licenseAuthority ?? "",
      customerPaymentPolicy: paymentDefaultsRow.customerPaymentPolicy,
      bookingCheckoutUrlTemplate: paymentDefaultsRow.bookingCheckoutUrlTemplate,
      invoicePayUrlTemplate: paymentDefaultsRow.invoicePayUrlTemplate,
    }
    const wire = JSON.parse(JSON.stringify({ data: publicProfile }))
    const parsed = z.object({ data: publicOperatorProfileSchema.nullable() }).safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })
})
