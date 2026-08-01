"use client"

import {
  AddressesTab,
  ContactPointsTab,
  NamedContactsTab,
} from "@voyant-travel/identity-react/components/identity-entity-tabs"
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
} from "@voyant-travel/ui/components"
import { Separator } from "@voyant-travel/ui/components/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@voyant-travel/ui/components/tabs"
import { Loader2, Pencil, Plus } from "lucide-react"

import { useCrmUiI18nOrDefault, useCrmUiMessagesOrDefault } from "../i18n/index.js"
import type { UpdateOrganizationInput } from "../index.js"
import { formatCrmDate, formatCrmRelative } from "./crm-format.js"
import { InlineField } from "./inline-field.js"
import {
  formatTabLabel,
  initialsFrom,
  type OrganizationActivity,
  type OrganizationData,
  type OrganizationDetailPageSlots,
  type OrganizationDetailTab,
  type OrganizationPerson,
} from "./organization-detail-types.js"

export interface OrganizationMainProps {
  activeTab: OrganizationDetailTab
  setActiveTab: (value: OrganizationDetailTab) => void
  org: OrganizationData
  people: OrganizationPerson[]
  activities: OrganizationActivity[]
  peoplePending: boolean
  activitiesPending: boolean
  onOpenPerson: (id: string) => void
  onAddPerson: () => void
  onAddActivity: () => void
  onUpdateField: (patch: UpdateOrganizationInput) => Promise<void>
  slots?: OrganizationDetailPageSlots
}

export function OrganizationMain({
  activeTab,
  setActiveTab,
  org,
  people,
  activities,
  peoplePending,
  activitiesPending,
  onOpenPerson,
  onAddPerson,
  onAddActivity,
  onUpdateField,
  slots,
}: OrganizationMainProps) {
  const i18n = useCrmUiI18nOrDefault()
  const messages = useCrmUiMessagesOrDefault()
  const hasProposalsSlot =
    slots?.proposalsContent !== undefined || slots?.proposalsEnd !== undefined

  return (
    <main className="col-span-12 flex flex-col gap-4 lg:col-span-9">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <CardContent>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {messages.organizationDetail.metrics.people}
            </p>
            <p className="mt-1 text-2xl font-semibold">{people.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {messages.organizationDetail.tabs.activities}
            </p>
            <p className="mt-1 text-2xl font-semibold">{activities.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as OrganizationDetailTab)}
        >
          <CardHeader className="pb-0">
            <TabsList className="h-auto flex-wrap justify-start [&_[data-slot=tabs-trigger]]:flex-none">
              <TabsTrigger value="overview">
                {messages.organizationDetail.tabs.overview}
              </TabsTrigger>
              <TabsTrigger value="people">
                {messages.organizationDetail.tabs.people} ({people.length})
              </TabsTrigger>
              <TabsTrigger value="contactMethods">
                {messages.organizationDetail.tabs.contactMethods}
              </TabsTrigger>
              <TabsTrigger value="addresses">
                {messages.organizationDetail.tabs.addresses}
              </TabsTrigger>
              <TabsTrigger value="namedContacts">
                {messages.organizationDetail.tabs.namedContacts}
              </TabsTrigger>
              {hasProposalsSlot ? (
                <TabsTrigger value="proposals">
                  {messages.organizationDetail.tabs.proposals}
                </TabsTrigger>
              ) : null}
              <TabsTrigger value="activities">
                {messages.organizationDetail.tabs.activities} ({activities.length})
              </TabsTrigger>
              {slots?.bookingsTab ? (
                <TabsTrigger value="bookings">
                  {formatTabLabel(messages.organizationDetail.tabs.bookings, slots.bookingsTab)}
                </TabsTrigger>
              ) : null}
              {slots?.invoicesTab ? (
                <TabsTrigger value="invoices">
                  {formatTabLabel(messages.organizationDetail.tabs.invoices, slots.invoicesTab)}
                </TabsTrigger>
              ) : null}
              {slots?.paymentsTab ? (
                <TabsTrigger value="payments">
                  {formatTabLabel(messages.organizationDetail.tabs.payments, slots.paymentsTab)}
                </TabsTrigger>
              ) : null}
              {slots?.contractsTab ? (
                <TabsTrigger value="contracts">
                  {formatTabLabel(messages.organizationDetail.tabs.contracts, slots.contractsTab)}
                </TabsTrigger>
              ) : null}
            </TabsList>
          </CardHeader>
          <CardContent className="pt-4">
            <TabsContent value="overview" className="m-0">
              {slots?.overviewContent !== undefined ? (
                slots.overviewContent
              ) : (
                <>
                  <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-medium uppercase text-muted-foreground">
                        {messages.organizationDetail.sections.created}
                      </dt>
                      <dd className="mt-0.5">{formatCrmDate(i18n, org.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase text-muted-foreground">
                        {messages.organizationDetail.sections.updated}
                      </dt>
                      <dd className="mt-0.5">{formatCrmRelative(i18n, org.updatedAt)}</dd>
                    </div>
                    {org.notes && (
                      <div className="sm:col-span-2">
                        <dt className="text-xs font-medium uppercase text-muted-foreground">
                          {messages.organizationDetail.sections.notes}
                        </dt>
                        <dd className="mt-0.5 whitespace-pre-wrap">{org.notes}</dd>
                      </div>
                    )}
                  </dl>
                  <Separator className="my-4" />
                  <InlineField
                    label={messages.organizationDetail.sections.notes}
                    kind="textarea"
                    value={org.notes}
                    onSave={(next) => onUpdateField({ notes: next })}
                  />
                </>
              )}
              {slots?.overviewEnd}
            </TabsContent>

            <TabsContent value="people" className="m-0">
              {slots?.peopleContent !== undefined ? (
                slots.peopleContent
              ) : peoplePending ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : people.length === 0 ? (
                <EmptyManagedSection
                  actionLabel={messages.organizationDetail.actions.addPerson}
                  emptyLabel={messages.organizationDetail.empty.noPeople}
                  onAction={onAddPerson}
                />
              ) : (
                <PeopleList people={people} onOpenPerson={onOpenPerson} onAddPerson={onAddPerson} />
              )}
              {slots?.peopleEnd}
            </TabsContent>

            <TabsContent value="contactMethods" className="m-0">
              {slots?.contactMethodsContent !== undefined ? (
                slots.contactMethodsContent
              ) : (
                <ContactPointsTab entityType="organization" entityId={org.id} />
              )}
              {slots?.contactMethodsEnd}
            </TabsContent>

            <TabsContent value="addresses" className="m-0">
              {slots?.addressesContent !== undefined ? (
                slots.addressesContent
              ) : (
                <AddressesTab entityType="organization" entityId={org.id} />
              )}
              {slots?.addressesEnd}
            </TabsContent>

            <TabsContent value="namedContacts" className="m-0">
              {slots?.namedContactsContent !== undefined ? (
                slots.namedContactsContent
              ) : (
                <NamedContactsTab entityType="organization" entityId={org.id} />
              )}
              {slots?.namedContactsEnd}
            </TabsContent>

            {hasProposalsSlot ? (
              <TabsContent value="proposals" className="m-0">
                {slots?.proposalsContent}
                {slots?.proposalsEnd}
              </TabsContent>
            ) : null}

            <TabsContent value="activities" className="m-0">
              {slots?.activitiesContent !== undefined ? (
                slots.activitiesContent
              ) : activitiesPending ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : activities.length === 0 ? (
                <EmptyManagedSection
                  actionLabel={messages.organizationDetail.actions.addActivity}
                  emptyLabel={messages.organizationDetail.empty.noActivities}
                  onAction={onAddActivity}
                />
              ) : (
                <ActivitiesList
                  activities={activities}
                  onAddActivity={onAddActivity}
                  formatRelative={(value) => formatCrmRelative(i18n, value)}
                />
              )}
              {slots?.activitiesEnd}
            </TabsContent>
            {slots?.bookingsTab ? (
              <TabsContent value="bookings" className="m-0">
                {slots.bookingsTab.content}
              </TabsContent>
            ) : null}
            {slots?.invoicesTab ? (
              <TabsContent value="invoices" className="m-0">
                {slots.invoicesTab.content}
              </TabsContent>
            ) : null}
            {slots?.paymentsTab ? (
              <TabsContent value="payments" className="m-0">
                {slots.paymentsTab.content}
              </TabsContent>
            ) : null}
            {slots?.contractsTab ? (
              <TabsContent value="contracts" className="m-0">
                {slots.contractsTab.content}
              </TabsContent>
            ) : null}
          </CardContent>
        </Tabs>
      </Card>

      <div className="flex items-center gap-2">
        <Pencil className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-xs text-muted-foreground">{messages.organizationDetail.hint}</span>
      </div>
    </main>
  )
}

function SectionAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" size="sm" onClick={onClick}>
      <Plus className="mr-2 size-4" aria-hidden="true" />
      {label}
    </Button>
  )
}

