"use client"

// agent-quality: file-size exception -- owner: relationships-react; existing detail panels stay co-located pending a dedicated split because this release fix only replaces a native datetime input.
import { Badge, Button, Card, CardContent, ConfirmActionButton } from "@voyant-travel/ui/components"
import { DateTimePicker } from "@voyant-travel/ui/components/date-time-picker"
import { Input } from "@voyant-travel/ui/components/input"
import { Label } from "@voyant-travel/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import { Separator } from "@voyant-travel/ui/components/separator"
import { Switch } from "@voyant-travel/ui/components/switch"
import { Textarea } from "@voyant-travel/ui/components/textarea"
import {
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
} from "lucide-react"
import { type FormEvent, type ReactNode, useState } from "react"

import { useCrmUiI18nOrDefault, useCrmUiMessagesOrDefault } from "../i18n/index.js"
import type {
  CommunicationChannel,
  CommunicationDirection,
  PersonPaymentMethodBrand,
  PersonRecord,
  UpdatePersonInput,
} from "../index.js"
import {
  usePerson,
  usePersonCommunicationMutation,
  usePersonDocumentMutation,
  usePersonPaymentMethodMutation,
  useRevealPersonDocument,
} from "../index.js"
import { formatCrmDate, formatCrmRelative } from "./crm-format.js"
import { InlineField } from "./inline-field.js"
import type {
  PersonActivity,
  PersonCommunication,
  PersonData,
  PersonDocument,
  PersonOrganization,
  PersonPaymentMethod,
  PersonRelationship,
} from "./person-detail-types.js"
import { PersonDocumentDialog } from "./person-document-dialog.js"

export interface MetricCardProps {
  label: string
  value: ReactNode
}

export function MetricCard({ label, value }: MetricCardProps) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}

export interface PersonOverviewPanelProps {
  person: PersonData
  organization: PersonOrganization | null
  onUpdateField: (patch: UpdatePersonInput) => Promise<void>
}

export function PersonOverviewPanel({
  person,
  organization,
  onUpdateField,
}: PersonOverviewPanelProps) {
  const i18n = useCrmUiI18nOrDefault()
  const messages = useCrmUiMessagesOrDefault()

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <OverviewTerm label={messages.personDetail.sections.created}>
          {formatCrmDate(i18n, person.createdAt)}
        </OverviewTerm>
        <OverviewTerm label={messages.personDetail.sections.updated}>
          {formatCrmRelative(i18n, person.updatedAt)}
        </OverviewTerm>
        {organization ? (
          <OverviewTerm label={messages.personDetail.sections.organization}>
            {organization.name}
          </OverviewTerm>
        ) : null}
        {person.dateOfBirth ? (
          <OverviewTerm label={messages.personDetail.sections.dateOfBirth}>
            {formatCrmDate(i18n, person.dateOfBirth)}
          </OverviewTerm>
        ) : null}
        {person.notes ? (
          <OverviewTerm label={messages.personDetail.sections.notes} className="sm:col-span-2">
            <span className="whitespace-pre-wrap">{person.notes}</span>
          </OverviewTerm>
        ) : null}
      </dl>

      <Separator />
      <InlineField
        label={messages.personDetail.sections.notes}
        kind="textarea"
        value={person.notes}
        onSave={(next) => onUpdateField({ notes: next })}
      />
    </div>
  )
}

export interface OverviewTermProps {
  label: string
  children: ReactNode
  className?: string
}

export function OverviewTerm({ label, children, className }: OverviewTermProps) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}

const paymentMethodBrands: PersonPaymentMethodBrand[] = [
  "visa",
  "mastercard",
  "amex",
  "revolut",
  "bank_transfer",
]
const communicationChannels: CommunicationChannel[] = [
  "email",
  "phone",
  "whatsapp",
  "sms",
  "meeting",
  "other",
]
const communicationDirections: CommunicationDirection[] = ["inbound", "outbound"]

type PaymentMethodFormState = {
  brand: PersonPaymentMethodBrand
  last4: string
  holderName: string
  expMonth: string
  expYear: string
  processorToken: string
  isDefault: boolean
}

function emptyPaymentMethodFormState(): PaymentMethodFormState {
  return {
    brand: "visa",
    last4: "",
    holderName: "",
    expMonth: "",
    expYear: "",
    processorToken: "",
    isDefault: false,
  }
}

