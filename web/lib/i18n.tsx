"use client";

import i18n from "i18next";
import ICU from "i18next-icu";
import { initReactI18next } from "react-i18next";
import ar from "../locales/ar.json";
import de from "../locales/de.json";
import en from "../locales/en.json";
import es from "../locales/es.json";
import fr from "../locales/fr.json";
import it from "../locales/it.json";
import ja from "../locales/ja.json";
import ko from "../locales/ko.json";
import ptBR from "../locales/pt-BR.json";
import ru from "../locales/ru.json";
import tr from "../locales/tr.json";
import zhCN from "../locales/zh-CN.json";

export const LOCALES = [
  { code: "tr", name: "Türkçe" },
  { code: "en", name: "English" },
  { code: "de", name: "Deutsch" },
  { code: "fr", name: "Français" },
  { code: "es", name: "Español" },
  { code: "pt-BR", name: "Português (Brasil)" },
  { code: "it", name: "Italiano" },
  { code: "ru", name: "Русский" },
  { code: "zh-CN", name: "中文" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "ar", name: "العربية" },
] as const;

export type LocaleCode = (typeof LOCALES)[number]["code"];

const resources = {
  tr: { translation: tr },
  en: { translation: en },
  de: { translation: de },
  fr: { translation: fr },
  es: { translation: es },
  "pt-BR": { translation: ptBR },
  it: { translation: it },
  ru: { translation: ru },
  "zh-CN": { translation: zhCN },
  ja: { translation: ja },
  ko: { translation: ko },
  ar: { translation: ar },
};

function matchLocale(raw: string): LocaleCode | null {
  const value = raw.trim();
  const exact = LOCALES.find((item) => item.code.toLowerCase() === value.toLowerCase());
  if (exact) return exact.code;
  const base = value.toLowerCase().split("-")[0];
  if (base === "pt") return "pt-BR";
  if (base === "zh") return "zh-CN";
  const byBase = LOCALES.find((item) => item.code.toLowerCase() === base);
  return byBase ? byBase.code : null;
}

export function detectLocale(): LocaleCode {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage.getItem("trainer-studio.locale");
  if (saved) {
    const matched = matchLocale(saved);
    if (matched) return matched;
  }
  return "en";
}

void i18n.use(ICU).use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function applyLocale(code: string) {
  const matched = matchLocale(code) || "en";
  window.localStorage.setItem("trainer-studio.locale", matched);
  document.documentElement.lang = matched;
  document.documentElement.dir = matched === "ar" ? "rtl" : "ltr";
  void i18n.changeLanguage(matched);
  return matched;
}

export { i18n };
