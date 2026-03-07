import type { AppLanguage } from '@/lib/i18n/translations';
import { APP_LANGUAGES } from '@/lib/i18n/translations';

const DEFAULT_LANGUAGE: AppLanguage = 'fr';

function normalizeLanguage(value: string | null | undefined): AppLanguage | null {
  if (!value) return null;

  const lower = value.toLowerCase();
  const short = lower.split('-')[0] as AppLanguage;
  return APP_LANGUAGES.includes(short) ? short : null;
}

export function resolveRequestLanguage(request: Request): AppLanguage {
  const explicit = normalizeLanguage(request.headers.get('x-app-language'));
  if (explicit) return explicit;

  const acceptLanguage = request.headers.get('accept-language');
  if (!acceptLanguage) return DEFAULT_LANGUAGE;

  const first = acceptLanguage.split(',')[0]?.trim();
  return normalizeLanguage(first) || DEFAULT_LANGUAGE;
}

export function languageToLocale(language: AppLanguage): string {
  if (language === 'en') return 'en-US';
  if (language === 'es') return 'es-ES';
  return 'fr-FR';
}
