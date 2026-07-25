/**
 * Payment provider selection/connection data access.
 *
 * Readers/writers over the single-row `payment_provider_config` table. Holds no
 * processor credentials — only which provider is active and its connection
 * status. The registry (`./payment-provider-registry`) composes these with the
 * catalog + environment to back Settings → Payments.
 */

import { desc, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { paymentProviderConfig } from "./schema.js"

export type PaymentProviderConnectionState =
  | "pending_requirements"
  | "pending_verification"
  | "connected"
  | "restricted"
  | "error"
  | "disconnected"

/** Patch applied when a provider is activated (or its status changes). */
export interface PaymentProviderConfigPatch {
  activeProviderId?: string | null
  status?: PaymentProviderConnectionState
  mode?: string | null
  connectionRef?: string | null
  lastHealthAt?: Date | null
  lastError?: string | null
  configuredBy?: string | null
}

export async function getPaymentProviderConfig(db: PostgresJsDatabase) {
  const [row] = await db
    .select()
    .from(paymentProviderConfig)
    .orderBy(desc(paymentProviderConfig.createdAt))
    .limit(1)
  return row ?? null
}

/** Upsert the single config row with the supplied patch. */
export async function upsertPaymentProviderConfig(
  db: PostgresJsDatabase,
  patch: PaymentProviderConfigPatch,
) {
  const existing = await getPaymentProviderConfig(db)
  if (!existing) {
    const [created] = await db.insert(paymentProviderConfig).values(patch).returning()
    return created ?? null
  }
  const [updated] = await db
    .update(paymentProviderConfig)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(paymentProviderConfig.id, existing.id))
    .returning()
  return updated ?? null
}

/** Record a provider as the active, connected one (one active per org). */
export async function setActivePaymentProvider(
  db: PostgresJsDatabase,
  input: {
    providerId: string
    mode: string
    connectionRef: string | null
    configuredBy?: string | null
  },
) {
  return upsertPaymentProviderConfig(db, {
    activeProviderId: input.providerId,
    status: "connected",
    mode: input.mode,
    connectionRef: input.connectionRef,
    lastHealthAt: new Date(),
    lastError: null,
    configuredBy: input.configuredBy ?? null,
  })
}

/** Record a connection failure against the current selection. */
export async function updatePaymentConnectionStatus(
  db: PostgresJsDatabase,
  input: { status: PaymentProviderConnectionState; lastError?: string | null },
) {
  return upsertPaymentProviderConfig(db, {
    status: input.status,
    lastError: input.lastError ?? null,
  })
}

/** Clear the active provider (disconnect). */
export async function clearPaymentProvider(db: PostgresJsDatabase) {
  return upsertPaymentProviderConfig(db, {
    activeProviderId: null,
    status: "disconnected",
    mode: null,
    connectionRef: null,
    lastError: null,
  })
}
