"use client"

import { Badge, Button } from "@voyant-travel/ui/components"
import { Info } from "lucide-react"
import type { ReactNode } from "react"
import {
  type AvailabilitySlotDetail,
  slotLocalEnd,
  slotLocalStart,
  slotStatusTone,
} from "../index.js"
import { slotStatusToneClass } from "./slot-status-tone.js"

export function MetaTab({
  slot,
  productName,
  statusLabel,
  productVersionId,
  onOpenProduct,
  onOpenStartTime,
  i18n: msg,
}: {
  slot: AvailabilitySlotDetail
  productName: string | null
  statusLabel: string
  /**
   * The immutable Product Version this departure was materialized from
   * (`availability_slots.product_version_id`, surfaced by the departure
   * summary). `undefined` when the caller has no summary loaded; `null` on a
   * departure that was never bound to a published version — which the issue
   * list also reports as `departure_not_version_bound`.
   */
  productVersionId?: string | null
  onOpenProduct?: (productId: string) => void
  onOpenStartTime?: (startTimeId: string) => void
  i18n: {
    title: string
    slotIdLabel: string
    ruleLabel: string
    startTimeLabel: string
    endsAtLabel: string
    createdLabel: string
    updatedLabel: string
    productLabel: string
    productVersionLabel?: string
    notVersionBoundLabel?: string
    statusLabel: string
    timezoneLabel: string
    noValue: string
    format: (value: string | Date) => string
  }
}) {
  const rows: Array<{ label: string; value: ReactNode }> = [
    {
      label: msg.slotIdLabel,
      value: <span className="font-mono text-xs">{slot.id}</span>,
    },
    {
      label: msg.productLabel,
      value:
        slot.productId && onOpenProduct ? (
          <Button
            variant="link"
            className="h-auto p-0 text-right"
            onClick={() => onOpenProduct(slot.productId)}
          >
            {productName ?? slot.productId}
          </Button>
        ) : (
          (productName ??
          slot.productId ?? <span className="text-muted-foreground">{msg.noValue}</span>)
        ),
    },
    {
      label: msg.statusLabel,
      value: (
        <Badge variant="outline" className={slotStatusToneClass[slotStatusTone[slot.status]]}>
          {statusLabel}
        </Badge>
      ),
    },
    {
      label: msg.timezoneLabel,
      value: <Badge variant="outline">{slot.timezone}</Badge>,
    },
    {
      label: msg.endsAtLabel,
      value: slot.endsAt ? (
        formatSlotLocalDateTime(slotLocalEnd(slot) ?? slotLocalStart(slot))
      ) : (
        <span className="text-muted-foreground">{msg.noValue}</span>
      ),
    },
  ]
  if (productVersionId !== undefined && msg.productVersionLabel) {
    rows.push({
      label: msg.productVersionLabel,
      value: productVersionId ? (
        <span className="font-mono text-xs">{productVersionId}</span>
      ) : (
        <span className="text-muted-foreground">{msg.notVersionBoundLabel ?? msg.noValue}</span>
      ),
    })
  }
  if (slot.availabilityRuleId) {
    rows.push({
      label: msg.ruleLabel,
      value: <span className="font-mono text-xs">{slot.availabilityRuleId}</span>,
    })
  }
  if (slot.startTimeId) {
    rows.push({
      label: msg.startTimeLabel,
      value: onOpenStartTime ? (
        <Button
          variant="link"
          className="h-auto p-0 text-right font-mono text-xs"
          onClick={() => onOpenStartTime(slot.startTimeId ?? "")}
        >
          {slot.startTimeId}
        </Button>
      ) : (
        <span className="font-mono text-xs">{slot.startTimeId}</span>
      ),
    })
  }
  rows.push({ label: msg.createdLabel, value: msg.format(slot.createdAt) })
  rows.push({ label: msg.updatedLabel, value: msg.format(slot.updatedAt) })

  return (
    <div data-slot="slot-metadata" className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Info className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {msg.title}
      </h2>
      <div className="overflow-hidden rounded-md border bg-background">
        <dl className="divide-y">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
            >
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="text-right">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

export function formatSlotDateRange(slot: {
  dateLocal: string
  startsAt: string
  endsAt: string | null
  timezone: string
}): string {
  const start = formatSlotLocalDateTime(slotLocalStart(slot))
  if (!slot.endsAt) return start
  return `${start} → ${formatSlotLocalDateTime(slotLocalEnd(slot) ?? slotLocalStart(slot))}`
}

function formatSlotLocalDateTime(value: { date: string; time: string }) {
  return `${value.date} ${value.time}`
}

export function computeSlotNightsLabel(
  slot: { nights: number | null; days: number | null },
  labels: {
    nightSingular: string
    nightsPlural: string
    daySingular: string
    daysPlural: string
  },
): string | null {
  if (slot.nights && slot.nights > 0) {
    return slot.nights === 1
      ? labels.nightSingular
      : labels.nightsPlural.replace("{count}", String(slot.nights))
  }
  if (slot.days && slot.days > 0) {
    return slot.days === 1
      ? labels.daySingular
      : labels.daysPlural.replace("{count}", String(slot.days))
  }
  return null
}
