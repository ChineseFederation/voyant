// agent-quality: file-size exception -- owner: framework-migrations; exact PostgreSQL footprint parsing and catalog comparison stay co-located so adoption fails closed through one reviewable verifier.
import type { MigrationClient, PlannedMigration } from "./collector.js"

/** An exact migration identity that may be adopted when its DDL already exists. */
export interface MaterializedMigrationAdoption {
  source: string
  tag: string
  /**
   * Exact tables whose DDL is already materialized while the remainder of the
   * migration is still pending. Omit to adopt the migration's whole footprint.
   */
  tables?: readonly string[]
}

interface ExpectedColumn {
  table: string
  name: string
  position: number
  dataType: string
  notNull: boolean
  defaultExpression: string | null
  identity: string
  generated: string
}

interface ExpectedTable {
  name: string
  kind: "r"
  persistence: "p"
}

interface ExpectedConstraint {
  table: string
  name: string
  type: "p" | "u" | "f"
  columns: string[]
  referencedSchema: string | null
  referencedTable: string | null
  referencedColumns: string[]
  updateAction: string
  deleteAction: string
  matchType: string
  deferrable: boolean
  initiallyDeferred: boolean
}

interface ExpectedIndex {
  table: string
  name: string
  definition: string
  valid: boolean
  ready: boolean
  live: boolean
}

interface ExpectedFootprint {
  tables: ExpectedTable[]
  columns: ExpectedColumn[]
  constraints: ExpectedConstraint[]
  indexes: ExpectedIndex[]
}

interface LiveFootprint {
  tables: Array<{
    name: string
    kind: string
    persistence: string
  }>
  columns: ExpectedColumn[]
  constraints: ExpectedConstraint[]
  indexes: ExpectedIndex[]
}

export type MaterializedMigrationClassification = { status: "absent" } | { status: "materialized" }

export type MaterializedMigrationTableClassification =
  | { status: "absent" }
  | { status: "materialized"; statementIndexes: number[] }

const identifier = `"([^"]+)"`

function splitStatements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean)
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = []
  let start = 0
  let depth = 0
  let inSingle = false
  let inDouble = false
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (char === "'" && !inDouble) {
      if (inSingle && value[index + 1] === "'") {
        index += 1
      } else {
        inSingle = !inSingle
      }
      continue
    }
    if (char === '"' && !inSingle) {
      if (inDouble && value[index + 1] === '"') {
        index += 1
      } else {
        inDouble = !inDouble
      }
      continue
    }
    if (inSingle || inDouble) continue
    if (char === "(") depth += 1
    if (char === ")") depth -= 1
    if (char === "," && depth === 0) {
      parts.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts.filter(Boolean)
}

function postgresIdentifier(value: string): string {
  const identifierValue = value.replace(/^"|"$/g, "").replaceAll('""', '"').trim()
  let result = ""
  let bytes = 0
  for (const character of identifierValue) {
    const width = new TextEncoder().encode(character).length
    if (bytes + width > 63) break
    result += character
    bytes += width
  }
  return result
}

function normalizeQuotedIdentifiers(value: string): string {
  return value.replace(/"((?:[^"]|"")+)"/g, (_match, escaped: string) => {
    const identifierValue = escaped.replaceAll('""', '"')
    return /^[a-z_][a-z0-9_$]*$/.test(identifierValue)
      ? identifierValue
      : `"${identifierValue.replaceAll('"', '""')}"`
  })
}

function lowercaseOutsideQuotedValues(value: string): string {
  let result = ""
  let quote: "'" | '"' | null = null
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] as string
    if ((character === "'" || character === '"') && (quote === null || quote === character)) {
      result += character
      if (quote === character && value[index + 1] === character) {
        result += character
        index += 1
      } else {
        quote = quote === null ? character : null
      }
      continue
    }
    result += quote === null ? character.toLowerCase() : character
  }
  return result
}

