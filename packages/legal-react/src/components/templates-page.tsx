import { formatMessage } from "@voyant-travel/i18n"
import {
  Badge,
  Button,
  confirmDialog,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import { cn } from "@voyant-travel/ui/lib/utils"
import { ListFilter, Pencil, Plus, Search, Trash2, X } from "lucide-react"
import type { ReactNode } from "react"
import { useState } from "react"
import { useLegalUiI18nOrDefault, useLegalUiMessagesOrDefault } from "../i18n/index.js"
import { legalContractScopes } from "../i18n/messages.js"
import {
  type LegalContractTemplateRecord,
  useLegalContractTemplateMutation,
  useLegalContractTemplates,
} from "../index.js"

const SCOPE_ALL = "__all__"

export interface TemplateDialogRenderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template?: LegalContractTemplateRecord
  onSuccess: () => void
}

/**
 * Render-prop shape for the template version dialog. Templates' index
 * page no longer surfaces an "Add version" action (versions are managed
 * on the template detail page), but the type is still exported for the
 * detail page to reuse.
 */
export interface TemplateVersionDialogRenderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: string
  onSuccess: () => void
}

export interface TemplatesPageProps {
  className?: string
  onOpenTemplate?: (templateId: string) => void
  renderTemplateDialog?: (props: TemplateDialogRenderProps) => ReactNode
}

export function TemplatesPage({
  className,
  onOpenTemplate,
  renderTemplateDialog,
}: TemplatesPageProps = {}) {
  const i18n = useLegalUiI18nOrDefault()
  const messages = useLegalUiMessagesOrDefault()
  const f = messages.templatesPage
  const [search, setSearch] = useState("")
  const [scope, setScope] = useState<string>(SCOPE_ALL)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<LegalContractTemplateRecord | undefined>()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const { remove } = useLegalContractTemplateMutation()

  const activeFilterCount = scope !== SCOPE_ALL ? 1 : 0
  const hasActiveFilters = activeFilterCount > 0 || search !== ""
  const clearFilters = () => {
    setSearch("")
    setScope(SCOPE_ALL)
  }

  const { data, isPending, isFetching, isError, refetch } = useLegalContractTemplates({
    search,
    scope: scope === SCOPE_ALL ? "all" : scope,
  })

  const templates = data?.data ?? []
  const showSkeleton = isPending || (isFetching && templates.length === 0)
  const canEditTemplates = !!renderTemplateDialog

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{f.title}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Label htmlFor="templates-search" className="sr-only">
            {f.searchPlaceholder}
          </Label>
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="templates-search"
            placeholder={f.searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>

        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger
            render={
              <Button variant="outline" size="default">
                <ListFilter className="mr-2 size-4" />
                {f.filters.button}
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-2 px-1.5">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            }
          />
          <PopoverContent
            align="start"
            className="max-h-[75vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto p-4"
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="templates-filter-scope">{f.filters.scope}</Label>
                <Select value={scope} onValueChange={(value) => setScope(value ?? SCOPE_ALL)}>
                  <SelectTrigger id="templates-filter-scope" className="w-full">
                    <SelectValue>
                      {(value) =>
                        value === SCOPE_ALL
                          ? f.filters.allScopes
                          : (messages.common.contractScopeLabels[
                              value as keyof typeof messages.common.contractScopeLabels
                            ] ?? value)
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SCOPE_ALL}>{f.filters.allScopes}</SelectItem>
                    {legalContractScopes.map((value) => (
                      <SelectItem key={value} value={value}>
                        {messages.common.contractScopeLabels[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 size-4" />
            {f.filters.clear}
          </Button>
        )}

        {renderTemplateDialog ? (
          <div className="ml-auto">
            <Button
              onClick={() => {
                setEditingTemplate(undefined)
                setDialogOpen(true)
              }}
            >
              <Plus className="mr-1 size-4" aria-hidden="true" />
              {f.create}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{f.columns.name}</TableHead>
              <TableHead>{f.columns.scope}</TableHead>
              <TableHead>{f.columns.status}</TableHead>
              <TableHead>{f.columns.created}</TableHead>
              <TableHead className="w-20 text-right">&nbsp;</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {showSkeleton ? (
              <TemplateRowSkeleton rows={6} />
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-sm text-destructive">
                  {f.loadFailed}
                </TableCell>
              </TableRow>
            ) : templates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                  {f.empty}
                </TableCell>
              </TableRow>
            ) : (
              templates.map((template) => {
                const scopeLabel =
                  messages.common.contractScopeLabels[
                    template.scope as keyof typeof messages.common.contractScopeLabels
                  ] ?? template.scope
                const handleOpen = onOpenTemplate ? () => onOpenTemplate(template.id) : undefined
                return (
                  <TableRow
                    key={template.id}
                    onClick={handleOpen}
                    className={cn(handleOpen && "cursor-pointer")}
                  >
                    <TableCell>
                      <span className="font-medium">{template.name}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{scopeLabel}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={template.active ? "default" : "secondary"}>
                        {template.active ? messages.common.active : messages.common.inactive}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {i18n.formatDate(template.createdAt)}
                    </TableCell>
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        {canEditTemplates ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={f.editAction}
                            title={f.editAction}
                            onClick={() => {
                              setEditingTemplate(template)
                              setDialogOpen(true)
                            }}
                          >
                            <Pencil className="size-3.5" aria-hidden="true" />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={f.deleteAction}
                          title={f.deleteAction}
                          onClick={async () => {
                            if (
                              await confirmDialog({
                                description: formatMessage(f.deleteConfirm, {
                                  name: template.name,
                                }),
                                destructive: true,
                              })
                            ) {
                              remove.mutate(template.id, { onSuccess: () => void refetch() })
                            }
                          }}
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {renderTemplateDialog?.({
        open: dialogOpen,
        onOpenChange: setDialogOpen,
        template: editingTemplate,
        onSuccess: () => {
          setDialogOpen(false)
          setEditingTemplate(undefined)
          void refetch()
        },
      })}
    </div>
  )
}

function TemplateRowSkeleton({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders are stable -- owner: legal-react; existing suppression is intentional pending typed cleanup.
        <TableRow key={`template-skeleton-${index}`}>
          <TableCell>
            <Skeleton className="h-4 w-48" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-20 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-16 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-12" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
