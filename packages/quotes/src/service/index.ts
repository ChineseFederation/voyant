import { pipelinesService } from "./pipelines.js"
import { quoteVersionsService } from "./quote-versions.js"
import { quotesService as quoteRecordsService } from "./quotes.js"

export const quotesService = {
  ...pipelinesService,
  ...quoteRecordsService,
  ...quoteVersionsService,
}

export { PipelineDeleteConflictError, pipelinesService } from "./pipelines.js"
export type {
  ExecuteSnapshotAndSendQuoteCommandInput,
  SnapshotAndSendQuoteInput,
  SnapshotAndSendQuoteResult,
} from "./quote-delivery.js"
export {
  executeSnapshotAndSendQuoteCommand,
  snapshotAndSendQuoteInputSchema,
} from "./quote-delivery.js"
export type { AcceptQuoteVersionResult } from "./quote-versions.js"
export {
  QuoteVersionConflictError,
  QuoteVersionParentNotFoundError,
  quoteVersionsService,
} from "./quote-versions.js"
export { quotesService as quoteRecordsService } from "./quotes.js"
