"use client"

import { formatMessage } from "@voyant-travel/i18n"
import { Alert, AlertDescription, AlertTitle } from "@voyant-travel/ui/components/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@voyant-travel/ui/components/alert-dialog"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { NativeSelect } from "@voyant-travel/ui/components/native-select"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"
import * as React from "react"

import { useProductDetailHost, useProductDetailMessages } from "../host.js"
import { Section } from "../product-detail-section-shell.js"
import { EditorialOverlayFieldCard } from "./editorial-overlay-field-card.js"
import { EditorialOverlayPreview } from "./editorial-overlay-preview.js"
import {
  type EditorialEffectiveContent,
  type EditorialOverlayField,
  type EditorialOverlayNode,
  type EditorialOverlayState,
  fieldTargetKey,
  localeMatchLabel,
} from "./types.js"
import {
  EditorialOverlayConflictError,
  useEditorialOverlayMutations,
  useEditorialOverlayState,
} from "./use-editorial-overlays.js"

export interface ProductEditorialOverlaySectionProps {
  productId: string
  /** Lets a host defer the fetch until it knows the subject is sourced. */
  enabled?: boolean
}

/**
 * Operator authoring surface for localized editorial overlays on sourced
 * products (RFC #3666 phase 2). Provider source is read-only; the overlay is
 * the only editable column; effective content is what customers receive.
 *
 * **Sourced products only.** An owned product authors its copy directly in the
 * products tables, so it has no overlay collection at all and the API answers
 * 404 for one. `/products/:id` is the owned authoring surface and does not
 * mount this section; a host for sourced product detail is where it belongs.
 */
