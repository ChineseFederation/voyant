import { newId } from "@voyant-travel/db/lib/typeid"
import { desc, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { allocationAuditLog } from "./schema.js"
import type { SqlExecutor } from "./service-allocation-sql.js"
import { executeRows } from "./service-allocation-sql.js"

export interface AllocationAuditLogEntry {
  id: string
  slotId: string
  action: string
  actorId: string | null
  travelerId: string | null
  resourceId: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  createdAt: string
}

export async function listAllocationAuditLog(
  db: PostgresJsDatabase,
  slotId: string,
  limit = 50,
): Promise<AllocationAuditLogEntry[]> {
  const rows = await db
    .select()
    .from(allocationAuditLog)
    .where(eq(allocationAuditLog.slotId, slotId))
    .orderBy(desc(allocationAuditLog.createdAt))
    .limit(limit)
  return rows.map((row) => ({
    id: row.id,
    slotId: row.slotId,
    action: row.action,
    actorId: row.actorId,
    travelerId: row.travelerId,
    resourceId: row.resourceId,
    before: row.before ?? null,
    after: row.after ?? null,
    createdAt: row.createdAt.toISOString(),
  }))
}

export async function recordAllocationAudit(
  db: SqlExecutor,
  input: {
    slotId: string
    action: string
    actorId?: string | null
    travelerId?: string | null
    resourceId?: string | null
    before?: Record<string, unknown> | null
    after?: Record<string, unknown> | null
  },
) {
  await db.execute(sql`
    INSERT INTO allocation_audit_log (id, slot_id, action, actor_id, traveler_id, resource_id, before, after)
    VALUES (
      ${newId("allocation_audit_log")},
      ${input.slotId},
      ${input.action},
      ${input.actorId ?? null},
      ${input.travelerId ?? null},
      ${input.resourceId ?? null},
      ${JSON.stringify(input.before ?? null)}::jsonb,
      ${JSON.stringify(input.after ?? null)}::jsonb
    )
  `)
}

export async function findAllocationAuditByCommandClaim(
  db: SqlExecutor,
  input: { slotId: string; action: string; commandClaimActionId: string },
): Promise<Record<string, unknown> | null> {
  const rows = await executeRows<{ before: Record<string, unknown> | null }>(
    db,
    sql`
      SELECT before
      FROM allocation_audit_log
      WHERE slot_id = ${input.slotId}
        AND action = ${input.action}
        AND before ->> 'commandClaimActionId' = ${input.commandClaimActionId}
      ORDER BY created_at DESC
      LIMIT 1
    `,
  )
  return rows[0]?.before ?? null
}
