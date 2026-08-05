import { describe, expect, it, vi } from "vitest"

import { resolveStaffAccess } from "../../src/staff-access.js"

const ACCESS_CATALOG = { resources: [], presets: [] }

function databaseReturning(rows: unknown[]) {
  const limit = vi.fn(async () => rows)
  const where = vi.fn(() => ({ limit }))
  const from = vi.fn(() => ({ where }))
  return {
    db: { select: vi.fn(() => ({ from })) },
    from,
    limit,
    where,
  }
}

function cloudLink(overrides: Record<string, unknown> = {}) {
  return {
    deploymentId: "deployment_1",
    platformOrganizationId: "org_platform_1",
    providerId: "voyant-cloud",
    revokedAt: null,
    roleSlug: "custom",
    scopes: ["storefronts:read", "storefronts:write"],
    ...overrides,
  }
}

async function resolveCloud(rows: unknown[]) {
  const database = databaseReturning(rows)
  const access = await resolveStaffAccess({
    accessCatalog: ACCESS_CATALOG,
    authMode: "voyant-cloud",
    db: database.db as never,
    deploymentId: "deployment_1",
    userId: "user_staff_1",
  })
  return { access, database }
}

describe("resolveStaffAccess", () => {
  it("returns the exact organization and scopes from the active managed staff link", async () => {
    const { access } = await resolveCloud([cloudLink()])

    expect(access).toEqual({
      organizationId: "org_platform_1",
      scopes: ["storefronts:read", "storefronts:write"],
    })
  })

  it.each([
    { label: "missing", rows: [] },
    { label: "revoked", rows: [cloudLink({ revokedAt: new Date("2026-07-22") })] },
    { label: "another deployment", rows: [cloudLink({ deploymentId: "deployment_2" })] },
    { label: "another provider", rows: [cloudLink({ providerId: "other-provider" })] },
    { label: "blank organization", rows: [cloudLink({ platformOrganizationId: "   " })] },
  ])("fails closed for $label managed staff access", async ({ rows }) => {
    await expect(resolveCloud(rows)).resolves.toMatchObject({ access: null })
  })

  it("fails closed before querying when the managed deployment is missing", async () => {
    const database = databaseReturning([cloudLink()])

    await expect(
      resolveStaffAccess({
        accessCatalog: ACCESS_CATALOG,
        authMode: "voyant-cloud",
        db: database.db as never,
        deploymentId: "   ",
        userId: "user_staff_1",
      }),
    ).resolves.toBeNull()
    expect(database.db.select).not.toHaveBeenCalled()
  })

  it("preserves an explicitly empty managed scope set", async () => {
    const { access } = await resolveCloud([cloudLink({ scopes: [] })])

    expect(access).toEqual({ organizationId: "org_platform_1", scopes: [] })
  })

  it("keeps the existing role fallback when managed scopes are absent", async () => {
    const { access } = await resolveCloud([cloudLink({ roleSlug: "viewer", scopes: null })])

    expect(access).toEqual({
      organizationId: "org_platform_1",
      scopes: ["*:read", "*:search"],
    })
  })

  it("keeps local staff organization-less and resolves profile permissions", async () => {
    const database = databaseReturning([{ permissions: ["catalog:read"] }])

    await expect(
      resolveStaffAccess({
        accessCatalog: ACCESS_CATALOG,
        authMode: "local",
        db: database.db as never,
        userId: "user_staff_1",
      }),
    ).resolves.toEqual({ organizationId: null, scopes: ["catalog:read"] })
  })

  // The two states below are the reason local member permissions cannot be made
  // fail-closed in one release: real deployments hold rows in both, and both
  // currently read as full access. Pin them so that a change to the fallback has
  // to be a deliberate edit to these expectations rather than a silent lockout.
  it.each([
    { label: "an unassigned permission set", rows: [{ permissions: null }] },
    { label: "no profile row at all", rows: [] },
  ])("resolves local staff with $label to full access", async ({ rows }) => {
    const database = databaseReturning(rows)

    await expect(
      resolveStaffAccess({
        accessCatalog: ACCESS_CATALOG,
        authMode: "local",
        db: database.db as never,
        userId: "user_staff_1",
      }),
    ).resolves.toEqual({ organizationId: null, scopes: ["*"] })
  })

  it("preserves an explicitly empty local scope set instead of reading it as full access", async () => {
    const database = databaseReturning([{ permissions: [] }])

    await expect(
      resolveStaffAccess({
        accessCatalog: ACCESS_CATALOG,
        authMode: "local",
        db: database.db as never,
        userId: "user_staff_1",
      }),
    ).resolves.toEqual({ organizationId: null, scopes: [] })
  })
})
