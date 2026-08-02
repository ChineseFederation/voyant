import { bookings, bookingTravelers } from "@voyant-travel/bookings/schema"
import { bookingPaymentSchedules, invoices } from "@voyant-travel/finance/schema"
import { desc, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  type NotificationReminderRuleStage,
  type NotificationReminderStageChannel,
  type NotificationSettings,
  notificationReminderRuns,
} from "./schema.js"
import { sendInvoiceReminderNotification } from "./service-deliveries.js"
import { enqueueNotification } from "./service-durable-send.js"
import type { NotificationPortalContextOptions } from "./service-portal-context.js"
import {
  bookingStatusSkipReason,
  buildBookingPaymentReminderTemplateData,
  OPEN_PAYMENT_SCHEDULE_STATUSES,
  PAYABLE_BOOKING_STATUSES,
  paymentScheduleStatusSkipReason,
} from "./service-reminder-booking-context.js"
import {
  buildReminderQueueSummary,
  buildReminderSweepSummary,
  markReminderRunFailed,
  markReminderRunSkipped,
  type ReminderDeliveryEnqueuer,
} from "./service-reminder-run-state.js"
import {
  applyQuietHours,
  evaluateStage,
  exceedsRecipientRateLimit,
  fetchTargetsForRule,
  getNotificationSettings,
  listActiveRulesByPriority,
  listChannelsForStage,
  listStagesForRule,
  loadHistory,
  type ReminderTargetSnapshot,
  suppressedByGroup,
} from "./service-sequence.js"
import type {
  NotificationReminderRuleRow,
  NotificationService,
  ReminderQueueResult,
  ReminderSweepResult,
  RunDueRemindersInput,
} from "./service-shared.js"
import {
  resolveReminderRecipient,
  startOfUtcDay,
  toDateString,
  toTimestamp,
} from "./service-shared.js"
import type { BookingActionDeadlineResolver } from "./task-runtime.js"

function buildStageDedupeKey(
  ruleId: string,
  targetId: string,
  runDate: string,
  stageId: string,
  channel: string,
) {
  return `${ruleId}:${targetId}:${runDate}:${stageId}:${channel}`
}

async function fetchScheduleRow(db: PostgresJsDatabase, scheduleId: string) {
  const [row] = await db
    .select()
    .from(bookingPaymentSchedules)
    .where(eq(bookingPaymentSchedules.id, scheduleId))
    .limit(1)
  return row ?? null
}

async function fetchInvoiceRow(db: PostgresJsDatabase, invoiceId: string) {
  const [row] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)
  return row ?? null
}

