"use client"

import { Badge, Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components"
import { Download, FileText, Loader2 } from "lucide-react"
import { useLegalUiI18nOrDefault } from "../i18n/index.js"
import type { LegalUiMessages } from "../i18n/messages.js"
import {
  type LegalContractAttachmentRecord,
  type LegalContractRecord,
  useLegalContractAttachments,
  useLegalContracts,
  useVoyantLegalContext,
} from "../index.js"

/**
 * Status → badge style map. Keeps the card visually in sync with the
 * contract detail page (same variant names, same ordering of severity).
 */
const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  issued: "secondary",
  sent: "secondary",
  signed: "default",
  executed: "default",
  expired: "destructive",
  void: "destructive",
}

export type BookingContractCardLabels = Partial<
  Omit<LegalUiMessages["bookingContractCard"], "contractStatusLabels">
>

export interface BookingContractCardProps {
  /** Booking whose contracts we list. Required — the card filters server-side. */
  bookingId: string
  /**
   * API base for attachment download redirects. Defaults to the active
   * `VoyantLegalProvider` base URL; override when a host needs a different
   * download origin than its data hooks use.
   */
  apiBaseUrl?: string
  labels?: BookingContractCardLabels
}

/**
 * Operator booking-detail "Contract" card. Mount next to the payments / docs
 * card on the booking detail page. Responsibilities are deliberately narrow:
 *  - List contracts linked to this booking
 *  - Show each contract's latest status + number
 *  - Let the operator download the generated PDF (opens in a new tab)
 *
 * Document generation is deliberately not exposed from the React package.
 * Deployments initiate durable operations through their admitted workflow.
 */
export function BookingContractCard({ bookingId, apiBaseUrl, labels }: BookingContractCardProps) {
  const i18n = useLegalUiI18nOrDefault()
  const { baseUrl } = useVoyantLegalContext()
  const resolvedApiBaseUrl = apiBaseUrl ?? baseUrl
  const merged = { ...i18n.messages.bookingContractCard, ...labels }
  const contractsQuery = useLegalContracts({ bookingId, limit: 25 })
  const contracts = contractsQuery.data?.data ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" />
          {merged.heading}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {contractsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {i18n.messages.common.loading}
          </div>
        ) : contracts.length === 0 ? (
          <p className="text-xs text-muted-foreground">{merged.empty}</p>
        ) : (
          contracts.map((contract) => (
            <BookingContractRow
              key={contract.id}
              contract={contract}
              apiBaseUrl={resolvedApiBaseUrl}
              labels={merged}
            />
          ))
        )}
      </CardContent>
    </Card>
  )
}

function BookingContractRow({
  contract,
  apiBaseUrl,
  labels,
}: {
  contract: LegalContractRecord
  apiBaseUrl?: string
  labels: Required<BookingContractCardLabels>
}) {
  const i18n = useLegalUiI18nOrDefault()
  const attachmentsQuery = useLegalContractAttachments({ contractId: contract.id })
  const attachments = attachmentsQuery.data ?? []
  const documentAttachments = attachments.filter(
    (a: LegalContractAttachmentRecord) => a.kind === "document",
  )
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">
            {labels.contractNumber}
            {contract.contractNumber ?? labels.unsaved}
          </span>
          <Badge variant={STATUS_VARIANT[contract.status] ?? "outline"} className="text-[10px]">
            {i18n.messages.bookingContractCard.contractStatusLabels[contract.status]}
          </Badge>
        </div>
      </div>

      {contract.issuedAt ? (
        <p className="text-[11px] text-muted-foreground">
          {labels.issuedAt}: {i18n.formatDate(contract.issuedAt)}
        </p>
      ) : null}

      {documentAttachments.length > 0 ? (
        <div className="flex flex-col gap-1">
          {documentAttachments.map((attachment) => (
            <AttachmentDownloadRow
              key={attachment.id}
              attachment={attachment}
              apiBaseUrl={apiBaseUrl}
              downloadLabel={labels.download}
            />
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">{labels.noAttachments}</p>
      )}
    </div>
  )
}

function withApiBaseUrl(baseUrl: string, path: string) {
  const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${trimmedBase}${normalizedPath}`
}

function AttachmentDownloadRow({
  attachment,
  apiBaseUrl,
  downloadLabel,
}: {
  attachment: LegalContractAttachmentRecord
  apiBaseUrl?: string
  downloadLabel: string
}) {
  const i18n = useLegalUiI18nOrDefault()
  // The download endpoint returns a 302 to the signed URL. A plain <a> link
  // with target="_blank" lets the browser follow it and open the file in a
  // new tab. The href uses the same API base as the data hooks by default.
  const href = withApiBaseUrl(
    apiBaseUrl ?? "",
    `/v1/admin/legal/contracts/attachments/${attachment.id}/download`,
  )
  const sizeKb =
    typeof attachment.fileSize === "number"
      ? `${i18n.formatNumber(Math.round(attachment.fileSize / 1024))} ${i18n.messages.common.kilobytes}`
      : null

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs hover:bg-muted"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{attachment.name}</span>
        {sizeKb ? <span className="text-muted-foreground">· {sizeKb}</span> : null}
      </span>
      <span className="flex items-center gap-1 text-muted-foreground">
        <Download className="h-3 w-3" />
        {downloadLabel}
      </span>
    </a>
  )
}
