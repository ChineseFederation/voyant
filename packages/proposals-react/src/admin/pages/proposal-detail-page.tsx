"use client"

// agent-quality: file-size exception -- #2048 keeps this workflow page intact until proposal detail panels are split.

import type { AdminRoutePageProps } from "@voyant-travel/admin"
import { useAdminNavigate } from "@voyant-travel/admin"
import { formatMessage } from "@voyant-travel/i18n"
import { useActivities, useOrganization, usePerson } from "@voyant-travel/relationships-react"
// Type-only: binds the relationships-react `AdminDestinations` augmentation
// (`person.detail`, `organization.detail`) into this program so the
// participant rows can navigate through those shared keys.
import type {} from "@voyant-travel/relationships-react/admin"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmActionButton,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
  toast,
} from "@voyant-travel/ui/components"
import { DatePicker } from "@voyant-travel/ui/components/date-picker"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import { ArrowLeft, Ban, CheckCircle2, Loader2, Save, Share2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { formatCrmDate, formatCrmMoney, formatCrmRelative } from "../../components/crm-format.js"
import { useCrmUiI18nOrDefault } from "../../i18n/index.js"
import type { CrmProposalVersionStatus } from "../../i18n/messages.js"
import {
  type ProposalParticipantRecord,
  type ProposalProductRecord,
  type ProposalRecord,
  useProposal,
  useProposalMedia,
  useProposalMediaMutation,
  useProposalMutation,
  useProposalParticipantMutation,
  useProposalParticipants,
  useProposalProductMutation,
  useProposalProducts,
  useProposalVersionMutation,
  useProposalVersions,
  useStages,
} from "../../index.js"
import {
  ProposalClientCard,
  ProposalLineItemsCard,
  ProposalMediaCard,
  ProposalOwnershipCard,
  ProposalTravelersCard,
} from "../proposal-content-sections.js"
import {
  hasProposalSnapshotChanges,
  shouldAcceptCurrentSentVersion,
} from "../proposal-detail-save-model.js"
import {
  ProposalActivitiesCard,
  ProposalDetailsCard,
  ProposalTagsCard,
} from "../proposal-detail-sections.js"
import { ProposalPaymentTermsCard } from "../proposal-payment-terms-card.js"
import { getProposalShareState } from "../proposal-share-state.js"

interface DraftLineItem {
  id: string
  isNew: boolean
  nameSnapshot: string
  description: string | null
  quantity: number
  unitPriceAmountCents: number | null
  currency: string | null
}

interface DraftTraveler {
  id: string
  isNew: boolean
  personId: string
  isPrimary: boolean
}

interface ProposalDraft {
  title: string
  stageId: string
  status: string
  valueCurrency: string | null
  expectedCloseDate: string | null
  source: string | null
  description: string | null
  lostReason: string | null
  personId: string | null
  organizationId: string | null
  ownerId: string | null
  paxCount: number | null
  tags: string[]
  lineItems: DraftLineItem[]
  travelers: DraftTraveler[]
}

function buildDraft(
  proposal: ProposalRecord,
  products: ProposalProductRecord[],
  travelers: ProposalParticipantRecord[],
): ProposalDraft {
  return {
    title: proposal.title,
    stageId: proposal.stageId,
    status: proposal.status,
    valueCurrency: proposal.valueCurrency,
    expectedCloseDate: proposal.expectedCloseDate,
    source: proposal.source,
    description: proposal.description,
    lostReason: proposal.lostReason,
    personId: proposal.personId,
    organizationId: proposal.organizationId,
    ownerId: proposal.ownerId,
    paxCount: proposal.paxCount,
    tags: proposal.tags,
    lineItems: products.map((product) => ({
      id: product.id,
      isNew: false,
      nameSnapshot: product.nameSnapshot,
      description: product.description,
      quantity: product.quantity,
      unitPriceAmountCents: product.unitPriceAmountCents,
      currency: product.currency,
    })),
    travelers: travelers.map((traveler) => ({
      id: traveler.id,
      isNew: false,
      personId: traveler.personId,
      isPrimary: traveler.isPrimary,
    })),
  }
}

/** Order-stable signature for the dirty check (ignores temp ids of new rows). */
function serializeDraft(draft: ProposalDraft): string {
  return JSON.stringify({
    title: draft.title,
    stageId: draft.stageId,
    status: draft.status,
    valueCurrency: draft.valueCurrency,
    expectedCloseDate: draft.expectedCloseDate,
    source: draft.source,
    description: draft.description,
    lostReason: draft.lostReason,
    personId: draft.personId,
    organizationId: draft.organizationId,
    ownerId: draft.ownerId,
    paxCount: draft.paxCount,
    tags: [...draft.tags].sort(),
    lineItems: draft.lineItems.map((line) => ({
      id: line.isNew ? null : line.id,
      n: line.nameSnapshot,
      d: line.description,
      q: line.quantity,
      u: line.unitPriceAmountCents,
      c: line.currency,
    })),
    travelers: [...draft.travelers.map((traveler) => traveler.personId)].sort(),
  })
}

/**
 * Packaged admin page for a single Proposal (packaged-admin RFC Phase 3). The
 * detail is a STAGED editor: every card edits a local draft and nothing
 * persists until "Save", which commits the proposal fields, line-item and
 * traveler diffs, then snapshots a new proposal version that supersedes the
 * prior one. "Discard" reverts to the loaded state. The proposal value is derived
 * from the draft's line items. Client/owner data flows through
 * relationships-react / auth-react; links resolve via the shared
 * `person.detail` / `organization.detail` semantic destinations.
 */
// fallow-ignore-next-line unused-export
export default function ProposalDetailPage({ params }: AdminRoutePageProps) {
  const id = params.id ?? ""
  const i18n = useCrmUiI18nOrDefault()
  const { messages } = i18n
  const t = messages.proposalDetailPage
  const navigate = useAdminNavigate()

  const [showLostDialog, setShowLostDialog] = useState(false)
  const [lostReasonDraft, setLostReasonDraft] = useState("")
  const [draft, setDraft] = useState<ProposalDraft | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const proposalQuery = useProposal(id)
  const proposal = proposalQuery.data
  const { update, remove } = useProposalMutation()
  const versionMutation = useProposalVersionMutation()
  const productMutation = useProposalProductMutation()
  const participantMutation = useProposalParticipantMutation()
  const mediaMutation = useProposalMediaMutation()

  const stagesQuery = useStages({
    pipelineId: proposal?.pipelineId,
    limit: 100,
    enabled: Boolean(proposal?.pipelineId),
  })
  const versionsQuery = useProposalVersions({
    proposalId: id,
    limit: 50,
    enabled: Boolean(proposal),
  })
  const activitiesQuery = useActivities({
    entityType: "proposal",
    entityId: id,
    limit: 50,
    enabled: Boolean(proposal),
  })
  const productsQuery = useProposalProducts(id, { enabled: Boolean(proposal) })
  const participantsQuery = useProposalParticipants(id, { enabled: Boolean(proposal) })
  const mediaQuery = useProposalMedia(id, { enabled: Boolean(proposal) })

  const products = useMemo(() => productsQuery.data?.data ?? [], [productsQuery.data])
  const travelers = useMemo(() => participantsQuery.data?.data ?? [], [participantsQuery.data])

  // The draft built from the server's current state. Draft edits diverge from
  // this until Save; the server signature resyncs the draft after a save lands.
  const serverDraft = useMemo(
    () => (proposal ? buildDraft(proposal, products, travelers) : null),
    [proposal, products, travelers],
  )
  const serverSignature = serverDraft ? serializeDraft(serverDraft) : null
  const syncedRef = useRef<string | null>(null)

  // Resync the draft to the server whenever the server state changes (initial
  // load, and after a save commits) — but never mid-save, which would clobber
  // pending edits as each mutation invalidates queries.
  useEffect(() => {
    if (isSaving || !serverDraft || serverSignature === null) return
    if (serverSignature !== syncedRef.current) {
      syncedRef.current = serverSignature
      setDraft(serverDraft)
    }
  }, [isSaving, serverDraft, serverSignature])

  // Person/org records resolve from the DRAFT ids so the client card reflects
  // a freshly-picked (unsaved) selection immediately.
  const personQuery = usePerson(draft?.personId ?? undefined, {
    enabled: Boolean(draft?.personId),
  })
  const organizationQuery = useOrganization(draft?.organizationId ?? undefined, {
    enabled: Boolean(draft?.organizationId),
  })

  const versions = versionsQuery.data?.data ?? []
  const versionNumberById = new Map<string, number>()
  ;[...versions]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .forEach((version, index) => {
      versionNumberById.set(version.id, index + 1)
    })
  const orderedVersions = [...versions].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )
  const currentVersion =
    orderedVersions.find((version) => version.status === "draft" || version.status === "sent") ??
    null
  const currentVersionId = currentVersion?.id ?? null
  const proposalShareState = currentVersion ? getProposalShareState(currentVersion, t) : null

  const stages = useMemo(
    () => [...(stagesQuery.data?.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [stagesQuery.data],
  )

  const goToList = () => navigate("proposal.list", {})

  if (proposalQuery.isPending) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!proposal) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-muted-foreground">{t.notFound}</p>
        <Button variant="outline" onClick={goToList}>
          {t.back}
        </Button>
      </div>
    )
  }

  // Proposal loaded but the draft is still being initialized from it (one tick).
  if (!draft) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const currentDraft = draft
  const loadedProposal = proposal
  const patchDraft = (patch: Partial<ProposalDraft>) =>
    setDraft((previous) => (previous ? { ...previous, ...patch } : previous))

  const itemsTotalCents = currentDraft.lineItems.reduce(
    (sum, line) => sum + line.quantity * (line.unitPriceAmountCents ?? 0),
    0,
  )
  const isDirty = serverDraft ? serializeDraft(currentDraft) !== serializeDraft(serverDraft) : false

  // Synthetic records so the (presentational) cards can render the draft.
  const draftLineItems: ProposalProductRecord[] = currentDraft.lineItems.map((line) => ({
    id: line.id,
    proposalId: id,
    productId: null,
    supplierServiceId: null,
    nameSnapshot: line.nameSnapshot,
    description: line.description,
    quantity: line.quantity,
    unitPriceAmountCents: line.unitPriceAmountCents,
    costAmountCents: null,
    currency: line.currency,
    discountAmountCents: null,
    createdAt: "",
    updatedAt: "",
  }))
  const draftTravelers: ProposalParticipantRecord[] = currentDraft.travelers.map((traveler) => ({
    id: traveler.id,
    proposalId: id,
    personId: traveler.personId,
    role: "traveler",
    isPrimary: traveler.isPrimary,
    createdAt: "",
  }))

  function markWon() {
    const wonStage = stages.find((stage) => stage.isWon)
    patchDraft({ status: "won", ...(wonStage ? { stageId: wonStage.id } : {}) })
  }

  function submitLost() {
    const lostStage = stages.find((stage) => stage.isLost)
    patchDraft({
      status: "lost",
      lostReason: lostReasonDraft.trim() || null,
      ...(lostStage ? { stageId: lostStage.id } : {}),
    })
    setShowLostDialog(false)
    setLostReasonDraft("")
  }

  function reopen() {
    patchDraft({ status: "open", lostReason: null })
  }

  function discard() {
    if (serverDraft) setDraft(serverDraft)
  }

  async function shareProposal() {
    if (!currentVersion) return
    try {
      // Always copy the deployment-resolved public proposal URL (the public
      // origin can differ from the admin origin). Draft → send returns it;
      // an already-sent version resolves it via the side-effect-free link route.
      const sent =
        currentVersion.status === "draft"
          ? await versionMutation.sendProposal.mutateAsync({ id: currentVersion.id })
          : null
      const result =
        sent ?? (await versionMutation.fetchProposalLink.mutateAsync({ id: currentVersion.id }))
      const url = result.proposalUrl?.startsWith("http")
        ? result.proposalUrl
        : `${window.location.origin}/proposal/${currentVersion.id}`
      await navigator.clipboard?.writeText(url).catch(() => {})
      toast.success(t.proposalLinkCopied)
      // The link is live either way, but a version with no frozen Trip
      // snapshot can never be accepted — say so now, to the only person who
      // can fix it, rather than leaving the customer to hit a 409.
      for (const warning of sent?.warnings ?? []) {
        toast.warning(warning.message)
      }
    } catch {
      toast.error(t.proposalSendFailed)
    }
  }

  async function save() {
    if (isSaving) return
    setIsSaving(true)
    try {
      // 1. Proposal fields — full payload so the partial-update schema doesn't
      // inject insert defaults (status/tags) and clobber them.
      await update.mutateAsync({
        id,
        input: {
          title: currentDraft.title,
          pipelineId: loadedProposal.pipelineId,
          stageId: currentDraft.stageId,
          status: currentDraft.status,
          personId: currentDraft.personId,
          organizationId: currentDraft.organizationId,
          ownerId: currentDraft.ownerId,
          valueCurrency: currentDraft.valueCurrency,
          expectedCloseDate: currentDraft.expectedCloseDate,
          source: currentDraft.source,
          description: currentDraft.description,
          lostReason: currentDraft.lostReason,
          tags: currentDraft.tags,
          paxCount: currentDraft.paxCount,
        },
      })

      // 2. Line-item diff
      for (const serverItem of products) {
        if (!currentDraft.lineItems.some((line) => !line.isNew && line.id === serverItem.id)) {
          await productMutation.remove.mutateAsync({ id: serverItem.id, proposalId: id })
        }
      }
      for (const line of currentDraft.lineItems) {
        if (line.isNew) {
          await productMutation.create.mutateAsync({
            proposalId: id,
            input: {
              nameSnapshot: line.nameSnapshot,
              description: line.description,
              quantity: line.quantity,
              unitPriceAmountCents: line.unitPriceAmountCents,
              currency: line.currency,
            },
          })
          continue
        }
        const serverItem = products.find((product) => product.id === line.id)
        const changed =
          serverItem &&
          (serverItem.nameSnapshot !== line.nameSnapshot ||
            (serverItem.description ?? null) !== (line.description ?? null) ||
            serverItem.quantity !== line.quantity ||
            (serverItem.unitPriceAmountCents ?? null) !== (line.unitPriceAmountCents ?? null) ||
            (serverItem.currency ?? null) !== (line.currency ?? null))
        if (changed) {
          await productMutation.update.mutateAsync({
            id: line.id,
            proposalId: id,
            input: {
              nameSnapshot: line.nameSnapshot,
              description: line.description,
              quantity: line.quantity,
              unitPriceAmountCents: line.unitPriceAmountCents,
              currency: line.currency,
            },
          })
        }
      }

      // 3. Traveler diff
      for (const serverTraveler of travelers) {
        if (!currentDraft.travelers.some((tv) => !tv.isNew && tv.id === serverTraveler.id)) {
          await participantMutation.remove.mutateAsync({ id: serverTraveler.id, proposalId: id })
        }
      }
      for (const traveler of currentDraft.travelers) {
        if (traveler.isNew) {
          await participantMutation.create.mutateAsync({
            proposalId: id,
            input: { personId: traveler.personId, role: "traveler" },
          })
        }
      }

      const proposalSnapshotChanged = serverDraft
        ? hasProposalSnapshotChanges(serverDraft, currentDraft)
        : true
      const acceptCurrentSentVersion = shouldAcceptCurrentSentVersion({
        previousStatus: loadedProposal.status,
        nextStatus: currentDraft.status,
        acceptedVersionId: loadedProposal.acceptedVersionId,
        currentVersionStatus: currentVersion?.status ?? null,
        proposalSnapshotChanged,
      })

      // 4. Snapshot only when proposal content changed. Deal-only saves (for
      // example Mark won) must not expire a sent proposal and create a draft.
      if (proposalSnapshotChanged) {
        await versionMutation.snapshot.mutateAsync({ proposalId: id })
      } else if (acceptCurrentSentVersion && currentVersionId) {
        await versionMutation.accept.mutateAsync(currentVersionId)
      }
      toast.success(t.saveSuccess)
    } catch {
      toast.error(t.saveError)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background px-6 py-3">
        <Button variant="ghost" size="icon" onClick={goToList} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <button type="button" onClick={goToList} className="hover:text-foreground">
            {t.breadcrumbRoot}
          </button>
          <span>/</span>
          <span className="truncate text-foreground">{currentDraft.title}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {currentDraft.status === "open" ? (
            <>
              <Button size="sm" variant="outline" onClick={markWon} disabled={isSaving}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                {t.markWon}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowLostDialog(true)}
                disabled={isSaving}
              >
                <Ban className="mr-1.5 h-4 w-4" />
                {t.markLost}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={reopen} disabled={isSaving}>
              {t.reopen}
            </Button>
          )}
          {isDirty ? (
            <Button size="sm" variant="ghost" onClick={discard} disabled={isSaving}>
              {t.discard}
            </Button>
          ) : null}
          <Button size="sm" onClick={() => void save()} disabled={!isDirty || isSaving}>
            {isSaving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            {t.save}
          </Button>
          <ConfirmActionButton
            buttonLabel={t.delete}
            confirmLabel={t.deleteConfirm.confirm}
            cancelLabel={messages.common.cancel}
            title={t.deleteConfirm.title}
            description={t.deleteConfirm.description}
            variant="destructive"
            confirmVariant="destructive"
            disabled={remove.isPending || isSaving}
            onConfirm={async () => {
              await remove.mutateAsync(id)
              goToList()
            }}
          />
        </div>
      </div>

      <div className="grid flex-1 grid-cols-12 gap-4 p-4 lg:p-6">
        <aside className="col-span-12 flex flex-col gap-4 lg:col-span-4">
          <ProposalDetailsCard
            proposal={{
              ...proposal,
              title: currentDraft.title,
              stageId: currentDraft.stageId,
              status: currentDraft.status,
              valueAmountCents: itemsTotalCents,
              valueCurrency: currentDraft.valueCurrency,
              expectedCloseDate: currentDraft.expectedCloseDate,
              source: currentDraft.source,
              lostReason: currentDraft.lostReason,
            }}
            stages={stages}
            onUpdateField={async (patch) => patchDraft(patch as Partial<ProposalDraft>)}
          />
          <ProposalClientCard
            person={personQuery.data}
            organization={organizationQuery.data}
            busy={isSaving}
            onSetPerson={async (personId) => patchDraft({ personId })}
            onSetOrganization={async (organizationId) => patchDraft({ organizationId })}
            onOpenPerson={() => {
              if (currentDraft.personId)
                navigate("person.detail", { personId: currentDraft.personId })
            }}
            onOpenOrganization={() => {
              if (currentDraft.organizationId) {
                navigate("organization.detail", { organizationId: currentDraft.organizationId })
              }
            }}
          />
          <ProposalTravelersCard
            travelers={draftTravelers}
            paxCount={currentDraft.paxCount}
            isPending={participantsQuery.isPending}
            busy={isSaving}
            onPaxCountChange={async (paxCount) => patchDraft({ paxCount })}
            onAdd={async (personId) =>
              patchDraft({
                travelers: [
                  ...currentDraft.travelers,
                  { id: `tmp_${crypto.randomUUID()}`, isNew: true, personId, isPrimary: false },
                ],
              })
            }
            onRemove={async (travelerId) =>
              patchDraft({
                travelers: currentDraft.travelers.filter((traveler) => traveler.id !== travelerId),
              })
            }
          />
          <ProposalOwnershipCard
            ownerId={currentDraft.ownerId}
            createdBy={proposal.createdBy}
            updatedBy={proposal.updatedBy}
            createdAt={proposal.createdAt}
            updatedAt={proposal.updatedAt}
            busy={isSaving}
            onSetOwner={async (ownerId) => patchDraft({ ownerId })}
          />
          <ProposalTagsCard
            tags={currentDraft.tags}
            onChange={async (tags) => patchDraft({ tags })}
          />
        </aside>

        <main className="col-span-12 flex flex-col gap-4 lg:col-span-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>{t.descriptionTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={currentDraft.description ?? ""}
                onChange={(event) =>
                  patchDraft({ description: event.target.value === "" ? null : event.target.value })
                }
                placeholder={t.descriptionPlaceholder}
                rows={4}
                disabled={isSaving}
              />
            </CardContent>
          </Card>
          <ProposalMediaCard
            media={mediaQuery.data?.data ?? []}
            isPending={mediaQuery.isPending}
            busy={mediaMutation.upload.isPending || mediaMutation.remove.isPending}
            onUploadFiles={async (files) => {
              for (const file of Array.from(files)) {
                await mediaMutation.upload.mutateAsync({ proposalId: id, file })
              }
            }}
            onRemove={async (mediaId) => {
              await mediaMutation.remove.mutateAsync({ id: mediaId, proposalId: id })
            }}
          />
          <ProposalLineItemsCard
            products={draftLineItems}
            isPending={productsQuery.isPending}
            currency={currentDraft.valueCurrency ?? "USD"}
            busy={isSaving}
            onAdd={async (input) =>
              patchDraft({
                lineItems: [
                  ...currentDraft.lineItems,
                  {
                    id: `tmp_${crypto.randomUUID()}`,
                    isNew: true,
                    nameSnapshot: input.nameSnapshot,
                    description: input.description ?? null,
                    quantity: input.quantity ?? 1,
                    unitPriceAmountCents: input.unitPriceAmountCents ?? null,
                    currency: input.currency ?? null,
                  },
                ],
              })
            }
            onUpdate={async (lineId, input) =>
              patchDraft({
                lineItems: currentDraft.lineItems.map((line) =>
                  line.id === lineId
                    ? {
                        ...line,
                        ...(input.nameSnapshot !== undefined
                          ? { nameSnapshot: input.nameSnapshot }
                          : {}),
                        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
                        ...(input.unitPriceAmountCents !== undefined
                          ? { unitPriceAmountCents: input.unitPriceAmountCents }
                          : {}),
                      }
                    : line,
                ),
              })
            }
            onRemove={async (lineId) =>
              patchDraft({
                lineItems: currentDraft.lineItems.filter((line) => line.id !== lineId),
              })
            }
          />
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <CardTitle>{t.versionsTitle}</CardTitle>
                {proposalShareState?.notice ? (
                  <p className="text-muted-foreground text-sm">{proposalShareState.notice}</p>
                ) : null}
              </div>
              {currentVersion ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => void shareProposal()}
                  disabled={versionMutation.sendProposal.isPending}
                >
                  <Share2 className="mr-1.5 h-4 w-4" />
                  {proposalShareState?.actionLabel}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {versionsQuery.isError ? (
                <p className="py-6 text-center text-destructive text-sm">{t.versionsLoadFailed}</p>
              ) : versionsQuery.isPending ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : versions.length === 0 ? (
                <p className="py-6 text-center text-muted-foreground text-sm">{t.versionsEmpty}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{messages.proposalVersionsPage.columns.proposalVersion}</TableHead>
                      <TableHead>{messages.proposalVersionsPage.columns.status}</TableHead>
                      <TableHead>{messages.proposalVersionsPage.columns.total}</TableHead>
                      <TableHead>{messages.proposalVersionsPage.columns.validUntil}</TableHead>
                      <TableHead>{messages.proposalVersionsPage.columns.updated}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderedVersions.map((version) => (
                      <TableRow key={version.id}>
                        <TableCell className="font-medium">
                          {version.label ??
                            formatMessage(t.versionLabel, {
                              number: versionNumberById.get(version.id) ?? 0,
                            })}
                        </TableCell>
                        <TableCell>
                          {version.id === currentVersionId
                            ? t.versionActive
                            : (messages.common.proposalVersionStatusLabels[
                                version.status as CrmProposalVersionStatus
                              ] ?? version.status)}
                        </TableCell>
                        <TableCell>
                          {formatCrmMoney(i18n, version.totalAmountCents, version.currency)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {version.id === currentVersionId ? (
                            <DatePicker
                              value={version.validUntil}
                              onChange={(next) =>
                                void versionMutation.setValidUntil.mutateAsync({
                                  id: version.id,
                                  validUntil: next,
                                })
                              }
                              placeholder={
                                messages.createProposalVersionDialog.placeholders.pickDate
                              }
                              clearable
                            />
                          ) : version.validUntil ? (
                            formatCrmDate(i18n, version.validUntil)
                          ) : (
                            messages.common.none
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatCrmRelative(i18n, version.updatedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <ProposalPaymentTermsCard
            version={currentVersion ?? null}
            isSaving={versionMutation.update.isPending}
            onSave={({ id: versionId, paymentTerms }) =>
              versionMutation.update.mutateAsync({ id: versionId, input: { paymentTerms } })
            }
            messages={t.paymentTerms}
          />

          <ProposalActivitiesCard
            isPending={activitiesQuery.isPending}
            activities={activitiesQuery.data?.data ?? []}
          />
        </main>
      </div>

      <Dialog open={showLostDialog} onOpenChange={setShowLostDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.lostDialog.title}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <p className="text-muted-foreground text-sm">{t.lostDialog.description}</p>
            <Textarea
              value={lostReasonDraft}
              onChange={(event) => setLostReasonDraft(event.target.value)}
              placeholder={t.lostDialog.placeholder}
              rows={3}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowLostDialog(false)}>
              {messages.common.cancel}
            </Button>
            <Button size="sm" onClick={submitLost}>
              {t.lostDialog.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
