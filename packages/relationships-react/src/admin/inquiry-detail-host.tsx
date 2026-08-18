"use client"

import { useAdminNavigate } from "@voyant-travel/admin"
import { Card } from "@voyant-travel/ui/components"
import { InquiryWorkspace } from "../components/inquiry-workspace.js"
import { useInquiry } from "../hooks/use-inquiry.js"
import { useInquiryActivities } from "../hooks/use-inquiry-activities.js"
import { useInquiryMutation } from "../hooks/use-inquiry-mutation.js"
import { useCrmUiMessagesOrDefault } from "../i18n/index.js"
import { proposalDestinationForConversion } from "../inquiry-proposal-conversion.js"

export function InquiryDetailHost({ id }: { id: string }) {
  const navigate = useAdminNavigate()
  const navigateOptional = navigate as (destination: string, params: unknown) => void
  const query = useInquiry(id)
  const activities = useInquiryActivities(id)
  const mutations = useInquiryMutation()
  const messages = useCrmUiMessagesOrDefault().inquiryDetail
  if (query.isPending) return <Card className="h-72 animate-pulse" />
  if (query.error || !query.data)
    return <Card className="p-8 text-center text-destructive">{messages.loadFailed}</Card>
  return (
    <InquiryWorkspace
      inquiry={query.data}
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
