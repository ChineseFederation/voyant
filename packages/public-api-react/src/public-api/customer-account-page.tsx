"use client"

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@voyant-travel/ui/components"
import { CalendarDays, FileText, Loader2, LogOut, Plane, Save, Users } from "lucide-react"
import { type FormEvent, useEffect, useMemo, useState } from "react"
import {
  useCustomerPortalBookings,
  useCustomerPortalCompanions,
  useCustomerPortalMutation,
  useCustomerPortalProfile,
  useCustomerPortalProfileDocuments,
} from "../customer-portal/hooks/index.js"

export function CustomerAccountPage({
  onSignOut,
}: {
  onSignOut: () => Promise<void>
}): React.ReactElement {
  const profile = useCustomerPortalProfile()
  const bookings = useCustomerPortalBookings()
  const companions = useCustomerPortalCompanions()
  const documents = useCustomerPortalProfileDocuments()
  const customerPortal = useCustomerPortalMutation()
  const customer = profile.data?.data ?? null
  const bookingRows = bookings.data?.data ?? []
  const companionRows = companions.data?.data ?? []
  const documentRows = documents.data?.data ?? []
  const [saved, setSaved] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [phone, setPhone] = useState("")

  useEffect(() => {
    if (!customer) return
    setFirstName(customer.firstName ?? "")
    setLastName(customer.lastName ?? "")
    setPhone(customer.customerRecord?.phone ?? "")
  }, [customer])

  useEffect(() => {
    if (!customer || customer.customerRecord || customerPortal.bootstrap.isPending) return
    void customerPortal.bootstrap.mutateAsync({ createCustomerIfMissing: true })
  }, [customer, customerPortal.bootstrap])

  const upcomingBookings = useMemo(
    () =>
      bookingRows.filter((booking) => {
        if (!booking.startDate) return false
        return new Date(booking.startDate).getTime() >= Date.now()
      }).length,
    [bookingRows],
  )

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaved(false)
    await customerPortal.updateProfile.mutateAsync({
      firstName: firstName.trim() || null,
      lastName: lastName.trim() || null,
      customerRecord: {
        phone: phone.trim() || null,
      },
    })
    setSaved(true)
  }

  const signOut = async () => {
    await onSignOut()
  }

  if (profile.isPending) {
    return (
      <div className="flex min-h-60 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    )
  }

  if (profile.isError) {
    return (
      <div className="mx-auto max-w-xl rounded-md border p-6">
        <h1 className="font-semibold text-xl">Account unavailable</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          We could not load your customer account. Sign out and try again.
        </p>
        <Button type="button" className="mt-4" onClick={() => void signOut()}>
          <LogOut className="size-4" aria-hidden="true" />
          Sign out
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-semibold text-3xl tracking-normal">Your account</h1>
          <p className="mt-1 text-muted-foreground">
            Manage your customer profile, saved travelers, documents, and bookings.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void signOut()}>
          <LogOut className="size-4" aria-hidden="true" />
          Sign out
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <AccountMetric icon={Plane} label="Bookings" value={bookingRows.length} />
        <AccountMetric icon={CalendarDays} label="Upcoming" value={upcomingBookings} />
        <AccountMetric icon={Users} label="Saved travelers" value={companionRows.length} />
        <AccountMetric icon={FileText} label="Documents" value={documentRows.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Contact details used for future bookings.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="customer-first-name">First name</Label>
                  <Input
                    id="customer-first-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    autoComplete="given-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer-last-name">Last name</Label>
                  <Input
                    id="customer-last-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    autoComplete="family-name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-email">Email</Label>
                <Input id="customer-email" value={customer?.email ?? ""} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-phone">Phone</Label>
                <Input
                  id="customer-phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  autoComplete="tel"
                />
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={customerPortal.updateProfile.isPending}>
                  {customerPortal.updateProfile.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="size-4" aria-hidden="true" />
                  )}
                  Save profile
                </Button>
                {saved && <span className="text-green-700 text-sm">Saved</span>}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My bookings</CardTitle>
            <CardDescription>
              Confirmed, held, and in-progress bookings linked to you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bookings.isPending ? (
              <LoadingRows />
            ) : bookingRows.length === 0 ? (
              <EmptyState
                title="No bookings yet"
                body="Bookings made with this account will appear here."
              />
            ) : (
              <div className="divide-y rounded-md border">
                {bookingRows.map((booking) => (
                  <div
                    key={booking.bookingId}
                    className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">
                          {booking.productTitle ?? booking.bookingNumber}
                        </p>
                        <Badge variant="outline">{booking.status}</Badge>
                        <Badge variant="secondary">{booking.paymentStatus}</Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground text-sm">
                        {booking.bookingNumber} ·{" "}
                        {formatDateRange(booking.startDate, booking.endDate)}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="font-medium">
                        {formatMoney(booking.sellAmountCents, booking.sellCurrency)}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {booking.travelerCount} traveler{booking.travelerCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Saved travelers</CardTitle>
            <CardDescription>Reusable traveler records for future bookings.</CardDescription>
          </CardHeader>
          <CardContent>
            {companionRows.length === 0 ? (
              <EmptyState
                title="No saved travelers"
                body="Importing travelers from a booking and full traveler editing are deferred."
              />
            ) : (
              <div className="divide-y rounded-md border">
                {companionRows.slice(0, 5).map((companion) => (
                  <div key={companion.id} className="flex items-center justify-between gap-3 p-3">
                    <div>
                      <p className="font-medium">{companion.name}</p>
                      <p className="text-muted-foreground text-sm">
                        {companion.email ?? companion.phone}
                      </p>
                    </div>
                    {companion.isPrimary && <Badge>Primary</Badge>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
            <CardDescription>Identity documents saved to your customer profile.</CardDescription>
          </CardHeader>
          <CardContent>
            {documentRows.length === 0 ? (
              <EmptyState
                title="No documents saved"
                body="Document upload and editing are intentionally left for the next slice."
              />
            ) : (
              <div className="divide-y rounded-md border">
                {documentRows.slice(0, 5).map((document) => (
                  <div key={document.id} className="flex items-center justify-between gap-3 p-3">
                    <div>
                      <p className="font-medium">{document.type.replace("_", " ")}</p>
                      <p className="text-muted-foreground text-sm">
                        {document.issuingCountry ?? "No issuing country"} · expires{" "}
                        {document.expiryDate ?? "not set"}
                      </p>
                    </div>
                    {document.isPrimary && <Badge>Primary</Badge>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center">
        <a href="/shop" className="text-muted-foreground text-sm hover:text-foreground">
          Back to storefront
        </a>
      </div>
    </div>
  )
}

function AccountMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Plane
  label: string
  value: number
}) {
  return (
    <div className="rounded-md border p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">{label}</p>
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="mt-2 font-semibold text-2xl">{value}</p>
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed p-6 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-muted-foreground text-sm">{body}</p>
    </div>
  )
}

function LoadingRows() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-16 animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  )
}

function formatDateRange(startDate: string | null, endDate: string | null) {
  if (!startDate && !endDate) return "dates pending"
  const short = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" })
  const long = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  if (startDate && endDate)
    return `${short.format(new Date(startDate))} - ${long.format(new Date(endDate))}`
  return long.format(new Date(startDate ?? endDate ?? ""))
}

function formatMoney(amountCents: number | null, currency: string) {
  if (amountCents === null) return "Amount pending"
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(amountCents / 100)
}
