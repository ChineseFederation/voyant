import type { ToolContext } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import {
  COMPOSE_PRODUCT_HANDLER_POLICY,
  CREATE_PRODUCT_HANDLER_POLICY,
  composeProductTool,
  createProductTool,
  type InventoryToolContext,
} from "../../src/tools.js"

describe("Inventory created handler admission", () => {
  it.each([
    "missing",
    "stale",
    "non-staff",
  ] as const)("rejects %s create policy before mutation", async (variant) => {
    let mutations = 0
    const context = toolContext(CREATE_PRODUCT_HANDLER_POLICY, variant)
    context.inventory = {
      listProducts: async () => ({ data: [], total: 0, limit: 1, offset: 0 }),
      getProductById: async () => null,
      getProductAggregates: async () => ({}),
      async createProduct() {
        mutations += 1
        return { productId: "prod_never" }
      },
      updateProduct: async () => null,
    }
    await expect(
      createProductTool.handler(
        { name: "Never", sellCurrency: "EUR", idempotencyKey: "never" },
        context,
      ),
    ).rejects.toMatchObject({
      code: "ACTION_POLICY_REQUIRED",
    })
    expect(mutations).toBe(0)
  })

  it.each([
    "missing",
    "stale",
    "non-staff",
  ] as const)("rejects %s compose policy before mutation", async (variant) => {
    let mutations = 0
    const context = toolContext(COMPOSE_PRODUCT_HANDLER_POLICY, variant)
    context.inventoryAuthoring = {
      async composeProduct() {
        mutations += 1
        return { status: "created", productId: "prod_never", reused: false }
      },
    }
    await expect(
      composeProductTool.handler(
        {
          spec: {
            product: { name: "Never", sellCurrency: "EUR" },
            options: [{ ref: "standard", name: "Standard" }],
          },
          idempotencyKey: "never",
        },
        context,
      ),
    ).rejects.toMatchObject({
      code: "ACTION_POLICY_REQUIRED",
    })
    expect(mutations).toBe(0)
  })
})

function toolContext(
  expected: typeof CREATE_PRODUCT_HANDLER_POLICY | typeof COMPOSE_PRODUCT_HANDLER_POLICY,
  variant: "missing" | "stale" | "non-staff",
): InventoryToolContext {
  const actor = variant === "non-staff" ? "customer" : "staff"
  const base: InventoryToolContext = {
    db: {},
    actor,
    audience: actor,
    tenantId: "default",
    resolverScope: { locale: "en", market: "default", actor, audience: actor },
  }
  if (variant === "missing") return base
  base.handlerActionPolicy = {
    capabilityId: expected.capabilityId,
    capabilityVersion: expected.capabilityVersion,
    canonicalName: variant === "stale" ? `${expected.canonicalName}_stale` : expected.canonicalName,
    actionPolicy: {
      ...expected.actionPolicy,
      enforcement: "handler",
      invocation: {
        controlField: "_voyant",
        requiredFields: [],
        optionalFields: [],
        fingerprintAlgorithm: "action-ledger-command-v1",
      },
    },
    invocation: {},
  } as ToolContext["handlerActionPolicy"]
  return base
}
