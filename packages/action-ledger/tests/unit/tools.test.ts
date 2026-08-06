import type { VoyantGraphActionDeclaration } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { TOOL_GRAPH_ACTIONS_RESOURCE } from "@voyant-travel/tools"
import { afterEach, describe, expect, it, vi } from "vitest"

import { buildCreatedTargetCommandFingerprint } from "../../src/created-command.js"
import {
  createActionLedgerToolServices,
  voyantToolContextContribution,
} from "../../src/mcp-runtime.js"
import { actionLedgerService } from "../../src/service.js"
import {
  type ActionLedgerToolContext,
  type ActionLedgerToolServices,
  actionLedgerTools,
  approveActionApprovalTool,
  getActionLedgerEntryTool,
  listActionLedgerEntriesTool,
  requestActionApprovalTool,
} from "../../src/tools.js"
import {
  makeApproval,
  makeDelegation,
  makeEntry,
  makeMutationDetail,
  makePayload,
  makeSensitiveReadDetail,
} from "./service-fixtures.js"

const db = {} as AnyDrizzleDb
const selectedAction: VoyantGraphActionDeclaration = {
  id: "@voyant-travel/bookings#action.cancel",
  capabilityId: "bookings:status:cancel",
  version: "v1",
  kind: "execute",
  targetType: "booking",
  resource: "bookings",
  action: "cancel",
  requiredScopes: ["bookings:write"],
  risk: "high",
  ledger: "required",
  approval: "required",
  policy: "booking-cancel-policy",
  reversible: false,
  allowedActorTypes: ["staff"],
  from: { tools: ["@voyant-travel/bookings#tool.cancel"] },
}

afterEach(() => vi.restoreAllMocks())

describe("action-ledger Tool definitions", () => {
  it("publishes separate audit, approval, delegation, request, and decision capabilities", () => {
    expect(actionLedgerTools.map(({ name }) => name)).toEqual([
      "list_action_ledger_entries",
      "get_action_ledger_entry",
      "get_action_target_timeline",
      "list_action_approvals",
      "get_action_approval",
      "list_action_delegations",
      "get_action_delegation",
      "request_action_approval",
      "approve_action_approval",
      "deny_action_approval",
    ])
    expect(actionLedgerTools.slice(0, 7).every(({ tier }) => tier === "sensitive")).toBe(true)
    expect(
      actionLedgerTools
        .slice(0, 7)
        .every(({ requiredScopes }) => requiredScopes[0] === "action-ledger:read"),
    ).toBe(true)
    expect(requestActionApprovalTool.requiredScopes).toEqual(["action-ledger:approve"])
    expect(approveActionApprovalTool.riskPolicy).toMatchObject({
      destructive: true,
      reversible: false,
      confirmationRequired: true,
    })
  })

  it("fails closed outside a staff-to-staff grant", async () => {
    const ctx = toolContext(noopServices(), { audience: "customer" })
    await expect(listActionLedgerEntriesTool.handler({}, ctx)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    })
  })

  it("returns typed not-found errors for exact record reads", async () => {
    const services = noopServices()
    services.getEntry = vi.fn().mockResolvedValue(null)
    await expect(
      getActionLedgerEntryTool.handler({ id: "missing" }, toolContext(services)),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  })

  it("tells an approver to resume the original Tool after a successful decision", async () => {
    const services = noopServices()
    services.decideApproval = vi.fn().mockResolvedValue({
      approval: makeApproval({ id: "approval_1", status: "approved" }),
      decisionAction: makeEntry({ actionKind: "approve", status: "approved" }),
    })

    const result = await approveActionApprovalTool.handler(
      { approvalId: "approval_1" },
      toolContext(services),
    )

    expect(result.nextSteps[0]).toContain("original action has NOT executed")
    expect(result.nextSteps[0]).toContain('"approvalId": "approval_1"')
  })
})

