import { spawn, spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export function parseArgs(argv) {
  const options = {
    artifactDir: null,
    databaseUrl: process.env.TEST_DATABASE_URL?.trim() || null,
    mode: "smoke",
    model: "gpt-5.6-terra",
  }
  const values = [...argv]
  while (values.length > 0) {
    const value = values.shift()
    if (value === "--") continue
    if (value === "--mode") {
      options.mode = requiredValue(value, values.shift())
      continue
    }
    if (value === "--model") {
      options.model = requiredValue(value, values.shift())
      continue
    }
    if (value === "--artifacts") {
      options.artifactDir = path.resolve(requiredValue(value, values.shift()))
      continue
    }
    if (value === "--database-url") {
      options.databaseUrl = requiredValue(value, values.shift())
      continue
    }
    if (value === "--help" || value === "-h") {
      options.help = true
      continue
    }
    throw new Error(`unknown option: ${value}`)
  }
  if (!new Set(["smoke", "measure"]).has(options.mode)) {
    throw new Error(`--mode must be smoke or measure, received ${options.mode}`)
  }
  return options
}

export function usage() {
  return `Usage: pnpm eval:mcp-capability -- [options]

Options:
  --mode smoke|measure     One run for smoke, five runs for measurement (default: smoke)
  --model <model>          OpenAI model name (default: gpt-5.6-terra)
  --artifacts <directory>  Result directory (default: .agent-runs/mcp-capability/<timestamp>)
  --database-url <url>     Existing disposable database; otherwise start a temporary Docker Postgres
  --help                   Show this help

Requires OPENAI_API_KEY or ~/.config/agent-run/openai-token. The database is mutated.`
}

function requiredValue(option, value) {
  if (!value) throw new Error(`${option} requires a value`)
  return value
}

function run(command, args, { env = process.env, logFile } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, env, stdio: ["ignore", "pipe", "pipe"] })
    const chunks = []
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", (chunk) => {
        process.stdout.write(chunk)
        chunks.push(chunk)
      })
    }
    child.on("error", reject)
    child.on("close", (code) => {
      if (logFile) writeFileSync(logFile, Buffer.concat(chunks))
      resolvePromise(code ?? 1)
    })
  })
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8" })
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `${command} exited ${result.status}`)
  }
  return result.stdout.trim()
}

function canConnect(port) {
  return new Promise((resolvePromise) => {
    const socket = net.createConnection({ host: "127.0.0.1", port })
    socket.once("connect", () => {
      socket.end()
      resolvePromise(true)
    })
    socket.once("error", () => resolvePromise(false))
  })
}

async function waitForPostgres(port) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await canConnect(port)) return
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
  }
  throw new Error(`timed out waiting for temporary Postgres on port ${port}`)
}

function startTemporaryPostgres() {
  const suffix = randomBytes(5).toString("hex")
  const name = `voyant-mcp-eval-${suffix}`
  capture("docker", [
    "run",
    "--detach",
    "--rm",
    "--name",
    name,
    "--tmpfs",
    "/var/lib/postgresql/data",
    "-e",
    "POSTGRES_USER=voyant_eval",
    "-e",
    "POSTGRES_PASSWORD=voyant_eval",
    "-e",
    "POSTGRES_DB=voyant_eval",
    "-p",
    "127.0.0.1::5432",
    "postgres:16-alpine",
  ])
  const mapping = capture("docker", ["port", name, "5432/tcp"])
  const port = Number(mapping.match(/:(\d+)$/)?.[1])
  if (!Number.isInteger(port)) throw new Error(`could not parse Docker port mapping: ${mapping}`)
  return {
    name,
    port,
    url: `postgresql://voyant_eval:voyant_eval@127.0.0.1:${port}/voyant_eval`,
  }
}

function stopTemporaryPostgres(name) {
  spawnSync("docker", ["stop", name], { cwd: repoRoot, stdio: "inherit" })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(`${usage()}\n`)
    return
  }

  const timestamp = new Date().toISOString().replaceAll(":", "-")
  const artifactDir =
    options.artifactDir ?? path.join(repoRoot, ".agent-runs", "mcp-capability", timestamp)
  mkdirSync(artifactDir, { recursive: true })

  let temporaryDatabase = null
  let databaseUrl = options.databaseUrl
  try {
    if (!databaseUrl) {
      temporaryDatabase = startTemporaryPostgres()
      await waitForPostgres(temporaryDatabase.port)
      databaseUrl = temporaryDatabase.url
    }

    const env = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      TEST_DATABASE_URL: databaseUrl,
      POSTGRES_SEARCH_CURSOR_SIGNING_KEY:
        process.env.POSTGRES_SEARCH_CURSOR_SIGNING_KEY ??
        "mcp-capability-eval-catalog-cursor-signing-key",
      VOYANT_EVAL_MODEL: options.model,
      VOYANT_EVAL_REPORT_FILE: path.join(artifactDir, "report.json"),
      VOYANT_EVAL_RUNS: options.mode === "measure" ? "5" : "1",
    }
    writeFileSync(
      path.join(artifactDir, "run.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          startedAt: new Date().toISOString(),
          mode: options.mode,
          model: options.model,
          runs: Number(env.VOYANT_EVAL_RUNS),
          database: temporaryDatabase ? "temporary-docker" : "provided",
        },
        null,
        2,
      )}\n`,
    )

    let status = await run("pnpm", ["--filter", "operator", "prepare:verify"], {
      env,
      logFile: path.join(artifactDir, "prepare.log"),
    })
    if (status === 0) {
      status = await run("pnpm", ["-C", "apps/operator", "db:migrate"], {
        env: {
          ...env,
          NODE_OPTIONS: [
            env.NODE_OPTIONS,
            "--conditions=development",
            "--import=tsx",
            "--max-old-space-size=8192",
          ]
            .filter(Boolean)
            .join(" "),
        },
        logFile: path.join(artifactDir, "migrate.log"),
      })
    }
    if (status === 0) {
      status = await run(
        "pnpm",
        [
          "-C",
          "apps/operator",
          "exec",
          "vitest",
          "run",
          "tests/mcp-capability.test.ts",
          "--config",
          ".voyant/vitest.config.ts",
        ],
        { env, logFile: path.join(artifactDir, "eval.log") },
      )
    }
    writeFileSync(path.join(artifactDir, "exit-code.txt"), `${status}\n`)
    process.stdout.write(`MCP capability artifacts: ${artifactDir}\n`)
    process.exitCode = status
  } finally {
    if (temporaryDatabase) stopTemporaryPostgres(temporaryDatabase.name)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
