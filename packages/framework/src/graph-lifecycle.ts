import type { VoyantGraphJsonValue } from "@voyant-travel/core/project"

import {
  canonicalJson,
  isVoyantVersionCompatible,
  type ResolvedVoyantDeploymentGraph,
  type ResolvedVoyantGraphUnit,
  type VoyantGraphDiagnostic,
} from "./deployment-graph.js"

export type VoyantGraphLifecycleOperation = "upgrade" | "uninstall"

export type VoyantGraphLifecycleFacet =
  | "runtime"
  | "api"
  | "schema"
  | "migration"
  | "link"
  | "subscriber"
  | "event"
  | "job"
  | "schedule"
  | "setup-migration"
  | "config"
  | "secret"
  | "resource"
  | "provider"
  | "access-resource"
  | "access-role"
  | "admin-runtime"
  | "admin-shell-runtime"
  | "admin-copy"
  | "admin-route"
  | "admin-nav"
  | "admin-slot"
  | "admin-contribution"
  | "tool"
  | "webhook"
  | "action"

export interface VoyantGraphLifecycleConsequence {
  id: string
  unitId: string
  facet: VoyantGraphLifecycleFacet
  entityId: string
  action: "detach" | "activate" | "retain-data" | "release"
}

export interface VoyantGraphLifecycleStep {
  id: string
  idempotencyKey: string
  kind: "migrate-graph" | "detach-unit" | "release-resource" | "activate-unit"
  unitId?: string
  resourceId?: string
  fromGraphHash: string
  toGraphHash: string
  reversible: boolean
}

export interface VoyantGraphLifecyclePlan {
  schemaVersion: "voyant.graph-lifecycle-plan.v1"
  operationId: string
  operation: VoyantGraphLifecycleOperation
  fromGraphHash: string
  toGraphHash: string
  /** Complete graph-derived surface and data consequences for review and doctor output. */
  consequences: readonly VoyantGraphLifecycleConsequence[]
  steps: readonly VoyantGraphLifecycleStep[]
}

export interface CreateVoyantGraphLifecyclePlanInput {
  operationId: string
  operation: VoyantGraphLifecycleOperation
  previous: ResolvedVoyantDeploymentGraph
  next: ResolvedVoyantDeploymentGraph
}

export interface VoyantGraphLifecycleStepState {
  stepId: string
  status: "completed" | "rolled-back"
  rollbackToken?: VoyantGraphJsonValue
}

export interface VoyantGraphLifecycleExecutionState {
  schemaVersion: "voyant.graph-lifecycle-state.v1"
  operationId: string
  planFingerprint: string
  attempt: number
  status: "running" | "rolling-back" | "completed" | "rolled-back"
  steps: readonly VoyantGraphLifecycleStepState[]
  error?: string
}

export interface VoyantGraphLifecycleStateStore {
  load(operationId: string): Promise<VoyantGraphLifecycleExecutionState | undefined>
  save(state: VoyantGraphLifecycleExecutionState): Promise<void>
}

export interface VoyantGraphLifecycleExecutor {
  execute(
    step: VoyantGraphLifecycleStep,
    context: { operationId: string; attempt: number },
  ): Promise<{ rollbackToken?: VoyantGraphJsonValue } | undefined>
  rollback(
    step: VoyantGraphLifecycleStep,
    context: { operationId: string; attempt: number; rollbackToken?: VoyantGraphJsonValue },
  ): Promise<void>
}

export class VoyantGraphLifecyclePlanError extends Error {
  readonly diagnostics: readonly VoyantGraphDiagnostic[]

  constructor(diagnostics: readonly VoyantGraphDiagnostic[]) {
    super(`Cannot lower graph lifecycle plan with ${diagnostics.length} compatibility error(s)`)
    this.name = "VoyantGraphLifecyclePlanError"
    this.diagnostics = diagnostics
  }
}

