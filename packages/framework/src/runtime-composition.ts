// agent-quality: file-size exception -- owner: framework; graph runtime bindings, contributors, ports, and activation share one public composition contract.
import type {
  EventEnvelope,
  SubscriberRuntimeDescriptor,
  VoyantRuntimeHostPrimitives,
} from "@voyant-travel/core"
import {
  isGraphRuntimeFactory,
  type VoyantGraphCustomFieldTarget,
  type VoyantGraphRuntimeFactoryContext,
  type VoyantPort,
} from "@voyant-travel/core/project"
import type { ApiExtension, ApiModule } from "@voyant-travel/hono/module"
import { assertConditionalActionRuntimeActivated } from "./conditional-action-availability.js"
import type { VoyantGraphRuntime, VoyantGraphRuntimeUnitLoader } from "./runtime-lowering.js"

export interface VoyantGraphRuntimeBindingContext<TCapabilities> {
  capabilities: TCapabilities
  unit: VoyantGraphRuntimeUnitLoader
  runtimeExports: readonly unknown[]
  /**
   * The context the default path would have passed to this unit's runtime
   * export. A binding replaces that call, so a unit whose export is a
   * `defineGraphRuntimeFactory` is unreachable without it — ports resolve
   * through this context and it cannot be reconstructed outside composition.
   * Pass it straight through when re-invoking such an export.
   */
  factoryContext: VoyantGraphRuntimeFactoryContext
}

export type VoyantGraphRuntimeBinding<TCapabilities> = (
  context: VoyantGraphRuntimeBindingContext<TCapabilities>,
) =>
  | ApiModule
  | readonly ApiModule[]
  | ApiExtension
  | readonly ApiExtension[]
  | undefined
  | Promise<ApiModule | readonly ApiModule[] | ApiExtension | readonly ApiExtension[] | undefined>

export type VoyantGraphRuntimeBindings<TCapabilities> = Readonly<
  Record<string, VoyantGraphRuntimeBinding<TCapabilities>>
>

export type VoyantGraphRuntimePorts = Readonly<Record<string, unknown>>

/**
 * Deployment-owned runtime options for graph units, keyed by stable unit id.
 * See `docs/architecture/graph-host-options.md`.
 */
export type VoyantGraphRuntimeHostOptions = Readonly<
  Record<string, Readonly<Record<string, unknown>>>
>

/** Typed access to the shared record populated by statically selected contributors. */
export interface VoyantGraphRuntimePortResolver {
  hasRuntimePort?(port: Pick<VoyantPort<unknown>, "id">): boolean
  getRuntimePort<T>(port: Pick<VoyantPort<T>, "id">): T | Promise<T>
  getRuntimePorts?<T>(port: Pick<VoyantPort<T>, "id">): readonly T[] | Promise<readonly T[]>
}

/** Stable host surface available to every statically selected runtime contributor. */
export interface VoyantGraphRuntimeContributorHost extends VoyantGraphRuntimePortResolver {
  primitives: VoyantRuntimeHostPrimitives
  /** Immutable custom-field target authority lowered from the selected graph. */
  customFieldTargets: readonly VoyantGraphCustomFieldTarget[]
}

/** Build-time selected package hook that maps host resources to graph runtime ports. */
export type VoyantGraphRuntimeContributor = (
  host: VoyantGraphRuntimeContributorHost,
) => VoyantGraphRuntimePorts

/** Conforming, fail-on-use port shapes for graph inspection and boot probes. */
export function createVoyantGraphRuntimePortStubs(
  runtime: VoyantGraphRuntime,
): VoyantGraphRuntimePorts {
  const units = allRuntimeUnits(runtime)
  const ids = new Set(units.flatMap((unit) => unit.requiredRuntimePorts))
  const manyIds = new Set(units.flatMap((unit) => unit.manyRuntimePorts))
  return Object.fromEntries(
    [...ids].map((id) => [id, manyIds.has(id) ? [runtimePortStub(id)] : runtimePortStub(id)]),
  )
}

function allRuntimeUnits(runtime: VoyantGraphRuntime): readonly VoyantGraphRuntimeUnitLoader[] {
  return [
    ...runtime.modules,
    ...runtime.extensions,
    ...runtime.plugins,
    ...(runtime.adapters ?? []),
    ...(runtime.providerUnits ?? []),
  ]
}

