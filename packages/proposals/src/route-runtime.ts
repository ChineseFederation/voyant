import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export type ResolveProposalParticipantPersonById = (
  db: PostgresJsDatabase,
  personId: string,
) => Promise<boolean>

export interface ProposalsRouteRuntimeOptions {
  resolveParticipantPersonById?: ResolveProposalParticipantPersonById
}

export interface ProposalsRouteRuntime extends ProposalsRouteRuntimeOptions {}
