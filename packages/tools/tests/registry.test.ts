import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  createToolRegistry,
  defineTool,
  isToolDeploymentRiskCompatible,
  READ_ONLY_RISK,
  type ToolContext,
  ToolError,
} from "../src/index.js"

const ctx: ToolContext = {
  db: {},
  actor: "staff",
  audience: "staff",
  tenantId: "t1",
  resolverScope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" },
}

const echoTool = defineTool({
  capabilityId: "@voyant-travel/test#tool.echo",
  owner: "@voyant-travel/test",
  capabilityVersion: "v2",
  name: "echo",
  description: "Echo the input text back.",
  aliases: ["echo_text"],
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.object({ text: z.string() }),
  requiredScopes: ["catalog:read"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  annotations: { idempotentHint: true },
  async handler({ text }) {
    return { text: `echo: ${text}` }
  },
})

describe("Tool deployment risk compatibility", () => {
  it("shares the complete graph-risk to Tool-tier matrix", () => {
    expect(
      ["low", "medium", "high", "critical"].flatMap((risk) =>
        ["read", "write", "sensitive", "destructive"].map((tier) => [
          risk,
          tier,
          isToolDeploymentRiskCompatible(
            risk as "low" | "medium" | "high" | "critical",
            tier as "read" | "write" | "sensitive" | "destructive",
          ),
        ]),
      ),
    ).toEqual([
      ["low", "read", true],
      ["low", "write", false],
      ["low", "sensitive", false],
      ["low", "destructive", false],
      ["medium", "read", false],
      ["medium", "write", true],
      ["medium", "sensitive", false],
      ["medium", "destructive", false],
      ["high", "read", false],
      ["high", "write", true],
      ["high", "sensitive", true],
      ["high", "destructive", true],
      ["critical", "read", false],
      ["critical", "write", true],
      ["critical", "sensitive", true],
      ["critical", "destructive", true],
    ])
  })
})

describe("createToolRegistry", () => {
  it("registers and dispatches a tool, validating input and output", async () => {
    const registry = createToolRegistry()
    registry.register(echoTool)

    const result = await registry.dispatch<{ text: string }>("echo", { text: "hi" }, ctx)
    expect(result).toEqual({ text: "echo: hi" })
    expect(registry.names()).toEqual(["echo"])
    await expect(registry.dispatch("echo_text", { text: "hi" }, ctx)).resolves.toEqual({
      text: "echo: hi",
    })
    expect(registry.getByCapabilityId("@voyant-travel/test#tool.echo", "v2")).toBe(echoTool)
    expect(registry.getByCapabilityId("@voyant-travel/test#tool.echo", "v3")).toBeUndefined()
  })

  it("strips handler action policy from generic tools without retaining it in later calls", async () => {
    const registry = createToolRegistry()
    const seen: Array<ToolContext["handlerActionPolicy"]> = []
    registry.register(
      defineTool({
        name: "handler_context",
        description: "Reads handler-owned action context",
        inputSchema: z.object({}),
        outputSchema: z.object({ approvalId: z.string().nullable() }),
        requiredScopes: ["catalog:read"],
        tier: "read",
        riskPolicy: READ_ONLY_RISK,
        async handler(_input, context) {
          seen.push(context.handlerActionPolicy)
          return { approvalId: context.handlerActionPolicy?.invocation.approvalId ?? null }
        },
      }),
    )
    const handlerActionPolicy = {
      capabilityId: "test:handler-context",
      capabilityVersion: "v1",
      canonicalName: "handler_context",
      actionPolicy: {
        id: "test:handler-context",
        capabilityId: "test:handler-context",
        version: "v1",
        kind: "execute" as const,
        targetType: "test",
        risk: "high" as const,
        ledger: "required" as const,
        approval: "required" as const,
        enforcement: "handler" as const,
        invocation: {
          controlField: "_voyant" as const,
          requiredFields: [],
          optionalFields: ["approvalId"] as const,
          fingerprintAlgorithm: "action-ledger-command-v1" as const,
        },
      },
      invocation: { approvalId: "appr_1" },
    }

    await expect(
      registry.dispatch("handler_context", {}, { ...ctx, handlerActionPolicy }),
    ).resolves.toEqual({ approvalId: null })
    await expect(registry.dispatch("handler_context", {}, ctx)).resolves.toEqual({
      approvalId: null,
    })
    expect(seen).toEqual([undefined, undefined])
    expect(ctx.handlerActionPolicy).toBeUndefined()
  })

  it("throws NOT_FOUND for an unregistered tool", async () => {
    const registry = createToolRegistry()
    await expect(registry.dispatch("missing", {}, ctx)).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  })

  it("suggests the intended tool when the name is a near miss", async () => {
    // voyant#3950: this error used to inline every registered name into its
    // message — a directory listing charged to the agent's context at the moment
    // it is already lost. Structured candidates instead, so the transport can
    // present them and the one likely name is not buried.
    const registry = createToolRegistry()
    registry.register(echoTool)

    await expect(registry.dispatch("ecoh", {}, ctx)).rejects.toMatchObject({
      code: "NOT_FOUND",
      candidates: ["echo"],
      didYouMean: "echo",
    })
  })

  it("does not enumerate the registry when nothing is close", async () => {
    const registry = createToolRegistry()
    registry.register(echoTool)

    const error = await registry
      .dispatch("completely_unrelated_zzz", {}, ctx)
      .then(() => undefined)
      .catch((err: ToolError) => err)

    expect(error?.code).toBe("NOT_FOUND")
    expect(error?.candidates).toBeUndefined()
    expect(error?.message).not.toContain("echo")
  })

  it("throws INVALID_INPUT when args fail the input schema", async () => {
    const registry = createToolRegistry()
    registry.register(echoTool)
    await expect(registry.dispatch("echo", { text: 42 }, ctx)).rejects.toBeInstanceOf(ToolError)
    await expect(registry.dispatch("echo", { text: 42 }, ctx)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    })
  })

  it("throws INVALID_OUTPUT when a handler returns data failing the output schema", async () => {
    const registry = createToolRegistry()
    registry.register(
      defineTool({
        name: "bad",
        description: "Returns the wrong shape.",
        inputSchema: z.object({}),
        outputSchema: z.object({ n: z.number() }),
        requiredScopes: ["catalog:read"],
        tier: "read",
        riskPolicy: READ_ONLY_RISK,
        // @ts-expect-error -- intentionally wrong return shape to exercise output validation
        async handler() {
          return { n: "not-a-number" }
        },
      }),
    )
    await expect(registry.dispatch("bad", {}, ctx)).rejects.toMatchObject({
      code: "INVALID_OUTPUT",
    })
  })

  it("preserves the provider cause when normalizing handler failures", async () => {
    const cause = Object.assign(new Error("conflicting provider command"), {
      name: "ProviderIdempotencyConflictError",
      existingActionId: "act_1",
    })
    const registry = createToolRegistry()
    registry.register(
      defineTool({
        name: "provider_failure",
        description: "Throws a provider-owned error.",
        inputSchema: z.object({}),
        outputSchema: z.object({}),
        requiredScopes: ["catalog:read"],
        tier: "read",
        riskPolicy: READ_ONLY_RISK,
        async handler() {
          throw cause
        },
      }),
    )

    await expect(registry.dispatch("provider_failure", {}, ctx)).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      cause,
    })
  })

  it("throws on duplicate registration", () => {
    const registry = createToolRegistry()
    registry.register(echoTool)
    expect(() => registry.register(echoTool)).toThrow(/already registered/)
  })

  it("emits stable identity, compatibility, schemas, audience, annotations, and risk", () => {
    const registry = createToolRegistry()
    registry.register(echoTool)
    const [entry] = registry.list()
    expect(entry?.name).toBe("echo")
    expect(entry).toMatchObject({
      capabilityId: "@voyant-travel/test#tool.echo",
      owner: "@voyant-travel/test",
      capabilityVersion: "v2",
      aliases: ["echo_text"],
      audience: { source: "grant", allowed: ["staff"] },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    })
    expect(entry?.requiredScopes).toEqual(["catalog:read"])
    expect(entry?.tier).toBe("read")
    expect(entry?.riskPolicy).toEqual(READ_ONLY_RISK)
    // zod v4 native JSON Schema serialization.
    expect(entry?.inputSchema).toMatchObject({
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    })
    expect(entry?.outputSchema).toMatchObject({
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    })
  })

  it("uses a graph binding as canonical identity and rejects duplicated metadata drift", () => {
    const legacy = defineTool({
      name: "legacy",
      description: "Legacy definition with graph-owned identity.",
      inputSchema: z.object({}),
      outputSchema: z.custom<unknown>(),
      requiredScopes: ["catalog:read"],
      tier: "read",
      riskPolicy: READ_ONLY_RISK,
      async handler() {
        return {}
      },
    })
    const registry = createToolRegistry()
    registry.register(legacy, {
      capabilityId: "@voyant-travel/catalog#tool.legacy",
      owner: "@voyant-travel/catalog",
      capabilityVersion: "v1",
    })
    expect(registry.list()[0]).toMatchObject({
      capabilityId: "@voyant-travel/catalog#tool.legacy",
      owner: "@voyant-travel/catalog",
      capabilityVersion: "v1",
      deploymentRisk: "low",
      outputSchema: { "x-voyant-schema-quality": "runtime-only" },
    })

    const drifted = { ...echoTool, capabilityVersion: "v3" }
    expect(() => createToolRegistry().register(drifted, { capabilityVersion: "v2" })).toThrow(
      /does not match graph binding/,
    )
    expect(() =>
      createToolRegistry().register(legacy, { requiredScopes: ["catalog:write"] }),
    ).toThrow(/requiredScopes.*do not match graph binding/)
    expect(() => createToolRegistry().register(legacy, { deploymentRisk: "critical" })).toThrow(
      /tier "read" is incompatible with graph risk "critical"/,
    )
  })

  it("requires handler-owned durable command metadata for actions that create their target", () => {
    const createTool = defineTool({
      name: "create_record",
      description: "Create a record with a handler-owned durable command claim.",
      inputSchema: z.object({ name: z.string() }),
      outputSchema: z.object({ id: z.string() }),
      requiredScopes: ["records:write"],
      tier: "write",
      riskPolicy: {
        destructive: false,
        reversible: true,
        dryRunSupported: false,
        sideEffects: ["data-write"],
      },
      async handler() {
        return { id: "record-1" }
      },
    })
    const createdAction = {
      id: "action.create-record",
      capabilityId: "@voyant-travel/test#action.create-record",
      version: "v1",
      kind: "execute" as const,
      targetType: "record",
      targetLifecycle: "created" as const,
      risk: "medium" as const,
      ledger: "required" as const,
      approval: "never" as const,
    }

    expect(() =>
      createToolRegistry().register(
        { ...createTool, actionPolicyEnforcement: "handler" },
        { actionPolicy: createdAction },
      ),
    ).toThrow(/missing createdTarget command metadata/)

    expect(() =>
      createToolRegistry().register(createTool, {
        actionPolicy: {
          ...createdAction,
          createdTarget: {
            commandTargetType: "create-record-command",
            resultReferenceType: "record",
            durability: "handler-command-claim-v1",
          },
        },
      }),
    ).toThrow(/requires actionPolicyEnforcement "handler"/)

    expect(() =>
      createToolRegistry().register(
        { ...createTool, actionPolicyEnforcement: "handler" },
        {
          actionPolicy: {
            ...createdAction,
            targetLifecycle: "existing",
            createdTarget: {
              commandTargetType: "create-record-command",
              resultReferenceType: "record",
              durability: "handler-command-claim-v1",
            },
          },
        },
      ),
    ).toThrow(/declares createdTarget without targetLifecycle "created"/)
  })

  it("emits created-target policy metadata without requiring a caller targetId", () => {
    const registry = createToolRegistry()
    registry.register(
      defineTool({
        name: "create_record",
        description: "Create a record with a handler-owned durable command claim.",
        inputSchema: z.object({ name: z.string() }),
        outputSchema: z.object({ id: z.string() }),
        requiredScopes: ["records:write"],
        tier: "write",
        riskPolicy: {
          destructive: false,
          reversible: true,
          dryRunSupported: false,
          sideEffects: ["data-write"],
        },
        actionPolicyEnforcement: "handler",
        async handler() {
          return { id: "record-1" }
        },
      }),
      {
        actionPolicy: {
          id: "action.create-record",
          capabilityId: "@voyant-travel/test#action.create-record",
          version: "v1",
          kind: "execute",
          targetType: "record",
          targetLifecycle: "created",
          createdTarget: {
            commandTargetType: "create-record-command",
            resultReferenceType: "record",
            durability: "handler-command-claim-v1",
          },
          risk: "medium",
          ledger: "required",
          approval: "required",
        },
      },
    )

    expect(registry.list()[0]?.actionPolicy).toMatchObject({
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "create-record-command",
        resultReferenceType: "record",
        durability: "handler-command-claim-v1",
      },
      enforcement: "handler",
      invocation: {
        requiredFields: ["idempotencyKey", "approvalId", "idempotencyFingerprint"],
      },
    })
    expect(registry.list()[0]?.actionPolicy?.invocation.requiredFields).not.toContain("targetId")
  })

  it("requires explicit handler-owned result metadata for durable existing-target dispatch", () => {
    const definition = defineTool({
      name: "price_record",
      description: "Price an existing record through a durable handler-owned command.",
      inputSchema: z.object({ recordId: z.string() }),
      outputSchema: z.object({ id: z.string() }),
      requiredScopes: ["records:write"],
      tier: "write",
      riskPolicy: {
        destructive: false,
        reversible: true,
        dryRunSupported: false,
        sideEffects: ["data-write"],
      },
      actionPolicyEnforcement: "handler",
      async handler({ recordId }) {
        return { id: recordId }
      },
    })
    const action = {
      id: "action.price-record",
      capabilityId: "@voyant-travel/test#action.price-record",
      version: "v1",
      kind: "execute" as const,
      targetType: "record",
      commandTargetField: "recordId",
      targetLifecycle: "existing" as const,
      existingTarget: { durability: "handler-command-result-v1" as const },
      risk: "medium" as const,
      ledger: "required" as const,
      approval: "never" as const,
    }
    const registry = createToolRegistry()
    registry.register(definition, { actionPolicy: action })

    expect(registry.list()[0]?.actionPolicy).toMatchObject({
      targetLifecycle: "existing",
      commandTargetField: "recordId",
      existingTarget: { durability: "handler-command-result-v1" },
      enforcement: "handler",
      invocation: { requiredFields: ["idempotencyKey"] },
    })
    expect(registry.list()[0]?.actionPolicy?.invocation.requiredFields).not.toContain("targetId")

    expect(() =>
      createToolRegistry().register(
        { ...definition, actionPolicyEnforcement: "generic" },
        { actionPolicy: action },
      ),
    ).toThrow(/requires actionPolicyEnforcement "handler"/)
    expect(() =>
      createToolRegistry().register(definition, {
        actionPolicy: { ...action, commandTargetField: undefined },
      }),
    ).toThrow(/has no commandTargetField/)
    expect(() =>
      createToolRegistry().register(definition, {
        actionPolicy: { ...action, approval: "conditional" },
      }),
    ).toThrow(/conditional approval is unsupported/)
  })

  it("advertises package target resolution without exposing client-owned target metadata", async () => {
    const registry = createToolRegistry()
    const targetTool = defineTool({
      ...echoTool,
      resolveActionTarget({ text }) {
        return `record:${text}`
      },
    })
    registry.register(targetTool, {
      actionPolicy: {
        id: "action.read-record",
        capabilityId: "@voyant-travel/test#action.read-record",
        version: "v1",
        kind: "read",
        targetType: "record",
        risk: "low",
        ledger: "required",
        approval: "never",
      },
    })

    expect(registry.list()[0]?.actionPolicy).toMatchObject({
      enforcement: "generic",
      invocation: {
        requiredFields: [],
        targetResolution: "package-resolver",
      },
    })
    expect(registry.list()[0]?.actionPolicy?.invocation.requiredFields).not.toContain("targetId")
    const prepared = await registry.prepareAction("echo", { text: "one" }, ctx)
    expect(prepared).toMatchObject({
      commandInput: { text: "one" },
      resolvedTargetId: "record:one",
    })
    await expect(registry.dispatchPrepared(prepared, ctx)).resolves.toEqual({
      text: "echo: one",
    })
    await expect(registry.dispatchPrepared(prepared, ctx)).rejects.toMatchObject({
      code: "ACTION_POLICY_REQUIRED",
    })
  })

  it("resolves a package-declared command target field from once-parsed input", async () => {
    const registry = createToolRegistry()
    registry.register(echoTool, {
      actionPolicy: {
        id: "action.update-record",
        capabilityId: "@voyant-travel/test#action.update-record",
        version: "v1",
        kind: "execute",
        targetType: "record",
        commandTargetField: "text",
        risk: "medium",
        ledger: "required",
        approval: "never",
      },
    })

    expect(registry.list()[0]?.actionPolicy?.invocation.targetResolution).toBe(
      "command-target-field",
    )
    await expect(
      registry.prepareAction("echo", { text: " record-1 " }, ctx),
    ).resolves.toMatchObject({
      commandInput: { text: " record-1 " },
      resolvedTargetId: "record-1",
    })
  })

  it("uses an authenticated organization collection anchor for ledgered reads", async () => {
    const registry = createToolRegistry()
    registry.register(echoTool, {
      actionPolicy: {
        id: "action.inspect-records",
        capabilityId: "@voyant-travel/test#action.inspect-records",
        version: "v1",
        kind: "sensitive-read",
        targetType: "record",
        risk: "high",
        ledger: "required",
        approval: "never",
      },
    })

    expect(registry.list()[0]?.actionPolicy?.invocation.targetResolution).toBe(
      "authenticated-organization-collection",
    )
    await expect(
      registry.prepareAction("echo", { text: "ignored" }, { ...ctx, organizationId: "org-1" }),
    ).resolves.toMatchObject({
      resolvedTargetId: "record:org-1",
    })
    await expect(
      registry.prepareAction("echo", { text: "ignored" }, { ...ctx, tenantId: " " }),
    ).rejects.toMatchObject({ code: "ACTION_POLICY_REQUIRED" })
  })

  it("retains the compatibility invocation for an unmigrated generic execute", () => {
    const registry = createToolRegistry()
    registry.register(echoTool, {
      actionPolicy: {
        id: "action.update-record",
        capabilityId: "@voyant-travel/test#action.update-record",
        version: "v1",
        kind: "execute",
        targetType: "record",
        risk: "medium",
        ledger: "required",
        approval: "never",
      },
    })

    expect(registry.list()[0]?.actionPolicy?.invocation).toMatchObject({
      requiredFields: ["targetId", "idempotencyKey"],
    })
    expect(registry.list()[0]?.actionPolicy?.invocation.targetResolution).toBeUndefined()
  })

  it("validates input before calling a package action target resolver", async () => {
    const registry = createToolRegistry()
    let resolverCalls = 0
    registry.register(
      defineTool({
        ...echoTool,
        resolveActionTarget({ text }) {
          resolverCalls += 1
          return text
        },
      }),
    )

    await expect(registry.prepareAction("echo", { text: 42 }, ctx)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    })
    expect(resolverCalls).toBe(0)
  })

  it("uses the same once-parsed domain input for target resolution and dispatch", async () => {
    const registry = createToolRegistry()
    let parses = 0
    const seen: string[] = []
    registry.register(
      defineTool({
        name: "prepared_transform",
        description: "Transform once before action policy",
        inputSchema: z.object({ id: z.string() }).transform(({ id }) => {
          parses += 1
          return { id: id.toUpperCase() }
        }),
        outputSchema: z.object({ id: z.string() }),
        requiredScopes: ["catalog:write"],
        tier: "write",
        riskPolicy: {
          destructive: false,
          reversible: true,
          dryRunSupported: false,
          sideEffects: ["data-write"],
        },
        resolveActionTarget({ id }) {
          seen.push(`target:${id}`)
          return id
        },
        async handler({ id }) {
          seen.push(`handler:${id}`)
          return { id }
        },
      }),
    )

    const prepared = await registry.prepareAction("prepared_transform", { id: "one" }, ctx)
    await expect(registry.dispatchPrepared(prepared, ctx)).resolves.toEqual({ id: "ONE" })
    expect(parses).toBe(1)
    expect(seen).toEqual(["target:ONE", "handler:ONE"])
  })

  it("rejects canonical and alias collisions", () => {
    const registry = createToolRegistry()
    registry.register(echoTool)
    expect(() =>
      registry.register({ ...echoTool, capabilityId: "second", name: "echo_text", aliases: [] }),
    ).toThrow(/invocation name/)
    expect(() =>
      createToolRegistry().register({ ...echoTool, aliases: ["invalid alias"] }),
    ).toThrow(/must use 1-128/)
  })

  it("surfaces a ToolError thrown by a handler unchanged", async () => {
    const registry = createToolRegistry()
    registry.register(
      defineTool({
        name: "denies",
        description: "Always denies.",
        inputSchema: z.object({}),
        outputSchema: z.object({}),
        requiredScopes: ["catalog:read"],
        tier: "read",
        riskPolicy: READ_ONLY_RISK,
        async handler() {
          throw new ToolError("nope", "AUTHORIZATION_DENIED")
        },
      }),
    )
    await expect(registry.dispatch("denies", {}, ctx)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    })
  })
})
