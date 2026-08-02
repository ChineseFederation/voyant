import { and, asc, eq, gte, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  type NotificationReminderRule,
  type NotificationReminderRuleStage,
  type NotificationReminderStageCadenceInterval,
  type NotificationReminderStageChannel,
  type NotificationSettings,
  notificationReminderRuleStages,
  notificationReminderRules,
  notificationReminderRuns,
  notificationReminderStageChannels,
  notificationSettings,
} from "./schema.js"
import { fetchTargetsForRule as fetchTargetsForSequenceRule } from "./service-sequence-targets.js"
import { addUtcDays, startOfUtcDay } from "./service-shared.js"

export {
  computeAnchorDateEnvelope,
  fetchTargetsForRule,
} from "./service-sequence-targets.js"

export type ReminderTargetSnapshot = {
  id: string
  bookingId: string | null
  dueDate: string | null
  /** Authoritative instant from the Operations booking-action projection. */
  dueAt?: string | null
  issuedAt: string | null
  departureDate: string | null
  bookingCreatedAt: string | null
  status: string
  isTerminal: boolean
}

export type SequenceHistoryEntry = {
  scheduledFor: Date
  sentAt: Date | null
  status: string
}

export type StageDecision =
  | { fire: false; reason: string; stage?: NotificationReminderRuleStage }
  | {
      fire: true
      stage: NotificationReminderRuleStage
      anchorDate: Date
      sendCountAtFire: number
    }

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  id: "nset_default",
  scope: "default",
  quietHoursLocal: null,
  blackoutDates: null,
  skipWeekends: false,
  recipientRateLimitPerDay: null,
  suppressionWindowHours: 24,
  metadata: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
}

const DEFAULT_MAX_SENDS_IN_STAGE = 1

export async function getNotificationSettings(
  db: PostgresJsDatabase,
  scope = "default",
): Promise<NotificationSettings> {
  const [row] = await db
    .select()
    .from(notificationSettings)
    .where(eq(notificationSettings.scope, scope))
    .limit(1)
  return row ?? { ...DEFAULT_NOTIFICATION_SETTINGS, scope }
}

export async function listStagesForRule(
  db: PostgresJsDatabase,
  reminderRuleId: string,
): Promise<NotificationReminderRuleStage[]> {
  return db
    .select()
    .from(notificationReminderRuleStages)
    .where(eq(notificationReminderRuleStages.reminderRuleId, reminderRuleId))
    .orderBy(asc(notificationReminderRuleStages.orderIndex))
}

export async function listChannelsForStage(
  db: PostgresJsDatabase,
  stageId: string,
): Promise<NotificationReminderStageChannel[]> {
  return db
    .select()
    .from(notificationReminderStageChannels)
    .where(eq(notificationReminderStageChannels.stageId, stageId))
    .orderBy(
      asc(notificationReminderStageChannels.orderIndex),
      asc(notificationReminderStageChannels.createdAt),
    )
}

export function pickActiveStage(
  stages: NotificationReminderRuleStage[],
  attemptsSoFar: number,
): NotificationReminderRuleStage | null {
  if (stages.length === 0) return null
  let cumulative = 0
  for (const stage of stages) {
    const cap = stage.maxSendsInStage ?? DEFAULT_MAX_SENDS_IN_STAGE
    if (attemptsSoFar < cumulative + cap) {
      return stage
    }
    cumulative += cap
  }
  return null
}

function isDeliveryAttempt(status: string) {
  return (
    status === "queued" ||
    status === "processing" ||
    status === "sent" ||
    status === "skipped" ||
    status === "failed"
  )
}

export function inWindow(today: Date, anchorDate: Date, stage: NotificationReminderRuleStage) {
  const start = addUtcDays(startOfUtcDay(anchorDate), stage.windowStartDays)
  const end = addUtcDays(startOfUtcDay(anchorDate), stage.windowEndDays)
  const todayStart = startOfUtcDay(today)
  return todayStart >= start && todayStart <= end
}

