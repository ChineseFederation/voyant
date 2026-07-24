import { listResponse } from "@voyant-travel/types"
import {
  renderStructuredTemplate,
  type TemplateSyntaxIssue,
  validateStructuredTemplateSyntax,
} from "@voyant-travel/utils/template-renderer"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"
import { contractNumberSeries, contracts } from "./schema.js"
import type {
  contractListQuerySchema,
  contractNumberSeriesListQuerySchema,
  contractTemplateDefaultQuerySchema,
  contractTemplateListQuerySchema,
  insertContractAttachmentSchema,
  insertContractNumberSeriesSchema,
  insertContractSchema,
  insertContractSignatureSchema,
  insertContractTemplateSchema,
  insertContractTemplateVersionSchema,
  renderTemplateInputSchema,
  updateContractAttachmentSchema,
  updateContractNumberSeriesSchema,
  updateContractSchema,
  updateContractTemplateSchema,
} from "./validation.js"

export type ContractListQuery = z.infer<typeof contractListQuerySchema>
export type ContractTemplateListQuery = z.infer<typeof contractTemplateListQuerySchema>
export type ContractTemplateDefaultQuery = z.infer<typeof contractTemplateDefaultQuerySchema>
export type ContractNumberSeriesListQuery = z.infer<typeof contractNumberSeriesListQuerySchema>
export type CreateContractTemplateInput = z.infer<typeof insertContractTemplateSchema>
export type UpdateContractTemplateInput = z.infer<typeof updateContractTemplateSchema>
export type CreateContractTemplateVersionInput = z.infer<typeof insertContractTemplateVersionSchema>
export type CreateContractNumberSeriesInput = z.input<typeof insertContractNumberSeriesSchema>
export type UpdateContractNumberSeriesInput = z.input<typeof updateContractNumberSeriesSchema>
export type CreateContractInput = z.infer<typeof insertContractSchema>
export type UpdateContractInput = z.infer<typeof updateContractSchema>
export type CreateContractSignatureInput = z.infer<typeof insertContractSignatureSchema>
export type CreateContractAttachmentInput = z.infer<typeof insertContractAttachmentSchema>
export type UpdateContractAttachmentInput = z.infer<typeof updateContractAttachmentSchema>
export type RenderTemplateInput = z.infer<typeof renderTemplateInputSchema>

export function toTimestamp(value?: string | null): Date | null {
  return value ? new Date(value) : null
}

function resolvePath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined
  const segments: Array<string | number> = []
  const parts = path.split(".")
  for (const part of parts) {
    if (!part) continue
    const indexMatches = [...part.matchAll(/([^[\]]+)|\[(\d+)\]/g)]
    for (const match of indexMatches) {
      if (match[1] !== undefined) segments.push(match[1])
      else if (match[2] !== undefined) segments.push(Number.parseInt(match[2], 10))
    }
  }
  let current: unknown = obj
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined
    if (typeof seg === "number") {
      if (!Array.isArray(current)) return undefined
      current = current[seg]
    } else {
      if (typeof current !== "object") return undefined
      current = (current as Record<string, unknown>)[seg]
    }
  }
  return current
}

/**
 * Default placeholder for output tags whose value is null / undefined
 * / empty-string. Applied to every contract render — preview at the
 * storefront, manual previews from the admin, AND the post-confirm
 * rendered previews and provider-owned PDFs — so authored templates don't have to spell out
 * `| default: "-"` on every variable.
 *
 * Authors who prefer a different fallback for a specific variable can
 * still write `{{ foo | default: "TBD" }}` and the renderer leaves
 * their explicit chain alone.
 */
const CONTRACT_MISSING_VALUE_PLACEHOLDER = "-"

export class ContractTemplateSyntaxError extends Error {
  readonly issues: TemplateSyntaxIssue[]

  constructor(issues: TemplateSyntaxIssue[]) {
    super("Contract template contains invalid Liquid syntax")
    this.name = "ContractTemplateSyntaxError"
    this.issues = issues
  }
}

export function isContractTemplateSyntaxError(
  error: unknown,
): error is ContractTemplateSyntaxError {
  return error instanceof ContractTemplateSyntaxError
}

export function validateContractTemplateBody(body: string): void {
  const issues = validateStructuredTemplateSyntax(body, "html")
  if (issues.length > 0) {
    throw new ContractTemplateSyntaxError(issues)
  }
}

export function renderTemplate(
  body: string,
  bodyFormat: "markdown" | "html" | "lexical_json",
  variables: Record<string, unknown>,
): string {
  const issues = validateStructuredTemplateSyntax(body, bodyFormat)
  if (issues.length > 0) {
    throw new ContractTemplateSyntaxError(issues)
  }

  return renderStructuredTemplate(body, bodyFormat, variables, {
    missingValuePlaceholder: CONTRACT_MISSING_VALUE_PLACEHOLDER,
  })
}

