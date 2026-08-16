/**
 * Archival of an insurer's pre-contractual documents at sale time.
 *
 * Selling insurance carries duties that page copy does not discharge: the
 * product information document has to be shown before purchase, the customer's
 * demands and needs have to be stated, and the insurer's terms have to be the
 * version that was in force at that moment. Insurers re-version and replace
 * their wording without notice, so the URL is not evidence a year later —
 * only the bytes plus the insurer's own version identifier are.
 *
 * Bytes go through the same storage path the contract documents use
 * (`storage.upload` at an exact, deterministic key, `sha256:` checksum over the
 * exact bytes). There is deliberately no second storage convention here.
 */

import { RequestValidationError } from "@voyant-travel/hono"
import {
  type InsurerDisclosureTermType,
  isInsurerDisclosureTermType,
  legalTermArchivalViolation,
} from "@voyant-travel/legal-contracts/terms/validation"
import type { StorageProvider } from "@voyant-travel/storage"
import { and, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { checksumLegalDocumentBytes } from "../contracts/document-artifact-provider.js"
import { contractAttachments, contracts } from "../contracts/schema.js"
import { normalizeLegalTargetFields } from "../targets/service.js"
import { type LegalTerm, legalTerms } from "./schema.js"

/** Every archived insurer disclosure lives under this prefix. */
export const INSURER_DISCLOSURE_ARCHIVE_PREFIX = "legal/insurer-disclosures"

/** `contract_attachments.kind` for an archived insurer disclosure. */
export const INSURER_DISCLOSURE_ATTACHMENT_KIND = "insurer-disclosure"

/**
 * The attachment kinds that are booking paperwork.
 *
 * `listLegalDocumentsForBooking` in `@voyant-travel/storefront` resolves a
 * booking's legal documents by joining `contracts` to `contract_attachments`;
 * it currently filters on `kind = 'document'` alone, so an archived disclosure
 * would not come back through it. Widening that filter to this list is the
 * single change that puts disclosure evidence on the same path as the contract.
 */
export const LEGAL_BOOKING_DOCUMENT_ATTACHMENT_KINDS = [
  "document",
  INSURER_DISCLOSURE_ATTACHMENT_KIND,
] as const

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "text/html": "html",
  "text/plain": "txt",
}

export class InsurerDisclosureArchiveMismatchError extends Error {
  constructor(readonly storageKey: string) {
    super(
      `Archived insurer disclosure at "${storageKey}" does not match the bytes being archived; the stored artifact is evidence and is never overwritten.`,
    )
    this.name = "InsurerDisclosureArchiveMismatchError"
  }
}

export class InsurerDisclosureArchiveMissingError extends Error {
  constructor(readonly storageKey: string) {
    super(`Archived insurer disclosure at "${storageKey}" is absent from storage.`)
    this.name = "InsurerDisclosureArchiveMissingError"
  }
}

function slugForKey(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
  return slug || "unversioned"
}

/**
 * Content-addressed, deterministic archive key.
 *
 * The digest is in the key on purpose: re-archiving the identical wording under
 * the identical insurer version resolves to the same object, and a changed
 * wording can never land on top of the bytes somebody already accepted.
 */
export function insurerDisclosureArchiveKey(input: {
  termType: InsurerDisclosureTermType
  sourceVersionId: string
  checksumSha256Hex: string
  contentType?: string | null
}): string {
  const extension = input.contentType
    ? EXTENSION_BY_CONTENT_TYPE[input.contentType.split(";")[0]!.trim().toLowerCase()]
    : undefined
  const name = extension ? `${input.checksumSha256Hex}.${extension}` : input.checksumSha256Hex
  return `${INSURER_DISCLOSURE_ARCHIVE_PREFIX}/${input.termType}/${slugForKey(
    input.sourceVersionId,
  )}/${name}`
}

/** `sha256:<hex>` over the exact bytes, matching the contract-document convention. */
export async function insurerDisclosureChecksum(bytes: Uint8Array): Promise<string> {
  return `sha256:${await checksumLegalDocumentBytes(bytes)}`
}

export interface InsurerDisclosureDocumentInput {
  /** The bytes fetched from the insurer. Nothing re-fetches the URL later. */
  readonly bytes: Uint8Array
  readonly contentType: string
  /** Human-facing file name for the attachment; not part of the storage key. */
  readonly fileName?: string
}

