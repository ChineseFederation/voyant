"use client"

import { loadConnectAndInitialize, type StripeConnectInstance } from "@stripe/connect-js"
import { ConnectAccountOnboarding, ConnectComponentsProvider } from "@stripe/react-connect-js"
import { Alert, AlertDescription, AlertTitle } from "@voyant-travel/ui/components"
import { TriangleAlert } from "lucide-react"
import { useState } from "react"

import type { PaymentEmbeddedOnboardingClientProps } from "./payments-settings-page.js"

/**
 * Official Stripe Connect embedded-onboarding adapter. The client secret is
 * available only through Stripe's callback and is never reflected into markup.
 */
export function StripeConnectEmbeddedOnboarding({
  publishableKey,
  fetchClientSecret,
  onExit,
  loadErrorTitle,
  loadErrorDescription,
}: PaymentEmbeddedOnboardingClientProps) {
  const [loadFailed, setLoadFailed] = useState(false)
  const [connectInstance] = useState<StripeConnectInstance | null>(() => {
    try {
      return loadConnectAndInitialize({ publishableKey, fetchClientSecret })
    } catch {
      return null
    }
  })

  if (!connectInstance || loadFailed) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>{loadErrorTitle}</AlertTitle>
        <AlertDescription>{loadErrorDescription}</AlertDescription>
      </Alert>
    )
  }

  return (
    <ConnectComponentsProvider connectInstance={connectInstance}>
      <ConnectAccountOnboarding onExit={onExit} onLoadError={() => setLoadFailed(true)} />
    </ConnectComponentsProvider>
  )
}
