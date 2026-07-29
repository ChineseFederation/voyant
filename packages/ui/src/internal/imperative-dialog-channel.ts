export interface ImperativeDialogChannel<Request> {
  sequence: number
  listeners: Set<(request: Request) => void>
}

/**
 * Keep imperative dialog callers and hosts connected even when the UI package
 * is split into separate browser chunks (or bundled more than once).
 *
 * A module-local Set is not sufficient: each emitted copy gets its own Set,
 * so a caller can wait forever while the mounted host listens elsewhere.
 */
export function getImperativeDialogChannel<Request>(
  name: string,
): ImperativeDialogChannel<Request> {
  const key = Symbol.for(`@voyant-travel/ui/imperative-dialog/${name}`)
  const registry = globalThis as Record<PropertyKey, unknown>
  const existing = registry[key] as ImperativeDialogChannel<Request> | undefined

  if (existing) return existing

  const channel: ImperativeDialogChannel<Request> = {
    sequence: 0,
    listeners: new Set(),
  }
  registry[key] = channel
  return channel
}
