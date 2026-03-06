import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Extrait le user_id depuis le token Supabase
 * Utilise directement Supabase pour vérifier l'auth
 */
export async function getUserIdFromRequest(request: NextRequest): Promise<string | null> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ Pas de header Authorization ou format invalide');
      return null;
    }

    const token = authHeader.substring(7); // Enlever "Bearer "

    // Créer un client Supabase côté serveur
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get() { return undefined; },
          set() {},
          remove() {},
        },
      }
    );

    // Vérifier le token avec Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('❌ Erreur auth Supabase:', error?.message);
      return null;
    }

    console.log('✅ User authentifié:', user.id);
    return user.id;
  } catch (error: any) {
    console.error('❌ Erreur getUserIdFromRequest:', error?.message);
    return null;
  }
}

/**
 * Middleware pour vérifier l'authentification
 * Retourne le user_id ou null
 */
export async function verifyAuth(request: NextRequest): Promise<{ userId: string } | null> {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return null;
  }
  return { userId };
}
