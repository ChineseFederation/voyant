import type { EventBus } from "@voyant-travel/core"

import type { Contract, ContractStageHistoryEntry, ContractStatus } from "./schema.js"

export const CONTRACT_LIFECYCLE_STAGES = [
  "draft",
  "issued",
  "sent",
  "signed",
  "executed",
  "expired",
  "void",
] as const satisfies readonly ContractStatus[]

export type ContractLifecycleStage = (typeof CONTRACT_LIFECYCLE_STAGES)[number]

export type ContractLifecycleTransition =
  | "created"
  | "issued"
  | "sent"
  | "signed"
  | "executed"
  | "voided"

export const CONTRACT_LIFECYCLE_EVENT_NAMES = {
  issued: "contract.issued",
  sent: "contract.sent",
  signed: "contract.signed",
  executed: "contract.executed",
  voided: "contract.voided",
} as const satisfies Record<Exclude<ContractLifecycleTransition, "created">, string>

export interface ContractLifecycleEvent {
  contractId: string
  contractNumber: string | null
  scope: Contract["scope"]
  previousStage: ContractLifecycleStage
  stage: ContractLifecycleStage
  transition: Exclude<ContractLifecycleTransition, "created">
  occurredAt: string
  personId: string | null
  organizationId: string | null
  supplierId: string | null
  channelId: string | null
  bookingId: string | null
  targetKind: Contract["targetKind"] | null
  targetId: string | null
  targetProvider: string | null
  targetSourceRef: string | null
  legacyTransactionOfferId: string | null
  legacyTransactionOrderId: string | null
  /**
   * Operator-supplied delivery override for the `sent` transition only —
   * the Send-contract dialog forwards the typed-in subject + message +
   * recipient through here so the downstream notification subscriber
   * can build its email body from the operator's wording instead of a
   * static template. Null on every other transition.
   */
  delivery?: {
    recipientEmail: string | null
    recipient?: string | null
    channel?: "email" | "sms" | "whatsapp" | null
    revision?: number | null
    notificationsSuppressed?: boolean
    subject: string | null
    message: string | null
  } | null
}

export type ContractLifecycleHook = (event: ContractLifecycleEvent) => Promise<void> | void

export interface ContractLifecycleRuntimeOptions {
  eventBus?: EventBus
  lifecycleHooks?: readonly ContractLifecycleHook[]
}

export type ContractLifecycleTransitionCheck =
  | { ok: true }
  | { ok: false; reason: "not_draft" | "not_issued" | "not_sent" | "not_signed" | "already_void" }

function isContractLifecycleStage(value: unknown): value is ContractLifecycleStage {
  return (
    typeof value === "string" && (CONTRACT_LIFECYCLE_STAGES as readonly string[]).includes(value)
  )
}

export function createContractStageHistoryEntry(
  stage: ContractLifecycleStage,
  options: {
    previousStage?: ContractLifecycleStage | null
    transition?: ContractLifecycleTransition
    enteredAt?: Date
    actorId?: string | null
  } = {},
): ContractStageHistoryEntry {
  return {
    stage,
    previousStage: options.previousStage ?? null,
    transition: options.transition ?? "created",
    enteredAt: (options.enteredAt ?? new Date()).toISOString(),
    ...(options.actorId === undefined ? {} : { actorId: options.actorId }),
  }
}

export function appendContractStageHistory(
  current: readonly ContractStageHistoryEntry[] | null | undefined,
  entry: ContractStageHistoryEntry,
): ContractStageHistoryEntry[] {
  const existing = Array.isArray(current)
    ? current.filter(
        (item): item is ContractStageHistoryEntry =>
          isContractLifecycleStage(item.stage) &&
          (item.previousStage === null ||
            item.previousStage === undefined ||
            isContractLifecycleStage(item.previousStage)) &&
          typeof item.transition === "string" &&
          typeof item.enteredAt === "string",
      )
    : []
  return [...existing, entry]
}

export function checkContractLifecycleTransition(
  from: ContractLifecycleStage,
  transition: Exclude<ContractLifecycleTransition, "created">,
): ContractLifecycleTransitionCheck {
  switch (transition) {
    case "issued":
      return from === "draft" ? { ok: true } : { ok: false, reason: "not_draft" }
    case "sent":
      return from === "issued" || from === "sent"
        ? { ok: true }
        : { ok: false, reason: "not_issued" }
    case "signed":
      return from === "sent" ? { ok: true } : { ok: false, reason: "not_sent" }
    case "executed":
      return from === "signed" ? { ok: true } : { ok: false, reason: "not_signed" }
    case "voided":
      return from === "void" ? { ok: false, reason: "already_void" } : { ok: true }
  }
}

export function buildContractLifecycleEvent(
  contract: Contract,
  previousStage: ContractLifecycleStage,
  stage: ContractLifecycleStage,
  transition: Exclude<ContractLifecycleTransition, "created">,
  occurredAt: Date,
  delivery?: ContractLifecycleEvent["delivery"],
): ContractLifecycleEvent {
  return {
    contractId: contract.id,
    contractNumber: contract.contractNumber ?? null,
    scope: contract.scope,
    previousStage,
    stage,
    transition,
    occurredAt: occurredAt.toISOString(),
    personId: contract.personId ?? null,
    organizationId: contract.organizationId ?? null,
    supplierId: contract.supplierId ?? null,
    channelId: contract.channelId ?? null,
    bookingId: contract.bookingId ?? null,
    targetKind: contract.targetKind ?? null,
    targetId: contract.targetId ?? null,
    targetProvider: contract.targetProvider ?? null,
    targetSourceRef: contract.targetSourceRef ?? null,
    legacyTransactionOfferId: contract.legacyTransactionOfferId ?? null,
    legacyTransactionOrderId: contract.legacyTransactionOrderId ?? null,
    delivery: delivery ?? null,
  }
}

export async function emitContractLifecycleEvent(
  runtime: ContractLifecycleRuntimeOptions | undefined,
  event: ContractLifecycleEvent,
) {
  const eventName = CONTRACT_LIFECYCLE_EVENT_NAMES[event.transition]
  await runtime?.eventBus?.emit(eventName, event, {
    category: "domain",
    source: "service",
  })

  for (const hook of runtime?.lifecycleHooks ?? []) {
    try {
      await hook(event)
    } catch (error) {
      console.error(`[legal] lifecycle hook failed for ${eventName}:`, error)
    }
  }
}
