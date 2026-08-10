import { FinanceAppApiNumberConflictError } from "@voyant-travel/finance-contracts/app-api"
import { ApiHttpError } from "@voyant-travel/hono"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { describe, expect, it, vi } from "vitest"
import { appApiFinanceExternalReferenceUpsertSchema } from "./app-api-contracts.js"
import {
  type AppApiAccessContext,
  assertAppNamespaceAlias,
  assertCompatibleVersion,
  createAppApiService,
} from "./app-api-service.js"
import { appGrants, appInstallations, appReleases } from "./schema.js"

function postgresStub(implementation: object): PostgresJsDatabase {
  const db = Object.create(null) as PostgresJsDatabase
  Object.assign(db, implementation)
  return db
}

function createAccessDb(options: {
  status?: "active" | "paused"
  scopes?: readonly string[]
  releaseRange?: { min: string; max: string }
}) {
  const installation = {
    id: "inst_1",
    appId: "app_1",
    deploymentId: "dep_1",
    releaseId: "rel_1",
    status: options.status ?? "active",
    namespace: "app--one",
  }
  const release = {
    id: "rel_1",
    appId: "app_1",
    releaseVersion: "1.0.0",
    apiCompatibility: options.releaseRange ?? { min: "2026-07-01", max: "2026-12-31" },
  }
  return postgresStub({
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          const rows = () => {
            if (table === appInstallations) return [installation]
            if (table === appReleases) return [release]
            if (table === appGrants) return (options.scopes ?? []).map((scope) => ({ scope }))
            return []
          }
          return {
            // biome-ignore lint/suspicious/noThenProperty: test stub models Drizzle's awaitable query builder -- owner: apps.
            then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows()).then(resolve),
            orderBy: async () => rows(),
            limit: async () => rows(),
          }
        },
      }),
    }),
  })
}

const context: AppApiAccessContext = {
  appId: "app_1",
  installationId: "inst_1",
  releaseId: "rel_1",
  tokenMode: "offline",
  scopes: [],
  apiVersion: "2026-07-01",
}

