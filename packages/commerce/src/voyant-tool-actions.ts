import type { VoyantGraphActionDeclaration } from "@voyant-travel/core/project"

export const commerceToolActions = [
  commerceToolAction("resolve-sellability", "sellability", "read"),
  commerceToolAction("list-sellability-policies", "sellability", "read"),
  commerceToolAction("get-sellability-policy", "sellability", "read"),
  commerceToolAction("create-sellability-policy", "sellability", "write"),
  commerceToolAction("update-sellability-policy", "sellability", "write"),
  commerceToolAction("list-cancellation-policies", "pricing", "read"),
  commerceToolAction("get-cancellation-policy", "pricing", "read"),
  commerceToolAction("create-cancellation-policy", "pricing", "write"),
  commerceToolAction("update-cancellation-policy", "pricing", "write"),
  commerceToolAction("list-price-catalogs", "pricing", "read"),
  commerceToolAction("get-price-catalog", "pricing", "read"),
  commerceToolAction("create-price-catalog", "pricing", "write"),
  commerceToolAction("update-price-catalog", "pricing", "write"),
  commerceToolAction("list-promotions", "promotions", "read"),
  commerceToolAction("get-promotion", "promotions", "read"),
  commerceToolAction("create-promotion", "promotions", "write"),
  commerceToolAction("update-promotion", "promotions", "write"),
  commerceToolAction("archive-promotion", "promotions", "write"),
] as const

function commerceToolAction(
  suffix: string,
  resource: "sellability" | "pricing" | "promotions",
  action: "read" | "write",
): VoyantGraphActionDeclaration {
  const write = action === "write"
  const created = createdTarget(suffix)
  return {
    id: `@voyant-travel/commerce#action.${suffix}`,
    version: "v1",
    kind: write ? "execute" : "read",
    targetType: created?.targetType ?? resource,
    ...(isExistingTarget(suffix)
      ? {
          commandTargetField: "id",
          availability: { status: "available" as const },
          effectBoundary: "local" as const,
          targetLifecycle: "existing" as const,
        }
      : {}),
    ...(suffix === "create-promotion"
      ? {
          availability: { status: "available" as const },
          effectBoundary: "multistage" as const,
          durability: {
            strategy: "outbox" as const,
            testReference: "packages/commerce/tests/integration/promotion-created-command.test.ts",
          },
        }
      : {}),
    ...(created && suffix !== "create-promotion"
      ? {
          availability: { status: "available" as const },
          effectBoundary: "local" as const,
        }
      : {}),
    resource,
    action,
    requiredScopes: [`${resource}:${action}`],
    risk: write ? "medium" : "low",
    ledger: write ? "required" : "optional",
    approval: "never",
    reversible: write && !created,
    allowedActorTypes: ["staff"],
    ...(created
      ? {
          targetLifecycle: "created" as const,
          createdTarget: {
            commandTargetType: created.commandTargetType,
            resultReferenceType: created.resultReferenceType,
            durability: "handler-command-claim-v1" as const,
          },
        }
      : {}),
    from: { tools: [`@voyant-travel/commerce#tool.${suffix}`] },
  }
}

function isExistingTarget(suffix: string): boolean {
  return [
    "update-cancellation-policy",
    "update-sellability-policy",
    "update-price-catalog",
    "update-promotion",
    "archive-promotion",
  ].includes(suffix)
}

function createdTarget(suffix: string) {
  switch (suffix) {
    case "create-sellability-policy":
      return target("sellability-policy", "sellability_policy_create_command")
    case "create-cancellation-policy":
      return target("cancellation-policy", "cancellation_policy_create_command")
    case "create-price-catalog":
      return target("price-catalog", "price_catalog_create_command")
    case "create-promotion":
      return target("promotion", "promotion_create_command")
    default:
      return null
  }
}

function target(targetType: string, commandTargetType: string) {
  return { targetType, commandTargetType, resultReferenceType: targetType }
}
