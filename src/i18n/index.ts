/**
 * Internationalization module
 */

import { enTranslations } from './locales/en';
import { zhTranslations } from './locales/zh';

export type Locale = 'en' | 'zh';
export type TranslationKey = keyof typeof enTranslations;

type TranslationParams = Record<string, string | number>;

const translations: Record<Locale, Record<TranslationKey, string>> = {
  en: enTranslations,
  zh: zhTranslations,
};

let currentLocale: Locale = 'en';

/**
 * Set the current locale
 */
export function setLocale(locale: Locale): void {
  if (locale in translations) {
    currentLocale = locale;
  } else {
    console.warn(`[i18n] Unsupported locale: ${locale}, falling back to 'en'`);
    currentLocale = 'en';
  }
}

/**
 * Get the current locale
 */
export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Get available locales
 */
export function getAvailableLocales(): { value: Locale; label: string }[] {
  return [
    { value: 'en', label: enTranslations['settings.language.en'] },
    { value: 'zh', label: zhTranslations['settings.language.zh'] },
  ];
}

/**
 * Translate a key with optional parameters
 * 
 * Usage:
 *   t('settings.server.started') // "OpenCode server started"
 *   t('settings.model.refresh.success', { count: 5 }) // "Found 5 providers"
 */
export function t(key: TranslationKey, params?: TranslationParams): string {
  const translation = translations[currentLocale][key] ?? translations.en[key] ?? key;
  
  if (params) {
    return translation.replace(/\{(\w+)\}/g, (match, paramKey) => {
      return String(params[paramKey] ?? match);
    });
  }
  
  return translation;
}

/**
 * Get all translations for current locale (useful for debugging)
 */
export function getAllTranslations(): Record<TranslationKey, string> {
  return { ...translations[currentLocale] };
}
