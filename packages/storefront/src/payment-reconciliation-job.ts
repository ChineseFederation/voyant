import type { VoyantGraphRuntimeFactoryContext } from "@voyant-travel/core/project"
import { refreshPaymentAdapterStatus } from "@voyant-travel/finance"
import { paymentSessions } from "@voyant-travel/finance/schema"
import type { PaymentAdapter } from "@voyant-travel/payments"
import { asc, inArray } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  type PaymentReconciliationJobRuntime,
  storefrontPaymentReconciliationJobRuntimePort,
} from "./runtime-port.js"

const POLLABLE_STATES = ["requires_redirect", "processing", "authorized"] as const
const DEFAULT_BATCH_SIZE = 100

export type { PaymentReconciliationJobRuntime } from "./runtime-port.js"

export interface PaymentReconciliationResult {
  examined: number
  refreshed: number
  failed: number
}

type ReconciliationDependencies = {
  listDueSessionIds(db: PostgresJsDatabase, limit: number): Promise<readonly string[]>
  refresh(
    adapter: PaymentAdapter,
    db: PostgresJsDatabase,
    paymentSessionId: string,
    env: Readonly<Record<string, unknown>>,
  ): Promise<unknown>
}

const dependencies: ReconciliationDependencies = {
  async listDueSessionIds(db, limit) {
    const rows = await db
      .select({ id: paymentSessions.id })
      .from(paymentSessions)
      .where(inArray(paymentSessions.status, POLLABLE_STATES))
      .orderBy(asc(paymentSessions.updatedAt))
      .limit(limit)
    return rows.map((row) => row.id)
  },
  refresh(adapter, db, paymentSessionId, env) {
    return refreshPaymentAdapterStatus(adapter, db, paymentSessionId, {
      context: { env },
    })
  },
}

/**
 * Reconcile unsettled Finance sessions without relying on a shopper's browser
 * return. The Finance refresh lease makes overlapping/retried schedule
 * invocations idempotent, while the managed adapter authenticates status reads
 * to the platform as this deployment.
 */
export async function reconcilePaymentAdapterStatuses(
  runtime: PaymentReconciliationJobRuntime,
  bindings: unknown,
  deps: ReconciliationDependencies = dependencies,
): Promise<PaymentReconciliationResult> {
  const [db, adapter] = await Promise.all([runtime.resolveDb(bindings), runtime.resolveAdapter()])
  if (!adapter?.capabilities.status || typeof adapter.status !== "function") {
    return { examined: 0, refreshed: 0, failed: 0 }
  }

  const sessionIds = await deps.listDueSessionIds(db, DEFAULT_BATCH_SIZE)
  const env = runtime.resolveEnv(bindings)
  let refreshed = 0
  let failed = 0
  for (const paymentSessionId of sessionIds) {
    try {
      const result = await deps.refresh(adapter, db, paymentSessionId, env)
      if (result) refreshed += 1
    } catch (error) {
      failed += 1
      runtime.warn?.(
        `[payment-reconciliation] failed to refresh session ${paymentSessionId}`,
        error,
      )
    }
  }
  return { examined: sessionIds.length, refreshed, failed }
}

export async function runPaymentAdapterReconciliationJob(
  context: VoyantGraphRuntimeFactoryContext,
): Promise<void> {
  const runtime = await context.getPort(storefrontPaymentReconciliationJobRuntimePort)
  await reconcilePaymentAdapterStatuses(runtime, context.bindings)
}
