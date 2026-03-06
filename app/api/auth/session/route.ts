import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Récupérer le token du cookie
    const authCookie = request.cookies.get('sb-auth-token')?.value;
    
    if (!authCookie) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    // Retourner la session avec le token
    return NextResponse.json({
      session: {
        access_token: authCookie,
      },
    });
  } catch (error) {
    console.error('Erreur session:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
