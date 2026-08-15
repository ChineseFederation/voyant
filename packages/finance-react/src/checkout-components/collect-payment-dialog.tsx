"use client"

import type { InitiatedCheckoutCollectionRecord } from "@voyant-travel/finance/checkout"
import { buildConfiguredPaymentLinkUrl } from "@voyant-travel/finance/payment-link"
import { formatMessage } from "@voyant-travel/i18n"
import { Button } from "@voyant-travel/ui/components/button"
import { CurrencyCombobox } from "@voyant-travel/ui/components/currency-combobox"
import { CurrencyInput } from "@voyant-travel/ui/components/currency-input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@voyant-travel/ui/components/dialog"
import { Label } from "@voyant-travel/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import { CheckCircle2, Copy, ExternalLink, Loader2, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  useCheckoutPaymentLinkConfig,
  useCollectPayment,
  usePaymentLinkEmailTemplates,
  useSendPaymentLink,
} from "../checkout-hooks/index.js"
import {
  useCheckoutUiI18nOrDefault,
  useCheckoutUiMessagesOrDefault,
} from "../checkout-i18n/provider.js"
import { useBookingPaymentSchedules } from "../hooks/use-booking-payment-schedules.js"
import type { BookingPaymentScheduleRecord } from "../schemas.js"

/**
 * Operator-side "Generate payment link" dialog. Bookings created via
 * the new booking flow already land in `on_hold`, so the dialog skips
 * the choose-flow step and goes straight to producing a link the
 * operator can share. Optionally pre-fills the amount from a payment
 * schedule (deposit / balance / etc.) when the booking has any.
 *
 * ```tsx
 * <CollectPaymentDialog
 *   open={open}
 *   onOpenChange={setOpen}
 *   bookingId={booking.id}
 *   defaultCurrency={booking.sellCurrency}
 *   defaultAmountCents={booking.sellAmountCents}
 * />
 * ```
 */
export interface CollectPaymentDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  bookingId: string
  defaultCurrency: string
  defaultAmountCents?: number | null
  defaultPayerEmail?: string | null
  defaultPayerName?: string | null
  /**
   * Language for the processor's hosted payment page. Pass the picked
   * person's `preferredLanguage`, the booking locale, or the active admin
   * locale. Falls back to the processor's deploy-wide default when omitted.
   */
  defaultPayerLanguage?: string | null
  /**
   * Per-session overrides for where the customer's browser lands after
   * payment success / cancel on the processor's hosted page. Storefront
   * flows usually pass their own confirmation route; operator-initiated
   * send-link flows usually leave these unset and let the deploy-wide
   * `NETOPIA_REDIRECT_URL` point at the public `/pay/:sessionId` landing.
   */
  returnUrl?: string | null
  cancelUrl?: string | null
  /**
   * Card processor id registered in checkout's `paymentStarters`. Normally
   * omitted — the generated link claims whichever processor the deployment
   * selected when the customer starts the payment. See the `cardProvider`
   * option on {@link useCollectPayment}.
   */
  cardProvider?: string
}

const FULL_AMOUNT_VALUE = "__full__"

