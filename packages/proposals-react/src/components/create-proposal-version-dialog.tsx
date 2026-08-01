import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
} from "@voyant-travel/ui/components"
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@voyant-travel/ui/components/combobox"
import { CurrencyCombobox } from "@voyant-travel/ui/components/currency-combobox"
import { DatePicker } from "@voyant-travel/ui/components/date-picker"
import { Loader2 } from "lucide-react"
import { useMemo, useState } from "react"
import { useCrmUiI18nOrDefault } from "../i18n/index.js"
import type { CrmProposalStatus } from "../i18n/messages.js"
import {
  type ProposalRecord,
  type ProposalVersionRecord,
  useProposals,
  useProposalVersionMutation,
} from "../index.js"
import { formatCrmMoney } from "./crm-format.js"

export interface CreateProposalVersionDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  defaultCurrency?: string
  onCreated?: (proposalVersion: ProposalVersionRecord) => void
}

export function CreateProposalVersionDialog({
  open,
  onOpenChange,
  defaultCurrency = "USD",
  onCreated,
}: CreateProposalVersionDialogProps) {
  const i18n = useCrmUiI18nOrDefault()
  const { messages } = i18n
  const { create } = useProposalVersionMutation()

  const [proposalId, setProposalId] = useState<string | null>(null)
  const [proposalLabel, setProposalLabel] = useState("")
  const [proposalSearch, setProposalSearch] = useState("")
  const [currency, setCurrency] = useState<string | null>(defaultCurrency)
  const [validUntil, setValidUntil] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const proposalsQuery = useProposals({
    search: proposalSearch || undefined,
    limit: 20,
    enabled: open,
  })
  const proposalResults = useMemo(() => proposalsQuery.data?.data ?? [], [proposalsQuery.data])
  const proposalIds = useMemo(
    () => proposalResults.map((proposal) => proposal.id),
    [proposalResults],
  )

  function reset() {
    setProposalId(null)
    setProposalLabel("")
    setProposalSearch("")
    setCurrency(defaultCurrency)
    setValidUntil(null)
    setError(null)
  }

  async function handleCreate() {
    if (!proposalId) {
      setError(messages.createProposalVersionDialog.validation.selectProposal)
      return
    }
    if (!currency) {
      setError(messages.createProposalVersionDialog.validation.selectCurrency)
      return
    }
    setError(null)
    try {
      const proposalVersion = await create.mutateAsync({
        proposalId,
        input: {
          currency,
          validUntil: validUntil ?? null,
        },
      })
      reset()
      onOpenChange(false)
      onCreated?.(proposalVersion)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : messages.createProposalVersionDialog.validation.createFailed,
      )
    }
  }

  function describeProposal(proposal: ProposalRecord): string {
    const money = formatCrmMoney(i18n, proposal.valueAmountCents, proposal.valueCurrency)
    return `${proposal.title} - ${money}`
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{messages.createProposalVersionDialog.title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>{messages.createProposalVersionDialog.fields.proposal}</Label>
            <Combobox
              items={proposalIds}
              value={proposalId}
              inputValue={proposalLabel}
              autoHighlight
              filter={() => true}
              itemToStringValue={(id) => {
                const proposal = proposalResults.find((item) => item.id === (id as string))
                return proposal ? describeProposal(proposal) : ""
              }}
              onInputValueChange={(next) => {
                const match = proposalResults.find((proposal) => proposal.id === next)
                if (match) {
                  setProposalLabel(describeProposal(match))
                  return
                }
                setProposalLabel(next)
                setProposalSearch(next)
                if (!next) setProposalId(null)
              }}
              onValueChange={(next) => {
                const id = (next as string | null) ?? null
                setProposalId(id)
                const proposal = id ? proposalResults.find((item) => item.id === id) : null
                if (proposal) {
                  setProposalLabel(describeProposal(proposal))
                  if (proposal.valueCurrency) setCurrency(proposal.valueCurrency)
                } else {
                  setProposalLabel("")
                }
                setProposalSearch("")
              }}
            >
              <ComboboxInput
                placeholder={messages.createProposalVersionDialog.placeholders.searchProposals}
              />
              <ComboboxContent>
                <ComboboxEmpty>
                  {proposalsQuery.isPending
                    ? messages.createProposalVersionDialog.empty.loading
                    : messages.createProposalVersionDialog.empty.noProposals}
                </ComboboxEmpty>
                <ComboboxList>
                  <ComboboxCollection>
                    {(id) => {
                      const proposal = proposalResults.find((item) => item.id === (id as string))
                      if (!proposal) return null
                      const statusLabel =
                        messages.common.proposalStatusLabels[
                          proposal.status as CrmProposalStatus
                        ] ?? proposal.status
                      return (
                        <ComboboxItem key={proposal.id} value={proposal.id}>
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">{proposal.title}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {formatCrmMoney(
                                i18n,
                                proposal.valueAmountCents,
                                proposal.valueCurrency,
                              )}{" "}
                              - {statusLabel}
                            </span>
                          </div>
                        </ComboboxItem>
                      )
                    }}
                  </ComboboxCollection>
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{messages.createProposalVersionDialog.fields.currency}</Label>
              <CurrencyCombobox
                value={currency}
                onChange={setCurrency}
                placeholder={messages.createProposalVersionDialog.placeholders.selectCurrency}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{messages.createProposalVersionDialog.fields.validUntil}</Label>
              <DatePicker
                value={validUntil}
                onChange={setValidUntil}
                placeholder={messages.createProposalVersionDialog.placeholders.pickDate}
                clearable
              />
            </div>
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {messages.common.cancel}
          </Button>
          <Button onClick={() => void handleCreate()} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {messages.createProposalVersionDialog.actions.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
