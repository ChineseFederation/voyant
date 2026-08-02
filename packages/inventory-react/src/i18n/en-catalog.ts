import type { ProductsUiCatalogMessages } from "./messages-catalog.js"

export const productsUiCatalogEn = {
  productCategoryDialog: {
    titles: {
      create: "New product category",
      edit: "Edit product category",
    },
    descriptions: {
      create: "Create a category for organizing your product catalog.",
      edit: "Update category hierarchy, slug, and active state.",
    },
  },
  productCategoryForm: {
    fields: {
      name: "Name",
      slug: "Slug",
      parentCategory: "Parent category",
      description: "Description",
      sortOrder: "Sort order",
      active: "Active",
      customerPaymentPolicy: "Customer payment policy",
    },
    descriptions: {
      customerPaymentPolicy:
        "Products in this category use these payment terms by default. A product or booking can override them; this takes priority over supplier terms.",
    },
    placeholders: {
      name: "Adventure",
      slug: "adventure",
      parentCategory: "Search parent category...",
      description: "Category description...",
    },
    validation: {
      nameRequired: "Category name is required.",
      slugRequired: "Category slug is required.",
      saveFailed: "Failed to save product category.",
    },
    actions: {
      createCategory: "Create category",
    },
  },
  productCategoryList: {
    searchPlaceholder: "Search product categories...",
    addCategory: "Add category",
    columns: {
      name: "Name",
      slug: "Slug",
      parent: "Parent",
      status: "Status",
      actions: "Actions",
    },
    loadingError: "Failed to load product categories.",
    empty: "No product categories found.",
    edit: "Edit",
    delete: "Delete",
    deleteConfirm: "Delete this product category?",
    showingSummary: "Showing {count} of {total}",
  },
  productTagDialog: {
    titles: {
      create: "New product tag",
      edit: "Edit product tag",
    },
    descriptions: {
      create: "Create a reusable tag for filtering and classification.",
      edit: "Update the tag used to label and filter products.",
    },
  },
  productTagForm: {
    fields: {
      name: "Name",
    },
    placeholders: {
      name: "Family Friendly",
    },
    validation: {
      nameRequired: "Tag name is required.",
      saveFailed: "Failed to save product tag.",
    },
    actions: {
      createTag: "Create tag",
    },
  },
  productTagList: {
    searchPlaceholder: "Search product tags...",
    addTag: "Add tag",
    columns: {
      name: "Name",
      actions: "Actions",
    },
    loadingError: "Failed to load product tags.",
    empty: "No product tags found.",
    edit: "Edit",
    delete: "Delete",
    deleteConfirm: "Delete this product tag?",
    showingSummary: "Showing {count} of {total}",
  },
  productTagsPage: {
    title: "Product Tags",
    description: "Free-form labels to tag and filter products.",
  },
  productTypesPage: {
    title: "Product Families",
    description:
      "Top-level merchandising families such as Tour, Activity, Attraction, Event, and Transportation.",
    addType: "Add Family",
    empty: "No product families yet. Add a family to classify products consistently.",
    edit: "Edit",
    delete: "Delete",
    deleteConfirm: "Delete this product family?",
    showingSummary: "Showing {count} of {total}",
    editSheetTitle: "Edit Product Family",
    newSheetTitle: "New Product Family",
    nameLabel: "Name",
    namePlaceholder: "Tour",
    codeLabel: "Code",
    codePlaceholder: "tour",
    descriptionLabel: "Description",
    descriptionPlaceholder: "Optional description...",
    sortOrderLabel: "Sort Order",
    activeLabel: "Active",
    cancel: "Cancel",
    saveChanges: "Save Changes",
    createType: "Create Family",
    validation: {
      nameRequired: "Name is required",
      codeRequired: "Code is required",
    },
  },
  productMediaDialog: {
    titles: {
      create: "Add media",
      edit: "Edit media",
    },
    descriptions: {
      create: "Add a photo, video, or document by pasting its link.",
      edit: "Update the details, order, and cover setting for this item.",
    },
  },
  productMediaForm: {
    fields: {
      mediaType: "Media type",
      name: "Name",
      url: "URL",
      storageKey: "Storage key",
      mimeType: "MIME type",
      fileSize: "File size",
      sortOrder: "Sort order",
      coverMedia: "Cover media",
      altText: "Alt text",
    },
    placeholders: {
      name: "Hero image",
      url: "https://example.com/media/hero.jpg",
      mimeType: "image/jpeg",
      altText: "Short accessibility description",
    },
    validation: {
      nameRequired: "Media name is required.",
      urlRequired: "Media URL is required.",
      coverRequiresImage: "Only image media can be marked as cover.",
      saveFailed: "Failed to save media.",
    },
    actions: {
      addMedia: "Add media",
      saveMedia: "Save media",
    },
  },
  productMediaSection: {
    titles: {
      media: "Media",
      dayMedia: "Day media",
    },
    descriptions: {
      media: "Photos and videos for this product. Pick one as the cover.",
      dayMedia: "Photos and videos for this itinerary day.",
    },
    actions: {
      upload: "Upload",
      chooseFromLibrary: "Choose from Media Library",
      addMedia: "Add media",
      reorder: "Reorder",
      saveOrder: "Save order",
      cancelReorder: "Cancel",
      drag: "Drag",
      markCover: "Mark as cover",
      openPreview: "Open media preview",
      closePreview: "Close preview",
      previousMedia: "Previous media",
      nextMedia: "Next media",
      openFile: "Open file",
      edit: "Edit",
      delete: "Delete",
    },
    loadingError: "Failed to load media.",
    empty: "No media items configured yet.",
    itemCount: "Media items: {count}",
    uploadFailed: "Failed to upload media.",
    libraryAddFailed: "Failed to add media from the library.",
    deleteConfirm: "Delete this media item?",
    viewerTitle: "Media preview",
    coverBadge: "Cover",
  },
} satisfies ProductsUiCatalogMessages
