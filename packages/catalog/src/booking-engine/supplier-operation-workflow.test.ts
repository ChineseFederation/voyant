import { describe, expect, it, vi } from "vitest"
import { ReservationDispatchError, type SourceAdapter } from "../adapter/contract.js"

import { createSourceAdapterRegistry } from "./registry.js"
import { createSupplierOperationWorkflow } from "./supplier-operation-workflow.js"
import type {
  CreateSupplierOperationResult,
  SupplierOperationInternalRecord,
  SupplierOperationRepository,
} from "./supplier-operations.js"

describe("Supplier Operation workflow", () => {
  it("persists stable intent before dispatch and forwards the same idempotency key", async () => {
    const repository = memoryRepository()
    const reserve = vi.fn(async (_context, request) => {
      expect(repository.rows[0]).toMatchObject({ state: "submitted", attemptCount: 1 })
      expect(request.idempotency_key).toBe("bses_1:commit-key:reserve")
      return { upstream_ref: "UP-1", status: "confirmed" as const }
    })
    const workflow = workflowWith(repository, { reserve })

    await expect(workflow.dispatch(input())).resolves.toMatchObject({
      kind: "secured",
      operation: {
        state: "succeeded",
        upstreamRef: "UP-1",
        adapterIdempotencyKey: "bses_1:commit-key:reserve",
      },
    })
    expect(reserve).toHaveBeenCalledTimes(1)
  })

  it("never blindly retries a possibly-dispatched reservation", async () => {
    const repository = memoryRepository()
    const reserve = vi.fn(async () => {
      throw new Error("upstream timed out")
    })
    const workflow = workflowWith(repository, { reserve })

    await expect(workflow.dispatch(input())).resolves.toMatchObject({
      kind: "in_doubt",
      operation: { state: "in_doubt", attemptCount: 1 },
    })
    await expect(workflow.dispatch(input())).resolves.toMatchObject({
      kind: "in_doubt",
      operation: { state: "in_doubt", attemptCount: 1 },
    })
    expect(reserve).toHaveBeenCalledTimes(1)
  })

  it("reconciles timeout-after-send by the stable idempotency key", async () => {
    const repository = memoryRepository()
    let sentKey: string | undefined
    const reserve = vi.fn(async (_context, request) => {
      sentKey = request.idempotency_key
      throw new Error("response lost after supplier accepted reservation")
    })
    const getReservation = vi.fn(async (_context, request) =>
      request.idempotency_key === sentKey
        ? { upstream_ref: "UP-LOST-RESPONSE", status: "confirmed" as const }
        : null,
    )
    const workflow = workflowWith(repository, { reserve, getReservation })

    const dispatched = await workflow.dispatch(input())
    if (dispatched.kind !== "in_doubt") throw new Error("expected in-doubt operation")
    expect(dispatched.operation.upstreamRef).toBeUndefined()

    await expect(
      workflow.reconcile(dispatched.operation, {
        adapterContext: { connection_id: "conn_1" },
        now: new Date("2026-08-02T09:03:00.000Z"),
      }),
    ).resolves.toMatchObject({
      kind: "secured",
      operation: { state: "succeeded", upstreamRef: "UP-LOST-RESPONSE" },
    })
    expect(getReservation).toHaveBeenCalledWith(
      { connection_id: "conn_1" },
      { idempotency_key: "bses_1:commit-key:reserve" },
    )
    expect(reserve).toHaveBeenCalledTimes(1)
  })

  it("keeps an ambiguous not-found lookup in doubt instead of authorizing a duplicate", async () => {
    const repository = memoryRepository()
    const reserve = vi.fn(async () => {
      throw new Error("response lost after dispatch")
    })
    const getReservation = vi.fn(async () => null)
    const workflow = workflowWith(repository, { reserve, getReservation })
    const dispatched = await workflow.dispatch(input())
    if (dispatched.kind !== "in_doubt") throw new Error("expected in-doubt operation")

    await expect(
      workflow.reconcile(dispatched.operation, {
        adapterContext: { connection_id: "conn_1" },
        now: new Date("2026-08-02T09:03:00.000Z"),
      }),
    ).resolves.toMatchObject({
      kind: "in_doubt",
      operation: {
        state: "in_doubt",
        lastErrorClass: "reservation_not_found",
        nextReconcileAt: new Date("2026-08-02T09:04:00.000Z"),
      },
    })
    await expect(workflow.dispatch(input())).resolves.toMatchObject({ kind: "in_doubt" })
    expect(reserve).toHaveBeenCalledTimes(1)
  })

  it("allows only one reservation intent per Session across different Commit keys", async () => {
    const repository = memoryRepository()
    const reserve = vi.fn(async () => ({
      upstream_ref: "UP-SESSION",
      status: "confirmed" as const,
    }))
    const workflow = workflowWith(repository, { reserve })

    await expect(workflow.dispatch(input())).resolves.toMatchObject({ kind: "secured" })
    await expect(
      workflow.dispatch({ ...input(), commitIdempotencyKey: "another-key" }),
    ).resolves.toMatchObject({ kind: "idempotency_conflict" })
    expect(reserve).toHaveBeenCalledTimes(1)
  })

  it("allows independent supplier reservations for separate aggregate component scopes", async () => {
    const repository = memoryRepository()
    const reserve = vi.fn(async (_context, request) => ({
      upstream_ref: request.entity_id,
      status: "confirmed" as const,
    }))
    const workflow = workflowWith(repository, { reserve })

    await expect(workflow.dispatch({ ...input(), scopeKey: "tcmp_cruise" })).resolves.toMatchObject(
      {
        kind: "secured",
        operation: {
          scopeKey: "tcmp_cruise",
          adapterIdempotencyKey: "bses_1:tcmp_cruise:commit-key:reserve",
        },
      },
    )
    await expect(
      workflow.dispatch({
        ...input(),
        scopeKey: "tcmp_hotel",
        entityId: "acco_1",
        sourceRef: "HOTEL-1",
        request: {
          entity_module: "accommodations",
          entity_id: "acco_1",
          source_ref: "HOTEL-1",
          parameters: {},
        },
      }),
    ).resolves.toMatchObject({
      kind: "secured",
      operation: {
        scopeKey: "tcmp_hotel",
        adapterIdempotencyKey: "bses_1:tcmp_hotel:commit-key:reserve",
      },
    })
    expect(repository.rows).toHaveLength(2)
    expect(reserve).toHaveBeenCalledTimes(2)
  })

  it("allows a new reservation intent after a definitive refusal", async () => {
    const repository = memoryRepository()
    const reserve = vi
      .fn()
      .mockResolvedValueOnce({ upstream_ref: "UP-REFUSED", status: "failed" as const })
      .mockResolvedValueOnce({ upstream_ref: "UP-ALTERNATIVE", status: "confirmed" as const })
    const workflow = workflowWith(repository, { reserve })

    await expect(workflow.dispatch(input())).resolves.toMatchObject({
      kind: "failed",
      operation: { state: "refused" },
    })
    await expect(
      workflow.dispatch({
        ...input(),
        commitIdempotencyKey: "alternative-key",
        requestFingerprint: "fingerprint-2",
      }),
    ).resolves.toMatchObject({
      kind: "secured",
      operation: { state: "succeeded", upstreamRef: "UP-ALTERNATIVE" },
    })
    expect(repository.rows).toHaveLength(2)
    expect(reserve).toHaveBeenCalledTimes(2)
  })

  it("retries only when the adapter proves the request was not sent", async () => {
    const repository = memoryRepository()
    const reserve = vi
      .fn()
      .mockRejectedValueOnce(
        new ReservationDispatchError("socket unavailable", "not_sent", "connect_failed"),
      )
      .mockResolvedValueOnce({ upstream_ref: "UP-2", status: "held" as const })
    const workflow = workflowWith(repository, { reserve })

    await expect(workflow.dispatch(input())).resolves.toMatchObject({
      kind: "pending",
      operation: { state: "queued", attemptCount: 1 },
    })
    await expect(workflow.dispatch(input())).resolves.toMatchObject({
      kind: "secured",
      operation: { state: "succeeded", attemptCount: 2, upstreamRef: "UP-2" },
    })
  })

  it("reconciles a pending reservation by point read without redispatch", async () => {
    const repository = memoryRepository()
    const reserve = vi.fn(async () => ({ upstream_ref: "UP-3", status: "pending" as const }))
    const getReservation = vi.fn(async () => ({
      upstream_ref: "UP-3",
      status: "confirmed" as const,
      source_updated_at: new Date("2026-08-02T09:02:00.000Z"),
    }))
    const workflow = workflowWith(repository, { reserve, getReservation })
    const dispatched = await workflow.dispatch(input())
    if (dispatched.kind !== "pending") throw new Error("expected pending operation")

    await expect(
      workflow.reconcile(dispatched.operation, {
        adapterContext: { connection_id: "conn_1" },
        now: new Date("2026-08-02T09:03:00.000Z"),
      }),
    ).resolves.toMatchObject({ kind: "secured", operation: { state: "succeeded" } })
    expect(reserve).toHaveBeenCalledTimes(1)
    expect(getReservation).toHaveBeenCalledTimes(1)
  })

  it("ignores a stale supplier observation after a newer confirmation", async () => {
    const repository = memoryRepository()
    const reserve = vi.fn(async () => ({ upstream_ref: "UP-4", status: "pending" as const }))
    const getReservation = vi
      .fn()
      .mockResolvedValueOnce({
        upstream_ref: "UP-4",
        status: "confirmed" as const,
        source_updated_at: new Date("2026-08-02T09:10:00.000Z"),
        upstream_payload: { revision: 2 },
      })
      .mockResolvedValueOnce({
        upstream_ref: "UP-4",
        status: "pending" as const,
        source_updated_at: new Date("2026-08-02T09:05:00.000Z"),
        upstream_payload: { revision: 1 },
      })
    const workflow = workflowWith(repository, { reserve, getReservation })
    const dispatched = await workflow.dispatch(input())
    if (dispatched.kind !== "pending") throw new Error("expected pending operation")
    const secured = await workflow.reconcile(dispatched.operation, {
      adapterContext: { connection_id: "conn_1" },
      now: new Date("2026-08-02T09:11:00.000Z"),
    })
    if (secured.kind !== "secured") throw new Error("expected secured operation")

    await expect(
      workflow.reconcile(secured.operation, {
        adapterContext: { connection_id: "conn_1" },
        now: new Date("2026-08-02T09:12:00.000Z"),
      }),
    ).resolves.toMatchObject({
      kind: "secured",
      operation: { state: "succeeded", safeEvidence: { revision: 2 } },
    })
  })

  it("records newer supplier-side modifications on reconciliation replay", async () => {
    const repository = memoryRepository()
    const reserve = vi.fn(async () => ({ upstream_ref: "UP-5", status: "pending" as const }))
    const getReservation = vi
      .fn()
      .mockResolvedValueOnce({
        upstream_ref: "UP-5",
        status: "confirmed" as const,
        source_updated_at: new Date("2026-08-02T09:10:00.000Z"),
        upstream_payload: { cabin: "A1" },
      })
      .mockResolvedValueOnce({
        upstream_ref: "UP-5",
        status: "confirmed" as const,
        source_updated_at: new Date("2026-08-02T09:20:00.000Z"),
        upstream_payload: { cabin: "B2" },
      })
    const workflow = workflowWith(repository, { reserve, getReservation })
    const dispatched = await workflow.dispatch(input())
    if (dispatched.kind !== "pending") throw new Error("expected pending operation")
    const first = await workflow.reconcile(dispatched.operation, {
      adapterContext: { connection_id: "conn_1" },
      now: new Date("2026-08-02T09:11:00.000Z"),
    })
    if (first.kind !== "secured") throw new Error("expected secured operation")

    await expect(
      workflow.reconcile(first.operation, {
        adapterContext: { connection_id: "conn_1" },
        now: new Date("2026-08-02T09:21:00.000Z"),
      }),
    ).resolves.toMatchObject({
      kind: "secured",
      operation: { safeEvidence: { cabin: "B2" } },
    })
    expect(reserve).toHaveBeenCalledTimes(1)
  })

  it("persists an Amendment modify intent before dispatch and replays it once", async () => {
    const repository = memoryRepository()
    const modifyReservation = vi.fn(async (_context, request) => {
      expect(repository.rows[0]).toMatchObject({
        subjectType: "booking_amendment",
        subjectId: "bamd_1",
        bookingId: "book_1",
        bookingItemId: "bitm_1",
        amendmentId: "bamd_1",
        operationKind: "modify",
        state: "submitted",
        attemptCount: 1,
      })
      expect(request.idempotency_key).toBe("bamd_1:bitm_1:apply-key:modify")
      return { upstream_ref: "UP-BOOKING", status: "confirmed" as const }
    })
    const workflow = workflowWith(repository, { modifyReservation })
    const amendmentInput = {
      amendmentId: "bamd_1",
      bookingId: "book_1",
      bookingItemId: "bitm_1",
      idempotencyKey: "apply-key",
      requestFingerprint: "roster-after-hash",
      operationKind: "modify" as const,
      entityModule: "cruises",
      entityId: "crus_1",
      sourceKind: "cruise:test",
      sourceConnectionId: "conn_1",
      sourceRef: "CRUISE-1",
      request: {
        upstream_ref: "UP-BOOKING",
        desired_state: { party: { passengers: [{ id: "trav_1" }, { id: "trav_2" }] } },
        idempotency_key: "caller-key-is-replaced",
      },
      adapterContext: { connection_id: "conn_1" },
      now: new Date("2026-08-02T10:00:00.000Z"),
    }

    await expect(workflow.dispatchAmendment(amendmentInput)).resolves.toMatchObject({
      kind: "secured",
      operation: { state: "succeeded", upstreamRef: "UP-BOOKING" },
    })
    await expect(workflow.dispatchAmendment(amendmentInput)).resolves.toMatchObject({
      kind: "secured",
      operation: { attemptCount: 1 },
    })
    expect(modifyReservation).toHaveBeenCalledTimes(1)
  })

  it("does not redispatch an ambiguous Amendment and reconciles it by upstream reference", async () => {
    const repository = memoryRepository()
    const modifyReservation = vi.fn(async () => {
      throw new Error("supplier accepted the write but the response timed out")
    })
    const getReservation = vi.fn(async () => ({
      upstream_ref: "UP-BOOKING",
      status: "confirmed" as const,
      last_operation_idempotency_key: "bamd_2:bitm_1:apply-key:modify",
      source_updated_at: new Date("2026-08-02T10:01:00.000Z"),
    }))
    const workflow = workflowWith(repository, { modifyReservation, getReservation })
    const amendmentInput = {
      amendmentId: "bamd_2",
      bookingId: "book_1",
      bookingItemId: "bitm_1",
      idempotencyKey: "apply-key",
      requestFingerprint: "roster-after-hash",
      operationKind: "modify" as const,
      entityModule: "cruises",
      entityId: "crus_1",
      sourceKind: "cruise:test",
      sourceConnectionId: "conn_1",
      sourceRef: "CRUISE-1",
      request: {
        upstream_ref: "UP-BOOKING",
        desired_state: { party: { passengers: [{ id: "trav_1" }] } },
        idempotency_key: "ignored",
      },
      adapterContext: { connection_id: "conn_1" },
      now: new Date("2026-08-02T10:00:00.000Z"),
    }
    const dispatched = await workflow.dispatchAmendment(amendmentInput)
    if (dispatched.kind !== "in_doubt") throw new Error("expected in-doubt operation")
    await expect(workflow.dispatchAmendment(amendmentInput)).resolves.toMatchObject({
      kind: "in_doubt",
      operation: { attemptCount: 1 },
    })
    await expect(
      workflow.reconcile(dispatched.operation, {
        adapterContext: { connection_id: "conn_1" },
        now: new Date("2026-08-02T10:02:00.000Z"),
      }),
    ).resolves.toMatchObject({ kind: "secured", operation: { state: "succeeded" } })
    expect(modifyReservation).toHaveBeenCalledTimes(1)
  })

  it("keeps a modification in doubt when the read cannot prove the desired effect", async () => {
    const repository = memoryRepository()
    const modifyReservation = vi.fn(async () => {
      throw new Error("response timed out")
    })
    const getReservation = vi.fn(async () => ({
      upstream_ref: "UP-BOOKING",
      status: "confirmed" as const,
      source_updated_at: new Date("2026-08-02T10:01:00.000Z"),
    }))
    const workflow = workflowWith(repository, { modifyReservation, getReservation })
    const dispatched = await workflow.dispatchAmendment({
      amendmentId: "bamd_3",
      bookingId: "book_1",
      bookingItemId: "bitm_1",
      idempotencyKey: "apply-key",
      requestFingerprint: "desired-state-hash",
      operationKind: "modify",
      entityModule: "cruises",
      entityId: "crus_1",
      sourceKind: "cruise:test",
      sourceConnectionId: "conn_1",
      sourceRef: "CRUISE-1",
      request: {
        upstream_ref: "UP-BOOKING",
        desired_state: { party: { passengers: [{ id: "trav_1" }] } },
        idempotency_key: "ignored",
      },
      adapterContext: { connection_id: "conn_1" },
      now: new Date("2026-08-02T10:00:00.000Z"),
    })
    if (dispatched.kind !== "in_doubt") throw new Error("expected in-doubt operation")

    await expect(
      workflow.reconcile(dispatched.operation, {
        adapterContext: { connection_id: "conn_1" },
        now: new Date("2026-08-02T10:02:00.000Z"),
      }),
    ).resolves.toMatchObject({
      kind: "in_doubt",
      operation: {
        state: "in_doubt",
        lastErrorClass: "modification_effect_unproven",
        safeEvidence: { modificationEffectProven: false },
      },
    })
  })
})

