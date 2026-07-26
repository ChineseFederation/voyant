import type { EventBus } from "@voyant-travel/core"
import type { VoyantDb } from "@voyant-travel/hono"
import { eq } from "drizzle-orm"

import type {
  InitializeSetupInput,
  SetupState,
  SetupStepDefinition,
  SetupStepState,
} from "./contracts.js"
import {
  ORGANIZATION_SETUP_ID,
  type OrganizationSetup,
  type OrganizationSetupStep,
  organizationSetup,
  organizationSetupSteps,
} from "./schema.js"

export interface SetupStore {
  transaction<T>(run: (store: SetupStore) => Promise<T>): Promise<T>
  createOrganization(input: OrganizationSetup): Promise<boolean>
  getOrganization(): Promise<OrganizationSetup | null>
  ensureStep(stepId: string, firstSeenAt: Date): Promise<boolean>
  listSteps(): Promise<OrganizationSetupStep[]>
  markCompleted(stepId: string, at: Date): Promise<OrganizationSetupStep>
  markSkipped(stepId: string, at: Date): Promise<OrganizationSetupStep>
  markDismissed(at: Date): Promise<OrganizationSetup>
}

export interface InitializeSetupResult extends SetupState {
  shouldRedirect: boolean
}

export const SETUP_LIFECYCLE_CHANGED_EVENT = "setup.lifecycle.changed" as const

export interface SetupLifecycleChangedEventPayload {
  change: "initialized" | "step_completed" | "step_skipped" | "dismissed"
  stepId: string | null
}

export interface SetupMutationOptions {
  eventBus?: EventBus
  now?: Date
}

export class SetupSelectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SetupSelectionError"
  }
}

export async function initializeSetup(
  store: SetupStore,
  input: InitializeSetupInput,
  selectedSteps: readonly SetupStepDefinition[],
  prefill: Readonly<Record<string, unknown>> = {},
  options: SetupMutationOptions = {},
): Promise<InitializeSetupResult> {
  assertSelectedStepIds(input.stepIds, selectedSteps)
  const now = options.now ?? new Date()
  const outcome = await store.transaction(async (transaction) => {
    const created = await transaction.createOrganization({
      id: ORGANIZATION_SETUP_ID,
      startedAt: now,
      firstRunOpenedAt: input.fresh ? now : null,
      dismissedAt: null,
    })
    let addedStep = false
    for (const step of selectedSteps) {
      addedStep = (await transaction.ensureStep(step.id, now)) || addedStep
    }

    const organization = await transaction.getOrganization()
    if (!organization) throw new Error("Setup initialization did not persist organization state.")
    return {
      changed: created || addedStep,
      result: {
        ...serializeState(organization, await transaction.listSteps(), selectedSteps, prefill),
        shouldRedirect: created && input.fresh,
      },
    }
  })
  if (outcome.changed) {
    await emitSetupLifecycleChanged(options, { change: "initialized", stepId: null })
  }
  return outcome.result
}

export async function getSetupState(
  store: SetupStore,
  selectedSteps: readonly SetupStepDefinition[],
  prefill: Readonly<Record<string, unknown>> = {},
): Promise<SetupState | null> {
  const organization = await store.getOrganization()
  return organization
    ? serializeState(organization, await store.listSteps(), selectedSteps, prefill)
    : null
}

export async function completeSetupStep(
  store: SetupStore,
  selectedSteps: readonly SetupStepDefinition[],
  stepId: string,
  options: SetupMutationOptions = {},
): Promise<SetupStepState> {
  requireSelectedStep(selectedSteps, stepId)
  const result = serializeStep(await store.markCompleted(stepId, options.now ?? new Date()))
  await emitSetupLifecycleChanged(options, { change: "step_completed", stepId })
  return result
}

export async function skipSetupStep(
  store: SetupStore,
  selectedSteps: readonly SetupStepDefinition[],
  stepId: string,
  options: SetupMutationOptions = {},
): Promise<SetupStepState> {
  const step = requireSelectedStep(selectedSteps, stepId)
  if (!step.skippable) {
    throw new SetupSelectionError(`Setup step "${stepId}" cannot be skipped.`)
  }
  const result = serializeStep(await store.markSkipped(stepId, options.now ?? new Date()))
  await emitSetupLifecycleChanged(options, { change: "step_skipped", stepId })
  return result
}

export async function dismissSetup(
  store: SetupStore,
  selectedSteps: readonly SetupStepDefinition[],
  prefill: Readonly<Record<string, unknown>> = {},
  options: SetupMutationOptions = {},
): Promise<SetupState> {
  const now = options.now ?? new Date()
  const organization = await store.markDismissed(now)
  await emitSetupLifecycleChanged(options, { change: "dismissed", stepId: null })
  return serializeState(organization, await store.listSteps(), selectedSteps, prefill)
}

