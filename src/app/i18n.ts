import { invoke } from "@tauri-apps/api/core";

export type LanguageCode = string;

export type LocaleLanguage = {
  code: LanguageCode;
  label: string;
  htmlLang: string;
  path: string;
};

export type LocaleManifest = {
  defaultLanguage: LanguageCode;
  languages: LocaleLanguage[];
};

export type LocaleMessages = Record<string, string>;

export type I18nCatalog = {
  defaultLanguage: LanguageCode;
  languages: LocaleLanguage[];
  messages: Record<LanguageCode, LocaleMessages>;
};

type StorageLike = Pick<Storage, "getItem">;
type WritableStorageLike = Pick<Storage, "getItem" | "setItem">;

const STORAGE_KEY = "skills-manager-language";

import bundledEnMessages from "./locales/en.json";
import bundledZhMessages from "./locales/zh.json";

export const fallbackLocale = buildI18nCatalog(
  {
    defaultLanguage: "en",
    languages: [
      { code: "en", label: "English", htmlLang: "en", path: "en.json" },
      { code: "zh", label: "中文", htmlLang: "zh-CN", path: "zh.json" }
    ]
  },
  {
    en: bundledEnMessages,
    zh: bundledZhMessages
  }
);

export function buildI18nCatalog(
  manifest: LocaleManifest,
  messages: Record<LanguageCode, LocaleMessages>
): I18nCatalog {
  const declaredLanguages = manifest.languages.filter((language) => language.code.trim());
  const defaultLanguage = declaredLanguages.some(
    (language) => language.code === manifest.defaultLanguage
  )
    ? manifest.defaultLanguage
    : declaredLanguages[0]?.code ?? "en";

  return {
    defaultLanguage,
    languages: declaredLanguages,
    messages
  };
}

export async function loadExternalI18nCatalog(
  fetchJson = defaultFetchJson,
  storage: StorageLike = window.localStorage
) {
  const manifest = await fetchJson<LocaleManifest>("/locales/manifest.json");
  const storedLanguage = loadStoredLanguage(
    buildI18nCatalog(manifest, {}),
    storage
  );

  return loadI18nCatalogForLanguage(manifest, storedLanguage, fetchJson);
}

export async function loadI18nCatalogForLanguage(
  manifest: LocaleManifest,
  language: LanguageCode,
  fetchJson = defaultFetchJson
) {
  const messages = await loadLanguageMessages(manifest, language, fetchJson);
  return buildI18nCatalog(manifest, messages);
}

export async function loadLanguageMessages(
  manifest: LocaleManifest,
  language: LanguageCode,
  fetchJson = defaultFetchJson
) {
  const selectedLanguage = manifest.languages.find((item) => item.code === language);
  const defaultLanguage = manifest.languages.find(
    (item) => item.code === manifest.defaultLanguage
  );
  const requestEntries: LocaleLanguage[] = [];

  for (const entry of [selectedLanguage, defaultLanguage]) {
    if (
      entry &&
      !requestEntries.some((existingEntry) => existingEntry.code === entry.code)
    ) {
      requestEntries.push(entry);
    }
  }

  const messages = await Promise.all(
    requestEntries.map(async (languageEntry) => {
      const path = languageEntry.path.startsWith("/")
        ? languageEntry.path
        : `/locales/${languageEntry.path}`;
      return [languageEntry.code, await fetchJson<LocaleMessages>(path)] as const;
    })
  );

  return Object.fromEntries(messages) as Record<LanguageCode, LocaleMessages>;
}

export function coerceLanguage(
  catalog: I18nCatalog,
  value: string | null
): LanguageCode {
  return value && catalog.languages.some((language) => language.code === value)
    ? value
    : catalog.defaultLanguage;
}

export function languageHtmlLang(catalog: I18nCatalog, language: LanguageCode) {
  return (
    catalog.languages.find((item) => item.code === language)?.htmlLang ??
    catalog.languages.find((item) => item.code === catalog.defaultLanguage)?.htmlLang ??
    "en"
  );
}

export function loadStoredLanguage(
  catalog: I18nCatalog,
  storage: StorageLike
): LanguageCode {
  return coerceLanguage(catalog, storage.getItem(STORAGE_KEY));
}

export function loadPendingLanguage(storage: StorageLike): LanguageCode | null {
  return storage.getItem(STORAGE_KEY);
}

export function setStoredLanguage(
  storage: WritableStorageLike,
  language: LanguageCode
) {
  storage.setItem(STORAGE_KEY, language);
}

export function t(
  catalog: I18nCatalog,
  language: LanguageCode,
  key: string,
  values: Record<string, string | number> = {}
) {
  const message =
    catalog.messages[language]?.[key] ??
    catalog.messages[catalog.defaultLanguage]?.[key] ??
    fallbackLocale.messages.en[key] ??
    key;

  return Object.entries(values).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    message
  );
}

async function defaultFetchJson<T>(path: string): Promise<T> {
  if ("__TAURI_INTERNALS__" in globalThis) {
    const filename = path.replace(/^\/locales\//, "");
    const content = await invoke<string>("read_locale_file", { filename });
    return JSON.parse(content) as T;
  }

  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }

  return response.json() as Promise<T>;
}
