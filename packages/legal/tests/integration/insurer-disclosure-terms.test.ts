import type { StorageObject, StorageProvider, StorageUploadBody } from "@voyant-travel/storage"
import { and, eq, inArray } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { contractAttachments, contracts } from "../../src/contracts/schema.js"
import {
  acceptLegalTerm,
  archiveInsurerDisclosureTerm,
  INSURER_DISCLOSURE_ATTACHMENT_KIND,
  LEGAL_BOOKING_DOCUMENT_ATTACHMENT_KINDS,
  readArchivedInsurerDisclosure,
} from "../../src/terms/disclosure-archive.js"
import { legalTerms } from "../../src/terms/schema.js"
import { legalTermsService } from "../../src/terms/service.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

/**
 * The shared test database is cleaned by truncating ~465 tables per test, which
 * comfortably outruns vitest's 5s default when anything else is using the box.
 */
const DB_TEST_TIMEOUT = 60_000

function toBytes(value: string) {
  return new TextEncoder().encode(value)
}

/**
 * Drizzle wraps a driver error, so the constraint name is on the cause rather
 * than the message. Walk the chain instead of matching the wrapper's text.
 */
function errorChainText(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  while (current instanceof Error) {
    parts.push(current.message)
    const constraint = (current as unknown as { constraint_name?: unknown }).constraint_name
    if (typeof constraint === "string") parts.push(constraint)
    current = (current as { cause?: unknown }).cause
  }
  return parts.join(" | ")
}

function memoryStorage() {
  const objects = new Map<string, Uint8Array>()
  const provider: StorageProvider = {
    name: "memory:legal-disclosures",
    async upload(body: StorageUploadBody, options): Promise<StorageObject> {
      const key = options?.key ?? `generated-${objects.size}`
      objects.set(key, new Uint8Array(body as Uint8Array))
      return { key, url: "" }
    },
    async delete(key: string) {
      objects.delete(key)
    },
    async get(key: string) {
      const value = objects.get(key)
      if (!value) return null
      return value.buffer.slice(
        value.byteOffset,
        value.byteOffset + value.byteLength,
      ) as ArrayBuffer
    },
  }
  return { provider, objects }
}

