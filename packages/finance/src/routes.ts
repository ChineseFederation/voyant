import { OpenAPIHono } from "@hono/zod-openapi"
import {
  aggregateSnapshotKey,
  readThroughAggregateSnapshot,
} from "@voyant-travel/db/aggregate-snapshots"
import { parseQuery } from "@voyant-travel/hono"

import { financeBookingBillingRoutes } from "./routes-booking-billing.js"
import { financeBookingReadRoutes } from "./routes-booking-reads.js"
import { financeFxStampRoutes } from "./routes-fx-stamp.js"
import { financeInvoiceCoreRoutes } from "./routes-invoice-core.js"
import { financeInvoiceDocumentRoutes } from "./routes-invoice-documents.js"
import { financeInvoiceIssueRoutes } from "./routes-invoice-issue.js"
import { financePaymentDisputeRoutes } from "./routes-payment-disputes.js"
import { financePaymentProcessingRoutes } from "./routes-payment-processing.js"
import { financePaymentRoutes } from "./routes-payments.js"
import type { publicFinanceRoutes } from "./routes-public.js"
import { financeReferenceDataRoutes } from "./routes-reference-data.js"
import { financeRefundSettlementRoutes } from "./routes-refund-settlements.js"
import { financeReportRoutes } from "./routes-reports.js"

export { getActionLedgerRequestContext, getFinanceRouteRuntime } from "./routes-runtime.js"

import type { Env } from "./routes-shared.js"
import { financeTravelCreditRoutes } from "./routes-travel-credits.js"
import { financeService } from "./service.js"
import { financeAggregatesQuerySchema } from "./validation.js"

const DASHBOARD_AGGREGATES_CACHE_CONTROL = "private, max-age=30"

/** Server-side snapshot TTL — see readThroughAggregateSnapshot (#1629). */
const DASHBOARD_AGGREGATES_TTL_SECONDS = 60

export const financeRoutes = new OpenAPIHono<Env>()
  // Served from a read-through TTL snapshot — the finance aggregate fan-out
  // is ~11 queries, so a warm dashboard load becomes one indexed read (#1629).
  .get("/aggregates", async (c) => {
    const query = parseQuery(c, financeAggregatesQuerySchema)
    const snapshot = await readThroughAggregateSnapshot(c.get("db"), {
      key: aggregateSnapshotKey("finance", "aggregates", query),
      ttlSeconds: DASHBOARD_AGGREGATES_TTL_SECONDS,
      compute: () => financeService.getFinanceAggregates(c.get("db"), query),
    })
    c.header("Cache-Control", DASHBOARD_AGGREGATES_CACHE_CONTROL)
    c.header("Vary", "Authorization", { append: true })
    c.header("Vary", "Cookie", { append: true })
    return c.json({ data: snapshot.data })
  })
  .route("/", financePaymentProcessingRoutes)
  .route("/", financeReportRoutes)
  .route("/", financeBookingBillingRoutes)
  .route("/", financePaymentRoutes)
  .route("/", financeInvoiceIssueRoutes)
  .route("/", financeInvoiceCoreRoutes)
  .route("/", financeReferenceDataRoutes)
  .route("/", financeInvoiceDocumentRoutes)
  .route("/", financeTravelCreditRoutes)
  .route("/", financeBookingReadRoutes)
  .route("/", financePaymentDisputeRoutes)
  .route("/", financeRefundSettlementRoutes)
  .route("/", financeFxStampRoutes)

export type FinanceRoutes = typeof financeRoutes
export type PublicFinanceRoutes = typeof publicFinanceRoutes
