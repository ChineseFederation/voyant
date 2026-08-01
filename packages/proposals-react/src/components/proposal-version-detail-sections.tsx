import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@voyant-travel/ui/components"
import { CurrencyInput } from "@voyant-travel/ui/components/currency-input"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useCrmUiI18nOrDefault } from "../i18n/index.js"
import type { ProposalVersionLineRecord } from "../index.js"
import { formatCrmMoney } from "./crm-format.js"

export interface ProposalVersionLinesCardProps {
  currency: string
  lines: ProposalVersionLineRecord[]
  isLoading: boolean
  onCreate: (input: {
    description: string
    currency: string
    quantity: number
    unitPriceAmountCents: number
    totalAmountCents: number
  }) => Promise<void>
  onUpdate: (
    lineId: string,
    input: Partial<{
      description: string
      quantity: number
      unitPriceAmountCents: number
      totalAmountCents: number
    }>,
  ) => Promise<void>
  onRemove: (lineId: string) => Promise<void>
}

export function ProposalVersionLinesCard({
  currency,
  lines,
  isLoading,
  onCreate,
  onUpdate,
  onRemove,
}: ProposalVersionLinesCardProps) {
  const i18n = useCrmUiI18nOrDefault()
  const { messages } = i18n
  const [newDescription, setNewDescription] = useState("")
  const [newQuantity, setNewQuantity] = useState("1")
  const [newPriceCents, setNewPriceCents] = useState<number | null>(0)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    const description = newDescription.trim()
    if (!description) {
      setError(messages.proposalVersionLinesCard.validation.descriptionRequired)
      return
    }
    const quantity = Number.parseInt(newQuantity, 10) || 1
    const price = newPriceCents ?? 0
    setAdding(true)
    setError(null)
    try {
      await onCreate({
        description,
        currency,
        quantity,
        unitPriceAmountCents: price,
        totalAmountCents: quantity * price,
      })
      setNewDescription("")
      setNewQuantity("1")
      setNewPriceCents(0)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : messages.proposalVersionLinesCard.validation.addFailed,
      )
    } finally {
      setAdding(false)
    }
  }

  const subtotal = lines.reduce((sum, line) => sum + line.totalAmountCents, 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">
          {messages.proposalVersionLinesCard.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : lines.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {messages.proposalVersionLinesCard.empty}
          </p>
        ) : (
          <ul className="divide-y">
            {lines.map((line) => (
              <ProposalVersionLineRow
                key={line.id}
                currency={currency}
                line={line}
                onUpdate={(input) => onUpdate(line.id, input)}
                onRemove={() => onRemove(line.id)}
              />
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-col gap-2 border-t pt-3">
          <div className="grid grid-cols-12 gap-2">
            <Input
              className="col-span-6 h-8 text-sm"
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              placeholder={messages.proposalVersionLinesCard.fields.description}
            />
            <Input
              className="col-span-2 h-8 text-sm"
              type="number"
              min={1}
              value={newQuantity}
              onChange={(event) => setNewQuantity(event.target.value)}
              placeholder={messages.proposalVersionLinesCard.fields.quantity}
            />
            <CurrencyInput
              className="col-span-3 h-8 text-sm"
              inputClassName="h-8 text-sm"
              value={newPriceCents}
              onChange={setNewPriceCents}
              currency={currency}
              placeholder={messages.proposalVersionLinesCard.fields.priceCents}
            />
            <Button
              size="sm"
              className="col-span-1 h-8"
              onClick={() => void handleAdd()}
              disabled={adding}
              aria-label={messages.common.create}
            >
              {adding ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="size-3.5" aria-hidden="true" />
              )}
            </Button>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">
            {messages.proposalVersionLinesCard.subtotal}
          </span>
          <span className="font-semibold">{formatCrmMoney(i18n, subtotal, currency)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function ProposalVersionLineRow({
  currency,
  line,
  onUpdate,
  onRemove,
}: {
  currency: string
  line: ProposalVersionLineRecord
  onUpdate: (input: {
    description?: string
    quantity?: number
    unitPriceAmountCents?: number
    totalAmountCents?: number
  }) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const i18n = useCrmUiI18nOrDefault()
  const [removing, setRemoving] = useState(false)
  const [draftPriceCents, setDraftPriceCents] = useState<number | null>(line.unitPriceAmountCents)

  useEffect(() => {
    setDraftPriceCents(line.unitPriceAmountCents)
  }, [line.unitPriceAmountCents])

  async function handleRemove() {
    setRemoving(true)
    try {
      await onRemove()
    } finally {
      setRemoving(false)
    }
  }

  async function handleQuantity(value: string) {
    const quantity = Number.parseInt(value, 10)
    if (!Number.isFinite(quantity) || quantity < 1) return
    await onUpdate({
      quantity,
      totalAmountCents: quantity * line.unitPriceAmountCents,
    })
  }

  async function handlePrice(value: number | null) {
    if (value == null || value < 0 || value === line.unitPriceAmountCents) return
    await onUpdate({
      unitPriceAmountCents: value,
      totalAmountCents: line.quantity * value,
    })
  }

  return (
    <li className="py-2">
      <div className="grid grid-cols-12 items-center gap-2">
        <Input
          className="col-span-6 h-8 text-sm"
          defaultValue={line.description}
          onBlur={(event) => {
            const value = event.target.value.trim()
            if (value && value !== line.description) {
              void onUpdate({ description: value })
            }
          }}
        />
        <Input
          className="col-span-2 h-8 text-sm"
          type="number"
          min={1}
          defaultValue={line.quantity}
          onBlur={(event) => void handleQuantity(event.target.value)}
        />
        <CurrencyInput
          className="col-span-2 h-8 text-sm"
          inputClassName="h-8 text-sm"
          value={draftPriceCents}
          onChange={setDraftPriceCents}
          onBlur={() => void handlePrice(draftPriceCents)}
          currency={currency}
        />
        <span className="col-span-1 text-right text-sm font-medium">
          {formatCrmMoney(i18n, line.totalAmountCents, currency)}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="col-span-1 size-8 p-0"
          onClick={() => void handleRemove()}
          disabled={removing}
        >
          {removing ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="size-3.5" aria-hidden="true" />
          )}
        </Button>
      </div>
    </li>
  )
}
