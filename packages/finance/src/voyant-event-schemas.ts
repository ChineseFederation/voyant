/** Static payload schemas used by the import-cheap Finance deployment manifest. */
export const invoiceTypeSchema = { enum: ["invoice", "proforma", "credit_note"] } as const
export const invoiceStatusSchema = {
  enum: [
    "draft",
    "pending_external_allocation",
    "issued",
    "partially_paid",
    "paid",
    "overdue",
    "void",
  ],
} as const
export const renditionFormatSchema = { enum: ["html", "pdf", "xml", "json"] } as const
export const nullableStringSchema = { type: ["string", "null"] } as const

/**
 * Deliberately small projection used when an issued document leaves the
 * deployment through the remote-app webhook boundary. Apps hydrate the
 * current provider-neutral document by `invoiceId`; customer, line, routing,
 * and numbering details remain inside Finance until that authorized read.
 */
export const invoiceIssuanceExternalPayloadSchema = {
  type: "object",
  required: ["invoiceId", "invoiceType"],
  properties: {
    invoiceId: { type: "string" },
    invoiceType: { enum: ["invoice", "proforma"] },
    skipExternalSync: { type: "boolean" },
  },
  additionalProperties: false,
} as const

/** Minimal app-facing fact for a durable proforma-to-invoice conversion. */
export const invoiceProformaConvertedExternalPayloadSchema = {
  type: "object",
  required: ["invoiceId", "invoiceType", "occurredAt", "lineage"],
  properties: {
    invoiceId: { type: "string" },
    invoiceType: { enum: ["invoice"] },
    occurredAt: { type: "string", format: "date-time" },
    lineage: {
      type: "object",
      required: ["sourceDocumentId", "successorDocumentId"],
      properties: {
        sourceDocumentId: { type: "string" },
        successorDocumentId: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const

/** Minimal app-facing fact for a durable finance-document void. */
export const invoiceVoidedExternalPayloadSchema = {
  type: "object",
  required: ["invoiceId", "invoiceType", "occurredAt"],
  properties: {
    invoiceId: { type: "string" },
    invoiceType: invoiceTypeSchema,
    occurredAt: { type: "string", format: "date-time" },
  },
  additionalProperties: false,
} as const

/**
 * Minimal app-facing input for mirroring a durable native payment.
 *
 * The projection carries only the monetary facts an external accounting app
 * needs to create the corresponding provider payment and report cumulative
 * settlement evidence. Customer, booking, invoice-number, and free-text
 * reference fields remain private to Finance.
 */
export const invoicePaymentRecordedExternalPayloadSchema = {
  type: "object",
  required: [
    "invoiceId",
    "invoiceType",
    "invoiceCurrency",
    "invoiceTotalCents",
    "invoicePaidCents",
    "invoiceBalanceDueCents",
    "paymentId",
    "amountCents",
    "currency",
    "baseCurrency",
    "baseAmountCents",
    "paymentMethod",
    "paymentDate",
    "occurredAt",
  ],
  properties: {
    invoiceId: { type: "string" },
    invoiceType: invoiceTypeSchema,
    invoiceCurrency: { type: "string" },
    invoiceTotalCents: { type: "integer" },
    invoicePaidCents: { type: "integer" },
    invoiceBalanceDueCents: { type: "integer" },
    paymentId: { type: "string" },
    amountCents: { type: "integer" },
    currency: { type: "string" },
    baseCurrency: nullableStringSchema,
    baseAmountCents: { type: ["integer", "null"] },
    paymentMethod: {
      enum: [
        "bank_transfer",
        "credit_card",
        "debit_card",
        "cash",
        "cheque",
        "wallet",
        "direct_bill",
        "travel_credit",
        "other",
      ],
    },
    paymentDate: { type: "string" },
    occurredAt: { type: "string", format: "date-time" },
  },
  additionalProperties: false,
} as const

export const invoiceIssuedPayloadSchema = {
  type: "object",
  required: ["invoiceId", "invoiceNumber", "invoiceType", "bookingId", "totalCents", "currency"],
  properties: {
    invoiceId: { type: "string" },
    invoiceNumber: { type: "string" },
    invoiceType: invoiceTypeSchema,
    bookingId: nullableStringSchema,
    totalCents: { type: "integer" },
    currency: { type: "string" },
    baseCurrency: { type: "string" },
    fxRateSetId: { type: "string" },
    fxRate: { type: "number" },
    fxRateSource: { type: "string" },
    fxRateQuotedAt: { type: "string", format: "date-time" },
    fxRateValidUntil: { type: "string", format: "date-time" },
    fxCommissionBps: { type: "integer" },
    effectiveRate: { type: "number" },
    fxCommissionInvoiceMention: { type: "string" },
    convertedFromInvoiceId: nullableStringSchema,
    clientName: { type: "string" },
    clientEmail: nullableStringSchema,
    clientPhone: nullableStringSchema,
    clientAddress: nullableStringSchema,
    clientCity: nullableStringSchema,
    clientCounty: nullableStringSchema,
    clientCountry: nullableStringSchema,
    clientVatCode: nullableStringSchema,
    clientRegCom: nullableStringSchema,
    lineItems: {
      type: "array",
      items: {
        type: "object",
        required: ["description", "quantity", "unitPrice", "currency"],
        properties: {
          description: { type: "string" },
          quantity: { type: "number" },
          unitPrice: { type: "number" },
          currency: { type: "string" },
          bookingPaymentScheduleId: { type: "string" },
          scheduleType: { enum: ["deposit", "installment", "balance", "hold", "other"] },
          schedulePercent: { type: "number" },
          taxPercentage: { type: "number" },
          taxName: nullableStringSchema,
          taxRegimeCode: {
            type: ["string", "null"],
            enum: [
              "standard",
              "reduced",
              "exempt",
              "reverse_charge",
              "margin_scheme_art311",
              "zero_rated",
              "out_of_scope",
              "other",
              null,
            ],
          },
          isService: { type: "boolean" },
        },
        additionalProperties: false,
      },
    },
    bookingNumber: nullableStringSchema,
    issueDate: { type: "string" },
    dueDate: { type: "string" },
    externalAllocationRequired: { type: "boolean" },
    externalProvider: nullableStringSchema,
    externalConfigKey: nullableStringSchema,
    externalSeriesId: nullableStringSchema,
    externalPlaceholderNumber: nullableStringSchema,
    skipExternalSync: { type: "boolean" },
  },
  additionalProperties: false,
} as const

export const invoiceProformaConvertedPayloadSchema = {
  ...invoiceIssuedPayloadSchema,
  required: [
    ...invoiceIssuedPayloadSchema.required,
    "id",
    "proformaId",
    "proformaInvoiceNumber",
    "occurredAt",
    "lineage",
  ],
  properties: {
    ...invoiceIssuedPayloadSchema.properties,
    id: { type: "string" },
    proformaId: { type: "string" },
    proformaInvoiceNumber: { type: "string" },
    occurredAt: { type: "string", format: "date-time" },
    lineage: invoiceProformaConvertedExternalPayloadSchema.properties.lineage,
  },
} as const

export const invoiceVoidedPayloadSchema = {
  type: "object",
  required: [
    "invoiceId",
    "invoiceNumber",
    "invoiceType",
    "bookingId",
    "totalCents",
    "currency",
    "reason",
    "voidedAt",
    "occurredAt",
  ],
  properties: {
    invoiceId: { type: "string" },
    invoiceNumber: { type: "string" },
    invoiceType: invoiceTypeSchema,
    bookingId: nullableStringSchema,
    totalCents: { type: "integer" },
    currency: { type: "string" },
    reason: nullableStringSchema,
    voidedAt: { type: "string", format: "date-time" },
    occurredAt: { type: "string", format: "date-time" },
  },
  additionalProperties: false,
} as const

export const invoiceSettledPayloadSchema = {
  type: "object",
  required: [
    "invoiceId",
    "paymentId",
    "provider",
    "newlyAppliedAmountCents",
    "paidCents",
    "balanceDueCents",
  ],
  properties: {
    invoiceId: { type: "string" },
    paymentId: { type: "string" },
    provider: { type: "string" },
    newlyAppliedAmountCents: { type: "integer" },
    paidCents: { type: "integer" },
    balanceDueCents: { type: "integer" },
  },
  additionalProperties: false,
} as const

export const invoiceRenderedPayloadSchema = {
  type: "object",
  required: [
    "invoiceId",
    "invoiceStatus",
    "invoiceType",
    "renditionId",
    "format",
    "storageKey",
    "contentType",
    "byteSize",
    "contentHash",
  ],
  properties: {
    invoiceId: { type: "string" },
    invoiceStatus: invoiceStatusSchema,
    invoiceType: invoiceTypeSchema,
    renditionId: { type: "string" },
    format: renditionFormatSchema,
    storageKey: nullableStringSchema,
    contentType: { type: "string" },
    byteSize: { type: ["integer", "null"] },
    contentHash: nullableStringSchema,
  },
  additionalProperties: false,
} as const

export const invoiceDocumentGeneratedPayloadSchema = {
  type: "object",
  required: [
    "invoiceId",
    "invoiceStatus",
    "invoiceType",
    "renditionId",
    "format",
    "renderedBodyFormat",
    "regenerated",
  ],
  properties: {
    invoiceId: { type: "string" },
    invoiceStatus: invoiceStatusSchema,
    invoiceType: invoiceTypeSchema,
    renditionId: { type: "string" },
    format: renditionFormatSchema,
    renderedBodyFormat: { enum: ["html", "markdown", "lexical_json"] },
    regenerated: { type: "boolean" },
  },
  additionalProperties: false,
} as const

export const invoicePaymentRecordedPayloadSchema = {
  type: "object",
  required: [
    "invoiceId",
    "invoiceNumber",
    "invoiceType",
    "bookingId",
    "invoiceCurrency",
    "invoiceTotalCents",
    "invoicePaidCents",
    "invoiceBalanceDueCents",
    "paymentId",
    "amountCents",
    "currency",
    "baseCurrency",
    "baseAmountCents",
    "paymentMethod",
    "status",
    "referenceNumber",
    "paymentDate",
    "occurredAt",
  ],
  properties: {
    invoiceId: { type: "string" },
    invoiceNumber: { type: "string" },
    invoiceType: invoiceTypeSchema,
    bookingId: nullableStringSchema,
    invoiceCurrency: { type: "string" },
    invoiceTotalCents: { type: "integer" },
    invoicePaidCents: { type: "integer" },
    invoiceBalanceDueCents: { type: "integer" },
    paymentId: { type: "string" },
    amountCents: { type: "integer" },
    currency: { type: "string" },
    baseCurrency: nullableStringSchema,
    baseAmountCents: { type: ["integer", "null"] },
    paymentMethod: {
      enum: [
        "bank_transfer",
        "credit_card",
        "debit_card",
        "cash",
        "cheque",
        "wallet",
        "direct_bill",
        "travel_credit",
        "other",
      ],
    },
    status: { enum: ["pending", "completed", "failed", "refunded"] },
    referenceNumber: nullableStringSchema,
    paymentDate: { type: "string" },
    occurredAt: { type: "string", format: "date-time" },
  },
  additionalProperties: false,
} as const

export const paymentCompletedPayloadSchema = {
  type: "object",
  required: [
    "paymentSessionId",
    "targetType",
    "targetId",
    "bookingId",
    "legacyOrderId",
    "invoiceId",
    "bookingPaymentScheduleId",
    "bookingGuaranteeId",
    "amountCents",
    "currency",
    "provider",
  ],
  properties: {
    paymentSessionId: { type: "string" },
    targetType: {
      enum: [
        "booking",
        "order",
        "invoice",
        "booking_payment_schedule",
        "booking_guarantee",
        "flight_order",
        "other",
      ],
    },
    targetId: nullableStringSchema,
    bookingId: nullableStringSchema,
    legacyOrderId: nullableStringSchema,
    invoiceId: nullableStringSchema,
    bookingPaymentScheduleId: nullableStringSchema,
    bookingGuaranteeId: nullableStringSchema,
    amountCents: { type: "integer" },
    currency: { type: "string" },
    provider: nullableStringSchema,
  },
  additionalProperties: false,
} as const

export const bookingCreatedPayloadSchema = {
  type: "object",
  required: [
    "bookingId",
    "bookingNumber",
    "productId",
    "travelerCount",
    "paymentScheduleCount",
    "travelCreditRedeemedCents",
    "groupId",
    "documentGeneration",
    "createdByUserId",
    "occurredAt",
  ],
  properties: {
    bookingId: { type: "string" },
    bookingNumber: { type: "string" },
    productId: { type: "string" },
    travelerCount: { type: "integer" },
    paymentScheduleCount: { type: "integer" },
    travelCreditRedeemedCents: { type: ["integer", "null"] },
    groupId: nullableStringSchema,
    documentGeneration: {
      type: "object",
      required: ["contractDocument", "invoiceDocument", "invoiceType"],
      properties: {
        contractDocument: { type: "boolean" },
        invoiceDocument: { type: "boolean" },
        invoiceType: { enum: ["invoice", "proforma"] },
      },
      additionalProperties: false,
    },
    createdByUserId: nullableStringSchema,
    occurredAt: { type: "string", format: "date-time" },
    suppressNotifications: { type: "boolean" },
  },
  additionalProperties: false,
} as const

export const bookingConfirmedPayloadSchema = {
  type: "object",
  required: ["bookingId", "bookingNumber", "actorId"],
  properties: {
    bookingId: { type: "string" },
    bookingNumber: { type: "string" },
    actorId: nullableStringSchema,
    suppressNotifications: { type: "boolean" },
  },
  additionalProperties: false,
} as const

export const bookingDualCreatedPayloadSchema = {
  type: "object",
  required: [
    "groupId",
    "primaryBookingId",
    "secondaryBookingId",
    "productId",
    "createdByUserId",
    "occurredAt",
  ],
  properties: {
    groupId: { type: "string" },
    primaryBookingId: { type: "string" },
    secondaryBookingId: { type: "string" },
    productId: { type: "string" },
    createdByUserId: nullableStringSchema,
    occurredAt: { type: "string", format: "date-time" },
  },
  additionalProperties: false,
} as const

export const bookingCreateRejectedPayloadSchema = {
  type: "object",
  required: [
    "reason",
    "productId",
    "optionId",
    "slotId",
    "bookingNumber",
    "mismatchCount",
    "mismatches",
    "createdByUserId",
    "occurredAt",
  ],
  properties: {
    reason: { const: "payload_resolver_mismatch" },
    productId: { type: "string" },
    optionId: nullableStringSchema,
    slotId: nullableStringSchema,
    bookingNumber: { type: "string" },
    mismatchCount: { type: "integer" },
    mismatches: {
      type: "array",
      items: {
        type: "object",
        required: ["kind", "optionUnitId", "submittedQuantity", "resolvedQuantity"],
        properties: {
          kind: { enum: ["qty", "missing", "extra"] },
          optionUnitId: { type: "string" },
          submittedQuantity: { type: "number" },
          resolvedQuantity: { type: "number" },
        },
        additionalProperties: false,
      },
    },
    createdByUserId: nullableStringSchema,
    occurredAt: { type: "string", format: "date-time" },
  },
  additionalProperties: false,
} as const

export const bookingContractDocumentRequestedPayloadSchema = {
  type: "object",
  required: ["bookingId", "bookingNumber", "createdByUserId", "occurredAt"],
  properties: {
    bookingId: { type: "string" },
    bookingNumber: { type: "string" },
    createdByUserId: nullableStringSchema,
    occurredAt: { type: "string", format: "date-time" },
  },
  additionalProperties: false,
} as const

export const bookingPaymentSchedulePaidPayloadSchema = {
  type: "object",
  required: [
    "bookingId",
    "bookingPaymentScheduleId",
    "paymentSessionId",
    "paymentId",
    "scheduleType",
    "amountCents",
    "currency",
    "provider",
  ],
  properties: {
    bookingId: { type: "string" },
    bookingPaymentScheduleId: { type: "string" },
    paymentSessionId: { type: "string" },
    paymentId: nullableStringSchema,
    scheduleType: { enum: ["deposit", "installment", "balance", "hold", "other"] },
    amountCents: { type: "integer" },
    currency: { type: "string" },
    provider: nullableStringSchema,
  },
  additionalProperties: false,
} as const
