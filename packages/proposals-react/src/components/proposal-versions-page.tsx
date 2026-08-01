import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import { cn } from "@voyant-travel/ui/lib/utils"
import { Loader2, Plus } from "lucide-react"
import { useState } from "react"
import { useCrmUiI18nOrDefault } from "../i18n/index.js"
import type { CrmProposalVersionStatus } from "../i18n/messages.js"
import { type ProposalVersionRecord, useProposalVersions } from "../index.js"
import { CreateProposalVersionDialog } from "./create-proposal-version-dialog.js"
import { formatCrmDate, formatCrmMoney, formatCrmRelative } from "./crm-format.js"

export interface ProposalVersionsPageProps {
  onProposalVersionOpen?: (proposalVersion: ProposalVersionRecord) => void
  onProposalVersionCreated?: (proposalVersion: ProposalVersionRecord) => void
  className?: string
}

export function ProposalVersionsPage({
  onProposalVersionOpen,
  onProposalVersionCreated,
  className,
}: ProposalVersionsPageProps = {}) {
  const i18n = useCrmUiI18nOrDefault()
  const { messages } = i18n
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data, isPending, isError } = useProposalVersions({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 100,
  })

  const proposalVersions = data?.data ?? []
  const proposalVersionStatusOptions = Object.entries(
    messages.common.proposalVersionStatusLabels,
  ).map(([value, label]) => ({ value, label }))

  const handleCreated = (proposalVersion: ProposalVersionRecord) => {
    onProposalVersionCreated?.(proposalVersion)
    onProposalVersionOpen?.(proposalVersion)
  }

  return (
    <div data-slot="proposal-versions-page" className={cn("flex flex-col gap-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {messages.proposalVersionsPage.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {messages.proposalVersionsPage.description}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 size-4" aria-hidden="true" />
          {messages.proposalVersionsPage.create}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value ?? "all")}>
          <SelectTrigger className="w-[180px] text-sm">
            <SelectValue placeholder={messages.proposalVersionsPage.filters.status} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{messages.proposalVersionsPage.filters.allStatuses}</SelectItem>
            {proposalVersionStatusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{messages.proposalVersionsPage.columns.proposalVersion}</TableHead>
              <TableHead>{messages.proposalVersionsPage.columns.status}</TableHead>
              <TableHead>{messages.proposalVersionsPage.columns.total}</TableHead>
              <TableHead>{messages.proposalVersionsPage.columns.validUntil}</TableHead>
              <TableHead>{messages.proposalVersionsPage.columns.updated}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-sm text-destructive">
                  {messages.proposalVersionsPage.loadFailed}
                </TableCell>
              </TableRow>
            ) : proposalVersions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                  {messages.proposalVersionsPage.empty}
                </TableCell>
              </TableRow>
            ) : (
              proposalVersions.map((proposalVersion) => {
                const statusLabel =
                  messages.common.proposalVersionStatusLabels[
                    proposalVersion.status as CrmProposalVersionStatus
                  ] ?? proposalVersion.status
                return (
                  <TableRow
                    key={proposalVersion.id}
                    onClick={() => onProposalVersionOpen?.(proposalVersion)}
                    className={cn(onProposalVersionOpen && "cursor-pointer")}
                  >
                    <TableCell className="font-mono text-xs">
                      {proposalVersion.label ?? proposalVersion.id.slice(-8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{statusLabel}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCrmMoney(
                        i18n,
                        proposalVersion.totalAmountCents,
                        proposalVersion.currency,
                      )}
                    </TableCell>
                    <TableCell>{formatCrmDate(i18n, proposalVersion.validUntil)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatCrmRelative(i18n, proposalVersion.updatedAt)}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <CreateProposalVersionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
      />
    </div>
  )
}
