import { and, asc, desc, eq, getTableColumns, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { productsRef } from "./products-ref.js"
import {
  availabilityPickupPoints,
  availabilitySlotPickups,
  customPickupAreas,
  locationPickupTimes,
  pickupGroups,
  pickupLocations,
  productMeetingConfigs,
} from "./schema.js"
import type {
  AvailabilityPickupPointListQuery,
  AvailabilitySlotPickupListQuery,
  CreateAvailabilityPickupPointInput,
  CreateAvailabilitySlotPickupInput,
  CreateCustomPickupAreaInput,
  CreateLocationPickupTimeInput,
  CreatePickupGroupInput,
  CreatePickupLocationInput,
  CreateProductMeetingConfigInput,
  CustomPickupAreaListQuery,
  LocationPickupTimeListQuery,
  PickupGroupListQuery,
  PickupLocationListQuery,
  ProductMeetingConfigListQuery,
  UpdateAvailabilityPickupPointInput,
  UpdateAvailabilitySlotPickupInput,
  UpdateCustomPickupAreaInput,
  UpdateLocationPickupTimeInput,
  UpdatePickupGroupInput,
  UpdatePickupLocationInput,
  UpdateProductMeetingConfigInput,
} from "./service-shared.js"
import { paginate } from "./service-shared.js"

export async function listPickupPoints(
  db: PostgresJsDatabase,
  query: AvailabilityPickupPointListQuery,
) {
  const conditions = []
  if (query.productId) conditions.push(eq(availabilityPickupPoints.productId, query.productId))
  if (query.facilityId) conditions.push(eq(availabilityPickupPoints.facilityId, query.facilityId))
  if (query.active !== undefined) conditions.push(eq(availabilityPickupPoints.active, query.active))
  const where = conditions.length ? and(...conditions) : undefined

  return paginate(
    db
      .select({ ...getTableColumns(availabilityPickupPoints), productName: productsRef.name })
      .from(availabilityPickupPoints)
      .leftJoin(productsRef, eq(availabilityPickupPoints.productId, productsRef.id))
      .where(where)
      .limit(query.limit)
      .offset(query.offset)
      .orderBy(availabilityPickupPoints.createdAt),
    db.select({ count: sql<number>`count(*)::int` }).from(availabilityPickupPoints).where(where),
    query.limit,
    query.offset,
  )
}

export async function getPickupPointById(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .select()
    .from(availabilityPickupPoints)
    .where(eq(availabilityPickupPoints.id, id))
    .limit(1)
  return row ?? null
}

export async function createPickupPoint(
  db: PostgresJsDatabase,
  data: CreateAvailabilityPickupPointInput,
) {
  const [row] = await db.insert(availabilityPickupPoints).values(data).returning()
  return row
}

export async function updatePickupPoint(
  db: PostgresJsDatabase,
  id: string,
  data: UpdateAvailabilityPickupPointInput,
) {
  const [row] = await db
    .update(availabilityPickupPoints)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(availabilityPickupPoints.id, id))
    .returning()
  return row ?? null
}

export async function deletePickupPoint(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .delete(availabilityPickupPoints)
    .where(eq(availabilityPickupPoints.id, id))
    .returning({ id: availabilityPickupPoints.id })
  return row ?? null
}

export async function listSlotPickups(
  db: PostgresJsDatabase,
  query: AvailabilitySlotPickupListQuery,
) {
  const conditions = []
  if (query.slotId) conditions.push(eq(availabilitySlotPickups.slotId, query.slotId))
  if (query.pickupPointId) {
    conditions.push(eq(availabilitySlotPickups.pickupPointId, query.pickupPointId))
  }
  const where = conditions.length ? and(...conditions) : undefined

  return paginate(
    db
      .select()
      .from(availabilitySlotPickups)
      .where(where)
      .limit(query.limit)
      .offset(query.offset)
      .orderBy(availabilitySlotPickups.createdAt),
    db.select({ count: sql<number>`count(*)::int` }).from(availabilitySlotPickups).where(where),
    query.limit,
    query.offset,
  )
}

export async function getSlotPickupById(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .select()
    .from(availabilitySlotPickups)
    .where(eq(availabilitySlotPickups.id, id))
    .limit(1)
  return row ?? null
}

export async function createSlotPickup(
  db: PostgresJsDatabase,
  data: CreateAvailabilitySlotPickupInput,
) {
  const [row] = await db.insert(availabilitySlotPickups).values(data).returning()
  return row
}

export async function updateSlotPickup(
  db: PostgresJsDatabase,
  id: string,
  data: UpdateAvailabilitySlotPickupInput,
) {
  const [row] = await db
    .update(availabilitySlotPickups)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(availabilitySlotPickups.id, id))
    .returning()
  return row ?? null
}

