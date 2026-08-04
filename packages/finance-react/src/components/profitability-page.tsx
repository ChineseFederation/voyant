// agent-quality: file-size exception -- owner: finance-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
"use client"

import { formatMessage } from "@voyant-travel/i18n"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@voyant-travel/ui/components/chart"
import { DatePicker } from "@voyant-travel/ui/components/date-picker"
import { cn } from "@voyant-travel/ui/lib/utils"
import { Download, Share2 } from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts"
import { useFinanceUiI18nOrDefault } from "../i18n/index.js"
import { useDepartureProfitability, useProductProfitability } from "../index.js"
import { AccountantShareDialog } from "./accountant-share-dialog.js"
import { AsyncCombobox, localOptionSearch } from "./async-combobox.js"
import {
  DepartureTable,
  KpiCard,
  ProductTable,
  TravelerBreakdownDialog,
} from "./profitability-page/sections.js"

const CHART_DEPARTURE_LIMIT = 12
const PIE_COLORS = [
  "hsl(221 83% 53%)",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(0 72% 51%)",
  "hsl(199 89% 48%)",
  "hsl(280 65% 60%)",
  "hsl(160 60% 45%)",
  "hsl(28 80% 52%)",
]

type CurrencyFormatOptions = Omit<Intl.NumberFormatOptions, "currency" | "style">

export interface ProfitabilityExportFilters {
  from?: string
  to?: string
}

export interface ProfitabilityPageProps {
  className?: string
  /** Wire to download the departure CSV for the active date range (accountant sharing). */
  onExportDepartures?: (filters: ProfitabilityExportFilters) => void
  /** Wire to download the product CSV for the active date range. */
  onExportProducts?: (filters: ProfitabilityExportFilters) => void
}

