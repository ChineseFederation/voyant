import { readdirSync, readFileSync } from "node:fs"
import { extname, join, relative, sep } from "node:path"
import ts from "typescript"

const ROOT = process.cwd()
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"])
const failures = []
const files = sourceFiles("packages").filter(isProductionSource)
const sources = new Map(files.map((file) => [file, parse(file)]))
const bookingInsertAuthorities = new Set([
  // Staff/manual creation settles an admitted Finance command.
  "packages/bookings/src/service-core.ts",
  // Supplier-first Commit settles only after the Supplier Operation is secured;
  // its caller owns the surrounding transaction and operation lock.
  "packages/bookings/src/service-sourced-commitment.ts",
])

for (const [file, routePath] of [
  ["packages/bookings/src/routes-admin.ts", "/reserve"],
  ["packages/bookings/src/routes-admin.ts", "/from-product"],
]) {
  if (hasPostRoute(file, routePath)) fail(file, `forbidden POST route ${routePath}`)
}
for (const file of files.filter((path) =>
  path.startsWith("packages/catalog/src/booking-engine/"),
)) {
  if (hasPostRoute(file, "/book")) fail(file, "forbidden POST route /book")
}

for (const [file, path, method] of [
  ["packages/bookings/openapi/admin/bookings.json", "/v1/admin/bookings", "post"],
  ["packages/bookings/openapi/admin/bookings.json", "/v1/admin/bookings/reserve", "post"],
  ["packages/bookings/openapi/admin/bookings.json", "/v1/admin/bookings/from-product", "post"],
  ["packages/catalog/openapi/admin/catalog-booking.json", "/v1/admin/catalog/book", "post"],
  ["packages/catalog/openapi/public-api/catalog-booking.json", "/v1/public/catalog/book", "post"],
]) {
  const document = JSON.parse(readFileSync(file, "utf8"))
  if (document.paths?.[path]?.[method]) fail(file, `forbidden OpenAPI operation ${method} ${path}`)
}

assertPackageExportAbsent("packages/finance/package.json", "./booking-create-command")
assertPackageExportAbsent("packages/catalog/package.json", "./booking-engine/book")

// Who may name the command entrypoints — the staff one, the `book_product`
// one, the self-service one, the private shared core, and the Commit-facing
// runtime factory — now lives in the declarative `booking-create-authority`
// policy in scripts/checks/symbols/symbol-policy.json, which additionally
// rejects a stale allowlist entry and denies the whole `packages/*-react/**`
// family. Do not restate those allowlists here.

// The route module is composed into the public API bundle, never exported.
assertPackageExportAbsent("packages/finance/package.json", "./self-service-create-runtime")

// The confused-deputy boundary, mechanically: the staff Tool never names the
// self-service policy, and the route runtime never names the staff policy.
assertReferencesWithin(
  "FINANCE_BOOKING_CREATE_SELF_SERVICE_HANDLER_POLICY",
  new Set([
    "packages/finance/src/booking-create-policy.ts",
    "packages/finance/src/booking-create-command.ts",
  ]),
)
assertReferencesWithin(
  "FINANCE_BOOKING_CREATE_HANDLER_POLICY",
  new Set([
    "packages/finance/src/booking-create-policy.ts",
    "packages/finance/src/booking-create-command.ts",
    "packages/finance/src/tools.ts",
  ]),
)
// A self-service action reachable from a Tool definition would defeat the
// transport split, so its identity must never appear in the Tool module.
for (const identifier of [
  "FINANCE_BOOKING_CREATE_SELF_SERVICE_ACTION",
  "FINANCE_BOOKING_CREATE_SELF_SERVICE_ROUTE_ACTION",
]) {
  assertAbsentFrom(identifier, "packages/finance/src/tools.ts")
}
assertReferencesWithin(
  "executeCreatedTargetCommand",
  new Set(["packages/action-ledger/src/created-command-internal.ts"]),
)
assertReferencesWithin(
  "createBookingMutation",
  new Set([
    "packages/finance/src/booking-create-command.ts",
    "packages/finance/src/service-booking-create.ts",
  ]),
)
assertReferencesWithin(
  "settleBookingCreateDomain",
  new Set([
    "packages/bookings/src/booking-create-command-domain.ts",
    "packages/bookings/src/service-core.ts",
    "packages/finance/src/service-booking-create.ts",
  ]),
)
assertReferencesWithin(
  "convertProductToBooking",
  new Set(["packages/bookings/src/service-core.ts"]),
)
assertReferencesWithin("reserveBooking", new Set())
assertReferencesWithin("materializeBookingFromSnapshot", new Set())
assertReferencesWithin(
  "createSourcedBookingCommitment",
  new Set([
    "packages/bookings/src/index.ts",
    "packages/bookings/src/service-sourced-commitment.ts",
    "packages/catalog/src/booking-engine/sessions-production.ts",
  ]),
)

for (const [file, source] of sources) {
  walk(source, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "insert" &&
      node.arguments.length > 0 &&
      ts.isIdentifier(node.arguments[0]) &&
      node.arguments[0].text === "bookings" &&
      !bookingInsertAuthorities.has(file)
    ) {
      fail(file, "booking-row insert escaped the lease-gated Bookings settlement")
    }
    if (
      file.startsWith("packages/cruises/src/") &&
      !file.startsWith("packages/cruises/src/adapters/") &&
      ts.isCallExpression(node) &&
      ((ts.isIdentifier(node.expression) && node.expression.text === "createBooking") ||
        (ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "createBooking"))
    ) {
      fail(file, "CruiseAdapter.createBooking escaped the provider boundary")
    }
  })
}

