import { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(
  process.env.SUPABASE_JWT_SECRET || 'your-secret-key'
);

/**
 * Extrait le user_id depuis le JWT Bearer token
 * Format: "Bearer {jwt_token}"
 */
export async function getUserIdFromRequest(request: NextRequest): Promise<string | null> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7); // Enlever "Bearer "

    const verified = await jwtVerify(token, secret);
    const userId = verified.payload.sub as string;

    return userId;
  } catch (error) {
    console.error('Erreur JWT:', error);
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
