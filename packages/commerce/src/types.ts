export type CommercialCurrencyCode = string

export type CommercialJson =
  | null
  | boolean
  | number
  | string
  | CommercialJson[]
  | { [key: string]: CommercialJson }

export interface CommercialMoney {
  amountMinor: number
  currency: CommercialCurrencyCode
  precision?: number
}

export interface CommercialProviderHandle {
  providerId?: string
  sourceId?: string
  externalRef?: string
  handle?: string
  facts?: Record<string, CommercialJson>
}

export interface CommercialAdapterHandle extends CommercialProviderHandle {
  adapterId: string
  adapterKind: CommercialAdapterRegistrationKind
}

export type CommercialItemRef =
  | {
      kind: "catalog-item"
      id: string
      vertical?: string
      source?: "operated" | "sourced" | string
      adapterHint?: string
      sourceRef?: CommercialProviderHandle
    }
  | {
      kind: "vertical-item"
      id: string
      vertical: string
      source?: "operated" | "sourced" | string
      adapterHint?: string
      sourceRef?: CommercialProviderHandle
    }

export interface CommercialBuyerRef {
  id?: string
  actorType?: "staff" | "customer" | "partner" | "supplier" | string
  relationshipId?: string
  segmentIds?: string[]
  facts?: Record<string, CommercialJson>
}

export interface CommercialChannelRef {
  id?: string
  code?: string
  kind?: "direct" | "reseller" | "partner" | "staff" | string
  facts?: Record<string, CommercialJson>
}

export interface CommercialMarketRef {
  id?: string
  code?: string
  locale?: string
  currency?: CommercialCurrencyCode
  facts?: Record<string, CommercialJson>
}

export interface CommercialParty {
  pax: number
  adults?: number
  children?: number
  infants?: number
  units?: Array<{
    unitId?: string
    unitType?: string
    quantity: number
  }>
}

export interface CommercialDecisionInput {
  item: CommercialItemRef
  date: string
  party: CommercialParty
  currency: CommercialCurrencyCode
  buyer?: CommercialBuyerRef
  channel?: CommercialChannelRef
  market?: CommercialMarketRef
  promotionCodes?: string[]
  requestedAt?: string
  idempotencyKey?: string
  evaluationMode?: "preview" | "quote" | "checkout"
  locale?: string
  trace?: {
    correlationId?: string
    requestedBy?: string
  }
}

export type CommercialDecisionTraceSource =
  | "commerce"
  | "adapter"
  | "availability"
  | "pricing"
  | "markets"
  | "promotions"
  | "fx"
  | "sellability"

export type CommercialDecisionTraceOutcome =
  | "applied"
  | "blocked"
  | "error"
  | "informational"
  | "skipped"

export interface CommercialDecisionTrace {
  id: string
  source: CommercialDecisionTraceSource
  outcome: CommercialDecisionTraceOutcome
  code: string
  message?: string
  ruleId?: string
  provider?: CommercialProviderHandle
  refs?: Record<string, string>
  facts?: Record<string, CommercialJson>
}

export interface CommercialPricingComponent {
  id?: string
  kind: "base" | "unit" | "fee" | "tax" | "discount" | "adjustment" | "commission" | string
  label?: string
  amount: CommercialMoney
  quantity?: number
  ruleId?: string
  facts?: Record<string, CommercialJson>
}

export interface CommercialFxFact {
  sourceCurrency: CommercialCurrencyCode
  requestedCurrency: CommercialCurrencyCode
  rate: string
  rateSetId?: string
  provider?: CommercialProviderHandle
  quotedAt?: string
}

export interface CommercialPricingFacts {
  currency: CommercialCurrencyCode
  total: CommercialMoney
  subtotal?: CommercialMoney
  taxTotal?: CommercialMoney
  feeTotal?: CommercialMoney
  discountTotal?: CommercialMoney
  components: CommercialPricingComponent[]
  priceRuleIds?: string[]
  catalogId?: string
  fx?: CommercialFxFact
  facts?: Record<string, CommercialJson>
}

export interface CommercialPromotionFact {
  id?: string
  code?: string
  name?: string
  status: "applied" | "rejected" | "eligible" | "ineligible"
  discount?: CommercialMoney
  ruleId?: string
  reason?: string
  facts?: Record<string, CommercialJson>
}

