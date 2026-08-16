// agent-quality: file-size exception -- owner: customer-portal; existing service module stays co-located until a dedicated split preserves behavior and tests.
import {
  bookingDocuments,
  bookingFulfillments,
  bookingItems,
  bookingItemTravelers,
  bookingStaffAssignments,
  bookings,
  bookingTravelers,
} from "@voyant-travel/bookings/schema"
import { customerAuthProfilesTable, customerAuthUser } from "@voyant-travel/db/schema/iam"
import { invoiceRenditions, invoices, payments } from "@voyant-travel/finance/schema"
import type { CustomerBuyerContext, PersonalCustomerBuyerContext } from "@voyant-travel/hono"
import { identityContactPoints } from "@voyant-travel/identity/schema"
import { identityService } from "@voyant-travel/identity/service"
import { contractAttachments, contracts } from "@voyant-travel/legal/schema"
import {
  type CreatePersonDocumentInput,
  organizations,
  type PersonDocument,
  people,
  personDocumentNumberPlaintextSchema,
  personPiiBlobPlaintextSchema,
  relationshipsService,
  type UpdatePersonDocumentInput,
} from "@voyant-travel/relationships"
import {
  decryptOptionalJsonEnvelope,
  encryptOptionalJsonEnvelope,
  type KmsProvider,
} from "@voyant-travel/utils"
import { and, asc, desc, eq, exists, inArray, isNull, or, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type {
  BootstrapCustomerPortalInput,
  BootstrapCustomerPortalResult,
  CreateCustomerPortalCompanionInput,
  CustomerPortalAddress,
  CustomerPortalBookingBillingContact,
  CustomerPortalBookingDetail,
  CustomerPortalBookingDocument,
  CustomerPortalBookingFinancialDocument,
  CustomerPortalBookingFinancials,
  CustomerPortalBookingPayment,
  CustomerPortalBookingSummary,
  CustomerPortalBootstrapCandidate,
  CustomerPortalCompanion,
  CustomerPortalProfile,
  ImportCustomerPortalBookingTravelersInput,
  ImportCustomerPortalBookingTravelersResult,
  UpdateCustomerPortalAddressInput,
  UpdateCustomerPortalCompanionInput,
  UpdateCustomerPortalProfileInput,
} from "./validation-public.js"
import { customerPortalBookingDetailSchema } from "./validation-public.js"

const linkedCustomerSource = "customer_auth.user"
const companionMetadataKind = "companion"
const peopleKeyRef = { keyType: "people" as const }

interface CustomerPortalServiceOptions {
  kms?: KmsProvider | null
  resolveDocumentDownloadUrl?: (storageKey: string) => Promise<string | null> | string | null
}

function resolveMarketingConsentState(params: {
  currentConsent: boolean | null | undefined
  currentConsentAt: Date | string | null | undefined
  currentConsentSource: string | null | undefined
  nextConsent?: boolean
  nextConsentSource?: string | null
}) {
  const currentConsent = params.currentConsent ?? false
  const nextConsent = params.nextConsent ?? currentConsent
  const currentConsentAt =
    params.currentConsentAt instanceof Date
      ? params.currentConsentAt
      : params.currentConsentAt
        ? new Date(params.currentConsentAt)
        : null
  const normalizedNextSource =
    params.nextConsentSource !== undefined
      ? (normalizeNullableString(params.nextConsentSource) ?? null)
      : (params.currentConsentSource ?? null)

  return {
    marketingConsent: nextConsent,
    marketingConsentAt:
      params.nextConsent === undefined
        ? currentConsentAt
        : nextConsent
          ? currentConsent
            ? (currentConsentAt ?? new Date())
            : new Date()
          : null,
    marketingConsentSource: nextConsent ? normalizedNextSource : null,
  }
}

async function persistBootstrapMarketingConsent(
  db: PostgresJsDatabase,
  userId: string,
  authProfile: Awaited<ReturnType<typeof getAuthProfileRow>>,
  input: BootstrapCustomerPortalInput,
): Promise<void> {
  if (
    !authProfile ||
    (input.marketingConsent === undefined && input.marketingConsentSource === undefined)
  ) {
    return
  }

  const nextMarketingConsent = resolveMarketingConsentState({
    currentConsent: authProfile.marketingConsent,
    currentConsentAt: authProfile.marketingConsentAt,
    currentConsentSource: authProfile.marketingConsentSource,
    nextConsent: input.marketingConsent,
    nextConsentSource: input.marketingConsentSource,
  })

  await db
    .insert(customerAuthProfilesTable)
    .values({
      id: userId,
      marketingConsent: nextMarketingConsent.marketingConsent,
      marketingConsentAt: nextMarketingConsent.marketingConsentAt,
      marketingConsentSource: nextMarketingConsent.marketingConsentSource,
    })
    .onConflictDoUpdate({
      target: customerAuthProfilesTable.id,
      set: {
        marketingConsent: nextMarketingConsent.marketingConsent,
        marketingConsentAt: nextMarketingConsent.marketingConsentAt,
        marketingConsentSource: nextMarketingConsent.marketingConsentSource,
        updatedAt: new Date(),
      },
    })
}

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }

  return value
}

function normalizeDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return null
  }

  return value instanceof Date ? value.toISOString() : value
}

function normalizeNullableString(value: string | null | undefined) {
  if (value === undefined) {
    return undefined
  }

  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function normalizePhone(value: string) {
  return value.trim()
}

function normalizeCompanionLookupName(value: string) {
  return value.trim().toLowerCase()
}

function deriveMiddleName(
  fullName: string | null | undefined,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
) {
  const normalizedFullName = fullName?.trim() ?? ""
  if (!normalizedFullName) {
    return null
  }

  const normalizedFirstName = firstName?.trim() ?? ""
  const normalizedLastName = lastName?.trim() ?? ""
  let working = normalizedFullName

  if (normalizedFirstName && working.toLowerCase().startsWith(normalizedFirstName.toLowerCase())) {
    working = working.slice(normalizedFirstName.length).trim()
  }

  if (normalizedLastName && working.toLowerCase().endsWith(normalizedLastName.toLowerCase())) {
    working = working.slice(0, -normalizedLastName.length).trim()
  }

  return working.length > 0 ? working : null
}

type WireDocumentType = "passport" | "id_card" | "visa" | "drivers_license" | "other"
type CrmDocumentType = "passport" | "id_card" | "driver_license" | "visa" | "other"

function toCrmDocumentType(type: WireDocumentType): CrmDocumentType {
  return type === "drivers_license" ? "driver_license" : type
}

function toWireDocumentType(type: CrmDocumentType): WireDocumentType {
  return type === "driver_license" ? "drivers_license" : type
}

function getMetadataRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function getMetadataString(record: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key]
    if (typeof value === "string" && value.length > 0) {
      return value
    }
  }

  return null
}

function getRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function toCustomerAddress(
  address: Awaited<ReturnType<typeof identityService.listAddressesForEntity>>[number],
): CustomerPortalAddress {
  return {
    id: address.id,
    label: address.label,
    fullText: address.fullText ?? null,
    line1: address.line1 ?? null,
    line2: address.line2 ?? null,
    city: address.city ?? null,
    region: address.region ?? null,
    postalCode: address.postalCode ?? null,
    country: address.country ?? null,
    isPrimary: address.isPrimary,
  }
}

function getNestedRecord(record: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = getRecord(record?.[key])
    if (value) {
      return value
    }
  }

  return null
}

function getRecordString(record: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key]
    if (typeof value === "string") {
      const trimmed = value.trim()
      if (trimmed.length > 0) {
        return trimmed
      }
    }
  }

  return null
}

function getRecordBoolean(record: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key]
    if (typeof value === "boolean") {
      return value
    }
  }

  return null
}

function splitCompanionName(value: string | null | undefined) {
  const parts = String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length === 0) {
    return {
      firstName: null,
      middleName: null,
      lastName: null,
    }
  }

  if (parts.length === 1) {
    return {
      firstName: parts[0] ?? null,
      middleName: null,
      lastName: null,
    }
  }

  return {
    firstName: parts[0] ?? null,
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : null,
    lastName: parts.at(-1) ?? null,
  }
}

function normalizeCompanionAddressRecord(
  value: Record<string, unknown> | null,
): CustomerPortalCompanion["person"]["addresses"][number] {
  return {
    type: getRecordString(value, ["type"]) ?? null,
    country: getRecordString(value, ["country"]) ?? null,
    state: getRecordString(value, ["state", "region"]) ?? null,
    city: getRecordString(value, ["city"]) ?? null,
    postalCode: getRecordString(value, ["postalCode", "postal"]) ?? null,
    addressLine1: getRecordString(value, ["addressLine1", "line1"]) ?? null,
    addressLine2: getRecordString(value, ["addressLine2", "line2"]) ?? null,
    isDefault: getRecordBoolean(value, ["isDefault"]) ?? false,
  }
}

function normalizeCompanionDocumentRecord(
  value: Record<string, unknown> | null,
): CustomerPortalCompanion["person"]["documents"][number] | null {
  const type = getRecordString(value, ["type"])
  if (
    type !== "passport" &&
    type !== "id_card" &&
    type !== "visa" &&
    type !== "drivers_license" &&
    type !== "other"
  ) {
    return null
  }

  return {
    type,
    number: getRecordString(value, ["number"]) ?? null,
    issuingAuthority: getRecordString(value, ["issuingAuthority"]) ?? null,
    country: getRecordString(value, ["country", "issuingCountry"]) ?? null,
    issueDate: getRecordString(value, ["issueDate"]) ?? null,
    expiryDate: getRecordString(value, ["expiryDate"]) ?? null,
  }
}

function getCompanionPersonMetadata(metadata: Record<string, unknown> | null) {
  const personMetadata = getNestedRecord(metadata, ["person", "traveler", "identity"])
  const derivedName = splitCompanionName(getRecordString(metadata, ["name"]))

  const addresses = Array.isArray(personMetadata?.addresses)
    ? personMetadata.addresses
        .map((value) => normalizeCompanionAddressRecord(getRecord(value)))
        .filter(Boolean)
    : []
  const documents = Array.isArray(personMetadata?.documents)
    ? personMetadata.documents
        .map((value) => normalizeCompanionDocumentRecord(getRecord(value)))
        .filter((value): value is NonNullable<typeof value> => Boolean(value))
    : []

  return {
    firstName: getRecordString(personMetadata, ["firstName"]) ?? derivedName.firstName,
    middleName: getRecordString(personMetadata, ["middleName"]) ?? derivedName.middleName,
    lastName: getRecordString(personMetadata, ["lastName"]) ?? derivedName.lastName,
    dateOfBirth: getRecordString(personMetadata, ["dateOfBirth"]) ?? null,
    addresses,
    documents,
  } satisfies CustomerPortalCompanion["person"]
}

