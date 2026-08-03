"use client"

import { formatMessage } from "@voyant-travel/i18n"
import { Badge, Button } from "@voyant-travel/ui/components"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import { cn } from "@voyant-travel/ui/lib/utils"
import { Check, CircleDollarSign, Loader2, X } from "lucide-react"
import { useExtrasUiMessagesOrDefault } from "../i18n/index.js"
import {
  type ProductExtraRecord,
  type SlotExtraManifestSelection,
  type SlotExtraManifestSummary,
  type SlotExtraManifestTraveler,
  useSlotExtraManifest,
  useSlotExtraManifestMutation,
} from "../index.js"

export interface SlotExtrasManifestPanelProps {
  slotId: string
  className?: string
}

export function SlotExtrasManifestPanel({ slotId, className }: SlotExtrasManifestPanelProps) {
  const messages = useExtrasUiMessagesOrDefault().slotManifest
  const manifestQuery = useSlotExtraManifest(slotId)
  const mutation = useSlotExtraManifestMutation(slotId)
  const manifest = manifestQuery.data

  if (manifestQuery.isPending) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {messages.loading}
      </div>
    )
  }

  if (!manifest || manifest.extras.length === 0) {
    return (
      <div
        className={cn(
          "rounded-md border border-dashed p-6 text-sm text-muted-foreground",
          className,
        )}
      >
        {messages.emptyExtras}
      </div>
    )
  }

  if (manifest.travelers.length === 0) {
    return (
      <div
        className={cn(
          "rounded-md border border-dashed p-6 text-sm text-muted-foreground",
          className,
        )}
      >
        {messages.emptyTravelers}
      </div>
    )
  }

  const selectionByKey = new Map(
    manifest.selections.map((selection) => [
      selectionKey(selection.travelerId, selection.productExtraId),
      selection,
    ]),
  )
  const pending =
    mutation.setSelection.isPending ||
    mutation.bulkSetSelections.isPending ||
    mutation.bulkUpdateCollections.isPending

  const setCell = (
    traveler: SlotExtraManifestTraveler,
    extra: ProductExtraRecord,
    selection: SlotExtraManifestSelection | undefined,
    selected: boolean,
  ) => {
    mutation.setSelection.mutate({
      bookingId: traveler.bookingId,
      travelerId: traveler.id,
      productExtraId: extra.id,
      optionExtraConfigId: selection?.optionExtraConfigId ?? null,
      status: selected ? "selected" : "cancelled",
      collectionStatus: selected ? selection?.collectionStatus : "not_required",
      collectionCurrency: selection?.collectionCurrency ?? null,
      collectionAmountCents: selection?.collectionAmountCents ?? null,
      notes: selection?.notes ?? null,
    })
  }

  const bulkSetExtra = (extra: ProductExtraRecord, selected: boolean) => {
    mutation.bulkSetSelections.mutate({
      selections: manifest.travelers.map((traveler) => {
        const selection = selectionByKey.get(selectionKey(traveler.id, extra.id))
        return {
          bookingId: traveler.bookingId,
          travelerId: traveler.id,
          productExtraId: extra.id,
          optionExtraConfigId: selection?.optionExtraConfigId ?? null,
          status: selected ? "selected" : "cancelled",
          collectionStatus: selected ? selection?.collectionStatus : "not_required",
          collectionCurrency: selection?.collectionCurrency ?? null,
          collectionAmountCents: selection?.collectionAmountCents ?? null,
          notes: selection?.notes ?? null,
        }
      }),
    })
  }

  const bulkCollection = (extra: ProductExtraRecord, collectionStatus: "collected" | "waived") => {
    const travelerIds = manifest.travelers
      .filter((traveler) => selectionByKey.get(selectionKey(traveler.id, extra.id))?.selected)
      .map((traveler) => traveler.id)

    if (travelerIds.length === 0) return

    mutation.bulkUpdateCollections.mutate({
      productExtraId: extra.id,
      travelerIds,
      collectionStatus,
    })
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{messages.title}</h2>
        <Badge variant="outline">{manifest.extras.length}</Badge>
      </div>
      <SlotExtrasSummary summaries={manifest.summaries} />
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 min-w-56 bg-background">
                {messages.travelerColumn}
              </TableHead>
              <TableHead className="min-w-32">{messages.bookingColumn}</TableHead>
              {manifest.extras.map((extra) => (
                <TableHead key={extra.id} className="min-w-56 align-top">
                  <div className="flex flex-col gap-2 py-1">
                    <div>
                      <div className="font-medium">{extra.name}</div>
                      <div className="text-xs font-normal text-muted-foreground">
                        {collectionModeLabel(extra.collectionMode, messages.collectionModeLabels)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => bulkSetExtra(extra, true)}
                      >
                        <Check data-icon="inline-start" aria-hidden="true" />
                        {messages.selectAll}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => bulkSetExtra(extra, false)}
                      >
                        <X data-icon="inline-start" aria-hidden="true" />
                        {messages.clearAll}
                      </Button>
                      {extra.collectionMode === "cash_on_trip" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => bulkCollection(extra, "collected")}
                        >
                          <CircleDollarSign data-icon="inline-start" aria-hidden="true" />
                          {messages.markCollected}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {manifest.travelers.map((traveler) => (
              <TableRow key={traveler.id}>
                <TableCell className="sticky left-0 z-10 bg-background font-medium">
                  {traveler.fullName}
                </TableCell>
                <TableCell className="font-mono text-xs">{traveler.bookingNumber}</TableCell>
                {manifest.extras.map((extra) => {
                  const selection = selectionByKey.get(selectionKey(traveler.id, extra.id))
                  const selected = selection?.selected ?? false
                  return (
                    <TableCell key={extra.id}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant={selected ? "default" : "outline"}
                          size="sm"
                          disabled={pending}
                          onClick={() => setCell(traveler, extra, selection, !selected)}
                        >
                          {selected ? (
                            <Check data-icon="inline-start" aria-hidden="true" />
                          ) : (
                            <X data-icon="inline-start" aria-hidden="true" />
                          )}
                          {selected ? messages.selectedLabel : messages.selectLabel}
                        </Button>
                        {selection ? <CollectionBadge selection={selection} /> : null}
                      </div>
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

/**
 * Departure rollup: one card per Extra with the numbers an operator acts on —
 * how many units to carry, who they belong to, what is still uncollected and
 * whether fulfillment is done. The per-traveler grid below stays the place to
 * change any single cell.
 */
function SlotExtrasSummary({ summaries }: { summaries: SlotExtraManifestSummary[] }) {
  const messages = useExtrasUiMessagesOrDefault().slotManifest
  const summaryMessages = messages.summary
  if (summaries.length === 0) return null

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {summaries.map((summary) => (
        <div key={summary.productExtraId} className="rounded-md border p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="font-medium">{summary.name}</div>
            <Badge variant="outline">
              {formatMessage(summaryMessages.quantity, { count: summary.totalQuantity })}
            </Badge>
          </div>
          <dl className="mt-2 flex flex-col gap-1 text-muted-foreground text-xs">
            <div>
              {summary.selectedTravelerCount === 0
                ? summaryMessages.nobodySelected
                : formatMessage(summaryMessages.travelers, {
                    selected: summary.selectedTravelerCount,
                    eligible: summary.eligibleTravelerCount,
                  })}
            </div>
            <div>
              {formatMessage(summaryMessages.applicability, {
                selectionType: selectionTypeLabel(
                  summary.selectionType,
                  summaryMessages.selectionTypeLabels,
                ),
              })}
              {" · "}
              {collectionModeLabel(summary.collectionMode, messages.collectionModeLabels)}
            </div>
            <div>
              {summary.outstandingCollectionCount > 0
                ? formatMessage(summaryMessages.toCollect, {
                    count: summary.outstandingCollectionCount,
                  })
                : summaryMessages.collectionSettled}
            </div>
            <div>
              {summary.fulfillmentComplete
                ? summaryMessages.fulfillmentComplete
                : formatMessage(summaryMessages.fulfilled, {
                    fulfilled: summary.fulfilledTravelerCount,
                    selected: summary.selectedTravelerCount,
                  })}
            </div>
          </dl>
        </div>
      ))}
    </div>
  )
}

function selectionTypeLabel(
  selectionType: string,
  labels: Record<"optional" | "required" | "default_selected" | "unavailable", string>,
) {
  switch (selectionType) {
    case "required":
      return labels.required
    case "default_selected":
      return labels.default_selected
    case "unavailable":
      return labels.unavailable
    default:
      return labels.optional
  }
}

function CollectionBadge({ selection }: { selection: SlotExtraManifestSelection }) {
  const messages = useExtrasUiMessagesOrDefault().slotManifest
  if (selection.collectionStatus === "collected") {
    return <Badge className="bg-emerald-600 text-white">{messages.collectedLabel}</Badge>
  }
  if (selection.collectionStatus === "pending") {
    return <Badge variant="secondary">{messages.pendingLabel}</Badge>
  }
  if (selection.collectionStatus === "waived") {
    return <Badge variant="outline">{messages.waivedLabel}</Badge>
  }
  return <Badge variant="outline">{messages.notRequiredLabel}</Badge>
}

function collectionModeLabel(
  mode: ProductExtraRecord["collectionMode"],
  labels: Record<"cash_on_trip" | "external" | "included" | "none" | "booking_total", string>,
) {
  switch (mode) {
    case "cash_on_trip":
      return labels.cash_on_trip
    case "external":
      return labels.external
    case "included":
      return labels.included
    case "none":
      return labels.none
    default:
      return labels.booking_total
  }
}

function selectionKey(travelerId: string, productExtraId: string) {
  return `${travelerId}:${productExtraId}`
}
