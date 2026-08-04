import { formatMessage } from "@voyant-travel/i18n"
import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@voyant-travel/ui/components"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import { cn } from "@voyant-travel/ui/lib/utils"
import { ExternalLink } from "lucide-react"
import { useFinanceUiI18nOrDefault } from "../../i18n/index.js"
import type { DepartureProfitabilityRow, ProductProfitabilityRow } from "../../index.js"
import { useTravelerProfitability } from "../../index.js"

type CurrencyFormatOptions = Omit<Intl.NumberFormatOptions, "currency" | "style">

function marginText(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}%`
}

function formatMoneyCents(
  cents: number,
  currency: string,
  formatCurrency: (amount: number, currency: string, options?: CurrencyFormatOptions) => string,
): string {
  return formatCurrency(cents / 100, currency, { maximumFractionDigits: 0 })
}
export function TravelerBreakdownDialog({
  departure,
  currency,
  onClose,
}: {
  departure: { id: string; label: string } | null
  currency: string
  onClose: () => void
}) {
  const i18n = useFinanceUiI18nOrDefault()
  const t = i18n.messages.profitability
  const { data, isError, isPending } = useTravelerProfitability({
    departureId: departure?.id ?? "",
    currency,
    enabled: Boolean(departure),
  })
  const rows = data?.data?.rows ?? []
  const money = (cents: number) => formatMoneyCents(cents, currency, i18n.formatCurrency)

  return (
    <Dialog
      open={Boolean(departure)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {formatMessage(t.travelers.title, { departure: departure?.label ?? "" })}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {isError ? (
            <p className="py-6 text-center text-sm text-destructive">{t.travelers.loadFailed}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.travelers.columns.traveler}</TableHead>
                  <TableHead className="text-right">{t.travelers.columns.revenue}</TableHead>
                  <TableHead className="text-right">{t.travelers.columns.actualCost}</TableHead>
                  <TableHead className="text-right">{t.travelers.columns.plannedCost}</TableHead>
                  <TableHead className="text-right">{t.travelers.columns.profit}</TableHead>
                  <TableHead className="text-right">{t.travelers.columns.margin}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending && departure ? null : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      {t.travelers.none}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.travelerId}>
                      <TableCell className="font-medium">{row.travelerName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(row.revenueCents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(row.actualCostCents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(row.plannedCostCents)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          row.profitCents < 0 && "text-destructive",
                        )}
                      >
                        {money(row.profitCents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {marginText(row.marginPercent)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

export function KpiCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: "positive" | "negative"
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            "break-words text-2xl tabular-nums",
            accent === "positive" && "text-emerald-600 dark:text-emerald-500",
            accent === "negative" && "text-destructive",
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  )
}

export function DepartureTable({
  rows,
  currency,
  onSelect,
  onOpenDeparture,
}: {
  rows: DepartureProfitabilityRow[]
  currency: string
  onSelect?: (row: DepartureProfitabilityRow) => void
  /** Deep-link a departure row to its workspace (see the profitability page wiring). */
  onOpenDeparture?: (departureId: string) => void
}) {
  const i18n = useFinanceUiI18nOrDefault()
  const t = i18n.messages.profitability
  const money = (cents: number) => formatMoneyCents(cents, currency, i18n.formatCurrency)
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.departures.columns.departure}</TableHead>
          <TableHead>{t.departures.columns.date}</TableHead>
          <TableHead>{t.departures.columns.product}</TableHead>
          <TableHead className="text-right">{t.departures.columns.revenue}</TableHead>
          <TableHead className="text-right">{t.departures.columns.actualCost}</TableHead>
          <TableHead className="text-right">{t.departures.columns.plannedCost}</TableHead>
          <TableHead className="text-right">{t.departures.columns.profit}</TableHead>
          <TableHead className="text-right">{t.departures.columns.margin}</TableHead>
          <TableHead className="text-right">{t.departures.columns.variance}</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={10} className="text-center text-muted-foreground">
              {t.departures.none}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow
              key={`${row.departureId}:${row.currency}`}
              className={onSelect ? "cursor-pointer" : undefined}
              onClick={onSelect ? () => onSelect(row) : undefined}
            >
              <TableCell className="font-medium">{row.departureLabel ?? row.departureId}</TableCell>
              <TableCell className="text-muted-foreground">
                {row.departureDate ?? t.noDate}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {row.productName ?? t.noProduct}
              </TableCell>
              <TableCell className="text-right tabular-nums">{money(row.revenueCents)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {money(row.actualCostCents)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {money(row.plannedCostCents)}
              </TableCell>
              <TableCell
                className={cn("text-right tabular-nums", row.profitCents < 0 && "text-destructive")}
              >
                {money(row.profitCents)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {marginText(row.marginPercent)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  row.varianceCents < 0 && "text-destructive",
                )}
              >
                {money(row.varianceCents)}
              </TableCell>
              <TableCell className="text-right">
                {onOpenDeparture ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={formatMessage(t.openDeparture, {
                      departure: row.departureLabel ?? row.departureId,
                    })}
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpenDeparture(row.departureId)
                    }}
                  >
                    <ExternalLink className="size-4" />
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}

export function ProductTable({
  rows,
  currency,
  onOpenProduct,
}: {
  rows: ProductProfitabilityRow[]
  currency: string
  /** Deep-link a product row to its workspace (see the profitability page wiring). */
  onOpenProduct?: (productId: string) => void
}) {
  const i18n = useFinanceUiI18nOrDefault()
  const t = i18n.messages.profitability
  const money = (cents: number) => formatMoneyCents(cents, currency, i18n.formatCurrency)
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.products.columns.product}</TableHead>
          <TableHead className="text-right">{t.products.columns.departures}</TableHead>
          <TableHead className="text-right">{t.products.columns.revenue}</TableHead>
          <TableHead className="text-right">{t.products.columns.actualCost}</TableHead>
          <TableHead className="text-right">{t.products.columns.plannedCost}</TableHead>
          <TableHead className="text-right">{t.products.columns.profit}</TableHead>
          <TableHead className="text-right">{t.products.columns.margin}</TableHead>
          <TableHead className="text-right">{t.products.columns.variance}</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={9} className="text-center text-muted-foreground">
              {t.products.none}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow key={`${row.productId}:${row.currency}`}>
              <TableCell className="font-medium">{row.productName ?? row.productId}</TableCell>
              <TableCell className="text-right tabular-nums">{row.departureCount}</TableCell>
              <TableCell className="text-right tabular-nums">{money(row.revenueCents)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {money(row.actualCostCents)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {money(row.plannedCostCents)}
              </TableCell>
              <TableCell
                className={cn("text-right tabular-nums", row.profitCents < 0 && "text-destructive")}
              >
                {money(row.profitCents)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {marginText(row.marginPercent)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  row.varianceCents < 0 && "text-destructive",
                )}
              >
                {money(row.varianceCents)}
              </TableCell>
              <TableCell className="text-right">
                {onOpenProduct ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={formatMessage(t.openProduct, {
                      product: row.productName ?? row.productId,
                    })}
                    onClick={() => onOpenProduct(row.productId)}
                  >
                    <ExternalLink className="size-4" />
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
