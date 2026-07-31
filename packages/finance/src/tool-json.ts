/**
 * Pure JSON coercion for Finance tool outputs: turn service rows (with `Date`s
 * and `undefined`s) into plain JSON before validating against a tool output
 * schema. No transport or request dependency, so both the deployment-agnostic
 * `tools.ts` contract and the request-scoped runtimes can share it.
 */
import type { z } from "zod"

export function toJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(toJsonValue)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nested]) => [key, toJsonValue(nested)] as const)
      .filter(([, nested]) => nested !== undefined),
  )
}

export function parseJsonResult<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  return schema.parse(toJsonValue(value))
}
