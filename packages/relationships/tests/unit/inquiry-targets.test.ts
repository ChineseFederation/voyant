import { describe, expect, it, vi } from "vitest"

import { type InquiryServiceError, inquiriesService } from "../../src/service/inquiries.js"
import { inquiryProductLink } from "../../src/standard-links.js"

describe("Inquiry targets", () => {
  it("resolves a selected targetLinkId only when its standard link is active", async () => {
    const snapshot = {
      linkId: "link_1",
      inquiryId: "inq_1",
      kind: "product" as const,
      targetId: "prod_1",
      snapshot: { title: "Kyoto discovery" },
      createdAt: new Date("2026-08-18T00:00:00.000Z"),
    }
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [snapshot] }),
        }),
      }),
    }
    const link = {
      list: vi.fn(async () => [
        {
          id: "link_1",
          leftId: "inq_1",
          rightId: "prod_1",
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.createdAt,
          deletedAt: null,
        },
      ]),
    }

    await expect(
      inquiriesService.resolveInquiryTarget(db as never, link as never, "inq_1", "link_1"),
    ).resolves.toMatchObject({ linkId: "link_1", kind: "product", targetId: "prod_1" })
    expect(link.list).toHaveBeenCalledWith(inquiryProductLink.tableName, { leftId: "inq_1" })
  })

  it("refuses canonical kinds that have no selected owner linkable", async () => {
    await expect(
      inquiriesService.addInquiryTarget(
        {} as never,
        "inq_1",
        { kind: "trip", targetId: "trpe_1", snapshot: { title: "Draft trip" } },
        "staff_1",
      ),
    ).rejects.toMatchObject<Partial<InquiryServiceError>>({
      code: "INQUIRY_TARGET_UNSUPPORTED",
    })
  })
})
