import { createHash } from "node:crypto"
import { z } from "zod"
import { type AppManifest, appManifestSchema } from "./contracts.js"

/**
 * The subset of the deployment's event catalog this compiler reads.
 *
 * Declared structurally rather than imported from `@voyant-travel/core` so a
 * publisher can compile a manifest without the framework runtime. The host
 * passes its real `VoyantGraphEventCatalog`, which satisfies this shape.
 */
export interface AppManifestEventCatalogEntry {
  eventType: string
  version: string
  visibility: "internal" | "external"
  payloadSchema: unknown
}

export interface AppManifestEventCatalog {
  events: readonly AppManifestEventCatalogEntry[]
}

export interface CompiledAppManifest {
  manifest: AppManifest
  canonicalJson: string
  digest: string
  normalizedRelease: NormalizedAppReleaseRecord
}

export interface NormalizedAppReleaseRecord {
  schemaVersion: "voyant.app-release.normalized.v1"
  manifestSchemaVersion: AppManifest["schemaVersion"]
  releaseVersion: string
  digest: string
  apiCompatibility: AppManifest["apiCompatibility"]
  requestedScopes: readonly string[]
  optionalScopes: readonly string[]
  adminPages: AppManifest["admin"]["pages"]
  slotExtensions: AppManifest["admin"]["slotExtensions"]
  webhooks: AppManifest["webhooks"]
  customFields: AppManifest["customFields"]
  defaultLocale: string
  supportedLocales: readonly string[]
  localizations: readonly NormalizedLocalization[]
  urls: AppManifest["urls"]
  data: AppManifest["data"]
}

export interface NormalizedLocalization {
  locale: string
  surface: string
  messageKey: string
  text: string
}

export interface CompileAppManifestOptions {
  eventCatalog?: AppManifestEventCatalog
}

export function compileAppManifest(
  input: unknown,
  options: CompileAppManifestOptions = {},
): CompiledAppManifest {
  const manifest = appManifestSchema.parse(input)
  validateWebhookSubscriptions(manifest, options.eventCatalog)
  const normalized = normalizeManifest(manifest)
  const canonicalJson = canonicalJsonStringify(normalized)
  const digest = `sha256:${createHash("sha256").update(canonicalJson).digest("hex")}`
  return {
    manifest,
    canonicalJson,
    digest,
    normalizedRelease: {
      schemaVersion: "voyant.app-release.normalized.v1",
      manifestSchemaVersion: manifest.schemaVersion,
      releaseVersion: manifest.releaseVersion,
      digest,
      apiCompatibility: manifest.apiCompatibility,
      requestedScopes: normalized.scopes.requested,
      optionalScopes: normalized.scopes.optional,
      adminPages: normalized.admin.pages,
      slotExtensions: normalized.admin.slotExtensions,
      webhooks: normalized.webhooks,
      customFields: normalized.customFields,
      defaultLocale: normalized.locales.default,
      supportedLocales: normalized.locales.supported,
      localizations: flattenLocalizations(normalized),
      urls: normalized.urls,
      data: normalized.data,
    },
  }
}

export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item))
  if (!value || typeof value !== "object") return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalize(record[key])]),
  )
}

/**
 * External delivery is deny-by-default and requires an explicit object property
 * allowlist. Kept in step with `isExternalWebhookPayloadSchema` in
 * `@voyant-travel/core/project`, which is the host-side authority; the check is
 * restated here so compiling a manifest does not pull in the framework.
 */
function isExternalWebhookPayloadSchema(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const schema = value as Record<string, unknown>
  return (
    schema.type === "object" &&
    schema.properties !== null &&
    typeof schema.properties === "object" &&
    !Array.isArray(schema.properties)
  )
}

function normalizeManifest(manifest: AppManifest): AppManifest {
  return {
    ...manifest,
    scopes: {
      requested: sortedUnique(manifest.scopes.requested),
      optional: sortedUnique(manifest.scopes.optional),
    },
    admin: {
      // Resolve the app-level default icon into each page that omits its own,
      // so every normalized/persisted page carries a concrete icon or none.
      pages: [...manifest.admin.pages]
        .map((page) => {
          const icon = page.icon ?? manifest.icon
          return icon ? { ...page, icon } : page
        })
        .sort(byKey),
      slotExtensions: [...manifest.admin.slotExtensions]
        .map((extension) => ({ ...extension, slots: sortedUnique(extension.slots) }))
        .sort(byKey),
    },
    webhooks: [...manifest.webhooks].sort((left, right) =>
      `${left.eventType}:${left.eventVersion}`.localeCompare(
        `${right.eventType}:${right.eventVersion}`,
      ),
    ),
    customFields: [...manifest.customFields].sort((left, right) =>
      `${left.entityType}:${left.logicalNamespace ?? ""}:${left.key}`.localeCompare(
        `${right.entityType}:${right.logicalNamespace ?? ""}:${right.key}`,
      ),
    ),
    locales: {
      default: manifest.locales.default,
      supported: sortedUnique(manifest.locales.supported),
      host: Object.fromEntries(
        Object.entries(manifest.locales.host).sort(([left], [right]) => left.localeCompare(right)),
      ),
    },
    data: {
      ...manifest.data,
      classifications: sortedUnique(manifest.data.classifications),
    },
  }
}

function validateWebhookSubscriptions(
  manifest: AppManifest,
  eventCatalog?: AppManifestEventCatalog,
) {
  if (
    manifest.webhooks.length > 0 &&
    !manifest.scopes.requested.includes("app-webhooks:configure")
  ) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["scopes", "requested"],
        message: 'Apps declaring webhooks must request the "app-webhooks:configure" scope.',
        input: manifest.scopes.requested,
      },
    ])
  }
  if (!eventCatalog) return
  const externalEvents = new Set<string>()
  for (const event of eventCatalog.events) {
    if (event.visibility === "external" && isExternalWebhookPayloadSchema(event.payloadSchema)) {
      externalEvents.add(`${event.eventType}:${event.version}`)
    }
  }
  for (const subscription of manifest.webhooks) {
    if (!externalEvents.has(`${subscription.eventType}:${subscription.eventVersion}`)) {
      throw new z.ZodError([
        {
          code: "custom",
          path: ["webhooks"],
          message: `Webhook subscription "${subscription.eventType}" version "${subscription.eventVersion}" is not an external event contract in the selected graph.`,
          input: subscription,
        },
      ])
    }
  }
}

function flattenLocalizations(manifest: AppManifest): NormalizedLocalization[] {
  const rows: NormalizedLocalization[] = []
  for (const [locale, metadata] of Object.entries(manifest.locales.host)) {
    rows.push({ locale, surface: "app", messageKey: "name", text: metadata.name })
    rows.push({ locale, surface: "app", messageKey: "summary", text: metadata.summary })
    for (const [key, text] of Object.entries(metadata.navigation)) {
      rows.push({ locale, surface: "navigation", messageKey: key, text })
    }
    for (const [key, text] of Object.entries(metadata.extensions)) {
      rows.push({ locale, surface: "extension", messageKey: key, text })
    }
    for (const [key, text] of Object.entries(metadata.setup)) {
      rows.push({ locale, surface: "setup", messageKey: key, text })
    }
  }
  return rows.sort((left, right) =>
    `${left.locale}:${left.surface}:${left.messageKey}`.localeCompare(
      `${right.locale}:${right.surface}:${right.messageKey}`,
    ),
  )
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function byKey(left: { key: string }, right: { key: string }) {
  return left.key.localeCompare(right.key)
}
