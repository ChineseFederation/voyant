"use client"

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  ConfirmActionButton,
  cn,
} from "@voyant-travel/ui/components"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@voyant-travel/ui/components/tabs"
import { ArrowLeft, GitMerge, Loader2, Pencil } from "lucide-react"
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
  const displayName = personDisplayName(person, messages.personCard.unnamed)

  return (
    <div data-slot="person-detail-page" className={cn("flex min-h-screen flex-col", className)}>
      <PersonTopBar
        personName={displayName}
        onBack={() => onBack?.()}
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

      <div className="grid flex-1 grid-cols-12 gap-4 p-4 lg:p-6">
        <PersonSidebar
          person={person}
          organization={organization}
          onOrganizationOpen={onOrganizationOpen}
          onUpdateField={updateField}
        >
          {slots?.sidebarEnd}
        </PersonSidebar>
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
      </div>

      <PersonDialog open={editOpen} onOpenChange={setEditOpen} person={person} />
      <PersonMergeDialog open={mergeOpen} onOpenChange={setMergeOpen} keepPerson={person} />
    </div>
  )
}

export interface PersonTopBarProps {
  personName: string
  onBack: () => void
  onEdit: () => void
  onMerge: () => void
  onDelete: () => Promise<void>
  deletePending: boolean
}

export function PersonTopBar({
  personName,
  onBack,
  onEdit,
  onMerge,
  onDelete,
  deletePending,
}: PersonTopBarProps) {
  const messages = useCrmUiMessagesOrDefault()

  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background px-6 py-3">
      <Button variant="ghost" size="icon" onClick={onBack} className="size-8">
        <ArrowLeft className="size-4" aria-hidden="true" />
      </Button>
      <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        <button type="button" onClick={onBack} className="hover:text-foreground">
          {messages.personDetail.topBar.people}
        </button>
        <span>/</span>
        <span className="truncate text-foreground">{personName}</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
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
    <main className="col-span-12 flex flex-col gap-4 lg:col-span-9">
      <Card>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as PersonDetailTab)}>
          <CardHeader className="pb-0">
            <TabsList className="h-auto flex-wrap justify-start [&_[data-slot=tabs-trigger]]:flex-none">
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
          </CardHeader>
          <CardContent className="pt-4">
            <TabsContent value="overview" className="m-0">
              {slots?.overviewContent !== undefined ? (
                slots.overviewContent
              ) : (
                <PersonOverviewPanel
                  person={person}
                  organization={organization}
                  onUpdateField={onUpdateField}
                />
              )}
              {slots?.overviewEnd}
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
              ) : (
                <PersonActivitiesPanel
                  activities={activities}
                  activitiesPending={activitiesPending}
                />
              )}
              {slots?.activitiesEnd}
            </TabsContent>
            <TabsContent value="relationships" className="m-0">
              {slots?.relationshipsContent !== undefined ? (
                slots.relationshipsContent
              ) : (
                <PersonRelationshipsPanel
                  personId={person.id}
                  relationships={relationships}
                  relationshipsPending={relationshipsPending}
                  onPersonOpen={onPersonOpen}
                />
              )}
              {slots?.relationshipsEnd}
            </TabsContent>
            <TabsContent value="documents" className="m-0">
              {slots?.documentsContent !== undefined ? (
                slots.documentsContent
              ) : (
                <PersonDocumentsPanel
                  documents={documents}
                  documentsPending={documentsPending}
                  primaryCount={primaryDocuments.length}
                  personId={person.id}
                />
              )}
              {slots?.documentsEnd}
            </TabsContent>
            <TabsContent value="paymentMethods" className="m-0">
              <PersonPaymentMethodsPanel
                personId={person.id}
                paymentMethods={paymentMethods}
                paymentMethodsPending={paymentMethodsPending}
              />
            </TabsContent>
            <TabsContent value="communications" className="m-0">
              <PersonCommunicationsPanel
                personId={person.id}
                communications={communications}
                communicationsPending={communicationsPending}
              />
            </TabsContent>
            <TabsContent value="addresses" className="m-0">
              <PersonAddressesSection personId={person.id} />
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
