#!/usr/bin/env node
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { stdin as input, stdout as output } from "node:process"
import readline from "node:readline/promises"

const repoRoot = process.cwd()
const registryUrl = "https://registry.npmjs.org"
const publishScope = "@voyant-travel/"
const ignoredDirs = new Set([".git", ".turbo", "dist", "node_modules"])

const args = new Set(process.argv.slice(2))
const dryRun = args.has("--dry-run")
const yes = args.has("--yes")
const skipRegistry = args.has("--skip-registry-check")
const includePrivate = args.has("--include-private")

const namedArgs = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i]
  if (arg.startsWith("--") && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) {
    namedArgs.set(arg, process.argv[i + 1])
    i += 1
  }
}

const initialOtp =
  namedArgs.get("--otp") ?? process.env.NPM_OTP ?? process.env.npm_config_otp ?? null
const fromPackage = namedArgs.get("--from") ?? null
const onlyPackage = namedArgs.get("--only") ?? null

if (!dryRun && !yes) {
  console.error("Refusing to publish without --yes. Use --dry-run to preview.")
  process.exit(1)
}

function walkPackageJsonFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        files.push(...walkPackageJsonFiles(absolute))
      }
      continue
    }

    if (entry.name === "package.json") {
      files.push(absolute)
    }
  }

  return files
}

function readWorkspacePackages() {
  const roots = ["packages", "apps", "examples"]
    .map((dir) => path.join(repoRoot, dir))
    .filter((dir) => fs.existsSync(dir))

  const packages = []

  for (const root of roots) {
    for (const packageJsonPath of walkPackageJsonFiles(root)) {
      const manifest = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
      if (!manifest.name?.startsWith(publishScope)) continue
      if (manifest.private && !includePrivate) continue

      packages.push({
        name: manifest.name,
        version: manifest.version,
        dir: path.dirname(packageJsonPath),
        manifest,
      })
    }
  }

  return packages.sort((a, b) => a.name.localeCompare(b.name))
}

function internalDependencies(pkg, packageNames) {
  const dependencyBlocks = [
    pkg.manifest.dependencies,
    pkg.manifest.peerDependencies,
    pkg.manifest.optionalDependencies,
  ]

  const deps = new Set()
  for (const block of dependencyBlocks) {
    for (const name of Object.keys(block ?? {})) {
      if (packageNames.has(name)) deps.add(name)
    }
  }

  return [...deps].sort()
}

function dependencyLayers(packages) {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]))
  const packageNames = new Set(byName.keys())
  const edges = new Map()

  for (const pkg of packages) {
    edges.set(pkg.name, internalDependencies(pkg, packageNames))
  }

  let index = 0
  const stack = []
  const onStack = new Set()
  const indices = new Map()
  const lows = new Map()
  const components = []

  function strongConnect(name) {
    indices.set(name, index)
    lows.set(name, index)
    index += 1
    stack.push(name)
    onStack.add(name)

    for (const dependency of edges.get(name) ?? []) {
      if (!indices.has(dependency)) {
        strongConnect(dependency)
        lows.set(name, Math.min(lows.get(name), lows.get(dependency)))
      } else if (onStack.has(dependency)) {
        lows.set(name, Math.min(lows.get(name), indices.get(dependency)))
      }
    }

    if (lows.get(name) === indices.get(name)) {
      const component = []
      let current
      do {
        current = stack.pop()
        onStack.delete(current)
        component.push(current)
      } while (current !== name)
      components.push(component.sort())
    }
  }

  for (const name of [...packageNames].sort()) {
    if (!indices.has(name)) strongConnect(name)
  }

  const componentByName = new Map()
  components.forEach((component, componentIndex) => {
    component.forEach((name) => {
      componentByName.set(name, componentIndex)
    })
  })

  const componentDeps = components.map(() => new Set())
  const reverseDeps = components.map(() => new Set())

  for (const [name, deps] of edges) {
    const from = componentByName.get(name)
    for (const dep of deps) {
      const to = componentByName.get(dep)
      if (from !== to) {
        componentDeps[from].add(to)
        reverseDeps[to].add(from)
      }
    }
  }

  const remaining = new Set(components.map((_, componentIndex) => componentIndex))
  const layers = []

  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((componentIndex) => componentDeps[componentIndex].size === 0)
      .sort((a, b) => components[a][0].localeCompare(components[b][0]))

    if (ready.length === 0) {
      throw new Error("Could not resolve package dependency layers")
    }

    layers.push(ready.map((componentIndex) => components[componentIndex]))

    for (const componentIndex of ready) {
      remaining.delete(componentIndex)
      for (const dependent of reverseDeps[componentIndex]) {
        componentDeps[dependent].delete(componentIndex)
      }
    }
  }

  return layers
}

