"use client"

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmActionButton,
} from "@voyant-travel/ui/components"
import { cn } from "@voyant-travel/ui/lib/utils"
import { ArrowLeft, ExternalLink, Loader2, Pencil } from "lucide-react"
import type * as React from "react"
import { useFinanceUiI18nOrDefault, useFinanceUiMessagesOrDefault } from "../i18n/index.js"
import { type UnifiedPaymentRecord, usePayment, usePaymentRefundableRemainder } from "../index.js"

export interface PaymentDetailPageSlots {
  afterHeader?: React.ReactNode
  afterSummary?: React.ReactNode
  afterLinks?: React.ReactNode
  afterMetadata?: React.ReactNode
}

export interface PaymentDetailPageProps {
  id: string
  className?: string
  onBack?: () => void
  onInvoiceOpen?: (invoiceId: string, payment: UnifiedPaymentRecord) => void
  onBookingOpen?: (bookingId: string, payment: UnifiedPaymentRecord) => void
  onPersonOpen?: (personId: string, payment: UnifiedPaymentRecord) => void
  onOrganizationOpen?: (organizationId: string, payment: UnifiedPaymentRecord) => void
  onSupplierOpen?: (supplierId: string, payment: UnifiedPaymentRecord) => void
  onEdit?: (payment: UnifiedPaymentRecord) => void
  onDelete?: (paymentId: string) => Promise<void> | void
  deletePending?: boolean
  slots?: PaymentDetailPageSlots
}

export function PaymentDetailPage({
  id,
  className,
  onBack,
  onInvoiceOpen,
  onBookingOpen,
  onPersonOpen,
  onOrganizationOpen,
  onSupplierOpen,
  onEdit,
  onDelete,
  deletePending,
  slots,
}: PaymentDetailPageProps) {
  const messages = useFinanceUiMessagesOrDefault()
  const paymentQuery = usePayment(id)

  if (paymentQuery.isPending) {
    return <PaymentDetailLoading className={className} />
  }

  if (paymentQuery.isError || !paymentQuery.data?.data) {
    return (
      <PaymentDetailState
        className={className}
        message={
          paymentQuery.isError
            ? paymentQuery.error instanceof Error
              ? paymentQuery.error.message
              : messages.paymentDetailPage.states.loadFailed
            : messages.paymentDetailPage.states.notFound
        }
        onBack={onBack}
      />
    )
  }

  const payment = paymentQuery.data.data

  return (
    <div data-slot="payment-detail-page" className={cn("flex flex-col gap-6", className)}>
      <PaymentDetailHeader
        payment={payment}
        onBack={onBack}
        onEdit={onEdit}
        onDelete={onDelete}
        deletePending={deletePending}
      />
      {slots?.afterHeader}

      <div className="grid gap-4 md:grid-cols-2">
        <PaymentSummaryCard payment={payment} />
        <PaymentLinksCard
          payment={payment}
          onInvoiceOpen={onInvoiceOpen}
          onBookingOpen={onBookingOpen}
          onPersonOpen={onPersonOpen}
          onOrganizationOpen={onOrganizationOpen}
          onSupplierOpen={onSupplierOpen}
        />
      </div>
      {slots?.afterSummary}
      {slots?.afterLinks}

      <PaymentMetadataCard payment={payment} />
      {slots?.afterMetadata}
    </div>
  )
}

export interface PaymentDetailHeaderProps {
  payment: UnifiedPaymentRecord
  onBack?: () => void
  onEdit?: (payment: UnifiedPaymentRecord) => void
  onDelete?: (paymentId: string) => Promise<void> | void
  deletePending?: boolean
  className?: string
}

