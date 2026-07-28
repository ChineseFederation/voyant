import { beforeEach, describe, expect, it, vi } from "vitest"

const buildNotificationTaskRuntimeMock = vi.fn()
const createNotificationServiceMock = vi.fn()
const deliverReminderRunMock = vi.fn()

vi.mock("../../src/task-runtime.js", () => ({
  buildNotificationTaskRuntime: buildNotificationTaskRuntimeMock,
}))

vi.mock("../../src/service.js", () => ({
  createNotificationService: createNotificationServiceMock,
}))

vi.mock("../../src/service-reminders.js", () => ({
  deliverReminderRun: deliverReminderRunMock,
}))

describe("deliverQueuedNotificationReminder", () => {
  beforeEach(() => {
    buildNotificationTaskRuntimeMock.mockReset()
    createNotificationServiceMock.mockReset()
    deliverReminderRunMock.mockReset()
  })

  it("builds the runtime providers and delivers a single queued reminder run", async () => {
    const dispatcher = { send: vi.fn(), sendWith: vi.fn(), getProvider: vi.fn() }

    buildNotificationTaskRuntimeMock.mockReturnValue({
      providers: [],
    })
    createNotificationServiceMock.mockReturnValue(dispatcher)
    deliverReminderRunMock.mockResolvedValue({ id: "ntrn_123", status: "sent" })

    const { deliverQueuedNotificationReminder } = await import(
      "../../src/tasks/deliver-reminder.js"
    )

    await expect(
      deliverQueuedNotificationReminder({} as never, {}, { reminderRunId: "ntrn_123" }),
    ).resolves.toEqual({ reminderRunId: "ntrn_123", status: "sent" })

    expect(createNotificationServiceMock).toHaveBeenCalledWith([])
    expect(deliverReminderRunMock).toHaveBeenCalledWith(
      {} as never,
      dispatcher,
      {
        reminderRunId: "ntrn_123",
      },
      {
        publicCustomerPortalBaseUrl: undefined,
      },
    )
  })
})
