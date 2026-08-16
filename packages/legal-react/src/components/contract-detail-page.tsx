// agent-quality: file-size exception -- owner: legal-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
import { useQueryClient } from "@tanstack/react-query"
import { formatMessage } from "@voyant-travel/i18n"
import { Badge, Button, confirmDialog } from "@voyant-travel/ui/components"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileText,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react"
import type { ReactNode } from "react"
import { useState } from "react"
import { useLegalUiI18nOrDefault, useLegalUiMessagesOrDefault } from "../i18n/index.js"
import type { LegalContractStatusValue } from "../i18n/messages.js"
import {
  type LegalBookingContractReviewApproval,
  type LegalContractAttachmentRecord,
  type LegalContractRecord,
  useLegalContract,
  useLegalContractAttachmentMutation,
  useLegalContractAttachments,
  useLegalContractMutation,
  useLegalContractSignatures,
  useVoyantLegalContext,
} from "../index.js"
import { isManagedBookingContractRevision } from "../managed-booking-contract.js"
import { AttachmentDialog } from "./attachment-dialog.js"
import { BookingContractReviewDialog } from "./booking-contract-review-dialog.js"
import { ContractSendDialog } from "./contract-send-dialog.js"
import { SignatureDialog } from "./signature-dialog.js"

const statusVariant: Record<
  LegalContractStatusValue,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "outline",
  issued: "secondary",
  sent: "secondary",
  signed: "default",
  executed: "default",
  expired: "destructive",
  void: "destructive",
}

const generationFailureLabelKey: Record<
  string,
  keyof ReturnType<typeof useLegalUiMessagesOrDefault>["contractDetailPage"]["generationFailure"]
> = {
  render_unavailable: "templateError",
  generator_failed: "generatorFailed",
}

function resolveContractGenerationFailure(contract: LegalContractRecord) {
  const metadata = contract.metadata
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null
  }

  const status = metadata.lastGenerationStatus
  if (typeof status !== "string" || status === "generated") {
    return null
  }

  return {
    status,
    error:
      typeof metadata.lastGenerationError === "string" && metadata.lastGenerationError.trim()
        ? metadata.lastGenerationError
        : null,
  }
}