function normalizeOutsideStringLiterals(
  value: string,
  normalizeOutside: (value: string) => string,
): string {
  let result = ""
  let outside = ""
  let inLiteral = false
  const flushOutside = () => {
    if (!outside) return
    result += normalizeOutside(outside)
    outside = ""
  }
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] as string
    if (character === "'") {
      if (!inLiteral) flushOutside()
      result += character
      if (inLiteral && value[index + 1] === "'") {
        result += "'"
        index += 1
      } else {
        inLiteral = !inLiteral
      }
      continue
    }
    if (inLiteral) {
      result += character
    } else {
      outside += character
    }
  }
  flushOutside()
  return result
}

function normalizeSqlSyntaxOutsideStringLiterals(
  value: string,
  options: { stripPublicPrefix?: boolean; stripIndexCreationGuard?: boolean } = {},
): string {
  return normalizeOutsideStringLiterals(value, (outside) => {
    let normalized = normalizeQuotedIdentifiers(outside)
    if (options.stripIndexCreationGuard) {
      normalized = normalized.replace(
        /\b(CREATE\s+(?:UNIQUE\s+)?INDEX)\s+IF\s+NOT\s+EXISTS\b/i,
        "$1",
      )
    }
    if (options.stripPublicPrefix) normalized = normalized.replace(/\bpublic\./gi, "")
    return lowercaseOutsideQuotedValues(
      normalized.replace(/\s+/g, " ").replace(/\s*([(),])\s*/g, "$1"),
    )
  }).trim()
}

function normalizeType(value: string): string {
  return lowercaseOutsideQuotedValues(
    normalizeQuotedIdentifiers(value)
      .trim()
      .replace(/^public\./i, "")
      .replace(/\s+/g, " "),
  )
}

function normalizeExpression(value: string | null | undefined): string | null {
  if (value == null) return null
  let normalized = value.trim().replace(/;$/, "")
  while (normalized.startsWith("(") && normalized.endsWith(")")) {
    normalized = normalized.slice(1, -1).trim()
  }
  return normalizeSqlSyntaxOutsideStringLiterals(normalized)
}

function normalizeIndexDefinition(value: string): string {
  return normalizeSqlSyntaxOutsideStringLiterals(value.trim().replace(/;$/, ""), {
    stripPublicPrefix: true,
    stripIndexCreationGuard: true,
  })
}

function unsupported(migration: PlannedMigration, detail: string): never {
  throw new Error(
    `cannot adopt materialized migration ${migration.source}/${migration.tag}: ${detail}. ` +
      "The verifier fails closed when it cannot prove the exact DDL footprint.",
  )
}

function parseIdentifierList(value: string): string[] {
  return splitTopLevel(value).map(postgresIdentifier)
}

function actionCode(action: string | undefined): string {
  switch ((action ?? "NO ACTION").replace(/\s+/g, " ").toUpperCase()) {
    case "NO ACTION":
      return "a"
    case "RESTRICT":
      return "r"
    case "CASCADE":
      return "c"
    case "SET NULL":
      return "n"
    case "SET DEFAULT":
      return "d"
    default:
      return "?"
  }
}

