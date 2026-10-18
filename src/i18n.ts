// The texts by vue-i18n: a component's words are its namespace's in the
// app's global vue-i18n — `gadGit` for the Git and Changes panels — in its
// locale (the locale's language too: pt_BR, pt), over the defaults of this
// package (English, Brazilian Portuguese), and under the `messages` prop. The
// app translates them by merging its own (`i18n.global.mergeLocaleMessage(
// "pt", { gadGit: {...} })`); the defaults are merged under them
// (installI18nDefaults). With no vue-i18n installed, the defaults of the
// browser's language.
import { computed, getCurrentInstance, type ComputedRef } from "vue";
import { useI18n, type Composer } from "vue-i18n";

/** Locales are the texts of a namespace by locale ("en", "pt"). */
export type Locales<T> = Record<string, T>;

/** globalI18n is the app's global vue-i18n (Composition API), if installed. */
function globalI18n(): Composer | undefined {
  if (!getCurrentInstance()) return undefined;
  try {
    return useI18n({ useScope: "global" }) as unknown as Composer;
  } catch {
    return undefined;
  }
}

// the namespaces whose defaults were merged, by composer
const merged = new WeakMap<object, Set<string>>();

/** installI18nDefaults merges the defaults of the namespace ns into the
 * global vue-i18n, under what the app has of it (its translations win). */
export function installI18nDefaults<T extends object>(i18n: Composer, ns: string, defaults: Locales<T>) {
  const done = merged.get(i18n) ?? new Set<string>();
  if (done.has(ns)) return;
  done.add(ns);
  merged.set(i18n, done);
  for (const [loc, words] of Object.entries(defaults)) {
    const have = ((i18n.getLocaleMessage(loc) as Record<string, unknown>)[ns] ?? {}) as Partial<T>;
    i18n.mergeLocaleMessage(loc, { [ns]: { ...words, ...have } });
  }
}

/** langOf is the language of a locale: "pt" of "pt_BR", "pt-BR". */
const langOf = (loc: string) => loc.split(/[-_]/)[0].toLowerCase();

/** pick are the words of loc: its own, else its language's, else English. */
function pick<T>(byLocale: Record<string, Partial<T> | undefined>, loc: string): Partial<T> {
  return byLocale[loc] ?? byLocale[langOf(loc)] ?? byLocale[Object.keys(byLocale).find((k) => langOf(k) === langOf(loc)) ?? ""] ?? {};
}

/** browserLocale is the browser's language ("en" out of a browser). */
const browserLocale = () => (typeof navigator !== "undefined" && navigator.language) || "en";

/** useWords are a component's words: the namespace ns of the app's vue-i18n
 * in its locale (the defaults merged under it), the given ones over them.
 * Call it in setup. */
export function useWords<T extends object>(ns: string, defaults: Locales<T>, given?: () => Partial<T> | undefined): ComputedRef<T> {
  const i18n = globalI18n();
  if (i18n) installI18nDefaults(i18n, ns, defaults);
  const en = defaults.en as T;
  return computed<T>(() => {
    let words: Partial<T>;
    if (i18n) {
      const all = i18n.messages.value as Record<string, Record<string, Partial<T>> | undefined>;
      const byLocale: Record<string, Partial<T> | undefined> = {};
      for (const [loc, m] of Object.entries(all)) byLocale[loc] = m?.[ns];
      words = pick(byLocale, String(i18n.locale.value || "en"));
    } else words = pick(defaults as Record<string, Partial<T>>, browserLocale());
    const out = { ...en } as Record<string, string>;
    for (const src of [words, given?.() ?? {}])
      for (const [k, v] of Object.entries(src)) if (typeof v === "string" && v) out[k] = v;
    return out as T;
  });
}
