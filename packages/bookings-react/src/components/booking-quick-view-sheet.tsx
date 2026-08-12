// agent-quality: file-size exception -- owner: bookings-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
"use client"

import {
  type InvoiceAttachmentRecord,
  type InvoiceRecord,
  useAdminBookingPayments,
  useBookingPaymentSchedules,
  useInvoiceAttachments,
  useInvoices,
  useVoyantFinanceContext,
} from "@voyant-travel/finance-react"
import {
  type LegalContractAttachmentRecord,
  type LegalContractRecord,
  useLegalContractAttachments,
  useLegalContracts,
  useVoyantLegalContext,
} from "@voyant-travel/legal-react"
import { useOrganization, usePerson } from "@voyant-travel/relationships-react"
import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@voyant-travel/ui/components"
import {
  ArrowRight,
  Building2,
  Calendar,
  ChevronDown,
  CreditCard,
  ExternalLink,
  FileText,
  Globe,
  Languages,
  Mail,
  MessageSquare,
  Paperclip,
  Phone,
  ScrollText,
  StickyNote,
  User,
  Users,
} from "lucide-react"
import { Fragment, type ReactNode, useState } from "react"
import { useBookingsUiI18nOrDefault, useBookingsUiMessagesOrDefault } from "../i18n/index.js"
import {
  type BookingRecord,
  type BookingTravelerDocumentRecord,
  type BookingTravelerRecord,
  bookingStatusBadgeVariant,
  useBooking,
  useBookingTravelerDocuments,
  useRevealTraveler,
  useTravelers,
} from "../index.js"

export interface BookingQuickViewSheetProps {
  bookingId: string | null | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Wired to the "View full booking" footer button. Receives the booking
   * so the host can route to its detail page. When omitted, the footer
   * action is suppressed. */
  onViewFull?: (booking: BookingRecord) => void
  /** Optional locale override; defaults to the active i18n locale. */
  locale?: string
}