function constraintFromBody(
  migration: PlannedMigration,
  table: string,
  name: string,
  body: string,
): ExpectedConstraint {
  const primary = body.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)(.*)$/i)
  if (primary) {
    const suffix = primary[2]?.trim() ?? ""
    if (suffix && !/^DEFERRABLE(?:\s+INITIALLY\s+(?:IMMEDIATE|DEFERRED))?$/i.test(suffix)) {
      unsupported(migration, `unsupported PRIMARY KEY definition for constraint ${name}`)
    }
    return {
      table,
      name: postgresIdentifier(name),
      type: "p",
      columns: parseIdentifierList(primary[1] as string),
      referencedSchema: null,
      referencedTable: null,
      referencedColumns: [],
      updateAction: " ",
      deleteAction: " ",
      matchType: " ",
      deferrable: /\bDEFERRABLE\b/i.test(suffix),
      initiallyDeferred: /\bINITIALLY\s+DEFERRED\b/i.test(suffix),
    }
  }

  const unique = body.match(/^UNIQUE\s*\(([^)]+)\)(.*)$/i)
  if (unique) {
    const suffix = unique[2]?.trim() ?? ""
    if (suffix && !/^DEFERRABLE(?:\s+INITIALLY\s+(?:IMMEDIATE|DEFERRED))?$/i.test(suffix)) {
      unsupported(migration, `unsupported UNIQUE definition for constraint ${name}`)
    }
    return {
      table,
      name: postgresIdentifier(name),
      type: "u",
      columns: parseIdentifierList(unique[1] as string),
      referencedSchema: null,
      referencedTable: null,
      referencedColumns: [],
      updateAction: " ",
      deleteAction: " ",
      matchType: " ",
      deferrable: /\bDEFERRABLE\b/i.test(suffix),
      initiallyDeferred: /\bINITIALLY\s+DEFERRED\b/i.test(suffix),
    }
  }

  const foreign = body.match(
    new RegExp(
      `^FOREIGN\\s+KEY\\s*\\(([^)]+)\\)\\s+REFERENCES\\s+(?:(?:${identifier})\\.)?(?:${identifier})\\s*\\(([^)]+)\\)([\\s\\S]*)$`,
      "i",
    ),
  )
  if (foreign) {
    const suffix = (foreign[5] ?? "").trim()
    const update = suffix.match(
      /\bON\s+UPDATE\s+(NO\s+ACTION|RESTRICT|CASCADE|SET\s+NULL|SET\s+DEFAULT)\b/i,
    )?.[1]
    const deletion = suffix.match(
      /\bON\s+DELETE\s+(NO\s+ACTION|RESTRICT|CASCADE|SET\s+NULL|SET\s+DEFAULT)\b/i,
    )?.[1]
    const match = suffix.match(/\bMATCH\s+(SIMPLE|FULL|PARTIAL)\b/i)?.[1]?.toUpperCase() ?? "SIMPLE"
    const known = suffix
      .replace(/\bON\s+UPDATE\s+(NO\s+ACTION|RESTRICT|CASCADE|SET\s+NULL|SET\s+DEFAULT)\b/gi, "")
      .replace(/\bON\s+DELETE\s+(NO\s+ACTION|RESTRICT|CASCADE|SET\s+NULL|SET\s+DEFAULT)\b/gi, "")
      .replace(/\bMATCH\s+(SIMPLE|FULL|PARTIAL)\b/gi, "")
      .replace(/\bNOT\s+DEFERRABLE\b/gi, "")
      .replace(/\bDEFERRABLE\b/gi, "")
      .replace(/\bINITIALLY\s+(IMMEDIATE|DEFERRED)\b/gi, "")
      .trim()
    if (known) unsupported(migration, `unsupported FOREIGN KEY definition for constraint ${name}`)
    return {
      table,
      name: postgresIdentifier(name),
      type: "f",
      columns: parseIdentifierList(foreign[1] as string),
      referencedSchema: postgresIdentifier(foreign[2] ?? "public"),
      referencedTable: postgresIdentifier(foreign[3] as string),
      referencedColumns: parseIdentifierList(foreign[4] as string),
      updateAction: actionCode(update),
      deleteAction: actionCode(deletion),
      matchType: match === "FULL" ? "f" : match === "PARTIAL" ? "p" : "s",
      deferrable: /\bDEFERRABLE\b/i.test(suffix) && !/\bNOT\s+DEFERRABLE\b/i.test(suffix),
      initiallyDeferred: /\bINITIALLY\s+DEFERRED\b/i.test(suffix),
    }
  }

  unsupported(migration, `unsupported constraint ${name}`)
}

