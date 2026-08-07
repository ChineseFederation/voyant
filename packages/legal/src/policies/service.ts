import { policiesCoreService } from "./service-core.js"
import {
  _unused,
  type CancellationResult,
  type CancellationRule,
  type CancellationSegment,
  type CancellationSnapshotEvaluation,
  evaluateCancellationPolicy,
  evaluateCancellationSnapshot,
  evaluateSegmentedCancellation,
  type SegmentedCancellationInput,
  type SegmentedCancellationResult,
} from "./service-shared.js"

export {
  _unused,
  type CancellationResult,
  type CancellationRule,
  type CancellationSegment,
  type CancellationSnapshotEvaluation,
  evaluateCancellationPolicy,
  evaluateCancellationSnapshot,
  evaluateSegmentedCancellation,
  type SegmentedCancellationInput,
  type SegmentedCancellationResult,
}

export const policiesService = {
  ...policiesCoreService,
}
