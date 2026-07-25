/**
 * Message shape for the media-library React UI. Every user-facing string in the
 * `<MediaLibrary>` / `<MediaPicker>` components resolves from this catalog —
 * the `ui-literals` check forbids hardcoded copy. `en` is the source of truth;
 * `ro` must stay at full parity (same keys, same ICU arguments).
 */
export type MediaUiMessages = {
  common: {
    cancel: string
    save: string
    saving: string
    delete: string
    close: string
    edit: string
    remove: string
    upload: string
    search: string
    retry: string
    allTypes: string
    mediaTypeLabels: {
      image: string
      video: string
      document: string
    }
  }
  library: {
    title: string
    description: string
    searchPlaceholder: string
    view: {
      grid: string
      list: string
      toggleLabel: string
    }
    filters: {
      typeLabel: string
      tagLabel: string
      tagPlaceholder: string
      mimeLabel: string
      mimePlaceholder: string
      clear: string
    }
    empty: string
    loadingError: string
    itemCount: string
    openPreview: string
    upload: {
      dropzone: string
      browse: string
      uploading: string
      failed: string
      hint: string
    }
    folders: {
      title: string
      allAssets: string
      newFolder: string
      newFolderPlaceholder: string
      create: string
      rename: string
      deleteFolder: string
      deleteConfirm: string
      empty: string
      loadingError: string
    }
    detail: {
      title: string
      selectPrompt: string
      nameLabel: string
      namePlaceholder: string
      altLabel: string
      altPlaceholder: string
      defaultLanguageLabel: string
      languageTagPlaceholder: string
      translationsTitle: string
      translationsHint: string
      languageTagLabel: string
      addTranslation: string
      removeTranslation: string
      translatedAltLabel: string
      tagsLabel: string
      tagsPlaceholder: string
      tagsHint: string
      foldersLabel: string
      addToFolder: string
      noFolders: string
      metadata: string
      typeField: string
      dimensionsLabel: string
      dimensions: string
      fileSizeLabel: string
      uploadedByLabel: string
      whereUsed: string
      whereUsedEmpty: string
      usageCount: string
      saved: string
      saveFailed: string
      deleteConfirm: string
      deleteFailed: string
      inUseTitle: string
      inUseWarning: string
    }
  }
  picker: {
    title: string
    searchPlaceholder: string
    typeFilterLabel: string
    select: string
    selectedCount: string
    confirm: string
    cancel: string
    empty: string
    loadingError: string
    upload: string
    uploading: string
    uploadHint: string
  }
}
