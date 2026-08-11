import { definePort } from "@voyant-travel/core/project"

import type { NotificationPayload, NotificationProvider, NotificationResult } from "./types.js"

export interface DurableNotificationProviderProbe {
  /** Isolated, non-delivering instances of the exact selected implementations. */
  readonly providers: ReadonlyArray<NotificationProvider>
  /** Recreate those instances while retaining only provider-backend durable state. */
  restart(): Promise<ReadonlyArray<NotificationProvider>>
  acceptedCount(providerName: string, idempotencyKey: string): number | Promise<number>
}

/** Exact selected provider set plus an isolated, non-delivering behavioral probe. */
export interface DurableNotificationProviderRuntime {
  readonly providers: ReadonlyArray<NotificationProvider>
  createIsolatedProbe(): Promise<DurableNotificationProviderProbe>
}

export const durableNotificationProviderPort = definePort<DurableNotificationProviderRuntime>({
  id: "notifications.durable-provider",
  conformance: {
    entry: "@voyant-travel/notifications/durable-provider-port",
    export: "durableNotificationProviderPort",
  },
  test: assertRuntimeShape,
  async verify(runtime) {
    const selectedProviders = [...runtime.providers]

    const probe = await runtime.createIsolatedProbe()
    if (
      runtime.providers.length !== selectedProviders.length ||
      runtime.providers.some((provider, index) => !Object.is(provider, selectedProviders[index]))
    ) {
      throw new Error("notifications.durable-provider selected backend changed during conformance")
    }
    const beforeRestart = [...probe.providers]
    assertExactProviderSet(selectedProviders, beforeRestart, "before restart")
    const attempts = new Map<
      string,
      { key: string; payload: NotificationPayload; result: NotificationResult }
    >()
    for (const before of beforeRestart) {
      assertDurableProvider(before)
      const channel = before.channels[0]
      if (!channel)
        throw new Error(`notifications.durable-provider "${before.name}" has no channel`)
      const key = `voyant:notification:conformance:${before.name}`
      const payload: NotificationPayload = {
        to: "conformance.invalid",
        channel,
        template: "conformance-template",
        data: { probe: true },
      }
      const first = await send(before, payload, key)
      const replay = await send(before, payload, key)
      if (JSON.stringify(first) !== JSON.stringify(replay)) {
        throw new Error(`notifications.durable-provider "${before.name}" failed replay conformance`)
      }
      attempts.set(before.name, { key, payload, result: first })
    }

    const afterRestart = [...(await probe.restart())]
    assertExactProviderSet(selectedProviders, afterRestart, "after restart")
    for (const after of afterRestart) {
      const before = beforeRestart.find(({ name }) => name === after.name)
      if (!before || Object.is(before, after)) {
        throw new Error(
          `notifications.durable-provider "${after.name}" was not recreated across restart`,
        )
      }
      assertDurableProvider(after)
      const attempt = attempts.get(after.name)
      if (!attempt) throw new Error(`notifications.durable-provider probe lost "${after.name}"`)
      const restartedReplay = await send(after, attempt.payload, attempt.key)
      if (
        JSON.stringify(attempt.result) !== JSON.stringify(restartedReplay) ||
        (await probe.acceptedCount(after.name, attempt.key)) !== 1
      ) {
        throw new Error(
          `notifications.durable-provider "${after.name}" failed restart replay conformance`,
        )
      }
      await expectPayloadDriftRejected(
        after,
        { ...attempt.payload, to: "drift.invalid" },
        attempt.key,
      )
    }
  },
})

function assertRuntimeShape(runtime: DurableNotificationProviderRuntime): void {
  if (
    !runtime ||
    typeof runtime !== "object" ||
    !Array.isArray(runtime.providers) ||
    runtime.providers.length === 0 ||
    typeof runtime.createIsolatedProbe !== "function"
  ) {
    throw new Error("notifications.durable-provider must expose providers and an isolated probe")
  }
  for (const provider of runtime.providers) assertDurableProvider(provider)
  assertUniqueProviderNames(runtime.providers, "selected runtime")
}

function assertDurableProvider(provider: NotificationProvider): void {
  const capability = provider?.durableDelivery
  if (
    capability?.protocol !== "notification-provider-idempotency-v1" ||
    typeof capability.send !== "function"
  ) {
    throw new Error("notifications.durable-provider must expose one crash-safe idempotent send")
  }
}

function send(
  provider: NotificationProvider,
  payload: NotificationPayload,
  idempotencyKey: string,
): Promise<NotificationResult> {
  const capability = provider.durableDelivery
  if (!capability) throw new Error("durable provider disappeared during conformance")
  return capability.send(payload, { idempotencyKey })
}

function assertUniqueProviderNames(
  providers: ReadonlyArray<NotificationProvider>,
  source: string,
): void {
  const names = providers.map(({ name }) => name)
  if (names.some((name) => !name.trim()) || new Set(names).size !== names.length) {
    throw new Error(`notifications.durable-provider ${source} has invalid or duplicate names`)
  }
}

function assertExactProviderSet(
  selected: ReadonlyArray<NotificationProvider>,
  probeProviders: ReadonlyArray<NotificationProvider>,
  phase: string,
): void {
  assertUniqueProviderNames(probeProviders, `probe ${phase}`)
  const descriptors = (providers: ReadonlyArray<NotificationProvider>) =>
    providers
      .map(({ channels, name }) => ({ name, channels: [...channels].sort() }))
      .sort((left, right) => left.name.localeCompare(right.name))
  if (JSON.stringify(descriptors(selected)) !== JSON.stringify(descriptors(probeProviders))) {
    throw new Error(
      `notifications.durable-provider probe ${phase} does not match the exact selected provider set`,
    )
  }
}

async function expectPayloadDriftRejected(
  provider: NotificationProvider,
  payload: NotificationPayload,
  idempotencyKey: string,
): Promise<void> {
  try {
    await send(provider, payload, idempotencyKey)
  } catch {
    return
  }
  throw new Error(`notifications.durable-provider "${provider.name}" accepted payload drift`)
}
