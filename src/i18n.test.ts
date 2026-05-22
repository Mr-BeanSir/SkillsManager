import { describe, expect, it, vi } from "vitest";
import {
  buildI18nCatalog,
  coerceLanguage,
  fallbackLocale,
  loadLanguageMessages,
  loadStoredLanguage,
  setStoredLanguage,
  t,
  type LocaleManifest,
  type LocaleMessages
} from "./i18n";

const manifest: LocaleManifest = {
  defaultLanguage: "en",
  languages: [
    { code: "en", label: "English", htmlLang: "en", path: "en.json" },
    { code: "zh", label: "中文", htmlLang: "zh-CN", path: "zh.json" },
    { code: "ja", label: "日本語", htmlLang: "ja", path: "ja.json" }
  ]
};

describe("i18n", () => {
  it("builds language options from an external manifest", () => {
    const catalog = buildI18nCatalog(manifest, {
      en: { "settings.language.title": "Language" },
      zh: { "settings.language.title": "语言" },
      ja: { "settings.language.title": "言語" }
    });

    expect(catalog.languages.map((language) => language.code)).toEqual([
      "en",
      "zh",
      "ja"
    ]);
    expect(catalog.languages[2]).toMatchObject({
      code: "ja",
      label: "日本語",
      htmlLang: "ja"
    });
  });

  it("falls back to the manifest default for unsupported languages", () => {
    const catalog = buildI18nCatalog(manifest, {
      en: { "settings.language.title": "Language" },
      zh: { "settings.language.title": "语言" }
    });

    expect(coerceLanguage(catalog, "fr")).toBe("en");
    expect(coerceLanguage(catalog, null)).toBe("en");
  });

  it("returns translations from external message files", () => {
    const catalog = buildI18nCatalog(manifest, {
      en: { "settings.language.title": "Language" },
      zh: { "settings.language.title": "语言" }
    });

    expect(t(catalog, "en", "settings.language.title")).toBe("Language");
    expect(t(catalog, "zh", "settings.language.title")).toBe("语言");
  });

  it("falls back to default-language messages when a custom locale misses a key", () => {
    const catalog = buildI18nCatalog(manifest, {
      en: { "settings.language.title": "Language" },
      ja: {}
    });

    expect(t(catalog, "ja", "settings.language.title")).toBe("Language");
  });

  it("stores and loads any language declared by the manifest", () => {
    const catalog = buildI18nCatalog(manifest, {
      en: { "settings.language.title": "Language" },
      ja: { "settings.language.title": "言語" }
    });
    const storage = createStorage();

    setStoredLanguage(storage, "ja");

    expect(loadStoredLanguage(catalog, storage)).toBe("ja");
  });

  it("ignores stored languages not declared by the manifest", () => {
    const catalog = buildI18nCatalog(manifest, {
      en: { "settings.language.title": "Language" }
    });
    const storage = createStorage();
    storage.setItem("skills-manager-language", "de");

    expect(loadStoredLanguage(catalog, storage)).toBe("en");
  });

  it("provides a bundled fallback catalog before external files load", () => {
    expect(t(fallbackLocale, "en", "settings.language.title")).toBe("Language");
    expect(fallbackLocale.languages.map((language) => language.code)).toEqual([
      "en",
      "zh"
    ]);
  });

  it("ships bundled project-only fallback copy for English and Chinese", () => {
    expect(t(fallbackLocale, "en", "projects.detail.targets.current")).toBe(
      "Current CLI Targets"
    );
    expect(t(fallbackLocale, "en", "discover.install.success", {
      name: "find-skills",
      source: "vercel-labs/skills"
    })).toBe(
      "find-skills installed from vercel-labs/skills. Add it to a project from the Projects page when you want it active."
    );
    expect(t(fallbackLocale, "zh", "nav.projects.label")).toBe("项目");
    expect(t(fallbackLocale, "zh", "settings.reconcile.title")).toBe("自动同步");
  });

  it("loads only the selected language and the manifest default language", async () => {
    const fetchJson = (async <T,>(path: string): Promise<T> => {
      if (path === "/locales/ja.json") {
        return { "settings.language.title": "言語" } as T;
      }

      if (path === "/locales/en.json") {
        return { "settings.language.title": "Language" } as T;
      }

      throw new Error(`unexpected path: ${path}`);
    }) as <T>(path: string) => Promise<T>;

    const fetchSpy = vi.fn(fetchJson);

    const messages = await loadLanguageMessages(
      manifest,
      "ja",
      fetchSpy as <T>(path: string) => Promise<T>
    );

    expect(messages).toEqual({
      en: { "settings.language.title": "Language" },
      ja: { "settings.language.title": "言語" }
    } satisfies Record<string, LocaleMessages>);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenNthCalledWith(1, "/locales/ja.json");
    expect(fetchSpy).toHaveBeenNthCalledWith(2, "/locales/en.json");
  });
});

function createStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    })
  };
}
