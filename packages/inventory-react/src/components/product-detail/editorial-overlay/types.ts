import { z } from "zod"

import type { ProductDetailMessages } from "../host.js"

/**
 * Admin editorial-overlay read model (RFC #3666 phase 2). The payload comes
 * from `GET /v1/admin/products/{id}/editorial-overlays`; content bodies stay
 * `unknown` here because the vertical content schema is validated server-side
 * and this surface only renders declared, eligible fields.
 */
export const editorialOverlayFieldStateSchema = z.enum([
  "exact",
  "language-fallback",
  "source-fallback",
  "overlaid",
  "overlay-only",
  "missing",
  "invalid",
  "orphaned",
])

export const editorialOverlayFieldKindSchema = z.enum([
  "text",
  "long-text",
  "html",
  "string-list",
  "media",
])

export const editorialOverlayFieldSchema = z.object({
  state: editorialOverlayFieldStateSchema,
  kind: editorialOverlayFieldKindSchema,
  nodeKind: z.string(),
  nodeKey: z.string(),
  fieldPath: z.string(),
  sourceValue: z.unknown(),
  overlayValue: z.unknown(),
  effectiveValue: z.unknown(),
  drifted: z.boolean(),
  invalidReason: z.string().nullable(),
  version: z.number().nullable(),
  id: z.string().nullable(),
  updatedAt: z.string().nullable(),
  /** Staff-only audit provenance — admin surfaces only, never public. */
  origin: z.object({ kind: z.string() }).loose().nullable(),
  editorialNote: z.string().nullable(),
})

export const editorialOverlayNodeSchema = z.object({
  nodeKind: z.string(),
  nodeKey: z.string(),
  dayNumber: z.number().nullable(),
  label: z.string().nullable(),
})

export const editorialOverlayStateSchema = z.object({
  data: z.object({
    subject: z.object({ module: z.string(), id: z.string() }),
    contentSource: z.string(),
    locale: z.object({
      requestedLocale: z.string(),
      sourceLocale: z.string().nullable(),
      servedLocale: z.string().nullable(),
      matchKind: z.string(),
    }),
    source: z.unknown(),
    effective: z.unknown(),
    nodes: z.array(editorialOverlayNodeSchema),
    fields: z.record(z.string(), editorialOverlayFieldSchema),
    sourceUpdatedAt: z.string().nullable(),
    availableSourceLocales: z.array(z.string()),
    availableOverlayLocales: z.array(z.string()),
  }),
})

export type EditorialOverlayFieldState = z.infer<typeof editorialOverlayFieldStateSchema>
export type EditorialOverlayFieldKind = z.infer<typeof editorialOverlayFieldKindSchema>
export type EditorialOverlayField = z.infer<typeof editorialOverlayFieldSchema>
export type EditorialOverlayNode = z.infer<typeof editorialOverlayNodeSchema>
export type EditorialOverlayState = z.infer<typeof editorialOverlayStateSchema>["data"]

export type EditorialMessages = ProductDetailMessages["products"]["editorial"]

/** Customer-facing effective content the preview renders. */
export interface EditorialEffectiveContent {
  product?: {
    name?: string | null
    description?: string | null
    hero_image_url?: string | null
    highlights?: string[] | null
  }
  days?: Array<{
    id?: string
    day_number?: number
    title?: string | null
    description?: string | null
    hero_image_url?: string | null
  }>
}

export function stateLabel(state: EditorialOverlayFieldState, m: EditorialMessages): string {
  switch (state) {
    case "exact":
      return m.stateExact
    case "language-fallback":
      return m.stateLanguageFallback
    case "source-fallback":
      return m.stateSourceFallback
    case "overlaid":
      return m.stateOverlaid
    case "overlay-only":
      return m.stateOverlayOnly
    case "missing":
      return m.stateMissing
    case "invalid":
      return m.stateInvalid
    case "orphaned":
      return m.stateOrphaned
  }
}

export function localeMatchLabel(matchKind: string, m: EditorialMessages): string {
  switch (matchKind) {
    case "exact":
      return m.stateExact
    case "language-fallback":
      return m.stateLanguageFallback
    case "source-fallback":
      return m.stateSourceFallback
    case "overlay-only":
      return m.stateOverlayOnly
    case "mixed":
      return m.stateMixed
    default:
      return m.stateMissing
  }
}

export function stateBadgeVariant(
  state: EditorialOverlayFieldState,
): "default" | "secondary" | "destructive" | "outline" {
  if (state === "invalid" || state === "orphaned") return "destructive"
  if (state === "overlaid" || state === "overlay-only") return "default"
  if (state === "missing") return "outline"
  return "secondary"
}

export function fieldLabel(field: EditorialOverlayField, m: EditorialMessages): string {
  if (field.nodeKind === "itinerary-day") {
    switch (field.fieldPath) {
      case "title":
        return m.fieldDayTitle
      case "description":
        return m.fieldDayDescription
      case "hero_image_url":
        return m.fieldDayHeroImage
      case "services":
        return m.fieldDayServices
      default:
        return field.fieldPath
    }
  }
  switch (field.fieldPath) {
    case "/product/name":
      return m.fieldName
    case "/product/description":
      return m.fieldDescription
    case "/product/inclusions_html":
      return m.fieldInclusions
    case "/product/exclusions_html":
      return m.fieldExclusions
    case "/product/terms_html":
      return m.fieldTerms
    case "/product/highlights":
      return m.fieldHighlights
    case "/product/hero_image_url":
      return m.fieldHeroImage
    case "/media":
      return m.fieldGallery
    default:
      return field.fieldPath
  }
}

/** Stable DOM/test id for one overlay target. */
export function fieldTargetKey(field: {
  nodeKind: string
  nodeKey: string
  fieldPath: string
}): string {
  return `${field.nodeKind}:${field.nodeKey}:${field.fieldPath}`
}

export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0
  return false
}

/** Render a field value as plain display text without leaking source internals. */
export function displayValue(value: unknown): string {
  if (isEmptyValue(value)) return ""
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        typeof entry === "string" ? entry : ((entry as { url?: string })?.url ?? ""),
      )
      .filter(Boolean)
      .join("\n")
  }
  return JSON.stringify(value)
}
