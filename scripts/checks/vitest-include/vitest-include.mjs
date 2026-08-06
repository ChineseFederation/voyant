/**
 * Test files that their own package's vitest `include` excludes.
 *
 * Sibling of the typecheck-coverage ratchet (#4244): that one catches test files
 * no CI job TYPECHECKS, this one catches test files no vitest run EXECUTES. Both
 * failures look identical from the outside — a `.test.ts` sitting next to the
 * code, reading as coverage — and both are silent, because a config that never
 * matches a file has nothing to report.
 *
 * Found while measuring the MCP surface: `packages/finance/src/mcp-runtime.test.ts`
 * had never once run, and new assertions added to it passed by not executing. Six
 * files across the repo were in that state, ~34 tests. All of them passed when
 * enabled, so this was pure lost signal rather than hidden breakage — which is
 * exactly why nobody noticed.
 *
 * Deliberately NOT a ratchet with a baseline: the whole set was fixable in one
 * pass, so the rule is simply "zero". A baseline here would institutionalise the
 * thing the check exists to prevent.
 */

/** Config forms whose `include` we can read statically. */
const INCLUDE_ARRAY = /include\s*:\s*\[([^\]]*)\]/
const STRING_LITERAL = /["'`]([^"'`]+)["'`]/g

/**
 * Extract the `include` globs from vitest config source.
 *
 * Returns `null` when the config sets no `include` (vitest's default picks up
 * every `*.test.ts`, so nothing can be excluded) or when `include` is computed
 * rather than a literal array — an unreadable config is reported separately
 * instead of being guessed at.
 */
export function parseIncludeGlobs(source) {
  const match = INCLUDE_ARRAY.exec(source)
  if (!match) return null
  const globs = [...match[1].matchAll(STRING_LITERAL)].map((entry) => entry[1])
  return globs.length > 0 ? globs : null
}

/**
 * Convert one glob to a RegExp.
 *
 * Only the constructs vitest configs here actually use: `{ts,tsx}` alternation,
 * `**` across directory separators, and `*` within a single segment. Anything
 * fancier would be a false sense of precision.
 */
export function globToRegExp(glob) {
  let pattern = ""
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index]
    if (character === "{") {
      const close = glob.indexOf("}", index)
      if (close === -1) {
        pattern += "\\{"
        continue
      }
      const alternatives = glob.slice(index + 1, close).split(",")
      pattern += `(?:${alternatives.map(escapeLiteral).join("|")})`
      index = close
    } else if (character === "*") {
      // `**/` must also match ZERO directories, so `src/**/*.test.ts` covers
      // `src/a.test.ts`. Treating it as one-or-more was the first version of this
      // and it reported files that vitest does in fact run.
      if (glob[index + 1] === "*") {
        if (glob[index + 2] === "/") {
          pattern += "(?:.*/)?"
          index += 2
        } else {
          pattern += ".*"
          index += 1
        }
      } else {
        pattern += "[^/]*"
      }
    } else {
      pattern += escapeLiteral(character)
    }
  }
  return new RegExp(`^${pattern}$`)
}

function escapeLiteral(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Whether any glob matches this package-relative POSIX path. */
export function isIncluded(relativePath, globs) {
  return globs.some((glob) => globToRegExp(glob).test(relativePath))
}
