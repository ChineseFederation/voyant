/**
 * The outbox's own event vocabulary, kept apart from `./outbox.ts` so the
 * deployment manifest can name it without importing Drizzle and the schema.
 * `voyant.ts` has to stay import-cheap, and an event id is not worth a
 * database client.
 */

/**
 * Emitted the moment a durable event exhausts its attempts and is
 * dead-lettered — the one point at which "this side effect did not happen"
 * becomes final rather than pending.
 *
 * Until this existed the row simply went `failed` and nothing looked at it:
 * eight failed settlements of a captured card payment left a customer charged
 * with no booking, and the only signal was the customer complaining
 * (voyant#4636). Subscribers decide what a given loss is worth — see the
 * stranded-payment staff alert in `@voyant-travel/notifications`.
 */
export const EVENT_DEAD_LETTERED = "event.dead_lettered"

export interface EventDeadLetteredEvent {
  /** Outbox row id, so an operator can find the row this refers to. */
  outboxId: string
  /** The envelope's own id, as emitted. */
  eventId: string
  /** Name of the event that could not be delivered. */
  name: string
  attempts: number
  error: string
  /**
   * What every retained attempt decided, oldest first — `error` is only the
   * last of these.
   *
   * A settlement chain that refused eight times kept one verdict, so nothing
   * could say whether the early, in-window attempts failed for the reason the
   * final one reports or for a different one (voyant#4692). Optional because a
   * row written before the column existed has no history to carry.
   */
  attemptErrors?: Array<{ attempt: number; error: string; at: string }>
  /** The undelivered payload, so a resolver need not re-derive what it named. */
  payload: unknown
}

/** Manifest payload schema; mirrors {@link EventDeadLetteredEvent}. */
export const eventDeadLetteredPayloadSchema = {
  type: "object",
  required: ["outboxId", "eventId", "name", "attempts", "error"],
  properties: {
    outboxId: { type: "string" },
    eventId: { type: "string" },
    name: { type: "string" },
    attempts: { type: "integer" },
    error: { type: "string" },
    attemptErrors: {
      type: "array",
      items: {
        type: "object",
        required: ["attempt", "error", "at"],
        properties: {
          attempt: { type: "integer" },
          error: { type: "string" },
          at: { type: "string" },
        },
      },
    },
    payload: {},
  },
} as const
