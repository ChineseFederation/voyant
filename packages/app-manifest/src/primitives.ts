import { z } from "zod"

/**
 * Shared leaf schemas for the app manifest and the host-side app API.
 *
 * These live here rather than in `@voyant-travel/apps` because a publisher
 * validating a manifest and the host admitting one have to agree on them
 * exactly; a second copy is a drift surface, not a convenience.
 */

export const semverLikeSchema = z.string().trim().min(1).max(64)

export const scopeSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/)

export const localeSchema = z.string().trim().min(2).max(35)

export const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", {
    message: "URL must use https.",
  })

export const dataClassificationSchema = z.enum([
  "public",
  "internal",
  "confidential",
  "restricted",
  "personal",
  "financial",
])
