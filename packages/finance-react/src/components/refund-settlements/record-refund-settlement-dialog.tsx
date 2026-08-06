"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Switch,
  Textarea,
} from "@voyant-travel/ui/components"
import { CurrencyCombobox } from "@voyant-travel/ui/components/currency-combobox"
import { CurrencyInput } from "@voyant-travel/ui/components/currency-input"
import { Info, Loader2, ShieldQuestion } from "lucide-react"
import * as React from "react"

import { useFinanceUiI18nOrDefault, useFinanceUiMessagesOrDefault } from "../../i18n/index.js"
import {
  isRefundSettlementApprovalRequired,
  type RecordRefundSettlementResult,
  useAdminBookingPayments,
  usePaymentRefundableRemainder,
  usePaymentSessions,
  useRefundSettlementMutation,
} from "../../index.js"
import { isAdapterBackedMethod, isInstrumentMethod, type RefundSettlementMethod } from "./shared.js"

/** Ordered for how often an operator reaches for them, not alphabetically. */
const METHODS: readonly RefundSettlementMethod[] = [
  "bank_transfer",
  "processor_reversal",
  "cash",
  "cheque",
  "travel_credit",
  "voucher",
  "counterparty_offset",
  "other",
]

export interface RecordRefundSettlementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  /** Pre-binds the settlement to the credit note the operator came from. */
  creditNoteId?: string | null
  /** Pre-selects the payment being reversed. */
  paymentId?: string | null
  defaultCurrency?: string
  defaultAmountCents?: number | null
  onRecorded?: () => void
}

interface FormState {
  paymentId: string
  /** Only used when no payment is selected to derive it from. */
  currency: string
  method: RefundSettlementMethod
  amountCents: number | null
  alreadyPaid: boolean
  externalReference: string
  paymentSessionId: string
  instrumentAmountCents: number | null
  counterpartyOrganizationId: string
  notes: string
}

function initialState(
  defaultCurrency: string,
  paymentId: string | null | undefined,
  amountCents: number | null | undefined,
): FormState {
  return {
    paymentId: paymentId ?? "",
    currency: defaultCurrency,
    method: "bank_transfer",
    amountCents: amountCents ?? null,
    // Off by default and deliberately so: the honest state of a refund the
    // operator has just started is "owed", not "paid".
    alreadyPaid: false,
    externalReference: "",
    paymentSessionId: "",
    instrumentAmountCents: null,
    counterpartyOrganizationId: "",
    notes: "",
  }
}

/**
 * Recording how a customer was actually paid back (voyant#4303).
 *
 * Two things drive the shape of this form.
 *
 * The method is a **select, not free text**, and the fields under it change with
 * it: a card reversal needs the payment session it reverses, a voucher can be
 * worth more than the refund, and an offset needs the account it is netted
 * against. Showing all of them at once would ask an operator to ignore five
 * fields to fill in two.
 *
 * And the refundable remainder is shown live next to the amount, because it is
 * the number the decision turns on and it is *not* "paid minus refunded" — a
 * refund still in flight has already spoken for its share.
 */
