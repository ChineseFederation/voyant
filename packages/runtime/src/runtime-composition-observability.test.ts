import path from "node:path"
import { noopAnalytics } from "@voyant-travel/core/analytics"
import { describe, expect, it, vi } from "vitest"
import {
  createGeneratedProject,
  getRuntimeCompositionMocks,
  loadVoyantProject,
} from "./runtime-composition.test-support.js"

const mocks = getRuntimeCompositionMocks()

/**
 * Both observability seams shipped unbound: `analytics.runtime` had no provider
 * anywhere in the repository, so the booking engine's `engine.*` events reached
 * `noopAnalytics` on every deployment, and the reporter was hard-coded past the
 * Sentry adapter nobody could reach (voyant#4682). These pin the composition,
 * not the emission — `booking-engine/analytics.test.ts` owns which events a
 * rejection produces.
 */

type BoundAnalytics = {
  track(event: string, properties?: Record<string, unknown>): void
}

async function composeProject(host?: Record<string, unknown>): Promise<void> {
  const projectRoot = await createGeneratedProject()
  await loadVoyantProject({
    projectRoot,
    adminAssetsDir: path.join(projectRoot, "admin"),
    ...(host ? { host } : {}),
  })
}

function boundAnalytics(): BoundAnalytics {
  const composed = mocks.runtimePortHosts.at(0)
  if (!composed) throw new Error("the project composed no runtime-port host")
  return composed.runtimePorts?.["analytics.runtime"] as BoundAnalytics
}

describe("Voyant observability composition", () => {
  it("binds a sink that writes the event a silent checkout would have emitted", async () => {
    await composeProject()

    const lines = vi.spyOn(console, "log").mockImplementation(() => undefined)
    try {
      boundAnalytics().track("engine.hold.failed", {
        booking_session_id: "bses_1",
        failure_reason: "hold_quantity_mismatch",
      })
      expect(lines).toHaveBeenCalledTimes(1)
      expect(JSON.parse(String(lines.mock.calls[0]?.[0]))).toEqual({
        voyant: "analytics",
        kind: "track",
        event: "engine.hold.failed",
        properties: {
          booking_session_id: "bses_1",
          failure_reason: "hold_quantity_mismatch",
        },
      })
    } finally {
      lines.mockRestore()
    }
  })

  it("keeps a project's own analytics binding", async () => {
    const projectAnalytics = { track: vi.fn(), identify: vi.fn(), group: vi.fn() }

    await composeProject({ runtimePorts: { "analytics.runtime": projectAnalytics } })

    expect(boundAnalytics()).toBe(projectAnalytics)
  })

  it("lets a project opt back into silence", async () => {
    await composeProject({ runtimePorts: { "analytics.runtime": noopAnalytics } })

    const lines = vi.spyOn(console, "log").mockImplementation(() => undefined)
    try {
      boundAnalytics().track("engine.hold.failed", { booking_session_id: "bses_1" })
      expect(lines).not.toHaveBeenCalled()
    } finally {
      lines.mockRestore()
    }
  })

  it("falls back to the console reporter when the project supplies none", async () => {
    await composeProject()

    expect(mocks.consoleReporter).toHaveBeenCalledTimes(1)
  })

  it("uses the project's reporter instead of constructing the console one", async () => {
    const projectReporter = { captureException: vi.fn() }

    await composeProject({ reporter: projectReporter })

    expect(mocks.consoleReporter).not.toHaveBeenCalled()
  })

  /**
   * Selecting a reporter and not handing it to the application is the failure
   * this whole PR is about, one layer up: `createApp` falls back to
   * `noopReporter` when its config carries none, so the 5xx boundary and every
   * other catch point it owns would discard exceptions while the composition
   * looked correctly wired. Nothing had ever passed one.
   */
  it("hands the reporter to the application, not only to auth and the webhook loops", async () => {
    const projectReporter = { captureException: vi.fn() }

    await composeProject({ reporter: projectReporter })

    const [runtimeOptions] = mocks.loadVoyantNodeRuntime.mock.calls.at(0) ?? []
    expect(runtimeOptions?.app?.reporter).toBe(projectReporter)
  })

  it("hands the console reporter to the application when the project supplies none", async () => {
    await composeProject()

    const [runtimeOptions] = mocks.loadVoyantNodeRuntime.mock.calls.at(0) ?? []
    expect(runtimeOptions?.app?.reporter).toBe(mocks.consoleReporter.mock.results.at(0)?.value)
  })
})
