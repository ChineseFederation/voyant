import { describe, expect, it } from "vitest"

import { DEFAULT_RESPONSE_CACHE_POSTURE, resolveResponseCachePosture } from "./deployment-types"
import {
  resolveVoyantNodeProviderPlan,
  validateVoyantNodeProviderPlanEnv,
  voyantNodeDeploymentPostureReports,
} from "./node-provider-plan"

describe("resolveVoyantNodeProviderPlan", () => {
  it("keeps memory providers even when external provider env is present", () => {
    const plan = resolveVoyantNodeProviderPlan({
      storage: "memory",
      cache: "memory",
      sharedState: "memory",
      rateLimit: "memory",
    })

    expect(plan).toEqual({
      storage: "memory",
      cache: "memory",
      sharedState: "memory",
      rateLimit: "memory",
    })
    expect(
      validateVoyantNodeProviderPlanEnv(plan, {
        REDIS_URL: "redis://example.test:6379",
        DATABASE_URL: "postgres://user:pass@example.test:5432/voyant",
        S3_ENDPOINT: "https://objects.example.test",
        S3_ACCESS_KEY_ID: "key",
        S3_SECRET_ACCESS_KEY: "secret",
        STORAGE_MEDIA_BUCKET: "media",
        STORAGE_DOCUMENTS_BUCKET: "documents",
      }),
    ).toEqual([])
  })

  it("maps redis, postgres, and object storage graph providers to the Node plan", () => {
    const plan = resolveVoyantNodeProviderPlan({
      storage: "s3-compatible",
      cache: "redis",
      sharedState: "redis",
      rateLimit: "postgres",
    })

    expect(plan).toEqual({
      storage: "s3-compatible",
      cache: "redis",
      sharedState: "redis",
      rateLimit: "postgres",
    })
  })

  it("validates env required by the selected graph providers", () => {
    const plan = resolveVoyantNodeProviderPlan({
      storage: "s3-compatible",
      cache: "redis",
      sharedState: "redis",
      rateLimit: "postgres",
    })

    expect(validateVoyantNodeProviderPlanEnv(plan, {})).toEqual([
      "env S3_REGION is required by the Node provider plan",
      "env STORAGE_MEDIA_BUCKET is required by the Node provider plan",
      "env STORAGE_DOCUMENTS_BUCKET is required by the Node provider plan",
      "env REDIS_URL is required by the Node provider plan",
      "env DATABASE_URL or DATABASE_URL_DIRECT is required by the Node provider plan",
    ])
  })

  it("maps the managed storage gateway provider and requires its endpoint + token", () => {
    const plan = resolveVoyantNodeProviderPlan({
      storage: "gateway",
      cache: "memory",
      sharedState: "memory",
      rateLimit: "memory",
    })

    expect(plan.storage).toBe("gateway")
    expect(validateVoyantNodeProviderPlanEnv(plan, {})).toEqual([
      "env STORAGE_GATEWAY_ENDPOINT is required by the Node provider plan",
      "env STORAGE_GATEWAY_TOKEN is required by the Node provider plan",
    ])
    expect(
      validateVoyantNodeProviderPlanEnv(plan, {
        STORAGE_GATEWAY_ENDPOINT: "https://gw.example.test",
        STORAGE_GATEWAY_TOKEN: "tok",
      }),
    ).toEqual([])
  })

  it("accepts DATABASE_URL_DIRECT for Postgres provider roles", () => {
    const plan = resolveVoyantNodeProviderPlan({
      storage: "memory",
      cache: "postgres",
      sharedState: "memory",
      rateLimit: "memory",
    })

    expect(
      validateVoyantNodeProviderPlanEnv(plan, {
        DATABASE_URL_DIRECT: "postgres://user:pass@example.test:5432/voyant",
      }),
    ).toEqual([])
  })

  it("rejects unsupported graph providers", () => {
    expect(() =>
      resolveVoyantNodeProviderPlan({
        storage: "local-disk",
        cache: "memory",
        sharedState: "memory",
        rateLimit: "memory",
      }),
    ).toThrow(/providers\.storage=local-disk/)
    expect(() =>
      resolveVoyantNodeProviderPlan({
        storage: "memory",
        cache: "memcached",
        sharedState: "memory",
        rateLimit: "memory",
      }),
    ).toThrow(/providers\.cache=memcached/)
  })

  it("requires explicit graph provider roles used by the Node runtime", () => {
    expect(() =>
      resolveVoyantNodeProviderPlan({
        storage: "memory",
        cache: "memory",
        rateLimit: "memory",
      }),
    ).toThrow(/providers\.sharedState/)
  })
})

describe("response cache posture", () => {
  const postgresCachePlan = resolveVoyantNodeProviderPlan({
    storage: "memory",
    cache: "postgres",
    sharedState: "redis",
    rateLimit: "redis",
  })

  it("reads an undeclared posture as no edge tier in front of the origin", () => {
    expect(DEFAULT_RESPONSE_CACHE_POSTURE).toEqual({ edge: "none" })
    expect(resolveResponseCachePosture(undefined)).toEqual({ edge: "none" })
    expect(resolveResponseCachePosture({ edge: "declared" })).toEqual({ edge: "declared" })
  })

  it("reports a database-backed response cache with no declared edge tier", () => {
    const reports = voyantNodeDeploymentPostureReports({
      plan: postgresCachePlan,
      mountsPublicRoutes: true,
    })

    expect(reports).toHaveLength(1)
    expect(reports[0]).toContain('deployment.providers.cache = "postgres" and no declared edge')
    expect(reports[0]).toContain("the same Postgres the routes query")
    expect(reports[0]).toContain("capped at 60 seconds")
    expect(reports[0]).toContain('deployment.providers.cache = "redis"')
    expect(reports[0]).toContain('deployment.responseCache = { edge: "declared" }')
  })

  it("does not report a database-backed cache when an edge tier is declared", () => {
    expect(
      voyantNodeDeploymentPostureReports({
        plan: postgresCachePlan,
        responseCache: { edge: "declared" },
        mountsPublicRoutes: true,
      }),
    ).toEqual([])
  })

  it("does not report a response cache that is not the database", () => {
    expect(
      voyantNodeDeploymentPostureReports({
        plan: resolveVoyantNodeProviderPlan({
          storage: "memory",
          cache: "redis",
          sharedState: "redis",
          rateLimit: "redis",
        }),
        responseCache: { edge: "none" },
        mountsPublicRoutes: true,
      }),
    ).toEqual([])
  })

  it("does not report a response-cache posture when no public routes are mounted", () => {
    expect(
      voyantNodeDeploymentPostureReports({
        plan: postgresCachePlan,
        responseCache: { edge: "none" },
        mountsPublicRoutes: false,
      }),
    ).toEqual([])
  })

  it("states the per-process condition for memory rate limiting and shared state", () => {
    const reports = voyantNodeDeploymentPostureReports({
      plan: resolveVoyantNodeProviderPlan({
        storage: "memory",
        cache: "redis",
        sharedState: "memory",
        rateLimit: "memory",
      }),
      responseCache: { edge: "declared" },
      mountsPublicRoutes: true,
    })

    expect(reports).toHaveLength(2)
    expect(reports[0]).toContain('deployment.providers.rateLimit = "memory"')
    expect(reports[0]).toContain("cannot observe how many instances or processes")
    expect(reports[1]).toContain('deployment.providers.sharedState = "memory"')
    expect(reports[1]).toContain("nothing is shared despite the name")
  })
})
