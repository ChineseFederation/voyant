/**
 * Deployment-side client for Voyant Cloud member management.
 *
 * The team of a `voyant-cloud`-auth deployment lives on the platform, not
 * in the deployment DB. This client lets the deployment manage those members
 * (list members, list/send/revoke invitations, grant/revoke this deployment's
 * access) by calling the platform's `/cloud/v1/admin-auth/*` member endpoints —
 * the management counterpart to {@link revalidateCloudAdminAuthAccess}.
 *
 * Every request carries the deployment client token (Bearer) plus the acting
 * staff user's WorkOS id; the platform re-verifies that user is an org manager
 * before mutating, so the deployment never self-asserts authority.
 */
import type { CloudAdminAuthRevalidateConfig } from "./assertion.js"
import { isRecord, normalizeAbsoluteUrl } from "./utils.js"

export type CloudAdminMembersConfig = {
  /** Base URL of the platform member API, e.g. `.../cloud/v1/admin-auth`. */
  baseUrl: string
  deploymentId: string
  clientToken: string
}

export type CloudAdminMember = {
  membershipId: string
  externalUserId: string
  email: string | null
  name?: string | null
  roleSlug: string | null
  roleName: string | null
  status: string
  createdAt?: string | null
  lastActivityAt?: string | null
  /** Full platform access (owner/admin) — reaches every deployment. */
  hasFullPlatformAccess: boolean
  /** Whether the member can currently sign into this deployment. */
  hasDeploymentAccess: boolean
  /** True when this deployment is explicitly listed in their grants. */
  isExplicitGrant: boolean
  /** Explicit per-deployment RBAC scope set for this app, or null (role-derived). */
  permissions: string[] | null
}

export type CloudAdminMemberRole = {
  slug: string
  name: string
  description: string | null
}

export type CloudAdminInvitation = {
  id: string
  email: string
  roleSlug?: string | null
  roleName?: string | null
  state: "pending" | "accepted" | "expired" | "revoked"
  acceptedAt: string | null
  revokedAt: string | null
  expiresAt: string
  inviterUserId: string | null
  acceptedUserId: string | null
  acceptInvitationUrl: string
  createdAt: string
  updatedAt: string
}

export type CloudAdminInviteInput = {
  email: string
  roleSlug?: string | null
  expiresInDays?: number
}

/** Raised when the platform rejects a member request; carries the HTTP status. */
export class CloudAdminMembersError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message)
    this.name = "CloudAdminMembersError"
  }
}

/**
 * Derive the member API base URL from the revalidate URL — they share the
 * `/cloud/v1/admin-auth` prefix, so a deployment needs no extra env var.
 */
export function deriveCloudAdminMembersBaseUrl(revalidateUrl: string): string {
  return normalizeAbsoluteUrl(revalidateUrl, "revalidateUrl").replace(/\/revalidate$/, "")
}

/** Build a member-API config by reusing the deployment's revalidate config. */
export function cloudAdminMembersConfigFromRevalidate(
  config: CloudAdminAuthRevalidateConfig,
): CloudAdminMembersConfig {
  return {
    baseUrl: deriveCloudAdminMembersBaseUrl(config.revalidateUrl),
    deploymentId: config.deploymentId,
    clientToken: config.clientToken,
  }
}

type RequestInput = {
  config: CloudAdminMembersConfig
  actingWorkosUserId: string
  path: string
  method?: "GET" | "POST" | "PUT" | "DELETE"
  body?: unknown
  fetch?: typeof fetch
}

function validateConfig(config: CloudAdminMembersConfig) {
  normalizeAbsoluteUrl(config.baseUrl, "baseUrl")
  if (!config.deploymentId.trim()) {
    throw new Error("Voyant Cloud member config is missing deploymentId")
  }
  if (!config.clientToken.trim()) {
    throw new Error("Voyant Cloud member config is missing clientToken")
  }
}

