/**
 * Operator settings HTTP routes — the admin/public CRUD surface over the
 * settings service. Absolute paths (kept stable from the prior deployment-local
 * routes): `/v1/admin/settings/*`, `/v1/public/operator-profile`,
 * `/v1/public/settings/operator`.
 *
 * Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114 —
 * operator-settings batch). The legs are authored as `createRoute(...).openapi(...)`
 * on a child `OpenAPIHono<Env>` chain (carrying the shared `openApiValidationHook`),
 * composed onto the supplied mount target via `.route("/", child)`. The module is
 * mounted lazily (see `api-runtime.ts`), which builds an `OpenAPIHono` so the
 * build-time `mergeLazyOpenApiPaths` replay reads these `.openapi()` operations
 * and surfaces them in the operator spec.
 *
 * PATCH legs reuse the package's existing `update*Schema` validation as the
 * request body and read the validated patch via `c.req.valid("json")` (the child
 * chain's `defaultHook` shapes invalid input). Response row schemas are authored
 * here from the Drizzle `$inferSelect` shapes (§17: timestamps → ISO strings;
 * opaque jsonb payment-policy blobs are pass-throughs). Single-row readers return
 * `null` when unset, so every `{ data }` envelope is nullable. Business logic is
 * unchanged.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook } from "@voyant-travel/hono"
import type { StorageProvider } from "@voyant-travel/storage"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context, Hono } from "hono"

import { mountPaymentProviderRoutes } from "./payment-provider-routes.js"

import {
  getOperatorPaymentDefaults,
  getOperatorPaymentInstructions,
  getOperatorProfile,
  getOperatorSettings,
  type PublicOperatorBrandingUrls,
  toPublicOperatorProfile,
  toPublicOperatorSettings,
  updateOperatorPaymentDefaultsSchema,
  updateOperatorPaymentInstructionsSchema,
  updateOperatorProfileSchema,
  updateOperatorSettingsSchema,
  upsertOperatorPaymentDefaults,
  upsertOperatorPaymentInstructions,
  upsertOperatorProfile,
  upsertOperatorSettings,
} from "./service.js"

type Env = { Variables: { db: PostgresJsDatabase } }

/**
 * Structural mount target — just the `.route()` surface this function uses.
 * Decoupled from Hono's full generic signature so the lazy loader can pass its
 * `OpenAPIHono` instance without coupling to its Env/Schema/BasePath params.
 */
export interface OpenApiMountTarget {
  // biome-ignore lint/suspicious/noExplicitAny: intentional — accept any Env-typed sub-app; the mount only composes routes (voyant#2114)
  route(path: string, app: Hono<any, any, any>): unknown
}

export interface OperatorSettingsRoutesOptions {
  resolveBrandingStorage?(): StorageProvider | null
}

const PUBLIC_OPERATOR_SETTINGS_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=600"

function cachePublicOperatorSettings(c: Context) {
  c.header("Cache-Control", PUBLIC_OPERATOR_SETTINGS_CACHE_CONTROL)
}

// ──────────────────────────────────────────────────────────────────
// Response schemas (Drizzle `$inferSelect` → wire shapes)
// ──────────────────────────────────────────────────────────────────

const isoTimestamp = z.string()
/** Opaque jsonb payment-policy blob (mirrors finance `PaymentPolicy`). */
const opaqueJson = z.unknown().nullable()

/** `operator_profile` row. All identity/contact columns are nullable text. */
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