function runtimePortStub(id: string): unknown {
  if (id === "trips.routes-runtime" || id === "commerce.checkout-api-options") return () => ({})
  const unavailable = () => {
    throw new Error(`Runtime port ${id} requires project-specific provider configuration.`)
  }
  const unavailableAsync = async () => unavailable()
  const registrySurface = { resolveRegistry: unavailableAsync }
  const primitives = {
    env: () => ({}),
    database: {
      resolve: unavailable,
      fromContext: unavailable,
      transaction: unavailableAsync,
    },
    storage: {
      resolve: unavailable,
      read: unavailableAsync,
      downloadUrl: unavailableAsync,
    },
    events: { deliver: unavailableAsync },
    config: { read: () => undefined },
  }
  const stub = {
    primitives,
    options: {},
    booking: {},
    publicRoutes: { resolveProductSnapshot: unavailableAsync },
    admin: registrySurface,
    public: registrySurface,
    email: { subject: "Verification code" },
    bootstrap: async () => {},
    register: () => {},
    readConfig: () => undefined,
    enrichOverviewItems: unavailableAsync,
    resolveProductSnapshot: unavailableAsync,
    loadPersonTravelSnapshot: unavailableAsync,
    upsertPersonFromContact: unavailableAsync,
    getPersonById: unavailableAsync,
    getOrganizationById: unavailableAsync,
    withDb: unavailableAsync,
    createRuntime: () => runtimeServiceStub(id),
    createService: () => runtimeServiceStub(id),
    resolveRuntime: unavailableAsync,
    resolveRegistry: unavailableAsync,
    resolveRegistryForWrite: unavailableAsync,
    resolveSourceAdapterRegistry: unavailableAsync,
    ensureSourceRegistry: unavailableAsync,
    getSourceRegistryFromContext: unavailable,
    getOwnedHandlers: unavailable,
    getOwnedHandlersFromContext: unavailable,
    getOwnedAvailabilitySearchHandlers: unavailable,
    buildEmbeddingProvider: () => undefined,
    buildIndexer: () => undefined,
    loadSlices: unavailableAsync,
    fieldPolicyRegistries: () => new Map(),
    createProductsDocumentBuilder: unavailable,
    withEmbedding: unavailable,
    previewOffer: unavailableAsync,
    getProductContent: unavailableAsync,
    listAvailabilitySlots: unavailableAsync,
    getOwnedProductById: unavailableAsync,
    resolveConnectClient: unavailableAsync,
    fetchIndexFields: unavailableAsync,
    resolveDynamicHotelIds: unavailableAsync,
    resolveAirportLabels: unavailableAsync,
    resolveAdapter: unavailable,
    listAdmittedShoppingSources: () => [],
    startCardPayment: unavailableAsync,
    resolveStorage: unavailable,
    resolvePrinter: unavailable,
    signVideoUploadTicket: unavailableAsync,
    checkBookingDrift: unavailableAsync,
    checkFinanceDrift: unavailableAsync,
    checkProductDrift: unavailableAsync,
    resolveParticipantPersonById: unavailableAsync,
    resolveDelegatePersonById: unavailableAsync,
    personExists: unavailableAsync,
    resolveDb: unavailable,
    resolveProviders: () => [],
    resolveDeployment: unavailable,
    sendInvitationEmail: unavailableAsync,
    resolveReminderJobRuntime: () => runtimeServiceStub(id),
    resolveDocumentDownloadUrl: unavailableAsync,
    resolveDocumentStorage: unavailable,
    resolveDocumentGenerator: () => undefined,
    guessMimeType: () => "application/octet-stream",
    resolvePublicProposalBaseUrl: () => "http://localhost:8080",
    priceTripDeps: () => runtimeServiceStub(id),
    reserveTripDeps: () => runtimeServiceStub(id),
    startCheckoutDeps: () => runtimeServiceStub(id),
    cancelTripComponentsDeps: () => runtimeServiceStub(id),
    resolveOperatorProfile: unavailableAsync,
    seedAcceptedProposalBookingSession: unavailableAsync,
    resolveOperatorDefaultPaymentPolicy: unavailableAsync,
    resolveBankTransferInstructions: unavailableAsync,
    resolveBookingTaxSettings: unavailableAsync,
    updateBookingTaxSettings: unavailableAsync,
    resolveNotificationDispatcher: unavailable,
    listBookingReminderRuns: unavailableAsync,
    resolveSupplierPolicy: unavailableAsync,
    resolveSupplierPolicyById: unavailableAsync,
    resolveBookingPolicy: unavailableAsync,
    resolveEntityPolicy: unavailableAsync,
    resolveSupplierId: unavailableAsync,
    createPaymentPolicyRuntime: () => runtimeServiceStub(id),
    stampPolicySourceOnBooking: unavailableAsync,
    readPolicySourceFromInternalNotes: unavailable,
    resolvePaymentStarters: () => ({}),
    getOwnedProductName: unavailableAsync,
    listAllProductIds: unavailableAsync,
    persistAcceptanceDraftContract: unavailableAsync,
    createStartCardPayment: unavailable,
    provider: "inspection",
    poller: unavailableAsync,
    getContract: unavailableAsync,
    listSignatures: unavailableAsync,
    sendContract: unavailableAsync,
    signContract: unavailableAsync,
    generate: unavailableAsync,
  }
  return stub
}

