/**
 * Operator Settings agent tools on the framework Tool contract.
 *
 * The tools expose the combined operator profile/payment-settings aggregate,
 * not the underlying storage tables. A deployment injects the service through
 * the Tool context so this surface stays transport-neutral.
 */
import {
  admitHandlerActionPolicy,
  defineTool,
  type HandlerActionPolicyExpectation,
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { z } from "zod"

import { paymentPolicySchema, updateOperatorSettingsSchema } from "./service.js"

const nullableText = z.string().nullable()

export const operatorSettingsValueSchema = z.object({
  id: z.string().optional(),
  name: nullableText.optional(),
  legalName: nullableText.optional(),
  vatId: nullableText.optional(),
  registrationNumber: nullableText.optional(),
  address: nullableText.optional(),
  phone: nullableText.optional(),
  email: nullableText.optional(),
  website: nullableText.optional(),
  license: nullableText.optional(),
  licenseAuthority: nullableText.optional(),
  signatoryName: nullableText.optional(),
  signatoryRole: nullableText.optional(),
  bankTransferBeneficiary: nullableText,
  iban: nullableText,
  bank: nullableText,
  notes: nullableText,
  customerPaymentPolicy: paymentPolicySchema.nullable(),
  bookingCheckoutUrlTemplate: nullableText,
  invoicePayUrlTemplate: nullableText,
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
})

export type OperatorSettingsValue = z.infer<typeof operatorSettingsValueSchema>
export type UpdateOperatorSettingsToolInput = z.infer<typeof updateOperatorSettingsSchema>

export const UPDATE_OPERATOR_SETTINGS_HANDLER_POLICY = {
  capabilityId: "@voyant-travel/operator-settings#tool.update-operator-settings",
  capabilityVersion: "v1",
  canonicalName: "update_operator_settings",
  actionPolicy: {
    id: "@voyant-travel/operator-settings#action.update-operator-settings",
    capabilityId: "@voyant-travel/operator-settings#action.update-operator-settings",
    version: "v1",
    kind: "execute",
    targetType: "operator-settings",
    commandTargetField: "settingsId",
    targetLifecycle: "existing",
    existingTarget: { durability: "handler-command-result-v1" },
    risk: "high",
    ledger: "required",
    approval: "required",
    reversible: true,
  },
} as const satisfies HandlerActionPolicyExpectation

const operatorSettingsResultSchema = z.object({
  settings: operatorSettingsValueSchema.nullable(),
})

export interface OperatorSettingsToolServices {
  getSettings(): Promise<OperatorSettingsValue | null>
  updateSettings(
    input: UpdateOperatorSettingsToolInput,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<OperatorSettingsValue | null>
}

export type OperatorSettingsToolContext = ToolContext & {
  operatorSettings?: OperatorSettingsToolServices
}

function operatorSettings(ctx: OperatorSettingsToolContext): OperatorSettingsToolServices {
  return requireService(ctx.operatorSettings, "operatorSettings")
}

export const getOperatorSettingsTool = defineTool<
  Record<string, never>,
  { settings: OperatorSettingsValue | null },
  OperatorSettingsToolContext
>({
  name: "get_operator_settings",
  description:
    "Read the operator profile, payment instructions, and payment defaults as one settings aggregate. Read-only.",
  inputSchema: z.object({}),
  outputSchema: operatorSettingsResultSchema,
  requiredScopes: ["settings:read"],
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler(_input, ctx) {
    return { settings: await operatorSettings(ctx).getSettings() }
  },
})

export const updateOperatorSettingsTool = defineTool<
  UpdateOperatorSettingsToolInput,
  { settings: OperatorSettingsValue | null },
  OperatorSettingsToolContext
>({
  name: "update_operator_settings",
  description:
    "Update operator identity/contact details, branding/locales, bank-transfer instructions, or payment defaults. supportedLocales and defaultLocale must be updated together, and defaultLocale must be included in supportedLocales. Requires confirmation because payment defaults affect future bookings and invoices.",
  inputSchema: updateOperatorSettingsSchema,
  outputSchema: operatorSettingsResultSchema,
  requiredScopes: ["settings:write"],
  tier: "sensitive",
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write"],
  },
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler(input, ctx) {
    const admitted = admitHandlerActionPolicy(ctx, UPDATE_OPERATOR_SETTINGS_HANDLER_POLICY)
    return { settings: await operatorSettings(ctx).updateSettings(input, admitted) }
  },
})

export const operatorSettingsTools = [getOperatorSettingsTool, updateOperatorSettingsTool] as const
