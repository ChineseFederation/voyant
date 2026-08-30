import crypto from "node:crypto"
import { Client } from "pg"

type LocalAdministratorIdentity = {
  installation_id: string
  administrator_id: string
  administrator_public_key_fingerprint: string
  local_session_expires_at: Date
}

function coreDatabaseUrl(env: CloudflareBindings): string {
  const value = env.TUYU_CORE_DATABASE_URL?.trim()
  if (!value) throw new Error("TUYU_CORE_DATABASE_URL is required")
  const parsed = new URL(value)
  if (parsed.pathname !== "/tuyubooking") throw new Error("invalid Tuyu core database")
  return parsed.toString()
}

async function withCoreClient<T>(env: CloudflareBindings, run: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: coreDatabaseUrl(env) })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

export async function consumeTuyuAdministratorAssertion(
  env: CloudflareBindings,
  assertion: string,
  upstreamSessionId: string,
): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(assertion)) return false
  const digest = crypto.createHash("sha256").update(assertion, "ascii").digest()
  return withCoreClient(env, async (client) => {
    await client.query("BEGIN")
    try {
      const result = await client.query<LocalAdministratorIdentity>(
        `UPDATE tuyu_core.administrator_assertion
         SET consumed_at = CURRENT_TIMESTAMP
         WHERE assertion_hash = $1 AND consumed_at IS NULL AND revoked_at IS NULL
           AND expires_at > CURRENT_TIMESTAMP
           AND local_session_expires_at > CURRENT_TIMESTAMP
           AND EXISTS (
             SELECT 1 FROM tuyu_core.local_system_administrator administrator
             WHERE administrator.installation_id = administrator_assertion.installation_id
               AND administrator.id = administrator_assertion.administrator_id
               AND administrator.status = 'active'
           )
         RETURNING installation_id, administrator_id,
                   administrator_public_key_fingerprint, local_session_expires_at`,
        [digest],
      )
      const identity = result.rows[0]
      if (!identity) {
        await client.query(
          `INSERT INTO tuyu_core.administrator_bridge_audit
             (assertion_hash, action, outcome, request_path)
           VALUES ($1, 'REPLAY_EXPIRED_REVOKED_OR_FOREIGN', 'DENIED', '/tuyu-admin/consume')`,
          [digest],
        )
        await client.query("COMMIT")
        return false
      }
      await client.query(
        `INSERT INTO tuyu_core.upstream_administrator_session
           (upstream_session_id, assertion_hash, installation_id, administrator_id,
            administrator_public_key_fingerprint, upstream_user, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'tuyu-system-administrator@localhost', $6)`,
        [
          upstreamSessionId,
          digest,
          identity.installation_id,
          identity.administrator_id,
          identity.administrator_public_key_fingerprint,
          identity.local_session_expires_at,
        ],
      )
      await client.query(
        `INSERT INTO tuyu_core.administrator_bridge_audit
           (assertion_hash, upstream_session_id, installation_id, administrator_id,
            administrator_public_key_fingerprint, action, outcome, request_path)
         VALUES ($1, $2, $3, $4, $5,
                 'ASSERTION_CONSUMED', 'SUCCESS', '/tuyu-admin/consume')`,
        [
          digest,
          upstreamSessionId,
          identity.installation_id,
          identity.administrator_id,
          identity.administrator_public_key_fingerprint,
        ],
      )
      await client.query("COMMIT")
      return true
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    }
  })
}

export async function validateTuyuAdministratorSession(
  env: CloudflareBindings,
  upstreamSessionId: string,
  request: Request,
): Promise<boolean> {
  return withCoreClient(env, async (client) => {
    const result = await client.query<LocalAdministratorIdentity>(
      `SELECT bridge.installation_id, bridge.administrator_id,
              bridge.administrator_public_key_fingerprint,
              bridge.expires_at AS local_session_expires_at
       FROM tuyu_core.upstream_administrator_session bridge
       JOIN tuyu_core.local_system_administrator administrator
         ON administrator.installation_id = bridge.installation_id
        AND administrator.id = bridge.administrator_id
        AND administrator.status = 'active'
       WHERE bridge.upstream_session_id = $1 AND bridge.revoked_at IS NULL
         AND bridge.expires_at > CURRENT_TIMESTAMP`,
      [upstreamSessionId],
    )
    const identity = result.rows[0]
    if (!identity) return false
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase())) {
      await client.query(
        `INSERT INTO tuyu_core.administrator_bridge_audit
           (upstream_session_id, installation_id, administrator_id,
            administrator_public_key_fingerprint, action, outcome, request_path)
         VALUES ($1, $2, $3, $4, 'ADMINISTRATOR_REQUEST', 'SUCCESS', $5)`,
        [
          upstreamSessionId,
          identity.installation_id,
          identity.administrator_id,
          identity.administrator_public_key_fingerprint,
          new URL(request.url).pathname,
        ],
      )
    }
    return true
  })
}
