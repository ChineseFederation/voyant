/**
 * Wire response schemas for the media-library admin API.
 *
 * Request/DTO validation is REUSED from `@voyant-travel/media/validation`
 * (`createMediaAssetSchema`, `updateMediaAssetSchema`, the list-query schemas,
 * folder + usage inputs, and `mediaAssetTypeSchema`). The domain package does
 * not export a zod schema for the serialized *response* rows, so these mirror
 * the wire shapes returned by `packages/media/src/routes.ts` — Drizzle rows
 * serialized to JSON (timestamps as ISO strings, integers as numbers). Field
 * names/types stay in lock-step with `@voyant-travel/media/schema`
 * (`MediaAsset`, `MediaFolder`, `MediaFolderMember`, `AssetUsage`).
 */

import { mediaAssetTypeSchema } from "@voyant-travel/media/validation"
import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"

export { mediaAssetTypeSchema }
export type MediaAssetType = z.infer<typeof mediaAssetTypeSchema>

export const mediaAssetTranslationSchema = z.object({
  assetId: z.string(),
  languageTag: z.string(),
  altText: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type MediaAssetTranslation = z.infer<typeof mediaAssetTranslationSchema>

export const mediaAssetSchema = z.object({
  id: z.string(),
  type: mediaAssetTypeSchema,
  name: z.string(),
  altText: z.string().nullable(),
  defaultLanguageTag: z.string(),
  altTranslations: z.array(mediaAssetTranslationSchema),
  storageKey: z.string(),
  url: z.string().nullable(),
  mimeType: z.string().nullable(),
  fileSize: z.number().nullable(),
  checksum: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  durationMs: z.number().nullable(),
  tags: z.array(z.string()),
  providerMeta: z.unknown().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type MediaAsset = z.infer<typeof mediaAssetSchema>

/**
 * Resolve localized alternative text with a deterministic fallback:
 * requested language, caller-supplied fallback languages, then the asset's
 * default-language text.
 */
export function resolveMediaAltText(
  asset: Pick<MediaAsset, "altText" | "defaultLanguageTag" | "altTranslations">,
  languageTag?: string | null,
  fallbackLanguageTags: readonly string[] = [],
): string | null {
  const requested = [
    ...new Set(
      [languageTag, ...fallbackLanguageTags]
        .filter((value): value is string => Boolean(value?.trim()))
        .flatMap((value) => {
          const normalized = value.trim().toLowerCase()
          const base = normalized.split("-")[0]
          return base && base !== normalized ? [normalized, base] : [normalized]
        }),
    ),
  ]

  for (const tag of requested) {
    if (tag === asset.defaultLanguageTag.toLowerCase() && asset.altText) {
      return asset.altText
    }
    const translation = asset.altTranslations.find(
      (candidate) => candidate.languageTag.toLowerCase() === tag,
    )
    if (translation?.altText) return translation.altText
  }

  return asset.altText ?? asset.altTranslations[0]?.altText ?? null
}

export const mediaFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type MediaFolder = z.infer<typeof mediaFolderSchema>

export const mediaFolderMemberSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  folderId: z.string(),
  createdAt: z.string(),
})
export type MediaFolderMember = z.infer<typeof mediaFolderMemberSchema>

export const assetUsageSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  createdAt: z.string(),
})
export type AssetUsage = z.infer<typeof assetUsageSchema>

/** `{ data }` envelope around a single resource. */
export const mediaAssetEnvelopeSchema = z.object({ data: mediaAssetSchema })
export const mediaFolderEnvelopeSchema = z.object({ data: mediaFolderSchema })
export const mediaFolderMemberEnvelopeSchema = z.object({ data: mediaFolderMemberSchema })
export const assetUsageEnvelopeSchema = z.object({ data: assetUsageSchema })

/** The upload leg returns `{ data, deduped }` (200 when an identical asset already existed). */
export const uploadMediaAssetResponseSchema = z.object({
  data: mediaAssetSchema,
  deduped: z.boolean().optional(),
})

export const removeFolderMemberResponseSchema = z.object({
  data: z.object({ removed: z.boolean() }),
})

/** `{ data, total, limit, offset }` list envelopes. */
export const mediaAssetListResponseSchema = listResponseSchema(mediaAssetSchema)
export const mediaFolderListResponseSchema = listResponseSchema(mediaFolderSchema)
export const assetUsageListResponseSchema = listResponseSchema(assetUsageSchema)
