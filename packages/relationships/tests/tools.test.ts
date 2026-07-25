import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"
import {
  RELATIONSHIPS_ORGANIZATION_HANDLER_ACTION_POLICY,
  RELATIONSHIPS_PERSON_HANDLER_ACTION_POLICY,
} from "../src/created-target-policy.js"
import {
  createOrganizationTool,
  createPersonTool,
  type RelationshipsToolServices,
  relationshipsTools,
} from "../src/tools.js"

function ctx(
  overrides: Partial<RelationshipsToolServices> = {},
  contextOverrides: Partial<ToolContext> = {},
): ToolContext & { relationships: RelationshipsToolServices } {
  const unavailable = async () => {
    throw new Error("Unexpected Relationships tool service call")
  }
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "default",
    resolverScope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" },
    ...contextOverrides,
    relationships: {
      listPeople: unavailable,
      getPersonById: unavailable,
      createPerson: unavailable,
      updatePerson: unavailable,
      listOrganizations: unavailable,
      getOrganizationById: unavailable,
      createOrganization: unavailable,
      updateOrganization: unavailable,
      listNotes: unavailable,
      addNote: unavailable,
      updateNote: unavailable,
      listContactMethods: unavailable,
      addContactMethod: unavailable,
      updateContactMethod: unavailable,
      listAddresses: unavailable,
      addAddress: unavailable,
      updateAddress: unavailable,
      ...overrides,
    },
  }
}

function registry() {
  const registry = createToolRegistry()
  for (const tool of relationshipsTools) {
    if (tool === createPersonTool) {
      registry.register(tool, {
        actionPolicy: RELATIONSHIPS_PERSON_HANDLER_ACTION_POLICY.actionPolicy,
      })
    } else if (tool === createOrganizationTool) {
      registry.register(tool, {
        actionPolicy: RELATIONSHIPS_ORGANIZATION_HANDLER_ACTION_POLICY.actionPolicy,
      })
    } else {
      registry.register(tool)
    }
  }
  return registry
}

function personHandlerActionPolicy(idempotencyKey: string) {
  return {
    ...RELATIONSHIPS_PERSON_HANDLER_ACTION_POLICY,
    actionPolicy: {
      ...RELATIONSHIPS_PERSON_HANDLER_ACTION_POLICY.actionPolicy,
      enforcement: "handler" as const,
      invocation: {
        controlField: "_voyant" as const,
        requiredFields: ["idempotencyKey"],
        optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
        fingerprintAlgorithm: "action-ledger-command-v1" as const,
      },
    },
    invocation: { idempotencyKey },
  } satisfies NonNullable<ToolContext["handlerActionPolicy"]>
}

const timestamp = new Date("2026-07-15T08:00:00.000Z")

function person(overrides: Record<string, unknown> = {}) {
  return {
    id: "pers_1",
    organizationId: null,
    firstName: "Ana",
    middleName: null,
    lastName: "Popescu",
    gender: null,
    jobTitle: null,
    relation: "client",
    preferredLanguage: "ro",
    preferredCurrency: "RON",
    ownerId: null,
    status: "active",
    source: null,
    sourceRef: null,
    tags: ["repeat"],
    customFields: {},
    dateOfBirth: null,
    notes: null,
    accessibilityEncrypted: { ciphertext: "must-not-leak" },
    dietaryEncrypted: null,
    loyaltyEncrypted: null,
    insuranceEncrypted: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    email: "ana@example.com",
    phone: null,
    website: null,
    ...overrides,
  }
}

function organization(overrides: Record<string, unknown> = {}) {
  return {
    id: "org_1",
    name: "Example Travel",
    legalName: null,
    website: null,
    taxId: "RO123",
    industry: null,
    relation: "client",
    ownerId: null,
    defaultCurrency: "RON",
    preferredLanguage: "ro",
    paymentTerms: null,
    status: "active",
    source: null,
    sourceRef: null,
    tags: [],
    customFields: {},
    notes: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    ...overrides,
  }
}

function note(overrides: Record<string, unknown> = {}) {
  return {
    id: "pnot_1",
    personId: "pers_1",
    authorId: "user_1",
    content: "Prefers aisle seats",
    createdAt: timestamp,
    ...overrides,
  }
}

