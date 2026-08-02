import type { z } from "zod"

import type {
  channelBookingLinkListQuerySchema,
  channelCommissionRuleListQuerySchema,
  channelContractListQuerySchema,
  channelInventoryAllotmentListQuerySchema,
  channelInventoryAllotmentTargetListQuerySchema,
  channelInventoryReleaseExecutionListQuerySchema,
  channelInventoryReleaseRuleListQuerySchema,
  channelListQuerySchema,
  channelProductMappingListQuerySchema,
  channelProductPublicationListQuerySchema,
  channelReconciliationItemListQuerySchema,
  channelReconciliationPolicyListQuerySchema,
  channelReconciliationRunListQuerySchema,
  channelReleaseScheduleListQuerySchema,
  channelRemittanceExceptionListQuerySchema,
  channelSettlementApprovalListQuerySchema,
  channelSettlementItemListQuerySchema,
  channelSettlementPolicyListQuerySchema,
  channelSettlementRunListQuerySchema,
  channelSupplierPublicationListQuerySchema,
  channelWebhookEventListQuerySchema,
  effectivePublicationInputSchema,
  effectivePublicationResultSchema,
  insertChannelBookingLinkSchema,
  insertChannelCommissionRuleSchema,
  insertChannelContractSchema,
  insertChannelInventoryAllotmentSchema,
  insertChannelInventoryAllotmentTargetSchema,
  insertChannelInventoryReleaseExecutionSchema,
  insertChannelInventoryReleaseRuleSchema,
  insertChannelProductMappingSchema,
  insertChannelProductPublicationSchema,
  insertChannelReconciliationItemSchema,
  insertChannelReconciliationPolicySchema,
  insertChannelReconciliationRunSchema,
  insertChannelReleaseScheduleSchema,
  insertChannelRemittanceExceptionSchema,
  insertChannelSchema,
  insertChannelSettlementApprovalSchema,
  insertChannelSettlementItemSchema,
  insertChannelSettlementPolicySchema,
  insertChannelSettlementRunSchema,
  insertChannelSupplierPublicationSchema,
  insertChannelWebhookEventSchema,
  previewChannelSupplierPublicationSchema,
  updateChannelBookingLinkSchema,
  updateChannelCommissionRuleSchema,
  updateChannelContractSchema,
  updateChannelInventoryAllotmentSchema,
  updateChannelInventoryAllotmentTargetSchema,
  updateChannelInventoryReleaseExecutionSchema,
  updateChannelInventoryReleaseRuleSchema,
  updateChannelProductMappingSchema,
  updateChannelProductPublicationSchema,
  updateChannelReconciliationItemSchema,
  updateChannelReconciliationPolicySchema,
  updateChannelReconciliationRunSchema,
  updateChannelReleaseScheduleSchema,
  updateChannelRemittanceExceptionSchema,
  updateChannelSchema,
  updateChannelSettlementApprovalSchema,
  updateChannelSettlementItemSchema,
  updateChannelSettlementPolicySchema,
  updateChannelSettlementRunSchema,
  updateChannelSupplierPublicationSchema,
  updateChannelWebhookEventSchema,
} from "../validation.js"

export type ChannelListQuery = z.infer<typeof channelListQuerySchema>
export type ChannelContractListQuery = z.infer<typeof channelContractListQuerySchema>
export type ChannelCommissionRuleListQuery = z.infer<typeof channelCommissionRuleListQuerySchema>
export type ChannelProductMappingListQuery = z.infer<typeof channelProductMappingListQuerySchema>
export type ChannelProductPublicationListQuery = z.infer<
  typeof channelProductPublicationListQuerySchema
>
export type ChannelSupplierPublicationListQuery = z.infer<
  typeof channelSupplierPublicationListQuerySchema
>
export type ChannelBookingLinkListQuery = z.infer<typeof channelBookingLinkListQuerySchema>
export type ChannelWebhookEventListQuery = z.infer<typeof channelWebhookEventListQuerySchema>
export type ChannelInventoryAllotmentListQuery = z.infer<
  typeof channelInventoryAllotmentListQuerySchema
>
export type ChannelInventoryAllotmentTargetListQuery = z.infer<
  typeof channelInventoryAllotmentTargetListQuerySchema
>
export type ChannelInventoryReleaseRuleListQuery = z.infer<
  typeof channelInventoryReleaseRuleListQuerySchema
>
export type ChannelSettlementRunListQuery = z.infer<typeof channelSettlementRunListQuerySchema>
export type ChannelSettlementItemListQuery = z.infer<typeof channelSettlementItemListQuerySchema>
export type ChannelReconciliationRunListQuery = z.infer<
  typeof channelReconciliationRunListQuerySchema
>
export type ChannelReconciliationItemListQuery = z.infer<
  typeof channelReconciliationItemListQuerySchema
>
export type ChannelInventoryReleaseExecutionListQuery = z.infer<
  typeof channelInventoryReleaseExecutionListQuerySchema
>
export type ChannelSettlementPolicyListQuery = z.infer<
  typeof channelSettlementPolicyListQuerySchema
>
export type ChannelReconciliationPolicyListQuery = z.infer<
  typeof channelReconciliationPolicyListQuerySchema
