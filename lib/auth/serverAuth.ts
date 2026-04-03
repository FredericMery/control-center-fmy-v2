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
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set() {},
          remove() {},
        },
      }
    );

    let user = null;
    let error = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const tokenResult = await supabase.auth.getUser(token);
      user = tokenResult.data.user;
      error = tokenResult.error;
    } else {
      const cookieResult = await supabase.auth.getUser();
      user = cookieResult.data.user;
      error = cookieResult.error;
    }

    if (error || !user) {
      console.error('❌ Erreur auth Supabase:', error?.message);
      return null;
    }

    console.log('✅ User authentifié:', user.id);
    return user.id;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error || 'Erreur inconnue');
    console.error('❌ Erreur getUserIdFromRequest:', message);
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
