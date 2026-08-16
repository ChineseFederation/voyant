import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { getTableColumns } from "drizzle-orm"
import { getTableConfig } from "drizzle-orm/pg-core"
import { getTableName, isTable } from "drizzle-orm/table"
import * as accommodationsSchema from "../packages/accommodations/src/schema.ts"
import * as availabilitySchema from "../packages/availability/src/schema.ts"
import { bookingExtras, extraParticipantSelections } from "../packages/bookings/src/extras.ts"
import * as bookingRequirementsSchema from "../packages/bookings/src/requirements/schema.ts"
import * as bookingsTravelDetailsSchema from "../packages/bookings/src/schema/travel-details.ts"
import * as bookingsCoreSchema from "../packages/bookings/src/schema-core.ts"
import * as bookingsItemsSchema from "../packages/bookings/src/schema-items.ts"
import * as bookingsOperationsSchema from "../packages/bookings/src/schema-operations.ts"
import * as commerceMarketsSchema from "../packages/commerce/src/markets/schema.ts"
import * as commercePricingCatalogsSchema from "../packages/commerce/src/pricing/schema-catalogs.ts"
import * as commercePricingCategoriesSchema from "../packages/commerce/src/pricing/schema-categories.ts"
import * as commercePricingDepartureOverridesSchema from "../packages/commerce/src/pricing/schema-departure-overrides.ts"
import * as commercePricingOptionRulesSchema from "../packages/commerce/src/pricing/schema-option-rules.ts"
import * as commercePricingPoliciesSchema from "../packages/commerce/src/pricing/schema-policies.ts"
import * as commercePricingRelationsSchema from "../packages/commerce/src/pricing/schema-relations.ts"
import * as commercePromotionsSchema from "../packages/commerce/src/promotions/schema.ts"
import * as commerceSellabilitySchema from "../packages/commerce/src/sellability/schema.ts"
import * as dbApiKeySchema from "../packages/db/src/schema/iam/apikey.ts"
import * as dbAuthSchema from "../packages/db/src/schema/iam/auth.ts"
import * as dbUserProfilesSchema from "../packages/db/src/schema/iam/user_profiles.ts"
import * as dbDomainsSchema from "../packages/db/src/schema/infra/domains.ts"
import * as dbEmailDomainRecordsSchema from "../packages/db/src/schema/infra/email_domain_records.ts"
import * as dbWebhookSubscriptionsSchema from "../packages/db/src/schema/infra/webhook_subscriptions.ts"
import * as distributionBookingExtensionSchema from "../packages/distribution/src/booking-extension.ts"
import * as distributionExternalRefsSchema from "../packages/distribution/src/external-refs/schema.ts"
import * as distributionAutomationSchema from "../packages/distribution/src/schema-automation.ts"
import * as distributionCoreSchema from "../packages/distribution/src/schema-core.ts"
import * as distributionFinanceSchema from "../packages/distribution/src/schema-finance.ts"
import * as distributionInventorySchema from "../packages/distribution/src/schema-inventory.ts"
import * as distributionPushIntentsSchema from "../packages/distribution/src/schema-push-intents.ts"
import * as distributionRelationsSchema from "../packages/distribution/src/schema-relations.ts"
import * as distributionSuppliersSchema from "../packages/distribution/src/suppliers/schema.ts"
import * as financeSchema from "../packages/finance/src/schema.ts"
import * as identitySchema from "../packages/identity/src/schema.ts"
import * as customerVerificationSchema from "../packages/identity/src/verification/schema.ts"
import * as inventoryAuthoringSchema from "../packages/inventory/src/authoring/schema.ts"
import * as productsBookingExtensionSchema from "../packages/inventory/src/booking-extension.ts"
import {
  extrasSourcedContentTable,
  optionExtraConfigs,
  productExtras,
} from "../packages/inventory/src/extras.ts"
import * as productsCoreSchema from "../packages/inventory/src/schema-core.ts"
import * as productsItinerarySchema from "../packages/inventory/src/schema-itinerary.ts"
import * as inventoryRelationsSchema from "../packages/inventory/src/schema-relations.ts"
import * as productsSettingsSchema from "../packages/inventory/src/schema-settings.ts"
import * as inventorySourcedContentSchema from "../packages/inventory/src/schema-sourced-content.ts"
import * as productsTaxonomySchema from "../packages/inventory/src/schema-taxonomy.ts"
import * as legalContractsSchema from "../packages/legal/src/contracts/schema.ts"
import * as legalPoliciesSchema from "../packages/legal/src/policies/schema.ts"
import * as notificationsSchema from "../packages/notifications/src/schema.ts"
import * as operationsGroundDispatchSchema from "../packages/operations/src/ground/schema-dispatch.ts"
import * as operationsGroundOperationsSchema from "../packages/operations/src/ground/schema-operations.ts"
import * as operationsGroundOperatorsSchema from "../packages/operations/src/ground/schema-operators.ts"
import * as operationsPlacesSchema from "../packages/operations/src/places/schema.ts"
import * as operationsResourcesSchema from "../packages/operations/src/resources/schema.ts"
import * as proposalsBookingExtensionSchema from "../packages/proposals/src/booking-extension.ts"
import * as proposalsSalesSchema from "../packages/proposals/src/schema-sales.ts"
import * as relationshipsAccountsSchema from "../packages/relationships/src/schema-accounts.ts"
import * as relationshipsActivitiesSchema from "../packages/relationships/src/schema-activities.ts"
import * as relationshipsSignalsSchema from "../packages/relationships/src/schema-signals.ts"

