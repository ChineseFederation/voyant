import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@voyant-travel/ui/components"
import { Loader2, Mail, Paperclip } from "lucide-react"
import { useEffect, useState } from "react"
import { useLegalUiMessagesOrDefault } from "../i18n/index.js"
import {
  type LegalContractRecord,
  useLegalBookingContractReview,
  useLegalContractMutation,
} from "../index.js"
import { isManagedBookingContractRevision } from "../managed-booking-contract.js"

export interface ContractSendDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contract: LegalContractRecord
  /**
   * Recipient email — typically the linked person's primary email, resolved
   * by the caller (the operator starter knows how to look it up via CRM).
   * The dialog uses this as the read-only "To" line; if absent the dialog
   * shows a warning and disables Send.
   */
  defaultRecipientEmail?: string | null
  /** Optional override for the prefilled subject. */
  defaultSubject?: string
  /** Optional override for the prefilled message body. */
  defaultMessage?: string
  /**
   * Optional list of attachment names that will accompany the email. The
   * dialog renders them as a paperclip-prefixed list so the operator sees
   * what's bundled (the contract PDF + any extras).
   */
  attachments?: ReadonlyArray<{ id: string; name: string }>
  onSent?: () => void
}

/**
 * Send-contract preview dialog. Renders an editable subject + message
 * over a read-only recipient line, so the operator can tweak the
 * customer-facing copy before flipping the contract to `sent`. The
 * actual `POST /:id/send` accepts the subject + message + recipient
 * overrides and forwards them on the lifecycle event for whichever
 * notification subscriber wires up email delivery downstream.
 */
export function ContractSendDialog({
  open,
  onOpenChange,
  contract,
  defaultRecipientEmail,
  defaultSubject,
  defaultMessage,
  attachments,
  onSent,
}: ContractSendDialogProps) {
  const { send } = useLegalContractMutation()
  const allMessages = useLegalUiMessagesOrDefault()
  const messages = allMessages.contractSendDialog
  const reviewUnavailableMessage = allMessages.bookingContractReviewDialog.unavailable
  // A managed booking-contract revision carries the same review gate on send as
  // on issue (voyant#4706): the route needs the revision and content
  // fingerprint the operator is looking at. Ordinary contracts 404 here, which
  // leaves the approval undefined and the generic send path unchanged.
  const isManagedBookingRevision = isManagedBookingContractRevision(contract)
  const reviewQuery = useLegalBookingContractReview({
    contractId: contract.id,
    enabled: open && isManagedBookingRevision,
  })
  const reviewApproval = reviewQuery.data
    ? {
        revision: reviewQuery.data.revision,
        contentFingerprint: reviewQuery.data.contentFingerprint,
      }
    : null

  const fallbackSubject =
    defaultSubject ??
    messages.fallbackSubject.replace("{number}", contract.contractNumber ?? messages.title)
  const fallbackMessage =
    defaultMessage ??
    [
      "Hi,",
      "",
      `Please find attached the contract${
        contract.contractNumber ? ` ${contract.contractNumber}` : ""
      } for your booking.`,
      "",
      "Reply to this email if you have any questions before signing.",
      "",
      "Thanks,",
    ].join("\n")

  const [subject, setSubject] = useState(fallbackSubject)
  const [message, setMessage] = useState(fallbackMessage)

  // Reset the form when the dialog re-opens or the underlying contract /
  // defaults change — guarantees the operator never sees stale copy from
  // a previous Send attempt on a different contract.
  useEffect(() => {
    if (open) {
      setSubject(fallbackSubject)
      setMessage(fallbackMessage)
    }
  }, [open, fallbackSubject, fallbackMessage])

  const canSend =
    Boolean(defaultRecipientEmail) &&
    !send.isPending &&
    (!isManagedBookingRevision || reviewApproval !== null)
  const isAlreadySent = contract.status === "sent" || contract.status === "signed"

  const handleSend = async () => {
    await send.mutateAsync({
      id: contract.id,
      input: {
        recipientEmail: defaultRecipientEmail ?? null,
        subject: subject.trim() || null,
        message: message.trim() || null,
        ...(reviewApproval ?? {}),
      },
    })
    onOpenChange(false)
    onSent?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{messages.title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          {isManagedBookingRevision && reviewQuery.isError ? (
            <div
              role="alert"
              className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-300"
            >
              {reviewUnavailableMessage}
            </div>
          ) : null}

          {isAlreadySent ? (
            <div
              role="status"
              className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
            >
              {messages.alreadySentWarning}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label>{messages.fields.to}</Label>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="font-mono">
                {defaultRecipientEmail ?? messages.recipientPlaceholder}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contract-send-subject">{messages.fields.subject}</Label>
            <Input
              id="contract-send-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contract-send-message">{messages.fields.message}</Label>
            <Textarea
              id="contract-send-message"
              rows={8}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{messages.messageHint}</p>
          </div>

          {attachments && attachments.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label>{messages.fields.attachments}</Label>
              <ul className="flex flex-col gap-1 rounded-md border bg-muted/40 px-3 py-2 text-xs">
                {attachments.map((attachment) => (
                  <li key={attachment.id} className="flex items-center gap-2">
                    <Paperclip className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{attachment.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={send.isPending}
          >
            {messages.actions.cancel}
          </Button>
          {defaultRecipientEmail ? (
            <Button type="button" size="sm" onClick={handleSend} disabled={!canSend}>
              {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {messages.actions.send}
            </Button>
          ) : (
            <Tooltip>
              {/* biome-ignore lint/a11y/noNoninteractiveTabindex: required so disabled-button tooltips remain keyboard-discoverable -- owner: legal-react; disabled Send needs a focusable wrapper to surface its reason. */}
              <TooltipTrigger render={<span tabIndex={0} className="inline-block" />}>
                <Button type="button" size="sm" disabled className="pointer-events-none">
                  {messages.actions.send}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{messages.missingRecipient}</TooltipContent>
            </Tooltip>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
