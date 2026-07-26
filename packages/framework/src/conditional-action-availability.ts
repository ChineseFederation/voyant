import type { VoyantPort } from "@voyant-travel/core/project"
import type { VoyantGraphRuntimePorts } from "./runtime-composition.js"
import { deepFreezeRuntimeSnapshot } from "./runtime-integrity.js"
import type {
  VoyantGraphActivatedRuntime,
  VoyantGraphRuntime,
  VoyantGraphRuntimeActionDefinition,
  VoyantGraphRuntimePortConformanceLoader,
  VoyantGraphRuntimeReferenceLoader,
  VoyantGraphRuntimeToolLoader,
  VoyantGraphRuntimeUnitLoader,
} from "./runtime-lowering.js"

export interface VoyantGraphConditionalActionProvisionalUnit {
  unitId: string
  references: readonly VoyantGraphRuntimeReferenceLoader[]
  tools: readonly VoyantGraphRuntimeToolLoader[]
}

interface ConditionalPortPreflight {
  provider: unknown
  promise: Promise<void>
}

interface ConditionalRequirement {
  action: VoyantGraphRuntimeActionDefinition
  portId: string
  conformance: VoyantGraphRuntimePortConformanceLoader
}

interface ActivatedRuntimeState {
  base: VoyantGraphRuntime
  attestations: ReadonlyMap<string, unknown>
}

/**
 * Realm-shared attestation facade. Vite SSR `noExternal` for `@voyant-travel/*`
 * can bundle a second copy of this module into the host while MCP still loads
 * from `node_modules`. Module-local WeakMaps/WeakSets then diverge and MCP
 * fail-closes with NOT_FRAMEWORK_OWNED / NOT_ACTIVATED.
 *
 * Install one frozen API on `globalThis` under `Symbol.for`. The WeakSet /
 * WeakMap stay closed over inside the first installer — callers only get
 * mark/is/get/set methods, never the mutable stores.
 */
const GRAPH_RUNTIME_ATTESTATION_KEY = Symbol.for(
  "@voyant-travel/framework:graph-runtime-attestation",
)

interface GraphRuntimeAttestationApi {
  readonly markOwned: (runtime: object) => void
  readonly isOwned: (runtime: object) => boolean
  readonly setActivatedState: (runtime: VoyantGraphRuntime, state: ActivatedRuntimeState) => void
  readonly getActivatedState: (runtime: VoyantGraphRuntime) => ActivatedRuntimeState | undefined
}

const provisionalUnits = new WeakMap<
  VoyantGraphRuntime,
  ReadonlyMap<string, VoyantGraphConditionalActionProvisionalUnit>
>()
const conditionalPortPreflights = new WeakMap<
  VoyantGraphRuntime,
  Map<string, ConditionalPortPreflight>
>()
const conditionalPortAttestations = new WeakMap<VoyantGraphRuntime, Map<string, unknown>>()
const activatedRuntimeViews = new WeakMap<VoyantGraphRuntime, VoyantGraphActivatedRuntime>()

function realmAttestationApi(): GraphRuntimeAttestationApi {
  const bag = globalThis as Record<symbol, GraphRuntimeAttestationApi | undefined>
  const existing = bag[GRAPH_RUNTIME_ATTESTATION_KEY]
  if (existing) return existing

  const ownedRuntimes = new WeakSet<object>()
  const activatedStates = new WeakMap<VoyantGraphRuntime, ActivatedRuntimeState>()
  const api: GraphRuntimeAttestationApi = Object.freeze({
    markOwned(runtime: object) {
      ownedRuntimes.add(runtime)
    },
    isOwned(runtime: object) {
      return ownedRuntimes.has(runtime)
    },
    setActivatedState(runtime: VoyantGraphRuntime, state: ActivatedRuntimeState) {
      activatedStates.set(runtime, state)
    },
    getActivatedState(runtime: VoyantGraphRuntime) {
      return activatedStates.get(runtime)
    },
  })
  Object.defineProperty(globalThis, GRAPH_RUNTIME_ATTESTATION_KEY, {
    value: api,
    enumerable: false,
    configurable: false,
    writable: false,
  })
  return api
}

