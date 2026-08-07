import { beforeEach, describe, expect, it, vi } from "vitest"

const { createVoyantAppMock, openNodeDatabaseMock } = vi.hoisted(() => ({
  createVoyantAppMock: vi.fn((config: unknown) => config),
  openNodeDatabaseMock: vi.fn(),
}))

vi.mock("./create-app.js", () => ({ createVoyantApp: createVoyantAppMock }))

vi.mock("@voyant-travel/db/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@voyant-travel/db/runtime")>()),
  openNodeDatabase: openNodeDatabaseMock,
}))

import { createVoyantNodeApp } from "./node-runtime.js"

type RequestDbFactory = (env: unknown) => {
  db: unknown
  dispose: () => Promise<void>
}

describe("createVoyantNodeApp database lifecycle", () => {
  beforeEach(() => {
    createVoyantAppMock.mockClear()
    openNodeDatabaseMock.mockReset()
  })

  it("does not dispose the process-owned database after a request", async () => {
    const processDispose = vi.fn(async () => {})
    const processDatabase = Object.defineProperty({}, Symbol.for("voyant.db.dispose"), {
      value: processDispose,
    })
    openNodeDatabaseMock.mockReturnValue({
      db: processDatabase,
      dispose: async () => {},
    })

    const config = createVoyantNodeApp({
      applicationId: "test",
      activeModules: [],
      deployment: {
        providers: {},
        redis: { isolation: "dedicated", network: "trusted" },
      },
    }) as unknown as {
      db: RequestDbFactory
      dbTransactional: RequestDbFactory
    }

    for (const factory of [config.db, config.dbTransactional]) {
      const requestDatabase = factory({ DATABASE_URL: "postgres://example.invalid/test" })
      expect(requestDatabase.db).toBe(processDatabase)
      await requestDatabase.dispose()
    }

    expect(openNodeDatabaseMock).toHaveBeenCalledTimes(2)
    expect(processDispose).not.toHaveBeenCalled()
  })
})
