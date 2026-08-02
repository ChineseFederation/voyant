import type { ProductsUiCatalogMessages } from "./messages-catalog.js"

export const productsUiCatalogRo = {
  productCategoryDialog: {
    titles: {
      create: "Categorie noua de produs",
      edit: "Editeaza categoria de produs",
    },
    descriptions: {
      create: "Creeaza o categorie pentru organizarea catalogului de produse.",
      edit: "Actualizeaza ierarhia categoriei, slug-ul si starea activa.",
    },
  },
  productCategoryForm: {
    fields: {
      name: "Nume",
      slug: "Slug",
      parentCategory: "Categorie parinte",
      description: "Descriere",
      sortOrder: "Ordine sortare",
      active: "Activ",
      customerPaymentPolicy: "Politica de plată client",
    },
    descriptions: {
      customerPaymentPolicy:
        "Produsele din aceasta categorie folosesc implicit acesti termeni de plata. Un produs sau o rezervare ii poate suprascrie; acestia au prioritate peste termenii furnizorului.",
    },
    placeholders: {
      name: "Aventura",
      slug: "aventura",
      parentCategory: "Cauta categoria parinte...",
      description: "Descrierea categoriei...",
    },
    validation: {
      nameRequired: "Numele categoriei este obligatoriu.",
      slugRequired: "Slug-ul categoriei este obligatoriu.",
      saveFailed: "Salvarea categoriei de produs a esuat.",
    },
    actions: {
      createCategory: "Creeaza categoria",
    },
  },
  productCategoryList: {
    searchPlaceholder: "Cauta categorii de produs...",
    addCategory: "Adauga categoria",
    columns: {
      name: "Nume",
      slug: "Slug",
      parent: "Parinte",
      status: "Status",
      actions: "Actiuni",
    },
    loadingError: "Incarcarea categoriilor de produs a esuat.",
    empty: "Nu au fost gasite categorii de produs.",
    edit: "Editeaza",
    delete: "Sterge",
    deleteConfirm: "Stergi aceasta categorie de produs?",
    showingSummary: "Afisezi {count} din {total}",
  },
  productTagDialog: {
    titles: {
      create: "Tag nou de produs",
      edit: "Editeaza tag-ul de produs",
    },
    descriptions: {
      create: "Creeaza un tag reutilizabil pentru filtrare si clasificare.",
      edit: "Actualizeaza tag-ul folosit pentru etichetarea si filtrarea produselor.",
    },
  },
  productTagForm: {
    fields: {
      name: "Nume",
    },
    placeholders: {
      name: "Potrivit pentru familie",
    },
    validation: {
      nameRequired: "Numele tag-ului este obligatoriu.",
      saveFailed: "Salvarea tag-ului de produs a esuat.",
    },
    actions: {
      createTag: "Creeaza tag-ul",
    },
  },
  productTagList: {
    searchPlaceholder: "Cauta tag-uri de produs...",
    addTag: "Adauga tag",
    columns: {
      name: "Nume",
      actions: "Actiuni",
    },
    loadingError: "Incarcarea tag-urilor de produs a esuat.",
    empty: "Nu au fost gasite tag-uri de produs.",
    edit: "Editeaza",
    delete: "Sterge",
    deleteConfirm: "Stergi acest tag de produs?",
    showingSummary: "Afisezi {count} din {total}",
  },
  productTagsPage: {
    title: "Etichete produse",
    description: "Etichete libere pentru clasificarea si filtrarea produselor.",
  },
  productTypesPage: {
    title: "Familii de produse",
    description:
      "Familii comerciale principale precum Tur, Activitate, Atractie, Eveniment si Transport.",
    addType: "Adauga familie",
    empty: "Nu exista familii de produse. Adauga o familie pentru o clasificare consecventa.",
    edit: "Editeaza",
    delete: "Sterge",
    deleteConfirm: "Stergi aceasta familie de produse?",
    showingSummary: "Afisare {count} din {total}",
    editSheetTitle: "Editeaza familia de produse",
    newSheetTitle: "Familie de produse noua",
    nameLabel: "Nume",
    namePlaceholder: "Tur",
    codeLabel: "Cod",
    codePlaceholder: "tour",
    descriptionLabel: "Descriere",
    descriptionPlaceholder: "Descriere optionala...",
    sortOrderLabel: "Ordine de sortare",
    activeLabel: "Activ",
    cancel: "Anuleaza",
    saveChanges: "Salveaza modificarile",
    createType: "Creeaza familia",
    validation: {
      nameRequired: "Numele este obligatoriu",
      codeRequired: "Codul este obligatoriu",
    },
  },
  productMediaDialog: {
    titles: {
      create: "Adauga media",
      edit: "Editeaza media",
    },
    descriptions: {
      create: "Adauga o fotografie, un videoclip sau un document prin lipirea link-ului.",
      edit: "Actualizeaza detaliile, ordinea si setarea de cover pentru acest element.",
    },
  },
  productMediaForm: {
    fields: {
      mediaType: "Tip media",
      name: "Nume",
      url: "URL",
      storageKey: "Cheie stocare",
      mimeType: "Tip MIME",
      fileSize: "Dimensiune fisier",
      sortOrder: "Ordine sortare",
      coverMedia: "Media cover",
      altText: "Text alternativ",
    },
    placeholders: {
      name: "Imagine hero",
      url: "https://example.com/media/hero.jpg",
      mimeType: "image/jpeg",
      altText: "Scurta descriere de accesibilitate",
    },
    validation: {
      nameRequired: "Numele media este obligatoriu.",
      urlRequired: "URL-ul media este obligatoriu.",
      coverRequiresImage: "Doar imaginile pot fi marcate ca media cover.",
      saveFailed: "Salvarea media a esuat.",
    },
    actions: {
      addMedia: "Adauga media",
      saveMedia: "Salveaza media",
    },
  },
  productMediaSection: {
    titles: {
      media: "Media",
      dayMedia: "Media zi",
    },
    descriptions: {
      media: "Fotografii si videoclipuri pentru acest produs. Alege unul ca cover.",
      dayMedia: "Fotografii si videoclipuri pentru aceasta zi din itinerar.",
    },
    actions: {
      upload: "Incarca",
      chooseFromLibrary: "Alege din biblioteca media",
      addMedia: "Adauga media",
      reorder: "Reordoneaza",
      saveOrder: "Salveaza ordinea",
      cancelReorder: "Anuleaza",
      drag: "Trage",
      markCover: "Seteaza cover",
      openPreview: "Deschide previzualizarea media",
      closePreview: "Inchide previzualizarea",
      previousMedia: "Media precedenta",
      nextMedia: "Media urmatoare",
      openFile: "Deschide fisierul",
      edit: "Editeaza",
      delete: "Sterge",
    },
    loadingError: "Incarcarea media a esuat.",
    empty: "Nu exista inca elemente media configurate.",
    itemCount: "Elemente media: {count}",
    uploadFailed: "Incarcarea media a esuat.",
    libraryAddFailed: "Adaugarea media din biblioteca a esuat.",
    deleteConfirm: "Stergi acest element media?",
    viewerTitle: "Previzualizare media",
    coverBadge: "Cover",
  },
} satisfies ProductsUiCatalogMessages
