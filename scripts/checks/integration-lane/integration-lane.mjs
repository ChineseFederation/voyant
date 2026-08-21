/**
 * Integration-lane coverage: a new DB integration test may not run nowhere.
 *
 * The `db-integration` lane in `.github/workflows/ci.yml` names every file it
 * runs, one `pnpm --filter <pkg> exec vitest run <path>` per file. Membership is
 * therefore a literal string inside a shell script inside a workflow, which
 * nothing can see: a file added under `tests/integration/` looks like coverage,
 * passes review, and is never executed.
 *
 * That is not hypothetical. Inquiry management (#4838) added seven integration
 * files and listed none of them. Two were RED — the guarded public intake and
 * the legacy Booking Inquiry adapter each returned 500 and rolled the customer's
 * submission back — and the pull request stayed green.
 *
 * This runs as a RATCHET on MEMBERSHIP, matching `verify:typecheck-coverage`.
 * Most existing files already run nowhere (#4251) and working that debt off is
 * its own project; gating the count would mean a drive-by regression test fails
 * CI until its author also adopts an unrelated backlog. Membership still catches
 * the regression that matters: a file that is NEW to the unrun set.
 *
 * The fix for a new file is one line in the lane, not an entry in the baseline.
 */

const LANE_COMMAND =
  /--filter\s+(?<pkg>\S+)\s+exec\s+vitest\s+run\s+(?<paths>(?:\\\s*\n\s*|[^\n\\])+)/g

/**
 * Every (package, path) pair the workflow runs.
 *
 * Read as text rather than parsed YAML on purpose: the lane is a shell script
 * inside a `run:` block, so the commands are not YAML nodes. Pairing each path
 * with the `--filter` that precedes it keeps two packages that both own a
 * `tests/integration/routes.test.ts` distinct — a suffix match would report the
 * unlisted one as covered.
 */
export function lanedFilesIn(workflowSource) {
  const found = new Set()
  for (const match of workflowSource.matchAll(LANE_COMMAND)) {
    const pkg = match.groups?.pkg
    const paths = match.groups?.paths ?? ""
    if (!pkg) continue
    for (const token of paths.split(/[\s\\]+/)) {
      if (!/\.tsx?$/.test(token)) continue
      found.add(`${pkg}::${token.replace(/^\.\//, "")}`)
    }
  }
  return found
}

/**
 * Integration test files no lane command names.
 *
 * `integrationFiles` are `{ package, path }`, where `path` is relative to the
 * package directory — the same shape the lane uses.
 */
export function unrunIntegrationFiles({ integrationFiles, lanedFiles }) {
  return integrationFiles
    .filter((file) => !lanedFiles.has(`${file.package}::${file.path}`))
    .map((file) => file.repoPath)
    .sort()
}

/** Violations are unrun files with no baseline entry. */
export function checkAgainstBaseline(unrun, baseline) {
  const allowed = new Set(baseline)
  return unrun.filter((file) => !allowed.has(file))
}

/** Baselined files that now run, or no longer exist, so the baseline can shrink. */
export function improvements(unrun, baseline) {
  const stillUnrun = new Set(unrun)
  return [...baseline].filter((file) => !stillUnrun.has(file)).sort()
}