function daysBetweenUtc(a: Date, b: Date) {
  const ms = startOfUtcDay(a).getTime() - startOfUtcDay(b).getTime()
  return Math.round(ms / (24 * 60 * 60 * 1000))
}

export function pickEscalatingInterval(
  intervals: NotificationReminderStageCadenceInterval[] | null | undefined,
  daysUntilDue: number | null,
): NotificationReminderStageCadenceInterval | null {
  if (!intervals || intervals.length === 0) return null
  for (const interval of intervals) {
    const gtOk =
      interval.whenDaysUntilDueGT == null || daysUntilDue == null
        ? interval.whenDaysUntilDueGT == null
        : daysUntilDue > interval.whenDaysUntilDueGT
    const ltOk =
      interval.whenDaysUntilDueLT == null || daysUntilDue == null
        ? interval.whenDaysUntilDueLT == null
        : daysUntilDue < interval.whenDaysUntilDueLT
    if (interval.whenDaysUntilDueGT == null && interval.whenDaysUntilDueLT == null) {
      return interval
    }
    if (gtOk && ltOk) return interval
  }
  // Fall back to the last interval with no constraints (the "default bucket").
  const fallback = intervals.find(
    (i) => i.whenDaysUntilDueGT == null && i.whenDaysUntilDueLT == null,
  )
  return fallback ?? null
}

export function cadenceElapsed(
  today: Date,
  lastSentAt: Date | null,
  stage: NotificationReminderRuleStage,
  daysUntilDue: number | null,
): boolean {
  if (stage.cadenceKind === "once") {
    return lastSentAt === null
  }
  if (stage.cadenceKind === "every_n_days") {
    if (lastSentAt === null) return true
    const every = stage.cadenceEveryDays ?? 1
    return daysBetweenUtc(today, lastSentAt) >= every
  }
  if (stage.cadenceKind === "escalating") {
    if (lastSentAt === null) return true
    const interval = pickEscalatingInterval(stage.cadenceIntervals, daysUntilDue)
    if (!interval) return false
    return daysBetweenUtc(today, lastSentAt) >= interval.repeatEveryDays
  }
  return false
}

export function resolveAnchor(
  anchor: NotificationReminderRuleStage["anchor"],
  target: ReminderTargetSnapshot,
  history: SequenceHistoryEntry[],
): Date | null {
  switch (anchor) {
    case "due_date":
      return target.dueAt
        ? new Date(target.dueAt)
        : target.dueDate
          ? new Date(`${target.dueDate}T00:00:00Z`)
          : null
    case "booking_created_at":
      return target.bookingCreatedAt ? new Date(target.bookingCreatedAt) : null
    case "departure_date":
      return target.departureDate ? new Date(`${target.departureDate}T00:00:00Z`) : null
    case "invoice_issued_at":
      return target.issuedAt ? new Date(`${target.issuedAt}T00:00:00Z`) : null
    case "last_send_at": {
      const sent = history.filter((h) => h.status === "sent" && h.sentAt)
      if (sent.length === 0) return null
      const last = sent.reduce(
        (acc, e) => (e.sentAt && e.sentAt > acc ? e.sentAt : acc),
        sent[0]!.sentAt!,
      )
      return last
    }
    default:
      return null
  }
}

export function evaluateStage(
  _rule: NotificationReminderRule,
  stages: NotificationReminderRuleStage[],
  target: ReminderTargetSnapshot,
  history: SequenceHistoryEntry[],
  today: Date,
): StageDecision {
  if (target.isTerminal) {
    return { fire: false, reason: "target_terminal_state" }
  }
  const attemptHistory = history.filter((h) => isDeliveryAttempt(h.status))
  const stage = pickActiveStage(stages, attemptHistory.length)
  if (!stage) {
    return { fire: false, reason: "no_active_stage" }
  }
  const anchorDate = resolveAnchor(stage.anchor, target, history)
  if (!anchorDate) {
    return { fire: false, reason: "anchor_unresolved", stage }
  }
  if (!inWindow(today, anchorDate, stage)) {
    return { fire: false, reason: "outside_window", stage }
  }

  const lastAttempt = attemptHistory.reduce<Date | null>((acc, e) => {
    const stamp = e.sentAt ?? e.scheduledFor
    return acc && acc > stamp ? acc : stamp
  }, null)

  let daysUntilDue: number | null = null
  if (target.dueAt || target.dueDate) {
    daysUntilDue = daysBetweenUtc(
      target.dueAt ? new Date(target.dueAt) : new Date(`${target.dueDate!}T00:00:00Z`),
      today,
    )
  }

  if (!cadenceElapsed(today, lastAttempt, stage, daysUntilDue)) {
    return { fire: false, reason: "cadence_not_elapsed", stage }
  }

  return { fire: true, stage, anchorDate, sendCountAtFire: attemptHistory.length + 1 }
}

