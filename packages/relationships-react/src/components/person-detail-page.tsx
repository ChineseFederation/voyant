"use client"

import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmActionButton,
  cn,
} from "@voyant-travel/ui/components"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@voyant-travel/ui/components/tabs"
import { GitMerge, Loader2, Pencil } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { useCrmUiMessagesOrDefault } from "../i18n/index.js"
import type { UpdatePersonInput } from "../index.js"
import {
  useActivities,
  useOrganization,
  usePerson,
  usePersonCommunications,
  usePersonDocuments,
  usePersonMutation,
  usePersonPaymentMethods,
  usePersonRelationships,
} from "../index.js"
import { PersonMergeDialog } from "./merge-dialogs.js"
import { PersonAddressesSection } from "./person-addresses-section.js"
import {
  initialsFrom,
  PersonActivitiesPanel,
  PersonCommunicationsPanel,
  PersonDocumentsPanel,
  PersonOverviewPanel,
  PersonPaymentMethodsPanel,
  PersonRelationshipsPanel,
  personDisplayName,
} from "./person-detail-panels.js"
import { PersonSidebar } from "./person-detail-sidebar.js"
import type {
  PersonActivity,
  PersonCommercialContextTabSlot,
  PersonCommunication,
  PersonData,
  PersonDetailPageProps,
  PersonDetailPageSlots,
  PersonDetailTab,
  PersonDocument,
  PersonOrganization,
  PersonPaymentMethod,
  PersonRelationship,
} from "./person-detail-types.js"
import { PersonDialog } from "./person-dialog.js"

export type {
  PersonActivity,
  PersonCommercialContextTabSlot,
  PersonCommunication,
  PersonData,
  PersonDetailPageProps,
  PersonDetailPageSlots,
  PersonDetailTab,
  PersonDocument,
  PersonOrganization,
  PersonPaymentMethod,
  PersonRelationship,
  PersonTravelSnapshot,
} from "./person-detail-types.js"

