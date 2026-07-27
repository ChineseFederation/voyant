import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  CREATE_OPTION_UNIT_HANDLER_POLICY,
  CREATE_PRODUCT_OPTION_HANDLER_POLICY,
  createOptionUnitInputSchema,
  type InventoryOptionToolServices,
  inventoryOptionTools,
} from "../src/option-tools.js"

function admitted(
  expected: typeof CREATE_PRODUCT_OPTION_HANDLER_POLICY | typeof CREATE_OPTION_UNIT_HANDLER_POLICY,
): ToolContext["handlerActionPolicy"] {
  return {
    capabilityId: expected.capabilityId,
    capabilityVersion: expected.capabilityVersion,
    canonicalName: expected.canonicalName,
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
}

function ctxWith(
  services: Partial<InventoryOptionToolServices>,
  overrides: Partial<ToolContext> = {},
): ToolContext & { inventoryOptions?: InventoryOptionToolServices } {
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "default",
    resolverScope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" },
    ...overrides,
    inventoryOptions: services as InventoryOptionToolServices,
  } as ToolContext & { inventoryOptions?: InventoryOptionToolServices }
}

function makeRegistry() {
  const registry = createToolRegistry()
  for (const tool of inventoryOptionTools) {
    if (tool.name === "create_product_option") {
      registry.register(tool, { actionPolicy: CREATE_PRODUCT_OPTION_HANDLER_POLICY.actionPolicy })
    } else if (tool.name === "create_option_unit") {
      registry.register(tool, { actionPolicy: CREATE_OPTION_UNIT_HANDLER_POLICY.actionPolicy })
    } else {
      registry.register(tool)
    }
  }
  return registry
}

describe("inventory option tools", () => {
  it("exposes option and unit reads and writes", () => {
    expect(
      makeRegistry()
        .list()
        .map((tool) => tool.name)
        .sort(),
    ).toEqual([
      "create_option_unit",
      "create_product_option",
      "get_option_unit",
      "get_product_option",
      "list_option_units",
      "list_product_options",
      "update_option_unit",
      "update_product_option",
    ])
  })

  // Dispatch through the registry rather than calling `handler` directly: only
  // the registry mints an authentic handler admission, so this also proves the
  // tool's declared action policy matches its registration.
  it("adds a unit to an existing option", async () => {
    const calls: unknown[] = []
    const result = await makeRegistry().dispatch(
      "create_option_unit",
      { optionId: "opt_1", name: "Adult", unitType: "person", minQuantity: 1, maxQuantity: 9 },
      ctxWith(
        {
          createOptionUnit: async (input) => {
            calls.push(input)
            return { id: "unit_1", replayed: false }
          },
        },
        { handlerActionPolicy: admitted(CREATE_OPTION_UNIT_HANDLER_POLICY) },
      ),
    )

    expect(result).toEqual({ id: "unit_1", replayed: false })
    expect(calls).toEqual([
      {
        optionId: "opt_1",
        name: "Adult",
        unitType: "person",
        minQuantity: 1,
        maxQuantity: 9,
        isHidden: false,
        isRequired: false,
        sortOrder: 0,
      },
    ])
  })

  it("adds an option to an existing product", async () => {
    const calls: unknown[] = []
    const result = await makeRegistry().dispatch(
      "create_product_option",
      { productId: "prod_1", name: "Standard fare" },
      ctxWith(
        {
          createProductOption: async (input) => {
            calls.push(input)
            return { id: "opt_1", replayed: false }
          },
        },
        { handlerActionPolicy: admitted(CREATE_PRODUCT_OPTION_HANDLER_POLICY) },
      ),
    )

    expect(result).toEqual({ id: "opt_1", replayed: false })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ productId: "prod_1", name: "Standard fare" })
  })

  // The occupancy rule lives in a `superRefine` on `insertOptionUnitSchema`, and
  // Zod refinements are dropped when the schema is converted to JSON Schema at
  // the MCP boundary — so the model would never see it. It has to be readable in
  // the serialized field description instead.
  it("states the room/vehicle occupancy requirement in JSON Schema", () => {
    const jsonSchema = z.toJSONSchema(createOptionUnitInputSchema, { io: "input" }) as {
      properties: Record<string, { description?: string }>
    }

    expect(jsonSchema.properties.occupancyMin?.description).toMatch(/room/)
    expect(jsonSchema.properties.occupancyMin?.description).toMatch(/vehicle/)
    expect(jsonSchema.properties.occupancyMin?.description).toMatch(/required/i)
  })

  it("still enforces the occupancy rule at parse time", () => {
    const room = createOptionUnitInputSchema.safeParse({
      optionId: "opt_1",
      name: "Double room",
      unitType: "room",
    })
    expect(room.success).toBe(false)
    expect(room.error?.issues[0]?.message).toMatch(/occupancyMin/)

    expect(
      createOptionUnitInputSchema.safeParse({
        optionId: "opt_1",
        name: "Double room",
        unitType: "room",
        occupancyMin: 2,
      }).success,
    ).toBe(true)
  })
})

/**
 * `executeAdmittedCreatedTargetCommand` rejects with `admitted_policy_mismatch`
 * when the executor's `evaluatedRisk` disagrees with the admitted policy's
 * `risk` — before creating anything. The shared inventory executor used to
 * hard-code "high", so these Tools declaring "medium" failed every real call
 * while the stubbed-service tests above still passed.
 *
 * The manifest is the contract both sides read, so pin the pairing here.
 */
describe("created-target risk agrees with the declared action", () => {
  it.each([
    ["create_product_option", CREATE_PRODUCT_OPTION_HANDLER_POLICY],
    ["create_option_unit", CREATE_OPTION_UNIT_HANDLER_POLICY],
  ])("%s declares a risk the executor can honour", (name, policy) => {
    const manifest = makeRegistry()
      .list()
      .find((entry) => entry.name === name)

    expect(manifest?.actionPolicy?.risk).toBe(policy.actionPolicy.risk)
    expect(manifest?.actionPolicy?.approval).toBe("never")
    expect(manifest?.actionPolicy?.ledger).toBe("required")
  })
})