/** Record a runtime minted by a framework-owned construction boundary. */
function registerFrameworkOwnedRuntime(runtime: VoyantGraphRuntime): void {
  realmAttestationApi().markOwned(runtime)
}

/**
 * Keep the attestation registrar module-private while allowing framework
 * lowering to assemble the runtime before its identity is recorded.
 *
 * This helper is an internal source-module seam; the framework package exports
 * only the assertion at its public runtime-attestation subpath.
 */
export function createFrameworkOwnedRuntime<T extends VoyantGraphRuntime>(create: () => T): T {
  const runtime = create()
  registerFrameworkOwnedRuntime(runtime)
  return runtime
}

/**
 * Require an authentic framework runtime before crossing into MCP.
 *
 * Structural graph objects cannot satisfy this assertion, and selected
 * conditional actions additionally require the post-preflight activated view.
 */
export function assertVoyantGraphMcpRuntime(
  runtime: unknown,
): asserts runtime is VoyantGraphActivatedRuntime {
  if (
    typeof runtime !== "object" ||
    runtime === null ||
    !realmAttestationApi().isOwned(runtime as VoyantGraphRuntime)
  ) {
    throw new Error(
      "VOYANT_GRAPH_RUNTIME_NOT_FRAMEWORK_OWNED: MCP registration requires a runtime created by the framework.",
    )
  }
  assertConditionalActionRuntimeActivated(runtime as VoyantGraphRuntime)
}

/** Register activation-only loaders without adding them to the enumerable runtime graph. */
export function registerConditionalActionRuntimeState(
  runtime: VoyantGraphRuntime,
  units: readonly VoyantGraphConditionalActionProvisionalUnit[],
): void {
  const byUnit = new Map(units.map((unit) => [unit.unitId, unit]))
  const candidateToolIds = new Set(units.flatMap((unit) => unit.tools.map(({ id }) => id)))
  const expectedToolIds = new Set(
    selectedConditionalActions(runtime).flatMap((action) => action.from.tools),
  )
  if (
    candidateToolIds.size !== expectedToolIds.size ||
    [...candidateToolIds].some((id) => !expectedToolIds.has(id))
  ) {
    throw new Error(
      "VOYANT_GRAPH_CONDITIONAL_ACTION_CANDIDATES_INVALID: provisional Tool loaders do not exactly match selected conditional actions.",
    )
  }
  provisionalUnits.set(runtime, byUnit)
}

/**
 * Run every action-owner conformance kit for an exactly selected graph
 * provider before recording that its conditional actions may be activated.
 */
export async function preflightSelectedConditionalActionProvider(
  runtimeView: VoyantGraphRuntime,
  portId: string,
  provider: unknown,
): Promise<void> {
  const runtime = baseRuntime(runtimeView)
  const requirements = conditionalPortRequirements(runtime).filter(
    (requirement) => requirement.portId === portId,
  )
  if (requirements.length === 0) return

  let byPort = conditionalPortPreflights.get(runtime)
  if (!byPort) {
    byPort = new Map()
    conditionalPortPreflights.set(runtime, byPort)
  }
  const existing = byPort.get(portId)
  if (existing) {
    if (!Object.is(existing.provider, provider)) {
      throw new Error(
        `VOYANT_GRAPH_CONDITIONAL_ACTION_PROVIDER_DRIFT: provider port "${portId}" changed after startup preflight.`,
      )
    }
    return existing.promise
  }

  const promise = (async () => {
    for (const requirement of requirements) {
      const port = await requirement.conformance.load<unknown>()
      assertTypedPortConformance(port, requirement)
      await port.test(provider)
    }
    let attestations = conditionalPortAttestations.get(runtime)
    if (!attestations) {
      attestations = new Map()
      conditionalPortAttestations.set(runtime, attestations)
    }
    attestations.set(portId, provider)
  })()
  byPort.set(portId, { provider, promise })
  return promise
}

/** Provider ports whose exact selected instances must pass activation preflight. */
export function conditionalActionProviderPortIds(runtimeView: VoyantGraphRuntime): string[] {
  return [
    ...new Set(conditionalPortRequirements(baseRuntime(runtimeView)).map(({ portId }) => portId)),
  ].sort()
}

/**
 * Produce the only runtime view that enumerates selected conditional actions
 * and Tools. The view is registered in module-private state and cannot be
 * manufactured by a structural callback or public marker.
 */