describe.skipIf(!DB_AVAILABLE)("Insurer disclosure terms", () => {
  let db: PostgresJsDatabase

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupTestDb(db)
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  async function seedBookingContract(bookingId: string) {
    const [contract] = await db
      .insert(contracts)
      .values({
        scope: "customer",
        status: "issued",
        title: "Booking contract",
        contractNumber: `CT-${bookingId}`,
        bookingId,
        targetKind: "booking",
        targetId: bookingId,
      })
      .returning()
    // The contract's own rendition, so the disclosure is compared against a
    // document that is already on the booking-documents path.
    await db.insert(contractAttachments).values({
      contractId: contract!.id,
      kind: "document",
      name: "contract.pdf",
      mimeType: "application/pdf",
      storageKey: `legal/contract-documents/${contract!.id}/artifact`,
      checksum: "sha256:contract",
    })
    return contract!
  }

  it(
    "pins the insurer version in force at acceptance",
    async () => {
      const { provider } = memoryStorage()
      const january = toBytes("Insurer terms, revision TC-2026-01. Excess EUR 50.")

      const archived = await archiveInsurerDisclosureTerm({
        db,
        storage: provider,
        termType: "insurer_terms",
        sourceVersionId: "TC-2026-01",
        title: "Insurer terms",
        body: "The insurer's terms of cover, as published on the day of sale.",
        targetKind: "booking",
        targetId: "bkg_pinning",
        document: { bytes: january, contentType: "application/pdf" },
      })

      const accepted = await acceptLegalTerm(db, archived.term.id, {
        acceptedBy: "traveller:ana@example.test",
      })
      expect(accepted?.acceptanceStatus).toBe("accepted")
      expect(accepted?.acceptedAt).toBeInstanceOf(Date)
      expect(accepted?.sourceVersionId).toBe("TC-2026-01")

      // The insurer replaces its current wording. Nothing may reach back into
      // what the traveller agreed to.
      const june = await archiveInsurerDisclosureTerm({
        db,
        storage: provider,
        termType: "insurer_terms",
        sourceVersionId: "TC-2026-06",
        title: "Insurer terms",
        body: "The insurer's terms of cover, as published on the day of sale.",
        targetKind: "booking",
        targetId: "bkg_pinning",
        document: {
          bytes: toBytes("Insurer terms, revision TC-2026-06. Excess EUR 250."),
          contentType: "application/pdf",
        },
      })
      expect(june.storageKey).not.toBe(archived.storageKey)

      const [stored] = await db
        .select()
        .from(legalTerms)
        .where(eq(legalTerms.id, archived.term.id))
        .limit(1)
      expect(stored?.sourceVersionId).toBe("TC-2026-01")
      expect(stored?.archivedStorageKey).toBe(archived.storageKey)
      expect(stored?.archivedChecksum).toBe(archived.checksum)

      const bytes = await readArchivedInsurerDisclosure(provider, stored!)
      expect(new TextDecoder().decode(bytes)).toContain("TC-2026-01")
      expect(new TextDecoder().decode(bytes)).toContain("EUR 50")
    },
    DB_TEST_TIMEOUT,
  )

  it(
    "rejects a disclosure of a new type without an archived artifact",
    async () => {
      await expect(
        legalTermsService.createTerm(db, {
          targetKind: "booking",
          targetId: "bkg_unarchived",
          termType: "insurer_product_information",
          title: "Product information",
          body: "Shown before purchase.",
          required: true,
          sortOrder: 0,
          acceptanceStatus: "pending",
        }),
      ).rejects.toMatchObject({ name: "RequestValidationError" })

      // Nothing was written.
      const rows = await db
        .select()
        .from(legalTerms)
        .where(eq(legalTerms.termType, "insurer_product_information"))
      expect(rows).toHaveLength(0)

      // And the database refuses it too, because the application is not the only
      // writer: a row that looks configured and silently isn't is the whole
      // failure this guards.
      const failure = await db
        .insert(legalTerms)
        .values({
          targetKind: "booking",
          targetId: "bkg_unarchived",
          termType: "insurer_terms",
          title: "Insurer terms",
          body: "No artifact.",
        })
        .catch((error: unknown) => error)
      expect(errorChainText(failure)).toContain("ck_legal_terms_insurer_disclosure_archive")
    },
    DB_TEST_TIMEOUT,
  )

  it(
    "refuses to promote an already-stored term to a disclosure kind",
    async () => {
      const created = await legalTermsService.createTerm(db, {
        targetKind: "booking",
        targetId: "bkg_promote",
        termType: "cancellation",
        title: "Cancellation",
        body: "Free cancellation up to 14 days before departure.",
        required: true,
        sortOrder: 0,
        acceptanceStatus: "pending",
      })
      await expect(
        legalTermsService.updateTerm(db, created!.id, { termType: "demands_and_needs" }),
      ).rejects.toMatchObject({ name: "RequestValidationError" })
    },
    DB_TEST_TIMEOUT,
  )

  it(
    "makes the archived bytes retrievable by the stored key with a matching checksum",
    async () => {
      const { provider, objects } = memoryStorage()
      const bytes = toBytes("Demands and needs statement for booking bkg_bytes.")

      const archived = await archiveInsurerDisclosureTerm({
        db,
        storage: provider,
        termType: "demands_and_needs",
        sourceVersionId: "DND-2026-03",
        title: "Demands and needs",
        body: "What the customer said they needed, and what this cover does.",
        targetKind: "booking",
        targetId: "bkg_bytes",
        document: { bytes, contentType: "text/plain" },
      })

      expect(objects.has(archived.storageKey)).toBe(true)
      const roundTripped = await readArchivedInsurerDisclosure(provider, archived.term)
      expect(roundTripped).toEqual(bytes)

      // Re-archiving the identical wording is idempotent: the key is the digest.
      const again = await archiveInsurerDisclosureTerm({
        db,
        storage: provider,
        termType: "demands_and_needs",
        sourceVersionId: "DND-2026-03",
        title: "Demands and needs",
        body: "What the customer said they needed, and what this cover does.",
        targetKind: "booking",
        targetId: "bkg_bytes",
        document: { bytes, contentType: "text/plain" },
      })
      expect(again.storageKey).toBe(archived.storageKey)
      expect(again.checksum).toBe(archived.checksum)
      expect(objects.size).toBe(1)
    },
    DB_TEST_TIMEOUT,
  )

  it(
    "lands acceptance evidence on the same booking-documents path as the contract",
    async () => {
      const { provider } = memoryStorage()
      const bookingId = "bkg_evidence"
      const contract = await seedBookingContract(bookingId)

      const archived = await archiveInsurerDisclosureTerm({
        db,
        storage: provider,
        contractId: contract.id,
        termType: "insurer_product_information",
        sourceVersionId: "IPID-2026-02",
        title: "Insurance product information",
        body: "The product information document shown before purchase.",
        document: {
          bytes: toBytes("Insurance product information document, IPID-2026-02."),
          contentType: "application/pdf",
          fileName: "insurance-product-information.pdf",
        },
      })
      await acceptLegalTerm(db, archived.term.id, { acceptedBy: "traveller:ana@example.test" })

      // The exact join `listLegalDocumentsForBooking` performs in
      // `@voyant-travel/storefront` — contracts by booking, then their
      // attachments — widened only by the kind list this package owns.
      const documents = await db
        .select({
          attachmentId: contractAttachments.id,
          kind: contractAttachments.kind,
          name: contractAttachments.name,
          storageKey: contractAttachments.storageKey,
          checksum: contractAttachments.checksum,
          contractNumber: contracts.contractNumber,
        })
        .from(contractAttachments)
        .innerJoin(contracts, eq(contractAttachments.contractId, contracts.id))
        .where(
          and(
            eq(contracts.bookingId, bookingId),
            inArray(contractAttachments.kind, [...LEGAL_BOOKING_DOCUMENT_ATTACHMENT_KINDS]),
          ),
        )

      expect(documents.map((document) => document.kind).sort()).toEqual([
        "document",
        INSURER_DISCLOSURE_ATTACHMENT_KIND,
      ])
      const evidence = documents.find(
        (document) => document.kind === INSURER_DISCLOSURE_ATTACHMENT_KIND,
      )
      expect(evidence?.storageKey).toBe(archived.storageKey)
      expect(evidence?.checksum).toBe(archived.checksum)
      expect(evidence?.contractNumber).toBe(`CT-${bookingId}`)
      expect(evidence?.name).toBe("insurance-product-information.pdf")

      // And it is the same bytes the acceptance was recorded against.
      const [accepted] = await db
        .select()
        .from(legalTerms)
        .where(eq(legalTerms.id, archived.term.id))
        .limit(1)
      expect(accepted?.acceptanceStatus).toBe("accepted")
      await expect(readArchivedInsurerDisclosure(provider, accepted!)).resolves.toBeInstanceOf(
        Uint8Array,
      )
    },
    DB_TEST_TIMEOUT,
  )
})
