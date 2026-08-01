export interface ProposalsListFilters {
  search?: string | undefined
  personId?: string | undefined
  organizationId?: string | undefined
  pipelineId?: string | undefined
  stageId?: string | undefined
  ownerId?: string | undefined
  status?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface PipelinesListFilters {
  entityType?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface StagesListFilters {
  pipelineId?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface ProposalVersionsListFilters {
  proposalId?: string | undefined
  status?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export const proposalsQueryKeys = {
  all: ["voyant", "proposals"] as const,

  proposals: () => [...proposalsQueryKeys.all, "proposals"] as const,
  proposalsList: (filters: ProposalsListFilters) =>
    [...proposalsQueryKeys.proposals(), "list", filters] as const,
  proposal: (id: string) => [...proposalsQueryKeys.proposals(), "detail", id] as const,

  pipelines: () => [...proposalsQueryKeys.all, "pipelines"] as const,
  pipelinesList: (filters: PipelinesListFilters) =>
    [...proposalsQueryKeys.pipelines(), "list", filters] as const,
  pipeline: (id: string) => [...proposalsQueryKeys.pipelines(), "detail", id] as const,

  stages: () => [...proposalsQueryKeys.all, "stages"] as const,
  stagesList: (filters: StagesListFilters) =>
    [...proposalsQueryKeys.stages(), "list", filters] as const,
  stage: (id: string) => [...proposalsQueryKeys.stages(), "detail", id] as const,

  proposalVersions: () => [...proposalsQueryKeys.all, "proposal-versions"] as const,
  proposalVersionsList: (filters: ProposalVersionsListFilters) =>
    [...proposalsQueryKeys.proposalVersions(), "list", filters] as const,
  proposalVersion: (id: string) =>
    [...proposalsQueryKeys.proposalVersions(), "detail", id] as const,
  proposalVersionLines: (proposalVersionId: string) =>
    [...proposalsQueryKeys.proposalVersion(proposalVersionId), "lines"] as const,

  proposalParticipants: (proposalId: string) =>
    [...proposalsQueryKeys.proposal(proposalId), "participants"] as const,
  proposalProducts: (proposalId: string) =>
    [...proposalsQueryKeys.proposal(proposalId), "products"] as const,
  proposalMedia: (proposalId: string) =>
    [...proposalsQueryKeys.proposal(proposalId), "media"] as const,
} as const
