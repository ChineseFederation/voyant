import { definePort } from "@voyant-travel/core/project"

export interface LegacyInquiryCutoverProgress {
  scanned: number
  migrated: number
  replayed: number
  targetsMaterialized: number
  conversionsMaterialized: number
  unresolvedTargets: number
  remaining: number
}

export interface LegacyInquiryCutoverJobRuntime {
  run(bindings: unknown): Promise<LegacyInquiryCutoverProgress>
}

export const legacyInquiryCutoverJobRuntimePort = definePort<LegacyInquiryCutoverJobRuntime>({
  id: "relationships.legacy-inquiry-cutover-job",
  test(provider) {
    if (!provider || typeof provider.run !== "function") {
      throw new Error("relationships.legacy-inquiry-cutover-job must implement run().")
    }
  },
})
