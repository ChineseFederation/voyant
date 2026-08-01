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
  /**
   * Inline handlers complete before `emit()` resolves even when the
   * emitter supplies a deferral scheduler (see {@link EmitOptions}).
   * Use for the rare subscriber whose side effects must be visible to
   * the code that follows the emit (e.g. read-after-write within the
   * same request). Default `false` — handlers are deferrable.
   */
  inline?: boolean
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
  /** Handlers invoked. */
  attempted: number
  /** Handlers that threw or timed out. */
  failed: number
  errors: string[]
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
   * Runs one handler; never rejects. Returns the error message when the
   * handler threw or timed out, `null` on success. Errors are always
   * logged here so non-durable emits keep today's observability.
   */
  async function runHandler(
    event: string,
    handler: EventHandler,
    envelope: EventEnvelope,
    context?: EventHandlerContext,
  ): Promise<string | null> {
    try {
      if (timeoutMs === false) {
        await (context ? handler(envelope, context) : handler(envelope))
        return null
      }
      let timer: ReturnType<typeof setTimeout> | null = null
      const timedOut = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), timeoutMs)
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
          // Counted as a failure for durable delivery: the retry relies
          // on subscriber idempotency.
          const message = `subscriber for "${event}" exceeded ${timeoutMs}ms; not awaited`
          console.error(`[events] ${message}`)
          notifySubscriberError(event, new Error(message))
          return message
        }
        return null
      } finally {
        if (timer !== null) clearTimeout(timer)
      }
    } catch (err) {
      // Subscribers are fire-and-forget — log and continue.
      console.error(`[events] subscriber error for "${event}":`, err)
      notifySubscriberError(event, err)
      return err instanceof Error ? err.message : String(err)
    }
  }

  /** Runs a batch in parallel; resolves with the error messages. */
  function runBatch(
    event: string,
    batch: EventHandler[],
    envelope: EventEnvelope,
    context?: EventHandlerContext,
  ): Promise<string[]> {
    return Promise.all(batch.map((h) => runHandler(event, h, envelope, context))).then((results) =>
      results.filter((r): r is string => r !== null),
    )
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
        const inlineErrors = inline.length > 0 ? await run(inline) : []
        await scheduleOrAwait(
          emitOptions.schedule,
          run(deferrable).then((deferredErrors) => settle([...inlineErrors, ...deferredErrors])),
        )
        return
      }

      const errors = await run([...inline, ...deferrable])
      await settle(errors)
    },

    async deliver(envelope: EventEnvelope): Promise<DeliveryResult> {
      const { inline, deferrable } = partition(envelope.name)
      const all = [...inline, ...deferrable]
      if (all.length === 0) return { attempted: 0, failed: 0, errors: [] }
      const errors = await runBatch(envelope.name, all, envelope)
      return { attempted: all.length, failed: errors.length, errors }
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
      registered.set(handler as EventHandler, { inline: subscribeOptions?.inline ?? false })
      return {
        unsubscribe() {
          registered?.delete(handler as EventHandler)
        },
      }
    },
  }

  return bus
}