export function PersonDetailPage({
  id,
  className,
  onBack,
  onDeleted,
  onOrganizationOpen,
  onPersonOpen,
  slots,
}: PersonDetailPageProps) {
  const messages = useCrmUiMessagesOrDefault()
  const [activeTab, setActiveTab] = useState<PersonDetailTab>("overview")
  const [editOpen, setEditOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const personQuery = usePerson(id)
  const { remove, update } = usePersonMutation()
  const person = personQuery.data
  const hasProposalsSlot =
    slots?.proposalsContent !== undefined || slots?.proposalsEnd !== undefined

  useEffect(() => {
    const activeCommercialTabIsAvailable =
      (activeTab === "bookings" && Boolean(slots?.bookingsTab)) ||
      (activeTab === "invoices" && Boolean(slots?.invoicesTab)) ||
      (activeTab === "payments" && Boolean(slots?.paymentsTab)) ||
      (activeTab === "contracts" && Boolean(slots?.contractsTab))

    if (
      (activeTab === "proposals" && !hasProposalsSlot) ||
      (isPersonCommercialTab(activeTab) && !activeCommercialTabIsAvailable)
    ) {
      setActiveTab("overview")
    }
  }, [
    activeTab,
    hasProposalsSlot,
    slots?.bookingsTab,
    slots?.invoicesTab,
    slots?.paymentsTab,
    slots?.contractsTab,
  ])

  const organizationQuery = useOrganization(person?.organizationId ?? undefined, {
    enabled: Boolean(person?.organizationId),
  })
  const activitiesQuery = useActivities({
    entityType: "person",
    entityId: id,
    limit: 50,
    enabled: Boolean(person),
  })
  const relationshipsQuery = usePersonRelationships(id, {
    direction: "both",
    limit: 50,
    enabled: Boolean(person),
  })
  const documentsQuery = usePersonDocuments(id, {
    limit: 50,
    enabled: Boolean(person),
  })
  const paymentMethodsQuery = usePersonPaymentMethods(id, {
    enabled: Boolean(person),
  })
  const communicationsQuery = usePersonCommunications(id, {
    limit: 50,
    enabled: Boolean(person),
  })

  const updateField = async (patch: UpdatePersonInput) => {
    await update.mutateAsync({ id, input: patch })
  }

  if (personQuery.isPending) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!person) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-4 py-12", className)}>
        <p className="text-muted-foreground">{messages.personDetailPage.notFound}</p>
        {onBack ? (
          <Button variant="outline" onClick={onBack}>
            {messages.personDetailPage.backToPeople}
          </Button>
        ) : null}
      </div>
    )
  }

  const activities = activitiesQuery.data?.data ?? []
  const relationships = relationshipsQuery.data?.data ?? []
  const documents = documentsQuery.data?.data ?? []
  const paymentMethods = paymentMethodsQuery.data?.data ?? []
  const communications = communicationsQuery.data?.data ?? []
  const organization = organizationQuery.data ?? null

  return (
    <div data-slot="person-detail-page" className={cn("flex flex-col gap-6", className)}>
      <PersonHeader
        person={person}
        organization={organization}
        onOrganizationOpen={onOrganizationOpen}
        onEdit={() => setEditOpen(true)}
        onMerge={() => setMergeOpen(true)}
        deletePending={remove.isPending}
        onDelete={async () => {
          await remove.mutateAsync(id)
          onDeleted?.()
          onBack?.()
        }}
      />
      {slots?.afterTopBar}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <PersonMain
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          person={person}
          organization={organization}
          activities={activities}
          relationships={relationships}
          documents={documents}
          paymentMethods={paymentMethods}
          communications={communications}
          activitiesPending={activitiesQuery.isPending}
          relationshipsPending={relationshipsQuery.isPending}
          documentsPending={documentsQuery.isPending}
          paymentMethodsPending={paymentMethodsQuery.isPending}
          communicationsPending={communicationsQuery.isPending}
          onUpdateField={updateField}
          onPersonOpen={onPersonOpen}
          slots={slots}
        />
        <PersonSidebar person={person} onUpdateField={updateField}>
          {slots?.sidebarEnd}
        </PersonSidebar>
      </div>

      <PersonDialog open={editOpen} onOpenChange={setEditOpen} person={person} />
      <PersonMergeDialog open={mergeOpen} onOpenChange={setMergeOpen} keepPerson={person} />
    </div>
  )
}

export interface PersonHeaderProps {
  person: PersonData
  organization: PersonOrganization | null
  onOrganizationOpen?: (organizationId: string) => void
  onEdit: () => void
  onMerge: () => void
  onDelete: () => Promise<void>
  deletePending: boolean
}

/**
 * Page header for the person detail route.
 *
 * Renders no breadcrumb and no back affordance — the admin chrome owns both
 * (`useAdminBreadcrumbs` in the host). Identity moved here out of the sidebar
 * profile card so the rail is purely the field list.
 */
