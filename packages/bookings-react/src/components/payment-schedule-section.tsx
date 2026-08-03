"use client"

import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import { CurrencyInput } from "@voyant-travel/ui/components/currency-input"
import { DatePicker } from "@voyant-travel/ui/components/date-picker"
import { Plus, X } from "lucide-react"
import { useBookingsUiI18nOrDefault, useBookingsUiMessagesOrDefault } from "../i18n/provider.js"

// Operators commit either the whole balance on a single due date (Full)
// or N installments (Split, two or more). Older "unpaid" and "advance"
// modes were dropped — an unpaid booking is just one with no schedule
// attached, and partial deposits are handled via Split.
export type PaymentScheduleMode = "full" | "split"

export interface PaymentInstallment {
  /** Stable React key, regenerated on row add. */
  id: string
  /** Amount for this installment. In Full mode the field is implicit (uses the booking total). */
  amountCents: number | null
  dueDate: string | null
  alreadyPaid: boolean
  paymentDate: string | null
  paymentMethod: string
  paymentReference: string
}

export interface PaymentScheduleValue {
  mode: PaymentScheduleMode
  /**
   * Full mode keeps a single installment whose amount mirrors the
   * booking total at submit time. Split keeps two or more installments
   * the operator types amounts + due dates for.
   */
  installments: PaymentInstallment[]
}

