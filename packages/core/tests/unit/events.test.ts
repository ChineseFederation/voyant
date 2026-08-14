import { describe, expect, it, vi } from "vitest"

import { createEventBus, PermanentSubscriberError } from "../../src/events.js"

describe("createEventBus", () => {
  it("delivers emitted events to subscribers", async () => {
    const bus = createEventBus()
    const handler = vi.fn()
    bus.subscribe("booking.created", handler)

    await bus.emit("booking.created", { id: "book_1" })

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "booking.created",
        data: { id: "book_1" },
        emittedAt: expect.any(String),
      }),
    )
  })

  it("delivers to multiple subscribers for the same event", async () => {
    const bus = createEventBus()
    const a = vi.fn()
    const b = vi.fn()
    bus.subscribe("quote.sent", a)
    bus.subscribe("quote.sent", b)

    await bus.emit("quote.sent", { id: "q1" })

    expect(a).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "quote.sent",
        data: { id: "q1" },
      }),
    )
    expect(b).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "quote.sent",
        data: { id: "q1" },
      }),
    )
  })

  it("includes metadata in the delivered envelope when provided", async () => {
    const bus = createEventBus()
    const handler = vi.fn()
    bus.subscribe("invoice.settled", handler)

    await bus.emit(
      "invoice.settled",
      { id: "inv_1" },
      { category: "domain", source: "service", correlationId: "corr_123" },
    )

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "invoice.settled",
        data: { id: "inv_1" },
        // emit stamps a stable eventId when the caller didn't supply one
        // (outbox dedup + workflow-forwarder idempotency key on it).
        metadata: expect.objectContaining({
          category: "domain",
          source: "service",
          correlationId: "corr_123",
          eventId: expect.stringMatching(/^evt_/),
        }),
      }),
    )
  })

  it("does nothing when no subscribers are registered", async () => {
    const bus = createEventBus()
    await expect(bus.emit("unknown.event", {})).resolves.toBeUndefined()
  })

  it("returns an unsubscribe handle that removes the handler", async () => {
    const bus = createEventBus()
    const handler = vi.fn()
    const sub = bus.subscribe("x", handler)
    sub.unsubscribe()

    await bus.emit("x", {})

    expect(handler).not.toHaveBeenCalled()
  })

  it("continues delivering to later subscribers after one throws", async () => {
    const bus = createEventBus()
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const good = vi.fn()
    bus.subscribe("x", () => {
      throw new Error("boom")
    })
    bus.subscribe("x", good)

    await bus.emit("x", {})

    expect(good).toHaveBeenCalledOnce()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it("runs handlers in parallel — a slow handler does not serialize a fast one", async () => {
    const bus = createEventBus()
    const order: number[] = []
    bus.subscribe("x", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      order.push(1)
    })
    bus.subscribe("x", () => {
      order.push(2)
    })

    await bus.emit("x", {})

    // Both completed before emit resolved, but the synchronous handler
    // did not wait behind the slow one.
    expect(order).toEqual([2, 1])
  })

  it("awaits all handlers before resolving when no scheduler is provided", async () => {
    const bus = createEventBus()
    let done = false
    bus.subscribe("x", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      done = true
    })

    await bus.emit("x", {})

    expect(done).toBe(true)
  })

  it("stops awaiting a handler that exceeds handlerTimeoutMs", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const bus = createEventBus({ handlerTimeoutMs: 20 })
    let hungResolved = false
    bus.subscribe("x", async () => {
      await new Promise((resolve) => setTimeout(resolve, 200))
      hungResolved = true
    })

    const start = Date.now()
    await bus.emit("x", {})
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(150)
    expect(hungResolved).toBe(false)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("exceeded 20ms"))
    errorSpy.mockRestore()
  })

  describe("deferred emission via EmitOptions.schedule", () => {
    it("hands deferrable handlers to the scheduler and resolves without awaiting them", async () => {
      const bus = createEventBus()
      let deferredRan = false
      const scheduled: Promise<unknown>[] = []
      bus.subscribe("x", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        deferredRan = true
      })

      await bus.emit("x", {}, undefined, { schedule: (p) => scheduled.push(p) })

      expect(deferredRan).toBe(false)
      expect(scheduled).toHaveLength(1)
      await Promise.all(scheduled)
      expect(deferredRan).toBe(true)
    })

    it("still awaits inline-marked handlers before resolving", async () => {
      const bus = createEventBus()
      const order: string[] = []
      const scheduled: Promise<unknown>[] = []
      bus.subscribe(
        "x",
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 5))
          order.push("inline")
        },
        { inline: true },
      )
      // Deferred work starts concurrently — `schedule` only means emit
      // doesn't wait for it. Make it slower than the inline handler so
      // we can observe that emit resolved without it.
      bus.subscribe("x", async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        order.push("deferred")
      })

      await bus.emit("x", {}, undefined, { schedule: (p) => scheduled.push(p) })

      expect(order).toEqual(["inline"])
      await Promise.all(scheduled)
      expect(order).toEqual(["inline", "deferred"])
    })

    it("does not invoke the scheduler when every handler is inline", async () => {
      const bus = createEventBus()
      const schedule = vi.fn()
      const handler = vi.fn()
      bus.subscribe("x", handler, { inline: true })

      await bus.emit("x", {}, undefined, { schedule })

      expect(handler).toHaveBeenCalledOnce()
      expect(schedule).not.toHaveBeenCalled()
    })

    it("gives inline handlers a scheduler-scoped bus for nested emits", async () => {
      const bus = createEventBus()
      const scheduled: Promise<unknown>[] = []
      let nestedDone = false

      bus.subscribe(
        "outer",
        async (_event, context) => {
          await context?.eventBus.emit("inner", {})
        },
        { inline: true },
      )
      bus.subscribe("inner", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        nestedDone = true
      })

      await bus.emit("outer", {}, undefined, { schedule: (p) => scheduled.push(p) })

      expect(nestedDone).toBe(false)
      expect(scheduled).toHaveLength(1)
      await Promise.all(scheduled)
      expect(nestedDone).toBe(true)
    })

    it("scheduled batch never rejects even when a deferred handler throws", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const bus = createEventBus()
      const scheduled: Promise<unknown>[] = []
      bus.subscribe("x", () => {
        throw new Error("boom")
      })

      await bus.emit("x", {}, undefined, { schedule: (p) => scheduled.push(p) })
      await expect(Promise.all(scheduled)).resolves.toBeDefined()

      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it("awaits deferred handlers inline when the scheduler throws", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const bus = createEventBus()
      let deferredRan = false
      bus.subscribe("x", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        deferredRan = true
      })

      await bus.emit("x", {}, undefined, {
        schedule: () => {
          throw new Error("waitUntil unavailable")
        },
      })

      expect(deferredRan).toBe(true)
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("scheduler rejected deferred delivery"),
        expect.any(Error),
      )
      errorSpy.mockRestore()
    })
  })
})

