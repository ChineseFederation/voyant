import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import type {
  FacetRequest,
  IndexerAdapter,
  IndexerDocument,
  IndexerProviderOptions,
  IndexerScanOptions,
  IndexerSlice,
  SearchFilter,
  SearchHit,
  SearchRequest,
  SearchResults,
} from "@voyant-travel/catalog-contracts/indexer/contract"
import {
  resolveFacetBucketLimit,
  resolveSearchSort,
} from "@voyant-travel/catalog-contracts/indexer/contract"
import { PermanentSubscriberError } from "@voyant-travel/core"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { withOptionalTransaction } from "@voyant-travel/db/transaction"
import { dbSupportsTransactions } from "@voyant-travel/db/transaction-capability"
import { type SQL, sql } from "drizzle-orm"

import type { FieldPolicyRegistry } from "../contract.js"

const MAX_CANDIDATES = 10_000
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 250
const DEFAULT_SCAN_BATCH_SIZE = 250
const MAX_SCAN_BATCH_SIZE = 1_000
// Direct adapter construction is used by the portable conformance harness.
// Deployed providers must supply their own secret through the graph.
const DIRECT_ADAPTER_CURSOR_SIGNING_KEY = "voyant-postgres-indexer-direct-adapter"

type StoredRow = {
  id: string
  fields: Record<string, unknown> | string
  embeddings: Record<string, number[]> | string | null
  embedding_model_id: string | null
  document_text: string
  keyword_score?: number | string
  vector_score?: number | string
}

type PostgresVectorStrategy = "none" | "pgvector" | "lakebase"
type PostgresTypoStrategy = "none" | "pgtrgm"
type PostgresTextStrategy = "native" | "lakebase"

export interface PostgresIndexerOptions extends IndexerProviderOptions {
  /** The deployment-owned pooled database client. */
  db: AnyDrizzleDb
  /**
   * Recorded deployment capability. `pgvector` requires a provisioned vector
   * extension; the adapter never creates extensions or probes per request.
   */
  vectorStrategy?: PostgresVectorStrategy
  /** Recorded typo-recovery capability; pg_trgm remains deployment-owned. */
  typoStrategy?: PostgresTypoStrategy
  /** Recorded corpus-aware lexical capability provided by lakebase_text. */
  textStrategy?: PostgresTextStrategy
  /** HMAC material for opaque pagination cursors in a deployed provider. */
  cursorSigningKey?: string
}

export interface PostgresIndexerDiagnostics {
  candidateLimit: number
  typoStrategy: PostgresTypoStrategy
  textStrategy: PostgresTextStrategy
  vectorDimensions: number | null
  vectorStrategy: PostgresVectorStrategy
}

export interface PostgresProjectionState {
  documentCount: number
  generation: number
  /** Documents safely staged for a retryable bulk rebuild but not yet published. */
  stagedDocumentCount: number
  updatedAt: Date | string
}

export interface PostgresIndexerAdapter extends IndexerAdapter {
  /** Deployment-private cache invalidation token for one projection slice. */
  projectionGeneration(slice: IndexerSlice): Promise<number>
  /** Deployment-private projection state for maintenance and cache diagnostics. */
  projectionState(slice: IndexerSlice): Promise<PostgresProjectionState>
  /** Restore the immediately preceding atomically published projection, if retained. */
  rollbackProjection(slice: IndexerSlice): Promise<boolean>
  /** Recorded capability state; no request-time extension or management probes. */
  diagnostics(): PostgresIndexerDiagnostics
}

/**
 * Native Postgres catalog search projection.
 *
 * This first slice deliberately uses only portable Postgres facilities: JSONB
 * storage for structural hit fidelity and a generated `tsvector` + GIN index
 * for bounded lexical retrieval. Lakebase BM25/ANN and pgvector strategies
 * build on the same projection in subsequent slices; they must be capability
 * selected rather than probed while serving a request.
 */
