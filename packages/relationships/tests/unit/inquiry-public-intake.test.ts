import { describe, expect, it, vi } from "vitest"

import { inquiriesService } from "../../src/service/inquiries.js"

describe("public Inquiry intake", () => {
  it("maps storefront provenance without forcing Person creation and links targets once", async () => {
    const inquiry = {
      id: "inq_1",
      status: "new" as const,
      createdAt: new Date("2026-08-18T00:00:00.000Z"),
    }
    const create = vi
      .spyOn(inquiriesService, "createInquiry")
      .mockResolvedValue({ inquiry: inquiry as never, replayed: false })
    const addTarget = vi
      .spyOn(inquiriesService, "addInquiryTarget")
      .mockResolvedValue({ linkId: "link_1" } as never)
    const tx = {}
    const db = { transaction: async (run: (value: unknown) => unknown) => run(tx) }
    const targetValidation = { validateTarget: vi.fn(async () => "valid" as const) }

    const result = await inquiriesService.createPublicInquiry(
      db as never,
      {
        sourceRef: "submission-1",
        subject: "Kyoto question",
        kind: "product",
        contactSnapshot: { email: "traveler@example.com" },
        targets: [
          {
            kind: "product",
            targetId: "prod_1",
            snapshot: { title: "Kyoto discovery", sourceChannel: "spoofed-channel" } as never,
          },
        ],
        tags: [],
        customFields: {},
      },
      { actorId: "storefront:channel-1", channelId: "channel-1", targetValidation },
    )

    expect(result.replayed).toBe(false)
    expect(create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        source: "storefront",
        sourceRef: "channel-1:submission-1",
        personId: null,
        contactSnapshot: { email: "traveler@example.com" },
        customFields: { relationships: { sourceChannelId: "channel-1" } },
      }),
      "storefront:channel-1",
      { slaPolicy: undefined },
    )
    expect(addTarget).toHaveBeenCalledWith(
      tx,
      "inq_1",
      expect.objectContaining({
        kind: "product",
        snapshot: { title: "Kyoto discovery", sourceChannel: "channel-1" },
      }),
      "storefront:channel-1",
      targetValidation,
    )
    create.mockRestore()
    addTarget.mockRestore()
  })

  it("does not mutate targets on an idempotent replay", async () => {
    const create = vi.spyOn(inquiriesService, "createInquiry").mockResolvedValue({
      inquiry: { id: "inq_existing", status: "new", createdAt: new Date() } as never,
      replayed: true,
    })
    const addTarget = vi.spyOn(inquiriesService, "addInquiryTarget")
    const db = { transaction: async (run: (value: unknown) => unknown) => run({}) }

    await inquiriesService.createPublicInquiry(
      db as never,
      {
        sourceRef: "submission-1",
        subject: "Replay",
        kind: "product",
        contactSnapshot: { email: "traveler@example.com" },
        targets: [],
        tags: [],
        customFields: {},
      },
      { actorId: "storefront:channel-1", channelId: "channel-1" },
    )

    expect(addTarget).not.toHaveBeenCalled()
    create.mockRestore()
    addTarget.mockRestore()
  })

  it("attaches only the canonical Person supplied by authenticated request context", async () => {
    const create = vi.spyOn(inquiriesService, "createInquiry").mockResolvedValue({
      inquiry: { id: "inq_known", status: "new", createdAt: new Date() } as never,
      replayed: false,
    })
    const db = { transaction: async (run: (value: unknown) => unknown) => run({}) }

    await inquiriesService.createPublicInquiry(
      db as never,
      {
        sourceRef: "known-1",
        subject: "Known customer",
        kind: "custom_trip",
        contactSnapshot: { email: "known@example.com" },
        targets: [],
        tags: [],
        customFields: {},
      },
      {
        actorId: "customer:user-1",
        channelId: "channel-1",
        relationshipPersonId: "per_canonical",
      },
    )

    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ personId: "per_canonical" }),
      "customer:user-1",
      { slaPolicy: undefined },
    )
  })
})
