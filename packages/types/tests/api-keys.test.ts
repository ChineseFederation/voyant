import { describe, expect, it } from "vitest"

import {
  type AccessCatalog,
  areKnownPermissions,
  assertKnownPermissions,
  formatApiKeyPermissionLabel,
  hasApiKeyPermission,
  UnknownApiKeyPermissionError,
} from "../src/api-keys.js"

const selectedCatalog: AccessCatalog = {
  resources: [
    {
      id: "bookings",
      unitId: "@voyant-travel/bookings",
      resource: "bookings",
      label: "Bookings",
      description: "Bookings",
      wildcard: "allow",
      actions: [
        { action: "read", label: "Read", description: "Read" },
        { action: "write", label: "Write", description: "Write" },
      ],
    },
    {
      id: "bookings-pii",
      unitId: "@voyant-travel/bookings",
      resource: "bookings-pii",
      label: "Booking PII",
      description: "Booking PII",
      wildcard: "explicit-resource",
      actions: [{ action: "read", label: "Read", description: "Read" }],
    },
    {
      id: "catalog",
      unitId: "@voyant-travel/catalog",
      resource: "catalog",
      label: "Catalog",
      description: "Catalog",
      wildcard: "allow",
      actions: [
        { action: "read", label: "Read", description: "Read" },
        { action: "search", label: "Search", description: "Search" },
      ],
    },
    {
      id: "finance",
      unitId: "@voyant-travel/finance",
      resource: "finance",
      label: "Finance",
      description: "Finance",
      wildcard: "allow",
      actions: [
        { action: "read", label: "Read", description: "Read" },
        { action: "refund", label: "Refund", description: "Refund" },
        { action: "void", label: "Void", description: "Void" },
      ],
      legacyActions: ["chargeback"],
    },
    {
      id: "notifications",
      unitId: "@voyant-travel/notifications",
      resource: "notifications",
      label: "Notifications",
      description: "Notifications",
      wildcard: "allow",
      actions: [
        { action: "read", label: "Read", description: "Read" },
        {
          action: "send",
          label: "Send",
          description: "Send",
          wildcard: "explicit",
        },
      ],
    },
  ],
  presets: [],
}

describe("selected access catalog permission semantics", () => {
  it("excludes explicit resources from wildcard grants", () => {
    expect(hasApiKeyPermission({ "*": ["*"] }, "bookings-pii", "read", selectedCatalog)).toBe(false)
    expect(
      hasApiKeyPermission({ "bookings-pii": ["read"] }, "bookings-pii", "read", selectedCatalog),
    ).toBe(true)
  })

  it("requires exact grants for explicit actions", () => {
    expect(hasApiKeyPermission({ "*": ["*"] }, "notifications", "send", selectedCatalog)).toBe(
      false,
    )
    expect(
      hasApiKeyPermission({ notifications: ["send"] }, "notifications", "send", selectedCatalog),
    ).toBe(true)
    expect(
      hasApiKeyPermission({ notifications: ["*"] }, "notifications", "read", selectedCatalog),
    ).toBe(true)
  })
})

describe("assertKnownPermissions", () => {
  it("accepts selected resources, legacy actions, and wildcards", () => {
    expect(() =>
      assertKnownPermissions(
        { bookings: ["read"], finance: ["refund", "void", "chargeback"], "*": ["read"] },
        selectedCatalog,
      ),
    ).not.toThrow()
    expect(() => assertKnownPermissions({ catalog: ["*"] }, selectedCatalog)).not.toThrow()
  })

  it("rejects resources and actions absent from the selected graph", () => {
    expect(() => assertKnownPermissions({ bananas: ["read"] }, selectedCatalog)).toThrow(
      UnknownApiKeyPermissionError,
    )
    expect(areKnownPermissions({ bananas: ["read"] }, selectedCatalog)).toBe(false)
    expect(() => assertKnownPermissions({ bookings: ["frobnicate"] }, selectedCatalog)).toThrow(
      UnknownApiKeyPermissionError,
    )
    expect(() => assertKnownPermissions({ bookings: ["send"] }, selectedCatalog)).toThrow(
      UnknownApiKeyPermissionError,
    )
  })

  it("rejects the retired bookings:cancel legacy action", () => {
    expect(() => assertKnownPermissions({ bookings: ["cancel"] }, selectedCatalog)).toThrow(
      UnknownApiKeyPermissionError,
    )
  })
})

describe("formatApiKeyPermissionLabel", () => {
  it.each([
    ["finance-documents:read", "Read finance documents"],
    ["finance-document-artifacts:write", "Write finance document artifacts"],
    ["provider-connections:manage", "Manage provider connections"],
    ["invoice-issuance:execute", "Execute invoice issuance"],
    ["finance-documents:sync-now", "Sync now finance documents"],
    ["*:read", "Wildcard read access"],
    ["finance-documents:*", "Wildcard access to finance documents"],
    ["*", "Wildcard access"],
    ["*:*", "Wildcard access"],
    ["finance-documents", "Access finance documents"],
  ])("formats %s as host-owned consent copy", (scope, label) => {
    expect(formatApiKeyPermissionLabel(scope)).toBe(label)
  })

  it("normalizes surrounding whitespace and casing", () => {
    expect(formatApiKeyPermissionLabel("  Finance-Documents:READ  ")).toBe("Read finance documents")
  })
})
