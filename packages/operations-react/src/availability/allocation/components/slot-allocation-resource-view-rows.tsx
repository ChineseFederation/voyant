"use client"

import type {
  AllocationManifestTraveler,
  AllocationPaymentStatus,
  AllocationResource,
} from "@voyant-travel/operations-react/availability"
import {
  Badge,
  Button,
  Checkbox,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components"
import {
  Accessibility,
  Bed,
  Crown,
  Pencil,
  Plus,
  Trash2,
  UserMinus,
  UtensilsCrossed,
  X,
} from "lucide-react"
import { type FormEvent, type ReactNode, useEffect, useState } from "react"

import { useAllocationUiMessagesOrDefault } from "../i18n/index.js"
import { type AllocationSelection, kindLabel } from "./slot-allocation-model.js"
import type { EditResourceInput } from "./slot-allocation-resource-view.js"
import { paymentStatusChipClass, paymentStatusTooltip } from "./slot-allocation-shared.js"

export function ResourceRow({
  kind,
  assignable,
  resource,
  seated,
  unallocated,
  sharingGroupLabels,
  optionName,
  isEditing,
  isFull,
  canEdit,
  onBeginEdit,
  onCancelEdit,
  onSaveEdit,
  onAssignTraveler,
  onUnassignTraveler,
  onRemoveResource,
  onBookingOpen,
  selection,
}: {
  kind: string
  assignable: boolean
  resource: AllocationResource
  seated: AllocationManifestTraveler[]
  unallocated: AllocationManifestTraveler[]
  optionName?: string | null
  sharingGroupLabels: Record<string, string>
  isEditing: boolean
  isFull: boolean
  canEdit: boolean
  onBeginEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (input: EditResourceInput) => Promise<void>
  onAssignTraveler: (travelerId: string) => void
  onUnassignTraveler: (travelerId: string) => void
  onRemoveResource: () => void
  onBookingOpen?: (bookingId: string) => void
  selection?: AllocationSelection
}) {
  const messages = useAllocationUiMessagesOrDefault()
  const overCapacity = seated.length > resource.capacity

  if (isEditing && canEdit) {
    return (
      <TableRow className="bg-muted/30">
        <TableCell colSpan={assignable ? 4 : 3} className="whitespace-normal">
          <ResourceEditForm
            kind={kind}
            resource={resource}
            minCapacity={Math.max(1, seated.length)}
            onCancel={onCancelEdit}
            onSave={onSaveEdit}
          />
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        <span className="inline-flex items-center gap-2">
          <Bed className="size-4 text-muted-foreground" aria-hidden="true" />
          {resource.label ?? kindLabel(kind, messages)}
          {optionName ? (
            <Badge variant="secondary" className="text-[10px] font-normal">
              {optionName}
            </Badge>
          ) : null}
        </span>
      </TableCell>
      <TableCell className="text-center">
        <Badge variant={overCapacity ? "destructive" : "outline"}>
          {seated.length}/{resource.capacity}
        </Badge>
      </TableCell>
      {assignable ? (
        <TableCell className="whitespace-normal py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {seated.map((traveler) => (
              <TravelerChip
                key={traveler.id}
                traveler={traveler}
                sharingGroupLabel={
                  traveler.sharingGroupId
                    ? (sharingGroupLabels[traveler.sharingGroupId] ?? null)
                    : null
                }
                onUnassign={() => onUnassignTraveler(traveler.id)}
                onBookingOpen={onBookingOpen}
                selection={selection}
              />
            ))}
            {!isFull ? (
              <AssignTravelerPopover
                unallocated={unallocated}
                seatedBookingIds={new Set(seated.map((t) => t.bookingId))}
                onSelect={(travelerId) => onAssignTraveler(travelerId)}
              />
            ) : null}
          </div>
        </TableCell>
      ) : null}
      <TableCell className="text-right">
        <div className="inline-flex items-center justify-end gap-1">
          {canEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onBeginEdit}
              aria-label={messages.editResource}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemoveResource}
            aria-label={messages.remove}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function TravelerChip({
  traveler,
  sharingGroupLabel,
  onUnassign,
  onBookingOpen,
  selection,
}: {
  traveler: AllocationManifestTraveler
  sharingGroupLabel: string | null
  onUnassign: () => void
  onBookingOpen?: (bookingId: string) => void
  selection?: AllocationSelection
}) {
  const messages = useAllocationUiMessagesOrDefault()
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs",
        paymentStatusChipClass(traveler.paymentStatus),
      )}
      title={paymentStatusTooltip(traveler.paymentStatus, messages)}
      data-selected={selection?.selectedIds.has(traveler.id) ? "true" : undefined}
    >
      {selection ? (
        <Checkbox
          checked={selection.selectedIds.has(traveler.id)}
          onCheckedChange={() => selection.onToggle(traveler.id)}
          aria-label={messages.bulk.selectTraveler.replace("{name}", traveler.fullName)}
        />
      ) : null}
      {traveler.bookingSequence > 0 ? (
        <span className="text-muted-foreground tabular-nums" aria-hidden="true">
          ({traveler.bookingSequence})
        </span>
      ) : null}
      <span className="truncate font-medium" title={sharingGroupLabel ?? undefined}>
        {traveler.fullName}
      </span>
      {onBookingOpen ? (
        <button
          type="button"
          onClick={() => onBookingOpen(traveler.bookingId)}
          className="text-muted-foreground hover:text-foreground hover:underline"
        >
          {traveler.bookingNumber}
        </button>
      ) : (
        <span className="text-muted-foreground">{traveler.bookingNumber}</span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-4 rounded-full"
        onClick={onUnassign}
        aria-label={`${messages.remove}: ${traveler.fullName}`}
      >
        <X className="size-3" aria-hidden="true" />
      </Button>
    </span>
  )
}

