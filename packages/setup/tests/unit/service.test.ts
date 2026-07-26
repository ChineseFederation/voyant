import type { EventBus } from "@voyant-travel/core"
import { describe, expect, it, vi } from "vitest"
import type { OrganizationSetup, OrganizationSetupStep } from "../../src/schema.js"
import {
  completeSetupStep,
  dismissSetup,
  getSetupState,
  initializeSetup,
  SETUP_LIFECYCLE_CHANGED_EVENT,
  type SetupStore,
  skipSetupStep,
} from "../../src/service.js"

class MemorySetupStore implements SetupStore {
  organization: OrganizationSetup | null = null
  steps = new Map<string, OrganizationSetupStep>()

  async transaction<T>(run: (store: SetupStore) => Promise<T>): Promise<T> {
    const organization = this.organization ? { ...this.organization } : null
    const steps = new Map([...this.steps].map(([stepId, step]) => [stepId, { ...step }] as const))
    try {
      return await run(this)
    } catch (error) {
      this.organization = organization
      this.steps = steps
      throw error
    }
  }

  async createOrganization(input: OrganizationSetup) {
    if (this.organization) return false
    this.organization = { ...input }
    return true
  }
  async getOrganization() {
    return this.organization ? { ...this.organization } : null
  }
  async ensureStep(stepId: string, firstSeenAt: Date) {
    if (this.steps.has(stepId)) return false
    this.steps.set(stepId, { stepId, firstSeenAt, completedAt: null, skippedAt: null })
    return true
  }
  async listSteps() {
    return [...this.steps.values()].map((step) => ({ ...step }))
  }
  async markCompleted(stepId: string, completedAt: Date) {
    const step = this.requireStep(stepId)
    const next = { ...step, completedAt }
    this.steps.set(stepId, next)
    return next
  }
  async markSkipped(stepId: string, skippedAt: Date) {
    const step = this.requireStep(stepId)
    const next = { ...step, skippedAt }
    this.steps.set(stepId, next)
    return next
  }
  async markDismissed(dismissedAt: Date) {
    if (!this.organization) throw new Error("Organization setup was not found.")
    this.organization = { ...this.organization, dismissedAt }
    return { ...this.organization }
  }
  private requireStep(stepId: string) {
    const step = this.steps.get(stepId)
    if (!step) throw new Error(`Missing ${stepId}`)
    return step
  }
}

