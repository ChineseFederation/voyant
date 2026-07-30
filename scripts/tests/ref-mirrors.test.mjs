import assert from "node:assert/strict"
import test from "node:test"

import { checkRefMirrors } from "../checks/schema/ref-mirrors.ts"

const owner = {
  constName: "availabilitySlots",
  tableName: "availability_slots",
  file: "packages/availability/src/schema-core.ts",
  columns: { id: "typeId", status: "availabilitySlotStatusEnum", itineraryId: "typeIdRef" },
}

test("a partial mirror with weakened column types is allowed", () => {
  // This is the whole point of the pattern: typeId() and typeIdRef() ARE text(),
  // and mirroring an enum as text() avoids importing the owner's pgEnum, which
  // would reintroduce the cross-module schema dependency the mirror prevents.
  const mirror = {
    constName: "availabilitySlotsRef",
    tableName: "availability_slots",
    file: "packages/bookings/src/availability-ref.ts",
    columns: { id: "text", status: "text" },
  }
  assert.deepEqual(checkRefMirrors([owner, mirror]).violations, [])
})

test("a mirror declaring a column the owner lacks is caught", () => {
  const mirror = {
    constName: "availabilitySlotsRef",
    tableName: "availability_slots",
    file: "packages/bookings/src/availability-ref.ts",
    columns: { id: "text", nonExistent: "text" },
  }
  const { violations } = checkRefMirrors([owner, mirror])
  assert.equal(violations.length, 1)
  assert.match(violations[0], /nonExistent is not a column of "availability_slots"/)
  assert.match(violations[0], /owned by packages\/availability\/src\/schema-core\.ts/)
})

test("a mirror of a table nothing owns is caught", () => {
  const mirror = {
    constName: "ghostRef",
    tableName: "ghost_table",
    file: "packages/bookings/src/ghost-ref.ts",
    columns: { id: "text" },
  }
  assert.match(
    checkRefMirrors([owner, mirror]).violations[0],
    /mirrors table "ghost_table", which no package declares/,
  )
})

test("two mirrors of one table may declare different subsets", () => {
  // storefront and bookings both mirror product_extras with different columns;
  // that is two partial views, not a disagreement.
  const a = {
    constName: "availabilitySlotsRef",
    tableName: "availability_slots",
    file: "packages/a/src/x-ref.ts",
    columns: { id: "text" },
  }
  const b = {
    constName: "availabilitySlotsRef",
    tableName: "availability_slots",
    file: "packages/b/src/y-ref.ts",
    columns: { id: "text", status: "text", itineraryId: "text" },
  }
  assert.deepEqual(checkRefMirrors([owner, a, b]).violations, [])
})

test("the owner itself is never treated as a mirror", () => {
  const { checked } = checkRefMirrors([owner])
  assert.equal(checked, 0)
})
