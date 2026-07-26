function createStorage(): Storage {
  const entries = new Map<string, string>()

  return {
    get length() {
      return entries.size
    },
    clear() {
      entries.clear()
    },
    getItem(key: string) {
      return entries.get(key) ?? null
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null
    },
    removeItem(key: string) {
      entries.delete(key)
    },
    setItem(key: string, value: string) {
      entries.set(key, value)
    },
  }
}

if (typeof window !== "undefined" && typeof window.localStorage?.clear !== "function") {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: createStorage(),
  })
}