function parseColumn(
  migration: PlannedMigration,
  table: string,
  position: number,
  definition: string,
  constraints: ExpectedConstraint[],
): ExpectedColumn {
  const match = definition.match(new RegExp(`^${identifier}\\s+([\\s\\S]+)$`))
  if (!match) unsupported(migration, `cannot parse a column in table ${table}`)
  const name = postgresIdentifier(match[1] as string)
  const remainder = match[2] as string
  if (/\b(?:REFERENCES|CHECK|GENERATED|COLLATE|UNIQUE)\b/i.test(remainder)) {
    unsupported(migration, `unsupported inline clause on ${table}.${name}`)
  }
  const clause = remainder.search(/\s+(?:DEFAULT|NOT\s+NULL|NULL|PRIMARY\s+KEY)\b/i)
  const rawType = (clause === -1 ? remainder : remainder.slice(0, clause)).trim()
  const qualifiers = clause === -1 ? "" : remainder.slice(clause).trim()
  const defaultMatch = qualifiers.match(
    /\bDEFAULT\s+([\s\S]*?)(?=\s+(?:NOT\s+NULL|NULL|PRIMARY\s+KEY)\b|$)/i,
  )
  const leftover = qualifiers
    .replace(/\bDEFAULT\s+[\s\S]*?(?=\s+(?:NOT\s+NULL|NULL|PRIMARY\s+KEY)\b|$)/i, "")
    .replace(/\bNOT\s+NULL\b/gi, "")
    .replace(/\bNULL\b/gi, "")
    .replace(/\bPRIMARY\s+KEY\b/gi, "")
    .trim()
  if (!rawType || leftover)
    unsupported(migration, `unsupported column definition for ${table}.${name}`)

  if (/\bPRIMARY\s+KEY\b/i.test(qualifiers)) {
    constraints.push({
      table,
      name: postgresIdentifier(`${table}_pkey`),
      type: "p",
      columns: [name],
      referencedSchema: null,
      referencedTable: null,
      referencedColumns: [],
      updateAction: " ",
      deleteAction: " ",
      matchType: " ",
      deferrable: false,
      initiallyDeferred: false,
    })
  }

  return {
    table,
    name,
    position,
    dataType: normalizeType(rawType),
    notNull: /\bNOT\s+NULL\b/i.test(qualifiers) || /\bPRIMARY\s+KEY\b/i.test(qualifiers),
    defaultExpression: normalizeExpression(defaultMatch?.[1]),
    identity: "",
    generated: "",
  }
}