function parseTimeOfDayUtcMinutes(value: string): number {
  const [hh, mm] = value.split(":").map((part) => Number(part))
  return (hh ?? 0) * 60 + (mm ?? 0)
}

export function applyQuietHours(
  now: Date,
  stage: NotificationReminderRuleStage,
  settings: NotificationSettings,
  recipientTimezone?: string | null,
): { scheduledAt: Date; deferred: boolean } {
  if (!stage.respectQuietHours) {
    return { scheduledAt: now, deferred: false }
  }
  const blackoutDates = settings.blackoutDates ?? []
  const skipWeekends = settings.skipWeekends ?? false
  const quiet = settings.quietHoursLocal
  const tz = recipientTimezone ?? quiet?.tz ?? "UTC"
  const effectiveTz = tz === "recipient" ? "UTC" : tz

  let candidate = now
  for (let attempts = 0; attempts < 24; attempts += 1) {
    const local = formatInTimeZone(candidate, effectiveTz)
    const blackout = blackoutDates.includes(local.dateString)
    const isWeekend = local.dayOfWeek === 0 || local.dayOfWeek === 6
    let inQuiet = false
    if (quiet) {
      const startMin = parseTimeOfDayUtcMinutes(quiet.start)
      const endMin = parseTimeOfDayUtcMinutes(quiet.end)
      const nowMin = local.hour * 60 + local.minute
      inQuiet =
        startMin <= endMin
          ? nowMin >= startMin && nowMin < endMin
          : nowMin >= startMin || nowMin < endMin
    }
    if (!blackout && !(skipWeekends && isWeekend) && !inQuiet) {
      return { scheduledAt: candidate, deferred: candidate !== now }
    }
    candidate = new Date(candidate.getTime() + 60 * 60 * 1000)
  }
  return { scheduledAt: candidate, deferred: true }
}

function formatInTimeZone(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((part) => [part.type, part.value]),
  ) as Record<string, string>
  const dayLookup: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  return {
    dateString: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour ?? "0") % 24,
    minute: Number(parts.minute ?? "0"),
    dayOfWeek: dayLookup[parts.weekday ?? "Mon"] ?? 1,
  }
}

export async function exceedsRecipientRateLimit(
  db: PostgresJsDatabase,
  recipient: string,
  channel: string,
  settings: NotificationSettings,
  now: Date,
): Promise<boolean> {
  const limit = settings.recipientRateLimitPerDay
  if (limit == null || limit <= 0) return false
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationReminderRuns)
    .where(
      and(
        eq(notificationReminderRuns.recipient, recipient),
        eq(notificationReminderRuns.status, "sent"),
        gte(notificationReminderRuns.processedAt, since),
        // agent-quality: raw-sql reviewed -- owner: notifications; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        sql`${notificationReminderRuns.metadata}->>'channel' = ${channel}`,
      ),
    )
  return (row?.count ?? 0) >= limit
}

