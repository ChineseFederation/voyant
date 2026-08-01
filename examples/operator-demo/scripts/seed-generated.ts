// agent-quality: file-size exception -- Operator seed script keeps the end-to-end demo world fixture in one deterministic transaction until seed domains are split.
import crypto from "node:crypto"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import dotenv from "dotenv"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { z } from "zod"
import {
  availabilityPickupPoints,
  availabilityRules,
  availabilitySlotPickups,
  availabilitySlots,
  availabilityStartTimes,
  customPickupAreas,
  locationPickupTimes,
  pickupGroups,
  pickupLocations,
  productMeetingConfigs,
} from "../../../packages/availability/src/schema.ts"
import {
  bookingPiiAccessLog,
  bookings,
  bookingTravelers,
} from "../../../packages/bookings/src/schema-core.ts"
import {
  bookingAllocations,
  bookingFulfillments,
  bookingItems,
  bookingItemTravelers,
  bookingRedemptionEvents,
} from "../../../packages/bookings/src/schema-items.ts"
import { bookingOrigins } from "../../../packages/bookings/src/schema-origin.ts"
import { customFieldDefinitions } from "../../../packages/custom-fields/src/schema.ts"
import { newId } from "../../../packages/db/src/lib/index.ts"
import { authMember, authOrganization, authUser } from "../../../packages/db/src/schema/iam/auth.ts"
import { userProfilesTable } from "../../../packages/db/src/schema/iam/user_profiles.ts"
import {
  supplierAvailability,
  supplierContracts,
  supplierNotes,
  supplierRates,
  supplierServices,
  suppliers,
} from "../../../packages/distribution/src/suppliers/schema.ts"
import {
  bookingGuarantees,
  bookingPaymentSchedules,
  financeNotes,
  invoiceLineItems,
  invoices,
  paymentAuthorizations,
  paymentCaptures,
  paymentInstruments,
  paymentSessions,
  payments,
} from "../../../packages/finance/src/schema.ts"
import {
  optionUnits,
  productOptions,
  products,
} from "../../../packages/inventory/src/schema-core.ts"
import {
  productDayServices,
  productDays,
  productItineraries,
  productMedia,
  productNotes,
  productVersions,
} from "../../../packages/inventory/src/schema-itinerary.ts"
import {
  optionUnitTranslations,
  productActivationSettings,
  productCapabilities,
  productDeliveryFormats,
  productFaqs,
  productFeatures,
  productLocations,
  productOptionTranslations,
  productTicketSettings,
  productTranslations,
  productVisibilitySettings,
} from "../../../packages/inventory/src/schema-settings.ts"
import {
  destinations,
  destinationTranslations,
  productCategories,
  productCategoryProducts,
  productDestinations,
  productTagProducts,
  productTags,
  productTypes,
} from "../../../packages/inventory/src/schema-taxonomy.ts"
import { legalTerms } from "../../../packages/legal/src/terms/schema.ts"
import {
  pipelines,
  proposalParticipants,
  proposalProducts,
  proposals,
  proposalVersionLines,
  proposalVersions,
  stages,
} from "../../../packages/proposals/src/schema-sales.ts"
import {
  communicationLog,
  organizations as crmOrganizations,
  organizationNotes,
  people,
  personNotes,
  segmentMembers,
  segments,
} from "../../../packages/relationships/src/schema-accounts.ts"
import {
  activities,
  activityLinks,
  activityParticipants,
} from "../../../packages/relationships/src/schema-activities.ts"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "../../..")

const scaleConfig = {
  small: {
    customers: 3,
    suppliers: 3,
    products: 3,
    bookings: 4,
    proposals: 2,
    participantsPerBooking: 2,
  },
  medium: {
    customers: 4,
    suppliers: 5,
    products: 5,
    bookings: 6,
    proposals: 3,
    participantsPerBooking: 3,
  },
  large: {
    customers: 6,
    suppliers: 7,
    products: 8,
    bookings: 10,
    proposals: 5,
    participantsPerBooking: 4,
  },
} as const

const argsSchema = z.object({
  label: z.string(),
  scale: z.enum(["small", "medium", "large"]),
  theme: z.string(),
  ownerEmail: z.string().email().optional(),
  noImages: z.boolean(),
  dryRun: z.boolean(),
})