describe("organization setup state", () => {
  const profileStep = { id: "acme.profile", skippable: true } as const

  it("initializes startedAt and the fresh redirect exactly once", async () => {
    const store = new MemorySetupStore()
    const first = new Date("2026-07-15T08:00:00.000Z")
    const later = new Date("2026-07-15T09:00:00.000Z")

    const initial = await initializeSetup(
      store,
      { stepIds: ["acme.profile"], fresh: true },
      [profileStep],
      {},
      { now: first },
    )
    const repeated = await initializeSetup(
      store,
      { stepIds: ["acme.profile"], fresh: true },
      [profileStep],
      {},
      { now: later },
    )

    expect(initial).toMatchObject({
      startedAt: first.toISOString(),
      firstRunOpenedAt: first.toISOString(),
      dismissedAt: null,
      shouldRedirect: true,
    })
    expect(repeated).toMatchObject({
      startedAt: first.toISOString(),
      firstRunOpenedAt: first.toISOString(),
      dismissedAt: null,
      shouldRedirect: false,
    })
  })

  it("persists dismissedAt and emits a dismissed lifecycle event", async () => {
    const store = new MemorySetupStore()
    const emit = vi.fn(async () => undefined)
    const runtime = { eventBus: { emit } as EventBus }
    await initializeSetup(
      store,
      { stepIds: ["acme.profile"], fresh: false },
      [profileStep],
      {},
      runtime,
    )
    const dismissedAt = new Date("2026-07-15T08:30:00.000Z")
    const state = await dismissSetup(store, [profileStep], {}, { ...runtime, now: dismissedAt })

    expect(state.dismissedAt).toBe(dismissedAt.toISOString())
    expect((await getSetupState(store, [profileStep]))?.dismissedAt).toBe(dismissedAt.toISOString())
    expect(emit).toHaveBeenLastCalledWith(
      SETUP_LIFECYCLE_CHANGED_EVENT,
      { change: "dismissed", stepId: null },
      { category: "internal", source: "service" },
    )
  })

  it("never re-runs fresh inference after a non-fresh initialization", async () => {
    const store = new MemorySetupStore()
    const first = await initializeSetup(store, { stepIds: [], fresh: false }, [])
    const later = await initializeSetup(store, { stepIds: [], fresh: true }, [])
    expect(first.shouldRedirect).toBe(false)
    expect(later.shouldRedirect).toBe(false)
    expect(later.firstRunOpenedAt).toBeNull()
  })

  it("records completion and skip independently", async () => {
    const store = new MemorySetupStore()
    const emit = vi.fn(async () => undefined)
    const runtime = { eventBus: { emit } as EventBus }
    await initializeSetup(
      store,
      { stepIds: ["acme.profile"], fresh: false },
      [profileStep],
      {},
      runtime,
    )
    const skippedAt = new Date("2026-07-15T08:10:00.000Z")
    const completedAt = new Date("2026-07-15T08:20:00.000Z")
    await skipSetupStep(store, [profileStep], "acme.profile", { ...runtime, now: skippedAt })
    const completed = await completeSetupStep(store, [profileStep], "acme.profile", {
      ...runtime,
      now: completedAt,
    })

    expect(completed.skippedAt).toBe(skippedAt.toISOString())
    expect(completed.completedAt).toBe(completedAt.toISOString())
    expect(emit.mock.calls).toEqual([
      [
        SETUP_LIFECYCLE_CHANGED_EVENT,
        { change: "initialized", stepId: null },
        { category: "internal", source: "service" },
      ],
      [
        SETUP_LIFECYCLE_CHANGED_EVENT,
        { change: "step_skipped", stepId: "acme.profile" },
        { category: "internal", source: "service" },
      ],
      [
        SETUP_LIFECYCLE_CHANGED_EVENT,
        { change: "step_completed", stepId: "acme.profile" },
        { category: "internal", source: "service" },
      ],
    ])
  })

  it("retains unknown steps and surfaces newly selected steps as incomplete", async () => {
    const store = new MemorySetupStore()
    const removedStep = { id: "removed.step", skippable: true } as const
    const newStep = { id: "new.step", skippable: true } as const
    await initializeSetup(store, { stepIds: [removedStep.id], fresh: false }, [removedStep])
    await completeSetupStep(store, [removedStep], removedStep.id)
    const state = await initializeSetup(store, { stepIds: [newStep.id], fresh: false }, [newStep])

    expect(state.steps.map((step) => step.stepId)).toEqual(["new.step"])
    expect(state.steps.find((step) => step.stepId === "new.step")).toMatchObject({
      completedAt: null,
      skippedAt: null,
    })
  })

  it("returns opaque prefill without treating it as completion", async () => {
    const store = new MemorySetupStore()
    const state = await initializeSetup(
      store,
      { stepIds: ["acme.profile"], fresh: true },
      [profileStep],
      { "acme.profile": { businessName: "Acme" } },
    )
    expect(state.prefill).toEqual({ "acme.profile": { businessName: "Acme" } })
    expect(state.steps[0]?.completedAt).toBeNull()
    expect((await getSetupState(store, [profileStep]))?.steps[0]?.completedAt).toBeNull()
  })

  it("rejects initialization ids outside the selected graph", async () => {
    const store = new MemorySetupStore()
    await expect(
      initializeSetup(store, { stepIds: ["unselected.step"], fresh: true }, [profileStep]),
    ).rejects.toThrow(/do not match the selected project graph/)
    expect(store.organization).toBeNull()
  })

  it("rejects completion outside the selected graph and non-skippable skips", async () => {
    const store = new MemorySetupStore()
    const requiredStep = { id: "acme.required", skippable: false } as const
    await initializeSetup(store, { stepIds: [requiredStep.id], fresh: false }, [requiredStep])

    await expect(completeSetupStep(store, [requiredStep], "other.step")).rejects.toThrow(
      /not selected/,
    )
    await expect(skipSetupStep(store, [requiredStep], requiredStep.id)).rejects.toThrow(
      /cannot be skipped/,
    )
    expect(store.steps.get(requiredStep.id)?.skippedAt).toBeNull()
  })

  it("rolls back initialization so a retry still requests the first-run redirect", async () => {
    class FailingStore extends MemorySetupStore {
      fail = true
      override async ensureStep(stepId: string, firstSeenAt: Date) {
        const created = await super.ensureStep(stepId, firstSeenAt)
        if (this.fail) {
          this.fail = false
          throw new Error("step insert failed")
        }
        return created
      }
    }
    const store = new FailingStore()
    const emit = vi.fn(async () => undefined)
    const runtime = { eventBus: { emit } as EventBus }

    await expect(
      initializeSetup(
        store,
        { stepIds: [profileStep.id], fresh: true },
        [profileStep],
        {},
        runtime,
      ),
    ).rejects.toThrow("step insert failed")
    expect(store.organization).toBeNull()
    expect(store.steps.size).toBe(0)
    expect(emit).not.toHaveBeenCalled()

    await expect(
      initializeSetup(
        store,
        { stepIds: [profileStep.id], fresh: true },
        [profileStep],
        {},
        runtime,
      ),
    ).resolves.toMatchObject({ shouldRedirect: true })
    expect(emit).toHaveBeenCalledOnce()
  })
})