export async function suppressedByGroup(
  db: PostgresJsDatabase,
  recipient: string | null,
  suppressionGroup: string | null,
  settings: NotificationSettings,
  now: Date,
): Promise<boolean> {
  if (!recipient || !suppressionGroup) return false
  const windowHours = settings.suppressionWindowHours ?? 24
  if (windowHours <= 0) return false
  const since = new Date(now.getTime() - windowHours * 60 * 60 * 1000)
  const [row] = await db
    .select({ id: notificationReminderRuns.id })
    .from(notificationReminderRuns)
    .innerJoin(
      notificationReminderRules,
      eq(notificationReminderRuns.reminderRuleId, notificationReminderRules.id),
    )
    .where(
      and(
        eq(notificationReminderRuns.recipient, recipient),
        eq(notificationReminderRuns.status, "sent"),
        eq(notificationReminderRules.suppressionGroup, suppressionGroup),
        gte(notificationReminderRuns.processedAt, since),
      ),
    )
    .limit(1)
  return Boolean(row)
}

export async function loadHistory(
  db: PostgresJsDatabase,
  reminderRuleId: string,
  targetId: string,
): Promise<SequenceHistoryEntry[]> {
  const rows = await db
    .select({
      scheduledFor: notificationReminderRuns.scheduledFor,
      processedAt: notificationReminderRuns.processedAt,
      status: notificationReminderRuns.status,
    })
    .from(notificationReminderRuns)
    .where(
      and(
        eq(notificationReminderRuns.reminderRuleId, reminderRuleId),
        eq(notificationReminderRuns.targetId, targetId),
      ),
    )
    .orderBy(asc(notificationReminderRuns.scheduledFor))

  return rows.map((row) => ({
    scheduledFor: row.scheduledFor,
    sentAt: row.status === "sent" ? row.processedAt : null,
    status: row.status,
  }))
}

export async function listActiveRulesByPriority(
  db: PostgresJsDatabase,
): Promise<NotificationReminderRule[]> {
  return db
    .select()
    .from(notificationReminderRules)
    .where(eq(notificationReminderRules.status, "active"))
    .orderBy(
      // agent-quality: raw-sql reviewed -- owner: notifications; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      sql`${notificationReminderRules.priority} desc nulls last`,
      asc(notificationReminderRules.createdAt),
    )
}

export type PreviewRow = {
  ruleId: string
  ruleName: string
  ruleSlug: string
  targetType: string
  targetId: string
  bookingId: string | null
  stageId: string
  stageName: string | null
  stageOrderIndex: number
  anchor: string
  anchorDate: string
  scheduledAt: string
  sendCountAtFire: number
  reasoning: string
}

export async function previewReminders(
  db: PostgresJsDatabase,
  options: { now?: Date; ruleId?: string; targetId?: string } = {},
): Promise<PreviewRow[]> {
  const now = options.now ?? new Date()
  const today = startOfUtcDay(now)
  const settings = await getNotificationSettings(db)
  const allRules = await listActiveRulesByPriority(db)
  const rules = options.ruleId ? allRules.filter((r) => r.id === options.ruleId) : allRules
  const rows: PreviewRow[] = []

  for (const rule of rules) {
    const stages = await listStagesForRule(db, rule.id)
    if (stages.length === 0) continue
    const targets = await fetchTargetsForSequenceRule(db, rule, stages, today)
    const filteredTargets = options.targetId
      ? targets.filter((t) => t.id === options.targetId)
      : targets
    for (const target of filteredTargets) {
      const history = await loadHistory(db, rule.id, target.id)
      const decision = evaluateStage(rule, stages, target, history, today)
      if (!decision.fire) continue
      const { scheduledAt } = applyQuietHours(now, decision.stage, settings)
      rows.push({
        ruleId: rule.id,
        ruleName: rule.name,
        ruleSlug: rule.slug,
        targetType: rule.targetType,
        targetId: target.id,
        bookingId: target.bookingId,
        stageId: decision.stage.id,
        stageName: decision.stage.name,
        stageOrderIndex: decision.stage.orderIndex,
        anchor: decision.stage.anchor,
        anchorDate: decision.anchorDate.toISOString(),
        scheduledAt: scheduledAt.toISOString(),
        sendCountAtFire: decision.sendCountAtFire,
        reasoning: `stage[${decision.stage.orderIndex}] anchor=${decision.stage.anchor} window=[${decision.stage.windowStartDays},${decision.stage.windowEndDays}] cadence=${decision.stage.cadenceKind}`,
      })
    }
  }

  return rows
}