export async function deleteSlotPickup(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .delete(availabilitySlotPickups)
    .where(eq(availabilitySlotPickups.id, id))
    .returning({ id: availabilitySlotPickups.id })
  return row ?? null
}

export async function listMeetingConfigs(
  db: PostgresJsDatabase,
  query: ProductMeetingConfigListQuery,
) {
  const conditions = []
  if (query.productId) conditions.push(eq(productMeetingConfigs.productId, query.productId))
  if (query.optionId) conditions.push(eq(productMeetingConfigs.optionId, query.optionId))
  if (query.facilityId) conditions.push(eq(productMeetingConfigs.facilityId, query.facilityId))
  if (query.mode) conditions.push(eq(productMeetingConfigs.mode, query.mode))
  if (query.active !== undefined) conditions.push(eq(productMeetingConfigs.active, query.active))
  const where = conditions.length ? and(...conditions) : undefined

  return paginate(
    db
      .select({ ...getTableColumns(productMeetingConfigs), productName: productsRef.name })
      .from(productMeetingConfigs)
      .leftJoin(productsRef, eq(productMeetingConfigs.productId, productsRef.id))
      .where(where)
      .limit(query.limit)
      .offset(query.offset)
      .orderBy(desc(productMeetingConfigs.updatedAt)),
    db.select({ count: sql<number>`count(*)::int` }).from(productMeetingConfigs).where(where),
    query.limit,
    query.offset,
  )
}

export async function getMeetingConfigById(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .select()
    .from(productMeetingConfigs)
    .where(eq(productMeetingConfigs.id, id))
    .limit(1)
  return row ?? null
}

export async function createMeetingConfig(
  db: PostgresJsDatabase,
  data: CreateProductMeetingConfigInput,
) {
  const [row] = await db.insert(productMeetingConfigs).values(data).returning()
  return row
}

export async function updateMeetingConfig(
  db: PostgresJsDatabase,
  id: string,
  data: UpdateProductMeetingConfigInput,
) {
  const [row] = await db
    .update(productMeetingConfigs)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(productMeetingConfigs.id, id))
    .returning()
  return row ?? null
}

export async function deleteMeetingConfig(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .delete(productMeetingConfigs)
    .where(eq(productMeetingConfigs.id, id))
    .returning({ id: productMeetingConfigs.id })
  return row ?? null
}

export async function listPickupGroups(db: PostgresJsDatabase, query: PickupGroupListQuery) {
  const conditions = []
  if (query.meetingConfigId)
    conditions.push(eq(pickupGroups.meetingConfigId, query.meetingConfigId))
  if (query.kind) conditions.push(eq(pickupGroups.kind, query.kind))
  if (query.active !== undefined) conditions.push(eq(pickupGroups.active, query.active))
  const where = conditions.length ? and(...conditions) : undefined

  return paginate(
    db
      .select()
      .from(pickupGroups)
      .where(where)
      .limit(query.limit)
      .offset(query.offset)
      .orderBy(asc(pickupGroups.sortOrder), pickupGroups.createdAt),
    db.select({ count: sql<number>`count(*)::int` }).from(pickupGroups).where(where),
    query.limit,
    query.offset,
  )
}

export async function getPickupGroupById(db: PostgresJsDatabase, id: string) {
  const [row] = await db.select().from(pickupGroups).where(eq(pickupGroups.id, id)).limit(1)
  return row ?? null
}

export async function createPickupGroup(db: PostgresJsDatabase, data: CreatePickupGroupInput) {
  const [row] = await db.insert(pickupGroups).values(data).returning()
  return row
}

export async function updatePickupGroup(
  db: PostgresJsDatabase,
  id: string,
  data: UpdatePickupGroupInput,
) {
  const [row] = await db
    .update(pickupGroups)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(pickupGroups.id, id))
    .returning()
  return row ?? null
}

export async function deletePickupGroup(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .delete(pickupGroups)
    .where(eq(pickupGroups.id, id))
    .returning({ id: pickupGroups.id })
  return row ?? null
}

export async function listPickupLocations(db: PostgresJsDatabase, query: PickupLocationListQuery) {
  const conditions = []
  if (query.groupId) conditions.push(eq(pickupLocations.groupId, query.groupId))
  if (query.facilityId) conditions.push(eq(pickupLocations.facilityId, query.facilityId))
  if (query.active !== undefined) conditions.push(eq(pickupLocations.active, query.active))
  const where = conditions.length ? and(...conditions) : undefined

  return paginate(
    db
      .select()
      .from(pickupLocations)
      .where(where)
      .limit(query.limit)
      .offset(query.offset)
      .orderBy(asc(pickupLocations.sortOrder), pickupLocations.createdAt),
    db.select({ count: sql<number>`count(*)::int` }).from(pickupLocations).where(where),
    query.limit,
    query.offset,
  )
}

