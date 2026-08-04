/**
 * Request-schema primitives shared by `validation.ts` and
 * `validation-allocation.ts`. They live here, rather than in either half, so
 * the split between "slots, rules and closeouts" and "allocation" does not
 * create a cycle between the two files.
 */

import { z } from "zod"

/** A resource kind is open-ended: modules add `cabin`, `flight_seat`, `equipment`. */
export const allocationResourceKindSchema = z.string().trim().min(1).max(80)

/** `allocation_resources.flags` / template `flags` is an untyped jsonb record. */
export const allocationResourceFlagsSchema = z.record(z.string(), z.unknown())
