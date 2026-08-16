"use client"

import { createAuthBasePathFetcher } from "@voyant-travel/auth-react/client"
import { VoyantAuthProvider } from "@voyant-travel/auth-react/provider"
import type { ReactNode } from "react"
import type { VoyantFetcher } from "../customer-portal/client.js"
import { VoyantCustomerPortalProvider } from "../customer-portal/provider.js"
import { BuyerAccountProvider } from "./buyer-account-provider.js"
import { CustomerAuthConfigProvider } from "./customer-auth-config.js"

export function rewriteCustomerAccountAuthUrl(url: string): string {
  let target = url
  if (target.includes("/auth/customer/")) {
    return target
  }
  if (target.includes("/auth/")) {
    target = target.replace("/auth/", "/auth/customer/")
  }
  if (target.endsWith("/auth/status")) {
    target = target.replace("/auth/status", "/auth/customer/status")
  }
  return target
}

export function createCustomerAccountFetcher(
  fetcher: VoyantFetcher,
  baseUrl?: string,
): VoyantFetcher {
  if (baseUrl) {
    return createAuthBasePathFetcher(fetcher, {
      baseUrl,
      authBasePath: "/auth/customer",
    })
  }
  return (url, init) => fetcher(rewriteCustomerAccountAuthUrl(url), init)
}

export function CustomerAccountProvider({
  baseUrl,
  children,
  fetcher,
}: {
  baseUrl: string
  children: ReactNode
  fetcher: VoyantFetcher
}) {
  return (
    <VoyantAuthProvider baseUrl={baseUrl} fetcher={createCustomerAccountFetcher(fetcher, baseUrl)}>
      <VoyantCustomerPortalProvider baseUrl={baseUrl} fetcher={fetcher}>
        <CustomerAuthConfigProvider baseUrl={baseUrl} fetcher={fetcher}>
          <BuyerAccountProvider baseUrl={baseUrl} fetcher={fetcher}>
            {children}
          </BuyerAccountProvider>
        </CustomerAuthConfigProvider>
      </VoyantCustomerPortalProvider>
    </VoyantAuthProvider>
  )
}
