import type { InsuranceApplication, InsuranceApplicationInput } from "./application.js"
import type { InsuranceDocument, InsuranceDocumentKind } from "./document.js"
import type { InsurancePolicy, InsurancePolicyCancellation } from "./policy.js"
import type { InsuranceQuote, InsuranceQuoteRequest } from "./quote.js"

/**
 * Per-call context. Everything here is about *how* the call is made rather than
 * what is being asked, which is why it is a second parameter on every method.
 */
export interface InsuranceProviderContext {
  /**
   * Aborts the call. Quoting fans out across every connected insurer and a slow
   * one must degrade the list rather than hold up a checkout, so an adapter that
   * ignores this makes the whole step as slow as its worst provider.
   */
  signal?: AbortSignal
  /**
   * Required for anything that creates or changes state at the insurer. A
   * retried `issue` that produces a second policy is a real charge on a real
   * traveller.
   */
  idempotencyKey?: string
  locale?: string
  currency?: string
}

export interface InsuranceIssueInput {
  applicationId: string
  /**
   * The premium the caller intends to charge, so the insurer can refuse rather
   * than silently issue at a price the traveller has not agreed to.
   */
  expectedPremium: InsurancePolicy["premium"]
}

export interface InsuranceDocumentInput {
  policyId: string
  kind: InsuranceDocumentKind
  locale?: string
}

export interface InsuranceCancelInput {
  policyId: string
  reason: string
}

/**
 * What an insurance provider has to implement to be sellable.
 *
 * The framework binds this interface and knows nothing about any specific
 * insurer or distribution platform. An operator with a direct contract writes
 * an adapter against these five methods and binds it; the Connect adapter is
 * one such binding and has no privileged position.
 *
 * Two rules the interface cannot express but implementations must honour:
 *
 * - `quote` returns a list — empty, one, or several — and **never throws for a
 *   business refusal**. An insurer declining a trip length, a lead time or an
 *   age returns a quote carrying `eligibility.status !== "eligible"` and
 *   structured reasons, so a caller can explain the refusal instead of showing
 *   an error. Throw only when the call itself failed.
 * - `quote` is given ages and dates, never personal data. The identified data
 *   an insurer needs is collected after the traveller accepts an offer and goes
 *   to `apply`.
 */
export interface InsuranceProviderAdapter {
  /** Stable across deployments; it keys stored applications and policies. */
  readonly providerId: string
  /** How the insurer is named to a traveller. */
  readonly displayName: string

  quote(
    request: InsuranceQuoteRequest,
    context: InsuranceProviderContext,
  ): Promise<InsuranceQuote[]>

  apply(
    input: InsuranceApplicationInput,
    context: InsuranceProviderContext,
  ): Promise<InsuranceApplication>

  issue(input: InsuranceIssueInput, context: InsuranceProviderContext): Promise<InsurancePolicy>

  document(
    input: InsuranceDocumentInput,
    context: InsuranceProviderContext,
  ): Promise<InsuranceDocument>

  cancel(
    input: InsuranceCancelInput,
    context: InsuranceProviderContext,
  ): Promise<InsurancePolicyCancellation>
}

/** The methods a runtime port check asserts are present. */
export const INSURANCE_PROVIDER_METHODS = [
  "quote",
  "apply",
  "issue",
  "document",
  "cancel",
] as const satisfies readonly (keyof InsuranceProviderAdapter)[]

/**
 * Structural check used by the runtime port and by adapter tests.
 *
 * Deliberately side-effect free — the graph runs it on every port read.
 */
export function assertInsuranceProviderAdapter(
  provider: unknown,
): asserts provider is InsuranceProviderAdapter {
  if (provider === null || typeof provider !== "object") {
    throw new Error("insurance provider must be an object")
  }
  const candidate = provider as Record<string, unknown>
  if (typeof candidate.providerId !== "string" || candidate.providerId.length === 0) {
    throw new Error("insurance provider must expose a non-empty providerId")
  }
  if (typeof candidate.displayName !== "string" || candidate.displayName.length === 0) {
    throw new Error("insurance provider must expose a non-empty displayName")
  }
  for (const method of INSURANCE_PROVIDER_METHODS) {
    if (typeof candidate[method] !== "function") {
      throw new Error(`insurance provider must implement ${method}()`)
    }
  }
}
