import { pgEnum } from "drizzle-orm/pg-core"

/**
 * The enums are declared here, in one file the schema barrel re-exports, so a
 * table can never reference a Postgres type the barrel forgot to hand to the
 * migration collector. An omitted enum does not fail loudly — it produces a
 * `CREATE TABLE` referencing a type that was never created.
 *
 * Both mirror the unions in `@voyant-travel/insurance-contracts`; the contracts
 * package is the authority and this is the storage projection of it.
 */

export const insuranceApplicationStatusEnum = pgEnum("insurance_application_status", [
  "open",
  "submitted",
  "accepted",
  "declined",
  "expired",
  "withdrawn",
])

export const insurancePolicyIssueStateEnum = pgEnum("insurance_policy_issue_state", [
  "pending",
  "issued",
  "issue_failed",
  "cancelled",
])