function flattenLayers(layers, packagesByName) {
  return layers.flatMap((layer) =>
    layer
      .flat()
      .sort((a, b) => a.localeCompare(b))
      .map((name) => packagesByName.get(name)),
  )
}

async function packageVersionExists(pkg) {
  const encodedName = pkg.name.replace("@", "%40").replace("/", "%2f")
  const response = await fetch(`${registryUrl}/${encodedName}/${pkg.version}`, {
    headers: { accept: "application/json" },
  })

  if (response.status === 404) return false
  if (response.ok) return true

  throw new Error(`Registry check failed for ${pkg.name}@${pkg.version}: HTTP ${response.status}`)
}

function run(command, commandArgs, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString()
      stdout += text
      output.write(text)
    })

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString()
      stderr += text
      output.write(text)
    })

    child.on("close", (code) => resolve({ code, stdout, stderr }))
  })
}

function looksLikeOtpFailure(result) {
  const combined = `${result.stdout}\n${result.stderr}`.toLowerCase()
  return (
    combined.includes("eotp") ||
    combined.includes("one-time pass") ||
    combined.includes("one time pass") ||
    combined.includes("otp") ||
    combined.includes("two-factor") ||
    combined.includes("2fa")
  )
}

async function askOtp(rl, prompt = "npm OTP: ") {
  const otp = (await rl.question(prompt)).trim()
  if (!otp) throw new Error("OTP is required to publish")
  return otp
}

async function publishPackage(pkg, otp, rl) {
  let currentOtp = otp

  for (;;) {
    if (!currentOtp) currentOtp = await askOtp(rl, `npm OTP for ${pkg.name}: `)

    const result = await run(
      "pnpm",
      ["publish", "--access", "public", "--no-git-checks", "--otp", currentOtp],
      {
        cwd: pkg.dir,
        env: {
          ...process.env,
          NPM_CONFIG_PROVENANCE: "false",
        },
      },
    )

    if (result.code === 0) return currentOtp

    if (looksLikeOtpFailure(result)) {
      console.error(`OTP failed or expired while publishing ${pkg.name}.`)
      currentOtp = await askOtp(rl, `Fresh npm OTP for ${pkg.name}: `)
      continue
    }

    throw new Error(`Publish failed for ${pkg.name}@${pkg.version}`)
  }
}

function printPlan(layers, packagesByName) {
  for (const [index, layer] of layers.entries()) {
    console.log(`Layer ${index + 1}`)
    for (const component of layer) {
      const line = component
        .map((name) => {
          const pkg = packagesByName.get(name)
          return `${pkg.name}@${pkg.version}`
        })
        .join(", ")
      console.log(`  ${line}`)
    }
  }
}

const packages = readWorkspacePackages()
const packagesByName = new Map(packages.map((pkg) => [pkg.name, pkg]))
let layers = dependencyLayers(packages)

if (onlyPackage) {
  if (!packagesByName.has(onlyPackage)) {
    console.error(`Unknown workspace package: ${onlyPackage}`)
    process.exit(1)
  }
  layers = [[[onlyPackage]]]
}

let plan = flattenLayers(layers, packagesByName)

if (fromPackage) {
  const fromIndex = plan.findIndex((pkg) => pkg.name === fromPackage)
  if (fromIndex === -1) {
    console.error(`Unknown --from package: ${fromPackage}`)
    process.exit(1)
  }
  plan = plan.slice(fromIndex)
}

console.log(`Found ${packages.length} publishable ${publishScope} workspace packages.`)
printPlan(layers, packagesByName)

if (dryRun) {
  console.log("\nDry run only. No packages were published.")
  process.exit(0)
}

const rl = readline.createInterface({ input, output })
let otp = initialOtp

try {
  for (const pkg of plan) {
    const label = `${pkg.name}@${pkg.version}`

    if (!skipRegistry && (await packageVersionExists(pkg))) {
      console.log(`Skipping ${label}; this version already exists on npm.`)
      continue
    }

    console.log(`\nPublishing ${label} from ${path.relative(repoRoot, pkg.dir)}...`)
    otp = await publishPackage(pkg, otp, rl)
  }

  console.log("\nPublish loop complete.")
} finally {
  rl.close()
}