export async function getPickupLocationById(db: PostgresJsDatabase, id: string) {
  const [row] = await db.select().from(pickupLocations).where(eq(pickupLocations.id, id)).limit(1)
  return row ?? null
}

export async function createPickupLocation(
  db: PostgresJsDatabase,
  data: CreatePickupLocationInput,
) {
  const [row] = await db.insert(pickupLocations).values(data).returning()
  return row
}

export async function updatePickupLocation(
  db: PostgresJsDatabase,
  id: string,
  data: UpdatePickupLocationInput,
) {
  const [row] = await db
    .update(pickupLocations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(pickupLocations.id, id))
    .returning()
  return row ?? null
}

export async function deletePickupLocation(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .delete(pickupLocations)
    .where(eq(pickupLocations.id, id))
    .returning({ id: pickupLocations.id })
  return row ?? null
}

export async function listLocationPickupTimes(
  db: PostgresJsDatabase,
  query: LocationPickupTimeListQuery,
) {
  const conditions = []
  if (query.pickupLocationId) {
    conditions.push(eq(locationPickupTimes.pickupLocationId, query.pickupLocationId))
  }
  if (query.slotId) conditions.push(eq(locationPickupTimes.slotId, query.slotId))
  if (query.startTimeId) conditions.push(eq(locationPickupTimes.startTimeId, query.startTimeId))
  if (query.active !== undefined) conditions.push(eq(locationPickupTimes.active, query.active))
  const where = conditions.length ? and(...conditions) : undefined

  return paginate(
    db
      .select()
      .from(locationPickupTimes)
      .where(where)
      .limit(query.limit)
      .offset(query.offset)
      .orderBy(locationPickupTimes.createdAt),
    db.select({ count: sql<number>`count(*)::int` }).from(locationPickupTimes).where(where),
    query.limit,
    query.offset,
  )
}

export async function getLocationPickupTimeById(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .select()
    .from(locationPickupTimes)
    .where(eq(locationPickupTimes.id, id))
    .limit(1)
  return row ?? null
}

export async function createLocationPickupTime(
  db: PostgresJsDatabase,
  data: CreateLocationPickupTimeInput,
) {
  const [row] = await db.insert(locationPickupTimes).values(data).returning()
  return row
}

export async function updateLocationPickupTime(
  db: PostgresJsDatabase,
  id: string,
  data: UpdateLocationPickupTimeInput,
) {
  const [row] = await db
    .update(locationPickupTimes)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(locationPickupTimes.id, id))
    .returning()
  return row ?? null
}

export async function deleteLocationPickupTime(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .delete(locationPickupTimes)
    .where(eq(locationPickupTimes.id, id))
    .returning({ id: locationPickupTimes.id })
  return row ?? null
}

export async function listCustomPickupAreas(
  db: PostgresJsDatabase,
  query: CustomPickupAreaListQuery,
) {
  const conditions = []
  if (query.meetingConfigId) {
    conditions.push(eq(customPickupAreas.meetingConfigId, query.meetingConfigId))
  }
  if (query.active !== undefined) conditions.push(eq(customPickupAreas.active, query.active))
  const where = conditions.length ? and(...conditions) : undefined

  return paginate(
    db
      .select()
      .from(customPickupAreas)
      .where(where)
      .limit(query.limit)
      .offset(query.offset)
      .orderBy(customPickupAreas.createdAt),
    db.select({ count: sql<number>`count(*)::int` }).from(customPickupAreas).where(where),
    query.limit,
    query.offset,
  )
}

export async function getCustomPickupAreaById(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .select()
    .from(customPickupAreas)
    .where(eq(customPickupAreas.id, id))
    .limit(1)
  return row ?? null
}

export async function createCustomPickupArea(
  db: PostgresJsDatabase,
  data: CreateCustomPickupAreaInput,
) {
  const [row] = await db.insert(customPickupAreas).values(data).returning()
  return row
}

export async function updateCustomPickupArea(
  db: PostgresJsDatabase,
  id: string,
  data: UpdateCustomPickupAreaInput,
) {
  const [row] = await db
    .update(customPickupAreas)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(customPickupAreas.id, id))
    .returning()
  return row ?? null
}

export async function deleteCustomPickupArea(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .delete(customPickupAreas)
    .where(eq(customPickupAreas.id, id))
    .returning({ id: customPickupAreas.id })
  return row ?? null
}