export function RecordRefundSettlementDialog({
  open,
  onOpenChange,
  bookingId,
  creditNoteId = null,
  paymentId = null,
  defaultCurrency = "EUR",
  defaultAmountCents = null,
  onRecorded,
}: RecordRefundSettlementDialogProps) {
  const messages = useFinanceUiMessagesOrDefault()
  const dialog = messages.recordRefundSettlementDialog
  const { formatCurrency } = useFinanceUiI18nOrDefault()

  const [state, setState] = React.useState<FormState>(() =>
    initialState(defaultCurrency, paymentId, defaultAmountCents),
  )
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [pendingApproval, setPendingApproval] = React.useState<Extract<
    RecordRefundSettlementResult,
    { status: "approval_required" }
  > | null>(null)
  // Stable for the life of one dialog session, so the approve-then-retry pair
  // carries the identical key and the server settles once rather than twice.
  const idempotencyKeyRef = React.useRef<string>("")

  const paymentsQuery = useAdminBookingPayments(bookingId, { enabled: open })
  const payments = React.useMemo(
    () =>
      (paymentsQuery.data?.data?.payments ?? []).filter(
        (payment) => payment.source === "payment" && payment.status === "completed",
      ),
    [paymentsQuery.data],
  )
  const selectedPayment = payments.find((payment) => payment.id === state.paymentId) ?? null
  // Derived from the payment when there is one — the refundable bound is
  // currency-matched server-side, so a currency the payment is not in would
  // silently skip the check that stops a double refund. With no payment to
  // derive it from the operator picks, and picks from a list rather than
  // typing an ISO code from memory.
  const currency = selectedPayment?.currency ?? state.currency ?? defaultCurrency

  const refundableQuery = usePaymentRefundableRemainder(state.paymentId || null, {
    enabled: open && Boolean(state.paymentId),
  })
  const refundable = refundableQuery.data?.data ?? null

  const sessionsQuery = usePaymentSessions({
    bookingId,
    limit: 50,
    enabled: open && isAdapterBackedMethod(state.method),
  })
  const sessions = sessionsQuery.data?.data ?? []

  const { record } = useRefundSettlementMutation()

  React.useEffect(() => {
    if (!open) return
    setState(initialState(defaultCurrency, paymentId, defaultAmountCents))
    setSubmitError(null)
    setPendingApproval(null)
    idempotencyKeyRef.current = crypto.randomUUID()
  }, [open, defaultCurrency, paymentId, defaultAmountCents])

  // One outstanding payment is the common case; picking it for the operator
  // saves a click and never guesses when there is more than one.
  React.useEffect(() => {
    if (!open || state.paymentId || payments.length !== 1) return
    const only = payments[0]
    if (only) setState((prev) => ({ ...prev, paymentId: only.id }))
  }, [open, payments, state.paymentId])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }))

  const amountCents = state.amountCents ?? 0
  const exceedsRefundable = Boolean(
    refundable && amountCents > refundable.refundableRemainderCents && !pendingApproval,
  )

  const submit = async (approvalId?: string) => {
    setSubmitError(null)
    if (amountCents <= 0) {
      setSubmitError(dialog.errors.amountRequired)
      return
    }
    if (isAdapterBackedMethod(state.method) && !state.paymentSessionId) {
      setSubmitError(dialog.errors.paymentSessionRequired)
      return
    }
    if (exceedsRefundable) {
      setSubmitError(dialog.errors.amountExceedsRefundable)
      return
    }

    try {
      const result = await record.mutateAsync({
        creditNoteId,
        paymentId: state.paymentId || null,
        method: state.method,
        status: state.alreadyPaid ? "settled" : "pending",
        amountCents,
        currency,
        paymentSessionId: isAdapterBackedMethod(state.method) ? state.paymentSessionId : null,
        instrumentAmountCents: isInstrumentMethod(state.method)
          ? (state.instrumentAmountCents ?? null)
          : null,
        instrumentCurrency:
          isInstrumentMethod(state.method) && state.instrumentAmountCents ? currency : null,
        counterpartyOrganizationId:
          state.method === "counterparty_offset"
            ? state.counterpartyOrganizationId.trim() || null
            : null,
        externalReference: state.externalReference.trim() || null,
        notes: state.notes.trim() || null,
        idempotencyKey: idempotencyKeyRef.current,
        ...(approvalId ? { approvalId } : {}),
      })

      if (isRefundSettlementApprovalRequired(result)) {
        setPendingApproval(result)
        return
      }
      onOpenChange(false)
      onRecorded?.()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : dialog.errors.generic)
    }
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    void submit(pendingApproval?.approval.id)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" className="gap-0 overflow-y-auto p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{dialog.title}</SheetTitle>
          <SheetDescription>{dialog.description}</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-5 px-6 py-5">
            {/*
              First, not last. This is the answer to the button the operator
              just pressed, and a long form would otherwise push it below the
              fold where it reads as "nothing happened".
            */}
            {pendingApproval ? (
              <Alert>
                <ShieldQuestion className="size-4" aria-hidden="true" />
                <AlertTitle>{dialog.approvalRequiredTitle}</AlertTitle>
                <AlertDescription>
                  <p>{dialog.approvalRequiredDescription}</p>
                  <p className="mt-2 text-xs">
                    {dialog.approvalIdLabel}:{" "}
                    <span className="font-mono">{pendingApproval.approval.id}</span>
                  </p>
                </AlertDescription>
              </Alert>
            ) : null}

            {/*
              Locked once an approval is pending. The server fingerprints the
              exact command that was approved, so an edited field would fail on
              retry with "does not authorize this exact refund" — better to make
              that impossible than to explain it afterwards.
            */}
            <fieldset
              disabled={Boolean(pendingApproval)}
              className="flex flex-col gap-5 border-0 p-0"
            >
              {/* What is being refunded. Also what bounds the amount. */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="refund-payment">{dialog.paymentLabel}</Label>
                {!paymentsQuery.isLoading && payments.length === 0 ? (
                  <p className="rounded-md border border-dashed px-3 py-2 text-muted-foreground text-xs">
                    {dialog.noPayments}
                  </p>
                ) : (
                  <Select
                    value={state.paymentId}
                    onValueChange={(value) => set("paymentId", value ?? "")}
                  >
                    <SelectTrigger id="refund-payment" className="w-full">
                      <SelectValue placeholder={dialog.paymentPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {payments.map((payment) => (
                        <SelectItem key={payment.id} value={payment.id}>
                          {formatCurrency(payment.amountCents / 100, payment.currency)} ·{" "}
                          {messages.common.paymentMethodLabels[payment.paymentMethod]} ·{" "}
                          {payment.paymentDate}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {refundable ? (
                  <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <Info className="size-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {dialog.refundableLabel}:{" "}
                      <span className="font-medium font-mono text-foreground">
                        {formatCurrency(
                          refundable.refundableRemainderCents / 100,
                          refundable.currency,
                        )}
                      </span>
                      {refundable.pendingCents > 0 ? ` — ${dialog.pendingHeldNote}` : ""}
                    </span>
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs">{dialog.paymentHint}</p>
                )}
              </div>

              {/* How it was paid. Everything below reacts to this. */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="refund-method">{dialog.methodLabel}</Label>
                <Select
                  value={state.method}
                  onValueChange={(value) => set("method", (value ?? "bank_transfer") as never)}
                >
                  <SelectTrigger id="refund-method" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {dialog.methods[method]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">{dialog.methodHint}</p>
              </div>

              {isAdapterBackedMethod(state.method) ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="refund-session">{dialog.paymentSessionLabel}</Label>
                  {/*
                  An empty select here is a dead end, not a choice: this booking
                  was never paid by card, so the honest answer is to say so and
                  point at a method that will work.
                */}
                  {!sessionsQuery.isLoading && sessions.length === 0 ? (
                    <p className="rounded-md border border-dashed px-3 py-2 text-muted-foreground text-xs">
                      {dialog.noPaymentSessions}
                    </p>
                  ) : (
                    <>
                      <Select
                        value={state.paymentSessionId}
                        onValueChange={(value) => set("paymentSessionId", value ?? "")}
                      >
                        <SelectTrigger id="refund-session" className="w-full">
                          <SelectValue placeholder={dialog.paymentSessionPlaceholder} />
                        </SelectTrigger>
                        <SelectContent>
                          {sessions.map((session) => (
                            <SelectItem key={session.id} value={session.id}>
                              {formatCurrency(session.amountCents / 100, session.currency)}
                              {session.provider ? ` · ${session.provider}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-muted-foreground text-xs">{dialog.paymentSessionHint}</p>
                    </>
                  )}
                </div>
              ) : null}

              {/*
                The currency is the payment's whenever there is one: the
                refundable bound is currency-matched server-side, so a currency
                the payment is not in would silently skip the check that stops a
                double refund. With no payment to derive it from the operator
                picks — from a list, not by typing an ISO code from memory.
              */}
              <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="refund-amount">{dialog.amountLabel}</Label>
                  <CurrencyInput
                    id="refund-amount"
                    value={state.amountCents}
                    onChange={(value) => set("amountCents", value)}
                    currency={currency}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="refund-currency">{dialog.currencyLabel}</Label>
                  {selectedPayment ? (
                    <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 font-mono text-sm">
                      {currency}
                    </div>
                  ) : (
                    <CurrencyCombobox
                      id="refund-currency"
                      value={currency}
                      onChange={(value) => set("currency", value ?? defaultCurrency)}
                    />
                  )}
                </div>
              </div>

              {isInstrumentMethod(state.method) ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="refund-instrument-amount">{dialog.instrumentAmountLabel}</Label>
                  <CurrencyInput
                    id="refund-instrument-amount"
                    value={state.instrumentAmountCents}
                    onChange={(value) => set("instrumentAmountCents", value)}
                    currency={currency}
                  />
                  <p className="text-muted-foreground text-xs">{dialog.instrumentAmountHint}</p>
                </div>
              ) : null}

              {state.method === "counterparty_offset" ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="refund-counterparty">{dialog.counterpartyLabel}</Label>
                  <Input
                    id="refund-counterparty"
                    value={state.counterpartyOrganizationId}
                    onChange={(event) => set("counterpartyOrganizationId", event.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">{dialog.counterpartyHint}</p>
                </div>
              ) : null}

              <div className="flex items-start justify-between gap-4 rounded-md border bg-muted/20 px-4 py-3">
                <div className="min-w-0">
                  <Label htmlFor="refund-already-paid" className="font-medium text-sm">
                    {dialog.alreadyPaidLabel}
                  </Label>
                  <p className="mt-1 text-muted-foreground text-xs">{dialog.alreadyPaidHint}</p>
                </div>
                <Switch
                  id="refund-already-paid"
                  checked={state.alreadyPaid}
                  onCheckedChange={(checked) => set("alreadyPaid", checked)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="refund-reference">{dialog.referenceLabel}</Label>
                <Input
                  id="refund-reference"
                  value={state.externalReference}
                  onChange={(event) => set("externalReference", event.target.value)}
                />
                <p className="text-muted-foreground text-xs">{dialog.referenceHint}</p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="refund-notes">{dialog.notesLabel}</Label>
                <Textarea
                  id="refund-notes"
                  rows={3}
                  value={state.notes}
                  onChange={(event) => set("notes", event.target.value)}
                />
              </div>
            </fieldset>

            {submitError ? (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {dialog.cancel}
            </Button>
            <Button type="submit" disabled={record.isPending || exceedsRefundable}>
              {record.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {pendingApproval ? dialog.approvalRetry : dialog.submit}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
