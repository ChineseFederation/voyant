/**
 * The `@voyant-travel/operator-settings` ApiModule — the standard settings
 * surface mounted by `@voyant-travel/framework`'s composition. Routes live at
 * stable absolute paths, so the module uses `lazyRoutes` (explicit matchers +
 * a lazily-imported route bundle, cached per isolate).
 *
 * The loaded bundle is an `OpenAPIHono` (carrying the `defaultHook` that shapes
 * request-validation failures) so its `createRoute(...).openapi(...)` operations
 * are visible to the build-time `mergeLazyOpenApiPaths` replay (voyant#2114).
 *
 * `createOperatorSettingsVoyantRuntime` is the graph-runtime-factory the module
 * declares as its top-level runtime: it resolves the optional managed payment
 * registry port and, when a deployment provides it, registers the resolver into
 * the module container so the Settings → Payments routes broker to the control
 * plane (self-host uses the default registry). See voyant
 * `docs/adr/0015-payment-adapter-transports-and-managed-connect.md`.
 */

import { OpenAPIHono } from "@hono/zod-openapi"
import type { Module } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import { openApiValidationHook } from "@voyant-travel/hono"
import type { ApiModule } from "@voyant-travel/hono/module"
import {
  type PaymentProviderRegistryResolver,
  paymentProviderRegistryRuntimePort,
} from "@voyant-travel/payments/runtime-port"
import type { StorageProviderResolver } from "@voyant-travel/storage"
import { storageObjectRuntimePort } from "@voyant-travel/storage/runtime-port"

/** Stable absolute matchers for the operator-settings admin + public routes. */
export const OPERATOR_SETTINGS_ROUTE_PATHS = [
  "/v1/admin/settings/*",
  "/v1/public/operator-profile",
  "/v1/public/settings/operator",
  "/v1/public/operator-branding/*",
] as const

export interface OperatorSettingsApiModuleOptions {
  /**
   * Deployment-provided resolver that brokers Settings → Payments to a managed
   * control plane. Registered into the module container at bootstrap; absent it,
   * the payment routes use the default self-host registry.
   */
  paymentProviderRegistryResolver?: PaymentProviderRegistryResolver
  /** Selected object-storage resolver used to derive and serve public branding assets. */
  storage?: StorageProviderResolver
}

export function createOperatorSettingsApiModule(
  options: OperatorSettingsApiModuleOptions = {},
): ApiModule {
  const module: Module = { name: "operator-settings" }
  const resolver = options.paymentProviderRegistryResolver
  if (resolver) {
    module.bootstrap = ({ container }) => {
      container.register(paymentProviderRegistryRuntimePort.id, resolver)
    }
  }

  return {
    module,
    lazyRoutes: {
      paths: OPERATOR_SETTINGS_ROUTE_PATHS,
      load: () =>
        import("./routes.js").then((m) => {
          const app = new OpenAPIHono({ defaultHook: openApiValidationHook })
          m.mountOperatorSettingsRoutes(app, {
            resolveBrandingStorage: () => options.storage?.resolve("media") ?? null,
          })
          return app
        }),
    },
  }
}

/**
 * Top-level graph runtime factory. Resolves the optional managed payment
 * registry port; when a deployment provides it, the returned module registers
 * the resolver at bootstrap so the payment routes broker to the control plane.
 */
export const createOperatorSettingsVoyantRuntime = defineGraphRuntimeFactory(
  async ({ getPort, hasPort }) =>
    createOperatorSettingsApiModule({
      paymentProviderRegistryResolver: hasPort(paymentProviderRegistryRuntimePort)
        ? await getPort(paymentProviderRegistryRuntimePort)
        : undefined,
      storage: hasPort(storageObjectRuntimePort)
        ? await getPort(storageObjectRuntimePort)
        : undefined,
    }),
)
