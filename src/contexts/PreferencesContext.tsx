import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { translate, type Language, type Theme, type TranslationKey } from '@/i18n';

const LANGUAGE_KEY = 'parking-fit-language';
const THEME_KEY = 'parking-fit-theme';

interface PreferencesContextValue {
  language: Language;
  theme: Theme;
  setLanguage: (language: Language) => void;
  setTheme: (theme: Theme) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
  storageError: string | null;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export interface StoredPreferences {
  language: Language;
  theme: Theme;
}

export function readPreferences(storage: Pick<Storage, 'getItem'>): StoredPreferences {
  const storedLanguage = storage.getItem(LANGUAGE_KEY);
  const storedTheme = storage.getItem(THEME_KEY);
  return {
    language: storedLanguage === 'ca' || storedLanguage === 'en' || storedLanguage === 'es' ? storedLanguage : 'ca',
    theme: storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'light',
  };
}

export function persistPreferences(storage: Pick<Storage, 'setItem'>, preferences: StoredPreferences): void {
  storage.setItem(LANGUAGE_KEY, preferences.language);
  storage.setItem(THEME_KEY, preferences.theme);
}

function readInitialPreferences(): StoredPreferences {
  try {
    return readPreferences(window.localStorage);
  } catch {
    return { language: 'ca', theme: 'light' };
  }
}

export function PreferencesProvider({ children }: PropsWithChildren) {
  const [initialPreferences] = useState(readInitialPreferences);
  const [language, setLanguage] = useState<Language>(initialPreferences.language);
  const [theme, setTheme] = useState<Theme>(initialPreferences.theme);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.style.colorScheme = theme;
    try {
      persistPreferences(window.localStorage, { language, theme });
      setStorageError(null);
    } catch (cause) {
      setStorageError(cause instanceof Error ? cause.message : 'Preference storage is unavailable.');
    }
  }, [language, theme]);

  const value = useMemo<PreferencesContextValue>(() => ({
    language,
    theme,
    setLanguage,
    setTheme,
    t: (key, values) => translate(language, key, values),
    storageError,
  }), [language, theme, storageError]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used within PreferencesProvider.');
  return context;
}