async function emitSetupLifecycleChanged(
  options: SetupMutationOptions,
  payload: SetupLifecycleChangedEventPayload,
): Promise<void> {
  await options.eventBus?.emit(SETUP_LIFECYCLE_CHANGED_EVENT, payload, {
    category: "internal",
    source: "service",
  })
}

export function createDrizzleSetupStore(db: VoyantDb): SetupStore {
  return {
    async transaction(run) {
      return db.transaction((transaction) => run(createDrizzleSetupStore(transaction as VoyantDb)))
    },
    async createOrganization(input) {
      const rows = await db
        .insert(organizationSetup)
        .values(input)
        .onConflictDoNothing()
        .returning()
      return rows.length > 0
    },
    async getOrganization() {
      const [row] = await db
        .select()
        .from(organizationSetup)
        .where(eq(organizationSetup.id, ORGANIZATION_SETUP_ID))
        .limit(1)
      return row ?? null
    },
    async ensureStep(stepId, firstSeenAt) {
      const rows = await db
        .insert(organizationSetupSteps)
        .values({ stepId, firstSeenAt })
        .onConflictDoNothing()
        .returning()
      return rows.length > 0
    },
    async listSteps() {
      return db.select().from(organizationSetupSteps).orderBy(organizationSetupSteps.firstSeenAt)
    },
    async markCompleted(stepId, at) {
      const [row] = await db
        .update(organizationSetupSteps)
        .set({ completedAt: at })
        .where(eq(organizationSetupSteps.stepId, stepId))
        .returning()
      if (!row) throw new Error(`Setup step "${stepId}" was not found.`)
      return row
    },
    async markSkipped(stepId, at) {
      const [row] = await db
        .update(organizationSetupSteps)
        .set({ skippedAt: at })
        .where(eq(organizationSetupSteps.stepId, stepId))
        .returning()
      if (!row) throw new Error(`Setup step "${stepId}" was not found.`)
      return row
    },
    async markDismissed(at) {
      const [row] = await db
        .update(organizationSetup)
        .set({ dismissedAt: at })
        .where(eq(organizationSetup.id, ORGANIZATION_SETUP_ID))
        .returning()
      if (!row) throw new Error("Organization setup was not found.")
      return row
    },
  }
}

function serializeState(
  organization: OrganizationSetup,
  steps: OrganizationSetupStep[],
  selectedSteps: readonly SetupStepDefinition[],
  prefill: Readonly<Record<string, unknown>>,
): SetupState {
  const stepById = new Map(steps.map((step) => [step.stepId, step]))
  return {
    startedAt: organization.startedAt.toISOString(),
    firstRunOpenedAt: organization.firstRunOpenedAt?.toISOString() ?? null,
    dismissedAt: organization.dismissedAt?.toISOString() ?? null,
    steps: selectedSteps.flatMap((selected) => {
      const step = stepById.get(selected.id)
      return step ? [serializeStep(step)] : []
    }),
    prefill: Object.fromEntries(
      selectedSteps.flatMap((step) =>
        Object.hasOwn(prefill, step.id) ? [[step.id, prefill[step.id]]] : [],
      ),
    ),
  }
}

function assertSelectedStepIds(
  requestedStepIds: readonly string[],
  selectedSteps: readonly SetupStepDefinition[],
): void {
  const requested = new Set(requestedStepIds)
  const selected = new Set(selectedSteps.map((step) => step.id))
  if (
    requested.size !== requestedStepIds.length ||
    requested.size !== selected.size ||
    [...requested].some((stepId) => !selected.has(stepId))
  ) {
    throw new SetupSelectionError(
      "Setup initialization step ids do not match the selected project graph.",
    )
  }
}

function requireSelectedStep(
  selectedSteps: readonly SetupStepDefinition[],
  stepId: string,
): SetupStepDefinition {
  const step = selectedSteps.find((candidate) => candidate.id === stepId)
  if (!step) {
    throw new SetupSelectionError(`Setup step "${stepId}" is not selected by the project graph.`)
  }
  return step
}

function serializeStep(step: OrganizationSetupStep): SetupStepState {
  return {
    stepId: step.stepId,
    firstSeenAt: step.firstSeenAt.toISOString(),
    completedAt: step.completedAt?.toISOString() ?? null,
    skippedAt: step.skippedAt?.toISOString() ?? null,
  }
}
