import { describe, expect, it } from "vitest"

import {
  CHANNEL_PRESETS,
  findChannelPreset,
  isPersistableChannelPresetKey,
} from "../../src/channel-presets.js"
import { channelKindEnum } from "../../src/schema-shared.js"
import { insertChannelSchema, updateChannelSchema } from "../../src/validation.js"

describe("channel presets", () => {
  it("gives every preset a unique key", () => {
    const keys = CHANNEL_PRESETS.map((preset) => preset.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("only uses kinds the channel enum actually has", () => {
    const kinds = new Set<string>(channelKindEnum.enumValues)
    for (const preset of CHANNEL_PRESETS) {
      expect(kinds.has(preset.kind), `${preset.key} -> ${preset.kind}`).toBe(true)
    }
  })

  it("never offers Direct, which is provisioned rather than chosen", () => {
    expect(CHANNEL_PRESETS.some((preset) => preset.kind === "direct")).toBe(false)
  })

  it("persists a key for named networks and not for partner types", () => {
    expect(isPersistableChannelPresetKey("getyourguide")).toBe(true)
    expect(isPersistableChannelPresetKey("voyant-connect")).toBe(true)
    // An operator has many affiliates and none of them is *the* affiliate, so a
    // partner type prefills a form and claims no identity.
    expect(isPersistableChannelPresetKey("partner-affiliate")).toBe(false)
    expect(isPersistableChannelPresetKey("nope")).toBe(false)
  })

  it("resolves a preset by key", () => {
    expect(findChannelPreset("viator")).toMatchObject({ name: "Viator", kind: "ota" })
    expect(findChannelPreset("nope")).toBeNull()
  })

  it("accepts a network key on create and rejects anything else", () => {
    const base = { name: "GetYourGuide", kind: "ota" as const }
    expect(insertChannelSchema.safeParse({ ...base, presetKey: "getyourguide" }).success).toBe(true)
    expect(insertChannelSchema.safeParse({ ...base, presetKey: "partner-affiliate" }).success).toBe(
      false,
    )
    expect(insertChannelSchema.safeParse({ ...base, presetKey: "made-up" }).success).toBe(false)
    expect(insertChannelSchema.safeParse(base).success).toBe(true)
  })

  it("drops the key from the update schema so it cannot be re-pointed", () => {
    const parsed = updateChannelSchema.parse({ name: "Renamed", presetKey: "viator" })
    expect(parsed).not.toHaveProperty("presetKey")
  })
})
