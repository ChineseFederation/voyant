"use client"

import { useParams } from "@tanstack/react-router"
import type { ComponentType, ReactNode } from "react"
import type { PublicProposalPageMessages } from "./storefront/public-proposal-page.js"
import { PublicProposalPage } from "./storefront/public-proposal-page.js"

export interface ProposalsPublicRouteRuntime {
  getApiUrl(): string
  StorefrontMessagesProvider: ComponentType<{ children: ReactNode }>
  useProposalMessages(): PublicProposalPageMessages
}

export function createProposalsPublicRouteContribution(runtime: ProposalsPublicRouteRuntime) {
  function ProposalRoute() {
    return (
      <runtime.StorefrontMessagesProvider>
        <ProposalRouteContent />
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
