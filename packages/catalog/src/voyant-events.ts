const catalogEntityEventPayloadSchema = {
  type: "object",
  required: ["entity_module", "entity_id", "occurred_at"],
  properties: {
    entity_module: { type: "string" },
    entity_id: { type: "string" },
    occurred_at: { type: "string" },
  },
  additionalProperties: false,
} as const

const catalogSourceEventPayloadSchema = {
  type: "object",
  required: ["source_kind", "source_connection_id", "occurred_at"],
  properties: {
    source_kind: { type: "string" },
    source_connection_id: { type: "string" },
    occurred_at: { type: "string" },
  },
  additionalProperties: false,
} as const

export const catalogBookingSessionCreatedPayloadSchema = {
  type: "object",
  required: ["bookingSessionId", "scope", "market", "channel"],
  properties: {
    bookingSessionId: { type: "string" },
    scope: { type: "string" },
    market: { type: "string" },
    channel: { const: "operator" },
  },
  additionalProperties: false,
} as const

export const catalogOverlayChangedPayloadSchema = {
  type: "object",
  required: [
    "entity_module",
    "entity_id",
    "field_path",
    "locale",
    "audience",
    "market",
    "occurred_at",
  ],
  properties: {
    entity_module: { type: "string" },
    entity_id: { type: "string" },
    node_kind: { type: "string" },
    node_key: { type: "string" },
    field_path: { type: "string" },
    locale: { type: "string" },
    audience: { type: "string" },
    market: { type: "string" },
    occurred_at: { type: "string", format: "date-time" },
  },
  additionalProperties: false,
} as const

const catalogDriftDetectedPayloadSchema = {
  type: "object",
  required: [
    "entity_module",
    "entity_id",
    "source_kind",
    "source_connection_id",
    "max_severity",
    "drifted_fields",
    "occurred_at",
  ],
  properties: {
    entity_module: { type: "string" },
    entity_id: { type: "string" },
    source_kind: { type: "string" },
    source_connection_id: { type: "string" },
    max_severity: { enum: ["none", "low", "medium", "high", "critical"] },
    drifted_fields: { type: "array", items: { type: "string" } },
    occurred_at: { type: "string", format: "date-time" },
  },
  additionalProperties: false,
} as const

