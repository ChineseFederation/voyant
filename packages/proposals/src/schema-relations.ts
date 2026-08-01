import { relations } from "drizzle-orm"

import {
  pipelines,
  proposalParticipants,
  proposalProducts,
  proposals,
  proposalVersionLines,
  proposalVersions,
  stages,
} from "./schema-sales.js"

export const pipelinesRelations = relations(pipelines, ({ many }) => ({
  stages: many(stages),
  proposals: many(proposals),
}))

export const stagesRelations = relations(stages, ({ one, many }) => ({
  pipeline: one(pipelines, { fields: [stages.pipelineId], references: [pipelines.id] }),
  proposals: many(proposals),
}))

export const proposalsRelations = relations(proposals, ({ one, many }) => ({
  pipeline: one(pipelines, {
    fields: [proposals.pipelineId],
    references: [pipelines.id],
  }),
  stage: one(stages, { fields: [proposals.stageId], references: [stages.id] }),
  participants: many(proposalParticipants),
  products: many(proposalProducts),
  versions: many(proposalVersions),
}))

export const proposalParticipantsRelations = relations(proposalParticipants, ({ one }) => ({
  proposal: one(proposals, {
    fields: [proposalParticipants.proposalId],
    references: [proposals.id],
  }),
}))

export const proposalProductsRelations = relations(proposalProducts, ({ one }) => ({
  proposal: one(proposals, {
    fields: [proposalProducts.proposalId],
    references: [proposals.id],
  }),
}))

export const proposalVersionsRelations = relations(proposalVersions, ({ one, many }) => ({
  proposal: one(proposals, {
    fields: [proposalVersions.proposalId],
    references: [proposals.id],
  }),
  supersedes: one(proposalVersions, {
    fields: [proposalVersions.supersedesId],
    references: [proposalVersions.id],
  }),
  lines: many(proposalVersionLines),
}))

export const proposalVersionLinesRelations = relations(proposalVersionLines, ({ one }) => ({
  proposalVersion: one(proposalVersions, {
    fields: [proposalVersionLines.proposalVersionId],
    references: [proposalVersions.id],
  }),
}))