export function createVoyantGraphLifecyclePlan(
  input: CreateVoyantGraphLifecyclePlanInput,
): VoyantGraphLifecyclePlan {
  requireText(input.operationId, "operationId")
  if (input.previous.contentHash === input.next.contentHash) {
    return plan(input, [])
  }
  if (input.operation === "upgrade") {
    const diagnostics = [
      ...validateVoyantGraphUpgradeCompatibility(input.previous, input.next),
      ...validateVoyantGraphEventCompatibility(input.previous, input.next),
    ]
    if (diagnostics.length > 0) throw new VoyantGraphLifecyclePlanError(diagnostics)
  }

  const previous = unitsById(input.previous)
  const next = unitsById(input.next)
  const previousPackages = packageRecordsByName(input.previous)
  const nextPackages = packageRecordsByName(input.next)
  const removedOrChanged = [...previous.values()]
    .filter(
      (unit) =>
        !sameUnit(
          unit,
          next.get(unit.id),
          previousPackages.get(unit.packageName),
          nextPackages.get(unit.packageName),
        ),
    )
    .sort(compareUnits)
  const addedOrChanged = [...next.values()]
    .filter(
      (unit) =>
        !sameUnit(
          unit,
          previous.get(unit.id),
          nextPackages.get(unit.packageName),
          previousPackages.get(unit.packageName),
        ),
    )
    .sort(compareUnits)

  if (input.operation === "uninstall" && addedOrChanged.length > 0) {
    throw new Error("Uninstall lifecycle plans cannot add or change graph units")
  }

  const steps: VoyantGraphLifecycleStep[] = []
  if (input.operation === "upgrade") {
    steps.push(step(input, "migrate-graph", "graph", false))
  }
  for (const unit of removedOrChanged) {
    steps.push(step(input, "detach-unit", unit.id, true, { unitId: unit.id }))
  }
  for (const unit of removedOrChanged) {
    for (const cleanup of unit.lifecycle?.cleanup ?? []) {
      if (!cleanup.on.includes(input.operation)) continue
      steps.push(
        step(input, "release-resource", `${unit.id}:${cleanup.resourceId}`, true, {
          unitId: unit.id,
          resourceId: cleanup.resourceId,
        }),
      )
    }
  }
  for (const unit of addedOrChanged) {
    steps.push(step(input, "activate-unit", unit.id, true, { unitId: unit.id }))
  }
  return plan(input, steps, lifecycleConsequences(input, removedOrChanged, addedOrChanged))
}

export async function executeVoyantGraphLifecyclePlan(
  plan: VoyantGraphLifecyclePlan,
  store: VoyantGraphLifecycleStateStore,
  executor: VoyantGraphLifecycleExecutor,
): Promise<VoyantGraphLifecycleExecutionState> {
  const fingerprint = canonicalJson(plan)
  const stored = await store.load(plan.operationId)
  if (stored?.planFingerprint !== undefined && stored.planFingerprint !== fingerprint) {
    throw new Error(
      `Lifecycle operation ${plan.operationId} was already started with a different plan`,
    )
  }
  if (stored?.status === "completed") return stored

  let state: VoyantGraphLifecycleExecutionState = stored
    ? { ...stored, attempt: stored.attempt + 1, error: undefined }
    : {
        schemaVersion: "voyant.graph-lifecycle-state.v1",
        operationId: plan.operationId,
        planFingerprint: fingerprint,
        attempt: 1,
        status: "running",
        steps: [],
      }

  if (state.status === "rolling-back") {
    return rollback(plan, state, store, executor)
  }
  if (state.status === "rolled-back") state = { ...state, status: "running", steps: [] }
  await store.save(state)

  try {
    for (const lifecycleStep of plan.steps) {
      if (
        state.steps.some(
          (entry) => entry.stepId === lifecycleStep.id && entry.status === "completed",
        )
      ) {
        continue
      }
      const result = await executor.execute(lifecycleStep, {
        operationId: plan.operationId,
        attempt: state.attempt,
      })
      state = {
        ...state,
        steps: [
          ...state.steps,
          {
            stepId: lifecycleStep.id,
            status: "completed",
            ...(result?.rollbackToken !== undefined ? { rollbackToken: result.rollbackToken } : {}),
          },
        ],
      }
      await store.save(state)
    }
    state = { ...state, status: "completed" }
    await store.save(state)
    return state
  } catch (error) {
    state = { ...state, status: "rolling-back", error: errorMessage(error) }
    await store.save(state)
    return rollback(plan, state, store, executor)
  }
}

