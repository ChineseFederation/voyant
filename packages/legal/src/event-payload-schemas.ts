const nullableStringSchema = {
  anyOf: [{ type: "string" }, { type: "null" }],
} as const

const contractStatusValues = [
  "draft",
  "issued",
  "sent",
  "signed",
  "executed",
  "expired",
  "void",
] as const

const contractScopeValues = ["customer", "supplier", "partner", "channel", "other"] as const

const legalTargetKindValues = [
  "booking",
  "quote_version",
  "program",
  "product",
  "inventory_item",
  "supplier_channel_relationship",
  "provider_source_ref",
] as const

function contractLifecyclePayloadSchema(
  transition: "issued" | "sent" | "signed" | "executed" | "voided",
  previousStages: readonly (typeof contractStatusValues)[number][],
  stage: (typeof contractStatusValues)[number],
) {
  return {
    type: "object",
    required: [
      "contractId",
      "contractNumber",
      "scope",
      "previousStage",
      "stage",
      "transition",
      "occurredAt",
      "personId",
      "organizationId",
      "supplierId",
      "channelId",
      "bookingId",
      "targetKind",
      "targetId",
      "targetProvider",
      "targetSourceRef",
      "legacyTransactionOfferId",
      "legacyTransactionOrderId",
    ],
    properties: {
      contractId: { type: "string" },
      contractNumber: nullableStringSchema,
      scope: { type: "string", enum: contractScopeValues },
      previousStage: { type: "string", enum: previousStages },
      stage: { type: "string", const: stage },
      transition: { type: "string", const: transition },
      occurredAt: { type: "string", format: "date-time" },
      personId: nullableStringSchema,
      organizationId: nullableStringSchema,
      supplierId: nullableStringSchema,
      channelId: nullableStringSchema,
      bookingId: nullableStringSchema,
      targetKind: {
        anyOf: [{ type: "string", enum: legalTargetKindValues }, { type: "null" }],
      },
      targetId: nullableStringSchema,
      targetProvider: nullableStringSchema,
      targetSourceRef: nullableStringSchema,
      legacyTransactionOfferId: nullableStringSchema,
      legacyTransactionOrderId: nullableStringSchema,
      delivery: {
        anyOf: [
          {
            type: "object",
            required: ["recipientEmail", "subject", "message"],
            properties: {
              recipientEmail: nullableStringSchema,
              recipient: nullableStringSchema,
              channel: {
                anyOf: [{ type: "string", enum: ["email", "sms", "whatsapp"] }, { type: "null" }],
              },
              revision: { anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }] },
              notificationsSuppressed: { type: "boolean" },
              subject: nullableStringSchema,
              message: nullableStringSchema,
            },
            additionalProperties: false,
          },
          { type: "null" },
        ],
      },
    },
    additionalProperties: false,
  } as const
}

export const contractIssuedEventPayloadSchema = contractLifecyclePayloadSchema(
  "issued",
  ["draft"],
  "issued",
)

export const contractSentEventPayloadSchema = contractLifecyclePayloadSchema(
  "sent",
  ["issued", "sent"],
  "sent",
)

export const contractSignedEventPayloadSchema = contractLifecyclePayloadSchema(
  "signed",
  ["sent"],
  "signed",
)

export const contractExecutedEventPayloadSchema = contractLifecyclePayloadSchema(
  "executed",
  ["signed"],
  "executed",
)

export const contractVoidedEventPayloadSchema = contractLifecyclePayloadSchema(
  "voided",
  ["draft", "issued", "sent", "signed", "executed", "expired"],
  "void",
)

export const contractDocumentGeneratedEventPayloadSchema = {
  type: "object",
  required: [
    "contractId",
    "contractStatus",
    "attachmentId",
    "attachmentKind",
    "attachmentName",
    "renderedBodyFormat",
    "regenerated",
  ],
  properties: {
    contractId: { type: "string" },
    contractStatus: { type: "string", enum: contractStatusValues },
    attachmentId: { type: "string" },
    attachmentKind: { type: "string" },
    attachmentName: { type: "string" },
    renderedBodyFormat: { type: "string", enum: ["markdown", "html", "lexical_json"] },
    regenerated: { type: "boolean" },
  },
  additionalProperties: false,
} as const
