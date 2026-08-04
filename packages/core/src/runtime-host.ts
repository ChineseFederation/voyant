/** Domain-neutral resources available to graph-selected runtime contributors. */
export interface VoyantRuntimeHostPrimitives {
  env(bindings: unknown): Readonly<Record<string, unknown>>
  database: {
    resolve<TDatabase = unknown>(bindings: unknown): TDatabase
    fromContext<TDatabase = unknown>(context: unknown): TDatabase
    transaction<T>(bindings: unknown, operation: (database: unknown) => Promise<T>): Promise<T>
  }
  storage: {
    resolve(bindings: unknown, name: "documents" | "media" | (string & {})): unknown
    read(bindings: unknown, key: string): Promise<string | null>
    downloadUrl(bindings: unknown, key: string): Promise<string | null>
  }
  events: {
    deliver(event: unknown, bindings: unknown): Promise<unknown>
  }
  jobs: {
    /**
     * Ask the deployment host to invoke a `wakeup: true` job at `at`.
     *
     * A prompt, never a promise: the host may coalesce, drop, or decline the
     * request, and nothing about it is durable across a restart. The job's
     * declared cadence remains the recovery authority, exactly as it is for a
     * wake requested from outside the process. Callers therefore write their
     * durable state first and request the wake afterwards.
     */
    wakeAt(jobId: string, at: Date): void
  }
  config: {
    read(bindings: unknown, key: string): unknown
  }
}
