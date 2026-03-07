import { supabase } from '@/lib/supabase/client';

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

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}