assertImportAndCall(
  "packages/finance/src/mcp-booking-runtime.ts",
  "./booking-create-command.js",
  "executeFinanceStaffBookingCreateCommand",
)
assertImportAndCall(
  "packages/finance/src/booking-create-command.ts",
  "@voyant-travel/action-ledger",
  "executeAdmittedCreatedTargetCommand",
)
assertImportAndCall(
  "packages/finance/src/booking-create-command.ts",
  "./service-booking-create.js",
  "createBookingMutation",
)
assertImportAndCall(
  "packages/finance/src/service-booking-create.ts",
  "@voyant-travel/bookings/booking-create-command-domain",
  "settleBookingCreateDomain",
)
assertImportAndCall(
  "packages/bookings/src/service-core.ts",
  "@voyant-travel/action-ledger",
  "consumeCreatedTargetMutationLease",
)
assertCall(
  "packages/action-ledger/src/created-command-internal.ts",
  "assertAuthenticHandlerActionPolicyContext",
)
assertCall("packages/finance/src/tools.ts", "admitHandlerActionPolicy")

if (failures.length) {
  console.error([...new Set(failures)].join("\n"))
  process.exitCode = 1
} else {
  console.log(
    "Booking creation authority is the admitted Finance command and lease-gated Bookings settlement.",
  )
}

function parse(file) {
  const extension = extname(file)
  const kind =
    extension === ".tsx"
      ? ts.ScriptKind.TSX
      : extension === ".jsx"
        ? ts.ScriptKind.JSX
        : [".js", ".mjs", ".cjs"].includes(extension)
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, kind)
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name).split(sep).join("/")
    if (entry.isDirectory())
      return entry.name === "dist" || entry.name === "node_modules" ? [] : sourceFiles(path)
    return entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : []
  })
}

function isProductionSource(file) {
  return !file.includes("/tests/") && !/\.test\.[^.]+$/.test(file) && !/\.spec\.[^.]+$/.test(file)
}

function walk(node, visit) {
  visit(node)
  ts.forEachChild(node, (child) => walk(child, visit))
}

function importedBindings(file, moduleName, importedName) {
  const bindings = new Set()
  walk(sources.get(file) ?? parse(file), (node) => {
    if (!ts.isImportDeclaration(node) || node.moduleSpecifier.text !== moduleName) return
    const clause = node.importClause
    if (clause?.name && importedName === "default") bindings.add(clause.name.text)
    const named = clause?.namedBindings
    if (named && ts.isNamedImports(named)) {
      for (const element of named.elements) {
        if ((element.propertyName ?? element.name).text === importedName)
          bindings.add(element.name.text)
      }
    }
  })
  return bindings
}

function callNames(file) {
  const names = new Set()
  walk(sources.get(file) ?? parse(file), (node) => {
    if (!ts.isCallExpression(node)) return
    if (ts.isIdentifier(node.expression)) names.add(node.expression.text)
  })
  return names
}

function assertImportAndCall(file, moduleName, importedName) {
  const bindings = importedBindings(file, moduleName, importedName)
  if (!bindings.size) return fail(file, `missing exact import ${importedName} from ${moduleName}`)
  const calls = callNames(file)
  if (![...bindings].some((binding) => calls.has(binding))) {
    fail(file, `imported ${importedName} is not called`)
  }
}

function assertCall(file, name) {
  if (!callNames(file).has(name)) fail(file, `required authority call ${name} is absent`)
}

function assertAbsentFrom(identifier, file) {
  const source = sources.get(file)
  if (!source) return
  walk(source, (node) => {
    if (ts.isIdentifier(node) && node.text === identifier) {
      fail(file, `${identifier} must not be referenced here`)
    }
  })
}

function assertReferencesWithin(identifier, allowedFiles) {
  for (const [file, source] of sources) {
    let referenced = false
    walk(source, (node) => {
      if (ts.isIdentifier(node) && node.text === identifier) referenced = true
    })
    if (referenced && !allowedFiles.has(file))
      fail(file, `${identifier} escaped its authority allowlist`)
  }
}

function hasPostRoute(file, routePath) {
  let found = false
  walk(sources.get(file) ?? parse(file), (node) => {
    if (
      !ts.isCallExpression(node) ||
      !ts.isIdentifier(node.expression) ||
      node.expression.text !== "createRoute"
    )
      return
    const object = node.arguments[0]
    if (!object || !ts.isObjectLiteralExpression(object)) return
    const values = Object.fromEntries(
      object.properties.flatMap((property) => {
        if (!ts.isPropertyAssignment(property)) return []
        const key = property.name.getText().replaceAll(/['"]/g, "")
        return ts.isStringLiteralLike(property.initializer)
          ? [[key, property.initializer.text]]
          : []
      }),
    )
    if (values.method === "post" && values.path === routePath) found = true
  })
  return found
}

function assertPackageExportAbsent(file, subpath) {
  const pkg = JSON.parse(readFileSync(file, "utf8"))
  if (pkg.exports?.[subpath] || pkg.publishConfig?.exports?.[subpath]) {
    fail(file, `public export ${subpath} must be absent`)
  }
}

function fail(file, message) {
  failures.push(`${relative(ROOT, join(ROOT, file))}: ${message}`)
}
