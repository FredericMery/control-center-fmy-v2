import { supabase } from "@/lib/supabase/client";

/**
 * Retourne un access token valide si possible.
 * 1) session actuelle
 * 2) tentative de refresh
 */
export async function getValidAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error("Erreur getSession:", error.message);
  }

  if (data.session?.access_token) {
    return data.session.access_token;
  }

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();

  if (refreshError) {
    console.error("Erreur refreshSession:", refreshError.message);
    return null;
  }

  return refreshed.session?.access_token ?? null;
}