/** `operator_payment_instructions` row. */
const operatorPaymentInstructionsRowSchema = z.object({
  id: z.string(),
  bankTransferBeneficiary: z.string().nullable(),
  iban: z.string().nullable(),
  bank: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

/** `operator_payment_defaults` row. */
const operatorPaymentDefaultsRowSchema = z.object({
  id: z.string(),
  customerPaymentPolicy: opaqueJson,
  bookingCheckoutUrlTemplate: z.string().nullable(),
  invoicePayUrlTemplate: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

/**
 * Combined settings — `getOperatorSettings` spreads the profile row and folds in
 * the instruction + defaults columns (or returns `null` when nothing is set).
 * Profile fields are optional because the spread is empty when no profile row
 * exists yet.
 */
const combinedOperatorSettingsSchema = operatorProfileRowSchema.partial().extend({
  bankTransferBeneficiary: z.string().nullable(),
  iban: z.string().nullable(),
  bank: z.string().nullable(),
  notes: z.string().nullable(),
  customerPaymentPolicy: opaqueJson,
  bookingCheckoutUrlTemplate: z.string().nullable(),
  invoicePayUrlTemplate: z.string().nullable(),
})

/** Public projection — `toPublicOperatorProfile` / `toPublicOperatorSettings`. */
const publicOperatorProfileSchema = z.object({
  name: z.string(),
  legalName: z.string(),
  address: z.string(),
  phone: z.string(),
  email: z.string(),
  website: z.string(),
  logoLightAssetKey: z.string().nullable(),
  logoLightUrl: z.string().nullable(),
  logoLightMimeType: z.string().nullable(),
  logoDarkAssetKey: z.string().nullable(),
  logoDarkUrl: z.string().nullable(),
  logoDarkMimeType: z.string().nullable(),
  iconLightAssetKey: z.string().nullable(),
  iconLightUrl: z.string().nullable(),
  iconLightMimeType: z.string().nullable(),
  iconDarkAssetKey: z.string().nullable(),
  iconDarkUrl: z.string().nullable(),
  iconDarkMimeType: z.string().nullable(),
  brandColor: z.string(),
  cornerRadius: z.string(),
  headingFont: z.string(),
  bodyFont: z.string(),
  faviconAssetKey: z.string().nullable(),
  faviconUrl: z.string().nullable(),
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

function dataEnvelope<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ data: schema })
}

const jsonContent = <T extends z.ZodTypeAny>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
})

const jsonBody = <T extends z.ZodTypeAny>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
})

/**
 * Bridges a handler's `{ data: Row | null }` payload (Date-bearing Drizzle rows
 * whose wire shape is the declared `z.string()` timestamp) to the `.openapi()`
 * inferred typed-response union. Runtime payloads honor the declared schemas
 * (asserted by the contract tests); this only relaxes the compile-time check.
 */
// biome-ignore lint/suspicious/noExplicitAny: intentional — bridges Date-bearing rows to the inferred typed-response union (voyant#2114)
function asRouteResponse(response: Promise<Response>): Promise<any> {
  return response
}

// ──────────────────────────────────────────────────────────────────
// Route definitions
// ──────────────────────────────────────────────────────────────────

const getOperatorProfileRoute = createRoute({
  method: "get",
  path: "/v1/admin/settings/operator-profile",
  responses: {
    200: jsonContent(dataEnvelope(operatorProfileRowSchema.nullable()), "The operator profile"),
  },
})

const patchOperatorProfileRoute = createRoute({
  method: "patch",
  path: "/v1/admin/settings/operator-profile",
  request: { body: jsonBody(updateOperatorProfileSchema) },
  responses: {
    200: jsonContent(
      dataEnvelope(operatorProfileRowSchema.nullable()),
      "The updated operator profile",
    ),
  },
})

const getOperatorPaymentInstructionsRoute = createRoute({
  method: "get",
  path: "/v1/admin/settings/operator-payment-instructions",
  responses: {
    200: jsonContent(
      dataEnvelope(operatorPaymentInstructionsRowSchema.nullable()),
      "The operator payment instructions",
    ),
  },
})

const patchOperatorPaymentInstructionsRoute = createRoute({
  method: "patch",
  path: "/v1/admin/settings/operator-payment-instructions",
  request: { body: jsonBody(updateOperatorPaymentInstructionsSchema) },
  responses: {
    200: jsonContent(
      dataEnvelope(operatorPaymentInstructionsRowSchema.nullable()),
      "The updated operator payment instructions",
    ),
  },
})

const getOperatorPaymentDefaultsRoute = createRoute({
  method: "get",
  path: "/v1/admin/settings/operator-payment-defaults",
  responses: {
    200: jsonContent(
      dataEnvelope(operatorPaymentDefaultsRowSchema.nullable()),
      "The operator payment defaults",
    ),
  },
})

const patchOperatorPaymentDefaultsRoute = createRoute({
  method: "patch",
  path: "/v1/admin/settings/operator-payment-defaults",
  request: { body: jsonBody(updateOperatorPaymentDefaultsSchema) },
  responses: {
    200: jsonContent(
      dataEnvelope(operatorPaymentDefaultsRowSchema.nullable()),
      "The updated operator payment defaults",
    ),
  },
})

