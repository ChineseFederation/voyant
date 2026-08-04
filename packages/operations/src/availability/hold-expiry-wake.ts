/**
 * Wake channel for the expired-hold reaper.
 *
 * A hold decrements `availability_slots.remaining_pax` the moment a checkout
 * reserves seats, and only the reaper puts them back — so how late the reaper
 * runs is how long capacity nobody can book stays unbookable. Polling for that
 * meant every managed tenant woke its database four times an hour whether or
 * not a single hold existed.
 *
 * The expiry instant is known when the hold is written, so the reaper does not
 * need a poll to discover it. Whoever places or extends a hold reports the new
 * expiry here, and the deployment host arms a wake for it. The reaper re-arms
 * itself from the database on every run, which is what recovers the timer
 * after a restart.
 *
 * Every step is best-effort by design: an unbound channel, a dropped wake, or
 * a process that dies with a timer armed all fall back to the job's declared
 * cadence, which stays the recovery authority.
 */

/** Graph job id of the reaper this channel wakes. */
export const OPERATIONS_EXPIRED_HOLDS_JOB_ID = "operations.release-expired-availability-holds"

export type AvailabilityHoldExpiryWake = (jobId: string, at: Date) => void

let requestWake: AvailabilityHoldExpiryWake | undefined

/**
 * Bind the deployment's job-wake channel. Called once by the Operations
 * runtime contributor, which is the only place that holds host primitives.
 */
export function configureAvailabilityHoldExpiryWake(wake: AvailabilityHoldExpiryWake): void {
  requestWake = wake
}

/** Test seam: drop the bound channel so a suite cannot leak into the next one. */
export function resetAvailabilityHoldExpiryWake(): void {
  requestWake = undefined
}

/**
 * Ask for the reaper to run once `expiresAt` has passed.
 *
 * Safe to call before the hold's transaction commits, and safe to call for a
 * hold whose transaction then rolls back: the wake is armed for a future
 * instant the write will long since have settled by, and a wake that finds
 * nothing to reap simply re-arms from whatever the database does hold.
 */
export function requestAvailabilityHoldExpiryWake(expiresAt: Date): void {
  if (!requestWake) return
  requestWake(OPERATIONS_EXPIRED_HOLDS_JOB_ID, expiresAt)
}
