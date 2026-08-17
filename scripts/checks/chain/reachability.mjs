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

const escapeForRegExp = (value) => value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Whether `body` runs `scriptName` for `packageName` — `pnpm --filter <pkg>
 * <script>`, its `-F` spelling, or a workspace-wide `pnpm -r <script>`.
 *
 * Bounded to a single command (`[^&|;]*`) so two unrelated commands joined by
 * `&&` cannot be read as one filtered invocation.
 */
function runsPackageScript(body, packageName, scriptName) {
  const script = escapeForRegExp(scriptName)
  const pkg = escapeForRegExp(packageName)
  const boundary = "(?![\\w:-])"
  if (new RegExp(`\\bpnpm (?:-r|--recursive)\\b[^&|;]*?\\b${script}${boundary}`).test(body)) {
    return true
  }
  return new RegExp(
    `\\bpnpm [^&|;]*?(?:--filter|-F)[= ]['"]?${pkg}['"]?[^&|;]*?\\b${script}${boundary}`,
  ).test(body)
}

/**
 * The same reachability question for checkers that live inside a package
 * (`packages/<pkg>/scripts/check-*authority*.mjs`) rather than in the root
 * `scripts/` directory.
 *
 * Those are invisible to {@link checkChainReachability}, which enumerates the
 * root directory and matches invocations by path: the chain can only reach a
 * package checker through a script *name*, filtered to the package or run
 * across the workspace. Exactly one such checker existed when this was written,
 * and it had been unreachable long enough to rot through three separate module
 * moves — it claimed a `storefront` document that had been renamed, plus two
 * API bundles that had moved to other packages, and failed on the first
 * assertion. Nothing noticed, because nothing ran it (voyant#4627).
 *
 * @param scripts root package.json `scripts`
 * @param packageCheckers `{ file, packageName, scriptNames }`, `file` repo-relative
 * @param allowed checkers deliberately run outside the chain, file -> reason
 */
export function checkPackageCheckerReachability(scripts, packageCheckers, allowed = {}) {
  const violations = []
  const reached = reachableScripts(scripts)
  const bodies = [ROOT_SCRIPT, ...reached].map((name) => scripts[name] ?? "")

  for (const { file, packageName, scriptNames } of packageCheckers) {
    if (allowed[file] !== undefined) continue
    if (scriptNames.length === 0) {
      violations.push(
        `${file} has no script in ${packageName}'s package.json that runs it, ` +
          `so no chain link can reach it. Add one and chain it, or delete the checker.`,
      )
      continue
    }
    const runs = scriptNames.some((scriptName) =>
      bodies.some((body) => runsPackageScript(body, packageName, scriptName)),
    )
    if (runs) continue
    violations.push(
      `${file} is never executed: no script reachable from ${ROOT_SCRIPT} runs ` +
        `${scriptNames.join(" or ")} for ${packageName}. Add ` +
        `\`pnpm --filter ${packageName} ${scriptNames[0]}\` to the chain, delete it, ` +
        `or record why it runs elsewhere.`,
    )
  }

  const files = new Set(packageCheckers.map((checker) => checker.file))
  for (const file of Object.keys(allowed)) {
    if (file.includes("/") && !files.has(file)) {
      violations.push(`allowlist names ${file}, which is not a checker here`)
    }
  }

  return violations
}
