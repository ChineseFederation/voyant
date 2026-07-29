import { afterEach, describe, expect, it, vi } from "vitest"
import {
  DEFAULT_DB_TIMEOUTS,
  DEFAULT_NODE_IDLE_TIMEOUT_SECONDS,
  isNeonConnectionString,
  isPooledNeonConnectionString,
  resolveNodePostgresOptions,
  resolveServerlessPoolConfig,
  warnIfDirectNeonEndpoint,
} from "../../src/connection-config.js"
import { createServerlessDbClient } from "../../src/index.js"

const CONNECTION_STRING = "postgres://user:password@example.com:5432/voyant"

describe("resolveServerlessPoolConfig", () => {
  it("applies default timeouts", () => {
    const config = resolveServerlessPoolConfig(CONNECTION_STRING)

    expect(config).toEqual({
      connectionString: CONNECTION_STRING,
      statement_timeout: DEFAULT_DB_TIMEOUTS.statementMs,
      query_timeout: DEFAULT_DB_TIMEOUTS.queryMs,
      connectionTimeoutMillis: DEFAULT_DB_TIMEOUTS.connectMs,
    })
    expect(config.statement_timeout).toBe(10_000)
    expect(config.query_timeout).toBe(15_000)
    expect(config.connectionTimeoutMillis).toBe(10_000)
  })

  it("lets the timeouts option override defaults", () => {
    const config = resolveServerlessPoolConfig(CONNECTION_STRING, {
      timeouts: { statementMs: 5_000, queryMs: 7_500, connectMs: 2_000 },
    })

    expect(config.statement_timeout).toBe(5_000)
    expect(config.query_timeout).toBe(7_500)
    expect(config.connectionTimeoutMillis).toBe(2_000)
  })

  it("omits timeouts disabled with false", () => {
    const config = resolveServerlessPoolConfig(CONNECTION_STRING, {
      timeouts: { statementMs: false, queryMs: false, connectMs: false },
    })

    expect(config).toEqual({ connectionString: CONNECTION_STRING })
    expect("statement_timeout" in config).toBe(false)
    expect("query_timeout" in config).toBe(false)
    expect("connectionTimeoutMillis" in config).toBe(false)
  })

  it("lets caller-supplied pool config win over defaults", () => {
    const config = resolveServerlessPoolConfig(CONNECTION_STRING, {
      pool: { statement_timeout: 1_234, max: 3 },
    })

    expect(config.statement_timeout).toBe(1_234)
    expect(config.max).toBe(3)
    // Non-overridden defaults survive.
    expect(config.query_timeout).toBe(DEFAULT_DB_TIMEOUTS.queryMs)
    expect(config.connectionTimeoutMillis).toBe(DEFAULT_DB_TIMEOUTS.connectMs)
  })

  it("lets pool config win over the timeouts option", () => {
    const config = resolveServerlessPoolConfig(CONNECTION_STRING, {
      timeouts: { statementMs: 5_000 },
      pool: { statement_timeout: 1_000 },
    })

    expect(config.statement_timeout).toBe(1_000)
  })

  it("pins the connection string last so pool config cannot clobber it", () => {
    const config = resolveServerlessPoolConfig(CONNECTION_STRING, {
      pool: { max: 1 },
    })

    expect(config.connectionString).toBe(CONNECTION_STRING)
  })
})

describe("resolveNodePostgresOptions", () => {
  it("applies default statement and connect timeouts", () => {
    const config = resolveNodePostgresOptions()

    expect(config).toEqual({
      connect_timeout: 10,
      idle_timeout: DEFAULT_NODE_IDLE_TIMEOUT_SECONDS,
      connection: { statement_timeout: 10_000 },
    })
  })

  it("converts connectMs to whole seconds, rounding up", () => {
    const config = resolveNodePostgresOptions({ timeouts: { connectMs: 1_500 } })

    expect(config.connect_timeout).toBe(2)
  })

  it("passes max connections through when provided", () => {
    expect(resolveNodePostgresOptions({ max: 7 }).max).toBe(7)
    expect("max" in resolveNodePostgresOptions()).toBe(false)
  })

  it("closes idle resident sockets by default and allows an explicit override", () => {
    expect(resolveNodePostgresOptions().idle_timeout).toBe(30)
    expect(resolveNodePostgresOptions({ idleSeconds: 90 }).idle_timeout).toBe(90)
    expect("idle_timeout" in resolveNodePostgresOptions({ idleSeconds: false })).toBe(false)
  })

  it("lets the timeouts option override defaults", () => {
    const config = resolveNodePostgresOptions({
      timeouts: { statementMs: 30_000, connectMs: 5_000 },
    })

    expect(config.connection).toEqual({ statement_timeout: 30_000 })
    expect(config.connect_timeout).toBe(5)
  })

  it("omits timeouts disabled with false", () => {
    const config = resolveNodePostgresOptions({
      timeouts: { statementMs: false, connectMs: false },
    })

    expect(config).toEqual({ idle_timeout: DEFAULT_NODE_IDLE_TIMEOUT_SECONDS })
  })
})

describe("isNeonConnectionString / isPooledNeonConnectionString", () => {
  it("recognizes Neon hosts", () => {
    expect(isNeonConnectionString("postgres://u:p@ep-x-123.eu-central-1.aws.neon.tech/db")).toBe(
      true,
    )
    expect(isNeonConnectionString("postgres://u:p@localhost:5432/db")).toBe(false)
    expect(isNeonConnectionString("postgres://u:p@127.0.0.1:5432/db")).toBe(false)
    expect(isNeonConnectionString("postgres://u:p@db.example.com/db")).toBe(false)
    expect(isNeonConnectionString("not a url")).toBe(false)
  })

  it("recognizes pooled Neon hosts", () => {
    expect(
      isPooledNeonConnectionString("postgres://u:p@ep-x-123-pooler.eu-central-1.aws.neon.tech/db"),
    ).toBe(true)
    expect(
      isPooledNeonConnectionString("postgres://u:p@ep-x-123.eu-central-1.aws.neon.tech/db"),
    ).toBe(false)
    // Non-Neon hosts are never "pooled Neon" even with -pooler in the name.
    expect(isPooledNeonConnectionString("postgres://u:p@my-pooler.example.com/db")).toBe(false)
  })
})

describe("warnIfDirectNeonEndpoint", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("warns once per unique direct Neon connection string", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const url = `postgres://u:p@ep-warn-once-${Date.now()}.eu-central-1.aws.neon.tech/db`

    warnIfDirectNeonEndpoint(url)
    warnIfDirectNeonEndpoint(url)
    warnIfDirectNeonEndpoint(url)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain("-pooler")
  })

  it("does not warn for pooled Neon endpoints", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    warnIfDirectNeonEndpoint(
      `postgres://u:p@ep-pooled-${Date.now()}-pooler.eu-central-1.aws.neon.tech/db`,
    )

    expect(warn).not.toHaveBeenCalled()
  })

  it("does not warn for localhost or non-Neon hosts", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    warnIfDirectNeonEndpoint("postgres://u:p@localhost:5432/db")
    warnIfDirectNeonEndpoint("postgres://u:p@127.0.0.1:5432/db")
    warnIfDirectNeonEndpoint("postgres://u:p@db.example.com/db")

    expect(warn).not.toHaveBeenCalled()
  })

  it("fires from createServerlessDbClient for direct Neon URLs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const url = `postgres://u:p@ep-via-client-${Date.now()}.eu-central-1.aws.neon.tech/db`

    const handle = createServerlessDbClient(url)
    try {
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      await handle.dispose()
    }
  })
})