describe("action-ledger Tool services", () => {
  it("serializes dates and exposes references without dereferencing payloads", async () => {
    vi.spyOn(actionLedgerService, "getEntry").mockResolvedValue({
      entry: makeEntry(),
      mutationDetail: makeMutationDetail(),
      sensitiveReadDetail: makeSensitiveReadDetail(),
      payloads: [makePayload()],
    })
    const services = createServices()

    const result = await services.getEntry("alge_1")

    expect(result).toMatchObject({
      occurredAt: "2026-05-15T10:00:00.000Z",
      mutationDetail: { summary: "Booking status changed from on_hold to confirmed" },
      payloads: [{ storageRef: "blob://action-ledger/alge_1/input" }],
    })
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })

  it("builds an exact-target timeline with recorded mutation summaries", async () => {
    vi.spyOn(actionLedgerService, "listEntries").mockResolvedValue({
      entries: [makeEntry()],
      nextCursor: null,
    })
    vi.spyOn(actionLedgerService, "getEntry").mockResolvedValue({
      entry: makeEntry(),
      mutationDetail: makeMutationDetail({ summary: "status changed" }),
      sensitiveReadDetail: null,
      payloads: [],
    })

    const result = await createServices().getTargetTimeline({
      targetType: "booking",
      targetId: "book_1",
    })

    expect(actionLedgerService.listEntries).toHaveBeenCalledWith(db, {
      targetType: "booking",
      targetId: "book_1",
      cursor: undefined,
      sortDir: "desc",
      limit: 50,
    })
    expect(result.data[0]?.mutationSummary).toBe("status changed")
  })

  it("derives approval request identity, risk, policy, and fingerprint from a selected action", async () => {
    vi.spyOn(actionLedgerService, "requestApproval").mockResolvedValue({
      requestedAction: makeEntry({
        actionName: "bookings:status:cancel",
        actionKind: "execute",
        status: "awaiting_approval",
        capabilityId: "bookings:status:cancel",
        capabilityVersion: "v1",
      }),
      approval: makeApproval({
        assignedToPrincipalId: null,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      }),
      replayed: false,
    })

    await createServices().requestApproval({
      actionId: selectedAction.id,
      actionVersion: "v1",
      targetId: "book_1",
      commandInput: { reason: "duplicate" },
      idempotencyKey: "cancel-book-1",
    })

    expect(actionLedgerService.requestApproval).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        requestedAction: expect.objectContaining({
          actionName: "bookings:status:cancel",
          actionKind: "execute",
          targetType: "booking",
          targetId: "book_1",
          routeOrToolName: "@voyant-travel/bookings#tool.cancel",
          evaluatedRisk: "high",
          principalId: "usr_staff",
          capabilityId: "bookings:status:cancel",
          authorizationSource: "selected_graph",
          idempotencyFingerprint: expect.stringMatching(/^sha256:/),
        }),
        approval: expect.objectContaining({
          requestedByPrincipalId: "usr_staff",
          policyName: "booking-cancel-policy",
          policyVersion: "v1",
          riskSnapshot: "high",
        }),
      }),
    )
  })

  it("requires and binds the exact Tool capability for a multi-Tool action", async () => {
    const secondTool = "@voyant-travel/bookings#tool.cancel-alternate"
    const multiToolAction: VoyantGraphActionDeclaration = {
      ...selectedAction,
      from: { tools: [...(selectedAction.from?.tools ?? []), secondTool] },
    }
    vi.spyOn(actionLedgerService, "requestApproval").mockResolvedValue({
      requestedAction: makeEntry({
        actionName: "bookings:status:cancel",
        actionKind: "execute",
        status: "awaiting_approval",
        capabilityId: "bookings:status:cancel",
        capabilityVersion: "v1",
      }),
      approval: makeApproval(),
      replayed: false,
    })
    const services = createServices([multiToolAction])
    const request = {
      actionId: multiToolAction.id,
      actionVersion: "v1",
      targetId: "book_1",
      idempotencyKey: "cancel-book-1",
    }

    await expect(services.requestApproval(request)).rejects.toMatchObject({
      code: "ACTION_POLICY_REQUIRED",
    })
    await services.requestApproval({ ...request, toolCapabilityId: secondTool })
    expect(actionLedgerService.requestApproval).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        requestedAction: expect.objectContaining({ routeOrToolName: secondTool }),
      }),
    )
    await expect(
      services.requestApproval({ ...request, toolCapabilityId: "unselected:tool" }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
  })

  it("requests created-target approval with the exact typed command fingerprint", async () => {
    const createdAction: VoyantGraphActionDeclaration = {
      ...selectedAction,
      targetType: "booking",
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "booking-create-command",
        resultReferenceType: "booking-ref",
        durability: "handler-command-claim-v1",
      },
    }
    vi.spyOn(actionLedgerService, "requestApproval").mockResolvedValue({
      requestedAction: makeEntry({
        actionName: "bookings:status:cancel",
        actionKind: "execute",
        status: "awaiting_approval",
        targetType: "booking-create-command",
        targetId: "client-command-17",
        capabilityId: "bookings:status:cancel",
        capabilityVersion: "v1",
      }),
      approval: makeApproval(),
      replayed: false,
    })

    await createServices([createdAction]).requestApproval({
      actionId: createdAction.id,
      actionVersion: "v1",
      targetId: "client-command-17",
      commandInput: { bookingNumber: "B-17" },
      idempotencyKey: "create-book-17",
    })

    const expectedFingerprint = await buildCreatedTargetCommandFingerprint({
      actionName: "bookings:status:cancel",
      actionVersion: "v1",
      commandTarget: { type: "booking-create-command", id: "client-command-17" },
      canonicalTargetType: "booking",
      resultReferenceType: "booking-ref",
      commandInput: { bookingNumber: "B-17" },
      capabilityId: "bookings:status:cancel",
      capabilityVersion: "v1",
      evaluatedRisk: "high",
      approvalPolicy: "required",
      approvalReasonCode: null,
    })
    expect(actionLedgerService.requestApproval).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        requestedAction: expect.objectContaining({
          targetType: "booking-create-command",
          targetId: "client-command-17",
          idempotencyKey: "create-book-17",
          idempotencyFingerprint: expectedFingerprint,
        }),
        approval: expect.objectContaining({
          policyName: "booking-cancel-policy",
          policyVersion: "v1",
          riskSnapshot: "high",
        }),
      }),
    )
  })

  it("fails closed for absent and conditional approval request policies", async () => {
    await expect(
      createServices([]).requestApproval({
        actionId: selectedAction.id,
        actionVersion: "v1",
        targetId: "book_1",
        idempotencyKey: "key",
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })

    await expect(
      createServices([{ ...selectedAction, approval: "conditional" }]).requestApproval({
        actionId: selectedAction.id,
        actionVersion: "v1",
        targetId: "book_1",
        idempotencyKey: "key",
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
  })

  it("approves only an unexpired selected request assigned to the current principal", async () => {
    const requestedAction = makeEntry({
      capabilityId: "bookings:status:cancel",
      capabilityVersion: "v1",
      approvalId: "appr_1",
    })
    vi.spyOn(actionLedgerService, "getApproval").mockResolvedValue({
      approval: makeApproval({
        assignedToPrincipalId: "usr_staff",
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      }),
      requestedAction: {
        entry: requestedAction,
        mutationDetail: null,
        sensitiveReadDetail: null,
        payloads: [],
      },
    })
    vi.spyOn(actionLedgerService, "decideApproval").mockResolvedValue({
      approval: makeApproval({ status: "approved", decidedByPrincipalId: "usr_staff" }),
      decisionAction: makeEntry({ actionKind: "approve", status: "approved" }),
    })

    const result = await createServices().decideApproval({
      approvalId: "appr_1",
      status: "approved",
    })

    expect(result.approval.status).toBe("approved")
    expect(actionLedgerService.decideApproval).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        id: "appr_1",
        status: "approved",
        decidedByPrincipalId: "usr_staff",
        decisionAction: expect.objectContaining({
          routeOrToolName: "approve_action_approval",
          authorizationSource: "selected_graph_policy",
        }),
      }),
    )
  })

  it("rejects expired, misassigned, and no-longer-selected approvals", async () => {
    const requestedAction = {
      entry: makeEntry({
        capabilityId: "bookings:status:cancel",
        capabilityVersion: "v1",
      }),
      mutationDetail: null,
      sensitiveReadDetail: null,
      payloads: [],
    }
    const getApproval = vi.spyOn(actionLedgerService, "getApproval")

    getApproval.mockResolvedValueOnce({
      approval: makeApproval({ assignedToPrincipalId: "usr_staff", expiresAt: new Date(0) }),
      requestedAction,
    })
    await expect(
      createServices().decideApproval({ approvalId: "appr_1", status: "approved" }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })

    getApproval.mockResolvedValueOnce({
      approval: makeApproval({ assignedToPrincipalId: "usr_other", expiresAt: null }),
      requestedAction,
    })
    await expect(
      createServices().decideApproval({ approvalId: "appr_1", status: "denied" }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })

    getApproval.mockResolvedValueOnce({
      approval: makeApproval({ assignedToPrincipalId: "usr_staff", expiresAt: null }),
      requestedAction,
    })
    await expect(
      createServices([]).decideApproval({ approvalId: "appr_1", status: "denied" }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
  })

  it("keeps mutation-only methods outside the Tool service", () => {
    const services = createServices()
    expect("recordReversal" in services).toBe(false)
  })

  it("receives selected action policy authority from the generic MCP resource bag", async () => {
    vi.spyOn(actionLedgerService, "listEntries").mockResolvedValue({
      entries: [makeEntry()],
      nextCursor: null,
    })
    const request = {
      get(key: string) {
        if (key === "db") return db
        if (key === "userId") return "usr_staff"
        if (key === "actor") return "staff"
        if (key === "callerType") return "session"
        return undefined
      },
    }
    const context = toolContext(noopServices())

    const contribution = await voyantToolContextContribution.contribute({
      request,
      context,
      resources: { [TOOL_GRAPH_ACTIONS_RESOURCE]: [selectedAction] },
    })
    const service = contribution.actionLedger as ActionLedgerToolServices
    expect(contribution.toolActionPolicy).toEqual(
      expect.objectContaining({ execute: expect.any(Function) }),
    )
    await expect(service.listEntries({})).resolves.toMatchObject({
      data: [{ id: "alge_1", occurredAt: "2026-05-15T10:00:00.000Z" }],
    })

    await expect(
      voyantToolContextContribution.contribute({ request, context, resources: {} }),
    ).rejects.toMatchObject({ code: "MISSING_SERVICE" })
  })
})

function createServices(
  selectedActions: readonly VoyantGraphActionDeclaration[] = [selectedAction],
) {
  return createActionLedgerToolServices({
    db,
    selectedActions,
    requestContext: {
      actor: "staff",
      userId: "usr_staff",
      sessionId: "sess_staff",
      callerType: "session",
      organizationId: "org_1",
    },
  })
}

function noopServices(): ActionLedgerToolServices {
  return {
    listEntries: vi.fn(),
    getEntry: vi.fn(),
    getTargetTimeline: vi.fn(),
    listApprovals: vi.fn(),
    getApproval: vi.fn(),
    listDelegations: vi.fn().mockResolvedValue({ data: [makeDelegation()], nextCursor: null }),
    getDelegation: vi.fn(),
    requestApproval: vi.fn(),
    decideApproval: vi.fn(),
  }
}

function toolContext(
  actionLedger: ActionLedgerToolServices,
  overrides: Partial<ActionLedgerToolContext> = {},
): ActionLedgerToolContext {
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "tenant_1",
    resolverScope: { locale: "en", market: "default", actor: "staff", audience: "staff" },
    actionLedger,
    ...overrides,
  }
}
