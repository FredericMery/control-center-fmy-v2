import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { MAIL_MAX_SCAN_FILES } from '@/types/mail';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/mail/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { id } = await params;

  const { data, error } = await supabase
    .from('mail_items')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Courrier introuvable' }, { status: 404 });
  }

  return NextResponse.json({ item: data });
}

// PATCH /api/mail/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  // Ne permettre que les champs autorisés
  const ALLOWED_PATCH_FIELDS = new Set([
    'context', 'mail_type', 'sender_name', 'sender_address', 'sender_email',
    'subject', 'reference', 'summary', 'full_text', 'received_at', 'due_date',
    'closed_at', 'status', 'action_required', 'action_note', 'priority',
    'scan_url', 'scan_file_name', 'scan_urls', 'scan_file_names', 'ai_analyzed', 'ai_tags', 'ai_confidence',
    'replied', 'replied_at', 'reply_note', 'notes',
  ]);

  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_PATCH_FIELDS.has(key)) {
      patch[key] = value;
    }
  }

  const normalizedScanUrls = normalizeScanArray(patch.scan_urls, patch.scan_url);
  const normalizedScanFileNames = normalizeScanArray(patch.scan_file_names, patch.scan_file_name);
  if (patch.scan_urls !== undefined || patch.scan_url !== undefined) {
    patch.scan_url = normalizedScanUrls[0] || null;
    patch.scan_urls = normalizedScanUrls.length > 0 ? normalizedScanUrls : null;
  }
  if (patch.scan_file_names !== undefined || patch.scan_file_name !== undefined) {
    patch.scan_file_name = normalizedScanFileNames[0] || null;
    patch.scan_file_names = normalizedScanFileNames.length > 0 ? normalizedScanFileNames : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à modifier' }, { status: 400 });
  }

  // Clôture automatique
  if (patch.status === 'clos' && !patch.closed_at) {
    patch.closed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('mail_items')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('PATCH /api/mail/[id] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}

// DELETE /api/mail/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { id } = await params;

  // Supprimer le scan storage si présent
  const { data: existing } = await supabase
    .from('mail_items')
    .select('scan_file_name,scan_file_names')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  const filesToRemove = normalizeScanArray(existing?.scan_file_names, existing?.scan_file_name)
    .map((name) => `${userId}/${name}`);

  if (filesToRemove.length > 0) {
    await supabase.storage
      .from('mail-scans')
      .remove(filesToRemove);
  }

  const { error } = await supabase
    .from('mail_items')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

function normalizeScanArray(value: unknown, fallback: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean))).slice(0, MAIL_MAX_SCAN_FILES);
  }
  const single = String(fallback || '').trim();
  return single ? [single] : [];
}
