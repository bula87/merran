/**
 * Locales supported by the Merran UI (`apps/web/src/locales/*.json`) and used
 * as targets for recipe content translation.
 */
export const SUPPORTED_LOCALES = ["en", "pl"] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}
