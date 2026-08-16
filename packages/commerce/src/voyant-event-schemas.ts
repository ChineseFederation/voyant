export const promotionChangedPayloadSchema = {
  type: "object",
  required: ["offerId", "source", "affected"],
  properties: {
    offerId: { type: "string" },
    source: { enum: ["created", "updated", "deleted", "expired"] },
    affected: {
      oneOf: [
        {
          type: "object",
          required: ["kind", "productIds"],
          properties: {
            kind: { const: "products" },
            productIds: { type: "array", items: { type: "string" } },
          },
          additionalProperties: false,
        },
        {
          type: "object",
          required: ["kind"],
          properties: { kind: { const: "all" } },
          additionalProperties: false,
        },
      ],
    },
  },
  additionalProperties: false,
} as const

export const pricingRuleChangedPayloadSchema = {
  type: "object",
  required: ["productId", "ruleId", "kind", "source"],
  properties: {
    productId: { type: "string" },
    ruleId: { type: "string" },
    kind: { enum: ["option-rule", "option-unit-rule"] },
    source: { enum: ["created", "updated", "deleted"] },
  },
  additionalProperties: false,
} as const

export const inquiryCreatedPayloadSchema = {
  type: "object",
  required: ["proposalId", "bookingId", "bookingNumber", "pipelineId", "stageId"],
  properties: {
    proposalId: { type: ["string", "null"] },
    bookingId: { type: "string" },
    bookingNumber: { type: "string" },
    pipelineId: { type: "string" },
    stageId: { type: "string" },
  },
  additionalProperties: false,
} as const

export const checkoutFinalizedPayloadSchema = {
  type: "object",
  required: ["bookingId", "paymentSessionId"],
  properties: {
    bookingId: { type: "string" },
    paymentSessionId: { type: "string" },
  },
  additionalProperties: false,
} as const

/**
 * The shopper's money is captured and no Booking came out of it.
 *
 * Emitted when settling a paid Booking Session raises, which is the only
 * moment anything in the system knows the two facts together. Until this
 * existed the state was discoverable solely by querying `payment_sessions`
 * for `status = 'paid' AND booking_id IS NULL` — three live sessions on one
 * tenant were found that way, one of them a real customer with a paid trip
 * and no booking (voyant#4733).
 *
 * `reason` is the settlement error's message, which is a stable machine
 * string (`booking_session_settlement_commit_rejected:<outcome>`), not prose.
 */
export const bookingSessionSettlementFailedPayloadSchema = {
  type: "object",
  required: ["bookingSessionId", "paymentSessionId", "reason"],
  properties: {
    bookingSessionId: { type: "string" },
    paymentSessionId: { type: "string" },
    reason: { type: "string" },
  },
  additionalProperties: false,
} as const
