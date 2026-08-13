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
} from "@voyant-travel/ui/components"
import { Separator } from "@voyant-travel/ui/components/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@voyant-travel/ui/components/tabs"
import { Loader2, Plus } from "lucide-react"

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
    <main className="flex min-w-0 flex-col gap-6">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as OrganizationDetailTab)}
      >
        <TabsList className="h-auto w-full flex-wrap justify-start [&_[data-slot=tabs-trigger]]:flex-none">
          <TabsTrigger value="overview">{messages.organizationDetail.tabs.overview}</TabsTrigger>
          <TabsTrigger value="people">
            {messages.organizationDetail.tabs.people} ({people.length})
          </TabsTrigger>
          <TabsTrigger value="contactMethods">
            {messages.organizationDetail.tabs.contactMethods}
          </TabsTrigger>
          <TabsTrigger value="addresses">{messages.organizationDetail.tabs.addresses}</TabsTrigger>
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
        <TabsContent value="overview" className="mt-4 flex flex-col gap-6">
          {slots?.overviewContent !== undefined ? (
            slots.overviewContent
          ) : (
            <Card>
              <CardContent className="flex flex-col gap-4">
                <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">
                      {messages.organizationDetail.sections.created}
                    </dt>
                    <dd className="mt-0.5">{formatCrmDate(i18n, org.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">
                      {messages.organizationDetail.sections.updated}
                    </dt>
                    <dd className="mt-0.5">{formatCrmRelative(i18n, org.updatedAt)}</dd>
                  </div>
                </dl>
                <Separator />
                <InlineField
                  label={messages.organizationDetail.sections.notes}
                  kind="textarea"
                  value={org.notes}
                  onSave={(next) => onUpdateField({ notes: next })}
                />
              </CardContent>
            </Card>
          )}
          {slots?.overviewEnd}
        </TabsContent>

        <TabsContent value="people" className="mt-4 flex flex-col gap-6">
          {slots?.peopleContent !== undefined ? (
            slots.peopleContent
          ) : (
            <Card>
              <CardContent>
                {peoplePending ? (
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
                  <PeopleList
                    people={people}
                    onOpenPerson={onOpenPerson}
                    onAddPerson={onAddPerson}
                  />
                )}
              </CardContent>
            </Card>
          )}
          {slots?.peopleEnd}
        </TabsContent>

        <TabsContent value="contactMethods" className="mt-4 flex flex-col gap-6">
          {slots?.contactMethodsContent !== undefined ? (
            slots.contactMethodsContent
          ) : (
            <Card>
              <CardContent>
                <ContactPointsTab entityType="organization" entityId={org.id} />
              </CardContent>
            </Card>
          )}
          {slots?.contactMethodsEnd}
        </TabsContent>

        <TabsContent value="addresses" className="mt-4 flex flex-col gap-6">
          {slots?.addressesContent !== undefined ? (
            slots.addressesContent
          ) : (
            <Card>
              <CardContent>
                <AddressesTab entityType="organization" entityId={org.id} />
              </CardContent>
            </Card>
          )}
          {slots?.addressesEnd}
        </TabsContent>

        <TabsContent value="namedContacts" className="mt-4 flex flex-col gap-6">
          {slots?.namedContactsContent !== undefined ? (
            slots.namedContactsContent
          ) : (
            <Card>
              <CardContent>
                <NamedContactsTab entityType="organization" entityId={org.id} />
              </CardContent>
            </Card>
          )}
          {slots?.namedContactsEnd}
        </TabsContent>

        {hasProposalsSlot ? (
          <TabsContent value="proposals" className="mt-4 flex flex-col gap-6">
            {slots?.proposalsContent}
            {slots?.proposalsEnd}
          </TabsContent>
        ) : null}

        <TabsContent value="activities" className="mt-4 flex flex-col gap-6">
          {slots?.activitiesContent !== undefined ? (
            slots.activitiesContent
          ) : (
            <Card>
              <CardContent>
                {activitiesPending ? (
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
              </CardContent>
            </Card>
          )}
          {slots?.activitiesEnd}
        </TabsContent>
        {slots?.bookingsTab ? (
          <TabsContent value="bookings" className="mt-4 flex flex-col gap-6">
            {slots.bookingsTab.content}
          </TabsContent>
        ) : null}
        {slots?.invoicesTab ? (
          <TabsContent value="invoices" className="mt-4 flex flex-col gap-6">
            {slots.invoicesTab.content}
          </TabsContent>
        ) : null}
        {slots?.paymentsTab ? (
          <TabsContent value="payments" className="mt-4 flex flex-col gap-6">
            {slots.paymentsTab.content}
          </TabsContent>
        ) : null}
        {slots?.contractsTab ? (
          <TabsContent value="contracts" className="mt-4 flex flex-col gap-6">
            {slots.contractsTab.content}
          </TabsContent>
        ) : null}
      </Tabs>
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