const getPublicOperatorProfileRoute = createRoute({
  "x-voyant-api-id": "@voyant-travel/operator-settings#api.public.operator-profile",
  method: "get",
  path: "/v1/public/operator-profile",
  responses: {
    200: jsonContent(
      dataEnvelope(publicOperatorProfileSchema.nullable()),
      "The public operator profile (null when unset)",
    ),
  },
})

const getOperatorSettingsRoute = createRoute({
  method: "get",
  path: "/v1/admin/settings/operator",
  responses: {
    200: jsonContent(
      dataEnvelope(combinedOperatorSettingsSchema.nullable()),
      "The combined operator settings",
    ),
  },
})

const patchOperatorSettingsRoute = createRoute({
  method: "patch",
  path: "/v1/admin/settings/operator",
  request: { body: jsonBody(updateOperatorSettingsSchema) },
  responses: {
    200: jsonContent(
      dataEnvelope(combinedOperatorSettingsSchema.nullable()),
      "The updated combined operator settings",
    ),
  },
})

const getPublicOperatorSettingsRoute = createRoute({
  "x-voyant-api-id": "@voyant-travel/operator-settings#api.public.settings",
  method: "get",
  path: "/v1/public/settings/operator",
  responses: {
    200: jsonContent(
      dataEnvelope(publicOperatorProfileSchema.nullable()),
      "The public operator settings (null when unset)",
    ),
  },
})

const brandingAssetSlotSchema = z.enum([
  "logo-light",
  "logo-dark",
  "icon-light",
  "icon-dark",
  "favicon",
])

type BrandingAssetSlot = z.infer<typeof brandingAssetSlotSchema>
type OperatorBrandingProfile = {
  logoLightAssetKey?: string | null
  logoDarkAssetKey?: string | null
  iconLightAssetKey?: string | null
  iconDarkAssetKey?: string | null
  faviconAssetKey?: string | null
}

const BRANDING_ASSET_FIELDS = {
  "logo-light": { key: "logoLightAssetKey", mimeType: "logoLightMimeType" },
  "logo-dark": { key: "logoDarkAssetKey", mimeType: "logoDarkMimeType" },
  "icon-light": { key: "iconLightAssetKey", mimeType: "iconLightMimeType" },
  "icon-dark": { key: "iconDarkAssetKey", mimeType: "iconDarkMimeType" },
  favicon: { key: "faviconAssetKey", mimeType: "faviconMimeType" },
} as const

const getPublicOperatorBrandingAssetRoute = createRoute({
  "x-voyant-api-id": "@voyant-travel/operator-settings#api.public.branding-assets",
  method: "get",
  path: "/v1/public/operator-branding/{slot}",
  request: { params: z.object({ slot: brandingAssetSlotSchema }) },
  responses: {
    200: { description: "The configured public operator branding asset" },
    404: { description: "The branding slot or stored object does not exist" },
    503: { description: "Media storage is not configured" },
  },
})

function isPublicMediaUrl(value: string | null | undefined): value is string {
  if (!value) return false
  try {
    const url = new URL(value, "https://voyant.invalid")
    if (url.protocol !== "http:" && url.protocol !== "https:") return false
    return !url.pathname.includes("/v1/admin/media/")
  } catch {
    return false
  }
}

export function resolvePublicBrandingUrl(
  storage: StorageProvider | null,
  key: string | null,
  slot: BrandingAssetSlot,
): string | null {
  if (!key || !storage) return null
  const providerUrl = storage.publicUrl?.(key)
  return isPublicMediaUrl(providerUrl) ? providerUrl : `/v1/public/operator-branding/${slot}`
}

function publicBrandingUrls(
  profile: OperatorBrandingProfile,
  storage: StorageProvider | null,
): PublicOperatorBrandingUrls {
  return {
    logoLightUrl: resolvePublicBrandingUrl(
      storage,
      profile.logoLightAssetKey ?? null,
      "logo-light",
    ),
    logoDarkUrl: resolvePublicBrandingUrl(storage, profile.logoDarkAssetKey ?? null, "logo-dark"),
    iconLightUrl: resolvePublicBrandingUrl(
      storage,
      profile.iconLightAssetKey ?? null,
      "icon-light",
    ),
    iconDarkUrl: resolvePublicBrandingUrl(storage, profile.iconDarkAssetKey ?? null, "icon-dark"),
    faviconUrl: resolvePublicBrandingUrl(storage, profile.faviconAssetKey ?? null, "favicon"),
  }
}