function workflowWith(
  repository: ReturnType<typeof memoryRepository>,
  methods: Partial<
    Pick<SourceAdapter, "reserve" | "modifyReservation" | "cancel" | "getReservation">
  >,
) {
  const registry = createSourceAdapterRegistry()
  registry.register("conn_1", {
    kind: "cruise:test",
    capabilities: {
      verticals: ["cruises"],
      supportsLiveResolution: true,
      supportsDriftDetection: false,
      supportsBookingForwarding: Boolean(methods.reserve),
      supportsReservationRetrieval: Boolean(methods.getReservation),
      supportsReservationLookupByIdempotencyKey: Boolean(methods.getReservation),
      postBookOperations: [
        "status",
        ...(methods.modifyReservation ? (["modify"] as const) : []),
        ...(methods.cancel ? (["cancel"] as const) : []),
      ],
    },
    ...methods,
  })
  return createSupplierOperationWorkflow({ repository, registry })
}

function input() {
  return {
    sessionId: "bses_1",
    quoteId: "bsqu_1",
    commitIdempotencyKey: "commit-key",
    requestFingerprint: "fingerprint-1",
    entityModule: "cruises",
    entityId: "crus_1",
    sourceKind: "cruise:test",
    sourceConnectionId: "conn_1",
    sourceRef: "CRUISE-1",
    request: {
      entity_module: "cruises",
      entity_id: "crus_1",
      parameters: { sailingId: "sail_1", cabinCategoryId: "cabin_1" },
    },
    adapterContext: { connection_id: "conn_1" },
    now: new Date("2026-08-02T09:00:00.000Z"),
  }
}

