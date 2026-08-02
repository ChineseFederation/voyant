export const productPublicationChangedEventPayloadSchema = {
  type: "object",
  properties: {
    productId: { type: "string" },
    channelId: { type: "string" },
    publicationId: { type: ["string", "null"] },
    operation: {
      type: "string",
      enum: ["created", "updated", "deleted"],
    },
    channelKind: { type: ["string", "null"] },
    channelStatus: { type: ["string", "null"] },
  },
  required: [
    "productId",
    "channelId",
    "publicationId",
    "operation",
    "channelKind",
    "channelStatus",
  ],
  additionalProperties: false,
} as const

export const channelProductMappingChangedEventPayloadSchema = {
  type: "object",
  properties: {
    productId: { type: "string" },
    channelId: { type: "string" },
    mappingId: { type: ["string", "null"] },
    previousActive: { type: ["boolean", "null"] },
    nextActive: { type: ["boolean", "null"] },
    operation: {
      type: "string",
      enum: ["created", "updated", "deleted", "activated", "deactivated"],
    },
    channelKind: { type: ["string", "null"] },
    channelStatus: { type: ["string", "null"] },
  },
  required: [
    "productId",
    "channelId",
    "mappingId",
    "previousActive",
    "nextActive",
    "operation",
    "channelKind",
    "channelStatus",
  ],
  additionalProperties: false,
} as const

export const supplierLifecycleEventPayloadSchema = {
  type: "object",
  properties: { id: { type: "string" } },
  required: ["id"],
  additionalProperties: false,
} as const

export const channelLifecycleEventPayloadSchema = {
  type: "object",
  properties: { id: { type: "string" } },
  required: ["id"],
  additionalProperties: false,
} as const

export const productSupplierReassignedEventPayloadSchema = {
  type: "object",
  properties: {
    productId: { type: "string" },
    previousSupplierId: { type: ["string", "null"] },
    nextSupplierId: { type: ["string", "null"] },
  },
  required: ["productId"],
  additionalProperties: false,
} as const
