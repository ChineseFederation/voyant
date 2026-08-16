import type { Extension, ModuleContainer } from "@voyant-travel/core"
import { createVoyantDataClient } from "@voyant-travel/data-sdk"
import { ApiHttpError, parseJsonBody, parseQuery } from "@voyant-travel/hono"
import type { ApiExtension } from "@voyant-travel/hono/module"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Hono } from "hono"
import { Hono as HonoApp } from "hono"
import { z } from "zod"

import { resolveDocumentFxRate } from "./fx-money.js"
import {
  buildFinanceRouteRuntime,
  FINANCE_ROUTE_RUNTIME_CONTAINER_KEY,
  type FinanceRouteRuntime,
} from "./route-runtime.js"
import type { Env } from "./routes-shared.js"
import type { CaptureFxRates } from "./runtime-port.js"

export type InvoiceFxSettings = {
  baseCurrency?: string | null
  fxCommissionBps?: number | null
  fxCommissionInvoiceMention?: string | null
}

export type ResolveInvoiceFxSettings = (
  db: PostgresJsDatabase,
) => InvoiceFxSettings | null | undefined | Promise<InvoiceFxSettings | null | undefined>

export type UpdateInvoiceFxSettings = (
  db: PostgresJsDatabase,
  settings: InvoiceFxSettings,
) => InvoiceFxSettings | null | undefined | Promise<InvoiceFxSettings | null | undefined>

export type ResolveInvoiceExchangeRateInput = {
  /** Currency being invoiced, e.g. EUR. */
  baseCurrency: string
  /** Operator accounting/reporting currency, e.g. RON. */
  quoteCurrency: string
  date?: string
}

export type InvoiceExchangeRateResolution = {
  rate: number
  fxRateSetId?: string
  source?: string
  quotedAt?: string
  validUntil?: string
}

export type ResolveInvoiceExchangeRate = (
  input: ResolveInvoiceExchangeRateInput,
) =>
  | number
  | InvoiceExchangeRateResolution
  | null
  | undefined
  | Promise<number | InvoiceExchangeRateResolution | null | undefined>

export type HandleInvoiceFxResolutionError = (
  error: unknown,
  input: ResolveInvoiceExchangeRateInput,
) => void | Promise<void>

export interface InvoiceFxOptions {
  invoiceFxSettings?: InvoiceFxSettings | null
  resolveInvoiceFxSettings?: ResolveInvoiceFxSettings
  updateInvoiceFxSettings?: UpdateInvoiceFxSettings
  resolveInvoiceExchangeRate?: ResolveInvoiceExchangeRate
  resolveInvoiceExchangeRateResolver?: (
    bindings: Record<string, unknown>,
  ) => ResolveInvoiceExchangeRate | undefined
  /**
   * Persist a resolved rate so the document can be stamped with a rate-set id
   * that outlives the request. Absent → the rate is still applied, but nothing
   * records which rate it was.
   */
  captureFxRates?: CaptureFxRates
  onInvoiceFxResolutionError?: HandleInvoiceFxResolutionError
}

export interface InvoiceFxRouteOptions extends InvoiceFxOptions {}

export type InvoiceFxInvoice = {
  currency: string
  baseCurrency?: string | null
  issueDate?: string | Date | null
  /** The rate set this invoice was stamped with, when it already has one. */
  fxRateSetId?: string | null
}

export type InvoiceFxContext = {
  baseCurrency: string
  fxRateSetId?: string
  fxRate: number
  fxRateSource?: string
  fxRateQuotedAt?: string
  fxRateValidUntil?: string
  fxCommissionBps: number
  effectiveRate: number
  fxCommissionInvoiceMention?: string
}

export type ResolvedInvoiceFxSettings = {
  baseCurrency: string
  fxCommissionBps: number
  fxCommissionInvoiceMention?: string
}

export type VoyantDataFxResolverOptions = {
  baseUrl?: string
  apiKey: string
  authHeader?: string
  authScheme?: string | null
  fetch?: typeof fetch
  headers?: HeadersInit
  userAgent?: string
}

const invoiceFxSettingsPatchSchema = z.object({
  baseCurrency: z.string().min(3).max(8).nullable().optional(),
  fxCommissionBps: z.number().int().min(0).max(100_000).nullable().optional(),
  fxCommissionInvoiceMention: z.string().nullable().optional(),
})

