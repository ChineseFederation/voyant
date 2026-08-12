// agent-quality: file-size exception -- owner: action-ledger-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
"use client"

import { useOperatorAdminMessages as useAdminMessages } from "@voyant-travel/admin"
import { type BookingRecord, useBookings } from "@voyant-travel/bookings-react"
import { type ProductRecord, useProducts } from "@voyant-travel/inventory-react"
import {
  type OrganizationRecord,
  type PersonRecord,
  useOrganizations,
  usePeople,
} from "@voyant-travel/relationships-react"
import { AsyncCombobox } from "@voyant-travel/ui/components/async-combobox"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { Input } from "@voyant-travel/ui/components/input"
import { Label } from "@voyant-travel/ui/components/label"
import { Popover, PopoverContent, PopoverTrigger } from "@voyant-travel/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import { ListFilter } from "lucide-react"
import * as React from "react"

const ANY = "__all__"
export const RISK_ALL = ANY
export const STATUS_ALL = ANY
export const PRINCIPAL_TYPE_ALL = ANY
export const TARGET_TYPE_ALL = ANY

const PRINCIPAL_TYPE_VALUES = [
  PRINCIPAL_TYPE_ALL,
  "user",
  "api_key",
  "agent",
  "workflow",
  "system",
] as const

type TargetTypeKey =
  | typeof TARGET_TYPE_ALL
  | "booking"
  | "product"
  | "person"
  | "organization"
  | "invoice"
  | "supplier"

const TARGET_TYPE_VALUES: ReadonlyArray<TargetTypeKey> = [
  TARGET_TYPE_ALL,
  "booking",
  "product",
  "person",
  "organization",
  "invoice",
  "supplier",
]

const RISK_VALUES = [RISK_ALL, "low", "medium", "high", "critical"] as const

const STATUS_VALUES = [
  STATUS_ALL,
  "requested",
  "awaiting_approval",
  "approved",
  "denied",
  "succeeded",
  "failed",
  "reversed",
  "compensated",
  "expired",
  "cancelled",
  "superseded",
] as const

export interface ActionLedgerFiltersPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeFilterCount: number
  principalType: string
  onPrincipalTypeChange: (value: string) => void
  principalId: string
  onPrincipalIdChange: (value: string) => void
  targetType: string
  onTargetTypeChange: (value: string) => void
  targetId: string
  onTargetIdChange: (value: string) => void
  workflowRunId: string
  onWorkflowRunIdChange: (value: string) => void
  correlationId: string
  onCorrelationIdChange: (value: string) => void
  evaluatedRisk: string
  onEvaluatedRiskChange: (value: string) => void
  status: string
  onStatusChange: (value: string) => void
}

function optionKey(value: string): string {
  return value === ANY ? "any" : value
}