export function ProductEditorialOverlaySection({
  productId,
  enabled = true,
}: ProductEditorialOverlaySectionProps) {
  const host = useProductDetailHost()
  const messages = useProductDetailMessages().products.editorial
  const [locale, setLocale] = React.useState(host.locale)
  const [conflict, setConflict] = React.useState<EditorialOverlayConflictError | null>(null)
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [showPreview, setShowPreview] = React.useState(false)
  const [confirmClearLocale, setConfirmClearLocale] = React.useState(false)

  const query = useEditorialOverlayState(productId, locale, enabled)
  const { write, clear } = useEditorialOverlayMutations(productId, locale)
  const canWrite = Boolean(host.api.put)

  const state = query.data
  const localeOptions = buildLocaleOptions(host.configuredLocales, host.locale, locale, state)
  const overlayFields = React.useMemo(
    () => Object.values(state?.fields ?? {}).filter((field) => field.overlayValue !== undefined),
    [state],
  )

  const handleMutationError = (error: unknown) => {
    if (error instanceof EditorialOverlayConflictError) {
      setConflict(error)
      setSaveError(null)
      return
    }
    setConflict(null)
    setSaveError(error instanceof Error ? error.message : String(error))
  }

  const saveField = (field: EditorialOverlayField, value: unknown) => {
    setConflict(null)
    setSaveError(null)
    write.mutate(
      {
        nodeKind: field.nodeKind,
        nodeKey: field.nodeKey,
        fieldPath: field.fieldPath,
        value,
        expectedVersion: field.version,
      },
      { onError: handleMutationError },
    )
  }

  const clearField = (field: EditorialOverlayField) => {
    setConflict(null)
    setSaveError(null)
    clear.mutate(
      {
        nodeKind: field.nodeKind,
        nodeKey: field.nodeKey,
        fieldPath: field.fieldPath,
        expectedVersion: field.version,
      },
      { onError: handleMutationError },
    )
  }

  const clearLocale = () => {
    setConfirmClearLocale(false)
    for (const field of overlayFields) clearField(field)
  }

  if (!enabled) return null

  return (
    <Section
      title={messages.sectionTitle}
      actions={
        <div className="flex items-center gap-2">
          {state ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPreview((value) => !value)}
            >
              {showPreview ? messages.previewHide : messages.previewShow}
            </Button>
          ) : null}
          {canWrite && overlayFields.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmClearLocale(true)}
            >
              {messages.clearAll}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{messages.sectionDescription}</p>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm" htmlFor="editorial-overlay-locale">
            {messages.localeLabel}
            <NativeSelect
              id="editorial-overlay-locale"
              value={locale}
              onChange={(event) => {
                setConflict(null)
                setSaveError(null)
                setLocale(event.target.value)
              }}
            >
              {localeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </label>
          {state ? (
            <>
              <Badge variant="secondary">
                {localeMatchLabel(state.locale.matchKind, messages)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatMessage(messages.localeSummary, {
                  requested: state.locale.requestedLocale,
                  source: state.locale.sourceLocale ?? "—",
                  served: state.locale.servedLocale ?? "—",
                })}
              </span>
            </>
          ) : null}
        </div>

        {!canWrite ? (
          <Alert>
            <AlertDescription>{messages.readOnly}</AlertDescription>
          </Alert>
        ) : null}

        {conflict ? (
          <Alert variant="destructive" data-testid="editorial-overlay-conflict">
            <AlertTitle>{messages.conflictTitle}</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2">
              <span>
                {formatMessage(messages.conflictDescription, {
                  expected: conflict.expectedVersion ?? "—",
                  current: conflict.currentVersion ?? "—",
                })}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setConflict(null)
                  void query.refetch()
                }}
              >
                {messages.reload}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {saveError ? (
          <Alert variant="destructive" data-testid="editorial-overlay-error">
            <AlertDescription>
              {formatMessage(messages.saveFailed, { reason: saveError })}
            </AlertDescription>
          </Alert>
        ) : null}

        {query.isPending ? (
          <div className="flex flex-col gap-2" role="status" aria-label={messages.loading}>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}

        {query.isError ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-col items-start gap-2">
              <span>{messages.loadFailed}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => query.refetch()}>
                {messages.retry}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {state && showPreview ? (
          <EditorialOverlayPreview
            effective={(state.effective ?? {}) as EditorialEffectiveContent}
            locale={state.locale.servedLocale ?? locale}
            messages={messages}
          />
        ) : null}

        {state
          ? groupFields(state).map((group) => (
              <section
                key={`${group.node.nodeKind}:${group.node.nodeKey}`}
                className="flex flex-col gap-3"
              >
                <h3 className="text-sm font-semibold">{nodeLabel(group.node, messages)}</h3>
                {group.fields.map((field) => (
                  <EditorialOverlayFieldCard
                    key={fieldTargetKey(field)}
                    field={field}
                    messages={messages}
                    canWrite={canWrite}
                    isSaving={write.isPending}
                    onSave={(value) => saveField(field, value)}
                    onClear={() => clearField(field)}
                  />
                ))}
              </section>
            ))
          : null}
      </div>

      <AlertDialog open={confirmClearLocale} onOpenChange={setConfirmClearLocale}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {formatMessage(messages.clearLocaleTitle, { locale })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {formatMessage(messages.clearLocaleDescription, { count: overlayFields.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{messages.keepEditing}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={clearLocale}>
              {messages.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  )
}

interface FieldGroup {
  node: EditorialOverlayNode
  fields: EditorialOverlayField[]
}

function groupFields(state: EditorialOverlayState): FieldGroup[] {
  const nodes = [...state.nodes]
  const fields = Object.values(state.fields)
  const groups: FieldGroup[] = nodes.map((node) => ({
    node,
    fields: fields.filter(
      (field) => field.nodeKind === node.nodeKind && field.nodeKey === node.nodeKey,
    ),
  }))
  // Orphaned overlays address nodes the provider dropped; keep them visible.
  const known = new Set(nodes.map((node) => `${node.nodeKind}:${node.nodeKey}`))
  for (const field of fields) {
    const key = `${field.nodeKind}:${field.nodeKey}`
    if (known.has(key)) continue
    known.add(key)
    groups.push({
      node: { nodeKind: field.nodeKind, nodeKey: field.nodeKey, dayNumber: null, label: null },
      fields: fields.filter(
        (candidate) => candidate.nodeKind === field.nodeKind && candidate.nodeKey === field.nodeKey,
      ),
    })
  }
  return groups.filter((group) => group.fields.length > 0)
}

function nodeLabel(
  node: EditorialOverlayNode,
  messages: { nodeRoot: string; nodeDay: string },
): string {
  if (node.nodeKind === "root") return messages.nodeRoot
  const base = formatMessage(messages.nodeDay, { dayNumber: node.dayNumber ?? node.nodeKey })
  return node.label ? `${base} — ${node.label}` : base
}

function buildLocaleOptions(
  configuredLocales: readonly string[] | undefined,
  hostLocale: string,
  selected: string,
  state: EditorialOverlayState | undefined,
): Array<{ value: string; label: string }> {
  const values = new Set<string>([
    ...(configuredLocales ?? []),
    hostLocale,
    selected,
    ...(state?.availableSourceLocales ?? []),
    ...(state?.availableOverlayLocales ?? []),
  ])
  return [...values]
    .filter((value) => value && value !== "default")
    .sort()
    .map((value) => ({ value, label: value }))
}