const invoiceExchangeRateQuerySchema = z.object({
  baseCurrency: z.string().min(3).max(8),
  quoteCurrency: z.string().min(3).max(8),
  date: z.string().optional(),
})

type InvoiceFxRouteEnv = Env & {
  Variables: Env["Variables"] & {
    container?: ModuleContainer
  }
}

/**
 * Container key under which the operator-settings bridge registers persistable
 * invoice-FX settings (base currency + commission). When present, it overlays
 * the base route runtime so `PATCH /invoice-fx-settings` can actually write.
 */
export const INVOICE_FX_SETTINGS_RUNTIME_KEY = "finance.invoiceFxSettingsRuntime"

export interface InvoiceFxSettingsRuntime {
  resolveInvoiceFxSettings: ResolveInvoiceFxSettings
  updateInvoiceFxSettings: UpdateInvoiceFxSettings
}

function getInvoiceFxRuntime(
  options: InvoiceFxRouteOptions | undefined,
  bindings: Record<string, unknown>,
  container?: ModuleContainer,
) {
  const base =
    (container?.has(FINANCE_ROUTE_RUNTIME_CONTAINER_KEY)
      ? container.resolve<FinanceRouteRuntime>(FINANCE_ROUTE_RUNTIME_CONTAINER_KEY)
      : undefined) ?? buildFinanceRouteRuntime(bindings, options)
  // Overlay the operator-settings-backed resolver/updater at request time so the
  // wiring is independent of module-bootstrap ordering.
  if (container?.has(INVOICE_FX_SETTINGS_RUNTIME_KEY)) {
    const settings = container.resolve<InvoiceFxSettingsRuntime>(INVOICE_FX_SETTINGS_RUNTIME_KEY)
    return {
      ...base,
      resolveInvoiceFxSettings: settings.resolveInvoiceFxSettings,
      updateInvoiceFxSettings: settings.updateInvoiceFxSettings,
    }
  }
  return base
}

export async function resolveInvoiceFxSettingsOrDefault(
  db: PostgresJsDatabase,
  options: InvoiceFxOptions = {},
): Promise<ResolvedInvoiceFxSettings> {
  const settings = await resolveConfiguredInvoiceFxSettings(db, options)

  return {
    baseCurrency: normalizeCurrency(settings?.baseCurrency) ?? "RON",
    fxCommissionBps: normalizeBasisPoints(settings?.fxCommissionBps),
    fxCommissionInvoiceMention: normalizeOptionalText(settings?.fxCommissionInvoiceMention),
  }
}

export async function resolveInvoiceFxContext(
  db: PostgresJsDatabase,
  invoice: InvoiceFxInvoice,
  options: InvoiceFxOptions = {},
): Promise<InvoiceFxContext | null> {
  const settings = await resolveConfiguredInvoiceFxSettings(db, options)
  const baseCurrency =
    normalizeCurrency(settings?.baseCurrency) ?? normalizeCurrency(invoice.baseCurrency) ?? "RON"
  const invoiceCurrency = normalizeCurrency(invoice.currency)

  if (!baseCurrency || !invoiceCurrency || invoiceCurrency === baseCurrency) return null

  // The document the customer receives and the amount stored on the row must
  // be the same conversion, so both go through the one resolution — including
  // the rate set the invoice is already bound to (voyant#4703). Resolving the
  // printed rate separately is how an invoice ends up printing one rate and
  // reporting another.
  const resolved = await resolveDocumentFxRate(
    db,
    {
      currency: invoiceCurrency,
      baseCurrency,
      date: invoice.issueDate ?? null,
      fxRateSetId: invoice.fxRateSetId ?? null,
    },
    options,
    settings,
  )
  if (!resolved) return null

  const quotedAt = resolved.quotedAt ?? toDateString(invoice.issueDate)

  return {
    baseCurrency,
    ...(resolved.fxRateSetId ? { fxRateSetId: resolved.fxRateSetId } : {}),
    fxRate: roundRate(resolved.sourceRate),
    ...(resolved.source ? { fxRateSource: resolved.source } : {}),
    ...(quotedAt ? { fxRateQuotedAt: quotedAt } : {}),
    ...(resolved.validUntil ? { fxRateValidUntil: resolved.validUntil } : {}),
    fxCommissionBps: resolved.commissionBps,
    effectiveRate: roundRate(resolved.effectiveRate),
    ...(resolved.commissionBps > 0 && normalizeOptionalText(settings?.fxCommissionInvoiceMention)
      ? { fxCommissionInvoiceMention: normalizeOptionalText(settings?.fxCommissionInvoiceMention) }
      : {}),
  }
}

