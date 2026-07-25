"use client"

import { confirmDialog } from "@voyant-travel/ui/components"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { Input } from "@voyant-travel/ui/components/input"
import { Label } from "@voyant-travel/ui/components/label"
import { NativeSelect, NativeSelectOption } from "@voyant-travel/ui/components/native-select"
import { Separator } from "@voyant-travel/ui/components/separator"
import { Textarea } from "@voyant-travel/ui/components/textarea"
import { AlertTriangle, Loader2, Trash2 } from "lucide-react"
import * as React from "react"
import { isAssetInUseError } from "../client.js"
import { useAssetUsage } from "../hooks/use-asset-usage.js"
import { useDeleteAsset } from "../hooks/use-delete-asset.js"
import { useFolderMutation } from "../hooks/use-folder-mutation.js"
import { useFolders } from "../hooks/use-folders.js"
import { useUpdateAsset } from "../hooks/use-update-asset.js"
import { useMediaUiMessagesOrDefault } from "../i18n/provider.js"
import type { MediaAsset } from "../schemas.js"
import { formatFileSize } from "./shared.js"

export interface MediaAssetDetailPanelProps {
  asset: MediaAsset
  /** When the library is scoped to a folder, enables "remove from this folder". */
  currentFolderId?: string | undefined
  onDeleted?: (asset: MediaAsset) => void
}

