import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const ALLOWED_SCOPES = new Set(['to_only', 'all', 'none']);

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('user_ai_settings')
    .select('assistant_name,email_reply_scope,email_global_instructions,email_do_rules,email_dont_rules,email_signature')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    settings: {
      assistant_name: String(data?.assistant_name || 'Assistant'),
      email_reply_scope: String(data?.email_reply_scope || 'to_only'),
      email_global_instructions: String(data?.email_global_instructions || ''),
      email_do_rules: Array.isArray(data?.email_do_rules) ? data?.email_do_rules : [],
      email_dont_rules: Array.isArray(data?.email_dont_rules) ? data?.email_dont_rules : [],
      email_signature: String(data?.email_signature || ''),
    },
  });
}

export async function PUT(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    email_reply_scope?: string;
    email_global_instructions?: string;
    email_do_rules?: unknown;
    email_dont_rules?: unknown;
    email_signature?: string;
  };

  const emailReplyScope = String(body.email_reply_scope || 'to_only');
  if (!ALLOWED_SCOPES.has(emailReplyScope)) {
    return NextResponse.json({ error: 'email_reply_scope invalide' }, { status: 400 });
  }

  const emailGlobalInstructions = String(body.email_global_instructions || '').trim().slice(0, 5000);
  const emailDoRules = normalizeRules(body.email_do_rules);
  const emailDontRules = normalizeRules(body.email_dont_rules);
  const emailSignature = String(body.email_signature || '').trim().slice(0, 1000);

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('user_ai_settings')
    .upsert(
      {
        user_id: userId,
        email_reply_scope: emailReplyScope,
        email_global_instructions: emailGlobalInstructions,
        email_do_rules: emailDoRules,
        email_dont_rules: emailDontRules,
        email_signature: emailSignature,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select('assistant_name,email_reply_scope,email_global_instructions,email_do_rules,email_dont_rules,email_signature')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ settings: data });
}

function normalizeRules(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((entry) => entry.slice(0, 200));

  return Array.from(new Set(normalized.map((entry) => entry.toLowerCase())))
    .map((lowered) => normalized.find((entry) => entry.toLowerCase() === lowered) || lowered)
    .filter(Boolean);
}