type ImportedModule = Record<string, unknown>

interface SectionDefinition {
  title: string
  modules: ImportedModule[]
}

interface TableDoc {
  name: string
  note?: string
  markdown: string
}

const inventoryExtrasSchema = {
  extrasSourcedContentTable,
  optionExtraConfigs,
  productExtras,
}

const bookingExtrasSchema = {
  bookingExtras,
  extraParticipantSelections,
}

const tableNotes = new Map<string, string>([
  ["user", "Better Auth"],
  ["session", "Better Auth"],
  ["account", "Better Auth"],
  ["verification", "Better Auth"],
  ["organization", "Better Auth organization plugin"],
  ["member", "Better Auth organization plugin"],
  ["invitation", "Better Auth organization plugin"],
  ["apikey", "Better Auth API key"],
])

const sections: SectionDefinition[] = [
  {
    title: "IAM & Auth",
    modules: [dbAuthSchema, dbApiKeySchema, dbUserProfilesSchema],
  },
  {
    title: "Infrastructure",
    modules: [dbDomainsSchema, dbEmailDomainRecordsSchema, dbWebhookSubscriptionsSchema],
  },
  {
    title: "Relationships",
    modules: [
      relationshipsAccountsSchema,
      relationshipsActivitiesSchema,
      relationshipsSignalsSchema,
    ],
  },
  {
    title: "Proposals",
    modules: [proposalsSalesSchema, proposalsBookingExtensionSchema],
  },
  {
    title: "Identity",
    modules: [identitySchema],
  },
  {
    title: "Inventory",
    modules: [
      inventoryAuthoringSchema,
      productsCoreSchema,
      productsSettingsSchema,
      productsItinerarySchema,
      productsTaxonomySchema,
      inventoryRelationsSchema,
      inventorySourcedContentSchema,
      productsBookingExtensionSchema,
      inventoryExtrasSchema,
    ],
  },
  {
    title: "Commerce",
    modules: [
      commerceMarketsSchema,
      commercePricingCategoriesSchema,
      commercePricingCatalogsSchema,
      commercePricingDepartureOverridesSchema,
      commercePricingOptionRulesSchema,
      commercePricingPoliciesSchema,
      commercePricingRelationsSchema,
      commercePromotionsSchema,
      commerceSellabilitySchema,
    ],
  },
  {
    title: "Bookings",
    modules: [
      bookingsCoreSchema,
      bookingsItemsSchema,
      bookingsOperationsSchema,
      bookingsTravelDetailsSchema,
      bookingRequirementsSchema,
      bookingExtrasSchema,
    ],
  },
  {
    title: "Operations",
    modules: [
      availabilitySchema,
      operationsPlacesSchema,
      operationsResourcesSchema,
      operationsGroundOperatorsSchema,
      operationsGroundDispatchSchema,
      operationsGroundOperationsSchema,
    ],
  },
  {
    title: "Distribution",
    modules: [
      distributionSuppliersSchema,
      distributionExternalRefsSchema,
      distributionCoreSchema,
      distributionInventorySchema,
      distributionFinanceSchema,
      distributionAutomationSchema,
      distributionPushIntentsSchema,
      distributionRelationsSchema,
      distributionBookingExtensionSchema,
    ],
  },
  {
    title: "Finance",
    modules: [financeSchema],
  },
  {
    title: "Legal",
    modules: [legalContractsSchema, legalPoliciesSchema],
  },
  {
    title: "Notifications & Verification",
    modules: [notificationsSchema, customerVerificationSchema],
  },
  {
    title: "Accommodations",
    modules: [accommodationsSchema],
  },
]

function getDefaultMarker(column: {
  default: unknown
  defaultFn?: unknown
  hasDefault: boolean
}): string | null {
  if (!column.hasDefault && !column.defaultFn) {
    return null
  }

  if (typeof column.default === "string") {
    return `default ${JSON.stringify(column.default)}`
  }

  if (typeof column.default === "number" || typeof column.default === "boolean") {
    return `default ${String(column.default)}`
  }

  if (Array.isArray(column.default)) {
    return `default ${JSON.stringify(column.default)}`
  }

  return "default"
}

