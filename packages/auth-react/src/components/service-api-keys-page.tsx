"use client"

import { formatMessage } from "@voyant-travel/i18n"
import {
  type AccessCatalog,
  type ApiKeyPermissions,
  permissionsToStrings,
} from "@voyant-travel/types/api-keys"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  cn,
  confirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components"
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from "lucide-react"
import { type FormEvent, useMemo, useState } from "react"
import { useAuthUiI18nOrDefault, useAuthUiMessagesOrDefault } from "../i18n/provider.js"
import {
  type ApiToken,
  type ApiTokenWithSecret,
  useApiTokenMutation,
  useApiTokens,
} from "../index.js"
import { ApiTokenScopePicker } from "./api-token-scope-picker.js"
import { defaultTokenPermissions } from "./api-token-scopes.js"

export interface ServiceApiKeysPageProps {
  className?: string
  pageSize?: number
  title?: string
  description?: string
  accessCatalog?: AccessCatalog
}

export type ApiTokensPageProps = ServiceApiKeysPageProps

const EMPTY_CATALOG: AccessCatalog = { resources: [], presets: [] }

function expiresInSeconds(days: number | null): number | null {
  return days === null ? null : days * 24 * 60 * 60
}

function formatDate(
  value: string | null | undefined,
  fallback: string,
  formatDateTime: (value: string) => string,
): string {
  if (!value) return fallback
  return formatDateTime(value)
}

function permissionLabel(permission: string, fullAccessLabel: string): string {
  if (permission === "*") return fullAccessLabel
  const [resource, action] = permission.split(":")
  return `${resource ?? permission}:${action ?? ""}`
}

function useClipboard() {
  const [copied, setCopied] = useState<string | null>(null)

  return {
    copied,
    copy: async (id: string, value: string) => {
      await navigator.clipboard.writeText(value)
      setCopied(id)
      window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 2000)
    },
  }
}

export function ServiceApiKeysPage({
  className,
  pageSize = 25,
  title,
  description,
  accessCatalog,
}: ServiceApiKeysPageProps) {
  const catalog = accessCatalog ?? EMPTY_CATALOG
  // A deployment whose catalog never arrived can only render a create form that
  // is guaranteed to fail validation, so the page says so instead (#4618).
  const catalogUnavailable = catalog.resources.length === 0
  const messages = useAuthUiMessagesOrDefault().serviceApiKeysPage
  const pageTitle = title ?? messages.title
  const pageDescription = description ?? messages.description
  const keys = useApiTokens({ limit: pageSize, sortBy: "createdAt", sortDirection: "desc" })
  const clipboard = useClipboard()

  const [createOpen, setCreateOpen] = useState(false)
  const [issuedKey, setIssuedKey] = useState<ApiTokenWithSecret | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <div data-slot="api-tokens-page" className={cn("flex flex-col gap-6", className)}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
          <p className="text-sm text-muted-foreground">{pageDescription}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => void keys.refetch()}>
            <RefreshCw className="mr-2 size-4" />
            {messages.list.refresh}
          </Button>
          <Button type="button" disabled={catalogUnavailable} onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 size-4" />
            {messages.create.open}
          </Button>
        </div>
      </header>

      {catalogUnavailable && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>{messages.catalogUnavailable.title}</AlertTitle>
          <AlertDescription>{messages.catalogUnavailable.description}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {issuedKey && (
        <Alert>
          <KeyRound />
          <AlertTitle>{messages.createdToken.title}</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <span>{messages.createdToken.description}</span>
            <span className="flex w-full flex-col gap-2 sm:flex-row">
              <Input value={issuedKey.key} readOnly className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                onClick={() => void clipboard.copy(issuedKey.id, issuedKey.key)}
              >
                {clipboard.copied === issuedKey.id ? (
                  <Check className="mr-2 size-4" />
                ) : (
                  <Copy className="mr-2 size-4" />
                )}
                {messages.createdToken.copy}
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      )}

      {keys.isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {messages.list.loading}
          </CardContent>
        </Card>
      ) : keys.data?.apiKeys.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{messages.list.title}</h2>
          <ServiceApiKeyTable
            apiKeys={keys.data.apiKeys}
            onError={setError}
            onSecretIssued={setIssuedKey}
          />
        </section>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {messages.list.empty}
          </CardContent>
        </Card>
      )}

      <CreateApiTokenSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        catalog={catalog}
        onCreated={(created) => {
          setError(null)
          setIssuedKey(created)
          setCreateOpen(false)
        }}
      />
    </div>
  )
}

