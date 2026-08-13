"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components"
import {
  BriefcaseBusiness,
  Calendar,
  CircleDot,
  Globe,
  Languages,
  Mail,
  Phone,
  Tag,
  User,
  Users,
} from "lucide-react"
import type { ReactNode } from "react"

import { useCrmUiMessagesOrDefault } from "../i18n/index.js"
import type { UpdatePersonInput } from "../index.js"
import { InlineCurrencyField } from "./inline-currency-field.js"
import { InlineField } from "./inline-field.js"
import { InlineLanguageField } from "./inline-language-field.js"
import { InlineSelectField } from "./inline-select-field.js"
import type { PersonData } from "./person-detail-types.js"
import { TagsEditor } from "./tags-editor.js"

export interface PersonSidebarProps {
  person: PersonData
  onUpdateField: (patch: UpdatePersonInput) => Promise<void>
  children?: ReactNode
}

/**
 * About + Tags rail. The standalone profile card is gone — its avatar, badges,
 * job title and organization link now live in `PersonHeader` — leaving this
 * rail as the single place every person field is read and inline-edited.
 */
export function PersonSidebar({ person, onUpdateField, children }: PersonSidebarProps) {
  const messages = useCrmUiMessagesOrDefault()
  const websiteHref = person.website
    ? person.website.startsWith("http")
      ? person.website
      : `https://${person.website}`
    : undefined
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
            {messages.personDetail.sidebar.about}
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y text-sm">
          <InlineField
            icon={User}
            label={messages.personDetail.sidebar.fields.firstName}
            value={person.firstName}
            onSave={(next) => onUpdateField({ firstName: next ?? person.firstName })}
          />
          <InlineField
            icon={User}
            label={messages.personDetail.sidebar.fields.lastName}
            value={person.lastName}
            onSave={(next) => onUpdateField({ lastName: next ?? person.lastName })}
          />
          <InlineField
            icon={BriefcaseBusiness}
            label={messages.personDetail.sidebar.fields.jobTitle}
            value={person.jobTitle}
            onSave={(next) => onUpdateField({ jobTitle: next })}
          />
          <InlineField
            icon={Mail}
            label={messages.personDetail.sidebar.fields.email}
            kind="email"
            value={person.email}
            onSave={(next) => onUpdateField({ email: next })}
          />
          <InlineField
            icon={Phone}
            label={messages.personDetail.sidebar.fields.phone}
            value={person.phone}
            onSave={(next) => onUpdateField({ phone: next })}
          />
          <InlineField
            icon={Globe}
            label={messages.personDetail.sidebar.fields.website}
            kind="url"
            href={websiteHref}
            value={person.website}
            onSave={(next) => onUpdateField({ website: next })}
          />
          <InlineSelectField
            icon={Users}
            label={messages.personDetail.sidebar.fields.relation}
            value={person.relation}
            options={relationOptions}
            onSave={(next) => onUpdateField({ relation: next })}
          />
          <InlineSelectField
            icon={CircleDot}
            label={messages.personDetail.sidebar.fields.status}
            value={person.status}
            options={statusOptions}
            allowClear={false}
            onSave={(next) => onUpdateField({ status: next ?? "active" })}
          />
          <InlineCurrencyField
            label={messages.personDetail.sidebar.fields.preferredCurrency}
            value={person.preferredCurrency}
            onSave={(next) => onUpdateField({ preferredCurrency: next })}
          />
          <InlineLanguageField
            icon={Languages}
            label={messages.personDetail.sidebar.fields.preferredLanguage}
            value={person.preferredLanguage}
            onSave={(next) => onUpdateField({ preferredLanguage: next })}
          />
          <InlineField
            icon={Calendar}
            label={messages.personDetail.sidebar.fields.dateOfBirth}
            value={person.dateOfBirth}
            onSave={(next) => onUpdateField({ dateOfBirth: next })}
          />
          <InlineField
            icon={Tag}
            label={messages.personDetail.sidebar.fields.source}
            value={person.source}
            onSave={(next) => onUpdateField({ source: next })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            {messages.personDetail.sidebar.tags}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TagsEditor tags={person.tags} onChange={(tags) => onUpdateField({ tags })} />
        </CardContent>
      </Card>

      {children}
    </aside>
  )
}