// When a contract is being issued or rendered, the allocated series
// number must be visible to the template via `{{ contract.number }}` /
// `{{ contract.contractNumber }}` (issue #1335). This helper merges the
// allocated value into both aliases without dropping caller-provided
// fields nested under `contract.*`.
export function mergeContractNumberIntoVariables(
  variables: Record<string, unknown>,
  contractNumber: string,
): Record<string, unknown> {
  const existingContract =
    variables.contract &&
    typeof variables.contract === "object" &&
    !Array.isArray(variables.contract)
      ? (variables.contract as Record<string, unknown>)
      : {}
  return {
    ...variables,
    contract: {
      ...existingContract,
      contractNumber,
      number: contractNumber,
    },
  }
}

export function validateTemplateVariables(
  variableSchema: unknown,
  values: Record<string, unknown>,
): string[] {
  const issues: string[] = []
  if (!variableSchema || typeof variableSchema !== "object") return issues
  const schema = variableSchema as Record<string, unknown>
  const requiredList = Array.isArray(schema.required) ? (schema.required as string[]) : []
  for (const key of requiredList) {
    const resolved = resolvePath(values, key)
    if (resolved === undefined || resolved === null || resolved === "") {
      issues.push(`missing required variable: ${key}`)
    }
  }
  return issues
}

function currentPeriodBoundary(strategy: "never" | "annual" | "monthly", now: Date): Date | null {
  if (strategy === "never") return null
  if (strategy === "annual") return new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

function formatNumber(
  prefix: string,
  separator: string,
  sequence: number,
  padLength: number,
): string {
  const padded = String(sequence).padStart(padLength, "0")
  return `${prefix}${separator}${padded}`
}

/**
 * Normalize `db.execute(sql)` results across drizzle drivers. See the
 * comment in `bookings/service.ts#toRows` for the why.
 */
function toResultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows: unknown }).rows
    return Array.isArray(rows) ? (rows as T[]) : []
  }
  return []
}

export async function allocateContractNumber(
  db: PostgresJsDatabase,
  seriesId: string,
): Promise<{ number: string; sequence: number } | null> {
  return db.transaction(async (tx) => {
    const rows = await tx.execute(
      // agent-quality: raw-sql reviewed -- owner: legal; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      sql`SELECT * FROM ${contractNumberSeries}
          WHERE ${contractNumberSeries.id} = ${seriesId}
          FOR UPDATE`,
    )
    // `db.execute(sql)` returns rows directly under `drizzle-orm/postgres-js`
    // but pg's `QueryResult<T>` (with `.rows`) under `node-postgres` and
    // `neon-serverless`. Casting straight to `Array<T>` worked on the
    // first driver and silently returned `undefined` on the others —
    // which is why contracts auto-issued under the node-pg/Neon-WS
    // operator starter came out without a number. Normalise the shape.
    const row = toResultRows<Record<string, unknown>>(rows)[0]
    if (!row) return null

    const strategy = row.reset_strategy as "never" | "annual" | "monthly"
    const prefix = (row.prefix as string) ?? ""
    const separator = (row.separator as string) ?? ""
    const padLength = (row.pad_length as number) ?? 4
    const currentSequence = (row.current_sequence as number) ?? 0
    const resetAt = row.reset_at ? new Date(row.reset_at as string | Date) : null

    const now = new Date()
    const boundary = currentPeriodBoundary(strategy, now)
    const shouldReset =
      boundary !== null && (resetAt === null || resetAt.getTime() < boundary.getTime())

    let nextSequence = shouldReset ? 1 : currentSequence + 1
    const nextResetAt = strategy === "never" ? resetAt : boundary
    let nextNumber = formatNumber(prefix, separator, nextSequence, padLength)

    // Series counters can drift behind real data after manual imports,
    // seed resets, or duplicate legacy series. The contract number itself is
    // globally unique, so advance until we find a free value before stamping
    // the series counter.
    for (let attempts = 0; attempts < 1000; attempts++) {
      const existing = await tx
        .select({ id: contracts.id })
        .from(contracts)
        // agent-quality: raw-sql reviewed -- owner: legal; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        .where(sql`${contracts.contractNumber} = ${nextNumber}`)
        .limit(1)

      if (existing.length === 0) break

      nextSequence += 1
      nextNumber = formatNumber(prefix, separator, nextSequence, padLength)
    }

    await tx
      .update(contractNumberSeries)
      .set({ currentSequence: nextSequence, resetAt: nextResetAt, updatedAt: new Date() })
      // agent-quality: raw-sql reviewed -- owner: legal; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      .where(sql`${contractNumberSeries.id} = ${seriesId}`)

    return {
      number: nextNumber,
      sequence: nextSequence,
    }
  })
}

export async function paginate<T extends object>(
  rowsQuery: Promise<T[]>,
  countQuery: Promise<Array<{ count: number }>>,
  limit: number,
  offset: number,
) {
  const [data, countResult] = await Promise.all([rowsQuery, countQuery])
  return listResponse(data, { total: countResult[0]?.count ?? 0, limit, offset })
}
