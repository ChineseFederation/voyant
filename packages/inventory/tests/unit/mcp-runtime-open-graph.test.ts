import type { ToolContext } from "@voyant-travel/tools"
import { afterEach, describe, expect, it, vi } from "vitest"

import { voyantToolContextContribution } from "../../src/mcp-runtime.js"
import { mediaProductsService, ProductOpenGraphMediaError } from "../../src/service-media.js"
import type { InventoryToolServices } from "../../src/tools.js"

const toolContext: ToolContext = {
  db: {},
  actor: "staff",
  audience: "staff",
  tenantId: "org_1",
  resolverScope: { locale: "en", audience: "staff", market: "default", actor: "staff" },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("inventory Open Graph image Tool runtime", () => {
  it("delegates to the media service and emits the media content-change event", async () => {
    const row = { id: "pmed_1", productId: "prod_1", isOpenGraph: true }
    const setOpenGraphMedia = vi
      .spyOn(mediaProductsService, "setOpenGraphMedia")
      .mockResolvedValue(row as never)
    const emit = vi.fn().mockResolvedValue(undefined)
    const inventory = await inventoryRuntime(emit)

    await expect(inventory.setProductOpenGraphImage("prod_1", "pmed_1")).resolves.toBe(row)
    expect(setOpenGraphMedia).toHaveBeenCalledWith(toolContext.db, "prod_1", "pmed_1")
    expect(emit).toHaveBeenCalledWith(
      "product.content.changed",
      { id: "prod_1", axis: "media" },
      { category: "domain", source: "service" },
    )
  })

  it.each([
    ["product_not_found", "NOT_FOUND"],
    ["invalid_media_target", "INVALID_INPUT"],
  ] as const)("maps %s service failures to %s", async (reason, code) => {
    vi.spyOn(mediaProductsService, "setOpenGraphMedia").mockRejectedValue(
      new ProductOpenGraphMediaError(reason, "Open Graph image cannot be selected"),
    )
    const emit = vi.fn().mockResolvedValue(undefined)
    const inventory = await inventoryRuntime(emit)

    await expect(inventory.setProductOpenGraphImage("prod_1", "pmed_1")).rejects.toMatchObject({
      code,
      meta: { productId: "prod_1", reason },
    })
    expect(emit).not.toHaveBeenCalled()
  })
})

async function inventoryRuntime(emit: ReturnType<typeof vi.fn>): Promise<InventoryToolServices> {
  const contribution = await voyantToolContextContribution.contribute({
    request: {
      var: { eventBus: { emit }, actor: "staff", callerType: "agent", agentId: "agent_1" },
      get(key: string) {
        return this.var[key as keyof typeof this.var]
      },
      req: { header: () => null },
    } as never,
    context: toolContext,
    resources: {},
  })
  if (!contribution.inventory) throw new Error("missing inventory runtime")
  return contribution.inventory
}
