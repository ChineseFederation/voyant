"use client"

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Textarea,
} from "@voyant-travel/ui/components"
import { cn } from "@voyant-travel/ui/lib/utils"
import { ArrowLeft, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { useSuppliersUiMessagesOrDefault } from "../i18n/index.js"
import {
  type Supplier,
  type SupplierRate,
  type SupplierService,
  statusVariant,
  type UpdateSupplierInput,
  useSupplier,
  useSupplierMutation,
  useSupplierNoteMutation,
  useSupplierNotes,
  useSupplierRateMutation,
  useSupplierServiceMutation,
  useSupplierServices,
} from "../index.js"
import { RateDialog } from "./rate-dialog.js"
import { ServiceDialog } from "./service-dialog.js"
import { SupplierDialog } from "./supplier-dialog.js"
import { SupplierNestedResources } from "./supplier-nested-resources.js"
import { SupplierPublicationSection } from "./supplier-publication-section.js"
import { SupplierServiceRow } from "./supplier-service-row.js"

export type SupplierDetailPageProps = {
  id: string
  locale?: string
  onBack?: () => void
  onDeleted?: () => void
  confirmAction?: (message: string) => boolean
  className?: string
  renderCustomerPaymentPolicy?: (args: {
    supplier: Supplier
    updateSupplier: (input: UpdateSupplierInput) => Promise<Supplier>
    isUpdating: boolean
  }) => React.ReactNode
}

export function SupplierDetailPage({
  id,
  locale = "en-US",
  onBack,
  onDeleted,
  confirmAction = (message) => globalThis.confirm?.(message) ?? true,
  className,
  renderCustomerPaymentPolicy,
}: SupplierDetailPageProps) {
  const messages = useSuppliersUiMessagesOrDefault()
  const detail = messages.supplierDetailPage
  const supplierQuery = useSupplier(id)
  const servicesQuery = useSupplierServices(id)
  const notesQuery = useSupplierNotes(id)
  const supplierMutation = useSupplierMutation()
  const serviceMutation = useSupplierServiceMutation(id)
  const rateMutation = useSupplierRateMutation(id)
  const noteMutation = useSupplierNoteMutation(id)

  const [editOpen, setEditOpen] = React.useState(false)
  const [serviceDialogOpen, setServiceDialogOpen] = React.useState(false)
  const [editingService, setEditingService] = React.useState<SupplierService | undefined>()
  const [rateDialog, setRateDialog] = React.useState<{
    open: boolean
    serviceId: string
    rate?: SupplierRate
  }>({ open: false, serviceId: "" })
  const [expandedServiceId, setExpandedServiceId] = React.useState<string | null>(null)
  const [noteContent, setNoteContent] = React.useState("")

  const supplier = supplierQuery.data?.data

  async function deleteSupplier() {
    if (!supplier || !confirmAction(detail.deleteSupplierConfirm)) return
    await supplierMutation.remove.mutateAsync(supplier.id)
    onDeleted?.()
  }

  async function deleteService(serviceId: string) {
    if (!confirmAction(detail.deleteServiceConfirm)) return
    await serviceMutation.remove.mutateAsync(serviceId)
    if (expandedServiceId === serviceId) setExpandedServiceId(null)
  }

  async function deleteRate(serviceId: string, rateId: string) {
    if (!confirmAction(detail.deleteRateConfirm)) return
    await rateMutation.remove.mutateAsync({ serviceId, rateId })
  }

  async function addNote() {
    const content = noteContent.trim()
    if (!content) return
    await noteMutation.create.mutateAsync({ content })
    setNoteContent("")
  }

  if (supplierQuery.isPending) return <SupplierDetailSkeleton className={className} />

  if (supplierQuery.isError) {
    return (
      <EmptyState
        message={detail.loadFailed}
        onBack={onBack}
        backLabel={detail.backToSuppliers}
        className={className}
      />
    )
  }

  if (!supplier) {
    return (
      <EmptyState
        message={detail.notFound}
        onBack={onBack}
        backLabel={detail.backToSuppliers}
        className={className}
      />
    )
  }

  const services = servicesQuery.data?.data ?? []
  const notes = notesQuery.data?.data ?? []

  return (
    <div data-slot="supplier-detail-page" className={cn("flex flex-col gap-6", className)}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-3">
          {onBack && (
            <Button type="button" variant="ghost" className="w-fit px-0" onClick={onBack}>
              <ArrowLeft />
              {detail.backToSuppliers}
            </Button>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">{supplier.name}</h1>
              <Badge variant={statusVariant[supplier.status]}>
                {messages.common.supplierStatusLabels[supplier.status]}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{supplier.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil />
            {messages.common.edit}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={deleteSupplier}
            disabled={supplierMutation.remove.isPending}
          >
            <Trash2 />
            {messages.common.delete}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{detail.details}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <Detail label={detail.labels.type}>
              {messages.common.supplierTypeLabels[supplier.type]}
            </Detail>
            <Detail label={detail.labels.status}>
              {messages.common.supplierStatusLabels[supplier.status]}
            </Detail>
            <Detail label={detail.labels.city}>{supplier.city ?? messages.common.none}</Detail>
            <Detail label={detail.labels.country}>
              {supplier.country ?? messages.common.none}
            </Detail>
            <Detail label={detail.labels.currency}>
              {supplier.defaultCurrency ?? messages.common.none}
            </Detail>
            <Detail label={detail.labels.reservationTimeout}>
              {supplier.reservationTimeoutMinutes == null
                ? messages.common.none
                : String(supplier.reservationTimeoutMinutes)}
            </Detail>
            <Detail label={detail.labels.created}>{formatDate(supplier.createdAt, locale)}</Detail>
            <Detail label={detail.labels.updated}>{formatDate(supplier.updatedAt, locale)}</Detail>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{detail.contact}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {!hasContactDetails(supplier) ? (
              <p className="text-muted-foreground">{detail.noContact}</p>
            ) : (
              <>
                <Detail label={detail.labels.email}>
                  {supplier.email ?? messages.common.none}
                </Detail>
                <Detail label={detail.labels.phone}>
                  {supplier.phone ?? messages.common.none}
                </Detail>
                <Detail label={detail.labels.website}>
                  {supplier.website ? (
                    <a
                      href={supplier.website}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {supplier.website}
                    </a>
                  ) : (
                    messages.common.none
                  )}
                </Detail>
                <Detail label={detail.labels.address}>
                  {supplier.address ?? messages.common.none}
                </Detail>
                <Detail label={detail.labels.contactName}>
                  {supplier.contactName ?? messages.common.none}
                </Detail>
                <Detail label={detail.labels.contactEmail}>
                  {supplier.contactEmail ?? messages.common.none}
                </Detail>
                <Detail label={detail.labels.contactPhone}>
                  {supplier.contactPhone ?? messages.common.none}
                </Detail>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {renderCustomerPaymentPolicy?.({
        supplier,
        updateSupplier: (input) => supplierMutation.update.mutateAsync({ id: supplier.id, input }),
        isUpdating: supplierMutation.update.isPending,
      })}

      <SupplierPublicationSection supplierId={supplier.id} />

      <SupplierNestedResources
        supplierId={supplier.id}
        locale={locale}
        confirmAction={confirmAction}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>{detail.services}</CardTitle>
          <Button
            type="button"
            onClick={() => {
              setEditingService(undefined)
              setServiceDialogOpen(true)
            }}
          >
            <Plus />
            {detail.addService}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {servicesQuery.isPending ? (
            <LoadingLine />
          ) : services.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{detail.noServices}</p>
          ) : (
            services.map((service) => (
              <SupplierServiceRow
                key={service.id}
                service={service}
                supplierId={supplier.id}
                expanded={expandedServiceId === service.id}
                onToggle={() =>
                  setExpandedServiceId((current) => (current === service.id ? null : service.id))
                }
                onEdit={() => {
                  setEditingService(service)
                  setServiceDialogOpen(true)
                }}
                onDelete={() => void deleteService(service.id)}
                onAddRate={() => setRateDialog({ open: true, serviceId: service.id })}
                onEditRate={(rate) => setRateDialog({ open: true, serviceId: service.id, rate })}
                onDeleteRate={(rateId) => void deleteRate(service.id, rateId)}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{detail.notes}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Textarea
              value={noteContent}
              onChange={(event) => setNoteContent(event.target.value)}
              placeholder={detail.notePlaceholder}
            />
            <Button
              type="button"
              className="w-fit"
              onClick={() => void addNote()}
              disabled={!noteContent.trim() || noteMutation.create.isPending}
            >
              {noteMutation.create.isPending && <Loader2 className="animate-spin" />}
              {detail.addNote}
            </Button>
          </div>
          {notesQuery.isPending ? (
            <LoadingLine />
          ) : notes.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{detail.noNotes}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {notes.map((note) => (
                <div key={note.id} className="rounded-md border p-3">
                  <p className="whitespace-pre-wrap text-sm">{note.content}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatDate(note.createdAt, locale)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SupplierDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        supplier={supplier}
        onSuccess={() => setEditOpen(false)}
      />
      <ServiceDialog
        open={serviceDialogOpen}
        onOpenChange={setServiceDialogOpen}
        supplierId={supplier.id}
        service={editingService}
        onSuccess={() => {
          setServiceDialogOpen(false)
          setEditingService(undefined)
        }}
      />
      <RateDialog
        open={rateDialog.open}
        onOpenChange={(open) => setRateDialog((current) => ({ ...current, open }))}
        supplierId={supplier.id}
        serviceId={rateDialog.serviceId}
        rate={rateDialog.rate}
        onSuccess={() => setRateDialog({ open: false, serviceId: "" })}
      />
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_minmax(0,1fr)] gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}

function EmptyState({
  message,
  onBack,
  backLabel,
  className,
}: {
  message: string
  onBack?: () => void
  backLabel: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex min-h-80 flex-col items-center justify-center gap-4 p-6 text-center",
        className,
      )}
    >
      <p className="text-muted-foreground">{message}</p>
      {onBack && (
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft />
          {backLabel}
        </Button>
      )}
    </div>
  )
}

function SupplierDetailSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div className="h-9 w-72 animate-pulse rounded bg-muted" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-96 animate-pulse rounded-md bg-muted" />
    </div>
  )
}

function LoadingLine() {
  return <div className="h-4 w-40 animate-pulse rounded bg-muted" />
}

function hasContactDetails(supplier: Supplier) {
  return Boolean(
    supplier.email ||
      supplier.phone ||
      supplier.website ||
      supplier.address ||
      supplier.contactName ||
      supplier.contactEmail ||
      supplier.contactPhone,
  )
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  )
}
