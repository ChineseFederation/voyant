import { defineExtension, defineModule, requirePort } from "@voyant-travel/core/project"
import {
  actionLedgerBookingDriftRuntimePort,
  actionLedgerFinanceDriftRuntimePort,
  actionLedgerInventoryDriftRuntimePort,
} from "./runtime-port.js"

/** Import-cheap deployment declaration owned by the action-ledger package. */
export const actionLedgerVoyantModule = defineModule({
  id: "@voyant-travel/action-ledger",
  packageName: "@voyant-travel/action-ledger",
  localId: "action-ledger",
  api: [
    {
      id: "@voyant-travel/action-ledger#api.admin",
      surface: "admin",
      mount: "action-ledger",
      openapi: { document: "action-ledger" },
      resource: "action-ledger",
      runtime: {
        entry: "@voyant-travel/action-ledger",
        export: "actionLedgerApiModule",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/action-ledger#schema",
      source: "@voyant-travel/action-ledger/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/action-ledger#migrations",
      source: "./migrations",
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/action-ledger#access.action-ledger",
        resource: "action-ledger",
        label: "Action ledger",
        description: "Read action audit records and manage selected approval state.",
        wildcard: "explicit-resource",
        actions: [
          {
            action: "read",
            label: "Read action ledger",
            description: "Read action records, approval state, and delegations.",
            sensitive: true,
            wildcard: "explicit",
          },
          {
            action: "write",
            label: "Manage action ledger",
            description: "Record reversals and request or decide approvals through the admin API.",
            sensitive: true,
            wildcard: "explicit",
          },
          {
            action: "approve",
            label: "Manage action approvals",
            description: "Request or decide privileged action approvals selected by the graph.",
            sensitive: true,
            wildcard: "explicit",
          },
        ],
      },
    ],
  },
  tools: [
    {
      id: "@voyant-travel/action-ledger#tool.list-entries",
      name: "list_action_ledger_entries",
      runtime: {
        entry: "@voyant-travel/action-ledger/tools",
        export: "listActionLedgerEntriesTool",
      },
      requiredScopes: ["action-ledger:read"],
      context: ["actionLedger"],
      risk: "high",
    },
    {
      id: "@voyant-travel/action-ledger#tool.get-entry",
      name: "get_action_ledger_entry",
      runtime: {
        entry: "@voyant-travel/action-ledger/tools",
        export: "getActionLedgerEntryTool",
      },
      requiredScopes: ["action-ledger:read"],
      context: ["actionLedger"],
      risk: "high",
    },
    {
      id: "@voyant-travel/action-ledger#tool.target-timeline",
      name: "get_action_target_timeline",
      runtime: {
        entry: "@voyant-travel/action-ledger/tools",
        export: "getActionTargetTimelineTool",
      },
      requiredScopes: ["action-ledger:read"],
      context: ["actionLedger"],
      risk: "high",
    },
    {
      id: "@voyant-travel/action-ledger#tool.list-approvals",
      name: "list_action_approvals",
      runtime: {
        entry: "@voyant-travel/action-ledger/tools",
        export: "listActionApprovalsTool",
      },
      requiredScopes: ["action-ledger:read"],
      context: ["actionLedger"],
      risk: "high",
    },
    {
      id: "@voyant-travel/action-ledger#tool.get-approval",
      name: "get_action_approval",
      runtime: {
        entry: "@voyant-travel/action-ledger/tools",
        export: "getActionApprovalTool",
      },
      requiredScopes: ["action-ledger:read"],
      context: ["actionLedger"],
      risk: "high",
    },
    {
      id: "@voyant-travel/action-ledger#tool.list-delegations",
      name: "list_action_delegations",
      runtime: {
        entry: "@voyant-travel/action-ledger/tools",
        export: "listActionDelegationsTool",
      },
      requiredScopes: ["action-ledger:read"],
      context: ["actionLedger"],
      risk: "high",
    },
    {
      id: "@voyant-travel/action-ledger#tool.get-delegation",
      name: "get_action_delegation",
      runtime: {
        entry: "@voyant-travel/action-ledger/tools",
        export: "getActionDelegationTool",
      },
      requiredScopes: ["action-ledger:read"],
      context: ["actionLedger"],
      risk: "high",
    },
    {
      id: "@voyant-travel/action-ledger#tool.request-approval",
      name: "request_action_approval",
      runtime: {
        entry: "@voyant-travel/action-ledger/tools",
        export: "requestActionApprovalTool",
      },
      requiredScopes: ["action-ledger:approve"],
      context: ["actionLedger"],
      risk: "high",
    },
    {
      id: "@voyant-travel/action-ledger#tool.approve-approval",
      name: "approve_action_approval",
      runtime: {
        entry: "@voyant-travel/action-ledger/tools",
        export: "approveActionApprovalTool",
      },
      requiredScopes: ["action-ledger:approve"],
      context: ["actionLedger"],
      risk: "critical",
    },
    {
      id: "@voyant-travel/action-ledger#tool.deny-approval",
      name: "deny_action_approval",
      runtime: {
        entry: "@voyant-travel/action-ledger/tools",
        export: "denyActionApprovalTool",
      },
      requiredScopes: ["action-ledger:approve"],
      context: ["actionLedger"],
      risk: "high",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/action-ledger#action.inspect-audit",
      version: "v1",
      kind: "sensitive-read",
      targetType: "action-ledger-entry",
      resource: "action-ledger",
      action: "read",
      requiredScopes: ["action-ledger:read"],
      risk: "high",
      ledger: "required",
      approval: "never",
      allowedActorTypes: ["staff"],
      from: {
        tools: [
          "@voyant-travel/action-ledger#tool.list-entries",
          "@voyant-travel/action-ledger#tool.get-entry",
          "@voyant-travel/action-ledger#tool.target-timeline",
        ],
      },
    },
    {
      id: "@voyant-travel/action-ledger#action.inspect-approvals",
      version: "v1",
      kind: "sensitive-read",
      targetType: "action-approval",
      resource: "action-ledger",
      action: "read",
      requiredScopes: ["action-ledger:read"],
      risk: "high",
      ledger: "required",
      approval: "never",
      allowedActorTypes: ["staff"],
      from: {
        tools: [
          "@voyant-travel/action-ledger#tool.list-approvals",
          "@voyant-travel/action-ledger#tool.get-approval",
        ],
      },
    },
    {
      id: "@voyant-travel/action-ledger#action.inspect-delegations",
      version: "v1",
      kind: "sensitive-read",
      targetType: "action-delegation",
      resource: "action-ledger",
      action: "read",
      requiredScopes: ["action-ledger:read"],
      risk: "high",
      ledger: "required",
      approval: "never",
      allowedActorTypes: ["staff"],
      from: {
        tools: [
          "@voyant-travel/action-ledger#tool.list-delegations",
          "@voyant-travel/action-ledger#tool.get-delegation",
        ],
      },
    },
    {
      id: "@voyant-travel/action-ledger#action.request-approval",
      version: "v1",
      kind: "execute",
      targetType: "action-approval",
      resource: "action-ledger",
      action: "approve",
      requiredScopes: ["action-ledger:approve"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: true,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "action-approval-request-command",
        resultReferenceType: "action-approval",
        durability: "handler-command-claim-v1",
      },
      from: { tools: ["@voyant-travel/action-ledger#tool.request-approval"] },
    },
    {
      id: "@voyant-travel/action-ledger#action.approve-approval",
      capabilityId: "@voyant-travel/action-ledger#action.decide-approval",
      version: "v1",
      kind: "execute",
      targetType: "action-approval",
      resource: "action-ledger",
      action: "approve",
      requiredScopes: ["action-ledger:approve"],
      risk: "critical",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/action-ledger#tool.approve-approval"] },
    },
    {
      id: "@voyant-travel/action-ledger#action.deny-approval",
      capabilityId: "@voyant-travel/action-ledger#action.deny-approval",
      version: "v1",
      kind: "execute",
      targetType: "action-approval",
      resource: "action-ledger",
      action: "approve",
      requiredScopes: ["action-ledger:approve"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/action-ledger#tool.deny-approval"] },
    },
  ],
  admin: {
    compositionOrder: 120,
    runtime: {
      entry: "@voyant-travel/action-ledger-react/admin",
      export: "createSelectedActionLedgerAdminExtension",
    },
    copy: [
      {
        id: "@voyant-travel/action-ledger#admin.copy.navigation",
        namespace: "operator.admin.navigation",
        fallbackLocale: "en",
        runtime: {
          entry: "@voyant-travel/i18n",
          export: "operatorAdminNavMessages",
        },
      },
    ],
    routes: [
      {
        id: "@voyant-travel/action-ledger#admin.route.index",
        path: "/action-ledger",
        requiredScopes: ["action-ledger:read"],
        runtime: {
          entry: "@voyant-travel/action-ledger-react/admin",
          export: "createSelectedActionLedgerAdminExtension",
        },
      },
    ],
    nav: [
      {
        id: "@voyant-travel/action-ledger#admin.nav.index",
        routeId: "@voyant-travel/action-ledger#admin.route.index",
        label: {
          namespace: "operator.admin.navigation",
          key: "nav.actionLedger",
        },
        order: 60,
      },
    ],
  },
  lifecycle: {
    uninstall: { default: "retain-data", purge: "not-supported" },
  },
  meta: {
    ownership: "package",
  },
})

export const actionLedgerHealthVoyantPlugin = defineExtension({
  id: "@voyant-travel/action-ledger#health-extension",
  packageName: "@voyant-travel/action-ledger",
  localId: "action-ledger.health-extension",
  runtimePorts: [
    requirePort(actionLedgerBookingDriftRuntimePort),
    requirePort(actionLedgerFinanceDriftRuntimePort),
    requirePort(actionLedgerInventoryDriftRuntimePort),
  ],
  requires: {
    ports: [
      requirePort(actionLedgerBookingDriftRuntimePort),
      requirePort(actionLedgerFinanceDriftRuntimePort),
      requirePort(actionLedgerInventoryDriftRuntimePort),
    ],
  },
  api: [
    {
      id: "@voyant-travel/action-ledger#health-extension.api",
      surface: "admin",
      mount: "action-ledger",
      openapi: { document: "action-ledger-health" },
      resource: "action-ledger",
      runtime: {
        entry: "@voyant-travel/action-ledger/graph-runtime",
        export: "createActionLedgerHealthVoyantRuntime",
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export default actionLedgerVoyantModule
