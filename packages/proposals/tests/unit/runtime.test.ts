import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { resolveBookingSessionActorKind } from "../../src/runtime.js"

async function actorKind(actor?: string) {
  const app = new Hono()
  app.get("/", (context) => {
    if (actor) context.set("actor", actor)
    return context.json({ actorKind: resolveBookingSessionActorKind(context) })
  })
  const response = await app.request("http://localhost/")
  return (await response.json()) as { actorKind: string }
}

describe("proposals runtime", () => {
  it("preserves staff authority when seeding an accepted proposal booking session", async () => {
    await expect(actorKind("staff")).resolves.toEqual({ actorKind: "staff" })
  })

  it.each([
    undefined,
    "customer",
    "partner",
  ])("keeps %s proposal acceptance on the capability-based path", async (actor) => {
    await expect(actorKind(actor)).resolves.toEqual({ actorKind: "anonymous" })
  })
})