function getCompanionTypeKey(metadata: Record<string, unknown> | null) {
  return getRecordString(metadata, ["typeKey", "relationshipType"])
}

function buildStoredCompanionMetadata(input: {
  existingMetadata?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  typeKey?: string | null
  person?: {
    firstName?: string | null
    middleName?: string | null
    lastName?: string | null
    dateOfBirth?: string | null
    addresses?:
      | Array<{
          type?: string | null
          country?: string | null
          state?: string | null
          city?: string | null
          postalCode?: string | null
          addressLine1?: string | null
          addressLine2?: string | null
          isDefault?: boolean
        }>
      | undefined
    documents?:
      | Array<{
          type: "passport" | "id_card" | "visa" | "drivers_license" | "other"
          number?: string | null
          issuingAuthority?: string | null
          country?: string | null
          issueDate?: string | null
          expiryDate?: string | null
        }>
      | undefined
  }
}) {
  const baseMetadata =
    input.metadata !== undefined
      ? { ...((input.metadata as Record<string, unknown> | null) ?? {}) }
      : { ...((input.existingMetadata as Record<string, unknown> | null) ?? {}) }

  baseMetadata.kind = companionMetadataKind

  if (input.typeKey !== undefined) {
    const typeKey = normalizeNullableString(input.typeKey)
    if (typeKey) {
      baseMetadata.typeKey = typeKey
    } else {
      delete baseMetadata.typeKey
    }
  }

  if (input.person !== undefined) {
    baseMetadata.person = {
      firstName: normalizeNullableString(input.person.firstName) ?? null,
      middleName: normalizeNullableString(input.person.middleName) ?? null,
      lastName: normalizeNullableString(input.person.lastName) ?? null,
      dateOfBirth: normalizeNullableString(input.person.dateOfBirth) ?? null,
      addresses:
        input.person.addresses?.map((address) => ({
          type: normalizeNullableString(address.type) ?? null,
          country: normalizeNullableString(address.country) ?? null,
          state: normalizeNullableString(address.state) ?? null,
          city: normalizeNullableString(address.city) ?? null,
          postalCode: normalizeNullableString(address.postalCode) ?? null,
          addressLine1: normalizeNullableString(address.addressLine1) ?? null,
          addressLine2: normalizeNullableString(address.addressLine2) ?? null,
          isDefault: address.isDefault ?? false,
        })) ?? [],
      documents:
        input.person.documents?.map((document) => ({
          type: document.type,
          number: normalizeNullableString(document.number) ?? null,
          issuingAuthority: normalizeNullableString(document.issuingAuthority) ?? null,
          country: normalizeNullableString(document.country) ?? null,
          issueDate: normalizeNullableString(document.issueDate) ?? null,
          expiryDate: normalizeNullableString(document.expiryDate) ?? null,
        })) ?? [],
    }
  }

  return baseMetadata
}

function selectPreferredAddress(
  addresses: Awaited<ReturnType<typeof identityService.listAddressesForEntity>>,
) {
  return (
    addresses.find((address) => address.label === "billing") ??
    addresses.find((address) => address.isPrimary) ??
    addresses[0] ??
    null
  )
}

function resolveFinanceDocumentFileName(
  invoiceNumber: string,
  invoiceType: "invoice" | "proforma" | "credit_note",
  format: string | null,
) {
  const extension = format ?? "pdf"
  return `${invoiceType}-${invoiceNumber}.${extension}`
}

async function listLegalDocumentsForBooking(
  db: PostgresJsDatabase,
  bookingId: string,
  options: CustomerPortalServiceOptions = {},
) {
  const contractRows = await db
    .select({
      id: contracts.id,
      contractNumber: contracts.contractNumber,
    })
    .from(contracts)
    .where(eq(contracts.bookingId, bookingId))
    .orderBy(desc(contracts.createdAt))

  if (contractRows.length === 0) {
    return []
  }

  const attachmentRows = await db
    .select()
    .from(contractAttachments)
    .where(
      and(
        eq(contractAttachments.kind, "document"),
        or(...contractRows.map((contract) => eq(contractAttachments.contractId, contract.id))),
      ),
    )
    .orderBy(desc(contractAttachments.createdAt))

  const bestAttachmentByContractId = new Map<
    string,
    {
      attachment: typeof contractAttachments.$inferSelect
      downloadUrl: string
    }
  >()
  for (const attachment of attachmentRows) {
    const metadata = getMetadataRecord(attachment.metadata)
    const downloadUrl =
      attachment.storageKey && options.resolveDocumentDownloadUrl
        ? await options.resolveDocumentDownloadUrl(attachment.storageKey)
        : getMetadataString(metadata, ["url"])
    if (!downloadUrl || bestAttachmentByContractId.has(attachment.contractId)) {
      continue
    }
    bestAttachmentByContractId.set(attachment.contractId, { attachment, downloadUrl })
  }

  return contractRows.flatMap<CustomerPortalBookingDocument>((contract) => {
    const document = bestAttachmentByContractId.get(contract.id)
    if (!document) {
      return []
    }
    const { attachment, downloadUrl } = document

    return [
      {
        id: attachment.id,
        source: "legal" as const,
        travelerId: null,
        type: "contract" as const,
        fileName: attachment.name,
        fileUrl: downloadUrl,
        mimeType: attachment.mimeType ?? null,
        reference: contract.contractNumber ?? null,
      },
    ]
  })
}

function resolveFinanceDocumentDownloadUrl(metadata: Record<string, unknown> | null) {
  return getMetadataString(metadata, ["url"])
}

function selectBookingSummaryProductTitle(
  items: Array<{
    title: string
    itemType: string
  }>,
) {
  const preferredItem =
    items.find((item) => item.itemType === "unit") ??
    items.find((item) => item.itemType === "accommodation") ??
    items.find((item) => item.itemType === "transport") ??
    items[0] ??
    null

  return preferredItem?.title ?? null
}

function deriveBookingSummaryPaymentStatus(
  invoicesForBooking: Array<{
    invoiceType: "invoice" | "proforma" | "credit_note"
    status:
      | "draft"
      | "pending_external_allocation"
      | "issued"
      | "partially_paid"
      | "paid"
      | "overdue"
      | "void"
    paidCents: number
    balanceDueCents: number
  }>,
  fallbackSellAmountCents: number | null,
) {
  const activeInvoices = invoicesForBooking.filter(
    (invoice) => invoice.invoiceType !== "credit_note" && invoice.status !== "void",
  )

  if (activeInvoices.length === 0) {
    return fallbackSellAmountCents && fallbackSellAmountCents > 0 ? "unpaid" : "paid"
  }

  if (
    activeInvoices.some((invoice) => invoice.status === "overdue" && invoice.balanceDueCents > 0)
  ) {
    return "overdue"
  }

  const totalPaidCents = activeInvoices.reduce(
    (sum, invoice) => sum + Math.max(0, invoice.paidCents),
    0,
  )
  const totalBalanceDueCents = activeInvoices.reduce(
    (sum, invoice) => sum + Math.max(0, invoice.balanceDueCents),
    0,
  )

  if (totalBalanceDueCents <= 0) {
    return "paid"
  }

  if (totalPaidCents > 0) {
    return "partially_paid"
  }

  return "unpaid"
}

async function getFinanceDataForBooking(
  db: PostgresJsDatabase,
  bookingId: string,
  options: CustomerPortalServiceOptions = {},
): Promise<{
  documents: CustomerPortalBookingFinancialDocument[]
  payments: CustomerPortalBookingPayment[]
  portalDocuments: CustomerPortalBookingDocument[]
}> {
  const invoiceRows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.bookingId, bookingId))
    .orderBy(desc(invoices.createdAt))

  if (invoiceRows.length === 0) {
    return { documents: [], payments: [], portalDocuments: [] }
  }

  const invoiceIds = invoiceRows.map((invoice) => invoice.id)
  const renditionRows = await db
    .select()
    .from(invoiceRenditions)
    .where(inArray(invoiceRenditions.invoiceId, invoiceIds))
    .orderBy(desc(invoiceRenditions.createdAt))
  const paymentRows = await db
    .select()
    .from(payments)
    .where(inArray(payments.invoiceId, invoiceIds))
    .orderBy(desc(payments.paymentDate), desc(payments.createdAt))

  const renditionByInvoiceId = new Map<string, (typeof invoiceRenditions.$inferSelect)[]>()
  for (const rendition of renditionRows) {
    const existing = renditionByInvoiceId.get(rendition.invoiceId) ?? []
    existing.push(rendition)
    renditionByInvoiceId.set(rendition.invoiceId, existing)
  }

  const invoiceById = new Map(invoiceRows.map((invoice) => [invoice.id, invoice]))

  const resolvedDocuments = await Promise.all(
    invoiceRows.map(async (invoice): Promise<CustomerPortalBookingFinancialDocument> => {
      const renditions = renditionByInvoiceId.get(invoice.id) ?? []
      const selectedRendition =
        renditions.find((rendition) => rendition.status === "ready") ?? renditions[0] ?? null
      const metadata = getMetadataRecord(selectedRendition?.metadata ?? null)
      const downloadUrl =
        selectedRendition?.storageKey && options.resolveDocumentDownloadUrl
          ? await options.resolveDocumentDownloadUrl(selectedRendition.storageKey)
          : resolveFinanceDocumentDownloadUrl(metadata)

      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceType: invoice.invoiceType,
        invoiceStatus: invoice.status,
        currency: invoice.currency,
        totalCents: invoice.totalCents,
        paidCents: invoice.paidCents,
        balanceDueCents: invoice.balanceDueCents,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        documentStatus: selectedRendition?.status ?? "missing",
        format: selectedRendition?.format ?? null,
        generatedAt: normalizeDateTime(selectedRendition?.generatedAt ?? null),
        downloadUrl,
      }
    }),
  )

  const paymentHistory = paymentRows.flatMap<CustomerPortalBookingPayment>((payment) => {
    const invoice = invoiceById.get(payment.invoiceId)
    if (!invoice) {
      return []
    }

    return [
      {
        id: payment.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceType: invoice.invoiceType,
        status: payment.status,
        paymentMethod: payment.paymentMethod,
        amountCents: payment.amountCents,
        currency: payment.currency,
        paymentDate: payment.paymentDate,
        referenceNumber: payment.referenceNumber ?? null,
        notes: payment.notes ?? null,
      },
    ]
  })

  const portalDocuments = resolvedDocuments.flatMap<CustomerPortalBookingDocument>((document) => {
    if (!document.downloadUrl) {
      return []
    }

    return [
      {
        id: document.invoiceId,
        source: "finance",
        travelerId: null,
        type: document.invoiceType,
        fileName: resolveFinanceDocumentFileName(
          document.invoiceNumber,
          document.invoiceType,
          document.format,
        ),
        fileUrl: document.downloadUrl,
        mimeType: document.format === "pdf" ? "application/pdf" : null,
        reference: document.invoiceNumber,
      },
    ]
  })

  return { documents: resolvedDocuments, payments: paymentHistory, portalDocuments }
}