function runtimeServiceStub(id: string): Record<string, (...args: unknown[]) => Promise<never>> {
  return new Proxy(
    {},
    {
      get: () => async () => {
        throw new Error(`Runtime port ${id} requires project-specific provider configuration.`)
      },
    },
  )
}

export interface ComposeVoyantGraphRuntimeInput<TCapabilities> {
  runtime: VoyantGraphRuntime
  capabilities: TCapabilities
  /**
   * Deployment-owned option wiring and local units, keyed by stable graph unit
   * id. A binding only runs when its unit is selected by the generated graph.
   */
  bindings?: VoyantGraphRuntimeBindings<TCapabilities>
  /** Deployment implementations keyed by package-declared port id. */
  ports?: VoyantGraphRuntimePorts
  /**
   * Deployment-owned runtime options keyed by stable graph unit id, merged
   * into each unit's default factory invocation rather than replacing it.
   *
   * This is the seam for host knowledge a package accepts as a runtime option
   * but declares no port for — the canonical case being an allowance that is a
   * property of the request rather than of the container. Unlike a `binding`,
   * the host contributes options and keeps the default composition, so it does
   * not take ownership of invoking the unit correctly.
   *
   * Options for a unit the selected graph does not contain are ignored, which
   * matches `bindings` and lets one host compose several profiles from one
   * option map. Options for a unit that cannot receive them are an error.
   */
  hostOptions?: VoyantGraphRuntimeHostOptions
  /** Node-owned durable boundary for graph-selected outbound webhook events. */
  outboundWebhooks?: {
    enqueue: (event: EventEnvelope, bindings: unknown) => Promise<unknown>
  }
  /** Installed-app durable intake for every selected external event contract. */
  appWebhooks?: {
    enqueue: (event: EventEnvelope, bindings: unknown) => Promise<unknown>
  }
}

export interface VoyantGraphRuntimeComposition {
  modules: ApiModule[]
  extensions: ApiExtension[]
  accessResources: {
    path: string
    resource: string
    authorization?: "coarse" | "route"
  }[]
  routePosture: VoyantGraphRuntimeRoutePosture
}

/** Absolute path posture derived only from selected graph API bundles. */
export interface VoyantGraphRuntimeRoutePosture {
  publicPaths: string[]
  transactionalPaths: string[]
}

/**
 * Invoke one fixed job from the admitted graph without accepting a run payload.
 * Scheduling, retries, leases, and health remain deployment-host concerns.
 */
export async function invokeVoyantGraphJob(
  runtime: VoyantGraphRuntime,
  jobId: string,
  ports?: VoyantGraphRuntimePorts,
  bindings?: unknown,
): Promise<void> {
  const owner = allRuntimeUnits(runtime).find((unit) =>
    unit.jobs.some((job) => job.declaration.id === jobId),
  )
  const job = owner?.jobs.find((candidate) => candidate.declaration.id === jobId)
  if (!owner || !job) {
    throw new Error(`invokeVoyantGraphJob: job "${jobId}" is not selected by the graph.`)
  }
  const handler = await job.load()
  await handler({ ...createRuntimeFactoryContext(runtime, ports, owner), bindings })
}

/** Load graph-owned subscriber metadata without composing API routes. */
export async function composeVoyantGraphRuntimeFacetModules(
  runtime: VoyantGraphRuntime,
  ports?: VoyantGraphRuntimePorts,
  hostOptions?: VoyantGraphRuntimeHostOptions,
): Promise<ApiModule[]> {
  assertConditionalActionRuntimeActivated(runtime, ports, true)
  return composeRuntimeFacetModules(
    runtime,
    createRuntimeFactoryContexts(runtime, ports, hostOptions),
  )
}

