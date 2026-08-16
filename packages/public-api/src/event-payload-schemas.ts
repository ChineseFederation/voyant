const nullableStringSchema = {
  anyOf: [{ type: "string" }, { type: "null" }],
} as const

export const customerSignalCreatedEventPayloadSchema = {
  type: "object",
  required: ["id", "personId", "kind", "source", "status", "intake"],
  properties: {
    id: { type: "string" },
    personId: { type: "string" },
    kind: {
      type: "string",
      enum: ["wishlist", "notify", "inquiry", "request_offer", "referral"],
    },
    source: {
      type: "string",
      enum: ["form", "phone", "admin", "abandoned_cart", "website", "booking"],
    },
    status: {
      type: "string",
      enum: ["new", "contacted", "qualified", "converted", "lost", "expired"],
    },
    productId: nullableStringSchema,
    optionUnitId: nullableStringSchema,
    sourceSubmissionId: nullableStringSchema,
    intake: {
      oneOf: [
        {
          type: "object",
          required: ["surface", "type"],
          properties: {
            surface: { type: "string", const: "storefront" },
            type: { type: "string", const: "lead" },
          },
          additionalProperties: false,
        },
        {
          type: "object",
          required: ["surface", "type", "doubleOptIn"],
          properties: {
            surface: { type: "string", const: "storefront" },
            type: { type: "string", const: "newsletter" },
            doubleOptIn: { type: "string", enum: ["not_configured", "requested"] },
          },
          additionalProperties: false,
        },
      ],
    },
  },
  additionalProperties: false,
} as const
