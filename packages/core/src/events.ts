/**
 * High-level classification for public event consumers.
 *
 * - `domain` events represent business milestones that other modules or
 *   external integrations may reasonably care about.
 * - `internal` events are service/process signals that remain useful for
 *   subscribers, diagnostics, and automation, but are not part of the core
 *   business language.
 */
export type EventCategory = "domain" | "internal"

/**
 * Where an event was emitted from. This helps consumers understand whether
 * an event originated from a workflow boundary, a lower-level service, or a
 * transport/runtime edge.
 */
export type EventSource = "workflow" | "service" | "route" | "subscriber" | "system"

/**
 * Optional metadata attached to an emitted event.
 *
 * Templates and adapters may extend this with runtime-specific fields such as
 * correlation identifiers or delivery handles.
 */
export interface EventMetadata {
  category?: EventCategory
  source?: EventSource
  correlationId?: string
  causationId?: string
  [key: string]: unknown
}

/**
 * Standard event envelope delivered to subscribers.
 */
export interface EventEnvelope<
  TData = unknown,
  TMetadata extends EventMetadata | undefined = EventMetadata | undefined,
> {
  /** Event name, following the `<resource>.<pastTenseAction>` convention. */
  name: string
  /** Business payload emitted by the caller. */
  data: TData
  /** Optional metadata for source/taxonomy/tracing. */
  metadata?: TMetadata
  /** ISO timestamp indicating when the event was emitted. */
  emittedAt: string
}

/**
 * Event handler callback invoked when a subscribed event is emitted.
 */
export interface EventHandlerContext {
  /**
   * Emits nested events with the current runtime scheduler. Inline handlers
   * still complete before the nested emit resolves; deferrable handlers stay
   * on the scheduler supplied by the original emitter.
   */
  eventBus: EventBus
}

export type EventHandler<
  TData = unknown,
  TMetadata extends EventMetadata | undefined = EventMetadata | undefined,
> = (event: EventEnvelope<TData, TMetadata>, context?: EventHandlerContext) => Promise<void> | void

/**
 * Subscription handle returned from {@link EventBus.subscribe}.
 *
 * Call `unsubscribe()` to remove the handler.
 */
export interface Subscription {
  unsubscribe(): void
}

/**
 * Abstract event bus interface. Implementations live in templates or plugins.
 *
 * Adapter examples:
 * - In-process (default, ships with core)
 * - Cloudflare Queues — edge-native
 * - Postgres-backed durable queue — for refund-saga-grade durability
 *
 * Event naming convention: `<resource>.<pastTenseAction>` in dot-case.
 * Examples: `booking.created`, `proposal.accepted`, `payment.received`.
 */
/**
 * Per-subscription options.
 */
export interface SubscribeOptions {
  /** Stable identity included in timeout diagnostics. */
  label?: string
  /**
   * Inline handlers complete before `emit()` resolves even when the
   * emitter supplies a deferral scheduler (see {@link EmitOptions}).
   * Use for the rare subscriber whose side effects must be visible to
   * the code that follows the emit (e.g. read-after-write within the
   * same request). Default `false` — handlers are deferrable.
   */
  inline?: boolean
  /**
   * How long to await THIS handler, overriding the bus default. `false`
   * disables the bound entirely.
   *
   * The default exists to stop one wedged subscriber holding an emit open, and
   * it is sized for a subscriber that writes a row or posts a webhook. A
   * subscriber whose work is legitimately longer — reindexing every locale of a
   * product, say — is not wedged, but it blows the same budget every time, so
   * the bus records a failure, the outbox retries into the identical wall, and
   * eight attempts later the event is dead-lettered while the work was probably
   * finishing all along. That accounted for 29 of one tenant's 32 dead events
   * ([#4639](https://github.com/voyant-travel/voyant/issues/4639)).
   *
   * Set it to what the handler actually needs. A budget that the work cannot
   * meet is not a safety bound, it is a scheduled failure.
   */
  timeoutMs?: number | false
}

