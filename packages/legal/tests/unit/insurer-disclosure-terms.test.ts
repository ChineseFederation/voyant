import type { StorageObject, StorageProvider, StorageUploadBody } from "@voyant-travel/storage"
import { describe, expect, it } from "vitest"
import {
  INSURER_DISCLOSURE_ARCHIVE_PREFIX,
  InsurerDisclosureArchiveMismatchError,
  InsurerDisclosureArchiveMissingError,
  insurerDisclosureArchiveKey,
  insurerDisclosureChecksum,
  readArchivedInsurerDisclosure,
} from "../../src/terms/disclosure-archive.js"
import {
  INSURER_DISCLOSURE_TERM_TYPES,
  insertLegalTermSchema,
  isInsurerDisclosureTermType,
  legalTermArchivalViolation,
  legalTermTypeSchema,
  updateLegalTermSchema,
} from "../../src/terms/validation.js"

function toBytes(value: string) {
  return new TextEncoder().encode(value)
}

/** Minimal in-memory store — only `get` and `upload` are exercised here. */
function memoryStorage(seed: Record<string, Uint8Array> = {}): StorageProvider {
  const objects = new Map<string, Uint8Array>(Object.entries(seed))
  return {
    name: "memory:test",
    async upload(body: StorageUploadBody, options): Promise<StorageObject> {
      const key = options?.key ?? "generated"
      objects.set(key, body as Uint8Array)
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
}

const baseTerm = {
  targetKind: "booking" as const,
  targetId: "bkg_disclosure",
  title: "Insurer terms",
  body: "The insurer's terms of cover.",
}

describe("insurer disclosure term types", () => {
  it("names the three pre-contractual kinds and admits them to the term enum", () => {
    expect(INSURER_DISCLOSURE_TERM_TYPES).toEqual([
      "insurer_product_information",
      "insurer_terms",
      "demands_and_needs",
    ])
    for (const termType of INSURER_DISCLOSURE_TERM_TYPES) {
      expect(legalTermTypeSchema.parse(termType)).toBe(termType)
      expect(isInsurerDisclosureTermType(termType)).toBe(true)
    }
    expect(isInsurerDisclosureTermType("cancellation")).toBe(false)
  })
})

describe("the archival invariant", () => {
  it.each(
    INSURER_DISCLOSURE_TERM_TYPES,
  )("rejects a %s row with no archived artifact", (termType) => {
    const parsed = insertLegalTermSchema.safeParse({ ...baseTerm, termType })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toContain(termType)
  })

  it("rejects a disclosure that names a version but archives nothing", () => {
    const parsed = insertLegalTermSchema.safeParse({
      ...baseTerm,
      termType: "insurer_terms",
      sourceVersionId: "TC-2026-01",
    })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toContain("archivedStorageKey")
  })

  it("rejects a disclosure that archives bytes but pins no insurer version", () => {
    const parsed = insertLegalTermSchema.safeParse({
      ...baseTerm,
      termType: "demands_and_needs",
      archivedStorageKey: "legal/insurer-disclosures/demands_and_needs/v1/abc",
    })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toContain("sourceVersionId")
  })

  it("accepts a fully archived disclosure", () => {
    const parsed = insertLegalTermSchema.safeParse({
      ...baseTerm,
      termType: "insurer_terms",
      sourceVersionId: "TC-2026-01",
      archivedStorageKey: "legal/insurer-disclosures/insurer_terms/TC-2026-01/abc.pdf",
      archivedChecksum: "sha256:abc",
    })
    expect(parsed.success).toBe(true)
  })

  it("leaves the pre-existing term types alone", () => {
    expect(insertLegalTermSchema.safeParse({ ...baseTerm, termType: "cancellation" }).success).toBe(
      true,
    )
  })

  it("rejects a patch that names an insurer kind while blanking its archive", () => {
    const parsed = updateLegalTermSchema.safeParse({
      termType: "insurer_terms",
      archivedStorageKey: null,
    })
    expect(parsed.success).toBe(false)
  })

  it("reports the violation as data so the service and the database agree", () => {
    expect(legalTermArchivalViolation({ termType: "cancellation" })).toBeNull()
    expect(
      legalTermArchivalViolation({
        termType: "insurer_terms",
        sourceVersionId: "TC-2026-01",
        archivedStorageKey: "legal/x",
      }),
    ).toBeNull()
    expect(legalTermArchivalViolation({ termType: "insurer_terms" })).toContain("sourceVersionId")
    // Whitespace is not an artifact.
    expect(
      legalTermArchivalViolation({
        termType: "insurer_terms",
        sourceVersionId: "  ",
        archivedStorageKey: "legal/x",
      }),
    ).toContain("sourceVersionId")
  })
})

describe("the archive key", () => {
  it("is content-addressed under the shared legal prefix", async () => {
    const bytes = toBytes("Insurer terms, revision one.")
    const checksum = await insurerDisclosureChecksum(bytes)
    expect(checksum).toMatch(/^sha256:[a-f0-9]{64}$/)
    const key = insurerDisclosureArchiveKey({
      termType: "insurer_terms",
      sourceVersionId: "TC-2026-01",
      checksumSha256Hex: checksum.slice("sha256:".length),
      contentType: "application/pdf",
    })
    expect(key.startsWith(`${INSURER_DISCLOSURE_ARCHIVE_PREFIX}/insurer_terms/TC-2026-01/`)).toBe(
      true,
    )
    expect(key.endsWith(".pdf")).toBe(true)
  })

  it("resolves the same key for the same bytes and a different key for changed wording", async () => {
    const first = await insurerDisclosureChecksum(toBytes("wording A"))
    const again = await insurerDisclosureChecksum(toBytes("wording A"))
    const changed = await insurerDisclosureChecksum(toBytes("wording B"))
    const keyFor = (checksum: string) =>
      insurerDisclosureArchiveKey({
        termType: "insurer_product_information",
        sourceVersionId: "IPID-7",
        checksumSha256Hex: checksum.slice("sha256:".length),
        contentType: "application/pdf",
      })
    expect(keyFor(first)).toBe(keyFor(again))
    expect(keyFor(first)).not.toBe(keyFor(changed))
  })

  it("keeps an unusable version identifier out of the key path", () => {
    const key = insurerDisclosureArchiveKey({
      termType: "insurer_terms",
      sourceVersionId: "../../etc/passwd",
      checksumSha256Hex: "a".repeat(64),
    })
    const segments = key.split("/")
    expect(segments).toHaveLength(5)
    expect(segments.every((segment) => segment !== "." && segment !== "..")).toBe(true)
  })
})

describe("reading an archived disclosure", () => {
  it("returns the stored bytes when the checksum still matches", async () => {
    const bytes = toBytes("Insurer terms, revision one.")
    const checksum = await insurerDisclosureChecksum(bytes)
    const storage = memoryStorage({ "legal/x": bytes })
    await expect(
      readArchivedInsurerDisclosure(storage, {
        archivedStorageKey: "legal/x",
        archivedChecksum: checksum,
      }),
    ).resolves.toEqual(bytes)
  })

  it("refuses bytes that are no longer the ones that were accepted", async () => {
    const storage = memoryStorage({ "legal/x": toBytes("something else entirely") })
    await expect(
      readArchivedInsurerDisclosure(storage, {
        archivedStorageKey: "legal/x",
        archivedChecksum: await insurerDisclosureChecksum(toBytes("Insurer terms, revision one.")),
      }),
    ).rejects.toBeInstanceOf(InsurerDisclosureArchiveMismatchError)
  })

  it("reports an absent artifact rather than silently returning nothing", async () => {
    await expect(
      readArchivedInsurerDisclosure(memoryStorage(), {
        archivedStorageKey: "legal/missing",
        archivedChecksum: null,
      }),
    ).rejects.toBeInstanceOf(InsurerDisclosureArchiveMissingError)
  })
})
