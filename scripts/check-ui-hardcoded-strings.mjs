import { access, readdir, readFile } from "node:fs/promises"
import path from "node:path"

import ts from "typescript"

const rootDir = process.cwd()

const ignoredDirectoryNames = new Set(["dist", "node_modules"])
const ignoredFileSuffixes = [".d.ts", ".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"]
const localeSensitiveIntlConstructors = new Set([
  "Collator",
  "DateTimeFormat",
  "DisplayNames",
  "ListFormat",
  "NumberFormat",
  "PluralRules",
  "RelativeTimeFormat",
  "Segmenter",
])
const localeSensitiveMethods = new Set([
  "localeCompare",
  "toLocaleDateString",
  "toLocaleLowerCase",
  "toLocaleString",
  "toLocaleTimeString",
  "toLocaleUpperCase",
])
const userFacingPropertyNames = new Set([
  "aria-description",
  "aria-label",
  "ariaDescription",
  "ariaLabel",
  "badge",
  "breadcrumb",
  "buttonLabel",
  "caption",
  "confirmLabel",
  "description",
  "emptyMessage",
  "errorMessage",
  "groupLabel",
  "heading",
  "helpText",
  "label",
  "message",
  "noun",
  "placeholder",
  "setupSteps",
  "subtitle",
  "text",
  "title",
  "tooltip",
])
const nonUserFacingLiterals = new Set([
  "",
  "-",
  " *",
  "?",
  "EUR",
  "GBP",
  "RON",
  "USD",
  "UTC",
  "Europe/Bucharest",
  "Voyant",
  "FREQ=DAILY;INTERVAL=1",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
])

function isCatalogDirectory(name) {
  return name === "i18n" || name.endsWith("-i18n")
}

function isCatalogFile(filePath) {
  return /^i18n\.tsx?$/.test(path.basename(filePath))
}

