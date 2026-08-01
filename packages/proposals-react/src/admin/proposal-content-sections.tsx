// agent-quality: file-size exception -- owner: proposals-react; the proposal-workspace cards (line items, travelers, client, ownership) stay co-located until the staged-edit refactor restructures them.
"use client"

import { useCurrentUser, useOrganizationMembers } from "@voyant-travel/auth-react"
import { formatMessage } from "@voyant-travel/i18n"
import type { OrganizationRecord, PersonRecord } from "@voyant-travel/relationships-react"
import { useOrganizations, usePeople, usePerson } from "@voyant-travel/relationships-react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@voyant-travel/ui/components"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import {
  Building2,
  Check,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  User,
  Users,
  X,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { formatCrmDate, formatCrmMoney, formatCrmRelative } from "../components/crm-format.js"
import { InlineSelectField } from "../components/inline-select-field.js"
import { useCrmUiI18nOrDefault } from "../i18n/index.js"
import type {
  CreateProposalProductInput,
  ProposalMediaRecord,
  ProposalParticipantRecord,
  ProposalProductRecord,
} from "../index.js"

// ---------------------------------------------------------------------------
// Line items — what the proposal includes (flights, stays, experiences, …)
// ---------------------------------------------------------------------------

export interface ProposalLineItemsCardProps {
  products: ProposalProductRecord[]
  isPending: boolean
  /** Proposal currency, used as the default for new line items. */
  currency: string
  busy?: boolean
  onAdd: (input: CreateProposalProductInput) => Promise<void>
  onUpdate: (
    id: string,
    input: { nameSnapshot?: string; quantity?: number; unitPriceAmountCents?: number | null },
  ) => Promise<void>
  onRemove: (id: string) => Promise<void>
}

export function ProposalLineItemsCard({
  products,
  isPending,
  currency,
  busy,
  onAdd,
  onUpdate,
  onRemove,
}: ProposalLineItemsCardProps) {
  const i18n = useCrmUiI18nOrDefault()
  const t = i18n.messages.proposalLineItemsCard
  const [name, setName] = useState("")
  const [qty, setQty] = useState("1")
  const [price, setPrice] = useState("")

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const quantity = Math.max(1, Number.parseInt(qty, 10) || 1)
    const parsedPrice = price.trim() === "" ? null : Math.round(Number.parseFloat(price) * 100)
    await onAdd({
      nameSnapshot: trimmed,
      quantity,
      unitPriceAmountCents: Number.isFinite(parsedPrice as number) ? parsedPrice : null,
      currency,
    })
    setName("")
    setQty("1")
    setPrice("")
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{t.title}</CardTitle>
        <p className="text-muted-foreground text-sm">{t.description}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isPending ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : products.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground text-sm">{t.empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.columns.item}</TableHead>
                <TableHead className="w-16 text-right">{t.columns.qty}</TableHead>
                <TableHead className="text-right">{t.columns.unitPrice}</TableHead>
                <TableHead className="text-right">{t.columns.total}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <LineItemRow
                  key={product.id}
                  product={product}
                  currency={currency}
                  busy={busy}
                  onUpdate={onUpdate}
                  onRemove={onRemove}
                />
              ))}
            </TableBody>
          </Table>
        )}

        <div className="flex items-end gap-2 rounded border p-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.namePlaceholder}
            className="h-8 flex-1 text-sm"
          />
          <Input
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            type="number"
            min={1}
            placeholder={t.qtyPlaceholder}
            className="h-8 w-16 text-sm"
          />
          <Input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            type="number"
            min={0}
            step="0.01"
            placeholder={t.pricePlaceholder}
            className="h-8 w-28 text-sm"
          />
          <Button size="sm" onClick={() => void submit()} disabled={busy || name.trim() === ""}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t.addItem}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function LineItemRow({
  product,
  currency,
  busy,
  onUpdate,
  onRemove,
}: {
  product: ProposalProductRecord
  currency: string
  busy?: boolean
  onUpdate: (
    id: string,
    input: { nameSnapshot?: string; quantity?: number; unitPriceAmountCents?: number | null },
  ) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const i18n = useCrmUiI18nOrDefault()
  const t = i18n.messages.proposalLineItemsCard
  const rowCurrency = product.currency ?? currency
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(product.nameSnapshot)
  const [qty, setQty] = useState(String(product.quantity))
  const [price, setPrice] = useState(
    product.unitPriceAmountCents != null ? String(product.unitPriceAmountCents / 100) : "",
  )

  const startEditing = () => {
    setName(product.nameSnapshot)
    setQty(String(product.quantity))
    setPrice(product.unitPriceAmountCents != null ? String(product.unitPriceAmountCents / 100) : "")
    setEditing(true)
  }

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const quantity = Math.max(1, Number.parseInt(qty, 10) || 1)
    const parsedPrice = price.trim() === "" ? null : Math.round(Number.parseFloat(price) * 100)
    await onUpdate(product.id, {
      nameSnapshot: trimmed,
      quantity,
      unitPriceAmountCents: Number.isFinite(parsedPrice as number) ? parsedPrice : null,
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <TableRow>
        <TableCell>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-8 text-sm"
          />
        </TableCell>
        <TableCell>
          <Input
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            type="number"
            min={1}
            className="h-8 w-16 text-right text-sm"
          />
        </TableCell>
        <TableCell>
          <Input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            type="number"
            min={0}
            step="0.01"
            className="h-8 w-24 text-right text-sm"
          />
        </TableCell>
        <TableCell colSpan={2}>
          <div className="flex items-center justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              disabled={busy}
              onClick={() => void save()}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    )
  }

  const lineTotal =
    (product.unitPriceAmountCents ?? 0) * product.quantity - (product.discountAmountCents ?? 0)

  return (
    <TableRow className="group">
      <TableCell>
        <div className="font-medium">{product.nameSnapshot}</div>
        {product.description ? (
          <div className="text-muted-foreground text-xs">{product.description}</div>
        ) : null}
      </TableCell>
      <TableCell className="text-right">{product.quantity}</TableCell>
      <TableCell className="text-right">
        {formatCrmMoney(i18n, product.unitPriceAmountCents, rowCurrency)}
      </TableCell>
      <TableCell className="text-right font-medium">
        {formatCrmMoney(i18n, lineTotal, rowCurrency)}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            disabled={busy}
            onClick={startEditing}
            aria-label={t.editItem}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            disabled={busy}
            onClick={() => void onRemove(product.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

// ---------------------------------------------------------------------------
// Travelers (PAX)
// ---------------------------------------------------------------------------

export interface ProposalTravelersCardProps {
  travelers: ProposalParticipantRecord[]
  /** Explicit headcount — may exceed the number of named travelers. */
  paxCount: number | null
  isPending: boolean
  busy?: boolean
  onPaxCountChange: (paxCount: number | null) => Promise<void>
  onAdd: (personId: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
}

export function ProposalTravelersCard({
  travelers,
  paxCount,
  isPending,
  busy,
  onPaxCountChange,
  onAdd,
  onRemove,
}: ProposalTravelersCardProps) {
  const i18n = useCrmUiI18nOrDefault()
  const t = i18n.messages.proposalTravelersCard
  const [search, setSearch] = useState("")
  const [paxDraft, setPaxDraft] = useState(paxCount != null ? String(paxCount) : "")

  useEffect(() => {
    setPaxDraft(paxCount != null ? String(paxCount) : "")
  }, [paxCount])

  const commitPax = () => {
    const trimmed = paxDraft.trim()
    const next = trimmed === "" ? null : Math.max(0, Number.parseInt(trimmed, 10) || 0)
    if (next !== paxCount) void onPaxCountChange(next)
  }
  const peopleQuery = usePeople({ search, limit: 6, enabled: search.trim().length >= 2 })
  const existingPersonIds = new Set(travelers.map((traveler) => traveler.personId))
  const results = (peopleQuery.data?.data ?? []).filter(
    (person) => !existingPersonIds.has(person.id),
  )

  const add = async (personId: string) => {
    await onAdd(personId)
    setSearch("")
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          {t.title}
        </CardTitle>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={0}
            value={paxDraft}
            disabled={busy}
            onChange={(event) => setPaxDraft(event.target.value)}
            onBlur={commitPax}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                commitPax()
              }
            }}
            placeholder={String(travelers.length)}
            aria-label={t.paxLabel}
            className="h-7 w-14 text-right text-sm"
          />
          <span className="text-muted-foreground text-xs">{t.paxLabel}</span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isPending ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : travelers.length === 0 ? (
          <p className="py-2 text-center text-muted-foreground text-sm">{t.empty}</p>
        ) : (
          <ul className="divide-y">
            {travelers.map((traveler) => (
              <TravelerRow
                key={traveler.id}
                traveler={traveler}
                busy={busy}
                onRemove={() => void onRemove(traveler.id)}
              />
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-1">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t.addPlaceholder}
            className="h-8 text-sm"
          />
          {search.trim().length >= 2 ? (
            <div className="rounded border">
              {peopleQuery.isPending ? (
                <div className="flex justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : results.length === 0 ? (
                <p className="py-2 text-center text-muted-foreground text-xs">{t.noResults}</p>
              ) : (
                <ul className="max-h-40 overflow-auto">
                  {results.map((person) => (
                    <li key={person.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void add(person.id)}
                        className="flex w-full items-center justify-between px-2 py-1.5 text-left text-sm hover:bg-muted/40"
                      >
                        <span className="truncate">
                          {[person.firstName, person.lastName].filter(Boolean).join(" ") ||
                            person.id}
                        </span>
                        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function TravelerRow({
  traveler,
  busy,
  onRemove,
}: {
  traveler: ProposalParticipantRecord
  busy?: boolean
  onRemove: () => void
}) {
  const personQuery = usePerson(traveler.personId, { enabled: Boolean(traveler.personId) })
  const person = personQuery.data
  const name = person
    ? [person.firstName, person.lastName].filter(Boolean).join(" ").trim() || traveler.personId
    : traveler.personId

  return (
    <li className="flex items-center justify-between gap-2 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">{name}</span>
        {traveler.isPrimary ? (
          <Badge variant="outline" className="text-[10px]">
            ★
          </Badge>
        ) : null}
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 shrink-0 p-0"
        disabled={busy}
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Client — person (B2C) and/or organization (B2B), both editable & optional
// ---------------------------------------------------------------------------

export interface ProposalClientCardProps {
  person: PersonRecord | null | undefined
  organization: OrganizationRecord | null | undefined
  busy?: boolean
  onSetPerson: (personId: string | null) => Promise<void>
  onSetOrganization: (organizationId: string | null) => Promise<void>
  onOpenPerson: () => void
  onOpenOrganization: () => void
}

export function ProposalClientCard({
  person,
  organization,
  busy,
  onSetPerson,
  onSetOrganization,
  onOpenPerson,
  onOpenOrganization,
}: ProposalClientCardProps) {
  const i18n = useCrmUiI18nOrDefault()
  const t = i18n.messages.proposalClientCard
  const personName = person
    ? [person.firstName, person.lastName].filter(Boolean).join(" ").trim() || person.id
    : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-semibold text-sm">{t.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="flex flex-col gap-1.5">
          <div className="font-medium text-muted-foreground text-xs">{t.contactLabel}</div>
          {person ? (
            <SelectedEntity
              icon={User}
              name={personName ?? person.id}
              subtitle={person.jobTitle}
              busy={busy}
              onOpen={onOpenPerson}
              onClear={() => void onSetPerson(null)}
            />
          ) : (
            <PersonPicker
              placeholder={t.searchContact}
              noResults={t.noResults}
              busy={busy}
              onSelect={(id) => void onSetPerson(id)}
            />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="font-medium text-muted-foreground text-xs">{t.companyLabel}</div>
          {organization ? (
            <SelectedEntity
              icon={Building2}
              name={organization.name}
              subtitle={organization.industry}
              busy={busy}
              onOpen={onOpenOrganization}
              onClear={() => void onSetOrganization(null)}
            />
          ) : (
            <OrgPicker
              placeholder={t.searchCompany}
              noResults={t.noResults}
              busy={busy}
              onSelect={(id) => void onSetOrganization(id)}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function SelectedEntity({
  icon: Icon,
  name,
  subtitle,
  busy,
  onOpen,
  onClear,
}: {
  icon: typeof User
  name: string
  subtitle?: string | null
  busy?: boolean
  onOpen: () => void
  onClear: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded border p-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left hover:underline">
        <span className="truncate font-medium">{name}</span>
        {subtitle ? (
          <span className="block truncate text-muted-foreground text-xs">{subtitle}</span>
        ) : null}
      </button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 shrink-0 p-0"
        disabled={busy}
        onClick={onClear}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function PersonPicker({
  placeholder,
  noResults,
  busy,
  onSelect,
}: {
  placeholder: string
  noResults: string
  busy?: boolean
  onSelect: (id: string) => void
}) {
  const [search, setSearch] = useState("")
  const query = usePeople({ search, limit: 6, enabled: search.trim().length >= 2 })
  const results = query.data?.data ?? []
  return (
    <EntitySearch
      search={search}
      onSearch={setSearch}
      isPending={query.isPending}
      placeholder={placeholder}
      noResults={noResults}
      busy={busy}
      results={results.map((person) => ({
        id: person.id,
        label: [person.firstName, person.lastName].filter(Boolean).join(" ") || person.id,
      }))}
      onSelect={(id) => {
        onSelect(id)
        setSearch("")
      }}
    />
  )
}

function OrgPicker({
  placeholder,
  noResults,
  busy,
  onSelect,
}: {
  placeholder: string
  noResults: string
  busy?: boolean
  onSelect: (id: string) => void
}) {
  const [search, setSearch] = useState("")
  const query = useOrganizations({ search, limit: 6, enabled: search.trim().length >= 2 })
  const results = query.data?.data ?? []
  return (
    <EntitySearch
      search={search}
      onSearch={setSearch}
      isPending={query.isPending}
      placeholder={placeholder}
      noResults={noResults}
      busy={busy}
      results={results.map((organization) => ({ id: organization.id, label: organization.name }))}
      onSelect={(id) => {
        onSelect(id)
        setSearch("")
      }}
    />
  )
}

function EntitySearch({
  search,
  onSearch,
  isPending,
  placeholder,
  noResults,
  busy,
  results,
  onSelect,
}: {
  search: string
  onSearch: (value: string) => void
  isPending: boolean
  placeholder: string
  noResults: string
  busy?: boolean
  results: Array<{ id: string; label: string }>
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <Input
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder={placeholder}
        className="h-8 text-sm"
      />
      {search.trim().length >= 2 ? (
        <div className="rounded border">
          {isPending ? (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <p className="py-2 text-center text-muted-foreground text-xs">{noResults}</p>
          ) : (
            <ul className="max-h-40 overflow-auto">
              {results.map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onSelect(result.id)}
                    className="flex w-full items-center justify-between px-2 py-1.5 text-left text-sm hover:bg-muted/40"
                  >
                    <span className="truncate">{result.label}</span>
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ownership & audit — who owns the proposal, who created/last changed it
// ---------------------------------------------------------------------------

export interface ProposalOwnershipCardProps {
  ownerId: string | null
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
  busy?: boolean
  onSetOwner: (ownerId: string | null) => Promise<void>
}

export function ProposalOwnershipCard({
  ownerId,
  createdBy,
  updatedBy,
  createdAt,
  updatedAt,
  onSetOwner,
}: ProposalOwnershipCardProps) {
  const i18n = useCrmUiI18nOrDefault()
  const t = i18n.messages.proposalOwnershipCard
  const membersQuery = useOrganizationMembers()
  const currentUserQuery = useCurrentUser()
  const currentUser = currentUserQuery.data

  // Candidate owners: the org's team members when that endpoint is available,
  // plus the current user (always — so an owner is assignable even in cloud
  // deployments that don't expose a members list). Keyed by userId.
  const candidates = new Map<string, string>()
  for (const member of membersQuery.data?.members ?? []) {
    candidates.set(member.userId, member.user.name ?? member.user.email ?? member.userId)
  }
  if (currentUser) {
    const currentName =
      [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ").trim() ||
      currentUser.email ||
      currentUser.id
    if (!candidates.has(currentUser.id)) candidates.set(currentUser.id, currentName)
  }

  const nameOf = (userId: string | null) => {
    if (!userId) return t.unassigned
    return candidates.get(userId) ?? userId
  }

  const options = [...candidates.entries()].map(([value, label]) => ({ value, label }))

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-semibold text-sm">{t.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <InlineSelectField
          icon={User}
          label={t.ownerLabel}
          value={ownerId}
          options={options}
          onSave={(next) => onSetOwner(next)}
        />
        <div className="flex flex-col gap-0.5 border-t pt-2 text-muted-foreground text-xs">
          <span>
            {formatMessage(t.createdBy, { name: nameOf(createdBy) })} ·{" "}
            {formatCrmDate(i18n, createdAt)}
          </span>
          <span>
            {formatMessage(t.updatedBy, { name: nameOf(updatedBy) })} ·{" "}
            {formatCrmRelative(i18n, updatedAt)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Media — images shown on the client proposal (uploads persist immediately)
// ---------------------------------------------------------------------------

export interface ProposalMediaCardProps {
  media: ProposalMediaRecord[]
  isPending: boolean
  busy?: boolean
  onUploadFiles: (files: FileList) => Promise<void>
  onRemove: (id: string) => Promise<void>
}

export function ProposalMediaCard({
  media,
  isPending,
  busy,
  onUploadFiles,
  onRemove,
}: ProposalMediaCardProps) {
  const i18n = useCrmUiI18nOrDefault()
  const t = i18n.messages.proposalMediaCard
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div>
          <CardTitle>{t.title}</CardTitle>
          <p className="text-muted-foreground text-sm">{t.description}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-1.5 h-4 w-4" />
          )}
          {t.add}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = event.target.files
            if (files && files.length > 0) void onUploadFiles(files)
            event.target.value = ""
          }}
        />
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : media.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <ImagePlus className="h-6 w-6" />
            <p className="text-sm">{t.empty}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {media.map((item) => (
              <div key={item.id} className="group relative overflow-hidden rounded border">
                {item.mediaType === "image" ? (
                  <img
                    src={item.url}
                    alt={item.altText ?? item.name}
                    className="aspect-video w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center bg-muted text-muted-foreground text-xs">
                    {item.name}
                  </div>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onRemove(item.id)}
                  className="absolute top-1 right-1 rounded-full bg-background/80 p-1 opacity-0 transition group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
