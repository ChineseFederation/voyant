export { createDefaultBookingDocumentAttachment } from "./service-booking-documents.js"
export type { NotificationService } from "./service-shared.js"
export {
  createNotificationService,
  NotificationError,
  NotificationIdempotencyConflictError,
  previewNotificationTemplate,
  renderNotificationTemplate,
  summarizeNotificationAttachments,
} from "./service-shared.js"

import {
  bookingDocumentNotificationsService,
  createDefaultBookingDocumentAttachment,
} from "./service-booking-documents.js"
import {
  getDeliveryById,
  listDeliveries,
  resendDelivery,
  sendInvoiceNotification,
  sendPaymentSessionNotification,
} from "./service-deliveries.js"
import { composeNotificationReminderRule } from "./service-reminder-authoring.js"
import { runDueReminders } from "./service-reminders.js"
import { previewReminders } from "./service-sequence.js"
import { previewNotificationTemplate } from "./service-shared.js"
import {
  createReminderRuleStage,
  createStageChannel,
  deleteReminderRuleStage,
  deleteStageChannel,
  getNotificationSettingsRecord,
  getReminderRuleStageById,
  listReminderRuleStages,
  listStageChannels,
  reorderReminderRuleStages,
  updateReminderRuleStage,
  updateStageChannel,
  upsertNotificationSettings,
} from "./service-stages.js"
import {
  createReminderRule,
  createTemplate,
  deleteReminderRule,
  deleteTemplate,
  getReminderRuleById,
  getReminderRunById,
  getTemplateById,
  getTemplateBySlug,
  listReminderRules,
  listReminderRuns,
  listTemplates,
  updateReminderRule,
  updateTemplate,
} from "./service-templates.js"

export const notificationsService = {
  listTemplates,
  getTemplateById,
  getTemplateBySlug,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  previewNotificationTemplate,
  listDeliveries,
  getDeliveryById,
  resendDelivery,
  listReminderRules,
  getReminderRuleById,
  getReminderRunById,
  createReminderRule,
  composeNotificationReminderRule,
  updateReminderRule,
  deleteReminderRule,
  listReminderRuns,
  runDueReminders,
  previewReminders,
  listReminderRuleStages,
  getReminderRuleStageById,
  createReminderRuleStage,
  updateReminderRuleStage,
  deleteReminderRuleStage,
  reorderReminderRuleStages,
  listStageChannels,
  createStageChannel,
  updateStageChannel,
  deleteStageChannel,
  getNotificationSettings: getNotificationSettingsRecord,
  upsertNotificationSettings,
  sendPaymentSessionNotification,
  sendInvoiceNotification,
  listBookingDocumentBundle: bookingDocumentNotificationsService.listBookingDocumentBundle,
  sendBookingDocumentsNotification:
    bookingDocumentNotificationsService.sendBookingDocumentsNotification,
  confirmAndDispatchBooking: bookingDocumentNotificationsService.confirmAndDispatchBooking,
  createDefaultBookingDocumentAttachment,
}