function contactMethod(overrides: Record<string, unknown> = {}) {
  return {
    id: "idcp_1",
    entityType: "person",
    entityId: "pers_1",
    kind: "email",
    label: "primary",
    value: "ana@example.com",
    normalizedValue: "ana@example.com",
    isPrimary: true,
    notes: null,
    metadata: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

function address(overrides: Record<string, unknown> = {}) {
  return {
    id: "iadr_1",
    entityType: "organization",
    entityId: "org_1",
    label: "billing",
    fullText: null,
    line1: "Calea Victoriei 1",
    line2: null,
    city: "Sector 1",
    region: "Bucuresti",
    postalCode: null,
    country: "RO",
    latitude: null,
    longitude: null,
    timezone: null,
    isPrimary: true,
    notes: null,
    metadata: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

describe("relationships (crm) tools", () => {
  it("registers 20 stable staff-only lifecycle capabilities with typed output schemas", () => {
    const manifest = registry().list()
    expect(manifest.map((tool) => tool.name).sort()).toEqual([
      "add_organization_address",
      "add_organization_contact_method",
      "add_organization_note",
      "add_person_address",
      "add_person_contact_method",
      "add_person_note",
      "create_organization",
      "create_person",
      "get_organization",
      "get_person",
      "list_organizations",
      "list_people",
      "list_relationship_addresses",
      "list_relationship_contact_methods",
      "list_relationship_notes",
      "update_organization",
      "update_person",
      "update_relationship_address",
      "update_relationship_contact_method",
      "update_relationship_note",
    ])
    for (const tool of manifest) {
      expect(tool.capabilityId).toBe(
        `@voyant-travel/relationships#tool.${tool.name.replaceAll("_", "-")}`,
      )
      expect(tool.owner).toBe("@voyant-travel/relationships")
      expect(tool.capabilityVersion).toBe("v1")
      expect(tool.audience).toEqual({ source: "grant", allowed: ["staff"] })
      expect(tool.outputSchema).not.toHaveProperty("x-voyant-schema-quality")
    }
    expect(manifest.find((tool) => tool.name === "create_organization")).toMatchObject({
      tier: "write",
      deploymentRisk: "medium",
    })
    expect(manifest.find((tool) => tool.name === "list_relationship_addresses")).toMatchObject({
      tier: "sensitive",
      deploymentRisk: "high",
      requiredScopes: ["crm:read"],
    })
    for (const tool of manifest) {
      expect(tool.aliases ?? []).toEqual([])
    }
  })

  it("does not export deprecated generic relationship add Tools", async () => {
    const toolsModule = await import("../src/tools.js")
    expect(toolsModule).not.toHaveProperty("addRelationshipNoteTool")
    expect(toolsModule).not.toHaveProperty("addRelationshipContactMethodTool")
    expect(toolsModule).not.toHaveProperty("addRelationshipAddressTool")
    expect(relationshipsTools.some((tool) => tool.name.startsWith("add_relationship_"))).toBe(false)
  })

  it("normalizes typed person reads and strips encrypted profile envelopes", async () => {
    const result = await registry().dispatch<{ data: Array<Record<string, unknown>> }>(
      "list_people",
      { search: "Popescu" },
      ctx({
        async listPeople(query) {
          return { data: [person()], total: 1, limit: query.limit, offset: query.offset }
        },
      }),
    )
    expect(result.data[0]).toMatchObject({
      id: "pers_1",
      createdAt: timestamp.toISOString(),
      email: "ana@example.com",
    })
    expect(result.data[0]).not.toHaveProperty("accessibilityEncrypted")
  })

  it("requires a real contact and dispatches handler-owned person creation", async () => {
    await expect(
      registry().dispatch(
        "create_person",
        { firstName: "Ana", lastName: "Popescu" },
        ctx({}, { handlerActionPolicy: personHandlerActionPolicy("person-invalid-contact") }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" })

    let forwarded: unknown
    const result = await registry().dispatch(
      "create_person",
      { firstName: "Ana", lastName: "Popescu", email: "ana@example.com" },
      ctx(
        {
          async createPerson(input, admitted) {
            forwarded = input
            expect(admitted.invocation.idempotencyKey).toBe("person-create-1")
            return { status: "created", person: { id: "pers_1" }, replayed: false }
          },
        },
        {
          handlerActionPolicy: personHandlerActionPolicy("person-create-1"),
        },
      ),
    )
    expect(forwarded).toMatchObject({
      firstName: "Ana",
      lastName: "Popescu",
      email: "ana@example.com",
      status: "active",
      tags: [],
    })
    expect(forwarded).not.toHaveProperty("allowDuplicateName")
    expect(result).toEqual({
      status: "created",
      person: { id: "pers_1" },
      replayed: false,
    })
  })

  it.each([
    false,
    true,
  ])("rejects removed allowDuplicateName=%s instead of silently changing its meaning", async (allowDuplicateName) => {
    await expect(
      registry().dispatch(
        "create_person",
        {
          firstName: "Ana",
          lastName: "Popescu",
          email: "ana@example.com",
          allowDuplicateName,
        },
        ctx(
          {},
          {
            handlerActionPolicy: personHandlerActionPolicy(
              `person-removed-duplicate-${allowDuplicateName}`,
            ),
          },
        ),
      ),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: expect.stringContaining("Use `list_people` first"),
    })
  })

  it("supports organization creation with a billing address and lifecycle updates", async () => {
    let listed: unknown
    await registry().dispatch(
      "list_organizations",
      { vatNumber: "RO123" },
      ctx({
        async listOrganizations(query) {
          listed = query
          return { data: [organization()], total: 1, limit: query.limit, offset: query.offset }
        },
      }),
    )
    expect(listed).toMatchObject({ taxId: "RO123", limit: 50, offset: 0 })

    let created: unknown
    const createResult = await registry().dispatch(
      "create_organization",
      {
        name: "Example Travel",
        vatNumber: "RO123",
        billingAddress: { label: "billing", line1: "Calea Victoriei 1", country: "RO" },
      },
      ctx(
        {
          async createOrganization(input, admitted) {
            created = input
            expect(admitted.invocation.idempotencyKey).toBe("organization-create-1")
            return { status: "created", organization: { id: "org_1" }, replayed: false }
          },
        },
        {
          handlerActionPolicy: {
            ...RELATIONSHIPS_ORGANIZATION_HANDLER_ACTION_POLICY,
            actionPolicy: {
              ...RELATIONSHIPS_ORGANIZATION_HANDLER_ACTION_POLICY.actionPolicy,
              enforcement: "handler",
              invocation: {
                controlField: "_voyant",
                requiredFields: ["idempotencyKey"],
                optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
                fingerprintAlgorithm: "action-ledger-command-v1",
              },
            },
            invocation: { idempotencyKey: "organization-create-1" },
          },
        },
      ),
    )
    expect(created).toMatchObject({ name: "Example Travel", vatNumber: "RO123" })
    expect(createResult).toMatchObject({
      status: "created",
      organization: { id: "org_1" },
      replayed: false,
    })

    let updated: unknown
    await registry().dispatch(
      "update_organization",
      { id: "org_1", status: "inactive", tags: ["former-client"] },
      ctx({
        async updateOrganization(input) {
          updated = input
          return organization({ status: "inactive", tags: ["former-client"] })
        },
      }),
    )
    expect(updated).toMatchObject({ id: "org_1", status: "inactive", tags: ["former-client"] })
  })

  it("routes notes, contact methods, and addresses by entity without delete capabilities", async () => {
    const calls: string[] = []
    const services = ctx({
      async listNotes(input) {
        calls.push(`notes:${input.entityType}:${input.entityId}`)
        return [note()]
      },
      async addNote(input) {
        calls.push(`note:${input.entityType}:${input.entityId}`)
        return input.entityType === "person"
          ? note()
          : note({ id: "onot_1", personId: undefined, organizationId: "org_1" })
      },
      async addContactMethod(input) {
        calls.push(`contact:${input.entityType}:${input.entityId}`)
        return contactMethod({ entityType: input.entityType, entityId: input.entityId })
      },
      async addAddress(input) {
        calls.push(`new-address:${input.entityType}:${input.entityId}`)
        return address({ entityType: input.entityType, entityId: input.entityId })
      },
      async updateAddress(input) {
        calls.push(`address:${input.id}`)
        return address({ line1: "Calea Victoriei 2" })
      },
    })
    await registry().dispatch(
      "list_relationship_notes",
      { entityType: "person", entityId: "pers_1" },
      services,
    )
    await registry().dispatch(
      "add_person_contact_method",
      {
        entityId: "pers_1",
        kind: "email",
        value: "ana@example.com",
      },
      services,
    )
    await registry().dispatch(
      "add_organization_contact_method",
      {
        entityId: "org_1",
        kind: "website",
        value: "https://example.com",
      },
      services,
    )
    await registry().dispatch(
      "add_person_note",
      { entityId: "pers_1", content: "Prefers aisle seats" },
      services,
    )
    await registry().dispatch(
      "add_organization_note",
      { entityId: "org_1", content: "Annual account review due" },
      services,
    )
    await registry().dispatch(
      "add_person_address",
      { entityId: "pers_1", line1: "1 High Street", country: "GB" },
      services,
    )
    await registry().dispatch(
      "add_organization_address",
      { entityId: "org_1", line1: "Calea Victoriei 1", country: "RO" },
      services,
    )
    await registry().dispatch(
      "update_relationship_address",
      { id: "iadr_1", line1: "Calea Victoriei 2" },
      services,
    )
    expect(calls).toEqual([
      "notes:person:pers_1",
      "contact:person:pers_1",
      "contact:organization:org_1",
      "note:person:pers_1",
      "note:organization:org_1",
      "new-address:person:pers_1",
      "new-address:organization:org_1",
      "address:iadr_1",
    ])
    expect(
      registry()
        .list()
        .some((tool) => tool.name.includes("delete")),
    ).toBe(false)
  })

  it("throws MISSING_SERVICE when unwired", async () => {
    const missing = { ...ctx(), relationships: undefined }
    await expect(registry().dispatch("list_people", {}, missing)).rejects.toMatchObject({
      code: "MISSING_SERVICE",
    })
  })
})
