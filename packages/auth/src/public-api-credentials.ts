/**
 * Storefront OAuth provider credential bundles + the encryption seam.
 *
 * Plaintext provider secrets never touch persisted config: the local adapter
 * encrypts a validated bundle through a `PublicApiCredentialCipher` (backed by
 * the deployment's KMS) into the opaque `{ enc }` envelope stored on
 * `publicApiCustomerAuthCredentials`, and decrypts it only when resolving a
 * customer-auth context at request time.
 */
import type { CustomerAuthSocialProvider, KmsEnvelope } from "@voyant-travel/db/schema/iam"
import { createKmsProviderFromEnv, type KeyRef } from "@voyant-travel/utils/kms"

import { PublicApiInputError } from "./public-api-origins.js"

export type PublicApiCredentialBundle = {
  provider: CustomerAuthSocialProvider
  clientId: string
  clientSecret: string
}

// Every provider is stored as `{ clientId, clientSecret }`, matching the shape
// `defaultCustomerAuthContext` feeds Better Auth's `socialProviders`. For Apple
// the `clientSecret` is the operator's pre-generated Sign-in-with-Apple JWT.
const REQUIRED_FIELDS: Record<CustomerAuthSocialProvider, readonly string[]> = {
  google: ["clientId", "clientSecret"],
  facebook: ["clientId", "clientSecret"],
  apple: ["clientId", "clientSecret"],
}

const MAX_CREDENTIAL_FIELD_LENGTH = 16_384

function requireCredentialField(credentials: Record<string, unknown>, key: string): void {
  const value = credentials[key]
  if (typeof value !== "string" || !value.trim()) {
    throw new PublicApiInputError(`Customer auth credential field ${key} is required.`)
  }
  if (value.length > MAX_CREDENTIAL_FIELD_LENGTH) {
    throw new PublicApiInputError(`Customer auth credential field ${key} is too large.`)
  }
}

/** Validate a provider-specific secret bundle before encryption. */
export function validatePublicApiCredentialBundle(
  provider: CustomerAuthSocialProvider,
  credentials: Record<string, unknown>,
): PublicApiCredentialBundle {
  const required = REQUIRED_FIELDS[provider] ?? []
  for (const key of required) requireCredentialField(credentials, key)
  const allowed = new Set(["provider", ...required])
  const unexpected = Object.keys(credentials).filter((key) => !allowed.has(key))
  if (unexpected.length > 0) {
    throw new PublicApiInputError(
      `Unexpected ${provider} customer auth credential field(s): ${unexpected.join(", ")}.`,
    )
  }
  return { provider, ...credentials } as PublicApiCredentialBundle
}

/**
 * Encryption seam for storefront provider secrets. The self-host runtime binds
 * this to its KMS; tests bind a deterministic in-memory cipher.
 */
export interface PublicApiCredentialCipher {
  encrypt(plaintext: string): Promise<KmsEnvelope>
  decrypt(envelope: KmsEnvelope): Promise<string>
}

// Storefront OAuth secrets are third-party integration credentials.
const PUBLIC_API_CREDENTIAL_KEY: KeyRef = { keyType: "integrations" }

/**
 * Default cipher backed by the deployment's configured KMS (GCP/AWS/env/local),
 * selected from environment exactly like every other framework secret. The
 * ciphertext is wrapped in the opaque `{ enc }` envelope stored on the row.
 */
export function createKmsPublicApiCredentialCipher(
  env: Record<string, string | undefined>,
): PublicApiCredentialCipher {
  const provider = createKmsProviderFromEnv(env)
  return {
    async encrypt(plaintext) {
      return { enc: await provider.encrypt(plaintext, PUBLIC_API_CREDENTIAL_KEY) }
    },
    async decrypt(envelope) {
      if (!envelope) {
        throw new PublicApiInputError("Stored storefront credential is empty.")
      }
      return provider.decrypt(envelope.enc, PUBLIC_API_CREDENTIAL_KEY)
    },
  }
}
