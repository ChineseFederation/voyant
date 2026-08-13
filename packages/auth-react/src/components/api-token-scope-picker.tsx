"use client"

import { formatMessage } from "@voyant-travel/i18n"
import {
  type AccessCatalog,
  type AccessCatalogResource,
  type ApiKeyPermissions,
  hasApiKeyPermission,
  permissionsToStrings,
} from "@voyant-travel/types/api-keys"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Checkbox,
  Input,
  Label,
} from "@voyant-travel/ui/components"
import { Lock, Search, ShieldAlert } from "lucide-react"
import { useMemo, useState } from "react"
import { useAuthUiMessagesOrDefault } from "../i18n/provider.js"
import {
  apiTokenPresets,
  grantedActionCount,
  isFullAccess,
  isResourceGranted,
  matchesScopeSearch,
  setActionGrant,
  setFullAccess,
  setResourceGrant,
} from "./api-token-scopes.js"

export interface ApiTokenScopePickerProps {
  catalog: AccessCatalog
  value: ApiKeyPermissions
  onChange: (next: ApiKeyPermissions) => void
}

/**
 * Scope selection for an API token. At deployment scale the catalog is a long
 * flat list (~60 resources / ~140 actions), so it is presented as presets, a
 * search box, and one collapsed accordion section per resource rather than a
 * wall of checkboxes.
 */
export function ApiTokenScopePicker({ catalog, value, onChange }: ApiTokenScopePickerProps) {
  const messages = useAuthUiMessagesOrDefault().serviceApiKeysPage.scopes
  const [search, setSearch] = useState("")

  const presets = useMemo(() => apiTokenPresets(catalog), [catalog])
  const visibleResources = useMemo(
    () => catalog.resources.filter((resource) => matchesScopeSearch(resource, search)),
    [catalog.resources, search],
  )
  const fullAccess = isFullAccess(value)
  const selectedCount = permissionsToStrings(value).length

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">{messages.title}</h2>
          <p className="text-xs text-muted-foreground">{messages.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={selectedCount > 0 ? "default" : "outline"}>
            {formatMessage(messages.selectedCount, { count: String(selectedCount) })}
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={selectedCount === 0}
            onClick={() => onChange({})}
          >
            {messages.clear}
          </Button>
        </div>
      </div>

      {presets.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase">
            {messages.presets}
          </span>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                variant="outline"
                size="sm"
                title={preset.description}
                onClick={() => onChange({ ...preset.permissions })}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      <Label
        htmlFor="api-token-full-access"
        className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 font-normal"
      >
        <Checkbox
          id="api-token-full-access"
          checked={fullAccess}
          onCheckedChange={(checked) => onChange(setFullAccess(checked === true))}
          className="mt-0.5"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <ShieldAlert className="size-3.5 text-destructive" />
            {messages.fullAccess}
          </span>
          <span className="block text-xs text-muted-foreground">{messages.fullAccessHint}</span>
        </span>
      </Label>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={messages.search}
          className="pl-9"
          aria-label={messages.search}
        />
      </div>

      {visibleResources.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{messages.noResults}</p>
      ) : (
        <Accordion className="rounded-md border px-3">
          {visibleResources.map((resource) => (
            <ScopeGroup
              key={resource.id}
              resource={resource}
              catalog={catalog}
              value={value}
              onChange={onChange}
              locked={fullAccess}
            />
          ))}
        </Accordion>
      )}
    </section>
  )
}

function ScopeGroup({
  resource,
  catalog,
  value,
  onChange,
  locked,
}: {
  resource: AccessCatalogResource
  catalog: AccessCatalog
  value: ApiKeyPermissions
  onChange: (next: ApiKeyPermissions) => void
  locked: boolean
}) {
  const messages = useAuthUiMessagesOrDefault().serviceApiKeysPage.scopes
  const granted = isResourceGranted(value, resource)
  const selected = grantedActionCount(value, resource, catalog)
  // Full access and a resource grant both make every action a foregone
  // conclusion, so the action checkboxes go read-only rather than pretending an
  // individual toggle would still change the outcome.
  const actionsLocked = locked || granted
  const groupId = `api-token-scope-${resource.resource}`

  return (
    <AccordionItem value={resource.resource}>
      <div className="flex items-center gap-3">
        <Checkbox
          id={groupId}
          checked={locked || granted}
          disabled={locked}
          onCheckedChange={(checked) =>
            onChange(setResourceGrant(value, resource, checked === true))
          }
          aria-label={formatMessage(messages.groupAllLabel, { resource: resource.label })}
        />
        <AccordionTrigger className="py-3">
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2">
              {resource.label}
              <Badge variant={selected > 0 ? "default" : "outline"} className="font-normal">
                {formatMessage(messages.countOf, {
                  selected: String(selected),
                  total: String(resource.actions.length),
                })}
              </Badge>
            </span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {resource.description}
            </span>
          </span>
        </AccordionTrigger>
      </div>
      <AccordionContent className="pl-7">
        <div className="flex flex-col gap-1">
          <p className="pb-1 text-xs text-muted-foreground">
            {actionsLocked ? (
              <span className="flex items-center gap-1.5">
                <Lock className="size-3" />
                {messages.lockedHint}
              </span>
            ) : (
              messages.groupAllHint
            )}
          </p>
          {resource.actions.map((action) => {
            const actionId = `${groupId}-${action.action}`
            return (
              <Label
                key={action.action}
                htmlFor={actionId}
                className="flex items-start gap-3 rounded-md p-2 font-normal hover:bg-muted/60 has-disabled:hover:bg-transparent"
              >
                <Checkbox
                  id={actionId}
                  disabled={actionsLocked}
                  checked={hasApiKeyPermission(value, resource.resource, action.action, catalog)}
                  onCheckedChange={(checked) =>
                    onChange(
                      setActionGrant(value, resource.resource, action.action, checked === true),
                    )
                  }
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {action.label}
                    {action.sensitive && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {messages.sensitive}
                      </Badge>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground">{action.description}</span>
                </span>
              </Label>
            )
          })}
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}
