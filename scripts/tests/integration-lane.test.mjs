import assert from "node:assert/strict"
import { test } from "node:test"

import {
  checkAgainstBaseline,
  improvements,
  lanedFilesIn,
  unrunIntegrationFiles,
} from "../checks/integration-lane/integration-lane.mjs"

const WORKFLOW = `
      - name: Run \${{ matrix.lane }} database lane
        run: |
          case "\${{ matrix.lane }}" in
            integration)
              pnpm --filter @voyant-travel/relationships exec vitest run \\
                tests/integration/inquiries.test.ts
              pnpm --filter @voyant-travel/bookings exec vitest run \\
                tests/integration/routes.test.ts
              ;;
          esac
`

test("pairs each laned path with the package that runs it", () => {
  assert.deepEqual([...lanedFilesIn(WORKFLOW)].sort(), [
    "@voyant-travel/bookings::tests/integration/routes.test.ts",
    "@voyant-travel/relationships::tests/integration/inquiries.test.ts",
  ])
})

test("a same-named file in another package is not covered by the lane", () => {
  const unrun = unrunIntegrationFiles({
    integrationFiles: [
      {
        package: "@voyant-travel/finance",
        path: "tests/integration/routes.test.ts",
        repoPath: "packages/finance/tests/integration/routes.test.ts",
      },
    ],
    lanedFiles: lanedFilesIn(WORKFLOW),
  })

  assert.deepEqual(unrun, ["packages/finance/tests/integration/routes.test.ts"])
})

test("a file the lane names is not reported", () => {
  const unrun = unrunIntegrationFiles({
    integrationFiles: [
      {
        package: "@voyant-travel/relationships",
        path: "tests/integration/inquiries.test.ts",
        repoPath: "packages/relationships/tests/integration/inquiries.test.ts",
      },
    ],
    lanedFiles: lanedFilesIn(WORKFLOW),
  })

  assert.deepEqual(unrun, [])
})

test("a new unrun file is a violation and a baselined one is not", () => {
  const unrun = [
    "packages/a/tests/integration/new.test.ts",
    "packages/b/tests/integration/old.test.ts",
  ]
  const baseline = ["packages/b/tests/integration/old.test.ts"]

  assert.deepEqual(checkAgainstBaseline(unrun, baseline), [
    "packages/a/tests/integration/new.test.ts",
  ])
})

test("a baselined file that now runs is reported as an improvement", () => {
  assert.deepEqual(
    improvements(
      ["packages/b/tests/integration/old.test.ts"],
      ["packages/a/tests/integration/fixed.test.ts", "packages/b/tests/integration/old.test.ts"],
    ),
    ["packages/a/tests/integration/fixed.test.ts"],
  )
})

// A lane entry that names no file must not be read as covering everything.
test("a lane with no vitest commands covers nothing", () => {
  assert.equal(lanedFilesIn("pnpm build\npnpm test\n").size, 0)
})
