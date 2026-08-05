/**
 * Near-match suggestion for name-shaped arguments (voyant#3950).
 *
 * `ToolError` has carried `candidates` and `didYouMean` since voyant#3947, but
 * nothing populated them, so both were dead. The one place a candidate set is
 * genuinely free is a lookup against a registry that is already in memory —
 * a tool name, a resource name, an operation name — which is also where an agent
 * fails most often, because it types the name from memory or from a description.
 */

/**
 * Damerau-Levenshtein distance, capped: returns `max + 1` as soon as the true
 * distance is known to exceed `max`.
 *
 * The cap is what makes this safe to run against a few hundred names on an error
 * path. A short row is cheap, and the early exit skips the rest of a name that
 * has already diverged too far to suggest.
 *
 * Transpositions count as one edit, not two, because the mistakes this exists to
 * catch are typing mistakes: `get_bokoing` should reach `get_booking`.
 */
export function boundedEditDistance(left: string, right: string, max: number): number {
  if (left === right) return 0
  if (Math.abs(left.length - right.length) > max) return max + 1

  let previous = Array.from({ length: right.length + 1 }, (_, i) => i)
  let beforePrevious: number[] = []

  for (let i = 1; i <= left.length; i += 1) {
    const current = [i, ...Array.from<number>({ length: right.length }).fill(0)]
    let rowMin = current[0] as number
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      let value = Math.min(
        (current[j - 1] as number) + 1,
        (previous[j] as number) + 1,
        (previous[j - 1] as number) + cost,
      )
      if (
        i > 1 &&
        j > 1 &&
        left[i - 1] === right[j - 2] &&
        left[i - 2] === right[j - 1] &&
        beforePrevious.length > 0
      ) {
        value = Math.min(value, (beforePrevious[j - 2] as number) + 1)
      }
      current[j] = value
      if (value < rowMin) rowMin = value
    }
    // Every later row is >= this row's minimum, so once the whole row exceeds
    // the cap the final distance does too.
    if (rowMin > max) return max + 1
    beforePrevious = previous
    previous = current
  }
  return previous[right.length] as number
}

/** How close a name must be to be worth suggesting, scaled to its length. */
function toleranceFor(name: string): number {
  if (name.length <= 4) return 1
  if (name.length <= 8) return 2
  return 3
}

export interface NearMatches {
  /** Names close enough to suggest, nearest first. Empty when nothing is close. */
  candidates: string[]
  /** The single nearest name, when one is clearly closest. */
  didYouMean?: string
}

/**
 * Find the names closest to `name` among `known`.
 *
 * Returns at most `limit` because the point is a suggestion an agent can act on,
 * not a directory listing — dumping every registered name into an error is what
 * this replaces, and it costs more context than it saves.
 *
 * `didYouMean` is set only when the nearest match is strictly nearer than the
 * runner-up. Two equally-close names mean we do not actually know which was
 * intended, and asserting one would send the agent confidently to the wrong tool.
 */
export function findNearMatches(name: string, known: Iterable<string>, limit = 5): NearMatches {
  const tolerance = toleranceFor(name)
  const scored: Array<{ name: string; distance: number }> = []
  for (const candidate of known) {
    if (candidate === name) continue
    const distance = boundedEditDistance(name, candidate, tolerance)
    if (distance <= tolerance) scored.push({ name: candidate, distance })
  }
  scored.sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))

  const candidates = scored.slice(0, limit).map(({ name: n }) => n)
  const nearest = scored[0]
  const runnerUp = scored[1]
  const unambiguous =
    nearest !== undefined && (runnerUp === undefined || runnerUp.distance > nearest.distance)
  return unambiguous ? { candidates, didYouMean: nearest.name } : { candidates }
}
