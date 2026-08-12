// agent-quality: file-size exception -- owner: bookings-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { usePerson } from "@voyant-travel/relationships-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@voyant-travel/ui/components"
import { DataTable } from "@voyant-travel/ui/components/data-table"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@voyant-travel/ui/components/sheet"
import { Eye, EyeOff, Loader2, Pencil, Plus, Trash2, Users } from "lucide-react"
import * as React from "react"
import {
  formatMessage,
  useBookingsUiI18nOrDefault,
  useBookingsUiMessagesOrDefault,
} from "../i18n/provider.js"
import {
  type BookingTravelerDocumentRecord,
  type BookingTravelerRecord,
  type BookingTravelerRevealRecord,
  useBookingTravelerDocuments,
  useRevealTraveler,
  useTravelerMutation,
  useTravelers,
} from "../index.js"
import { IconActionButton } from "./icon-action-button.js"
import { TravelerDialog } from "./traveler-dialog.js"

export interface TravelerListProps {
  bookingId: string
  autoReveal?: boolean
}

export function TravelerList({ bookingId, autoReveal = false }: TravelerListProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<BookingTravelerRecord | undefined>(undefined)
  const [viewingId, setViewingId] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<BookingTravelerRecord | null>(null)
  const [revealedIds, setRevealedIds] = React.useState<Set<string>>(new Set())
  const { data } = useTravelers(bookingId)
  const documentsQuery = useBookingTravelerDocuments(bookingId)
  const { remove } = useTravelerMutation(bookingId)
  const messages = useBookingsUiMessagesOrDefault()

  const travelers = data?.data ?? []
  const documentsByTraveler = React.useMemo(() => {
    const grouped = new Map<string, BookingTravelerDocumentRecord[]>()
    for (const document of documentsQuery.data?.data ?? []) {
      if (!document.travelerId) continue
      const bucket = grouped.get(document.travelerId) ?? []
      bucket.push(document)
      grouped.set(document.travelerId, bucket)
    }
    return grouped
  }, [documentsQuery.data?.data])

  // Detect whether the list endpoint already returned unmasked data
  // (caller has bookings-pii:* scope or similar). If so, don't show
  // the reveal button — there's nothing to unmask.
  const allAlreadyRevealed = React.useMemo(() => {
    if (travelers.length === 0) return true
    return travelers.every((t) => !looksRedacted(t))
  }, [travelers])

  const toggleReveal = React.useCallback((travelerId: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      if (next.has(travelerId)) next.delete(travelerId)
      else next.add(travelerId)
      return next
    })
  }, [])

  const isRevealed = React.useCallback(
    (travelerId: string) => autoReveal || allAlreadyRevealed || revealedIds.has(travelerId),
    [allAlreadyRevealed, autoReveal, revealedIds],
  )

  const deleteMessages = messages.travelerList.actions.deleteConfirm

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    await remove.mutateAsync(deleteTarget.id)
    setDeleteTarget(null)
  }

  const columns = React.useMemo<ColumnDef<BookingTravelerRecord>[]>(
    () => [
      {
        accessorKey: "firstName",
        header: messages.travelerList.columns.name,
        cell: ({ row }) => (
          <TravelerNameCell
            bookingId={bookingId}
            traveler={row.original}
            revealed={isRevealed(row.original.id)}
          />
        ),
      },
      {
        accessorKey: "email",
        header: messages.travelerList.columns.email,
        cell: ({ row }) => (
          <TravelerContactCell
            bookingId={bookingId}
            traveler={row.original}
            revealed={isRevealed(row.original.id)}
            field="email"
          />
        ),
      },
      {
        accessorKey: "phone",
        header: messages.travelerList.columns.phone,
        cell: ({ row }) => (
          <TravelerContactCell
            bookingId={bookingId}
            traveler={row.original}
            revealed={isRevealed(row.original.id)}
            field="phone"
          />
        ),
      },
      {
        id: "role",
        header: messages.travelerList.columns.role,
        cell: ({ row }) => <RolePills traveler={row.original} />,
      },
      {
        id: "dobAge",
        header: messages.travelerList.columns.dobAge,
        cell: ({ row }) => (
          <TravelerDobCell
            bookingId={bookingId}
            traveler={row.original}
            revealed={isRevealed(row.original.id)}
          />
        ),
      },
      {
        id: "documents",
        header: messages.travelerList.columns.documents,
        cell: ({ row }) => (
          <TravelerDocumentsCell
            bookingId={bookingId}
            traveler={row.original}
            revealed={isRevealed(row.original.id)}
            documents={documentsByTraveler.get(row.original.id) ?? []}
          />
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const traveler = row.original
          const revealed = isRevealed(traveler.id)
          const showRevealToggle = !autoReveal && !allAlreadyRevealed
          return (
            <div className="flex items-center justify-end gap-1">
              {showRevealToggle ? (
                <IconActionButton
                  label={
                    revealed
                      ? messages.travelerList.actions.hideContactDetails
                      : messages.travelerList.actions.revealContactDetails
                  }
                  icon={
                    revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />
                  }
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleReveal(traveler.id)
                  }}
                />
              ) : null}
              <IconActionButton
                label={messages.travelerList.actions.viewTraveler}
                icon={<Eye className="h-3.5 w-3.5" />}
                onClick={(e) => {
                  e.stopPropagation()
                  setViewingId(traveler.id)
                }}
              />
              <IconActionButton
                label={messages.travelerList.actions.editTraveler}
                icon={<Pencil className="h-3.5 w-3.5" />}
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing(traveler)
                  setDialogOpen(true)
                }}
              />
              <IconActionButton
                label={messages.travelerList.actions.deleteTraveler}
                icon={<Trash2 className="h-3.5 w-3.5" />}
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleteTarget(traveler)
                }}
              />
            </div>
          )
        },
      },
    ],
    [
      allAlreadyRevealed,
      autoReveal,
      bookingId,
      documentsByTraveler,
      isRevealed,
      messages,
      toggleReveal,
    ],
  )

  const viewingTraveler = viewingId ? (travelers.find((t) => t.id === viewingId) ?? null) : null

  return (
    <div data-slot="traveler-list" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Users className="h-4 w-4" />
          {messages.travelerList.title}
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditing(undefined)
            setDialogOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          {messages.travelerList.addTraveler}
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={travelers}
        emptyMessage={messages.travelerList.empty}
        showPagination={false}
      />

      <TravelerDialog
        open={dialogOpen}
        onOpenChange={(nextOpen) => {
          setDialogOpen(nextOpen)
          if (!nextOpen) setEditing(undefined)
        }}
        bookingId={bookingId}
        traveler={editing}
        onSuccess={() => setEditing(undefined)}
      />

      <Sheet
        open={Boolean(viewingTraveler)}
        onOpenChange={(next) => {
          if (!next) setViewingId(null)
        }}
      >
        <SheetContent side="right" className="data-[side=right]:w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{messages.travelerList.snapshot.title}</SheetTitle>
            <SheetDescription>{messages.travelerList.snapshot.subtitle}</SheetDescription>
          </SheetHeader>
          {viewingTraveler ? (
            <TravelerSnapshotBody
              bookingId={bookingId}
              traveler={viewingTraveler}
              documents={documentsByTraveler.get(viewingTraveler.id) ?? []}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next && !remove.isPending) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteMessages.title}</AlertDialogTitle>
            <AlertDialogDescription>{deleteMessages.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              {deleteMessages.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => void handleConfirmDelete()}
            >
              {deleteMessages.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function useRevealed(bookingId: string, traveler: BookingTravelerRecord, revealed: boolean) {
  const reveal = useRevealTraveler(bookingId, traveler.id, { enabled: revealed })
  const revealedTraveler = reveal.data?.data as BookingTravelerRevealRecord | undefined
  const display: BookingTravelerRecord | BookingTravelerRevealRecord =
    revealed && revealedTraveler ? revealedTraveler : traveler
  const travelDetails: BookingTravelerRevealRecord["travelDetails"] =
    revealed && revealedTraveler ? revealedTraveler.travelDetails : null
  return {
    display,
    travelDetails,
    loading: revealed && reveal.isLoading,
    error: revealed ? reveal.error : null,
  }
}

function TravelerNameCell({
  bookingId,
  traveler,
  revealed,
}: {
  bookingId: string
  traveler: BookingTravelerRecord
  revealed: boolean
}) {
  const { display, loading } = useRevealed(bookingId, traveler, revealed)
  if (loading) return <RowLoading />
  return <span>{`${display.firstName ?? ""} ${display.lastName ?? ""}`.trim() || "—"}</span>
}

function TravelerContactCell({
  bookingId,
  traveler,
  revealed,
  field,
}: {
  bookingId: string
  traveler: BookingTravelerRecord
  revealed: boolean
  field: "email" | "phone"
}) {
  const { display, loading } = useRevealed(bookingId, traveler, revealed)
  const person = usePerson(traveler.personId ?? undefined, {
    enabled: Boolean(traveler.personId),
  }).data
  const messages = useBookingsUiMessagesOrDefault()
  if (loading) return <RowLoading />
  const value = display[field] ?? person?.[field] ?? null
  if (!value) {
    return (
      <span className="text-muted-foreground">
        {field === "email"
          ? messages.travelerList.values.emailUnavailable
          : messages.travelerList.values.phoneUnavailable}
      </span>
    )
  }
  return <>{value}</>
}

function TravelerDobCell({
  bookingId,
  traveler,
  revealed,
}: {
  bookingId: string
  traveler: BookingTravelerRecord
  revealed: boolean
}) {
  const { travelDetails, loading } = useRevealed(bookingId, traveler, revealed)
  const person = usePerson(traveler.personId ?? undefined, {
    enabled: Boolean(traveler.personId),
  }).data
  const { locale, messages } = useBookingsUiI18nOrDefault()
  if (loading) return <RowLoading />
  const dob = travelDetails?.dateOfBirth ?? person?.dateOfBirth ?? null
  return <>{formatDobAge(dob, messages.travelerList.values.fieldUnavailable, locale)}</>
}

function RolePills({ traveler }: { traveler: BookingTravelerRecord }) {
  const messages = useBookingsUiMessagesOrDefault()
  const pills: string[] = []
  if (traveler.isPrimary) pills.push(messages.travelerList.roles.primary)
  if (traveler.travelerCategory) {
    pills.push(
      messages.travelerDialog.travelerCategoryLabels[
        traveler.travelerCategory as keyof typeof messages.travelerDialog.travelerCategoryLabels
      ] ?? traveler.travelerCategory,
    )
  }
  if (pills.length === 0) return <span className="text-muted-foreground text-xs">—</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {pills.map((label) => (
        <MiniPill key={label}>{label}</MiniPill>
      ))}
    </div>
  )
}

function TravelerDocumentsCell({
  bookingId,
  traveler,
  revealed,
  documents,
}: {
  bookingId: string
  traveler: BookingTravelerRecord
  revealed: boolean
  documents: BookingTravelerDocumentRecord[]
}) {
  const { travelDetails, loading } = useRevealed(bookingId, traveler, revealed)
  const messages = useBookingsUiMessagesOrDefault()
  const travelDocumentLabel = getTravelDocumentLabel(travelDetails, messages)

  if (loading) return <RowLoading />
  if (!revealed && documents.length === 0) {
    return (
      <span className="text-muted-foreground text-xs">
        {messages.travelerList.values.documentsHidden}
      </span>
    )
  }
  if (documents.length === 0 && !travelDocumentLabel) {
    return (
      <span className="text-muted-foreground text-xs">
        {messages.travelerList.values.documentsUnavailable}
      </span>
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {travelDocumentLabel ? <MiniPill>{travelDocumentLabel}</MiniPill> : null}
      {documents.slice(0, travelDocumentLabel ? 1 : 2).map((document) => (
        <MiniPill key={document.id}>{document.type.replaceAll("_", " ")}</MiniPill>
      ))}
      {documents.length > (travelDocumentLabel ? 1 : 2) ? (
        <MiniPill>+{documents.length - (travelDocumentLabel ? 1 : 2)}</MiniPill>
      ) : null}
    </div>
  )
}

function getTravelDocumentLabel(
  travelDetails: BookingTravelerRevealRecord["travelDetails"],
  messages: ReturnType<typeof useBookingsUiMessagesOrDefault>,
) {
  if (!travelDetails) return null
  if (!travelDetails.documentNumber && !travelDetails.documentExpiry) return null

  const documentType = travelDetails.documentType ?? "passport"
  return messages.travelerDialog.documentTypeLabels[documentType]
}

function TravelerSnapshotBody({
  bookingId,
  traveler,
  documents,
}: {
  bookingId: string
  traveler: BookingTravelerRecord
  documents: BookingTravelerDocumentRecord[]
}) {
  const { locale, messages } = useBookingsUiI18nOrDefault()
  const labels = messages.travelerList.snapshot
  const empty = labels.empty
  const { display, travelDetails, loading } = useRevealed(bookingId, traveler, true)
  const person = usePerson(traveler.personId ?? undefined, {
    enabled: Boolean(traveler.personId),
  }).data
  const fullName = `${display.firstName ?? ""} ${display.lastName ?? ""}`.trim() || empty
  const email = display.email ?? person?.email ?? empty
  const phone = display.phone ?? person?.phone ?? empty
  const dob = travelDetails?.dateOfBirth ?? person?.dateOfBirth ?? null
  const documentTypeLabels = messages.travelerDialog.documentTypeLabels
  const documentValue =
    travelDetails?.documentNumber && travelDetails?.documentType
      ? `${documentTypeLabels[travelDetails.documentType]} · ${travelDetails.documentNumber}`
      : empty
  const roles: string[] = []
  if (display.isPrimary) roles.push(messages.travelerList.roles.primary)
  if (travelDetails?.isLeadTraveler) roles.push(messages.travelerList.roles.lead)
  if (display.travelerCategory) {
    roles.push(
      messages.travelerDialog.travelerCategoryLabels[
        display.travelerCategory as keyof typeof messages.travelerDialog.travelerCategoryLabels
      ] ?? display.travelerCategory,
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4">
      {loading ? (
        <div className="py-4">
          <RowLoading />
        </div>
      ) : null}

      <SnapshotSection title={labels.sectionContact}>
        <SnapshotRow label={labels.nameLabel} value={fullName} />
        <SnapshotRow label={labels.emailLabel} value={email} />
        <SnapshotRow label={labels.phoneLabel} value={phone} />
        <SnapshotRow label={labels.languageLabel} value={display.preferredLanguage || empty} />
        <SnapshotRow
          label={labels.roleLabel}
          value={
            roles.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {roles.map((label) => (
                  <MiniPill key={label}>{label}</MiniPill>
                ))}
              </div>
            ) : (
              empty
            )
          }
        />
      </SnapshotSection>

      <SnapshotSection title={labels.sectionTravel}>
        <SnapshotRow label={labels.dobLabel} value={formatDobAge(dob, empty, locale)} />
        <SnapshotRow label={labels.nationalityLabel} value={travelDetails?.nationality || empty} />
        <SnapshotRow label={labels.documentLabel} value={documentValue} />
        <SnapshotRow
          label={labels.documentExpiryLabel}
          value={formatDateValue(travelDetails?.documentExpiry, locale) ?? empty}
        />
        <SnapshotRow
          label={labels.dietaryLabel}
          value={travelDetails?.dietaryRequirements || empty}
          multiline
        />
        <SnapshotRow
          label={labels.accessibilityLabel}
          value={travelDetails?.accessibilityNeeds || empty}
          multiline
        />
        <SnapshotRow
          label={labels.specialRequestsLabel}
          value={display.specialRequests || empty}
          multiline
        />
        <SnapshotRow label={labels.notesLabel} value={display.notes || empty} multiline />
      </SnapshotSection>

      <SnapshotSection title={labels.sectionDocuments}>
        {documents.length === 0 ? (
          <div className="px-3 py-3 text-sm text-muted-foreground">{labels.noDocuments}</div>
        ) : (
          documents.map((document) => (
            <SnapshotRow
              key={document.id}
              label={formatMessage(messages.travelerList.context.documentLabel, {
                type: document.type.replaceAll("_", " "),
              })}
              value={document.fileName}
            />
          ))
        )}
      </SnapshotSection>

      <SnapshotSection title={labels.sectionMeta}>
        <SnapshotRow
          label={labels.createdAtLabel}
          value={formatTimestamp(traveler.createdAt, locale) ?? empty}
        />
        <SnapshotRow
          label={labels.updatedAtLabel}
          value={formatTimestamp(traveler.updatedAt, locale) ?? empty}
        />
      </SnapshotSection>
    </div>
  )
}

function SnapshotSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <dl className="divide-y divide-border rounded-md border">{children}</dl>
    </section>
  )
}

function SnapshotRow({
  label,
  value,
  multiline,
}: {
  label: string
  value: React.ReactNode
  multiline?: boolean
}) {
  return (
    <div className="grid grid-cols-[10rem_1fr] items-baseline gap-3 px-3 py-2 text-sm">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={multiline ? "whitespace-pre-wrap text-sm" : "truncate text-sm"}>{value}</dd>
    </div>
  )
}

function RowLoading() {
  const messages = useBookingsUiMessagesOrDefault()
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span className="text-xs">{messages.travelerList.loading.decrypting}</span>
    </span>
  )
}

function MiniPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center rounded-full border px-2 text-[11px] capitalize text-muted-foreground">
      {children}
    </span>
  )
}

function formatTimestamp(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  try {
    return d.toLocaleString(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return d.toISOString()
  }
}

function formatDobAge(
  value: string | null | undefined,
  unavailable: string,
  locale: string,
): string {
  if (!value) return unavailable
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const today = new Date()
  let age = today.getFullYear() - date.getFullYear()
  const birthdayPassed =
    today.getMonth() > date.getMonth() ||
    (today.getMonth() === date.getMonth() && today.getDate() >= date.getDate())
  if (!birthdayPassed) age -= 1
  return `${formatDateValue(value, locale)} · ${age}`
}

function formatDateValue(value: string | null | undefined, locale: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })
}

/**
 * Heuristic check for redaction markers used by `redactTravelerIdentity`
 * on the API. We can't import the redactor from `@voyant-travel/bookings`
 * at the UI layer (would pull in a server dep), so probe for the
 * canonical patterns the redactor produces (`***`, `*@`, `***1234`).
 */
function looksRedacted(traveler: BookingTravelerRecord): boolean {
  const fields = [traveler.firstName, traveler.lastName, traveler.email, traveler.phone]
  return fields.some(
    (v) => typeof v === "string" && (v === "***" || /\*\*\*/.test(v) || /\*+@/.test(v)),
  )
}
