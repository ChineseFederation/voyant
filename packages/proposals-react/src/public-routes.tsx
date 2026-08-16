"use client"

import { useParams } from "@tanstack/react-router"
import { type ComponentType, lazy, type ReactNode, Suspense } from "react"
import type { PublicProposalPageMessages } from "./public-api/public-proposal-page.js"

const PublicProposalPage = lazy(() =>
  import("./public-api/public-proposal-page.js").then((module) => ({
    default: module.PublicProposalPage,
  })),
)

export interface ProposalsPublicRouteRuntime {
  getApiUrl(): string
  PublicApiMessagesProvider: ComponentType<{ children: ReactNode }>
  useProposalMessages(): PublicProposalPageMessages
}

export function createProposalsPublicRouteContribution(runtime: ProposalsPublicRouteRuntime) {
  function ProposalRoute() {
    return (
      <runtime.PublicApiMessagesProvider>
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <ProposalRouteContent />
        </Suspense>
      </runtime.PublicApiMessagesProvider>
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
