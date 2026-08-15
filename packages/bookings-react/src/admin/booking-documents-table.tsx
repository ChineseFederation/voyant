// agent-quality: file-size exception -- owner: bookings-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { useAdminNavigate, useLocale, useOperatorAdminMessages } from "@voyant-travel/admin"
import {
  type LegalContractAttachmentRecord,
  type LegalContractRecord,
  useLegalContractAttachments,
  useLegalContracts,
  useVoyantLegalContext,
} from "@voyant-travel/legal-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
} from "@voyant-travel/ui/components"
import { DataTable } from "@voyant-travel/ui/components/data-table"
import { ArrowUpRight, Download, FileText, Loader2, Plus, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { BookingDocumentDialog } from "../components/booking-document-dialog.js"
import { IconActionButton } from "../components/icon-action-button.js"
import { StatusBadge } from "../components/status-badge.js"
import {
  type BookingTravelerRecord,
  useBookingTravelerDocumentMutation,
  useBookingTravelerDocuments,
  useTravelers,
} from "../index.js"

type DocumentsTableMessages = ReturnType<
  typeof useOperatorAdminMessages
>["bookings"]["detail"]["documentsTable"]

export interface BookingDocumentsTableProps {
  bookingId: string
}

type TravelerDocPayload = {
  id: string
  type: string
  fileName: string
  fileUrl: string
  travelerId: string | null
  issuedBy: string | null
  issuedSeries: string | null
  issuedNumber: string | null
  issuedAt: string | null
  expiresAt: string | null
  notes: string | null
  createdAt: string
}

type UnifiedRow =
  | { kind: "contract"; id: string; contract: LegalContractRecord }
  | {
      kind: "traveler"
      id: string
      doc: TravelerDocPayload
      traveler: BookingTravelerRecord | null
    }

/**
 * Unified Documents tab for a booking — flattens auto-generated legal
 * contracts and per-traveler documents (passport, visa, insurance…) into
 * a single DataTable that matches the rest of the booking detail tabs.
 * Contracts render first (canonical booking docs), traveler-uploaded
 * documents below; each contract row owns its own attachments fetch so
 * we don't need a join endpoint server-side.
 */
export function BookingDocumentsTable({
  bookingId,
}: BookingDocumentsTableProps): React.ReactElement {
  const t = useOperatorAdminMessages().bookings.detail.documentsTable
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TravelerDocPayload | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  const contractsQuery = useLegalContracts({ bookingId, limit: 25 })
  const contracts = contractsQuery.data?.data ?? []

  const travelerDocsQuery = useBookingTravelerDocuments(bookingId)
  const travelerDocs = travelerDocsQuery.data?.data ?? []

  const travelersQuery = useTravelers(bookingId)
  const travelersById = useMemo(
    () => new Map((travelersQuery.data?.data ?? []).map((tr) => [tr.id, tr])),
    [travelersQuery.data],
  )

  const removeTravelerDoc = useBookingTravelerDocumentMutation(bookingId).remove

  const isLoading = contractsQuery.isLoading || travelerDocsQuery.isLoading

  const rows = useMemo<UnifiedRow[]>(
    () => [
      ...contracts.map<UnifiedRow>((contract) => ({
        kind: "contract" as const,
        id: contract.id,
        contract,
      })),
      ...travelerDocs.map<UnifiedRow>((doc) => ({
        kind: "traveler" as const,
        id: doc.id,
        doc,
        traveler: doc.travelerId ? (travelersById.get(doc.travelerId) ?? null) : null,
      })),
    ],
    [contracts, travelerDocs, travelersById],
  )

  const columns = useMemo<ColumnDef<UnifiedRow>[]>(
    () => [
      {
        id: "category",
        header: t.headerCategory,
        cell: ({ row }) =>
          row.original.kind === "contract" ? (
            <Badge variant="outline" className="text-[10px]">
              {t.contractBadge}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              {humanizeDocType(row.original.doc.type)}
            </Badge>
          ),
      },
      {
        id: "document",
        header: t.headerDocument,
        cell: ({ row }) =>
          row.original.kind === "contract" ? (
            <ContractDocumentCell contract={row.original.contract} />
          ) : (
            <TravelerDocumentCell doc={row.original.doc} />
          ),
      },
      {
        id: "for",
        header: t.headerFor,
        cell: ({ row }) => {
          if (row.original.kind === "contract") {
            return <span className="text-muted-foreground text-xs">{t.forBooking}</span>
          }
          const traveler = row.original.traveler
          const name = traveler
            ? `${traveler.firstName ?? ""} ${traveler.lastName ?? ""}`.trim() || t.travelerFallback
            : t.forBooking
          return <span className="text-muted-foreground text-xs">{name}</span>
        },
      },
      {
        id: "status",
        header: t.headerStatus,
        cell: ({ row }) =>
          row.original.kind === "contract" ? (
            <ContractStatusCell contract={row.original.contract} messages={t} />
          ) : (
            <TravelerStatusCell doc={row.original.doc} messages={t} />
          ),
      },
      {
        id: "date",
        header: t.headerDate,
        cell: ({ row }) =>
          row.original.kind === "contract" ? (
            <ContractDateCell contract={row.original.contract} messages={t} />
          ) : (
            <TravelerDateCell doc={row.original.doc} messages={t} />
          ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">{t.headerCategory}</span>,
        cell: ({ row }) => {
          if (row.original.kind === "contract") {
            return <ContractActionsCell contract={row.original.contract} messages={t} />
          }
          const docPayload = row.original.doc
          return (
            <TravelerActionsCell
              doc={docPayload}
              messages={t}
              onDelete={() => setDeleteTarget(docPayload)}
            />
          )
        },
      },
    ],
    [t],
  )

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeletePending(true)
    try {
      await removeTravelerDoc.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
    } finally {
      setDeletePending(false)
    }
  }

  return (
    <div data-slot="booking-documents-list" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <FileText className="h-4 w-4 text-muted-foreground" />
          {t.title}
        </h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t.uploadDocument}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t.loading}
        </div>
      ) : (
        <DataTable columns={columns} data={rows} emptyMessage={t.empty} showPagination={false} />
      )}

      <BookingDocumentDialog open={uploadOpen} onOpenChange={setUploadOpen} bookingId={bookingId} />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next && !deletePending) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteConfirm}</AlertDialogTitle>
            {deleteTarget ? (
              <AlertDialogDescription>{deleteTarget.fileName}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>{t.deleteCancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletePending}
              onClick={() => void handleDeleteConfirm()}
            >
              {t.deleteConfirmAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * Admin download URL of a contract attachment, resolved against the
 * legal provider context so the table works in any host app without an
 * `apiBaseUrl` prop.
 */
function useContractAttachmentDownloadHref(
  attachment: LegalContractAttachmentRecord | null,
): string | null {
  const { baseUrl } = useVoyantLegalContext()
  if (!attachment) return null
  return `${baseUrl}/v1/admin/legal/contracts/attachments/${attachment.id}/download`
}

function ContractDocumentCell({ contract }: { contract: LegalContractRecord }) {
  const attachmentsQuery = useLegalContractAttachments({ contractId: contract.id })
  const attachments = (attachmentsQuery.data ?? []).filter(
    (a: LegalContractAttachmentRecord) => a.kind === "document",
  )
  const latest = attachments[0] ?? null
  const downloadHref = useContractAttachmentDownloadHref(latest)
  const titleText = latest?.name ?? contract.contractNumber ?? `Contract ${contract.id.slice(-8)}`

  return downloadHref ? (
    <a
      href={downloadHref}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-primary hover:underline"
    >
      <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
      <span className="truncate">{titleText}</span>
      <ArrowUpRight className="h-3 w-3" />
      {latest?.fileSize != null ? (
        <span className="ml-1 text-muted-foreground text-xs">{formatBytes(latest.fileSize)}</span>
      ) : null}
    </a>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
      {titleText}
    </span>
  )
}

function TravelerDocumentCell({ doc }: { doc: TravelerDocPayload }) {
  // A document issued outside Voyant is identified by the number its issuer
  // printed on it, so show that next to the file rather than only the filename.
  const issuedIdentity = [doc.issuedSeries, doc.issuedNumber].filter(Boolean).join(" ")
  return (
    <div className="flex flex-col">
      <a
        href={doc.fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-primary hover:underline"
      >
        <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
        <span className="truncate">{doc.fileName}</span>
        <ArrowUpRight className="h-3 w-3" />
      </a>
      {issuedIdentity ? (
        <span className="text-muted-foreground text-xs">{issuedIdentity}</span>
      ) : null}
    </div>
  )
}

function ContractStatusCell({
  contract,
}: {
  contract: LegalContractRecord
  messages: DocumentsTableMessages
}) {
  return <StatusBadge status={contract.status}>{contract.status.replace(/_/g, " ")}</StatusBadge>
}

function TravelerStatusCell({
  doc,
  messages,
}: {
  doc: TravelerDocPayload
  messages: DocumentsTableMessages
}) {
  const isExpired =
    doc.expiresAt && Number.isFinite(new Date(doc.expiresAt).getTime())
      ? new Date(doc.expiresAt).getTime() < Date.now()
      : false
  return (
    <StatusBadge status={isExpired ? "expired" : "active"}>
      {isExpired ? messages.travelerStatusExpired : messages.travelerStatusOnFile}
    </StatusBadge>
  )
}

function ContractDateCell({
  contract,
  messages,
}: {
  contract: LegalContractRecord
  messages: DocumentsTableMessages
}) {
  const { resolvedLocale } = useLocale()
  const attachmentsQuery = useLegalContractAttachments({ contractId: contract.id })
  const attachments = (attachmentsQuery.data ?? []).filter(
    (a: LegalContractAttachmentRecord) => a.kind === "document",
  )
  const hasDocument = attachments.length > 0
  const dateIso = contract.issuedAt ?? contract.createdAt ?? null
  const dateLabel = hasDocument ? messages.contractIssuedLabel : messages.contractPendingSinceLabel
  if (!dateIso) return <span className="text-muted-foreground text-xs">—</span>
  return (
    <span className="text-muted-foreground text-xs">
      <span className="opacity-60">{dateLabel} </span>
      {formatDate(dateIso, resolvedLocale)}
    </span>
  )
}

function TravelerDateCell({
  doc,
  messages,
}: {
  doc: TravelerDocPayload
  messages: DocumentsTableMessages
}) {
  const { resolvedLocale } = useLocale()
  const dateIso = doc.expiresAt ?? doc.createdAt ?? null
  const dateLabel = doc.expiresAt ? messages.travelerExpiresLabel : messages.travelerUploadedLabel
  if (!dateIso) return <span className="text-muted-foreground text-xs">—</span>
  return (
    <span className="text-muted-foreground text-xs">
      <span className="opacity-60">{dateLabel} </span>
      {formatDate(dateIso, resolvedLocale)}
    </span>
  )
}

function ContractActionsCell({
  contract,
  messages,
}: {
  contract: LegalContractRecord
  messages: DocumentsTableMessages
}) {
  const navigateTo = useAdminNavigate()
  const attachmentsQuery = useLegalContractAttachments({ contractId: contract.id })
  const attachments = (attachmentsQuery.data ?? []).filter(
    (a: LegalContractAttachmentRecord) => a.kind === "document",
  )
  const latest = attachments[0] ?? null
  const downloadHref = useContractAttachmentDownloadHref(latest)

  return (
    <div className="flex items-center justify-end gap-1">
      <IconActionButton
        label={messages.contractOpenTooltip}
        icon={<ArrowUpRight className="h-3.5 w-3.5" />}
        onClick={(e) => {
          e.stopPropagation()
          navigateTo("contract.detail", { contractId: contract.id })
        }}
      />
      {downloadHref ? (
        <IconActionButton
          label={messages.downloadDocumentAria}
          icon={<Download className="h-3.5 w-3.5" />}
          onClick={(e) => {
            e.stopPropagation()
            window.open(downloadHref, "_blank", "noopener,noreferrer")
          }}
        />
      ) : null}
    </div>
  )
}

function TravelerActionsCell({
  doc,
  messages,
  onDelete,
}: {
  doc: TravelerDocPayload
  messages: DocumentsTableMessages
  onDelete: () => void
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <IconActionButton
        label={messages.downloadDocumentAria}
        icon={<Download className="h-3.5 w-3.5" />}
        onClick={(e) => {
          e.stopPropagation()
          window.open(doc.fileUrl, "_blank", "noopener,noreferrer")
        }}
      />
      <IconActionButton
        label={messages.deleteDocumentAria}
        icon={<Trash2 className="h-3.5 w-3.5" />}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
      />
    </div>
  )
}

function humanizeDocType(type: string): string {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string, locale: string): string {
  try {
    const d = new Date(iso)
    if (!Number.isFinite(d.getTime())) return iso
    return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })
  } catch {
    return iso
  }
}
