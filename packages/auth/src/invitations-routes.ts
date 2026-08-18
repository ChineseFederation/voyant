import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { newId } from "@voyant-travel/db/lib/typeid"
import {
  authAccount,
  authUser,
  userInvitationsTable,
  userProfilesTable,
} from "@voyant-travel/db/schema/iam"
import { openApiValidationHook, type VoyantDb } from "@voyant-travel/hono"
import { hashPassword } from "better-auth/crypto"
import { and, desc, eq, gt, isNull } from "drizzle-orm"

import type { IdentityAccessRuntimeProvider } from "./identity-access-runtime-port.js"
import { localRoleForRedeemedInvitation } from "./team-management-local-adapter.js"

type IdentityAccessEnv = {
  Bindings: Record<string, unknown>
  Variables: { userId?: string; db: VoyantDb }
}

const DEFAULT_EXPIRY_HOURS = 72

const createInviteSchema = z.object({
  email: z.string().email(),
  expiresInHours: z
    .number()
    .int()
    .positive()
    .max(24 * 30)
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const redeemInviteSchema = z.object({
  name: z.string().min(1).max(200),
  // `writeOnly` is not decoration: it tells every consumer of this contract that
  // the field is accepted and never returned. The published document carried it
  // and the schema did not, so generating from the schema would have dropped a
  // security-relevant statement about a password field.
  password: z.string().min(8).max(128).openapi({ writeOnly: true }),
})

const invitationAdminApiId = "@voyant-travel/auth#invitations.api.admin"
const invitationPublicApiId = "@voyant-travel/auth#invitations.api.public"
const jsonBody = <T extends z.ZodTypeAny>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
})
const responses = (...statuses: number[]) =>
  Object.fromEntries(statuses.map((status) => [status, { description: `HTTP ${status}` }]))

const listInvitationsRoute = createRoute({
  method: "get",
  path: "/",
  operationId: "listAuthInvitations",
  "x-voyant-api-id": invitationAdminApiId,
  responses: responses(200, 403),
})
const createInvitationRoute = createRoute({
  method: "post",
  path: "/",
  operationId: "createAuthInvitation",
  "x-voyant-api-id": invitationAdminApiId,
  request: { body: jsonBody(createInviteSchema) },
  responses: responses(200, 403, 409),
})
const deleteInvitationRoute = createRoute({
  method: "delete",
  path: "/{id}",
  operationId: "deleteAuthInvitation",
  "x-voyant-api-id": invitationAdminApiId,
  request: { params: z.object({ id: z.string() }) },
  responses: responses(200, 403),
})
const inspectInvitationRoute = createRoute({
  method: "get",
  path: "/{token}",
  operationId: "inspectAuthInvitation",
  "x-voyant-api-id": invitationPublicApiId,
  request: { params: z.object({ token: z.string() }) },
  responses: responses(200, 404, 410),
})
const redeemInvitationRoute = createRoute({
  method: "post",
  path: "/{token}/redeem",
  operationId: "redeemAuthInvitation",
  "x-voyant-api-id": invitationPublicApiId,
  request: {
    params: z.object({ token: z.string() }),
    body: jsonBody(redeemInviteSchema),
  },
  responses: responses(200, 409, 410),
})

function randomTokenBase64Url(bytes: number): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  let binary = ""
  for (const byte of buf) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

async function isSuperAdmin(db: VoyantDb, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ isSuperAdmin: userProfilesTable.isSuperAdmin })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.id, userId))
    .limit(1)
  return !!row?.isSuperAdmin
}

