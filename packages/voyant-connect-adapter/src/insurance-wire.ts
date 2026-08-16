/**
 * Turning a Connect response into the four shapes the insurance contract trades
 * in: a quote, an application, a policy, and a cancellation.
 *
 * Each decoder reads a namespaced `insurance` payload where the connector sends
 * one and falls back to the response body where it does not, so a connector may
 * either wrap its insurance payload or answer with it directly.
 */

import type {
  InsuranceApplication,
  InsuranceApplicationInput,
} from "@voyant-travel/insurance-contracts/application"
import type {
  InsurancePolicy,
  InsurancePolicyCancellation,
} from "@voyant-travel/insurance-contracts/policy"
import type {
  InsuranceCancelInput,
  InsuranceIssueInput,
} from "@voyant-travel/insurance-contracts/provider"
import type {
  InsuranceQuote,
  InsuranceQuoteRequest,
} from "@voyant-travel/insurance-contracts/quote"

import {
  decodeApplicationStatus,
  decodeContractingParty,
  decodeCover,
  decodeDisclosure,
  decodeDocument,
  decodeEligibility,
  decodeFailure,
  decodeInsuredPerson,
  decodeIssueState,
  decodeList,
  decodeMoney,
  decodeOptionalCover,
  decodePolicyCancellation,
  decodeQuestion,
  insurancePayload,
  policyPayload,
} from "./insurance-wire-fields.js"
import { recordValue, stringValue } from "./utils.js"

/**
 * A quote id that the source can re-resolve from.
 *
 * `apply` is handed only the quote id, so whatever Connect needs to turn a
 * price back into a booking — the product, the option, the unit and the
 * insurer's own quote id — is packed into it. It is opaque to everyone but this
 * file, which is exactly what the contract says a quote id is.
 */
const QUOTE_REF_VERSION = "vcq1"

export interface ConnectQuoteSelection {
  productId: string
  optionId: string | undefined
  unitId: string
  quoteId: string
}

function encodeQuoteRef(selection: {
  productId: string
  optionId?: string | undefined
  unitId: string
  quoteId: string
}): string {
  return [
    QUOTE_REF_VERSION,
    selection.productId,
    selection.optionId ?? "",
    selection.unitId,
    selection.quoteId,
  ]
    .map((part) => encodeURIComponent(part))
    .join("|")
}

export function decodeQuoteRef(value: string): ConnectQuoteSelection {
  const parts = value.split("|").map((part) => decodeURIComponent(part))
  const [version, productId, optionId, unitId, quoteId] = parts
  if (parts.length !== 5 || version !== QUOTE_REF_VERSION || !productId || !unitId || !quoteId) {
    throw new Error("Voyant Connect insurance quote reference is not resolvable")
  }
  return { productId, optionId: optionId || undefined, unitId, quoteId }
}

export function decodeQuote(
  value: unknown,
  scope: {
    providerId: string
    displayName: string
    productId: string
    request: InsuranceQuoteRequest
  },
): InsuranceQuote | undefined {
  const row = insurancePayload(value)
  if (!row) return undefined
  const planId = stringValue(row.planId) ?? stringValue(row.id)
  const planName = stringValue(row.planName) ?? stringValue(row.title)
  if (!planId || !planName) return undefined

  const eligibility = decodeEligibility(row.eligibility)
  const premium = decodeMoney(row.premium) ?? {
    // A refused plan has no price. Carrying the requested currency with a zero
    // amount keeps the refusal comparable and readable next to the plans that
    // did price, rather than dropping it and leaving the traveller wondering
    // why an insurer they can see elsewhere is missing.
    amountMinor: 0,
    currency: scope.request.currency,
  }
  const sumInsured = decodeMoney(row.sumInsured)
  const excess = decodeMoney(row.excess)
  const providerReference = stringValue(row.quoteId) ?? stringValue(row.providerReference)
  const metadata = recordValue(row.metadata)

  return {
    quoteId: encodeQuoteRef({
      productId: stringValue(row.productId) ?? scope.productId,
      optionId: stringValue(row.optionId),
      unitId: stringValue(row.unitId) ?? "",
      quoteId: providerReference ?? planId,
    }),
    providerId: scope.providerId,
    providerLabel: stringValue(row.providerLabel) ?? scope.displayName,
    planId,
    planName,
    ...(stringValue(row.planTier) ? { planTier: stringValue(row.planTier) } : {}),
    premium,
    ...(sumInsured ? { sumInsured } : {}),
    ...(excess ? { excess } : {}),
    includedCovers: decodeList(row.includedCovers ?? row.covers, decodeCover),
    optionalCovers: decodeList(row.optionalCovers, decodeOptionalCover),
    eligibility,
    disclosures: decodeList(row.disclosures, decodeDisclosure),
    validUntil: stringValue(row.validUntil) ?? new Date().toISOString(),
    ...(providerReference ? { providerReference } : {}),
    ...(metadata ? { metadata } : {}),
  }
}

