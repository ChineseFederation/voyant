import type { EventBus } from "@voyant-travel/core"
import {
  defineToolContextContribution,
  TOOL_GRAPH_SETUP_STEPS_RESOURCE,
  TOOL_UNIT_PROJECT_CONFIG_RESOURCE,
  ToolError,
} from "@voyant-travel/tools"
import { hasApiKeyPermission, permissionStringsToPermissions } from "@voyant-travel/types/api-keys"
import { readSetupPrefill, readSetupSteps } from "./api-runtime.js"
import type { SetupStepDefinition } from "./contracts.js"
import {
  completeSetupStep,
  createDrizzleSetupStore,
  dismissSetup,
  getSetupState,
  initializeSetup,
  SetupSelectionError,
  type SetupStore,
  skipSetupStep,
} from "./service.js"
import type { SetupToolServices } from "./tools.js"

export * from "./tools.js"

export interface CreateSetupToolServicesInput {
  store: SetupStore
  selectedSteps: readonly SetupStepDefinition[]
  prefill?: Readonly<Record<string, unknown>>
  eventBus?: EventBus
  scopes?: readonly string[]
}

export function createSetupToolServices(input: CreateSetupToolServicesInput): SetupToolServices {
  const prefill = input.prefill ?? {}
  const mutationOptions = input.eventBus ? { eventBus: input.eventBus } : {}
  return {
    async get() {
      return {
        state: await getSetupState(input.store, input.selectedSteps, prefill),
        selectedSteps: input.selectedSteps,
        canManage: hasApiKeyPermission(
          permissionStringsToPermissions([...(input.scopes ?? [])]),
          "setup",
          "write",
        ),
      }
    },
    initialize: (setupInput) =>
      selectionRequest(() =>
        initializeSetup(input.store, setupInput, input.selectedSteps, prefill, mutationOptions),
      ),
    complete: (stepId) =>
      selectionRequest(() =>
        completeSetupStep(input.store, input.selectedSteps, stepId, mutationOptions),
      ),
    skip: (stepId) =>
      selectionRequest(() =>
        skipSetupStep(input.store, input.selectedSteps, stepId, mutationOptions),
      ),
    dismiss: () =>
      selectionRequest(() =>
        dismissSetup(input.store, input.selectedSteps, prefill, mutationOptions),
      ),
  }
}

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["setup"],
  contribute: ({ context, request, resources }) => {
    const projectConfig = resources[TOOL_UNIT_PROJECT_CONFIG_RESOURCE] as
      | Readonly<Record<string, unknown>>
      | undefined
    const variables = (request as { var?: { eventBus?: EventBus; scopes?: unknown } }).var
    const scopes = Array.isArray(variables?.scopes)
      ? variables.scopes.filter((scope): scope is string => typeof scope === "string")
      : []
    return {
      setup: createSetupToolServices({
        store: createDrizzleSetupStore(context.db as Parameters<typeof createDrizzleSetupStore>[0]),
        selectedSteps: readSetupSteps(resources[TOOL_GRAPH_SETUP_STEPS_RESOURCE]),
        prefill: readSetupPrefill(projectConfig?.prefill),
        eventBus: variables?.eventBus,
        scopes,
      }),
    }
  },
})

async function selectionRequest<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof SetupSelectionError) {
      throw new ToolError(error.message, "INVALID_INPUT")
    }
    throw error
  }
}
