import crypto from "node:crypto"
import { ensureCurrentUserProfile } from "@voyantjs/auth/workspace"
import { authSession, authUser } from "@voyantjs/db/schema/iam"
import { and, desc, eq } from "drizzle-orm"
import { Hono } from "hono"

import { buildBetterAuth } from "./auth/handler"
import { dbFromEnvForApp } from "./lib/db"
import { consumeTuyuAdministratorAssertion } from "./tuyu-admin-core"

const ADMIN_EMAIL = "tuyu-system-administrator@localhost"
const bridge = new Hono<{ Bindings: CloudflareBindings }>()

async function issueTechnicalSession(env: CloudflareBindings, marker: string) {
  const password = env.TUYU_VOYANT_ADMIN_PASSWORD?.trim()
  if (!password) throw new Error("TUYU_VOYANT_ADMIN_PASSWORD is required")
  const { db, dispose } = dbFromEnvForApp(env)
  try {
    const auth = buildBetterAuth(env, db)
    const request = (path: string, body: object) =>
      new Request(`${env.APP_URL}/auth/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": marker },
        body: JSON.stringify(body),
      })
    let response = await auth.handler(request("sign-in/email", { email: ADMIN_EMAIL, password }))
    if (!response.ok) {
      await auth.handler(
        request("sign-up/email", {
          email: ADMIN_EMAIL,
          password,
          name: "Tuyu System Administrator",
        }),
      )
      await db.update(authUser).set({ emailVerified: true }).where(eq(authUser.email, ADMIN_EMAIL))
      response = await auth.handler(request("sign-in/email", { email: ADMIN_EMAIL, password }))
    }
    if (!response.ok) throw new Error("cannot create Voyant administrator session")
    const [user] = await db
      .select({ id: authUser.id })
      .from(authUser)
      .where(eq(authUser.email, ADMIN_EMAIL))
      .limit(1)
    if (!user) throw new Error("Voyant technical administrator is missing")
    await ensureCurrentUserProfile(db, user.id)
    const [session] = await db
      .select({ id: authSession.id })
      .from(authSession)
      .where(and(eq(authSession.userId, user.id), eq(authSession.userAgent, marker)))
      .orderBy(desc(authSession.createdAt))
      .limit(1)
    if (!session) throw new Error("Voyant administrator session was not persisted")
    return { response, sessionId: session.id, db, dispose }
  } catch (error) {
    await dispose()
    throw error
  }
}

bridge.post("/tuyu-admin/consume", async (c) => {
  const body: { assertion?: string } = await c.req.json<{ assertion?: string }>().catch(() => ({}))
  const assertion = body.assertion ?? ""
  const marker = `TuyuBridge/${crypto.randomUUID()}`
  const issued = await issueTechnicalSession(c.env, marker)
  try {
    const accepted = await consumeTuyuAdministratorAssertion(c.env, assertion, issued.sessionId)
    if (!accepted) {
      await issued.db.delete(authSession).where(eq(authSession.id, issued.sessionId))
      return c.json({ error: "Invalid or expired administrator assertion" }, 401)
    }
    const headers = new Headers({ "content-type": "application/json; charset=utf-8" })
    for (const cookie of issued.response.headers.getSetCookie())
      headers.append("set-cookie", cookie)
    return new Response(JSON.stringify({ redirectTo: "/" }), { status: 200, headers })
  } finally {
    await issued.dispose()
  }
})

export default bridge