function formatColumnName(propertyName: string, sqlName: string): string {
  if (propertyName === sqlName) {
    return `\`${sqlName}\``
  }

  return `\`${sqlName}\` (\`${propertyName}\`)`
}

function collectTableDocs(modules: ImportedModule[]): TableDoc[] {
  const seenTables = new Set<string>()
  const docs: TableDoc[] = []

  for (const module of modules) {
    for (const value of Object.values(module)) {
      if (!isTable(value)) {
        continue
      }

      const tableName = getTableName(value)
      if (seenTables.has(tableName)) {
        continue
      }

      seenTables.add(tableName)

      const tableConfig = getTableConfig(value)
      const columnEntries = Object.entries(getTableColumns(value))
      const primaryKeyColumns = new Set<string>()

      for (const primaryKey of tableConfig.primaryKeys) {
        for (const column of primaryKey.columns) {
          primaryKeyColumns.add(column.name)
        }
      }

      const singleColumnUniqueNames = new Set<string>()
      const compositeUniqueConstraints: string[] = []

      for (const uniqueConstraint of tableConfig.uniqueConstraints) {
        if (uniqueConstraint.columns.length === 1) {
          singleColumnUniqueNames.add(uniqueConstraint.columns[0].name)
          continue
        }

        compositeUniqueConstraints.push(
          uniqueConstraint.columns.map((column) => `\`${column.name}\``).join(", "),
        )
      }

      const foreignKeysByColumn = new Map<string, string[]>()

      for (const foreignKey of tableConfig.foreignKeys) {
        const reference = foreignKey.reference()

        reference.columns.forEach((column, index) => {
          const target = `${getTableName(reference.foreignTable)}.${reference.foreignColumns[index]?.name ?? "id"}`
          const existing = foreignKeysByColumn.get(column.name) ?? []
          existing.push(target)
          foreignKeysByColumn.set(column.name, existing)
        })
      }

      const rows = columnEntries.map(([propertyName, column]) => {
        const markers: string[] = [column.getSQLType()]

        if (primaryKeyColumns.has(column.name) || column.primary) {
          markers.push("PK")
        }

        const foreignKeys = foreignKeysByColumn.get(column.name) ?? []
        for (const foreignKey of foreignKeys) {
          markers.push(`FK -> ${foreignKey}`)
        }

        if (column.isUnique || singleColumnUniqueNames.has(column.name)) {
          markers.push("unique")
        }

        if (column.notNull) {
          markers.push("not null")
        } else {
          markers.push("nullable")
        }

        const defaultMarker = getDefaultMarker(column)
        if (defaultMarker) {
          markers.push(defaultMarker)
        }

        if (column.generatedIdentity) {
          markers.push("generated identity")
        } else if (column.generated) {
          markers.push("generated")
        }

        return `| ${formatColumnName(propertyName, column.name)} | ${markers.join(" • ")} |`
      })

      const compositePrimaryKeys = tableConfig.primaryKeys
        .filter((primaryKey) => primaryKey.columns.length > 1)
        .map((primaryKey) => primaryKey.columns.map((column) => `\`${column.name}\``).join(", "))

      const constraintLines: string[] = []

      for (const primaryKey of compositePrimaryKeys) {
        constraintLines.push(`- Primary key: ${primaryKey}`)
      }

      for (const uniqueConstraint of compositeUniqueConstraints) {
        constraintLines.push(`- Unique: ${uniqueConstraint}`)
      }

      const constraintBlock =
        constraintLines.length > 0 ? `\nConstraints:\n${constraintLines.join("\n")}\n` : ""

      docs.push({
        name: tableName,
        note: tableNotes.get(tableName),
        markdown: `### \`${tableName}\`${tableNotes.has(tableName) ? ` (${tableNotes.get(tableName)})` : ""}\n| Column | Type |\n|--------|------|\n${rows.join("\n")}\n${constraintBlock}`,
      })
    }
  }

  return docs.sort((left, right) => left.name.localeCompare(right.name))
}

function main(): void {
  const generatedAt = new Date().toISOString().slice(0, 10)
  const lines: string[] = [
    "# Voyant Database Schema Reference",
    "",
    `> Auto-generated from Drizzle table definitions via \`pnpm generate:schema-docs\` on ${generatedAt}.`,
    "> SQL column names are shown first; TypeScript property names are included when they differ.",
    "> Constraint markers are derived from the schema source, not from a live database introspection run.",
    "",
  ]

  for (const section of sections) {
    const tables = collectTableDocs(section.modules)
    if (tables.length === 0) {
      continue
    }

    lines.push(`## ${section.title}`, "")

    for (const table of tables) {
      lines.push(table.markdown.trimEnd(), "")
    }
  }

  const outputPath = join(process.cwd(), "SCHEMA.md")
  writeFileSync(outputPath, `${lines.join("\n").trimEnd()}\n`, "utf8")
  console.log(`Wrote ${outputPath}`)
}

main()