async function composeRuntimeFacetModules(
  runtime: VoyantGraphRuntime,
  factoryContexts: ReadonlyMap<VoyantGraphRuntimeUnitLoader, VoyantGraphRuntimeFactoryContext>,
): Promise<ApiModule[]> {
  const modules: ApiModule[] = []
  for (const unit of allRuntimeUnits(runtime)) {
    const module = await resolveRuntimeFacetModule(
      unit,
      requireRuntimeFactoryContext(factoryContexts, unit),
    )
    if (module) modules.push(module)
  }
  return modules
}

/**
 * Resolve selected graph runtime exports into the arrays consumed by mountApp.
 * Duplicate API facets are collapsed by the lowered unit loader before a
 * factory or deployment binding is invoked.
 */
export async function composeVoyantGraphRuntime<TCapabilities>(
  input: ComposeVoyantGraphRuntimeInput<TCapabilities>,
): Promise<VoyantGraphRuntimeComposition> {
  assertConditionalActionRuntimeActivated(input.runtime, input.ports, true)
  const modules: ApiModule[] = []
  const extensions: ApiExtension[] = []
  const factoryContexts = createRuntimeFactoryContexts(
    input.runtime,
    input.ports,
    input.hostOptions,
  )

  for (const unit of input.runtime.modules) {
    const outputs = await resolveRuntimeUnit(
      input,
      unit,
      requireRuntimeFactoryContext(factoryContexts, unit),
    )
    assertWebhookRoutePosture(input.runtime, unit, outputs)
    const routePosture = deriveUnitRoutePosture(unit)
    for (const output of outputs) {
      if (!isApiModule(output)) {
        throw invalidRuntimeOutput(unit, "ApiModule", output)
      }
      modules.push(applyModuleRoutePosture(output, routePosture))
    }
  }

  for (const unit of input.runtime.extensions) {
    const outputs = await resolveRuntimeUnit(
      input,
      unit,
      requireRuntimeFactoryContext(factoryContexts, unit),
    )
    assertWebhookRoutePosture(input.runtime, unit, outputs)
    const routePosture = deriveUnitRoutePosture(unit)
    for (const output of outputs) {
      if (!isApiExtension(output)) {
        throw invalidRuntimeOutput(unit, "ApiExtension", output)
      }
      extensions.push(applyExtensionRoutePosture(output, routePosture))
    }
  }

  for (const unit of [
    ...input.runtime.plugins,
    ...(input.runtime.adapters ?? []),
    ...(input.runtime.providerUnits ?? []),
  ]) {
    const outputs = await resolveRuntimeUnit(
      input,
      unit,
      requireRuntimeFactoryContext(factoryContexts, unit),
    )
    assertWebhookRoutePosture(input.runtime, unit, outputs)
    const routePosture = deriveUnitRoutePosture(unit)
    for (const output of outputs) {
      if (isApiModule(output)) {
        modules.push(applyModuleRoutePosture(output, routePosture))
      } else if (isApiExtension(output)) {
        extensions.push(applyExtensionRoutePosture(output, routePosture))
      } else {
        throw invalidRuntimeOutput(unit, "ApiModule or ApiExtension", output)
      }
    }
  }

  modules.push(...(await composeRuntimeFacetModules(input.runtime, factoryContexts)))
  const outboundWebhookModule = createGraphOutboundWebhookModule(input)
  if (outboundWebhookModule) modules.push(outboundWebhookModule)
  const appWebhookModule = createGraphAppWebhookModule(input)
  if (appWebhookModule) modules.push(appWebhookModule)

  return {
    modules,
    extensions,
    accessResources: deriveAccessResources(input.runtime),
    routePosture: mergeRoutePostures(allRuntimeUnits(input.runtime).map(deriveUnitRoutePosture)),
  }
}

function deriveAccessResources(runtime: VoyantGraphRuntime): {
  path: string
  resource: string
  authorization?: "coarse" | "route"
}[] {
  return allRuntimeUnits(runtime)
    .flatMap((unit) =>
      unit.routes.flatMap(({ route }) =>
        route.resource
          ? [
              {
                path: resolveVoyantGraphRouteMountPath(unit, route),
                resource: route.resource,
                ...(route.authorization ? { authorization: route.authorization } : {}),
              },
            ]
          : [],
      ),
    )
    .sort(
      (left, right) =>
        left.path.localeCompare(right.path) || left.resource.localeCompare(right.resource),
    )
}

interface UnitRoutePosture extends VoyantGraphRuntimeRoutePosture {
  publicMount?: string
  anonymous: boolean | readonly string[] | undefined
}

