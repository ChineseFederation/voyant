/**
 * Payment terms on a Proposal Version.
 *
 * A quoted trip is negotiated per client — "50% now, the rest 30 days before
 * departure" routinely differs between a corporate group and a returning
 * family buying from the same operator. Those terms are part of what the
 * customer agrees to when they accept, so they belong on the version they
 * accepted, not only on the operator profile ([#4606]).
 *
 * The stored shape is finance's `PaymentPolicy` verbatim rather than a
 * proposals-shaped mirror. Finance resolves the booking's schedule from a
 * cascade of these, and an accepted proposal's terms are simply one more layer
 * in it — a translation between two nearly-identical shapes would be a place
 * for the quoted deposit and the billed one to diverge.
 *
 * This module holds only the reading and quoting of terms. Where they sit in
 * the cascade is finance's decision (`resolveEffectivePaymentPolicy`).
 */
import {
  normalizePaymentPolicy,
  type PaymentPolicy,
  resolveDepositAmountCents,
} from "@voyant-travel/finance/payment-policy"

export type ProposalPaymentTerms = PaymentPolicy

/**
 * Read stored terms back as a policy, or `null` when the version states none.
 *
 * Goes through `normalizePaymentPolicy` so a row written before the current
 * shape (or by an older client) reads the same way finance reads every other
 * policy column, rather than being trusted as-is because it is ours.
 */
export function normalizeProposalPaymentTerms(value: unknown): ProposalPaymentTerms | null {
  return normalizePaymentPolicy(value)
}

/**
 * What the deposit comes to against this version's total.
 *
 * A percentage is not a stated term — the customer is agreeing to pay a sum.
 * Shares finance's own deposit arithmetic so the figure quoted on the proposal
 * is the figure the booking's first schedule row carries.
 */
export function proposalDepositAmountCents(
  terms: ProposalPaymentTerms,
  totalAmountCents: number,
): number {
  return resolveDepositAmountCents(totalAmountCents, terms.deposit)
}
