#!/usr/bin/env node
/**
 * Demo-data seed script for the operator admin app.
 *
 * Populates the currently-empty detail pages (organizations, suppliers, proposals,
 * finance/invoices, bookings) with realistic records so the UI can be audited
 * against real data.
 *
 * Plain Node ESM. No new dependencies: uses global `fetch` and a hand-rolled
 * cookie jar. `better-auth/crypto` and `pg` (both already operator dependencies)
 * are used only to (re)set the admin password when a login attempt fails.
 *
 * Usage (from apps/operator):
 *   node scripts/seed-demo.mjs
 *
 * Environment:
 *   SEED_BASE_URL        default http://localhost:3300
 *   SEED_ADMIN_EMAIL     default admin@example.com
 *   SEED_ADMIN_PASSWORD  default seed-demo-password
 *   DATABASE_URL         only needed for the password-reset fallback; read from
 *                        .env if not already exported.
 *   SEED_RESET_PASSWORD  set to "0" to disable the reset fallback.
 *
 * Auth model: the admin realm is local Better Auth. If the configured
 * email/password cannot sign in, and the reset fallback is enabled, the script
 * hashes SEED_ADMIN_PASSWORD with Better Auth's scrypt and writes it to the
 * `credential` account row over DATABASE_URL, then retries.
 *
 * Safe to re-run: every entity is looked up by a stable marker (name / tag /
 * number) before it is created, so a second run reuses existing records.
 *
 * The API is mounted under `/api/v1/admin/*` (the SSR app owns `/v1/*`).
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const OPERATOR_DIR = join(HERE, "..")

const BASE_URL = (process.env.SEED_BASE_URL ?? "http://localhost:3300").replace(/\/$/, "")
const API = `${BASE_URL}/api/v1/admin`
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com"
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "seed-demo-password"
const RESET_PASSWORD = process.env.SEED_RESET_PASSWORD !== "0"

const DEMO_TAG = "demo-seed"

// --- tiny cookie jar ---------------------------------------------------------

const cookies = new Map()

function storeCookies(res) {
  // Node's fetch exposes multiple Set-Cookie via getSetCookie().
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie")]
        : []
  for (const line of raw) {
    const [pair] = line.split(";")
    const eq = pair.indexOf("=")
    if (eq === -1) continue
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    if (value === "" || value === "deleted") cookies.delete(name)
    else cookies.set(name, value)
  }
}

function cookieHeader() {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
}

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: BASE_URL,
      cookie: cookieHeader(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  storeCookies(res)
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = { _raw: text.slice(0, 200) }
  }
  return { ok: res.ok, status: res.status, json }
}

// --- auth --------------------------------------------------------------------

async function signIn(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/admin/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE_URL, cookie: cookieHeader() },
    body: JSON.stringify({ email, password }),
  })
  storeCookies(res)
  return res.status
}

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const env = readFileSync(join(OPERATOR_DIR, ".env"), "utf8")
    const match = env.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m)
    return match?.[1]
  } catch {
    return undefined
  }
}

async function resetAdminPassword() {
  const databaseUrl = readDatabaseUrl()
  if (!databaseUrl) {
    throw new Error(
      "auth: password reset needs DATABASE_URL (exported, or set in apps/operator/.env).",
    )
  }
  const { hashPassword } = await import("better-auth/crypto")
  const { default: pg } = await import("pg")
  // Connect over the wire from DATABASE_URL — the database is not assumed to be
  // a container, let alone one with a particular name.
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query(
      `UPDATE account SET password = $1, updated_at = now()
         FROM "user" u
        WHERE account.user_id = u.id
          AND account.provider_id = 'credential'
          AND u.email = $2`,
      [await hashPassword(ADMIN_PASSWORD), ADMIN_EMAIL],
    )
  } finally {
    await client.end()
  }
}

async function authenticate() {
  let status = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD)
  if (status === 200) {
    console.log(`auth: signed in as ${ADMIN_EMAIL}`)
    return
  }
  if (!RESET_PASSWORD) {
    throw new Error(
      `auth: sign-in failed (${status}) and password reset disabled. ` +
        `Run again with SEED_ADMIN_PASSWORD=<the real password>.`,
    )
  }
  console.log(`auth: sign-in failed (${status}); resetting password for ${ADMIN_EMAIL}…`)
  await resetAdminPassword()
  status = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD)
  if (status !== 200) {
    throw new Error(`auth: sign-in still failing after reset (${status}).`)
  }
  console.log(`auth: password reset and signed in; demo credential is "${ADMIN_PASSWORD}"`)
}

// --- helpers -----------------------------------------------------------------

async function list(path) {
  const { ok, json } = await api("GET", path)
  if (!ok) return []
  return json?.data ?? []
}

/** Find one existing row matching `pred`, else POST `body`. Returns {id, created}. */
async function ensure(label, listPath, pred, createPath, body) {
  const existing = (await list(listPath)).find(pred)
  if (existing) {
    console.log(`  · ${label}: reused ${existing.id}`)
    return { id: existing.id, row: existing, created: false }
  }
  const { ok, status, json } = await api("POST", createPath, body)
  if (!ok || !json?.data?.id) {
    console.log(`  ✗ ${label}: create failed (${status}) ${JSON.stringify(json)?.slice(0, 160)}`)
    return { id: undefined, created: false, error: true }
  }
  console.log(`  ✓ ${label}: created ${json.data.id}`)
  return { id: json.data.id, row: json.data, created: true }
}

