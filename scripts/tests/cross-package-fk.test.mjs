import assert from "node:assert/strict"
import test from "node:test"

import { checkCrossPackageForeignKeys } from "../checks/schema/cross-package-fk.ts"
import {
  collectValueImports,
  findCrossPackageReferences,
} from "../checks/schema/cross-package-fk-runner.ts"

const reference = (overrides = {}) => ({
  pkg: "operations",
  target: "identity",
  file: "packages/operations/src/ground/schema-dispatch.ts",
  line: 21,
  symbol: "identityAddresses",
  ...overrides,
})

const declaring = (pkg, ...targets) => new Map([[pkg, new Set(targets)]])

test("a cross-package FK backed by requiresSchemas is allowed", () => {
  const { violations, allowed } = checkCrossPackageForeignKeys(
    [reference()],
    declaring("operations", "identity"),
  )
  assert.deepEqual(violations, [])
  assert.equal(allowed.length, 1)
})

test("a cross-package FK without a declared schema requirement fails", () => {
  // This is the property the check exists for: migration ordering is derived
  // from requiresSchemas, so an undeclared FK can be generated before the
  // referenced table exists.
  const { violations } = checkCrossPackageForeignKeys(
    [reference()],
    declaring("operations", "availability"),
  )
  assert.equal(violations.length, 1)
  assert.match(violations[0], /does not list "@voyant-travel\/identity" in voyant\.requiresSchemas/)
})

test("a package declaring nothing at all fails rather than being skipped", () => {
  const { violations } = checkCrossPackageForeignKeys([reference()], new Map())
  assert.equal(violations.length, 1)
})

test("foundation packages need no declaration", () => {
  const { violations, allowed } = checkCrossPackageForeignKeys(
    [reference({ target: "db", symbol: "organizations" })],
    new Map(),
  )
  assert.deepEqual(violations, [])
  assert.equal(allowed.length, 0, "foundation references are exempt, not merely permitted")
})

test("type-only imports are not treated as foreign keys", () => {
  // `import type` is erased and creates no constraint. Counting it would make
  // the checker reject code that generates no SQL.
  const imports = collectValueImports(
    'import type { identityAddresses } from "@voyant-travel/identity/schema"',
  )
  assert.equal(imports.size, 0)
})

test("aliased value imports resolve to the aliased local name", () => {
  const imports = collectValueImports(
    'import { identityAddresses as addresses } from "@voyant-travel/identity/schema"',
  )
  assert.equal(imports.get("addresses"), "identity")
})

test("findCrossPackageReferences ignores same-package references", () => {
  const source = [
    'import { groundOperators } from "./schema-operators.js"',
    'import { identityAddresses } from "@voyant-travel/identity/schema"',
    "export const t = pgTable('t', {",
    "  operatorId: typeIdRef('operator_id').references(() => groundOperators.id),",
    "  addressId: typeIdRef('address_id').references(() => identityAddresses.id),",
    "})",
  ].join("\n")

  const found = findCrossPackageReferences("packages/operations/src/ground/schema.ts", source)
  assert.equal(found.length, 1)
  assert.equal(found[0].target, "identity")
  assert.equal(found[0].symbol, "identityAddresses")
})

test("findCrossPackageReferences ignores references inside comments", () => {
  const source = [
    'import { identityAddresses } from "@voyant-travel/identity/schema"',
    "// .references(() => identityAddresses.id) — retired, kept as a note",
    "export const t = pgTable('t', { addressId: typeIdRef('address_id') })",
  ].join("\n")

  assert.deepEqual(findCrossPackageReferences("packages/operations/src/schema.ts", source), [])
})