/** Detail + edit surface: rename, alt, tags, folder membership, and "where used". */
export function MediaAssetDetailPanel({
  asset,
  currentFolderId,
  onDeleted,
}: MediaAssetDetailPanelProps) {
  const messages = useMediaUiMessagesOrDefault()
  const detail = messages.library.detail
  const update = useUpdateAsset()
  const remove = useDeleteAsset()
  const folderMutation = useFolderMutation()
  const { data: folderData } = useFolders({ limit: 200 })
  const usage = useAssetUsage(asset.id)

  const [name, setName] = React.useState(asset.name)
  const [altText, setAltText] = React.useState(asset.altText ?? "")
  const [defaultLanguageTag, setDefaultLanguageTag] = React.useState(asset.defaultLanguageTag)
  const [altTranslations, setAltTranslations] = React.useState(
    asset.altTranslations.map(({ languageTag, altText: translatedAltText }) => ({
      languageTag,
      altText: translatedAltText,
    })),
  )
  const [tagsInput, setTagsInput] = React.useState(asset.tags.join(", "))
  const [status, setStatus] = React.useState<"idle" | "saved">("idle")
  const [errorText, setErrorText] = React.useState<string | null>(null)
  const [inUse, setInUse] = React.useState(false)
  const [addFolderId, setAddFolderId] = React.useState("")

  // Reset the form whenever a different asset is selected.
  React.useEffect(() => {
    setName(asset.name)
    setAltText(asset.altText ?? "")
    setDefaultLanguageTag(asset.defaultLanguageTag)
    setAltTranslations(
      asset.altTranslations.map(({ languageTag, altText: translatedAltText }) => ({
        languageTag,
        altText: translatedAltText,
      })),
    )
    setTagsInput(asset.tags.join(", "))
    setStatus("idle")
    setErrorText(null)
    setInUse(false)
    setAddFolderId("")
  }, [asset])

  const save = async () => {
    setErrorText(null)
    try {
      await update.mutateAsync({
        assetId: asset.id,
        input: {
          name: name.trim() || asset.name,
          altText: altText.trim() ? altText.trim() : null,
          defaultLanguageTag: defaultLanguageTag.trim(),
          altTranslations: altTranslations
            .map((translation) => ({
              languageTag: translation.languageTag.trim(),
              altText: translation.altText.trim(),
            }))
            .filter((translation) => translation.languageTag && translation.altText),
          tags: tagsInput
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        },
      })
      setStatus("saved")
    } catch {
      setStatus("idle")
      setErrorText(detail.saveFailed)
    }
  }

  const del = async () => {
    setErrorText(null)
    setInUse(false)
    try {
      await remove.mutateAsync(asset.id)
      onDeleted?.(asset)
    } catch (error) {
      if (isAssetInUseError(error)) {
        setInUse(true)
      } else {
        setErrorText(detail.deleteFailed)
      }
    }
  }

  const dimensions =
    asset.width && asset.height
      ? detail.dimensions
          .replace("{width}", String(asset.width))
          .replace("{height}", String(asset.height))
      : null
  const size = formatFileSize(asset.fileSize)
  const usageRecords = usage.data?.data ?? []

  return (
    <div className="flex w-full flex-col gap-4" data-slot="media-asset-detail">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="media-asset-name">{detail.nameLabel}</Label>
        <Input
          id="media-asset-name"
          value={name}
          placeholder={detail.namePlaceholder}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="media-asset-default-language">{detail.defaultLanguageLabel}</Label>
        <Input
          id="media-asset-default-language"
          value={defaultLanguageTag}
          placeholder={detail.languageTagPlaceholder}
          onChange={(event) => setDefaultLanguageTag(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="media-asset-alt">{detail.altLabel}</Label>
        <Textarea
          id="media-asset-alt"
          value={altText}
          rows={2}
          placeholder={detail.altPlaceholder}
          onChange={(event) => setAltText(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div>
          <Label>{detail.translationsTitle}</Label>
          <p className="text-xs text-muted-foreground">{detail.translationsHint}</p>
        </div>
        {altTranslations.map((translation, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: unsaved translation rows have no persistent id yet
            key={index}
            className="grid grid-cols-[7rem_1fr_auto] items-end gap-2"
          >
            <div className="flex flex-col gap-1">
              <Label htmlFor={`media-asset-alt-language-${index}`}>{detail.languageTagLabel}</Label>
              <Input
                id={`media-asset-alt-language-${index}`}
                value={translation.languageTag}
                placeholder={detail.languageTagPlaceholder}
                onChange={(event) =>
                  setAltTranslations((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, languageTag: event.target.value } : item,
                    ),
                  )
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`media-asset-alt-translation-${index}`}>
                {detail.translatedAltLabel}
              </Label>
              <Input
                id={`media-asset-alt-translation-${index}`}
                value={translation.altText}
                onChange={(event) =>
                  setAltTranslations((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, altText: event.target.value } : item,
                    ),
                  )
                }
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={detail.removeTranslation}
              onClick={() =>
                setAltTranslations((current) =>
                  current.filter((_, itemIndex) => itemIndex !== index),
                )
              }
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            setAltTranslations((current) => [...current, { languageTag: "", altText: "" }])
          }
        >
          {detail.addTranslation}
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="media-asset-tags">{detail.tagsLabel}</Label>
        <Input
          id="media-asset-tags"
          value={tagsInput}
          placeholder={detail.tagsPlaceholder}
          onChange={(event) => setTagsInput(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{detail.tagsHint}</p>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={update.isPending} onClick={() => void save()}>
          {update.isPending ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
          ) : null}
          {update.isPending ? messages.common.saving : messages.common.save}
        </Button>
        {status === "saved" ? (
          <span className="text-xs text-muted-foreground">{detail.saved}</span>
        ) : null}
        {errorText ? <span className="text-xs text-destructive">{errorText}</span> : null}
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <Label>{detail.foldersLabel}</Label>
        <div className="flex items-center gap-2">
          <NativeSelect
            value={addFolderId}
            className="flex-1"
            aria-label={detail.foldersLabel}
            onChange={(event) => setAddFolderId(event.target.value)}
          >
            <NativeSelectOption value="">{messages.library.folders.title}</NativeSelectOption>
            {(folderData?.data ?? []).map((folder) => (
              <NativeSelectOption key={folder.id} value={folder.id}>
                {folder.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!addFolderId || folderMutation.addMember.isPending}
            onClick={() => {
              if (!addFolderId) return
              folderMutation.addMember.mutate({ folderId: addFolderId, assetId: asset.id })
              setAddFolderId("")
            }}
          >
            {detail.addToFolder}
          </Button>
        </div>
        {currentFolderId ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="justify-start"
            disabled={folderMutation.removeMember.isPending}
            onClick={() =>
              folderMutation.removeMember.mutate({
                folderId: currentFolderId,
                assetId: asset.id,
              })
            }
          >
            {messages.common.remove}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">{detail.noFolders}</p>
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-1.5">
        <Label>{detail.metadata}</Label>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <dt>{detail.typeField}</dt>
          <dd>{messages.common.mediaTypeLabels[asset.type]}</dd>
          {dimensions ? (
            <>
              <dt>{detail.dimensionsLabel}</dt>
              <dd>{dimensions}</dd>
            </>
          ) : null}
          {size ? (
            <>
              <dt>{detail.fileSizeLabel}</dt>
              <dd>{size}</dd>
            </>
          ) : null}
          {asset.createdBy ? (
            <>
              <dt>{detail.uploadedByLabel}</dt>
              <dd className="truncate">{asset.createdBy}</dd>
            </>
          ) : null}
        </dl>
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <Label>{detail.whereUsed}</Label>
        {usage.isPending ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : usageRecords.length === 0 ? (
          <p className="text-xs text-muted-foreground">{detail.whereUsedEmpty}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">
              {detail.usageCount.replace(
                "{count}",
                String(usage.data?.total ?? usageRecords.length),
              )}
            </p>
            <ul className="flex flex-col gap-1">
              {usageRecords.map((record) => (
                <li key={record.id} className="flex items-center gap-2 text-xs">
                  <Badge variant="outline">{record.entityType}</Badge>
                  <span className="truncate text-muted-foreground">{record.entityId}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Separator />

      {inUse ? (
        <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-destructive">{detail.inUseTitle}</p>
            <p className="text-xs text-muted-foreground">{detail.inUseWarning}</p>
          </div>
        </div>
      ) : null}

      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={remove.isPending}
        onClick={async () => {
          if (
            typeof window !== "undefined" &&
            !(await confirmDialog({ description: detail.deleteConfirm, destructive: true }))
          )
            return
          void del()
        }}
      >
        {remove.isPending ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="mr-1.5 size-3.5" aria-hidden="true" />
        )}
        {messages.common.delete}
      </Button>
    </div>
  )
}
