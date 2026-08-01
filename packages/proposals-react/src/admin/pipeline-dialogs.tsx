"use client"

import {
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@voyant-travel/ui/components"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useCrmUiMessagesOrDefault } from "../i18n/index.js"
import { type StageRecord, usePipelineMutation } from "../index.js"

export interface CreatePipelineDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingCount: number
  onCreated: (pipelineId: string) => void
}

export function CreatePipelineDialog({
  open,
  onOpenChange,
  existingCount,
  onCreated,
}: CreatePipelineDialogProps) {
  const messages = useCrmUiMessagesOrDefault()
  const t = messages.createPipelineDialog
  const { createPipeline } = usePipelineMutation()
  const [name, setName] = useState("")
  const [isDefault, setIsDefault] = useState(existingCount === 0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName("")
      setIsDefault(existingCount === 0)
      setError(null)
    }
  }, [open, existingCount])

  async function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t.validation.nameRequired)
      return
    }
    setError(null)
    try {
      const created = await createPipeline.mutateAsync({
        name: trimmed,
        entityType: "proposal",
        isDefault,
      })
      onCreated(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.validation.createFailed)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pipeline-name">{t.nameLabel}</Label>
            <Input
              id="pipeline-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t.namePlaceholder}
              autoFocus
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="pipeline-default"
              checked={isDefault}
              onCheckedChange={(checked) => setIsDefault(checked === true)}
            />
            <Label htmlFor="pipeline-default" className="font-normal text-sm">
              {t.setDefault}
            </Label>
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {messages.common.cancel}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={createPipeline.isPending}>
            {createPipeline.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {messages.common.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export interface ManageStagesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pipelineId: string
  stages: StageRecord[]
}

export function ManageStagesDialog({
  open,
  onOpenChange,
  pipelineId,
  stages,
}: ManageStagesDialogProps) {
  const messages = useCrmUiMessagesOrDefault()
  const t = messages.manageStagesDialog
  const { createStage, updateStage, removeStage } = usePipelineMutation()
  const [newName, setNewName] = useState("")
  const [newProbability, setNewProbability] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setNewName("")
      setNewProbability("")
      setError(null)
    }
  }, [open])

  async function handleAdd() {
    const trimmed = newName.trim()
    if (!trimmed) {
      setError(t.validation.nameRequired)
      return
    }
    const probability = newProbability.trim()
      ? Math.max(0, Math.min(100, Number.parseInt(newProbability, 10) || 0))
      : null
    setError(null)
    try {
      await createStage.mutateAsync({
        pipelineId,
        name: trimmed,
        sortOrder: stages.length,
        probability,
      })
      setNewName("")
      setNewProbability("")
    } catch (err) {
      setError(err instanceof Error ? err.message : t.validation.addFailed)
    }
  }

  async function handleRename(stageId: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await updateStage.mutateAsync({ id: stageId, input: { name: trimmed } })
    } catch {
      // invalidation restores server state
    }
  }

  async function handleRemove(stageId: string) {
    try {
      await removeStage.mutateAsync(stageId)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.validation.removeFailed)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3 py-2">
          {stages.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t.empty}</p>
          ) : (
            <ul className="divide-y rounded border">
              {stages.map((stage) => (
                <li key={stage.id} className="flex items-center gap-2 px-2 py-1.5">
                  <Input
                    defaultValue={stage.name}
                    className="h-8 flex-1 text-sm"
                    onBlur={(event) => {
                      const value = event.target.value.trim()
                      if (value && value !== stage.name) void handleRename(stage.id, value)
                    }}
                  />
                  <span className="w-10 text-right text-muted-foreground text-xs">
                    {stage.probability != null ? `${stage.probability}%` : messages.common.none}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => void handleRemove(stage.id)}
                    disabled={removeStage.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-2 rounded border p-2">
            <p className="font-medium text-muted-foreground text-xs">{t.addStageTitle}</p>
            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder={t.stageNamePlaceholder}
                className="h-8 flex-1 text-sm"
              />
              <Input
                value={newProbability}
                onChange={(event) => setNewProbability(event.target.value)}
                placeholder={t.probabilityPlaceholder}
                type="number"
                min={0}
                max={100}
                className="h-8 w-16 text-sm"
              />
              <Button size="sm" onClick={() => void handleAdd()} disabled={createStage.isPending}>
                {createStage.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>

          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {messages.common.done}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