export function activateConditionalActionRuntime(
  runtimeView: VoyantGraphRuntime,
): VoyantGraphActivatedRuntime {
  const runtime = baseRuntime(runtimeView)
  const requirements = conditionalPortRequirements(runtime)
  if (requirements.length === 0) return runtime as VoyantGraphActivatedRuntime
  const cached = activatedRuntimeViews.get(runtime)
  if (cached) return cached

  const attestations = conditionalPortAttestations.get(runtime)
  for (const { action, portId } of requirements) {
    if (!attestations?.has(portId)) {
      throw new Error(
        `VOYANT_GRAPH_CONDITIONAL_ACTION_NOT_PREFLIGHTED: action "${action.id}" requires selected provider port "${portId}" to pass factory and typed-port conformance before activation.`,
      )
    }
  }

  const activatedActionIds = new Set(requirements.map(({ action }) => action.id))
  const byUnit = provisionalUnits.get(runtime)
  if (!byUnit) {
    throw new Error(
      "VOYANT_GRAPH_CONDITIONAL_ACTION_CANDIDATES_MISSING: activation-only runtime state was not registered by the framework.",
    )
  }
  const activateUnits = (units: readonly VoyantGraphRuntimeUnitLoader[]) =>
    units.map((unit) => activateRuntimeUnit(unit, byUnit.get(unit.id), activatedActionIds))
  const modules = Object.freeze(activateUnits(runtime.modules))
  const extensions = Object.freeze(activateUnits(runtime.extensions))
  const plugins = Object.freeze(activateUnits(runtime.plugins))
  const adapters = Object.freeze(activateUnits(runtime.adapters ?? []))
  const providerUnits = Object.freeze(activateUnits(runtime.providerUnits ?? []))
  const units = [...modules, ...extensions, ...plugins, ...adapters, ...providerUnits]
  const references = Object.freeze(units.flatMap((unit) => unit.references))
  const referenceById = new Map(references.map((reference) => [reference.id, reference]))
  const activated: VoyantGraphActivatedRuntime = createFrameworkOwnedRuntime(() =>
    deepFreezeRuntimeSnapshot({
      ...runtime,
      modules,
      extensions,
      plugins,
      adapters,
      providerUnits,
      references,
      tools: Object.freeze(units.flatMap((unit) => unit.tools)),
      actions: Object.freeze(units.flatMap((unit) => unit.actions)),
      selectedIds: Object.freeze({
        ...runtime.selectedIds,
        tools: Object.freeze(sortedUnique(units.flatMap((unit) => unit.selectedIds.tools))),
      }),
      loadReference: async <T = unknown>(referenceId: string): Promise<T> => {
        const reference = referenceById.get(referenceId)
        return reference ? reference.load<T>() : runtime.loadReference<T>(referenceId)
      },
    }),
  )
  const exactAttestations = new Map(attestations)
  realmAttestationApi().setActivatedState(activated, {
    base: runtime,
    attestations: exactAttestations,
  })
  activatedRuntimeViews.set(runtime, activated)
  return activated
}

/**
 * Require the framework-owned activated view. Composition may additionally
 * require every conditional port binding to be the exact attested instance.
 */
export function assertConditionalActionRuntimeActivated(
  runtime: VoyantGraphRuntime,
  ports?: VoyantGraphRuntimePorts,
  requireBoundPorts = false,
): asserts runtime is VoyantGraphActivatedRuntime {
  const activated = realmAttestationApi().getActivatedState(runtime)
  if (!activated) {
    if (conditionalPortRequirements(runtime).length === 0) return
    throw new Error(
      "VOYANT_GRAPH_CONDITIONAL_ACTION_NOT_ACTIVATED: selected conditional actions require a framework-owned activated runtime view.",
    )
  }
  for (const [portId, provider] of activated.attestations) {
    if (
      (requireBoundPorts || ports !== undefined) &&
      (!ports || !Object.hasOwn(ports, portId) || !Object.is(ports[portId], provider))
    ) {
      throw new Error(
        `VOYANT_GRAPH_CONDITIONAL_ACTION_PROVIDER_DRIFT: activated provider port "${portId}" is not the exact preflighted selected graph provider.`,
      )
    }
  }
}

