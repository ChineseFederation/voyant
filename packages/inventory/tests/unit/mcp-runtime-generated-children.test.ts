import type { ToolContext, ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { afterEach, describe, expect, it, vi } from "vitest"

const executeAdmittedCreatedTargetCommand = vi.hoisted(() => vi.fn())

vi.mock("@voyant-travel/action-ledger/created-command", () => ({
  executeAdmittedCreatedTargetCommand,
}))

import { inventoryExtrasService } from "../../src/extras/service.js"
import { voyantToolContextContribution } from "../../src/mcp-runtime.js"

const toolContext: ToolContext = {
  db: {},
  actor: "staff",
  audience: "staff",
  tenantId: "org_1",
  resolverScope: { locale: "en", audience: "staff", market: "default", actor: "staff" },
}

afterEach(() => {
  vi.restoreAllMocks()
  executeAdmittedCreatedTargetCommand.mockReset()
})

/**
 * A real admission always carries its action policy, and the executor compares
 * its `risk` against the `evaluatedRisk` the caller passes — a bare `{}` here
 * hid that coupling and let a risk mismatch reach production undetected.
 */
function admittedWithRisk(risk: "low" | "medium" | "high"): ToolHandlerActionPolicyContext {
  return { actionPolicy: { risk } } as unknown as ToolHandlerActionPolicyContext
}

describe("inventory generated-child runtime", () => {
  it("checks related option membership and inserts on the admitted transaction", async () => {
    const tx = anchorLookup([{ productId: "product_1" }])
    executeAdmittedCreatedTargetCommand.mockImplementation(async (_input, handlers) => {
      const mutation = await handlers.create(tx)
      return { replayed: false, value: mutation.value, result: {} }
    })
    const create = vi
      .spyOn(inventoryExtrasService, "createOptionExtraConfig")
      .mockResolvedValue({ id: "config_1" } as never)
    const runtime = await inventoryExtrasRuntime()

    await expect(
      runtime.createOptionExtraConfig(
        {
          productExtraId: "extra_1",
          optionId: "option_1",
        },
        admittedWithRisk("high"),
      ),
    ).resolves.toEqual({ id: "config_1", replayed: false })
    expect(create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ productExtraId: "extra_1", optionId: "option_1" }),
    )
  })

  it("rejects unrelated option and product-extra anchors before child insertion", async () => {
    const tx = anchorLookup([])
    executeAdmittedCreatedTargetCommand.mockImplementation(async (_input, handlers) => {
      const mutation = await handlers.create(tx)
      return { replayed: false, value: mutation.value, result: {} }
    })
    const create = vi.spyOn(inventoryExtrasService, "createOptionExtraConfig")
    const runtime = await inventoryExtrasRuntime()

    await expect(
      runtime.createOptionExtraConfig(
        {
          productExtraId: "extra_1",
          optionId: "option_other_product",
        },
        admittedWithRisk("high"),
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" })
    expect(create).not.toHaveBeenCalled()
  })
})

async function inventoryExtrasRuntime() {
  const contribution = await voyantToolContextContribution.contribute({
    request: request(),
    context: toolContext,
    resources: {},
  })
  if (!contribution.inventoryExtras) throw new Error("missing inventory extras runtime")
  return contribution.inventoryExtras
}

function anchorLookup(rows: Array<{ productId: string }>) {
  return {
    select() {
      return {
        from() {
          return {
            innerJoin() {
              return {
                where() {
                  return { limit: () => Promise.resolve(rows) }
                },
              }
            },
          }
        },
      }
    },
  }
}

function request() {
  return {
    var: {
      actor: "staff",
      callerType: "agent",
      agentId: "agent_1",
      organizationId: "org_1",
    },
    get(key: string) {
      return this.var[key as keyof typeof this.var]
    },
    req: { header: () => null },
  } as never
}