/**
 * Per-emit options. Call sites normally omit this; runtime adapters
 * (e.g. `@voyant-travel/hono`'s request-scoped bus) supply `schedule` so
 * deferrable handlers run after the HTTP response instead of blocking
 * it.
 */
export interface EmitOptions {
  /**
   * Receives a single promise covering all deferrable (non-`inline`)
   * handlers for this emit. When provided, `emit()` resolves after the
   * `inline` handlers only; the scheduler owns keeping the runtime
   * alive for the rest (Workers: `executionCtx.waitUntil`). When
   * omitted, all handlers complete before `emit()` resolves.
   */
  schedule?: (pending: Promise<unknown>) => void
  /**
   * Transactional-outbox store for this emit. When present, the
   * envelope is persisted BEFORE any handler runs; after all handlers
   * settle the row is completed (every handler succeeded) or failed
   * (at least one error/timeout — the store schedules the retry).
   * A `null` return from `insert` means the event was already captured
   * (duplicate `metadata.eventId`) and delivery is skipped entirely.
   */
  store?: OutboxEventStore
}

/**
 * Minimal persistence contract the event bus needs for durable emits.
 * `@voyant-travel/db/outbox` provides the Postgres implementation; the bus
 * itself stays storage-agnostic.
 */
export interface OutboxEventStore {
  /**
   * Persist the envelope before delivery. Returns the stored record id,
   * or `null` when an event with the same `metadata.eventId` already
   * exists (the original capture owns delivery).
   */
  insert(envelope: EventEnvelope): Promise<{ id: string } | null>
  /** Every handler succeeded — mark delivered. */
  complete(id: string): Promise<void>
  /**
   * At least one handler failed or timed out. The store owns retry
   * scheduling (backoff) and dead-lettering.
   */
  fail(id: string, error: string): Promise<void>
}

/** Outcome of delivering one envelope to all its subscribers. */
export interface DeliveryResult {
  /**
   * Handlers invoked. **Zero is not success.** An event nobody subscribes to
   * produces no errors, so a durable delivery records it exactly like one every
   * subscriber handled — which is how an event type can be emitted in
   * production for months with a clean delivery record and no consumer
   * ([#4640](https://github.com/voyant-travel/voyant/issues/4640)). Callers
   * that care must read this, not just `failed`.
   */
  attempted: number
  /** Handlers that threw or timed out. */
  failed: number
  /**
   * How many of `failed` were timeouts rather than throws.
   *
   * Worth separating because they mean opposite things about a retry. A
   * handler that threw is finished and did nothing, so redelivering it is a
   * retry. A handler that timed out is **still running** — the bus only
   * stopped waiting — so redelivering it runs the same work a second time
   * alongside the first. Both are counted as failures, because a detached
   * handler may still fail and dropping the event would be worse, but they
   * should not read as the same event in diagnostics.
   *
   * Optional for the same reason `deliver` itself is: a third-party bus stays
   * assignable without knowing about it. Absent reads as zero.
   */
  timedOut?: number
  /**
   * How many failures declared themselves permanent — see
   * {@link PermanentSubscriberError}. Non-zero means retrying cannot help and
   * the caller should dead-letter rather than reschedule.
   */
  permanent?: number
  errors: string[]
}

/**
 * A subscriber failure that no retry can fix.
 *
 * The outbox retries on the assumption that a failure might be transient — a
 * lock, a timeout, a provider blip. A deployment misconfiguration is none of
 * those: it fails identically on every attempt, so the retries are pure waste,
 * and worse, the eighth attempt's error is the one that survives in
 * `last_error`, so a later timeout quietly overwrites the configuration fault
 * that is the actual cause (voyant#4639).
 *
 * Throw this when the handler can state that the event will never be delivered
 * as configured. Delivery is dead-lettered on the spot, which surfaces the real
 * error immediately through the dead-letter announcement instead of eight
 * attempts later under a different message.
 */
export class PermanentSubscriberError extends Error {
  readonly permanent = true as const

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "PermanentSubscriberError"
  }
}

/** True for an error that declares itself unfixable by retrying. */
export function isPermanentSubscriberError(error: unknown): boolean {
  return (
    error instanceof PermanentSubscriberError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { permanent?: unknown }).permanent === true)
  )
}