export function PersonHeader({
  person,
  organization,
  onOrganizationOpen,
  onEdit,
  onMerge,
  onDelete,
  deletePending,
}: PersonHeaderProps) {
  const messages = useCrmUiMessagesOrDefault()
  const displayName = personDisplayName(person, messages.personCard.unnamed)
  const relationLabel = person.relation
    ? (messages.common.relationTypeLabels[
        person.relation as keyof typeof messages.common.relationTypeLabels
      ] ?? person.relation)
    : null
  const statusLabel =
    messages.common.recordStatusLabels[
      person.status as keyof typeof messages.common.recordStatusLabels
    ] ?? person.status

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="size-10 shrink-0">
          <AvatarFallback>{initialsFrom(displayName)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{displayName}</h1>
            {relationLabel ? <Badge variant="secondary">{relationLabel}</Badge> : null}
            <Badge variant="outline">{statusLabel}</Badge>
          </div>
          {person.jobTitle || organization ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              {person.jobTitle ? <span className="truncate">{person.jobTitle}</span> : null}
              {person.jobTitle && organization ? (
                <span className="text-muted-foreground/60">/</span>
              ) : null}
              {organization ? (
                <button
                  type="button"
                  onClick={() => onOrganizationOpen?.(organization.id)}
                  className="truncate transition-colors hover:text-foreground hover:underline"
                >
                  {organization.name}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="size-4" aria-hidden="true" />
          {messages.personDetail.topBar.edit}
        </Button>
        <Button variant="outline" size="sm" onClick={onMerge}>
          <GitMerge className="size-4" aria-hidden="true" />
          {messages.personDetail.topBar.merge}
        </Button>
        <ConfirmActionButton
          buttonLabel={messages.personDetail.topBar.delete}
          confirmLabel={messages.personDetail.topBar.delete}
          title={messages.personDetail.topBar.deleteTitle}
          description={messages.personDetail.topBar.deleteDescription}
          variant="destructive"
          confirmVariant="destructive"
          disabled={deletePending}
          onConfirm={onDelete}
        />
      </div>
    </div>
  )
}

export type { PersonSidebarProps } from "./person-detail-sidebar.js"
export { PersonSidebar } from "./person-detail-sidebar.js"

export interface PersonMainProps {
  activeTab: PersonDetailTab
  setActiveTab: (value: PersonDetailTab) => void
  person: PersonData
  organization: PersonOrganization | null
  activities: PersonActivity[]
  relationships: PersonRelationship[]
  documents: PersonDocument[]
  paymentMethods: PersonPaymentMethod[]
  communications: PersonCommunication[]
  activitiesPending: boolean
  relationshipsPending: boolean
  documentsPending: boolean
  paymentMethodsPending: boolean
  communicationsPending: boolean
  onUpdateField: (patch: UpdatePersonInput) => Promise<void>
  onPersonOpen?: (personId: string) => void
  slots?: PersonDetailPageSlots
}

export function PersonMain({
  activeTab,
  setActiveTab,
  person,
  organization,
  activities,
  relationships,
  documents,
  paymentMethods,
  communications,
  activitiesPending,
  relationshipsPending,
  documentsPending,
  paymentMethodsPending,
  communicationsPending,
  onUpdateField,
  onPersonOpen,
  slots,
}: PersonMainProps) {
  const messages = useCrmUiMessagesOrDefault()
  const primaryDocuments = documents.filter((document) => document.isPrimary)
  const hasProposalsSlot =
    slots?.proposalsContent !== undefined || slots?.proposalsEnd !== undefined

  return (
    <main className="flex min-w-0 flex-col gap-6">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as PersonDetailTab)}>
        <TabsList className="h-auto w-full flex-wrap justify-start [&_[data-slot=tabs-trigger]]:flex-none">
          <TabsTrigger value="overview">{messages.personDetail.tabs.overview}</TabsTrigger>
          {hasProposalsSlot ? (
            <TabsTrigger value="proposals">{messages.personDetail.tabs.proposals}</TabsTrigger>
          ) : null}
          <TabsTrigger value="activities">
            {messages.personDetail.tabs.activities} ({activities.length})
          </TabsTrigger>
          <TabsTrigger value="relationships">
            {messages.personDetail.tabs.relationships} ({relationships.length})
          </TabsTrigger>
          <TabsTrigger value="documents">
            {messages.personDetail.tabs.documents} ({documents.length})
          </TabsTrigger>
          <TabsTrigger value="paymentMethods">
            {messages.personDetail.tabs.paymentMethods} ({paymentMethods.length})
          </TabsTrigger>
          <TabsTrigger value="communications">
            {messages.personDetail.tabs.communications} ({communications.length})
          </TabsTrigger>
          <TabsTrigger value="addresses">{messages.personDetail.tabs.addresses}</TabsTrigger>
          {slots?.bookingsTab ? (
            <TabsTrigger value="bookings">
              {formatTabLabel(messages.personDetail.tabs.bookings, slots.bookingsTab)}
            </TabsTrigger>
          ) : null}
          {slots?.invoicesTab ? (
            <TabsTrigger value="invoices">
              {formatTabLabel(messages.personDetail.tabs.invoices, slots.invoicesTab)}
            </TabsTrigger>
          ) : null}
          {slots?.paymentsTab ? (
            <TabsTrigger value="payments">
              {formatTabLabel(messages.personDetail.tabs.payments, slots.paymentsTab)}
            </TabsTrigger>
          ) : null}
          {slots?.contractsTab ? (
            <TabsTrigger value="contracts">
              {formatTabLabel(messages.personDetail.tabs.contracts, slots.contractsTab)}
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="overview" className="mt-4 flex flex-col gap-6">
          {slots?.overviewContent !== undefined ? (
            slots.overviewContent
          ) : (
            <Card>
              <CardContent>
                <PersonOverviewPanel
                  person={person}
                  organization={organization}
                  onUpdateField={onUpdateField}
                />
              </CardContent>
            </Card>
          )}
          {slots?.overviewEnd}
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
                <PersonActivitiesPanel
                  activities={activities}
                  activitiesPending={activitiesPending}
                />
              </CardContent>
            </Card>
          )}
          {slots?.activitiesEnd}
        </TabsContent>
        <TabsContent value="relationships" className="mt-4 flex flex-col gap-6">
          {slots?.relationshipsContent !== undefined ? (
            slots.relationshipsContent
          ) : (
            <Card>
              <CardContent>
                <PersonRelationshipsPanel
                  personId={person.id}
                  relationships={relationships}
                  relationshipsPending={relationshipsPending}
                  onPersonOpen={onPersonOpen}
                />
              </CardContent>
            </Card>
          )}
          {slots?.relationshipsEnd}
        </TabsContent>
        <TabsContent value="documents" className="mt-4 flex flex-col gap-6">
          {slots?.documentsContent !== undefined ? (
            slots.documentsContent
          ) : (
            <Card>
              <CardContent>
                <PersonDocumentsPanel
                  documents={documents}
                  documentsPending={documentsPending}
                  primaryCount={primaryDocuments.length}
                  personId={person.id}
                />
              </CardContent>
            </Card>
          )}
          {slots?.documentsEnd}
        </TabsContent>
        <TabsContent value="paymentMethods" className="mt-4 flex flex-col gap-6">
          <Card>
            <CardContent>
              <PersonPaymentMethodsPanel
                personId={person.id}
                paymentMethods={paymentMethods}
                paymentMethodsPending={paymentMethodsPending}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="communications" className="mt-4 flex flex-col gap-6">
          <Card>
            <CardContent>
              <PersonCommunicationsPanel
                personId={person.id}
                communications={communications}
                communicationsPending={communicationsPending}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="addresses" className="mt-4 flex flex-col gap-6">
          <Card>
            <CardContent>
              <PersonAddressesSection personId={person.id} />
            </CardContent>
          </Card>
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

function formatTabLabel(defaultLabel: string, slot: PersonCommercialContextTabSlot): ReactNode {
  const label = slot.label ?? defaultLabel
  return typeof slot.count === "number" ? `${label} (${slot.count})` : label
}

function isPersonCommercialTab(
  tab: PersonDetailTab,
): tab is "bookings" | "invoices" | "payments" | "contracts" {
  return tab === "bookings" || tab === "invoices" || tab === "payments" || tab === "contracts"
}

export type {
  EmptyRowProps,
  MetricCardProps,
  OverviewTermProps,
  PersonActivitiesPanelProps,
  PersonCommunicationsPanelProps,
  PersonDocumentsPanelProps,
  PersonOverviewPanelProps,
  PersonPaymentMethodsPanelProps,
  PersonRelationshipsPanelProps,
} from "./person-detail-panels.js"
export {
  EmptyRow,
  initialsFrom,
  LoadingRow,
  MetricCard,
  OverviewTerm,
  PersonActivitiesPanel,
  PersonCommunicationsPanel,
  PersonDocumentsPanel,
  PersonOverviewPanel,
  PersonPaymentMethodsPanel,
  PersonRelationshipsPanel,
  personDisplayName,
} from "./person-detail-panels.js"