function toCustomerCompanion(
  row: Awaited<ReturnType<typeof identityService.listNamedContactsForEntity>>[number],
): CustomerPortalCompanion {
  const metadata = (row.metadata as Record<string, unknown> | null) ?? null
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    title: row.title ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    isPrimary: row.isPrimary,
    notes: row.notes ?? null,
    typeKey: getCompanionTypeKey(metadata) ?? null,
    person: getCompanionPersonMetadata({
      ...metadata,
      name: row.name,
    }),
    metadata,
  }
}

function getCompanionLookupKeys(input: {
  name: string
  email?: string | null
  phone?: string | null
}) {
  const keys = [normalizeCompanionLookupName(input.name)]
  if (input.email) {
    keys.push(`email:${normalizeEmail(input.email)}`)
  }
  if (input.phone) {
    keys.push(`phone:${normalizePhone(input.phone)}`)
  }
  return keys
}

async function getAuthProfileRow(db: PostgresJsDatabase, userId: string) {
  const [row] = await db
    .select({
      id: customerAuthUser.id,
      email: customerAuthUser.email,
      phoneNumber: customerAuthUser.phoneNumber,
      phoneNumberVerified: customerAuthUser.phoneNumberVerified,
      emailVerified: customerAuthUser.emailVerified,
      name: customerAuthUser.name,
      image: customerAuthUser.image,
      relationshipPersonId: customerAuthUser.relationshipPersonId,
      firstName: customerAuthProfilesTable.firstName,
      lastName: customerAuthProfilesTable.lastName,
      avatarUrl: customerAuthProfilesTable.avatarUrl,
      locale: customerAuthProfilesTable.locale,
      timezone: customerAuthProfilesTable.timezone,
      seatingPreference: customerAuthProfilesTable.seatingPreference,
      marketingConsent: customerAuthProfilesTable.marketingConsent,
      marketingConsentAt: customerAuthProfilesTable.marketingConsentAt,
      marketingConsentSource: customerAuthProfilesTable.marketingConsentSource,
      notificationDefaults: customerAuthProfilesTable.notificationDefaults,
      uiPrefs: customerAuthProfilesTable.uiPrefs,
    })
    .from(customerAuthUser)
    .leftJoin(customerAuthProfilesTable, eq(customerAuthProfilesTable.id, customerAuthUser.id))
    .where(eq(customerAuthUser.id, userId))
    .limit(1)

  return row ?? null
}

async function decryptProfileBlob(
  envelope: { enc: string } | null | undefined,
  options?: CustomerPortalServiceOptions,
): Promise<string | null> {
  if (!envelope || !options?.kms) {
    return null
  }
  const decrypted = await decryptOptionalJsonEnvelope(
    options.kms,
    peopleKeyRef,
    envelope,
    personPiiBlobPlaintextSchema,
  )
  return decrypted?.text ?? null
}

async function encryptProfileBlob(value: string | null, options?: CustomerPortalServiceOptions) {
  if (!options?.kms) {
    return undefined
  }
  if (value === null) {
    return null
  }
  return encryptOptionalJsonEnvelope(options.kms, peopleKeyRef, { text: value })
}

async function decryptDocumentNumber(
  envelope: { enc: string } | null | undefined,
  options?: CustomerPortalServiceOptions,
): Promise<string | null> {
  if (!envelope || !options?.kms) {
    return null
  }
  const decrypted = await decryptOptionalJsonEnvelope(
    options.kms,
    peopleKeyRef,
    envelope,
    personDocumentNumberPlaintextSchema,
  )
  return decrypted?.number ?? null
}

async function encryptDocumentNumber(
  value: string | null | undefined,
  options?: CustomerPortalServiceOptions,
) {
  if (!options?.kms) {
    return undefined
  }
  if (value == null) {
    return null
  }
  return encryptOptionalJsonEnvelope(options.kms, peopleKeyRef, { number: value })
}

async function projectPersonDocumentToWire(
  row: PersonDocument,
  options?: CustomerPortalServiceOptions,
) {
  return {
    id: row.id,
    type: toWireDocumentType(row.type),
    number: await decryptDocumentNumber(row.numberEncrypted, options),
    issuingAuthority: row.issuingAuthority ?? null,
    issuingCountry: row.issuingCountry ?? null,
    issueDate: row.issueDate ?? null,
    expiryDate: row.expiryDate ?? null,
    attachmentId: row.attachmentId ?? null,
    isPrimary: row.isPrimary,
    notes: row.notes ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  }
}

async function getLinkedPersonPiiRow(db: PostgresJsDatabase, userId: string) {
  const personId = await resolveLinkedCustomerRecordId(db, userId)
  if (!personId) return null
  const [row] = await db
    .select({
      id: people.id,
      accessibilityEncrypted: people.accessibilityEncrypted,
      dietaryEncrypted: people.dietaryEncrypted,
      loyaltyEncrypted: people.loyaltyEncrypted,
      insuranceEncrypted: people.insuranceEncrypted,
    })
    .from(people)
    .where(eq(people.id, personId))
    .limit(1)

  return row ?? null
}

async function getLinkedPersonDocuments(
  db: PostgresJsDatabase,
  userId: string,
  options?: CustomerPortalServiceOptions,
) {
  const linked = await resolveLinkedCustomerRecordId(db, userId)
  if (!linked) {
    return []
  }
  const rows = await relationshipsService.listPersonDocuments(db, linked)
  return Promise.all(rows.map((row) => projectPersonDocumentToWire(row, options)))
}

/**
 * Resolves the `crm.people` row linked to this auth user, creating
 * it on first PII write if missing. The seed values mirror what the
 * bootstrap path already produces. The customer identity's durable
 * relationshipPersonId is the link authority; legacy Person source/sourceRef
 * values are read only for upgrade reconciliation.
 */
async function ensureLinkedPerson(
  db: PostgresJsDatabase,
  userId: string,
  authProfile: NonNullable<Awaited<ReturnType<typeof getAuthProfileRow>>>,
): Promise<string> {
  const existing = await resolveLinkedCustomerRecordId(db, userId)
  if (existing) return existing

  const [identity] = await db
    .select({ relationshipPersonId: customerAuthUser.relationshipPersonId })
    .from(customerAuthUser)
    .where(eq(customerAuthUser.id, userId))
    .limit(1)
  if (identity?.relationshipPersonId) {
    throw new Error("The linked customer record is no longer active")
  }

  const fallbackFirst =
    authProfile.firstName ?? authProfile.name.split(" ")[0]?.trim() ?? "Customer"
  const fallbackLast =
    authProfile.lastName ?? (authProfile.name.split(" ").slice(1).join(" ").trim() || "")

  return db.transaction(async (tx) => {
    const txDb = tx as PostgresJsDatabase
    const created = await relationshipsService.createPerson(txDb, {
      firstName: fallbackFirst,
      lastName: fallbackLast,
      tags: [],
      status: "active",
      website: null,
    })
    if (!created || !(await claimPersonalBuyerPerson(txDb, userId, created.id))) {
      throw new Error("Failed to atomically create and claim the customer record")
    }
    return created.id
  })
}

async function resolveLinkedCustomerRecordId(
  db: PostgresJsDatabase,
  userId: string,
): Promise<string | null> {
  const [identity] = await db
    .select({ relationshipPersonId: customerAuthUser.relationshipPersonId })
    .from(customerAuthUser)
    .where(eq(customerAuthUser.id, userId))
    .limit(1)
  if (!identity) return null
  if (identity.relationshipPersonId) {
    const [activePerson] = await db
      .select({ id: people.id })
      .from(people)
      .where(
        and(
          eq(people.id, identity.relationshipPersonId),
          eq(people.status, "active"),
          isNull(people.archivedAt),
        ),
      )
      .limit(1)
    return activePerson?.id ?? null
  }

  // Upgrade/fresh-install reconciliation for the legacy mutable source/sourceRef
  // link. Ambiguous legacy state fails closed instead of choosing a Person.
  const legacyRows = await db
    .select({ id: people.id })
    .from(people)
    .where(
      and(
        eq(people.source, linkedCustomerSource),
        eq(people.sourceRef, userId),
        eq(people.status, "active"),
        isNull(people.archivedAt),
      ),
    )
    .limit(2)
  if (legacyRows.length !== 1) return null
  return (await claimPersonalBuyerPerson(db, userId, legacyRows[0]!.id)) ? legacyRows[0]!.id : null
}

/** @internal Exported only for security-focused integration coverage. */
export async function claimPersonalBuyerPerson(
  db: PostgresJsDatabase,
  userId: string,
  personId: string,
  options: { requireVerifiedIdentityContact?: boolean } = {},
): Promise<boolean> {
  const activePerson = db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.id, personId), eq(people.status, "active"), isNull(people.archivedAt)))
  try {
    const verifiedIdentityContact = db
      .select({ id: identityContactPoints.id })
      .from(identityContactPoints)
      .innerJoin(customerAuthUser, eq(customerAuthUser.id, userId))
      .where(
        and(
          eq(identityContactPoints.entityType, "person"),
          eq(identityContactPoints.entityId, personId),
          or(
            and(
              eq(customerAuthUser.emailVerified, true),
              eq(identityContactPoints.kind, "email"),
              sql`lower(${identityContactPoints.normalizedValue}) = lower(${customerAuthUser.email})`,
            ),
            and(
              eq(customerAuthUser.phoneNumberVerified, true),
              inArray(identityContactPoints.kind, ["phone", "mobile", "whatsapp", "sms"]),
              or(
                eq(identityContactPoints.normalizedValue, customerAuthUser.phoneNumber),
                eq(identityContactPoints.value, customerAuthUser.phoneNumber),
              ),
            ),
          ),
        ),
      )
    const [claimed] = await db
      .update(customerAuthUser)
      .set({ relationshipPersonId: personId, updatedAt: new Date() })
      .where(
        and(
          eq(customerAuthUser.id, userId),
          isNull(customerAuthUser.relationshipPersonId),
          exists(activePerson),
          ...(options.requireVerifiedIdentityContact ? [exists(verifiedIdentityContact)] : []),
        ),
      )
      .returning({ userId: customerAuthUser.id })
    if (claimed) return true

    const [existing] = await db
      .select({ relationshipPersonId: customerAuthUser.relationshipPersonId })
      .from(customerAuthUser)
      .where(eq(customerAuthUser.id, userId))
      .limit(1)
    return existing?.relationshipPersonId === personId
  } catch (error) {
    if ((error as { code?: unknown })?.code === "23505") return false
    throw error
  }
}