function parseExpectedFootprint(migration: PlannedMigration): ExpectedFootprint {
  const tableNames: string[] = []
  const columns: ExpectedColumn[] = []
  const constraints: ExpectedConstraint[] = []
  const indexes: ExpectedIndex[] = []
  const statements = splitStatements(migration.sql)

  for (const statement of statements) {
    const create = statement.match(
      new RegExp(
        `^CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${identifier}\\s*\\(([\\s\\S]*)\\)\\s*;?$`,
        "i",
      ),
    )
    if (create) {
      const table = postgresIdentifier(create[1] as string)
      if (tableNames.includes(table)) {
        unsupported(migration, `table ${table} is created more than once`)
      }
      if (/\bDEFAULT\s*(?:\(\s*)*E'/i.test(create[2] as string)) {
        unsupported(migration, `E-string default expressions are not supported in table ${table}`)
      }
      tableNames.push(table)
      let position = 0
      for (const item of splitTopLevel(create[2] as string)) {
        const tableConstraint = item.match(
          new RegExp(`^CONSTRAINT\\s+${identifier}\\s+([\\s\\S]+)$`, "i"),
        )
        if (tableConstraint) {
          constraints.push(
            constraintFromBody(
              migration,
              table,
              tableConstraint[1] as string,
              tableConstraint[2] as string,
            ),
          )
          continue
        }
        position += 1
        columns.push(parseColumn(migration, table, position, item, constraints))
      }
      continue
    }

    const alterConstraint = statement.match(
      new RegExp(
        `^ALTER\\s+TABLE\\s+${identifier}\\s+ADD\\s+CONSTRAINT\\s+${identifier}\\s+([\\s\\S]+?)\\s*;?$`,
        "i",
      ),
    )
    if (alterConstraint) {
      const table = postgresIdentifier(alterConstraint[1] as string)
      if (!tableNames.includes(table)) {
        unsupported(
          migration,
          `constraint targets table ${table}, which this migration does not create`,
        )
      }
      constraints.push(
        constraintFromBody(
          migration,
          table,
          alterConstraint[2] as string,
          alterConstraint[3] as string,
        ),
      )
      continue
    }

    const index = statement.match(
      new RegExp(
        `^CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${identifier}\\s+ON\\s+${identifier}\\s+[\\s\\S]*;?$`,
        "i",
      ),
    )
    if (index) {
      const table = postgresIdentifier(index[2] as string)
      if (!tableNames.includes(table)) {
        unsupported(
          migration,
          `index ${index[1]} targets table ${table}, which this migration does not create`,
        )
      }
      indexes.push({
        table,
        name: postgresIdentifier(index[1] as string),
        definition: normalizeIndexDefinition(statement),
        valid: true,
        ready: true,
        live: true,
      })
      continue
    }

    unsupported(migration, `unsupported statement ${statement.slice(0, 80)}`)
  }

  if (tableNames.length === 0) unsupported(migration, "the migration creates no tables")
  return {
    tables: tableNames.map((name) => ({ name, kind: "r", persistence: "p" })),
    columns,
    constraints,
    indexes,
  }
}

function createdTables(migration: PlannedMigration): string[] {
  const tables: string[] = []
  for (const statement of splitStatements(migration.sql)) {
    const create = statement.match(
      new RegExp(`^CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${identifier}\\s*\\(`, "i"),
    )
    if (create) {
      const table = postgresIdentifier(create[1] as string)
      if (!tables.includes(table)) tables.push(table)
    }
  }
  if (tables.length === 0) unsupported(migration, "the migration creates no tables")
  return tables
}

function migrationForTables(
  migration: PlannedMigration,
  requestedTables: readonly string[],
): { migration: PlannedMigration; statementIndexes: number[] } {
  const tables = [...new Set(requestedTables.map(postgresIdentifier))]
  if (tables.length === 0) {
    unsupported(migration, "a partial adoption must name at least one table")
  }

  const selected = new Set(tables)
  const found = new Set<string>()
  const statements = splitStatements(migration.sql)
  const statementIndexes: number[] = []
  const selectedStatements: string[] = []

  for (const [index, statement] of statements.entries()) {
    const create = statement.match(
      new RegExp(`^CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${identifier}\\s*\\(`, "i"),
    )
    const alter = statement.match(
      new RegExp(`^ALTER\\s+TABLE\\s+${identifier}\\s+ADD\\s+CONSTRAINT\\s+`, "i"),
    )
    const indexTarget = statement.match(
      new RegExp(
        `^CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${identifier}\\s+ON\\s+${identifier}\\s+`,
        "i",
      ),
    )
    const table = create?.[1] ?? alter?.[1] ?? indexTarget?.[2]
    if (!table) continue
    const normalized = postgresIdentifier(table)
    if (!selected.has(normalized)) continue
    if (create) found.add(normalized)
    statementIndexes.push(index)
    selectedStatements.push(statement)
  }

  const unknown = tables.filter((table) => !found.has(table))
  if (unknown.length > 0) {
    unsupported(
      migration,
      `partial adoption names table(s) not created here: ${unknown.join(", ")}`,
    )
  }

  return {
    migration: {
      ...migration,
      sql: selectedStatements.join("\n--> statement-breakpoint\n"),
    },
    statementIndexes,
  }
}

function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value !== "string") return []
  return value.replace(/^\{/, "").replace(/\}$/, "").split(",").filter(Boolean)
}

async function readLiveTables(
  client: MigrationClient,
  tables: readonly string[],
): Promise<LiveFootprint["tables"]> {
  const tableRows = await client.query(
    `SELECT c.relname AS table_name,
            c.relkind AS relation_kind,
            c.relpersistence AS relation_persistence
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = ANY($1::text[])
      ORDER BY c.relname`,
    [tables],
  )
  return tableRows.rows.map((row) => ({
    name: String(row.table_name),
    kind: String(row.relation_kind ?? ""),
    persistence: String(row.relation_persistence ?? ""),
  }))
}