export function BookingQuickViewSheet({
  bookingId,
  open,
  onOpenChange,
  onViewFull,
  locale,
}: BookingQuickViewSheetProps) {
  const i18n = useBookingsUiI18nOrDefault()
  const messages = useBookingsUiMessagesOrDefault()
  const detail = messages.bookingDetailPage
  const quick = messages.bookingQuickViewSheet
  const resolvedLocale = locale ?? i18n.locale

  const query = useBooking(bookingId ?? undefined, {
    enabled: open && Boolean(bookingId),
  })
  const booking = query.data?.data ?? null
  // `isPending` stays true for disabled queries in @tanstack/react-query
  // v5, so opening the sheet with no `bookingId` would render an
  // indefinite loading state. Gate on an active fetch instead.
  const isLoading = Boolean(bookingId) && query.fetchStatus === "fetching" && !booking

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="data-[side=right]:w-full sm:max-w-md">
        <SheetHeader className="border-b">
          {booking ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <SheetTitle className="font-mono text-sm">{booking.bookingNumber}</SheetTitle>
                <Badge variant={bookingStatusBadgeVariant[booking.status]}>
                  {messages.common.bookingStatusLabels[booking.status] ?? booking.status}
                </Badge>
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatAmount(
                  booking.sellAmountCents,
                  booking.sellCurrency,
                  resolvedLocale,
                  detail.noValue,
                )}
              </div>
            </>
          ) : (
            <SheetTitle>{quick.loadingTitle}</SheetTitle>
          )}
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{messages.common.loading}</p>
          ) : !booking ? (
            <p className="text-sm text-muted-foreground">{detail.notFound}</p>
          ) : (
            <QuickViewBody booking={booking} locale={resolvedLocale} />
          )}
        </SheetBody>
        {onViewFull && booking ? (
          <SheetFooter>
            <Button type="button" className="w-full" onClick={() => onViewFull(booking)}>
              {quick.viewFullAction}
              <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function QuickViewBody({ booking, locale }: { booking: BookingRecord; locale: string }) {
  const messages = useBookingsUiMessagesOrDefault()
  const detail = messages.bookingDetailPage

  const dateRange = booking.startDate
    ? booking.endDate && booking.endDate !== booking.startDate
      ? `${formatDate(booking.startDate, locale, detail.noValue)} - ${formatDate(
          booking.endDate,
          locale,
          detail.noValue,
        )}`
      : formatDate(booking.startDate, locale, detail.noValue)
    : detail.tbd

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span>{dateRange}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span>
            {booking.pax != null
              ? `${booking.pax} ${messages.bookingQuickViewSheet.paxSuffix}`
              : detail.noValue}
          </span>
        </div>
      </div>

      <ContactSection booking={booking} />

      <TravelersSection bookingId={booking.id} expectedPax={booking.pax} locale={locale} />

      <PaymentsSection booking={booking} locale={locale} />

      <InvoicesSection booking={booking} />

      <PaymentScheduleSection booking={booking} locale={locale} />

      <ContractsSection bookingId={booking.id} />
    </div>
  )
}

function ContactSection({ booking }: { booking: BookingRecord }) {
  const messages = useBookingsUiMessagesOrDefault()
  const quick = messages.bookingQuickViewSheet
  // Source of truth for billing snapshot is the booking row itself —
  // those `contact_*` columns are stamped at create time and persist
  // even if the linked CRM record changes. Fall back to the live person
  // / organization for fields we don't snapshot (preferred language,
  // website).
  const person = usePerson(booking.personId ?? undefined, {
    enabled: Boolean(booking.personId),
  }).data
  const organization = useOrganization(booking.organizationId ?? undefined, {
    enabled: Boolean(booking.organizationId),
  }).data

  const name =
    [booking.contactFirstName, booking.contactLastName].filter(Boolean).join(" ") ||
    (person ? [person.firstName, person.lastName].filter(Boolean).join(" ") : "") ||
    organization?.name ||
    ""
  const email = booking.contactEmail ?? person?.email ?? null
  const phone = booking.contactPhone ?? person?.phone ?? null
  const language = booking.contactPreferredLanguage ?? person?.preferredLanguage ?? null
  const addressParts = [
    booking.contactAddressLine1,
    booking.contactAddressLine2,
    [booking.contactPostalCode, booking.contactCity].filter(Boolean).join(" ") || null,
    booking.contactRegion,
    booking.contactCountry,
  ].filter((part): part is string => Boolean(part))

  if (!name && !email && !phone && addressParts.length === 0 && !organization) return null

  return (
    <Section icon={<User className="h-3.5 w-3.5" />} label={quick.sectionPayer}>
      <div className="flex flex-col gap-1.5">
        {name ? <div className="text-sm font-medium">{name}</div> : null}
        {organization?.name && organization.name !== name ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{organization.name}</span>
          </div>
        ) : null}
        {email ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <a href={`mailto:${email}`} className="truncate hover:underline">
              {email}
            </a>
          </div>
        ) : null}
        {phone ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <a href={`tel:${phone}`} className="truncate hover:underline">
              {phone}
            </a>
          </div>
        ) : null}
        {language ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Languages className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate uppercase">{language}</span>
          </div>
        ) : null}
        {person?.website ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <a
              href={person.website}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate hover:underline"
            >
              {person.website}
            </a>
          </div>
        ) : null}
        {addressParts.length > 0 ? (
          <div className="text-xs text-muted-foreground">{addressParts.join(", ")}</div>
        ) : null}
      </div>
    </Section>
  )
}

