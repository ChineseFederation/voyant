import { pgEnum } from "drizzle-orm/pg-core"

export const channelKindEnum = pgEnum("channel_kind", [
  "direct",
  "affiliate",
  "ota",
  "reseller",
  "marketplace",
  "api_partner",
  "connect",
])

export const channelStatusEnum = pgEnum("channel_status", [
  "active",
  "inactive",
  "pending",
  "archived",
])

export const channelContractStatusEnum = pgEnum("channel_contract_status", [
  "draft",
  "active",
  "expired",
  "terminated",
])

export const distributionPaymentOwnerEnum = pgEnum("distribution_payment_owner", [
  "operator",
  "channel",
  "split",
])

export const distributionCancellationOwnerEnum = pgEnum("distribution_cancellation_owner", [
  "operator",
  "channel",
  "mixed",
])

export const channelCommissionScopeEnum = pgEnum("channel_commission_scope", [
  "booking",
  "product",
  "rate",
  "category",
])

export const channelCommissionTypeEnum = pgEnum("channel_commission_type", ["fixed", "percentage"])

export const channelWebhookStatusEnum = pgEnum("channel_webhook_status", [
  "pending",
  "processed",
  "failed",
  "ignored",
])

export const channelAllotmentReleaseModeEnum = pgEnum("channel_allotment_release_mode", [
  "automatic",
  "manual",
])

export const channelAllotmentUnsoldActionEnum = pgEnum("channel_allotment_unsold_action", [
  "release_to_general_pool",
  "expire",
  "retain",
])

export const channelSettlementRunStatusEnum = pgEnum("channel_settlement_run_status", [
  "draft",
  "open",
  "posted",
  "paid",
  "void",
])

export const channelSettlementItemStatusEnum = pgEnum("channel_settlement_item_status", [
  "pending",
  "approved",
  "disputed",
  "paid",
  "void",
])

export const channelReconciliationRunStatusEnum = pgEnum("channel_reconciliation_run_status", [
  "draft",
  "running",
  "completed",
  "archived",
])

export const channelReconciliationIssueTypeEnum = pgEnum("channel_reconciliation_issue_type", [
  "missing_booking",
  "status_mismatch",
  "amount_mismatch",
  "cancel_mismatch",
  "missing_payout",
  "other",
])

export const channelReconciliationSeverityEnum = pgEnum("channel_reconciliation_severity", [
  "info",
  "warning",
  "error",
])

export const channelReconciliationResolutionStatusEnum = pgEnum(
  "channel_reconciliation_resolution_status",
  ["open", "ignored", "resolved"],
)

export const channelReleaseExecutionStatusEnum = pgEnum("channel_release_execution_status", [
  "pending",
  "completed",
  "skipped",
  "failed",
])

export const channelReleaseExecutionActionEnum = pgEnum("channel_release_execution_action", [
  "released",
  "expired",
  "retained",
  "manual_override",
])

export const channelSettlementPolicyFrequencyEnum = pgEnum("channel_settlement_policy_frequency", [
  "manual",
  "daily",
  "weekly",
  "monthly",
])

export const channelReconciliationPolicyFrequencyEnum = pgEnum(
  "channel_reconciliation_policy_frequency",
  ["manual", "daily", "weekly", "monthly"],
)

export const channelReleaseScheduleKindEnum = pgEnum("channel_release_schedule_kind", [
  "manual",
  "hourly",
  "daily",
])

export const channelRemittanceExceptionStatusEnum = pgEnum("channel_remittance_exception_status", [
  "open",
  "investigating",
  "resolved",
  "ignored",
])

export const channelSettlementApprovalStatusEnum = pgEnum("channel_settlement_approval_status", [
  "pending",
  "approved",
  "rejected",
])

export const channelPublicationDecisionEnum = pgEnum("channel_publication_decision", [
  "include",
  "exclude",
])

export const channelPublicationReindexIntentStatusEnum = pgEnum(
  "channel_publication_reindex_intent_status",
  ["pending", "processing", "completed", "failed"],
)

export const channelPublicationReindexIntentKindEnum = pgEnum(
  "channel_publication_reindex_intent_kind",
  ["product", "supplier", "source", "catalog"],
)
