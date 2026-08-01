import type { ProposalVersionRecord } from "../schemas.js"

export interface ProposalShareMessages {
  sendToClient: string
  sendForReview: string
  copyReviewLink: string
  copyReviewOnlyLink: string
  reviewOnlyNotice: string
}

export interface ProposalShareState {
  actionLabel: string
  isReviewOnly: boolean
  notice: string | null
}

export function getProposalShareState(
  version: Pick<ProposalVersionRecord, "status" | "tripSnapshotId">,
  messages: ProposalShareMessages,
): ProposalShareState {
  const isReviewOnly = version.tripSnapshotId === null
  const isDraft = version.status === "draft"

  return {
    actionLabel: isDraft
      ? isReviewOnly
        ? messages.sendForReview
        : messages.sendToClient
      : isReviewOnly
        ? messages.copyReviewOnlyLink
        : messages.copyReviewLink,
    isReviewOnly,
    notice: isReviewOnly ? messages.reviewOnlyNotice : null,
  }
}