function deriveUnitRoutePosture(unit: VoyantGraphRuntimeUnitLoader): UnitRoutePosture {
  const publicRoutes = unit.routes.filter(({ route }) => route.surface === "public")
  const publicMounts = sortedUnique(
    publicRoutes.map(({ route }) => resolveVoyantGraphRouteMountPath(unit, route)),
  )
  const publicPaths = sortedUnique(
    unit.routes.flatMap(({ route }) => {
      const mount = resolveVoyantGraphRouteMountPath(unit, route)
      if (route.anonymous === true) return [mount]
      if (!route.anonymous) return []
      return route.anonymous.map((path) => resolveRoutePosturePath(mount, path))
    }),
  )
  const transactionalPaths = sortedUnique(
    unit.routes.flatMap(({ route }) => {
      const mount = resolveVoyantGraphRouteMountPath(unit, route)
      if (route.transactional === true) return [mount]
      if (!route.transactional) return []
      return route.transactional.map((path) => resolveRoutePosturePath(mount, path))
    }),
  )
  const publicMount = publicMounts.length === 1 ? publicMounts[0] : undefined
  const anonymous = publicMount ? anonymousForPublicMount(publicMount, publicPaths) : undefined

  return { publicPaths, transactionalPaths, publicMount, anonymous }
}

export function resolveVoyantGraphRouteMountPath(
  unit: Pick<VoyantGraphRuntimeUnitLoader, "id" | "localId">,
  route: VoyantGraphRuntimeUnitLoader["routes"][number]["route"],
): string {
  if (route.mount?.startsWith("/v1/")) return normalizeAbsolutePath(route.mount)
  const segment = route.mount ?? unit.localId ?? unit.id.split("#").at(-1) ?? unit.id
  const mount = segment.replace(/^\/+|\/+$/g, "")
  if (route.surface === "admin") return appendPath("/v1/admin", mount)
  if (route.surface === "public") return appendPath("/v1/public", mount)
  if (route.surface === "webhook") return appendPath("/v1", mount)
  return `/${mount}`
}

function resolveRoutePosturePath(mount: string, path: string): string {
  const normalizedPath = normalizeAbsolutePath(path)
  if (normalizedPath === mount || normalizedPath.startsWith(`${mount}/`)) return normalizedPath
  return appendPath(mount, path.replace(/^\/+|\/+$/g, ""))
}

function appendPath(mount: string, relative: string): string {
  return relative ? `${normalizeAbsolutePath(mount)}/${relative}` : normalizeAbsolutePath(mount)
}

function anonymousForPublicMount(
  publicMount: string,
  publicPaths: readonly string[],
): boolean | readonly string[] | undefined {
  if (publicPaths.includes(publicMount)) return true
  const prefix = `${publicMount}/`
  const relative = publicPaths
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(publicMount.length))
  return relative.length > 0 ? relative : undefined
}

function applyModuleRoutePosture(output: ApiModule, posture: UnitRoutePosture): ApiModule {
  return {
    ...output,
    ...(output.publicPath === undefined && posture.publicMount
      ? { publicPath: publicPathFromMount(posture.publicMount) }
      : {}),
    ...(posture.anonymous !== undefined ? { anonymous: posture.anonymous } : {}),
    ...(posture.transactionalPaths.length > 0
      ? {
          transactionalPaths: sortedUnique([
            ...(output.transactionalPaths ?? []),
            ...posture.transactionalPaths,
          ]),
        }
      : {}),
  }
}

function applyExtensionRoutePosture(output: ApiExtension, posture: UnitRoutePosture): ApiExtension {
  return {
    ...output,
    ...(output.publicPath === undefined && posture.publicMount
      ? { publicPath: publicPathFromMount(posture.publicMount) }
      : {}),
    ...(posture.anonymous !== undefined ? { anonymous: posture.anonymous } : {}),
    ...(posture.transactionalPaths.length > 0
      ? {
          transactionalPaths: sortedUnique([
            ...(output.transactionalPaths ?? []),
            ...posture.transactionalPaths,
          ]),
        }
      : {}),
  }
}

function publicPathFromMount(mount: string): string {
  if (mount === "/v1/public") return "/"
  const prefix = "/v1/public/"
  return mount.startsWith(prefix) ? mount.slice(prefix.length) : mount
}