export function validateVoyantGraphEventCompatibility(
  previous: ResolvedVoyantDeploymentGraph,
  next: ResolvedVoyantDeploymentGraph,
): VoyantGraphDiagnostic[] {
  const diagnostics: VoyantGraphDiagnostic[] = []
  const oldEvents = new Map(
    allUnits(previous).flatMap((unit) => unit.events.map((event) => [event.id, event])),
  )
  const nextEventIds = new Set(
    allUnits(next).flatMap((unit) => unit.events.map((event) => event.id)),
  )
  for (const unit of allUnits(previous)) {
    for (const event of unit.events) {
      if (event.version && event.payloadSchema && !nextEventIds.has(event.id)) {
        diagnostics.push(
          eventCompatibilityDiagnostic(unit, event, "the versioned event contract was removed"),
        )
      }
    }
  }
  for (const unit of allUnits(next)) {
    for (const event of unit.events) {
      const oldEvent = oldEvents.get(event.id)
      if (!oldEvent?.version || !oldEvent.payloadSchema) continue
      if (!event.version || !event.payloadSchema) {
        diagnostics.push(
          eventCompatibilityDiagnostic(unit, event, "the versioned payload contract was removed"),
        )
        continue
      }
      const oldVersion = semverParts(oldEvent.version)
      const newVersion = semverParts(event.version)
      if (!oldVersion || !newVersion) continue
      if (compareSemver(newVersion, oldVersion) < 0) {
        diagnostics.push(
          eventCompatibilityDiagnostic(
            unit,
            event,
            `version ${event.version} is older than ${oldEvent.version}`,
          ),
        )
        continue
      }
      if (newVersion[0] !== oldVersion[0]) continue
      for (const issue of incompatibleSchemaChanges(oldEvent.payloadSchema, event.payloadSchema)) {
        diagnostics.push(eventCompatibilityDiagnostic(unit, event, issue))
      }
    }
  }
  return diagnostics
}

export function validateVoyantGraphUpgradeCompatibility(
  previous: ResolvedVoyantDeploymentGraph,
  next: ResolvedVoyantDeploymentGraph,
): VoyantGraphDiagnostic[] {
  const previousUnits = unitsById(previous)
  const previousPackages = packageRecordsByName(previous)
  return allUnits(next)
    .flatMap((unit) => {
      const range = unit.lifecycle?.compatibility?.upgradeFrom
      if (!range || !previousUnits.has(unit.id)) return []
      const previousVersion = previousPackages.get(unit.packageName)?.version
      if (previousVersion && isVoyantVersionCompatible(previousVersion, range)) return []
      return [
        {
          code: "VOYANT_GRAPH_INCOMPATIBLE_UPGRADE" as const,
          severity: "error" as const,
          source: unit.id,
          facet: "lifecycle.compatibility.upgradeFrom",
          message: previousVersion
            ? `Unit "${unit.id}" does not admit upgrades from package version "${previousVersion}"; expected "${range}".`
            : `Unit "${unit.id}" declares upgradeFrom "${range}", but the previous graph has no package version to validate.`,
          hint: "Upgrade through a supported intermediate version or restore package version provenance in the previous graph.",
        },
      ]
    })
    .sort(
      (left, right) =>
        (left.source ?? "").localeCompare(right.source ?? "") ||
        (left.facet ?? "").localeCompare(right.facet ?? ""),
    )
}

async function rollback(
  plan: VoyantGraphLifecyclePlan,
  initial: VoyantGraphLifecycleExecutionState,
  store: VoyantGraphLifecycleStateStore,
  executor: VoyantGraphLifecycleExecutor,
): Promise<VoyantGraphLifecycleExecutionState> {
  let state = initial
  const steps = new Map(plan.steps.map((entry) => [entry.id, entry]))
  for (const completed of [...state.steps].reverse()) {
    if (completed.status === "rolled-back") continue
    const lifecycleStep = steps.get(completed.stepId)
    if (!lifecycleStep?.reversible) continue
    await executor.rollback(lifecycleStep, {
      operationId: plan.operationId,
      attempt: state.attempt,
      ...(completed.rollbackToken !== undefined ? { rollbackToken: completed.rollbackToken } : {}),
    })
    state = {
      ...state,
      steps: state.steps.map((entry) =>
        entry.stepId === completed.stepId ? { ...entry, status: "rolled-back" } : entry,
      ),
    }
    await store.save(state)
  }
  state = { ...state, status: "rolled-back" }
  await store.save(state)
  return state
}

