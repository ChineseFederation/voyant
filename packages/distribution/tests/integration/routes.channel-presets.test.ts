import { describe, expect, it } from "vitest"

import { DB_AVAILABLE, json, setupDistributionRoutes } from "./routes.setup.js"

describe.skipIf(!DB_AVAILABLE)("Channel presets", () => {
  const ctx = setupDistributionRoutes()

  it("serves the catalog without creating anything", async () => {
    const res = await ctx.app.request("/channels/presets", { method: "GET" })
    expect(res.status).toBe(200)
    const keys = ((await res.json()).data as { key: string }[]).map((preset) => preset.key)
    expect(keys).toEqual(expect.arrayContaining(["getyourguide", "viator", "voyant-connect"]))

    // A catalog, not channels: picking is what creates a row.
    const channels = await ctx.app.request("/channels", { method: "GET" })
    expect((await channels.json()).total).toBe(0)
  })

  it("does not shadow the channel detail route", async () => {
    // `/channels/presets` is declared before `/channels/{id}`; if that ever
    // flips, this asks for a channel literally named "presets" and gets the
    // catalog instead of a 404.
    const res = await ctx.app.request("/channels/chan_missing", { method: "GET" })
    expect(res.status).toBe(404)
  })

  it("records the preset key on a channel created from a network", async () => {
    const res = await ctx.app.request("/channels", {
      method: "POST",
      ...json({ name: "GetYourGuide", kind: "ota", presetKey: "getyourguide" }),
    })

    expect(res.status).toBe(201)
    expect((await res.json()).data.presetKey).toBe("getyourguide")
  })

  it("refuses a second channel for the same network, and names the one that exists", async () => {
    await ctx.app.request("/channels", {
      method: "POST",
      ...json({ name: "GetYourGuide", kind: "ota", presetKey: "getyourguide" }),
    })

    const res = await ctx.app.request("/channels", {
      method: "POST",
      ...json({ name: "GetYourGuide (second)", kind: "ota", presetKey: "getyourguide" }),
    })

    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("GetYourGuide")
  })

  it("rejects a partner-type key, which names no counterparty", async () => {
    const res = await ctx.app.request("/channels", {
      method: "POST",
      ...json({ name: "Some affiliate", kind: "affiliate", presetKey: "partner-affiliate" }),
    })

    expect(res.status).toBe(400)
  })

  it("lets an operator keep many channels of the same partner shape", async () => {
    for (const name of ["Affiliate A", "Affiliate B"]) {
      const res = await ctx.app.request("/channels", {
        method: "POST",
        ...json({ name, kind: "affiliate" }),
      })
      expect(res.status).toBe(201)
      expect((await res.json()).data.presetKey).toBeNull()
    }
  })

  it("ignores a preset key on update, so the identity is fixed at creation", async () => {
    const created = await ctx.app.request("/channels", {
      method: "POST",
      ...json({ name: "Viator", kind: "ota", presetKey: "viator" }),
    })
    const { id } = (await created.json()).data

    const res = await ctx.app.request(`/channels/${id}`, {
      method: "PATCH",
      ...json({ name: "Renamed", presetKey: "klook" }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.name).toBe("Renamed")
    expect(body.data.presetKey).toBe("viator")
  })
})
