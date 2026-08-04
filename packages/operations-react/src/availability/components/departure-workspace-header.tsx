"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
} from "@voyant-travel/ui/components"
import { Package, Pencil } from "lucide-react"
import { type ReactNode, useState } from "react"
import type { AvailabilityUiMessages } from "../i18n/index.js"
import { type AvailabilitySlotDetail, slotStatusTone } from "../index.js"
import { getSlotStatusLabel } from "./availability-columns.js"
import { slotStatusToneClass } from "./slot-status-tone.js"

/**
 * The workspace's identity line: what this departure is called, its status,
 * when it runs, and the actions that apply to the departure as a whole (as
 * opposed to the per-section actions inside the tabs).
 *
 * Split out of the page so the page stays a page. `headerActions` still lets a
 * host render the same actions in its own inset top bar instead — in which
 * case the in-page buttons, and the delete confirmation they own, are not
 * rendered at all.
 */
export function DepartureWorkspaceHeader({
  slot,
  titleText,
  productTypeName,
  dateRangeLabel,
  nightsLabel,
  flagBadges,
  messages,
  headerActions,
  onEdit,
  onOpenProduct,
  onDelete,
  deletePending,
}: {
  slot: AvailabilitySlotDetail
  titleText: string
  productTypeName: string | null
  dateRangeLabel: string
  nightsLabel: string | null
  flagBadges: readonly string[]
  messages: AvailabilityUiMessages
  headerActions?: ReactNode
  onEdit?: () => void
  onOpenProduct?: (productId: string) => void
  onDelete: () => Promise<void>
  deletePending: boolean
}) {
  const detailMessages = messages.details
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const handleDelete = async () => {
    await onDelete()
    setDeleteDialogOpen(false)
  }

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{titleText}</h1>
          <Badge variant="outline" className={slotStatusToneClass[slotStatusTone[slot.status]]}>
            {getSlotStatusLabel(slot.status, messages)}
          </Badge>
          {productTypeName ? <Badge variant="outline">{productTypeName}</Badge> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            {dateRangeLabel}
            {nightsLabel ? ` · ${nightsLabel}` : null}
          </span>
          <Badge variant="outline">{slot.timezone}</Badge>
        </div>
        {flagBadges.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {flagBadges.map((label) => (
              <Badge key={label} variant="secondary">
                {label}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      {headerActions ?? (
        <div className="flex flex-wrap items-center gap-2">
          {onEdit ? (
            <Button variant="outline" onClick={onEdit}>
              <Pencil data-icon="inline-start" aria-hidden="true" />
              {detailMessages.editSlot}
            </Button>
          ) : null}
          {slot.productId && onOpenProduct ? (
            <Button variant="outline" onClick={() => onOpenProduct(slot.productId)}>
              <Package data-icon="inline-start" aria-hidden="true" />
              {detailMessages.openProduct}
            </Button>
          ) : null}
          <Button
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
            disabled={deletePending}
          >
            {detailMessages.delete}
          </Button>
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{detailMessages.slot.deleteConfirm}</AlertDialogTitle>
                <AlertDialogDescription>
                  {detailMessages.slot.deleteDescription}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{detailMessages.slot.deleteCancel}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => void handleDelete()}
                  disabled={deletePending}
                >
                  {detailMessages.slot.deleteConfirmAction}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  )
}
