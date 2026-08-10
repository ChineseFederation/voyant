"use client"

import { useParams } from "@tanstack/react-router"
import { type ComponentType, lazy, type ReactNode, Suspense } from "react"
import type { PublicProposalPageMessages } from "./storefront/public-proposal-page.js"

const PublicProposalPage = lazy(() =>
  import("./storefront/public-proposal-page.js").then((module) => ({
    default: module.PublicProposalPage,
  })),
)

export interface ProposalsPublicRouteRuntime {
  getApiUrl(): string
  StorefrontMessagesProvider: ComponentType<{ children: ReactNode }>
  useProposalMessages(): PublicProposalPageMessages
}

export function createProposalsPublicRouteContribution(runtime: ProposalsPublicRouteRuntime) {
  function ProposalRoute() {
    return (
      <runtime.StorefrontMessagesProvider>
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <ProposalRouteContent />
        </Suspense>
      </runtime.StorefrontMessagesProvider>
    )
  }

  function ProposalRouteContent() {
    const { proposalVersionId } = useParams({ strict: false }) as { proposalVersionId: string }
    return (
      <PublicProposalPage
        proposalVersionId={proposalVersionId}
        apiBaseUrl={runtime.getApiUrl()}
        messages={runtime.useProposalMessages()}
      />
    )
  }

  return {
    id: "@voyant-travel/proposals#presentation.public" as const,
    routes: { proposal: { component: ProposalRoute } },
  }
}
