import { describe, expect, it, vi } from "vitest"

import { resolveStaffAccess } from "../../src/staff-access.js"

const ACCESS_CATALOG = { resources: [], presets: [] }

/**
 * A catalog carrying a resource that `*` deliberately does not satisfy.
 *
 * The empty `ACCESS_CATALOG` above cannot distinguish the bare `*` sentinel
 * from a properly expanded full-access scope set, because with no resources
 * there is nothing to expand — which is why a full-access local admin could be
 * locked out of every `explicit-resource` while every test stayed green.
 */
const ACCESS_CATALOG_WITH_EXPLICIT_RESOURCE = {
  resources: [
    {
      id: "@voyant-travel/bookings#access.booking-customer-access",
      unitId: "@voyant-travel/bookings",
      resource: "booking-customer-access",
      label: "Booking customer access",
      description: "Explicit customer Buyer Account grants for Bookings.",
      wildcard: "explicit-resource" as const,
      actions: [
        { action: "read", label: "Read", description: "Inspect grants." },
        { action: "write", label: "Manage", description: "Grant or revoke." },
      ],
    },
  ],
  presets: [],
}

function resolveLocal(rows: unknown[], accessCatalog = ACCESS_CATALOG) {
  return resolveStaffAccess({
    accessCatalog,
    authMode: "local",
    db: databaseReturning(rows).db as never,
    userId: "user_staff_1",
  })
}

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

  it.each([
    { label: "an unassigned permission set", rows: [{ permissions: null }] },
    { label: "no profile row at all", rows: [] },
  ])("expands local full access with $label to the grants `*` does not satisfy", async ({
    rows,
  }) => {
    await expect(resolveLocal(rows, ACCESS_CATALOG_WITH_EXPLICIT_RESOURCE)).resolves.toEqual({
      organizationId: null,
      scopes: ["*", "booking-customer-access:read", "booking-customer-access:write"],
    })
  })

  // `["*"]` in the column is not "someone chose this": the local team adapter
  // writes it for both `admin` and `owner`, and the 20260805 backfill wrote it
  // over every previously-null row. Expanding only the null case would reach
  // almost no real account.
  it("expands a stored full-access sentinel", async () => {
    await expect(
      resolveLocal([{ permissions: ["*"] }], ACCESS_CATALOG_WITH_EXPLICIT_RESOURCE),
    ).resolves.toEqual({
      organizationId: null,
      scopes: ["*", "booking-customer-access:read", "booking-customer-access:write"],
    })
  })

  it.each([
    { label: "a narrow grant", permissions: ["catalog:read"] },
    { label: "a read-everything grant that is not full access", permissions: ["*:read"] },
    { label: "an explicitly empty set", permissions: [] },
  ])("does not expand $label", async ({ permissions }) => {
    // The point of `explicit-resource` is that a deliberately restricted member
    // must have the resource named. Expanding here would hand every member the
    // sensitive grants, which is the opposite failure. `*:read` matters most:
    // it is broad but it is not `*:*`, so it must not be read as full access.
    await expect(
      resolveLocal([{ permissions }], ACCESS_CATALOG_WITH_EXPLICIT_RESOURCE),
    ).resolves.toEqual({ organizationId: null, scopes: permissions })
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