// --- seed --------------------------------------------------------------------

async function main() {
  console.log(`Seeding demo data → ${API}\n`)
  await authenticate()

  const summary = {}

  // 1. Organization -----------------------------------------------------------
  console.log("\norganization:")
  const org = await ensure(
    "organization",
    "/relationships/organizations?limit=100",
    (o) => o.name === "Demo Voyage Agency SRL",
    "/relationships/organizations",
    {
      name: "Demo Voyage Agency SRL",
      legalName: "Demo Voyage Agency S.R.L.",
      relation: "partner",
      industry: "Travel Agency",
      website: "https://demo-voyage.example",
      defaultCurrency: "EUR",
      paymentTerms: 30,
      tags: [DEMO_TAG],
    },
  )
  summary.organization = org.id

  // 2. Supplier ---------------------------------------------------------------
  console.log("\nsupplier:")
  const supplier = await ensure(
    "supplier",
    "/suppliers?limit=100",
    (s) => s.name === "Carpathian Guides SRL",
    "/suppliers",
    {
      name: "Carpathian Guides SRL",
      type: "guide",
      status: "active",
      description: "Mountain and circuit guiding across the Carpathians.",
      email: "ops@carpathianguides.example",
      phone: "+40 721 000 111",
      city: "Sibiu",
      country: "RO",
      defaultCurrency: "EUR",
      paymentTermsDays: 14,
      tags: [DEMO_TAG],
    },
  )
  summary.supplier = supplier.id

  // 3. Proposal (needs a pipeline + stage) ---------------------------------------
  console.log("\nproposal:")
  const person = (await list("/relationships/people?limit=50")).find(
    (p) => p.firstName === "Andrei" && p.lastName === "Ionescu",
  )
  const personId = person?.id
  if (!personId) console.log("  ! person 'Andrei Ionescu' not found; proposal will be unlinked")

  const pipeline = await ensure(
    "pipeline",
    "/proposals/pipelines?limit=100",
    (p) => p.name === "Demo Sales Pipeline",
    "/proposals/pipelines",
    { name: "Demo Sales Pipeline", isDefault: true },
  )
  const stage = pipeline.id
    ? await ensure(
        "stage",
        `/proposals/stages?pipelineId=${pipeline.id}&limit=100`,
        (s) => s.name === "Qualification",
        "/proposals/stages",
        { pipelineId: pipeline.id, name: "Qualification", probability: 50 },
      )
    : { id: undefined }

  let proposal = { id: undefined }
  if (pipeline.id && stage.id) {
    proposal = await ensure(
      "proposal",
      "/proposals/proposals?limit=100",
      (q) => q.title === "Circuit Transfăgărășan pentru Andrei",
      "/proposals/proposals",
      {
        title: "Circuit Transfăgărășan pentru Andrei",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ...(personId ? { personId } : {}),
        status: "open",
        valueAmountCents: 250000,
        valueCurrency: "EUR",
        paxCount: 2,
        expectedCloseDate: "2026-09-01",
        description: "Two-day Transfăgărășan circuit for a couple.",
        tags: [DEMO_TAG],
      },
    )
  } else {
    console.log("  ✗ proposal: skipped (no pipeline/stage)")
  }
  summary.proposal = proposal.id

  // 4. Booking (Circuit Transfăgărășan + its open departure) ------------------
  console.log("\nbooking:")
  const product = (await list("/products?limit=100")).find((p) =>
    (p.name ?? "").startsWith("Circuit Transfăgărășan"),
  )
  let booking = { id: undefined }
  if (!product) {
    console.log("  ✗ booking: skipped ('Circuit Transfăgărășan' product not found)")
  } else {
    const option = (await list(`/products/options?productId=${product.id}`)).find(
      (o) => o.isDefault,
    )
    const slot = (
      await list(`/operations/availability/slots?productId=${product.id}&limit=20`)
    ).find((s) => s.status === "open")
    // Idempotency by a fixed booking number.
    const BOOKING_NUMBER = "BK-DEMO-TRANSF-0001"
    booking = await ensure(
      "booking",
      `/bookings?limit=100`,
      (b) => b.bookingNumber === BOOKING_NUMBER,
      "/bookings/from-product",
      {
        productId: product.id,
        bookingNumber: BOOKING_NUMBER,
        ...(option ? { optionId: option.id } : {}),
        ...(slot ? { slotId: slot.id } : {}),
        ...(personId ? { personId } : {}),
        pax: 2,
        internalNotes: "Demo seed booking for UI audit.",
      },
    )
    if (slot) console.log(`    (departure ${slot.id} @ ${slot.dateLocal})`)
    else console.log("    (! no open departure found; booked at product level)")
  }
  summary.booking = booking.id

  // 5. Invoice (header + one line item, linked to the booking) ----------------
  console.log("\ninvoice:")
  let invoice = { id: undefined }
  if (!booking.id) {
    console.log("  ✗ invoice: skipped (no booking to attach to)")
  } else {
    const INVOICE_NUMBER = "INV-DEMO-0001"
    invoice = await ensure(
      "invoice",
      "/finance/invoices?limit=100",
      (i) => i.invoiceNumber === INVOICE_NUMBER,
      "/finance/invoices",
      {
        invoiceNumber: INVOICE_NUMBER,
        bookingId: booking.id,
        ...(personId ? { personId } : {}),
        currency: "EUR",
        issueDate: "2026-07-24",
        dueDate: "2026-08-24",
        status: "issued",
        subtotalCents: 250000,
        totalCents: 250000,
        balanceDueCents: 250000,
        notes: "Demo seed invoice for UI audit.",
      },
    )
    if (invoice.created && invoice.id) {
      const li = await api("POST", `/finance/invoices/${invoice.id}/line-items`, {
        description: "Circuit Transfăgărășan 2 zile — 2 pax",
        quantity: 2,
        unitPriceCents: 125000,
        totalCents: 250000,
      })
      console.log(
        li.ok ? `    ✓ line item ${li.json?.data?.id}` : `    ✗ line item failed (${li.status})`,
      )
    }
  }
  summary.invoice = invoice.id

  // --- summary ---------------------------------------------------------------
  console.log("\n─── summary ───")
  for (const [k, v] of Object.entries(summary)) {
    console.log(`  ${k.padEnd(14)} ${v ?? "(not created)"}`)
  }
  const missing = Object.entries(summary).filter(([, v]) => !v)
  if (missing.length) {
    console.log(`\nNote: ${missing.map(([k]) => k).join(", ")} were not created (see log above).`)
  } else {
    console.log("\nAll demo entities present.")
  }
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message)
  process.exit(1)
})
