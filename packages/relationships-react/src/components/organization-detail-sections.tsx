"use client"

import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmActionButton,
} from "@voyant-travel/ui/components"
import {
  Building,
  Calendar,
  CircleDot,
  GitMerge,
  Globe,
  Hash,
  Languages,
  Receipt,
  Tag,
  Users,
} from "lucide-react"
import type { ReactNode } from "react"
import { useCrmUiMessagesOrDefault } from "../i18n/index.js"
import type { UpdateOrganizationInput } from "../index.js"
import { InlineCurrencyField } from "./inline-currency-field.js"
import { InlineField } from "./inline-field.js"
import { InlineLanguageField } from "./inline-language-field.js"
import { InlineNumberField } from "./inline-number-field.js"
import { InlineSelectField } from "./inline-select-field.js"
import type { OrganizationData } from "./organization-detail-types.js"
import { initialsFrom } from "./organization-detail-types.js"
import { TagsEditor } from "./tags-editor.js"

export type {
  OrganizationActivity,
  OrganizationCommercialContextTabSlot,
  OrganizationData,
  OrganizationDetailPageSlots,
  OrganizationDetailTab,
  OrganizationPerson,
} from "./organization-detail-types.js"

export interface OrganizationHeaderProps {
  org: OrganizationData
  websiteHref?: string
  onMerge?: () => void
  onDelete: () => Promise<void>
  deletePending: boolean
}

/**
 * Page header for the organization detail route.
 *
 * Deliberately renders no breadcrumb and no back affordance: the admin chrome
 * already owns both (`useAdminBreadcrumbs` in the host). Identity — avatar,
 * name, legal name, website and the relation/status badges — lives here rather
 * than in the sidebar, matching the product detail header.
 */