describe("durable emit via EmitOptions.store (transactional outbox)", () => {
  function fakeStore() {
    return {
      insert: vi.fn(async () => ({ id: "evob_1" })),
      complete: vi.fn(async () => {}),
      fail: vi.fn(async () => {}),
    }
  }

  it("persists the envelope before handlers run and completes on success", async () => {
    const bus = createEventBus()
    const store = fakeStore()
    const order: string[] = []
    store.insert.mockImplementation(async () => {
      order.push("insert")
      return { id: "evob_1" }
    })
    bus.subscribe("x", () => {
      order.push("handler")
    })

    await bus.emit("x", { a: 1 }, undefined, { store })

    expect(order).toEqual(["insert", "handler"])
    expect(store.complete).toHaveBeenCalledWith("evob_1")
    expect(store.fail).not.toHaveBeenCalled()
    const envelope = store.insert.mock.calls[0]?.[0] as { metadata?: { eventId?: string } }
    expect(envelope?.metadata?.eventId).toMatch(/^evt_/)
  })

  it("fails the row when a handler throws (and still runs siblings)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const bus = createEventBus()
    const store = fakeStore()
    const good = vi.fn()
    bus.subscribe("x", () => {
      throw new Error("boom")
    })
    bus.subscribe("x", good)

    await bus.emit("x", {}, undefined, { store })

    expect(good).toHaveBeenCalledOnce()
    expect(store.complete).not.toHaveBeenCalled()
    expect(store.fail).toHaveBeenCalledWith("evob_1", expect.stringContaining("boom"))
    errorSpy.mockRestore()
  })

  it("skips delivery entirely for duplicate eventIds (insert returns null)", async () => {
    const bus = createEventBus()
    const store = fakeStore()
    store.insert.mockResolvedValue(null)
    const handler = vi.fn()
    bus.subscribe("x", handler)

    await bus.emit("x", {}, { eventId: "evt_dup" }, { store })

    expect(handler).not.toHaveBeenCalled()
    expect(store.complete).not.toHaveBeenCalled()
  })

  it("persists even when there are no subscribers (drain delivers later)", async () => {
    const bus = createEventBus()
    const store = fakeStore()

    await bus.emit("ghost.event", { id: 1 }, undefined, { store })

    expect(store.insert).toHaveBeenCalledOnce()
    expect(store.complete).toHaveBeenCalledWith("evob_1")
  })

  it("with a scheduler, settles the row only after deferred handlers finish", async () => {
    const bus = createEventBus()
    const store = fakeStore()
    const scheduled: Promise<unknown>[] = []
    let deferredDone = false
    bus.subscribe("x", async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      deferredDone = true
    })

    await bus.emit("x", {}, undefined, { store, schedule: (p) => scheduled.push(p) })

    expect(store.complete).not.toHaveBeenCalled()
    await Promise.all(scheduled)
    expect(deferredDone).toBe(true)
    expect(store.complete).toHaveBeenCalledWith("evob_1")
  })

  it("settles the row when the scheduler throws after capture", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const bus = createEventBus()
    const store = fakeStore()
    const handler = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    bus.subscribe("x", handler)

    await bus.emit("x", {}, undefined, {
      store,
      schedule: () => {
        throw new Error("waitUntil unavailable")
      },
    })

    expect(handler).toHaveBeenCalledOnce()
    expect(store.complete).toHaveBeenCalledWith("evob_1")
    expect(store.fail).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("scheduler rejected deferred delivery"),
      expect.any(Error),
    )
    errorSpy.mockRestore()
  })
})