async function emitStageChannelRun(
  db: PostgresJsDatabase,
  dispatcher: NotificationService | null,
  rule: NotificationReminderRuleRow,
  stage: NotificationReminderRuleStage,
  channelRow: NotificationReminderStageChannel,
  target: ReminderTargetSnapshot,
  recipient: { email: string | null; firstName?: string; lastName?: string } | null,
  scheduledAt: Date,
  sendCountAtFire: number,
  enqueueDelivery: ReminderDeliveryEnqueuer | null,
  now: Date,
  options: NotificationPortalContextOptions,
): Promise<{
  status: "queued" | "sent" | "skipped" | "failed"
  runId: string | null
}> {
  const runDate = toDateString(startOfUtcDay(scheduledAt))
  const dedupeKey = buildStageDedupeKey(rule.id, target.id, runDate, stage.id, channelRow.channel)

  const [existingRun] = await db
    .select()
    .from(notificationReminderRuns)
    .where(eq(notificationReminderRuns.dedupeKey, dedupeKey))
    .limit(1)
  if (existingRun) {
    return { status: "skipped", runId: existingRun.id }
  }

  const baseValues = {
    reminderRuleId: rule.id,
    targetType: rule.targetType,
    targetId: target.id,
    dedupeKey,
    bookingId: target.bookingId,
    personId: null as string | null,
    organizationId: null as string | null,
    paymentSessionId: null as string | null,
    notificationDeliveryId: null as string | null,
    recipient: recipient?.email ?? null,
    scheduledFor: scheduledAt,
    processedAt: now,
    errorMessage: null,
    metadata: {
      stageId: stage.id,
      stageOrderIndex: stage.orderIndex,
      stageChannelId: channelRow.id,
      channel: channelRow.channel,
      anchor: stage.anchor,
      sendCountAtFire,
      ruleSlug: rule.slug,
    } as Record<string, unknown>,
  }

  if (!recipient?.email) {
    const [run] = await db
      .insert(notificationReminderRuns)
      .values({ ...baseValues, status: "skipped", errorMessage: "no_recipient" })
      .onConflictDoNothing({ target: notificationReminderRuns.dedupeKey })
      .returning()
    return { status: "skipped", runId: run?.id ?? null }
  }

  if (enqueueDelivery && !dispatcher) {
    const [queuedRun] = await db
      .insert(notificationReminderRuns)
      .values({ ...baseValues, status: "queued" })
      .onConflictDoNothing({ target: notificationReminderRuns.dedupeKey })
      .returning()
    if (!queuedRun) return { status: "skipped", runId: null }
    try {
      await enqueueDelivery({ reminderRunId: queuedRun.id })
      return { status: "queued", runId: queuedRun.id }
    } catch (error) {
      const message = error instanceof Error ? error.message : "enqueue_failed"
      const failed = await markReminderRunFailed(db, queuedRun.id, new Date(), message)
      return { status: "failed", runId: failed?.id ?? null }
    }
  }

  if (!dispatcher) {
    return { status: "skipped", runId: null }
  }

  const [processingRun] = await db
    .insert(notificationReminderRuns)
    .values({ ...baseValues, status: "queued" })
    .onConflictDoNothing({ target: notificationReminderRuns.dedupeKey })
    .returning()

  if (!processingRun) {
    return { status: "skipped", runId: null }
  }

  try {
    const data: Record<string, unknown> = {
      reminderRuleId: rule.id,
      reminderRunId: processingRun.id,
      stageId: stage.id,
      stageOrderIndex: stage.orderIndex,
      sendCountAtFire,
    }
    if (rule.targetType === "invoice") {
      const invoice = await fetchInvoiceRow(db, target.id)
      if (!invoice) {
        return {
          status: "skipped",
          runId:
            (await markReminderRunSkipped(db, processingRun.id, new Date(), "invoice_not_found"))
              ?.id ?? null,
        }
      }
      await sendInvoiceReminderNotification(db, dispatcher, invoice.id, {
        idempotencyKey: `reminder:${processingRun.dedupeKey}`,
        templateId: channelRow.templateId ?? null,
        templateSlug: channelRow.templateSlug ?? null,
        channel: channelRow.channel,
        provider: channelRow.provider ?? null,
        to: recipient.email,
        data,
        metadata: { reminderRuleId: rule.id, reminderRunId: processingRun.id, stageId: stage.id },
        reminderRunId: processingRun.id,
        scheduledFor: scheduledAt.toISOString(),
        publicCustomerPortalBaseUrl: options.publicCustomerPortalBaseUrl,
      })
    } else if (rule.targetType === "booking_payment_schedule") {
      const schedule = await fetchScheduleRow(db, target.id)
      if (!schedule) {
        return {
          status: "skipped",
          runId:
            (await markReminderRunSkipped(db, processingRun.id, new Date(), "schedule_not_found"))
              ?.id ?? null,
        }
      }
      if (!OPEN_PAYMENT_SCHEDULE_STATUSES.has(schedule.status)) {
        return {
          status: "skipped",
          runId:
            (
              await markReminderRunSkipped(
                db,
                processingRun.id,
                new Date(),
                paymentScheduleStatusSkipReason(schedule.status),
              )
            )?.id ?? null,
        }
      }
      const context = await buildBookingPaymentReminderTemplateData(
        db,
        schedule,
        recipient.email,
        data,
        options,
      )
      if (!context) {
        return {
          status: "skipped",
          runId:
            (await markReminderRunSkipped(db, processingRun.id, new Date(), "booking_not_found"))
              ?.id ?? null,
        }
      }
      if (!PAYABLE_BOOKING_STATUSES.has(context.booking.status)) {
        return {
          status: "skipped",
          runId:
            (
              await markReminderRunSkipped(
                db,
                processingRun.id,
                new Date(),
                bookingStatusSkipReason(context.booking.status),
              )
            )?.id ?? null,
        }
      }
      if (context.booking.notificationsSuppressed) {
        return {
          status: "skipped",
          runId:
            (
              await markReminderRunSkipped(
                db,
                processingRun.id,
                new Date(),
                "booking_notifications_suppressed",
              )
            )?.id ?? null,
        }
      }
      await enqueueNotification({
        db,
        registry: dispatcher,
        input: {
          idempotencyKey: `reminder:${processingRun.dedupeKey}`,
          templateId: channelRow.templateId ?? null,
          templateSlug: channelRow.templateSlug ?? null,
          channel: channelRow.channel,
          provider: channelRow.provider ?? null,
          to: recipient.email,
          data: context.data,
          targetType: "booking_payment_schedule",
          targetId: schedule.id,
          bookingId: context.booking.id,
          personId: context.booking.personId ?? null,
          organizationId: context.booking.organizationId ?? null,
          metadata: { reminderRuleId: rule.id, reminderRunId: processingRun.id, stageId: stage.id },
          reminderRunId: processingRun.id,
          scheduledFor: scheduledAt.toISOString(),
        },
      })
    } else {
      return {
        status: "skipped",
        runId:
          (
            await markReminderRunSkipped(
              db,
              processingRun.id,
              new Date(),
              "unsupported_target_type",
            )
          )?.id ?? null,
      }
    }

    return { status: "queued", runId: processingRun.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : "delivery_failed"
    const failed = await markReminderRunFailed(db, processingRun.id, new Date(), message)
    return { status: "failed", runId: failed?.id ?? null }
  }
}

async function processStageRuleTargets(
  db: PostgresJsDatabase,
  options: {
    rule: NotificationReminderRuleRow
    stages: NotificationReminderRuleStage[]
    targets: ReminderTargetSnapshot[]
    settings: NotificationSettings
    today: Date
    now: Date
    dispatcher: NotificationService | null
    enqueueDelivery: ReminderDeliveryEnqueuer | null
    portal: NotificationPortalContextOptions
  },
): Promise<{ processed: number; sent: number; queued: number; skipped: number; failed: number }> {
  const tally = { processed: 0, sent: 0, queued: 0, skipped: 0, failed: 0 }
  for (const target of options.targets) {
    const history = await loadHistory(db, options.rule.id, target.id)
    const decision = evaluateStage(options.rule, options.stages, target, history, options.today)
    if (!decision.fire) continue

    const channels = await listChannelsForStage(db, decision.stage.id)
    if (channels.length === 0) continue

    const booking = target.bookingId
      ? ((
          await db
            .select({
              id: bookings.id,
              bookingNumber: bookings.bookingNumber,
              personId: bookings.personId,
              organizationId: bookings.organizationId,
              contactFirstName: bookings.contactFirstName,
              contactLastName: bookings.contactLastName,
              contactEmail: bookings.contactEmail,
              contactPhone: bookings.contactPhone,
              contactPreferredLanguage: bookings.contactPreferredLanguage,
              notificationsSuppressed: bookings.notificationsSuppressed,
            })
            .from(bookings)
            .where(eq(bookings.id, target.bookingId))
            .limit(1)
        )[0] ?? null)
      : null
    const participants = booking
      ? await db
          .select({
            id: bookingTravelers.id,
            firstName: bookingTravelers.firstName,
            lastName: bookingTravelers.lastName,
            email: bookingTravelers.email,
            participantType: bookingTravelers.participantType,
            isPrimary: bookingTravelers.isPrimary,
          })
          .from(bookingTravelers)
          .where(eq(bookingTravelers.bookingId, booking.id))
          .orderBy(desc(bookingTravelers.isPrimary), bookingTravelers.createdAt)
      : []
    const recipient = booking ? resolveReminderRecipient(booking, participants) : null

    if (booking?.notificationsSuppressed) {
      tally.skipped += 1
      continue
    }

    if (
      await suppressedByGroup(
        db,
        recipient?.email ?? null,
        options.rule.suppressionGroup,
        options.settings,
        options.now,
      )
    ) {
      tally.skipped += 1
      continue
    }

    const { scheduledAt } = applyQuietHours(options.now, decision.stage, options.settings)

    for (const channelRow of channels) {
      if (
        recipient?.email &&
        (await exceedsRecipientRateLimit(
          db,
          recipient.email,
          channelRow.channel,
          options.settings,
          options.now,
        ))
      ) {
        tally.skipped += 1
        continue
      }
      const result = await emitStageChannelRun(
        db,
        options.dispatcher,
        options.rule,
        decision.stage,
        channelRow,
        target,
        recipient ?? null,
        scheduledAt,
        decision.sendCountAtFire,
        options.enqueueDelivery,
        options.now,
        options.portal,
      )
      tally.processed += 1
      if (result.status === "sent") tally.sent += 1
      if (result.status === "queued") tally.queued += 1
      if (result.status === "skipped") tally.skipped += 1
      if (result.status === "failed") tally.failed += 1
    }
  }
  return tally
}

export async function runStageBasedDueReminders(
  db: PostgresJsDatabase,
  dispatcher: NotificationService,
  input: RunDueRemindersInput = {},
  options: NotificationPortalContextOptions & {
    resolveBookingActionDeadline?: BookingActionDeadlineResolver
  } = {},
): Promise<ReminderSweepResult> {
  const now = toTimestamp(input.now) ?? new Date()
  const today = startOfUtcDay(now)
  const settings = await getNotificationSettings(db)
  const rules = await listActiveRulesByPriority(db)
  const summary = buildReminderSweepSummary()

  for (const rule of rules) {
    const stages = await listStagesForRule(db, rule.id)
    if (stages.length === 0) continue
    const targets = await fetchTargetsForRule(
      db,
      rule,
      stages,
      today,
      options.resolveBookingActionDeadline,
    )
    if (targets.length === 0) continue
    const tally = await processStageRuleTargets(db, {
      rule,
      stages,
      targets,
      settings,
      today,
      now,
      dispatcher,
      enqueueDelivery: null,
      portal: options,
    })
    summary.processed += tally.processed
    summary.sent += tally.sent
    summary.skipped += tally.skipped
    summary.failed += tally.failed
  }

  return summary
}

export async function queueStageBasedDueReminders(
  db: PostgresJsDatabase,
  enqueueDelivery: ReminderDeliveryEnqueuer,
  input: RunDueRemindersInput = {},
  options: { resolveBookingActionDeadline?: BookingActionDeadlineResolver } = {},
): Promise<ReminderQueueResult> {
  const now = toTimestamp(input.now) ?? new Date()
  const today = startOfUtcDay(now)
  const settings = await getNotificationSettings(db)
  const rules = await listActiveRulesByPriority(db)
  const summary = buildReminderQueueSummary()

  for (const rule of rules) {
    const stages = await listStagesForRule(db, rule.id)
    if (stages.length === 0) continue
    const targets = await fetchTargetsForRule(
      db,
      rule,
      stages,
      today,
      options.resolveBookingActionDeadline,
    )
    if (targets.length === 0) continue
    const tally = await processStageRuleTargets(db, {
      rule,
      stages,
      targets,
      settings,
      today,
      now,
      dispatcher: null,
      enqueueDelivery,
      portal: {},
    })
    summary.processed += tally.processed
    summary.queued += tally.queued
    summary.skipped += tally.skipped
    summary.failed += tally.failed
  }

  return summary
}
