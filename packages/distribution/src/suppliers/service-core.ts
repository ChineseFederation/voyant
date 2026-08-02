import { and, asc, desc, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { publicationServiceOperations } from "../service/publications.js"
import { supplierDirectoryProjections, suppliers } from "./schema.js"
import type {
  CreateSupplierInput,
  SupplierListQuery,
  UpdateSupplierInput,
} from "./service-shared.js"
import { hydrateSuppliers, syncSupplierIdentity } from "./service-shared.js"

export async function listSuppliers(db: PostgresJsDatabase, query: SupplierListQuery) {
  const conditions = []

  if (query.type) {
    conditions.push(eq(suppliers.type, query.type))
  }

  if (query.status) {
    conditions.push(eq(suppliers.status, query.status))
  }

  if (query.primaryFacilityId) {
    conditions.push(eq(suppliers.primaryFacilityId, query.primaryFacilityId))
  }

  if (query.defaultCurrency) {
    conditions.push(eq(suppliers.defaultCurrency, query.defaultCurrency))
  }

  if (query.country) {
    conditions.push(
      sql`exists (
        select 1
        from ${supplierDirectoryProjections}
        where ${supplierDirectoryProjections.supplierId} = ${suppliers.id}
          and ${supplierDirectoryProjections.country} = ${query.country}
      )`,
    )
  }

  if (query.search) {
    const term = `%${query.search}%`
    conditions.push(
      sql`(
        ${suppliers.name} ilike ${term}
        or
        exists (
          select 1
          from ${supplierDirectoryProjections}
          where ${supplierDirectoryProjections.supplierId} = ${suppliers.id}
            and (
              ${supplierDirectoryProjections.email} ilike ${term}
              or ${supplierDirectoryProjections.phone} ilike ${term}
              or ${supplierDirectoryProjections.website} ilike ${term}
              or ${supplierDirectoryProjections.address} ilike ${term}
              or ${supplierDirectoryProjections.city} ilike ${term}
              or ${supplierDirectoryProjections.country} ilike ${term}
              or ${supplierDirectoryProjections.contactName} ilike ${term}
              or ${supplierDirectoryProjections.contactEmail} ilike ${term}
              or ${supplierDirectoryProjections.contactPhone} ilike ${term}
            )
        )
      )`,
    )
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const sortColumn = (() => {
    switch (query.sortBy) {
      case "name":
        return suppliers.name
      case "type":
        return suppliers.type
      case "status":
        return suppliers.status
      case "defaultCurrency":
        return suppliers.defaultCurrency
      default:
        return suppliers.createdAt
    }
  })()
  const sortFn = query.sortDir === "asc" ? asc : desc

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(suppliers)
      .where(where)
      .limit(query.limit)
      .offset(query.offset)
      .orderBy(sortFn(sortColumn), desc(suppliers.createdAt)),
    db.select({ count: sql<number>`count(*)::int` }).from(suppliers).where(where),
  ])

  return {
    data: await hydrateSuppliers(db, rows),
    total: countResult[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  }
}

export async function getSupplierById(db: PostgresJsDatabase, id: string) {
  const [row] = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1)
  if (!row) {
    return null
  }

  const [hydrated] = await hydrateSuppliers(db, [row])
  return hydrated ?? null
}

export async function createSupplier(db: PostgresJsDatabase, data: CreateSupplierInput) {
  const {
    email,
    phone,
    website,
    address,
    city,
    country,
    contactName,
    contactEmail,
    contactPhone,
    ...supplierValues
  } = data

  const [row] = await db.insert(suppliers).values(supplierValues).returning()
  if (!row) {
    throw new Error("Failed to create supplier")
  }

  await syncSupplierIdentity(db, row.id, {
    email,
    phone,
    website,
    address,
    city,
    country,
    contactName,
    contactEmail,
    contactPhone,
  })

  return {
    ...row,
    email: email ?? null,
    phone: phone ?? null,
    website: website ?? null,
    address: address ?? null,
    city: city ?? null,
    country: country ?? null,
    contactName: contactName ?? null,
    contactEmail: contactEmail ?? null,
    contactPhone: contactPhone ?? null,
  }
}

export async function updateSupplier(
  db: PostgresJsDatabase,
  id: string,
  data: UpdateSupplierInput,
) {
  const existing = await getSupplierById(db, id)
  if (!existing) {
    return null
  }

  const {
    email,
    phone,
    website,
    address,
    city,
    country,
    contactName,
    contactEmail,
    contactPhone,
    ...supplierValues
  } = data
  const hasIdentityField = (
    [
      "email",
      "phone",
      "website",
      "address",
      "city",
      "country",
      "contactName",
      "contactEmail",
      "contactPhone",
    ] as const
  ).some((key) => Object.hasOwn(data, key))
  const identityValues = {
    email: Object.hasOwn(data, "email") ? (email ?? null) : existing.email,
    phone: Object.hasOwn(data, "phone") ? (phone ?? null) : existing.phone,
    website: Object.hasOwn(data, "website") ? (website ?? null) : existing.website,
    address: Object.hasOwn(data, "address") ? (address ?? null) : existing.address,
    city: Object.hasOwn(data, "city") ? (city ?? null) : existing.city,
    country: Object.hasOwn(data, "country") ? (country ?? null) : existing.country,
    contactName: Object.hasOwn(data, "contactName") ? (contactName ?? null) : existing.contactName,
    contactEmail: Object.hasOwn(data, "contactEmail")
      ? (contactEmail ?? null)
      : existing.contactEmail,
    contactPhone: Object.hasOwn(data, "contactPhone")
      ? (contactPhone ?? null)
      : existing.contactPhone,
  }

  const [row] = await db
    .update(suppliers)
    .set({ ...supplierValues, updatedAt: new Date() })
    .where(eq(suppliers.id, id))
    .returning()
  if (!row) {
    return null
  }

  if (hasIdentityField) {
    await syncSupplierIdentity(db, id, identityValues)
  }

  return {
    ...row,
    ...identityValues,
  }
}

export async function deleteSupplier(db: PostgresJsDatabase, id: string) {
  return db.transaction(async (tx) => {
    const affectedProductIds = await publicationServiceOperations.captureSupplierDeletionReindex(
      tx,
      { supplierId: id },
    )
    const [row] = await tx
      .delete(suppliers)
      .where(eq(suppliers.id, id))
      .returning({ id: suppliers.id })
    return row ? { ...row, affectedProductIds } : null
  })
}
