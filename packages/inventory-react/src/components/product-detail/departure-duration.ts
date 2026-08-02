/**
 * Resolve an explicit product duration into the departure's end instant.
 * Adding on the instant timeline keeps the elapsed duration correct across
 * daylight-saving transitions; the form renders the result in the slot zone.
 */
export function deriveDepartureEndIso(
  startsAt: string,
  durationMinutes: number | null | undefined,
): string | null {
  if (!Number.isInteger(durationMinutes) || (durationMinutes ?? 0) <= 0) return null
  const startsAtMs = Date.parse(startsAt)
  if (!Number.isFinite(startsAtMs)) return null
  return new Date(startsAtMs + (durationMinutes as number) * 60_000).toISOString()
}