describe("deliver — redelivery with failure reporting", () => {
  it("reports attempted/failed counts across all handlers", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const bus = createEventBus()
    bus.subscribe("x", () => {})
    bus.subscribe(
      "x",
      () => {
        throw new Error("nope")
      },
      { inline: true },
    )

    const result = await bus.deliver?.({
      name: "x",
      data: {},
      emittedAt: new Date().toISOString(),
    })

    expect(result).toEqual({ attempted: 2, failed: 1, timedOut: 0, permanent: 0, errors: ["nope"] })
    errorSpy.mockRestore()
  })

  it("returns a zero result for envelopes with no subscribers", async () => {
    const bus = createEventBus()
    const result = await bus.deliver?.({
      name: "ghost",
      data: {},
      emittedAt: new Date().toISOString(),
    })
    // `attempted: 0` is the only thing separating "nobody consumes this" from
    // "everybody handled it" — a durable drain that reads `failed` alone
    // records an unconsumed event as a clean delivery (voyant#4640).
    expect(result).toEqual({ attempted: 0, failed: 0, timedOut: 0, permanent: 0, errors: [] })
  })

  it("reports a timeout separately from a throw", async () => {
    // They mean opposite things about a retry: a thrown handler is finished
    // and did nothing, a timed-out one is still running (voyant#4640).
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const bus = createEventBus({ handlerTimeoutMs: 10 })
    bus.subscribe("x", () => new Promise<void>(() => {}))
    bus.subscribe("x", () => {
      throw new Error("nope")
    })

    const result = await bus.deliver?.({
      name: "x",
      data: {},
      emittedAt: new Date().toISOString(),
    })

    expect(result).toMatchObject({ attempted: 2, failed: 2, timedOut: 1, permanent: 0 })
    errorSpy.mockRestore()
  })

  it("reports a permanent failure so the caller can stop retrying", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const bus = createEventBus()
    bus.subscribe("x", () => {
      throw new PermanentSubscriberError("vectorDimensions is not configured")
    })

    const result = await bus.deliver?.({
      name: "x",
      data: {},
      emittedAt: new Date().toISOString(),
    })

    expect(result).toMatchObject({ attempted: 1, failed: 1, permanent: 1 })
    errorSpy.mockRestore()
  })
})

