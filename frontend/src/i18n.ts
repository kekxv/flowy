import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import zh from "./locales/zh.json";
import en from "./locales/en.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { zh: { translation: zh }, en: { translation: en } },
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

// Keep <html lang> in sync: dates/times are formatted from it (see utils/time.ts).
const syncLang = (language?: string) => {
  if (typeof document !== "undefined" && language) {
    document.documentElement.lang = language.startsWith("zh") ? "zh" : "en";
  }
};
syncLang(i18n.language);
i18n.on("languageChanged", syncLang);

export default i18n;