async function request<T>({
  config,
  actingWorkosUserId,
  path,
  method = "GET",
  body,
  fetch: fetchFn = fetch,
}: RequestInput): Promise<T> {
  validateConfig(config)
  if (!actingWorkosUserId.trim()) {
    throw new Error("Voyant Cloud member request is missing the acting user")
  }

  const response = await fetchFn(`${config.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.clientToken}`,
      "Content-Type": "application/json",
      "x-voyant-deployment-id": config.deploymentId,
      "x-voyant-acting-user-id": actingWorkosUserId,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 204) {
    return undefined as T
  }

  const payload = (await response.json().catch(() => null)) as unknown

  if (!response.ok) {
    const reason =
      isRecord(payload) && typeof payload.error === "string" ? payload.error : undefined
    throw new CloudAdminMembersError(
      reason ?? `Voyant Cloud member request failed with HTTP ${response.status}`,
      response.status,
      reason,
    )
  }

  if (isRecord(payload) && "data" in payload) {
    return payload.data as T
  }
  return payload as T
}

export type CloudAdminMembersRequest = {
  config: CloudAdminMembersConfig
  actingWorkosUserId: string
  fetch?: typeof fetch
}

export function listCloudAdminMembers(
  input: CloudAdminMembersRequest,
): Promise<CloudAdminMember[]> {
  return request<CloudAdminMember[]>({ ...input, path: "/members" })
}

export function listCloudAdminMemberRoles(
  input: CloudAdminMembersRequest,
): Promise<CloudAdminMemberRole[]> {
  return request<CloudAdminMemberRole[]>({ ...input, path: "/roles" })
}

export function listCloudAdminInvitations(
  input: CloudAdminMembersRequest,
): Promise<CloudAdminInvitation[]> {
  return request<CloudAdminInvitation[]>({ ...input, path: "/invitations" })
}

export function inviteCloudAdminMember(
  input: CloudAdminMembersRequest & { input: CloudAdminInviteInput },
): Promise<CloudAdminInvitation> {
  return request<CloudAdminInvitation>({
    config: input.config,
    actingWorkosUserId: input.actingWorkosUserId,
    fetch: input.fetch,
    path: "/invitations",
    method: "POST",
    body: input.input,
  })
}

export function revokeCloudAdminInvitation(
  input: CloudAdminMembersRequest & { invitationId: string },
): Promise<void> {
  return request<void>({
    config: input.config,
    actingWorkosUserId: input.actingWorkosUserId,
    fetch: input.fetch,
    path: `/invitations/${encodeURIComponent(input.invitationId)}`,
    method: "DELETE",
  })
}

export function setCloudAdminMemberAccess(
  input: CloudAdminMembersRequest & {
    membershipId: string
    hasAccess: boolean
  },
): Promise<CloudAdminMember> {
  return request<CloudAdminMember>({
    config: input.config,
    actingWorkosUserId: input.actingWorkosUserId,
    fetch: input.fetch,
    path: `/members/${encodeURIComponent(input.membershipId)}/access`,
    method: "PUT",
    body: { hasAccess: input.hasAccess },
  })
}

export function setCloudAdminMemberRole(
  input: CloudAdminMembersRequest & {
    membershipId: string
    roleSlug: string
  },
): Promise<CloudAdminMember> {
  return request<CloudAdminMember>({
    config: input.config,
    actingWorkosUserId: input.actingWorkosUserId,
    fetch: input.fetch,
    path: `/members/${encodeURIComponent(input.membershipId)}/role`,
    method: "PUT",
    body: { roleSlug: input.roleSlug },
  })
}

/**
 * Set a member's granular RBAC permissions for this deployment (`resource:action`
 * strings). A non-empty set also grants sign-in access; an empty set clears both.
 */
export function setCloudAdminMemberPermissions(
  input: CloudAdminMembersRequest & {
    membershipId: string
    permissions: string[]
  },
): Promise<CloudAdminMember> {
  return request<CloudAdminMember>({
    config: input.config,
    actingWorkosUserId: input.actingWorkosUserId,
    fetch: input.fetch,
    path: `/members/${encodeURIComponent(input.membershipId)}/permissions`,
    method: "PUT",
    body: { permissions: input.permissions },
  })
}
