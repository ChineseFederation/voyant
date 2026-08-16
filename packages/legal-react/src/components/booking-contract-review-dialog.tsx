"use client"

import { formatMessage } from "@voyant-travel/i18n"
import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@voyant-travel/ui/components"
import { Loader2 } from "lucide-react"
import { useLegalUiI18nOrDefault } from "../i18n/index.js"
import {
  type LegalBookingContractReview,
  type LegalBookingContractReviewApproval,
  useLegalBookingContractReview,
} from "../index.js"

export interface BookingContractReviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contractId: string
  /** Fired with the approval the route needs; the caller runs the mutation. */
  onIssue: (approval: LegalBookingContractReviewApproval) => void
  issuing?: boolean
}

/**
 * The operator's half of the booking-contract reviewed lifecycle (voyant#4706).
 *
 * A managed booking-contract revision cannot be issued blind: the route checks
 * the revision and content fingerprint the caller confirms against the row it
 * is about to move. This dialog is where that confirmation comes from — it
 * shows the un-redacted revision, and Issue carries the fingerprint of exactly
 * what is on screen. If the review cannot be read (the deployment's staff role
 * lacks booking PII read), Issue stays disabled with the reason, rather than
 * offering an action that would be refused.
 */
export function BookingContractReviewDialog({
  open,
  onOpenChange,
  contractId,
  onIssue,
  issuing = false,
}: BookingContractReviewDialogProps) {
  const i18n = useLegalUiI18nOrDefault()
  const messages = i18n.messages.bookingContractReviewDialog
  const reviewQuery = useLegalBookingContractReview({ contractId, enabled: open })
  const review = reviewQuery.data ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{messages.title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <p className="text-muted-foreground text-sm">{messages.description}</p>

          {reviewQuery.isPending ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              {i18n.messages.common.loading}
            </div>
          ) : null}

          {reviewQuery.isError ? (
            <div
              role="alert"
              className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-300"
            >
              {messages.unavailable}
            </div>
          ) : null}

          {review ? <BookingContractReviewBody review={review} /> : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={issuing}
          >
            {messages.actions.cancel}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!review || issuing}
            onClick={() => {
              if (!review) return
              onIssue({
                revision: review.revision,
                contentFingerprint: review.contentFingerprint,
              })
            }}
          >
            {issuing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {messages.actions.issue}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BookingContractReviewBody({ review }: { review: LegalBookingContractReview }) {
  const i18n = useLegalUiI18nOrDefault()
  const messages = i18n.messages.bookingContractReviewDialog
  const total =
    review.booking.totalAmountCents === null
      ? i18n.messages.common.noResultsDash
      : i18n.formatCurrency(review.booking.totalAmountCents / 100, review.booking.currency)

  return (
    <div className="grid gap-4">
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <ReviewField label={messages.fields.booking}>{review.booking.reference}</ReviewField>
        <ReviewField label={messages.fields.customer}>
          {review.booking.customerName ?? i18n.messages.common.noResultsDash}
        </ReviewField>
        <ReviewField label={messages.fields.template}>
          {formatMessage(messages.templateSummary, {
            name: review.template.name,
            version: review.template.version,
            language: review.template.language,
          })}
        </ReviewField>
        <ReviewField label={messages.fields.revision}>
          <Badge variant="outline">{review.revision}</Badge>
        </ReviewField>
        <ReviewField label={messages.fields.total}>{total}</ReviewField>
      </dl>

      {review.products.length > 0 ? (
        <div className="grid gap-1">
          <span className="font-medium text-sm">{messages.fields.products}</span>
          <ul className="grid gap-1 rounded-md border bg-muted/40 px-3 py-2 text-xs">
            {review.products.map((product, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: positional review snapshot -- owner: legal-react; the frozen product list has no identifier of its own and is never reordered or filtered.
              <li key={`${product.title}-${index}`} className="flex justify-between gap-2">
                <span className="truncate">
                  {formatMessage(messages.productLine, {
                    quantity: product.quantity,
                    title: product.title,
                  })}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {product.amountCents === null
                    ? i18n.messages.common.noResultsDash
                    : i18n.formatCurrency(product.amountCents / 100, product.currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-1">
        <span className="font-medium text-sm">{messages.bodyHeading}</span>
        {review.contract.renderedBody ? (
          review.contract.renderedBodyFormat === "html" ? (
            // Only the admin-authored template contributes markup here: an
            // `html` body is rendered with `outputEscape: "escape"`, so every
            // interpolated booking value arrives HTML-escaped. Same trust
            // level as the template preview on the template detail page.
            <div
              className="prose prose-sm max-h-72 max-w-none overflow-y-auto rounded-md border bg-background px-3 py-2 text-xs"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: admin-authored template markup with escaped interpolations -- owner: legal-react; the reviewed document must render as the customer sees it.
              dangerouslySetInnerHTML={{ __html: review.contract.renderedBody }}
            />
          ) : (
            <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border bg-background px-3 py-2 font-sans text-xs">
              {review.contract.renderedBody}
            </pre>
          )
        ) : (
          <p className="text-muted-foreground text-xs">{messages.bodyUnavailable}</p>
        )}
      </div>
    </div>
  )
}

function ReviewField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}