const worldPlanSchema = z.object({
  workspace: z.object({
    name: z.string().min(2),
    shortDescription: z.string().min(20),
    locale: z.string().default("en"),
    currency: z.string().default("EUR"),
    timezone: z.string().default("Europe/Bucharest"),
  }),
  destinations: z
    .array(
      z.object({
        name: z.string().min(2),
        slug: z.string().min(2),
        countryCode: z.string().min(2).max(2),
        summary: z.string().min(20),
        highlight: z.string().min(10),
      }),
    )
    .min(1),
  customers: z
    .array(
      z.object({
        name: z.string().min(2),
        legalName: z.string().min(2),
        industry: z.string().min(2),
        website: z.string().url(),
        notes: z.string().min(20),
        preferredLanguage: z.string().default("en"),
        primaryContact: z.object({
          firstName: z.string().min(2),
          lastName: z.string().min(2),
          email: z.string().email(),
          jobTitle: z.string().min(2),
        }),
        additionalContacts: z
          .array(
            z.object({
              firstName: z.string().min(2),
              lastName: z.string().min(2),
              email: z.string().email(),
              jobTitle: z.string().min(2),
            }),
          )
          .default([]),
      }),
    )
    .min(1),
  suppliers: z
    .array(
      z.object({
        name: z.string().min(2),
        type: z.enum([
          "hotel",
          "transfer",
          "guide",
          "experience",
          "airline",
          "restaurant",
          "other",
        ]),
        description: z.string().min(20),
        serviceType: z.enum(["accommodation", "transfer", "experience", "guide", "meal", "other"]),
        serviceName: z.string().min(2),
        duration: z.string().min(2),
        capacity: z.number().int().positive(),
        notes: z.string().min(10),
        contractTerms: z.string().min(20),
      }),
    )
    .min(1),
  products: z
    .array(
      z.object({
        name: z.string().min(2),
        destinationSlug: z.string().min(2),
        supplierName: z.string().min(2),
        productType: z.string().min(2),
        category: z.string().min(2),
        tags: z.array(z.string().min(2)).min(2).max(5),
        bookingMode: z.enum([
          "date",
          "date_time",
          "open",
          "stay",
          "transfer",
          "itinerary",
          "other",
        ]),
        capacityMode: z.enum(["free_sale", "limited", "on_request"]),
        optionName: z.string().min(2),
        unitName: z.string().min(2),
        unitType: z.enum(["person", "group", "room", "vehicle", "service", "other"]),
        summary: z.string().min(40),
        shortDescription: z.string().min(20),
        meetingInstructions: z.string().min(20),
        pickupInstructions: z.string().min(20),
        priceCents: z.number().int().positive(),
        costCents: z.number().int().positive(),
        marginPercent: z.number().int().nonnegative().max(90),
        faqs: z
          .array(
            z.object({
              question: z.string().min(8),
              answer: z.string().min(20),
            }),
          )
          .min(2)
          .max(4),
        highlights: z.array(z.string().min(8)).min(2).max(4),
        inclusions: z.array(z.string().min(6)).min(2).max(4),
        exclusions: z.array(z.string().min(6)).min(1).max(3),
        locations: z
          .array(
            z.object({
              title: z.string().min(2),
              address: z.string().min(6),
              city: z.string().min(2),
              countryCode: z.string().min(2).max(2),
            }),
          )
          .min(1)
          .max(3),
        itineraryDays: z
          .array(
            z.object({
              title: z.string().min(2),
              description: z.string().min(20),
              serviceName: z.string().min(2),
              serviceType: z.enum([
                "accommodation",
                "transfer",
                "experience",
                "guide",
                "meal",
                "other",
              ]),
            }),
          )
          .min(1)
          .max(3),
        pickupPoints: z.array(z.string().min(2)).min(1).max(3),
      }),
    )
    .min(1),
  proposals: z
    .array(
      z.object({
        title: z.string().min(4),
        customerName: z.string().min(2),
        contactEmail: z.string().email(),
        stage: z.enum(["qualified", "proposal", "negotiation", "won"]),
        closeDate: z.string().min(8),
        notes: z.string().min(20),
        products: z
          .array(
            z.object({
              productName: z.string().min(2),
              quantity: z.number().int().positive(),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
  bookings: z
    .array(
      z.object({
        customerName: z.string().min(2),
        contactEmail: z.string().email(),
        productName: z.string().min(2),
        status: z.enum(["draft", "on_hold", "confirmed", "in_progress", "completed"]),
        sourceType: z.enum([
          "direct",
          "manual",
          "affiliate",
          "ota",
          "reseller",
          "api_partner",
          "internal",
        ]),
        participantCount: z.number().int().positive(),
        leadTraveler: z.object({
          firstName: z.string().min(2),
          lastName: z.string().min(2),
          email: z.string().email(),
        }),
        notes: z.string().min(10),
      }),
    )
    .min(1),
})

type WorldPlan = z.infer<typeof worldPlanSchema>
type SeedArgs = z.infer<typeof argsSchema>
type SqlClient = postgres.Sql<Record<string, unknown>>
type Database = Pick<ReturnType<typeof drizzle>, "insert" | "select">

type SeedContext = {
  db: Database
  sql: SqlClient
  args: SeedArgs
  labelSlug: string
  ownerUserId: string
  workspaceOrgId: string
  rng: () => number
}

type CustomerSeed = {
  organizationId: string
  primaryContactId: string
  contactIds: string[]
  emailToPersonId: Map<string, string>
}

type SupplierSeed = {
  supplierId: string
  supplierServiceId: string
}

type ProductSeed = {
  productId: string
  optionId: string
  unitId: string
  slotIds: string[]
  destinationId: string
  categoryId: string
}

const defaultPromptTheme =
  "A premium Eastern European and Mediterranean travel operator selling cultural tours, river cruises, private transfers, and boutique multi-day escapes."

async function main() {
  loadEnvFiles()
  const args = parseArgs(process.argv.slice(2))

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required. The script reads it from starters/operator/.env or your shell.",
    )
  }

  const geminiApiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY
  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY or GOOGLE_AI_API_KEY is required.")
  }

  const rng = createRng(args.label)
  const counts = scaleConfig[args.scale]
  const plan = await buildWorldPlan({
    args,
    geminiApiKey,
    counts,
  })

  if (args.dryRun) {
    printPlanSummary(plan, args)
    return
  }

  const sql = postgres(databaseUrl, { max: 1 })
  const db = drizzle(sql)

  try {
    const labelSlug = slugify(args.label)
    const existingSeed = await db
      .select({ id: crmOrganizations.id })
      .from(crmOrganizations)
      .where(
        and(
          eq(crmOrganizations.source, "operator_seed"),
          eq(crmOrganizations.sourceRef, labelSlug),
        ),
      )
      .limit(1)

    if (existingSeed.length > 0) {
      throw new Error(
        `A seed run with label "${args.label}" already exists. Use a different --label value.`,
      )
    }

    const owner = await ensureSeedOwner(db, args.ownerEmail, labelSlug)

    const ctx: SeedContext = {
      db,
      sql,
      args,
      labelSlug,
      ownerUserId: owner.userId,
      workspaceOrgId: owner.workspaceOrgId,
      rng,
    }

    await db.transaction(async (tx) => {
      const transactionCtx = { ...ctx, db: tx }

      const customerSeeds = await seedCustomers(transactionCtx, plan)
      const supplierSeeds = await seedSuppliers(transactionCtx, plan)
      const productSeeds = await seedProducts(transactionCtx, plan, supplierSeeds)
      await seedActivitiesAndSales(transactionCtx, plan, customerSeeds, productSeeds)
      await seedTransactionsAndBookings(transactionCtx, plan, customerSeeds, productSeeds)
    })

    printSuccess(args, plan)
  } finally {
    await sql.end({ timeout: 1 })
  }
}

function loadEnvFiles() {
  const envFiles = [
    path.join(repoRoot, ".env"),
    path.join(repoRoot, ".env.local"),
    path.join(repoRoot, "starters/operator/.env"),
    path.join(repoRoot, "starters/operator/.env.local"),
  ]

  for (const file of envFiles) {
    dotenv.config({
      path: file,
      override: true,
      quiet: true,
    })
  }
}

function parseArgs(rawArgs: string[]): SeedArgs {
  const values: Record<string, unknown> = {
    label: `operator-seed-${new Date().toISOString().slice(0, 10)}`,
    scale: "medium",
    theme: defaultPromptTheme,
    noImages: false,
    dryRun: false,
  }

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index]
    if (!arg) continue

    if (arg === "--no-images") {
      values.noImages = true
      continue
    }

    if (arg === "--dry-run") {
      values.dryRun = true
      continue
    }

    if (arg === "--label") {
      values.label = rawArgs[index + 1]
      index += 1
      continue
    }

    if (arg === "--scale") {
      values.scale = rawArgs[index + 1]
      index += 1
      continue
    }

    if (arg === "--theme") {
      values.theme = rawArgs[index + 1]
      index += 1
      continue
    }

    if (arg === "--owner-email") {
      values.ownerEmail = rawArgs[index + 1]
      index += 1
    }
  }

  return argsSchema.parse(values)
}

async function buildWorldPlan(params: {
  args: SeedArgs
  geminiApiKey: string
  counts: (typeof scaleConfig)[keyof typeof scaleConfig]
}): Promise<WorldPlan> {
  const { args, geminiApiKey, counts } = params

  const prompt = [
    "You are generating realistic but fictional travel-operator demo data.",
    "Return strict JSON with no markdown.",
    `Theme: ${args.theme}`,
    `Customers: ${counts.customers}`,
    `Suppliers: ${counts.suppliers}`,
    `Products: ${counts.products}`,
    `Proposals: ${counts.proposals}`,
    `Bookings: ${counts.bookings}`,
    "",
    "Requirements:",
    "- Keep everything coherent: products should reference valid suppliers and destinations.",
    "- Use concise but specific descriptions.",
    "- Customer websites must be valid https URLs.",
    "- Booking/product references must use exact product and customer names from the same payload.",
    "- Use English copy.",
    "- Make it feel like a premium but operationally realistic B2B travel operator dataset.",
  ].join("\n")

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.9,
          responseMimeType: "application/json",
        },
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Gemini request failed (${response.status}): ${body}`)
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>
      }
    }>
  }

  const text =
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? ""

  if (!text) {
    throw new Error("Gemini returned an empty response.")
  }

  const parsedJson = parseJsonBlock(text)
  const result = worldPlanSchema.parse(parsedJson)

  return normalizePlan(result, args, counts)
}

function normalizePlan(
  plan: WorldPlan,
  args: SeedArgs,
  counts: (typeof scaleConfig)[keyof typeof scaleConfig],
): WorldPlan {
  const destinationsBySlug = new Map(
    plan.destinations.map((destination) => [slugify(destination.slug), destination]),
  )
  const suppliersByName = new Map(plan.suppliers.map((supplier) => [supplier.name, supplier]))
  const customersByName = new Map(plan.customers.map((customer) => [customer.name, customer]))
  const productsByName = new Map(plan.products.map((product) => [product.name, product]))

  const normalizedPlan: WorldPlan = {
    ...plan,
    workspace: {
      ...plan.workspace,
      timezone: plan.workspace.timezone || "Europe/Bucharest",
      currency: plan.workspace.currency || "EUR",
      locale: plan.workspace.locale || "en",
    },
    destinations: plan.destinations
      .slice(0, Math.max(1, Math.min(plan.destinations.length, counts.products)))
      .map((destination) => ({
        ...destination,
        slug: slugify(destination.slug || destination.name),
        countryCode: destination.countryCode.toUpperCase(),
      })),
    customers: plan.customers.slice(0, counts.customers),
    suppliers: plan.suppliers.slice(0, counts.suppliers),
    products: plan.products.slice(0, counts.products).map((product, index) => {
      const fallbackDestination = plan.destinations[index % plan.destinations.length]
      const fallbackSupplier = plan.suppliers[index % plan.suppliers.length]

      return {
        ...product,
        destinationSlug: destinationsBySlug.has(slugify(product.destinationSlug))
          ? slugify(product.destinationSlug)
          : slugify((fallbackDestination?.slug ?? fallbackDestination?.name) || "seed-destination"),
        supplierName: suppliersByName.has(product.supplierName)
          ? product.supplierName
          : fallbackSupplier?.name || plan.suppliers[0]?.name || "Seed Supplier",
      }
    }),
    proposals: plan.proposals.slice(0, counts.proposals).map((proposalPlan, index) => {
      const fallbackCustomer = plan.customers[index % plan.customers.length]
      return {
        ...proposalPlan,
        customerName: customersByName.has(proposalPlan.customerName)
          ? proposalPlan.customerName
          : fallbackCustomer?.name || plan.customers[0]?.name || "Seed Customer",
        contactEmail: proposalPlan.contactEmail || fallbackCustomer?.primaryContact.email || "",
        products: proposalPlan.products
          .map((item) => ({
            ...item,
            productName: productsByName.has(item.productName)
              ? item.productName
              : plan.products[index % plan.products.length]?.name ||
                plan.products[0]?.name ||
                "Seed Product",
          }))
          .slice(0, 3),
      }
    }),
    bookings: plan.bookings.slice(0, counts.bookings).map((booking, index) => {
      const fallbackCustomer = plan.customers[index % plan.customers.length]
      const fallbackProduct = plan.products[index % plan.products.length]
      return {
        ...booking,
        customerName: customersByName.has(booking.customerName)
          ? booking.customerName
          : fallbackCustomer?.name || plan.customers[0]?.name || "Seed Customer",
        contactEmail: booking.contactEmail || fallbackCustomer?.primaryContact.email || "",
        productName: productsByName.has(booking.productName)
          ? booking.productName
          : fallbackProduct?.name || plan.products[0]?.name || "Seed Product",
        participantCount: Math.max(
          1,
          Math.min(booking.participantCount, counts.participantsPerBooking),
        ),
      }
    }),
  }

  if (args.noImages) {
    return normalizedPlan
  }

  return normalizedPlan
}

function parseJsonBlock(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed)
  }

  const fenced = trimmed.match(/```json\s*([\s\S]+?)```/i) || trimmed.match(/```\s*([\s\S]+?)```/i)
  if (fenced?.[1]) {
    return JSON.parse(fenced[1])
  }

  const firstBrace = trimmed.indexOf("{")
  const lastBrace = trimmed.lastIndexOf("}")
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1))
  }

  throw new Error("Could not find valid JSON in the Gemini response.")
}

async function ensureSeedOwner(
  db: Database,
  ownerEmail: string | undefined,
  labelSlug: string,
): Promise<{ userId: string; workspaceOrgId: string }> {
  if (ownerEmail) {
    const [existing] = await db
      .select()
      .from(authUser)
      .where(eq(authUser.email, ownerEmail))
      .limit(1)
    if (existing) {
      const workspaceOrgId = await ensureWorkspaceOrganization(db, existing.id, labelSlug)
      await ensureUserProfile(db, existing.id, existing.name)
      return { userId: existing.id, workspaceOrgId }
    }
  }

  const [firstUser] = await db.select().from(authUser).limit(1)
  if (firstUser) {
    const workspaceOrgId = await ensureWorkspaceOrganization(db, firstUser.id, labelSlug)
    await ensureUserProfile(db, firstUser.id, firstUser.name)
    return { userId: firstUser.id, workspaceOrgId }
  }

  const userId = `seed-user-${labelSlug}`
  const email = ownerEmail ?? `seed-admin+${labelSlug}@voyant.local`
  const now = new Date()
  await db.insert(authUser).values({
    id: userId,
    name: "Seed Operator Admin",
    email,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
    image: null,
  })

  const workspaceOrgId = await ensureWorkspaceOrganization(db, userId, labelSlug)
  await ensureUserProfile(db, userId, "Seed Operator Admin")

  return { userId, workspaceOrgId }
}

async function ensureWorkspaceOrganization(
  db: Database,
  userId: string,
  labelSlug: string,
): Promise<string> {
  const orgId = `seed-workspace-${labelSlug}`
  const [existingOrg] = await db
    .select()
    .from(authOrganization)
    .where(eq(authOrganization.id, orgId))
    .limit(1)

  if (!existingOrg) {
    await db.insert(authOrganization).values({
      id: orgId,
      name: `Operator Seed ${labelSlug}`,
      slug: `operator-seed-${labelSlug}`,
      logo: null,
      metadata: JSON.stringify({ seed: true, label: labelSlug }),
      createdAt: new Date(),
    })
  }

  const [existingMember] = await db
    .select()
    .from(authMember)
    .where(and(eq(authMember.organizationId, orgId), eq(authMember.userId, userId)))
    .limit(1)

  if (!existingMember) {
    await db.insert(authMember).values({
      id: `seed-member-${labelSlug}`,
      userId,
      organizationId: orgId,
      role: "owner",
      createdAt: new Date(),
    })
  }

  return orgId
}

async function ensureUserProfile(db: Database, userId: string, name: string) {
  const [existing] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.id, userId))
    .limit(1)
  if (existing) {
    return
  }

  const [firstName, ...rest] = name.split(" ")
  await db.insert(userProfilesTable).values({
    id: userId,
    firstName: firstName ?? "Seed",
    lastName: rest.join(" ") || "Admin",
    locale: "en",
    timezone: "Europe/Bucharest",
    uiPrefs: {},
    notificationDefaults: {},
    marketingConsent: false,
  })
}

async function seedCustomers(ctx: SeedContext, plan: WorldPlan) {
  const customerSeeds = new Map<string, CustomerSeed>()

  const [vipSegment] = await ctx.db
    .insert(segments)
    .values({
      id: newId("segments"),
      name: `VIP Accounts ${ctx.labelSlug}`,
      description: `High-value accounts seeded via ${ctx.args.label}.`,
      conditions: { seedLabel: ctx.labelSlug, type: "vip" },
    })
    .returning()

  const [customFieldDefinition] = await ctx.db
    .insert(customFieldDefinitions)
    .values({
      id: newId("custom_field_definitions"),
      entityType: "organization",
      namespace: "custom",
      ownerKind: "operator",
      ownerId: null,
      lifecycleState: "active",
      provenance: { source: "operator-demo-generated-seed" },
      key: `travel_style_${ctx.labelSlug}`,
      label: "Travel Style",
      fieldType: "text",
      isRequired: false,
      isSearchable: true,
    })
    .returning()

  for (const [index, customer] of plan.customers.entries()) {
    const [organization] = await ctx.db
      .insert(crmOrganizations)
      .values({
        id: newId("organizations"),
        name: customer.name,
        legalName: customer.legalName,
        website: customer.website,
        industry: customer.industry,
        relation: "client",
        ownerId: ctx.ownerUserId,
        defaultCurrency: plan.workspace.currency,
        preferredLanguage: customer.preferredLanguage,
        paymentTerms: 14 + index * 7,
        status: "active",
        source: "operator_seed",
        sourceRef: ctx.labelSlug,
        tags: ["seeded", ctx.labelSlug, index === 0 ? "vip" : "standard"],
        customFields: {
          custom: {
            [customFieldDefinition.key]:
              index === 0 ? "VIP experiential travel" : "Managed FIT and group travel",
          },
        },
        notes: customer.notes,
      })
      .returning()

    await ctx.db.insert(organizationNotes).values({
      id: newId("organization_notes"),
      organizationId: organization.id,
      authorId: ctx.ownerUserId,
      content: `Seeded account note: ${customer.notes}`,
    })

    const contactIds: string[] = []
    const emailToPersonId = new Map<string, string>()
    const allContacts = [customer.primaryContact, ...customer.additionalContacts]

    for (const [contactIndex, contact] of allContacts.entries()) {
      const [person] = await ctx.db
        .insert(people)
        .values({
          id: newId("people"),
          organizationId: organization.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          jobTitle: contact.jobTitle,
          relation: "client",
          preferredLanguage: customer.preferredLanguage,
          preferredCurrency: plan.workspace.currency,
          ownerId: ctx.ownerUserId,
          status: "active",
          source: "operator_seed",
          sourceRef: ctx.labelSlug,
          tags: ["seeded", contactIndex === 0 ? "primary-contact" : "contact"],
          notes: `Reach ${contact.firstName} via ${contact.email}`,
        })
        .returning()

      contactIds.push(person.id)
      emailToPersonId.set(contact.email.toLowerCase(), person.id)

      await ctx.db.insert(personNotes).values({
        id: newId("person_notes"),
        personId: person.id,
        authorId: ctx.ownerUserId,
        content: `${contact.firstName} handles ${customer.name} travel planning.`,
      })

      await ctx.db.insert(communicationLog).values({
        id: newId("communication_log"),
        personId: person.id,
        organizationId: organization.id,
        channel: contactIndex === 0 ? "email" : "phone",
        direction: "outbound",
        subject: `Welcome cadence for ${customer.name}`,
        content: `Seeded communication touchpoint for ${contact.firstName} ${contact.lastName}.`,
        sentAt: daysAgo(index + contactIndex + 2),
      })
    }

    if (index === 0) {
      for (const personId of contactIds) {
        await ctx.db.insert(segmentMembers).values({
          id: newId("segment_members"),
          segmentId: vipSegment.id,
          personId,
        })
      }
    }

    customerSeeds.set(customer.name, {
      organizationId: organization.id,
      primaryContactId: contactIds[0] ?? "",
      contactIds,
      emailToPersonId,
    })
  }

  return customerSeeds
}

async function seedSuppliers(ctx: SeedContext, plan: WorldPlan) {
  const supplierSeeds = new Map<string, SupplierSeed>()

  for (const [index, supplierPlan] of plan.suppliers.entries()) {
    const [supplier] = await ctx.db
      .insert(suppliers)
      .values({
        id: newId("suppliers"),
        name: supplierPlan.name,
        type: supplierPlan.type,
        status: "active",
        description: supplierPlan.description,
        defaultCurrency: plan.workspace.currency,
        paymentTermsDays: 21,
        tags: ["seeded", ctx.labelSlug, supplierPlan.serviceType],
      })
      .returning()

    const [service] = await ctx.db
      .insert(supplierServices)
      .values({
        id: newId("supplier_services"),
        supplierId: supplier.id,
        serviceType: supplierPlan.serviceType,
        name: supplierPlan.serviceName,
        description: supplierPlan.description,
        duration: supplierPlan.duration,
        capacity: supplierPlan.capacity,
        active: true,
        tags: ["seeded", ctx.labelSlug],
      })
      .returning()

    await ctx.db.insert(supplierRates).values({
      id: newId("supplier_rates"),
      serviceId: service.id,
      name: `${supplierPlan.serviceName} rack rate`,
      currency: plan.workspace.currency,
      amountCents: 12_000 + index * 4_500,
      unit: supplierPlan.serviceType === "transfer" ? "per_vehicle" : "per_person",
      validFrom: "2026-01-01",
      validTo: "2026-12-31",
      minPax: 1,
      maxPax: Math.max(4, supplierPlan.capacity),
      notes: supplierPlan.notes,
    })

    await ctx.db.insert(supplierContracts).values({
      id: newId("supplier_contracts"),
      supplierId: supplier.id,
      agreementNumber: `AGR-${ctx.labelSlug}-${index + 1}`,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      renewalDate: "2026-11-01",
      status: "active",
      terms: supplierPlan.contractTerms,
    })

    await ctx.db.insert(supplierAvailability).values({
      id: newId("supplier_availability"),
      supplierId: supplier.id,
      date: "2026-06-15",
      available: true,
      notes: `Seeded operational availability for ${supplierPlan.serviceName}.`,
    })

    await ctx.db.insert(supplierNotes).values({
      id: newId("supplier_notes"),
      supplierId: supplier.id,
      authorId: ctx.ownerUserId,
      content: supplierPlan.notes,
    })

    supplierSeeds.set(supplierPlan.name, {
      supplierId: supplier.id,
      supplierServiceId: service.id,
    })
  }

  return supplierSeeds
}

async function seedProducts(
  ctx: SeedContext,
  plan: WorldPlan,
  supplierSeeds: Map<string, SupplierSeed>,
) {
  const productSeeds = new Map<string, ProductSeed>()
  const destinationIdBySlug = new Map<string, string>()
  const categoryIdBySlug = new Map<string, string>()
  const productTypeIdByCode = new Map<string, string>()
  const tagIdByName = new Map<string, string>()

  for (const destinationPlan of plan.destinations) {
    const existing = await ctx.db
      .select()
      .from(destinations)
      .where(eq(destinations.slug, destinationPlan.slug))
      .limit(1)

    const destination =
      existing[0] ??
      (
        await ctx.db
          .insert(destinations)
          .values({
            id: newId("destinations"),
            slug: destinationPlan.slug,
            code: destinationPlan.countryCode,
            destinationType: "destination",
            active: true,
            metadata: { seedLabel: ctx.labelSlug, highlight: destinationPlan.highlight },
          })
          .returning()
      )[0]

    destinationIdBySlug.set(destinationPlan.slug, destination.id)

    const translationExists = await ctx.db
      .select()
      .from(destinationTranslations)
      .where(
        and(
          eq(destinationTranslations.destinationId, destination.id),
          eq(destinationTranslations.languageTag, plan.workspace.locale),
        ),
      )
      .limit(1)

    if (translationExists.length === 0) {
      await ctx.db.insert(destinationTranslations).values({
        id: newId("destination_translations"),
        destinationId: destination.id,
        languageTag: plan.workspace.locale,
        name: destinationPlan.name,
        description: destinationPlan.summary,
        seoTitle: `${destinationPlan.name} experiences`,
        seoDescription: destinationPlan.highlight,
      })
    }
  }

  for (const productPlan of plan.products) {
    const productTypeCode = slugify(productPlan.productType)
    const [existingProductType] = await ctx.db
      .select()
      .from(productTypes)
      .where(eq(productTypes.code, productTypeCode))
      .limit(1)
    const productType =
      existingProductType ??
      (
        await ctx.db
          .insert(productTypes)
          .values({
            id: newId("product_types"),
            name: productPlan.productType,
            code: productTypeCode,
            description: `${productPlan.productType} created by operator seed.`,
            active: true,
          })
          .returning()
      )[0]
    productTypeIdByCode.set(productTypeCode, productType.id)

    const categorySlug = slugify(productPlan.category)
    const [existingCategory] = await ctx.db
      .select()
      .from(productCategories)
      .where(eq(productCategories.slug, categorySlug))
      .limit(1)
    const category =
      existingCategory ??
      (
        await ctx.db
          .insert(productCategories)
          .values({
            id: newId("product_categories"),
            name: productPlan.category,
            slug: categorySlug,
            description: `Seed category for ${productPlan.category}.`,
            active: true,
          })
          .returning()
      )[0]
    categoryIdBySlug.set(categorySlug, category.id)

    for (const tagName of productPlan.tags) {
      if (tagIdByName.has(tagName)) {
        continue
      }
      const [existingTag] = await ctx.db
        .select()
        .from(productTags)
        .where(eq(productTags.name, tagName))
        .limit(1)
      const tag =
        existingTag ??
        (
          await ctx.db
            .insert(productTags)
            .values({
              id: newId("product_tags"),
              name: tagName,
            })
            .returning()
        )[0]
      tagIdByName.set(tagName, tag.id)
    }

    const supplierSeed = supplierSeeds.get(productPlan.supplierName)
    const destinationId =
      destinationIdBySlug.get(productPlan.destinationSlug) ?? [...destinationIdBySlug.values()][0]
    const now = new Date()
    const startDate = shiftDateString("2026-06-10", Math.floor(ctx.rng() * 25))
    const endDate = shiftDateString(startDate, Math.max(1, productPlan.itineraryDays.length - 1))

    const [product] = await ctx.db
      .insert(products)
      .values({
        id: newId("products"),
        name: productPlan.name,
        status: "active",
        description: productPlan.summary,
        bookingMode: productPlan.bookingMode,
        capacityMode: productPlan.capacityMode,
        timezone: plan.workspace.timezone,
        visibility: "public",
        activated: true,
        reservationTimeoutMinutes: 20,
        sellCurrency: plan.workspace.currency,
        sellAmountCents: productPlan.priceCents,
        costAmountCents: productPlan.costCents,
        marginPercent: productPlan.marginPercent,
        productTypeId: productType.id,
        startDate,
        endDate,
        pax: 2 + Math.floor(ctx.rng() * 6),
        tags: [...productPlan.tags, ctx.labelSlug],
      })
      .returning()

    const [option] = await ctx.db
      .insert(productOptions)
      .values({
        id: newId("product_options"),
        productId: product.id,
        name: productPlan.optionName,
        code: slugify(productPlan.optionName),
        description: `${productPlan.optionName} option for ${productPlan.name}.`,
        status: "active",
        isDefault: true,
        sortOrder: 0,
        availableFrom: startDate,
        availableTo: endDate,
      })
      .returning()

    const [unit] = await ctx.db
      .insert(optionUnits)
      .values({
        id: newId("option_units"),
        optionId: option.id,
        name: productPlan.unitName,
        code: slugify(productPlan.unitName),
        description: `${productPlan.unitName} pricing unit.`,
        unitType: productPlan.unitType,
        minQuantity: 1,
        maxQuantity: 8,
        isRequired: true,
        isHidden: false,
        sortOrder: 0,
      })
      .returning()

    await ctx.db.insert(productCategoryProducts).values({
      productId: product.id,
      categoryId: category.id,
      sortOrder: 0,
    })

    if (destinationId) {
      await ctx.db.insert(productDestinations).values({
        productId: product.id,
        destinationId,
        sortOrder: 0,
      })
    }

    for (const [tagIndex, tagName] of productPlan.tags.entries()) {
      const tagId = tagIdByName.get(tagName)
      if (tagId) {
        await ctx.db.insert(productTagProducts).values({
          productId: product.id,
          tagId,
        })
      }

      if (tagIndex === 0) {
        await ctx.db.insert(productCapabilities).values({
          id: newId("product_capabilities"),
          productId: product.id,
          capability: "instant_confirmation",
          enabled: true,
          notes: `Seeded capability for ${productPlan.name}.`,
        })
      }
    }

    await ctx.db.insert(productActivationSettings).values({
      id: newId("product_activation_settings"),
      productId: product.id,
      activationMode: "manual",
      activateAt: now,
    })

    await ctx.db.insert(productTicketSettings).values({
      id: newId("product_ticket_settings"),
      productId: product.id,
      fulfillmentMode: "per_item",
      defaultDeliveryFormat: "qr_code",
      ticketPerUnit: false,
      voucherMessage: `Present the QR code for ${productPlan.name}.`,
    })

    await ctx.db.insert(productVisibilitySettings).values({
      id: newId("product_visibility_settings"),
      productId: product.id,
      isSearchable: true,
      isBookable: true,
      isFeatured: ctx.rng() > 0.55,
      requiresAuthentication: false,
    })

    await ctx.db.insert(productDeliveryFormats).values([
      {
        id: newId("product_delivery_formats"),
        productId: product.id,
        format: "qr_code",
        isDefault: true,
      },
      {
        id: newId("product_delivery_formats"),
        productId: product.id,
        format: "email",
        isDefault: false,
      },
    ])

    const featureRows = [
      ...productPlan.highlights.map((highlight, index) => ({
        id: newId("product_features"),
        productId: product.id,
        featureType: "highlight" as const,
        title: highlight,
        description: highlight,
        sortOrder: index,
      })),
      ...productPlan.inclusions.map((inclusion, index) => ({
        id: newId("product_features"),
        productId: product.id,
        featureType: "inclusion" as const,
        title: inclusion,
        description: inclusion,
        sortOrder: index + 10,
      })),
      ...productPlan.exclusions.map((exclusion, index) => ({
        id: newId("product_features"),
        productId: product.id,
        featureType: "exclusion" as const,
        title: exclusion,
        description: exclusion,
        sortOrder: index + 20,
      })),
    ]
    await ctx.db.insert(productFeatures).values(featureRows)

    await ctx.db.insert(productFaqs).values(
      productPlan.faqs.map((faq, index) => ({
        id: newId("product_faqs"),
        productId: product.id,
        question: faq.question,
        answer: faq.answer,
        sortOrder: index,
      })),
    )

    await ctx.db.insert(productLocations).values(
      productPlan.locations.map((location, index) => ({
        id: newId("product_locations"),
        productId: product.id,
        locationType: (index === 0 ? "meeting_point" : "point_of_interest") as
          | "meeting_point"
          | "point_of_interest",
        title: location.title,
        address: location.address,
        city: location.city,
        countryCode: location.countryCode,
        sortOrder: index,
      })),
    )

    await ctx.db.insert(productTranslations).values({
      id: newId("product_translations"),
      productId: product.id,
      languageTag: plan.workspace.locale,
      slug: `${slugify(productPlan.name)}-${ctx.labelSlug}`,
      name: productPlan.name,
      shortDescription: productPlan.shortDescription,
      description: productPlan.summary,
      seoTitle: productPlan.name,
      seoDescription: productPlan.summary,
    })

    await ctx.db.insert(productOptionTranslations).values({
      id: newId("product_option_translations"),
      optionId: option.id,
      languageTag: plan.workspace.locale,
      name: productPlan.optionName,
      shortDescription: `${productPlan.optionName} option`,
      description: `${productPlan.optionName} option for ${productPlan.name}`,
    })

    await ctx.db.insert(optionUnitTranslations).values({
      id: newId("option_unit_translations"),
      unitId: unit.id,
      languageTag: plan.workspace.locale,
      name: productPlan.unitName,
      shortDescription: `${productPlan.unitName} unit`,
      description: `${productPlan.unitName} unit for ${productPlan.name}`,
    })

    const [itinerary] = await ctx.db
      .insert(productItineraries)
      .values({
        id: newId("product_itineraries"),
        productId: product.id,
        name: "Default itinerary",
        isDefault: true,
        sortOrder: 0,
      })
      .returning()

    const dayRows = []
    for (const [dayIndex, itineraryDay] of productPlan.itineraryDays.entries()) {
      const [day] = await ctx.db
        .insert(productDays)
        .values({
          id: newId("product_days"),
          itineraryId: itinerary.id,
          dayNumber: dayIndex + 1,
          title: itineraryDay.title,
          description: itineraryDay.description,
          location: plan.destinations.find(
            (destination) => destination.slug === productPlan.destinationSlug,
          )?.name,
        })
        .returning()

      dayRows.push(day)
      await ctx.db.insert(productDayServices).values({
        id: newId("product_day_services"),
        dayId: day.id,
        supplierServiceId: supplierSeed?.supplierServiceId,
        serviceType: itineraryDay.serviceType,
        name: itineraryDay.serviceName,
        description: itineraryDay.description,
        costCurrency: plan.workspace.currency,
        costAmountCents: Math.max(
          4_000,
          Math.floor(productPlan.costCents / productPlan.itineraryDays.length),
        ),
        quantity: 1,
        sortOrder: dayIndex,
        notes: `Seeded itinerary service for ${productPlan.name}.`,
      })
    }

    await ctx.db.insert(productVersions).values({
      id: newId("product_versions"),
      productId: product.id,
      versionNumber: 1,
      snapshot: {
        name: productPlan.name,
        summary: productPlan.summary,
        option: productPlan.optionName,
        unit: productPlan.unitName,
      },
      authorId: ctx.ownerUserId,
      notes: `Initial seeded snapshot for ${productPlan.name}.`,
    })

    await ctx.db.insert(productNotes).values({
      id: newId("product_notes"),
      productId: product.id,
      authorId: ctx.ownerUserId,
      content: `Seeded product note: ${productPlan.meetingInstructions}`,
    })

    const [availabilityRule] = await ctx.db
      .insert(availabilityRules)
      .values({
        id: newId("availability_rules"),
        productId: product.id,
        optionId: option.id,
        timezone: plan.workspace.timezone,
        recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
        maxCapacity: 16,
        maxPickupCapacity: 12,
        minTotalPax: 1,
        cutoffMinutes: 240,
        earlyBookingLimitMinutes: 60 * 24 * 180,
        active: true,
      })
      .returning()

    const [startTime] = await ctx.db
      .insert(availabilityStartTimes)
      .values({
        id: newId("availability_start_times"),
        productId: product.id,
        optionId: option.id,
        label: "Morning departure",
        startTimeLocal: "09:00",
        durationMinutes: 180,
        sortOrder: 0,
        active: true,
      })
      .returning()

    const slotIds: string[] = []
    for (let slotOffset = 0; slotOffset < 3; slotOffset += 1) {
      const dateLocal = shiftDateString(startDate, slotOffset * 2)
      const startsAt = new Date(`${dateLocal}T07:00:00.000Z`)
      const endsAt = new Date(`${dateLocal}T10:00:00.000Z`)
      const [slot] = await ctx.db
        .insert(availabilitySlots)
        .values({
          id: newId("availability_slots"),
          productId: product.id,
          optionId: option.id,
          availabilityRuleId: availabilityRule.id,
          startTimeId: startTime.id,
          dateLocal,
          startsAt,
          endsAt,
          timezone: plan.workspace.timezone,
          status: "open",
          unlimited: false,
          initialPax: 16,
          remainingPax: 16 - slotOffset,
          initialPickups: 10,
          remainingPickups: 10 - slotOffset,
          remainingResources: 6,
          notes: `Seeded slot for ${productPlan.name}.`,
        })
        .returning()
      slotIds.push(slot.id)
    }

    const [pickupPoint] = await ctx.db
      .insert(availabilityPickupPoints)
      .values({
        id: newId("availability_pickup_points"),
        productId: product.id,
        name: productPlan.pickupPoints[0] || `${productPlan.name} pickup`,
        description: productPlan.pickupInstructions,
        locationText: productPlan.pickupPoints.join(", "),
        active: true,
      })
      .returning()

    for (const slotId of slotIds) {
      await ctx.db.insert(availabilitySlotPickups).values({
        id: newId("availability_slot_pickups"),
        slotId,
        pickupPointId: pickupPoint.id,
        initialCapacity: 10,
        remainingCapacity: 8,
      })
    }

    const [meetingConfig] = await ctx.db
      .insert(productMeetingConfigs)
      .values({
        id: newId("product_meeting_configs"),
        productId: product.id,
        optionId: option.id,
        mode: "meet_or_pickup",
        allowCustomPickup: true,
        allowCustomDropoff: false,
        requiresPickupSelection: true,
        requiresDropoffSelection: false,
        usePickupAllotment: true,
        meetingInstructions: productPlan.meetingInstructions,
        pickupInstructions: productPlan.pickupInstructions,
        dropoffInstructions: productPlan.pickupInstructions,
        active: true,
      })
      .returning()

    const [pickupGroup] = await ctx.db
      .insert(pickupGroups)
      .values({
        id: newId("pickup_groups"),
        meetingConfigId: meetingConfig.id,
        kind: "pickup",
        name: `${productPlan.name} pickups`,
        description: productPlan.pickupInstructions,
        active: true,
        sortOrder: 0,
      })
      .returning()

    const [pickupLocation] = await ctx.db
      .insert(pickupLocations)
      .values({
        id: newId("pickup_locations"),
        groupId: pickupGroup.id,
        name: productPlan.pickupPoints[0] || `${productPlan.name} lobby`,
        description: productPlan.pickupInstructions,
        locationText: productPlan.pickupPoints.join(", "),
        leadTimeMinutes: 15,
        active: true,
        sortOrder: 0,
      })
      .returning()

    await ctx.db.insert(locationPickupTimes).values({
      id: newId("location_pickup_times"),
      pickupLocationId: pickupLocation.id,
      startTimeId: startTime.id,
      timingMode: "fixed_time",
      localTime: "08:40",
      instructions: productPlan.pickupInstructions,
      initialCapacity: 10,
      remainingCapacity: 8,
      active: true,
    })

    await ctx.db.insert(customPickupAreas).values({
      id: newId("custom_pickup_areas"),
      meetingConfigId: meetingConfig.id,
      name: `${productPlan.name} city center`,
      description: `Custom pickup coverage for ${productPlan.name}.`,
      geographicText: plan.destinations.find(
        (destination) => destination.slug === productPlan.destinationSlug,
      )?.name,
      active: true,
    })

    if (!ctx.args.noImages) {
      const image = await fetchUnsplashPhoto({
        query: `${productPlan.name} ${productPlan.destinationSlug} travel`,
      })

      if (image) {
        await ctx.db.insert(productMedia).values({
          id: newId("product_media"),
          productId: product.id,
          dayId: dayRows[0]?.id,
          mediaType: "image",
          name: `${productPlan.name} cover`,
          url: image.url,
          mimeType: "image/jpeg",
          altText: image.altText,
          sortOrder: 0,
          isCover: true,
          isBrochure: false,
          isBrochureCurrent: false,
        })
      }
    }

    productSeeds.set(productPlan.name, {
      productId: product.id,
      optionId: option.id,
      unitId: unit.id,
      slotIds,
      destinationId: destinationId ?? "",
      categoryId: category.id,
    })
  }

  return productSeeds
}

async function seedActivitiesAndSales(
  ctx: SeedContext,
  plan: WorldPlan,
  customerSeeds: Map<string, CustomerSeed>,
  productSeeds: Map<string, ProductSeed>,
) {
  const [pipeline] = await ctx.db
    .insert(pipelines)
    .values({
      id: newId("pipelines"),
      entityType: "proposal",
      name: `Seed sales pipeline ${ctx.labelSlug}`,
      isDefault: false,
      sortOrder: 0,
    })
    .returning()

  const [qualifiedStage, proposalStage, negotiationStage, wonStage] = await ctx.db
    .insert(stages)
    .values([
      {
        id: newId("stages"),
        pipelineId: pipeline.id,
        name: "Qualified",
        sortOrder: 0,
        probability: 20,
        isClosed: false,
        isWon: false,
        isLost: false,
      },
      {
        id: newId("stages"),
        pipelineId: pipeline.id,
        name: "Proposal",
        sortOrder: 1,
        probability: 45,
        isClosed: false,
        isWon: false,
        isLost: false,
      },
      {
        id: newId("stages"),
        pipelineId: pipeline.id,
        name: "Negotiation",
        sortOrder: 2,
        probability: 70,
        isClosed: false,
        isWon: false,
        isLost: false,
      },
      {
        id: newId("stages"),
        pipelineId: pipeline.id,
        name: "Won",
        sortOrder: 3,
        probability: 100,
        isClosed: true,
        isWon: true,
        isLost: false,
      },
    ])
    .returning()

  const stageByName = new Map([
    ["qualified", qualifiedStage.id],
    ["proposal", proposalStage.id],
    ["negotiation", negotiationStage.id],
    ["won", wonStage.id],
  ])

  for (const [index, proposalPlan] of plan.proposals.entries()) {
    const customerSeed = customerSeeds.get(proposalPlan.customerName)
    if (!customerSeed) continue

    const productItems = proposalPlan.products
      .map((productItem) => {
        const productSeed = productSeeds.get(productItem.productName)
        return productSeed
          ? {
              productSeed,
              productItem,
            }
          : null
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value))

    const [proposal] = await ctx.db
      .insert(proposals)
      .values({
        id: newId("proposals"),
        title: proposalPlan.title,
        personId:
          customerSeed.emailToPersonId.get(proposalPlan.contactEmail.toLowerCase()) ??
          customerSeed.primaryContactId,
        organizationId: customerSeed.organizationId,
        pipelineId: pipeline.id,
        stageId: stageByName.get(proposalPlan.stage) ?? proposalStage.id,
        ownerId: ctx.ownerUserId,
        status: proposalPlan.stage === "won" ? "won" : "open",
        valueAmountCents: productItems.reduce(
          (sum, item) => sum + item.productItem.quantity * 20_000,
          0,
        ),
        valueCurrency: plan.workspace.currency,
        expectedCloseDate: proposalPlan.closeDate,
        source: "operator_seed",
        sourceRef: ctx.labelSlug,
        tags: ["seeded", proposalPlan.stage],
        stageChangedAt: new Date(),
        closedAt: proposalPlan.stage === "won" ? new Date() : null,
      })
      .returning()

    await ctx.db.insert(proposalParticipants).values({
      id: newId("proposal_participants"),
      proposalId: proposal.id,
      personId: customerSeed.primaryContactId,
      role: "decision_maker",
      isPrimary: true,
    })

    for (const [lineIndex, item] of productItems.entries()) {
      await ctx.db.insert(proposalProducts).values({
        id: newId("proposal_products"),
        proposalId: proposal.id,
        productId: item.productSeed.productId,
        supplierServiceId: null,
        nameSnapshot: item.productItem.productName,
        description: `Seeded proposal line for ${item.productItem.productName}`,
        quantity: item.productItem.quantity,
        unitPriceAmountCents: 20_000 + lineIndex * 5_000,
        costAmountCents: 12_000 + lineIndex * 2_000,
        currency: plan.workspace.currency,
      })
    }

    const [proposalVersion] = await ctx.db
      .insert(proposalVersions)
      .values({
        id: newId("proposal_versions"),
        proposalId: proposal.id,
        status: proposalPlan.stage === "won" ? "accepted" : "sent",
        validUntil: shiftDateString(proposalPlan.closeDate, 14),
        currency: plan.workspace.currency,
        subtotalAmountCents: productItems.length * 20_000,
        taxAmountCents: Math.round(productItems.length * 20_000 * 0.09),
        totalAmountCents: Math.round(productItems.length * 20_000 * 1.09),
        notes: proposalPlan.notes,
      })
      .returning()

    for (const [lineIndex, item] of productItems.entries()) {
      const totalAmount = item.productItem.quantity * (18_000 + lineIndex * 4_000)
      await ctx.db.insert(proposalVersionLines).values({
        id: newId("proposal_version_lines"),
        proposalVersionId: proposalVersion.id,
        productId: item.productSeed.productId,
        supplierServiceId: null,
        description: item.productItem.productName,
        quantity: item.productItem.quantity,
        unitPriceAmountCents: Math.floor(totalAmount / item.productItem.quantity),
        totalAmountCents: totalAmount,
        currency: plan.workspace.currency,
      })
    }

    const [activity] = await ctx.db
      .insert(activities)
      .values({
        id: newId("activities"),
        subject: `${proposalPlan.title} follow-up`,
        type: index === 0 ? "meeting" : "email",
        ownerId: ctx.ownerUserId,
        status: proposalPlan.stage === "won" ? "done" : "planned",
        dueAt: daysFromNow(5 + index),
        completedAt: proposalPlan.stage === "won" ? new Date() : null,
        location: "Operator HQ",
        description: proposalPlan.notes,
      })
      .returning()

    await ctx.db.insert(activityLinks).values([
      {
        id: newId("activity_links"),
        activityId: activity.id,
        entityType: "organization",
        entityId: customerSeed.organizationId,
        role: "related",
      },
      {
        id: newId("activity_links"),
        activityId: activity.id,
        entityType: "proposal",
        entityId: proposal.id,
        role: "related",
      },
    ])

    await ctx.db.insert(activityParticipants).values({
      id: newId("activity_participants"),
      activityId: activity.id,
      personId: customerSeed.primaryContactId,
      isPrimary: true,
    })
  }
}

async function seedTransactionsAndBookings(
  ctx: SeedContext,
  plan: WorldPlan,
  customerSeeds: Map<string, CustomerSeed>,
  productSeeds: Map<string, ProductSeed>,
) {
  for (const [index, bookingPlan] of plan.bookings.entries()) {
    const customerSeed = customerSeeds.get(bookingPlan.customerName)
    const productSeed = productSeeds.get(bookingPlan.productName)
    if (!customerSeed || !productSeed) continue

    const participantCount = Math.max(1, bookingPlan.participantCount)
    const unitPrice = 18_000 + index * 2_500
    const totalSell = participantCount * unitPrice
    const totalCost = Math.round(totalSell * 0.62)
    const bookingNumber = `BK-${ctx.labelSlug.toUpperCase()}-${String(index + 1).padStart(4, "0")}`
    const providerOrderRef = `ORD-${ctx.labelSlug.toUpperCase()}-${String(index + 1).padStart(4, "0")}`
    const invoiceNumber = `INV-${ctx.labelSlug.toUpperCase()}-${String(index + 1).padStart(4, "0")}`

    const leadPersonId =
      customerSeed.emailToPersonId.get(bookingPlan.contactEmail.toLowerCase()) ??
      customerSeed.primaryContactId
    const serviceDate = shiftDateString("2026-06-20", index * 3)
    const slotId = productSeed.slotIds[index % productSeed.slotIds.length] ?? null

    const [booking] = await ctx.db
      .insert(bookings)
      .values({
        id: newId("bookings"),
        bookingNumber,
        status: bookingPlan.status,
        personId: leadPersonId,
        organizationId: customerSeed.organizationId,
        sourceType: bookingPlan.sourceType,
        communicationLanguage: plan.workspace.locale,
        sellCurrency: plan.workspace.currency,
        sellAmountCents: totalSell,
        costAmountCents: totalCost,
        marginPercent: Math.round(((totalSell - totalCost) / totalSell) * 100),
        startDate: serviceDate,
        endDate: serviceDate,
        pax: participantCount,
        internalNotes: bookingPlan.notes,
        confirmedAt:
          bookingPlan.status === "confirmed" || bookingPlan.status === "completed"
            ? daysAgo(6)
            : null,
        completedAt: bookingPlan.status === "completed" ? daysAgo(1) : null,
      })
      .returning()

    await ctx.db.insert(bookingOrigins).values({
      bookingId: booking.id,
      originSource: "provider_source_order",
      providerSourceKind: "seed",
      providerSourceProvider: "operator_seed",
      providerSourceRef: bookingNumber,
      providerOrderRef,
      metadata: { seedLabel: ctx.labelSlug },
    })

    await ctx.db.insert(legalTerms).values([
      {
        id: newId("order_terms"),
        targetKind: "booking",
        targetId: booking.id,
        termType: "terms_and_conditions",
        title: "General booking terms",
        body: "Seeded booking terms covering payment, cancellation, and traveler responsibilities.",
        language: plan.workspace.locale,
        required: true,
        sortOrder: 0,
        acceptanceStatus: "accepted",
        acceptedAt: new Date(),
        acceptedBy: bookingPlan.leadTraveler.email,
        metadata: { seedLabel: ctx.labelSlug },
      },
      {
        id: newId("order_terms"),
        targetKind: "booking",
        targetId: booking.id,
        termType: "cancellation",
        title: "Cancellation policy",
        body: "Seeded cancellation policy with partial refund windows.",
        language: plan.workspace.locale,
        required: true,
        sortOrder: 1,
        acceptanceStatus: bookingPlan.status === "draft" ? "pending" : "accepted",
        acceptedAt: bookingPlan.status === "draft" ? null : new Date(),
        acceptedBy: bookingPlan.status === "draft" ? null : bookingPlan.leadTraveler.email,
        metadata: { seedLabel: ctx.labelSlug },
      },
    ])

    const bookingTravelerIds: string[] = []
    for (let travelerIndex = 0; travelerIndex < participantCount; travelerIndex += 1) {
      const isLead = travelerIndex === 0
      const [bookingTraveler] = await ctx.db
        .insert(bookingTravelers)
        .values({
          id: newId("booking_travelers"),
          bookingId: booking.id,
          personId: isLead ? leadPersonId : null,
          participantType: "traveler",
          travelerCategory: "adult",
          firstName: isLead ? bookingPlan.leadTraveler.firstName : `Guest${travelerIndex + 1}`,
          lastName: isLead ? bookingPlan.leadTraveler.lastName : bookingPlan.leadTraveler.lastName,
          email: isLead ? bookingPlan.leadTraveler.email : null,
          preferredLanguage: plan.workspace.locale,
          specialRequests: travelerIndex === 0 ? bookingPlan.notes : null,
          isPrimary: isLead,
          notes: `Seeded traveler ${travelerIndex + 1}`,
        })
        .returning()

      bookingTravelerIds.push(bookingTraveler.id)
    }

    const [bookingItem] = await ctx.db
      .insert(bookingItems)
      .values({
        id: newId("booking_items"),
        bookingId: booking.id,
        title: bookingPlan.productName,
        description: bookingPlan.notes,
        itemType: "unit",
        status: bookingPlan.status === "completed" ? "fulfilled" : "confirmed",
        serviceDate,
        startsAt: new Date(`${serviceDate}T07:00:00.000Z`),
        endsAt: new Date(`${serviceDate}T10:00:00.000Z`),
        quantity: participantCount,
        sellCurrency: plan.workspace.currency,
        unitSellAmountCents: unitPrice,
        totalSellAmountCents: totalSell,
        costCurrency: plan.workspace.currency,
        unitCostAmountCents: Math.round(totalCost / participantCount),
        totalCostAmountCents: totalCost,
        notes: bookingPlan.notes,
        productId: productSeed.productId,
        optionId: productSeed.optionId,
        optionUnitId: productSeed.unitId,
        metadata: { providerOrderRef, seedLabel: ctx.labelSlug },
      })
      .returning()

    for (const [travelerIndex, travelerId] of bookingTravelerIds.entries()) {
      await ctx.db.insert(bookingItemTravelers).values({
        id: newId("booking_item_travelers"),
        bookingItemId: bookingItem.id,
        travelerId,
        role: "traveler",
        isPrimary: travelerIndex === 0,
      })
    }

    await ctx.db.insert(bookingAllocations).values({
      id: newId("booking_allocations"),
      bookingId: booking.id,
      bookingItemId: bookingItem.id,
      productId: productSeed.productId,
      optionId: productSeed.optionId,
      optionUnitId: productSeed.unitId,
      availabilitySlotId: slotId,
      quantity: participantCount,
      allocationType: "unit",
      status: bookingPlan.status === "draft" ? "held" : "confirmed",
      holdExpiresAt: bookingPlan.status === "draft" ? daysFromNow(2) : null,
      confirmedAt: bookingPlan.status === "draft" ? null : new Date(),
      metadata: { seedLabel: ctx.labelSlug },
    })

    await ctx.db.insert(bookingFulfillments).values({
      id: newId("booking_fulfillments"),
      bookingId: booking.id,
      bookingItemId: bookingItem.id,
      travelerId: bookingTravelerIds[0] ?? null,
      fulfillmentType: "voucher",
      deliveryChannel: "email",
      status: bookingPlan.status === "draft" ? "pending" : "issued",
      artifactUrl: `https://example.test/${ctx.labelSlug}/${bookingNumber}.pdf`,
      payload: { qrCode: bookingNumber, seedLabel: ctx.labelSlug },
      issuedAt: bookingPlan.status === "draft" ? null : new Date(),
    })

    if (bookingPlan.status === "completed") {
      await ctx.db.insert(bookingRedemptionEvents).values({
        id: newId("booking_redemption_events"),
        bookingId: booking.id,
        bookingItemId: bookingItem.id,
        travelerId: bookingTravelerIds[0] ?? null,
        redeemedAt: new Date(),
        redeemedBy: ctx.ownerUserId,
        location: "On-site check-in desk",
        method: "scan",
        metadata: { seedLabel: ctx.labelSlug },
      })
    }

    await ctx.db.insert(bookingPiiAccessLog).values({
      id: newId("booking_pii_access_log"),
      bookingId: booking.id,
      travelerId: bookingTravelerIds[0] ?? null,
      actorId: ctx.ownerUserId,
      actorType: "user",
      callerType: "seed_script",
      action: "read",
      outcome: "allowed",
      reason: "Seeded admin viewed lead traveler data",
      metadata: { label: ctx.labelSlug },
    })

    const [paymentInstrument] = await ctx.db
      .insert(paymentInstruments)
      .values({
        id: newId("payment_instruments"),
        ownerType: "client",
        personId: leadPersonId,
        organizationId: customerSeed.organizationId,
        instrumentType: "credit_card",
        status: "active",
        label: `Visa ending ${String(4242 + index).slice(-4)}`,
        provider: "Stripe",
        brand: "visa",
        last4: String(4242 + index).slice(-4),
        holderName: `${bookingPlan.leadTraveler.firstName} ${bookingPlan.leadTraveler.lastName}`,
        expiryMonth: 12,
        expiryYear: 2029,
        billingEmail: bookingPlan.leadTraveler.email,
        metadata: { seedLabel: ctx.labelSlug },
      })
      .returning()

    const [paymentSchedule] = await ctx.db
      .insert(bookingPaymentSchedules)
      .values({
        id: newId("booking_payment_schedules"),
        bookingId: booking.id,
        bookingItemId: bookingItem.id,
        scheduleType: index % 2 === 0 ? "deposit" : "balance",
        status: bookingPlan.status === "draft" ? "pending" : "paid",
        dueDate: shiftDateString(serviceDate, -14),
        currency: plan.workspace.currency,
        amountCents: Math.round(totalSell * 0.3),
        notes: "Seeded payment schedule",
      })
      .returning()

    const [authorization] = await ctx.db
      .insert(paymentAuthorizations)
      .values({
        id: newId("payment_authorizations"),
        bookingId: booking.id,
        paymentInstrumentId: paymentInstrument.id,
        status: bookingPlan.status === "draft" ? "pending" : "authorized",
        captureMode: "manual",
        currency: plan.workspace.currency,
        amountCents: Math.round(totalSell * 0.3),
        provider: "Stripe",
        externalAuthorizationId: `auth_${ctx.labelSlug}_${index + 1}`,
        approvalCode: `APR${1000 + index}`,
        authorizedAt: bookingPlan.status === "draft" ? null : daysAgo(5),
        expiresAt: shiftDate(serviceDate, 2),
        notes: "Seeded authorization",
      })
      .returning()

    const [capture] = await ctx.db
      .insert(paymentCaptures)
      .values({
        id: newId("payment_captures"),
        paymentAuthorizationId: authorization.id,
        status: bookingPlan.status === "draft" ? "pending" : "completed",
        currency: plan.workspace.currency,
        amountCents: Math.round(totalSell * 0.3),
        provider: "Stripe",
        externalCaptureId: `cap_${ctx.labelSlug}_${index + 1}`,
        capturedAt: bookingPlan.status === "draft" ? null : daysAgo(4),
        settledAt: bookingPlan.status === "draft" ? null : daysAgo(3),
        notes: "Seeded capture",
      })
      .returning()

    const [guarantee] = await ctx.db
      .insert(bookingGuarantees)
      .values({
        id: newId("booking_guarantees"),
        bookingId: booking.id,
        bookingPaymentScheduleId: paymentSchedule.id,
        bookingItemId: bookingItem.id,
        guaranteeType: "credit_card",
        status: bookingPlan.status === "draft" ? "pending" : "active",
        paymentInstrumentId: paymentInstrument.id,
        paymentAuthorizationId: authorization.id,
        currency: plan.workspace.currency,
        amountCents: Math.round(totalSell * 0.3),
        provider: "Stripe",
        referenceNumber: `guar_${ctx.labelSlug}_${index + 1}`,
        guaranteedAt: bookingPlan.status === "draft" ? null : daysAgo(5),
        expiresAt: shiftDate(serviceDate, 2),
        notes: "Seeded guarantee",
      })
      .returning()

    const [invoice] = await ctx.db
      .insert(invoices)
      .values({
        id: newId("invoices"),
        invoiceNumber,
        invoiceType: "invoice",
        bookingId: booking.id,
        personId: leadPersonId,
        organizationId: customerSeed.organizationId,
        status:
          bookingPlan.status === "draft"
            ? "draft"
            : bookingPlan.status === "completed"
              ? "paid"
              : "issued",
        currency: plan.workspace.currency,
        subtotalCents: totalSell,
        taxCents: Math.round(totalSell * 0.09),
        totalCents: Math.round(totalSell * 1.09),
        paidCents: bookingPlan.status === "draft" ? 0 : Math.round(totalSell * 0.3),
        balanceDueCents:
          bookingPlan.status === "draft"
            ? Math.round(totalSell * 1.09)
            : Math.round(totalSell * 1.09) - Math.round(totalSell * 0.3),
        issueDate: shiftDateString(serviceDate, -16),
        dueDate: shiftDateString(serviceDate, -7),
        notes: bookingPlan.notes,
      })
      .returning()

    await ctx.db.insert(invoiceLineItems).values({
      id: newId("invoice_line_items"),
      invoiceId: invoice.id,
      bookingItemId: bookingItem.id,
      description: bookingPlan.productName,
      quantity: participantCount,
      unitPriceCents: unitPrice,
      totalCents: totalSell,
      taxRate: 900,
      sortOrder: 0,
    })

    const [payment] = await ctx.db
      .insert(payments)
      .values({
        id: newId("payments"),
        invoiceId: invoice.id,
        amountCents: Math.round(totalSell * 0.3),
        currency: plan.workspace.currency,
        paymentMethod: "credit_card",
        paymentInstrumentId: paymentInstrument.id,
        paymentAuthorizationId: authorization.id,
        paymentCaptureId: capture.id,
        status: bookingPlan.status === "draft" ? "pending" : "completed",
        referenceNumber: `pay_${ctx.labelSlug}_${index + 1}`,
        paymentDate: shiftDateString(serviceDate, -8),
        notes: "Seeded payment",
      })
      .returning()

    await ctx.db.insert(paymentSessions).values({
      id: newId("payment_sessions"),
      targetType: "invoice",
      targetId: invoice.id,
      bookingId: booking.id,
      invoiceId: invoice.id,
      bookingPaymentScheduleId: paymentSchedule.id,
      bookingGuaranteeId: guarantee.id,
      paymentInstrumentId: paymentInstrument.id,
      paymentAuthorizationId: authorization.id,
      paymentCaptureId: capture.id,
      paymentId: payment.id,
      status: bookingPlan.status === "draft" ? "requires_redirect" : "paid",
      provider: "Stripe",
      providerSessionId: `sess_${ctx.labelSlug}_${index + 1}`,
      providerPaymentId: `pi_${ctx.labelSlug}_${index + 1}`,
      externalReference: bookingNumber,
      idempotencyKey: `${ctx.labelSlug}-${bookingNumber}`,
      clientReference: bookingNumber,
      currency: plan.workspace.currency,
      amountCents: Math.round(totalSell * 0.3),
      paymentMethod: "credit_card",
      payerPersonId: leadPersonId,
      payerOrganizationId: customerSeed.organizationId,
      payerEmail: bookingPlan.leadTraveler.email,
      payerName: `${bookingPlan.leadTraveler.firstName} ${bookingPlan.leadTraveler.lastName}`,
      redirectUrl: `https://example.test/pay/${bookingNumber}`,
      returnUrl: `https://example.test/bookings/${bookingNumber}`,
      cancelUrl: `https://example.test/bookings/${bookingNumber}/cancel`,
      callbackUrl: `https://example.test/webhooks/payments/${bookingNumber}`,
      expiresAt: shiftDate(serviceDate, -6),
      completedAt: bookingPlan.status === "draft" ? null : daysAgo(4),
      notes: "Seeded payment session",
      providerPayload: { seedLabel: ctx.labelSlug },
      metadata: { seedLabel: ctx.labelSlug },
    })

    await ctx.db.insert(financeNotes).values({
      id: newId("finance_notes"),
      invoiceId: invoice.id,
      authorId: ctx.ownerUserId,
      content: `Seeded finance note for ${invoiceNumber}.`,
    })
  }
}