async function readLiveFootprint(
  client: MigrationClient,
  tables: readonly string[],
  liveTables: LiveFootprint["tables"],
): Promise<LiveFootprint> {
  if (liveTables.length !== tables.length) {
    return { tables: liveTables, columns: [], constraints: [], indexes: [] }
  }

  const columnRows = await client.query(
    `SELECT c.relname AS table_name,
            a.attname AS column_name,
            a.attnum::text AS ordinal_position,
            format_type(a.atttypid, a.atttypmod) AS data_type,
            a.attnotnull AS not_null,
            pg_get_expr(d.adbin, d.adrelid, true) AS column_default,
            a.attidentity AS identity_kind,
            a.attgenerated AS generated_kind
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE n.nspname = 'public'
        AND c.relname = ANY($1::text[])
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY c.relname, a.attnum`,
    [tables],
  )
  const constraintRows = await client.query(
    `SELECT rel.relname AS table_name,
            con.conname AS constraint_name,
            con.contype AS constraint_type,
            COALESCE(
              ARRAY(
                SELECT att.attname
                  FROM unnest(con.conkey) WITH ORDINALITY key(attnum, ordinality)
                  JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = key.attnum
                 ORDER BY key.ordinality
              ), ARRAY[]::name[]
            ) AS column_names,
            ref_ns.nspname AS referenced_schema,
            ref_rel.relname AS referenced_table,
            COALESCE(
              ARRAY(
                SELECT att.attname
                  FROM unnest(con.confkey) WITH ORDINALITY key(attnum, ordinality)
                  JOIN pg_attribute att ON att.attrelid = con.confrelid AND att.attnum = key.attnum
                 ORDER BY key.ordinality
              ), ARRAY[]::name[]
            ) AS referenced_column_names,
            con.confupdtype AS update_action,
            con.confdeltype AS delete_action,
            con.confmatchtype AS match_type,
            con.condeferrable AS is_deferrable,
            con.condeferred AS initially_deferred
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace ns ON ns.oid = rel.relnamespace
       LEFT JOIN pg_class ref_rel ON ref_rel.oid = con.confrelid
       LEFT JOIN pg_namespace ref_ns ON ref_ns.oid = ref_rel.relnamespace
      WHERE ns.nspname = 'public'
        AND rel.relname = ANY($1::text[])
      ORDER BY rel.relname, con.conname`,
    [tables],
  )
  const indexRows = await client.query(
    `SELECT rel.relname AS table_name,
            idx.relname AS index_name,
            pg_get_indexdef(idx.oid, 0, true) AS index_definition,
            i.indisvalid AS is_valid,
            i.indisready AS is_ready,
            i.indislive AS is_live
       FROM pg_index i
       JOIN pg_class rel ON rel.oid = i.indrelid
       JOIN pg_namespace ns ON ns.oid = rel.relnamespace
       JOIN pg_class idx ON idx.oid = i.indexrelid
       LEFT JOIN pg_constraint con ON con.conindid = idx.oid
      WHERE ns.nspname = 'public'
        AND rel.relname = ANY($1::text[])
        AND con.oid IS NULL
      ORDER BY rel.relname, idx.relname`,
    [tables],
  )

  return {
    tables: liveTables,
    columns: columnRows.rows.map((row) => ({
      table: String(row.table_name),
      name: String(row.column_name),
      position: Number(row.ordinal_position),
      dataType: normalizeType(String(row.data_type)),
      notNull: Boolean(row.not_null),
      defaultExpression: normalizeExpression(row.column_default as string | null | undefined),
      identity: String(row.identity_kind ?? ""),
      generated: String(row.generated_kind ?? ""),
    })),
    constraints: constraintRows.rows.map((row) => ({
      table: String(row.table_name),
      name: String(row.constraint_name),
      type: String(row.constraint_type) as ExpectedConstraint["type"],
      columns: strings(row.column_names),
      referencedSchema: row.referenced_schema == null ? null : String(row.referenced_schema),
      referencedTable: row.referenced_table == null ? null : String(row.referenced_table),
      referencedColumns: strings(row.referenced_column_names),
      updateAction: String(row.update_action ?? " "),
      deleteAction: String(row.delete_action ?? " "),
      matchType: String(row.match_type ?? " "),
      deferrable: Boolean(row.is_deferrable),
      initiallyDeferred: Boolean(row.initially_deferred),
    })),
    indexes: indexRows.rows.map((row) => ({
      table: String(row.table_name),
      name: String(row.index_name),
      definition: normalizeIndexDefinition(String(row.index_definition)),
      valid: Boolean(row.is_valid),
      ready: Boolean(row.is_ready),
      live: Boolean(row.is_live),
    })),
  }
}