export function createPostgresIndexer(options: PostgresIndexerOptions): PostgresIndexerAdapter {
  const { db } = options
  const vectorStrategy = options.vectorStrategy ?? "none"
  const typoStrategy = options.typoStrategy ?? "none"
  const textStrategy = options.textStrategy ?? "native"
  const cursorSigningKey = options.cursorSigningKey ?? DIRECT_ADAPTER_CURSOR_SIGNING_KEY
  const vectorDimensions = resolveVectorDimensions(vectorStrategy, options.vectorDimensions)
  let vectorStorageVerified = vectorStrategy === "none"
  let lakebaseVectorIndexReady = vectorStrategy !== "lakebase"
  let typoStorageVerified = typoStrategy !== "pgtrgm"
  let lakebaseTextStorageVerified = textStrategy !== "lakebase"
  let lakebaseTextIndexReady = textStrategy !== "lakebase"
  let storageEnsured = false

  const ensureStorage = async () => {
    if (storageEnsured) return
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS voyant_catalog_search_slices (
        vertical text NOT NULL,
        locale text NOT NULL,
        audience text NOT NULL,
        market text NOT NULL,
        channel text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        generation bigint NOT NULL DEFAULT 1,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (vertical, locale, audience, market, channel)
      )
    `)
    await db.execute(sql`
      ALTER TABLE voyant_catalog_search_slices
      ADD COLUMN IF NOT EXISTS generation bigint NOT NULL DEFAULT 1
    `)
    await db.execute(sql`
      ALTER TABLE voyant_catalog_search_slices
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS voyant_catalog_search_documents (
        vertical text NOT NULL,
        locale text NOT NULL,
        audience text NOT NULL,
        market text NOT NULL,
        channel text NOT NULL DEFAULT '',
        id text NOT NULL,
        fields jsonb NOT NULL,
        embeddings jsonb,
        embedding_model_id text,
        document_text text NOT NULL,
        search_vector tsvector GENERATED ALWAYS AS (
          to_tsvector('simple', document_text)
        ) STORED,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (vertical, locale, audience, market, channel, id)
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS voyant_catalog_search_facets (
        vertical text NOT NULL,
        locale text NOT NULL,
        audience text NOT NULL,
        market text NOT NULL,
        channel text NOT NULL DEFAULT '',
        document_id text NOT NULL,
        field text NOT NULL,
        value_type text NOT NULL,
        value_text text NOT NULL,
        value_number numeric,
        value_boolean boolean,
        PRIMARY KEY (
          vertical, locale, audience, market, channel, document_id, field, value_type, value_text
        )
      )
    `)
    await db.execute(sql`
      ALTER TABLE voyant_catalog_search_facets
      ADD COLUMN IF NOT EXISTS value_number numeric
    `)
    await db.execute(sql`
      ALTER TABLE voyant_catalog_search_facets
      ADD COLUMN IF NOT EXISTS value_boolean boolean
    `)
    await db.execute(sql`
      UPDATE voyant_catalog_search_facets
      SET value_number = value_text::numeric
      WHERE value_type = 'number' AND value_number IS NULL
    `)
    await db.execute(sql`
      UPDATE voyant_catalog_search_facets
      SET value_boolean = value_text::boolean
      WHERE value_type = 'boolean' AND value_boolean IS NULL
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS voyant_catalog_search_terms (
        vertical text NOT NULL,
        locale text NOT NULL,
        audience text NOT NULL,
        market text NOT NULL,
        channel text NOT NULL DEFAULT '',
        document_id text NOT NULL,
        term text NOT NULL,
        PRIMARY KEY (vertical, locale, audience, market, channel, document_id, term)
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS voyant_catalog_search_rebuild_documents (
        rebuild_id text NOT NULL,
        vertical text NOT NULL,
        locale text NOT NULL,
        audience text NOT NULL,
        market text NOT NULL,
        channel text NOT NULL DEFAULT '',
        id text NOT NULL,
        fields jsonb NOT NULL,
        embeddings jsonb,
        embedding_model_id text,
        document_text text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (rebuild_id, vertical, locale, audience, market, channel, id)
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS voyant_catalog_search_projection_snapshots (
        vertical text NOT NULL,
        locale text NOT NULL,
        audience text NOT NULL,
        market text NOT NULL,
        channel text NOT NULL DEFAULT '',
        id text NOT NULL,
        fields jsonb NOT NULL,
        embeddings jsonb,
        embedding_model_id text,
        document_text text NOT NULL,
        source_generation bigint NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (vertical, locale, audience, market, channel, id)
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS voyant_catalog_search_projection_snapshot_states (
        vertical text NOT NULL,
        locale text NOT NULL,
        audience text NOT NULL,
        market text NOT NULL,
        channel text NOT NULL DEFAULT '',
        source_generation bigint NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (vertical, locale, audience, market, channel)
      )
    `)
    await db.execute(sql`
      ALTER TABLE voyant_catalog_search_rebuild_documents
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()
    `)
    await db.execute(sql`
      DELETE FROM voyant_catalog_search_rebuild_documents
      WHERE created_at < now() - interval '1 day'
    `)
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS voyant_catalog_search_documents_vector_idx
        ON voyant_catalog_search_documents USING gin (search_vector)
    `)
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS voyant_catalog_search_documents_slice_idx
        ON voyant_catalog_search_documents (vertical, locale, audience, market, channel, id)
    `)
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS voyant_catalog_search_facets_lookup_idx
        ON voyant_catalog_search_facets (
          vertical, locale, audience, market, channel, field, value_type, value_text
      )
    `)
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS voyant_catalog_search_facets_number_lookup_idx
        ON voyant_catalog_search_facets (
          vertical, locale, audience, market, channel, field, value_number, document_id
        )
        WHERE value_number IS NOT NULL
    `)
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS voyant_catalog_search_facets_boolean_lookup_idx
        ON voyant_catalog_search_facets (
          vertical, locale, audience, market, channel, field, value_boolean, document_id
        )
        WHERE value_boolean IS NOT NULL
    `)
    if (typoStrategy === "pgtrgm") {
      if (!typoStorageVerified) {
        const trgmType = readRows(
          await db.execute(sql`SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm' LIMIT 1`),
        )
        if (trgmType.length === 0) {
          throw new Error(
            "Postgres catalog indexer recorded pgtrgm typo strategy requires the pg_trgm extension to be provisioned.",
          )
        }
        typoStorageVerified = true
      }
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS voyant_catalog_search_terms_trgm_idx
          ON voyant_catalog_search_terms USING gist (term gist_trgm_ops)
      `)
    }
    if (textStrategy === "lakebase" && !lakebaseTextStorageVerified) {
      const lakebaseTextExtension = readRows(
        await db.execute(sql`SELECT 1 FROM pg_extension WHERE extname = 'lakebase_text' LIMIT 1`),
      )
      if (lakebaseTextExtension.length === 0) {
        throw new Error(
          "Postgres catalog indexer recorded Lakebase text strategy requires the lakebase_text extension to be provisioned.",
        )
      }
      lakebaseTextStorageVerified = true
    }
    if (textStrategy !== "lakebase") {
      await db.execute(sql`DROP INDEX IF EXISTS voyant_catalog_search_documents_bm25_idx`)
    }
    if (vectorStrategy !== "none") {
      if (!vectorStorageVerified) {
        const requiredExtension = vectorStrategy === "lakebase" ? "lakebase_vector" : "vector"
        const vectorExtension = readRows(
          await db.execute(
            sql`SELECT 1 FROM pg_extension WHERE extname = ${requiredExtension} LIMIT 1`,
          ),
        )
        if (vectorExtension.length === 0) {
          throw new Error(
            `Postgres catalog indexer recorded ${vectorStrategy} vector strategy requires the ${requiredExtension} extension to be provisioned.`,
          )
        }
        vectorStorageVerified = true
      }
      await db.execute(sql`
        ALTER TABLE voyant_catalog_search_documents
        ADD COLUMN IF NOT EXISTS search_embedding vector
      `)
      if (vectorStrategy === "pgvector") {
        // Lakebase ANN indexes pin the column to the embedding dimension that
        // was active when the index was built. The pgvector exact-search path
        // deliberately uses an unbounded vector column so model migrations can
        // retain old derived rows while new dimensions are indexed under a new
        // embedding_model_id.
        await db.execute(sql`DROP INDEX IF EXISTS voyant_catalog_search_documents_ann_idx`)
        const [column] = readRows(
          await db.execute(sql`
            SELECT format_type(attribute.atttypid, attribute.atttypmod) AS data_type
            FROM pg_attribute AS attribute
            WHERE attribute.attrelid = 'voyant_catalog_search_documents'::regclass
              AND attribute.attname = 'search_embedding'
              AND NOT attribute.attisdropped
          `),
        ) as Array<{ data_type?: string }>
        if (column?.data_type !== "vector") {
          await db.execute(sql`
            ALTER TABLE voyant_catalog_search_documents
            ALTER COLUMN search_embedding TYPE vector
            USING search_embedding::vector
          `)
        }
      }
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS voyant_catalog_search_documents_embedding_slice_idx
          ON voyant_catalog_search_documents (
            vertical, locale, audience, market, channel, embedding_model_id, id
          )
      `)
    }
    storageEnsured = true
  }

  const ensureSlice = async (targetDb: AnyDrizzleDb, slice: IndexerSlice) => {
    await targetDb.execute(sql`
      INSERT INTO voyant_catalog_search_slices (vertical, locale, audience, market, channel)
      VALUES (
        ${slice.vertical}, ${slice.locale}, ${slice.audience}, ${slice.market}, ${slice.channel ?? ""}
      ) ON CONFLICT DO NOTHING
    `)
  }

  const bumpGeneration = async (targetDb: AnyDrizzleDb, slice: IndexerSlice) => {
    await targetDb.execute(sql`
      UPDATE voyant_catalog_search_slices
      SET generation = generation + 1, updated_at = now()
      WHERE ${facetSlicePredicate(slice)}
    `)
  }

  const ensureLakebaseTextIndex = async () => {
    if (textStrategy !== "lakebase" || lakebaseTextIndexReady) return
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS voyant_catalog_search_documents_bm25_idx
        ON voyant_catalog_search_documents
        USING lakebase_bm25 (search_vector)
        WITH (default_limit = 10000)
    `)
    lakebaseTextIndexReady = true
  }

  const ensureLakebaseVectorIndex = async () => {
    if (vectorStrategy !== "lakebase" || lakebaseVectorIndexReady) return
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS voyant_catalog_search_documents_ann_idx
        ON voyant_catalog_search_documents
        USING lakebase_ann (search_embedding vector_cosine_ops)
    `)
    lakebaseVectorIndexReady = true
  }

  const refreshLakebaseTextStatistics = async () => {
    if (textStrategy !== "lakebase") return
    // lakebase_bm25 computes corpus statistics at index build and refreshes
    // them through VACUUM. This runs after the publish transaction commits so
    // it never exposes a mixed projection generation.
    await db.execute(sql`VACUUM (ANALYZE) voyant_catalog_search_documents`)
  }

  const readProjectionState = async (slice: IndexerSlice): Promise<PostgresProjectionState> => {
    await ensureStorage()
    await ensureSlice(db, slice)
    const [row] = readRows(
      await db.execute(sql`
        SELECT
          slices.generation,
          slices.updated_at,
          count(documents.id)::integer AS document_count,
          (
            SELECT count(*)::integer
            FROM voyant_catalog_search_rebuild_documents AS staged
            WHERE staged.vertical = slices.vertical
              AND staged.locale = slices.locale
              AND staged.audience = slices.audience
              AND staged.market = slices.market
              AND staged.channel = slices.channel
          ) AS staged_document_count
        FROM voyant_catalog_search_slices AS slices
        LEFT JOIN voyant_catalog_search_documents AS documents
          ON documents.vertical = slices.vertical
          AND documents.locale = slices.locale
          AND documents.audience = slices.audience
          AND documents.market = slices.market
          AND documents.channel = slices.channel
        WHERE slices.vertical = ${slice.vertical}
          AND slices.locale = ${slice.locale}
          AND slices.audience = ${slice.audience}
          AND slices.market = ${slice.market}
          AND slices.channel = ${slice.channel ?? ""}
        GROUP BY
          slices.vertical,
          slices.locale,
          slices.audience,
          slices.market,
          slices.channel,
          slices.generation,
          slices.updated_at
      `),
    ) as Array<{
      document_count: number | string
      generation: number | string
      staged_document_count: number | string
      updated_at: Date | string
    }>
    return {
      documentCount: Number(row?.document_count ?? 0),
      generation: Number(row?.generation ?? 1),
      stagedDocumentCount: Number(row?.staged_document_count ?? 0),
      updatedAt: row?.updated_at ?? new Date(0),
    }
  }

  return {
    capabilities: {
      supportsKeywordSearch: true,
      supportsHybridSearch: vectorStrategy !== "none",
      supportsVectorFields: vectorStrategy !== "none",
      vectorDimensions,
      // The native fallback persists one selected embedding per document.
      maxVectorsPerDocument: vectorStrategy !== "none" ? 1 : null,
      supportsCrossAudienceFederation: true,
      supportsAdminDenormalization: true,
    },

    async projectionGeneration(slice) {
      return (await readProjectionState(slice)).generation
    },

    async projectionState(slice) {
      return readProjectionState(slice)
    },

    async rollbackProjection(slice) {
      if (dbSupportsTransactions(db) === false) {
        throw new Error(
          "Postgres catalog indexer projection rollback requires a transaction-capable database adapter.",
        )
      }
      await ensureStorage()
      await ensureSlice(db, slice)
      return withOptionalTransaction(db, async (tx) =>
        restoreProjectionSnapshot(tx, slice, vectorStrategy, typoStrategy),
      )
    },

    diagnostics() {
      return {
        candidateLimit: MAX_CANDIDATES,
        typoStrategy,
        textStrategy,
        vectorDimensions,
        vectorStrategy,
      }
    },

    admin: {
      async list() {
        await ensureStorage()
        const rows = readRows(
          await db.execute(sql`
            SELECT vertical, locale, audience, market, channel
            FROM voyant_catalog_search_slices
            UNION
            SELECT vertical, locale, audience, market, channel
            FROM voyant_catalog_search_documents
            ORDER BY vertical, locale, audience, market, channel
          `),
        ) as Array<IndexerSlice & { channel: string }>
        return rows.map((row) => ({
          vertical: row.vertical,
          locale: row.locale,
          audience: row.audience as IndexerSlice["audience"],
          market: row.market,
          ...(row.channel ? { channel: row.channel } : {}),
        }))
      },

      async drop(slice) {
        await ensureStorage()
        await discardProjectionSnapshot(db, slice)
        await db.execute(sql`
          DELETE FROM voyant_catalog_search_facets
          WHERE ${facetSlicePredicate(slice)}
        `)
        await db.execute(sql`
          DELETE FROM voyant_catalog_search_terms
          WHERE ${facetSlicePredicate(slice)}
        `)
        const documentResult = await db.execute(sql`
          DELETE FROM voyant_catalog_search_documents
          WHERE ${slicePredicate(slice)}
          RETURNING id
        `)
        const sliceResult = await db.execute(sql`
          DELETE FROM voyant_catalog_search_slices
          WHERE ${slicePredicate(slice)}
          RETURNING vertical
        `)
        return readRows(documentResult).length > 0 || readRows(sliceResult).length > 0
      },

      async *scan(slice, scanOptions: IndexerScanOptions = {}) {
        await ensureStorage()
        const batchSize = boundedBatchSize(scanOptions.batchSize)
        let afterId: string | undefined
        for (;;) {
          const rows = readRows(
            await db.execute(sql`
              SELECT id, fields, embeddings, embedding_model_id, document_text
              FROM voyant_catalog_search_documents
              WHERE ${slicePredicate(slice)}
                ${afterId ? sql`AND id > ${afterId}` : sql``}
              ORDER BY id
              LIMIT ${batchSize}
            `),
          ) as StoredRow[]
          if (rows.length === 0) return
          for (const row of rows) yield toDocument(row)
          afterId = rows.at(-1)?.id
        }
      },
    },

    async ensureCollection(_slice: IndexerSlice, _registry: FieldPolicyRegistry) {
      await ensureStorage()
      await ensureSlice(db, _slice)
    },

    async upsert(slice, documents) {
      if (documents.length === 0) return
      requireTransactionSupport(db, "incremental upsert")
      await ensureStorage()
      await withOptionalTransaction(db, async (tx) => {
        await ensureSlice(tx, slice)
        for (const document of documents) {
          const embedding = vectorDimensions
            ? selectedEmbedding(document, vectorDimensions)
            : undefined
          if (vectorStrategy !== "none") {
            await tx.execute(sql`
            INSERT INTO voyant_catalog_search_documents (
              vertical, locale, audience, market, channel, id, fields, embeddings,
              embedding_model_id, document_text, search_embedding
            ) VALUES (
              ${slice.vertical}, ${slice.locale}, ${slice.audience}, ${slice.market},
              ${slice.channel ?? ""}, ${document.id}, ${JSON.stringify(document.fields)}::jsonb,
              ${document.embeddings ? JSON.stringify(document.embeddings) : null}::jsonb,
              ${document.embedding_model_id ?? null}, ${documentText(document.fields)},
              ${embedding ?? null}::vector
            ) ON CONFLICT (vertical, locale, audience, market, channel, id)
            DO UPDATE SET
              fields = EXCLUDED.fields,
              embeddings = EXCLUDED.embeddings,
              embedding_model_id = EXCLUDED.embedding_model_id,
              document_text = EXCLUDED.document_text,
              search_embedding = EXCLUDED.search_embedding,
              updated_at = now()
            `)
          } else {
            await tx.execute(sql`
            INSERT INTO voyant_catalog_search_documents (
              vertical, locale, audience, market, channel, id, fields, embeddings,
              embedding_model_id, document_text
            ) VALUES (
              ${slice.vertical}, ${slice.locale}, ${slice.audience}, ${slice.market},
              ${slice.channel ?? ""}, ${document.id}, ${JSON.stringify(document.fields)}::jsonb,
              ${document.embeddings ? JSON.stringify(document.embeddings) : null}::jsonb,
              ${document.embedding_model_id ?? null}, ${documentText(document.fields)}
            ) ON CONFLICT (vertical, locale, audience, market, channel, id)
            DO UPDATE SET
              fields = EXCLUDED.fields,
              embeddings = EXCLUDED.embeddings,
              embedding_model_id = EXCLUDED.embedding_model_id,
              document_text = EXCLUDED.document_text,
              updated_at = now()
            `)
          }
          await replaceFacetValues(tx, slice, document)
          if (typoStrategy === "pgtrgm") await replaceTypoTerms(tx, slice, document)
        }
        await bumpGeneration(tx, slice)
        await discardProjectionSnapshot(tx, slice)
      })
      await ensureLakebaseTextIndex()
      await ensureLakebaseVectorIndex()
    },

    async delete(slice, ids) {
      if (ids.length === 0) return
      requireTransactionSupport(db, "incremental delete")
      await ensureStorage()
      await withOptionalTransaction(db, async (tx) => {
        await ensureSlice(tx, slice)
        await tx.execute(sql`
        DELETE FROM voyant_catalog_search_facets
        WHERE ${facetSlicePredicate(slice)}
          AND document_id IN (
            ${sql.join(
              ids.map((id) => sql`${id}`),
              sql`, `,
            )}
          )
        `)
        await tx.execute(sql`
        DELETE FROM voyant_catalog_search_terms
        WHERE ${facetSlicePredicate(slice)}
          AND document_id IN (
            ${sql.join(
              ids.map((id) => sql`${id}`),
              sql`, `,
            )}
          )
        `)
        await tx.execute(sql`
          DELETE FROM voyant_catalog_search_documents
          WHERE ${slicePredicate(slice)}
          AND id IN (
            ${sql.join(
              ids.map((id) => sql`${id}`),
              sql`, `,
            )}
          )
        `)
        await bumpGeneration(tx, slice)
        await discardProjectionSnapshot(tx, slice)
      })
    },

    async search(slice, request) {
      if (request.mode !== "keyword" && vectorStrategy === "none") {
        throw new Error("Postgres catalog indexer semantic and hybrid strategies are not enabled.")
      }
      await ensureStorage()
      return withConsistentSearchSnapshot(db, async (snapshotDb) => {
        const audiences =
          request.search_audiences?.length && slice.audience === "staff-admin"
            ? request.search_audiences
            : [slice.audience]
        const generation = await readSearchGenerationToken(snapshotDb, slice, audiences)
        let keywordRows =
          request.mode === "semantic"
            ? []
            : await searchKeywordRows(
                snapshotDb,
                slice,
                audiences,
                request,
                textStrategy,
                lakebaseTextIndexReady,
              )
        const usedTypoFallback =
          typoStrategy === "pgtrgm" && keywordRows.length === 0 && request.mode !== "semantic"
        if (usedTypoFallback) {
          keywordRows = await searchTypoRows(snapshotDb, slice, audiences, request)
        }
        const vectorRows =
          request.mode === "keyword"
            ? []
            : await searchVectorRows(snapshotDb, slice, audiences, request, vectorDimensions!)
        const capped = keywordRows.length > MAX_CANDIDATES || vectorRows.length > MAX_CANDIDATES
        const candidates = combineCandidates(request, keywordRows, vectorRows).filter(
          ({ document }) => matchesFilters(document, request.filters ?? []),
        )

        const registry = options.registries.get(slice.vertical)
        const ordered = orderHits(candidates, request, registry, slice)
        const pagedHits = afterCursor(
          ordered,
          request,
          registry,
          slice,
          request.pagination?.cursor,
          cursorSigningKey,
          generation,
        )
        const limit = boundedPageSize(request.pagination?.limit)
        const page = pagedHits.slice(0, limit)
        const results: SearchResults = {
          hits: page,
          total: candidates.length,
          ...(capped ? { totalRelation: "gte" as const } : {}),
          ...(limit < pagedHits.length
            ? {
                next_cursor: encodeCursor(
                  page.at(-1)!,
                  request,
                  registry,
                  slice,
                  cursorSigningKey,
                  generation,
                ),
              }
            : {}),
        }
        if (request.facets?.length) {
          results.facets = await buildFacets(
            snapshotDb,
            slice,
            audiences,
            request,
            request.facets,
            usedTypoFallback,
            vectorDimensions,
          )
        }
        return results
      })
    },

    async bulkReindex(slice, stream, rebuildOptions) {
      requireTransactionSupport(db, "atomic bulk reindex")
      await ensureStorage()
      await ensureSlice(db, slice)
      // A stable source snapshot identity lets a retry keep its staged chunks
      // without letting a changed source publish documents from an older run.
      // Callers that do not need resume semantics receive an isolated run.
      const rebuildId = rebuildIdForSlice(slice, rebuildOptions?.rebuildRunId ?? randomUUID())
      await withOptionalTransaction(db, async (tx) => {
        await discardOtherStagedRebuilds(tx, rebuildId, slice)
      })
      let batch: IndexerDocument[] = []
      try {
        for await (const document of stream) {
          batch.push(document)
          if (batch.length === 100) {
            await stageRebuildDocuments(db, rebuildId, slice, batch, vectorDimensions)
            batch = []
          }
        }
      } catch (error) {
        // A stream can fail between chunk boundaries. Commit its final partial
        // chunk before surfacing the failure so the next invocation can resume.
        await stageRebuildDocuments(db, rebuildId, slice, batch, vectorDimensions)
        throw error
      }
      await stageRebuildDocuments(db, rebuildId, slice, batch, vectorDimensions)
      await withOptionalTransaction(db, async (tx) => {
        await publishStagedRebuild(tx, rebuildId, slice, vectorStrategy, typoStrategy)
      })
      await db.execute(sql`
        DELETE FROM voyant_catalog_search_rebuild_documents
        WHERE rebuild_id = ${rebuildId}
      `)
      await ensureLakebaseTextIndex()
      await ensureLakebaseVectorIndex()
      await refreshLakebaseTextStatistics()
    },
  }
}

