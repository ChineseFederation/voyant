import type { z } from "zod"

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE"

/**
 * How cautious an operation is — drives confirm dialogs in native UIs, risk
 * gating in AI tool wrappers, and the audit `actionKind`. A single,
 * escalating ladder:
 *
 *   - `read`                  — no mutation.
 *   - `routine_write`         — ordinary create/update.
 *   - `destructive`           — irreversible data loss (delete).
 *   - `requires_confirmation` — the server may demand an approval (HTTP 202 +
 *                               approval payload) before performing the action;
 *                               callers must be prepared to handle that flow.
 */
export type ActionClassification =
  | "read"
  | "routine_write"
  | "destructive"
  | "requires_confirmation"

/** `resource:action` scope string, matching `@voyant-travel/types` API-key scopes. */
export type Scope = string

/** Where the operation's `input` travels: query string (GET) or JSON body. */
export type InputLocation = "query" | "body"

/**
 * How the payload is wrapped on the wire:
 *   - `data` — response is `{ data: <output> }`; the client returns `.data`.
 *   - `raw`  — response IS the output (paginated envelopes, `{ success }`).
 */
export type Envelope = "data" | "raw"

export interface OperationDescriptor<
  TParams = unknown,
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput extends z.ZodTypeAny = z.ZodTypeAny,
> {
  /** Stable dotted id, e.g. `"bookings.cancel"`. */
  id: string
  method: HttpMethod
  /** Build the request path from route params. */
  path: (params: TParams) => string
  /** A stable, param-templated path (`/v1/admin/bookings/:id/cancel`) for capability listing. */
  pathTemplate: string
  /** Request body (POST/PATCH/PUT) or query (GET) schema. */
  input: TInput
  /** Response payload schema (after envelope handling). */
  output: TOutput
  classification: ActionClassification
  /** `resource:action` scopes a caller needs. */
  scopes: Scope[]
  /** Action-ledger capability key when the op is capability-gated. */
  capabilityKey?: string
  inputLocation: InputLocation
  envelope: Envelope
  /** Whether the op accepts an `Idempotency-Key` header. */
  idempotent: boolean
  summary?: string
}

/**
 * Define an operation descriptor with sensible defaults: `inputLocation`
 * follows the method (GET → query, else body), `envelope` defaults to `data`,
 * and `idempotent` defaults to false.
 */
export function defineOperation<TParams, TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny>(
  spec: Omit<
    OperationDescriptor<TParams, TInput, TOutput>,
    "inputLocation" | "envelope" | "idempotent"
  > &
    Partial<
      Pick<
        OperationDescriptor<TParams, TInput, TOutput>,
        "inputLocation" | "envelope" | "idempotent"
      >
    >,
): OperationDescriptor<TParams, TInput, TOutput> {
  return {
    ...spec,
    inputLocation: spec.inputLocation ?? (spec.method === "GET" ? "query" : "body"),
    envelope: spec.envelope ?? "data",
    idempotent: spec.idempotent ?? false,
  }
}

// biome-ignore lint/suspicious/noExplicitAny: descriptor type extractors need the any-positioned infer -- owner: admin-contracts; existing suppression is intentional pending typed cleanup.
type AnyOperation = OperationDescriptor<any, any, any>

export type InferParams<D extends AnyOperation> =
  D extends OperationDescriptor<infer P, infer _I, infer _O> ? P : never
// Input uses z.input (the caller-facing, pre-parse type) so schema defaults
// (e.g. a status that defaults to "pending") are optional for the caller, not
// required. Output uses z.infer (post-parse) since that's what the client
// returns after parsing the response.
export type InferInput<D extends AnyOperation> =
  D extends OperationDescriptor<infer _P, infer I, infer _O> ? z.input<I> : never
export type InferOutput<D extends AnyOperation> =
  D extends OperationDescriptor<infer _P, infer _I, infer O> ? z.infer<O> : never