function stable(value: unknown): string {
  return JSON.stringify(value)
}

function compareFootprint(
  migration: PlannedMigration,
  expected: ExpectedFootprint,
  live: LiveFootprint,
): void {
  const problems: string[] = []
  const expectedTables = [...expected.tables].sort((a, b) => stable(a).localeCompare(stable(b)))
  const liveTables = [...live.tables].sort((a, b) => stable(a).localeCompare(stable(b)))
  if (stable(expectedTables) !== stable(liveTables)) {
    problems.push(`tables expected ${stable(expectedTables)}, found ${stable(liveTables)}`)
  }
  if (liveTables.length === expectedTables.length) {
    for (const [label, expectedRows, liveRows] of [
      ["columns", expected.columns, live.columns],
      ["constraints", expected.constraints, live.constraints],
      ["indexes", expected.indexes, live.indexes],
    ] as const) {
      const orderedExpected = [...expectedRows].sort((a, b) => stable(a).localeCompare(stable(b)))
      const orderedLive = [...liveRows].sort((a, b) => stable(a).localeCompare(stable(b)))
      if (stable(orderedExpected) !== stable(orderedLive)) {
        problems.push(`${label} expected ${stable(orderedExpected)}, found ${stable(orderedLive)}`)
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `cannot adopt materialized migration ${migration.source}/${migration.tag}: ` +
        `the live schema does not exactly match its immutable SQL footprint.\n  • ${problems.join("\n  • ")}`,
    )
  }
}

/**
 * Classify one explicitly allowlisted, unrecorded migration without changing the database.
 * All created tables absent means normal execution; any presence must be an exact match.
 */
export async function classifyMaterializedMigration(
  client: MigrationClient,
  migration: PlannedMigration,
): Promise<MaterializedMigrationClassification> {
  // Absence needs only the CREATE TABLE identities. Do not reject an otherwise
  // unsupported allowlisted migration when there is nothing to adopt: it must
  // remain on the ordinary execute path.
  const tables = createdTables(migration)
  const liveTables = await readLiveTables(client, tables)
  if (liveTables.length === 0) return { status: "absent" }

  const expected = parseExpectedFootprint(migration)
  const live = await readLiveFootprint(
    client,
    expected.tables.map((table) => table.name),
    liveTables,
  )
  compareFootprint(migration, expected, live)
  return { status: "materialized" }
}

/**
 * Classify an explicitly allowlisted subset of one migration's table DDL.
 * The selected CREATE TABLE statements and every constraint/index statement
 * owned by those tables must already match exactly. The returned statement
 * indexes are safe for the deployment runner to omit while it executes the
 * migration's remaining immutable SQL and records the original content hash.
 */
export async function classifyMaterializedMigrationTables(
  client: MigrationClient,
  migration: PlannedMigration,
  tables: readonly string[],
): Promise<MaterializedMigrationTableClassification> {
  const selected = migrationForTables(migration, tables)
  const expected = parseExpectedFootprint(selected.migration)
  const tableNames = expected.tables.map((table) => table.name)
  const liveTables = await readLiveTables(client, tableNames)
  if (liveTables.length === 0) return { status: "absent" }

  const live = await readLiveFootprint(client, tableNames, liveTables)
  compareFootprint(selected.migration, expected, live)
  return { status: "materialized", statementIndexes: selected.statementIndexes }
}
