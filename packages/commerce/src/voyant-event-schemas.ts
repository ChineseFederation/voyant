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