export function createVoyantDataFxExchangeRateResolver(
  options: VoyantDataFxResolverOptions,
): ResolveInvoiceExchangeRate {
  const client = createVoyantDataClient({
    apiKey: options.apiKey,
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    ...(options.authHeader ? { authHeader: options.authHeader } : {}),
    ...(options.authScheme !== undefined ? { authScheme: options.authScheme } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.headers ? { headers: options.headers } : {}),
    userAgent: options.userAgent ?? "voyant-finance",
  })

  return async ({ baseCurrency, quoteCurrency, date }) => {
    // A document is worth what it was worth on its own date, so a requested
    // date has to reach the source. Resolving it against the live pair — which
    // is what this did before voyant#4703 — silently answers "today" for an
    // invoice issued last March.
    const day = parseIsoDate(date)
    if (day) {
      const history = await client.fx.history(baseCurrency, day.year, day.month, day.day)
      const rate = history.conversionRates?.[quoteCurrency]
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null

      const source = normalizeOptionalText(history.source)
      return {
        rate,
        ...(source ? { source } : {}),
        quotedAt: day.iso,
      }
    }

    const quote = await client.fx.pair(baseCurrency, quoteCurrency)
    if (typeof quote.conversionRate !== "number" || !Number.isFinite(quote.conversionRate)) {
      return null
    }

    const source = normalizeOptionalText(quote.source)
    const quotedAt = normalizeOptionalText(quote.timeLastUpdateUtc)
    const validUntil = normalizeOptionalText(quote.timeNextUpdateUtc)

    return {
      rate: quote.conversionRate,
      ...(source ? { source } : {}),
      ...(quotedAt ? { quotedAt } : {}),
      ...(validUntil ? { validUntil } : {}),
    }
  }
}

function parseIsoDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split("-").map(Number) as [number, number, number]
  return { year, month, day, iso: value }
}

export function createInvoiceFxRoutes(options: InvoiceFxRouteOptions = {}) {
  return new HonoApp<InvoiceFxRouteEnv>()
    .get("/invoice-fx-settings", async (c) => {
      const runtime = getInvoiceFxRuntime(options, c.env, c.var.container)
      return c.json({
        data: await resolveInvoiceFxSettingsOrDefault(c.get("db"), runtime),
      })
    })
    .patch("/invoice-fx-settings", async (c) => {
      const runtime = getInvoiceFxRuntime(options, c.env, c.var.container)
      if (!runtime.updateInvoiceFxSettings) {
        throw new ApiHttpError("Invoice FX settings updates are not configured", {
          status: 501,
          code: "invoice_fx_settings_update_not_configured",
        })
      }

      const current = await resolveInvoiceFxSettingsOrDefault(c.get("db"), runtime)
      const patch = await parseJsonBody(c, invoiceFxSettingsPatchSchema)
      const next = await runtime.updateInvoiceFxSettings(c.get("db"), {
        ...current,
        ...patch,
      })

      return c.json({
        data: await resolveInvoiceFxSettingsOrDefault(c.get("db"), { invoiceFxSettings: next }),
      })
    })
    .get("/invoice-fx-rate", async (c) => {
      const runtime = getInvoiceFxRuntime(options, c.env, c.var.container)
      if (!runtime.resolveInvoiceExchangeRate) {
        throw new ApiHttpError("Invoice FX rate resolution is not configured", {
          status: 501,
          code: "invoice_fx_rate_resolution_not_configured",
        })
      }

      const query = parseQuery(c, invoiceExchangeRateQuerySchema)
      const input = {
        baseCurrency: normalizeCurrency(query.baseCurrency) ?? query.baseCurrency,
        quoteCurrency: normalizeCurrency(query.quoteCurrency) ?? query.quoteCurrency,
        date: query.date,
      }
      let rateResolution: number | InvoiceExchangeRateResolution | null | undefined
      try {
        rateResolution = await runtime.resolveInvoiceExchangeRate(input)
      } catch (error) {
        await notifyInvoiceFxResolutionError(runtime, error, input)
        throw new ApiHttpError("Invoice FX rate resolution failed", {
          status: 502,
          code: "invoice_fx_rate_resolution_failed",
        })
      }

      const resolvedRate = normalizeInvoiceExchangeRateResolution(rateResolution)
      if (!resolvedRate) {
        throw new ApiHttpError("Invoice FX rate was not found", {
          status: 404,
          code: "invoice_fx_rate_not_found",
        })
      }

      const settings = await resolveInvoiceFxSettingsOrDefault(c.get("db"), runtime)
      const fxCommissionBps = settings.fxCommissionBps
      const effectiveRate = roundRate(resolvedRate.rate * (1 + fxCommissionBps / 10_000))

      return c.json({
        data: {
          ...input,
          rate: roundRate(resolvedRate.rate),
          ...(resolvedRate.fxRateSetId ? { fxRateSetId: resolvedRate.fxRateSetId } : {}),
          ...(resolvedRate.source ? { source: resolvedRate.source } : {}),
          ...(resolvedRate.quotedAt ? { quotedAt: resolvedRate.quotedAt } : {}),
          ...(resolvedRate.validUntil ? { validUntil: resolvedRate.validUntil } : {}),
          fxCommissionBps,
          effectiveRate,
          ...(fxCommissionBps > 0 && settings.fxCommissionInvoiceMention
            ? { fxCommissionInvoiceMention: settings.fxCommissionInvoiceMention }
            : {}),
        },
      })
    })
}

