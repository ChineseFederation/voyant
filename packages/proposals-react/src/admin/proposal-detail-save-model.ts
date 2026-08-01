export interface ProposalDetailProposalSnapshotDraft {
  title: string
  valueCurrency: string | null
  description: string | null
  lineItems: ReadonlyArray<{
    id: string
    isNew: boolean
    nameSnapshot: string
    description: string | null
    quantity: number
    unitPriceAmountCents: number | null
    currency: string | null
  }>
}

export interface ProposalDetailManualAcceptInput {
  previousStatus: string
  nextStatus: string
  acceptedVersionId: string | null
  currentVersionStatus: string | null
  proposalSnapshotChanged: boolean
}

export function serializeProposalSnapshotDraft(draft: ProposalDetailProposalSnapshotDraft): string {
  return JSON.stringify({
    title: draft.title,
    valueCurrency: draft.valueCurrency,
    description: draft.description,
    lineItems: draft.lineItems.map((line) => ({
      id: line.isNew ? null : line.id,
      n: line.nameSnapshot,
      d: line.description,
      q: line.quantity,
      u: line.unitPriceAmountCents,
      c: line.currency,
    })),
  })
}

export function hasProposalSnapshotChanges(
  previous: ProposalDetailProposalSnapshotDraft,
  next: ProposalDetailProposalSnapshotDraft,
): boolean {
  return serializeProposalSnapshotDraft(previous) !== serializeProposalSnapshotDraft(next)
}

export function shouldAcceptCurrentSentVersion(input: ProposalDetailManualAcceptInput): boolean {
  return (
    input.previousStatus !== "won" &&
    input.nextStatus === "won" &&
    input.acceptedVersionId === null &&
    input.currentVersionStatus === "sent" &&
    !input.proposalSnapshotChanged
  )
}
