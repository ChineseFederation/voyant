import { pgEnum } from "drizzle-orm/pg-core"

export const entityTypeEnum = pgEnum("entity_type", [
  "organization",
  "person",
  "proposal",
  "activity",
])

export const proposalStatusEnum = pgEnum("proposal_status", ["open", "won", "lost", "archived"])

export const proposalVersionStatusEnum = pgEnum("proposal_version_status", [
  "draft",
  "sent",
  "accepted",
  "declined",
  "superseded",
  "expired",
])

export const participantRoleEnum = pgEnum("participant_role", [
  "traveler",
  "booker",
  "decision_maker",
  "finance",
  "other",
])
