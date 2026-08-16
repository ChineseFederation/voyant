"use client"

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react"
import { z } from "zod"
import type { VoyantFetcher } from "../customer-portal/client.js"

export const customerAuthMethodsSchema = z.object({
  emailCode: z.boolean(),
  emailPassword: z.boolean(),
  google: z.boolean(),
  facebook: z.boolean(),
  apple: z.boolean(),
})

export const customerAuthConfigSchema = z.object({
  methods: customerAuthMethodsSchema,
})

export type CustomerAuthMethods = z.infer<typeof customerAuthMethodsSchema>
export type CustomerAuthConfig = z.infer<typeof customerAuthConfigSchema>

interface CustomerAuthConfigContextValue {
  config: CustomerAuthConfig | null
  error: Error | null
  isPending: boolean
}

const CustomerAuthConfigContext = createContext<CustomerAuthConfigContextValue | null>(null)

function joinUrl(baseUrl: string, path: string): string {
  const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  return `${trimmedBase}${path}`
}

export async function fetchCustomerAuthConfig(
  baseUrl: string,
  fetcher: VoyantFetcher,
): Promise<CustomerAuthConfig> {
  const response = await fetcher(joinUrl(baseUrl, "/auth/customer/config"), { method: "GET" })
  if (!response.ok) {
    throw new Error(`Could not load customer authentication methods (${response.status}).`)
  }
  return customerAuthConfigSchema.parse(await response.json())
}

export function CustomerAuthConfigProvider({
  baseUrl,
  children,
  fetcher,
}: {
  baseUrl: string
  children: ReactNode
  fetcher: VoyantFetcher
}): React.ReactElement {
  const [config, setConfig] = useState<CustomerAuthConfig | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let active = true
    setConfig(null)
    setError(null)
    void fetchCustomerAuthConfig(baseUrl, fetcher).then(
      (nextConfig) => {
        if (active) setConfig(nextConfig)
      },
      (cause: unknown) => {
        if (!active) return
        setError(
          cause instanceof Error ? cause : new Error("Could not load customer authentication."),
        )
      },
    )
    return () => {
      active = false
    }
  }, [baseUrl, fetcher])

  const value = useMemo<CustomerAuthConfigContextValue>(
    () => ({ config, error, isPending: !config && !error }),
    [config, error],
  )

  return (
    <CustomerAuthConfigContext.Provider value={value}>
      {children}
    </CustomerAuthConfigContext.Provider>
  )
}

export function useCustomerAuthConfig(): CustomerAuthConfigContextValue {
  const context = useContext(CustomerAuthConfigContext)
  if (!context) {
    throw new Error("useCustomerAuthConfig must be used inside CustomerAuthConfigProvider.")
  }
  return context
}