export const catalogEventDeclarations = [
  {
    id: "@voyant-travel/catalog#event.booking-session-created",
    eventType: "catalog.booking-session.created",
    version: "1.0.0",
    visibility: "internal",
    audit: { sourceModule: "catalog", category: "domain" },
    payloadSchema: catalogBookingSessionCreatedPayloadSchema,
  },
  {
    id: "@voyant-travel/catalog#event.entity.created",
    eventType: "catalog.entity.created",
    version: "1.0.0",
    visibility: "external",
    audit: { sourceModule: "catalog", category: "domain" },
    payloadSchema: catalogEntityEventPayloadSchema,
  },
  {
    id: "@voyant-travel/catalog#event.entity.updated",
    eventType: "catalog.entity.updated",
    version: "1.0.0",
    visibility: "external",
    audit: { sourceModule: "catalog", category: "domain" },
    payloadSchema: catalogEntityEventPayloadSchema,
  },
  {
    id: "@voyant-travel/catalog#event.entity.archived",
    eventType: "catalog.entity.archived",
    version: "1.0.0",
    visibility: "external",
    audit: { sourceModule: "catalog", category: "domain" },
    payloadSchema: catalogEntityEventPayloadSchema,
  },
  {
    id: "@voyant-travel/catalog#event.entity.deleted",
    eventType: "catalog.entity.deleted",
    version: "1.0.0",
    visibility: "external",
    audit: { sourceModule: "catalog", category: "domain" },
    payloadSchema: catalogEntityEventPayloadSchema,
  },
  {
    id: "@voyant-travel/catalog#event.entity.price-changed",
    eventType: "catalog.entity.price.changed",
    version: "1.0.0",
    visibility: "external",
    audit: { sourceModule: "catalog", category: "domain" },
    payloadSchema: catalogEntityEventPayloadSchema,
  },
  {
    id: "@voyant-travel/catalog#event.entity.availability-changed",
    eventType: "catalog.entity.availability.changed",
    version: "1.0.0",
    visibility: "external",
    audit: { sourceModule: "catalog", category: "domain" },
    payloadSchema: catalogEntityEventPayloadSchema,
  },
  {
    id: "@voyant-travel/catalog#event.entity.drift-detected",
    eventType: "catalog.entity.drift.detected",
    version: "1.0.0",
    payloadSchema: catalogDriftDetectedPayloadSchema,
    visibility: "internal",
    audit: { sourceModule: "catalog", category: "domain" },
  },
  {
    id: "@voyant-travel/catalog#event.entity.reference-missing",
    eventType: "catalog.entity.reference.missing",
    version: "1.0.0",
    visibility: "external",
    audit: { sourceModule: "catalog", category: "domain" },
    payloadSchema: catalogEntityEventPayloadSchema,
  },
  {
    id: "@voyant-travel/catalog#event.booking.committed",
    eventType: "catalog.booking.committed",
    version: "1.0.0",
    visibility: "external",
    audit: { sourceModule: "catalog", category: "domain" },
    payloadSchema: catalogEntityEventPayloadSchema,
  },
  {
    id: "@voyant-travel/catalog#event.booking.cancelled",
    eventType: "catalog.booking.cancelled",
    version: "1.0.0",
    visibility: "external",
    audit: { sourceModule: "catalog", category: "domain" },
    payloadSchema: catalogEntityEventPayloadSchema,
  },
  {
    id: "@voyant-travel/catalog#event.source.disconnected",
    eventType: "catalog.source.disconnected",
    version: "1.0.0",
    visibility: "external",
    audit: { sourceModule: "catalog", category: "domain" },
    payloadSchema: catalogSourceEventPayloadSchema,
  },
  {
    id: "@voyant-travel/catalog#event.source.reconnected",
    eventType: "catalog.source.reconnected",
    version: "1.0.0",
    visibility: "external",
    audit: { sourceModule: "catalog", category: "domain" },
    payloadSchema: catalogSourceEventPayloadSchema,
  },
] as const

export const catalogWebhookDeclarations = [
  {
    id: "@voyant-travel/catalog#webhook.entity-created",
    direction: "outbound",
    eventId: "@voyant-travel/catalog#event.entity.created",
  },
  {
    id: "@voyant-travel/catalog#webhook.entity-updated",
    direction: "outbound",
    eventId: "@voyant-travel/catalog#event.entity.updated",
  },
  {
    id: "@voyant-travel/catalog#webhook.entity-archived",
    direction: "outbound",
    eventId: "@voyant-travel/catalog#event.entity.archived",
  },
  {
    id: "@voyant-travel/catalog#webhook.entity-deleted",
    direction: "outbound",
    eventId: "@voyant-travel/catalog#event.entity.deleted",
  },
  {
    id: "@voyant-travel/catalog#webhook.entity-price-changed",
    direction: "outbound",
    eventId: "@voyant-travel/catalog#event.entity.price-changed",
  },
  {
    id: "@voyant-travel/catalog#webhook.entity-availability-changed",
    direction: "outbound",
    eventId: "@voyant-travel/catalog#event.entity.availability-changed",
  },
  {
    id: "@voyant-travel/catalog#webhook.entity-reference-missing",
    direction: "outbound",
    eventId: "@voyant-travel/catalog#event.entity.reference-missing",
  },
  {
    id: "@voyant-travel/catalog#webhook.booking-committed",
    direction: "outbound",
    eventId: "@voyant-travel/catalog#event.booking.committed",
  },
  {
    id: "@voyant-travel/catalog#webhook.booking-cancelled",
    direction: "outbound",
    eventId: "@voyant-travel/catalog#event.booking.cancelled",
  },
  {
    id: "@voyant-travel/catalog#webhook.source-disconnected",
    direction: "outbound",
    eventId: "@voyant-travel/catalog#event.source.disconnected",
  },
  {
    id: "@voyant-travel/catalog#webhook.source-reconnected",
    direction: "outbound",
    eventId: "@voyant-travel/catalog#event.source.reconnected",
  },
] as const