function AssignTravelerPopover({
  unallocated,
  seatedBookingIds,
  onSelect,
}: {
  unallocated: AllocationManifestTraveler[]
  /**
   * Booking ids of travelers already assigned to this resource. When set,
   * travelers from those same bookings are surfaced as a "Same booking"
   * group at the top of the picker — common case for couples / families
   * who arrive in the same booking and should share a room by default.
   */
  seatedBookingIds?: ReadonlySet<string>
  onSelect: (travelerId: string) => void
}) {
  const messages = useAllocationUiMessagesOrDefault()
  const [open, setOpen] = useState(false)
  const disabled = unallocated.length === 0
  const sameBooking = seatedBookingIds
    ? unallocated.filter((t) => seatedBookingIds.has(t.bookingId))
    : []
  const others = seatedBookingIds
    ? unallocated.filter((t) => !seatedBookingIds.has(t.bookingId))
    : unallocated

  const renderItem = (traveler: AllocationManifestTraveler) => (
    <CommandItem
      key={traveler.id}
      value={`${traveler.fullName} ${traveler.bookingNumber}`}
      onSelect={() => {
        onSelect(traveler.id)
        setOpen(false)
      }}
    >
      <UserMinus className="mr-2 size-4 text-muted-foreground" aria-hidden="true" />
      <div className="flex flex-col">
        <span className="font-medium">{traveler.fullName}</span>
        <span className="text-xs text-muted-foreground">{traveler.bookingNumber}</span>
      </div>
    </CommandItem>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={disabled}
            aria-label={messages.assignTraveler}
            title={disabled ? messages.assignTravelerEmpty : messages.assignTraveler}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            {messages.assignTraveler}
          </Button>
        }
      />
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={messages.assignTravelerSearch} />
          <CommandList>
            <CommandEmpty>{messages.assignTravelerEmpty}</CommandEmpty>
            {sameBooking.length > 0 ? (
              <CommandGroup heading={messages.assignTravelerSameBooking}>
                {sameBooking.map(renderItem)}
              </CommandGroup>
            ) : null}
            {others.length > 0 ? (
              <CommandGroup
                heading={sameBooking.length > 0 ? messages.assignTravelerOthers : undefined}
              >
                {others.map(renderItem)}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ResourceEditForm({
  kind,
  resource,
  minCapacity,
  onCancel,
  onSave,
}: {
  kind: string
  resource: AllocationResource
  minCapacity: number
  onCancel: () => void
  onSave: (input: EditResourceInput) => Promise<void>
}) {
  const messages = useAllocationUiMessagesOrDefault()
  const [label, setLabel] = useState(resource.label ?? "")
  const [capacity, setCapacity] = useState(resource.capacity)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLabel(resource.label ?? "")
    setCapacity(resource.capacity)
  }, [resource.label, resource.capacity])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = label.trim()
    const nextCapacity = Math.max(minCapacity, Math.floor(capacity) || minCapacity)
    setSaving(true)
    try {
      await onSave({
        label: trimmed.length === 0 ? null : trimmed,
        capacity: nextCapacity,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_8rem_auto_auto] sm:items-end"
      onSubmit={submit}
      aria-label={messages.editResource}
    >
      <div className="grid gap-1">
        <Label htmlFor={`edit-${resource.id}-label`} className="text-xs">
          {messages.resourceLabel}
        </Label>
        <Input
          id={`edit-${resource.id}-label`}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={kindLabel(kind, messages)}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`edit-${resource.id}-capacity`} className="text-xs">
          {messages.resourceCapacity}
        </Label>
        <Input
          id={`edit-${resource.id}-capacity`}
          type="number"
          min={minCapacity}
          value={capacity}
          onChange={(event) => setCapacity(Number(event.target.value) || minCapacity)}
        />
      </div>
      <Button type="submit" size="sm" disabled={saving}>
        {messages.saveResource}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
        {messages.cancel}
      </Button>
    </form>
  )
}

/**
 * Dense table view of unallocated travelers. Replaces the per-row Card
 * tiles, which took multiple line-heights per traveler and made even a
 * small slot scroll. Keeps the same metadata (lead flag, sharing group,
 * accessibility / dietary icons, booking number) but in a single row.
 */
/**
 * Lighter tint than the chip — the row already has a left-column status
 * bar via the booking-number cell, and a full-width tint would fight
 * the table's striping. Just enough color to skim a denied row.
 */
function paymentStatusUnallocatedRowClass(status: AllocationPaymentStatus): string {
  switch (status) {
    case "paid":
      return "text-emerald-700 dark:text-emerald-300"
    case "partial":
      return "text-amber-700 dark:text-amber-300"
    case "unpaid":
      return "text-rose-700 dark:text-rose-300"
  }
}

export function UnallocatedTravelersTable({
  travelers,
  sharingGroupLabels,
  onBookingOpen,
  renderActions,
  selection,
}: {
  travelers: AllocationManifestTraveler[]
  sharingGroupLabels: Record<string, string>
  onBookingOpen?: (bookingId: string) => void
  renderActions?: (traveler: AllocationManifestTraveler) => ReactNode
  selection?: AllocationSelection
}) {
  const messages = useAllocationUiMessagesOrDefault()
  const hasActions = Boolean(renderActions)
  const allSelected =
    travelers.length > 0 && travelers.every((traveler) => selection?.selectedIds.has(traveler.id))
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            {selection ? (
              <TableHead className="w-8 px-3 py-1.5">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => {
                    for (const traveler of travelers) {
                      const isSelected = selection.selectedIds.has(traveler.id)
                      if (allSelected ? isSelected : !isSelected) selection.onToggle(traveler.id)
                    }
                  }}
                  aria-label={messages.bulk.selectAll}
                />
              </TableHead>
            ) : null}
            <TableHead className="px-3 py-1.5 text-xs">{messages.travelers}</TableHead>
            <TableHead className="px-3 py-1.5 text-xs">&nbsp;</TableHead>
            {hasActions ? <TableHead className="w-12 px-3 py-1.5" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {travelers.map((traveler) => (
            <TableRow key={traveler.id}>
              {selection ? (
                <TableCell className="px-3 py-1.5">
                  <Checkbox
                    checked={selection.selectedIds.has(traveler.id)}
                    onCheckedChange={() => selection.onToggle(traveler.id)}
                    aria-label={messages.bulk.selectTraveler.replace("{name}", traveler.fullName)}
                  />
                </TableCell>
              ) : null}
              <TableCell className="px-3 py-1.5">
                <div className="flex items-center gap-1.5">
                  {traveler.isLeadTraveler ? (
                    <Crown
                      className="size-3.5 shrink-0 text-amber-500"
                      aria-label={messages.lead}
                    />
                  ) : null}
                  <span className="truncate font-medium text-sm">{traveler.fullName}</span>
                  {traveler.sharingGroupId ? (
                    <Badge variant="secondary" className="max-w-full truncate text-[10px]">
                      {sharingGroupLabels[traveler.sharingGroupId] ?? messages.sharingGroup}
                    </Badge>
                  ) : null}
                  {traveler.hasAccessibilityNeeds ? (
                    <Accessibility
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-label={messages.accessibility}
                    />
                  ) : null}
                  {traveler.hasDietaryRequirements ? (
                    <UtensilsCrossed
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-label={messages.dietary}
                    />
                  ) : null}
                </div>
              </TableCell>
              <TableCell
                className={cn(
                  "px-3 py-1.5 text-xs",
                  paymentStatusUnallocatedRowClass(traveler.paymentStatus),
                )}
              >
                {onBookingOpen ? (
                  <button
                    type="button"
                    onClick={() => onBookingOpen(traveler.bookingId)}
                    className="text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {traveler.bookingNumber}
                  </button>
                ) : (
                  <span className="text-muted-foreground">{traveler.bookingNumber}</span>
                )}
              </TableCell>
              {hasActions ? (
                <TableCell className="px-3 py-1.5 text-right">
                  {renderActions?.(traveler)}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
