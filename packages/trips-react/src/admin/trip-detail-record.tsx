"use client"

import {
  useAdminHref,
  useOperatorAdminMessages as useAdminMessages,
  useAdminNavigate,
} from "@voyant-travel/admin"
import { buildConfiguredPaymentLinkUrl } from "@voyant-travel/finance/payment-link"
import { formatMessage } from "@voyant-travel/i18n"
import { useOrganization, usePerson } from "@voyant-travel/relationships-react"
import type { Trip, TripComponent } from "@voyant-travel/trips"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { Separator } from "@voyant-travel/ui/components/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import {
  ArrowLeft,
  BedDouble,
  CalendarClock,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Pencil,
  Plane,
  Route as RouteIcon,
  Ship,
  Users,
} from "lucide-react"
import { type ReactNode, useState } from "react"

import { useVoyantTripsContext } from "../provider.js"
import {
  componentReferenceLabelFor,
  componentTitleFor,
  formatScheduleLabel,
  sortComponentsBySchedule,
} from "./trip-component-display.js"
import {
  formatContactName,
  formatPersonName,
  readBilling,
  readTravelers,
  summarizeTripComponentValues,
  type TripTravelerRecord,
} from "./trip-detail-record-model.js"

export function TripRecordPage({ trip, onEdit }: { trip: Trip; onEdit(): void }) {
  const messages = useAdminMessages().trips
  const detailMessages = messages.detail
  const navigateTo = useAdminNavigate()
  const { baseUrl } = useVoyantTripsContext()
  const [copiedPaymentLink, setCopiedPaymentLink] = useState(false)
  const envelope = trip.envelope
  const activeComponents = sortComponentsBySchedule(
    trip.components.filter((component) => component.status !== "removed"),
  )
  const valueBreakdown = summarizeTripComponentValues(trip.components, envelope.aggregateCurrency)
  const hasCancelledValue =
    valueBreakdown.cancelled.componentCount > 0 || valueBreakdown.cancelled.totalAmountCents !== 0
  const activeSubtotalAmountCents =
    valueBreakdown.active.valuedComponentCount > 0 || hasCancelledValue
      ? valueBreakdown.active.subtotalAmountCents
      : envelope.aggregateSubtotalAmountCents
  const activeTaxAmountCents =
    valueBreakdown.active.valuedComponentCount > 0 || hasCancelledValue
      ? valueBreakdown.active.taxAmountCents
      : envelope.aggregateTaxAmountCents
  const activeTotalAmountCents =
    valueBreakdown.active.valuedComponentCount > 0 || hasCancelledValue
      ? valueBreakdown.active.totalAmountCents
      : envelope.aggregateTotalAmountCents
  const bookedComponents = activeComponents.filter((component) => component.bookingId).length
  const externalRefs = activeComponents.filter(
    (component) => component.orderId || component.paymentSessionId,
  ).length
  const scheduleSummary = tripScheduleLabel(activeComponents)

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <Button variant="ghost" size="sm" onClick={() => navigateTo("trip.list", {})}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            {detailMessages.breadcrumb}
          </Button>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-bold text-2xl tracking-tight">{detailMessages.title}</h1>
              <Badge variant={envelope.status === "failed" ? "destructive" : "secondary"}>
                {messages.statuses[envelope.status]}
              </Badge>
            </div>
            {envelope.description ? (
              <p className="max-w-3xl text-muted-foreground text-sm">{envelope.description}</p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              {scheduleSummary
                ? `${scheduleSummary} · ${activeComponents.length} ${
                    activeComponents.length === 1
                      ? messages.list.componentSingular
                      : messages.list.componentPlural
                  } · ${envelope.id}`
                : `${activeComponents.length} ${
                    activeComponents.length === 1
                      ? messages.list.componentSingular
                      : messages.list.componentPlural
                  } · ${envelope.id}`}
            </p>
          </div>
        </div>
        <Button onClick={onEdit}>
          <Pencil className="size-4" aria-hidden="true" />
          {detailMessages.editTrip}
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          label={detailMessages.summary.activeTotal}
          value={formatMoney(activeTotalAmountCents, valueBreakdown.active.currency)}
          icon={CreditCard}
        />
        <SummaryCard
          label={detailMessages.summary.components}
          value={String(activeComponents.length)}
          icon={RouteIcon}
        />
        <SummaryCard
          label={detailMessages.summary.bookings}
          value={String(bookedComponents)}
          icon={CalendarClock}
        />
        <SummaryCard
          label={detailMessages.summary.externalRefs}
          value={String(externalRefs)}
          icon={ExternalLink}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <BillingRecord travelerParty={envelope.travelerParty} messages={detailMessages} />
        <TravelersRecord travelerParty={envelope.travelerParty} messages={detailMessages} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{detailMessages.components.component}</TableHead>
                <TableHead>{detailMessages.components.status}</TableHead>
                <TableHead>{detailMessages.components.tax}</TableHead>
                <TableHead>{detailMessages.components.total}</TableHead>
                <TableHead className="text-right">{detailMessages.components.record}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeComponents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-28 text-center text-muted-foreground text-sm">
                    {detailMessages.noComponentsOnTrip}
                  </TableCell>
                </TableRow>
              ) : (
                activeComponents.map((component) => (
                  <ComponentRow
                    key={component.id}
                    component={component}
                    messages={detailMessages}
                    onOpenBooking={(bookingId) => navigateTo("booking.detail", { bookingId })}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{detailMessages.summary.record}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SummaryLine
              label={detailMessages.summary.status}
              value={messages.statuses[envelope.status]}
            />
            <SummaryLine
              label={detailMessages.summary.updated}
              value={formatDate(envelope.updatedAt)}
            />
            <SummaryLine
              label={detailMessages.summary.reserved}
              value={formatDate(envelope.reservedAt)}
            />
            <SummaryLine
              label={detailMessages.summary.checkoutStarted}
              value={formatDate(envelope.checkoutStartedAt)}
            />
            {envelope.paymentSessionId ? (
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-muted-foreground">{detailMessages.summary.paymentLink}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void copyPaymentLink(envelope.paymentSessionId ?? "", baseUrl).then(
                      (copied) => {
                        setCopiedPaymentLink(copied)
                        if (copied) {
                          window.setTimeout(() => setCopiedPaymentLink(false), 2000)
                        }
                      },
                    )
                  }
                >
                  {copiedPaymentLink ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : (
                    <Copy className="size-4" aria-hidden="true" />
                  )}
                  {copiedPaymentLink
                    ? detailMessages.summary.copied
                    : detailMessages.summary.copyLink}
                </Button>
              </div>
            ) : null}
            <Separator />
            <SummaryLine
              label={detailMessages.summary.subtotal}
              value={formatMoney(activeSubtotalAmountCents, valueBreakdown.active.currency)}
            />
            <SummaryLine
              label={detailMessages.summary.tax}
              value={formatMoney(activeTaxAmountCents, valueBreakdown.active.currency)}
            />
            <SummaryLine
              label={detailMessages.summary.activeTotal}
              value={formatMoney(activeTotalAmountCents, valueBreakdown.active.currency)}
              strong
            />
            {hasCancelledValue ? (
              <SummaryLine
                label={detailMessages.summary.cancelledTotal}
                value={formatMoney(
                  valueBreakdown.cancelled.totalAmountCents,
                  valueBreakdown.cancelled.currency ?? envelope.aggregateCurrency,
                )}
              />
            ) : null}
          </CardContent>
        </Card>
      </section>
    </main>
  )
}

async function copyPaymentLink(paymentSessionId: string, apiBaseUrl: string): Promise<boolean> {
  if (!paymentSessionId) return false
  const config = await fetchPaymentLinkConfig(apiBaseUrl)
  const url = buildConfiguredPaymentLinkUrl(paymentSessionId, config ?? {})
  if (!url) return false
  try {
    await navigator.clipboard.writeText(url)
    return true
  } catch {
    return false
  }
}

async function fetchPaymentLinkConfig(apiBaseUrl: string): Promise<{
  paymentLinkUrlTemplate?: string | null
  publicCheckoutBaseUrl?: string | null
} | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/v1/public/payment-link-config`, {
      headers: { Accept: "application/json" },
    })
    if (!res.ok) return null
    const body = (await res.json()) as {
      data?: {
        paymentLinkUrlTemplate?: string | null
        publicCheckoutBaseUrl?: string | null
      }
    }
    return body.data ?? null
  } catch {
    return null
  }
}

function BillingRecord({
  travelerParty,
  messages,
}: {
  travelerParty: Record<string, unknown>
  messages: ReturnType<typeof useAdminMessages>["trips"]["detail"]
}) {
  const billing = readBilling(travelerParty)
  const personQuery = usePerson(billing?.personId, { enabled: Boolean(billing?.personId) })
  const orgQuery = useOrganization(billing?.organizationId, {
    enabled: Boolean(billing?.organizationId),
  })
  const resolvedPersonName = formatPersonName(personQuery.data)
  const primary =
    orgQuery.data?.name ??
    resolvedPersonName ??
    formatContactName(billing?.contact) ??
    billing?.contact?.email ??
    null
  const secondary = [
    orgQuery.data?.name ? resolvedPersonName : null,
    billing?.contact?.email,
    billing?.buyerType,
  ].filter(Boolean)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{messages.billing.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {primary ? (
          <>
            <div>
              <p className="font-medium">
                {billing?.personId && !orgQuery.data?.name ? (
                  <PersonLink personId={billing.personId}>{primary}</PersonLink>
                ) : (
                  primary
                )}
              </p>
              {secondary.length > 0 ? (
                <div className="flex flex-wrap gap-x-1 text-muted-foreground text-sm">
                  {orgQuery.data?.name && billing?.personId && resolvedPersonName ? (
                    <>
                      <PersonLink personId={billing.personId}>{resolvedPersonName}</PersonLink>
                      {billing.contact?.email || billing.buyerType ? <span>·</span> : null}
                    </>
                  ) : null}
                  {billing?.contact?.email ? <span>{billing.contact.email}</span> : null}
                  {billing?.contact?.email && billing?.buyerType ? <span>·</span> : null}
                  {billing?.buyerType ? <span>{billing.buyerType}</span> : null}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
              {billing?.personId ? (
                <span>
                  {messages.billing.person}: {billing.personId}
                </span>
              ) : null}
              {billing?.organizationId ? (
                <span>
                  {messages.billing.organization}: {billing.organizationId}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">{messages.billing.noProfile}</p>
        )}
      </CardContent>
    </Card>
  )
}

function TravelersRecord({
  travelerParty,
  messages,
}: {
  travelerParty: Record<string, unknown>
  messages: ReturnType<typeof useAdminMessages>["trips"]["detail"]
}) {
  const travelers = readTravelers(travelerParty)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" aria-hidden="true" />
          {messages.travelers.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {travelers.length > 0 ? (
          <ul className="divide-y">
            {travelers.map((traveler, index) => (
              <TravelerRecordRow
                key={traveler.localId ?? traveler.personId ?? index}
                traveler={traveler}
                index={index}
                messages={messages}
              />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">{messages.travelers.none}</p>
        )}
      </CardContent>
    </Card>
  )
}

function TravelerRecordRow({
  traveler,
  index,
  messages,
}: {
  traveler: TripTravelerRecord
  index: number
  messages: ReturnType<typeof useAdminMessages>["trips"]["detail"]
}) {
  const personQuery = usePerson(traveler.personId ?? undefined, {
    enabled: Boolean(traveler.personId),
  })
  const inlineName = [traveler.firstName, traveler.lastName]
    .filter((part) => (part ?? "").trim().length > 0)
    .join(" ")
    .trim()
  const name =
    inlineName ||
    formatPersonName(personQuery.data) ||
    formatMessage(messages.travelers.fallbackName, { index: String(index + 1) })
  const email = traveler.email ?? personQuery.data?.email ?? null
  return (
    <li className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {traveler.personId ? <PersonLink personId={traveler.personId}>{name}</PersonLink> : name}
        </p>
        {email ? <p className="truncate text-muted-foreground text-sm">{email}</p> : null}
      </div>
      <Badge variant="secondary" className="shrink-0 capitalize">
        {traveler.role ?? messages.travelers.fallbackRole}
      </Badge>
    </li>
  )
}

function PersonLink({ personId, children }: { personId: string; children: ReactNode }) {
  const resolveHref = useAdminHref()
  const navigateTo = useAdminNavigate()
  return (
    <a
      href={resolveHref("person.detail", { personId })}
      onClick={(event) => {
        event.preventDefault()
        navigateTo("person.detail", { personId })
      }}
      className="text-primary hover:underline"
    >
      {children}
    </a>
  )
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: typeof RouteIcon
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="truncate font-semibold text-lg">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function ComponentRow({
  component,
  messages,
  onOpenBooking,
}: {
  component: TripComponent
  messages: ReturnType<typeof useAdminMessages>["trips"]["detail"]
  onOpenBooking(bookingId: string): void
}) {
  const Icon = componentIcon(component)
  const componentName = componentTitleFor(component)
  const scheduleLabel = formatScheduleLabel(component)
  const referenceLabel = componentReferenceLabelFor(component)
  const secondary = [scheduleLabel, referenceLabel === componentName ? null : referenceLabel]
    .filter(Boolean)
    .join(" · ")

  return (
    <TableRow>
      <TableCell>
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{componentName}</p>
            {secondary ? (
              <p className="truncate text-muted-foreground text-xs">{secondary}</p>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={component.status === "failed" ? "destructive" : "secondary"}>
          {formatStatus(component.status)}
        </Badge>
      </TableCell>
      <TableCell>
        {formatMoney(component.componentTaxAmountCents, component.componentCurrency)}
      </TableCell>
      <TableCell>
        {formatMoney(component.componentTotalAmountCents, component.componentCurrency)}
      </TableCell>
      <TableCell className="text-right">
        {component.bookingId ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenBooking(component.bookingId ?? "")}
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            {messages.components.booking}
          </Button>
        ) : component.orderId || component.paymentSessionId ? (
          <span className="text-muted-foreground text-sm">
            {component.orderId ?? component.paymentSessionId}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">{messages.components.notCommitted}</span>
        )}
      </TableCell>
    </TableRow>
  )
}

function tripScheduleLabel(components: Trip["components"]) {
  const labels = components
    .map(formatScheduleLabel)
    .filter((label): label is string => Boolean(label))
  if (labels.length === 0) return null
  if (labels.length === 1) return labels[0]
  return `${labels[0]} -> ${labels.at(-1)}`
}

function SummaryLine({
  label,
  value,
  strong = false,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : "font-medium"}>{value}</span>
    </div>
  )
}

function componentIcon(component: TripComponent) {
  if (component.kind === "flight_placeholder" || component.kind === "flight_order") return Plane
  if (component.entityModule === "accommodations") return BedDouble
  if (component.entityModule === "cruises") return Ship
  return RouteIcon
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ")
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-"
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString()
}

function formatMoney(amountCents: number | null | undefined, currency: string | null | undefined) {
  if (amountCents == null) return "-"
  return (amountCents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: currency ?? "EUR",
  })
}