/**
 * Keep candidate retrieval and facet aggregation on one stable projection.
 * Drivers explicitly configured without transaction support retain their
 * existing direct-read behavior.
 */
async function withConsistentSearchSnapshot<T>(
  db: AnyDrizzleDb,
  callback: (snapshotDb: AnyDrizzleDb) => Promise<T>,
): Promise<T> {
  return withOptionalTransaction(db, async (tx) => {
    if (tx !== db) {
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`)
    }
    return callback(tx)
  })
}

function requireTransactionSupport(db: AnyDrizzleDb, operation: string): void {
  if (
    dbSupportsTransactions(db) === false ||
    typeof (db as { transaction?: unknown }).transaction !== "function"
  ) {
    throw new Error(
      `Postgres catalog indexer ${operation} requires a transaction-capable database adapter.`,
    )
  }
}

async function readSearchGenerationToken(
  db: AnyDrizzleDb,
  slice: IndexerSlice,
  audiences: readonly string[],
): Promise<string> {
  const rows = readRows(
    await db.execute(sql`
      SELECT audience, generation
      FROM voyant_catalog_search_slices
      WHERE vertical = ${slice.vertical}
        AND locale = ${slice.locale}
        AND audience IN (${sql.join(
          audiences.map((audience) => sql`${audience}`),
          sql`, `,
        )})
        AND market = ${slice.market}
        AND channel = ${slice.channel ?? ""}
      ORDER BY audience
    `),
  ) as Array<{ audience: string; generation: number | string }>
  return rows.map((row) => `${row.audience}:${row.generation}`).join(",") || "empty"
}

async function searchKeywordRows(
  db: AnyDrizzleDb,
  slice: IndexerSlice,
  audiences: readonly string[],
  request: SearchRequest,
  textStrategy: PostgresTextStrategy,
  lakebaseTextIndexReady: boolean,
): Promise<StoredRow[]> {
  const query = request.query.trim()
  if (textStrategy === "lakebase" && lakebaseTextIndexReady && query.length >= 3) {
    return searchLakebaseKeywordRows(db, slice, audiences, request)
  }
  const prefixQuery = toPrefixTsQuery(query)
  const keywordScoreSql = query
    ? prefixQuery
      ? sql`
          GREATEST(
            ts_rank_cd(search_vector, websearch_to_tsquery('simple', ${query})),
            ts_rank_cd(search_vector, to_tsquery('simple', ${prefixQuery}))
          )
        `
      : sql`ts_rank_cd(search_vector, websearch_to_tsquery('simple', ${query}))`
    : sql`0`
  const keywordPredicate = query
    ? prefixQuery
      ? sql`
          AND (
            search_vector @@ websearch_to_tsquery('simple', ${query})
            OR search_vector @@ to_tsquery('simple', ${prefixQuery})
          )
        `
      : sql`AND search_vector @@ websearch_to_tsquery('simple', ${query})`
    : sql``
  return readRows(
    await db.execute(sql`
      SELECT id, fields, embeddings, embedding_model_id, document_text,
        ${keywordScoreSql} AS keyword_score
      FROM voyant_catalog_search_documents
      WHERE ${documentSlicePredicate(slice, audiences)}
        ${keywordPredicate}
        ${filterPredicate(request.filters ?? [])}
      ORDER BY keyword_score DESC, id
      LIMIT ${MAX_CANDIDATES + 1}
    `),
  ) as StoredRow[]
}

async function searchLakebaseKeywordRows(
  db: AnyDrizzleDb,
  slice: IndexerSlice,
  audiences: readonly string[],
  request: SearchRequest,
): Promise<StoredRow[]> {
  const query = request.query.trim()
  const bm25Query = sql`to_bm25query(
    to_tsvector('simple', ${query}),
    'voyant_catalog_search_documents_bm25_idx'::regclass
  )`
  return readRows(
    await db.execute(sql`
      SELECT id, fields, embeddings, embedding_model_id, document_text,
        -(search_vector <@> ${bm25Query}) AS keyword_score
      FROM voyant_catalog_search_documents
      WHERE ${slicePredicate(slice, audiences)}
        ${filterPredicate(request.filters ?? [])}
      ORDER BY search_vector <@> ${bm25Query}, id
      LIMIT ${MAX_CANDIDATES + 1}
    `),
  ) as StoredRow[]
}

async function searchVectorRows(
  db: AnyDrizzleDb,
  slice: IndexerSlice,
  audiences: readonly string[],
  request: SearchRequest,
  dimensions: number,
): Promise<StoredRow[]> {
  const embedding = queryEmbedding(request, dimensions)
  const threshold = distanceThreshold(request.distance_threshold)
  return readRows(
    await db.execute(sql`
      SELECT id, fields, embeddings, embedding_model_id, document_text,
        1 - (search_embedding <=> ${embedding}::vector) AS vector_score
      FROM voyant_catalog_search_documents
      WHERE ${slicePredicate(slice, audiences)}
        AND search_embedding IS NOT NULL
        ${filterPredicate(request.filters ?? [])}
        ${
          request.query_embedding_model_id
            ? sql`AND embedding_model_id = ${request.query_embedding_model_id}`
            : sql``
        }
        ${
          threshold === undefined
            ? sql``
            : sql`AND search_embedding <=> ${embedding}::vector <= ${threshold}`
        }
      ORDER BY search_embedding <=> ${embedding}::vector, id
      LIMIT ${MAX_CANDIDATES + 1}
    `),
  ) as StoredRow[]
}

async function searchTypoRows(
  db: AnyDrizzleDb,
  slice: IndexerSlice,
  audiences: readonly string[],
  request: SearchRequest,
): Promise<StoredRow[]> {
  const query = request.query.trim().toLocaleLowerCase()
  if (query.length < 3 || query.length > 64) return []
  return readRows(
    await db.execute(sql`
      WITH typo_candidates AS (
        SELECT
          terms.vertical,
          terms.locale,
          terms.audience,
          terms.market,
          terms.channel,
          terms.document_id,
          terms.term <-> ${query} AS distance
        FROM voyant_catalog_search_terms AS terms
        WHERE ${termSlicePredicate(slice, audiences)}
          AND terms.term % ${query}
        ORDER BY terms.term <-> ${query}
        LIMIT ${MAX_CANDIDATES + 1}
      ), typo_documents AS (
        SELECT DISTINCT ON (voyant_catalog_search_documents.id)
          voyant_catalog_search_documents.id,
          voyant_catalog_search_documents.fields,
          voyant_catalog_search_documents.embeddings,
          voyant_catalog_search_documents.embedding_model_id,
          voyant_catalog_search_documents.document_text,
          1 - typo_candidates.distance AS keyword_score
        FROM typo_candidates
        INNER JOIN voyant_catalog_search_documents
          ON voyant_catalog_search_documents.vertical = typo_candidates.vertical
          AND voyant_catalog_search_documents.locale = typo_candidates.locale
          AND voyant_catalog_search_documents.audience = typo_candidates.audience
          AND voyant_catalog_search_documents.market = typo_candidates.market
          AND voyant_catalog_search_documents.channel = typo_candidates.channel
          AND voyant_catalog_search_documents.id = typo_candidates.document_id
        WHERE TRUE
          ${filterPredicate(request.filters ?? [])}
        ORDER BY voyant_catalog_search_documents.id, typo_candidates.distance
      )
      SELECT * FROM typo_documents
      ORDER BY keyword_score DESC, id
      LIMIT ${MAX_CANDIDATES + 1}
    `),
  ) as StoredRow[]
}

function slicePredicate(slice: IndexerSlice, audiences: readonly string[] = [slice.audience]) {
  return sql`
    vertical = ${slice.vertical}
    AND locale = ${slice.locale}
    AND audience IN (
      ${sql.join(
        audiences.map((audience) => sql`${audience}`),
        sql`, `,
      )}
    )
    AND market = ${slice.market}
    AND channel = ${slice.channel ?? ""}
  `
}

function documentSlicePredicate(slice: IndexerSlice, audiences: readonly string[]) {
  return sql`
    voyant_catalog_search_documents.vertical = ${slice.vertical}
    AND voyant_catalog_search_documents.locale = ${slice.locale}
    AND voyant_catalog_search_documents.audience IN (
      ${sql.join(
        audiences.map((audience) => sql`${audience}`),
        sql`, `,
      )}
    )
    AND voyant_catalog_search_documents.market = ${slice.market}
    AND voyant_catalog_search_documents.channel = ${slice.channel ?? ""}
  `
}

function facetSlicePredicate(slice: IndexerSlice) {
  return sql`
    vertical = ${slice.vertical}
    AND locale = ${slice.locale}
    AND audience = ${slice.audience}
    AND market = ${slice.market}
    AND channel = ${slice.channel ?? ""}
  `
}

function termSlicePredicate(slice: IndexerSlice, audiences: readonly string[]) {
  return sql`
    terms.vertical = ${slice.vertical}
    AND terms.locale = ${slice.locale}
    AND terms.audience IN (
      ${sql.join(
        audiences.map((audience) => sql`${audience}`),
        sql`, `,
      )}
    )
    AND terms.market = ${slice.market}
    AND terms.channel = ${slice.channel ?? ""}
  `
}

async function replaceFacetValues(
  db: AnyDrizzleDb,
  slice: IndexerSlice,
  document: IndexerDocument,
): Promise<void> {
  await db.execute(sql`
    DELETE FROM voyant_catalog_search_facets
    WHERE ${facetSlicePredicate(slice)} AND document_id = ${document.id}
  `)
  const values = facetValues(document.fields)
  if (values.length === 0) return
  await db.execute(sql`
    INSERT INTO voyant_catalog_search_facets (
      vertical, locale, audience, market, channel, document_id, field, value_type, value_text,
      value_number, value_boolean
    ) VALUES ${sql.join(
      values.map(
        (value) => sql`(
          ${slice.vertical}, ${slice.locale}, ${slice.audience}, ${slice.market},
          ${slice.channel ?? ""}, ${document.id}, ${value.field}, ${value.type}, ${value.text},
          ${value.number}, ${value.boolean}
        )`,
      ),
      sql`, `,
    )}
    ON CONFLICT DO NOTHING
  `)
}

async function replaceTypoTerms(
  db: AnyDrizzleDb,
  slice: IndexerSlice,
  document: IndexerDocument,
): Promise<void> {
  await db.execute(sql`
    DELETE FROM voyant_catalog_search_terms
    WHERE ${facetSlicePredicate(slice)} AND document_id = ${document.id}
  `)
  const terms = curatedTerms(document.fields)
  if (terms.length === 0) return
  await db.execute(sql`
    INSERT INTO voyant_catalog_search_terms (
      vertical, locale, audience, market, channel, document_id, term
    ) VALUES ${sql.join(
      terms.map(
        (term) => sql`(
          ${slice.vertical}, ${slice.locale}, ${slice.audience}, ${slice.market},
          ${slice.channel ?? ""}, ${document.id}, ${term}
        )`,
      ),
      sql`, `,
    )}
    ON CONFLICT DO NOTHING
  `)
}

function rebuildIdForSlice(slice: IndexerSlice, rebuildRunId: string): string {
  const identity = [
    slice.vertical,
    slice.locale,
    slice.audience,
    slice.market,
    slice.channel ?? "",
    rebuildRunId,
  ].join("\u0000")
  const digest = createHmac("sha256", "voyant-catalog-rebuild-staging")
    .update(identity)
    .digest("hex")
  return `rebuild-${digest}`
}

async function discardOtherStagedRebuilds(
  db: AnyDrizzleDb,
  rebuildId: string,
  slice: IndexerSlice,
): Promise<void> {
  await db.execute(sql`
    DELETE FROM voyant_catalog_search_rebuild_documents
    WHERE ${stagingSlicePredicate(slice)}
      AND rebuild_id <> ${rebuildId}
  `)
}

async function stageRebuildDocuments(
  db: AnyDrizzleDb,
  rebuildId: string,
  slice: IndexerSlice,
  documents: IndexerDocument[],
  vectorDimensions: number | null,
): Promise<void> {
  if (documents.length === 0) return
  for (const document of documents) {
    if (vectorDimensions) selectedEmbedding(document, vectorDimensions)
  }
  await db.execute(sql`
    INSERT INTO voyant_catalog_search_rebuild_documents (
      rebuild_id, vertical, locale, audience, market, channel, id, fields, embeddings,
      embedding_model_id, document_text
    ) VALUES ${sql.join(
      documents.map(
        (document) => sql`(
          ${rebuildId}, ${slice.vertical}, ${slice.locale}, ${slice.audience}, ${slice.market},
          ${slice.channel ?? ""}, ${document.id}, ${JSON.stringify(document.fields)}::jsonb,
          ${document.embeddings ? JSON.stringify(document.embeddings) : null}::jsonb,
          ${document.embedding_model_id ?? null}, ${documentText(document.fields)}
        )`,
      ),
      sql`, `,
    )}
    ON CONFLICT (rebuild_id, vertical, locale, audience, market, channel, id)
    DO UPDATE SET
      fields = EXCLUDED.fields,
      embeddings = EXCLUDED.embeddings,
      embedding_model_id = EXCLUDED.embedding_model_id,
      document_text = EXCLUDED.document_text
  `)
}

async function publishStagedRebuild(
  db: AnyDrizzleDb,
  rebuildId: string,
  slice: IndexerSlice,
  vectorStrategy: PostgresVectorStrategy,
  typoStrategy: PostgresTypoStrategy,
): Promise<void> {
  await snapshotProjection(db, slice)
  await db.execute(sql`
    DELETE FROM voyant_catalog_search_facets
    WHERE ${facetSlicePredicate(slice)}
  `)
  await db.execute(sql`
    DELETE FROM voyant_catalog_search_terms
    WHERE ${facetSlicePredicate(slice)}
  `)
  await db.execute(sql`
    DELETE FROM voyant_catalog_search_documents
    WHERE ${slicePredicate(slice)}
  `)
  if (vectorStrategy !== "none") {
    await db.execute(sql`
      INSERT INTO voyant_catalog_search_documents (
        vertical, locale, audience, market, channel, id, fields, embeddings,
        embedding_model_id, document_text, search_embedding
      )
      SELECT
        vertical, locale, audience, market, channel, id, fields, embeddings,
        embedding_model_id, document_text,
        CASE
          WHEN embeddings IS NULL THEN NULL
          ELSE (SELECT value::text::vector FROM jsonb_each(embeddings) LIMIT 1)
        END
      FROM voyant_catalog_search_rebuild_documents
      WHERE rebuild_id = ${rebuildId}
        AND ${stagingSlicePredicate(slice)}
    `)
  } else {
    await db.execute(sql`
      INSERT INTO voyant_catalog_search_documents (
        vertical, locale, audience, market, channel, id, fields, embeddings,
        embedding_model_id, document_text
      )
      SELECT vertical, locale, audience, market, channel, id, fields, embeddings,
        embedding_model_id, document_text
      FROM voyant_catalog_search_rebuild_documents
      WHERE rebuild_id = ${rebuildId}
        AND ${stagingSlicePredicate(slice)}
    `)
  }
  await db.execute(sql`
    INSERT INTO voyant_catalog_search_facets (
      vertical, locale, audience, market, channel, document_id, field, value_type, value_text,
      value_number, value_boolean
    )
    SELECT
      staged.vertical,
      staged.locale,
      staged.audience,
      staged.market,
      staged.channel,
      staged.id,
      entry.key,
      jsonb_typeof(value_item.value),
      value_item.value #>> '{}',
      CASE
        WHEN jsonb_typeof(value_item.value) = 'number' THEN (value_item.value #>> '{}')::numeric
        ELSE NULL
      END,
      CASE
        WHEN jsonb_typeof(value_item.value) = 'boolean' THEN (value_item.value #>> '{}')::boolean
        ELSE NULL
      END
    FROM voyant_catalog_search_rebuild_documents AS staged
    CROSS JOIN LATERAL jsonb_each(staged.fields) AS entry(key, value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(entry.value) = 'array' THEN entry.value
        ELSE jsonb_build_array(entry.value)
      END
    ) AS value_item(value)
    WHERE staged.rebuild_id = ${rebuildId}
      AND ${stagingSlicePredicate(slice)}
      AND jsonb_typeof(value_item.value) IN ('string', 'number', 'boolean')
    ON CONFLICT DO NOTHING
  `)
  if (typoStrategy === "pgtrgm") {
    await db.execute(sql`
      INSERT INTO voyant_catalog_search_terms (
        vertical, locale, audience, market, channel, document_id, term
      )
      SELECT DISTINCT
        staged.vertical,
        staged.locale,
        staged.audience,
        staged.market,
        staged.channel,
        staged.id,
        lower(value_item.value #>> '{}')
      FROM voyant_catalog_search_rebuild_documents AS staged
      CROSS JOIN LATERAL jsonb_each(staged.fields) AS entry(key, value)
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(entry.value) = 'array' THEN entry.value
          ELSE jsonb_build_array(entry.value)
        END
      ) AS value_item(value)
      WHERE staged.rebuild_id = ${rebuildId}
        AND ${stagingSlicePredicate(slice)}
        AND jsonb_typeof(value_item.value) IN ('string', 'number', 'boolean')
        AND char_length(value_item.value #>> '{}') BETWEEN 3 AND 64
      ON CONFLICT DO NOTHING
    `)
  }
  await db.execute(sql`
    UPDATE voyant_catalog_search_slices
    SET generation = generation + 1, updated_at = now()
    WHERE ${facetSlicePredicate(slice)}
  `)
}

/** Keep one complete, slice-local predecessor until a rollback or steady write consumes it. */
async function snapshotProjection(db: AnyDrizzleDb, slice: IndexerSlice): Promise<void> {
  await discardProjectionSnapshot(db, slice)
  await db.execute(sql`
    INSERT INTO voyant_catalog_search_projection_snapshot_states (
      vertical, locale, audience, market, channel, source_generation
    )
    SELECT vertical, locale, audience, market, channel, generation
    FROM voyant_catalog_search_slices
    WHERE ${facetSlicePredicate(slice)}
  `)
  await db.execute(sql`
    INSERT INTO voyant_catalog_search_projection_snapshots (
      vertical, locale, audience, market, channel, id, fields, embeddings,
      embedding_model_id, document_text, source_generation
    )
    SELECT
      documents.vertical,
      documents.locale,
      documents.audience,
      documents.market,
      documents.channel,
      documents.id,
      documents.fields,
      documents.embeddings,
      documents.embedding_model_id,
      documents.document_text,
      slices.generation
    FROM voyant_catalog_search_documents AS documents
    INNER JOIN voyant_catalog_search_slices AS slices
      ON slices.vertical = documents.vertical
      AND slices.locale = documents.locale
      AND slices.audience = documents.audience
      AND slices.market = documents.market
      AND slices.channel = documents.channel
    WHERE documents.vertical = ${slice.vertical}
      AND documents.locale = ${slice.locale}
      AND documents.audience = ${slice.audience}
      AND documents.market = ${slice.market}
      AND documents.channel = ${slice.channel ?? ""}
  `)
}

/** Restore the predecessor captured by the most recent successful bulk publish. */
async function restoreProjectionSnapshot(
  db: AnyDrizzleDb,
  slice: IndexerSlice,
  vectorStrategy: PostgresVectorStrategy,
  typoStrategy: PostgresTypoStrategy,
): Promise<boolean> {
  const snapshot = readRows(
    await db.execute(sql`
      SELECT 1
      FROM voyant_catalog_search_projection_snapshot_states
      WHERE ${snapshotSlicePredicate(slice)}
      LIMIT 1
    `),
  )
  if (snapshot.length === 0) return false

  await db.execute(sql`
    DELETE FROM voyant_catalog_search_facets
    WHERE ${facetSlicePredicate(slice)}
  `)
  await db.execute(sql`
    DELETE FROM voyant_catalog_search_terms
    WHERE ${facetSlicePredicate(slice)}
  `)
  await db.execute(sql`
    DELETE FROM voyant_catalog_search_documents
    WHERE ${slicePredicate(slice)}
  `)
  if (vectorStrategy !== "none") {
    await db.execute(sql`
      INSERT INTO voyant_catalog_search_documents (
        vertical, locale, audience, market, channel, id, fields, embeddings,
        embedding_model_id, document_text, search_embedding
      )
      SELECT
        vertical, locale, audience, market, channel, id, fields, embeddings,
        embedding_model_id, document_text,
        CASE
          WHEN embeddings IS NULL THEN NULL
          ELSE (SELECT value::text::vector FROM jsonb_each(embeddings) LIMIT 1)
        END
      FROM voyant_catalog_search_projection_snapshots
      WHERE ${snapshotSlicePredicate(slice)}
    `)
  } else {
    await db.execute(sql`
      INSERT INTO voyant_catalog_search_documents (
        vertical, locale, audience, market, channel, id, fields, embeddings,
        embedding_model_id, document_text
      )
      SELECT vertical, locale, audience, market, channel, id, fields, embeddings,
        embedding_model_id, document_text
      FROM voyant_catalog_search_projection_snapshots
      WHERE ${snapshotSlicePredicate(slice)}
    `)
  }
  await rebuildProjectionFacets(db, slice, "voyant_catalog_search_projection_snapshots")
  if (typoStrategy === "pgtrgm") {
    await rebuildProjectionTerms(db, slice, "voyant_catalog_search_projection_snapshots")
  }
  await bumpProjectionGeneration(db, slice)
  await discardProjectionSnapshot(db, slice)
  return true
}

async function discardProjectionSnapshot(db: AnyDrizzleDb, slice: IndexerSlice): Promise<void> {
  await db.execute(sql`
    DELETE FROM voyant_catalog_search_projection_snapshot_states
    WHERE ${snapshotSlicePredicate(slice)}
  `)
  await db.execute(sql`
    DELETE FROM voyant_catalog_search_projection_snapshots
    WHERE ${snapshotSlicePredicate(slice)}
  `)
}

async function bumpProjectionGeneration(db: AnyDrizzleDb, slice: IndexerSlice): Promise<void> {
  await db.execute(sql`
    UPDATE voyant_catalog_search_slices
    SET generation = generation + 1, updated_at = now()
    WHERE ${facetSlicePredicate(slice)}
  `)
}

async function rebuildProjectionFacets(
  db: AnyDrizzleDb,
  slice: IndexerSlice,
  source: "voyant_catalog_search_projection_snapshots",
): Promise<void> {
  await db.execute(sql`
    INSERT INTO voyant_catalog_search_facets (
      vertical, locale, audience, market, channel, document_id, field, value_type, value_text,
      value_number, value_boolean
    )
    SELECT
      snapshot.vertical,
      snapshot.locale,
      snapshot.audience,
      snapshot.market,
      snapshot.channel,
      snapshot.id,
      entry.key,
      jsonb_typeof(value_item.value),
      value_item.value #>> '{}',
      CASE
        WHEN jsonb_typeof(value_item.value) = 'number' THEN (value_item.value #>> '{}')::numeric
        ELSE NULL
      END,
      CASE
        WHEN jsonb_typeof(value_item.value) = 'boolean' THEN (value_item.value #>> '{}')::boolean
        ELSE NULL
      END
    FROM ${sql.raw(source)} AS snapshot
    CROSS JOIN LATERAL jsonb_each(snapshot.fields) AS entry(key, value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(entry.value) = 'array' THEN entry.value
        ELSE jsonb_build_array(entry.value)
      END
    ) AS value_item(value)
    WHERE ${snapshotSlicePredicate(slice)}
      AND jsonb_typeof(value_item.value) IN ('string', 'number', 'boolean')
    ON CONFLICT DO NOTHING
  `)
}

async function rebuildProjectionTerms(
  db: AnyDrizzleDb,
  slice: IndexerSlice,
  source: "voyant_catalog_search_projection_snapshots",
): Promise<void> {
  await db.execute(sql`
    INSERT INTO voyant_catalog_search_terms (
      vertical, locale, audience, market, channel, document_id, term
    )
    SELECT DISTINCT
      snapshot.vertical,
      snapshot.locale,
      snapshot.audience,
      snapshot.market,
      snapshot.channel,
      snapshot.id,
      lower(value_item.value #>> '{}')
    FROM ${sql.raw(source)} AS snapshot
    CROSS JOIN LATERAL jsonb_each(snapshot.fields) AS entry(key, value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(entry.value) = 'array' THEN entry.value
        ELSE jsonb_build_array(entry.value)
      END
    ) AS value_item(value)
    WHERE ${snapshotSlicePredicate(slice)}
      AND jsonb_typeof(value_item.value) IN ('string', 'number', 'boolean')
      AND char_length(value_item.value #>> '{}') BETWEEN 3 AND 64
    ON CONFLICT DO NOTHING
  `)
}

function stagingSlicePredicate(slice: IndexerSlice) {
  return sql`
    vertical = ${slice.vertical}
    AND locale = ${slice.locale}
    AND audience = ${slice.audience}
    AND market = ${slice.market}
    AND channel = ${slice.channel ?? ""}
  `
}

function snapshotSlicePredicate(slice: IndexerSlice) {
  return sql`
    vertical = ${slice.vertical}
    AND locale = ${slice.locale}
    AND audience = ${slice.audience}
    AND market = ${slice.market}
    AND channel = ${slice.channel ?? ""}
  `
}

function curatedTerms(fields: Record<string, unknown>): string[] {
  const terms = new Set<string>()
  for (const value of flattenValues(fields)) {
    const normalized = value.trim().toLocaleLowerCase()
    if (normalized.length >= 3 && normalized.length <= 64) terms.add(normalized)
    for (const token of normalized.match(/[\p{L}\p{N}_-]+/gu) ?? []) {
      if (token.length >= 3 && token.length <= 64) terms.add(token)
    }
  }
  return [...terms].sort()
}

function facetValues(fields: Record<string, unknown>): Array<{
  boolean: boolean | null
  field: string
  number: number | null
  type: "boolean" | "number" | "string"
  text: string
}> {
  const values = new Map<
    string,
    {
      boolean: boolean | null
      field: string
      number: number | null
      type: "boolean" | "number" | "string"
      text: string
    }
  >()
  for (const [field, rawValue] of Object.entries(fields)) {
    for (const value of Array.isArray(rawValue) ? rawValue : [rawValue]) {
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
        continue
      }
      const type =
        typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "string"
      const typedValue = {
        boolean: typeof value === "boolean" ? value : null,
        field,
        number: typeof value === "number" ? value : null,
        type,
        text: String(value),
      } as const
      values.set(`${field}\u0000${type}\u0000${typedValue.text}`, typedValue)
    }
  }
  return [...values.values()]
}

/**
 * Push contract filters into typed facet rows before ranking. JSONB remains
 * the structural document payload; the in-memory predicate below is a
 * defensive equivalence check for nested contract expressions.
 */
function filterPredicate(filters: readonly SearchFilter[]): SQL {
  if (filters.length === 0) return sql``
  return sql`AND ${sql.join(filters.map(toFilterPredicate), sql` AND `)}`
}

function toFilterPredicate(filter: SearchFilter): SQL {
  if (filter.kind === "and") {
    if (filter.clauses.length === 0) return sql`TRUE`
    return sql`(${sql.join(filter.clauses.map(toFilterPredicate), sql` AND `)})`
  }
  if (filter.kind === "or") {
    if (filter.clauses.length === 0) return sql`FALSE`
    return sql`(${sql.join(filter.clauses.map(toFilterPredicate), sql` OR `)})`
  }
  if (filter.kind === "range") {
    // The contract treats `id` as a string, so a numeric range can never match it.
    if (filter.field === "id") return sql`FALSE`
    return sql`EXISTS (
      SELECT 1
      FROM voyant_catalog_search_facets AS facet
      WHERE facet.vertical = voyant_catalog_search_documents.vertical
        AND facet.locale = voyant_catalog_search_documents.locale
        AND facet.audience = voyant_catalog_search_documents.audience
        AND facet.market = voyant_catalog_search_documents.market
        AND facet.channel = voyant_catalog_search_documents.channel
        AND facet.document_id = voyant_catalog_search_documents.id
        AND facet.field = ${filter.field}
        AND facet.value_number IS NOT NULL
        ${filter.gte === undefined ? sql`` : sql`AND facet.value_number >= ${filter.gte}`}
        ${filter.lte === undefined ? sql`` : sql`AND facet.value_number <= ${filter.lte}`}
    )`
  }
  if (filter.kind === "eq") return scalarFilterPredicate(filter.field, filter.value)
  return sql`(${sql.join(
    filter.values.map((value) => scalarFilterPredicate(filter.field, value)),
    sql` OR `,
  )})`
}

function scalarFilterPredicate(field: string, value: string | number | boolean): SQL {
  if (field === "id") return sql`id = ${String(value)}`
  const typedPredicate =
    typeof value === "number"
      ? sql`facet.value_number = ${value}`
      : typeof value === "boolean"
        ? sql`facet.value_boolean = ${value}`
        : sql`facet.value_type = 'string' AND facet.value_text = ${value}`
  return sql`EXISTS (
    SELECT 1
    FROM voyant_catalog_search_facets AS facet
    WHERE facet.vertical = voyant_catalog_search_documents.vertical
      AND facet.locale = voyant_catalog_search_documents.locale
      AND facet.audience = voyant_catalog_search_documents.audience
      AND facet.market = voyant_catalog_search_documents.market
      AND facet.channel = voyant_catalog_search_documents.channel
      AND facet.document_id = voyant_catalog_search_documents.id
      AND facet.field = ${field}
      AND ${typedPredicate}
  )`
}

function readRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: unknown[] }).rows
  }
  return []
}

function toDocument(row: StoredRow): IndexerDocument {
  return {
    id: row.id,
    fields: parseJsonObject(row.fields),
    ...(row.embeddings
      ? { embeddings: parseJsonObject(row.embeddings) as Record<string, number[]> }
      : {}),
    ...(row.embedding_model_id ? { embedding_model_id: row.embedding_model_id } : {}),
  }
}

function parseJsonObject(value: Record<string, unknown> | string): Record<string, unknown> {
  if (typeof value === "string") {
    const parsed: unknown = JSON.parse(value)
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  }
  return value
}

function documentText(fields: Record<string, unknown>): string {
  return flattenValues(fields).join(" ")
}

function flattenValues(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)]
  }
  if (Array.isArray(value)) return value.flatMap(flattenValues)
  if (value && typeof value === "object") return Object.values(value).flatMap(flattenValues)
  return []
}

function matchesFilters(document: IndexerDocument, filters: SearchFilter[]): boolean {
  return filters.every((filter) => matchesFilter(document, filter))
}

function matchesFilter(document: IndexerDocument, filter: SearchFilter): boolean {
  if (filter.kind === "and") {
    return filter.clauses.every((clause) => matchesFilter(document, clause))
  }
  if (filter.kind === "or") return filter.clauses.some((clause) => matchesFilter(document, clause))
  const value = filter.field === "id" ? document.id : document.fields[filter.field]
  if (filter.kind === "eq") return sameScalar(value, filter.value)
  if (filter.kind === "in") return filter.values.some((candidate) => sameScalar(value, candidate))
  return (
    typeof value === "number" &&
    (filter.gte === undefined || value >= filter.gte) &&
    (filter.lte === undefined || value <= filter.lte)
  )
}

function sameScalar(value: unknown, expected: string | number | boolean): boolean {
  if (Array.isArray(value)) return value.some((entry) => sameScalar(entry, expected))
  return value === expected
}

function combineCandidates(
  request: SearchRequest,
  keywordRows: StoredRow[],
  vectorRows: StoredRow[],
): Array<{ document: IndexerDocument; score: number }> {
  const keywords = keywordRows.slice(0, MAX_CANDIDATES)
  const vectors = vectorRows.slice(0, MAX_CANDIDATES)
  if (request.mode === "keyword") {
    return keywords.map((row) => ({
      document: toDocument(row),
      score: keywordScore(row, request.query),
    }))
  }
  if (request.mode === "semantic") {
    return vectors.map((row) => ({ document: toDocument(row), score: vectorScore(row) }))
  }

  const alpha = hybridAlpha(request.alpha)
  const keywordRanks = reciprocalRanks(keywords)
  const vectorRanks = reciprocalRanks(vectors)
  const documents = new Map<string, IndexerDocument>()
  for (const row of [...keywords, ...vectors]) documents.set(row.id, toDocument(row))
  return [...documents.entries()].map(([id, document]) => ({
    document,
    score: (1 - alpha) * (keywordRanks.get(id) ?? 0) + alpha * (vectorRanks.get(id) ?? 0),
  }))
}

function reciprocalRanks(rows: StoredRow[]): Map<string, number> {
  return new Map(rows.map((row, index) => [row.id, 1 / (index + 1)]))
}

function keywordScore(row: StoredRow, query: string): number {
  if (typeof row.keyword_score === "number" && Number.isFinite(row.keyword_score)) {
    return row.keyword_score
  }
  if (typeof row.keyword_score === "string") {
    const parsed = Number(row.keyword_score)
    if (Number.isFinite(parsed)) return parsed
  }
  if (!query) return 0
  const text = row.document_text.toLocaleLowerCase()
  return query
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .reduce((score, token) => score + occurrences(text, token), 0)
}

function vectorScore(row: StoredRow): number {
  if (typeof row.vector_score === "number" && Number.isFinite(row.vector_score)) {
    return row.vector_score
  }
  if (typeof row.vector_score === "string") {
    const parsed = Number(row.vector_score)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function resolveVectorDimensions(
  strategy: PostgresVectorStrategy,
  dimensions: number | null | undefined,
): number | null {
  if (strategy === "none") return null
  if (!Number.isInteger(dimensions) || (dimensions ?? 0) <= 0) {
    // Permanent by construction: the setting is the same on every retry, so
    // the eight attempts the outbox would spend on it buy nothing and bury the
    // real error under whatever the last attempt reported (voyant#4639).
    throw new PermanentSubscriberError(
      "Postgres catalog indexer vector strategy requires a positive vectorDimensions deployment setting.",
    )
  }
  return dimensions ?? null
}

function selectedEmbedding(document: IndexerDocument, dimensions: number): string | null {
  const embeddings = Object.entries(document.embeddings ?? {})
  if (embeddings.length === 0) return null
  if (embeddings.length > 1) {
    throw new Error("Postgres catalog indexer vector strategy supports one embedding per document.")
  }
  const [, embedding] = embeddings[0]!
  return vectorLiteral(embedding, dimensions, `document "${document.id}" embedding`)
}

function queryEmbedding(request: SearchRequest, dimensions: number): string {
  if (!request.query_embedding) {
    throw new Error("Semantic and hybrid Postgres catalog searches require query_embedding.")
  }
  return vectorLiteral(request.query_embedding, dimensions, "query_embedding")
}

function vectorLiteral(values: number[], dimensions: number, label: string): string {
  if (values.length !== dimensions || values.some((value) => !Number.isFinite(value))) {
    throw new RangeError(`${label} must contain exactly ${dimensions} finite values.`)
  }
  return `[${values.join(",")}]`
}

function hybridAlpha(value: number | undefined): number {
  const alpha = value ?? 0.3
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new RangeError(
      `Hybrid alpha must be a finite number from 0 through 1; received ${String(value)}`,
    )
  }
  return alpha
}

function distanceThreshold(value: number | undefined): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `distance_threshold must be a finite non-negative number; received ${String(value)}`,
    )
  }
  return value
}

function occurrences(text: string, token: string): number {
  let index = text.indexOf(token)
  let count = 0
  while (index !== -1) {
    count += 1
    index = text.indexOf(token, index + token.length)
  }
  return count
}

/** Build a plain-text prefix tsquery; quoted/operator queries retain websearch semantics only. */
function toPrefixTsQuery(query: string): string | undefined {
  if (!query || !/^[\p{L}\p{N}_\s]+$/u.test(query)) return undefined
  const tokens = query.match(/[\p{L}\p{N}_]+/gu) ?? []
  return tokens.length > 0 ? tokens.map((token) => `${token}:*`).join(" & ") : undefined
}

function orderHits(
  candidates: Array<{ document: IndexerDocument; score: number }>,
  request: SearchRequest,
  registry: FieldPolicyRegistry | undefined,
  slice: IndexerSlice,
): SearchHit[] {
  const hits: SearchHit[] = candidates.map(({ document, score }) => ({
    id: document.id,
    score,
    document,
  }))
  const sort = request.sort ?? "relevance"
  return hits.sort((left, right) => {
    if (sort === "relevance") return right.score - left.score || left.id.localeCompare(right.id)
    const [field, direction] = resolveSortField(sort, registry, slice)
    const comparison = compareSortValues(left.document.fields[field], right.document.fields[field])
    return (direction === "asc" ? comparison : -comparison) || left.id.localeCompare(right.id)
  })
}

function resolveSortField(
  sort: Exclude<SearchRequest["sort"], undefined | "relevance">,
  registry: FieldPolicyRegistry | undefined,
  slice: IndexerSlice,
): [string, "asc" | "desc"] {
  const resolved = registry ? resolveSearchSort(sort, registry, slice) : undefined
  return resolved ? [resolved.field, resolved.direction] : sortField(sort)
}

function sortField(sort: NonNullable<SearchRequest["sort"]>): [string, "asc" | "desc"] {
  if (sort === "price-asc") return ["priceFromAmountCents", "asc"]
  if (sort === "price-desc") return ["priceFromAmountCents", "desc"]
  if (sort === "departure-asc") return ["nextDepartureDate", "asc"]
  return ["publishedAt", "desc"]
}

function compareSortValues(left: unknown, right: unknown): number {
  if (left === right) return 0
  if (left === undefined || left === null) return 1
  if (right === undefined || right === null) return -1
  if (typeof left === "number" && typeof right === "number") return left - right
  return String(left).localeCompare(String(right))
}

async function buildFacets(
  db: AnyDrizzleDb,
  slice: IndexerSlice,
  audiences: readonly string[],
  request: SearchRequest,
  facets: readonly FacetRequest[],
  usedTypoFallback: boolean,
  vectorDimensions: number | null,
) {
  const matchingDocuments = facetMatchPredicate(request, usedTypoFallback, vectorDimensions)
  const rows = readRows(
    await db.execute(sql`
      SELECT facet.field, facet.value_type, facet.value_text, COUNT(*)::int AS count
      FROM voyant_catalog_search_facets AS facet
      INNER JOIN voyant_catalog_search_documents
        ON voyant_catalog_search_documents.vertical = facet.vertical
        AND voyant_catalog_search_documents.locale = facet.locale
        AND voyant_catalog_search_documents.audience = facet.audience
        AND voyant_catalog_search_documents.market = facet.market
        AND voyant_catalog_search_documents.channel = facet.channel
        AND voyant_catalog_search_documents.id = facet.document_id
      WHERE ${documentSlicePredicate(slice, audiences)}
        AND ${matchingDocuments}
        AND facet.field IN (${sql.join(
          facets.map(({ field }) => sql`${field}`),
          sql`, `,
        )})
      GROUP BY facet.field, facet.value_type, facet.value_text
    `),
  ) as Array<{ field: string; value_type: string; value_text: string; count: number | string }>
  return Object.fromEntries(
    facets.map((facet) => [
      facet.field,
      rows
        .filter((row) => row.field === facet.field)
        .map((row) => ({
          value: row.value_type === "number" ? Number(row.value_text) : row.value_text,
          count: Number(row.count),
        }))
        .sort(
          (left, right) =>
            right.count - left.count || String(left.value).localeCompare(String(right.value)),
        )
        .slice(0, resolveFacetBucketLimit(facet.limit)),
    ]),
  )
}

/**
 * Facet aggregation deliberately has no candidate limit: it evaluates the
 * same filters and retrieval semantics over every matching projection row.
 * Native FTS supplies the complete lexical predicate even when Lakebase ranks
 * the top candidate page with BM25.
 */
function facetMatchPredicate(
  request: SearchRequest,
  usedTypoFallback: boolean,
  vectorDimensions: number | null,
): SQL {
  const keyword = usedTypoFallback
    ? typoFacetPredicate(request)
    : nativeKeywordFacetPredicate(request)
  const vector =
    request.mode === "keyword" ? sql`FALSE` : vectorFacetPredicate(request, vectorDimensions!)
  const retrieval =
    request.mode === "keyword"
      ? keyword
      : request.mode === "semantic"
        ? vector
        : sql`(${keyword} OR ${vector})`
  return sql`(${retrieval}) ${filterPredicate(request.filters ?? [])}`
}

function nativeKeywordFacetPredicate(request: SearchRequest): SQL {
  const query = request.query.trim()
  if (!query) return sql`TRUE`
  const prefixQuery = toPrefixTsQuery(query)
  return prefixQuery
    ? sql`(
        search_vector @@ websearch_to_tsquery('simple', ${query})
        OR search_vector @@ to_tsquery('simple', ${prefixQuery})
      )`
    : sql`search_vector @@ websearch_to_tsquery('simple', ${query})`
}

function typoFacetPredicate(request: SearchRequest): SQL {
  const query = request.query.trim().toLocaleLowerCase()
  if (query.length < 3 || query.length > 64) return sql`FALSE`
  return sql`EXISTS (
    SELECT 1
    FROM voyant_catalog_search_terms AS terms
    WHERE terms.vertical = voyant_catalog_search_documents.vertical
      AND terms.locale = voyant_catalog_search_documents.locale
      AND terms.audience = voyant_catalog_search_documents.audience
      AND terms.market = voyant_catalog_search_documents.market
      AND terms.channel = voyant_catalog_search_documents.channel
      AND terms.document_id = voyant_catalog_search_documents.id
      AND terms.term % ${query}
  )`
}

function vectorFacetPredicate(request: SearchRequest, dimensions: number): SQL {
  const embedding = queryEmbedding(request, dimensions)
  const threshold = distanceThreshold(request.distance_threshold)
  return sql`
    search_embedding IS NOT NULL
    ${
      request.query_embedding_model_id
        ? sql`AND embedding_model_id = ${request.query_embedding_model_id}`
        : sql``
    }
    ${
      threshold === undefined
        ? sql``
        : sql`AND search_embedding <=> ${embedding}::vector <= ${threshold}`
    }
  `
}

function boundedPageSize(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_PAGE_SIZE
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(
      `Search limit must be a positive finite integer; received ${String(limit)}`,
    )
  }
  return Math.min(limit, MAX_PAGE_SIZE)
}

function boundedBatchSize(batchSize: number | undefined): number {
  if (batchSize === undefined) return DEFAULT_SCAN_BATCH_SIZE
  if (!Number.isFinite(batchSize) || !Number.isInteger(batchSize) || batchSize <= 0) {
    throw new RangeError(
      `Scan batch size must be a positive finite integer; received ${String(batchSize)}`,
    )
  }
  return Math.min(batchSize, MAX_SCAN_BATCH_SIZE)
}

type SearchCursor = {
  generation: string
  v: 2
  id: string
  sort: string
  score?: number
  value?: unknown
}

function encodeCursor(
  hit: SearchHit,
  request: SearchRequest,
  registry: FieldPolicyRegistry | undefined,
  slice: IndexerSlice,
  signingKey: string,
  generation: string,
): string {
  const sort = request.sort ?? "relevance"
  const cursor: SearchCursor =
    sort === "relevance"
      ? { v: 2, generation, id: hit.id, sort, score: hit.score }
      : {
          v: 2,
          generation,
          id: hit.id,
          sort,
          value: hit.document.fields[resolveSortField(sort, registry, slice)[0]],
        }
  const payload = Buffer.from(JSON.stringify(cursor)).toString("base64url")
  return `${payload}.${signCursor(payload, signingKey)}`
}

function afterCursor(
  hits: SearchHit[],
  request: SearchRequest,
  registry: FieldPolicyRegistry | undefined,
  slice: IndexerSlice,
  encoded: string | undefined,
  signingKey: string,
  generation: string,
): SearchHit[] {
  if (!encoded) return hits
  const cursor = decodeCursor(encoded, request.sort ?? "relevance", signingKey)
  if (cursor.generation !== generation) {
    throw new RangeError("Search cursor is stale; repeat the search from its first page.")
  }
  if (cursor.sort === "relevance") {
    return hits.filter(
      (hit) =>
        hit.score < cursor.score! ||
        (hit.score === cursor.score && hit.id.localeCompare(cursor.id) > 0),
    )
  }
  const [field, direction] = resolveSortField(
    cursor.sort as Exclude<SearchRequest["sort"], undefined | "relevance">,
    registry,
    slice,
  )
  return hits.filter((hit) => {
    const comparison = compareSortValues(hit.document.fields[field], cursor.value)
    return (
      (direction === "asc" ? comparison : -comparison) > 0 ||
      (comparison === 0 && hit.id.localeCompare(cursor.id) > 0)
    )
  })
}

function decodeCursor(encoded: string, expectedSort: string, signingKey: string): SearchCursor {
  try {
    const [payload, signature, extra] = encoded.split(".")
    if (
      !payload ||
      !signature ||
      extra !== undefined ||
      !verifyCursor(payload, signature, signingKey)
    ) {
      throw new Error("invalid")
    }
    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (
      !decoded ||
      typeof decoded !== "object" ||
      (decoded as { v?: unknown }).v !== 2 ||
      typeof (decoded as { generation?: unknown }).generation !== "string" ||
      (decoded as { generation: string }).generation.length === 0 ||
      typeof (decoded as { id?: unknown }).id !== "string" ||
      (decoded as { sort?: unknown }).sort !== expectedSort
    ) {
      throw new Error("invalid")
    }
    const cursor = decoded as SearchCursor
    if (cursor.sort === "relevance" && typeof cursor.score !== "number") throw new Error("invalid")
    return cursor
  } catch {
    throw new RangeError("Search cursor is invalid.")
  }
}

function signCursor(payload: string, signingKey: string): string {
  return createHmac("sha256", signingKey).update(payload).digest("base64url")
}

function verifyCursor(payload: string, signature: string, signingKey: string): boolean {
  const expected = signCursor(payload, signingKey)
  const suppliedBytes = Buffer.from(signature)
  const expectedBytes = Buffer.from(expected)
  return (
    suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes)
  )
}
