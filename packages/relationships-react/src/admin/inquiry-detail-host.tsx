"use client"

import { useAdminNavigate } from "@voyant-travel/admin"
import { Card } from "@voyant-travel/ui/components"
import { useState } from "react"
import { InquiryTargetsSection } from "../components/inquiry-targets-section.js"
import { InquiryWorkspace } from "../components/inquiry-workspace.js"
import { useInquiry } from "../hooks/use-inquiry.js"
import { useInquiryActivities } from "../hooks/use-inquiry-activities.js"
import { useInquiryMutation } from "../hooks/use-inquiry-mutation.js"
import { useInquiryOwnerOptions } from "../hooks/use-inquiry-owner-options.js"
import {
  useInquiryProposalPipelines,
  useInquiryProposalStages,
} from "../hooks/use-inquiry-proposal-pipelines.js"
import { useInquiryTargetDepartures } from "../hooks/use-inquiry-target-departures.js"
import { useInquiryTargetProducts } from "../hooks/use-inquiry-target-products.js"
import { useCrmUiMessagesOrDefault } from "../i18n/index.js"
import { proposalDestinationForConversion } from "../inquiry-proposal-conversion.js"
import { unresolvedInquiryTargets } from "../inquiry-ui-model.js"
import { useVoyantContext } from "../provider.js"

export function InquiryDetailHost({ id }: { id: string }) {
  const navigate = useAdminNavigate()
  const { baseUrl } = useVoyantContext()
  const navigateOptional = navigate as (destination: string, params: unknown) => void
  const query = useInquiry(id)
  const activities = useInquiryActivities(id)
  const mutations = useInquiryMutation()
  const ownerOptions = useInquiryOwnerOptions()
  const messages = useCrmUiMessagesOrDefault().inquiryDetail
  const [productSearch, setProductSearch] = useState("")
  const [departureProductId, setDepartureProductId] = useState<string | null>(null)
  const products = useInquiryTargetProducts({ search: productSearch })
  // Resolved before the early returns: a hook cannot be called after one, and a
  // departure list is meaningless until a Product scopes it. Defaults to the
  // first attached Product so the common single-Product Inquiry needs no choice.
  const scopedProductId =
    departureProductId ??
    query.data?.targets.find((target) => target.kind === "product")?.targetId ??
    null
  const departures = useInquiryTargetDepartures({ productId: scopedProductId })
  const [proposalPipelineId, setProposalPipelineId] = useState<string | null>(null)
  const pipelines = useInquiryProposalPipelines()
  const stages = useInquiryProposalStages(proposalPipelineId)
  if (query.isPending) return <Card className="h-72 animate-pulse" />
  if (query.error || !query.data)
    return <Card className="p-8 text-center text-destructive">{messages.loadFailed}</Card>
  const inquiry = query.data
  const targetsResolved = inquiry.status === "closed" || inquiry.status === "converted"
  return (
    <InquiryWorkspace
      inquiry={inquiry}
      apiBaseUrl={baseUrl}
      ownerOptions={ownerOptions}
      proposalPipelines={pipelines.data ?? []}
      proposalStages={stages.data ?? []}
      onProposalPipelineChange={setProposalPipelineId}
      targetsSection={
        <InquiryTargetsSection
          targets={inquiry.targets}
          unresolved={unresolvedInquiryTargets(inquiry)}
          products={products.data ?? []}
          productSearch={productSearch}
          onProductSearchChange={setProductSearch}
          departures={departures.data ?? []}
          departureProductId={scopedProductId}
          onDepartureProductChange={setDepartureProductId}
          onAddTarget={(input) => mutations.addTarget.mutateAsync({ id, input })}
          onRemoveTarget={(linkId) => mutations.removeTarget.mutateAsync({ id, linkId })}
          readOnly={targetsResolved}
          isMutating={mutations.addTarget.isPending || mutations.removeTarget.isPending}
        />
      }
      activities={activities.data?.data ?? []}
      isSaving={mutations.update.isPending}
      onBack={() => navigate("inquiry.list", {})}
      onUpdate={(input) => mutations.update.mutateAsync({ id, input })}
      onAssign={(ownerId) => mutations.assign.mutateAsync({ id, input: { ownerId } })}
      onTransition={(input) => mutations.transition.mutateAsync({ id, input })}
      onClose={(input) => mutations.close.mutateAsync({ id, input })}
      onReopen={() => mutations.reopen.mutateAsync({ id })}
      onRecordFirstResponse={() => mutations.recordFirstResponse.mutateAsync({ id })}
      isRecordingFirstResponse={mutations.recordFirstResponse.isPending}
      onUploadAttachment={(file, caption) =>
        mutations.uploadAttachment.mutateAsync({ id, file, caption })
      }
      onUpdateAttachmentCaption={(linkId, caption) =>
        mutations.updateAttachment.mutateAsync({ id, linkId, caption })
      }
      onRemoveAttachment={(linkId) => mutations.removeAttachment.mutateAsync({ id, linkId })}
      isUploadingAttachment={mutations.uploadAttachment.isPending}
      isConverting={mutations.convertToProposal.isPending}
      isCreatingBookingSession={mutations.convertToBookingSession.isPending}
      onConvertToBookingSession={(input) =>
        mutations.convertToBookingSession.mutateAsync({ id, input })
      }
      onConvertToProposal={async (input) => {
        const outcome = await mutations.convertToProposal.mutateAsync({ id, input })
        const destination = proposalDestinationForConversion(outcome)
        if (destination) navigateOptional(destination.destination, destination.params)
        return outcome
      }}
      onRecordActivity={(input) => mutations.recordActivity.mutateAsync({ id, input })}
      isRecordingActivity={mutations.recordActivity.isPending}
    />
  )
}
