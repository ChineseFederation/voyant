export interface SetupMessages {
  nav: string
  title: string
  description: string
  progress: string
  /** Appended to {@link progress} when at least one step was skipped. */
  skippedCount: string
  complete: string
  skipped: string
  pending: string
  skip: string
  dismiss: string
  loading: string
  loadFailed: string
  /** Strip action that opens the checklist sheet. */
  continueAction: string
  /** Accessible name for the strip control that opens the checklist. */
  openChecklist: string
}
