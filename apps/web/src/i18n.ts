import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import en from "./locales/en.json"
import pl from "./locales/pl.json"

// Every word the app shows comes from a locale file, so Merran can be
// translated. English is the base language; other locales fall back to it.
const LANGUAGE_KEY = "merran-language"
const DEFAULT_LANGUAGE = "en"

function savedLanguage(): string | null {
  if (typeof localStorage === "undefined") return null
  return localStorage.getItem(LANGUAGE_KEY)
}

function saveLanguage(language: string) {
  if (typeof localStorage === "undefined") return
  localStorage.setItem(LANGUAGE_KEY, language)
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, pl: { translation: pl } },
  lng: savedLanguage() ?? DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  // React already escapes what it renders.
  interpolation: { escapeValue: false },
})

// Makes t("…") check its keys against the English file: a missing string is
// a type error.
declare module "i18next" {
  interface CustomTypeOptions {
    resources: { translation: typeof en }
  }
}

/** Switches the UI language and remembers it for next time. */
export function setLanguage(language: string) {
  saveLanguage(language)
  void i18n.changeLanguage(language)
}

export default i18n