function incompatibleSchemaChanges(
  previous: Record<string, VoyantGraphJsonValue>,
  next: Record<string, VoyantGraphJsonValue>,
  path = "$",
): string[] {
  const issues: string[] = []
  const previousTypes = schemaTypes(previous.type)
  const nextTypes = schemaTypes(next.type)
  if (previousTypes.some((type) => !nextTypes.includes(type))) {
    issues.push(`${path} narrows type ${previousTypes.join("|")} to ${nextTypes.join("|")}`)
  }
  const previousEnum = stringValues(previous.enum)
  const nextEnum = stringValues(next.enum)
  if (previousEnum.some((value) => !nextEnum.includes(value)))
    issues.push(`${path} removes enum values`)

  const oldProperties = recordValue(previous.properties)
  const newProperties = recordValue(next.properties)
  const oldRequired = new Set(stringValues(previous.required))
  const newRequired = new Set(stringValues(next.required))
  for (const [name, schema] of Object.entries(oldProperties)) {
    const replacement = newProperties[name]
    if (replacement === undefined) {
      issues.push(`${path}.${name} was removed`)
      continue
    }
    if (isJsonObject(schema) && isJsonObject(replacement)) {
      issues.push(...incompatibleSchemaChanges(schema, replacement, `${path}.${name}`))
    }
  }
  for (const name of newRequired) {
    if (!oldRequired.has(name)) issues.push(`${path}.${name} became required`)
  }
  return issues
}

function plan(
  input: CreateVoyantGraphLifecyclePlanInput,
  steps: VoyantGraphLifecycleStep[],
  consequences: VoyantGraphLifecycleConsequence[] = [],
): VoyantGraphLifecyclePlan {
  return {
    schemaVersion: "voyant.graph-lifecycle-plan.v1",
    operationId: input.operationId,
    operation: input.operation,
    fromGraphHash: input.previous.contentHash,
    toGraphHash: input.next.contentHash,
    consequences,
    steps,
  }
}

function lifecycleConsequences(
  input: CreateVoyantGraphLifecyclePlanInput,
  removedOrChanged: readonly ResolvedVoyantGraphUnit[],
  addedOrChanged: readonly ResolvedVoyantGraphUnit[],
): VoyantGraphLifecycleConsequence[] {
  const consequences = removedOrChanged.flatMap((unit) => [
    ...unitFacetEntities(unit).map(({ facet, entityId }) =>
      consequence(unit.id, facet, entityId, "detach"),
    ),
    ...retainedDataConsequences(input.operation, unit),
    ...(unit.lifecycle?.cleanup ?? [])
      .filter((cleanup) => cleanup.on.includes(input.operation))
      .map((cleanup) => consequence(unit.id, "resource", cleanup.resourceId, "release")),
  ])
  consequences.push(
    ...addedOrChanged.flatMap((unit) =>
      unitFacetEntities(unit).map(({ facet, entityId }) =>
        consequence(unit.id, facet, entityId, "activate"),
      ),
    ),
  )
  return consequences.sort((left, right) => left.id.localeCompare(right.id))
}

function retainedDataConsequences(
  operation: VoyantGraphLifecycleOperation,
  unit: ResolvedVoyantGraphUnit,
): VoyantGraphLifecycleConsequence[] {
  if (operation !== "uninstall") return []
  const releasedResources = new Set(
    (unit.lifecycle?.cleanup ?? [])
      .filter((cleanup) => cleanup.on.includes("uninstall"))
      .map((cleanup) => cleanup.resourceId),
  )
  return unitFacetEntities(unit)
    .filter(
      ({ facet, entityId }) =>
        facet === "schema" ||
        facet === "migration" ||
        facet === "setup-migration" ||
        (facet === "resource" && !releasedResources.has(entityId)),
    )
    .map(({ facet, entityId }) => consequence(unit.id, facet, entityId, "retain-data"))
}

function consequence(
  unitId: string,
  facet: VoyantGraphLifecycleFacet,
  entityId: string,
  action: VoyantGraphLifecycleConsequence["action"],
): VoyantGraphLifecycleConsequence {
  return {
    id: `${action}:${facet}:${entityId}`,
    unitId,
    facet,
    entityId,
    action,
  }
}