export function OrganizationHeader({
  org,
  websiteHref,
  onMerge,
  onDelete,
  deletePending,
}: OrganizationHeaderProps) {
  const messages = useCrmUiMessagesOrDefault()
  const relationLabel = org.relation
    ? (messages.common.relationTypeLabels[
        org.relation as keyof typeof messages.common.relationTypeLabels
      ] ?? org.relation)
    : null
  const statusLabel =
    messages.common.recordStatusLabels[
      org.status as keyof typeof messages.common.recordStatusLabels
    ] ?? org.status

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="size-10 shrink-0">
          <AvatarFallback>{initialsFrom(org.name)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{org.name}</h1>
            {relationLabel ? <Badge variant="secondary">{relationLabel}</Badge> : null}
            <Badge variant="outline">{statusLabel}</Badge>
          </div>
          {org.legalName || websiteHref ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              {org.legalName ? <span className="truncate">{org.legalName}</span> : null}
              {org.legalName && websiteHref ? (
                <span className="text-muted-foreground/60">/</span>
              ) : null}
              {websiteHref ? (
                <a
                  href={websiteHref}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate transition-colors hover:text-foreground hover:underline"
                >
                  {org.website}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onMerge ? (
          <Button variant="outline" size="sm" onClick={onMerge}>
            <GitMerge className="size-4" aria-hidden="true" />
            {messages.organizationDetail.topBar.merge}
          </Button>
        ) : null}
        <ConfirmActionButton
          buttonLabel={messages.organizationDetail.topBar.delete}
          confirmLabel={messages.organizationDetail.topBar.delete}
          title={messages.organizationDetail.topBar.deleteTitle}
          description={messages.organizationDetail.topBar.deleteDescription}
          variant="destructive"
          confirmVariant="destructive"
          disabled={deletePending}
          onConfirm={onDelete}
        />
      </div>
    </div>
  )
}

export interface OrganizationSidebarProps {
  org: OrganizationData
  websiteHref?: string
  onUpdateField: (patch: UpdateOrganizationInput) => Promise<void>
  children?: ReactNode
}

/**
 * About + Tags rail. The standalone profile card is gone — its avatar, badges
 * and website now live in {@link OrganizationHeader} — leaving this rail as the
 * single place every organization field is read and inline-edited.
 */
export function OrganizationSidebar({
  org,
  websiteHref,
  onUpdateField,
  children,
}: OrganizationSidebarProps) {
  const messages = useCrmUiMessagesOrDefault()
  const relationOptions = [
    { value: "client", label: messages.common.relationTypeLabels.client },
    { value: "partner", label: messages.common.relationTypeLabels.partner },
    { value: "supplier", label: messages.common.relationTypeLabels.supplier },
    { value: "other", label: messages.common.relationTypeLabels.other },
  ]
  const statusOptions = [
    { value: "active", label: messages.common.recordStatusLabels.active },
    { value: "inactive", label: messages.common.recordStatusLabels.inactive },
    { value: "archived", label: messages.common.recordStatusLabels.archived },
  ]

  return (
    <aside className="flex flex-col gap-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            {messages.organizationDetail.sidebar.about}
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y text-sm">
          {/* Name and legal name stay here even though the header displays them:
              the header is read-only, and this list is the only inline editor
              for them — the organization page has no edit dialog. */}
          <InlineField
            icon={Building}
            label={messages.organizationDetail.sidebar.fields.name}
            value={org.name}
            onSave={(next) => onUpdateField({ name: next ?? org.name })}
          />
          <InlineField
            icon={Building}
            label={messages.organizationDetail.sidebar.fields.legalName}
            value={org.legalName}
            onSave={(next) => onUpdateField({ legalName: next })}
          />
          <InlineField
            icon={Receipt}
            label={messages.organizationDetail.sidebar.fields.taxId}
            value={org.taxId}
            onSave={(next) => onUpdateField({ taxId: next })}
          />
          <InlineField
            icon={Globe}
            label={messages.organizationDetail.sidebar.fields.website}
            kind="url"
            href={websiteHref}
            value={org.website}
            onSave={(next) => onUpdateField({ website: next })}
          />
          <InlineField
            icon={Hash}
            label={messages.organizationDetail.sidebar.fields.industry}
            value={org.industry}
            onSave={(next) => onUpdateField({ industry: next })}
          />
          <InlineSelectField
            icon={Users}
            label={messages.organizationDetail.sidebar.fields.relation}
            value={org.relation}
            options={relationOptions}
            onSave={(next) => onUpdateField({ relation: next })}
          />
          <InlineSelectField
            icon={CircleDot}
            label={messages.organizationDetail.sidebar.fields.status}
            value={org.status}
            options={statusOptions}
            allowClear={false}
            onSave={(next) => onUpdateField({ status: next ?? "active" })}
          />
          <InlineCurrencyField
            label={messages.organizationDetail.sidebar.fields.defaultCurrency}
            value={org.defaultCurrency}
            onSave={(next) => onUpdateField({ defaultCurrency: next })}
          />
          <InlineLanguageField
            icon={Languages}
            label={messages.organizationDetail.sidebar.fields.preferredLanguage}
            value={org.preferredLanguage}
            onSave={(next) => onUpdateField({ preferredLanguage: next })}
          />
          <InlineNumberField
            icon={Calendar}
            label={messages.organizationDetail.sidebar.fields.paymentTerms}
            value={org.paymentTerms}
            min={0}
            max={365}
            onSave={(next) => onUpdateField({ paymentTerms: next })}
          />
          <InlineField
            icon={Tag}
            label={messages.organizationDetail.sidebar.fields.source}
            value={org.source}
            onSave={(next) => onUpdateField({ source: next })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            {messages.organizationDetail.sidebar.tags}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TagsEditor tags={org.tags} onChange={(tags) => onUpdateField({ tags })} />
        </CardContent>
      </Card>

      {children}
    </aside>
  )
}

export type { OrganizationMainProps } from "./organization-detail-main.js"
export { OrganizationMain } from "./organization-detail-main.js"

export { initialsFrom } from "./organization-detail-types.js"
