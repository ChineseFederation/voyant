"use client"

import { useAdminNavigate } from "@voyant-travel/admin"
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import { Loader2, Plus, Settings2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { ProposalsBoard } from "../components/proposals-board.js"
import { useCrmUiMessagesOrDefault } from "../i18n/index.js"
import {
  CreateProposalDialog,
  type ProposalRecord,
  usePipelines,
  useProposals,
  useStages,
} from "../index.js"
import { CreatePipelineDialog, ManageStagesDialog } from "./pipeline-dialogs.js"

/**
 * Packaged admin host for the Proposals board (packaged-admin RFC Phase 3). The
 * landing surface for the proposals domain: pick a pipeline, manage its stages,
 * create proposals, and open a proposal's detail (where its versions live). All
 * data flows through the shared `@voyant-travel/react` provider context
 * mounted by the workspace shell; cross-route links resolve through the
 * `proposal.detail` semantic destination.
 */
export function ProposalsBoardHost() {
  const messages = useCrmUiMessagesOrDefault()
  const t = messages.proposalsBoardPage
  const navigate = useAdminNavigate()

  const pipelinesQuery = usePipelines({ entityType: "proposal", limit: 50 })
  const pipelines = pipelinesQuery.data?.data ?? []
  const defaultPipelineId =
    (pipelines.find((pipeline) => pipeline.isDefault) ?? pipelines[0])?.id ?? null

  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(defaultPipelineId)
  const [showCreatePipeline, setShowCreatePipeline] = useState(false)
  const [showManageStages, setShowManageStages] = useState(false)
  const [showCreateProposal, setShowCreateProposal] = useState(false)

  useEffect(() => {
    if (!selectedPipelineId && defaultPipelineId) {
      setSelectedPipelineId(defaultPipelineId)
      return
    }
    if (selectedPipelineId && !pipelines.some((pipeline) => pipeline.id === selectedPipelineId)) {
      setSelectedPipelineId(defaultPipelineId)
    }
  }, [defaultPipelineId, pipelines, selectedPipelineId])

  const stagesQuery = useStages({
    pipelineId: selectedPipelineId ?? undefined,
    limit: 100,
    enabled: Boolean(selectedPipelineId),
  })
  const proposalsQuery = useProposals({
    pipelineId: selectedPipelineId ?? undefined,
    status: "open",
    limit: 100,
    enabled: Boolean(selectedPipelineId),
  })

  const stages = useMemo(
    () =>
      [...(stagesQuery.data?.data ?? [])].sort((left, right) => left.sortOrder - right.sortOrder),
    [stagesQuery.data],
  )
  const proposals = proposalsQuery.data?.data ?? []

  const proposalsByStage = useMemo(() => {
    const map = new Map<string, ProposalRecord[]>()
    for (const stage of stages) map.set(stage.id, [])
    for (const proposal of proposals) {
      map.get(proposal.stageId)?.push(proposal)
    }
    return map
  }, [stages, proposals])

  const openProposal = (proposalId: string) => navigate("proposal.detail", { proposalId })

  return (
    <div className="flex h-full min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-bold text-2xl tracking-tight">{t.title}</h1>
          <p className="text-muted-foreground text-sm">{t.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={selectedPipelineId ?? undefined}
            onValueChange={(value) => setSelectedPipelineId(value)}
            disabled={pipelinesQuery.isPending || pipelines.length === 0}
          >
            <SelectTrigger className="w-[200px] text-sm">
              <SelectValue placeholder={t.selectPipelinePlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map((pipeline) => (
                <SelectItem key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                  {pipeline.isDefault ? t.defaultSuffix : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreatePipeline(true)}
            disabled={pipelinesQuery.isPending}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t.newPipeline}
          </Button>
          {selectedPipelineId ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowManageStages(true)}
                disabled={stagesQuery.isPending}
              >
                <Settings2 className="mr-1.5 h-4 w-4" />
                {t.manageStages}
              </Button>
              <Button
                size="sm"
                onClick={() => setShowCreateProposal(true)}
                disabled={stagesQuery.isPending || stages.length === 0}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                {t.newProposal}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {pipelinesQuery.isPending ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : pipelines.length === 0 ? (
        <EmptyState title={t.emptyNoPipelines.title} description={t.emptyNoPipelines.description} />
      ) : !selectedPipelineId ? null : stagesQuery.isPending ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : stages.length === 0 ? (
        <EmptyState title={t.emptyNoStages.title} description={t.emptyNoStages.description} />
      ) : (
        <ProposalsBoard
          stages={stages}
          proposalsByStage={proposalsByStage}
          onProposalOpen={(proposal) => openProposal(proposal.id)}
        />
      )}

      <CreatePipelineDialog
        open={showCreatePipeline}
        onOpenChange={setShowCreatePipeline}
        existingCount={pipelines.length}
        onCreated={(pipelineId) => {
          setSelectedPipelineId(pipelineId)
          setShowCreatePipeline(false)
        }}
      />
      {selectedPipelineId ? (
        <>
          <ManageStagesDialog
            open={showManageStages}
            onOpenChange={setShowManageStages}
            pipelineId={selectedPipelineId}
            stages={stages}
          />
          <CreateProposalDialog
            open={showCreateProposal}
            onOpenChange={setShowCreateProposal}
            pipelineId={selectedPipelineId}
            stages={stages}
            onCreated={(proposalId) => {
              setShowCreateProposal(false)
              openProposal(proposalId)
            }}
          />
        </>
      ) : null}
    </div>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 py-12 text-center">
      <p className="font-medium text-sm">{title}</p>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  )
}
