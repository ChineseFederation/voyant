import { createKmsProviderFromEnv, type KmsProvider } from "@voyant-travel/utils"

export interface CustomerPortalRouteRuntime {
  getOptionalKmsProvider(): KmsProvider | null
}

export interface PublicCustomerPortalRouteRuntime extends CustomerPortalRouteRuntime {
  resolveDocumentDownloadUrl?: (storageKey: string) => Promise<string | null> | string | null
}

export const CUSTOMER_PORTAL_ROUTE_RUNTIME_CONTAINER_KEY = "providers.customerPortal.public.runtime"

export interface PublicCustomerPortalRuntimeOptions {
  resolveDocumentDownloadUrl?: (
    bindings: unknown,
    storageKey: string,
  ) => Promise<string | null> | string | null
}

type RuntimeBindings = Record<string, unknown>

function buildRuntimeEnv(bindings: RuntimeBindings): Record<string, string | undefined> {
  const processEnv =
    (
      globalThis as typeof globalThis & {
        process?: { env?: Record<string, string | undefined> }
      }
    ).process?.env ?? {}

  return {
    ...processEnv,
    ...(bindings ?? {}),
  } as Record<string, string | undefined>
}

export function buildPublicCustomerPortalRouteRuntime(
  bindings: RuntimeBindings,
  options: PublicCustomerPortalRuntimeOptions = {},
): PublicCustomerPortalRouteRuntime {
  const runtimeEnv = buildRuntimeEnv(bindings)

  const resolveDocumentDownloadUrl = options.resolveDocumentDownloadUrl
    ? (storageKey: string) => options.resolveDocumentDownloadUrl?.(bindings, storageKey) ?? null
    : undefined

  return {
    getOptionalKmsProvider() {
      try {
        return createKmsProviderFromEnv(runtimeEnv)
      } catch {
        return null
      }
    },
    resolveDocumentDownloadUrl,
  }
}

export const buildCustomerPortalRouteRuntime = buildPublicCustomerPortalRouteRuntime
