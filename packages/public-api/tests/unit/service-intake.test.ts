import { beforeEach, describe, expect, it, vi } from "vitest"

import { subscribePublicApiNewsletter } from "../../src/service-intake.js"
import type { PublicApiNewsletterSubscribeInput } from "../../src/validation.js"

const persistenceMocks = {
  findSignal: vi.fn(),
  createCustomerSignal: vi.fn(),
  createPerson: vi.fn(),
  deleteCustomerSignal: vi.fn(),
  deletePerson: vi.fn(),
  updateCustomerSignal: vi.fn(),
}

function createSignalRow(data: Record<string, unknown>) {
  return {
    id: "csig_newsletter",
    personId: String(data.personId ?? "pers_newsletter"),
    kind: data.kind ?? "notify",
    source: data.source ?? "form",
    status: data.status ?? "new",
    productId: null,
    optionUnitId: null,
    sourceSubmissionId: data.sourceSubmissionId as string | null | undefined,
    metadata: data.metadata,
  }
}

describe("subscribePublicApiNewsletter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    persistenceMocks.findSignal.mockResolvedValue(null)
    persistenceMocks.createPerson.mockResolvedValue({ id: "pers_newsletter" })
    persistenceMocks.createCustomerSignal.mockImplementation(async ({ data }) =>
      createSignalRow(data),
    )
    persistenceMocks.updateCustomerSignal.mockImplementation(async ({ data }) => ({
      ...createSignalRow({}),
      metadata: data.metadata,
    }))
    persistenceMocks.deleteCustomerSignal.mockResolvedValue({ id: "csig_newsletter" })
    persistenceMocks.deletePerson.mockResolvedValue({ id: "pers_newsletter" })
  })

  it("does not persist requested double opt-in until the hook succeeds", async () => {
    const db = {}
    const eventBus = { emit: vi.fn() }
    const requestDoubleOptIn = vi
      .fn()
      .mockRejectedValueOnce(new Error("mail provider down"))
      .mockResolvedValueOnce(undefined)
    const body = {
      email: "News@Example.com",
      sourceSubmissionId: "newsletter_homepage_news@example.com",
      tags: [],
      payload: {},
      consent: {
        newsletter: true,
        gdpr: true,
      },
    } satisfies PublicApiNewsletterSubscribeInput

    await expect(
      subscribePublicApiNewsletter({
        body,
        context: { db: db as never, eventBus },
        intake: { persistence: persistenceMocks as never },
        requestDoubleOptIn,
      }),
    ).rejects.toThrow("mail provider down")

    expect(persistenceMocks.createCustomerSignal.mock.calls[0]?.[0].data.metadata).toMatchObject({
      newsletter: {
        email: "news@example.com",
        doubleOptIn: "not_configured",
      },
    })
    expect(persistenceMocks.updateCustomerSignal).not.toHaveBeenCalled()
    expect(persistenceMocks.deleteCustomerSignal).toHaveBeenCalledWith({
      context: { db: db as never, eventBus },
      id: "csig_newsletter",
    })
    expect(persistenceMocks.deletePerson).toHaveBeenCalledWith({
      context: { db: db as never, eventBus },
      id: "pers_newsletter",
    })
    expect(eventBus.emit).not.toHaveBeenCalled()

    const result = await subscribePublicApiNewsletter({
      body,
      context: { db: db as never, eventBus },
      intake: { persistence: persistenceMocks as never },
      requestDoubleOptIn,
    })

    expect(requestDoubleOptIn).toHaveBeenCalledTimes(2)
    expect(persistenceMocks.createCustomerSignal.mock.calls[1]?.[0].data.metadata).toMatchObject({
      newsletter: {
        email: "news@example.com",
        doubleOptIn: "not_configured",
      },
    })
    expect(persistenceMocks.updateCustomerSignal.mock.calls[0]?.[0].data.metadata).toMatchObject({
      newsletter: {
        email: "news@example.com",
        doubleOptIn: "requested",
      },
    })
    expect(result.doubleOptIn).toBe("requested")
    expect(eventBus.emit).toHaveBeenCalledTimes(1)
  })
})
