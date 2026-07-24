import { and, desc, eq, ilike, isNull, ne, or, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { contractTemplates, contractTemplateVersions } from "./schema.js"
import {
  type ContractTemplateDefaultQuery,
  type ContractTemplateListQuery,
  type CreateContractTemplateInput,
  type CreateContractTemplateVersionInput,
  paginate,
  type RenderTemplateInput,
  renderTemplate,
  type UpdateContractTemplateInput,
  validateContractTemplateBody,
} from "./service-shared.js"

type ContractTemplateRow = typeof contractTemplates.$inferSelect

function normalizeLanguage(value: string | undefined | null) {
  const normalized = value?.trim().toLowerCase()
  return normalized || null
}

function buildLanguageFallbackOrder(query: ContractTemplateDefaultQuery) {
  return [query.language, ...(query.fallbackLanguages ?? [])]
    .map(normalizeLanguage)
    .filter(
      (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index,
    )
}

function pickBestDefaultTemplate(
  rows: ContractTemplateRow[],
  channelId: string | undefined,
): ContractTemplateRow | null {
  const channelDefault = channelId
    ? rows.find((row) => row.isDefault && row.channelId === channelId)
    : null
  const globalDefault = rows.find((row) => row.isDefault && row.channelId === null)
  const channelFallback = channelId ? rows.find((row) => row.channelId === channelId) : null
  const globalFallback = rows.find((row) => row.channelId === null)

  return channelDefault ?? globalDefault ?? channelFallback ?? globalFallback ?? null
}

export const contractTemplatesService = {
  async listTemplates(db: PostgresJsDatabase, query: ContractTemplateListQuery) {
    const conditions = []
    if (query.scope) conditions.push(eq(contractTemplates.scope, query.scope))
    if (query.language) conditions.push(eq(contractTemplates.language, query.language))
    if (query.channelId) conditions.push(eq(contractTemplates.channelId, query.channelId))
    if (query.active !== undefined) conditions.push(eq(contractTemplates.active, query.active))
    if (query.search) {
      const term = `%${query.search}%`
      conditions.push(
        or(
          ilike(contractTemplates.name, term),
          ilike(contractTemplates.slug, term),
          ilike(contractTemplates.description, term),
        ),
      )
    }
    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(contractTemplates)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(contractTemplates.updatedAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(contractTemplates).where(where),
      query.limit,
      query.offset,
    )
  },
  async getTemplateById(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .select()
      .from(contractTemplates)
      .where(eq(contractTemplates.id, id))
      .limit(1)
    return row ?? null
  },
  /**
   * Slug lookup used by booking contract preview. Slug is unique so the
   * result is either the row or null — no disambiguation needed.
   */
  async findTemplateBySlug(db: PostgresJsDatabase, slug: string) {
    const [row] = await db
      .select()
      .from(contractTemplates)
      .where(eq(contractTemplates.slug, slug))
      .limit(1)
    return row ?? null
  },
  async getDefaultTemplate(db: PostgresJsDatabase, query: ContractTemplateDefaultQuery) {
    const channelId = query.channelId?.trim() || undefined
    const channelConditions = channelId
      ? or(eq(contractTemplates.channelId, channelId), isNull(contractTemplates.channelId))
      : isNull(contractTemplates.channelId)

    const rows = await db
      .select()
      .from(contractTemplates)
      .where(
        and(
          eq(contractTemplates.scope, query.scope),
          eq(contractTemplates.active, true),
          channelConditions,
        ),
      )
      .orderBy(
        desc(contractTemplates.updatedAt),
        desc(contractTemplates.createdAt),
        desc(contractTemplates.id),
      )

    if (rows.length === 0) {
      return null
    }

    const preferredLanguages = buildLanguageFallbackOrder(query)

    if (preferredLanguages.length === 0) {
      return pickBestDefaultTemplate(rows, channelId)
    }

    for (const language of preferredLanguages) {
      const match = pickBestDefaultTemplate(
        rows.filter((row) => row.language.trim().toLowerCase() === language),
        channelId,
      )
      if (match) {
        return match
      }
    }

    return pickBestDefaultTemplate(rows, channelId)
  },
  async createTemplate(db: PostgresJsDatabase, data: CreateContractTemplateInput) {
    validateContractTemplateBody(data.body)
    return db.transaction(async (tx) => {
      if (data.isDefault) {
        const [existingDefault] = await tx
          .select({ id: contractTemplates.id })
          .from(contractTemplates)
          .where(
            and(
              eq(contractTemplates.scope, data.scope),
              eq(contractTemplates.language, data.language),
              data.channelId
                ? eq(contractTemplates.channelId, data.channelId)
                : isNull(contractTemplates.channelId),
              eq(contractTemplates.isDefault, true),
            ),
          )
          .limit(1)
        if (existingDefault) {
          throw new Error(
            "A default contract template already exists for this scope/channel/language",
          )
        }
      }

      const [template] = await tx
        .insert(contractTemplates)
        .values({ ...data, currentVersionId: null })
        .returning()
      if (!template) return null

      const [version] = await tx
        .insert(contractTemplateVersions)
        .values({
          templateId: template.id,
          version: 1,
          body: data.body,
          variableSchema: null,
          changelog: "Initial version",
          createdBy: null,
        })
        .returning()
      if (!version) return template

      const [row] = await tx
        .update(contractTemplates)
        .set({ currentVersionId: version.id, updatedAt: new Date() })
        .where(eq(contractTemplates.id, template.id))
        .returning()
      return row ?? template
    })
  },
  /**
   * Update a contract template. When `data.body` is supplied AND differs
   * from the row's current body, this also auto-creates a new
   * `contract_template_versions` row and points `currentVersionId` at
   * it — so every body edit produces a versioned record without a
   * separate "Add Version" action.
   *
   * Edits that don't touch the body (rename, scope/language change,
   * active toggle, description) DON'T create a version — those are
   * metadata-only and don't affect rendering.
   *
   * Wraps both writes in a single transaction so a failure halfway
   * through can't leave the parent's `body` and `currentVersionId`
   * out of sync with the versions table.
   */
  async updateTemplate(db: PostgresJsDatabase, id: string, data: UpdateContractTemplateInput) {
    if (typeof data.body === "string") {
      validateContractTemplateBody(data.body)
    }

    return db.transaction(async (tx) => {
      // Read the current row first so we can detect whether the body
      // actually changed. Without this we'd version-bump on every
      // save even when the operator only touched the description.
      const [existing] = await tx
        .select()
        .from(contractTemplates)
        .where(eq(contractTemplates.id, id))
        .limit(1)
      if (!existing) return null

      const changedBody =
        typeof data.body === "string" && data.body !== existing.body ? data.body : null
      const nextTemplate = { ...existing, ...data }

      if (nextTemplate.isDefault) {
        const [existingDefault] = await tx
          .select({ id: contractTemplates.id })
          .from(contractTemplates)
          .where(
            and(
              eq(contractTemplates.scope, nextTemplate.scope),
              eq(contractTemplates.language, nextTemplate.language),
              nextTemplate.channelId
                ? eq(contractTemplates.channelId, nextTemplate.channelId)
                : isNull(contractTemplates.channelId),
              eq(contractTemplates.isDefault, true),
              ne(contractTemplates.id, id),
            ),
          )
          .limit(1)
        if (existingDefault) {
          throw new Error(
            "A default contract template already exists for this scope/channel/language",
          )
        }
      }

      let nextCurrentVersionId = existing.currentVersionId
      if (changedBody !== null) {
        const [maxRow] = await tx
          .select({ max: sql<number>`coalesce(max(${contractTemplateVersions.version}), 0)::int` })
          .from(contractTemplateVersions)
          .where(eq(contractTemplateVersions.templateId, id))
        const nextVersion = (maxRow?.max ?? 0) + 1
        const [version] = await tx
          .insert(contractTemplateVersions)
          .values({
            templateId: id,
            version: nextVersion,
            body: changedBody,
            variableSchema: null,
            // No explicit changelog supplied — auto-stamp with the
            // version number so the versions table still tells a
            // coherent story without forcing the operator to type one.
            changelog: `Auto-versioned from edit (v${nextVersion})`,
            createdBy: null,
          })
          .returning()
        if (version) {
          nextCurrentVersionId = version.id
        }
      }

      const [row] = await tx
        .update(contractTemplates)
        .set({
          ...data,
          ...(changedBody !== null ? { currentVersionId: nextCurrentVersionId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(contractTemplates.id, id))
        .returning()
      return row ?? null
    })
  },
  async deleteTemplate(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(contractTemplates)
      .where(eq(contractTemplates.id, id))
      .returning({ id: contractTemplates.id })
    return row ?? null
  },
  listTemplateVersions(db: PostgresJsDatabase, templateId: string) {
    return db
      .select()
      .from(contractTemplateVersions)
      .where(eq(contractTemplateVersions.templateId, templateId))
      .orderBy(desc(contractTemplateVersions.version))
  },
  async getTemplateVersionById(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .select()
      .from(contractTemplateVersions)
      .where(eq(contractTemplateVersions.id, id))
      .limit(1)
    return row ?? null
  },
  async createTemplateVersion(
    db: PostgresJsDatabase,
    templateId: string,
    data: CreateContractTemplateVersionInput,
  ) {
    validateContractTemplateBody(data.body)

    return db.transaction(async (tx) => {
      const [template] = await tx
        .select({ id: contractTemplates.id })
        .from(contractTemplates)
        .where(eq(contractTemplates.id, templateId))
        .limit(1)
      if (!template) return null
      const [maxRow] = await tx
        .select({ max: sql<number>`coalesce(max(${contractTemplateVersions.version}), 0)::int` })
        .from(contractTemplateVersions)
        .where(eq(contractTemplateVersions.templateId, templateId))
      const nextVersion = (maxRow?.max ?? 0) + 1
      const [version] = await tx
        .insert(contractTemplateVersions)
        .values({
          templateId,
          version: nextVersion,
          body: data.body,
          variableSchema: data.variableSchema ?? null,
          changelog: data.changelog ?? null,
          createdBy: data.createdBy ?? null,
        })
        .returning()
      if (version) {
        await tx
          .update(contractTemplates)
          .set({ currentVersionId: version.id, updatedAt: new Date() })
          .where(eq(contractTemplates.id, templateId))
      }
      return version ?? null
    })
  },
  renderPreview(input: RenderTemplateInput): string {
    const body = input.body ?? ""
    validateContractTemplateBody(body)
    return renderTemplate(body, "html", input.variables)
  },
}