export function createInvitationsAdminRoutes(runtime: IdentityAccessRuntimeProvider) {
  const routes = new OpenAPIHono<IdentityAccessEnv>({ defaultHook: openApiValidationHook })

  routes.openapi(listInvitationsRoute, async (c) => {
    const userId = c.get("userId")
    const db = c.get("db")
    if (!userId || !(await isSuperAdmin(db, userId))) return c.json({ error: "Forbidden" }, 403)

    const rows = await db
      .select({
        id: userInvitationsTable.id,
        email: userInvitationsTable.email,
        expiresAt: userInvitationsTable.expiresAt,
        redeemedAt: userInvitationsTable.redeemedAt,
        createdBy: userInvitationsTable.createdBy,
        createdAt: userInvitationsTable.createdAt,
      })
      .from(userInvitationsTable)
      .orderBy(desc(userInvitationsTable.createdAt))
      .limit(100)

    return c.json({ data: rows })
  })

  routes.openapi(createInvitationRoute, async (c) => {
    const userId = c.get("userId")
    const db = c.get("db")
    if (!userId || !(await isSuperAdmin(db, userId))) return c.json({ error: "Forbidden" }, 403)

    const input = c.req.valid("json")
    const email = input.email.trim().toLowerCase()
    const [existingUser] = await db
      .select({ id: authUser.id })
      .from(authUser)
      .where(eq(authUser.email, email))
      .limit(1)
    if (existingUser) return c.json({ error: "A user with this email already exists." }, 409)

    const rawToken = randomTokenBase64Url(32)
    const hours = input.expiresInHours ?? DEFAULT_EXPIRY_HOURS
    const expiresAt = new Date(Date.now() + hours * 3_600_000)
    const id = newId("user_invitations")
    await db.insert(userInvitationsTable).values({
      id,
      email,
      tokenHash: await sha256Hex(rawToken),
      expiresAt,
      createdBy: userId,
      metadata: input.metadata ?? null,
    })

    const { appUrl } = runtime.resolveDeployment(c.env)
    const acceptUrl = `${appUrl}/accept-invite?token=${encodeURIComponent(rawToken)}`
    const emailSent = await runtime.sendInvitationEmail(c.env, {
      acceptUrl,
      expiresInHours: hours,
      to: email,
    })

    return c.json({
      data: { id, email, expiresAt: expiresAt.toISOString(), acceptUrl, emailSent },
    })
  })

  routes.openapi(deleteInvitationRoute, async (c) => {
    const userId = c.get("userId")
    const db = c.get("db")
    if (!userId || !(await isSuperAdmin(db, userId))) return c.json({ error: "Forbidden" }, 403)

    const { id } = c.req.valid("param")
    await db.delete(userInvitationsTable).where(eq(userInvitationsTable.id, id))
    return c.json({ data: { id } })
  })

  return routes
}

export function createInvitationsPublicRoutes() {
  const routes = new OpenAPIHono<IdentityAccessEnv>({ defaultHook: openApiValidationHook })

  routes.openapi(inspectInvitationRoute, async (c) => {
    const tokenHash = await sha256Hex(c.req.valid("param").token)
    const [row] = await c
      .get("db")
      .select({
        email: userInvitationsTable.email,
        expiresAt: userInvitationsTable.expiresAt,
        redeemedAt: userInvitationsTable.redeemedAt,
      })
      .from(userInvitationsTable)
      .where(eq(userInvitationsTable.tokenHash, tokenHash))
      .limit(1)

    if (!row) return c.json({ valid: false, reason: "not_found" }, 404)
    if (row.redeemedAt) return c.json({ valid: false, reason: "redeemed" }, 410)
    if (row.expiresAt.getTime() < Date.now()) {
      return c.json({ valid: false, reason: "expired" }, 410)
    }
    return c.json({ valid: true, email: row.email, expiresAt: row.expiresAt.toISOString() })
  })

  routes.openapi(redeemInvitationRoute, async (c) => {
    const input = c.req.valid("json")
    const db = c.get("db")
    const now = new Date()
    const [invite] = await db
      .select()
      .from(userInvitationsTable)
      .where(
        and(
          eq(userInvitationsTable.tokenHash, await sha256Hex(c.req.valid("param").token)),
          isNull(userInvitationsTable.redeemedAt),
          gt(userInvitationsTable.expiresAt, now),
        ),
      )
      .limit(1)
    if (!invite) {
      return c.json({ error: "Invitation is invalid, expired, or already redeemed." }, 410)
    }

    const [existingUser] = await db
      .select({ id: authUser.id })
      .from(authUser)
      .where(eq(authUser.email, invite.email))
      .limit(1)
    if (existingUser) return c.json({ error: "A user with this email already exists." }, 409)

    const userId = crypto.randomUUID()
    const name = input.name.trim()
    const [firstName, ...rest] = name.split(/\s+/)
    const teamRole = localRoleForRedeemedInvitation(invite.metadata)
    await db.insert(authUser).values({
      id: userId,
      name,
      email: invite.email,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(authAccount).values({
      id: `acc_${userId}`,
      userId,
      accountId: invite.email,
      providerId: "credential",
      password: await hashPassword(input.password),
      createdAt: now,
      updatedAt: now,
    })
    await db
      .insert(userProfilesTable)
      .values({
        id: userId,
        firstName: firstName ?? null,
        lastName: rest.join(" ") || null,
        avatarUrl: null,
        isSuperAdmin: teamRole.isSuperAdmin,
        permissions: teamRole.permissions,
      })
      .onConflictDoNothing()
    await db
      .update(userInvitationsTable)
      .set({ redeemedAt: now, redeemedByUserId: userId })
      .where(eq(userInvitationsTable.id, invite.id))

    return c.json({ data: { id: userId, email: invite.email, name } })
  })

  return routes
}
