# @voyant-travel/proposals-react

React hooks, query keys, providers, and reusable UI for the Proposals module:
pipelines, stages, proposals, proposal versions, proposal lifecycle decisions, and
proposal version lines.

People and organizations are represented by ids on proposal records. Use
`@voyant-travel/relationships-react` for person and organization UI.

## Install

```bash
pnpm add @voyant-travel/proposals-react @voyant-travel/proposals @tanstack/react-query react react-dom zod
```

## Usage

```tsx
import { ProposalsBoard, VoyantProvider, useProposals, useStages } from "@voyant-travel/proposals-react"

function ProposalPipeline({ pipelineId }: { pipelineId: string }) {
  const { data: stages } = useStages({ pipelineId })
  const { data: proposals } = useProposals({ pipelineId })
  const proposalsByStage = new Map(
    (stages?.data ?? []).map((stage) => [
      stage.id,
      (proposals?.data ?? []).filter((proposal) => proposal.stageId === stage.id),
    ]),
  )

  return <ProposalsBoard stages={stages?.data ?? []} proposalsByStage={proposalsByStage} />
}
```

Styled components require the optional `@voyant-travel/ui` peer.

## License

Apache-2.0