export interface CommercialPromotionFacts {
  requestedCodes?: string[]
  applied: CommercialPromotionFact[]
  rejected: CommercialPromotionFact[]
  totalDiscount?: CommercialMoney
  stacking?: {
    mode?: string
    ruleIds?: string[]
  }
}

export interface CommercialAvailabilityFact {
  status: "available" | "limited" | "unavailable" | "unknown"
  capacityRemaining?: number
  allocationRef?: string
  validUntil?: string
  facts?: Record<string, CommercialJson>
}

export interface CommercialSellabilityFact {
  status: "allowed" | "blocked" | "requires_review" | "unknown"
  policyIds?: string[]
  facts?: Record<string, CommercialJson>
}

export interface CommercialDecisionReason {
  code:
    | "buyable"
    | "unsupported_item"
    | "unavailable"
    | "blocked_by_rule"
    | "adapter_failed"
    | "adapter_invalid_result"
    | "adapter_ambiguous"
    | string
  message?: string
  ruleId?: string
  facts?: Record<string, CommercialJson>
}

export type CommercialDecisionStatus = "buyable" | "unbuyable" | "error"

export interface CommercialDecision {
  decisionId: string
  status: CommercialDecisionStatus
  buyable: boolean
  input: CommercialDecisionInput
  evaluatedAt: string
  idempotencyKey?: string
  validFrom?: string
  validUntil?: string
  reason: CommercialDecisionReason
  pricing?: CommercialPricingFacts
  fx?: CommercialFxFact
  promotions: CommercialPromotionFacts
  availability?: CommercialAvailabilityFact
  sellability?: CommercialSellabilityFact
  market?: CommercialMarketRef
  channel?: CommercialChannelRef
  traces: CommercialDecisionTrace[]
  handles: CommercialAdapterHandle[]
}

export type CommercialAdapterRegistrationKind =
  | "operated-inventory"
  | "source"
  | "vertical"
  | "custom"

export interface CommercialPriceAvailabilityResult {
  status: "available" | "unavailable"
  reason?: CommercialDecisionReason
  pricing?: CommercialPricingFacts
  fx?: CommercialFxFact
  promotions?: CommercialPromotionFacts
  availability?: CommercialAvailabilityFact
  sellability?: CommercialSellabilityFact
  market?: CommercialMarketRef
  channel?: CommercialChannelRef
  validFrom?: string
  validUntil?: string
  traces?: CommercialDecisionTrace[]
  handles?: CommercialProviderHandle[]
}

export interface CommercialDecisionEvaluationContext {
  now?: Date
}

export interface CommercialPriceAvailabilityAdapter {
  id: string
  kind: CommercialAdapterRegistrationKind
  supports(input: CommercialDecisionInput): boolean | Promise<boolean>
  evaluate(
    input: CommercialDecisionInput,
    context: CommercialDecisionEvaluationContext,
  ): CommercialPriceAvailabilityResult | Promise<CommercialPriceAvailabilityResult>
}

export type EvaluateCommercialDecision = (
  input: CommercialDecisionInput,
  context?: CommercialDecisionEvaluationContext,
) => Promise<CommercialDecision>

export type CommercialDecisionErrorCode =
  | "duplicate_adapter"
  | "adapter_ambiguous"
  | "adapter_not_found"

export interface CommercialSnapshotTarget {
  kind:
    | "proposal-version"
    | "booking-draft"
    | "trip-component"
    | "catalog-quote"
    | "booking"
    | "custom"
  id: string
  idempotencyKey?: string
  facts?: Record<string, CommercialJson>
}

export interface CommercialSnapshotWriteInput {
  decision: CommercialDecision
  target: CommercialSnapshotTarget
  idempotencyKey?: string
}

export interface CommercialSnapshotRecord {
  snapshotId: string
  decisionId: string
  target: CommercialSnapshotTarget
  idempotencyKey?: string
  recordedAt: string
}

export interface CommercialSnapshotRepository {
  recordCommercialSnapshot(input: CommercialSnapshotWriteInput): Promise<CommercialSnapshotRecord>
}

export interface CommercialDecisionEvaluator {
  registerPriceAvailabilityAdapter(adapter: CommercialPriceAvailabilityAdapter): void
  evaluateCommercialDecision: EvaluateCommercialDecision
}
