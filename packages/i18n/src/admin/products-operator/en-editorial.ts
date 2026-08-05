export const operatorAdminProductsMessagesEnEditorial = {
  sectionTitle: "Editorial content",
  sectionDescription:
    "Provider content stays read-only. Overlays replace what customers see for the selected storefront locale.",
  localeLabel: "Storefront locale",
  localeSourceSuffix: "provider locale",
  localeOverlaySuffix: "has overlays",
  loadFailed: "Failed to load editorial content.",
  retry: "Retry",
  loading: "Loading editorial content…",
  readOnly: "You do not have permission to edit editorial content.",

  columnSource: "Provider source",
  columnOverlay: "Overlay",
  columnEffective: "Effective (customer)",
  compareLabel: "Compare values",

  stateExact: "Provider translation",
  stateLanguageFallback: "Language fallback",
  stateSourceFallback: "Source fallback",
  stateOverlaid: "Overlaid",
  stateOverlayOnly: "Overlay-only translation",
  stateMissing: "Missing",
  stateInvalid: "Invalid overlay",
  stateOrphaned: "Orphaned overlay",
  stateMixed: "Mixed",
  stateDrifted: "Provider changed",
  driftedDescription:
    "The provider updated this content after the overlay was authored. Compare, then keep, update, or clear the overlay.",
  invalidDescription:
    "This overlay does not validate and is skipped in customer responses: {reason}",
  orphanedDescription:
    "The provider no longer supplies this itinerary day. The overlay is retained for review and is not applied.",

  localeSummary: "Requested {requested} · provider {source} · served {served}",
  noSourceValue: "No provider value",
  noOverlayValue: "No overlay",
  noEffectiveValue: "Nothing published",

  edit: "Edit",
  add: "Add translation",
  save: "Save overlay",
  cancel: "Cancel",
  saving: "Saving…",
  clear: "Clear overlay",
  clearAll: "Clear locale overlays",
  clearFieldTitle: "Clear this overlay?",
  clearFieldDescription:
    "The overlay is deleted and customers see the current provider value again. The provider value is never copied into the overlay.",
  clearLocaleTitle: "Clear every overlay for {locale}?",
  clearLocaleDescription:
    "All {count} overlays in this locale are deleted. Customers fall back to provider content.",
  confirm: "Clear",
  keepEditing: "Keep",

  conflictTitle: "Someone else saved this field first",
  conflictDescription:
    "Your version {expected} is out of date (current {current}). Reload the latest value before saving again.",
  reload: "Reload",
  saveFailed: "Could not save the overlay: {reason}",

  previewTitle: "Customer preview",
  previewShow: "Show customer preview",
  previewHide: "Hide customer preview",
  previewNote: "Effective content served to customers for {locale}.",

  mediaSelect: "Choose from media library",
  mediaReplace: "Replace image",
  mediaRemoveOverlay: "Remove overlay image",
  mediaPreviewAlt: "Selected image",
  mediaNone: "No image",

  listAddItem: "Add item",
  listRemoveItem: "Remove item",
  listItemLabel: "Item {index}",

  nodeRoot: "Product",
  nodeDay: "Day {dayNumber}",

  fieldName: "Title",
  fieldDescription: "Description",
  fieldInclusions: "Inclusions",
  fieldExclusions: "Exclusions",
  fieldTerms: "Customer terms",
  fieldHighlights: "Highlights",
  fieldHeroImage: "Hero image",
  fieldGallery: "Gallery",
  fieldDayTitle: "Day title",
  fieldDayDescription: "Day description",
  fieldDayHeroImage: "Day image",
  fieldDayServices: "Day services",

  authoredBy: "Last edited {when}",
  editorialNoteLabel: "Editorial note",
  editorialNotePlaceholder: "Why this overlay exists (optional)",
}