/** Stable, unique event id for envelope metadata / outbox dedup. */
export function generateEventId(): string {
  return `evt_${crypto.randomUUID()}`
}

export interface EventBusOptions {
  /**
   * Per-handler timeout in milliseconds. A handler that exceeds it is
   * logged and no longer awaited — it is NOT cancelled (JS can't), so
   * it may still finish in the background. Defaults to 15s, which
   * bounds how long one slow third-party subscriber (CMS sync,
   * e-invoicing API) can hold an emit. Set `false` to disable.
   */
  handlerTimeoutMs?: number | false
  /**
   * Invoked when a subscriber throws or times out. The bus already logs to
   * console and keeps the "subscribers are fire-and-forget" contract (the
   * emitter and sibling handlers are unaffected); this is the hook a runtime
   * uses to route the failure to an error reporter (RFC voyant#1553). It MUST
   * NOT throw — the bus guards the call defensively, but keep it best-effort.
   * `error` is an `Error` for timeouts and the thrown value otherwise.
   */
  onSubscriberError?: (event: string, error: unknown) => void
}

export interface EventBus {
  /** Emit an event. Fire-and-forget; subscribers cannot affect the emitter. */
  emit<TData, TMetadata extends EventMetadata | undefined = EventMetadata | undefined>(
    event: string,
    data: TData,
    metadata?: TMetadata,
    options?: EmitOptions,
  ): Promise<void>

  /** Subscribe to an event by name. Returns an unsubscribe handle. */
  subscribe<TData, TMetadata extends EventMetadata | undefined = EventMetadata | undefined>(
    event: string,
    handler: EventHandler<TData, TMetadata>,
    options?: SubscribeOptions,
  ): Subscription

  /**
   * Deliver an existing envelope to ALL its subscribers (inline and
   * deferrable alike), reporting per-handler failures instead of only
   * logging them. Used by outbox drains for redelivery — it does NOT
   * persist anything. Optional so third-party bus implementations
   * remain assignable; drains fall back to `emit` (fire-and-forget,
   * counted as success) when absent.
   */
  deliver?(envelope: EventEnvelope): Promise<DeliveryResult>
}

const DEFAULT_HANDLER_TIMEOUT_MS = 15_000

interface RegisteredHandler {
  inline: boolean
  label?: string
  /** Per-subscription override of the bus timeout; absent means the default. */
  timeoutMs?: number | false
}

/** What one handler run produced. `null` message means it succeeded. */
interface HandlerOutcome {
  message: string | null
  timedOut: boolean
  permanent: boolean
}

/**
 * Create an in-process event bus.
 *
 * Handlers run **in parallel** — they are independent observers by
 * contract, so one slow subscriber doesn't serialize behind another.
 * Errors thrown by a handler are caught and logged and never affect the
 * emitter or sibling handlers ("subscribers are fire-and-forget").
 * Each handler is bounded by {@link EventBusOptions.handlerTimeoutMs}.
 *
 * When the emitter passes {@link EmitOptions.schedule}, handlers not
 * marked `inline` are handed to the scheduler as one promise and
 * `emit()` resolves without waiting for them — this is how the HTTP
 * runtime moves subscriber work (third-party syncs, notifications)
 * after the response.
 */