function safeBrandingContentType(value: string | null): string {
  return value?.startsWith("image/") && value !== "image/svg+xml"
    ? value
    : "application/octet-stream"
}

export function mountOperatorSettingsRoutes(
  hono: OpenApiMountTarget,
  options: OperatorSettingsRoutesOptions = {},
): void {
  const resolveBrandingStorage = () => options.resolveBrandingStorage?.() ?? null
  const routes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(getOperatorProfileRoute, (c) =>
      asRouteResponse((async () => c.json({ data: await getOperatorProfile(c.get("db")) }, 200))()),
    )
    .openapi(patchOperatorProfileRoute, (c) =>
      asRouteResponse(
        (async () =>
          c.json({ data: await upsertOperatorProfile(c.get("db"), c.req.valid("json")) }, 200))(),
      ),
    )
    .openapi(getOperatorPaymentInstructionsRoute, (c) =>
      asRouteResponse(
        (async () => c.json({ data: await getOperatorPaymentInstructions(c.get("db")) }, 200))(),
      ),
    )
    .openapi(patchOperatorPaymentInstructionsRoute, (c) =>
      asRouteResponse(
        (async () =>
          c.json(
            { data: await upsertOperatorPaymentInstructions(c.get("db"), c.req.valid("json")) },
            200,
          ))(),
      ),
    )
    .openapi(getOperatorPaymentDefaultsRoute, (c) =>
      asRouteResponse(
        (async () => c.json({ data: await getOperatorPaymentDefaults(c.get("db")) }, 200))(),
      ),
    )
    .openapi(patchOperatorPaymentDefaultsRoute, (c) =>
      asRouteResponse(
        (async () =>
          c.json(
            { data: await upsertOperatorPaymentDefaults(c.get("db"), c.req.valid("json")) },
            200,
          ))(),
      ),
    )
    .openapi(getPublicOperatorProfileRoute, (c) =>
      asRouteResponse(
        (async () => {
          const db = c.get("db")
          const [profile, defaults] = await Promise.all([
            getOperatorProfile(db),
            getOperatorPaymentDefaults(db),
          ])
          cachePublicOperatorSettings(c)
          if (!profile) return c.json({ data: null }, 200)
          return c.json(
            {
              data: toPublicOperatorProfile(
                profile,
                defaults,
                publicBrandingUrls(profile, resolveBrandingStorage()),
              ),
            },
            200,
          )
        })(),
      ),
    )
    .openapi(getOperatorSettingsRoute, (c) =>
      asRouteResponse(
        (async () => c.json({ data: await getOperatorSettings(c.get("db")) }, 200))(),
      ),
    )
    .openapi(patchOperatorSettingsRoute, (c) =>
      asRouteResponse(
        (async () =>
          c.json({ data: await upsertOperatorSettings(c.get("db"), c.req.valid("json")) }, 200))(),
      ),
    )
    .openapi(getPublicOperatorSettingsRoute, (c) =>
      asRouteResponse(
        (async () => {
          const row = await getOperatorSettings(c.get("db"))
          cachePublicOperatorSettings(c)
          if (!row) return c.json({ data: null }, 200)
          return c.json(
            {
              data: toPublicOperatorSettings(
                row,
                publicBrandingUrls(row, resolveBrandingStorage()),
              ),
            },
            200,
          )
        })(),
      ),
    )
    .openapi(getPublicOperatorBrandingAssetRoute, (c) =>
      asRouteResponse(
        (async () => {
          const fields = BRANDING_ASSET_FIELDS[c.req.valid("param").slot]
          const profile = await getOperatorProfile(c.get("db"))
          const key = profile?.[fields.key]
          if (!profile || !key) return c.json({ error: "Not found" }, 404)

          const storage = resolveBrandingStorage()
          if (!storage) return c.json({ error: "Storage not configured" }, 503)
          const bytes = await storage.get(key)
          if (!bytes) return c.json({ error: "Not found" }, 404)

          return new Response(bytes, {
            headers: {
              "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
              "Content-Length": String(bytes.byteLength),
              "Content-Type": safeBrandingContentType(profile[fields.mimeType]),
              "X-Content-Type-Options": "nosniff",
            },
          })
        })(),
      ),
    )

  hono.route("/", routes)
  mountPaymentProviderRoutes(hono)
}