function withApiBaseUrl(baseUrl: string, path: string) {
  const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${trimmedBase}${normalizedPath}`
}

function getDefaultLegalContractAttachmentDownloadHref(
  baseUrl: string,
  attachment: LegalContractAttachmentRecord,
) {
  return withApiBaseUrl(baseUrl, `/v1/admin/legal/contracts/attachments/${attachment.id}/download`)
}

export interface ContractDetailPageProps {
  id: string
  onBackToContracts?: () => void
  renderContractDialog?: (props: ContractDetailDialogRenderProps) => ReactNode
  renderReference?: (props: ContractReferenceRenderProps) => ReactNode
  getAttachmentDownloadHref?: (attachment: LegalContractAttachmentRecord) => string
  slots?: ContractDetailPageSlots
  /**
   * Resolve the recipient email for the Send-contract dialog. Operator
   * templates wire this to the linked CRM person's primary email; if
   * unset the dialog displays a "no recipient" warning and disables Send.
   */
  resolveSendRecipientEmail?: (contract: LegalContractRecord) => string | null | undefined
}

export interface ContractDetailPageSlots {
  detailsContent?: ReactNode
  partiesContent?: ReactNode
  signaturesContent?: ReactNode
  documentsContent?: ReactNode
}

export type ContractReferenceKind =
  | "person"
  | "organization"
  | "supplier"
  | "channel"
  | "booking"
  | "target"
  | "legacyTransactionOffer"
  | "legacyTransactionOrder"
  | "templateVersion"
  | "series"

export interface ContractReferenceRenderProps {
  kind: ContractReferenceKind
  id: string
  contract: LegalContractRecord
}

export interface ContractDetailDialogRenderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contract: LegalContractRecord
  onSuccess: () => void
}

export function ContractDetailPage({
  id,
  onBackToContracts,
  renderContractDialog,
  renderReference,
  getAttachmentDownloadHref,
  slots,
  resolveSendRecipientEmail,
}: ContractDetailPageProps) {
  const queryClient = useQueryClient()
  const { baseUrl } = useVoyantLegalContext()
  const i18n = useLegalUiI18nOrDefault()
  const messages = useLegalUiMessagesOrDefault()
  const f = messages.contractDetailPage
  const { remove, issue, execute, voidContract } = useLegalContractMutation()
  const { remove: removeAttachment } = useLegalContractAttachmentMutation()

  const [editOpen, setEditOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [signOpen, setSignOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [editingAttachment, setEditingAttachment] = useState<
    LegalContractAttachmentRecord | undefined
  >()

  const { data: contract, isPending } = useLegalContract(id)
  const { data: signatures, refetch: refetchSignatures } = useLegalContractSignatures({
    contractId: id,
  })
  const { data: attachments, refetch: refetchAttachments } = useLegalContractAttachments({
    contractId: id,
  })

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">{messages.common.loading}</p>
        </div>
      </div>
    )
  }

  if (!contract) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-muted-foreground">{f.notFound}</p>
        {onBackToContracts ? (
          <Button variant="outline" onClick={onBackToContracts}>
            {f.backToContracts}
          </Button>
        ) : null}
      </div>
    )
  }

  const status = contract.status
  const managedBookingRevision = isManagedBookingContractRevision(contract)
  const generationFailure = resolveContractGenerationFailure(contract)
  const generationFailureMessages = messages.contractDetailPage.generationFailure
  const failureLabelKey = generationFailure
    ? generationFailureLabelKey[generationFailure.status]
    : null
  const failureLabel = failureLabelKey
    ? generationFailureMessages[failureLabelKey]
    : generationFailureMessages.defaultLabel
  const canAddSignature = status === "sent" || status === "signed"
  const renderReferenceValue = (kind: ContractReferenceKind, referenceId: string) =>
    renderReference?.({ kind, id: referenceId, contract }) ?? (
      <span className="font-mono text-xs">{referenceId}</span>
    )
  const targetValue = getContractTargetValue(contract)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        {onBackToContracts ? (
          <Button variant="ghost" size="icon" onClick={onBackToContracts}>
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{f.title}</h1>
            <Badge variant={statusVariant[status] ?? "secondary"}>
              {messages.common.contractStatusLabels[status] ?? status}
            </Badge>
            <Badge variant="outline">
              {messages.common.contractScopeLabels[
                contract.scope as keyof typeof messages.common.contractScopeLabels
              ] ?? contract.scope}
            </Badge>
          </div>
          <p className="mt-1 truncate font-mono text-muted-foreground text-sm">
            {contract.contractNumber ?? contract.title}
          </p>
          {contract.contractNumber ? (
            <p className="mt-1 truncate text-muted-foreground text-xs">{contract.title}</p>
          ) : null}
          {generationFailure ? (
            <div className="mt-3 max-w-2xl space-y-1">
              <Badge variant="destructive">{failureLabel}</Badge>
              <p className="text-muted-foreground text-sm">
                {generationFailure.error ?? generationFailureMessages.fallbackReason}
              </p>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status === "draft" ? (
            <Button
              size="sm"
              onClick={() => (managedBookingRevision ? setReviewOpen(true) : issue.mutate({ id }))}
              disabled={issue.isPending}
            >
              {f.actions.issue}
            </Button>
          ) : null}
          {status === "issued" || status === "sent" ? (
            <Button size="sm" onClick={() => setSendOpen(true)}>
              <Send className="mr-2 size-4" aria-hidden="true" />
              {f.actions.send}
            </Button>
          ) : null}
          {status === "signed" ? (
            <Button size="sm" onClick={() => execute.mutate(id)} disabled={execute.isPending}>
              <CheckCircle2 className="mr-2 size-4" aria-hidden="true" />
              {f.actions.execute}
            </Button>
          ) : null}
          {status !== "void" ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={async () => {
                if (await confirmDialog(f.voidConfirm)) {
                  voidContract.mutate(id)
                }
              }}
              disabled={voidContract.isPending}
            >
              {f.actions.void}
            </Button>
          ) : null}
          {renderContractDialog ? (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 size-4" aria-hidden="true" />
              {messages.common.edit}
            </Button>
          ) : null}
          {status === "draft" || status === "void" ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                if (
                  await confirmDialog({
                    description: formatMessage(f.deleteConfirm, { title: contract.title }),
                    destructive: true,
                  })
                ) {
                  remove.mutate(id, { onSuccess: () => onBackToContracts?.() })
                }
              }}
              disabled={remove.isPending}
            >
              <Trash2 className="mr-2 size-4" aria-hidden="true" />
              {messages.common.delete}
            </Button>
          ) : null}
        </div>
      </div>

      {/* All four sections stacked vertically — the data on each one
          is small enough that hiding them behind tabs forces extra
          clicks for no payoff. Operators see contract metadata,
          parties, signatures, and documents in one scroll. */}
      <div className="flex flex-col gap-4">
        {slots?.detailsContent !== undefined ? (
          slots.detailsContent
        ) : (
          <ContractSection title={f.sections.details}>
            <div className="grid gap-3 text-sm">
              <DetailRow label={f.fields.language}>{contract.language}</DetailRow>
              {contract.templateVersionId ? (
                <DetailRow label={f.fields.templateVersion}>
                  {renderReferenceValue("templateVersion", contract.templateVersionId)}
                </DetailRow>
              ) : null}
              {contract.seriesId ? (
                <DetailRow label={f.fields.series}>
                  {renderReferenceValue("series", contract.seriesId)}
                </DetailRow>
              ) : null}
              {contract.expiresAt ? (
                <DetailRow label={f.fields.expires}>
                  {i18n.formatDate(contract.expiresAt)}
                </DetailRow>
              ) : null}
              <div className="mt-2 border-t pt-3">
                <DetailRow label={f.fields.created}>
                  {i18n.formatDate(contract.createdAt)}
                </DetailRow>
                <DetailRow label={f.fields.updated}>
                  {i18n.formatDate(contract.updatedAt)}
                </DetailRow>
              </div>
            </div>
          </ContractSection>
        )}

        {slots?.partiesContent !== undefined ? (
          slots.partiesContent
        ) : (
          <ContractSection title={f.sections.parties}>
            <div className="grid gap-3 text-sm">
              {contract.personId ? (
                <DetailRow label={f.fields.person}>
                  {renderReferenceValue("person", contract.personId)}
                </DetailRow>
              ) : null}
              {contract.organizationId ? (
                <DetailRow label={f.fields.organization}>
                  {renderReferenceValue("organization", contract.organizationId)}
                </DetailRow>
              ) : null}
              {contract.supplierId ? (
                <DetailRow label={f.fields.supplier}>
                  {renderReferenceValue("supplier", contract.supplierId)}
                </DetailRow>
              ) : null}
              {contract.channelId ? (
                <DetailRow label={f.fields.channel}>
                  {renderReferenceValue("channel", contract.channelId)}
                </DetailRow>
              ) : null}
              {contract.bookingId ? (
                <DetailRow label={f.fields.booking}>
                  {renderReferenceValue("booking", contract.bookingId)}
                </DetailRow>
              ) : null}
              {targetValue ? (
                <DetailRow label={f.fields.target}>
                  {renderReferenceValue("target", targetValue)}
                </DetailRow>
              ) : null}
              {contract.legacyTransactionOfferId ? (
                <DetailRow label={f.fields.legacyTransactionOffer}>
                  {renderReferenceValue(
                    "legacyTransactionOffer",
                    contract.legacyTransactionOfferId,
                  )}
                </DetailRow>
              ) : null}
              {contract.legacyTransactionOrderId ? (
                <DetailRow label={f.fields.legacyTransactionOrder}>
                  {renderReferenceValue(
                    "legacyTransactionOrder",
                    contract.legacyTransactionOrderId,
                  )}
                </DetailRow>
              ) : null}
              {!contract.personId &&
              !contract.organizationId &&
              !contract.supplierId &&
              !contract.channelId &&
              !contract.bookingId &&
              !targetValue &&
              !contract.legacyTransactionOfferId &&
              !contract.legacyTransactionOrderId ? (
                <p className="text-muted-foreground">{f.empty.noParties}</p>
              ) : null}
            </div>
          </ContractSection>
        )}

        {slots?.signaturesContent !== undefined ? (
          slots.signaturesContent
        ) : (
          <ContractSection
            title={f.sections.signatures}
            action={
              canAddSignature ? (
                <Button size="sm" onClick={() => setSignOpen(true)}>
                  <Plus className="mr-2 size-4" aria-hidden="true" />
                  {f.actions.addSignature}
                </Button>
              ) : null
            }
          >
            {!signatures || signatures.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {f.empty.noSignatures}
              </p>
            ) : (
              <div className="rounded border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{f.fields.name}</TableHead>
                      <TableHead>{f.fields.email}</TableHead>
                      <TableHead>{f.fields.role}</TableHead>
                      <TableHead>{f.fields.method}</TableHead>
                      <TableHead>{f.fields.signedAt}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {signatures.map((signature) => (
                      <TableRow key={signature.id}>
                        <TableCell>{signature.signerName}</TableCell>
                        <TableCell>
                          {signature.signerEmail ?? messages.common.noResultsDash}
                        </TableCell>
                        <TableCell>
                          {signature.signerRole ?? messages.common.noResultsDash}
                        </TableCell>
                        <TableCell>{signature.method}</TableCell>
                        <TableCell>{i18n.formatDateTime(signature.signedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </ContractSection>
        )}

        {slots?.documentsContent !== undefined ? (
          slots.documentsContent
        ) : (
          <ContractSection
            title={f.sections.documents}
            action={
              <Button
                size="sm"
                onClick={() => {
                  setEditingAttachment(undefined)
                  setAttachOpen(true)
                }}
              >
                <Plus className="mr-2 size-4" aria-hidden="true" />
                {f.actions.addDocument}
              </Button>
            }
          >
            {!attachments || attachments.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {f.empty.noAttachments}
              </p>
            ) : (
              <div className="rounded border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{f.fields.name}</TableHead>
                      <TableHead>{f.fields.kind}</TableHead>
                      <TableHead className="w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attachments.map((attachment) => (
                      <AttachmentRow
                        key={attachment.id}
                        attachment={attachment}
                        downloadHref={
                          getAttachmentDownloadHref?.(attachment) ??
                          getDefaultLegalContractAttachmentDownloadHref(baseUrl, attachment)
                        }
                        onEdit={() => {
                          setEditingAttachment(attachment)
                          setAttachOpen(true)
                        }}
                        onDelete={async () => {
                          if (
                            await confirmDialog({
                              description: f.deleteAttachmentConfirm,
                              destructive: true,
                            })
                          ) {
                            removeAttachment.mutate({ contractId: id, id: attachment.id })
                          }
                        }}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </ContractSection>
        )}
      </div>

      {renderContractDialog?.({
        open: editOpen,
        onOpenChange: setEditOpen,
        contract,
        onSuccess: () => {
          setEditOpen(false)
          void queryClient.invalidateQueries()
        },
      })}

      <SignatureDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        contractId={id}
        onSuccess={() => {
          setSignOpen(false)
          void refetchSignatures()
          void queryClient.invalidateQueries()
        }}
      />

      <AttachmentDialog
        open={attachOpen}
        onOpenChange={setAttachOpen}
        contractId={id}
        attachment={editingAttachment}
        onSuccess={() => {
          setAttachOpen(false)
          setEditingAttachment(undefined)
          void refetchAttachments()
        }}
      />

      <BookingContractReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        contractId={id}
        issuing={issue.isPending}
        onIssue={(approval: LegalBookingContractReviewApproval) =>
          issue.mutate({ id, approval }, { onSuccess: () => setReviewOpen(false) })
        }
      />

      <ContractSendDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        contract={contract}
        defaultRecipientEmail={resolveSendRecipientEmail?.(contract) ?? null}
        attachments={(attachments ?? [])
          .filter((a) => a.kind === "document")
          .map((a) => ({ id: a.id, name: a.name }))}
        onSent={() => {
          void queryClient.invalidateQueries()
        }}
      />
    </div>
  )
}

function getContractTargetValue(contract: LegalContractRecord) {
  if (contract.targetKind === "provider_source_ref") {
    if (!contract.targetProvider && !contract.targetSourceRef) return null
    return `${contract.targetProvider ?? "provider"}:${contract.targetSourceRef ?? ""}`
  }
  if (contract.targetKind && contract.targetId) {
    return `${contract.targetKind}:${contract.targetId}`
  }
  return null
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span> <span>{children}</span>
    </div>
  )
}

function ContractSection({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-md border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="font-semibold text-sm">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function AttachmentRow({
  attachment,
  downloadHref,
  onEdit,
  onDelete,
}: {
  attachment: LegalContractAttachmentRecord
  downloadHref?: string
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <TableRow>
      <TableCell>
        {downloadHref ? (
          <a
            href={downloadHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:underline"
          >
            <FileText className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
            <span className="truncate">{attachment.name}</span>
            <ExternalLink className="size-3 opacity-60" aria-hidden="true" />
          </a>
        ) : (
          <span>{attachment.name}</span>
        )}
      </TableCell>
      <TableCell>{attachment.kind}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3" aria-hidden="true" />
          </button>
        </div>
      </TableCell>
    </TableRow>
  )
}
