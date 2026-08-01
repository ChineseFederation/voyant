import { spawnSync } from "node:child_process"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const composeFile = path.join(repoRoot, "docker-compose.test.yml")
const composeProject = "voyant-test"
const testDbPort = process.env.TEST_DATABASE_PORT ?? "5436"

function buildDefaultTestDbUrl(port) {
  const url = new URL("postgres://localhost")
  url.port = port
  url.pathname = "/voyant_test"
  url.username = "test"
  url.password = "test"
  return url.toString()
}

const testDbUrl = process.env.TEST_DATABASE_URL ?? buildDefaultTestDbUrl(testDbPort)

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    ...options,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    env: process.env,
    ...options,
  })

  if (result.status !== 0) {
    const stderr = result.stderr?.trim()
    if (stderr) {
      console.error(stderr)
    }
    process.exit(result.status ?? 1)
  }

  return result.stdout?.trim() ?? ""
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: Number(port) })

    socket.once("connect", () => {
      socket.end()
      resolve(true)
    })
    socket.once("error", () => resolve(false))
  })
}

async function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await canConnect(testDbPort)) {
      const probe = spawnSync(
        "docker",
        [
          "compose",
          "-p",
          composeProject,
          "-f",
          composeFile,
          "exec",
          "-T",
          "test-db",
          "pg_isready",
          "-U",
          "test",
          "-d",
          "voyant_test",
        ],
        {
          cwd: repoRoot,
          stdio: "ignore",
        },
      )

      if (probe.status === 0) {
        return
      }
    }

    await sleep(1000)
  }

  console.error(`Timed out waiting for test Postgres on port ${testDbPort}.`)
  process.exit(1)
}

function findDockerContainerForPort(port) {
  const psOutput = capture("docker", ["ps", "--format", "{{.Names}}\t{{.Ports}}"])
  const lines = psOutput.split("\n").filter(Boolean)

  for (const line of lines) {
    const [name, ports] = line.split("\t")
    if (!name || !ports) {
      continue
    }

    if (
      ports.includes(`0.0.0.0:${port}->5432/tcp`) ||
      ports.includes(`127.0.0.1:${port}->5432/tcp`) ||
      ports.includes(`[::]:${port}->5432/tcp`)
    ) {
      return name
    }
  }

  return null
}

function ensureCurrentBookingsSchema(containerName) {
  const ensureSql = `
    CREATE TABLE IF NOT EXISTS booking_session_states (
      id text PRIMARY KEY,
      booking_id text NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      state_key text NOT NULL DEFAULT 'wizard',
      current_step text,
      completed_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
      payload jsonb,
      version integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_booking_session_states_booking
      ON booking_session_states (booking_id);
    CREATE INDEX IF NOT EXISTS idx_booking_session_states_key
      ON booking_session_states (state_key);
    CREATE UNIQUE INDEX IF NOT EXISTS uidx_booking_session_states_booking_key
      ON booking_session_states (booking_id, state_key);
  `

  run("docker", [
    "exec",
    containerName,
    "psql",
    "-U",
    "test",
    "-d",
    "voyant_test",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    ensureSql,
  ])
}

async function main() {
  console.log(`Using test database: ${testDbUrl}`)

  let containerName = null
  let startedContainer = false

  if (!process.env.TEST_DATABASE_URL) {
    const portOpen = await canConnect(testDbPort)

    if (!portOpen) {
      run("docker", ["compose", "-p", composeProject, "-f", composeFile, "up", "-d"])
      await waitForPostgres()
      startedContainer = true
    }

    containerName = findDockerContainerForPort(testDbPort)
    if (!containerName) {
      console.error(
        `Could not find a Docker container exposing the configured test DB port ${testDbPort}.`,
      )
      process.exit(1)
    }
  }

  const migrate = spawnSync("pnpm", ["-C", "apps/operator", "db:migrate"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: testDbUrl,
    },
  })

  if ((migrate.status ?? 1) !== 0) {
    if (startedContainer) {
      process.exit(migrate.status ?? 1)
    }

    console.warn(
      "Skipping db:migrate failure because an existing test database is already running and seeded.",
    )
  }

  if (containerName) {
    ensureCurrentBookingsSchema(containerName)
  }

  const bookingTestFiles = [
    "tests/integration/public-routes.test.ts",
    "tests/integration/routes.test.ts",
    "tests/integration/pii.test.ts",
  ]

  for (const testFile of bookingTestFiles) {
    run("pnpm", ["exec", "vitest", "run", testFile], {
      cwd: path.join(repoRoot, "packages/bookings"),
      env: {
        ...process.env,
        TEST_DATABASE_URL: testDbUrl,
        TEST_DATABASE_PORT: testDbPort,
      },
    })
  }
}

await main()
