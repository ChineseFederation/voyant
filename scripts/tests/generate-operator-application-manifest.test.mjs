import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"

import {
  buildOperatorApplicationManifest,
  writeOperatorApplicationManifest,
} from "../generate-operator-application-manifest.mjs"

test("derives the first-party product closure and preserves authored dependencies", () => {
  const root = fixture()
  try {
    assert.deepEqual(buildOperatorApplicationManifest(root), {
      name: "operator",
      private: true,
      scripts: { start: "voyant start" },
      dependencies: {
        "@voyant-travel/bookings": "workspace:^",
        "@voyant-travel/runtime": "workspace:^",
        react: "^19.0.0",
      },
      devDependencies: { vitest: "catalog:" },
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("emits deterministically and detects manifest drift", () => {
  const root = fixture()
  try {
    assert.equal(writeOperatorApplicationManifest(root, { check: true }), true)
    assert.equal(writeOperatorApplicationManifest(root), true)
    assert.equal(writeOperatorApplicationManifest(root, { check: true }), false)
    assert.equal(
      readFileSync(join(root, "apps/operator/package.json"), "utf8").endsWith("\n"),
      true,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("rejects dependencies repeated by authored intent and the standard product", () => {
  const root = fixture({
    dependencies: {
      "@voyant-travel/bookings": "workspace:^",
      "@voyant-travel/runtime": "workspace:^",
    },
  })
  try {
    assert.throws(
      () => buildOperatorApplicationManifest(root),
      /repeats standard product dependencies: @voyant-travel\/bookings/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("requires standard product third-party dependencies to remain explicit", () => {
  const root = fixture({
    dependencies: { "@voyant-travel/runtime": "workspace:^" },
  })
  try {
    assert.throws(
      () => buildOperatorApplicationManifest(root),
      /must explicitly preserve standard product third-party dependencies: react/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

function fixture({ dependencies } = {}) {
  const root = mkdtempSync(join(tmpdir(), "voyant-operator-application-manifest-"))
  writeJson(root, "apps/operator/package.intent.json", {
    manifest: { name: "operator", private: true, scripts: { start: "voyant start" } },
    dependencies: dependencies ?? {
      "@voyant-travel/runtime": "workspace:^",
      react: "^19.0.0",
    },
    devDependencies: { vitest: "catalog:" },
  })
  writeJson(root, "apps/operator/package.json", { name: "stale" })
  writeJson(root, "packages/operator-standard/package.json", {
    dependencies: {
      "@voyant-travel/bookings": "workspace:*",
      react: "^19.0.0",
    },
  })
  return root
}

function writeJson(root, path, value) {
  const destination = join(root, path)
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, `${JSON.stringify(value, null, 2)}\n`)
}
