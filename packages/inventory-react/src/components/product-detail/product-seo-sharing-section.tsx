"use client"

import { formatMessage } from "@voyant-travel/i18n"
import {
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@voyant-travel/ui/components"
import { Image as MediaImage } from "@voyant-travel/ui/components/image"
import { Loader2, Plus, Upload } from "lucide-react"
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react"
import {
  type ProductRecord,
  type ProductTranslationRecord,
  useProductTranslationMutation,
  useProductTranslations,
} from "../../index.js"
import { useProductDetailMessages } from "./host.js"
import { formatFileSize, Section } from "./product-detail-section-shell.js"
import type { ProductMediaItem } from "./product-detail-shared.js"

const FALLBACK_MEDIA_VALUE = "__fallback__"
const LARGE_IMAGE_BYTES = 5 * 1024 * 1024
const TARGET_RATIO = 1200 / 630

export interface ProductSeoSharingSectionProps {
  product: ProductRecord
  media: ProductMediaItem[]
  isUploading: boolean
  isSavingImage: boolean
  onUpload: (file: File) => Promise<ProductMediaItem>
  onSetOpenGraph: (mediaId: string | null) => Promise<unknown>
}

export function ProductSeoSharingSection({
  product,
  media,
  isUploading,
  isSavingImage,
  onUpload,
  onSetOpenGraph,
}: ProductSeoSharingSectionProps) {
  const t = useProductDetailMessages().products.core.seoSharing
  const translationsQuery = useProductTranslations(product.id, { limit: 100 })
  const translationMutations = useProductTranslationMutation()
  const translations = translationsQuery.data?.data ?? []
  const languageTags = useMemo(
    () =>
      Array.from(
        new Set(
          [product.defaultLanguageTag, ...translations.map((item) => item.languageTag)].filter(
            (value): value is string => Boolean(value),
          ),
        ),
      ),
    [product.defaultLanguageTag, translations],
  )
  const [languageTag, setLanguageTag] = useState("")
  const [newLanguageTag, setNewLanguageTag] = useState("")
  const [seoTitle, setSeoTitle] = useState("")
  const [seoDescription, setSeoDescription] = useState("")
  const [selectedMediaId, setSelectedMediaId] = useState(FALLBACK_MEDIA_VALUE)
  const [error, setError] = useState<string | null>(null)
  const uploadInput = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const localeId = useId()
  const newLocaleId = useId()
  const openGraphId = useId()

  const selectedTranslation = translations.find((item) => item.languageTag === languageTag) ?? null
  const images = media.filter(
    (item) => item.dayId === null && item.mediaType === "image" && !item.isBrochure,
  )
  const explicitImage = images.find((item) => item.isOpenGraph) ?? null
  const coverImage = images.find((item) => item.isCover) ?? images[0] ?? null
  const selectedImage =
    selectedMediaId === FALLBACK_MEDIA_VALUE
      ? coverImage
      : (images.find((item) => item.id === selectedMediaId) ?? coverImage)

  useEffect(() => {
    if (!languageTag && languageTags.length > 0) setLanguageTag(languageTags[0] ?? "")
  }, [languageTag, languageTags])

  useEffect(() => {
    setSeoTitle(selectedTranslation?.seoTitle ?? "")
    setSeoDescription(selectedTranslation?.seoDescription ?? "")
  }, [selectedTranslation])

  useEffect(() => {
    setSelectedMediaId(explicitImage?.id ?? FALLBACK_MEDIA_VALUE)
  }, [explicitImage?.id])

  const { title: effectiveTitle, description: effectiveDescription } = resolveEffectiveSeoText(
    product,
    selectedTranslation,
    seoTitle,
    seoDescription,
  )
  const isSavingText =
    translationMutations.create.isPending || translationMutations.update.isPending

  async function saveText(nextTitle = seoTitle, nextDescription = seoDescription) {
    setError(null)
    const normalizedLanguageTag = normalizeLanguageTag(languageTag)
    if (!normalizedLanguageTag) {
      setError(t.languageRequired)
      return
    }
    try {
      const input = buildSeoTranslationInput(nextTitle, nextDescription)
      if (selectedTranslation) {
        await translationMutations.update.mutateAsync({
          productId: product.id,
          translationId: selectedTranslation.id,
          input,
        })
      } else {
        await translationMutations.create.mutateAsync({
          productId: product.id,
          input: { languageTag: normalizedLanguageTag, name: product.name, ...input },
        })
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.saveFailed)
    }
  }

  async function uploadImage(file: File) {
    setError(null)
    if (!file.type.startsWith("image/")) {
      setError(t.imageOnly)
      return
    }
    try {
      const item = await onUpload(file)
      await onSetOpenGraph(item.id)
      setSelectedMediaId(item.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.imageSaveFailed)
    }
  }

  async function saveSelectedImage() {
    setError(null)
    try {
      await onSetOpenGraph(selectedMediaId === FALLBACK_MEDIA_VALUE ? null : selectedMediaId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.imageSaveFailed)
    }
  }

  const warnings = imageWarnings(selectedImage, t)

  return (
    <Section title={t.title}>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">{t.description}</p>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={localeId}>{t.locale}</Label>
              <Select value={languageTag} onValueChange={(value) => setLanguageTag(value ?? "")}>
                <SelectTrigger id={localeId} className="w-full">
                  <SelectValue placeholder={t.selectLocale} />
                </SelectTrigger>
                <SelectContent>
                  {languageTags.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={newLocaleId}>{t.newLocale}</Label>
              <div className="flex gap-2">
                <Input
                  id={newLocaleId}
                  value={newLanguageTag}
                  placeholder={t.localePlaceholder}
                  onChange={(event) => setNewLanguageTag(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const normalized = normalizeLanguageTag(newLanguageTag)
                    if (!normalized) return
                    setLanguageTag(normalized)
                    setNewLanguageTag("")
                  }}
                >
                  <Plus className="mr-1.5 size-4" aria-hidden="true" />
                  {t.addLocale}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={titleId}>{t.seoTitle}</Label>
              <AdvisoryCount value={seoTitle} minimum={50} maximum={60} />
            </div>
            <Input
              id={titleId}
              value={seoTitle}
              placeholder={effectiveTitle}
              onChange={(event) => setSeoTitle(event.target.value)}
            />
            {!seoTitle.trim() ? (
              <p className="text-xs text-muted-foreground">
                {t.effectiveFallback.replace("{value}", effectiveTitle)}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={descriptionId}>{t.seoDescription}</Label>
              <AdvisoryCount value={seoDescription} minimum={150} maximum={160} />
            </div>
            <Textarea
              id={descriptionId}
              rows={4}
              value={seoDescription}
              placeholder={effectiveDescription || t.descriptionPlaceholder}
              onChange={(event) => setSeoDescription(event.target.value)}
            />
            {!seoDescription.trim() && effectiveDescription ? (
              <p className="text-xs text-muted-foreground">
                {t.effectiveFallback.replace("{value}", effectiveDescription)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={isSavingText} onClick={() => void saveText()}>
              {isSavingText ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              {t.saveSeo}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSavingText}
              onClick={() => {
                setSeoTitle("")
                setSeoDescription("")
                void saveText("", "")
              }}
            >
              {t.clearSeo}
            </Button>
          </div>
        </div>

        <div className="space-y-3 border-t pt-5">
          <div>
            <Label htmlFor={openGraphId}>{t.openGraphImage}</Label>
            <p className="mt-1 text-xs text-muted-foreground">{t.imageGuidance}</p>
          </div>
          <Select
            value={selectedMediaId}
            onValueChange={(value) => setSelectedMediaId(value ?? FALLBACK_MEDIA_VALUE)}
          >
            <SelectTrigger id={openGraphId} className="w-full">
              <SelectValue placeholder={t.selectImage} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FALLBACK_MEDIA_VALUE}>{t.useCoverFallback}</SelectItem>
              {images.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                  {item.width && item.height ? ` (${item.width}×${item.height})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={isSavingImage} onClick={() => void saveSelectedImage()}>
              {isSavingImage ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              {t.saveImage}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isUploading}
              onClick={() => uploadInput.current?.click()}
            >
              {isUploading ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 size-4" />
              )}
              {t.uploadImage}
            </Button>
            <input
              ref={uploadInput}
              className="hidden"
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (file) void uploadImage(file)
              }}
            />
          </div>
          {warnings.map((warning) => (
            <p key={warning} className="text-xs text-amber-700 dark:text-amber-400">
              {warning}
            </p>
          ))}
        </div>

        <div className="grid gap-4 border-t pt-5 xl:grid-cols-2">
          <Preview title={t.searchPreview}>
            <p className="truncate text-blue-700 text-lg">{effectiveTitle}</p>
            <p className="text-green-700 text-xs">
              {formatMessage(t.previewUrl, { productId: product.id })}
            </p>
            <p className="line-clamp-2 text-sm text-muted-foreground">{effectiveDescription}</p>
          </Preview>
          <Preview title={t.socialPreview}>
            {selectedImage ? (
              <MediaImage
                src={selectedImage.url}
                alt={selectedImage.altText ?? ""}
                className="aspect-[1.91/1] w-full rounded-t border-b object-cover"
              />
            ) : (
              <div className="flex aspect-[1.91/1] items-center justify-center rounded-t border-b bg-muted text-xs text-muted-foreground">
                {t.noImage}
              </div>
            )}
            <div className="p-3">
              <p className="line-clamp-1 font-medium text-sm">{effectiveTitle}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{effectiveDescription}</p>
            </div>
          </Preview>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </Section>
  )
}

function AdvisoryCount({
  value,
  minimum,
  maximum,
}: {
  value: string
  minimum: number
  maximum: number
}) {
  const count = Array.from(value).length
  const variant = count === 0 || (count >= minimum && count <= maximum) ? "secondary" : "outline"
  return (
    <Badge variant={variant}>
      {count} / {minimum}–{maximum}
    </Badge>
  )
}

function Preview({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="overflow-hidden rounded-md border bg-background p-3 [&:has(img)]:p-0 [&:has([data-slot=image-fallback])]:p-0">
        {children}
      </div>
    </div>
  )
}

function normalizeOptional(value: string): string | null {
  const normalized = value.trim()
  return normalized || null
}

export function buildSeoTranslationInput(
  title: string,
  description: string,
): { seoTitle: string | null; seoDescription: string | null } {
  return {
    seoTitle: normalizeOptional(title),
    seoDescription: normalizeOptional(description),
  }
}

function normalizeLanguageTag(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  try {
    return Intl.getCanonicalLocales(trimmed)[0] ?? trimmed
  } catch {
    return trimmed
  }
}

export function resolveEffectiveSeoText(
  product: Pick<ProductRecord, "name" | "description">,
  translation: Pick<ProductTranslationRecord, "name" | "shortDescription" | "description"> | null,
  seoTitle: string,
  seoDescription: string,
): { title: string; description: string } {
  return {
    title: seoTitle.trim() || translation?.name || product.name,
    description:
      seoDescription.trim() ||
      translation?.shortDescription ||
      translation?.description ||
      product.description ||
      "",
  }
}

function imageWarnings(
  image: ProductMediaItem | null,
  messages: ReturnType<typeof useProductDetailMessages>["products"]["core"]["seoSharing"],
): string[] {
  return getOpenGraphImageWarnings(image).map((warning) => {
    if (warning.code === "ratio") return messages.ratioWarning
    if (warning.code === "width")
      return messages.widthWarning.replace("{width}", String(warning.width))
    return messages.fileSizeWarning.replace("{size}", formatFileSize(warning.fileSize))
  })
}

export type OpenGraphImageWarning =
  | { code: "ratio" }
  | { code: "width"; width: number }
  | { code: "file_size"; fileSize: number }

export function getOpenGraphImageWarnings(
  image: Pick<ProductMediaItem, "width" | "height" | "fileSize"> | null,
): OpenGraphImageWarning[] {
  if (!image) return []
  const warnings: OpenGraphImageWarning[] = []
  if (image.width && image.height) {
    if (Math.abs(image.width / image.height - TARGET_RATIO) > 0.1) warnings.push({ code: "ratio" })
    if (image.width < 1200) warnings.push({ code: "width", width: image.width })
  }
  if (image.fileSize && image.fileSize > LARGE_IMAGE_BYTES) {
    warnings.push({ code: "file_size", fileSize: image.fileSize })
  }
  return warnings
}