export interface ArchiveInsurerDisclosureInput {
  readonly db: PostgresJsDatabase
  readonly storage: StorageProvider
  readonly termType: InsurerDisclosureTermType
  /** The insurer's own identifier for the revision in force right now. */
  readonly sourceVersionId: string
  readonly title: string
  readonly body: string
  readonly document: InsurerDisclosureDocumentInput
  readonly contractId?: string | null
  readonly policyVersionId?: string | null
  readonly targetKind?: LegalTerm["targetKind"]
  readonly targetId?: string | null
  readonly targetProvider?: string | null
  readonly targetSourceRef?: string | null
  readonly language?: string | null
  readonly required?: boolean
  readonly sortOrder?: number
  readonly metadata?: Record<string, unknown> | null
}

export interface ArchivedInsurerDisclosure {
  readonly term: LegalTerm
  readonly storageKey: string
  readonly checksum: string
  readonly attachmentId: string | null
}

/**
 * Archive the insurer's document and write the disclosure row it evidences.
 *
 * The row is created `pending`; acceptance is a separate, later act recorded
 * through {@link acceptLegalTerm} on the existing acceptance columns.
 */
export async function archiveInsurerDisclosureTerm(
  input: ArchiveInsurerDisclosureInput,
): Promise<ArchivedInsurerDisclosure> {
  if (!isInsurerDisclosureTermType(input.termType)) {
    throw new RequestValidationError(`"${input.termType}" is not an insurer disclosure term type.`)
  }
  if (!input.sourceVersionId.trim()) {
    throw new RequestValidationError(
      "An insurer disclosure must carry the insurer's own version identifier, captured at sale time.",
    )
  }
  if (input.document.bytes.byteLength === 0) {
    throw new RequestValidationError("An insurer disclosure cannot be archived from zero bytes.")
  }

  const checksumHex = await checksumLegalDocumentBytes(input.document.bytes)
  const checksum = `sha256:${checksumHex}`
  const storageKey = insurerDisclosureArchiveKey({
    termType: input.termType,
    sourceVersionId: input.sourceVersionId,
    checksumSha256Hex: checksumHex,
    contentType: input.document.contentType,
  })

  const existing = await input.storage.get(storageKey)
  if (existing) {
    // Content-addressed, so a mismatch here means a digest collision or a
    // tampered store. Either way the stored bytes are evidence: never overwrite.
    if ((await checksumLegalDocumentBytes(new Uint8Array(existing))) !== checksumHex) {
      throw new InsurerDisclosureArchiveMismatchError(storageKey)
    }
  } else {
    const uploaded = await input.storage.upload(input.document.bytes, {
      key: storageKey,
      contentType: input.document.contentType,
      metadata: {
        termType: input.termType,
        sourceVersionId: input.sourceVersionId,
        checksumSha256: checksum,
      },
    })
    if (uploaded.key !== storageKey) {
      throw new Error("Insurer disclosure storage did not honor the exact archive key.")
    }
  }

  const fileName = input.document.fileName ?? `${input.termType}-${input.sourceVersionId}`

  const [term] = await input.db
    .insert(legalTerms)
    .values({
      contractId: input.contractId ?? null,
      policyVersionId: input.policyVersionId ?? null,
      targetKind: input.targetKind ?? null,
      targetId: input.targetId ?? null,
      targetProvider: input.targetProvider ?? null,
      targetSourceRef: input.targetSourceRef ?? null,
      termType: input.termType,
      title: input.title,
      body: input.body,
      language: input.language ?? null,
      required: input.required ?? true,
      sortOrder: input.sortOrder ?? 0,
      acceptanceStatus: "pending",
      sourceVersionId: input.sourceVersionId,
      archivedStorageKey: storageKey,
      archivedChecksum: checksum,
      metadata: input.metadata ?? null,
    })
    .returning()
  if (!term) throw new Error("Insurer disclosure term row was not inserted.")

  let attachmentId: string | null = null
  if (input.contractId) {
    const [contract] = await input.db
      .select({
        id: contracts.id,
        targetKind: contracts.targetKind,
        targetId: contracts.targetId,
        targetProvider: contracts.targetProvider,
        targetSourceRef: contracts.targetSourceRef,
        legacyTransactionOfferId: contracts.legacyTransactionOfferId,
        legacyTransactionOrderId: contracts.legacyTransactionOrderId,
      })
      .from(contracts)
      .where(eq(contracts.id, input.contractId))
      .limit(1)
    if (contract) {
      const [attachment] = await input.db
        .insert(contractAttachments)
        .values({
          contractId: contract.id,
          kind: INSURER_DISCLOSURE_ATTACHMENT_KIND,
          name: fileName,
          mimeType: input.document.contentType,
          fileSize: input.document.bytes.byteLength,
          storageKey,
          checksum,
          ...normalizeLegalTargetFields(contract),
          metadata: {
            legalTermId: term.id,
            termType: input.termType,
            sourceVersionId: input.sourceVersionId,
          },
        })
        .returning({ id: contractAttachments.id })
      attachmentId = attachment?.id ?? null
    }
  }

  return { term, storageKey, checksum, attachmentId }
}