describe("per-subscription handler timeout (voyant#4639)", () => {
  it("gives a slow subscriber its own budget instead of the bus default", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const bus = createEventBus({ handlerTimeoutMs: 10 })
    const slow = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
    })
    bus.subscribe("indexing", slow, { timeoutMs: 500 })

    const result = await bus.deliver?.({
      name: "indexing",
      data: {},
      emittedAt: new Date().toISOString(),
    })

    // Would have been a deterministic failure on the bus default, retried into
    // the identical wall until the outbox gave up.
    expect(result).toMatchObject({ attempted: 1, failed: 0, timedOut: 0 })
    expect(slow).toHaveBeenCalledOnce()
    errorSpy.mockRestore()
  })

  it("still bounds a subscription that asks for a shorter budget", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const bus = createEventBus({ handlerTimeoutMs: 5_000 })
    bus.subscribe("wedged", () => new Promise<void>(() => {}), { timeoutMs: 10 })

    const result = await bus.deliver?.({
      name: "wedged",
      data: {},
      emittedAt: new Date().toISOString(),
    })

    expect(result).toMatchObject({ failed: 1, timedOut: 1 })
    expect(result?.errors[0]).toContain("exceeded 10ms")
    errorSpy.mockRestore()
  })
})

describe("onSubscriberError hook (RFC #1553)", () => {
  it("invokes the hook with the event name + thrown error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const onSubscriberError = vi.fn()
    const boom = new Error("subscriber blew up")
    const bus = createEventBus({ onSubscriberError })
    bus.subscribe("booking.created", () => {
      throw boom
    })

    await bus.emit("booking.created", { id: "b1" })

    expect(onSubscriberError).toHaveBeenCalledTimes(1)
    expect(onSubscriberError).toHaveBeenCalledWith("booking.created", boom)
    errorSpy.mockRestore()
  })

  it("invokes the hook with an Error on handler timeout", async () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const onSubscriberError = vi.fn()
    const bus = createEventBus({ handlerTimeoutMs: 10, onSubscriberError })
    bus.subscribe("slow.event", () => new Promise(() => {}))

    const emitted = bus.emit("slow.event", {})
    await vi.advanceTimersByTimeAsync(20)
    await emitted

    expect(onSubscriberError).toHaveBeenCalledTimes(1)
    const [event, error] = onSubscriberError.mock.calls[0]
    expect(event).toBe("slow.event")
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain("exceeded 10ms")
    errorSpy.mockRestore()
    vi.useRealTimers()
  })

  it("a throwing hook never breaks the bus or the emitter", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const sibling = vi.fn()
    const bus = createEventBus({
      onSubscriberError: () => {
        throw new Error("reporter exploded")
      },
    })
    bus.subscribe("e", () => {
      throw new Error("handler failed")
    })
    bus.subscribe("e", sibling)

    await expect(bus.emit("e", {})).resolves.toBeUndefined()
    expect(sibling).toHaveBeenCalledOnce()
    errorSpy.mockRestore()
  })

  it("is not called when all subscribers succeed", async () => {
    const onSubscriberError = vi.fn()
    const bus = createEventBus({ onSubscriberError })
    bus.subscribe("ok", () => {})

    await bus.emit("ok", {})

    expect(onSubscriberError).not.toHaveBeenCalled()
  })
})
