import { createContext, type ReactNode, useContext, useMemo } from "react"
import { type AdminClient, type AdminClientConfig, createAdminClient } from "./client/index.js"

const AdminClientContext = createContext<AdminClient | null>(null)

export interface AdminClientProviderProps {
  /** A pre-built client; takes precedence over `config`. */
  client?: AdminClient
  /** Config used to build a client when `client` is not supplied. */
  config?: AdminClientConfig
  children: ReactNode
}

/**
 * Supplies an {@link AdminClient} to the admin-react hooks. Pass either a ready
 * `client` or a `config` to build one (memoized for the provider's lifetime).
 *
 * Compose it under a `@tanstack/react-query` `QueryClientProvider`:
 *
 * ```tsx
 * <QueryClientProvider client={queryClient}>
 *   <AdminClientProvider config={{ baseUrl, auth }}>
 *     <App />
 *   </AdminClientProvider>
 * </QueryClientProvider>
 * ```
 */
export function AdminClientProvider({ client, config, children }: AdminClientProviderProps) {
  const value = useMemo(() => {
    if (client) return client
    if (!config) {
      throw new Error("AdminClientProvider: pass either `client` or `config`")
    }
    return createAdminClient(config)
  }, [client, config])

  return <AdminClientContext.Provider value={value}>{children}</AdminClientContext.Provider>
}

/** Read the {@link AdminClient} from context. Throws outside the provider. */
export function useAdminClient(): AdminClient {
  const client = useContext(AdminClientContext)
  if (!client) {
    throw new Error("useAdminClient must be used within <AdminClientProvider>")
  }
  return client
}
