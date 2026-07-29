const bookingStatusValues = [
  "draft",
  "on_hold",
  "awaiting_payment",
  "confirmed",
  "in_progress",
  "completed",
  "expired",
  "cancelled",
] as const

const bookingEventIdentityProperties = {
  bookingId: { type: "string" },
  bookingNumber: { type: "string" },
  actorId: { type: ["string", "null"] },
} as const

/** Static payload schemas used by the import-cheap Bookings deployment manifest. */
export const availabilitySlotChangedPayloadSchema = {
  type: "object",
  required: ["slotId", "productId", "optionId", "startsAt", "remainingPax", "unlimited", "source"],
  properties: {
    slotId: { type: "string" },
    productId: { type: "string" },
    optionId: { type: ["string", "null"] },
    startsAt: { type: "string", format: "date-time" },
    remainingPax: { type: ["integer", "null"] },
    unlimited: { type: "boolean" },
    source: { enum: ["booking", "cancel", "expire", "modify", "manual", "refresh"] },
  },
  additionalProperties: false,
} as const

export const bookingConfirmedPayloadSchema = {
  type: "object",
  required: ["bookingId", "bookingNumber", "actorId"],
  properties: {
    ...bookingEventIdentityProperties,
    suppressNotifications: { type: "boolean" },
  },
  additionalProperties: false,
} as const

export const bookingExpiredPayloadSchema = {
  type: "object",
  required: ["bookingId", "bookingNumber", "cause", "actorId"],
  properties: {
    ...bookingEventIdentityProperties,
    cause: { enum: ["route", "sweep"] },
  },
  additionalProperties: false,
} as const

export const bookingCancelledPayloadSchema = {
  type: "object",
  required: ["bookingId", "bookingNumber", "previousStatus", "reason", "actorId"],
  properties: {
    ...bookingEventIdentityProperties,
    previousStatus: {
      enum: ["draft", "on_hold", "awaiting_payment", "confirmed", "in_progress"],
    },
    reason: { type: ["string", "null"] },
    suppressNotifications: { type: "boolean" },
  },
  additionalProperties: false,
} as const

export const bookingLifecyclePayloadSchema = {
  type: "object",
  required: ["bookingId", "bookingNumber", "actorId"],
  properties: bookingEventIdentityProperties,
  additionalProperties: false,
} as const

export const bookingStatusOverriddenPayloadSchema = {
  type: "object",
  required: ["bookingId", "bookingNumber", "fromStatus", "toStatus", "reason", "actorId"],
  properties: {
    ...bookingEventIdentityProperties,
    fromStatus: { enum: bookingStatusValues },
    toStatus: { enum: bookingStatusValues },
    reason: { type: "string" },
  },
  additionalProperties: false,
} as const

export const bookingRefundedPayloadSchema = {
  type: "object",
  required: [
    "bookingId",
    "bookingNumber",
    "previousStatus",
    "refundAmountCents",
    "reason",
    "actorId",
  ],
  properties: {
    ...bookingEventIdentityProperties,
    previousStatus: { enum: bookingStatusValues },
    refundAmountCents: { type: "integer" },
    reason: { type: "string" },
  },
  additionalProperties: false,
} as const