export function CollectPaymentDialog({
  open,
  onOpenChange,
  bookingId,
  defaultCurrency,
  defaultAmountCents,
  defaultPayerEmail,
  defaultPayerName,
  defaultPayerLanguage,
  returnUrl,
  cancelUrl,
  cardProvider,
}: CollectPaymentDialogProps) {
  const { locale, messages: rootMessages } = useCheckoutUiI18nOrDefault()
  const messages = rootMessages.collectPaymentDialog
  const [amountCents, setAmountCents] = useState<number>(defaultAmountCents ?? 0)
  const [scheduleId, setScheduleId] = useState<string>(FULL_AMOUNT_VALUE)
  const [currency, setCurrency] = useState<string>(defaultCurrency)
  const [result, setResult] = useState<InitiatedCheckoutCollectionRecord | null>(null)
  const fullAmountLabel = formatMessage(messages.scheduleFullAmount, {
    amount: formatAmount(defaultAmountCents ?? 0, defaultCurrency, locale),
  })

  const schedulesQuery = useBookingPaymentSchedules(bookingId, { enabled: open })
  // Only the open schedules are useful pre-fills. Paid / waived /
  // cancelled / expired wouldn't represent money the customer still
  // needs to send.
  const schedules = useMemo(
    () =>
      (schedulesQuery.data?.data ?? []).filter((s) => s.status === "pending" || s.status === "due"),
    [schedulesQuery.data?.data],
  )

  const collect = useCollectPayment(bookingId, {
    cardProvider,
    payerEmail: defaultPayerEmail,
    payerName: defaultPayerName,
    payerLanguage: defaultPayerLanguage,
    returnUrl,
    cancelUrl,
  })

  /**
   * The obligation a Booking Amendment just raised, if any.
   *
   * When an operator adds a traveller and then reaches for "collect
   * payment", the difference is what they want — not the booking total.
   * Finance writes exactly one open schedule per amendment, so the most
   * recent one is the amount the customer now owes for the change.
   */
  const amendmentSchedule = useMemo(
    () =>
      schedules
        .filter((schedule) => schedule.amendmentId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null,
    [schedules],
  )

  // Re-seed the amount from the latest props only on the closed→open
  // transition. Watching state mid-flight would clobber manual edits.
  const wasOpenRef = useRef(false)
  const seededRef = useRef(false)
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      // Schedules arrive asynchronously; `seededRef` lets the amendment
      // pre-fill land once they do, without re-seeding afterwards.
      seededRef.current = false
      setAmountCents(defaultAmountCents ?? 0)
      setScheduleId(FULL_AMOUNT_VALUE)
      setCurrency(defaultCurrency)
    }
    wasOpenRef.current = open
  }, [open, defaultAmountCents, defaultCurrency])

  useEffect(() => {
    if (!open || seededRef.current || !amendmentSchedule) return
    seededRef.current = true
    setScheduleId(amendmentSchedule.id)
    setAmountCents(amendmentSchedule.amountCents)
    setCurrency(amendmentSchedule.currency)
  }, [open, amendmentSchedule])

  function reset() {
    setAmountCents(defaultAmountCents ?? 0)
    setScheduleId(FULL_AMOUNT_VALUE)
    setCurrency(defaultCurrency)
    setResult(null)
    collect.reset()
  }

  function selectSchedule(next: string) {
    setScheduleId(next)
    if (next === FULL_AMOUNT_VALUE) {
      setAmountCents(defaultAmountCents ?? 0)
      setCurrency(defaultCurrency)
      return
    }

    const schedule = schedules.find((s) => s.id === next)
    if (schedule) {
      setAmountCents(schedule.amountCents)
      setCurrency(schedule.currency)
    }
  }

  async function submit() {
    if (amountCents <= 0) {
      toast.error(messages.validation.amountAboveZero)
      return
    }
    try {
      const data = await collect.mutateAsync({
        choice: { type: "hold" },
        amountCents,
        // Bind the payment to the schedule the operator actually picked.
        // Left unset, checkout settles the earliest open one instead.
        scheduleId: scheduleId === FULL_AMOUNT_VALUE ? null : scheduleId,
      })
      setResult(data)
      toast.success(messages.validation.linkReady)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{messages.title}</DialogTitle>
          <DialogDescription>{messages.description}</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="px-6 py-5">
            <ResultPanel result={result} bookingId={bookingId} />
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-6 py-5">
            {schedules.length > 0 ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="collect-schedule">{messages.scheduleLabel}</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={scheduleId}
                    onValueChange={(v) => selectSchedule(v ?? FULL_AMOUNT_VALUE)}
                  >
                    <SelectTrigger id="collect-schedule" className="w-full">
                      <SelectValue placeholder={messages.scheduleCustomPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FULL_AMOUNT_VALUE}>{fullAmountLabel}</SelectItem>
                      {schedules.map((schedule) => (
                        <SelectItem key={schedule.id} value={schedule.id}>
                          {formatScheduleOption(
                            schedule,
                            messages.scheduleTypeLabels,
                            locale,
                            messages.scheduleAmendmentLabel,
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {scheduleId !== FULL_AMOUNT_VALUE ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={messages.scheduleClear}
                      onClick={() => {
                        setScheduleId(FULL_AMOUNT_VALUE)
                        setAmountCents(defaultAmountCents ?? 0)
                        setCurrency(defaultCurrency)
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {scheduleId === FULL_AMOUNT_VALUE ? (
              <div className="grid grid-cols-[1fr_minmax(8rem,12rem)] gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="collect-amount">{messages.amountLabelShort}</Label>
                  <CurrencyInput
                    id="collect-amount"
                    value={amountCents}
                    onChange={(next) => setAmountCents(next ?? 0)}
                    currency={currency}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="collect-currency">{messages.currencyLabel}</Label>
                  <CurrencyCombobox
                    value={currency}
                    onChange={(next) => setCurrency(next ?? defaultCurrency)}
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-6 pb-6">
          {result ? (
            <Button onClick={() => onOpenChange(false)}>{messages.done}</Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={collect.isPending}
              >
                {messages.cancel}
              </Button>
              <Button onClick={submit} disabled={collect.isPending || amountCents <= 0}>
                {collect.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {messages.generateLink}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function formatAmount(cents: number, currency: string, locale: string): string {
  if (cents <= 0) return `0 ${currency}`
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

function formatScheduleOption(
  schedule: BookingPaymentScheduleRecord,
  typeLabels: Record<string, string>,
  locale: string,
  amendmentLabel: string,
): string {
  // An amendment obligation is stored as `other`; showing "Other" would
  // hide the one thing that makes it recognisable.
  const typeLabel = schedule.amendmentId
    ? amendmentLabel
    : (typeLabels[schedule.scheduleType] ?? schedule.scheduleType)
  const amount = formatAmount(schedule.amountCents, schedule.currency, locale)
  return `${typeLabel} • ${amount} • ${schedule.dueDate}`
}

function ResultPanel({
  result,
  bookingId,
}: {
  result: InitiatedCheckoutCollectionRecord
  bookingId: string
}) {
  const messages = useCheckoutUiMessagesOrDefault().collectPaymentDialog
  const configQuery = useCheckoutPaymentLinkConfig()
  const sessionId = result.paymentSession?.id ?? null
  const landingUrl =
    result.paymentLinkUrl ??
    (sessionId
      ? buildConfiguredPaymentLinkUrl(sessionId, {
          paymentLinkUrlTemplate: configQuery.data?.paymentLinkUrlTemplate,
          publicCheckoutBaseUrl: configQuery.data?.publicCheckoutBaseUrl,
        })
      : null)

  if (!landingUrl) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-6 text-sm">
        {formatMessage(messages.result.noLink, {
          sessionId: sessionId ?? messages.result.noSession,
        })}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border bg-card p-6">
      <div className="flex items-center gap-2 text-emerald-700">
        <CheckCircle2 className="h-5 w-5" />
        <span className="font-medium">{messages.result.ready}</span>
      </div>
      <p className="text-muted-foreground text-sm">{messages.result.body}</p>
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 font-mono text-xs">
        <span className="flex-1 break-all">{landingUrl}</span>
        <button
          type="button"
          aria-label={messages.result.copyLink}
          className="text-muted-foreground hover:text-foreground"
          onClick={() => {
            navigator.clipboard?.writeText(landingUrl).catch(() => undefined)
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <a
          href={landingUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={messages.result.openLink}
          className="text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      {sessionId ? <SendPanel bookingId={bookingId} sessionId={sessionId} /> : null}
    </div>
  )
}

/**
 * Emails the generated link instead of leaving the operator to paste it
 * somewhere themselves.
 *
 * The template list is deployment-authored, so this renders a hint rather
 * than a broken button when nothing is published.
 */
function SendPanel({ bookingId, sessionId }: { bookingId: string; sessionId: string }) {
  const messages = useCheckoutUiMessagesOrDefault().collectPaymentDialog
  const templatesQuery = usePaymentLinkEmailTemplates()
  const send = useSendPaymentLink(bookingId)
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const templates = templatesQuery.data ?? []

  if (templatesQuery.isPending) return null

  if (templates.length === 0) {
    return (
      <p className="border-t pt-4 text-muted-foreground text-xs">{messages.send.noTemplates}</p>
    )
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <span className="font-medium text-sm">{messages.send.title}</span>
      <div className="flex flex-col gap-2">
        <Label htmlFor="send-template">{messages.send.templateLabel}</Label>
        <Select value={templateId ?? ""} onValueChange={(next) => setTemplateId(next ?? null)}>
          <SelectTrigger id="send-template" className="w-full">
            <SelectValue placeholder={messages.send.templatePlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        className="self-start"
        disabled={!templateId || send.isPending || sent}
        onClick={async () => {
          if (!templateId) return
          try {
            await send.mutateAsync({ paymentSessionId: sessionId, templateId })
            setSent(true)
            toast.success(messages.send.sent)
          } catch (err) {
            toast.error((err as Error).message)
          }
        }}
      >
        {send.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {sent && <CheckCircle2 className="mr-2 h-4 w-4" />}
        {messages.send.action}
      </Button>
    </div>
  )
}
