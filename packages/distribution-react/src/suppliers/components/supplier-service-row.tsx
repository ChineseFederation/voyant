import { Badge, Button } from "@voyant-travel/ui/components"
import { AlertTriangle, ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react"
import { useSuppliersUiI18nOrDefault } from "../i18n/index.js"
import type { SuppliersUiMessages } from "../i18n/messages.js"
import { type SupplierRate, type SupplierService, useSupplierServiceRates } from "../index.js"

export function SupplierServiceRow({
  service,
  supplierId,
  rates,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onAddRate,
  onEditRate,
  onDeleteRate,
}: {
  service: SupplierService
  /**
   * Optional. When set (and `rates` is not), the row fetches rates lazily on
   * expand via `useSupplierServiceRates`.
   */
  supplierId?: string
  /**
   * Optional. When provided, the caller owns rate fetching. When omitted and
   * `supplierId` is set, rates are fetched internally on expand.
   */
  rates?: SupplierRate[]
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onAddRate: () => void
  onEditRate: (rate: SupplierRate) => void
  onDeleteRate: (rateId: string) => void
}) {
  const i18n = useSuppliersUiI18nOrDefault()
  const { messages } = i18n
  const { data: fetchedRates } = useSupplierServiceRates(supplierId ?? "", service.id, {
    enabled: expanded && !rates && !!supplierId,
  })
  const resolvedRates = rates ?? fetchedRates?.data ?? []

  return (
    <div className="rounded-md border">
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={onToggle}
          className="text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="flex-1">
          <span className="text-sm font-medium">{service.name}</span>
          <div className="mt-0.5 flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {messages.common.serviceTypeLabels[service.serviceType]}
            </Badge>
            {service.duration ? (
              <span className="text-xs text-muted-foreground">{service.duration}</span>
            ) : null}
            {service.capacity ? (
              <span className="text-xs text-muted-foreground">
                {messages.common.maxPax.replace("{count}", String(service.capacity))}
              </span>
            ) : null}
            {!service.active ? (
              <Badge variant="secondary" className="text-xs">
                {messages.common.inactive}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            aria-label={messages.common.edit}
            title={messages.common.edit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            aria-label={messages.common.delete}
            title={messages.common.delete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="border-t bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {messages.supplierServiceRow.rates}
            </p>
            <Button variant="outline" size="sm" onClick={onAddRate}>
              <Plus className="mr-1 h-3 w-3" />
              {messages.supplierServiceRow.addRate}
            </Button>
          </div>

          {resolvedRates.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              {messages.supplierServiceRow.noRates}
            </p>
          ) : (
            <div className="overflow-x-auto rounded border bg-background">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="p-2 text-left font-medium">
                      {messages.supplierServiceRow.columns.name}
                    </th>
                    <th className="p-2 text-left font-medium">
                      {messages.supplierServiceRow.columns.amount}
                    </th>
                    <th className="p-2 text-left font-medium">
                      {messages.supplierServiceRow.columns.unit}
                    </th>
                    <th className="p-2 text-left font-medium">
                      {messages.supplierServiceRow.columns.valid}
                    </th>
                    <th className="p-2 text-left font-medium">
                      {messages.supplierServiceRow.columns.pax}
                    </th>
                    <th className="w-16 p-2" />
                  </tr>
                </thead>
                <tbody>
                  {resolvedRates.map((rate) => (
                    <RateRow
                      key={rate.id}
                      rate={rate}
                      messages={messages}
                      formatCurrency={i18n.formatCurrency}
                      onEditRate={onEditRate}
                      onDeleteRate={onDeleteRate}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function RateRow({
  rate,
  messages,
  formatCurrency,
  onEditRate,
  onDeleteRate,
}: {
  rate: SupplierRate
  messages: SuppliersUiMessages
  formatCurrency: (amount: number, currency: string) => string
  onEditRate: (rate: SupplierRate) => void
  onDeleteRate: (rateId: string) => void
}) {
  const invalidDateRange = Boolean(rate.validFrom && rate.validTo && rate.validFrom > rate.validTo)
  const invalidPaxRange = Boolean(
    rate.minPax != null && rate.maxPax != null && rate.minPax > rate.maxPax,
  )

  return (
    <tr className="border-b last:border-b-0">
      <td className="p-2">{rate.name}</td>
      <td className="p-2 font-mono">{formatCurrency(rate.amountCents / 100, rate.currency)}</td>
      <td className="p-2">{messages.common.rateUnitLabels[rate.unit]}</td>
      <td className="p-2">
        {rate.validFrom || rate.validTo
          ? `${rate.validFrom ?? messages.supplierServiceRow.validFallback} - ${
              rate.validTo ?? messages.supplierServiceRow.validFallback
            }`
          : messages.common.none}
        {invalidDateRange ? (
          <InvalidRangeMessage>{messages.supplierServiceRow.invalidDateRange}</InvalidRangeMessage>
        ) : null}
      </td>
      <td className="p-2">
        {rate.minPax || rate.maxPax
          ? `${rate.minPax ?? messages.common.unknown}-${rate.maxPax ?? messages.common.unknown}`
          : messages.common.none}
        {invalidPaxRange ? (
          <InvalidRangeMessage>{messages.supplierServiceRow.invalidPaxRange}</InvalidRangeMessage>
        ) : null}
      </td>
      <td className="p-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onEditRate(rate)}
            aria-label={messages.common.edit}
            title={messages.common.edit}
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onDeleteRate(rate.id)}
            aria-label={messages.common.delete}
            title={messages.common.delete}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  )
}

function InvalidRangeMessage({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      {children}
    </span>
  )
}