function marginText(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}%`
}

function formatMoneyCents(
  cents: number,
  currency: string,
  formatCurrency: (value: number, currency: string, options?: CurrencyFormatOptions) => string,
): string {
  if (!currency) return "—"
  return formatCurrency(cents / 100, currency)
}

function chartTooltipLabel(name: unknown, config: ChartConfig): ReactNode {
  const key = String(name)
  return config[key]?.label ?? key
}

function ChartTooltipAmountRow({
  color,
  label,
  value,
}: {
  color: string | undefined
  label: ReactNode
  value: string
}) {
  return (
    <>
      <div
        className="size-2.5 shrink-0 rounded-[2px] border"
        style={{ backgroundColor: color, borderColor: color }}
      />
      <div className="flex flex-1 items-center justify-between gap-4 leading-none">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium text-foreground tabular-nums">{value}</span>
      </div>
    </>
  )
}

export function ProfitabilityPage({
  className,
  onExportDepartures,
  onExportProducts,
}: ProfitabilityPageProps = {}) {
  const i18n = useFinanceUiI18nOrDefault()
  const t = i18n.messages.profitability

  const [from, setFrom] = useState<string>("")
  const [to, setTo] = useState<string>("")
  const [currency, setCurrency] = useState<string>("")
  // Consolidated view = the accounting-base rollup (snapshotted FX). Default on;
  // the base currency itself is fixed by the operator, so there is no picker.
  const [consolidate, setConsolidate] = useState(true)
  const [travelerDeparture, setTravelerDeparture] = useState<{ id: string; label: string } | null>(
    null,
  )
  const [shareOpen, setShareOpen] = useState(false)
  const [productId, setProductId] = useState<string>("")
  const [departureId, setDepartureId] = useState<string>("")

  const filters = {
    from: from || undefined,
    to: to || undefined,
  }
  const departures = useDepartureProfitability(filters)
  const products = useProductProfitability(filters)

  const departureReport = departures.data?.data
  const productReport = products.data?.data
  const isError = departures.isError || products.isError

  // The accounting base currency the server snapshots/rolls up into.
  const baseCurrencyCode = departureReport?.base?.currency ?? productReport?.base?.currency ?? ""
  // Consolidated rollup view is active when toggled on and the server returned a
  // `base` block (always does now, but guard for loading/empty states).
  const baseMode = consolidate && Boolean(departureReport?.base)

  // Currencies present across per-currency rows; default to the first.
  const currencies = useMemo(() => {
    const set = new Set<string>()
    for (const row of departureReport?.rows ?? []) set.add(row.currency)
    for (const row of productReport?.rows ?? []) set.add(row.currency)
    return [...set].sort()
  }, [departureReport, productReport])

  const activeCurrency = baseMode
    ? (departureReport?.base?.currency ?? baseCurrencyCode)
    : currency && currencies.includes(currency)
      ? currency
      : (currencies[0] ?? "")

  const currencyDepartureRows = useMemo(
    () =>
      baseMode
        ? (departureReport?.base?.rows ?? [])
        : (departureReport?.rows ?? []).filter((r) => r.currency === activeCurrency),
    [departureReport, baseMode, activeCurrency],
  )
  const currencyProductRows = useMemo(
    () =>
      baseMode
        ? (productReport?.base?.rows ?? [])
        : (productReport?.rows ?? []).filter((r) => r.currency === activeCurrency),
    [productReport, baseMode, activeCurrency],
  )

  // Product/departure filters (client-side over the loaded report).
  const productOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of currencyDepartureRows) {
      if (r.productId) map.set(r.productId, r.productName ?? r.productId)
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [currencyDepartureRows])
  const departureOptions = useMemo(
    () =>
      currencyDepartureRows
        .filter((r) => !productId || r.productId === productId)
        .map((r) => ({ id: r.departureId, label: r.departureLabel ?? r.departureId })),
    [currencyDepartureRows, productId],
  )

  const departureRows = useMemo(
    () =>
      currencyDepartureRows.filter(
        (r) =>
          (!productId || r.productId === productId) &&
          (!departureId || r.departureId === departureId),
      ),
    [currencyDepartureRows, productId, departureId],
  )
  const productRows = useMemo(
    () => currencyProductRows.filter((r) => !productId || r.productId === productId),
    [currencyProductRows, productId],
  )

  const unconvertibleCurrencies = baseMode
    ? (departureReport?.base?.unconvertibleCurrencies ?? [])
    : []

  const totals = useMemo(() => {
    let revenue = 0
    let actual = 0
    let planned = 0
    for (const r of departureRows) {
      revenue += r.revenueCents
      actual += r.actualCostCents
      planned += r.plannedCostCents
    }
    const profit = revenue - actual
    return {
      revenue,
      actual,
      planned,
      profit,
      variance: planned - actual,
      margin: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null,
    }
  }, [departureRows])

  const unattributed = useMemo(() => {
    if (baseMode) return departureReport?.base?.unattributedCents ?? 0
    return (
      (departureReport?.unattributed ?? []).find((u) => u.currency === activeCurrency)
        ?.amountCents ?? 0
    )
  }, [departureReport, baseMode, activeCurrency])

  // Supplier cost nobody has allocated yet — shown next to, never merged into,
  // the deliberately-unattributed figure above.
  const unallocated = useMemo(() => {
    if (baseMode) return departureReport?.base?.unallocatedCents ?? 0
    return (
      (departureReport?.unallocated ?? []).find((u) => u.currency === activeCurrency)
        ?.amountCents ?? 0
    )
  }, [departureReport, baseMode, activeCurrency])

  const chartData = useMemo(
    () =>
      [...departureRows]
        .sort((a, b) => b.revenueCents - a.revenueCents)
        .slice(0, CHART_DEPARTURE_LIMIT)
        .map((r) => ({
          name: r.departureLabel ?? r.departureId,
          revenue: r.revenueCents / 100,
          actualCost: r.actualCostCents / 100,
          profit: r.profitCents / 100,
        })),
    [departureRows],
  )

  const serviceTypeData = useMemo(
    () =>
      (baseMode
        ? (departureReport?.base?.costByServiceType ?? [])
        : (departureReport?.costByServiceType ?? []).filter((c) => c.currency === activeCurrency)
      ).map((c, index) => ({
        serviceType: c.serviceType,
        label:
          t.serviceTypeLabels[c.serviceType as keyof typeof t.serviceTypeLabels] ?? c.serviceType,
        amount: c.amountCents / 100,
        fill: PIE_COLORS[index % PIE_COLORS.length],
      })),
    [departureReport, baseMode, activeCurrency, t.serviceTypeLabels],
  )

  const barConfig: ChartConfig = {
    revenue: { label: t.charts.revenue, color: "hsl(221 83% 53%)" }, // i18n-literal-ok (chart color)
    actualCost: { label: t.charts.actualCost, color: "hsl(0 72% 51%)" }, // i18n-literal-ok (chart color)
    profit: { label: t.charts.profit, color: "hsl(142 71% 45%)" }, // i18n-literal-ok (chart color)
  }
  const pieConfig: ChartConfig = Object.fromEntries(
    serviceTypeData.map((d) => [d.serviceType, { label: d.label, color: d.fill }]),
  )

  const money = (cents: number) => formatMoneyCents(cents, activeCurrency, i18n.formatCurrency)
  const moneyAmount = (amount: number) =>
    activeCurrency ? i18n.formatCurrency(amount, activeCurrency) : String(amount)
  const compactMoneyAmount = (amount: number) =>
    activeCurrency
      ? i18n.formatCurrency(amount, activeCurrency, {
          maximumFractionDigits: 1,
          notation: "compact",
        })
      : String(amount)

  return (
    <div className={cn("flex min-w-0 flex-col gap-6 overflow-hidden", className)}>
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.description}</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-end justify-end gap-3">
          <Button variant="outline" onClick={() => setShareOpen(true)}>
            <Share2 className="size-4" />
            {t.share.button}
          </Button>
          <div className="flex flex-col gap-2">
            <Label>{t.filters.from}</Label>
            <DatePicker value={from || null} onChange={(v) => setFrom(v ?? "")} className="w-40" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t.filters.to}</Label>
            <DatePicker value={to || null} onChange={(v) => setTo(v ?? "")} className="w-40" />
          </div>
          {!baseMode ? (
            <div className="flex flex-col gap-2">
              <Label>{t.filters.currency}</Label>
              <Select
                value={activeCurrency}
                onValueChange={(v) => setCurrency(v ?? "")}
                disabled={!currencies.length}
              >
                <SelectTrigger className="w-32 max-w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="profitability-consolidate">{t.filters.baseCurrency}</Label>
            <div className="flex h-9 items-center gap-2">
              <Checkbox
                id="profitability-consolidate"
                checked={consolidate}
                onCheckedChange={(v) => setConsolidate(v === true)}
              />
              <Label htmlFor="profitability-consolidate" className="font-normal">
                {baseCurrencyCode || t.filters.baseCurrency}
              </Label>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t.filters.product}</Label>
            <AsyncCombobox
              className="w-56 max-w-full"
              placeholder={t.filters.allProducts}
              value={productId || null}
              onChange={(v) => {
                setProductId(v ?? "")
                setDepartureId("")
              }}
              search={localOptionSearch(
                productOptions.map((p) => ({ value: p.id, label: p.name })),
              )}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t.filters.departure}</Label>
            <AsyncCombobox
              className="w-56 max-w-full"
              placeholder={t.filters.allDepartures}
              value={departureId || null}
              onChange={(v) => setDepartureId(v ?? "")}
              search={localOptionSearch(
                departureOptions.map((d) => ({ value: d.id, label: d.label })),
              )}
            />
          </div>
        </div>
      </div>

      {baseMode && unconvertibleCurrencies.length ? (
        <p className="text-sm text-amber-600 dark:text-amber-500">
          {formatMessage(t.unconvertibleNote, { currencies: unconvertibleCurrencies.join(", ") })}
        </p>
      ) : null}

      {isError ? (
        <Card>
          <CardContent className="py-10 text-center text-destructive">{t.loadFailed}</CardContent>
        </Card>
      ) : !currencies.length ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">{t.empty}</CardContent>
        </Card>
      ) : (
        <>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label={t.kpis.revenue} value={money(totals.revenue)} />
            <KpiCard label={t.kpis.actualCost} value={money(totals.actual)} />
            <KpiCard
              label={t.kpis.profit}
              value={money(totals.profit)}
              accent={totals.profit >= 0 ? "positive" : "negative"}
            />
            <KpiCard label={t.kpis.margin} value={marginText(totals.margin)} />
            <KpiCard label={t.kpis.plannedCost} value={money(totals.planned)} />
            <KpiCard
              label={t.kpis.variance}
              value={money(totals.variance)}
              accent={totals.variance >= 0 ? "positive" : "negative"}
            />
            <KpiCard label={t.kpis.unattributed} value={money(unattributed)} />
            <KpiCard
              label={t.kpis.unallocated}
              value={money(unallocated)}
              accent={unallocated > 0 ? "negative" : undefined}
            />
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="text-base">{t.charts.departurePnl}</CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length ? (
                  <ChartContainer config={barConfig} className="h-[300px] w-full">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={(value: string) =>
                          value.length > 14 ? `${value.slice(0, 13)}…` : value
                        }
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={(value: number) => compactMoneyAmount(value)}
                        width={72}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value, name, item) => (
                              <ChartTooltipAmountRow
                                color={item.color}
                                label={chartTooltipLabel(name, barConfig)}
                                value={moneyAmount(Number(value))}
                              />
                            )}
                          />
                        }
                      />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar dataKey="revenue" fill="var(--color-revenue)" radius={2} />
                      <Bar dataKey="actualCost" fill="var(--color-actualCost)" radius={2} />
                      <Bar dataKey="profit" fill="var(--color-profit)" radius={2} />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    {t.departures.none}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="text-base">{t.charts.costByServiceType}</CardTitle>
              </CardHeader>
              <CardContent>
                {serviceTypeData.length ? (
                  <ChartContainer config={pieConfig} className="mx-auto h-[300px] w-full">
                    <PieChart>
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            nameKey="label"
                            hideLabel
                            formatter={(value, name, item) => (
                              <ChartTooltipAmountRow
                                color={item.payload?.fill ?? item.color}
                                label={name}
                                value={moneyAmount(Number(value))}
                              />
                            )}
                          />
                        }
                      />
                      <Pie
                        data={serviceTypeData}
                        dataKey="amount"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                      >
                        {serviceTypeData.map((entry) => (
                          <Cell key={entry.serviceType} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartLegend content={<ChartLegendContent nameKey="label" />} />
                    </PieChart>
                  </ChartContainer>
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">{t.empty}</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="min-w-0">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t.departures.title}</CardTitle>
              {onExportDepartures ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onExportDepartures({ from: from || undefined, to: to || undefined })
                  }
                >
                  <Download className="size-4" />
                  {t.exportCsv}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="min-w-0">
              <DepartureTable
                rows={departureRows}
                currency={activeCurrency}
                onSelect={
                  baseMode
                    ? undefined
                    : (row) =>
                        setTravelerDeparture({
                          id: row.departureId,
                          label: row.departureLabel ?? row.departureId,
                        })
                }
              />
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t.products.title}</CardTitle>
              {onExportProducts ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onExportProducts({ from: from || undefined, to: to || undefined })}
                >
                  <Download className="size-4" />
                  {t.exportCsv}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="min-w-0">
              <ProductTable rows={productRows} currency={activeCurrency} />
            </CardContent>
          </Card>
        </>
      )}

      <TravelerBreakdownDialog
        departure={travelerDeparture}
        currency={activeCurrency}
        onClose={() => setTravelerDeparture(null)}
      />
      <AccountantShareDialog open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  )
}