function TravelersSection({
  bookingId,
  expectedPax,
  locale,
}: {
  bookingId: string
  expectedPax: number | null
  locale: string
}) {
  const messages = useBookingsUiMessagesOrDefault()
  const quick = messages.bookingQuickViewSheet
  const { data } = useTravelers(bookingId)
  const documentsQuery = useBookingTravelerDocuments(bookingId)
  const travelers = data?.data ?? []
  const documentsByTravelerId = new Map<string, BookingTravelerDocumentRecord[]>()
  // Booking-level documents (no `travelerId`) stay attached to the
  // booking rather than the travelers list — surfacing them per-traveler
  // would imply the wrong owner. We only group attachments that name a
  // specific traveler.
  for (const doc of documentsQuery.data?.data ?? []) {
    if (!doc.travelerId) continue
    const bucket = documentsByTravelerId.get(doc.travelerId) ?? []
    bucket.push(doc)
    documentsByTravelerId.set(doc.travelerId, bucket)
  }

  const counter =
    expectedPax != null ? `${travelers.length}/${expectedPax}` : String(travelers.length)

  return (
    <Section
      icon={<Users className="h-3.5 w-3.5" />}
      label={quick.sectionTravelers}
      count={counter}
    >
      {travelers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{quick.travelersEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {travelers.map((traveler) => (
            <TravelerCard
              key={traveler.id}
              bookingId={bookingId}
              traveler={traveler}
              documents={documentsByTravelerId.get(traveler.id) ?? []}
              locale={locale}
            />
          ))}
        </ul>
      )}
    </Section>
  )
}

