import { mcpExposurePolicies } from "@voyant-travel/db/schema/iam"
import type { VoyantDb } from "@voyant-travel/hono"
import { eq } from "drizzle-orm"

import {
  MCP_EXPOSURE_POLICY_ID,
  type McpExposurePolicy,
  normalizeMcpExposurePolicy,
} from "./exposure-policy.js"

export interface McpExposurePolicyStore {
  /** Undefined means the host has no persistence context (for example an isolated test runtime). */
  load(db: unknown): Promise<McpExposurePolicy | undefined>
  save(db: unknown, policy: McpExposurePolicy, updatedBy?: string): Promise<McpExposurePolicy>
}

export const databaseMcpExposurePolicyStore: McpExposurePolicyStore = {
  async load(value) {
    if (!isVoyantDb(value)) return undefined
    const db = value as VoyantDb
    const [row] = await db
      .select({ policy: mcpExposurePolicies.policy })
      .from(mcpExposurePolicies)
      .where(eq(mcpExposurePolicies.id, MCP_EXPOSURE_POLICY_ID))
      .limit(1)
    return normalizeMcpExposurePolicy(row?.policy)
  },

  async save(value, input, updatedBy) {
    if (!value) throw new Error("MCP exposure policy persistence requires a database context.")
    const db = value as VoyantDb
    const policy = normalizeMcpExposurePolicy(input)
    const [row] = await db
      .insert(mcpExposurePolicies)
      .values({
        id: MCP_EXPOSURE_POLICY_ID,
        policy,
        ...(updatedBy ? { updatedBy } : {}),
      })
      .onConflictDoUpdate({
        target: mcpExposurePolicies.id,
        set: { policy, ...(updatedBy ? { updatedBy } : {}), updatedAt: new Date() },
      })
      .returning()
    return normalizeMcpExposurePolicy(row?.policy ?? policy)
  },
}

function isVoyantDb(value: unknown): value is VoyantDb {
  if (value === null || typeof value !== "object") return false
  const candidate = value as { select?: unknown; insert?: unknown }
  return typeof candidate.select === "function" && typeof candidate.insert === "function"
}
