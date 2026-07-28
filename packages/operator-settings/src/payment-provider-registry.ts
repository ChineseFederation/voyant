/**
 * Default `PaymentProviderRegistry` backing Settings → Payments.
 *
 * Composes the first-party catalog + the `payment_provider_config` row + the
 * request environment. It never stores or brokers processor credentials
 * directly: managed connect is delegated to the voyant-cloud control plane
 * (Phase 2); self-host deployments are read-only here and configure their
 * pinned adapter through environment variables.
 *
 * See `docs/adr/0015-payment-adapter-transports-and-managed-connect.md`.
 */

import {
  canonicalPaymentProviderId,
  defaultPaymentProviderCatalog,
  findPaymentProviderDescriptor,
  type PaymentActivationInput,
  type PaymentActivationResult,
  type PaymentConnectInput,
  type PaymentConnectionStatus,
  type PaymentConnectionSummary,
  type PaymentConnectResult,
  type PaymentProviderDescriptor,
  type PaymentProviderRegistry,
  paymentConnectionReadiness,
  validatePaymentCredentials,
} from "@voyant-travel/payments"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  clearPaymentProvider,
  getPaymentProviderConfig,
  type PaymentProviderConnectionState,
} from "./payment-provider-service.js"

export interface DefaultPaymentProviderRegistryOptions {
  db: PostgresJsDatabase
  env: Readonly<Record<string, unknown>>
  catalog?: readonly PaymentProviderDescriptor[]
  configuredBy?: string | null
}