export function decodeApplication(
  response: unknown,
  scope: { providerId: string; input: InsuranceApplicationInput },
): InsuranceApplication {
  const row = insurancePayload(response)
  const applicationId = stringValue(row?.applicationId) ?? stringValue(row?.id)
  if (!row || !applicationId) {
    throw new Error("Voyant Connect returned no insurance application")
  }
  const premium = decodeMoney(row.premium)
  if (!premium) throw new Error("Voyant Connect returned an insurance application with no premium")
  const providerReference = stringValue(row.providerReference)
  const metadata = recordValue(row.metadata)
  return {
    applicationId,
    providerId: scope.providerId,
    quoteId: scope.input.quoteId,
    status: decodeApplicationStatus(row.status),
    expiresAt: stringValue(row.expiresAt) ?? new Date().toISOString(),
    premium,
    // Echoed from the input rather than read back: this side already holds the
    // identified data, and trusting an upstream echo of it is how a decode bug
    // becomes a policy covering the wrong person.
    insuredPersons: scope.input.insuredPersons,
    contractingParty: scope.input.contractingParty,
    outstandingQuestions: decodeList(row.outstandingQuestions, decodeQuestion),
    answers: scope.input.answers,
    eligibility: decodeEligibility(row.eligibility),
    ...(providerReference ? { providerReference } : {}),
    createdAt: stringValue(row.createdAt) ?? new Date().toISOString(),
    ...(metadata ? { metadata } : {}),
  }
}

export function decodePolicy(
  response: unknown,
  scope: { providerId: string; input: InsuranceIssueInput },
): InsurancePolicy {
  const row = policyPayload(response)
  if (!row) throw new Error("Voyant Connect returned no insurance policy")
  const premium = decodeMoney(row.premium)
  const effectiveFrom = stringValue(row.effectiveFrom)
  const effectiveTo = stringValue(row.effectiveTo)
  const insuredPersons = decodeList(row.insuredPersons, decodeInsuredPerson)
  const contractingParty = decodeContractingParty(row.contractingParty)
  if (!premium || !effectiveFrom || !effectiveTo || !contractingParty) {
    throw new Error("Voyant Connect returned an incomplete insurance policy")
  }
  if (insuredPersons.length === 0) {
    throw new Error("Voyant Connect returned an insurance policy covering nobody")
  }
  const issueState = decodeIssueState(row.issueState)
  const policyNumber = stringValue(row.policyNumber)
  if (issueState === "issued" && !policyNumber) {
    throw new Error("Voyant Connect returned an issued policy with no policy number")
  }
  const failure = decodeFailure(row.failure)
  if (issueState === "issue_failed" && !failure) {
    throw new Error("Voyant Connect returned a failed issue with no reason")
  }
  const sumInsured = decodeMoney(row.sumInsured)
  const issuedAt = stringValue(row.issuedAt)
  const providerReference = stringValue(row.providerReference)
  const cancellation = decodePolicyCancellation(row.cancellation)
  const metadata = recordValue(row.metadata)
  return {
    policyId: stringValue(row.policyId) ?? stringValue(row.id) ?? scope.input.applicationId,
    providerId: scope.providerId,
    applicationId: scope.input.applicationId,
    ...(policyNumber ? { policyNumber } : {}),
    issueState,
    ...(issuedAt ? { issuedAt } : {}),
    effectiveFrom,
    effectiveTo,
    premium,
    ...(sumInsured ? { sumInsured } : {}),
    covers: decodeList(row.covers, decodeCover),
    insuredPersons,
    contractingParty,
    documents: decodeList(row.documents, decodeDocument),
    ...(failure ? { failure } : {}),
    ...(cancellation ? { cancellation } : {}),
    ...(providerReference ? { providerReference } : {}),
    ...(metadata ? { metadata } : {}),
  }
}

export function decodeCancellation(
  response: unknown,
  input: InsuranceCancelInput,
): InsurancePolicyCancellation {
  const row = insurancePayload(response)
  const cancellation = recordValue(row?.cancellation) ?? row
  const refund = decodeMoney(cancellation?.refund)
  const providerReference = stringValue(cancellation?.providerReference)
  return {
    cancelledAt: stringValue(cancellation?.cancelledAt) ?? new Date().toISOString(),
    reason: stringValue(cancellation?.reason) ?? input.reason,
    ...(refund ? { refund } : {}),
    ...(providerReference ? { providerReference } : {}),
  }
}