async function fetchUnsplashPhoto(params: { query: string }) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY
  if (!accessKey) {
    return null
  }

  const response = await fetch(
    `https://api.unsplash.com/photos/random?orientation=landscape&content_filter=high&query=${encodeURIComponent(params.query)}`,
    {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        "Accept-Version": "v1",
      },
    },
  )

  if (!response.ok) {
    return null
  }

  const payload = (await response.json()) as {
    urls?: { regular?: string }
    alt_description?: string | null
    user?: { name?: string }
    links?: { download_location?: string }
  }

  if (payload.links?.download_location) {
    void fetch(payload.links.download_location, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        "Accept-Version": "v1",
      },
    }).catch(() => undefined)
  }

  if (!payload.urls?.regular) {
    return null
  }

  return {
    url: payload.urls.regular,
    altText:
      payload.alt_description && payload.user?.name
        ? `${payload.alt_description} — Photo by ${payload.user.name} on Unsplash`
        : payload.alt_description || "Seeded Unsplash image",
  }
}

function createRng(seed: string) {
  const hash = crypto.createHash("sha256").update(seed).digest()
  let state = hash.readUInt32LE(0)

  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

function shiftDateString(dateString: string, dayOffset: number) {
  const date = new Date(`${dateString}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + dayOffset)
  return date.toISOString().slice(0, 10)
}

function shiftDate(dateString: string, dayOffset: number) {
  return new Date(`${shiftDateString(dateString, dayOffset)}T00:00:00.000Z`)
}

function daysAgo(days: number) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return date
}

function daysFromNow(days: number) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date
}

function printPlanSummary(plan: WorldPlan, args: SeedArgs) {
  console.log(
    JSON.stringify(
      {
        mode: "dry-run",
        label: args.label,
        scale: args.scale,
        workspace: plan.workspace.name,
        destinations: plan.destinations.length,
        customers: plan.customers.length,
        suppliers: plan.suppliers.length,
        products: plan.products.length,
        proposals: plan.proposals.length,
        bookings: plan.bookings.length,
      },
      null,
      2,
    ),
  )
}

function printSuccess(args: SeedArgs, plan: WorldPlan) {
  console.log(
    [
      `Seeded operator database successfully.`,
      `Label: ${args.label}`,
      `Scale: ${args.scale}`,
      `Workspace: ${plan.workspace.name}`,
      `Customers: ${plan.customers.length}`,
      `Suppliers: ${plan.suppliers.length}`,
      `Products: ${plan.products.length}`,
      `Bookings: ${plan.bookings.length}`,
      args.noImages ? "Images: skipped" : "Images: attempted via Unsplash",
    ].join("\n"),
  )
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
  console.error(message)
  process.exitCode = 1
})
