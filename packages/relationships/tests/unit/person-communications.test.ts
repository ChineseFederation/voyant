import { describe, expect, it } from "vitest"

import type { PersonNotificationDelivery } from "../../src/runtime-port.js"
import type { CommunicationLogEntry } from "../../src/schema.js"
import { mergePersonCommunications } from "../../src/service/person-communications.js"

const PERSON_ID = "person_01"

function logged(overrides: Partial<CommunicationLogEntry> = {}): CommunicationLogEntry {
  return {
    id: "communication_log_01",
    personId: PERSON_ID,
    organizationId: null,
    channel: "phone",
    direction: "inbound",
    subject: "Called about the itinerary",
    content: null,
    sentAt: new Date("2026-08-02T10:00:00Z"),
    createdAt: new Date("2026-08-02T10:00:00Z"),
    ...overrides,
  }
}

function delivery(overrides: Partial<PersonNotificationDelivery> = {}): PersonNotificationDelivery {
  return {
    id: "notification_deliveries_01",
    channel: "email",
    subject: "Your booking is confirmed",
    body: "Thanks for booking with us.",
    sentAt: "2026-08-03T09:00:00.000Z",
    createdAt: "2026-08-03T08:59:00.000Z",
    ...overrides,
  }
}

const QUERY = { limit: 50, offset: 0 }

describe("mergePersonCommunications", () => {
  it("interleaves both sources newest first", () => {
    const merged = mergePersonCommunications(PERSON_ID, [logged()], [delivery()], QUERY)

    expect(merged.map((entry) => entry.id)).toEqual([
      "notification_deliveries_01",
      "communication_log_01",
    ])
  })

  it("tags each entry with where it came from", () => {
    const merged = mergePersonCommunications(PERSON_ID, [logged()], [delivery()], QUERY)

    expect(merged.map((entry) => entry.source)).toEqual(["notification", "logged"])
  })

  it("presents a delivery as an outbound message attributed to the person", () => {
    const [entry] = mergePersonCommunications(PERSON_ID, [], [delivery()], QUERY)

    expect(entry).toMatchObject({
      personId: PERSON_ID,
      direction: "outbound",
      channel: "email",
      subject: "Your booking is confirmed",
      content: "Thanks for booking with us.",
      source: "notification",
    })
    expect(entry?.sentAt).toEqual(new Date("2026-08-03T09:00:00.000Z"))
  })

  it("drops deliveries whose channel the caller filtered out", () => {
    const merged = mergePersonCommunications(PERSON_ID, [logged()], [delivery()], {
      ...QUERY,
      channel: "phone",
    })

    expect(merged.map((entry) => entry.id)).toEqual(["communication_log_01"])
  })

  it("orders by createdAt when a delivery has no sent timestamp", () => {
    const merged = mergePersonCommunications(
      PERSON_ID,
      [logged({ sentAt: null, createdAt: new Date("2026-08-05T00:00:00Z") })],
      [delivery({ sentAt: null })],
      QUERY,
    )

    expect(merged.map((entry) => entry.id)).toEqual([
      "communication_log_01",
      "notification_deliveries_01",
    ])
  })

  it("never returns more than the requested page", () => {
    const merged = mergePersonCommunications(
      PERSON_ID,
      [logged(), logged({ id: "communication_log_02" })],
      [delivery(), delivery({ id: "notification_deliveries_02" })],
      { ...QUERY, limit: 3 },
    )

    expect(merged).toHaveLength(3)
  })
})