async function listCustomerRecordCandidatesByEmail(
  db: PostgresJsDatabase,
  email: string,
): Promise<CustomerPortalBootstrapCandidate[]> {
  const normalizedEmail = normalizeEmail(email)
  const rows = await db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      preferredLanguage: people.preferredLanguage,
      preferredCurrency: people.preferredCurrency,
      dateOfBirth: people.dateOfBirth,
      relation: people.relation,
      status: people.status,
      source: people.source,
      sourceRef: people.sourceRef,
      claimedUserId: customerAuthUser.id,
    })
    .from(people)
    .innerJoin(
      identityContactPoints,
      and(
        eq(identityContactPoints.entityType, "person"),
        eq(identityContactPoints.entityId, people.id),
        eq(identityContactPoints.kind, "email"),
        eq(identityContactPoints.normalizedValue, normalizedEmail),
      ),
    )
    .leftJoin(customerAuthUser, eq(customerAuthUser.relationshipPersonId, people.id))
    .where(and(eq(people.status, "active"), isNull(people.archivedAt)))
    .orderBy(desc(people.updatedAt))

  const uniqueRows = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    if (!uniqueRows.has(row.id)) {
      uniqueRows.set(row.id, row)
    }
  }

  const candidates = Array.from(uniqueRows.values()).map((row) => ({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    preferredLanguage: row.preferredLanguage ?? null,
    preferredCurrency: row.preferredCurrency ?? null,
    dateOfBirth: row.dateOfBirth ?? null,
    email: normalizedEmail,
    phone: null,
    billingAddress: null,
    relation: row.relation ?? null,
    status: row.status,
    claimedByAnotherUser:
      Boolean(row.claimedUserId) || (row.source === linkedCustomerSource && Boolean(row.sourceRef)),
    linkable:
      !row.claimedUserId &&
      !(row.source === linkedCustomerSource && Boolean(row.sourceRef)) &&
      row.sourceRef == null,
  }))

  return candidates
}

async function listCustomerRecordCandidatesByPhone(
  db: PostgresJsDatabase,
  phone: string,
): Promise<CustomerPortalBootstrapCandidate[]> {
  const normalizedPhone = normalizePhone(phone)
  const rows = await db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      preferredLanguage: people.preferredLanguage,
      preferredCurrency: people.preferredCurrency,
      dateOfBirth: people.dateOfBirth,
      relation: people.relation,
      status: people.status,
      source: people.source,
      sourceRef: people.sourceRef,
      claimedUserId: customerAuthUser.id,
    })
    .from(people)
    .innerJoin(
      identityContactPoints,
      and(
        eq(identityContactPoints.entityType, "person"),
        eq(identityContactPoints.entityId, people.id),
        inArray(identityContactPoints.kind, ["phone", "mobile", "whatsapp", "sms"]),
        or(
          eq(identityContactPoints.normalizedValue, normalizedPhone),
          eq(identityContactPoints.value, normalizedPhone),
        ),
      ),
    )
    .leftJoin(customerAuthUser, eq(customerAuthUser.relationshipPersonId, people.id))
    .where(and(eq(people.status, "active"), isNull(people.archivedAt)))
    .orderBy(desc(people.updatedAt))

  const uniqueRows = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    if (!uniqueRows.has(row.id)) {
      uniqueRows.set(row.id, row)
    }
  }

  return Array.from(uniqueRows.values()).map((row) => ({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    preferredLanguage: row.preferredLanguage ?? null,
    preferredCurrency: row.preferredCurrency ?? null,
    dateOfBirth: row.dateOfBirth ?? null,
    email: null,
    phone: normalizedPhone,
    billingAddress: null,
    relation: row.relation ?? null,
    status: row.status,
    claimedByAnotherUser:
      Boolean(row.claimedUserId) || (row.source === linkedCustomerSource && Boolean(row.sourceRef)),
    linkable:
      !row.claimedUserId &&
      !(row.source === linkedCustomerSource && Boolean(row.sourceRef)) &&
      row.sourceRef == null,
  }))
}

async function getCustomerRecord(db: PostgresJsDatabase, userId: string) {
  const personId = await resolveLinkedCustomerRecordId(db, userId)
  if (!personId) {
    return null
  }

  const [person, addresses] = await Promise.all([
    relationshipsService.getPersonById(db, personId),
    identityService.listAddressesForEntity(db, "person", personId),
  ])
  if (!person) {
    return null
  }

  const billingAddress = selectPreferredAddress(addresses)

  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    preferredLanguage: person.preferredLanguage ?? null,
    preferredCurrency: person.preferredCurrency ?? null,
    dateOfBirth: person.dateOfBirth ?? null,
    email: person.email ?? null,
    phone: person.phone ?? null,
    billingAddress: billingAddress ? toCustomerAddress(billingAddress) : null,
    relation: person.relation ?? null,
    status: person.status,
  }
}

async function upsertCustomerBillingAddress(
  db: PostgresJsDatabase,
  personId: string,
  input: UpdateCustomerPortalAddressInput,
) {
  const existingAddresses = await identityService.listAddressesForEntity(db, "person", personId)
  const existingAddress = selectPreferredAddress(existingAddresses)

  const merged = {
    label: input.label ?? existingAddress?.label ?? "billing",
    fullText: normalizeNullableString(input.fullText) ?? existingAddress?.fullText ?? null,
    line1: normalizeNullableString(input.line1) ?? existingAddress?.line1 ?? null,
    line2: normalizeNullableString(input.line2) ?? existingAddress?.line2 ?? null,
    city: normalizeNullableString(input.city) ?? existingAddress?.city ?? null,
    region: normalizeNullableString(input.region) ?? existingAddress?.region ?? null,
    postalCode: normalizeNullableString(input.postalCode) ?? existingAddress?.postalCode ?? null,
    country: normalizeNullableString(input.country) ?? existingAddress?.country ?? null,
    isPrimary: input.isPrimary ?? existingAddress?.isPrimary ?? existingAddresses.length === 0,
  }

  if (existingAddress) {
    return identityService.updateAddress(db, existingAddress.id, merged)
  }

  return identityService.createAddress(db, {
    entityType: "person",
    entityId: personId,
    ...merged,
  })
}

async function getAccessibleBookingIds(
  db: PostgresJsDatabase,
  params: { buyer: CustomerBuyerContext; email: string | null },
) {
  if (params.buyer.kind === "business") {
    if (!(await isActiveBusinessBuyerOrganization(db, params.buyer))) return []
    const rows = await db
      .select({ bookingId: bookings.id })
      .from(bookings)
      .where(eq(bookings.organizationId, params.buyer.relationshipOrganizationId))
    return rows.map((row) => row.bookingId)
  }

  const linkedPersonId = await resolveLinkedCustomerRecordId(db, params.buyer.userId)
  if (!linkedPersonId) return []
  const email = params.email?.trim().toLowerCase() ?? null

  const [directBookingRows, participantPersonRows, participantEmailRows] = await Promise.all([
    linkedPersonId
      ? db
          .select({ bookingId: bookings.id })
          .from(bookings)
          .where(eq(bookings.personId, linkedPersonId))
      : Promise.resolve([]),
    linkedPersonId
      ? db
          .select({ bookingId: bookingTravelers.bookingId })
          .from(bookingTravelers)
          .where(eq(bookingTravelers.personId, linkedPersonId))
      : Promise.resolve([]),
    // Phone-only users have no email to match on — fall back to linked-person matching only.
    email
      ? db
          .select({ bookingId: bookingTravelers.bookingId })
          .from(bookingTravelers)
          // agent-quality: raw-sql reviewed -- owner: customer-portal; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
          .where(sql`lower(${bookingTravelers.email}) = ${email}`)
      : Promise.resolve([]),
  ])

  return Array.from(
    new Set(
      [...directBookingRows, ...participantPersonRows, ...participantEmailRows].map(
        (row) => row.bookingId,
      ),
    ),
  )
}

async function isActiveBusinessBuyerOrganization(
  db: PostgresJsDatabase,
  buyer: Extract<CustomerBuyerContext, { kind: "business" }>,
): Promise<boolean> {
  const [row] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, buyer.relationshipOrganizationId),
        eq(organizations.status, "active"),
        isNull(organizations.archivedAt),
      ),
    )
    .limit(1)
  return Boolean(row)
}

async function hasBookingAccess(params: {
  db: PostgresJsDatabase
  bookingId: string
  buyer: CustomerBuyerContext
  // Phone-only users have no email; the email-match branch is skipped
  // and access falls through to the linked-person path.
  authEmail: string | null
  linkedPersonId: string | null
}) {
  if (params.buyer.kind === "business") {
    if (!(await isActiveBusinessBuyerOrganization(params.db, params.buyer))) return false
    const [match] = await params.db
      .select({ bookingId: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.id, params.bookingId),
          eq(bookings.organizationId, params.buyer.relationshipOrganizationId),
        ),
      )
      .limit(1)
    return Boolean(match)
  }

  if (!params.linkedPersonId) return false

  const ownershipConditions = []
  if (params.authEmail) {
    // agent-quality: raw-sql reviewed -- owner: customer-portal; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    ownershipConditions.push(sql`lower(${bookingTravelers.email}) = ${params.authEmail}`)
  }

  if (params.linkedPersonId) {
    ownershipConditions.push(eq(bookingTravelers.personId, params.linkedPersonId))
  }

  if (ownershipConditions.length === 0) {
    return false
  }

  const [participantMatch, bookingMatch] = await Promise.all([
    params.db
      .select({ bookingId: bookingTravelers.bookingId })
      .from(bookingTravelers)
      .where(and(eq(bookingTravelers.bookingId, params.bookingId), or(...ownershipConditions)))
      .limit(1),
    params.linkedPersonId
      ? params.db
          .select({ bookingId: bookings.id })
          .from(bookings)
          .where(
            and(eq(bookings.id, params.bookingId), eq(bookings.personId, params.linkedPersonId)),
          )
          .limit(1)
      : Promise.resolve([]),
  ])

  return Boolean(participantMatch[0] || bookingMatch[0])
}

