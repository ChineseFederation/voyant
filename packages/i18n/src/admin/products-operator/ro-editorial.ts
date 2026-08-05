export const operatorAdminProductsMessagesRoEditorial = {
  sectionTitle: "Conținut editorial",
  sectionDescription:
    "Conținutul furnizorului rămâne needitabil. Suprapunerile înlocuiesc ce văd clienții pentru limba selectată.",
  localeLabel: "Limba magazinului",
  localeSourceSuffix: "limba furnizorului",
  localeOverlaySuffix: "are suprapuneri",
  loadFailed: "Conținutul editorial nu a putut fi încărcat.",
  retry: "Reîncearcă",
  loading: "Se încarcă conținutul editorial…",
  readOnly: "Nu ai permisiunea de a edita conținutul editorial.",

  columnSource: "Sursă furnizor",
  columnOverlay: "Suprapunere",
  columnEffective: "Efectiv (client)",
  compareLabel: "Compară valorile",

  stateExact: "Traducere de la furnizor",
  stateLanguageFallback: "Rezervă de limbă",
  stateSourceFallback: "Rezervă din sursă",
  stateOverlaid: "Suprapus",
  stateOverlayOnly: "Traducere doar prin suprapunere",
  stateMissing: "Lipsește",
  stateInvalid: "Suprapunere invalidă",
  stateOrphaned: "Suprapunere orfană",
  stateMixed: "Mixt",
  stateDrifted: "Furnizorul a modificat",
  driftedDescription:
    "Furnizorul a actualizat conținutul după crearea suprapunerii. Compară, apoi păstrează, actualizează sau șterge suprapunerea.",
  invalidDescription:
    "Această suprapunere nu este validă și este ignorată în răspunsurile către clienți: {reason}",
  orphanedDescription:
    "Furnizorul nu mai livrează această zi de itinerariu. Suprapunerea este păstrată pentru verificare și nu se aplică.",

  localeSummary: "Cerut {requested} · furnizor {source} · livrat {served}",
  noSourceValue: "Fără valoare de la furnizor",
  noOverlayValue: "Fără suprapunere",
  noEffectiveValue: "Nimic publicat",

  edit: "Editează",
  add: "Adaugă traducere",
  save: "Salvează suprapunerea",
  cancel: "Anulează",
  saving: "Se salvează…",
  clear: "Șterge suprapunerea",
  clearAll: "Șterge suprapunerile limbii",
  clearFieldTitle: "Ștergi această suprapunere?",
  clearFieldDescription:
    "Suprapunerea este ștearsă, iar clienții văd din nou valoarea curentă a furnizorului. Valoarea furnizorului nu este copiată niciodată în suprapunere.",
  clearLocaleTitle: "Ștergi toate suprapunerile pentru {locale}?",
  clearLocaleDescription:
    "Toate cele {count} suprapuneri din această limbă sunt șterse. Clienții revin la conținutul furnizorului.",
  confirm: "Șterge",
  keepEditing: "Păstrează",

  conflictTitle: "Altcineva a salvat acest câmp înaintea ta",
  conflictDescription:
    "Versiunea ta {expected} este depășită (curentă {current}). Reîncarcă valoarea actuală înainte de a salva din nou.",
  reload: "Reîncarcă",
  saveFailed: "Suprapunerea nu a putut fi salvată: {reason}",

  previewTitle: "Previzualizare client",
  previewShow: "Arată previzualizarea clientului",
  previewHide: "Ascunde previzualizarea clientului",
  previewNote: "Conținutul efectiv livrat clienților pentru {locale}.",

  mediaSelect: "Alege din biblioteca media",
  mediaReplace: "Înlocuiește imaginea",
  mediaRemoveOverlay: "Elimină imaginea suprapusă",
  mediaPreviewAlt: "Imagine selectată",
  mediaNone: "Fără imagine",

  listAddItem: "Adaugă element",
  listRemoveItem: "Elimină elementul",
  listItemLabel: "Elementul {index}",

  nodeRoot: "Produs",
  nodeDay: "Ziua {dayNumber}",

  fieldName: "Titlu",
  fieldDescription: "Descriere",
  fieldInclusions: "Incluse",
  fieldExclusions: "Neincluse",
  fieldTerms: "Termeni pentru client",
  fieldHighlights: "Puncte forte",
  fieldHeroImage: "Imagine principală",
  fieldGallery: "Galerie",
  fieldDayTitle: "Titlul zilei",
  fieldDayDescription: "Descrierea zilei",
  fieldDayHeroImage: "Imaginea zilei",
  fieldDayServices: "Serviciile zilei",

  authoredBy: "Ultima modificare {when}",
  editorialNoteLabel: "Notă editorială",
  editorialNotePlaceholder: "De ce există această suprapunere (opțional)",
}