function TravelerCard({
  bookingId,
  traveler,
  documents,
  locale,
}: {
  bookingId: string
  traveler: BookingTravelerRecord
  documents: BookingTravelerDocumentRecord[]
  locale: string
}) {
  const messages = useBookingsUiMessagesOrDefault()
  const quick = messages.bookingQuickViewSheet
  const reveal = quick.travelerReveal
  const [expanded, setExpanded] = useState(false)
  // The reveal endpoint audit-logs every call, so it must only fire
  // when the operator actively clicks "More info" — never on mount.
  const revealQuery = useRevealTraveler(bookingId, traveler.id, { enabled: expanded })
  const revealed = revealQuery.data?.data ?? null
  const travelDetails = revealed?.travelDetails ?? null

  const name = [traveler.firstName, traveler.lastName].filter(Boolean).join(" ").trim()
  const category = traveler.travelerCategory ?? null
  const categoryLabel = category
    ? (quick.travelerCategoryLabels[category as keyof typeof quick.travelerCategoryLabels] ??
      category)
    : null

  const revealRows: Array<{ label: string; value: ReactNode }> = []
  if (travelDetails) {
    if (travelDetails.dateOfBirth) {
      revealRows.push({
        label: reveal.dateOfBirth,
        value: formatDate(travelDetails.dateOfBirth, locale, ""),
      })
    }
    if (travelDetails.nationality) {
      revealRows.push({
        label: reveal.nationality,
        value: <span className="uppercase">{travelDetails.nationality}</span>,
      })
    }
    if (travelDetails.documentType) {
      revealRows.push({
        label: reveal.documentType,
        value: (
          <Badge variant="outline" className="text-[10px] uppercase">
            {travelDetails.documentType.replace(/_/g, " ")}
          </Badge>
        ),
      })
    }
    if (travelDetails.documentNumber) {
      revealRows.push({
        label: reveal.documentNumber,
        value: <span className="font-mono text-xs">{travelDetails.documentNumber}</span>,
      })
    }
    if (travelDetails.documentExpiry) {
      revealRows.push({
        label: reveal.documentExpiry,
        value: formatDate(travelDetails.documentExpiry, locale, ""),
      })
    }
    if (travelDetails.documentIssuingCountry) {
      revealRows.push({
        label: reveal.documentIssuingCountry,
        value: <span className="uppercase">{travelDetails.documentIssuingCountry}</span>,
      })
    }
    if (travelDetails.documentIssuingAuthority) {
      revealRows.push({
        label: reveal.documentIssuingAuthority,
        value: travelDetails.documentIssuingAuthority,
      })
    }
    if (travelDetails.dietaryRequirements) {
      revealRows.push({
        label: reveal.dietaryRequirements,
        value: <span className="whitespace-pre-wrap">{travelDetails.dietaryRequirements}</span>,
      })
    }
    if (travelDetails.accessibilityNeeds) {
      revealRows.push({
        label: reveal.accessibilityNeeds,
        value: <span className="whitespace-pre-wrap">{travelDetails.accessibilityNeeds}</span>,
      })
    }
    if (travelDetails.bedPreference) {
      revealRows.push({
        label: reveal.bedPreference,
        value: (
          <Badge variant="outline" className="text-[10px] uppercase">
            {travelDetails.bedPreference.replace(/-/g, " ")}
          </Badge>
        ),
      })
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-md border p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="truncate font-medium">{name || quick.travelerUnnamed}</span>
        <div className="flex shrink-0 items-center gap-1">
          {traveler.isPrimary ? (
            <Badge variant="outline" className="text-[10px] uppercase">
              {quick.travelerCategoryLabels.lead}
            </Badge>
          ) : null}
          {categoryLabel ? (
            <Badge variant="outline" className="text-[10px] uppercase">
              {categoryLabel}
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        {traveler.email ? (
          <div className="flex items-center gap-1.5">
            <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
            <a href={`mailto:${traveler.email}`} className="truncate hover:underline">
              {traveler.email}
            </a>
          </div>
        ) : null}
        {traveler.phone ? (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
            <a href={`tel:${traveler.phone}`} className="truncate hover:underline">
              {traveler.phone}
            </a>
          </div>
        ) : null}
        {traveler.preferredLanguage ? (
          <div className="flex items-center gap-1.5">
            <Languages className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate uppercase">{traveler.preferredLanguage}</span>
          </div>
        ) : null}
        {traveler.specialRequests ? (
          <div className="flex items-start gap-1.5">
            <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="whitespace-pre-wrap">{traveler.specialRequests}</span>
          </div>
        ) : null}
        {traveler.notes ? (
          <div className="flex items-start gap-1.5">
            <StickyNote className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="whitespace-pre-wrap">{traveler.notes}</span>
          </div>
        ) : null}
      </div>
      {documents.length > 0 ? (
        <div className="flex flex-col gap-1 border-t pt-2">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Paperclip className="h-3 w-3" aria-hidden="true" />
            {quick.sectionTravelerDocuments}
            <span className="font-mono normal-case">{documents.length}</span>
          </div>
          <ul className="flex flex-col">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-2 py-0.5 text-xs">
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-w-0 items-center gap-1 hover:underline"
                >
                  <span className="truncate">{doc.fileName}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                </a>
                <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                  {doc.type.replace(/_/g, " ")}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger
          render={
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 border-t pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
            >
              <span>{expanded ? reveal.hideAction : reveal.showAction}</span>
              <ChevronDown
                className={cn(
                  "h-3 w-3 shrink-0 transition-transform",
                  expanded ? "rotate-180" : null,
                )}
                aria-hidden="true"
              />
            </button>
          }
        />
        <CollapsibleContent className="data-closed:hidden">
          <div className="mt-2 flex flex-col gap-1.5 text-xs">
            {revealQuery.isFetching && revealRows.length === 0 ? (
              <p className="text-muted-foreground">{messages.common.loading}</p>
            ) : revealQuery.isError ? (
              <p className="text-destructive">{reveal.error}</p>
            ) : revealRows.length === 0 ? (
              <p className="text-muted-foreground">{reveal.empty}</p>
            ) : (
              <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
                {revealRows.map((row) => (
                  <Fragment key={row.label}>
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd className="break-words text-right">{row.value}</dd>
                  </Fragment>
                ))}
              </dl>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

function PaymentsSection({ booking, locale }: { booking: BookingRecord; locale: string }) {
  const messages = useBookingsUiMessagesOrDefault()
  const detail = messages.bookingDetailPage
  const quick = messages.bookingQuickViewSheet
  const { data } = useAdminBookingPayments(booking.id)
  const payments = data?.data?.payments ?? []

  const paidCents = payments
    .filter((payment) => payment.status === "completed")
    .reduce((sum, payment) => sum + payment.amountCents, 0)
  const totalCents = booking.sellAmountCents ?? 0
  const remainingCents = Math.max(0, totalCents - paidCents)

  return (
    <Section
      icon={<CreditCard className="h-3.5 w-3.5" />}
      label={quick.sectionPayments}
      count={String(payments.length)}
    >
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{quick.paymentsPaid}</span>
        <span className="font-medium tabular-nums">
          {formatAmount(paidCents, booking.sellCurrency, locale, detail.noValue)}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{quick.paymentsRemaining}</span>
        <span className="font-medium tabular-nums">
          {formatAmount(remainingCents, booking.sellCurrency, locale, detail.noValue)}
        </span>
      </div>
    </Section>
  )
}

function InvoicesSection({ booking }: { booking: BookingRecord }) {
  const messages = useBookingsUiMessagesOrDefault()
  const quick = messages.bookingQuickViewSheet
  const { data } = useInvoices({ bookingId: booking.id, limit: 20 })
  const invoices = data?.data ?? []

  return (
    <Section
      icon={<FileText className="h-3.5 w-3.5" />}
      label={quick.sectionInvoices}
      count={String(invoices.length)}
    >
      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">{quick.invoicesEmpty}</p>
      ) : (
        <ul className="flex flex-col">
          {invoices.map((invoice) => (
            <InvoiceRow key={invoice.id} invoice={invoice} />
          ))}
        </ul>
      )}
    </Section>
  )
}

function InvoiceRow({ invoice }: { invoice: InvoiceRecord }) {
  const messages = useBookingsUiMessagesOrDefault()
  const quick = messages.bookingQuickViewSheet
  const { baseUrl } = useVoyantFinanceContext()
  const { data } = useInvoiceAttachments(invoice.id)
  const attachment = latestAttachment(data?.data ?? [])
  const statusLabel =
    quick.invoiceStatusLabels[invoice.status as keyof typeof quick.invoiceStatusLabels] ??
    invoice.status

  return (
    <li className="flex items-center justify-between gap-3 py-1 font-mono text-sm">
      <LinkedRowTitle
        href={attachment ? getDefaultInvoiceAttachmentDownloadHref(baseUrl, attachment) : null}
        label={invoice.invoiceNumber}
      />
      <Badge variant="outline" className="shrink-0 font-sans text-[10px] uppercase">
        {statusLabel}
      </Badge>
    </li>
  )
}

function PaymentScheduleSection({ booking, locale }: { booking: BookingRecord; locale: string }) {
  const messages = useBookingsUiMessagesOrDefault()
  const detail = messages.bookingDetailPage
  const quick = messages.bookingQuickViewSheet
  const { data } = useBookingPaymentSchedules(booking.id)
  const schedules = data?.data ?? []

  const paidCount = schedules.filter((schedule) => schedule.status === "paid").length
  const counter =
    schedules.length === 0 ? "0" : `${paidCount}/${schedules.length} ${quick.scheduleCountSuffix}`

  return (
    <Section
      icon={<Calendar className="h-3.5 w-3.5" />}
      label={quick.sectionPaymentSchedule}
      count={counter}
    >
      {schedules.length === 0 ? (
        <p className="text-sm text-muted-foreground">{quick.scheduleEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {schedules.map((schedule) => {
            const typeLabel =
              quick.scheduleTypeLabels[
                schedule.scheduleType as keyof typeof quick.scheduleTypeLabels
              ] ?? schedule.scheduleType
            return (
              <li key={schedule.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {typeLabel}
                  </Badge>
                  <span className="text-muted-foreground">
                    {formatScheduleDate(schedule.dueDate, locale, detail.noValue)}
                  </span>
                </span>
                <span className="font-medium tabular-nums">
                  {formatAmount(schedule.amountCents, schedule.currency, locale, detail.noValue)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

function ContractsSection({ bookingId }: { bookingId: string }) {
  const messages = useBookingsUiMessagesOrDefault()
  const quick = messages.bookingQuickViewSheet
  const { data } = useLegalContracts({ bookingId, limit: 20 })
  const contracts = data?.data ?? []

  return (
    <Section
      icon={<ScrollText className="h-3.5 w-3.5" />}
      label={quick.sectionContracts}
      count={String(contracts.length)}
    >
      {contracts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{quick.contractsEmpty}</p>
      ) : (
        <ul className="flex flex-col">
          {contracts.map((contract) => (
            <ContractRow key={contract.id} contract={contract} />
          ))}
        </ul>
      )}
    </Section>
  )
}

function ContractRow({ contract }: { contract: LegalContractRecord }) {
  const messages = useBookingsUiMessagesOrDefault()
  const quick = messages.bookingQuickViewSheet
  const { baseUrl } = useVoyantLegalContext()
  const { data } = useLegalContractAttachments({ contractId: contract.id })
  const attachment = latestAttachment(data)
  const statusLabel =
    quick.contractStatusLabels[contract.status as keyof typeof quick.contractStatusLabels] ??
    contract.status

  return (
    <li className="flex items-center justify-between gap-3 py-1 text-sm">
      <LinkedRowTitle
        href={
          attachment ? getDefaultLegalContractAttachmentDownloadHref(baseUrl, attachment) : null
        }
        label={contract.contractNumber ?? contract.title}
      />
      <Badge variant="outline" className="shrink-0 font-sans text-[10px] uppercase">
        {statusLabel}
      </Badge>
    </li>
  )
}

function LinkedRowTitle({ href, label }: { href: string | null; label: string }) {
  if (!href) {
    return <span className="min-w-0 truncate font-mono">{label}</span>
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-w-0 items-center gap-1 font-mono text-primary hover:underline"
    >
      <span className="truncate">{label}</span>
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
    </a>
  )
}

function latestAttachment<T extends { createdAt: string }>(attachments: T[] | undefined) {
  return (attachments ?? []).reduce<T | null>(
    (latest, attachment) =>
      !latest || attachment.createdAt > latest.createdAt ? attachment : latest,
    null,
  )
}

function withApiBaseUrl(baseUrl: string, path: string) {
  const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${trimmedBase}${normalizedPath}`
}

function getDefaultInvoiceAttachmentDownloadHref(
  baseUrl: string,
  attachment: InvoiceAttachmentRecord,
) {
  return withApiBaseUrl(baseUrl, `/v1/admin/finance/invoice-attachments/${attachment.id}/download`)
}

function getDefaultLegalContractAttachmentDownloadHref(
  baseUrl: string,
  attachment: LegalContractAttachmentRecord,
) {
  return withApiBaseUrl(baseUrl, `/v1/admin/legal/contracts/attachments/${attachment.id}/download`)
}

function Section({
  icon,
  label,
  count,
  children,
}: {
  icon: ReactNode
  label: string
  count?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <header className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <span className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        {count ? <span className="font-mono normal-case">{count}</span> : null}
      </header>
      {children}
    </section>
  )
}

function formatAmount(
  cents: number | null,
  currency: string,
  locale: string,
  empty: string,
): string {
  if (cents == null) return empty
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function formatDate(iso: string | null, locale: string, empty: string): string {
  if (!iso) return empty
  return new Date(iso).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatScheduleDate(iso: string | null, locale: string, empty: string): string {
  if (!iso) return empty
  return new Date(iso).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  })
}