export function ActionLedgerFiltersPopover({
  open,
  onOpenChange,
  activeFilterCount,
  principalType,
  onPrincipalTypeChange,
  principalId,
  onPrincipalIdChange,
  targetType,
  onTargetTypeChange,
  targetId,
  onTargetIdChange,
  workflowRunId,
  onWorkflowRunIdChange,
  correlationId,
  onCorrelationIdChange,
  evaluatedRisk,
  onEvaluatedRiskChange,
  status,
  onStatusChange,
}: ActionLedgerFiltersPopoverProps) {
  const messages = useAdminMessages().actionLedgerPage
  const f = messages.filtersPopover
  const principalIdKey = optionKey(principalType) as keyof typeof f.principalIdPlaceholder
  const principalIdPlaceholder =
    f.principalIdPlaceholder[principalIdKey] ?? f.principalIdPlaceholder.any

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="default">
            <ListFilter className="mr-2 size-4" />
            {messages.filters}
            {activeFilterCount > 0 ? (
              <Badge variant="secondary" className="ml-2 px-1.5">
                {activeFilterCount}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <PopoverContent
        align="start"
        className="max-h-[75vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto p-4"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="logs-filter-principal-type">{f.principalTypeLabel}</Label>
            <Select
              value={principalType}
              onValueChange={(value) => onPrincipalTypeChange(value ?? PRINCIPAL_TYPE_ALL)}
            >
              <SelectTrigger className="w-full" id="logs-filter-principal-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRINCIPAL_TYPE_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {
                      f.principalTypeOptions[
                        optionKey(value) as keyof typeof f.principalTypeOptions
                      ]
                    }
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="logs-filter-principal-id">{f.principalIdLabel}</Label>
            <Input
              id="logs-filter-principal-id"
              placeholder={principalIdPlaceholder}
              value={principalId}
              onChange={(event) => onPrincipalIdChange(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="logs-filter-target-type">{f.targetTypeLabel}</Label>
            <Select
              value={isKnownTargetType(targetType) ? targetType : TARGET_TYPE_ALL}
              onValueChange={(value) => onTargetTypeChange(value ?? TARGET_TYPE_ALL)}
            >
              <SelectTrigger className="w-full" id="logs-filter-target-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGET_TYPE_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {f.targetTypeOptions[optionKey(value) as keyof typeof f.targetTypeOptions]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="logs-filter-target-id">{f.targetLabel}</Label>
            <TargetCombobox
              targetType={targetType as TargetTypeKey}
              value={targetId}
              onChange={onTargetIdChange}
              messages={f.targetSearch}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="logs-filter-workflow">{f.workflowRunLabel}</Label>
            <Input
              id="logs-filter-workflow"
              value={workflowRunId}
              onChange={(event) => onWorkflowRunIdChange(event.target.value)}
              placeholder={f.workflowRunPlaceholder}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="logs-filter-correlation">{f.correlationIdLabel}</Label>
            <Input
              id="logs-filter-correlation"
              placeholder={f.correlationIdPlaceholder}
              value={correlationId}
              onChange={(event) => onCorrelationIdChange(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="logs-filter-risk">{f.riskLabel}</Label>
            <Select
              value={evaluatedRisk}
              onValueChange={(value) => onEvaluatedRiskChange(value ?? RISK_ALL)}
            >
              <SelectTrigger className="w-full" id="logs-filter-risk">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RISK_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {f.riskOptions[optionKey(value) as keyof typeof f.riskOptions]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="logs-filter-status">{f.statusLabel}</Label>
            <Select value={status} onValueChange={(value) => onStatusChange(value ?? STATUS_ALL)}>
              <SelectTrigger className="w-full" id="logs-filter-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {f.statusOptions[optionKey(value) as keyof typeof f.statusOptions]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function isKnownTargetType(value: string): value is TargetTypeKey {
  return TARGET_TYPE_VALUES.includes(value as TargetTypeKey)
}

type TargetSearchMessages = ReturnType<
  typeof useAdminMessages
>["actionLedgerPage"]["filtersPopover"]["targetSearch"]

function TargetCombobox({
  targetType,
  value,
  onChange,
  messages,
}: {
  targetType: TargetTypeKey
  value: string
  onChange: (value: string) => void
  messages: TargetSearchMessages
}) {
  switch (targetType) {
    case "booking":
      return <BookingTargetCombobox value={value} onChange={onChange} messages={messages} />
    case "product":
      return <ProductTargetCombobox value={value} onChange={onChange} messages={messages} />
    case "person":
      return <PersonTargetCombobox value={value} onChange={onChange} messages={messages} />
    case "organization":
      return <OrganizationTargetCombobox value={value} onChange={onChange} messages={messages} />
    default:
      return (
        <Input
          id="logs-filter-target-id"
          placeholder={
            targetType === TARGET_TYPE_ALL ? messages.unknownPickType : messages.unknownPlaceholder
          }
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )
  }
}

function BookingTargetCombobox({
  value,
  onChange,
  messages,
}: {
  value: string
  onChange: (value: string) => void
  messages: TargetSearchMessages
}) {
  const [search, setSearch] = React.useState("")
  const [selected, setSelected] = React.useState<BookingRecord | null>(null)
  const { data } = useBookings({ search: search || undefined, limit: 20 })
  const items = data?.data ?? []
  return (
    <AsyncCombobox<BookingRecord>
      value={value || null}
      onChange={(next) => {
        onChange(next ?? "")
        if (!next) setSelected(null)
        else {
          const match = items.find((booking) => booking.id === next)
          if (match) setSelected(match)
        }
      }}
      items={items}
      selectedItem={selected}
      getKey={(booking) => booking.id}
      getLabel={(booking) => booking.bookingNumber}
      onSearchChange={setSearch}
      placeholder={messages.bookingPlaceholder}
      emptyText={messages.bookingEmpty}
    />
  )
}

function ProductTargetCombobox({
  value,
  onChange,
  messages,
}: {
  value: string
  onChange: (value: string) => void
  messages: TargetSearchMessages
}) {
  const [search, setSearch] = React.useState("")
  const [selected, setSelected] = React.useState<ProductRecord | null>(null)
  const { data } = useProducts({ search: search || undefined, limit: 20 })
  const items = data?.data ?? []
  return (
    <AsyncCombobox<ProductRecord>
      value={value || null}
      onChange={(next) => {
        onChange(next ?? "")
        if (!next) setSelected(null)
        else {
          const match = items.find((product) => product.id === next)
          if (match) setSelected(match)
        }
      }}
      items={items}
      selectedItem={selected}
      getKey={(product) => product.id}
      getLabel={(product) => product.name}
      onSearchChange={setSearch}
      placeholder={messages.productPlaceholder}
      emptyText={messages.productEmpty}
    />
  )
}

function PersonTargetCombobox({
  value,
  onChange,
  messages,
}: {
  value: string
  onChange: (value: string) => void
  messages: TargetSearchMessages
}) {
  const [search, setSearch] = React.useState("")
  const [selected, setSelected] = React.useState<PersonRecord | null>(null)
  const { data } = usePeople({ search: search || undefined, limit: 20 })
  const items = data?.data ?? []
  return (
    <AsyncCombobox<PersonRecord>
      value={value || null}
      onChange={(next) => {
        onChange(next ?? "")
        if (!next) setSelected(null)
        else {
          const match = items.find((person) => person.id === next)
          if (match) setSelected(match)
        }
      }}
      items={items}
      selectedItem={selected}
      getKey={(person) => person.id}
      getLabel={formatPersonName}
      getSecondary={(person) => person.email ?? undefined}
      onSearchChange={setSearch}
      placeholder={messages.personPlaceholder}
      emptyText={messages.personEmpty}
    />
  )
}

function OrganizationTargetCombobox({
  value,
  onChange,
  messages,
}: {
  value: string
  onChange: (value: string) => void
  messages: TargetSearchMessages
}) {
  const [search, setSearch] = React.useState("")
  const [selected, setSelected] = React.useState<OrganizationRecord | null>(null)
  const { data } = useOrganizations({ search: search || undefined, limit: 20 })
  const items = data?.data ?? []
  return (
    <AsyncCombobox<OrganizationRecord>
      value={value || null}
      onChange={(next) => {
        onChange(next ?? "")
        if (!next) setSelected(null)
        else {
          const match = items.find((organization) => organization.id === next)
          if (match) setSelected(match)
        }
      }}
      items={items}
      selectedItem={selected}
      getKey={(organization) => organization.id}
      getLabel={(organization) => organization.name}
      onSearchChange={setSearch}
      placeholder={messages.organizationPlaceholder}
      emptyText={messages.organizationEmpty}
    />
  )
}

function formatPersonName(person: PersonRecord): string {
  const name = [person.firstName, person.lastName].filter(Boolean).join(" ").trim()
  return name || person.email || person.id
}