>
export type ChannelReleaseScheduleListQuery = z.infer<typeof channelReleaseScheduleListQuerySchema>
export type ChannelRemittanceExceptionListQuery = z.infer<
  typeof channelRemittanceExceptionListQuerySchema
>
export type ChannelSettlementApprovalListQuery = z.infer<
  typeof channelSettlementApprovalListQuerySchema
>
export type CreateChannelInput = z.infer<typeof insertChannelSchema>
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>
export type CreateChannelContractInput = z.infer<typeof insertChannelContractSchema>
export type UpdateChannelContractInput = z.infer<typeof updateChannelContractSchema>
export type CreateChannelCommissionRuleInput = z.infer<typeof insertChannelCommissionRuleSchema>
export type UpdateChannelCommissionRuleInput = z.infer<typeof updateChannelCommissionRuleSchema>
export type CreateChannelProductMappingInput = z.infer<typeof insertChannelProductMappingSchema>
export type UpdateChannelProductMappingInput = z.infer<typeof updateChannelProductMappingSchema>
export type CreateChannelProductPublicationInput = z.infer<
  typeof insertChannelProductPublicationSchema
>
export type UpdateChannelProductPublicationInput = z.infer<
  typeof updateChannelProductPublicationSchema
>
export type CreateChannelSupplierPublicationInput = z.infer<
  typeof insertChannelSupplierPublicationSchema
>
export type PreviewChannelSupplierPublicationInput = z.infer<
  typeof previewChannelSupplierPublicationSchema
>
export type UpdateChannelSupplierPublicationInput = z.infer<
  typeof updateChannelSupplierPublicationSchema
>
export type EffectivePublicationInput = z.infer<typeof effectivePublicationInputSchema>
export type EffectivePublicationResult = z.infer<typeof effectivePublicationResultSchema>
export type CreateChannelBookingLinkInput = z.infer<typeof insertChannelBookingLinkSchema>
export type UpdateChannelBookingLinkInput = z.infer<typeof updateChannelBookingLinkSchema>
export type CreateChannelWebhookEventInput = z.infer<typeof insertChannelWebhookEventSchema>
export type UpdateChannelWebhookEventInput = z.infer<typeof updateChannelWebhookEventSchema>
export type CreateChannelInventoryAllotmentInput = z.infer<
  typeof insertChannelInventoryAllotmentSchema
>
export type UpdateChannelInventoryAllotmentInput = z.infer<
  typeof updateChannelInventoryAllotmentSchema
>
export type CreateChannelInventoryAllotmentTargetInput = z.infer<
  typeof insertChannelInventoryAllotmentTargetSchema
>
export type UpdateChannelInventoryAllotmentTargetInput = z.infer<
  typeof updateChannelInventoryAllotmentTargetSchema
>
export type CreateChannelInventoryReleaseRuleInput = z.infer<
  typeof insertChannelInventoryReleaseRuleSchema
>
export type UpdateChannelInventoryReleaseRuleInput = z.infer<
  typeof updateChannelInventoryReleaseRuleSchema
>
export type CreateChannelSettlementRunInput = z.infer<typeof insertChannelSettlementRunSchema>
export type UpdateChannelSettlementRunInput = z.infer<typeof updateChannelSettlementRunSchema>
export type CreateChannelSettlementItemInput = z.infer<typeof insertChannelSettlementItemSchema>
export type UpdateChannelSettlementItemInput = z.infer<typeof updateChannelSettlementItemSchema>
export type CreateChannelReconciliationRunInput = z.infer<
  typeof insertChannelReconciliationRunSchema
>
export type UpdateChannelReconciliationRunInput = z.infer<
  typeof updateChannelReconciliationRunSchema
>
export type CreateChannelReconciliationItemInput = z.infer<
  typeof insertChannelReconciliationItemSchema
>
export type UpdateChannelReconciliationItemInput = z.infer<
  typeof updateChannelReconciliationItemSchema
>
export type CreateChannelInventoryReleaseExecutionInput = z.infer<
  typeof insertChannelInventoryReleaseExecutionSchema
>
export type UpdateChannelInventoryReleaseExecutionInput = z.infer<
  typeof updateChannelInventoryReleaseExecutionSchema
>
export type CreateChannelSettlementPolicyInput = z.infer<typeof insertChannelSettlementPolicySchema>
export type UpdateChannelSettlementPolicyInput = z.infer<typeof updateChannelSettlementPolicySchema>
export type CreateChannelReconciliationPolicyInput = z.infer<
  typeof insertChannelReconciliationPolicySchema
>
export type UpdateChannelReconciliationPolicyInput = z.infer<
  typeof updateChannelReconciliationPolicySchema
>
export type CreateChannelReleaseScheduleInput = z.infer<typeof insertChannelReleaseScheduleSchema>
export type UpdateChannelReleaseScheduleInput = z.infer<typeof updateChannelReleaseScheduleSchema>
export type CreateChannelRemittanceExceptionInput = z.infer<
  typeof insertChannelRemittanceExceptionSchema
>
export type UpdateChannelRemittanceExceptionInput = z.infer<
  typeof updateChannelRemittanceExceptionSchema
>
export type CreateChannelSettlementApprovalInput = z.infer<
  typeof insertChannelSettlementApprovalSchema
>
export type UpdateChannelSettlementApprovalInput = z.infer<
  typeof updateChannelSettlementApprovalSchema
>
