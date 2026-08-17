"use client"

import { useAdminNavigate } from "@voyant-travel/admin"
import { Card } from "@voyant-travel/ui/components"
import { InquiryWorkspace } from "../components/inquiry-workspace.js"
import { useInquiry } from "../hooks/use-inquiry.js"
import { useInquiryMutation } from "../hooks/use-inquiry-mutation.js"
import { useCrmUiMessagesOrDefault } from "../i18n/index.js"

export function InquiryDetailHost({ id }: { id: string }) {
  const navigate = useAdminNavigate()
  const query = useInquiry(id)
  const mutations = useInquiryMutation()
  const messages = useCrmUiMessagesOrDefault().inquiryDetail
  if (query.isPending) return <Card className="h-72 animate-pulse" />
  if (query.error || !query.data)
    return <Card className="p-8 text-center text-destructive">{messages.loadFailed}</Card>
  const key = () => crypto.randomUUID()
  return (
    <InquiryWorkspace
      inquiry={query.data}
      isSaving={mutations.update.isPending}
      onBack={() => navigate("inquiry.list", {})}
      onUpdate={(input) => mutations.update.mutateAsync({ id, input })}
      onAssign={(ownerId) => mutations.assign.mutateAsync({ id, ownerId })}
      onTransition={(status) => mutations.transition.mutateAsync({ id, status })}
      onClose={(outcome) => mutations.close.mutateAsync({ id, outcome })}
      onReopen={() => mutations.reopen.mutateAsync(id)}
      onConvertToProposal={() =>
        mutations.convert.mutateAsync({ id, input: { kind: "proposal", idempotencyKey: key() } })
      }
      onConvertToBookingSession={(targetLinkId) =>
        mutations.convert.mutateAsync({
          id,
          input: { kind: "booking_session", targetLinkId, idempotencyKey: key() },
        })
      }
    />
  )
}
