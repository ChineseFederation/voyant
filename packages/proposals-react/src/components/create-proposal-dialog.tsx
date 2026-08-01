import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useCrmUiMessagesOrDefault } from "../i18n/index.js"
import { type StageRecord, useProposalMutation } from "../index.js"

export interface CreateProposalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pipelineId: string
  stages: StageRecord[]
  onCreated: (id: string) => void
}

export function CreateProposalDialog({
  open,
  onOpenChange,
  pipelineId,
  stages,
  onCreated,
}: CreateProposalDialogProps) {
  const { create } = useProposalMutation()
  const messages = useCrmUiMessagesOrDefault()
  const [title, setTitle] = useState("")
  const [stageId, setStageId] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTitle("")
      setStageId(stages[0]?.id ?? "")
      setError(null)
    }
  }, [open, stages])

  async function handleSubmit() {
    const trimmed = title.trim()
    if (!trimmed) {
      setError(messages.createProposalDialog.validation.titleRequired)
      return
    }
    if (!stageId) {
      setError(messages.createProposalDialog.validation.stageRequired)
      return
    }
    setError(null)
    try {
      const created = await create.mutateAsync({
        title: trimmed,
        pipelineId,
        stageId,
      })
      onCreated(created.id)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : messages.createProposalDialog.validation.createFailed,
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{messages.createProposalDialog.title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="registry-proposal-title">
              {messages.createProposalDialog.fields.title}
            </Label>
            <Input
              id="registry-proposal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={messages.createProposalDialog.placeholders.title}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="registry-proposal-stage">
              {messages.createProposalDialog.fields.stage}
            </Label>
            <Select
              items={stages.map((stage) => ({ label: stage.name, value: stage.id }))}
              value={stageId}
              onValueChange={(value) => setStageId(value ?? "")}
            >
              <SelectTrigger id="registry-proposal-stage" className="w-full">
                <SelectValue>
                  {(value) =>
                    stages.find((stage) => stage.id === value)?.name ??
                    messages.createProposalDialog.placeholders.stage
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {messages.common.cancel}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {messages.common.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
