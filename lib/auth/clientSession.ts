import { supabase } from '@/lib/supabase/client';
import { APP_LANGUAGES, type AppLanguage } from '@/lib/i18n/translations';

export async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || null;
}

export async function getAuthHeaders(includeJson = true): Promise<HeadersInit> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {};

  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }

  const normalizedToken = normalizeHeaderValue(token);
  if (normalizedToken) {
    headers.Authorization = `Bearer ${normalizedToken}`;
  }

  if (typeof window !== 'undefined') {
    const storedLanguage = normalizeStoredLanguage(window.localStorage.getItem('app_language'));
    if (storedLanguage) {
      headers['x-app-language'] = storedLanguage;
    }
  }

  return headers;
}

function normalizeStoredLanguage(value: string | null): AppLanguage | null {
  const normalized = normalizeHeaderValue(value)?.toLowerCase();
  if (!normalized) return null;
  return APP_LANGUAGES.includes(normalized as AppLanguage) ? (normalized as AppLanguage) : null;
}

function normalizeHeaderValue(value: string | null | undefined): string | null {
  const normalized = String(value || '').replace(/[\r\n]+/g, ' ').trim();
  return normalized || null;
}