function unitFacetEntities(
  unit: ResolvedVoyantGraphUnit,
): Array<{ facet: VoyantGraphLifecycleFacet; entityId: string }> {
  const entities: Array<{ facet: VoyantGraphLifecycleFacet; entityId: string }> = []
  const add = (facet: VoyantGraphLifecycleFacet, values: readonly { id: string }[] | undefined) => {
    for (const value of values ?? []) entities.push({ facet, entityId: value.id })
  }
  if (unit.runtime) entities.push({ facet: "runtime", entityId: `${unit.id}#runtime` })
  add("api", unit.api)
  add("schema", unit.schema)
  add("migration", unit.migrations)
  add("link", unit.links)
  add("subscriber", unit.subscribers)
  add("event", unit.events)
  add("job", unit.jobs)
  add("setup-migration", unit.setupMigrations)
  add("config", unit.config)
  add("secret", unit.secrets)
  add("resource", unit.resources)
  add("provider", unit.providers)
  add("access-resource", unit.access?.resources)
  add("access-role", unit.access?.roles)
  if (unit.admin?.runtime) {
    entities.push({ facet: "admin-runtime", entityId: `${unit.id}#admin.runtime` })
  }
  if (unit.admin?.shellRuntime) {
    entities.push({ facet: "admin-shell-runtime", entityId: `${unit.id}#admin.shellRuntime` })
  }
  add("admin-copy", unit.admin?.copy)
  add("admin-route", unit.admin?.routes)
  add("admin-nav", unit.admin?.nav)
  add("admin-slot", unit.admin?.slots)
  add("admin-contribution", unit.admin?.contributions)
  add("tool", unit.tools)
  add("webhook", unit.webhooks)
  add("action", unit.actions)
  return entities.sort(
    (left, right) =>
      left.facet.localeCompare(right.facet) || left.entityId.localeCompare(right.entityId),
  )
}

function step(
  input: CreateVoyantGraphLifecyclePlanInput,
  kind: VoyantGraphLifecycleStep["kind"],
  identity: string,
  reversible: boolean,
  extra: Pick<VoyantGraphLifecycleStep, "unitId" | "resourceId"> = {},
): VoyantGraphLifecycleStep {
  const id = `${kind}:${identity}`
  return {
    id,
    idempotencyKey: `${input.operationId}:${id}`,
    kind,
    fromGraphHash: input.previous.contentHash,
    toGraphHash: input.next.contentHash,
    reversible,
    ...extra,
  }
}

function unitsById(graph: ResolvedVoyantDeploymentGraph): Map<string, ResolvedVoyantGraphUnit> {
  return new Map(allUnits(graph).map((unit) => [unit.id, unit]))
}

function packageRecordsByName(
  graph: ResolvedVoyantDeploymentGraph,
): Map<string, ResolvedVoyantDeploymentGraph["packageRecords"][number]> {
  return new Map(graph.packageRecords.map((record) => [record.packageName, record]))
}

function allUnits(graph: ResolvedVoyantDeploymentGraph): ResolvedVoyantGraphUnit[] {
  return [...graph.modules, ...graph.extensions, ...graph.plugins]
}

function sameUnit(
  left: ResolvedVoyantGraphUnit,
  right: ResolvedVoyantGraphUnit | undefined,
  leftPackage: ResolvedVoyantDeploymentGraph["packageRecords"][number] | undefined,
  rightPackage: ResolvedVoyantDeploymentGraph["packageRecords"][number] | undefined,
): boolean {
  if (!right) return false
  const { order: _leftOrder, ...leftContract } = left
  const { order: _rightOrder, ...rightContract } = right
  return (
    canonicalJson(leftContract) === canonicalJson(rightContract) &&
    canonicalJson(leftPackage ?? null) === canonicalJson(rightPackage ?? null)
  )
}

function compareUnits(left: ResolvedVoyantGraphUnit, right: ResolvedVoyantGraphUnit): number {
  return left.order - right.order || left.id.localeCompare(right.id)
}

function eventCompatibilityDiagnostic(
  unit: ResolvedVoyantGraphUnit,
  event: ResolvedVoyantGraphUnit["events"][number],
  issue: string,
): VoyantGraphDiagnostic {
  return {
    code: "VOYANT_GRAPH_INCOMPATIBLE_EVENT_SCHEMA",
    severity: "error",
    source: unit.id,
    facet: event.id,
    message: `Event ${event.eventType ?? event.id} ${event.version ?? "(unversioned)"} is not backward compatible: ${issue}`,
    hint: "Preserve the existing payload shape or publish the breaking contract under a new major version.",
  }
}

function semverParts(value: string): readonly [number, number, number] | undefined {
  const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined
}

function compareSemver(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2]
}

function schemaTypes(value: VoyantGraphJsonValue | undefined): string[] {
  if (typeof value === "string") return [value]
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : []
}

function stringValues(value: VoyantGraphJsonValue | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : []
}

function recordValue(
  value: VoyantGraphJsonValue | undefined,
): Record<string, VoyantGraphJsonValue> {
  return isJsonObject(value) ? value : {}
}

function isJsonObject(
  value: VoyantGraphJsonValue | undefined,
): value is Record<string, VoyantGraphJsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function requireText(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} must be a non-empty string`)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