function stringEnv(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

/** Managed deployments point at a control plane; its absence means self-host. */
function isManaged(env: Readonly<Record<string, unknown>>): boolean {
  return stringEnv(env.VOYANT_PAYMENTS_CONTROL_PLANE_URL) !== undefined
}

/**
 * Best-effort detection of a self-host, environment-pinned provider so the UI
 * can render a read-only "configured via environment" status. Returns the
 * provider id + mode, or null when nothing is pinned.
 */
function detectPinnedProvider(
  env: Readonly<Record<string, unknown>>,
): { providerId: string; mode: "sandbox" | "live" } | null {
  if (stringEnv(env.NETOPIA_MERCHANT_ID) || stringEnv(env.NETOPIA_API_KEY)) {
    const sandbox = stringEnv(env.NETOPIA_SANDBOX)
    return { providerId: "netopia", mode: sandbox === "true" ? "sandbox" : "live" }
  }
  return null
}

const disconnected: PaymentConnectionStatus = {
  activeProviderId: null,
  status: "disconnected",
  mode: null,
  activeConnectionId: null,
  connections: [],
}

/**
 * Derive the independent connections/readiness projection from an active
 * selection. The default registry tracks at most one connection (the active
 * default), so it emits a single summary; managed registries may list several.
 * Never includes credentials, connection secrets, or platform tokens.
 */
function withConnectionsProjection(
  status: PaymentConnectionStatus,
  input: {
    connectionId: string
    catalog: readonly PaymentProviderDescriptor[]
    readOnly?: boolean
  },
): PaymentConnectionStatus {
  if (!status.activeProviderId) {
    return { ...status, activeConnectionId: null, connections: [] }
  }
  const descriptor = findPaymentProviderDescriptor(status.activeProviderId, input.catalog)
  const summary: PaymentConnectionSummary = {
    providerId: status.activeProviderId,
    connectionId: input.connectionId,
    displayName: descriptor?.displayName,
    state: status.status,
    readiness: paymentConnectionReadiness(status.status),
    mode: status.mode,
    active: true,
    requirements: status.requirements,
    lastHealthAt: status.lastHealthAt,
    lastError: status.lastError,
    readOnly: input.readOnly,
  }
  return { ...status, activeConnectionId: input.connectionId, connections: [summary] }
}

export function createDefaultPaymentProviderRegistry(
  options: DefaultPaymentProviderRegistryOptions,
): PaymentProviderRegistry {
  const { db, env } = options
  const catalog = options.catalog ?? defaultPaymentProviderCatalog
  const managed = isManaged(env)

  return {
    async listProviders() {
      return catalog
    },

    async getConnection(): Promise<PaymentConnectionStatus> {
      // Self-host: the deployment pins its processor via environment variables.
      // Surface a read-only status instead of a DB-backed connection.
      if (!managed) {
        const pinned = detectPinnedProvider(env)
        if (!pinned) return { ...disconnected, readOnly: true }
        return withConnectionsProjection(
          {
            activeProviderId: pinned.providerId,
            status: "connected",
            mode: pinned.mode,
            readOnly: true,
          },
          { connectionId: "environment", catalog, readOnly: true },
        )
      }

      const row = await getPaymentProviderConfig(db)
      if (!row?.activeProviderId) return disconnected
      const activeProviderId = canonicalPaymentProviderId(row.activeProviderId)
      return withConnectionsProjection(
        {
          activeProviderId,
          status: (row.status as PaymentProviderConnectionState) ?? "disconnected",
          mode: (row.mode as PaymentConnectionStatus["mode"]) ?? null,
          lastHealthAt: row.lastHealthAt ? row.lastHealthAt.toISOString() : null,
          lastError: row.lastError ?? null,
        },
        { connectionId: row.connectionRef ?? activeProviderId, catalog },
      )
    },

    async connect(input: PaymentConnectInput): Promise<PaymentConnectResult> {
      const current = await this.getConnection()

      if (!managed) {
        return {
          ok: false,
          status: current,
          error:
            "Payment provider is configured via environment variables and cannot be changed here.",
        }
      }

      const descriptor = findPaymentProviderDescriptor(input.providerId, catalog)
      if (!descriptor) {
        return {
          ok: false,
          status: current,
          error: `Unknown payment provider "${input.providerId}".`,
        }
      }
      if (descriptor.availability !== "available") {
        return {
          ok: false,
          status: current,
          error: `${descriptor.displayName} is not yet available.`,
        }
      }
      if (descriptor.connectionMethod !== "credentials") {
        return {
          ok: false,
          status: current,
          error: `${descriptor.displayName} does not accept credential-based connections.`,
        }
      }

      const fieldErrors = validatePaymentCredentials(
        descriptor.credentialFieldSchema,
        input.credentials,
      )
      if (fieldErrors.length > 0) {
        return {
          ok: false,
          status: current,
          error: fieldErrors[0]?.message ?? "Invalid credentials.",
        }
      }

      // Managed brokering (post credentials to the control plane, KMS-store them,
      // health-check via the processor worker) lands in Phase 2. Until then the
      // connect attempt validates and reports that brokering is unavailable, and
      // never persists credentials inside the Operator boundary.
      return {
        ok: false,
        status: current,
        error: "Managed payments brokering is not yet available.",
      }
    },

    async beginOnboarding(input) {
      const current = await this.getConnection()

      if (!managed) {
        return {
          ok: false,
          status: current,
          error:
            "Payment provider is configured via environment variables and cannot be changed here.",
        }
      }

      const descriptor = findPaymentProviderDescriptor(input.providerId, catalog)
      if (!descriptor) {
        return {
          ok: false,
          status: current,
          error: `Unknown payment provider "${input.providerId}".`,
        }
      }
      if (descriptor.availability !== "available") {
        return {
          ok: false,
          status: current,
          error: `${descriptor.displayName} is not yet available.`,
        }
      }
      if (descriptor.connectionMethod !== "embedded_onboarding") {
        return {
          ok: false,
          status: current,
          error: `${descriptor.displayName} does not support embedded onboarding.`,
        }
      }

      // Hosted onboarding session issuance belongs to the managed control-plane
      // registry. The default registry has no platform credential authority and
      // therefore fails closed without returning an invented client secret.
      return {
        ok: false,
        status: current,
        error: "Managed payment onboarding is not yet available.",
      }
    },

    async activate(input: PaymentActivationInput): Promise<PaymentActivationResult> {
      const current = await this.getConnection()

      // Self-host pins its processor through the environment; there is no second
      // connection to promote and nothing here may change it.
      if (!managed) {
        return {
          ok: false,
          status: current,
          error:
            "Payment provider is configured via environment variables and cannot be changed here.",
        }
      }

      const descriptor = findPaymentProviderDescriptor(input.providerId, catalog)
      if (!descriptor) {
        return {
          ok: false,
          status: current,
          error: `Unknown payment provider "${input.providerId}".`,
        }
      }

      // Activation promotes a control-plane-brokered connection to the active
      // default. The default registry has no authority over managed connection
      // records, so it fails closed instead of pretending the switch happened.
      // The managed control-plane registry (separate platform repo) owns the
      // real readiness gate and the atomic one-active-per-org switch.
      return {
        ok: false,
        status: current,
        error: "Managed payments activation is not yet available.",
      }
    },

    async disconnect() {
      if (!managed) return
      await clearPaymentProvider(db)
    },
  }
}