export function mountInvoiceFxRoutes(hono: Hono, options: InvoiceFxRouteOptions = {}): Hono {
  hono.route("/v1/admin/finance", createInvoiceFxRoutes(options))
  return hono
}

export function createInvoiceFxApiExtension(options: InvoiceFxRouteOptions = {}): ApiExtension {
  const extension: Extension = {
    name: "finance.invoice-fx",
    module: "finance",
  }

  return {
    extension,
    adminRoutes: createInvoiceFxRoutes(options),
  }
}

async function resolveConfiguredInvoiceFxSettings(
  db: PostgresJsDatabase,
  options: InvoiceFxOptions,
) {
  return options.invoiceFxSettings !== undefined
    ? options.invoiceFxSettings
    : ((await options.resolveInvoiceFxSettings?.(db)) ?? null)
}

function normalizeCurrency(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase()
  return normalized ? normalized : null
}

async function notifyInvoiceFxResolutionError(
  options: InvoiceFxOptions,
  error: unknown,
  input: ResolveInvoiceExchangeRateInput,
) {
  try {
    await options.onInvoiceFxResolutionError?.(error, input)
  } catch {
    // FX enrichment is optional; a reporting hook must not fail invoice issuance.
  }
}

function normalizeBasisPoints(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

function normalizeInvoiceExchangeRateResolution(
  resolution: number | InvoiceExchangeRateResolution | null | undefined,
): InvoiceExchangeRateResolution | null {
  if (typeof resolution === "number") {
    return Number.isFinite(resolution) && resolution > 0 ? { rate: resolution } : null
  }
  if (!resolution || typeof resolution !== "object") return null
  if (typeof resolution.rate !== "number" || !Number.isFinite(resolution.rate)) return null
  if (resolution.rate <= 0) return null

  const source = normalizeOptionalText(resolution.source)
  const fxRateSetId = normalizeOptionalText(resolution.fxRateSetId)
  const quotedAt = normalizeOptionalText(resolution.quotedAt)
  const validUntil = normalizeOptionalText(resolution.validUntil)

  return {
    rate: resolution.rate,
    ...(fxRateSetId ? { fxRateSetId } : {}),
    ...(source ? { source } : {}),
    ...(quotedAt ? { quotedAt } : {}),
    ...(validUntil ? { validUntil } : {}),
  }
}

function normalizeOptionalText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

function toDateString(value: string | Date | null | undefined) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function roundRate(value: number) {
  return Number(value.toFixed(8))
}
