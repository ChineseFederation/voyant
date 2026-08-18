import { afterEach, describe, expect, it, vi } from "vitest"

import { voyantToolContextContribution } from "../../src/mcp-runtime.js"
import { relationshipsService } from "../../src/service/index.js"

describe("Inquiry Tool target projections", () => {
  afterEach(() => vi.restoreAllMocks())

  it("enriches a mutation result from the active standard-link projection", async () => {
    const db = {}
    vi.spyOn(relationshipsService, "assignInquiry").mockResolvedValue({
      id: "inq_1",
      ownerId: "staff_2",
    } as never)
    vi.spyOn(relationshipsService, "listInquiryTargets").mockResolvedValue([
      {
        linkId: "link_1",
        inquiryId: "inq_1",
        kind: "product",
        targetId: "prod_1",
        snapshot: { title: "Danube cruise" },
        createdAt: "2026-08-18T08:00:00.000Z",
      },
    ])
    const vars = {
      userId: "staff_1",
      actor: "staff",
      callerType: "agent",
      isInternalRequest: false,
    }
    const request = {
      var: vars,
      get(key: string) {
        return vars[key as keyof typeof vars]
      },
      req: { header: () => null },
    }

    const contribution = await voyantToolContextContribution.contribute({
      request: request as never,
      context: { db } as never,
      resources: {},
    })
    const relationships = contribution.relationships as {
      assignInquiry(input: { id: string; ownerId: string }): Promise<unknown>
    }

    await expect(
      relationships.assignInquiry({ id: "inq_1", ownerId: "staff_2" }),
    ).resolves.toMatchObject({
      id: "inq_1",
      targets: [{ linkId: "link_1", kind: "product", targetId: "prod_1" }],
    })
    expect(relationshipsService.listInquiryTargets).toHaveBeenCalledWith(
      db,
      expect.anything(),
      "inq_1",
    )
  })
})
