// Runtime exports for server-side adapters.
export {
  createDbClient,
  createServerlessDbClient,
  type DbAdapter,
  type DisposableDbClient,
  db,
  getDb,
} from "../index.js"
export {
  dbClientDispose,
  dbSupportsTransactions,
  VOYANT_DB_DISPOSE,
  VOYANT_DB_SUPPORTS_TRANSACTIONS,
} from "../transaction-capability.js"
export { createGraphDbProvider } from "./graph-provider.js"
export { createPostgresAdvisoryLockManager } from "./locks.js"
export {
  acquireNodeDatabase,
  type NodeDatabaseEnv,
  openNodeDatabase,
  resolveNodeDatabase,
  withNodeDatabase,
} from "./node-database.js"
export { createPostgresKvStore, type PostgresKvStoreOptions } from "./postgres-kv.js"
export {
  createPostgresFixedWindowRateLimitStore,
  type FixedWindowRateLimitStore,
  type PostgresRateLimitStoreOptions,
  type RateLimitResult,
} from "./postgres-rate-limit.js"
