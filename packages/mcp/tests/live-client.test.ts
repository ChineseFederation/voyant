import { afterEach, describe, expect, it } from "vitest"

import { resolveOpenAiKey } from "./support/live-client.js"

const originalLiveEvalFlag = process.env.VOYANT_RUN_LIVE_EVALS
const originalApiKey = process.env.OPENAI_API_KEY

afterEach(() => {
  restoreEnv("VOYANT_RUN_LIVE_EVALS", originalLiveEvalFlag)
  restoreEnv("OPENAI_API_KEY", originalApiKey)
})

describe("live client credential resolution", () => {
  it("does not resolve a credential unless live evals are explicitly enabled", () => {
    delete process.env.VOYANT_RUN_LIVE_EVALS
    process.env.OPENAI_API_KEY = "available-but-not-opted-in"

    expect(resolveOpenAiKey()).toBeUndefined()
  })

  it("resolves the environment credential for an explicitly enabled run", () => {
    process.env.VOYANT_RUN_LIVE_EVALS = "1"
    process.env.OPENAI_API_KEY = "explicit-live-key"

    expect(resolveOpenAiKey()).toBe("explicit-live-key")
  })
})

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