type CommunicationFormState = {
  channel: CommunicationChannel
  direction: CommunicationDirection
  subject: string
  content: string
  sentAt: string
}

function emptyCommunicationFormState(): CommunicationFormState {
  return {
    channel: "email",
    direction: "outbound",
    subject: "",
    content: "",
    sentAt: "",
  }
}

export interface PersonActivitiesPanelProps {
  activities: PersonActivity[]
  activitiesPending: boolean
}

export function PersonActivitiesPanel({
  activities,
  activitiesPending,
}: PersonActivitiesPanelProps) {
  const messages = useCrmUiMessagesOrDefault()
  const i18n = useCrmUiI18nOrDefault()

  if (activitiesPending) {
    return <LoadingRow />
  }

  if (activities.length === 0) {
    return <EmptyRow>{messages.personDetail.empty.noActivities}</EmptyRow>
  }

  return (
    <ul className="divide-y">
      {activities.map((activity) => (
        <li key={activity.id} className="py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{activity.subject}</p>
              {activity.description ? (
                <p className="line-clamp-2 text-xs text-muted-foreground">{activity.description}</p>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant="outline">
                {messages.common.activityTypeLabels[
                  (activity.type ?? "note") as keyof typeof messages.common.activityTypeLabels
                ] ?? activity.type}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatCrmRelative(i18n, activity.createdAt)}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

export interface PersonRelationshipsPanelProps {
  personId: string
  relationships: PersonRelationship[]
  relationshipsPending: boolean
  onPersonOpen?: (personId: string) => void
}

export function PersonRelationshipsPanel({
  personId,
  relationships,
  relationshipsPending,
  onPersonOpen,
}: PersonRelationshipsPanelProps) {
  const i18n = useCrmUiI18nOrDefault()
  const messages = useCrmUiMessagesOrDefault()

  if (relationshipsPending) {
    return <LoadingRow />
  }

  if (relationships.length === 0) {
    return <EmptyRow>{messages.personDetail.empty.noRelationships}</EmptyRow>
  }

  return (
    <ul className="divide-y">
      {relationships.map((relationship) => {
        const relatedPersonId =
          relationship.fromPersonId === personId
            ? relationship.toPersonId
            : relationship.fromPersonId
        const kindLabel =
          messages.personDetail.relationshipKindLabels[
            relationship.kind as keyof typeof messages.personDetail.relationshipKindLabels
          ] ?? relationship.kind
        return (
          <li key={relationship.id} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0 flex-1">
              <RelatedPersonName personId={relatedPersonId} onPersonOpen={onPersonOpen} />
              <p className="text-xs text-muted-foreground">
                {kindLabel}
                {relationship.startDate ? ` - ${formatCrmDate(i18n, relationship.startDate)}` : ""}
              </p>
              {relationship.notes ? (
                <p className="line-clamp-2 text-xs text-muted-foreground">{relationship.notes}</p>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-1">
              {relationship.isPrimary ? (
                <Badge variant="secondary">{messages.personDetail.sections.primary}</Badge>
              ) : null}
              <Badge variant="outline">{kindLabel}</Badge>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function RelatedPersonName({
  personId,
  onPersonOpen,
}: {
  personId: string
  onPersonOpen?: (personId: string) => void
}) {
  const messages = useCrmUiMessagesOrDefault()
  const personQuery = usePerson(personId)
  const person = personQuery.data
  const label = person
    ? personDisplayName(person, messages.personCard.unnamed)
    : personQuery.isPending
      ? "…"
      : personId

  if (!onPersonOpen) {
    return <p className="truncate text-sm font-medium">{label}</p>
  }

  return (
    <button
      type="button"
      onClick={() => onPersonOpen(personId)}
      className="truncate text-left text-sm font-medium text-foreground hover:underline"
    >
      {label}
    </button>
  )
}

export interface PersonPaymentMethodsPanelProps {
  personId: string
  paymentMethods: PersonPaymentMethod[]
  paymentMethodsPending: boolean
}

export function PersonPaymentMethodsPanel({
  personId,
  paymentMethods,
  paymentMethodsPending,
}: PersonPaymentMethodsPanelProps) {
  const i18n = useCrmUiI18nOrDefault()
  const messages = useCrmUiMessagesOrDefault()
  const labels = messages.personDetail.paymentMethods
  const mutation = usePersonPaymentMethodMutation(personId)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState<PaymentMethodFormState>(() => emptyPaymentMethodFormState())
  const isBankTransfer = form.brand === "bank_transfer"

  const set = <K extends keyof PaymentMethodFormState>(key: K, value: PaymentMethodFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await mutation.create.mutateAsync({
      brand: form.brand,
      holderName: form.holderName.trim() || null,
      last4: isBankTransfer ? null : form.last4.trim(),
      expMonth: isBankTransfer ? null : Number(form.expMonth),
      expYear: isBankTransfer ? null : Number(form.expYear),
      processorToken: form.processorToken.trim(),
      isDefault: form.isDefault,
    })
    setForm(emptyPaymentMethodFormState())
    setIsCreating(false)
  }

  if (paymentMethodsPending) {
    return <LoadingRow />
  }

  const brandLabel = (brand: string) =>
    labels.brandLabels[brand as keyof typeof labels.brandLabels] ?? brand

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">{labels.title}</h3>
        {!isCreating ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="mr-1 size-3.5" aria-hidden="true" />
            {labels.add}
          </Button>
        ) : null}
      </div>
      {isCreating ? (
        <form onSubmit={submit} className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-brand">{labels.fields.brand}</Label>
            <Select
              value={form.brand}
              onValueChange={(value) => set("brand", value as PersonPaymentMethodBrand)}
            >
              <SelectTrigger id="payment-brand" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {paymentMethodBrands.map((brand) => (
                  <SelectItem key={brand} value={brand}>
                    {labels.brandLabels[brand]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-token">{labels.fields.processorToken}</Label>
            <Input
              id="payment-token"
              required
              value={form.processorToken}
              onChange={(event) => set("processorToken", event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-holder">{labels.fields.holderName}</Label>
            <Input
              id="payment-holder"
              value={form.holderName}
              onChange={(event) => set("holderName", event.target.value)}
              autoComplete="cc-name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-last4">{labels.fields.last4}</Label>
            <Input
              id="payment-last4"
              value={form.last4}
              onChange={(event) => set("last4", event.target.value)}
              required={!isBankTransfer}
              disabled={isBankTransfer}
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-exp-month">{labels.fields.expMonth}</Label>
              <Input
                id="payment-exp-month"
                type="number"
                min={1}
                max={12}
                value={form.expMonth}
                onChange={(event) => set("expMonth", event.target.value)}
                required={!isBankTransfer}
                disabled={isBankTransfer}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-exp-year">{labels.fields.expYear}</Label>
              <Input
                id="payment-exp-year"
                type="number"
                min={2000}
                max={2100}
                value={form.expYear}
                onChange={(event) => set("expYear", event.target.value)}
                required={!isBankTransfer}
                disabled={isBankTransfer}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.isDefault}
              onCheckedChange={(checked) => set("isDefault", checked)}
            />
            <Label>{labels.fields.default}</Label>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setIsCreating(false)}>
              {messages.common.cancel}
            </Button>
            <Button type="submit" disabled={mutation.create.isPending}>
              {mutation.create.isPending ? messages.common.saving : messages.common.create}
            </Button>
          </div>
        </form>
      ) : null}
      {paymentMethods.length === 0 && !isCreating ? (
        <EmptyRow>{messages.personDetail.empty.noPaymentMethods}</EmptyRow>
      ) : (
        <ul className="divide-y">
          {paymentMethods.map((method) => (
            <li key={method.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <CreditCard className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <p className="truncate text-sm font-medium">
                    {brandLabel(method.brand)}
                    {method.last4 ? ` ${labels.ending} ${method.last4}` : ""}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {method.holderName ?? messages.common.none}
                  {method.expMonth && method.expYear
                    ? ` - ${String(method.expMonth).padStart(2, "0")}/${method.expYear}`
                    : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCrmRelative(i18n, method.createdAt)}
                </p>
              </div>
              <div className="flex items-start gap-2">
                {method.isDefault ? (
                  <Badge variant="secondary">{messages.personDetail.sections.primary}</Badge>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      mutation.update.mutateAsync({ id: method.id, input: { isDefault: true } })
                    }
                    disabled={mutation.update.isPending}
                  >
                    {labels.makeDefault}
                  </Button>
                )}
                <ConfirmActionButton
                  buttonLabel={labels.delete}
                  title={labels.deleteTitle}
                  description={labels.deleteDescription}
                  confirmLabel={labels.delete}
                  variant="ghost"
                  confirmVariant="destructive"
                  disabled={mutation.remove.isPending}
                  onConfirm={async () => {
                    await mutation.remove.mutateAsync(method.id)
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export interface PersonCommunicationsPanelProps {
  communications: PersonCommunication[]
  communicationsPending: boolean
  personId: string
}

export function PersonCommunicationsPanel({
  communications,
  communicationsPending,
  personId,
}: PersonCommunicationsPanelProps) {
  const i18n = useCrmUiI18nOrDefault()
  const messages = useCrmUiMessagesOrDefault()
  const labels = messages.personDetail.communications
  const mutation = usePersonCommunicationMutation(personId)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState<CommunicationFormState>(() => emptyCommunicationFormState())

  const set = <K extends keyof CommunicationFormState>(key: K, value: CommunicationFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await mutation.create.mutateAsync({
      channel: form.channel,
      direction: form.direction,
      subject: form.subject.trim() || null,
      content: form.content.trim() || null,
      sentAt: form.sentAt ? new Date(form.sentAt).toISOString() : null,
    })
    setForm(emptyCommunicationFormState())
    setIsCreating(false)
  }

  if (communicationsPending) {
    return <LoadingRow />
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">{labels.title}</h3>
        {!isCreating ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="mr-1 size-3.5" aria-hidden="true" />
            {labels.add}
          </Button>
        ) : null}
      </div>
      {isCreating ? (
        <form onSubmit={submit} className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="communication-channel">{labels.fields.channel}</Label>
            <Select
              value={form.channel}
              onValueChange={(value) => set("channel", value as CommunicationChannel)}
            >
              <SelectTrigger id="communication-channel" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {communicationChannels.map((channel) => (
                  <SelectItem key={channel} value={channel}>
                    {labels.channelLabels[channel]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="communication-direction">{labels.fields.direction}</Label>
            <Select
              value={form.direction}
              onValueChange={(value) => set("direction", value as CommunicationDirection)}
            >
              <SelectTrigger id="communication-direction" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {communicationDirections.map((direction) => (
                  <SelectItem key={direction} value={direction}>
                    {labels.directionLabels[direction]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="communication-subject">{labels.fields.subject}</Label>
            <Input
              id="communication-subject"
              value={form.subject}
              onChange={(event) => set("subject", event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="communication-sent-at">{labels.fields.sentAt}</Label>
            <DateTimePicker
              value={form.sentAt}
              onChange={(nextValue) => set("sentAt", nextValue ?? "")}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="communication-content">{labels.fields.content}</Label>
            <Textarea
              id="communication-content"
              value={form.content}
              onChange={(event) => set("content", event.target.value)}
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setIsCreating(false)}>
              {messages.common.cancel}
            </Button>
            <Button type="submit" disabled={mutation.create.isPending}>
              {mutation.create.isPending ? messages.common.saving : messages.common.create}
            </Button>
          </div>
        </form>
      ) : null}
      {communications.length === 0 && !isCreating ? (
        <EmptyRow>{messages.personDetail.empty.noCommunications}</EmptyRow>
      ) : (
        <ul className="divide-y">
          {communications.map((communication) => (
            <li key={communication.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <MessageSquare className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <p className="truncate text-sm font-medium">
                    {communication.subject ?? labels.noSubject}
                  </p>
                </div>
                {communication.content ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {communication.content}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {formatCrmRelative(i18n, communication.sentAt ?? communication.createdAt)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant="outline">{labels.channelLabels[communication.channel]}</Badge>
                <Badge variant="secondary">{labels.directionLabels[communication.direction]}</Badge>
                {communication.source === "notification" ? (
                  <Badge variant="outline">{labels.automaticBadge}</Badge>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export interface PersonDocumentsPanelProps {
  documents: PersonDocument[]
  documentsPending: boolean
  primaryCount: number
  personId?: string
}

export function PersonDocumentsPanel({
  documents,
  documentsPending,
  primaryCount,
  personId,
}: PersonDocumentsPanelProps) {
  const i18n = useCrmUiI18nOrDefault()
  const messages = useCrmUiMessagesOrDefault()
  const [createOpen, setCreateOpen] = useState(false)
  const canEdit = Boolean(personId)

  if (documentsPending) {
    return <LoadingRow />
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="size-3.5" aria-hidden="true" />
          <span>
            {primaryCount} {messages.personDetail.sections.primary}
          </span>
        </div>
        {canEdit ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 size-3.5" aria-hidden="true" />
            {messages.personDocument.row.addButton}
          </Button>
        ) : null}
      </div>
      {documents.length === 0 ? (
        <EmptyRow>{messages.personDetail.empty.noDocuments}</EmptyRow>
      ) : (
        <ul className="divide-y">
          {documents.map((document) => (
            <PersonDocumentRow
              key={document.id}
              document={document}
              personId={personId}
              typeLabel={
                messages.personDetail.documentTypeLabels[
                  document.type as keyof typeof messages.personDetail.documentTypeLabels
                ] ?? document.type
              }
              formattedExpiry={formatCrmDate(i18n, document.expiryDate)}
              noneLabel={messages.common.none}
              primaryLabel={messages.personDetail.sections.primary}
            />
          ))}
        </ul>
      )}
      {canEdit && personId ? (
        <PersonDocumentDialog open={createOpen} onOpenChange={setCreateOpen} personId={personId} />
      ) : null}
    </div>
  )
}

function PersonDocumentRow({
  document,
  personId,
  typeLabel,
  formattedExpiry,
  noneLabel,
  primaryLabel,
}: {
  document: PersonDocument
  personId?: string
  typeLabel: string
  formattedExpiry: string
  noneLabel: string
  primaryLabel: string
}) {
  const [revealed, setRevealed] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const revealQuery = useRevealPersonDocument(document.id, { enabled: revealed })
  const mutation = usePersonDocumentMutation(personId)
  const docMessages = useCrmUiMessagesOrDefault().personDocument
  const editable = Boolean(personId)
  const revealError = revealed && revealQuery.error
  const revealedNumber = revealQuery.data?.data.number ?? null

  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{typeLabel}</p>
        <p className="text-xs text-muted-foreground">
          {document.issuingCountry ?? noneLabel} - {formattedExpiry}
        </p>
        {document.issuingAuthority ? (
          <p className="truncate text-xs text-muted-foreground">{document.issuingAuthority}</p>
        ) : null}
        {revealed ? (
          <p className="mt-1 font-mono text-xs">
            {revealQuery.isLoading
              ? docMessages.row.decrypting
              : (revealedNumber ?? docMessages.row.noNumberOnFile)}
          </p>
        ) : null}
        {revealError ? (
          <p className="mt-1 text-[10px] text-destructive">
            {revealError instanceof Error ? revealError.message : docMessages.row.revealFailed}
          </p>
        ) : null}
      </div>
      <div className="flex items-start gap-2">
        <div className="flex flex-col items-end gap-1">
          {document.isPrimary ? <Badge variant="secondary">{primaryLabel}</Badge> : null}
          <Badge variant="outline">{typeLabel}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setRevealed((prev) => !prev)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={revealed ? docMessages.row.hideAria : docMessages.row.revealAria}
          >
            {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
          {editable ? (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="text-muted-foreground hover:text-foreground"
              aria-label={docMessages.row.editAria}
            >
              <Pencil className="size-3.5" />
            </button>
          ) : null}
          {editable && !document.isPrimary ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={mutation.setPrimary.isPending}
              onClick={() => mutation.setPrimary.mutateAsync(document.id)}
            >
              {docMessages.row.makePrimary}
            </Button>
          ) : null}
          {editable ? (
            <ConfirmActionButton
              buttonLabel={docMessages.row.deleteButton}
              title={docMessages.row.deleteTitle}
              description={docMessages.row.deleteDescription}
              confirmLabel={docMessages.row.deleteConfirm}
              variant="ghost"
              confirmVariant="destructive"
              disabled={mutation.remove.isPending}
              onConfirm={async () => {
                await mutation.remove.mutateAsync(document.id)
              }}
            />
          ) : null}
        </div>
      </div>
      {editable && personId ? (
        <PersonDocumentDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          personId={personId}
          document={document}
        />
      ) : null}
    </li>
  )
}

export interface EmptyRowProps {
  children: ReactNode
}

export function EmptyRow({ children }: EmptyRowProps) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
}

export function LoadingRow() {
  return (
    <div className="flex justify-center py-6">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

export function personDisplayName(
  person: Pick<PersonRecord, "firstName" | "lastName">,
  fallback: string,
) {
  return [person.firstName, person.lastName].filter(Boolean).join(" ") || fallback
}

export function initialsFrom(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  )
}
