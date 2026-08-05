/**
 * Every authority checker must actually run.
 *
 * `verify:architecture` is a hand-maintained `&&` chain in package.json, so
 * adding a checker means writing its `verify:` entry AND remembering to append
 * it to that string. Membership is a substring of a shell command, which means
 * nothing can see it: a script can have an entry, pass locally, and never be
 * executed by CI.
 *
 * That is not hypothetical. Ten of the forty-six authority scripts were
 * unreachable when this check was written, and five of the ten were already
 * failing — unenforced long enough to rot. `operator-frontend-shell`'s test
 * still expected "13 starter src files" after `starters/` became
 * `apps/operator`. See voyant#4272.
 *
 * The same blindness cuts the other way: a script can be reachable through
 * SEVERAL paths, so removing one reference looks sufficient and is not. That
 * cost a near-miss in voyant#4320, where `verify:runtime-ports` invoked a
 * script by filename while `verify:architecture` invoked it by script name.
 *
 * So reachability is computed transitively over `pnpm <script>` references and
 * over direct `node scripts/<file>` invocations, from `verify:architecture` as
 * the single root.
 */
import { readFileSync } from "node:fs"

const ROOT_SCRIPT = "verify:architecture"

/** Scripts reachable from `root`, following `pnpm <name>` references. */
export function reachableScripts(scripts, root = ROOT_SCRIPT) {
  const reached = new Set()
  const queue = [root]
  while (queue.length > 0) {
    const name = queue.shift()
    const body = scripts[name]
    if (body === undefined) continue
    for (const candidate of Object.keys(scripts)) {
      if (reached.has(candidate)) continue
      // `pnpm x` and `pnpm run x`, bounded so `verify:foo` does not match
      // `verify:foo-bar`.
      const pattern = new RegExp(
        `\\bpnpm (?:run )?${candidate.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w:-])`,
      )
      if (pattern.test(body)) {
        reached.add(candidate)
        queue.push(candidate)
      }
    }
  }
  return reached
}

/** Checker filenames invoked directly by any reachable script. */
export function invokedFiles(scripts, reached) {
  const files = new Set()
  for (const name of [ROOT_SCRIPT, ...reached]) {
    for (const match of (scripts[name] ?? "").matchAll(/scripts\/([\w./-]+\.(?:mjs|ts))/g)) {
      files.add(match[1])
    }
  }
  return files
}

/**
 * @param scripts package.json `scripts`
 * @param checkerFiles authority checker filenames, relative to `scripts/`
 * @param allowed checkers deliberately run outside the chain, name -> reason
 */
export function checkChainReachability(scripts, checkerFiles, allowed = {}) {
  const violations = []
  const reached = reachableScripts(scripts)
  const invoked = invokedFiles(scripts, reached)

  for (const file of checkerFiles) {
    if (invoked.has(file)) continue
    const reason = allowed[file]
    if (reason !== undefined) continue
    violations.push(
      `scripts/${file} is never executed: no script reachable from ${ROOT_SCRIPT} invokes it. ` +
        `Add it to the chain, delete it, or record why it runs elsewhere.`,
    )
  }

  // An allowlist entry that no longer describes anything is a stale exemption,
  // and a stale exemption is how a checker quietly stops being required.
  for (const file of Object.keys(allowed)) {
    if (!checkerFiles.includes(file)) {
      violations.push(`allowlist names scripts/${file}, which is not a checker here`)
    } else if (invoked.has(file)) {
      violations.push(`scripts/${file} is in the chain, so its allowlist entry is stale`)
    }
  }

  return violations
}

export function readScripts(packageJsonPath) {
  return JSON.parse(readFileSync(packageJsonPath, "utf8")).scripts ?? {}
}