export function createEventBus(options: EventBusOptions = {}): EventBus {
  const handlers = new Map<string, Map<EventHandler, RegisteredHandler>>()
  const timeoutMs = options.handlerTimeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS

  /** Route a subscriber failure to the optional reporter hook; never throws. */
  function notifySubscriberError(event: string, error: unknown): void {
    if (!options.onSubscriberError) return
    try {
      options.onSubscriberError(event, error)
    } catch {
      // the reporter hook must never break the bus
    }
  }

  /**
   * Runs one handler; never rejects. Reports whether it failed and whether the
   * failure was a timeout — a distinction the caller needs, because a timed-out
   * handler is still running. Errors are always logged here so non-durable
   * emits keep today's observability.
   */
  async function runHandler(
    event: string,
    handler: EventHandler,
    envelope: EventEnvelope,
    context?: EventHandlerContext,
    registered?: RegisteredHandler,
  ): Promise<HandlerOutcome> {
    // The subscription's own budget wins, including `false` for "unbounded".
    const effectiveTimeoutMs = registered?.timeoutMs ?? timeoutMs
    try {
      if (effectiveTimeoutMs === false) {
        await (context ? handler(envelope, context) : handler(envelope))
        return { message: null, timedOut: false, permanent: false }
      }
      let timer: ReturnType<typeof setTimeout> | null = null
      const timedOut = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), effectiveTimeoutMs)
      })
      try {
        const result = await Promise.race([
          Promise.resolve(context ? handler(envelope, context) : handler(envelope)).then(
            () => "done" as const,
          ),
          timedOut,
        ])
        if (result === "timeout") {
          // The handler keeps running detached — we just stop waiting.
          // Counted as a failure for durable delivery: dropping the event would
          // be worse if the detached run also fails. Reported as a timeout so
          // the retry is not mistaken for a clean one — it will run alongside
          // the attempt still in flight (voyant#4640).
          const identity = registered?.label ? ` ${registered.label}` : ""
          const message = `subscriber${identity} for "${event}" exceeded ${effectiveTimeoutMs}ms; not awaited`
          console.error(`[events] ${message}`)
          notifySubscriberError(event, new Error(message))
          return { message, timedOut: true, permanent: false }
        }
        return { message: null, timedOut: false, permanent: false }
      } finally {
        if (timer !== null) clearTimeout(timer)
      }
    } catch (err) {
      // Subscribers are fire-and-forget — log and continue.
      console.error(`[events] subscriber error for "${event}":`, err)
      notifySubscriberError(event, err)
      return {
        message: err instanceof Error ? err.message : String(err),
        timedOut: false,
        permanent: isPermanentSubscriberError(err),
      }
    }
  }

  /** Runs a batch in parallel; resolves with each run's outcome. */
  function runBatch(
    event: string,
    batch: EventHandler[],
    envelope: EventEnvelope,
    context?: EventHandlerContext,
  ): Promise<HandlerOutcome[]> {
    return Promise.all(
      batch.map((h) => runHandler(event, h, envelope, context, handlers.get(event)?.get(h))),
    )
  }

  /** Just the messages, for the emit paths that only log. */
  function batchErrors(outcomes: HandlerOutcome[]): string[] {
    return outcomes.map((outcome) => outcome.message).filter((m): m is string => m !== null)
  }

  function partition(event: string): { inline: EventHandler[]; deferrable: EventHandler[] } {
    const inline: EventHandler[] = []
    const deferrable: EventHandler[] = []
    const registered = handlers.get(event)
    if (registered) {
      for (const [handler, meta] of registered) {
        ;(meta.inline ? inline : deferrable).push(handler)
      }
    }
    return { inline, deferrable }
  }

  function ensureEventId(metadata: EventMetadata | undefined): EventMetadata | undefined {
    if (metadata && typeof metadata.eventId === "string" && metadata.eventId.length > 0) {
      return metadata
    }
    return { ...(metadata ?? {}), eventId: generateEventId() }
  }

  async function scheduleOrAwait(
    schedule: (pending: Promise<unknown>) => void,
    pending: Promise<unknown>,
  ) {
    try {
      schedule(pending)
    } catch (err) {
      console.error("[events] scheduler rejected deferred delivery; awaiting inline:", err)
      await pending
    }
  }

  function handlerContext(emitOptions?: EmitOptions): EventHandlerContext | undefined {
    if (!emitOptions?.schedule) return undefined
    const nestedOptions: EmitOptions = { schedule: emitOptions.schedule }
    const scopedBus: EventBus = {
      emit(event, data, metadata, options) {
        return bus.emit(event, data, metadata, { ...nestedOptions, ...options })
      },
      subscribe(event, handler, options) {
        return bus.subscribe(event, handler, options)
      },
    }
    if (bus.deliver) {
      scopedBus.deliver = (envelope) => bus.deliver!(envelope)
    }
    return { eventBus: scopedBus }
  }

  const bus: EventBus = {
    async emit<TData, TMetadata extends EventMetadata | undefined = EventMetadata | undefined>(
      event: string,
      data: TData,
      metadata?: TMetadata,
      emitOptions?: EmitOptions,
    ) {
      const store = emitOptions?.store
      const registered = handlers.get(event)
      if (!store && (!registered || registered.size === 0)) return
      const envelope: EventEnvelope<TData, TMetadata> = {
        name: event,
        data,
        emittedAt: new Date().toISOString(),
        // Durable capture and downstream dedup (workflow forwarder) both
        // key on a stable event id — stamp one when the caller didn't.
        ...(() => {
          const withId = ensureEventId(metadata)
          return withId === undefined ? {} : { metadata: withId as TMetadata }
        })(),
      }

      const { inline, deferrable } = partition(event)
      const context = handlerContext(emitOptions)
      const run = (batch: EventHandler[]) =>
        runBatch(event, batch, envelope as EventEnvelope, context)

      if (!store) {
        if (emitOptions?.schedule && deferrable.length > 0) {
          await scheduleOrAwait(emitOptions.schedule, run(deferrable))
          if (inline.length > 0) await run(inline)
          return
        }
        await run([...inline, ...deferrable])
        return
      }

      // ---- Durable (outbox) path ----
      // Persist BEFORE any handler runs: a crash mid-delivery leaves a
      // pending row the drain redelivers, instead of a lost event.
      const record = await store.insert(envelope as EventEnvelope)
      if (record === null) {
        // Duplicate eventId — already captured; the original owns delivery.
        return
      }

      const settle = async (errors: string[]) => {
        try {
          if (errors.length === 0) await store.complete(record.id)
          else await store.fail(record.id, errors.join("; "))
        } catch (err) {
          // Best-effort bookkeeping: a failed `complete` leaves the row
          // pending and the drain redelivers (at-least-once, idempotent
          // subscribers). Never surface to the emitter.
          console.error(`[events] outbox bookkeeping failed for "${event}":`, err)
        }
      }

      if (emitOptions.schedule && deferrable.length > 0) {
        const inlineErrors = inline.length > 0 ? batchErrors(await run(inline)) : []
        await scheduleOrAwait(
          emitOptions.schedule,
          run(deferrable).then((deferred) => settle([...inlineErrors, ...batchErrors(deferred)])),
        )
        return
      }

      await settle(batchErrors(await run([...inline, ...deferrable])))
    },

    async deliver(envelope: EventEnvelope): Promise<DeliveryResult> {
      const { inline, deferrable } = partition(envelope.name)
      const all = [...inline, ...deferrable]
      // `attempted: 0` is the caller's to interpret. Reporting it as a clean
      // delivery here is what let an unconsumed event look identical to a
      // handled one (voyant#4640).
      if (all.length === 0) {
        return { attempted: 0, failed: 0, timedOut: 0, permanent: 0, errors: [] }
      }
      const outcomes = await runBatch(envelope.name, all, envelope)
      const errors = batchErrors(outcomes)
      return {
        attempted: all.length,
        failed: errors.length,
        timedOut: outcomes.filter((outcome) => outcome.timedOut).length,
        permanent: outcomes.filter((outcome) => outcome.permanent).length,
        errors,
      }
    },
    subscribe<TData, TMetadata extends EventMetadata | undefined = EventMetadata | undefined>(
      event: string,
      handler: EventHandler<TData, TMetadata>,
      subscribeOptions?: SubscribeOptions,
    ) {
      let registered = handlers.get(event)
      if (!registered) {
        registered = new Map()
        handlers.set(event, registered)
      }
      registered.set(handler as EventHandler, {
        inline: subscribeOptions?.inline ?? false,
        ...(subscribeOptions?.label === undefined ? {} : { label: subscribeOptions.label }),
        ...(subscribeOptions?.timeoutMs === undefined
          ? {}
          : { timeoutMs: subscribeOptions.timeoutMs }),
      })
      return {
        unsubscribe() {
          registered?.delete(handler as EventHandler)
        },
      }
    },
  }

  return bus
}
