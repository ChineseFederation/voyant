"use client"

import { Button, cn } from "@voyant-travel/ui/components"
import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useCrmUiMessagesOrDefault } from "../i18n/index.js"
import type { UpdateOrganizationInput } from "../index.js"
import { useActivities, useOrganization, useOrganizationMutation, usePeople } from "../index.js"
import { CreateActivityDialog } from "./create-activity-dialog.js"
import { OrganizationMergeDialog } from "./merge-dialogs.js"
import {
  type OrganizationDetailPageSlots,
  type OrganizationDetailTab,
  OrganizationMain,
  OrganizationSidebar,
  OrganizationTopBar,
} from "./organization-detail-sections.js"
import { PersonDialog } from "./person-dialog.js"

export interface OrganizationDetailPageProps {
  id: string
  className?: string
  onBack?: () => void
  onDeleted?: () => void
  onPersonOpen?: (personId: string) => void
  slots?: OrganizationDetailPageSlots
}

export function OrganizationDetailPage({
  id,
  className,
  onBack,
  onDeleted,
  onPersonOpen,
  slots,
}: OrganizationDetailPageProps) {
  const messages = useCrmUiMessagesOrDefault()
  const [activeTab, setActiveTab] = useState<OrganizationDetailTab>("overview")
  const [mergeOpen, setMergeOpen] = useState(false)
  const [personDialogOpen, setPersonDialogOpen] = useState(false)
  const [activityDialogOpen, setActivityDialogOpen] = useState(false)
  const orgQuery = useOrganization(id)
  const { remove, update } = useOrganizationMutation()
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
      (isOrganizationCommercialTab(activeTab) && !activeCommercialTabIsAvailable)
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

  const updateField = async (patch: UpdateOrganizationInput) => {
    await update.mutateAsync({ id, input: patch })
  }

  const org = orgQuery.data
  const peopleQuery = usePeople({ organizationId: id, limit: 50, enabled: Boolean(org) })
  const activitiesQuery = useActivities({
    entityType: "organization",
    entityId: id,
    limit: 50,
    enabled: Boolean(org),
  })

  if (orgQuery.isPending) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!org) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-4 py-12", className)}>
        <p className="text-muted-foreground">{messages.organizationDetailPage.notFound}</p>
        {onBack ? (
          <Button variant="outline" onClick={onBack}>
            {messages.organizationDetailPage.backToOrganizations}
          </Button>
        ) : null}
      </div>
    )
  }

  const people = peopleQuery.data?.data ?? []
  const activities = activitiesQuery.data?.data ?? []
  const websiteHref = org.website
    ? org.website.startsWith("http")
      ? org.website
      : `https://${org.website}`
    : undefined

  return (
    <div
      data-slot="organization-detail-page"
      className={cn("flex min-h-screen flex-col", className)}
    >
      <OrganizationTopBar
        orgName={org.name}
        onBack={() => onBack?.()}
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
        <OrganizationSidebar org={org} websiteHref={websiteHref} onUpdateField={updateField}>
          {slots?.sidebarEnd}
        </OrganizationSidebar>
        <OrganizationMain
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          org={org}
          people={people}
          activities={activities}
          peoplePending={peopleQuery.isPending}
          activitiesPending={activitiesQuery.isPending}
          onOpenPerson={(personId) => onPersonOpen?.(personId)}
          onAddPerson={() => setPersonDialogOpen(true)}
          onAddActivity={() => setActivityDialogOpen(true)}
          onUpdateField={updateField}
          slots={slots}
        />
      </div>
      <PersonDialog
        open={personDialogOpen}
        onOpenChange={setPersonDialogOpen}
        initialOrganizationId={id}
        onSuccess={() => {
          void peopleQuery.refetch()
        }}
      />
      <CreateActivityDialog
        open={activityDialogOpen}
        onOpenChange={setActivityDialogOpen}
        initialEntityType="organization"
        initialEntityId={id}
        onSuccess={() => {
          void activitiesQuery.refetch()
        }}
      />
      <OrganizationMergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        keepOrganization={org}
      />
    </div>
  )
}

function isOrganizationCommercialTab(
  tab: OrganizationDetailTab,
): tab is "bookings" | "invoices" | "payments" | "contracts" {
  return tab === "bookings" || tab === "invoices" || tab === "payments" || tab === "contracts"
}