async function getBookingBillingContact(
  db: PostgresJsDatabase,
  bookingId: string,
  customerRecord: Awaited<ReturnType<typeof getCustomerRecord>> | null,
): Promise<CustomerPortalBookingBillingContact | null> {
  const [bookingRows, primaryParticipantRows] = await Promise.all([
    db
      .select({
        contactFirstName: bookings.contactFirstName,
        contactLastName: bookings.contactLastName,
        contactEmail: bookings.contactEmail,
        contactPhone: bookings.contactPhone,
        contactCountry: bookings.contactCountry,
        contactRegion: bookings.contactRegion,
        contactCity: bookings.contactCity,
        contactAddressLine1: bookings.contactAddressLine1,
        contactAddressLine2: bookings.contactAddressLine2,
        contactPostalCode: bookings.contactPostalCode,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1),
    db
      .select({
        firstName: bookingTravelers.firstName,
        lastName: bookingTravelers.lastName,
        email: bookingTravelers.email,
        phone: bookingTravelers.phone,
      })
      .from(bookingTravelers)
      .where(and(eq(bookingTravelers.bookingId, bookingId), eq(bookingTravelers.isPrimary, true)))
      .orderBy(asc(bookingTravelers.createdAt))
      .limit(1),
  ])

  const booking = bookingRows[0] ?? null
  const primaryParticipant = primaryParticipantRows[0] ?? null
  const billingAddress = customerRecord?.billingAddress ?? null

  const result: CustomerPortalBookingBillingContact = {
    email: booking?.contactEmail ?? primaryParticipant?.email ?? customerRecord?.email ?? null,
    phone: booking?.contactPhone ?? primaryParticipant?.phone ?? customerRecord?.phone ?? null,
    firstName:
      booking?.contactFirstName ??
      primaryParticipant?.firstName ??
      customerRecord?.firstName ??
      null,
    lastName:
      booking?.contactLastName ?? primaryParticipant?.lastName ?? customerRecord?.lastName ?? null,
    country: booking?.contactCountry ?? billingAddress?.country ?? null,
    state: booking?.contactRegion ?? billingAddress?.region ?? null,
    city: booking?.contactCity ?? billingAddress?.city ?? null,
    address1: booking?.contactAddressLine1 ?? billingAddress?.line1 ?? null,
    address2: booking?.contactAddressLine2 ?? billingAddress?.line2 ?? null,
    postal: booking?.contactPostalCode ?? billingAddress?.postalCode ?? null,
  }

  const hasValue = Object.values(result).some(
    (value) => typeof value === "string" && value.length > 0,
  )
  return hasValue ? result : null
}

async function buildBookingDetail(
  db: PostgresJsDatabase,
  bookingId: string,
  customerRecord: Awaited<ReturnType<typeof getCustomerRecord>> | null = null,
  options: CustomerPortalServiceOptions = {},
): Promise<CustomerPortalBookingDetail | null> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1)
  if (!booking) {
    return null
  }

  const [
    participants,
    items,
    itemParticipantLinks,
    documents,
    fulfillments,
    legalDocuments,
    financeData,
    billingContact,
  ] = await Promise.all([
    db
      .select()
      .from(bookingTravelers)
      .where(eq(bookingTravelers.bookingId, booking.id))
      .orderBy(asc(bookingTravelers.createdAt)),
    db
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, booking.id))
      .orderBy(asc(bookingItems.createdAt)),
    db
      .select({
        id: bookingItemTravelers.id,
        bookingItemId: bookingItemTravelers.bookingItemId,
        travelerId: bookingItemTravelers.travelerId,
        role: bookingItemTravelers.role,
        isPrimary: bookingItemTravelers.isPrimary,
      })
      .from(bookingItemTravelers)
      .innerJoin(bookingItems, eq(bookingItems.id, bookingItemTravelers.bookingItemId))
      .where(eq(bookingItems.bookingId, booking.id))
      .orderBy(asc(bookingItemTravelers.createdAt)),
    db
      .select()
      .from(bookingDocuments)
      .where(eq(bookingDocuments.bookingId, booking.id))
      .orderBy(asc(bookingDocuments.createdAt)),
    db
      .select()
      .from(bookingFulfillments)
      .where(eq(bookingFulfillments.bookingId, booking.id))
      .orderBy(asc(bookingFulfillments.createdAt)),
    listLegalDocumentsForBooking(db, booking.id, options),
    getFinanceDataForBooking(db, booking.id, options),
    getBookingBillingContact(db, booking.id, customerRecord),
  ])

  const itemLinksByItemId = new Map<
    string,
    Array<{
      id: string
      travelerId: string
      role: string
      isPrimary: boolean
    }>
  >()

  for (const link of itemParticipantLinks) {
    const existing = itemLinksByItemId.get(link.bookingItemId) ?? []
    existing.push({
      id: link.id,
      travelerId: link.travelerId,
      role: link.role,
      isPrimary: link.isPrimary,
    })
    itemLinksByItemId.set(link.bookingItemId, existing)
  }

  const unifiedDocuments: CustomerPortalBookingDocument[] = [
    ...documents.map((document: (typeof documents)[number]) => ({
      id: document.id,
      source: "booking_document" as const,
      travelerId: document.travelerId ?? null,
      type: document.type,
      fileName: document.fileName,
      fileUrl: document.fileUrl,
      mimeType: null,
      reference: null,
    })),
    ...legalDocuments,
    ...financeData.portalDocuments,
  ]

  const financials: CustomerPortalBookingFinancials = {
    documents: financeData.documents,
    payments: financeData.payments,
  }

  const travelerParticipants = participants.filter((participant: (typeof participants)[number]) =>
    ["traveler", "occupant", "other"].includes(participant.participantType),
  )

  return customerPortalBookingDetailSchema.parse({
    bookingId: booking.id,
    bookingNumber: booking.bookingNumber,
    status: booking.status,
    sellCurrency: booking.sellCurrency,
    sellAmountCents: booking.sellAmountCents ?? null,
    startDate: normalizeDate(booking.startDate),
    endDate: normalizeDate(booking.endDate),
    pax: booking.pax ?? null,
    confirmedAt: normalizeDateTime(booking.confirmedAt),
    cancelledAt: normalizeDateTime(booking.cancelledAt),
    completedAt: normalizeDateTime(booking.completedAt),
    travelers: travelerParticipants.map((participant: (typeof participants)[number]) => ({
      id: participant.id,
      participantType: participant.participantType,
      firstName: participant.firstName,
      lastName: participant.lastName,
      isPrimary: participant.isPrimary,
    })),
    items: items.map((item: (typeof items)[number]) => ({
      id: item.id,
      title: item.title,
      description: item.description ?? null,
      itemType: item.itemType,
      status: item.status,
      serviceDate: normalizeDate(item.serviceDate),
      startsAt: normalizeDateTime(item.startsAt),
      endsAt: normalizeDateTime(item.endsAt),
      quantity: item.quantity,
      sellCurrency: item.sellCurrency,
      unitSellAmountCents: item.unitSellAmountCents ?? null,
      totalSellAmountCents: item.totalSellAmountCents ?? null,
      notes: item.notes ?? null,
      travelerLinks: itemLinksByItemId.get(item.id) ?? [],
    })),
    billingContact,
    documents: unifiedDocuments,
    financials,
    fulfillments: fulfillments.map((fulfillment: (typeof fulfillments)[number]) => ({
      id: fulfillment.id,
      bookingItemId: fulfillment.bookingItemId ?? null,
      travelerId: fulfillment.travelerId ?? null,
      fulfillmentType: fulfillment.fulfillmentType,
      deliveryChannel: fulfillment.deliveryChannel,
      status: fulfillment.status,
      artifactUrl: fulfillment.artifactUrl ?? null,
    })),
  })
}