function mergeRoutePostures(
  postures: readonly VoyantGraphRuntimeRoutePosture[],
): VoyantGraphRuntimeRoutePosture {
  return {
    publicPaths: sortedUnique(postures.flatMap(({ publicPaths }) => publicPaths)),
    transactionalPaths: sortedUnique(
      postures.flatMap(({ transactionalPaths }) => transactionalPaths),
    ),
  }
}

function normalizeAbsolutePath(path: string): string {
  return path === "/" ? path : path.replace(/\/+$/g, "")
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function createGraphOutboundWebhookModule<TCapabilities>(
  input: ComposeVoyantGraphRuntimeInput<TCapabilities>,
): ApiModule | undefined {
  const enqueue = input.outboundWebhooks?.enqueue
  if (!enqueue || input.runtime.webhooks.outbound.length === 0) return undefined

  return {
    module: {
      name: "graph-outbound-webhooks",
      bootstrap: ({ bindings, eventBus }) => {
        const declarations = new Map(
          input.runtime.webhooks.outbound.map((declaration) => [
            declaration.eventType,
            declaration,
          ]),
        )
        for (const declaration of declarations.values()) {
          eventBus.subscribe(declaration.eventType, async (event) => {
            await enqueue(
              {
                ...event,
                metadata: {
                  ...event.metadata,
                  category: declaration.audit.category,
                  graphEventId: declaration.eventId,
                  graphEventVersion: declaration.eventVersion,
                  graphEventPayloadSchema: declaration.payloadSchema,
                  graphEventSourceModule: declaration.audit.sourceModule,
                },
              },
              bindings,
            )
          })
        }
      },
    },
  }
}

function createGraphAppWebhookModule<TCapabilities>(
  input: ComposeVoyantGraphRuntimeInput<TCapabilities>,
): ApiModule | undefined {
  const enqueue = input.appWebhooks?.enqueue
  if (!enqueue) return undefined
  const declarations = input.runtime.eventCatalog.events.filter(
    (event) => event.visibility === "external",
  )
  if (declarations.length === 0) return undefined

  return {
    module: {
      name: "graph-app-webhooks",
      bootstrap: ({ bindings, eventBus }) => {
        for (const declaration of declarations) {
          eventBus.subscribe(declaration.eventType, async (event) => {
            await enqueue(
              {
                ...event,
                metadata: {
                  ...event.metadata,
                  category: declaration.audit.category,
                  graphEventId: declaration.id,
                  graphEventVersion: declaration.version,
                  graphEventPayloadSchema: declaration.payloadSchema,
                  graphEventSourceModule: declaration.audit.sourceModule,
                },
              },
              bindings,
            )
          })
        }
      },
    },
  }
}

function assertWebhookRoutePosture(
  runtime: VoyantGraphRuntime,
  unit: VoyantGraphRuntimeUnitLoader,
  outputs: readonly unknown[],
): void {
  const declared = runtime.webhooks.inbound.some((entry) => entry.apiUnitId === unit.id)
  const executable = outputs.some(
    (output) => isRecord(output) && output.webhookRoutes !== undefined,
  )
  if (declared === executable) return

  throw new Error(
    declared
      ? `composeVoyantGraphRuntime: ${unit.kind} "${unit.id}" declares an inbound webhook plan but its runtime output has no webhookRoutes.`
      : `composeVoyantGraphRuntime: ${unit.kind} "${unit.id}" returned webhookRoutes without an inbound webhook declaration in the selected graph.`,
  )
}

async function resolveRuntimeFacetModule(
  unit: VoyantGraphRuntimeUnitLoader,
  factoryContext: VoyantGraphRuntimeFactoryContext,
): Promise<ApiModule | undefined> {
  const subscribers = await loadSubscriberFacets(unit, factoryContext)
  if (subscribers.length === 0) {
    return undefined
  }

  return {
    module: {
      name: `${unit.localId ?? unit.id}.graph-runtime`,
      ...(subscribers.length > 0
        ? {
            bootstrap: async (context) => {
              for (const subscriber of subscribers) {
                await subscriber.register(context)
              }
            },
          }
        : {}),
    },
  }
}

async function loadSubscriberFacets(
  unit: VoyantGraphRuntimeUnitLoader,
  factoryContext: VoyantGraphRuntimeFactoryContext,
): Promise<SubscriberRuntimeDescriptor[]> {
  const subscribers: SubscriberRuntimeDescriptor[] = []

  for (const reference of unit.references.filter(
    (candidate) => candidate.facet === "subscribers.runtime",
  )) {
    const runtimeExport = await reference.load<unknown>()
    const value = isGraphRuntimeFactory(runtimeExport)
      ? await runtimeExport(factoryContext)
      : runtimeExport
    if (isSubscriberRuntimeDescriptor(value)) {
      if (value.id !== reference.entityId) {
        throw new Error(
          `composeVoyantGraphRuntime: subscriber runtime "${value.id}" does not match graph subscriber "${reference.entityId}".`,
        )
      }
      subscribers.push(value)
      continue
    }
    throw new Error(
      `composeVoyantGraphRuntime: subscriber runtime "${reference.entityId}" must export a SubscriberRuntimeDescriptor.`,
    )
  }

  return subscribers
}

async function resolveRuntimeUnit<TCapabilities>(
  input: ComposeVoyantGraphRuntimeInput<TCapabilities>,
  unit: VoyantGraphRuntimeUnitLoader,
  factoryContext: VoyantGraphRuntimeFactoryContext,
): Promise<unknown[]> {
  const runtimeExports = uniqueRuntimeExports(await unit.load())
  const binding = input.bindings?.[unit.id]
  if (binding) {
    return normalizeRuntimeOutputs(
      await binding({ capabilities: input.capabilities, unit, runtimeExports, factoryContext }),
    )
  }

  const hostOptions = suppliedHostOptions(input, unit)
  assertHostOptionsDeliverable(unit, runtimeExports, hostOptions)

  const outputs: unknown[] = []
  for (const runtimeExport of runtimeExports) {
    const output = isGraphRuntimeFactory(runtimeExport)
      ? await runtimeExport(factoryContext)
      : typeof runtimeExport === "function"
        ? // Only when the deployment supplied options: an option-bearing
          // factory reads them from its own parameter rather than from a
          // factory context it never receives. Absent options the call stays
          // argument-free, so the default path is unchanged.
          await (hostOptions ? runtimeExport(hostOptions) : runtimeExport())
        : runtimeExport
    outputs.push(...normalizeRuntimeOutputs(output))
  }
  return outputs
}

/** The deployment's options for this unit, or undefined when it supplied none. */
function suppliedHostOptions<TCapabilities>(
  input: ComposeVoyantGraphRuntimeInput<TCapabilities>,
  unit: VoyantGraphRuntimeUnitLoader,
): Readonly<Record<string, unknown>> | undefined {
  const options = input.hostOptions?.[unit.id]
  return options && Object.keys(options).length > 0 ? options : undefined
}

/**
 * A unit whose runtime export is a plain value takes neither a factory context
 * nor a parameter, so options addressed to it would be dropped in silence —
 * the host believing it installed something that is not there. Fail composition
 * instead.
 */
function assertHostOptionsDeliverable(
  unit: VoyantGraphRuntimeUnitLoader,
  runtimeExports: readonly unknown[],
  hostOptions: Readonly<Record<string, unknown>> | undefined,
): void {
  if (!hostOptions) return
  if (runtimeExports.some((runtimeExport) => typeof runtimeExport === "function")) return

  throw new Error(
    `composeVoyantGraphRuntime: ${unit.kind} "${unit.id}" was given host options but its runtime export is not callable, so they cannot reach it.`,
  )
}

function createRuntimeFactoryContext(
  runtime: VoyantGraphRuntime,
  ports: VoyantGraphRuntimePorts | undefined,
  unit: VoyantGraphRuntimeUnitLoader,
  hostOptions?: VoyantGraphRuntimeHostOptions,
): VoyantGraphRuntimeFactoryContext {
  return {
    unitId: unit.id,
    projectConfig: unit.projectConfig,
    getUnitProjectConfig: (unitId) =>
      allRuntimeUnits(runtime).find((selectedUnit) => selectedUnit.id === unitId)?.projectConfig,
    api: unit.routes.map(({ route }) => ({ id: route.id, surface: route.surface })),
    graph: runtime,
    runtimePorts: ports ?? {},
    hostOptions: hostOptions?.[unit.id] ?? {},
    hasPort: <TProvider>(port: VoyantPort<TProvider>): boolean => {
      assertDeclaredRuntimePort(unit, port)
      return Object.hasOwn(ports ?? {}, port.id)
    },
    getPort: async <TProvider>(port: VoyantPort<TProvider>): Promise<TProvider> => {
      assertDeclaredRuntimePort(unit, port)
      if (unit.manyRuntimePorts.includes(port.id)) {
        throw new Error(
          `composeVoyantGraphRuntime: ${unit.kind} "${unit.id}" must read many-valued port "${port.id}" with getPorts().`,
        )
      }
      if (!Object.hasOwn(ports ?? {}, port.id)) {
        const requirement = unit.requiredRuntimePorts.includes(port.id)
          ? "requires runtime port"
          : "optional runtime port"
        throw new Error(
          `composeVoyantGraphRuntime: ${unit.kind} "${unit.id}" ${requirement} "${port.id}", but the deployment did not bind it.`,
        )
      }
      const provider = await (ports![port.id] as TProvider | Promise<TProvider>)
      await port.test(provider)
      return provider
    },
    getPorts: async <TProvider>(port: VoyantPort<TProvider>): Promise<readonly TProvider[]> => {
      assertDeclaredRuntimePort(unit, port)
      if (!unit.manyRuntimePorts.includes(port.id)) {
        throw new Error(
          `composeVoyantGraphRuntime: ${unit.kind} "${unit.id}" cannot read one-valued port "${port.id}" with getPorts().`,
        )
      }
      if (!Object.hasOwn(ports ?? {}, port.id)) {
        if (!unit.requiredRuntimePorts.includes(port.id)) return []
        throw new Error(
          `composeVoyantGraphRuntime: ${unit.kind} "${unit.id}" requires runtime port "${port.id}", but the deployment did not bind it.`,
        )
      }
      const providers = await (ports![port.id] as
        | readonly TProvider[]
        | Promise<readonly TProvider[]>)
      if (!Array.isArray(providers)) {
        throw new Error(
          `composeVoyantGraphRuntime: many-valued port "${port.id}" must be bound as an array.`,
        )
      }
      for (const provider of providers) await port.test(provider)
      return providers
    },
  }
}

function createRuntimeFactoryContexts(
  runtime: VoyantGraphRuntime,
  ports: VoyantGraphRuntimePorts | undefined,
  hostOptions?: VoyantGraphRuntimeHostOptions,
): ReadonlyMap<VoyantGraphRuntimeUnitLoader, VoyantGraphRuntimeFactoryContext> {
  return new Map(
    allRuntimeUnits(runtime).map((unit) => [
      unit,
      createRuntimeFactoryContext(runtime, ports, unit, hostOptions),
    ]),
  )
}

function requireRuntimeFactoryContext(
  contexts: ReadonlyMap<VoyantGraphRuntimeUnitLoader, VoyantGraphRuntimeFactoryContext>,
  unit: VoyantGraphRuntimeUnitLoader,
): VoyantGraphRuntimeFactoryContext {
  const context = contexts.get(unit)
  if (!context) {
    throw new Error(
      `composeVoyantGraphRuntime: no runtime factory context for ${unit.kind} "${unit.id}".`,
    )
  }
  return context
}

function assertDeclaredRuntimePort<TProvider>(
  unit: VoyantGraphRuntimeUnitLoader,
  port: VoyantPort<TProvider>,
): void {
  if (!unit.runtimePorts.includes(port.id)) {
    throw new Error(
      `composeVoyantGraphRuntime: ${unit.kind} "${unit.id}" requested undeclared port "${port.id}".`,
    )
  }
}

function uniqueRuntimeExports(runtimeExports: readonly unknown[]): unknown[] {
  const seen = new Set<unknown>()
  return runtimeExports.filter((runtimeExport) => {
    if (seen.has(runtimeExport)) return false
    seen.add(runtimeExport)
    return true
  })
}

function normalizeRuntimeOutputs(output: unknown): unknown[] {
  if (output === undefined) return []
  return Array.isArray(output) ? output : [output]
}

function isApiModule(value: unknown): value is ApiModule {
  return isRecord(value) && isRecord(value.module) && isNonEmptyString(value.module.name)
}

function isApiExtension(value: unknown): value is ApiExtension {
  return (
    isRecord(value) &&
    isRecord(value.extension) &&
    isNonEmptyString(value.extension.name) &&
    isNonEmptyString(value.extension.module)
  )
}

function isSubscriberRuntimeDescriptor(value: unknown): value is SubscriberRuntimeDescriptor {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.eventType) &&
    typeof value.register === "function"
  )
}

function invalidRuntimeOutput(
  unit: VoyantGraphRuntimeUnitLoader,
  expected: "ApiModule" | "ApiExtension" | "ApiModule or ApiExtension",
  output: unknown,
): Error {
  return new Error(
    `composeVoyantGraphRuntime: ${unit.kind} "${unit.id}" must resolve to ${expected} output, got ${describeValue(output)}.`,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function describeValue(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  return typeof value
}
