/**
 * The set of files an architecture checker is allowed to see: the tracked tree.
 *
 * Checkers that walk the filesystem from the repository root see whatever
 * happens to be on disk — a git worktree parked in the root, a leftover
 * directory from a deleted package, a stale `.tsbuildinfo`. None of that is this
 * tree's source, and none of it exists in CI's clean checkout.
 *
 * That is not merely noisy. It goes BOTH ways, and the second is the dangerous
 * one:
 *
 *   false red    a checker fails locally on content CI never sees, so its
 *                failures get dismissed as "just my worktrees" — which is how a
 *                real failure gets dismissed too
 *   false green  a checker resolves a DIFFERENT checkout's files and validates
 *                those instead, reporting success while the real tree is broken.
 *                Observed: check-retail-spine-closure.mjs printed "Verified
 *                retail spine package closure" against `worktrees/<branch>/
 *                packages/*` while this tree carried a forbidden edge that CI
 *                then caught (voyant#4281).
 *
 * Asking git removes the whole class, with no ignore list to maintain: if a file
 * is not tracked, it is not this tree's source.
 *
 * `trackedFilesIn` deliberately returns null for anything that is not a git
 * toplevel, because several checkers accept `--root <fixture>` and drive
 * themselves over a synthetic tree in a temp directory. Those fixtures are not
 * repositories and must keep working — a checker that silently found nothing
 * there would turn its own vacuity tests green while checking nothing, which is
 * the exact failure this module exists to prevent.
 */
import { execFileSync } from "node:child_process"
import path from "node:path"

const cache = new Map()

/**
 * Tracked paths under `root`, repo-relative with POSIX separators, or **null**
 * when `root` is not the toplevel of a git repository.
 */
export function trackedFilesIn(root) {
  const key = path.resolve(root)
  if (cache.has(key)) return cache.get(key)

  let files = null
  try {
    const toplevel = execFileSync("git", ["-C", key, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    if (path.resolve(toplevel) === key) {
      const stdout = execFileSync("git", ["-C", key, "ls-files", "-z"], {
        encoding: "utf8",
        maxBuffer: 1 << 28,
      })
      files = stdout.split("\0").filter((entry) => entry !== "")
    }
  } catch {
    files = null // not a repository, or git is unavailable
  }

  cache.set(key, files)
  return files
}

/** Test seam: drop the cached listings. */
export function resetTrackedFilesCache() {
  cache.clear()
}