/**
 * Read the archived bytes back and prove they are the ones that were accepted.
 *
 * Nothing here touches the insurer's URL: by now it serves something else.
 */
export async function readArchivedInsurerDisclosure(
  storage: StorageProvider,
  term: Pick<LegalTerm, "archivedStorageKey" | "archivedChecksum">,
): Promise<Uint8Array> {
  const key = term.archivedStorageKey
  if (!key) {
    throw new RequestValidationError("This legal term carries no archived insurer disclosure.")
  }
  const buffer = await storage.get(key)
  if (!buffer) throw new InsurerDisclosureArchiveMissingError(key)
  const bytes = new Uint8Array(buffer)
  const checksum = `sha256:${await checksumLegalDocumentBytes(bytes)}`
  if (term.archivedChecksum && term.archivedChecksum !== checksum) {
    throw new InsurerDisclosureArchiveMismatchError(key)
  }
  return bytes
}

export interface AcceptLegalTermInput {
  readonly acceptedBy: string
  readonly acceptedAt?: Date
}

/**
 * Record acceptance on the existing acceptance columns.
 *
 * The accepted version is whatever the stored row was archived from — the
 * caller cannot name one. That is the whole point: a later change to the
 * insurer's current version is a different row, and cannot reach back into
 * what this acceptance says.
 */
export async function acceptLegalTerm(
  db: PostgresJsDatabase,
  termId: string,
  input: AcceptLegalTermInput,
): Promise<LegalTerm | null> {
  const [current] = await db.select().from(legalTerms).where(eq(legalTerms.id, termId)).limit(1)
  if (!current) return null
  const violation = legalTermArchivalViolation(current)
  if (violation) throw new RequestValidationError(violation)

  const [row] = await db
    .update(legalTerms)
    .set({
      acceptanceStatus: "accepted",
      acceptedAt: input.acceptedAt ?? new Date(),
      acceptedBy: input.acceptedBy,
      updatedAt: new Date(),
    })
    .where(eq(legalTerms.id, termId))
    .returning()
  return row ?? null
}

/**
 * The archived disclosures attached to a booking's contracts.
 *
 * Same join `listLegalDocumentsForBooking` performs — contracts by booking,
 * then their attachments — so the evidence sits on the booking-documents path
 * rather than beside it.
 */
export async function listBookingInsurerDisclosureAttachments(
  db: PostgresJsDatabase,
  bookingId: string,
) {
  return db
    .select({
      attachmentId: contractAttachments.id,
      contractId: contracts.id,
      contractNumber: contracts.contractNumber,
      kind: contractAttachments.kind,
      name: contractAttachments.name,
      mimeType: contractAttachments.mimeType,
      storageKey: contractAttachments.storageKey,
      checksum: contractAttachments.checksum,
      metadata: contractAttachments.metadata,
      createdAt: contractAttachments.createdAt,
    })
    .from(contractAttachments)
    .innerJoin(contracts, eq(contractAttachments.contractId, contracts.id))
    .where(
      and(
        eq(contracts.bookingId, bookingId),
        eq(contractAttachments.kind, INSURER_DISCLOSURE_ATTACHMENT_KIND),
      ),
    )
    .orderBy(contractAttachments.createdAt)
}
