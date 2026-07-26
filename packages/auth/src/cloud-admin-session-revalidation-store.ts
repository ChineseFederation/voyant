import type { getDb } from "@voyant-travel/db"
import {
  apikeyTable,
  cloudAuthSessionLinks,
  cloudAuthUserLinks,
} from "@voyant-travel/db/schema/iam"
import { eq } from "drizzle-orm"

export async function markCloudAuthSessionRevalidated(
  db: ReturnType<typeof getDb>,
  input: {
    sessionId: string
    userId: string
    now: Date
    revalidateAfterSeconds: number
    /** Current runtime deployment id — retargets links after deploy cutover. */
    deploymentId: string
  },
): Promise<void> {
  const revalidateAfter = new Date(input.now.getTime() + input.revalidateAfterSeconds * 1000)
  await Promise.all([
    db
      .update(cloudAuthSessionLinks)
      .set({
        deploymentId: input.deploymentId,
        lastRevalidatedAt: input.now,
        revalidateAfter,
        revokedAt: null,
        updatedAt: input.now,
      })
      .where(eq(cloudAuthSessionLinks.sessionId, input.sessionId)),
    db
      .update(cloudAuthUserLinks)
      .set({
        deploymentId: input.deploymentId,
        lastRevalidatedAt: input.now,
        revokedAt: null,
        updatedAt: input.now,
      })
      .where(eq(cloudAuthUserLinks.userId, input.userId)),
  ])
}

export async function revokeCloudAuthUserAccess(
  db: ReturnType<typeof getDb>,
  input: {
    sessionId?: string
    userId: string
    now: Date
  },
): Promise<void> {
  const updates: Array<Promise<unknown>> = [
    db
      .update(cloudAuthUserLinks)
      .set({
        revokedAt: input.now,
        lastRevalidatedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(cloudAuthUserLinks.userId, input.userId)),
    db
      .update(apikeyTable)
      .set({
        enabled: false,
        updatedAt: input.now,
      })
      .where(eq(apikeyTable.referenceId, input.userId)),
  ]

  if (input.sessionId) {
    updates.push(
      db
        .update(cloudAuthSessionLinks)
        .set({
          revokedAt: input.now,
          updatedAt: input.now,
        })
        .where(eq(cloudAuthSessionLinks.sessionId, input.sessionId)),
    )
  }

  await Promise.all(updates)
}

export async function markCloudAuthUserRevalidated(
  db: ReturnType<typeof getDb>,
  input: {
    userId: string
    now: Date
    /** Current runtime deployment id — retargets links after deploy cutover. */
    deploymentId: string
  },
): Promise<void> {
  await db
    .update(cloudAuthUserLinks)
    .set({
      deploymentId: input.deploymentId,
      lastRevalidatedAt: input.now,
      revokedAt: null,
      updatedAt: input.now,
    })
    .where(eq(cloudAuthUserLinks.userId, input.userId))
}