function memoryRepository(): SupplierOperationRepository & {
  rows: SupplierOperationInternalRecord[]
} {
  const rows: SupplierOperationInternalRecord[] = []
  return {
    rows,
    async createOrReplay(record): Promise<CreateSupplierOperationResult> {
      const replay = rows.find(
        (row) =>
          row.subjectType === record.subjectType &&
          row.subjectId === record.subjectId &&
          row.scopeKey === record.scopeKey &&
          row.idempotencyKey === record.idempotencyKey,
      )
      if (replay) {
        return replay.requestFingerprint === record.requestFingerprint
          ? { status: "replay", operation: replay }
          : { status: "conflict" }
      }
      const blocking = rows.find(
        (row) =>
          row.subjectType === record.subjectType &&
          row.subjectId === record.subjectId &&
          row.scopeKey === record.scopeKey &&
          blocksReplacement(row),
      )
      if (blocking) {
        return { status: "conflict" }
      }
      rows.push(record)
      return { status: "created", operation: record }
    },
    async get(operationId) {
      return rows.find((row) => row.id === operationId) ?? null
    },
    async getByIdempotency(subjectType, subjectId, idempotencyKey, scopeKey) {
      return (
        rows.find(
          (row) =>
            row.subjectType === subjectType &&
            row.subjectId === subjectId &&
            (!scopeKey || row.scopeKey === scopeKey) &&
            row.idempotencyKey === idempotencyKey,
        ) ?? null
      )
    },
    async getBySession(sessionId) {
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        const row = rows[index]
        if (row?.sessionId === sessionId) return row
      }
      return null
    },
    async getBlockingBySession(sessionId, scopeKey) {
      return (
        rows.find(
          (row) =>
            row.sessionId === sessionId &&
            (!scopeKey || row.scopeKey === scopeKey) &&
            blocksReplacement(row),
        ) ?? null
      )
    },
    async getForUpdate(operationId) {
      return rows.find((row) => row.id === operationId) ?? null
    },
    async list() {
      return rows
    },
    async claimDispatch(operationId, at) {
      const operation = rows.find((row) => row.id === operationId && row.state === "queued")
      if (!operation) return null
      operation.state = "submitted"
      operation.version += 1
      operation.attemptCount += 1
      operation.submittedAt = at
      operation.updatedAt = at
      return operation
    },
    async save(operation) {
      operation.version += 1
    },
  }
}

function blocksReplacement(operation: SupplierOperationInternalRecord): boolean {
  return (
    operation.state === "queued" ||
    operation.state === "submitted" ||
    operation.state === "pending" ||
    operation.state === "succeeded" ||
    operation.state === "in_doubt" ||
    operation.state === "manual_review" ||
    (operation.state === "manually_resolved" && operation.upstreamStatus === "succeeded")
  )
}