export const publicCustomerPortalService = {
  async getProfile(db: PostgresJsDatabase, userId: string): Promise<CustomerPortalProfile | null> {
    return this.getProfileWithOptions(db, userId)
  },

  async getProfileWithOptions(
    db: PostgresJsDatabase,
    userId: string,
    options?: CustomerPortalServiceOptions,
  ): Promise<CustomerPortalProfile | null> {
    const [authProfile, customerRecord] = await Promise.all([
      getAuthProfileRow(db, userId),
      getCustomerRecord(db, userId),
    ])

    if (!authProfile) {
      return null
    }

    const linkedPerson = await getLinkedPersonPiiRow(db, userId)
    const [accessibility, dietary, loyalty, insurance] = await Promise.all([
      decryptProfileBlob(linkedPerson?.accessibilityEncrypted, options),
      decryptProfileBlob(linkedPerson?.dietaryEncrypted, options),
      decryptProfileBlob(linkedPerson?.loyaltyEncrypted, options),
      decryptProfileBlob(linkedPerson?.insuranceEncrypted, options),
    ])
    const billingAddress = customerRecord?.billingAddress ?? null

    return {
      userId: authProfile.id,
      email: authProfile.email,
      phoneNumber: authProfile.phoneNumber,
      emailVerified: authProfile.emailVerified,
      firstName: authProfile.firstName ?? null,
      middleName: deriveMiddleName(authProfile.name, authProfile.firstName, authProfile.lastName),
      lastName: authProfile.lastName ?? null,
      avatarUrl: authProfile.avatarUrl ?? authProfile.image ?? null,
      locale: authProfile.locale ?? "en",
      timezone: authProfile.timezone ?? null,
      seatingPreference: authProfile.seatingPreference ?? null,
      dateOfBirth: customerRecord?.dateOfBirth ?? null,
      address: billingAddress
        ? {
            country: billingAddress.country,
            state: billingAddress.region,
            city: billingAddress.city,
            postalCode: billingAddress.postalCode,
            addressLine1: billingAddress.line1,
            addressLine2: billingAddress.line2,
          }
        : null,
      accessibility,
      dietary,
      loyalty,
      insurance,
      marketingConsent: authProfile.marketingConsent ?? false,
      marketingConsentAt: normalizeDateTime(authProfile.marketingConsentAt),
      marketingConsentSource: authProfile.marketingConsentSource ?? null,
      notificationDefaults:
        (authProfile.notificationDefaults as Record<string, unknown> | null) ?? null,
      uiPrefs: (authProfile.uiPrefs as Record<string, unknown> | null) ?? null,
      customerRecord,
    }
  },

  async updateProfile(
    db: PostgresJsDatabase,
    userId: string,
    input: UpdateCustomerPortalProfileInput,
  ): Promise<
    { profile: CustomerPortalProfile } | { error: "not_found" | "customer_record_required" }
  > {
    return this.updateProfileWithOptions(db, userId, input)
  },

  async updateProfileWithOptions(
    db: PostgresJsDatabase,
    userId: string,
    input: UpdateCustomerPortalProfileInput,
    options?: CustomerPortalServiceOptions,
  ): Promise<
    { profile: CustomerPortalProfile } | { error: "not_found" | "customer_record_required" }
  > {
    const authProfile = await getAuthProfileRow(db, userId)
    if (!authProfile) {
      return { error: "not_found" }
    }

    const customerRecordId = await resolveLinkedCustomerRecordId(db, userId)
    if (input.customerRecord && !customerRecordId) {
      return { error: "customer_record_required" }
    }

    const existingMiddleName = deriveMiddleName(
      authProfile.name,
      authProfile.firstName,
      authProfile.lastName,
    )
    const nextFirstName = input.firstName ?? authProfile.firstName ?? null
    const nextMiddleName = input.middleName ?? existingMiddleName
    const nextLastName = input.lastName ?? authProfile.lastName ?? null
    const nextDisplayName = [nextFirstName, nextMiddleName, nextLastName]
      .filter(Boolean)
      .join(" ")
      .trim()
    const nextMarketingConsent = resolveMarketingConsentState({
      currentConsent: authProfile.marketingConsent,
      currentConsentAt: authProfile.marketingConsentAt,
      currentConsentSource: authProfile.marketingConsentSource,
      nextConsent: input.marketingConsent,
      nextConsentSource: input.marketingConsentSource,
    })

    const nextDateOfBirth = input.dateOfBirth !== undefined ? input.dateOfBirth : undefined
    const nextAddressRecord =
      input.address !== undefined
        ? {
            billingAddress: {
              line1: input.address.addressLine1,
              line2: input.address.addressLine2,
              city: input.address.city,
              region: input.address.state,
              postalCode: input.address.postalCode,
              country: input.address.country,
            },
          }
        : undefined

    await db
      .insert(customerAuthProfilesTable)
      .values({
        id: userId,
        firstName: nextFirstName,
        lastName: nextLastName,
        avatarUrl: input.avatarUrl ?? authProfile.avatarUrl ?? authProfile.image ?? null,
        locale: input.locale ?? authProfile.locale ?? "en",
        timezone: input.timezone !== undefined ? input.timezone : (authProfile.timezone ?? null),
        seatingPreference:
          input.seatingPreference !== undefined
            ? input.seatingPreference
            : (authProfile.seatingPreference ?? null),
        marketingConsent: nextMarketingConsent.marketingConsent,
        marketingConsentAt: nextMarketingConsent.marketingConsentAt,
        marketingConsentSource: nextMarketingConsent.marketingConsentSource,
        notificationDefaults:
          input.notificationDefaults !== undefined
            ? input.notificationDefaults
            : ((authProfile.notificationDefaults as Record<string, unknown> | null) ?? {}),
        uiPrefs:
          input.uiPrefs !== undefined
            ? input.uiPrefs
            : ((authProfile.uiPrefs as Record<string, unknown> | null) ?? {}),
      })
      .onConflictDoUpdate({
        target: customerAuthProfilesTable.id,
        set: {
          firstName: nextFirstName,
          lastName: nextLastName,
          avatarUrl: input.avatarUrl ?? authProfile.avatarUrl ?? authProfile.image ?? null,
          locale: input.locale ?? authProfile.locale ?? "en",
          timezone: input.timezone !== undefined ? input.timezone : (authProfile.timezone ?? null),
          seatingPreference:
            input.seatingPreference !== undefined
              ? input.seatingPreference
              : (authProfile.seatingPreference ?? null),
          marketingConsent: nextMarketingConsent.marketingConsent,
          marketingConsentAt: nextMarketingConsent.marketingConsentAt,
          marketingConsentSource: nextMarketingConsent.marketingConsentSource,
          notificationDefaults:
            input.notificationDefaults !== undefined
              ? input.notificationDefaults
              : ((authProfile.notificationDefaults as Record<string, unknown> | null) ?? {}),
          uiPrefs:
            input.uiPrefs !== undefined
              ? input.uiPrefs
              : ((authProfile.uiPrefs as Record<string, unknown> | null) ?? {}),
          updatedAt: new Date(),
        },
      })

    const piiUpdates: Partial<{
      accessibilityEncrypted: { enc: string } | null
      dietaryEncrypted: { enc: string } | null
      loyaltyEncrypted: { enc: string } | null
      insuranceEncrypted: { enc: string } | null
    }> = {}
    if (input.accessibility !== undefined) {
      const enc = await encryptProfileBlob(input.accessibility, options)
      if (enc !== undefined) piiUpdates.accessibilityEncrypted = enc
    }
    if (input.dietary !== undefined) {
      const enc = await encryptProfileBlob(input.dietary, options)
      if (enc !== undefined) piiUpdates.dietaryEncrypted = enc
    }
    if (input.loyalty !== undefined) {
      const enc = await encryptProfileBlob(input.loyalty, options)
      if (enc !== undefined) piiUpdates.loyaltyEncrypted = enc
    }
    if (input.insurance !== undefined) {
      const enc = await encryptProfileBlob(input.insurance, options)
      if (enc !== undefined) piiUpdates.insuranceEncrypted = enc
    }
    if (Object.keys(piiUpdates).length > 0) {
      const personId = await ensureLinkedPerson(db, userId, authProfile)
      // The columns are relationships'; the portal keeps only the encryption seam.
      await relationshipsService.updatePersonEncryptedProfile(db, personId, piiUpdates)
    }

    await db
      .update(customerAuthUser)
      .set({
        name: nextDisplayName || authProfile.name,
        image: input.avatarUrl !== undefined ? input.avatarUrl : (authProfile.image ?? null),
        updatedAt: new Date(),
      })
      .where(eq(customerAuthUser.id, userId))

    if (customerRecordId) {
      const nextCustomerRecord =
        input.customerRecord !== undefined ||
        nextDateOfBirth !== undefined ||
        nextAddressRecord !== undefined
          ? {
              ...(input.customerRecord ?? {}),
              ...(nextDateOfBirth !== undefined ? { dateOfBirth: nextDateOfBirth } : {}),
              ...(nextAddressRecord ?? {}),
            }
          : undefined

      if (nextCustomerRecord || input.firstName !== undefined || input.lastName !== undefined) {
        if (nextCustomerRecord?.billingAddress !== undefined) {
          await upsertCustomerBillingAddress(
            db,
            customerRecordId,
            nextCustomerRecord.billingAddress,
          )
        }

        await relationshipsService.updatePerson(db, customerRecordId, {
          ...(input.firstName !== undefined ? { firstName: input.firstName ?? "" } : {}),
          ...(input.lastName !== undefined ? { lastName: input.lastName ?? "" } : {}),
          ...(nextCustomerRecord?.preferredLanguage !== undefined
            ? { preferredLanguage: nextCustomerRecord.preferredLanguage }
            : {}),
          ...(nextCustomerRecord?.preferredCurrency !== undefined
            ? { preferredCurrency: nextCustomerRecord.preferredCurrency }
            : {}),
          ...(nextCustomerRecord?.dateOfBirth !== undefined
            ? { dateOfBirth: nextCustomerRecord.dateOfBirth }
            : {}),
          ...(nextCustomerRecord?.phone !== undefined ? { phone: nextCustomerRecord.phone } : {}),
        })
      }
    }

    const profile = await this.getProfileWithOptions(db, userId, options)
    if (!profile) {
      return { error: "not_found" }
    }

    return { profile }
  },

  async bootstrap(
    db: PostgresJsDatabase,
    userId: string,
    input: BootstrapCustomerPortalInput,
  ): Promise<
    | BootstrapCustomerPortalResult
    | { error: "not_found" | "customer_record_not_found" | "customer_record_claimed" }
  > {
    const authProfile = await getAuthProfileRow(db, userId)
    if (!authProfile) {
      return { error: "not_found" }
    }

    const linkedCustomerRecordId = await resolveLinkedCustomerRecordId(db, userId)
    if (linkedCustomerRecordId) {
      const profile = await this.getProfile(db, userId)
      return {
        status: "already_linked",
        profile,
        candidates: [],
      }
    }
    if (authProfile.relationshipPersonId) {
      // A non-null durable link that points at an archived/missing Person is
      // invalid state, not permission to silently create and retarget identity.
      return { error: "customer_record_not_found" }
    }

    // Phone-only signups have no email; email-keyed candidate
    // matching simply finds zero candidates and the path falls
    // through to creating a fresh `crm.people` row when allowed.
    const normalizedEmail =
      authProfile.emailVerified && authProfile.email ? normalizeEmail(authProfile.email) : null
    const normalizedPhone =
      authProfile.phoneNumberVerified && authProfile.phoneNumber
        ? normalizePhone(authProfile.phoneNumber)
        : null
    const verifiedCandidateLists = await Promise.all([
      normalizedEmail ? listCustomerRecordCandidatesByEmail(db, normalizedEmail) : [],
      normalizedPhone ? listCustomerRecordCandidatesByPhone(db, normalizedPhone) : [],
    ])
    const verifiedCandidatesById = new Map(
      verifiedCandidateLists.flat().map((candidate) => [candidate.id, candidate]),
    )
    const nextFirstName =
      input.firstName ?? authProfile.firstName ?? authProfile.name.split(" ")[0] ?? "Customer"
    const nextLastName =
      input.lastName ?? authProfile.lastName ?? authProfile.name.split(" ").slice(1).join(" ") ?? ""

    if (input.customerRecordId) {
      try {
        await db.transaction(async (tx) => {
          const txDb = tx as PostgresJsDatabase
          const currentAuthProfile = await getAuthProfileRow(txDb, userId)
          if (!currentAuthProfile) throw new Error("customer_record_not_found")

          const currentEmail =
            currentAuthProfile.emailVerified && currentAuthProfile.email
              ? normalizeEmail(currentAuthProfile.email)
              : null
          const currentPhone =
            currentAuthProfile.phoneNumberVerified && currentAuthProfile.phoneNumber
              ? normalizePhone(currentAuthProfile.phoneNumber)
              : null
          const currentCandidates = await Promise.all([
            currentEmail ? listCustomerRecordCandidatesByEmail(txDb, currentEmail) : [],
            currentPhone ? listCustomerRecordCandidatesByPhone(txDb, currentPhone) : [],
          ])
          const candidate = currentCandidates
            .flat()
            .find((row) => row.id === input.customerRecordId)
          if (!candidate?.linkable || candidate.claimedByAnotherUser) {
            throw new Error("customer_record_not_found")
          }

          const person = await relationshipsService.getPersonById(txDb, input.customerRecordId!)
          if (person?.status !== "active" || person.archivedAt) {
            throw new Error("customer_record_not_found")
          }

          if (
            !(await claimPersonalBuyerPerson(txDb, userId, input.customerRecordId!, {
              requireVerifiedIdentityContact: true,
            }))
          ) {
            throw new Error("customer_record_claimed")
          }

          const updated = await relationshipsService.updatePerson(txDb, input.customerRecordId!, {
            ...(input.firstName !== undefined ? { firstName: nextFirstName } : {}),
            ...(input.lastName !== undefined ? { lastName: nextLastName } : {}),
            ...(input.customerRecord?.preferredLanguage !== undefined
              ? { preferredLanguage: input.customerRecord.preferredLanguage }
              : {}),
            ...(input.customerRecord?.preferredCurrency !== undefined
              ? { preferredCurrency: input.customerRecord.preferredCurrency }
              : {}),
            ...(input.customerRecord?.dateOfBirth !== undefined
              ? { dateOfBirth: input.customerRecord.dateOfBirth }
              : {}),
            ...(input.customerRecord?.phone !== undefined
              ? { phone: input.customerRecord.phone }
              : {}),
          })
          if (!updated) throw new Error("customer_record_not_found")

          if (input.customerRecord?.billingAddress) {
            await upsertCustomerBillingAddress(
              txDb,
              input.customerRecordId!,
              input.customerRecord.billingAddress,
            )
          }
          await persistBootstrapMarketingConsent(txDb, userId, currentAuthProfile, input)
        })
      } catch (error) {
        if ((error as Error).message === "customer_record_not_found") {
          return { error: "customer_record_not_found" }
        }
        if ((error as Error).message === "customer_record_claimed") {
          return { error: "customer_record_claimed" }
        }
        throw error
      }

      const profile = await this.getProfile(db, userId)
      return {
        status: "linked_existing_customer",
        profile,
        candidates: [],
      }
    }

    const customerCandidates = Array.from(verifiedCandidatesById.values())
    const selectableCandidates = customerCandidates.filter(
      (candidate) => !candidate.claimedByAnotherUser,
    )

    if (selectableCandidates.length > 0) {
      await persistBootstrapMarketingConsent(db, userId, authProfile, input)
      return {
        status: "customer_selection_required",
        profile: null,
        candidates: selectableCandidates,
      }
    }

    if (!input.createCustomerIfMissing) {
      await persistBootstrapMarketingConsent(db, userId, authProfile, input)
      return {
        status: "customer_selection_required",
        profile: null,
        candidates: [],
      }
    }

    try {
      await db.transaction(async (tx) => {
        const txDb = tx as PostgresJsDatabase
        const created = await relationshipsService.createPerson(txDb, {
          firstName: nextFirstName,
          lastName: nextLastName || "Customer",
          preferredLanguage: input.customerRecord?.preferredLanguage ?? authProfile.locale ?? null,
          preferredCurrency: input.customerRecord?.preferredCurrency ?? null,
          dateOfBirth: input.customerRecord?.dateOfBirth ?? null,
          relation: "client",
          status: "active",
          tags: [],
          email: normalizedEmail,
          phone: input.customerRecord?.phone ?? null,
          website: null,
        })
        if (!created) throw new Error("customer_record_create_failed")
        if (!(await claimPersonalBuyerPerson(txDb, userId, created.id))) {
          throw new Error("customer_record_claim_failed")
        }
        if (input.customerRecord?.billingAddress) {
          await upsertCustomerBillingAddress(txDb, created.id, input.customerRecord.billingAddress)
        }
        await persistBootstrapMarketingConsent(txDb, userId, authProfile, input)
        return created.id
      })
    } catch (error) {
      if ((error as Error).message === "customer_record_create_failed") {
        return { error: "not_found" }
      }
      if ((error as Error).message === "customer_record_claim_failed") {
        return { error: "customer_record_claimed" }
      }
      throw error
    }

    const profile = await this.getProfile(db, userId)
    return {
      status: "created_customer",
      profile,
      candidates: [],
    }
  },

  async listCompanions(db: PostgresJsDatabase, userId: string): Promise<CustomerPortalCompanion[]> {
    const personId = await resolveLinkedCustomerRecordId(db, userId)
    if (!personId) {
      return []
    }

    const rows = await identityService.listNamedContactsForEntity(db, "person", personId)
    return rows
      .filter(
        (row) =>
          ((row.metadata as Record<string, unknown> | null)?.kind ?? null) ===
          companionMetadataKind,
      )
      .map(toCustomerCompanion)
  },

  async importBookingTravelersAsCompanions(
    db: PostgresJsDatabase,
    buyer: PersonalCustomerBuyerContext,
    input: ImportCustomerPortalBookingTravelersInput,
  ): Promise<ImportCustomerPortalBookingTravelersResult | null> {
    const userId = buyer.userId
    const authProfile = await getAuthProfileRow(db, userId)
    const personId = await resolveLinkedCustomerRecordId(db, userId)
    if (!authProfile || !personId) {
      return null
    }

    const accessibleBookingIds = await getAccessibleBookingIds(db, {
      buyer,
      email: authProfile.email,
    })
    const targetBookingIds =
      input.bookingIds?.filter((bookingId) => accessibleBookingIds.includes(bookingId)) ??
      accessibleBookingIds

    if (targetBookingIds.length === 0) {
      return { created: [], skippedCount: 0 }
    }

    const [existingCompanionRows, participantRows, staffAssignmentRows] = await Promise.all([
      identityService.listNamedContactsForEntity(db, "person", personId),
      db
        .select()
        .from(bookingTravelers)
        .where(inArray(bookingTravelers.bookingId, targetBookingIds))
        .orderBy(asc(bookingTravelers.createdAt)),
      db
        .select()
        .from(bookingStaffAssignments)
        .where(inArray(bookingStaffAssignments.bookingId, targetBookingIds))
        .orderBy(asc(bookingStaffAssignments.createdAt)),
    ])

    const existingKeys = new Set(
      existingCompanionRows
        .filter(
          (row) =>
            ((row.metadata as Record<string, unknown> | null)?.kind ?? null) ===
            companionMetadataKind,
        )
        .flatMap((row) =>
          getCompanionLookupKeys({
            name: row.name,
            email: row.email,
            phone: row.phone,
          }),
        ),
    )

    let skippedCount = 0
    const created: CustomerPortalCompanion[] = []
    const distinctStaffAssignmentKeys = new Set<string>()

    for (const assignment of staffAssignmentRows) {
      distinctStaffAssignmentKeys.add(
        JSON.stringify([
          assignment.bookingId,
          assignment.personId ?? null,
          assignment.firstName,
          assignment.lastName,
          assignment.email ?? null,
          assignment.phone ?? null,
        ]),
      )
    }
    skippedCount += distinctStaffAssignmentKeys.size

    for (const participant of participantRows) {
      const name = `${participant.firstName} ${participant.lastName}`.trim()
      if (!name) {
        skippedCount += 1
        continue
      }

      const email = normalizeNullableString(participant.email)
      const phone = normalizeNullableString(participant.phone)
      const lookupKeys = getCompanionLookupKeys({ name, email, phone })

      if (lookupKeys.some((key) => existingKeys.has(key))) {
        skippedCount += 1
        continue
      }

      const row = await identityService.createNamedContact(db, {
        entityType: "person",
        entityId: personId,
        role: "general",
        name,
        title: null,
        email,
        phone,
        isPrimary: false,
        notes: normalizeNullableString(participant.notes),
        metadata: buildStoredCompanionMetadata({
          metadata: {
            source: "booking_participant_import",
            bookingId: participant.bookingId,
            travelerId: participant.id,
            participantType: participant.participantType,
            travelerCategory: participant.travelerCategory ?? null,
          },
          person: {
            firstName: participant.firstName,
            lastName: participant.lastName,
          },
        }),
      })

      if (!row) {
        skippedCount += 1
        continue
      }

      created.push(toCustomerCompanion(row))
      for (const key of lookupKeys) {
        existingKeys.add(key)
      }
    }

    return { created, skippedCount }
  },

  async importBookingParticipantsAsCompanions(
    db: PostgresJsDatabase,
    buyer: PersonalCustomerBuyerContext,
    input: ImportCustomerPortalBookingTravelersInput,
  ): Promise<ImportCustomerPortalBookingTravelersResult | null> {
    return this.importBookingTravelersAsCompanions(db, buyer, input)
  },

  async createCompanion(
    db: PostgresJsDatabase,
    userId: string,
    input: CreateCustomerPortalCompanionInput,
  ): Promise<CustomerPortalCompanion | null> {
    const personId = await resolveLinkedCustomerRecordId(db, userId)
    if (!personId) {
      return null
    }

    const row = await identityService.createNamedContact(db, {
      entityType: "person",
      entityId: personId,
      role: input.role,
      name: input.name,
      title: input.title ?? null,
      email: normalizeNullableString(input.email),
      phone: normalizeNullableString(input.phone),
      isPrimary: input.isPrimary,
      notes: normalizeNullableString(input.notes),
      metadata: buildStoredCompanionMetadata({
        metadata: (input.metadata as Record<string, unknown> | null) ?? undefined,
        typeKey: input.typeKey,
        person: input.person,
      }),
    })

    return row ? toCustomerCompanion(row) : null
  },

  async updateCompanion(
    db: PostgresJsDatabase,
    userId: string,
    companionId: string,
    input: UpdateCustomerPortalCompanionInput,
  ): Promise<CustomerPortalCompanion | null | "forbidden"> {
    const personId = await resolveLinkedCustomerRecordId(db, userId)
    if (!personId) {
      return null
    }

    const existing = await identityService.getNamedContactById(db, companionId)
    if (
      existing?.entityType !== "person" ||
      existing.entityId !== personId ||
      ((existing.metadata as Record<string, unknown> | null)?.kind ?? null) !==
        companionMetadataKind
    ) {
      return "forbidden"
    }

    const row = await identityService.updateNamedContact(db, companionId, {
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.email !== undefined ? { email: normalizeNullableString(input.email) } : {}),
      ...(input.phone !== undefined ? { phone: normalizeNullableString(input.phone) } : {}),
      ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
      ...(input.notes !== undefined ? { notes: normalizeNullableString(input.notes) } : {}),
      ...(input.metadata !== undefined || input.typeKey !== undefined || input.person !== undefined
        ? {
            metadata: buildStoredCompanionMetadata({
              existingMetadata: (existing.metadata as Record<string, unknown> | null) ?? undefined,
              ...(input.metadata !== undefined
                ? { metadata: (input.metadata as Record<string, unknown> | null) ?? null }
                : {}),
              ...(input.typeKey !== undefined ? { typeKey: input.typeKey } : {}),
              ...(input.person !== undefined ? { person: input.person } : {}),
            }),
          }
        : {}),
    })

    return row ? toCustomerCompanion(row) : null
  },

  async deleteCompanion(
    db: PostgresJsDatabase,
    userId: string,
    companionId: string,
  ): Promise<"deleted" | "not_found" | "forbidden"> {
    const personId = await resolveLinkedCustomerRecordId(db, userId)
    if (!personId) {
      return "not_found"
    }

    const existing = await identityService.getNamedContactById(db, companionId)
    if (!existing) {
      return "not_found"
    }

    if (
      existing.entityType !== "person" ||
      existing.entityId !== personId ||
      ((existing.metadata as Record<string, unknown> | null)?.kind ?? null) !==
        companionMetadataKind
    ) {
      return "forbidden"
    }

    await identityService.deleteNamedContact(db, companionId)
    return "deleted"
  },

  async listBookings(
    db: PostgresJsDatabase,
    buyer: CustomerBuyerContext,
  ): Promise<CustomerPortalBookingSummary[] | null> {
    const authProfile = await getAuthProfileRow(db, buyer.userId)
    if (!authProfile) {
      return null
    }

    const bookingIds = await getAccessibleBookingIds(db, {
      buyer,
      email: authProfile.emailVerified ? authProfile.email : null,
    })
    if (bookingIds.length === 0) {
      return []
    }

    const [bookingRows, participantRows, itemRows, invoiceRows] = await Promise.all([
      db
        .select()
        .from(bookings)
        .where(inArray(bookings.id, bookingIds))
        .orderBy(desc(bookings.createdAt)),
      db
        .select()
        .from(bookingTravelers)
        .where(inArray(bookingTravelers.bookingId, bookingIds))
        .orderBy(asc(bookingTravelers.createdAt)),
      db
        .select({
          bookingId: bookingItems.bookingId,
          title: bookingItems.title,
          itemType: bookingItems.itemType,
          createdAt: bookingItems.createdAt,
        })
        .from(bookingItems)
        .where(inArray(bookingItems.bookingId, bookingIds))
        .orderBy(asc(bookingItems.createdAt)),
      db
        .select({
          bookingId: invoices.bookingId,
          invoiceType: invoices.invoiceType,
          status: invoices.status,
          paidCents: invoices.paidCents,
          balanceDueCents: invoices.balanceDueCents,
          createdAt: invoices.createdAt,
        })
        .from(invoices)
        .where(inArray(invoices.bookingId, bookingIds))
        .orderBy(desc(invoices.createdAt)),
    ])

    const participantsByBookingId = new Map<string, typeof participantRows>()
    for (const participant of participantRows) {
      const bucket = participantsByBookingId.get(participant.bookingId) ?? []
      bucket.push(participant)
      participantsByBookingId.set(participant.bookingId, bucket)
    }

    const itemsByBookingId = new Map<string, typeof itemRows>()
    for (const item of itemRows) {
      const bucket = itemsByBookingId.get(item.bookingId) ?? []
      bucket.push(item)
      itemsByBookingId.set(item.bookingId, bucket)
    }

    const invoicesByBookingId = new Map<string, typeof invoiceRows>()
    for (const invoice of invoiceRows) {
      const bucket = invoicesByBookingId.get(invoice.bookingId) ?? []
      bucket.push(invoice)
      invoicesByBookingId.set(invoice.bookingId, bucket)
    }

    return bookingRows.map((booking) => {
      const participants = participantsByBookingId.get(booking.id) ?? []
      const items = itemsByBookingId.get(booking.id) ?? []
      const bookingInvoices = invoicesByBookingId.get(booking.id) ?? []
      const primaryTraveler =
        participants.find((participant) => participant.isPrimary) ?? participants[0] ?? null

      return {
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        sellCurrency: booking.sellCurrency,
        sellAmountCents: booking.sellAmountCents ?? null,
        productTitle: selectBookingSummaryProductTitle(items),
        paymentStatus: deriveBookingSummaryPaymentStatus(
          bookingInvoices,
          booking.sellAmountCents ?? null,
        ),
        startDate: normalizeDate(booking.startDate),
        endDate: normalizeDate(booking.endDate),
        pax: booking.pax ?? null,
        confirmedAt: normalizeDateTime(booking.confirmedAt),
        completedAt: normalizeDateTime(booking.completedAt),
        travelerCount: participants.length,
        primaryTravelerName: primaryTraveler
          ? `${primaryTraveler.firstName} ${primaryTraveler.lastName}`.trim()
          : null,
      }
    })
  },

  async getBooking(
    db: PostgresJsDatabase,
    buyer: CustomerBuyerContext,
    bookingId: string,
    options: CustomerPortalServiceOptions = {},
  ): Promise<CustomerPortalBookingDetail | null> {
    const authProfile = await getAuthProfileRow(db, buyer.userId)
    if (!authProfile) {
      return null
    }

    const [linkedPersonId, customerRecord] =
      buyer.kind === "personal"
        ? await Promise.all([
            resolveLinkedCustomerRecordId(db, buyer.userId),
            getCustomerRecord(db, buyer.userId),
          ])
        : [null, null]
    const authEmail =
      authProfile.emailVerified && authProfile.email ? authProfile.email.trim().toLowerCase() : null
    const canAccess = await hasBookingAccess({
      db,
      bookingId,
      buyer,
      authEmail,
      linkedPersonId,
    })

    if (!canAccess) {
      return null
    }

    return buildBookingDetail(db, bookingId, customerRecord, options)
  },

  async listBookingDocuments(
    db: PostgresJsDatabase,
    buyer: CustomerBuyerContext,
    bookingId: string,
    options: CustomerPortalServiceOptions = {},
  ) {
    const detail = await this.getBooking(db, buyer, bookingId, options)
    return detail?.documents ?? null
  },

  async getBookingBillingContact(
    db: PostgresJsDatabase,
    buyer: CustomerBuyerContext,
    bookingId: string,
  ) {
    const authProfile = await getAuthProfileRow(db, buyer.userId)
    if (!authProfile) {
      return null
    }

    const [linkedPersonId, customerRecord] =
      buyer.kind === "personal"
        ? await Promise.all([
            resolveLinkedCustomerRecordId(db, buyer.userId),
            getCustomerRecord(db, buyer.userId),
          ])
        : [null, null]

    const canAccess = await hasBookingAccess({
      db,
      bookingId,
      buyer,
      authEmail:
        authProfile.emailVerified && authProfile.email
          ? authProfile.email.trim().toLowerCase()
          : null,
      linkedPersonId,
    })

    if (!canAccess) {
      return null
    }

    return getBookingBillingContact(db, bookingId, customerRecord)
  },

  // ── Identity documents ────────────────────────────────────────────────
  // CRUD over `crm.person_documents` scoped to the auth user's linked
  // person. Auto-creates the linked person row on first write so
  // phone-only / metadata-light customers can save documents without
  // a separate bootstrap step.

  async listMyDocuments(
    db: PostgresJsDatabase,
    userId: string,
    options?: CustomerPortalServiceOptions,
  ) {
    return getLinkedPersonDocuments(db, userId, options)
  },

  async createMyDocument(
    db: PostgresJsDatabase,
    userId: string,
    input: {
      type: WireDocumentType
      number?: string | null
      issuingAuthority?: string | null
      issuingCountry?: string | null
      issueDate?: string | null
      expiryDate?: string | null
      attachmentId?: string | null
      isPrimary?: boolean
      notes?: string | null
    },
    options?: CustomerPortalServiceOptions,
  ) {
    const authProfile = await getAuthProfileRow(db, userId)
    if (!authProfile) return null

    const personId = await ensureLinkedPerson(db, userId, authProfile)
    const numberEncrypted = await encryptDocumentNumber(input.number ?? null, options)

    const payload: CreatePersonDocumentInput = {
      type: toCrmDocumentType(input.type),
      issuingAuthority: input.issuingAuthority ?? null,
      issuingCountry: input.issuingCountry ?? null,
      issueDate: input.issueDate ?? null,
      expiryDate: input.expiryDate ?? null,
      attachmentId: input.attachmentId ?? null,
      isPrimary: input.isPrimary ?? false,
      notes: input.notes ?? null,
    }
    if (numberEncrypted !== undefined) {
      payload.numberEncrypted = numberEncrypted
    }

    const row = await relationshipsService.createPersonDocument(db, personId, payload)
    return row ? projectPersonDocumentToWire(row, options) : null
  },

  async updateMyDocument(
    db: PostgresJsDatabase,
    userId: string,
    documentId: string,
    input: {
      type?: WireDocumentType
      number?: string | null
      issuingAuthority?: string | null
      issuingCountry?: string | null
      issueDate?: string | null
      expiryDate?: string | null
      attachmentId?: string | null
      isPrimary?: boolean
      notes?: string | null
    },
    options?: CustomerPortalServiceOptions,
  ) {
    const linkedPersonId = await resolveLinkedCustomerRecordId(db, userId)
    if (!linkedPersonId) return null

    const existing = await relationshipsService.getPersonDocument(db, documentId)
    if (!existing || existing.personId !== linkedPersonId) return null

    const numberEncrypted =
      input.number !== undefined ? await encryptDocumentNumber(input.number, options) : undefined

    const update: UpdatePersonDocumentInput = {}
    if (input.type !== undefined) update.type = toCrmDocumentType(input.type)
    if (input.issuingAuthority !== undefined) update.issuingAuthority = input.issuingAuthority
    if (input.issuingCountry !== undefined) update.issuingCountry = input.issuingCountry
    if (input.issueDate !== undefined) update.issueDate = input.issueDate
    if (input.expiryDate !== undefined) update.expiryDate = input.expiryDate
    if (input.attachmentId !== undefined) update.attachmentId = input.attachmentId
    if (input.isPrimary !== undefined) update.isPrimary = input.isPrimary
    if (input.notes !== undefined) update.notes = input.notes
    if (numberEncrypted !== undefined) update.numberEncrypted = numberEncrypted

    const row = await relationshipsService.updatePersonDocument(db, documentId, update)
    return row ? projectPersonDocumentToWire(row, options) : null
  },

  async deleteMyDocument(db: PostgresJsDatabase, userId: string, documentId: string) {
    const linkedPersonId = await resolveLinkedCustomerRecordId(db, userId)
    if (!linkedPersonId) return null

    const existing = await relationshipsService.getPersonDocument(db, documentId)
    if (!existing || existing.personId !== linkedPersonId) return null

    return relationshipsService.deletePersonDocument(db, documentId)
  },

  async setPrimaryMyDocument(
    db: PostgresJsDatabase,
    userId: string,
    documentId: string,
    options?: CustomerPortalServiceOptions,
  ) {
    const linkedPersonId = await resolveLinkedCustomerRecordId(db, userId)
    if (!linkedPersonId) return null

    const existing = await relationshipsService.getPersonDocument(db, documentId)
    if (!existing || existing.personId !== linkedPersonId) return null

    const row = await relationshipsService.setPrimaryPersonDocument(db, documentId)
    return row ? projectPersonDocumentToWire(row, options) : null
  },
}