export function PaymentDetailHeader({
  payment,
  onBack,
  onEdit,
  onDelete,
  deletePending,
  className,
}: PaymentDetailHeaderProps) {
  const messages = useFinanceUiMessagesOrDefault()
  const relatedNumber = payment.kind === "customer" ? payment.invoiceNumber : payment.bookingNumber

  return (
    <div data-slot="payment-detail-header" className={cn("flex items-start gap-4", className)}>
      {onBack ? (
        <Button type="button" variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span className="sr-only">{messages.paymentDetailPage.actions.back}</span>
        </Button>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate font-mono text-lg font-semibold tracking-tight">{payment.id}</h1>
          <Badge variant="outline">{messages.paymentsPage.kindLabels[payment.kind]}</Badge>
        </div>
        {relatedNumber ? (
          <p className="mt-1 text-sm text-muted-foreground">{relatedNumber}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <Badge variant={paymentStatusVariant[payment.status] ?? "secondary"}>
          {messages.common.supplierPaymentStatusLabels[payment.status]}
        </Badge>
        {onEdit ? (
          <Button type="button" variant="outline" size="sm" onClick={() => onEdit(payment)}>
            <Pencil className="size-4" aria-hidden="true" />
            {messages.paymentDetailPage.actions.edit}
          </Button>
        ) : null}
        {onDelete ? (
          <ConfirmActionButton
            buttonLabel={messages.paymentDetailPage.actions.delete}
            confirmLabel={messages.paymentDetailPage.actions.delete}
            cancelLabel={messages.common.cancel}
            title={messages.paymentDetailPage.actions.deleteTitle}
            description={messages.paymentDetailPage.actions.deleteDescription}
            variant="destructive"
            confirmVariant="destructive"
            disabled={deletePending}
            onConfirm={() => onDelete(payment.id)}
          />
        ) : null}
      </div>
    </div>
  )
}

export interface PaymentDetailCardProps {
  payment: UnifiedPaymentRecord
  className?: string
}

export function PaymentSummaryCard({ payment, className }: PaymentDetailCardProps) {
  const messages = useFinanceUiMessagesOrDefault()
  const { formatCurrency, formatNumber } = useFinanceUiI18nOrDefault()
  const detail = messages.paymentDetailPage
  const fxRateLabel = formatFxRate(payment, formatNumber)
  // Customer payments only. A supplier payment is accounts payable — money the
  // operator owes out — and has no customer refund to bound.
  const refundableQuery = usePaymentRefundableRemainder(
    payment.kind === "customer" ? payment.id : null,
    { enabled: payment.kind === "customer" },
  )
  const refundable = refundableQuery.data?.data ?? null

  return (
    <Card data-slot="payment-summary-card" className={className}>
      <CardHeader>
        <CardTitle>{detail.titles.summary}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm">
          <DetailRow label={detail.fields.amount}>
            <span className="font-mono">
              {formatCurrency(payment.amountCents / 100, payment.currency)}
            </span>
          </DetailRow>
          {payment.baseAmountCents !== null && payment.baseCurrency ? (
            <DetailRow label={detail.fields.baseAmount}>
              <span className="font-mono">
                {formatCurrency(payment.baseAmountCents / 100, payment.baseCurrency)}
              </span>
            </DetailRow>
          ) : null}
          {fxRateLabel ? (
            <DetailRow label={detail.fields.fxRate}>
              <span className="font-mono">{fxRateLabel}</span>
            </DetailRow>
          ) : null}
          <DetailRow label={detail.fields.status}>
            <Badge variant={paymentStatusVariant[payment.status] ?? "secondary"}>
              {messages.common.supplierPaymentStatusLabels[payment.status]}
            </Badge>
          </DetailRow>
          <DetailRow label={detail.fields.method}>
            {formatPaymentMethod(payment.paymentMethod, messages)}
          </DetailRow>
          {/*
            The number that stops a double refund (voyant#4303). Deliberately
            NOT "paid minus refunded": a refund still in flight has already
            spoken for its share, so this shrinks the moment one is started.
          */}
          {refundable ? (
            <DetailRow label={detail.fields.refundable}>
              <div className="text-right">
                <span className="font-mono">
                  {formatCurrency(refundable.refundableRemainderCents / 100, refundable.currency)}
                </span>
                {refundable.pendingCents > 0 ? (
                  <p className="mt-0.5 text-muted-foreground text-xs">
                    {detail.states.refundPending}
                  </p>
                ) : null}
              </div>
            </DetailRow>
          ) : null}
          <DetailRow label={detail.fields.date}>{payment.paymentDate}</DetailRow>
          <DetailRow label={detail.fields.reference}>
            {payment.referenceNumber ?? detail.states.noValue}
          </DetailRow>
          {payment.notes ? (
            <div className="mt-2 flex flex-col gap-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {detail.fields.notes}
              </dt>
              <dd className="whitespace-pre-wrap text-sm">{payment.notes}</dd>
            </div>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  )
}

function formatFxRate(
  payment: UnifiedPaymentRecord,
  formatNumber: (value: number | string | bigint, options?: Intl.NumberFormatOptions) => string,
) {
  if (
    payment.baseAmountCents === null ||
    !payment.baseCurrency ||
    payment.baseAmountCents <= 0 ||
    payment.currency === payment.baseCurrency
  ) {
    return null
  }

  const rate = payment.amountCents / payment.baseAmountCents
  return `1 ${payment.baseCurrency} = ${formatNumber(rate, { maximumFractionDigits: 6 })} ${
    payment.currency
  }`
}

export interface PaymentLinksCardProps extends PaymentDetailCardProps {
  onInvoiceOpen?: (invoiceId: string, payment: UnifiedPaymentRecord) => void
  onBookingOpen?: (bookingId: string, payment: UnifiedPaymentRecord) => void
  onPersonOpen?: (personId: string, payment: UnifiedPaymentRecord) => void
  onOrganizationOpen?: (organizationId: string, payment: UnifiedPaymentRecord) => void
  onSupplierOpen?: (supplierId: string, payment: UnifiedPaymentRecord) => void
}

export function PaymentLinksCard({
  payment,
  className,
  onInvoiceOpen,
  onBookingOpen,
  onPersonOpen,
  onOrganizationOpen,
  onSupplierOpen,
}: PaymentLinksCardProps) {
  const messages = useFinanceUiMessagesOrDefault()
  const detail = messages.paymentDetailPage

  return (
    <Card data-slot="payment-links-card" className={className}>
      <CardHeader>
        <CardTitle>{detail.titles.links}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm">
          {payment.kind === "customer" ? (
            <>
              <DetailRow label={detail.fields.paidBy}>
                {payment.personId && payment.personName ? (
                  <DetailLink
                    label={payment.personName}
                    actionLabel={detail.actions.viewPerson}
                    onClick={() => onPersonOpen?.(payment.personId as string, payment)}
                    disabled={!onPersonOpen}
                  />
                ) : payment.organizationId && payment.organizationName ? (
                  <DetailLink
                    label={payment.organizationName}
                    actionLabel={detail.actions.viewOrganization}
                    onClick={() => onOrganizationOpen?.(payment.organizationId as string, payment)}
                    disabled={!onOrganizationOpen}
                  />
                ) : (
                  detail.states.noValue
                )}
              </DetailRow>
              {payment.personId &&
              payment.personName &&
              payment.organizationId &&
              payment.organizationName ? (
                <DetailRow label={detail.fields.organization}>
                  <DetailLink
                    label={payment.organizationName}
                    actionLabel={detail.actions.viewOrganization}
                    onClick={() => onOrganizationOpen?.(payment.organizationId as string, payment)}
                    disabled={!onOrganizationOpen}
                  />
                </DetailRow>
              ) : null}
              <DetailRow label={detail.fields.invoice}>
                {payment.invoiceId ? (
                  <DetailLink
                    label={payment.invoiceNumber ?? detail.actions.viewInvoice}
                    actionLabel={detail.actions.viewInvoice}
                    onClick={() => onInvoiceOpen?.(payment.invoiceId as string, payment)}
                    disabled={!onInvoiceOpen}
                  />
                ) : (
                  detail.states.noValue
                )}
              </DetailRow>
            </>
          ) : (
            <>
              <DetailRow label={detail.fields.paidTo}>
                {payment.supplierId && payment.supplierName ? (
                  <DetailLink
                    label={payment.supplierName}
                    actionLabel={detail.actions.viewSupplier}
                    onClick={() => onSupplierOpen?.(payment.supplierId as string, payment)}
                    disabled={!onSupplierOpen}
                  />
                ) : (
                  (payment.supplierName ?? detail.states.noValue)
                )}
              </DetailRow>
              <DetailRow label={detail.fields.booking}>
                {payment.bookingId ? (
                  <DetailLink
                    label={payment.bookingNumber ?? detail.actions.viewBooking}
                    actionLabel={detail.actions.viewBooking}
                    onClick={() => onBookingOpen?.(payment.bookingId as string, payment)}
                    disabled={!onBookingOpen}
                  />
                ) : (
                  detail.states.noValue
                )}
              </DetailRow>
            </>
          )}
        </dl>
      </CardContent>
    </Card>
  )
}

export function PaymentMetadataCard({ payment, className }: PaymentDetailCardProps) {
  const messages = useFinanceUiMessagesOrDefault()
  const { formatDateTime } = useFinanceUiI18nOrDefault()
  const detail = messages.paymentDetailPage

  return (
    <Card data-slot="payment-metadata-card" className={className}>
      <CardHeader>
        <CardTitle>{detail.titles.metadata}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm">
          <DetailRow label={detail.fields.kind}>
            {messages.paymentsPage.kindLabels[payment.kind]}
          </DetailRow>
          <DetailRow label={detail.fields.createdAt}>{formatDateTime(payment.createdAt)}</DetailRow>
          <DetailRow label={detail.fields.updatedAt}>{formatDateTime(payment.updatedAt)}</DetailRow>
        </dl>
      </CardContent>
    </Card>
  )
}

function PaymentDetailLoading({ className }: { className?: string }) {
  const messages = useFinanceUiMessagesOrDefault()

  return (
    <div className={cn("flex min-h-48 items-center justify-center", className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {messages.paymentDetailPage.states.loading}
      </div>
    </div>
  )
}

function PaymentDetailState({
  className,
  message,
  onBack,
}: {
  className?: string
  message: string
  onBack?: () => void
}) {
  const messages = useFinanceUiMessagesOrDefault()

  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 py-12", className)}>
      <p className="text-muted-foreground">{message}</p>
      {onBack ? (
        <Button type="button" variant="outline" onClick={onBack}>
          {messages.paymentDetailPage.actions.back}
        </Button>
      ) : null}
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

function DetailLink({
  label,
  actionLabel,
  onClick,
  disabled,
}: {
  label: string
  actionLabel: string
  onClick: () => void
  disabled?: boolean
}) {
  if (disabled) return label

  return (
    <Button type="button" variant="link" className="h-auto p-0" onClick={onClick}>
      {label}
      <ExternalLink className="ml-1 size-3" aria-label={actionLabel} />
    </Button>
  )
}

const paymentStatusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  completed: "default",
  failed: "destructive",
  refunded: "secondary",
}

function formatPaymentMethod(
  method: string,
  messages: ReturnType<typeof useFinanceUiMessagesOrDefault>,
) {
  if (method in messages.common.paymentMethodLabels) {
    return messages.common.paymentMethodLabels[
      method as keyof typeof messages.common.paymentMethodLabels
    ]
  }

  if (method in messages.common.supplierPaymentMethodLabels) {
    return messages.common.supplierPaymentMethodLabels[
      method as keyof typeof messages.common.supplierPaymentMethodLabels
    ]
  }

  return method.replace(/_/g, " ")
}