let installmentSeq = 0
function nextInstallmentId(): string {
  installmentSeq += 1
  return `inst_${installmentSeq}_${Math.random().toString(36).slice(2, 6)}`
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function plusDaysIso(base: string, days: number): string {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function createInstallment(overrides: Partial<PaymentInstallment> = {}): PaymentInstallment {
  return {
    id: nextInstallmentId(),
    amountCents: null,
    dueDate: null,
    alreadyPaid: false,
    paymentDate: null,
    paymentMethod: "bank_transfer", // i18n-literal-ok payment-method enum
    paymentReference: "",
    ...overrides,
  }
}

export const emptyPaymentScheduleValue: PaymentScheduleValue = {
  mode: "full",
  installments: [createInstallment({ dueDate: todayIso() })],
}

/**
 * Factory for the initial `PaymentScheduleValue` when the booking has a
 * known departure (slot or product start date). The single Full-mode
 * installment defaults to the departure day so operators don't have to
 * re-pick it on every fresh form, and so the dueDate field doesn't
 * surface today's date for a trip starting weeks/months later.
 *
 * When `departureDate` is null/undefined we fall back to `emptyPaymentScheduleValue`
 * which uses today.
 */
export function createPaymentScheduleValue(
  departureDate: string | null | undefined,
): PaymentScheduleValue {
  return {
    mode: "full",
    installments: [createInstallment({ dueDate: departureDate ?? todayIso() })],
  }
}

export interface PaymentScheduleSectionProps {
  value: PaymentScheduleValue
  onChange: (value: PaymentScheduleValue) => void
  /**
   * Booking total in cents. Used to drive the Full-mode amount (which
   * mirrors the total at submit) and to default split-mode amounts to
   * an even share when the operator switches modes / adds rows.
   */
  totalAmountCents?: number
  /**
   * ISO date of the booking's departure / service start. When provided,
   * split-mode installments default to dates between today and the
   * departure (rather than `today + 30·i`, which can land *after*
   * departure for short lead times).
   */
  departureDate?: string | null
  /** Used only for display formatting (e.g., "EUR"). No server-side effect. */
  currency?: string
  labels?: {
    heading?: string
    modeUnpaid?: string
    modeFull?: string
    modeAdvance?: string
    modeSplit?: string
    dueDate?: string
    dueDatePlaceholder?: string
    amount?: string
    firstInstallment?: string
    secondInstallment?: string
    /** Third and later rows. `{index}` is replaced with the 1-based row number. */
    installmentN?: string
    preset5050?: string
    unpaidHint?: string
    totalDue?: string
    scheduledTotal?: string
    remaining?: string
    alreadyPaid?: string
    paymentDate?: string
    paymentDatePlaceholder?: string
    paymentMethod?: string
    paymentReference?: string
    addInstallment?: string
    removeInstallment?: string
  }
}

/**
 * Distribute `total` evenly across `count` installments. Last row picks
 * up the remainder so the sum is exact (e.g. 100 / 3 → 33, 33, 34).
 */
function distributeEvenly(total: number, count: number): number[] {
  if (count <= 0) return []
  const base = Math.floor(total / count)
  const out = Array.from({ length: count }, () => base)
  const remainder = total - base * count
  if (remainder > 0 && out.length > 0) {
    const last = out.length - 1
    out[last] = (out[last] ?? 0) + remainder
  }
  return out
}

/**
 * Pick a default due date for installment #`index` (0-based) within a
 * series of `count` installments. When the booking has a known
 * departure date, the series spreads evenly between today and one day
 * before departure (so every installment is collected pre-trip).
 * Without a departure date we fall back to `today + 30·i`.
 */
function defaultDueDateForIndex(
  index: number,
  count: number,
  departureDate: string | null | undefined,
): string {
  const today = todayIso()
  if (count <= 1) return today
  const departure = (departureDate ?? "").trim()
  const validDeparture = departure && Number.isFinite(new Date(departure).getTime())
  if (!validDeparture) return plusDaysIso(today, index * 30)
  // Last installment lands one day before departure so the final
  // collection cleared the rail before the customer travels.
  const lastDay = plusDaysIso(departure, -1)
  const span = (new Date(lastDay).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
  if (span <= 0) {
    // Departure is today or tomorrow — collapse every installment onto today.
    return today
  }
  const offset = Math.round((index * span) / (count - 1))
  return plusDaysIso(today, offset)
}

/**
 * Heading for installment row `index` (0-based).
 *
 * Row labels come out of the message catalogue, never out of string
 * surgery on another label: the first two rows have their own entries so
 * each locale spells its own ordinal, and rows beyond that interpolate the
 * number into a parameterised message. Substituting a digit into the
 * first-installment string — the previous approach — left every Romanian
 * row reading "Prima rata" and rendered English row 2 as "2 installment".
 */
function installmentLabel(
  index: number,
  labels: { firstInstallment: string; secondInstallment: string; installmentN: string },
): string {
  if (index === 0) return labels.firstInstallment
  if (index === 1) return labels.secondInstallment
  return labels.installmentN.replace("{index}", String(index + 1))
}

/**
 * Payment schedule picker for booking-create flows. The operator picks
 * Full (one due date for the whole amount) or Split (N installments,
 * default two with 50/50, but the "+" button adds as many as needed).
 *
 * Switching modes prefills sensible defaults: Full → today's due date;
 * Split → today + today+30 with a 50/50 amount split. Everything
 * remains editable so this is just a low-friction starting point.
 *
 * The section produces a controlled `PaymentScheduleValue` — actually
 * creating `booking_payment_schedules` rows happens in the parent at
 * submit time, after the booking exists (schedules have a FK to
 * `bookings.id`).
 */
export function PaymentScheduleSection({
  value,
  onChange,
  totalAmountCents,
  departureDate,
  currency,
  labels,
}: PaymentScheduleSectionProps) {
  const messages = useBookingsUiMessagesOrDefault()
  const { formatCurrency, formatNumber } = useBookingsUiI18nOrDefault()
  const merged = { ...messages.paymentScheduleSection.labels, ...labels }
  const set = (patch: Partial<PaymentScheduleValue>) => onChange({ ...value, ...patch })

  const total = typeof totalAmountCents === "number" ? totalAmountCents : null

  const modes: Array<{ id: PaymentScheduleMode; label: string }> = [
    { id: "full", label: merged.modeFull },
    { id: "split", label: merged.modeSplit },
  ]

  const switchMode = (nextMode: PaymentScheduleMode) => {
    if (nextMode === value.mode) return
    if (nextMode === "full") {
      const preserved = value.installments[0]
      onChange({
        mode: "full",
        installments: [
          createInstallment({
            dueDate: preserved?.dueDate ?? todayIso(),
            alreadyPaid: preserved?.alreadyPaid ?? false,
            paymentDate: preserved?.paymentDate ?? null,
            paymentMethod: preserved?.paymentMethod ?? "bank_transfer",
            paymentReference: preserved?.paymentReference ?? "",
          }),
        ],
      })
      return
    }
    // → split. Seed with two installments if we don't already have ≥2.
    const seedCount = Math.max(2, value.installments.length)
    const evenAmounts = total != null ? distributeEvenly(total, seedCount) : []
    const installments = Array.from({ length: seedCount }, (_, idx) => {
      const existing = value.installments[idx]
      return createInstallment({
        amountCents: existing?.amountCents ?? evenAmounts[idx] ?? null,
        dueDate: existing?.dueDate ?? defaultDueDateForIndex(idx, seedCount, departureDate),
        alreadyPaid: existing?.alreadyPaid ?? false,
        paymentDate: existing?.paymentDate ?? null,
        paymentMethod: existing?.paymentMethod ?? "bank_transfer",
        paymentReference: existing?.paymentReference ?? "",
      })
    })
    onChange({ mode: "split", installments })
  }

  const updateInstallment = (idx: number, patch: Partial<PaymentInstallment>) => {
    const next = value.installments.map((row, i) => (i === idx ? { ...row, ...patch } : row))
    set({ installments: next })
  }

  const addInstallment = () => {
    const count = value.installments.length + 1
    const evenAmounts = total != null ? distributeEvenly(total, count) : []
    const next = value.installments.map((row, i) => ({
      ...row,
      amountCents: total != null ? (evenAmounts[i] ?? row.amountCents) : row.amountCents,
    }))
    next.push(
      createInstallment({
        amountCents: total != null ? (evenAmounts[count - 1] ?? null) : null,
        dueDate: defaultDueDateForIndex(count - 1, count, departureDate),
      }),
    )
    set({ installments: next })
  }

  const removeInstallment = (idx: number) => {
    if (value.installments.length <= 2) return
    const remaining = value.installments.filter((_, i) => i !== idx)
    // Redistribute amounts so the remaining rows still cover the booking
    // total — otherwise the "Remaining" tracker reports a phantom gap
    // that doesn't correspond to anything the operator can act on.
    const evenAmounts = total != null ? distributeEvenly(total, remaining.length) : []
    const next = remaining.map((row, i) => ({
      ...row,
      amountCents: total != null ? (evenAmounts[i] ?? row.amountCents) : row.amountCents,
    }))
    set({ installments: next })
  }

  const scheduledTotal =
    value.mode === "full"
      ? (total ?? 0)
      : value.installments.reduce((sum, row) => sum + (row.amountCents ?? 0), 0)
  const remaining = total === null ? null : Math.max(0, total - scheduledTotal)
  const formatAmount = (cents: number | null) => {
    if (cents === null) return "-"
    return currency
      ? formatCurrency(cents / 100, currency)
      : formatNumber(cents / 100, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
  }

  const paymentMethodLabels = messages.bookingPaymentsSummary.paymentMethodLabels
  const renderPaidFields = (idx: number, installment: PaymentInstallment) => {
    const checkboxId = `payment-schedule-installment-${idx}-already-paid`
    return (
      <div className="flex flex-col gap-2 rounded-md border border-dashed p-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id={checkboxId}
            checked={installment.alreadyPaid}
            onCheckedChange={(next) => updateInstallment(idx, { alreadyPaid: next === true })}
          />
          <Label htmlFor={checkboxId} className="cursor-pointer text-xs">
            {merged.alreadyPaid}
          </Label>
        </div>
        {installment.alreadyPaid ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{merged.paymentDate}</Label>
              <DatePicker
                value={installment.paymentDate ?? ""}
                placeholder={merged.paymentDatePlaceholder}
                onChange={(nextValue) => updateInstallment(idx, { paymentDate: nextValue })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{merged.paymentMethod}</Label>
              <Select
                value={installment.paymentMethod}
                onValueChange={(nextValue) =>
                  updateInstallment(idx, { paymentMethod: nextValue ?? "bank_transfer" })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    ["bank_transfer", "credit_card", "cash", "travel_credit", "other"] as const
                  ).map((method) => (
                    <SelectItem key={method} value={method}>
                      {paymentMethodLabels[method === "credit_card" ? "card" : method]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{merged.paymentReference}</Label>
              <Input
                value={installment.paymentReference}
                onChange={(event) =>
                  updateInstallment(idx, { paymentReference: event.target.value })
                }
              />
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  const fullInstallment = value.installments[0] ?? createInstallment({ dueDate: todayIso() })

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <Label>{merged.heading}</Label>

      <div className="grid gap-2 rounded-md bg-muted/40 p-2 text-xs sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">{merged.totalDue}</span>
          <span className="font-medium tabular-nums">{formatAmount(total)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">{merged.scheduledTotal}</span>
          <span className="font-medium tabular-nums">{formatAmount(scheduledTotal)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">{merged.remaining}</span>
          <span className="font-medium tabular-nums">{formatAmount(remaining)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {modes.map((mode) => (
          <Button
            key={mode.id}
            type="button"
            size="sm"
            variant={value.mode === mode.id ? "default" : "ghost"}
            onClick={() => switchMode(mode.id)}
          >
            {mode.label}
          </Button>
        ))}
      </div>

      {value.mode === "full" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{merged.dueDate}</Label>
            <DatePicker
              value={fullInstallment.dueDate ?? ""}
              placeholder={merged.dueDatePlaceholder}
              onChange={(nextValue) => updateInstallment(0, { dueDate: nextValue })}
            />
          </div>
          {renderPaidFields(0, fullInstallment)}
        </div>
      )}

      {value.mode === "split" && (
        <div className="flex flex-col gap-3">
          {value.installments.map((installment, idx) => (
            <div key={installment.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{installmentLabel(idx, merged)}</span>
                {value.installments.length > 2 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={merged.removeInstallment}
                    onClick={() => removeInstallment(idx)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <CurrencyInput
                  placeholder={merged.amount}
                  value={installment.amountCents}
                  onChange={(next) => updateInstallment(idx, { amountCents: next })}
                  currency={currency}
                />
                <DatePicker
                  value={installment.dueDate ?? ""}
                  placeholder={merged.dueDatePlaceholder}
                  onChange={(nextValue) => updateInstallment(idx, { dueDate: nextValue })}
                />
              </div>
              {renderPaidFields(idx, installment)}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addInstallment}
            className="self-start"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {merged.addInstallment}
          </Button>
        </div>
      )}
    </div>
  )
}