function activateRuntimeUnit(
  unit: VoyantGraphRuntimeUnitLoader,
  provisional: VoyantGraphConditionalActionProvisionalUnit | undefined,
  activatedActionIds: ReadonlySet<string>,
): VoyantGraphRuntimeUnitLoader {
  const actions = Object.freeze(
    unit.actions.map((action) =>
      activatedActionIds.has(action.id)
        ? Object.freeze({ ...action, availability: { status: "available" as const } })
        : action,
    ),
  )
  const references = Object.freeze([...unit.references, ...(provisional?.references ?? [])])
  const tools = Object.freeze([...unit.tools, ...(provisional?.tools ?? [])])
  return Object.freeze({
    ...unit,
    references,
    tools,
    actions,
    selectedIds: Object.freeze({
      ...unit.selectedIds,
      tools: Object.freeze(sortedUnique([...unit.selectedIds.tools, ...tools.map(({ id }) => id)])),
    }),
  })
}

function conditionalPortRequirements(runtime: VoyantGraphRuntime): ConditionalRequirement[] {
  const units = [
    ...runtime.modules,
    ...runtime.extensions,
    ...runtime.plugins,
    ...(runtime.adapters ?? []),
    ...(runtime.providerUnits ?? []),
  ]
  const byUnitId = new Map(units.map((unit) => [unit.id, unit]))
  return selectedConditionalActions(runtime).flatMap((action) => {
    const condition =
      action.availability?.status === "unavailable" ? action.availability.enableWhen : undefined
    if (!condition) return []
    const owner = byUnitId.get(action.unitId)
    return selectedConditionalPorts(runtime, action).map((portId) => {
      const conformance = owner?.runtimePortConformance?.find(
        (candidate) => candidate.portId === portId,
      )
      if (!conformance) {
        throw new Error(
          `VOYANT_GRAPH_CONDITIONAL_ACTION_CONFORMANCE_MISSING: action "${action.id}" has no admitted typed-port conformance loader for "${portId}".`,
        )
      }
      return { action, portId, conformance }
    })
  })
}

function selectedConditionalActions(
  runtime: VoyantGraphRuntime,
): VoyantGraphRuntimeActionDefinition[] {
  return runtime.actions.filter((action) => {
    if (action.availability?.status !== "unavailable" || !action.availability.enableWhen) {
      return false
    }
    const ports = selectedConditionalPorts(runtime, action)
    const condition = action.availability.enableWhen.selectedProviderPorts
    return condition.mode === "all" ? ports.length === condition.ports.length : ports.length > 0
  })
}

function selectedConditionalPorts(
  runtime: VoyantGraphRuntime,
  action: VoyantGraphRuntimeActionDefinition,
): string[] {
  const condition =
    action.availability?.status === "unavailable" ? action.availability.enableWhen : undefined
  if (!condition) return []
  return condition.selectedProviderPorts.ports.filter((portId) => {
    const selectedCount = runtime.providers.filter(({ declaration }) => {
      const selection = declaration.selection
      return (
        declaration.port === portId &&
        selection !== undefined &&
        runtime.providerSelections[selection.role] === selection.value
      )
    }).length
    if (selectedCount > 1) {
      throw new Error(
        `VOYANT_GRAPH_CONDITIONAL_ACTION_PROVIDER_AMBIGUOUS: action "${action.id}" resolves provider port "${portId}" more than once at runtime.`,
      )
    }
    return selectedCount === 1
  })
}

function assertTypedPortConformance(
  value: unknown,
  requirement: Pick<ConditionalRequirement, "action" | "portId">,
): asserts value is VoyantPort<unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { id?: unknown }).id !== requirement.portId ||
    typeof (value as { test?: unknown }).test !== "function"
  ) {
    throw new Error(
      `VOYANT_GRAPH_CONDITIONAL_ACTION_CONFORMANCE_INVALID: action "${requirement.action.id}" conformance export for "${requirement.portId}" is not that typed VoyantPort.`,
    )
  }
}

function baseRuntime(runtime: VoyantGraphRuntime): VoyantGraphRuntime {
  return realmAttestationApi().getActivatedState(runtime)?.base ?? runtime
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}