function looksLikeTailwindUtility(value) {
  const stripped = value
    .replace(/\$\{[^}]*\}/g, "")
    .replace(/[`"']/g, "")
    .trim()
  if (!stripped) return false

  return stripped.split(/\s+/).every((token) => {
    const bareToken = token.replace(/^[a-z0-9_-]+:/i, "")
    return (
      /^(?:[a-z0-9[\]()./%#,:_-]+!?|\[[^\]]+\])$/i.test(token) &&
      (/^(?:absolute|block|contents|flex|grid|hidden|inline|relative|sticky|truncate)$/.test(
        bareToken,
      ) ||
        /(?:^|:)(?:accent|animate|auto|bg|border|bottom|capitalize|center|col|cursor|duration|ease|flex|font|gap|grid|h|inset|items|justify|left|line|lowercase|m|mb|min|ml|mr|mt|mx|my|opacity|overflow|p|pb|pl|pointer|pr|pt|px|py|resize|right|ring|rounded|row|scroll|shadow|shrink|size|sm|space|sr|tabular|text|top|touch|tracking|transition|uppercase|w|whitespace|z)-/.test(
          token,
        ))
    )
  })
}

function looksLikeProtocolOrIdentifier(value) {
  return (
    /^\{[A-Za-z_$][\w$]*\}$/.test(value) ||
    /^&[a-z]+;$/.test(value) ||
    /^@[a-z0-9-]+\/[a-z0-9-]+#[a-z0-9._-]+$/i.test(value) ||
    /^__[a-z0-9_-]+__$/i.test(value) ||
    /^[A-Z0-9]{2,6}$/.test(value) ||
    /^\d+-[a-z]+$/i.test(value) ||
    /^(?:ft|m|cm|km)[²³]?$/.test(value) ||
    /^(?:https?:|mailto:|tel:|\/|\.\/|\.\.\/|#)/.test(value) ||
    /^(?:[a-z]+:)?\/\//i.test(value) ||
    /^(?:[a-z][a-z0-9]*)(?:[._:/-][a-z0-9]+)+$/i.test(value) ||
    /^[a-z][A-Za-z0-9]*$/.test(value) ||
    /^--[a-z0-9-]+$/.test(value) ||
    /^#[0-9a-f]{3,8}$/i.test(value) ||
    /^(?:rgb|hsl|oklch)a?\(/i.test(value)
  )
}

function isKnownNonUserFacingLiteral(value) {
  const normalized = value.replace(/\s+/g, " ").trim()
  return (
    nonUserFacingLiterals.has(normalized) ||
    /^[A-Z]{2,4}$/.test(normalized) ||
    looksLikeTailwindUtility(normalized) ||
    looksLikeProtocolOrIdentifier(normalized)
  )
}

function isSuspiciousCopy(value) {
  const normalized = value.replace(/\s+/g, " ").trim()
  return /[\p{L}]/u.test(normalized) && !isKnownNonUserFacingLiteral(normalized)
}

function propertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text
  }
  return null
}

function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return null
}

function isAmbientLocaleArgument(node) {
  return (
    node === undefined ||
    node.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(node) && node.text === "undefined")
  )
}

function intlConstructorName(expression) {
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "Intl"
  ) {
    return expression.name.text
  }
  return null
}

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function containsI18nSeam(rootPath) {
  const entries = await readdir(rootPath, { withFileTypes: true })
  for (const entry of entries) {
    if (ignoredDirectoryNames.has(entry.name)) continue
    const filePath = path.join(rootPath, entry.name)
    if (entry.isDirectory()) {
      if (await containsI18nSeam(filePath)) return true
      continue
    }

    const parentName = path.basename(path.dirname(filePath))
    if (
      (entry.name === "index.ts" && isCatalogDirectory(parentName)) ||
      /^i18n\.tsx?$/.test(entry.name)
    ) {
      return true
    }
  }
  return false
}

async function collectOptInRoots() {
  const roots = []
  const packagesDir = path.join(rootDir, "packages")
  const packageNames = await readdir(packagesDir).catch(() => [])

  for (const packageName of packageNames) {
    const sourceRoot = path.join(packagesDir, packageName, "src")
    if ((await exists(sourceRoot)) && (await containsI18nSeam(sourceRoot))) roots.push(sourceRoot)
  }

  const applicationsDir = path.join(rootDir, "apps")
  const applicationNames = await readdir(applicationsDir).catch(() => [])

  for (const applicationName of applicationNames) {
    const adminI18nEntry = path.join(
      applicationsDir,
      applicationName,
      "src",
      "lib",
      "admin-i18n.tsx",
    )
    if (!(await exists(adminI18nEntry))) continue

    const voyantComponents = path.join(
      applicationsDir,
      applicationName,
      "src",
      "components",
      "voyant",
    )
    if (await exists(voyantComponents)) roots.push(voyantComponents)
  }

  return roots.sort()
}

async function collectSourceFiles(rootPath) {
  const results = []

  async function walk(currentPath) {
    const entries = await readdir(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const nextPath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        if (!ignoredDirectoryNames.has(entry.name) && !isCatalogDirectory(entry.name)) {
          await walk(nextPath)
        }
        continue
      }

      if (
        /\.tsx?$/.test(entry.name) &&
        !isCatalogFile(nextPath) &&
        !ignoredFileSuffixes.some((suffix) => entry.name.endsWith(suffix))
      ) {
        results.push(nextPath)
      }
    }
  }

  await walk(rootPath)
  return results.sort()
}

function findSuspiciousNodes(filePath, source) {
  const findings = []
  const seen = new Set()
  const lines = source.split("\n")
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )

  function isSuppressed(line, marker) {
    return lines[line]?.includes(marker) || (line > 0 && lines[line - 1]?.includes(marker))
  }

  function addDiagnostic(node, text, suppressionMarker) {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    if (isSuppressed(line, suppressionMarker)) return

    const key = `${line}:${text}`
    if (seen.has(key)) return
    seen.add(key)
    findings.push({ filePath, line: line + 1, text })
  }

  function addFinding(node, value) {
    const normalized = value.replace(/\s+/g, " ").trim()
    if (!isSuspiciousCopy(normalized)) return

    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    if (isSuppressed(line, "i18n-literal-ok")) return

    const key = `${line}:${normalized}`
    if (seen.has(key)) return
    seen.add(key)
    findings.push({ filePath, line: line + 1, text: normalized })
  }

  function addLiteralTree(node) {
    const value = literalText(node)
    if (value !== null) addFinding(node, value)
    ts.forEachChild(node, addLiteralTree)
  }

  function visit(node, insideJsxExpression = false) {
    if (ts.isJsxText(node)) {
      addFinding(node, node.text)
      return
    }

    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile)
      if (userFacingPropertyNames.has(name) && node.initializer) {
        addLiteralTree(node.initializer)
      }
      return
    }

    if (ts.isJsxExpression(node)) {
      if (node.expression) visit(node.expression, true)
      return
    }

    if (insideJsxExpression) {
      const value = literalText(node)
      if (value !== null) addFinding(node, value)
    }

    if (ts.isPropertyAssignment(node)) {
      const name = propertyNameText(node.name)
      if (name && userFacingPropertyNames.has(name)) addLiteralTree(node.initializer)
    }

    if (ts.isReturnStatement(node) && node.expression && literalText(node.expression) !== null) {
      addLiteralTree(node.expression)
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      localeSensitiveMethods.has(node.expression.name.text) &&
      isAmbientLocaleArgument(node.arguments[0])
    ) {
      addDiagnostic(
        node,
        `ambient locale formatting: ${node.expression.name.text}() requires an explicit locale`,
        "i18n-format-ok",
      )
    }

    if (ts.isNewExpression(node) || ts.isCallExpression(node)) {
      const constructorName = intlConstructorName(node.expression)
      if (
        constructorName &&
        localeSensitiveIntlConstructors.has(constructorName) &&
        isAmbientLocaleArgument(node.arguments?.[0])
      ) {
        addDiagnostic(
          node,
          `ambient locale formatting: Intl.${constructorName} requires an explicit locale`,
          "i18n-format-ok",
        )
      }
    }

    ts.forEachChild(node, (child) => visit(child, insideJsxExpression))
  }

  visit(sourceFile)
  return findings.sort((left, right) => left.line - right.line)
}

async function findSuspiciousLines(filePath) {
  return findSuspiciousNodes(filePath, await readFile(filePath, "utf8"))
}

async function main() {
  const roots = await collectOptInRoots()
  if (roots.length === 0) {
    console.error("ui hardcoded string scan failed: no package-owned i18n entrypoints found.")
    process.exit(1)
  }

  const findings = []
  for (const rootPath of roots) {
    for (const filePath of await collectSourceFiles(rootPath)) {
      findings.push(...(await findSuspiciousLines(filePath)))
    }
  }

  if (findings.length > 0) {
    console.error("hardcoded UI string scan failed:\n")
    for (const finding of findings) {
      console.error(`- ${path.relative(rootDir, finding.filePath)}:${finding.line} ${finding.text}`)
    }
    process.exit(1)
  }

  console.log(`ui hardcoded string scan passed across ${roots.length} i18n-enabled roots.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
