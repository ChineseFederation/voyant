/** Browser-safe operator branding choices shared by validation and settings UI. */

export const DEFAULT_OPERATOR_BRAND_COLOR = "#f26522"

export const OPERATOR_CORNER_RADII = ["0rem", "0.25rem", "0.625rem", "1rem"] as const
export type OperatorCornerRadius = (typeof OPERATOR_CORNER_RADII)[number]
export const DEFAULT_OPERATOR_CORNER_RADIUS: OperatorCornerRadius = "0.625rem"

export const OPERATOR_FONT_IDS = [
  "inter-tight",
  "inter",
  "geist",
  "figtree",
  "manrope",
  "outfit",
  "plus-jakarta-sans",
  "source-sans-3",
  "source-serif-4",
  "lora",
  "playfair-display",
  "jetbrains-mono",
] as const
export type OperatorFontId = (typeof OPERATOR_FONT_IDS)[number]
export const DEFAULT_OPERATOR_FONT: OperatorFontId = "inter-tight"

export const OPERATOR_FONTS: ReadonlyArray<{
  id: OperatorFontId
  label: string
  category: "sans" | "serif" | "mono"
}> = [
  { id: "inter-tight", label: "Inter Tight", category: "sans" },
  { id: "inter", label: "Inter", category: "sans" },
  { id: "geist", label: "Geist", category: "sans" },
  { id: "figtree", label: "Figtree", category: "sans" },
  { id: "manrope", label: "Manrope", category: "sans" },
  { id: "outfit", label: "Outfit", category: "sans" },
  { id: "plus-jakarta-sans", label: "Plus Jakarta Sans", category: "sans" },
  { id: "source-sans-3", label: "Source Sans 3", category: "sans" },
  { id: "source-serif-4", label: "Source Serif 4", category: "serif" },
  { id: "lora", label: "Lora", category: "serif" },
  { id: "playfair-display", label: "Playfair Display", category: "serif" },
  { id: "jetbrains-mono", label: "JetBrains Mono", category: "mono" },
]

export const OPERATOR_LOCALE_IDS = ["en", "ro"] as const
export type OperatorLocaleId = (typeof OPERATOR_LOCALE_IDS)[number]
export const DEFAULT_OPERATOR_LOCALE: OperatorLocaleId = "en"
export const OPERATOR_LOCALES: ReadonlyArray<{ id: OperatorLocaleId; label: string }> = [
  { id: "en", label: "English" },
  { id: "ro", label: "Română" },
]