describe("App API service boundary", () => {
  it("rejects direct service calls when the installation is inactive", async () => {
    const service = createAppApiService()

    await expect(
      service.requireAccess(
        createAccessDb({ status: "paused", scopes: ["app-installation:read"] }),
        { ...context, scopes: ["app-installation:read"] },
        ["app-installation:read"],
      ),
    ).rejects.toMatchObject({ status: 403, code: "app_installation_not_active" })
  })

  it("rejects when the installation grant is missing even if the token carries the scope", async () => {
    const service = createAppApiService()

    await expect(
      service.requireAccess(
        createAccessDb({ scopes: [] }),
        { ...context, scopes: ["app-installation:read"] },
        ["app-installation:read"],
      ),
    ).rejects.toMatchObject({ status: 403, code: "app_installation_scope_missing" })
  })

  it("rejects when a narrowed online token lacks the scope the installation was granted", async () => {
    const service = createAppApiService()

    await expect(
      service.requireAccess(
        createAccessDb({ scopes: ["app-installation:read", "finance-documents:read"] }),
        { ...context, tokenMode: "online", scopes: ["app-installation:read"] },
        ["finance-documents:read"],
      ),
    ).rejects.toMatchObject({ status: 403, code: "app_api_token_scope_missing" })
  })

  it("fails closed when the requested API version is outside the installed release range", async () => {
    const service = createAppApiService()

    await expect(
      service.requireAccess(
        createAccessDb({
          scopes: ["app-installation:read"],
          releaseRange: { min: "2026-08-01", max: "2026-12-31" },
        }),
        { ...context, scopes: ["app-installation:read"] },
        ["app-installation:read"],
      ),
    ).rejects.toMatchObject({ status: 426, code: "app_api_version_out_of_range" })
  })

  it("requires action-ledger approval for finance actions even when OAuth scope is granted", async () => {
    const executeAction = vi.fn()
    const service = createAppApiService({
      finance: { listDocuments: vi.fn(), executeAction },
    })

    await expect(
      service.executeFinanceAction(
        createAccessDb({ scopes: ["finance-actions:issue"] }),
        { ...context, scopes: ["finance-actions:issue"] },
        {
          action: "issue",
          idempotencyKey: "idem_1",
          payload: {},
        },
      ),
    ).rejects.toMatchObject({ status: 403, code: "app_api_finance_approval_required" })
    expect(executeAction).not.toHaveBeenCalled()
  })

  it("hydrates one finance document through the stable App API identifier", async () => {
    const getIssuanceDocument = vi.fn().mockResolvedValue({ id: "inv_1" })
    const service = createAppApiService({
      finance: { listDocuments: vi.fn(), executeAction: vi.fn(), getIssuanceDocument },
    })

    await expect(
      service.getFinanceIssuanceDocument(
        createAccessDb({ scopes: ["finance-documents:read"] }),
        { ...context, scopes: ["finance-documents:read"] },
        "inv_1",
      ),
    ).resolves.toEqual({ data: { id: "inv_1" } })
    expect(getIssuanceDocument).toHaveBeenCalledWith(expect.anything(), "inv_1")
  })

  it("maps a provider-owned invoice number conflict to a stable App API conflict", async () => {
    const upsertExternalReference = vi
      .fn()
      .mockRejectedValue(new FinanceAppApiNumberConflictError("SB-42"))
    const service = createAppApiService({ finance: { upsertExternalReference } })
    const db = createAccessDb({
      scopes: ["finance-external-references:write", "finance-external-allocation:write"],
    })
    Object.assign(db, {
      transaction: (callback: (tx: PostgresJsDatabase) => unknown) => callback(db),
    })

    await expect(
      service.upsertFinanceExternalReference(
        db,
        {
          ...context,
          scopes: ["finance-external-references:write", "finance-external-allocation:write"],
        },
        "inv_1",
        {
          reference: {
            externalId: null,
            externalNumber: null,
            externalUrl: null,
            status: null,
            metadata: null,
            syncedAt: null,
            syncError: null,
          },
          allocation: { invoiceNumber: "SB-42" },
        },
      ),
    ).rejects.toMatchObject({ status: 409, code: "app_api_finance_number_conflict" })
    expect(upsertExternalReference).toHaveBeenCalledWith(
      expect.anything(),
      "inv_1",
      "app_1",
      expect.anything(),
    )
  })

  it("isolates rate limits per installation", async () => {
    const service = createAppApiService({
      rateLimit: { installationLimit: 1, appLimit: 10, windowMs: 60_000 },
    })
    const rateContext = { ...context, appId: "rate_app", installationId: "rate_inst_1" }

    service.enforceRateLimit(rateContext)
    expect(() => service.enforceRateLimit(rateContext)).toThrow(ApiHttpError)
    expect(() =>
      service.enforceRateLimit({ ...rateContext, installationId: "rate_inst_2" }),
    ).not.toThrow()
  })

  it("accepts only the $app custom-field namespace alias from request data", () => {
    expect(() => assertAppNamespaceAlias(undefined)).not.toThrow()
    expect(() => assertAppNamespaceAlias("$app")).not.toThrow()
    expect(() => assertAppNamespaceAlias("$app:sync")).not.toThrow()
    expect(() => assertAppNamespaceAlias("app--foreign")).toThrow(ApiHttpError)
    expect(() => assertAppNamespaceAlias("custom")).toThrow(ApiHttpError)
  })

  it("compares App API compatibility ranges inclusively", () => {
    expect(() =>
      assertCompatibleVersion("2026-07-01", { min: "2026-07-01", max: "2026-12-31" }),
    ).not.toThrow()
    expect(() =>
      assertCompatibleVersion("2027-01-01", { min: "2026-07-01", max: "2026-12-31" }),
    ).toThrow(ApiHttpError)
  })

  it("requires a complete bounded external-reference replacement", () => {
    expect(appApiFinanceExternalReferenceUpsertSchema.safeParse({ reference: {} }).success).toBe(
      false,
    )
    expect(
      appApiFinanceExternalReferenceUpsertSchema.safeParse({
        reference: {
          externalId: null,
          externalNumber: null,
          externalUrl: null,
          status: null,
          metadata: { payload: "x".repeat(17_000) },
          syncedAt: null,
          syncError: null,
        },
      }).success,
    ).toBe(false)
  })

  it("rejects a malformed external URL without throwing from validation", () => {
    const input = {
      reference: {
        externalId: "42",
        externalNumber: "42",
        externalUrl: "",
        status: "issued",
        metadata: null,
        syncedAt: "2026-08-10T04:56:09.000Z",
        syncError: null,
      },
    }

    expect(() => appApiFinanceExternalReferenceUpsertSchema.safeParse(input)).not.toThrow()
    expect(appApiFinanceExternalReferenceUpsertSchema.safeParse(input).success).toBe(false)
  })
})