export const ApiTokensPage = ServiceApiKeysPage

function CreateApiTokenSheet({
  open,
  onOpenChange,
  catalog,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalog: AccessCatalog
  onCreated: (created: ApiTokenWithSecret) => void
}) {
  const messages = useAuthUiMessagesOrDefault().serviceApiKeysPage
  const mutations = useApiTokenMutation()
  const expirationOptions = [
    { value: "never", label: messages.create.expirationOptions.never, days: null },
    { value: "7", label: messages.create.expirationOptions.sevenDays, days: 7 },
    { value: "30", label: messages.create.expirationOptions.thirtyDays, days: 30 },
    { value: "90", label: messages.create.expirationOptions.ninetyDays, days: 90 },
    { value: "365", label: messages.create.expirationOptions.oneYear, days: 365 },
  ] as const

  const [name, setName] = useState("")
  const [expiration, setExpiration] = useState<string>("90")
  const [permissions, setPermissions] = useState<ApiKeyPermissions>(() =>
    defaultTokenPermissions(catalog),
  )
  const [error, setError] = useState<string | null>(null)

  const scopeStrings = useMemo(() => permissionsToStrings(permissions), [permissions])

  const reset = () => {
    setName("")
    setExpiration("90")
    setPermissions(defaultTokenPermissions(catalog))
    setError(null)
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError(messages.create.errors.nameRequired)
      return
    }
    if (scopeStrings.length === 0) {
      setError(messages.create.errors.permissionRequired)
      return
    }

    try {
      const days = expirationOptions.find((option) => option.value === expiration)?.days ?? null
      const result = await mutations.create.mutateAsync({
        name: name.trim(),
        permissions,
        expiresIn: expiresInSeconds(days),
      })
      reset()
      onCreated(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.create.errors.createFailed)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="xl" className="gap-0">
        <SheetHeader className="border-b">
          <SheetTitle>{messages.create.title}</SheetTitle>
          <SheetDescription>{messages.create.description}</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleCreate} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <SheetBody className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
              <div className="flex flex-col gap-2">
                <Label htmlFor="api-token-name">{messages.create.name}</Label>
                <Input
                  id="api-token-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={messages.create.namePlaceholder}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="api-token-expiration">{messages.create.expiration}</Label>
                <Select value={expiration} onValueChange={(value) => setExpiration(String(value))}>
                  <SelectTrigger id="api-token-expiration" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {expirationOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ApiTokenScopePicker catalog={catalog} value={permissions} onChange={setPermissions} />
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {messages.create.cancel}
            </Button>
            <Button type="submit" disabled={mutations.create.isPending}>
              {mutations.create.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              {messages.create.submit}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function ServiceApiKeyTable({
  apiKeys,
  onError,
  onSecretIssued,
}: {
  apiKeys: readonly ApiToken[]
  onError: (error: string | null) => void
  onSecretIssued: (apiKey: ApiTokenWithSecret) => void
}) {
  const messages = useAuthUiMessagesOrDefault().serviceApiKeysPage

  return (
    <Card className="gap-0 py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{messages.list.columns.name}</TableHead>
            <TableHead>{messages.list.columns.scopes}</TableHead>
            <TableHead>{messages.list.columns.expires}</TableHead>
            <TableHead>{messages.list.columns.lastUsed}</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {apiKeys.map((apiKey) => (
            <ServiceApiKeyRow
              key={apiKey.id}
              apiKey={apiKey}
              onError={onError}
              onSecretIssued={onSecretIssued}
            />
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

function ServiceApiKeyRow({
  apiKey,
  onError,
  onSecretIssued,
}: {
  apiKey: ApiToken
  onError: (error: string | null) => void
  onSecretIssued: (apiKey: ApiTokenWithSecret) => void
}) {
  const i18n = useAuthUiI18nOrDefault()
  const messages = i18n.messages.serviceApiKeysPage
  const mutations = useApiTokenMutation()
  const enabled = apiKey.enabled !== false
  const removeToken = async () => {
    // A dropdown item is a single click away from destroying a live
    // credential, so it asks first — the same guard rotation already has.
    if (!(await confirmDialog(messages.list.deleteConfirm))) return
    onError(null)
    try {
      await mutations.remove.mutateAsync({ keyId: apiKey.id })
    } catch (err) {
      onError(err instanceof Error ? err.message : messages.list.rotateFailed)
    }
  }
  const rotateToken = async () => {
    if (!(await confirmDialog(messages.list.rotateConfirm))) return
    onError(null)

    try {
      const result = await mutations.rotate.mutateAsync({
        keyId: apiKey.id,
        configId: apiKey.configId,
      })
      onSecretIssued(result)
    } catch (err) {
      onError(err instanceof Error ? err.message : messages.list.rotateFailed)
    }
  }

  return (
    <TableRow>
      <TableCell className="align-top">
        <div className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2 font-medium">
            {apiKey.name || messages.list.untitled}
            <Badge variant={enabled ? "default" : "secondary"}>
              {enabled ? messages.list.enabled : messages.list.disabled}
            </Badge>
            {apiKey.start && (
              <Badge variant="outline" className="font-mono text-[11px]">
                {apiKey.start}
              </Badge>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatMessage(messages.list.created, {
              created: formatDate(apiKey.createdAt, messages.date.never, i18n.formatDateTime),
            })}
          </span>
        </div>
      </TableCell>
      <TableCell className="max-w-xs align-top">
        {apiKey.permissionList.length ? (
          <div className="flex flex-wrap gap-1">
            {apiKey.permissionList.slice(0, 6).map((permission) => (
              <Badge key={permission} variant="outline" className="font-mono text-[11px]">
                {permissionLabel(permission, messages.permissions.fullAccess)}
              </Badge>
            ))}
            {apiKey.permissionList.length > 6 && (
              <Badge variant="secondary" className="text-[11px]">
                {formatMessage(messages.list.moreScopes, {
                  count: String(apiKey.permissionList.length - 6),
                })}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{messages.list.noPermissions}</span>
        )}
      </TableCell>
      <TableCell className="align-top text-sm text-muted-foreground">
        {formatDate(apiKey.expiresAt, messages.date.never, i18n.formatDateTime)}
      </TableCell>
      <TableCell className="align-top text-sm text-muted-foreground">
        {formatDate(apiKey.lastRequest, messages.date.never, i18n.formatDateTime)}
      </TableCell>
      <TableCell className="align-top">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="ghost" size="icon-sm" />}
            aria-label={messages.list.actions}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={mutations.update.isPending}
              onClick={() =>
                void mutations.update.mutateAsync({ keyId: apiKey.id, enabled: !enabled })
              }
            >
              {enabled ? <PowerOff className="mr-2 size-4" /> : <Power className="mr-2 size-4" />}
              {enabled ? messages.list.disable : messages.list.enable}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={mutations.rotate.isPending}
              onClick={() => void rotateToken()}
            >
              <RefreshCw className="mr-2 size-4" />
              {messages.list.rotate}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={mutations.remove.isPending}
              onClick={() => void removeToken()}
            >
              <Trash2 className="mr-2 size-4" />
              {messages.list.delete}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}
