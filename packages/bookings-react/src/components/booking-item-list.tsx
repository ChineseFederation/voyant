"use client"

import type { ColumnDef } from "@tanstack/react-table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@voyant-travel/ui/components"
import { DataTable } from "@voyant-travel/ui/components/data-table"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@voyant-travel/ui/components/sheet"
import { Eye, Package, Pencil, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { useBookingsUiI18nOrDefault, useBookingsUiMessagesOrDefault } from "../i18n/provider.js"
import { type BookingItemRecord, useBookingItemMutation, useBookingItems } from "../index.js"
import { BookingItemDialog } from "./booking-item-dialog.js"
import { IconActionButton } from "./icon-action-button.js"
import { StatusBadge } from "./status-badge.js"

export type BookingItemResourceKind = "product" | "availabilitySlot"

export interface BookingItemListProps {
  bookingId: string
  readOnly?: boolean
  /**
   * Open a linked resource (product / availability slot) in the host app.
   * When omitted, the snapshot sheet renders the names as plain text
   * instead of clickable links.
   */
  onResourceOpen?: (kind: BookingItemResourceKind, id: string) => void
}

export function BookingItemList({
  bookingId,
  readOnly = false,
  onResourceOpen,
}: BookingItemListProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<BookingItemRecord | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = React.useState<BookingItemRecord | null>(null)
  const [viewing, setViewing] = React.useState<BookingItemRecord | null>(null)
  const { data } = useBookingItems(bookingId)
  const { remove } = useBookingItemMutation(bookingId)
  const { formatCurrency, formatDateTime } = useBookingsUiI18nOrDefault()
  const messages = useBookingsUiMessagesOrDefault()

  const items = data?.data ?? []
  const deleteMessages = messages.bookingItemList.actions.deleteConfirm

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    await remove.mutateAsync(deleteTarget.id)
    setDeleteTarget(null)
  }

  const columns = React.useMemo<ColumnDef<BookingItemRecord>[]>(
    () => [
      {
        accessorKey: "title",
        header: messages.bookingItemList.columns.title,
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.productNameSnapshot ?? row.original.title}
          </span>
        ),
      },
      {
        id: "option",
        header: messages.bookingItemList.columns.option,
        cell: ({ row }) => row.original.optionNameSnapshot ?? "—",
      },
      {
        id: "unit",
        header: messages.bookingItemList.columns.unit,
        cell: ({ row }) => {
          const item = row.original
          const unit = item.unitNameSnapshot ?? (item.productNameSnapshot ? item.title : null)
          return unit ?? "—"
        },
      },
      {
        accessorKey: "itemType",
        header: messages.bookingItemList.columns.type,
        cell: ({ row }) => messages.bookingItemDialog.itemTypeLabels[row.original.itemType],
      },
      {
        accessorKey: "status",
        header: messages.bookingItemList.columns.status,
        cell: ({ row }) => (
          <StatusBadge status={row.original.status}>
            {messages.bookingItemDialog.itemStatusLabels[row.original.status]}
          </StatusBadge>
        ),
      },
      {
        accessorKey: "quantity",
        header: () => <div className="text-right">{messages.bookingItemList.columns.quantity}</div>,
        cell: ({ row }) => <div className="text-right font-mono">{row.original.quantity}</div>,
      },
      {
        accessorKey: "totalSellAmountCents",
        header: () => <div className="text-right">{messages.bookingItemList.columns.total}</div>,
        cell: ({ row }) => (
          <div className="text-right font-mono">
            {row.original.totalSellAmountCents == null
              ? messages.bookingItemList.values.totalUnavailable
              : formatCurrency(row.original.totalSellAmountCents / 100, row.original.sellCurrency)}
          </div>
        ),
      },
      {
        accessorKey: "totalCostAmountCents",
        header: messages.bookingItemList.columns.cost,
        cell: ({ row }) => (
          <span className="font-mono text-muted-foreground">
            {row.original.totalCostAmountCents == null || !row.original.costCurrency
              ? messages.bookingItemList.values.costUnavailable
              : formatCurrency(row.original.totalCostAmountCents / 100, row.original.costCurrency)}
          </span>
        ),
      },
      {
        id: "dates",
        header: messages.bookingItemList.columns.serviceDate,
        cell: ({ row }) => (
          <span className="text-xs">
            {formatItemDateRange(row.original, formatDateTime) ??
              messages.bookingItemList.values.serviceDateUnavailable}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <IconActionButton
              label={messages.bookingItemList.actions.viewItem}
              icon={<Eye className="h-3.5 w-3.5" />}
              onClick={(e) => {
                e.stopPropagation()
                setViewing(row.original)
              }}
            />
            {readOnly ? null : (
              <>
                <IconActionButton
                  label={messages.bookingItemList.actions.editItem}
                  icon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditing(row.original)
                    setDialogOpen(true)
                  }}
                />
                <IconActionButton
                  label={messages.bookingItemList.actions.deleteItem}
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteTarget(row.original)
                  }}
                />
              </>
            )}
          </div>
        ),
      },
    ],
    [formatCurrency, formatDateTime, messages, readOnly],
  )

  return (
    <div data-slot="booking-item-list" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Package className="h-4 w-4" />
          {messages.bookingItemList.title}
        </h2>
        {readOnly ? null : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(undefined)
              setDialogOpen(true)
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            {messages.bookingItemList.addItem}
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={items}
        emptyMessage={messages.bookingItemList.empty}
        showPagination={false}
      />

      <BookingItemDialog
        open={dialogOpen}
        onOpenChange={(nextOpen) => {
          setDialogOpen(nextOpen)
          if (!nextOpen) {
            setEditing(undefined)
          }
        }}
        bookingId={bookingId}
        item={editing}
        onSuccess={() => {
          setEditing(undefined)
        }}
      />

      <Sheet
        open={Boolean(viewing)}
        onOpenChange={(next) => {
          if (!next) setViewing(null)
        }}
      >
        <SheetContent side="right" className="data-[side=right]:w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{messages.bookingItemList.snapshot.title}</SheetTitle>
            <SheetDescription>{messages.bookingItemList.snapshot.subtitle}</SheetDescription>
          </SheetHeader>
          {viewing ? (
            <ItemSnapshotBody
              item={viewing}
              formatCurrency={formatCurrency}
              onResourceOpen={onResourceOpen}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next && !remove.isPending) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteMessages.title}</AlertDialogTitle>
            <AlertDialogDescription>{deleteMessages.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              {deleteMessages.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => void handleConfirmDelete()}
            >
              {deleteMessages.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ItemSnapshotBody({
  item,
  formatCurrency,
  onResourceOpen,
}: {
  item: BookingItemRecord
  formatCurrency: (amount: number, currency: string) => string
  onResourceOpen?: (kind: BookingItemResourceKind, id: string) => void
}) {
  const messages = useBookingsUiMessagesOrDefault()
  const { formatDateTime } = useBookingsUiI18nOrDefault()
  const labels = messages.bookingItemList.snapshot
  const empty = labels.empty
  const productName = item.productNameSnapshot ?? item.title
  const dateRange = formatItemDateRange(item, formatDateTime)
  const unitSell =
    item.unitSellAmountCents != null
      ? formatCurrency(item.unitSellAmountCents / 100, item.sellCurrency)
      : empty
  const totalSell =
    item.totalSellAmountCents != null
      ? formatCurrency(item.totalSellAmountCents / 100, item.sellCurrency)
      : empty
  const unitCost =
    item.unitCostAmountCents != null && item.costCurrency
      ? formatCurrency(item.unitCostAmountCents / 100, item.costCurrency)
      : empty
  const totalCost =
    item.totalCostAmountCents != null && item.costCurrency
      ? formatCurrency(item.totalCostAmountCents / 100, item.costCurrency)
      : empty

  const productLink =
    item.productId && onResourceOpen
      ? () => onResourceOpen("product", item.productId as string)
      : undefined
  const dateLink =
    item.availabilitySlotId && onResourceOpen
      ? () => onResourceOpen("availabilitySlot", item.availabilitySlotId as string)
      : undefined

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4">
      <SnapshotSection title={labels.sectionSummary}>
        <SnapshotRow
          label={labels.productLabel}
          value={<LinkOrText text={productName} onClick={productLink} />}
        />
        <SnapshotRow label={labels.optionLabel} value={item.optionNameSnapshot || empty} />
        <SnapshotRow label={labels.unitLabel} value={item.unitNameSnapshot || empty} />
        <SnapshotRow
          label={labels.typeLabel}
          value={messages.bookingItemDialog.itemTypeLabels[item.itemType]}
        />
        <SnapshotRow
          label={labels.statusLabel}
          value={
            <StatusBadge status={item.status}>
              {messages.bookingItemDialog.itemStatusLabels[item.status]}
            </StatusBadge>
          }
        />
        <SnapshotRow
          label={labels.datesLabel}
          value={<LinkOrText text={dateRange ?? empty} onClick={dateLink} />}
        />
        <SnapshotRow label={labels.descriptionLabel} value={item.description || empty} multiline />
        <SnapshotRow label={labels.notesLabel} value={item.notes || empty} multiline />
      </SnapshotSection>

      <SnapshotSection title={labels.sectionPricing}>
        <SnapshotRow label={labels.quantityLabel} value={String(item.quantity)} />
        <SnapshotRow label={labels.unitSellLabel} value={unitSell} mono />
        <SnapshotRow label={labels.totalSellLabel} value={totalSell} mono />
        <SnapshotRow label={labels.unitCostLabel} value={unitCost} mono />
        <SnapshotRow label={labels.totalCostLabel} value={totalCost} mono />
      </SnapshotSection>

      <SnapshotSection title={labels.sectionMeta}>
        <SnapshotRow
          label={labels.createdAtLabel}
          value={formatTimestampIso(item.createdAt, formatDateTime) ?? empty}
        />
        <SnapshotRow
          label={labels.updatedAtLabel}
          value={formatTimestampIso(item.updatedAt, formatDateTime) ?? empty}
        />
      </SnapshotSection>
    </div>
  )
}

function LinkOrText({ text, onClick }: { text: string; onClick?: () => void }) {
  if (!onClick) return <>{text}</>
  return (
    <button type="button" onClick={onClick} className="text-left text-primary hover:underline">
      {text}
    </button>
  )
}

function SnapshotSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <dl className="divide-y divide-border rounded-md border">{children}</dl>
    </section>
  )
}

function SnapshotRow({
  label,
  value,
  mono,
  multiline,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
  multiline?: boolean
}) {
  return (
    <div className="grid grid-cols-[10rem_1fr] items-baseline gap-3 px-3 py-2 text-sm">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={
          mono
            ? "font-mono text-sm"
            : multiline
              ? "whitespace-pre-wrap text-sm"
              : "truncate text-sm"
        }
      >
        {value}
      </dd>
    </div>
  )
}

function formatTimestampIso(
  iso: string | null | undefined,
  formatDateTime: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string,
): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  return formatDateTime(d)
}

function formatItemDateRange(
  item: BookingItemRecord,
  formatDateTime: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string,
): string | null {
  // Prefer the explicit start/end timestamps over the snapshot label —
  // the snapshot was rendered in whatever locale was active when the
  // booking was created, so it can be stale (English text on a Romanian
  // dashboard, missing arrival, etc.). We only fall back to the snapshot
  // when we have nothing better.
  const start = item.startsAt ? new Date(item.startsAt) : null
  const end = item.endsAt ? new Date(item.endsAt) : null
  if (start && Number.isFinite(start.getTime())) {
    if (end && Number.isFinite(end.getTime()) && end.getTime() !== start.getTime()) {
      return `${formatDateTime(start)} → ${formatDateTime(end)}`
    }
    return formatDateTime(start)
  }
  if (item.serviceDate) {
    const d = new Date(item.serviceDate)
    if (Number.isFinite(d.getTime())) {
      return formatDateTime(d, { dateStyle: "medium" })
    }
    return item.serviceDate
  }
  return item.departureLabelSnapshot ?? null
}
