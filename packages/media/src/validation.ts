/**
 * `@voyant-travel/media` request/DTO validation — Zod schemas shared by the
 * service and the HTTP routes. List queries extend the shared `paginationSchema`
 * from `@voyant-travel/types`; list responses use `listResponseSchema`.
 */

import { paginationSchema } from "@voyant-travel/types"
import { z } from "zod"

/** The three asset kinds the library catalogues. */
export const mediaAssetTypeSchema = z.enum(["image", "video", "document"])
export type MediaAssetTypeInput = z.infer<typeof mediaAssetTypeSchema>

const tagsSchema = z.array(z.string().trim().min(1).max(64)).max(64)
export const mediaLanguageTagSchema = z
  .string()
  .trim()
  .min(2)
  .max(35)
  .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)

export const mediaAltTranslationSchema = z.object({
  languageTag: mediaLanguageTagSchema,
  altText: z.string().trim().min(1).max(1_024),
})
export type MediaAltTranslationInput = z.infer<typeof mediaAltTranslationSchema>

const mediaAltTranslationsSchema = z
  .array(mediaAltTranslationSchema)
  .max(64)
  .superRefine((translations, context) => {
    const seen = new Set<string>()
    for (const [index, translation] of translations.entries()) {
      const canonical = translation.languageTag.toLowerCase()
      if (seen.has(canonical)) {
        context.addIssue({
          code: "custom",
          message: "Language tags must be unique",
          path: [index, "languageTag"],
        })
      }
      seen.add(canonical)
    }
  })

/**
 * Metadata supplied when creating an asset. The bytes themselves are passed to
 * the service out-of-band (multipart upload / buffer); dedup is computed from
 * the bytes, not from this metadata.
 */
export const createMediaAssetSchema = z
  .object({
    type: mediaAssetTypeSchema,
    storageClass: z.enum(["media", "documents"]).default("media"),
    name: z.string().trim().min(1).max(255),
    altText: z.string().trim().max(1_024).nullish(),
    defaultLanguageTag: mediaLanguageTagSchema.default("en"),
    altTranslations: mediaAltTranslationsSchema.optional(),
    mimeType: z.string().max(255).nullish(),
    tags: tagsSchema.optional(),
    width: z.number().int().positive().nullish(),
    height: z.number().int().positive().nullish(),
    durationMs: z.number().int().nonnegative().nullish(),
    providerMeta: z.record(z.string(), z.unknown()).nullish(),
    createdBy: z.string().max(255).nullish(),
    /** Optional initial folder membership. */
    folderIds: z.array(z.string().trim().min(1)).max(64).optional(),
  })
  .superRefine((input, context) => {
    const baseLanguage = input.defaultLanguageTag.toLowerCase()
    const duplicateIndex = input.altTranslations?.findIndex(
      (translation) => translation.languageTag.toLowerCase() === baseLanguage,
    )
    if (duplicateIndex !== undefined && duplicateIndex >= 0) {
      context.addIssue({
        code: "custom",
        message: "The default language belongs in altText, not altTranslations",
        path: ["altTranslations", duplicateIndex, "languageTag"],
      })
    }
  })
export type CreateMediaAssetInput = z.infer<typeof createMediaAssetSchema>

/**
 * Editable asset fields. `folderIds`, when present, *replaces* the asset's
 * folder membership set.
 */
export const updateMediaAssetSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    altText: z.string().trim().max(1_024).nullish(),
    defaultLanguageTag: mediaLanguageTagSchema.optional(),
    altTranslations: mediaAltTranslationsSchema.optional(),
    tags: tagsSchema.optional(),
    folderIds: z.array(z.string().trim().min(1)).max(64).optional(),
  })
  .superRefine((input, context) => {
    if (!input.defaultLanguageTag) return
    const baseLanguage = input.defaultLanguageTag.toLowerCase()
    const duplicateIndex = input.altTranslations?.findIndex(
      (translation) => translation.languageTag.toLowerCase() === baseLanguage,
    )
    if (duplicateIndex !== undefined && duplicateIndex >= 0) {
      context.addIssue({
        code: "custom",
        message: "The default language belongs in altText, not altTranslations",
        path: ["altTranslations", duplicateIndex, "languageTag"],
      })
    }
  })
export type UpdateMediaAssetInput = z.infer<typeof updateMediaAssetSchema>

/** Filters + pagination for the asset list/search endpoint. */
export const listMediaAssetsQuerySchema = paginationSchema.extend({
  type: mediaAssetTypeSchema.optional(),
  tag: z.string().trim().min(1).max(64).optional(),
  folderId: z.string().trim().min(1).optional(),
  mimeType: z.string().trim().min(1).max(255).optional(),
  /** Case-insensitive substring match on the asset name. */
  name: z.string().trim().min(1).max(255).optional(),
})
export type ListMediaAssetsQuery = z.infer<typeof listMediaAssetsQuerySchema>

export const createMediaFolderSchema = z.object({
  name: z.string().trim().min(1).max(255),
  parentId: z.string().trim().min(1).nullish(),
})
export type CreateMediaFolderInput = z.infer<typeof createMediaFolderSchema>

export const updateMediaFolderSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  parentId: z.string().trim().min(1).nullish(),
})
export type UpdateMediaFolderInput = z.infer<typeof updateMediaFolderSchema>

export const listMediaFoldersQuerySchema = paginationSchema.extend({
  parentId: z.string().trim().min(1).optional(),
})
export type ListMediaFoldersQuery = z.infer<typeof listMediaFoldersQuerySchema>

/** Body for adding an asset to a folder (folder id comes from the route path). */
export const folderMemberBodySchema = z.object({
  assetId: z.string().trim().min(1),
})
export type FolderMemberBody = z.infer<typeof folderMemberBodySchema>

export const recordAssetUsageSchema = z.object({
  assetId: z.string().trim().min(1),
  entityType: z.string().trim().min(1).max(128),
  entityId: z.string().trim().min(1).max(255),
})
export type RecordAssetUsageInput = z.infer<typeof recordAssetUsageSchema>

export const listAssetUsageQuerySchema = paginationSchema.extend({
  assetId: z.string().trim().min(1).optional(),
  entityType: z.string().trim().min(1).max(128).optional(),
})
export type ListAssetUsageQuery = z.infer<typeof listAssetUsageQuerySchema>
