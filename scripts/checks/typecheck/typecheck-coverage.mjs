/**
 * Typecheck coverage: every test file is typechecked by some CI job.
 *
 * `scripts/run-ci-typechecks.mjs` selects packages via `classifyTypecheck`,
 * which skips any package whose typecheck project covers the same files as its
 * build. A package whose tsconfig includes only `src/**` therefore classifies
 * `build-covers-typecheck` and gets no typecheck job at all — its `src` is
 * still checked by `build`, but nothing checks its tests. See #4244.
 *
 * A test fixture that no longer matches its type is a test asserting against a
 * shape the code does not produce. It still passes, so it reads as coverage of
 * the current contract while actually covering an old one. In `packages/operations`
 * that had happened three times over, and hid 59 genuinely failing tests (#4243).
 *
 * This runs as a RATCHET on MEMBERSHIP, not on file counts. A package that
 * carries unchecked tests today stays listed; a package that does not may never
 * start. Deliberately not a per-package count: 760 test files across 47 packages
 * is debt someone has to work off package by package, and gating the count would
 * mean a drive-by regression test in `finance` fails CI until its author also
 * takes on widening finance's typecheck. That trades a real test for a tidy
 * number. Membership still catches the regression that matters — a NEW package
 * joining the unchecked set, or a listed package growing a `tests/` directory
 * it did not have.
 *
 * The fix for a listed package is the tsconfig split in #4243: `tsconfig.json`
 * includes tests and drops the emit geometry, `tsconfig.build.json` stands alone
 * and re-declares it so tests never reach `dist`.
 */

/** Test files the CI jobs for this workspace do not typecheck. */
export function uncheckedTestFiles({ testFiles, checkedFiles }) {
  return [...testFiles].filter((file) => !checkedFiles.has(file)).sort()
}

/**
 * Violations are packages carrying unchecked tests with no baseline entry.
 * `unchecked` maps package name -> unchecked test file paths.
 */
export function checkAgainstBaseline(unchecked, baseline) {
  const allowed = new Set(baseline)
  const violations = []

  for (const [name, files] of [...unchecked].sort()) {
    if (files.length === 0 || allowed.has(name)) continue
    violations.push(
      `${name}: ${files.length} test file(s) that no CI job typechecks, and no baseline entry. ` +
        `Widen the package's typecheck project to cover tests — see the tsconfig split in #4243 — ` +
        `rather than adding it here.\n      ${files.slice(0, 3).join("\n      ")}` +
        (files.length > 3 ? `\n      … and ${files.length - 3} more` : ""),
    )
  }

  return violations
}

/**
 * Baselined packages that are now clean, so the baseline can be tightened.
 *
 * A package skipped as not analysable is absent from `unchecked` for a reason
 * that is not "clean", so it is excluded — otherwise a clean checkout, where
 * `apps/operator`'s generated projects do not exist yet, would advise dropping
 * an entry that a post-build run needs.
 */
export function improvements(unchecked, baseline, skipped = []) {
  const notAnalysed = new Set(skipped)
  return baseline
    .filter((name) => !notAnalysed.has(name) && (unchecked.get(name)?.length ?? 0) === 0)
    .map((name) => `${name}: now fully typechecked — drop it from the baseline`)
}