function EmptyManagedSection({
  actionLabel,
  emptyLabel,
  onAction,
}: {
  actionLabel: string
  emptyLabel: string
  onAction: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <SectionAction label={actionLabel} onClick={onAction} />
      </div>
      <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
    </div>
  )
}

function PeopleList({
  people,
  onOpenPerson,
  onAddPerson,
}: {
  people: OrganizationPerson[]
  onOpenPerson: (id: string) => void
  onAddPerson: () => void
}) {
  const messages = useCrmUiMessagesOrDefault()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <SectionAction
          label={messages.organizationDetail.actions.addPerson}
          onClick={onAddPerson}
        />
      </div>
      <ul className="divide-y">
        {people.map((person) => {
          const name =
            [person.firstName, person.lastName].filter(Boolean).join(" ") ||
            messages.organizationDetail.empty.unnamed
          return (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => onOpenPerson(person.id)}
                className="flex w-full items-center gap-3 py-2 text-left hover:bg-muted/40"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">{initialsFrom(name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{name}</p>
                  {person.jobTitle ? (
                    <p className="truncate text-xs text-muted-foreground">{person.jobTitle}</p>
                  ) : null}
                </div>
                {person.email ? (
                  <span className="truncate text-xs text-muted-foreground">{person.email}</span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ActivitiesList({
  activities,
  onAddActivity,
  formatRelative,
}: {
  activities: OrganizationActivity[]
  onAddActivity: () => void
  formatRelative: (value: string) => string
}) {
  const messages = useCrmUiMessagesOrDefault()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <SectionAction
          label={messages.organizationDetail.actions.addActivity}
          onClick={onAddActivity}
        />
      </div>
      <ul className="divide-y">
        {activities.map((activity) => (
          <li key={activity.id} className="py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{activity.subject}</p>
                {activity.description ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {activity.description}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant="outline">
                  {messages.common.activityTypeLabels[
                    (activity.type ?? "note") as keyof typeof messages.common.activityTypeLabels
                  ] ?? activity.type}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatRelative(activity.createdAt)}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
